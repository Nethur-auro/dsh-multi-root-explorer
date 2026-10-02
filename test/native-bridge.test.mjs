import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NativeBridge } from '../lib/host/native-bridge.js'

async function fixture(t) {
  const temp = await mkdtemp(join(tmpdir(), 'workspace-native-bridge-'))
  // This exact mkdtemp return is the only deletion target in this suite.
  t.after(() => rm(temp, { recursive: true, force: true }))
  const root = join(temp, 'root'), child = join(root, 'child'), outside = join(temp, 'outside')
  await mkdir(child, { recursive: true }); await mkdir(outside)
  const records = [], live = new Map(), workspaces = [], listeners = new Map(), calls = []
  let ordinal = 0
  const services = {
    sessionQuery: { async listSessions() { return records.map((item) => ({ header: { ...item.header }, live: live.has(item.header.id), persisted: !live.has(item.header.id) })) } },
    workspaceRegistry: {
      list() { return [...workspaces] },
      async create(path) {
        path = await realpath(path)
        const existing = workspaces.find((item) => item.path === path)
        if (existing) return existing
        calls.push(['workspace.create', path])
        const workspace = { id: `workspace-${++ordinal}`, path, title: 'Original title', sessionIds: [], async attachSession(id) {
          const header = records.find((item) => item.header.id === id)?.header
          assert.ok(header, 'attachment must name an existing official session')
          assert.equal(await realpath(header.cwd), path, 'attachment requires exact canonical cwd')
          calls.push(['attach', id]); if (!this.sessionIds.includes(id)) this.sessionIds.push(id)
        } }
        workspaces.unshift(workspace); return workspace
      },
      async insertBefore(id, anchor) {
        calls.push(['order', id, anchor])
        const index = workspaces.findIndex((item) => item.id === id)
        const [workspace] = workspaces.splice(index, 1)
        const before = anchor ? workspaces.findIndex((item) => item.id === anchor) : workspaces.length
        workspaces.splice(before, 0, workspace)
        return workspaces.map((item) => item.id)
      },
    },
    sessions: {
      get(id) { return live.get(id) },
      async flush(session) { assert.equal(live.get(session.id), session); calls.push(['flush', session.id]); return true },
      create() { assert.fail('Plugin must not use sessions.create') },
    },
    sessionController: {
      async create(request) {
        assert.equal(request.cwd, undefined, 'official create accepts workspaceId OR cwd')
        const workspace = workspaces.find((item) => item.id === request.workspaceId)
        assert.ok(workspace)
        const { sessionId } = request
        calls.push(['create', sessionId])
        let header = records.find((item) => item.header.id === sessionId)?.header
        if (!header) { header = { id: sessionId, cwd: workspace.path }; records.push({ header }) }
        assert.equal(header.cwd, workspace.path)
        live.set(sessionId, { id: sessionId, header })
        await workspace.attachSession(sessionId)
        return { sessionId }
      },
      async rename({ sessionId, title }) { calls.push(['rename', sessionId, title]); return { title, seq: 1 } },
    },
  }
  const ctx = { get(key) { return services[key] }, on(event, fn) { listeners.set(event, fn); return () => listeners.delete(event) } }
  const store = { file: join(temp, 'plugin-data', 'config.json'), async current() { return { roots: [{ id: 'root', path: root }] } } }
  const bridge = new NativeBridge(ctx, store, { debounceMs: 10 })
  t.after(() => bridge.dispose())
  return { temp, root, child, outside, records, live, workspaces, calls, services, ctx, store, bridge, listeners }
}
const intent = (path, operationId = 'operation_123') => ({ path, operationId, title: 'New conversation' })

test('status is read-only and includes cold ordinary headers, not subagents', async (t) => {
  const f = await fixture(t)
  f.records.push({ header: { id: 'cold', cwd: f.child } }, { header: { id: 'sub', cwd: f.outside, origin: 'subagent' } })
  const report = await f.bridge.status()
  assert.equal(report.pending, 1); assert.equal(report.total, 1); assert.equal(report.ready, false)
  assert.deepEqual(f.calls, [])
  await assert.rejects(readFile(f.bridge.file), { code: 'ENOENT' })
})

test('sync appends history registration preserving existing order/title, idempotently attaches exact cwd', async (t) => {
  const f = await fixture(t)
  const old = await f.services.workspaceRegistry.create(f.root)
  old.title = 'Custom user title'
  f.records.push({ header: { id: 'cold', cwd: f.child } }, { header: { id: 'other', cwd: f.outside } }, { header: { id: 'sub', cwd: f.root, parentSession: 'cold' } })
  assert.equal((await f.bridge.sync()).ready, true)
  assert.equal(f.workspaces[0], old); assert.equal(old.title, 'Custom user title')
  assert.deepEqual(f.workspaces.flatMap((item) => item.sessionIds).sort(), ['cold', 'other'])
  const writes = f.calls.length
  assert.equal((await f.bridge.sync()).ready, true)
  assert.equal(f.calls.length, writes)
})

test('sync respects user-deleted registrations across bridge reload; repair explicitly restores', async (t) => {
  const f = await fixture(t)
  f.records.push({ header: { id: 'cold', cwd: f.child } })
  await f.bridge.sync(); f.workspaces.splice(0)
  const reload = new NativeBridge(f.ctx, f.store)
  t.after(() => reload.dispose())
  const report = await reload.sync()
  assert.equal(report.ready, false); assert.equal(f.workspaces.length, 0)
  assert.ok(report.exceptions.some((item) => item.code === 'registration-removed'))
  assert.equal((await reload.sync({ repair: true })).ready, true)
  assert.equal(f.workspaces.length, 1)
})

test('sync respects removed membership until repair, and reports missing cwd and directories', async (t) => {
  const f = await fixture(t)
  f.records.push({ header: { id: 'cold', cwd: f.child } })
  await f.bridge.sync(); f.workspaces[0].sessionIds = []
  assert.equal((await f.bridge.sync()).ready, false)
  assert.deepEqual(f.workspaces[0].sessionIds, [])
  assert.equal((await f.bridge.sync({ repair: true })).ready, true)
  f.records.push({ header: { id: 'missing', cwd: join(f.root, 'does-not-exist') } }, { header: { id: 'no-cwd' } })
  const report = await f.bridge.sync()
  assert.equal(report.state, 'partial')
  assert.ok(report.exceptions.some((item) => item.code === 'ENOENT'))
  assert.ok(report.exceptions.some((item) => item.code === 'missing-cwd'))
  await assert.rejects(realpath(join(f.root, 'does-not-exist')), { code: 'ENOENT' })
})

test('create uses official create/rename/targeted flush, stable ID across concurrent requests and restart', async (t) => {
  const f = await fixture(t)
  const [a, b] = await Promise.all([f.bridge.createSession(intent(f.child)), f.bridge.createSession(intent(f.child))])
  assert.equal(a.status, 'completed'); assert.equal(b.sessionId, a.sessionId)
  assert.equal(f.records.length, 1); assert.equal(a.durable, true); assert.equal(a.membership, true)
  const reload = new NativeBridge(f.ctx, f.store); t.after(() => reload.dispose())
  const c = await reload.createSession(intent(f.child))
  assert.equal(c.sessionId, a.sessionId); assert.equal(f.records.length, 1)
  assert.equal(f.calls.filter(([type]) => type === 'rename').length, 1)
  assert.ok(f.calls.some(([type, id]) => type === 'flush' && id === a.sessionId))
  assert.equal(JSON.parse(await readFile(f.bridge.file, 'utf8')).operations['op:operation_123'].sessionId, a.sessionId)
})

test('operation ID rejects changed target/title without a replacement session', async (t) => {
  const f = await fixture(t)
  await f.bridge.createSession(intent(f.child))
  const conflict = await f.bridge.createSession(intent(f.root))
  assert.equal(conflict.error.code, 'operation-conflict')
  const titleConflict = await f.bridge.createSession({ ...intent(f.child), title: 'different' })
  assert.equal(titleConflict.error.code, 'operation-conflict')
  assert.equal(f.records.length, 1)
})

test('partial rename failure still flushes and returns original ID; retry names same session', async (t) => {
  const f = await fixture(t)
  const rename = f.services.sessionController.rename
  f.services.sessionController.rename = async () => { throw new Error('title service failed') }
  const result = await f.bridge.createSession(intent(f.child))
  assert.equal(result.status, 'partial'); assert.equal(result.stage, 'naming')
  assert.equal(result.durable, true); assert.equal(result.named, false); assert.ok(result.sessionId)
  f.services.sessionController.rename = rename
  const retry = await f.bridge.createSession(intent(f.child))
  assert.equal(retry.sessionId, result.sessionId); assert.equal(retry.ok, true)
  assert.equal(f.records.length, 1)
})

test('flush false and thrown flush are partial, never saved success', async (t) => {
  const f = await fixture(t)
  f.services.sessions.flush = async () => false
  const result = await f.bridge.createSession(intent(f.child))
  assert.equal(result.status, 'partial'); assert.equal(result.durable, false)
  assert.equal(result.error.code, 'durability-unconfirmed')
  f.services.sessions.flush = async () => { throw new Error('disk checkpoint failed') }
  const retry = await f.bridge.createSession(intent(f.child))
  assert.equal(retry.sessionId, result.sessionId); assert.equal(retry.durable, false)
  assert.equal(f.records.length, 1)
})

test('official create throws after publication: preserved intent retries same ID', async (t) => {
  const f = await fixture(t), original = f.services.sessionController.create
  f.services.sessionController.create = async (request) => { await original(request); throw new Error('response lost') }
  const result = await f.bridge.createSession(intent(f.child))
  assert.equal(result.status, 'partial'); assert.ok(result.sessionId)
  f.services.sessionController.create = original
  const retry = await f.bridge.createSession(intent(f.child))
  assert.equal(retry.sessionId, result.sessionId); assert.equal(retry.ok, true)
  assert.equal(f.records.length, 1)
})

test('fail closed when official service missing, invalid inputs, or corrupt receipt', async (t) => {
  const f = await fixture(t)
  delete f.services.sessions
  assert.equal((await f.bridge.createSession(intent(f.child))).error.code, 'service-unavailable')
  assert.deepEqual(f.calls, [])
  delete f.services.sessionQuery
  assert.equal((await f.bridge.status()).available, false)
  assert.equal((await f.bridge.sync()).available, false)
  const g = await fixture(t)
  await mkdir(join(g.temp, 'plugin-data'))
  await writeFile(g.bridge.file, '{bad')
  assert.equal((await g.bridge.createSession(intent(g.child))).ok, false)
  assert.equal(await readFile(g.bridge.file, 'utf8'), '{bad')
  assert.deepEqual(g.calls, [])
})

test('outside history grants exact ordinary cwd only, never arbitrary descendants or subagent cwd', async (t) => {
  const f = await fixture(t)
  const descendant = join(f.outside, 'descendant'); await mkdir(descendant)
  f.records.push({ header: { id: 'cold', cwd: f.outside } })
  assert.equal((await f.bridge.createSession(intent(descendant))).error.code, 'path-not-authorized')
  assert.equal((await f.bridge.createSession(intent(f.outside))).ok, true)
  f.records.push({ header: { id: 'sub', cwd: descendant, origin: 'subagent' } })
  assert.equal((await f.bridge.createSession(intent(descendant, 'operation_456'))).error.code, 'path-not-authorized')
})

test('realpath blocks root-contained junction escape and prefix siblings', async (t) => {
  if (process.platform === 'win32') { t.skip('Confined Windows host permits junction creation but denies junction cleanup; exercise on unrestricted test runner'); return }
  const f = await fixture(t)
  const link = join(f.root, 'escape')
  try { await symlink(f.outside, link, process.platform === 'win32' ? 'junction' : 'dir') }
  catch (error) { if (error.code === 'EPERM') { t.skip('Host denies symlink creation'); return }; throw error }
  try { assert.equal((await f.bridge.createSession(intent(link))).error.code, 'path-not-authorized') }
  finally { await unlink(link) } // Exact test-created junction, never its target.
  const sibling = join(f.temp, 'root2'); await mkdir(sibling)
  assert.equal((await f.bridge.createSession(intent(sibling))).error.code, 'path-not-authorized')
})

test('ordinary seeded forks are bridged and authorize exact historical cwd, not descendants', async (t) => {
  const f = await fixture(t)
  f.records.push({ header: { id: 'fork', cwd: f.outside, parentSession: 'source', isSeeded: true } })
  assert.equal((await f.bridge.status()).pending, 1)
  assert.equal((await f.bridge.sync()).ready, true)
  assert.deepEqual(f.workspaces[0].sessionIds, ['fork'])
  const descendant = join(f.outside, 'child'); await mkdir(descendant)
  assert.equal((await f.bridge.createSession(intent(descendant))).error.code, 'path-not-authorized')
  assert.equal((await f.bridge.createSession(intent(f.outside))).ok, true)
})

test('retry after unconfirmed title checkpoint renames again, while completed retry preserves user rename', async (t) => {
  const f = await fixture(t)
  let title, durableTitle
  f.services.sessionController.rename = async (request) => { title = request.title; return { title, seq: 1 } }
  f.services.sessions.flush = async () => false
  const first = await f.bridge.createSession(intent(f.child))
  assert.equal(first.named, true); assert.equal(first.durable, false)
  assert.ok((await f.bridge.status()).exceptions.some((item) => item.code === 'operation-incomplete'))
  title = durableTitle // Simulate restart losing the uncheckpointed title event.
  const reload = new NativeBridge(f.ctx, f.store); t.after(() => reload.dispose())
  f.services.sessions.flush = async () => { durableTitle = title; return true }
  const retry = await reload.createSession(intent(f.child))
  assert.equal(retry.sessionId, first.sessionId); assert.equal(retry.ok, true)
  assert.equal(durableTitle, 'New conversation')
  title = 'User renamed after completion'
  f.services.sessions.flush = async () => { throw new Error('later unrelated storage outage') }
  assert.equal((await reload.createSession(intent(f.child))).ok, true)
  assert.equal(title, 'User renamed after completion')
  assert.equal((await reload.createSession(intent(f.child))).ok, true)
  assert.equal(title, 'User renamed after completion')
})

test('failed replayed rename clears old uncheckpointed named receipt even if flush now succeeds', async (t) => {
  const f = await fixture(t)
  f.services.sessions.flush = async () => false
  await f.bridge.createSession(intent(f.child))
  f.services.sessionController.rename = async () => { throw new Error('title unavailable after restart') }
  f.services.sessions.flush = async () => true
  const retry = await f.bridge.createSession(intent(f.child))
  assert.equal(retry.ok, false); assert.equal(retry.named, false); assert.equal(retry.durable, true)
  const receipt = JSON.parse(await readFile(f.bridge.file, 'utf8')).operations['op:operation_123']
  assert.equal(receipt.named, false)
  assert.ok((await f.bridge.status()).exceptions.some((item) => item.code === 'operation-incomplete'))
})

test('dispose cancels scheduled initialization and event subscriptions, preserves native records', async (t) => {
  const f = await fixture(t)
  await f.bridge.createSession(intent(f.child))
  f.bridge.start()
  assert.equal(f.listeners.size, 1)
  await f.bridge.dispose()
  assert.equal(f.listeners.size, 0); assert.equal(f.bridge.timer, undefined)
  assert.equal(f.records.length, 1); assert.equal(f.workspaces.length, 1)
  assert.equal((await f.bridge.createSession(intent(f.root, 'operation_456'))).error.code, 'disposed')
})
