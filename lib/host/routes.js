/**
 * The plugin's `/api/workspace-explorer` route family.
 *
 * Everything the browser half needs travels over these routes: the registered
 * root list and its preferences, one directory level of one root, and the
 * configuration mutations. The family is read-mostly — the only writes touch
 * the plugin's own configuration file — and every request passes the trust
 * fence and a root-boundary check.
 *
 * Responses are uniform: `{ ok: true, value }` or `{ ok: false, error:
 * { code, message } }`, so the client branches on `ok` and `code`, never on
 * message text.
 *
 * @module dsh-multi-root-explorer/host/routes
 */
import { realpath, readdir, stat } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { containsPath, isAbsolutePath, canonical, fold, baseName } from './paths.js'
import { describeConfig, migrateExpansionKey, MAX_HIDDEN, MAX_ROOTS } from './store.js'
import { ExplorerError, listDirectory } from './listing.js'
import { WorkspaceSearch } from './search.js'
import { deleteSessionData } from './sessions.js'

/** Route paths, mirrored as literals by the browser half. */
export const ROUTES = {
  state: '/api/workspace-explorer/state',
  nativeStatus: '/api/workspace-explorer/native/status',
  nativeSync: '/api/workspace-explorer/native/sync',
  createSession: '/api/workspace-explorer/sessions/create',
  list: '/api/workspace-explorer/list',
  addRoot: '/api/workspace-explorer/roots/add',
  updateRoot: '/api/workspace-explorer/roots/update',
  removeRoot: '/api/workspace-explorer/roots/remove',
  prefs: '/api/workspace-explorer/prefs',
  reset: '/api/workspace-explorer/reset',
  hidden: '/api/workspace-explorer/hidden',
  deleteSession: '/api/workspace-explorer/sessions/delete',
  search: '/api/workspace-explorer/search',
}

/** Default and maximum candidate counts for one `@` completion query. */
const DEFAULT_SEARCH_RESULTS = 20
const MAX_SEARCH_RESULTS = 50

/**
 * One in-memory index cache for this host process. Keyed by root path and
 * stamped with the root id, so a re-registered root cannot serve entries that
 * were collected under its previous identity.
 */
const search = new WorkspaceSearch()

/** Response headers shared by every route. */
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
}

/** Maximum accepted request body size. */
const MAX_BODY_BYTES = 256 * 1024

/**
 * Whether an address string names the loopback interface.
 * @param address - the socket's remote address.
 * @returns true for `127.0.0.0/8` and `::1`.
 */
function isLoopbackAddress(address) {
  if (typeof address !== 'string' || address === '') return false
  const normalized = address.toLowerCase()
  if (normalized === '::1') return true
  const candidate = normalized.startsWith('::ffff:') ? normalized.slice(7) : normalized
  const parts = candidate.split('.')
  if (parts.length !== 4) return false
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255) && parts[0] === '127'
}

/**
 * Whether a hostname names the loopback authority.
 * @param hostname - a URL hostname.
 * @returns true for `localhost`, `[::1]`, and `127.0.0.0/8`.
 */
function isLoopbackHostname(hostname) {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  return isLoopbackAddress(hostname)
}

/**
 * The request-level trust fence: a loopback socket address (authoritative,
 * `X-Forwarded-For` is never consulted), a loopback `Host` header, and
 * browser same-origin markers.
 *
 * The plugin reads directory metadata from the host user's filesystem, so a
 * page reached over a LAN address must not drive it.
 * @param request - the incoming HTTP request.
 * @returns true when the request may enter the route family.
 */
export function isAllowedRequest(request) {
  if (!isLoopbackAddress(request.socket?.remoteAddress)) return false
  const host = request.headers?.host
  if (typeof host !== 'string') return false
  let hostUrl
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (!isLoopbackHostname(hostUrl.hostname)) return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

/**
 * Write one JSON response.
 * @param response - the HTTP response.
 * @param status - the status code.
 * @param body - the JSON-serializable body.
 */
function writeJson(response, status, body) {
  response.writeHead(status, JSON_HEADERS)
  response.end(JSON.stringify(body))
}

/**
 * Read and parse a bounded JSON request body.
 * @param request - the incoming request.
 * @returns the parsed body, or `{}` for an empty body.
 */
async function readJsonBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new ExplorerError('bad-request', 'request body is too large')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (text === '') return {}
  try {
    const parsed = JSON.parse(text)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ExplorerError('bad-request', 'request body must be a JSON object')
    }
    return parsed
  } catch (error) {
    if (error instanceof ExplorerError) throw error
    throw new ExplorerError('bad-request', 'request body is not valid JSON')
  }
}

/**
 * Whether one persisted expansion key belongs to a root: the root's own node,
 * a conversation node filed under it, or a resource directory inside it.
 * @param key - a persisted expansion key.
 * @param rootId - the root's id.
 * @param rootPath - the root's absolute path, when it is still known.
 * @returns true when the key should be dropped with the root.
 */
function belongsToRoot(key, rootId, rootPath) {
  if (key === `root:${rootId}`) return true
  if (key === `conv:${rootId}` || key.startsWith(`conv:${rootId}/`)) return true
  if (rootPath === undefined) return false
  // Conversation and resource nodes are keyed by absolute path, so a removed
  // workspace also drops the expansion state of everything that lived in it.
  if (key.startsWith('conv:')) return containsPath(rootPath, key.slice(5))
  if (key.startsWith('res:')) return containsPath(rootPath, key.slice(4))
  return false
}

/**
 * Build every route this plugin owns.
 * @param options - the configuration store, the sessions root, the live
 *   Session registry, and a logger.
 * @returns the route list for `ctx.webServer.register`.
 */
export function makeRoutes({ store, sessionsRoot, sessions, logger, nativeBridge }) {
  /**
   * Wrap one handler with the trust fence, the method check, and uniform
   * success/failure envelopes.
   * @param method - the accepted HTTP method.
   * @param handler - the route body, receiving the request and the parsed body.
   * @returns the web route.
   */
  const route = (path, method, handler) => ({
    kind: 'exact',
    path,
    handler: async (request, response) => {
      if (!isAllowedRequest(request)) {
        writeJson(response, 403, { ok: false, error: { code: 'forbidden', message: 'loopback-only route' } })
        return
      }
      if (request.method !== method) {
        writeJson(response, 405, { ok: false, error: { code: 'bad-request', message: `method not allowed: ${request.method}` } })
        return
      }
      try {
        const body = method === 'POST' ? await readJsonBody(request) : {}
        const url = new URL(request.url ?? path, 'http://localhost')
        const value = await handler({ url, body })
        writeJson(response, 200, { ok: true, value })
      } catch (error) {
        if (error instanceof ExplorerError || error?.code === 'config-read-only') {
          writeJson(response, 200, { ok: false, error: { code: error.code, message: error.message } })
          return
        }
        logger?.warn?.(error)
        writeJson(response, 200, {
          ok: false,
          error: { code: 'internal', message: error instanceof Error ? error.message : String(error) },
        })
      }
    },
  })

  /** Validate a hidden target against every registered root. Existing path
   * components are realpathed to prevent symlink escapes; missing resource
   * entries retain lexical root containment. */
  const validateHiddenTarget = async (config, value, scope) => {
    if (!isAbsolutePath(value)) throw new ExplorerError('bad-request', 'path must be absolute')
    const target = canonical(value)
    // A registered root is stored resolved (`realpath`), but a caller may spell
    // the same location any way the OS reports it: a Windows 8.3 short name
    // (`RUNNER~1`), or a symlinked temp directory — `/var` against
    // `/private/var` on macOS, a junction on Windows. Compared as spellings, a
    // path genuinely inside a root looks like a different location and gets
    // rejected, so the target is resolved the same way the roots are.
    const lookup = await resolvedSpelling(target)
    // A registered root is never hideable, including when another root
    // contains it (nested registrations must not bypass this rule).
    if (config.roots.some((root) => fold(canonical(root.path)) === fold(lookup))) {
      throw new ExplorerError('root-not-allowed', 'cannot hide workspace root')
    }
    for (const root of config.roots) {
      let realRoot
      try { realRoot = canonical(await realpath(root.path)) } catch { realRoot = canonical(root.path) }
      if (!containsPath(realRoot, lookup)) continue
      if (fold(realRoot) === fold(lookup)) throw new ExplorerError('root-not-allowed', 'cannot hide workspace root')
      if (scope === 'conversations') {
        try { if (!(await stat(lookup)).isDirectory()) throw new ExplorerError('not-a-directory', 'conversation hidden path must be a directory') } catch (error) {
          if (error instanceof ExplorerError) throw error
          throw new ExplorerError('not-found', 'conversation hidden path must exist')
        }
      }
      // Walk each existing ancestor and check its resolved location.
      const segments = lookup.slice(realRoot.length).replace(/^\/+/, '').split('/').filter(Boolean)
      let current = realRoot
      for (const segment of segments) {
        current = canonical(`${current}/${segment}`)
        try {
          const resolved = canonical(await realpath(current))
          if (!containsPath(realRoot, resolved)) throw new ExplorerError('outside-root', 'path resolves outside registered root')
        } catch (error) {
          if (error instanceof ExplorerError) throw error
          if (error?.code === 'ENOENT' && scope === 'resources') break
          throw new ExplorerError('not-found', 'path does not exist')
        }
      }
      return lookup
    }
    throw new ExplorerError('outside-root', 'path is outside registered roots')
  }

  /**
   * The target in the resolved spelling the roots are stored in.
   *
   * The target itself is resolved when it exists; otherwise its parent is, and
   * the remaining leaf is re-appended, so a directory that does not exist yet
   * still lands under the resolved prefix. A target whose parent is missing too
   * keeps its own spelling — the per-segment walk above reports that case.
   * @param target - a canonical absolute path.
   * @returns the same path in the roots' spelling.
   */
  async function resolvedSpelling(target) {
    const cut = target.lastIndexOf('/')
    const candidates = cut > 0 ? [target, target.slice(0, cut)] : [target]
    for (const candidate of candidates) {
      if (candidate === '' || candidate === '/' || /^[A-Za-z]:\/?$/.test(candidate)) continue
      try {
        const resolved = canonical(await realpath(candidate))
        return candidate === target ? resolved : canonical(`${resolved}/${target.slice(candidate.length + 1)}`)
      } catch { /* try the parent, then give up and keep the spelling */ }
    }
    return target
  }

  /** Read one required string field. */
  const requireString = (body, field) => {
    const value = body[field]
    if (typeof value !== 'string' || value.trim() === '') {
      throw new ExplorerError('bad-request', `missing or empty "${field}"`)
    }
    return value.trim()
  }

  return [
    route(ROUTES.state, 'GET', async () => {
      const { config, problem } = await store.load()
      return { ...await describeConfig(config), ...(problem ? { problem, readOnly: true, configProblem: problem, configReadOnly: true } : {}) }
    }),
    route(ROUTES.nativeStatus, 'GET', async () => {
      if (!nativeBridge) throw new ExplorerError('native-unavailable', 'native bridge unavailable')
      return nativeBridge.status()
    }),
    route(ROUTES.nativeSync, 'POST', async ({ body }) => {
      if (!nativeBridge) throw new ExplorerError('native-unavailable', 'native bridge unavailable')
      return nativeBridge.sync({ repair: body.repair === true })
    }),
    route(ROUTES.createSession, 'POST', async ({ body }) => {
      if (!nativeBridge) throw new ExplorerError('native-unavailable', 'native bridge unavailable')
      requireString(body, 'path'); requireString(body, 'operationId'); requireString(body, 'title')
      return nativeBridge.createSession(body)
    }),

    route(ROUTES.list, 'GET', async ({ url }) => {
      const config = await store.current()
      const rootId = url.searchParams.get('rootId') ?? ''
      const root = config.roots.find((candidate) => candidate.id === rootId)
      if (root === undefined) throw new ExplorerError('unknown-root', `no registered root with id "${rootId}"`)
      const requested = url.searchParams.get('path') ?? ''
      if (requested !== '' && !isAbsolutePath(requested)) {
        throw new ExplorerError('bad-request', 'path must be absolute')
      }
      const showHidden = url.searchParams.get('showHidden') === '1' || config.prefs.showHiddenEntries === true
      const listing = await listDirectory({ rootPath: root.path, target: requested, showHidden, cursor: url.searchParams.get('cursor'), limit: url.searchParams.get('limit') ?? undefined })
      return {
        rootId: root.id,
        path: listing.path,
        entries: listing.entries,
        truncated: listing.truncated,
        nextCursor: listing.nextCursor,
        revision: listing.revision,
      }
    }),

    /**
     * Ranked `@` completion candidates across every registered root.
     *
     * The shipped file-reference provider only indexes a Session's working
     * directory, so this route is what lets the composer reference a file in
     * any *other* registered workspace. The query is passed through untouched:
     * a query containing `/` is scoped to a directory by the index itself.
     */
    route(ROUTES.search, 'GET', async ({ url }) => {
      const config = await store.current()
      const query = url.searchParams.get('q') ?? ''
      const requested = Number.parseInt(url.searchParams.get('limit') ?? '', 10)
      const limit = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, MAX_SEARCH_RESULTS) : DEFAULT_SEARCH_RESULTS
      // The caller's working directory, so a query spelled against it — which is
      // how a drag spells the mention it inserts — still matches its own entry.
      const cwd = url.searchParams.get('cwd') ?? ''
      const candidates = await search.search(config.roots, query, limit, { cwd })
      return { candidates }
    }),

    route(ROUTES.addRoot, 'POST', async ({ body }) => {
      const input = requireString(body, 'path')
      if (!isAbsolutePath(input)) throw new ExplorerError('bad-request', 'path must be absolute')
      const label = typeof body.label === 'string' ? body.label.trim() : ''
      let outcome
      const config = await store.update(async (current) => {
        let path
        try {
          path = canonical(await realpath(input))
          if (!(await stat(path)).isDirectory()) throw new ExplorerError('not-a-directory', 'root must be a directory')
          await readdir(path)
        } catch (error) {
          if (error instanceof ExplorerError) throw error
          throw new ExplorerError(error?.code === 'ENOENT' ? 'not-found' : 'no-permission', 'cannot import inaccessible directory')
        }
        const identities = await Promise.all(current.roots.map(async (root) => {
          try { return { root, path: canonical(await realpath(root.path)) } } catch { return { root, path: root.path } }
        }))
        const owner = identities.filter((entry) => containsPath(entry.path, path)).sort((a, b) => a.path.length - b.path.length)[0]
        const descendants = identities.filter((entry) => containsPath(path, entry.path) && fold(path) !== fold(entry.path)).map((entry) => entry.root)
        const hidden = current.conversationHiddenDirectories.filter((entry) => containsPath(entry, path) || containsPath(entry, canonical(input)))
        outcome = { action: owner ? fold(owner.path) === fold(path) ? 'reveal-existing' : 'reveal-descendant' : 'added', ownerRootId: owner?.root.id, targetPath: owner ? canonical(`${owner.root.path}/${path.slice(owner.path.length).replace(/^\//, '')}`) : path }
        if (hidden.length && body.restore !== true) {
          outcome = { ...outcome, action: 'restore-required', hiddenDirectories: hidden }
          return current
        }
        if (descendants.length && body.merge !== true) {
          outcome = { ...outcome, action: 'merge-required', descendants }
          return current
        }
        let next = current
        if (hidden.length) next = { ...next, conversationHiddenDirectories: next.conversationHiddenDirectories.filter((entry) => !hidden.includes(entry)), hiddenDirectories: next.conversationHiddenDirectories.filter((entry) => !hidden.includes(entry)) }
        if (owner && !descendants.length) return next
        if (!owner && current.roots.length - descendants.length >= MAX_ROOTS) throw new ExplorerError('bad-request', `at most ${MAX_ROOTS} roots can be registered`)
        const root = owner?.root ?? { id: `root-${randomBytes(8).toString('hex')}`, path, label: label || baseName(path) || path }
        const removed = new Set(descendants.map((entry) => entry.id))
        const roots = next.roots.filter((entry) => !removed.has(entry.id))
        if (!owner) roots.splice(descendants.length ? Math.min(...descendants.map((entry) => next.roots.indexOf(entry))) : roots.length, 0, root)
        outcome.ownerRootId = root.id
        return { ...next, roots, directoryAliases: { ...next.directoryAliases, ...Object.fromEntries(descendants.map((entry) => [fold(entry.path), entry.label])) }, expandedDirectories: [...new Set(next.expandedDirectories.flatMap((key) => { const migrated = migrateExpansionKey(key, next.roots); return key.startsWith('root:') && migrated.startsWith('res:') ? [migrated, `conv:${migrated.slice(4)}`] : [migrated] }))] }
      })
      return { ...await describeConfig(config), ...outcome }
    }),

    route(ROUTES.updateRoot, 'POST', async ({ body }) => {
      const id = requireString(body, 'id')
      const label = requireString(body, 'label')
      const config = await store.update((current) => ({
        ...current,
        roots: current.roots.map((root) => (root.id === id ? { ...root, label } : root)),
      }))
      return describeConfig(config)
    }),

    route(ROUTES.removeRoot, 'POST', async ({ body }) => {
      const id = requireString(body, 'id')
      const config = await store.update((current) => {
        const target = current.roots.find((root) => root.id === id)
        return {
          ...current,
          // Removing a root drops the registration only. The directory, its
          // files, and every session that ran in it are untouched.
          roots: current.roots.filter((root) => root.id !== id),
          expandedDirectories: current.expandedDirectories.filter(
            (key) => !belongsToRoot(key, id, undefined),
          ),
        }
      })
      return describeConfig(config)
    }),

    route(ROUTES.prefs, 'POST', async ({ body }) => {
      const expanded = Array.isArray(body.expandedDirectories)
        ? body.expandedDirectories.filter((key) => typeof key === 'string' && key !== '')
        : undefined
      const showHidden = typeof body.showHiddenEntries === 'boolean' ? body.showHiddenEntries : undefined
      const config = await store.update((current) => ({
        ...current,
        prefs: {
          showHiddenEntries: showHidden === undefined ? current.prefs.showHiddenEntries === true : showHidden,
        },
        expandedDirectories: expanded === undefined ? current.expandedDirectories : expanded,
      }))
      return describeConfig(config)
    }),

    route(ROUTES.reset, 'POST', async () => describeConfig(await store.reset())),

    // Remove one directory from the conversation tree's display, or put it
    // back. This is the inverse of "add workspace" for a directory that is a
    // registered workspace, and the only way to retire a top-level node the
    // tree derived from a Session's working directory. Display only: no file,
    // directory, or Session is touched.
    route(ROUTES.hidden, 'POST', async ({ body }) => {
      const legacyMode = body.scope === undefined
      const scope = legacyMode ? 'conversations' : body.scope
      if (scope !== 'conversations' && scope !== 'resources') throw new ExplorerError('bad-request', 'scope must be conversations or resources')
      const rawPaths = Array.isArray(body.paths) ? body.paths : [requireString(body, 'path')]
      if (rawPaths.length === 0 || rawPaths.length > MAX_HIDDEN) throw new ExplorerError('bad-request', 'invalid paths')
      const hidden = body.hidden !== false
      const current = await store.current()
      const targets = []
      for (const value of rawPaths) {
        // Restoring only removes configuration records: the target may have
        // disappeared or no longer belong to any registered root. Hiding adds a
        // record, so it is validated whatever scope the request named — an
        // un-scoped legacy request must not be a way around the boundary.
        if (hidden === false) {
          const path = requireString({ path: value }, 'path')
          if (!isAbsolutePath(path)) throw new ExplorerError('bad-request', 'path must be absolute')
          targets.push(canonical(path)); continue
        }
        targets.push(await validateHiddenTarget(current, requireString({ path: value }, 'path'), scope))
      }
      const config = await store.update((latest) => {
        const field = scope === 'conversations' ? 'conversationHiddenDirectories' : 'resourceHiddenEntries'
        const existing = latest[field] || []
        const keys = new Set(targets.map((entry) => fold(entry)))
        const others = existing.filter((entry) => !keys.has(fold(entry)))
        const next = hidden ? [...others, ...targets].slice(-MAX_HIDDEN) : others
        return { ...latest, [field]: next, hiddenDirectories: scope === 'conversations' ? next : [...latest.conversationHiddenDirectories] }
      })
      return describeConfig(config)
    }),

    // Permanent removal of one Session's persisted log. The design document
    // shipped archive-only removal because DSH exposes no deletion API; the
    // product owner asked for real deletion, so this route removes the
    // Session's own artifact. The plugin still never deletes a project
    // directory, a workspace, or any other Session's data.
    route(ROUTES.deleteSession, 'POST', async ({ body }) => {
      const sessionId = requireString(body, 'sessionId')
      const result = await deleteSessionData({
        root: sessionsRoot,
        sessionId,
        isLive: (id) => {
          try {
            return sessions?.get?.(id) !== undefined
          } catch {
            return false
          }
        },
        isRunning: (id) => {
          try {
            const live = sessions?.get?.(id)
            return live?.getSnapshot?.()?.running === true
          } catch {
            return false
          }
        },
      })
      logger?.info?.(`workspace-explorer: deleted session ${sessionId} (${result.removed.length} artifact(s))`)
      return { sessionId, removed: result.removed, live: result.live }
    }),
  ]
}
