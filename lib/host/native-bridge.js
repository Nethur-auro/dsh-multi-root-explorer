/** Official-Service orchestration only. No Session log or writer ownership here. */
import { mkdir, open, readFile, realpath, rename, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { resolveDirectory } from './listing.js'

const queues = new Map()
const keyOf = (path) => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path)
// Official ordinary forks carry parentSession + isSeeded; lineage alone is
// not subagent ownership. Keep unknown legacy child headers fail-closed.
const ordinary = (header) => header && (!header.parentSession || header.isSeeded === true) && header.origin !== 'subagent'
const errorOf = (error) => ({ code: error?.code || 'native-bridge/error', message: error?.message || String(error) })
function fail(code, message) { throw Object.assign(new Error(message), { code }) }
function inside(root, target) {
  const part = relative(keyOf(root), keyOf(target))
  return part === '' || (!isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`))
}
async function directory(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')) fail('invalid-path', 'An absolute directory path is required')
  const resolved = await realpath(path)
  if (!(await stat(resolved)).isDirectory()) fail('not-directory', 'The target is not a directory')
  return resolved
}
const emptyLedger = () => ({ version: 1, paths: {}, operations: {} })

/**
 * Plugin-owned sidecar stores intentions/receipts, never native Session truth.
 * Services are resolved for each operation so optional peers can disappear.
 * Official sessionController delegates creation to constructor-owned command /
 * agent controllers (not the caller's traced ctx); never call sessions.create.
 */
export class NativeBridge {
  constructor(ctx, store, { file = join(dirname(store.file), 'native-bridge.json'), debounceMs = 250 } = {}) {
    this.ctx = ctx
    this.store = store
    this.file = resolve(file)
    this.debounceMs = debounceMs
    this.disposed = false
    this.timer = undefined
    this.unsubscribers = []
    this.lastError = undefined
    this.syncErrors = []
    this.abort = new AbortController()
  }

  services(creation = false) {
    const keys = creation ? ['workspaceRegistry', 'sessionQuery', 'sessionController', 'sessions'] : ['workspaceRegistry', 'sessionQuery']
    const services = Object.fromEntries(keys.map((key) => [key, this.ctx.get(key)]))
    const methods = { workspaceRegistry: ['list', 'create', 'insertBefore'], sessionQuery: ['listSessions'], sessionController: ['create', 'rename'], sessions: ['get', 'flush'] }
    for (const key of keys) if (!services[key] || methods[key].some((method) => typeof services[key][method] !== 'function')) fail('service-unavailable', `Official Service ${key} is unavailable`)
    return services
  }

  check() { if (this.disposed) fail('disposed', 'Native bridge has been disposed') }

  async readLedger() {
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8'))
      if (data?.version !== 1 || !data.paths || Array.isArray(data.paths) || !data.operations || Array.isArray(data.operations)) fail('invalid-ledger', 'Native bridge sidecar is incompatible or damaged')
      for (const entry of Object.values(data.operations)) if (!entry || typeof entry.sessionId !== 'string' || typeof entry.path !== 'string' || typeof entry.title !== 'string') fail('invalid-ledger', 'Native bridge operation receipt is damaged')
      return data
    } catch (error) { if (error.code === 'ENOENT') return emptyLedger(); throw error }
  }

  async save(ledger) {
    this.check()
    await mkdir(dirname(this.file), { recursive: true })
    const temp = `${this.file}.${randomUUID()}.tmp`
    const handle = await open(temp, 'wx')
    try { await handle.writeFile(`${JSON.stringify(ledger, null, 2)}\n`); await handle.sync() } finally { await handle.close() }
    // Both names are explicit plugin-owned paths in the same directory.
    await rename(temp, this.file)
  }

  enqueue(task) {
    const key = keyOf(this.file)
    const previous = queues.get(key) || Promise.resolve()
    const running = previous.catch(() => {}).then(() => { this.check(); return task() })
    queues.set(key, running)
    void running.finally(() => { if (queues.get(key) === running) queues.delete(key) }).catch(() => {})
    return running
  }

  /** Read-only: no directories, registrations, receipts or timers are created. */
  async status() {
    try {
      this.check()
      const { workspaceRegistry, sessionQuery } = this.services()
      const ledger = await this.readLedger()
      const records = await sessionQuery.listSessions(this.abort.signal)
      const workspaces = workspaceRegistry.list()
      const report = { available: true, ready: false, state: 'pending', pending: 0, registered: 0, total: 0, exceptions: [] }
      const groups = await this.groups(records, report.exceptions)
      report.total = groups.size
      for (const [key, group] of groups) {
        const workspace = workspaces.find((item) => keyOf(item.path) === key)
        if (!workspace) {
          report.pending++
          if (ledger.paths[key]?.workspaceId) report.exceptions.push({ path: group.path, code: 'registration-removed', message: 'Previously observed native registration was removed; explicit repair is required' })
        } else {
          report.registered++
          for (const id of group.ids) if (!workspace.sessionIds.includes(id)) report.exceptions.push({ path: group.path, sessionId: id, code: 'membership-missing', message: 'Session is absent from native workspace membership' })
        }
      }
      for (const operation of Object.values(ledger.operations)) {
        if (!operation.created || !operation.named || !operation.durable || !operation.membership) report.exceptions.push({ path: operation.path, sessionId: operation.sessionId, code: 'operation-incomplete', message: 'A native creation operation still requires explicit retry with its original operationId' })
      }
      report.exceptions.push(...this.syncErrors)
      if (this.lastError) report.exceptions.push(this.lastError)
      report.ready = report.pending === 0 && report.exceptions.length === 0
      report.state = report.ready ? 'ready' : report.exceptions.length ? 'partial' : 'pending'
      return report
    } catch (error) {
      return { available: false, ready: false, state: 'unavailable', pending: 0, registered: 0, total: 0, exceptions: [errorOf(error)] }
    }
  }

  async groups(records, exceptions) {
    const groups = new Map()
    for (const { header } of records) {
      this.check()
      if (!ordinary(header)) continue
      if (!header.cwd) { exceptions.push({ sessionId: header.id, code: 'missing-cwd', message: 'Session has no working directory' }); continue }
      try {
        const path = await directory(header.cwd)
        const key = keyOf(path)
        if (!groups.has(key)) groups.set(key, { path, ids: [] })
        groups.get(key).ids.push(header.id)
      } catch (error) { exceptions.push({ path: header.cwd, sessionId: header.id, ...errorOf(error) }) }
    }
    return new Map([...groups].sort(([a], [b]) => a.localeCompare(b)))
  }

  /** Only explicit repair may recreate a previously observed, deleted record. */
  async sync({ repair = false } = {}) {
    if (typeof repair !== 'boolean') return { available: false, ready: false, state: 'unavailable', pending: 0, registered: 0, total: 0, exceptions: [{ code: 'invalid-repair', message: 'repair must be a boolean' }] }
    return this.enqueue(async () => {
      const exceptions = []
      try {
        const { workspaceRegistry, sessionQuery } = this.services()
        const ledger = await this.readLedger()
        const groups = await this.groups(await sessionQuery.listSessions(this.abort.signal), exceptions)
        for (const [key, group] of groups) {
          this.check()
          try {
            let workspace = workspaceRegistry.list().find((item) => keyOf(item.path) === key)
            const receipt = ledger.paths[key]
            if (!workspace && receipt?.workspaceId && !repair) continue
            if (!workspace) {
              workspace = await workspaceRegistry.create(group.path)
              this.check()
              await workspaceRegistry.insertBefore(workspace.id)
            }
            const accounted = receipt?.sessionIds || []
            for (const id of group.ids) {
              this.check()
              if (!workspace.sessionIds.includes(id) && (repair || !accounted.includes(id))) await workspace.attachSession(id)
              if (!workspace.sessionIds.includes(id)) exceptions.push({ path: group.path, sessionId: id, code: 'membership-missing', message: 'Native membership is missing; explicit repair may be required' })
            }
            ledger.paths[key] = { workspaceId: workspace.id, sessionIds: [...new Set([...accounted, ...group.ids.filter((id) => workspace.sessionIds.includes(id))])] }
            await this.save(ledger)
          } catch (error) { exceptions.push({ path: group.path, ...errorOf(error) }) }
        }
        this.lastError = undefined
      } catch (error) { exceptions.push(errorOf(error)); this.lastError = errorOf(error) }
      this.syncErrors = exceptions
      const report = await this.status()
      report.exceptions.push(...exceptions.filter((item) => !report.exceptions.some((other) => JSON.stringify(other) === JSON.stringify(item))))
      report.ready = report.available && report.pending === 0 && report.exceptions.length === 0
      report.state = !report.available ? 'unavailable' : report.ready ? 'ready' : report.exceptions.length ? 'partial' : 'pending'
      return report
    }).catch((error) => ({ available: false, ready: false, state: 'unavailable', pending: 0, registered: 0, total: 0, exceptions: [errorOf(error)] }))
  }

  async authorize(path, records) {
    const target = await directory(path)
    const roots = (await this.store.current()).roots
    for (const root of roots) {
      if (!inside(root.path, path)) continue
      try {
        const verified = await resolveDirectory(root.path, path)
        if (keyOf(verified.resolved) === keyOf(target)) return target
      } catch { /* Inaccessible roots, intermediate escapes and loops grant nothing. */ }
    }
    // Historical cwd is an EXACT capability, never a recursive root grant.
    for (const { header } of records) {
      if (!ordinary(header) || !header.cwd || keyOf(header.cwd) !== keyOf(path)) continue
      if (keyOf(await directory(header.cwd)) === keyOf(target)) return target
    }
    fail('path-not-authorized', 'The directory is neither inside an authorized root nor an exact ordinary Session cwd')
  }

  async createSession(request = {}) {
    let result = { ok: false, status: 'failed', operationId: request.operationId, stage: 'validating', durable: false, membership: false, named: false }
    return this.enqueue(async () => {
      let ledger, operation
      try {
        if (typeof request.operationId !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(request.operationId)) fail('invalid-operation-id', 'operationId must contain 8–128 ASCII letters, digits, underscores or hyphens')
        if (request.title !== undefined && request.title !== null && typeof request.title !== 'string') fail('invalid-title', 'title must be a string when it is given')
        // A title is optional, and leaving it out is the normal case: naming the
        // Session here is what stops DSH's own titler, which names a conversation
        // from its first message. A title that is given is an explicit override.
        const wantedTitle = typeof request.title === 'string' ? request.title.trim() : ''
        if (wantedTitle.length > 200) fail('invalid-title', 'A title of at most 200 characters is allowed')
        const { sessionController, sessions, sessionQuery, workspaceRegistry } = this.services(true)
        ledger = await this.readLedger()
        const records = await sessionQuery.listSessions(this.abort.signal)
        const target = await this.authorize(request.path, records)
        const key = keyOf(target)
        const opKey = `op:${request.operationId}`
        operation = ledger.operations[opKey]
        if (operation && (keyOf(operation.path) !== key || operation.title !== wantedTitle)) fail('operation-conflict', 'operationId is already bound to another directory or title')
        if (!operation) {
          if (Object.keys(ledger.operations).length >= 10000) fail('operation-capacity', 'Operation receipt capacity reached; existing operations can still be retried')
          operation = ledger.operations[opKey] = { sessionId: `session-${randomUUID()}`, path: target, title: wantedTitle, created: false, named: false, durable: false, membership: false }
          await this.save(ledger) // Persist identity BEFORE any native mutation.
        }
        result = { ...result, sessionId: operation.sessionId, path: target, named: operation.named, durable: operation.durable, membership: false, status: 'partial' }
        const existing = records.find(({ header }) => header.id === operation.sessionId)?.header
        if (existing && (!ordinary(existing) || !existing.cwd || keyOf(await directory(existing.cwd)) !== key)) fail('session-conflict', 'Reserved session identity belongs to another cwd or a subagent')
        if (operation.created && !existing && !sessions.get(operation.sessionId)) fail('session-missing', 'Previously created Session is unavailable; refusing replacement creation')
        this.check()
        result.stage = 'ensuring-native-workspace'
        let workspace = workspaceRegistry.list().find((item) => keyOf(item.path) === key)
        if (!workspace) {
          workspace = await workspaceRegistry.create(target)
          this.check()
          await workspaceRegistry.insertBefore(workspace.id)
        }
        if (keyOf(await directory(workspace.path)) !== key) fail('workspace-conflict', 'Native workspace resolves to another directory')
        result.workspaceId = workspace.id
        this.check()
        result.stage = 'creating'
        // The actual official implementation accepts workspaceId OR cwd, not both.
        const created = await sessionController.create({ workspaceId: workspace.id, sessionId: operation.sessionId })
        if (created.sessionId !== operation.sessionId) fail('session-id-mismatch', 'Official create did not return the reserved Session identity')
        operation.created = true
        await this.save(ledger)
        const session = sessions.get(operation.sessionId)
        if (!session) fail('session-unavailable', 'Created Session is not available for a durability checkpoint')
        if (!ordinary(session.header) || !session.header.cwd || keyOf(await directory(session.header.cwd)) !== key) fail('session-conflict', 'Created Session header does not match the requested ordinary cwd')
        const errors = []
        const needsCheckpoint = !operation.named || !operation.durable
        if (wantedTitle !== '' && needsCheckpoint) {
          result.stage = 'naming'
          this.check()
          // A prior successful append without a confirmed checkpoint may have
          // vanished on restart. Do not trust that receipt as durable title truth.
          operation.named = result.named = false
          try { await sessionController.rename({ sessionId: operation.sessionId, title: wantedTitle }); operation.named = result.named = true }
          catch (error) { errors.push({ stage: 'naming', ...errorOf(error) }) }
        } else if (wantedTitle === '' && !operation.named) {
          // No title was asked for, so the Session is left as DSH made it and its
          // own titler names it from the first message. Recording the naming stage
          // as done is what stops the checkpoint below retrying a rename nobody
          // requested — and what makes the caller's `named` check pass.
          operation.named = result.named = true
        }
        result.stage = 'durability'
        this.check()
        if (needsCheckpoint) {
          try {
            operation.durable = result.durable = false
            if (await sessions.flush(session) !== true) fail('durability-unconfirmed', 'No official durability listener confirmed the Session checkpoint')
            operation.durable = result.durable = true
          } catch (error) { errors.push({ stage: 'durability', ...errorOf(error) }) }
        }
        result.stage = 'verifying-membership'
        this.check()
        try {
          workspace = workspaceRegistry.list().find((item) => item.id === workspace.id && keyOf(item.path) === key)
          if (!workspace?.sessionIds.includes(operation.sessionId)) fail('membership-missing', 'Created Session is absent from native workspace membership')
          operation.membership = result.membership = true
          const old = ledger.paths[key]?.sessionIds || []
          ledger.paths[key] = { workspaceId: workspace.id, sessionIds: [...new Set([...old, operation.sessionId])] }
        } catch (error) { errors.push({ stage: 'verifying-membership', ...errorOf(error) }) }
        await this.save(ledger)
        if (errors.length) return { ...result, stage: errors[0].stage, error: errors[0], errors }
        return { ...result, ok: true, status: 'completed', stage: 'completed' }
      } catch (error) {
        // A native create can throw AFTER publishing; the pre-recorded ID remains
        // the retry handle. Never create a replacement or roll back native data.
        if (operation && result.sessionId) {
          try { await this.save(ledger) } catch (saveError) { result.receiptError = errorOf(saveError) }
        }
        return { ...result, error: errorOf(error) }
      }
    }).catch((error) => ({ ...result, error: errorOf(error) }))
  }

  start() {
    this.check()
    if (this.started) return
    this.started = true
    const schedule = (summary) => {
      if (summary?.origin === 'subagent' || this.disposed || this.timer) return
      // Leading-edge bounded debounce: an event storm cannot postpone forever.
      this.timer = setTimeout(() => { this.timer = undefined; if (!this.disposed) void this.sync() }, this.debounceMs)
      this.timer.unref?.()
    }
    if (typeof this.ctx.on === 'function') this.unsubscribers.push(this.ctx.on('api-session/added', schedule))
    schedule()
  }

  dispose() {
    this.disposed = true
    this.abort.abort()
    clearTimeout(this.timer)
    this.timer = undefined
    for (const unsubscribe of this.unsubscribers.splice(0)) if (typeof unsubscribe === 'function') unsubscribe()
    // Official native sessions/workspaces intentionally survive plugin unload.
    return queues.get(keyOf(this.file))?.catch(() => {})
  }
}

export const createNativeBridge = (ctx, store, options) => new NativeBridge(ctx, store, options)
