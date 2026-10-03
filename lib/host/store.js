/**
 * Durable configuration for the Workspace Explorer: the registered root
 * directories, the display preferences, and the persisted expansion state.
 *
 * The file lives in the plugin's own directory under the DSH home
 * (`$DSH_HOME/workspace-explorer/config.json`, default `~/.dsh`), mirrors the
 * precedence `dsh-home-paths` documents (explicit override, then `$DSH_HOME`,
 * then `~/.dsh`), and is written atomically. It never contains, and this
 * module never touches, any path inside a registered root: roots are only
 * *registered*, never created, moved, or deleted.
 *
 * @module dsh-multi-root-explorer/host/store
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { baseName, canonical, fold } from './paths.js'

/** The configuration schema this build reads and writes. */
export const CONFIG_VERSION = 3

/** Upper bound on registered roots, so one runaway client cannot grow the file without limit. */
export const MAX_ROOTS = 64

/** Upper bound on persisted expansion keys. */
export const MAX_EXPANDED = 2000

/** Upper bound on hidden conversation directories. */
export const MAX_HIDDEN = 200

/**
 * Resolve the DSH home the way the harness does: an explicit configured path
 * wins over `$DSH_HOME`, which wins over `~/.dsh`; a blank environment value
 * is treated as unset.
 * @param override - an explicit configured home, when the plugin entry sets one.
 * @returns the absolute home directory.
 */
export function resolveDshHome(override) {
  if (typeof override === 'string' && override.trim() !== '') return canonical(override)
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return canonical(fromEnv)
  return canonical(join(homedir(), '.dsh'))
}

/**
 * The plugin's own data directory under the DSH home. It sits beside the
 * domain-storage units under `storages/` (the same placement the shipped
 * `dsh-cost-meter` plugin uses) but as its own subdirectory, so the JSON
 * storage backend never mistakes it for a domain unit.
 * @param dshHome - the resolved DSH home.
 * @returns the plugin data directory.
 */
export function pluginDataDir(dshHome) {
  return join(dshHome, 'storages', 'workspace-explorer')
}

/** A fresh, ordered configuration. */
function emptyConfig() {
  return {
    version: CONFIG_VERSION,
    revision: 0,
    directoryAliases: {},
    roots: [],
    prefs: { showHiddenEntries: false },
    expandedDirectories: [],
    conversationHiddenDirectories: [],
    resourceHiddenEntries: [],
    // Legacy compatibility output; mirrors conversation list.
    hiddenDirectories: [],
  }
}

/**
 * Normalize a list of absolute directory paths for storage: canonical, free of
 * case-duplicates, capped, and with blank entries dropped.
 * @param values - candidate paths.
 * @returns the normalized paths.
 */
function normalizePathList(values, limit) {
  const out = []
  const seen = new Set()
  if (!Array.isArray(values)) return out
  for (const value of values) {
    if (typeof value !== 'string' || value.trim() === '') continue
    const path = canonical(value)
    const key = fold(path)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(path)
    if (out.length >= limit) break
  }
  return out
}

/**
 * Reduce one stored root record to a trusted shape, or drop it.
 * @param value - a candidate record from disk or a request body.
 * @returns the normalized record, or undefined when unusable.
 */
function normalizeRoot(value) {
  if (value === null || typeof value !== 'object') return undefined
  const path = typeof value.path === 'string' ? value.path.trim() : ''
  if (path === '') return undefined
  const id = typeof value.id === 'string' && value.id !== '' ? value.id : `root-${randomBytes(4).toString('hex')}`
  const rawLabel = typeof value.label === 'string' ? value.label.trim() : ''
  return { id, label: rawLabel === '' ? baseName(path) || path : rawLabel, path: canonical(path) }
}

/**
 * Validate a whole configuration document, dropping anything unusable rather
 * than failing the plugin: a damaged file degrades to an empty root list.
 * @param raw - the parsed document.
 * @returns the trusted configuration.
 */
function normalizeConfig(raw) {
  const config = emptyConfig()
  if (raw === null || typeof raw !== 'object') return config
  config.revision = Number.isSafeInteger(raw.revision) ? raw.revision : 0
  config.directoryAliases = raw.directoryAliases && typeof raw.directoryAliases === 'object' && !Array.isArray(raw.directoryAliases) ? { ...raw.directoryAliases } : {}
  if (raw.migration) config.migration = raw.migration
  if (Array.isArray(raw.roots)) {
    const seen = new Set()
    for (const candidate of raw.roots) {
      const root = normalizeRoot(candidate)
      if (root === undefined) continue
      const key = fold(root.path)
      if (seen.has(key)) continue
      seen.add(key)
      config.roots.push(root)
      if (config.roots.length >= MAX_ROOTS) break
    }
  }
  if (raw.prefs !== null && typeof raw.prefs === 'object') {
    config.prefs.showHiddenEntries = raw.prefs.showHiddenEntries === true
  }
  if (Array.isArray(raw.expandedDirectories)) {
    // Keep the newest keys, the way the hidden lists evict. The client uploads
    // its whole insertion-ordered set, so keeping the oldest would freeze the
    // persisted set the moment it first reaches the ceiling.
    const keys = raw.expandedDirectories.filter(key => typeof key === 'string' && key !== '')
    for (const key of keys.slice(-MAX_EXPANDED)) config.expandedDirectories.push(key)
  }
  // v2 hiddenDirectories migrate to the conversation scope. Explicit v3
  // conversation values win; retain the legacy field as a compatibility view.
  const legacy = normalizePathList(raw.hiddenDirectories, MAX_HIDDEN)
  const explicitConversation = Array.isArray(raw.conversationHiddenDirectories) ? raw.conversationHiddenDirectories : undefined
  // During the compatibility window callers may still mutate hiddenDirectories
  // directly; honor it when the scoped list is absent or empty.
  config.conversationHiddenDirectories = normalizePathList(
    explicitConversation && explicitConversation.length > 0 ? explicitConversation : legacy,
    MAX_HIDDEN,
  )
  config.resourceHiddenEntries = normalizePathList(raw.resourceHiddenEntries, MAX_HIDDEN)
  const compatibility = Array.isArray(raw.hiddenDirectories) ? raw.hiddenDirectories : config.conversationHiddenDirectories
  config.hiddenDirectories = normalizePathList(compatibility, MAX_HIDDEN)
  return config
}

/**
 * The plugin's configuration owner: one in-memory document, one atomic file.
 *
 * Instances are cheap; the plugin creates exactly one and replaces it on the
 * next `apply`. The failure posture is deliberate: a read error yields the
 * empty configuration and is reported to the caller, and a write error
 * rejects so the UI can show it, never silently dropping a user's root list.
 */
export class ConfigStore {
  /** @type {string} */
  #file
  /** @type {import('./paths.js') | null} */
  #logger
  /** @type {ReturnType<typeof emptyConfig> | undefined} */
  #config
  /** @type {Promise<void>} */
  #writeChain = Promise.resolve()
  #loadPromise
  #problem
  #readOnly = false

  /**
   * @param options - the resolved data directory and an optional logger.
   */
  constructor({ dir, logger }) {
    this.#file = join(dir, 'config.json')
    this.#logger = logger
  }

  /** The configuration file this store owns (diagnostics only). */
  get file() {
    return this.#file
  }

  /**
   * Read the configuration from disk once and cache it.
   * @returns the trusted configuration, and any read problem.
   */
  async load() {
    this.#loadPromise ??= this.#load()
    await this.#loadPromise
    return { config: structuredClone(this.#config), problem: this.#problem }
  }

  async #load() {
    this.#config = emptyConfig()
    let fileRead = false
    try {
      const text = await readFile(this.#file, 'utf8')
      fileRead = true
      const raw = JSON.parse(text)
      if (!raw || !Array.isArray(raw.roots) || ![1, 2, 3].includes(raw.version)) {
        throw new Error(`Unsupported or invalid configuration version: ${raw?.version}`)
      }
      // Do not silently discard overlapping registrations or their labels.
      this.#config = normalizeConfig(raw)
      this.#config.roots = raw.roots.map(normalizeRoot)
      if (this.#config.roots.some((root) => !root)) throw new Error('Invalid root record in configuration')
      if (raw.version === 1) {
        const backup = `${this.#file}.v1.${Date.now()}.${randomBytes(4).toString('hex')}.bak`
        await writeFile(backup, text, { encoding: 'utf8', flag: 'wx' })
        this.#config.expandedDirectories = [...new Set(this.#config.expandedDirectories.flatMap((key) => { const migrated = migrateExpansionKey(key, this.#config.roots); return key.startsWith('root:') && migrated.startsWith('res:') ? [migrated, `conv:${migrated.slice(4)}`] : [migrated] }))]
        this.#config.migration = { from: 1, backup, overlapsRequireConfirmation: true }
        await this.#write(this.#config)
      } else if (raw.version === 2) {
        const backup = `${this.#file}.v2.${Date.now()}.${randomBytes(4).toString('hex')}.bak`
        await writeFile(backup, text, { encoding: 'utf8', flag: 'wx' })
        this.#config.migration = { from: 2, backup }
        await this.#write(this.#config)
      }
    } catch (error) {
      if (error?.code === 'ENOENT' && !fileRead) return
      this.#readOnly = true
      this.#problem = error instanceof Error ? error.message : String(error)
      this.#logger?.warn?.(`workspace-explorer: configuration read-only (${this.#problem})`)
    }
  }

  /** The cached configuration, loading it if a caller skipped `load()`. */
  async current() {
    const { config } = await this.load()
    return config
  }

  /**
   * Apply a mutation to the cached configuration and persist it.
   * @param mutate - a synchronous transform of the configuration.
   * @returns the committed configuration.
   */
  async update(mutate) {
    const operation = this.#writeChain.then(async () => {
      const config = await this.current()
      // A read-only store refuses every write, reset included: a configuration
      // this build cannot parse may belong to a newer one, and overwriting it
      // would destroy settings this build does not understand. Recovery is
      // deliberately out of band — remove the file — not a click that truncates it.
      if (this.#readOnly) throw Object.assign(new Error(this.#problem), { code: 'config-read-only' })
      const candidate = await mutate(config)
      if (candidate === config) return config
      // Legacy callers may still mutate hiddenDirectories directly; synchronize
      // that compatibility field into the scoped conversation list.
      if (candidate.hiddenDirectories !== config.hiddenDirectories && Array.isArray(candidate.hiddenDirectories)) {
        candidate.conversationHiddenDirectories = candidate.hiddenDirectories
      }
      const next = normalizeConfig(candidate)
      // Existing duplicate and overlapping registrations require explicit merge, not normalization loss.
      next.roots = candidate.roots.map(normalizeRoot).filter(Boolean)
      next.revision = config.revision + 1
      await this.#write(next)
      this.#config = next
      return structuredClone(next)
    })
    this.#writeChain = operation.catch(() => {})
    return operation
  }

  /** Replace the configuration with the empty default, deleting every plugin setting. */
  async reset() {
    return this.update(() => emptyConfig())
  }

  /**
   * Persist one configuration atomically: a temporary sibling first, then a
   * rename, so a crash never leaves a half-written root list.
   * @param config - the configuration to commit.
   */
  async #write(config) {
    const dir = join(this.#file, '..')
    await mkdir(dir, { recursive: true })
    const temporary = `${this.#file}.${process.pid}.tmp`
    await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
    await rename(temporary, this.#file)
  }
}

/**
 * Describe one root with its live filesystem status, so the UI can show a
 * missing or unreadable directory without blocking the other roots.
 * @param root - the registered root.
 * @returns the root plus `exists`, `isDirectory`, and an optional `error` code.
 */
export async function describeRoot(root) {
  try {
    const info = await stat(root.path)
    if (!info.isDirectory()) return { ...root, exists: true, isDirectory: false, error: 'not-a-directory' }
    return { ...root, exists: true, isDirectory: true }
  } catch (error) {
    const code = error?.code === 'ENOENT' ? 'not-found' : error?.code === 'EACCES' || error?.code === 'EPERM' ? 'no-permission' : 'unreadable'
    return { ...root, exists: false, isDirectory: false, error: code }
  }
}

/**
 * Build the configuration payload the client consumes.
 * @param config - the committed configuration.
 * @returns the state payload, with every root's live status.
 */
export async function describeConfig(config) {
  const roots = await Promise.all(config.roots.map((root) => describeRoot(root)))
  return {
    version: CONFIG_VERSION,
    roots,
    revision: config.revision,
    directoryAliases: { ...config.directoryAliases },
    migration: config.migration,
    prefs: { showHiddenEntries: config.prefs.showHiddenEntries === true },
    expandedDirectories: [...config.expandedDirectories],
    conversationHiddenDirectories: [...config.conversationHiddenDirectories],
    resourceHiddenEntries: [...config.resourceHiddenEntries],
    // Keep this field for older clients; new clients use scoped lists.
    hiddenDirectories: [...config.conversationHiddenDirectories],
  }
}

/** Convert old root-id expansion keys to stable per-tab directory identities. */
export function migrateExpansionKey(key, roots) {
  for (const root of roots) {
    if (key === `root:${root.id}`) return `res:${fold(root.path)}`
    if (key === `conv:${root.id}`) return `conv:${fold(root.path)}`
    if (key.startsWith(`conv:${root.id}/`)) return `conv:${fold(canonical(`${root.path}/${key.slice(`conv:${root.id}/`.length)}`))}`
  }
  if (key.startsWith('conv:') || key.startsWith('res:')) {
    const cut = key.indexOf(':') + 1
    return key.slice(0, cut) + fold(canonical(key.slice(cut)))
  }
  return key
}

/** Re-exported so route handlers need one import site. */
export { emptyConfig }
