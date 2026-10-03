/**
 * Self-test for the Workspace Explorer host half.
 *
 * Runs the documented unit-test list from the design document (§8.1) against
 * the real shipped modules: Windows path normalization, root-boundary
 * matching, relative path computation, hidden-entry filtering, symlink escape
 * handling, configuration round-trip and defaults, and the route fence.
 *
 * Run with the bundled Node:
 *   node test/selftest.mjs
 */
import { mkdtemp, mkdir, rm, symlink, writeFile, readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { canonical, containsPath, fold, isAbsolutePath, isHiddenEntry, normalizeAbsolute, relativeSegments, baseName, joinCanonical } from '../lib/host/paths.js'
import { ConfigStore, describeConfig, pluginDataDir, resolveDshHome, MAX_EXPANDED, MAX_ROOTS } from '../lib/host/store.js'
import { listDirectory, ExplorerError } from '../lib/host/listing.js'
import { deleteSessionData } from '../lib/host/sessions.js'
import { makeRoutes, isAllowedRequest, ROUTES } from '../lib/host/routes.js'
import { searchIndex, EXCLUDED_DIRECTORIES, WorkspaceSearch } from '../lib/host/search.js'

let passed = 0
let failed = 0

/**
 * Assert one condition.
 * @param label - the check's name.
 * @param condition - the result.
 * @param detail - optional extra context for a failure.
 */
function check(label, condition, detail) {
  if (condition) {
    passed += 1
    console.log(`  ok   ${label}`)
  } else {
    failed += 1
    console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`)
  }
}

/** Group output. */
function group(title) {
  console.log(`\n${title}`)
}

// #region path normalization and boundaries

group('path normalization and root boundary')
check('normalizes backslashes', canonical('D:\\deepseek\\a') === 'D:/deepseek/a', canonical('D:\\deepseek\\a'))
check('drops a trailing separator', canonical('D:\\deepseek\\') === 'D:/deepseek')
check('resolves a relative path against a cwd', canonical('a/b', 'D:/deepseek') === 'D:/deepseek/a/b')
check('contains the root itself', containsPath('D:\\deepseek', 'D:\\deepseek'))
check('contains a descendant', containsPath('D:\\deepseek', 'D:\\deepseek\\项目A\\x.md'))
check('rejects a sibling prefix (deepseek2)', !containsPath('D:\\deepseek', 'D:\\deepseek2'))
check('rejects a sibling prefix (deepseek-x)', !containsPath('D:\\deepseek', 'D:\\deepseek-x'))
check('rejects a parent escape via ..', !containsPath('D:\\deepseek\\a', 'D:\\deepseek\\a\\..\\..\\Windows'))
check('accepts a case variant on Windows', process.platform !== 'win32' || containsPath('D:\\DeepSeek', 'd:\\deepseek\\a'))
check('computes relative segments', JSON.stringify(relativeSegments('D:\\deepseek', 'D:\\deepseek\\项目A\\子\\x')) === '["项目A","子","x"]')
check('computes an empty relative path for the root', relativeSegments('D:\\deepseek', 'D:\\deepseek').length === 0)
check('returns undefined outside the root', relativeSegments('D:\\deepseek', 'D:\\other') === undefined)
check('classifies POSIX and Windows absolutes', isAbsolutePath('/etc/hosts') && isAbsolutePath('D:/x') && isAbsolutePath('\\\\srv\\share') && !isAbsolutePath('src/a.ts'))
check('takes a base name', baseName('D:/deepseek/项目A/(x) [y].md') === '(x) [y].md')

// A path spelling from the other platform must survive on every host. These
// assertions are platform-independent on purpose: `normalizeAbsolute` is pure
// string work, and the `canonical` pair below holds on Windows (where the
// platform resolver handles a drive path itself) and on POSIX (where the
// lexical normalizer must, because `resolve` would read `D:/x` as relative).
group('foreign path spellings')
check('keeps a drive path as written', normalizeAbsolute('D:/deepseek/a') === 'D:/deepseek/a')
check('keeps a bare drive root', normalizeAbsolute('D:/') === 'D:/')
check('never climbs past a drive root', normalizeAbsolute('D:/a/../../Windows') === 'D:/Windows')
check('never climbs past the POSIX root', normalizeAbsolute('/a/../../b') === '/b')
check('collapses repeated separators and dot segments', normalizeAbsolute('/a//b/./c') === '/a/b/c')
check('preserves a UNC share and clamps .. at the share', normalizeAbsolute('//srv/share/a/../b') === '//srv/share/b')
check('keeps a bare UNC share prefix', normalizeAbsolute('//srv/share') === '//srv/share/')
check('a bare UNC share canonicalizes without a trailing separator', canonical('//srv/share') === '//srv/share', canonical('//srv/share'))
check('a Windows spelling folds on every host', fold('D:/Work') === 'd:/work')
check('a POSIX spelling folds only on a Windows host', process.platform === 'win32' ? fold('/Work') === '/work' : fold('/Work') === '/Work')
check('a foreign absolute never gains the cwd as a prefix', canonical('D:/deepseek/a') === 'D:/deepseek/a', canonical('D:/deepseek/a'))
check('a POSIX spelling is preserved instead of moving onto the current drive', canonical('/home/user/proj') === '/home/user/proj', canonical('/home/user/proj'))
check('a UNC absolute keeps its share spelling', canonical('//srv/share/a') === '//srv/share/a', canonical('//srv/share/a'))
check('a drive base resolves a relative child in its own namespace', canonical('a/b', 'D:/deepseek') === 'D:/deepseek/a/b', canonical('a/b', 'D:/deepseek'))

group('hidden-entry filter')
check('hides dot-prefixed entries by default', isHiddenEntry('.git', false) && isHiddenEntry('.dsh', false) && isHiddenEntry('.env', false))
check('hides node_modules by default', isHiddenEntry('node_modules', false))
check('shows ordinary entries', !isHiddenEntry('src', false) && !isHiddenEntry('README.md', false))
check('shows everything when opted in', !isHiddenEntry('.git', true) && !isHiddenEntry('node_modules', true))

// #endregion

// #region listing

group('directory listing')
const scratch = await mkdtemp(join(tmpdir(), 'dwx-selftest-'))
const root = join(scratch, '根 目录 (A)')
await mkdir(join(root, 'src', 'nested'), { recursive: true })
await mkdir(join(root, '.git'), { recursive: true })
await mkdir(join(root, 'node_modules'), { recursive: true })
await writeFile(join(root, 'README.md'), '# hi\n')
await writeFile(join(root, 'src', 'file10.ts'), '')
await writeFile(join(root, 'src', 'file2.ts'), '')
await writeFile(join(root, '.hidden'), '')
await mkdir(join(scratch, 'outside'), { recursive: true })
let linked = true
try {
  await symlink(join(scratch, 'outside'), join(root, 'escape'), 'dir')
} catch {
  try {
    // A Windows junction needs no elevation, so the escape rule is exercised there too.
    await symlink(join(scratch, 'outside'), join(root, 'escape'), 'junction')
  } catch {
    linked = false
  }
}
await mkdir(join(scratch, 'outside'), { recursive: true })
await writeFile(join(scratch, 'outside', 'secret.txt'), '')

const listing = await listDirectory({ rootPath: root, target: '', showHidden: false })
const names = listing.entries.map((entry) => entry.name)
check('lists the requested root path', listing.path === canonical(root))
check('orders directories before files', names.indexOf('src') < names.indexOf('README.md'), names.join(','))
check('omits hidden entries', !names.includes('.git') && !names.includes('node_modules') && !names.includes('.hidden'), names.join(','))
check('classifies a directory', listing.entries.find((entry) => entry.name === 'src')?.type === 'directory')
check('classifies a file', listing.entries.find((entry) => entry.name === 'README.md')?.type === 'file')
check('does not report truncation for a small directory', listing.truncated === false)

if (linked) {
  const escapeEntry = listing.entries.find((entry) => entry.name === 'escape')
  check('marks a symlink leaving the root as not browsable', escapeEntry !== undefined && escapeEntry.type === 'other', JSON.stringify(escapeEntry))
} else {
  console.log('  skip symlink-escape check (this account cannot create a link)')
}

const nested = await listDirectory({ rootPath: root, target: join(root, 'src'), showHidden: false })
check('sorts names naturally', JSON.stringify(nested.entries.map((entry) => entry.name)) === '["nested","file2.ts","file10.ts"]', JSON.stringify(nested.entries.map((entry) => entry.name)))

const withHidden = await listDirectory({ rootPath: root, target: '', showHidden: true })
check('shows hidden entries when opted in', withHidden.entries.some((entry) => entry.name === '.git') && withHidden.entries.some((entry) => entry.name === 'node_modules'))

await checkError('outside-root', () => listDirectory({ rootPath: root, target: scratch, showHidden: false }))
await checkError('not-found', () => listDirectory({ rootPath: root, target: join(root, 'nope'), showHidden: false }))
await checkError('not-a-directory', () => listDirectory({ rootPath: root, target: join(root, 'README.md'), showHidden: false }))

/**
 * Assert one listing call fails with a specific error code.
 * @param code - the expected code.
 * @param run - the call.
 */
async function checkError(code, run) {
  try {
    await run()
    check(`rejects with ${code}`, false, 'no error was thrown')
  } catch (error) {
    check(`rejects with ${code}`, error instanceof ExplorerError && error.code === code, `${error?.code}: ${error?.message}`)
  }
}

// #endregion

// #region configuration

group('configuration store')
const home = await mkdtemp(join(tmpdir(), 'dwx-home-'))
const store = new ConfigStore({ dir: pluginDataDir(home), logger: { warn() {} } })
const initial = await store.current()
check('starts empty', initial.roots.length === 0 && initial.prefs.showHiddenEntries === false)
check('places its file under storages/<plugin>/config.json', store.file.endsWith(join('storages', 'workspace-explorer', 'config.json')), store.file)

const added = await store.update((current) => ({ ...current, roots: [...current.roots, { label: '工作区', path: root }] }))
check('registers one root', added.roots.length === 1 && added.roots[0].path === canonical(root))
check('keeps the explicit label', added.roots[0].label === '工作区')
check('mints an id', typeof added.roots[0].id === 'string' && added.roots[0].id.length > 0)

await store.update((current) => ({ ...current, roots: [...current.roots, { label: '', path: root.toUpperCase() }] }))
const deduped = await store.current()
check('normalization preserves legacy duplicate registrations for explicit merge', deduped.roots.length === 2, String(deduped.roots.length))

await store.update((current) => ({ ...current, prefs: { showHiddenEntries: true }, expandedDirectories: ['root:a', 'D:/x'] }))
const reopened = new ConfigStore({ dir: pluginDataDir(home), logger: { warn() {} } })
const persisted = await reopened.current()
check('persists preferences', persisted.prefs.showHiddenEntries === true)
check('persists expansion state', JSON.stringify(persisted.expandedDirectories) === '["root:a","D:/x"]', JSON.stringify(persisted.expandedDirectories))

const state = await describeConfig(persisted)
check('describes a live root as usable', state.roots[0].exists === true && state.roots[0].isDirectory === true)
const missing = await describeConfig({ ...persisted, roots: [{ id: 'r', label: 'gone', path: join(scratch, 'gone') }] })
check('reports a missing root without throwing', missing.roots[0].exists === false && missing.roots[0].error === 'not-found')

const corrupted = new ConfigStore({ dir: pluginDataDir(home), logger: { warn() {} } })
await writeFile(corrupted.file, '{ not json', 'utf8')
const recovered = await corrupted.current()
check('degrades to empty on a corrupted file', recovered.roots.length === 0)

group('hidden directories (removed from the tree)')
check('starts with none hidden', recovered.hiddenDirectories.length === 0)
const hidOne = await store.update((current) => ({ ...current, hiddenDirectories: ['D:\\deepseek', 'D:/deepseek/', 'C:\\other'] }))
check('canonicalizes and de-duplicates hidden paths', JSON.stringify(hidOne.hiddenDirectories) === '["D:/deepseek","C:/other"]', JSON.stringify(hidOne.hiddenDirectories))
check(
  'state reports the hidden list',
  JSON.stringify((await describeConfig(hidOne)).hiddenDirectories) === JSON.stringify(hidOne.hiddenDirectories),
)
const reopenedHidden = new ConfigStore({ dir: pluginDataDir(home), logger: { warn() {} } })
check(
  'the hidden list survives a reopen',
  JSON.stringify((await reopenedHidden.current()).hiddenDirectories) === JSON.stringify(hidOne.hiddenDirectories),
)
await store.update((current) => ({ ...current, hiddenDirectories: current.hiddenDirectories.filter((entry) => entry !== 'D:/deepseek') }))
check('a hidden path can be restored', JSON.stringify((await store.current()).hiddenDirectories) === '["C:/other"]')
await store.update((current) => ({ ...current, hiddenDirectories: ['', '   ', 42, null] }))
check('junk entries are dropped', (await store.current()).hiddenDirectories.length === 0)
await store.update((current) => ({ ...current, hiddenDirectories: [root, root.toUpperCase()] }))
check(
  'case-variants collapse on Windows only',
  process.platform === 'win32' ? (await store.current()).hiddenDirectories.length === 1 : (await store.current()).hiddenDirectories.length === 2,
)

await store.reset()
check('reset clears every setting', (await store.current()).roots.length === 0)

group('home resolution')
const explicit = resolveDshHome(join(scratch, 'custom'))
check('honors an explicit home', canonical(explicit) === canonical(join(scratch, 'custom')))
check('falls back to a resolved home', resolveDshHome(undefined).length > 0)

// #endregion

// #region routes

group('route family')
const routeStore = new ConfigStore({ dir: pluginDataDir(home), logger: { warn() {} } })
await routeStore.update((current) => ({ ...current, roots: [{ id: 'root-1', label: '工作区', path: root }] }))
const bridgeCalls = []
const routes = makeRoutes({ store: routeStore, sessionsRoot: join(scratch, 'sessions'), logger: { warn() {} }, nativeBridge: {
  status: async () => ({ available: true }),
  sync: async (body) => { bridgeCalls.push(body); return { ready: true } },
  createSession: async (body) => { bridgeCalls.push(body); return { ok: false, status: 'partial', sessionId: 'retained-id' } },
} })
check('exposes every documented route', routes.length === Object.values(ROUTES).length && Object.values(ROUTES).every((path) => routes.some((route) => route.path === path)), String(routes.length))

console.log('\n@ completion search ranking')
const searchCorpus = [
  { path: 'D:/w/notes', relative: 'notes', name: 'notes', type: 'directory', rootId: 'r' },
  { path: 'D:/w/a/notes.md', relative: 'a/notes.md', name: 'notes.md', type: 'file', rootId: 'r' },
  { path: 'D:/w/b/Notes.md', relative: 'b/Notes.md', name: 'Notes.md', type: 'file', rootId: 'r' },
  { path: 'D:/w/b/deep/x.md', relative: 'b/deep/x.md', name: 'x.md', type: 'file', rootId: 'r' },
]
const ranked = (query, limit) => searchIndex(searchCorpus, query, limit ?? 10).map((entry) => entry.relative)
check('the exclusion list matches the shipped provider', EXCLUDED_DIRECTORIES.includes('node_modules') && EXCLUDED_DIRECTORIES.includes('.git'))
check('an exact basename outranks a prefix and a buried substring', ranked('notes').join() === 'notes,a/notes.md,b/Notes.md')
check('ranking is case insensitive', ranked('NOTES').length === 3)
check('a scoped query lists everything under that directory', ranked('b/').join() === 'b/Notes.md,b/deep/x.md')
check('a scoped query with a tail narrows by basename', ranked('b/x').join() === 'b/deep/x.md')
check('the limit is honoured', ranked('', 2).length === 2)
check('an unmatched query returns nothing', ranked('zzzz').length === 0)
check('an absolute query matches the absolute path, not the relative one', ranked('D:/w/b/deep/x.md').join() === 'b/deep/x.md')
check('an absolute directory query matches that directory', ranked('D:/w/b/').join() === 'b/Notes.md,b/deep/x.md')
check('a query spelled against the working directory matches its entry',
  searchIndex(searchCorpus, 'deep/x.md', 10, { cwd: 'D:/w/b' }).map((entry) => entry.relative).join() === 'b/deep/x.md')
check('the same spelling matched nothing while only the root was known',
  searchIndex(searchCorpus, 'deep/x.md', 10).length === 0)
check('an unrelated query still matches nothing with a working directory',
  searchIndex(searchCorpus, 'zzzz', 10, { cwd: 'D:/w/b' }).length === 0)
check('a directory query spelled from the working directory matches its folder',
  searchIndex(searchCorpus, 'deep/', 10, { cwd: 'D:/w/b' }).map((entry) => entry.relative).join() === 'b/deep/x.md')

console.log('\n@ completion index over a real tree')
const indexScratch = await mkdtemp(join(tmpdir(), 'dwx-index-'))
await mkdir(join(indexScratch, 'sub', 'node_modules'), { recursive: true })
await writeFile(join(indexScratch, 'a.txt'), 'a')
await writeFile(join(indexScratch, 'sub', 'b.md'), 'b')
await writeFile(join(indexScratch, 'sub', 'node_modules', 'c.js'), 'c')
const searcher = new WorkspaceSearch()
check('a cold index starts empty instead of blocking on a walk', new WorkspaceSearch().indexOf(indexScratch, 'r').entries.length === 0)
const indexed = await searcher.settle(indexScratch, 'r')
const indexedRelatives = indexed.entries.map((entry) => entry.relative).sort()
check('the index lists a real tree files and directories', indexedRelatives.join() === 'a.txt,sub,sub/b.md')
check('the index never descends into an excluded directory', !indexedRelatives.some((relative) => relative.includes('node_modules')))
check('a query finds a nested file by basename', (await searcher.search([{ id: 'r', path: indexScratch }], 'b.md', 5)).map((entry) => entry.relative).join() === 'sub/b.md')
check('a fresh index is served without re-walking', searcher.indexOf(indexScratch, 'r') === indexed)
check('a changed root id starts a different index', searcher.indexOf(indexScratch, 'other') !== indexed)
searcher.invalidate(indexScratch)
check('dropping the cache forgets the root', searcher.cache.size === 0)
await rm(indexScratch, { recursive: true, force: true })

console.log('\nrebuilding the @ index replaces it instead of appending')
const rebuildScratch = await mkdtemp(join(tmpdir(), 'dwx-rebuild-'))
await mkdir(join(rebuildScratch, 'sub'), { recursive: true })
await writeFile(join(rebuildScratch, 'a.txt'), 'a')
await writeFile(join(rebuildScratch, 'sub', 'b.md'), 'b')
const rebuildSearch = new WorkspaceSearch({ ttlMs: 1 })
const firstWalk = await rebuildSearch.settle(rebuildScratch, 'r')
check('the first walk indexes each entry once', firstWalk.entries.length === 3, String(firstWalk.entries.length))
await new Promise((resolve) => setTimeout(resolve, 30))
const secondWalk = await rebuildSearch.settle(rebuildScratch, 'r')
check('a rebuild does not double the index', secondWalk.entries.length === 3, String(secondWalk.entries.length))
await new Promise((resolve) => setTimeout(resolve, 30))
const thirdWalk = await rebuildSearch.settle(rebuildScratch, 'r')
check('and a further rebuild still does not', thirdWalk.entries.length === 3, String(thirdWalk.entries.length))
check('a rebuilt index still answers', (await rebuildSearch.search([{ id: 'r', path: rebuildScratch }], 'b.md', 5)).length === 1)
await rm(rebuildScratch, { recursive: true, force: true })

console.log('\npath joining keeps the canonical spelling')
check('a drive root joins without doubling its slash', joinCanonical('D:/', 'x') === 'D:/x' && joinCanonical('D:', 'x') === 'D:/x')
check('a POSIX root joins without doubling its slash', joinCanonical('/', 'x') === '/x')
check('an ordinary directory joins once', joinCanonical('D:/a', 'x') === 'D:/a/x' && joinCanonical('//share/dir', 'x') === '//share/dir/x')
check('a joined drive-root child folds like its canonical spelling', fold(joinCanonical('D:/', 'x')) === fold('D:/x'))

console.log('\nexpansion state keeps the newest keys')
const manyHome = await mkdtemp(join(tmpdir(), 'dwx-many-'))
const manyStore = new ConfigStore({ dir: pluginDataDir(manyHome), logger: { warn() {} } })
await manyStore.update((current) => ({ ...current, expandedDirectories: Array.from({ length: MAX_EXPANDED + 5 }, (_, index) => `k${index}`) }))
const dwxKept = (await new ConfigStore({ dir: pluginDataDir(manyHome), logger: { warn() {} } }).current()).expandedDirectories
check('the newest expansion keys survive the ceiling',
  dwxKept.length === MAX_EXPANDED && dwxKept[0] === 'k5' && dwxKept[dwxKept.length - 1] === `k${MAX_EXPANDED + 4}`, `${dwxKept.length} ${dwxKept[0]} ${dwxKept[dwxKept.length - 1]}`)
await rm(manyHome, { recursive: true, force: true })

console.log('\nthe registration ceiling holds on the persistence path')
const ceilingHome = await mkdtemp(join(tmpdir(), 'dwx-ceiling-'))
const ceilingDir = pluginDataDir(ceilingHome)
await mkdir(ceilingDir, { recursive: true })
const ceilingRoots = Array.from({ length: MAX_ROOTS + 6 }, (_, index) => ({ id: `r${index}`, label: `r${index}`, path: `D:/w${index}` }))
await writeFile(join(ceilingDir, 'config.json'), JSON.stringify({ version: 3, revision: 1, roots: ceilingRoots, prefs: {}, expandedDirectories: [], conversationHiddenDirectories: [], resourceHiddenEntries: [] }))
const ceiling = new ConfigStore({ dir: ceilingDir, logger: { warn() {} } })
const ceilingLoaded = await ceiling.current()
check('a hand-edited file cannot exceed the root ceiling', ceilingLoaded.roots.length === MAX_ROOTS, String(ceilingLoaded.roots.length))
await ceiling.update((current) => ({ ...current, roots: [...current.roots, { id: 'extra', label: 'extra', path: 'D:/extra' }] }))
check('an update cannot exceed it either', (await ceiling.current()).roots.length === MAX_ROOTS)
await rm(ceilingHome, { recursive: true, force: true })

/** Run one route against a fake HTTP exchange. */
async function call(routePath, { method = 'GET', body, origin, remoteAddress = '127.0.0.1' } = {}) {
  const routeName = routePath.split('?')[0]
  const route = routes.find((candidate) => candidate.path === routeName)
  if (route === undefined) throw new Error(`no route ${routeName}`)
  const encoded = body === undefined ? [] : [Buffer.from(JSON.stringify(body), 'utf8')]
  const request = {
    method,
    url: routePath,
    headers: { host: '127.0.0.1:19387', ...(origin === undefined ? {} : { origin }) },
    socket: { remoteAddress },
    async *[Symbol.asyncIterator]() {
      for (const chunk of encoded) yield chunk
    },
  }
  let status
  let payload
  const response = {
    writeHead(code) {
      status = code
    },
    end(text) {
      payload = text === undefined ? undefined : JSON.parse(text)
    },
  }
  await route.handler(request, response)
  return { status, payload }
}

const stateCall = await call(ROUTES.state)
check('answers state', stateCall.status === 200 && stateCall.payload.ok === true && stateCall.payload.value.roots.length === 1)
check('state reports live status', stateCall.payload.value.roots[0].exists === true)

const listCall = await call(`${ROUTES.list}?rootId=root-1&path=`)
check('answers a listing', listCall.payload.ok === true && Array.isArray(listCall.payload.value.entries))
check('rejects an unknown root', (await call(`${ROUTES.list}?rootId=nope&path=`)).payload.error.code === 'unknown-root')
check('rejects an outside-root listing', (await call(`${ROUTES.list}?rootId=root-1&path=${encodeURIComponent(scratch)}`)).payload.error.code === 'outside-root')
check('rejects a relative listing path', (await call(`${ROUTES.list}?rootId=root-1&path=src`)).payload.error.code === 'bad-request')

const addCall = await call(ROUTES.addRoot, { method: 'POST', body: { path: join(scratch, 'outside') } })
check('adds a root', addCall.payload.ok === true && addCall.payload.value.roots.length === 2)
const renameCall = await call(ROUTES.updateRoot, { method: 'POST', body: { id: 'root-1', label: '改名' } })
check('renames a root', renameCall.payload.value.roots.find((entry) => entry.id === 'root-1').label === '改名')
const prefsCall = await call(ROUTES.prefs, {
  method: 'POST',
  body: {
    showHiddenEntries: true,
    expandedDirectories: [
      'root:root-1',
      'conv:root-1/src',
      `conv:${canonical(root)}`,
      `conv:${canonical(scratch)}`,
      `res:${canonical(root)}`,
      `res:${canonical(scratch)}`,
      'root:keep',
    ],
  },
})
check(
  'stores preferences',
  prefsCall.payload.value.prefs.showHiddenEntries === true && prefsCall.payload.value.expandedDirectories.length === 7,
  JSON.stringify(prefsCall.payload.value.expandedDirectories),
)
const removeCall = await call(ROUTES.removeRoot, { method: 'POST', body: { id: 'root-1' } })
check('removes a root registration', removeCall.payload.value.roots.length === 1)
check(
  'removing a root drops only its own expansion keys',
  JSON.stringify(removeCall.payload.value.expandedDirectories) ===
    JSON.stringify([`conv:${canonical(root)}`, `conv:${canonical(scratch)}`, `res:${canonical(root)}`, `res:${canonical(scratch)}`, 'root:keep']),
  JSON.stringify(removeCall.payload.value.expandedDirectories),
)

check('rejects a wrong method', (await call(ROUTES.state, { method: 'POST', body: {} })).payload.error.code === 'bad-request')
check('rejects a malformed body', (await call(ROUTES.addRoot, { method: 'POST', body: { path: '' } })).payload.error.code === 'bad-request')
check('rejects a cross-origin request', (await call(ROUTES.state, { origin: 'https://evil.example' })).payload.error.code === 'forbidden')
check('rejects a non-loopback socket', (await call(ROUTES.state, { remoteAddress: '192.168.1.5' })).payload.error.code === 'forbidden')

check('fence accepts a loopback request', isAllowedRequest({ socket: { remoteAddress: '::ffff:127.0.0.1' }, headers: { host: 'localhost:19387' } }))
check('fence rejects a forwarded-for spoof', !isAllowedRequest({ socket: { remoteAddress: '10.0.0.2' }, headers: { host: '127.0.0.1:19387', 'x-forwarded-for': '127.0.0.1' } }))

const resetCall = await call(ROUTES.reset, { method: 'POST', body: {} })
check('reset clears the host configuration', resetCall.payload.ok === true && resetCall.payload.value.roots.length === 0)

await mkdir(join(scratch, 'hide-target', 'child'), { recursive: true })
const hideRootCall = await call(ROUTES.addRoot, { method: 'POST', body: { path: join(scratch, 'hide-target') } })
check('registers a root to hide a directory inside', hideRootCall.payload.ok === true)
const hideRootId = hideRootCall.payload.value.roots.find((entry) => entry.path.endsWith('hide-target'))?.id
const hideTarget = join(scratch, 'hide-target', 'child')
const hideCall = await call(ROUTES.hidden, { method: 'POST', body: { path: hideTarget, hidden: true } })
check('removes a directory from the tree', hideCall.payload.ok === true && hideCall.payload.value.hiddenDirectories.length === 1, JSON.stringify(hideCall.payload))
const hideAgain = await call(ROUTES.hidden, { method: 'POST', body: { path: `${hideTarget.replace(/\\/g, '/')}/`, hidden: true } })
check('re-hiding is idempotent', hideAgain.payload.value.hiddenDirectories.length === 1)
const showAgain = await call(ROUTES.hidden, { method: 'POST', body: { path: hideTarget, hidden: false } })
check('restores it', showAgain.payload.ok === true && showAgain.payload.value.hiddenDirectories.length === 0)
const dropHideRoot = await call(ROUTES.removeRoot, { method: 'POST', body: { id: hideRootId } })
check('drops the temporary root again', dropHideRoot.payload.ok === true && dropHideRoot.payload.value.roots.length === 0)
check('rejects a relative path', (await call(ROUTES.hidden, { method: 'POST', body: { path: 'somewhere' } })).payload.error.code === 'bad-request')
check('rejects a missing path', (await call(ROUTES.hidden, { method: 'POST', body: {} })).payload.error.code === 'bad-request')

// #endregion

group('v2 migration, paging, atomic imports and native adapters')
check('precise recovery filtering', isHiddenEntry('dsh-acl-recovery', false) && !isHiddenEntry('my-dsh-folder', false) && !isHiddenEntry('dsh-acl-recovery', true))
check('drive root retains separator', canonical('D:/') === 'D:/' && containsPath('D:/', 'D:/a') && relativeSegments('D:/', 'D:/a')[0] === 'a')
const page1 = await listDirectory({ rootPath: root, limit: 1 })
const paged = [...page1.entries]
let cursor = page1.nextCursor
while (cursor) {
  const page = await listDirectory({ rootPath: root, cursor, limit: 1 })
  check('pagination keeps revision', page.revision === page1.revision)
  paged.push(...page.entries); cursor = page.nextCursor
}
check('pagination returns every item without duplicates', JSON.stringify(paged) === JSON.stringify(listing.entries))
await writeFile(join(root, 'new-entry.txt'), '')
await checkError('stale-cursor', () => listDirectory({ rootPath: root, cursor: page1.nextCursor, limit: 1 }))
await checkError('bad-cursor', () => listDirectory({ rootPath: root, cursor: 'garbage' }))
if (linked) {
  await mkdir(join(scratch, 'outside', 'child'))
  await checkError('outside-root', () => listDirectory({ rootPath: root, target: join(root, 'escape', 'child') }))
}
try {
  await symlink(root, join(root, 'src', 'loop'), 'junction')
  await checkError('link-loop', () => listDirectory({ rootPath: root, target: join(root, 'src', 'loop') }))
} catch (error) { console.log(`  skip junction loop creation: ${error.code}`) }
const largeDir = join(scratch, 'large'); await mkdir(largeDir)
for (let start = 0; start < 3005; start += 100) await Promise.all(Array.from({ length: Math.min(100, 3005 - start) }, (_, i) => writeFile(join(largeDir, `entry-${start + i}`), '')))
const largeFirst = await listDirectory({ rootPath: largeDir })
const largeLast = await listDirectory({ rootPath: largeDir, cursor: largeFirst.nextCursor })
check('more than 3000 entries are fully pageable', largeFirst.entries.length === 3000 && largeLast.entries.length === 5 && largeLast.nextCursor === null && new Set([...largeFirst.entries, ...largeLast.entries].map((entry) => entry.name)).size === 3005)
const migrationDir = join(home, 'migration')
await mkdir(migrationDir)
const v1 = { version: 1, roots: [{ id: 'parent', path: root, label: 'parent' }, { id: 'child', path: join(root, 'src'), label: 'child label' }], expandedDirectories: ['root:child'], prefs: {}, hiddenDirectories: [] }
await writeFile(join(migrationDir, 'config.json'), JSON.stringify(v1))
const migratedStore = new ConfigStore({ dir: migrationDir })
const migrated = await migratedStore.current()
check('v1 migration preserves overlap and both tabs', migrated.version === 3 && migrated.roots.length === 2 && migrated.expandedDirectories.some((key) => key.startsWith('conv:')) && migrated.expandedDirectories.some((key) => key.startsWith('res:')))
check('v1 migration initializes scoped hidden lists', Array.isArray(migrated.conversationHiddenDirectories) && Array.isArray(migrated.resourceHiddenEntries) && JSON.stringify(migrated.hiddenDirectories) === JSON.stringify(migrated.conversationHiddenDirectories))
const backups = (await readdir(migrationDir)).filter((name) => name.endsWith('.bak'))
check('v1 backup is exact', backups.length === 1 && await readFile(join(migrationDir, backups[0]), 'utf8') === JSON.stringify(v1))
const futureDir = join(home, 'future'); await mkdir(futureDir)
const futureText = JSON.stringify({ version: 99, roots: [], future: 'do not lose' })
await writeFile(join(futureDir, 'config.json'), futureText)
const futureStore = new ConfigStore({ dir: futureDir })
check('unknown schema exposes read problem', Boolean((await futureStore.load()).problem))
try { await futureStore.reset(); check('unknown schema rejects write', false) } catch (error) { check('unknown schema rejects write', error.code === 'config-read-only') }
check('unknown schema remains byte-identical', await readFile(futureStore.file, 'utf8') === futureText)
try { await corrupted.reset(); check('corrupt config rejects write', false) } catch (error) { check('corrupt config rejects write', error.code === 'config-read-only') }
await call(ROUTES.reset, { method: 'POST' })
const childAdd = await call(ROUTES.addRoot, { method: 'POST', body: { path: join(root, 'src'), label: 'my child' } })
const beforeMerge = await readFile(routeStore.file, 'utf8')
const preview = await call(ROUTES.addRoot, { method: 'POST', body: { path: root } })
check('parent import requests merge without write', preview.payload.value.action === 'merge-required' && beforeMerge === await readFile(routeStore.file, 'utf8'))
const merged = await call(ROUTES.addRoot, { method: 'POST', body: { path: root, merge: true } })
check('confirmed merge preserves child label alias', merged.payload.value.roots.length === 1 && Object.values(merged.payload.value.directoryAliases).includes('my child'))
const concurrent = await Promise.all([call(ROUTES.addRoot, { method: 'POST', body: { path: root } }), call(ROUTES.addRoot, { method: 'POST', body: { path: join(root, 'src') } })])
check('concurrent duplicate/descendant imports only reveal', concurrent[0].payload.value.action === 'reveal-existing' && concurrent[1].payload.value.action === 'reveal-descendant' && (await routeStore.current()).roots.length === 1)
await call(ROUTES.hidden, { method: 'POST', body: { path: join(root, 'src') } })
const hiddenImport = await call(ROUTES.addRoot, { method: 'POST', body: { path: join(root, 'src') } })
check('hidden import asks restoration', hiddenImport.payload.value.action === 'restore-required')
const restored = await call(ROUTES.addRoot, { method: 'POST', body: { path: join(root, 'src'), restore: true } })
check('confirmed restoration unhides', restored.payload.value.hiddenDirectories.length === 0)

// Scoped restoration is configuration-only: missing paths and paths outside
// the currently registered roots can still be removed, without crossing the
// conversation/resource isolation boundary.
const missingConversation = join(scratch, 'gone-conversation')
const outsideConversation = join(scratch, 'outside-conversation')
const missingResource = join(scratch, 'gone-resource')
const outsideResource = join(scratch, 'outside-resource')
await routeStore.update((current) => ({
  ...current,
  conversationHiddenDirectories: [missingConversation, outsideConversation],
  resourceHiddenEntries: [missingResource, outsideResource],
  hiddenDirectories: [missingConversation, outsideConversation],
}))
const restoreMissingConversation = await call(ROUTES.hidden, { method: 'POST', body: { scope: 'conversations', path: missingConversation, hidden: false } })
check(
  'restores a missing conversation path without disk access',
  restoreMissingConversation.payload.ok === true &&
    !restoreMissingConversation.payload.value.conversationHiddenDirectories.includes(canonical(missingConversation)) &&
    restoreMissingConversation.payload.value.conversationHiddenDirectories.includes(canonical(outsideConversation)),
)
const restoreOutsideConversation = await call(ROUTES.hidden, { method: 'POST', body: { scope: 'conversations', path: outsideConversation, hidden: false } })
check('restores an outside-root conversation record', restoreOutsideConversation.payload.ok === true && restoreOutsideConversation.payload.value.conversationHiddenDirectories.length === 0)
const restoreMissingResource = await call(ROUTES.hidden, { method: 'POST', body: { scope: 'resources', path: missingResource, hidden: false } })
check(
  'restores a missing resource while preserving conversation isolation',
  restoreMissingResource.payload.ok === true &&
    restoreMissingResource.payload.value.resourceHiddenEntries.includes(canonical(outsideResource)) &&
    restoreMissingResource.payload.value.conversationHiddenDirectories.length === 0,
)
const restoreOutsideResource = await call(ROUTES.hidden, { method: 'POST', body: { scope: 'resources', path: outsideResource, hidden: false } })
check(
  'restores an outside-root resource record',
  restoreOutsideResource.payload.ok === true && restoreOutsideResource.payload.value.resourceHiddenEntries.length === 0 && restoreOutsideResource.payload.value.conversationHiddenDirectories.length === 0,
)
check('scoped hidden state does not leak to the other tab', restoreOutsideResource.payload.value.hiddenDirectories.length === 0)
check('native status forwards', (await call(ROUTES.nativeStatus)).payload.value.available === true)
await call(ROUTES.nativeSync, { method: 'POST', body: { repair: true } })
const created = await call(ROUTES.createSession, { method: 'POST', body: { path: root, operationId: 'operation-test', title: 'title' } })
check('native adapter preserves partial session id', created.payload.ok === true && created.payload.value.sessionId === 'retained-id' && bridgeCalls[0].repair === true)
const concurrentWrites = await Promise.all(Array.from({ length: 12 }, (_, i) => migratedStore.update((current) => ({ ...current, directoryAliases: { ...current.directoryAliases, [`key${i}`]: `${i}` } }))))
check('serialized mutations lose no updates', Object.keys((await migratedStore.current()).directoryAliases).length === 12)
const failedDir = join(home, 'blocked-file'); await writeFile(failedDir, 'not a directory')
const failedStore = new ConfigStore({ dir: failedDir })
try { await failedStore.update((current) => ({ ...current, prefs: { showHiddenEntries: true } })); check('write failures reject', false) } catch { check('write failures reject', true) }

// #region permanent session deletion

group('permanent session deletion')
const sessionsRoot = join(scratch, 'sessions')
const projectDir = join(sessionsRoot, '--C-Users-me-work--')
const sessionDir = join(projectDir, 'session-abc-123')
await mkdir(sessionDir, { recursive: true })
await writeFile(join(sessionDir, 'session.v4.jsonl.zstd'), 'x')
const keptSession = join(projectDir, 'session-keep-456')
await mkdir(keptSession, { recursive: true })
await writeFile(join(keptSession, 'session.v4.jsonl.zstd'), 'y')
const flatArtifact = join(sessionsRoot, 'session-flat-789.jsonl')
await writeFile(flatArtifact, 'z')

const deletion = await deleteSessionData({ root: sessionsRoot, sessionId: 'session-abc-123' })
check('removes only the addressed session artifact', deletion.removed.length === 1 && !existsSync(sessionDir) && existsSync(keptSession))
check('leaves the shared project directory in place', existsSync(projectDir))
await deleteSessionData({ root: sessionsRoot, sessionId: 'session-flat-789' })
check('removes a flat artifact too', !existsSync(flatArtifact))
await checkError('session-not-found', () => deleteSessionData({ root: sessionsRoot, sessionId: 'session-absent' }))
await checkError('bad-request', () => deleteSessionData({ root: sessionsRoot, sessionId: '../../etc' }))
await checkError('bad-request', () => deleteSessionData({ root: sessionsRoot, sessionId: 'a/b' }))
await checkError('bad-request', () => deleteSessionData({ root: sessionsRoot, sessionId: '' }))
check('a path-traversal id deletes nothing', existsSync(keptSession) && existsSync(sessionsRoot))
await checkError('session-running', () => deleteSessionData({ root: sessionsRoot, sessionId: 'session-keep-456', isRunning: () => true }))
check('a running session survives the refusal', existsSync(keptSession))

// #endregion

await rm(scratch, { recursive: true, force: true })
await rm(home, { recursive: true, force: true })

console.log('\nhidden entries are validated whatever the scope')
const escapedHide = await call(ROUTES.hidden, { method: 'POST', body: { path: 'C:/Outside', hidden: true } })
check('an un-scoped hide still enforces the root boundary', escapedHide.payload.ok === false && escapedHide.payload.error.code === 'outside-root', JSON.stringify(escapedHide.payload.error))
const scopedHide = await call(ROUTES.hidden, { method: 'POST', body: { path: 'C:/Outside', hidden: true, scope: 'conversations' } })
check('a scoped hide enforces it too', scopedHide.payload.ok === false && scopedHide.payload.error.code === 'outside-root')
const outOfRootRestore = await call(ROUTES.hidden, { method: 'POST', body: { path: 'C:/Outside', hidden: false } })
check('restoring a path outside every root is still accepted', outOfRootRestore.payload.ok === true)

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`)
process.exitCode = failed === 0 ? 0 : 1
