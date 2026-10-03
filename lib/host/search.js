/**
 * A bounded, cached recursive index of one registered root, plus the ranked
 * search the composer's `@` source runs against it.
 *
 * The shipped file-reference provider indexes a Session's working directory and
 * nothing else, so a file in any *other* registered root is invisible to `@`
 * completion — the completion simply has no candidate to offer. This index
 * covers the roots the workspace explorer already knows about, with the same
 * traversal rules the shipped provider applies: the same directory exclusion
 * list and a hard entry ceiling, so `node_modules` can never flood the menu and
 * a huge tree cannot stall the composer. Nothing here is cached across
 * processes; the cache lives in memory and is dropped on demand.
 *
 * @module
 */

import { readdir } from 'node:fs/promises'
import { fold } from './listing.js'

/**
 * Directory basenames never traversed, matching the shipped local provider so
 * the two `@` sources agree about what is worth surfacing.
 */
export const EXCLUDED_DIRECTORIES = [
  '.git', 'node_modules', 'dist', 'build', 'out', 'coverage', 'target',
  '.next', '.nuxt', '.turbo', '.venv', '__pycache__', '.pytest_cache', '.mypy_cache', '.gradle',
]

/** Entries indexed per root before a walk stops early and reports truncation. */
export const MAX_INDEX_ENTRIES = 20000

/** How long a built index answers queries before one query pays for a rebuild. */
export const INDEX_TTL_MS = 20000

/** Match tiers, best first: an exact basename, then a prefix, then a path, then a basename substring. */
const RANK_EXACT = 0
const RANK_NAME_PREFIX = 1
const RANK_PATH_SUBSTRING = 2
const RANK_NAME_SUBSTRING = 3

/** Yield to the event loop so a long walk cannot monopolise the host process. */
function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}

/** Directory reads performed before the walk yields back to the event loop. */
const SLICE_DIRECTORIES = 200

/**
 * How long one query waits for a fresh walk before answering from what exists.
 *
 * A drag leaves an absolute path in the draft and the pipeline asks for its
 * candidates exactly once, so an answer that arrives before the walk reaches
 * that path is a candidate the user never sees — the failure the field reported
 * as "no candidate". Waiting long enough for a whole tree to finish is therefore
 * worth far more than answering instantly with a partial one; a walk over a
 * large root takes a few hundred milliseconds, and the plugin also warms the
 * index as soon as it loads, so this budget is normally spent in full only once
 * per process.
 */
const SETTLE_BUDGET_MS = 1200

/**
 * The match tier of one entry against a bare basename query, or undefined when
 * it does not match at all.
 * @param name - the lower-cased basename.
 * @param relative - the lower-cased root-relative path.
 * @param needle - the lower-cased query.
 * @returns the tier, best first.
 */
function rankOf(name, relative, needle) {
  if (needle === '') return RANK_NAME_SUBSTRING
  if (name === needle) return RANK_EXACT
  if (name.startsWith(needle)) return RANK_NAME_PREFIX
  if (relative.includes(needle)) return RANK_PATH_SUBSTRING
  if (name.includes(needle)) return RANK_NAME_SUBSTRING
  return undefined
}

/**
 * Rank entries against one query.
 *
 * A query containing `/` is scoped: everything up to the last slash has to name
 * the entry's directory, and only the tail ranks against the basename. That is
 * what makes `sub/fi` narrow into a directory the way a path completion is
 * expected to, instead of fuzzy-matching the whole string.
 *
 * An absolute query — which is exactly what a dragged row leaves in the draft —
 * matches the entry's absolute path instead of its root-relative one, because a
 * relative spelling can never be a prefix of it. Without that a dropped row
 * could never be offered back as a candidate, and so could never be promoted
 * into a reference chip.
 *
 * Ties break toward directories, then toward shorter paths, then alphabetically,
 * so the menu order is stable between identical queries.
 * @param entries - indexed entries.
 * @param query - the raw query text.
 * @param limit - the maximum number of results.
 * @returns the matching entries, best first.
 */
export function searchIndex(entries, query, limit) {
  const trimmed = query.trim().replace(/\\/g, '/').toLowerCase()
  const absolute = /^([a-z]:\/|\/)/.test(trimmed)
  const slash = trimmed.lastIndexOf('/')
  const head = slash < 0 ? '' : trimmed.slice(0, slash + 1)
  const scope = head.endsWith('/') ? head.slice(0, -1) : head
  const needle = slash < 0 ? trimmed : trimmed.slice(slash + 1)
  const scored = []
  for (const entry of entries) {
    const haystack = absolute ? entry.path.toLowerCase().replace(/\/+$/, '') : entry.relative.toLowerCase()
    if (scope !== '' && haystack !== scope && !haystack.startsWith(`${scope}/`)) continue
    const rank = rankOf(entry.name.toLowerCase(), haystack, needle)
    if (rank === undefined) continue
    scored.push({ entry, rank })
  }
  scored.sort((left, right) => left.rank - right.rank
    || (left.entry.type === right.entry.type ? 0 : left.entry.type === 'directory' ? -1 : 1)
    || left.entry.relative.length - right.entry.relative.length
    || (left.entry.relative < right.entry.relative ? -1 : left.entry.relative > right.entry.relative ? 1 : 0))
  return scored.slice(0, limit).map(item => item.entry)
}

/** A per-root index cache with in-flight build sharing. */
export class WorkspaceSearch {
  /**
   * @param options - the entry ceiling and cache lifetime.
   */
  constructor(options = {}) {
    this.maxEntries = options.maxEntries ?? MAX_INDEX_ENTRIES
    this.ttlMs = options.ttlMs ?? INDEX_TTL_MS
    this.cache = new Map()
  }

  /**
   * The indexed entries of one root, rebuilding a stale or missing index.
   *
   * Concurrent queries share the in-flight build rather than racing it: a burst
   * of keystrokes must not start a burst of walks. While a rebuild runs the
   * previous entries keep answering, so the menu never empties out mid-typing.
   * @param root - the root's absolute path.
   * @param rootId - the root id recorded on every entry.
   * @returns the built index.
   */
  /**
   * The index for one root, starting a background walk when it is missing or
   * stale and returning immediately either way.
   *
   * Nothing here waits for a walk. A large tree is walked in slices between
   * event-loop ticks while queries keep answering from the entries indexed so
   * far, which is what stops typing from stalling behind a directory scan — the
   * cost the blocking version paid on the first query after every expiry.
   * @param root - the root's absolute path.
   * @param rootId - the root id recorded on every entry.
   * @returns the cache entry, whose `entries` may still be growing.
   */
  indexOf(root, rootId) {
    const key = fold(root)
    const cached = this.cache.get(key)
    // A root re-registered under a new id must not serve entries stamped with
    // the old one, so an id mismatch invalidates on its own.
    const sameRoot = cached !== undefined && cached.rootId === rootId
    if (sameRoot && (cached.building === true || Date.now() - cached.at < this.ttlMs)) return cached
    const entry = {
      at: Date.now(),
      rootId,
      entries: sameRoot ? cached.entries : [],
      truncated: sameRoot ? cached.truncated : false,
      building: true,
      queue: [''],
      cursor: 0,
    }
    this.cache.set(key, entry)
    void this.walk(root, entry)
    return entry
  }

  /**
   * The index for one root, giving a fresh walk a short head start so a small
   * tree answers completely on the first query, then settling for whatever is
   * indexed by then. The bounded wait is what keeps a huge tree responsive.
   * @param root - the root's absolute path.
   * @param rootId - the root id recorded on every entry.
   * @returns the cache entry.
   */
  async settle(root, rootId) {
    const entry = this.indexOf(root, rootId)
    const deadline = Date.now() + SETTLE_BUDGET_MS
    while (entry.building === true && Date.now() < deadline) await sleep(4)
    return entry
  }

  /**
   * Walk one root breadth-first in slices, yielding between them.
   *
   * Breadth-first because the shallow entries are the ones a completion menu
   * wants when the ceiling is reached: a deep tree truncates its tail, not its
   * top. Directory symlinks are not followed — a cycle would otherwise spend the
   * whole ceiling on one loop.
   * @param root - the root's absolute path.
   * @param entry - the cache entry to fill.
   */
  async walk(root, entry) {
    // The walk fills its own list and swaps it in only at the end. Appending into
    // the list queries are reading is how the index doubled on every rebuild:
    // entries 2 → 4 → 8 as the TTL expired, while dead duplicates filled the
    // result limit.
    const pending = []
    let truncated = false
    try {
      while (entry.cursor < entry.queue.length && pending.length < this.maxEntries) {
        const bound = Math.min(entry.queue.length, entry.cursor + SLICE_DIRECTORIES)
        for (; entry.cursor < bound; entry.cursor += 1) {
          const relative = entry.queue[entry.cursor]
          let children
          try {
            children = await readdir(relative === '' ? root : `${root}/${relative}`, { withFileTypes: true })
          } catch {
            continue
          }
          for (const child of children) {
            if (pending.length >= this.maxEntries) { truncated = true; break }
            const type = child.isDirectory() ? 'directory' : child.isFile() ? 'file' : undefined
            if (type === undefined) continue
            const name = child.name
            if (type === 'directory' && EXCLUDED_DIRECTORIES.includes(name)) continue
            const childRelative = relative === '' ? name : `${relative}/${name}`
            pending.push({ path: `${root}/${childRelative}`, relative: childRelative, name, type, rootId: entry.rootId })
            if (type === 'directory') entry.queue.push(childRelative)
          }
        }
        await sleep(0)
      }
    } finally {
      entry.building = false
      entry.entries = pending
      entry.truncated = truncated
      entry.at = Date.now()
      entry.queue = []
      entry.cursor = 0
    }
  }

  /**
   * Drop one root's index, or the whole cache when no root is named.
   * @param root - the root whose index goes stale, when only one does.
   */
  invalidate(root) {
    if (root === undefined || root === null) this.cache.clear()
    else this.cache.delete(fold(root))
  }

  /**
   * Rank candidates across every given root in one global order, so a strong
   * match in a later root is not buried under weak matches from an earlier one.
   * @param roots - the registered roots (`{ id, path }`).
   * @param query - the raw query text.
   * @param limit - the maximum number of results.
   * @returns the ranked entries.
   */
  async search(roots, query, limit) {
    const all = []
    for (const root of roots) {
      const index = await this.settle(root.path, root.id)
      for (const entry of index.entries) all.push(entry)
    }
    return searchIndex(all, query, limit)
  }
}
