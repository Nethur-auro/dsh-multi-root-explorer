/** Pure tree/path regression tests for workspace-explorer client.js. */
let loaded
globalThis.window = { __ModuleLoader__: { load(entry) { loaded = entry } } }
const reactStub = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Fragment: Symbol('Fragment'), useCallback: (fn) => fn, useEffect: () => {},
  useMemo: (fn) => fn(), useRef: () => ({ current: null }),
  useSyncExternalStore: (_s, get) => get(),
}
await import(new URL('../lib/client.js', import.meta.url).href)
const bundle = loaded.factory((name) => { if (name === 'react') return reactStub; throw new Error(`unexpected require(${name})`) })
const {
  fileAddressFor, normalizePath, foldPath, pathContains, pathSegmentsAfter,
  buildConversationForest, countSessions, uniqueRoots, positionOverlay, levelKey,
  mergeDirectories, parentDirectory, visibilityLists, filterResourceEntries, canSelectPath, toggleSelectedPath,
  selectionCoverage, selectedVisibilityPaths, conversationContents, fileUriFor, workspaceDragPayload, startWorkspaceDrag,
  Row, ConversationNode, ConversationChildren, ResourceDirectory, ResourceLevel, RootBlock, SessionRow, SelectionCircle, directoryMenuItems, ExplorerController,
} = bundle.__internals
let passed = 0; let failed = 0
function check(label, value, detail) {
  if (value) { passed++; console.log(`  ok   ${label}`) }
  else { failed++; console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`) }
}

console.log('\npath identity and resource addresses')
check('normalizes separators and trailing slash', normalizePath('D:/DeepSeek/') === 'D:/DeepSeek')
check('Windows fold is case insensitive', foldPath('D:/DeepSeek') === foldPath('d:/deepseek'))
check('segment containment does not match sibling prefix', !pathContains('D:/a', 'D:/a2'))
check('relative segments preserve descendants', JSON.stringify(pathSegmentsAfter('D:/a', 'd:/a/b/c')) === '["b","c"]')
check('resource address is workspace relative', fileAddressFor('s', 'D:/a', 'D:/a/x.md') === 'dsh-resource://file/session/s/x.md')
check('parentDirectory preserves drive root', parentDirectory('D:/x.md') === 'D:/')

console.log('\nfixed roots and duplicate overlap')
const roots = [
  { id: 'b', label: 'B', path: 'D:/B' },
  { id: 'a', label: 'A', path: 'D:/A' },
  { id: 'a-child', label: 'child-label', path: 'D:/A/sub' },
]
const dedup = uniqueRoots(roots)
check('overlapping child root is displayed once', dedup.length === 2 && dedup.map((r) => r.id).join(',') === 'b,a')
const fixed = buildConversationForest(roots, { ids: [], byId: {} })
check('roots retain explicit stable order', fixed.forest.map((x) => x.root.id).join(',') === 'b,a')
check('root remains visible without sessions', fixed.forest[1].node.name === 'A')
check('case-fold duplicate roots collapse', uniqueRoots([{ id: 'x', path: 'D:/Work' }, { id: 'y', path: 'd:/work/' }]).length === 1)

console.log('\nconversation placement')
const snapshot = {
  ids: ['at-root', 'at-child', 'outside', 'blank', 'fork', 'subagent', 'archived'],
  byId: {
    'at-root': { id: 'at-root', displayTitle: 'root', cwd: 'D:/A', updatedAt: 1 },
    'at-child': { id: 'at-child', displayTitle: 'child', cwd: 'D:/A/sub/deep', updatedAt: 2 },
    archived: { id: 'archived', displayTitle: 'old', cwd: 'D:/A/old', updatedAt: 7 },
    outside: { id: 'outside', displayTitle: 'outside', cwd: 'C:/Other', updatedAt: 3 },
    blank: { id: 'blank', displayTitle: 'blank', updatedAt: 4 },
    fork: { id: 'fork', displayTitle: 'ordinary fork', cwd: 'D:/A', parentId: 'at-root', origin: 'fork', updatedAt: 5 },
    subagent: { id: 'subagent', displayTitle: 'sub', cwd: 'D:/A', parentId: 'at-root', origin: 'subagent', updatedAt: 6 },
  },
}
const built = buildConversationForest(roots, snapshot)
const rootA = built.forest.find((x) => x.root?.id === 'a')
check('session at fixed root is directly attached', rootA?.node.sessions.some((s) => s.id === 'at-root'))
check('deep cwd creates nested folder path', rootA?.node.directories.get('sub')?.directories.get('deep')?.sessions[0]?.id === 'at-child')
check('outside cwd remains visible as its own anchor', built.forest.some((x) => x.anchor === 'C:/Other'))
check('cwd-less sessions remain visible', built.orphans.some((s) => s.id === 'blank'))
check('ordinary fork session remains visible', countSessions(rootA.node) >= 2)
check('explicit subagent session is excluded', !JSON.stringify(rootA.node).includes('subagent'))
const archivedDefault = buildConversationForest(roots, snapshot, {}, ['archived'])
check('archived sessions are filtered from normal tree', !JSON.stringify(archivedDefault.forest).includes('old'))
const archivedView = buildConversationForest(roots, snapshot, {}, ['archived'], [], {}, true)
check('archive view includes archived sessions', countSessions(archivedView.forest.find((x) => x.root?.id === 'a')?.node ?? { sessions: [], directories: new Map() }) >= 1)
const disk = buildConversationForest(roots, snapshot, {}, [], [], { 'r:D:/A': { entries: [{ type: 'directory', name: 'empty', path: 'D:/A/empty' }] } })
check('empty disk directory is merged into conversation tree', disk.forest.find((x) => x.root?.id === 'a')?.node.directories.has('empty'))

console.log('\nno roots and filtering')
const noRoots = buildConversationForest([], { ids: ['s', 'z'], byId: {
  s: { id: 's', cwd: 'D:/Work', displayTitle: 'session' },
  z: { id: 'z', displayTitle: 'no cwd' },
} })
check('sessions visible even when no roots exist', noRoots.forest.some((x) => x.anchor === 'D:/Work'))
check('no-cwd remains visible with no roots', noRoots.orphans.length === 1 && noRoots.orphans[0].id === 'z')
const hidden = buildConversationForest(roots, snapshot, { 'at-root': true })
check('locally hidden session is omitted', countSessions(hidden.forest.find((x) => x.root?.id === 'a').node) >= 1 && !JSON.stringify(hidden).includes('at-root'))

console.log('\nlevel and overlay helpers')
check('level keys fold path identity', levelKey({ id: 'r' }, 'D:/A') === levelKey({ id: 'r' }, 'd:/a'))
const node = { path: 'D:/A', name: 'A', directories: new Map(), sessions: [] }
const merged = mergeDirectories(node, [{ type: 'directory', name: 'sub', path: 'D:/A/sub' }, { type: 'directory', name: 'SUB', path: 'd:/a/SUB' }])
check('directory merge avoids case duplicate', merged.length === 1)
const overlay = positionOverlay(990, 790, 200, 120, 1000, 800)
check('overlay clamps inside viewport', overlay.left >= 8 && overlay.top >= 8 && overlay.left + 200 <= 992 && overlay.top + 120 <= 792)

console.log('\nvisibility helpers and tree ordering')
const migrated = visibilityLists({ hiddenDirectories: ['D:/A/sub'] })
check('legacy visibility migrates only to conversations', migrated.conversationHiddenDirectories.length === 1 && migrated.resourceHiddenEntries.length === 0)
check('explicit empty conversation list wins over legacy', visibilityLists({ conversationHiddenDirectories: [], hiddenDirectories: ['D:/A/sub'] }).conversationHiddenDirectories.length === 0)
const ordered = conversationContents(rootA.node, 2)
check('all direct sessions precede directories', ordered.slice(0, rootA.node.sessions.length).every(item => item.kind === 'session') && ordered.slice(rootA.node.sessions.length).every(item => item.kind === 'directory'))
check('sessions and directories share depth+1', ordered.every(item => item.depth === 3))
let selected = toggleSelectedPath([], 'D:/A/sub/one')
selected = toggleSelectedPath(selected, 'D:/A/sub/two')
check('selecting all children never selects parent', selectionCoverage(selected, 'D:/A/sub') === 'none' && selectedVisibilityPaths(selected).length === 2)
selected = toggleSelectedPath(selected, 'D:/A/sub')
check('parent selects descendants without third state', selectionCoverage(selected, 'D:/A/sub/three') === 'selected' && selected.length === 3)
check('submission collapses only explicitly selected ancestors', selectedVisibilityPaths(selected).join() === 'd:/a/sub')
selected = toggleSelectedPath(selected, 'd:/a/SUB')
check('unselect parent retains explicit child selection', selected.length === 2)
check('roots cannot be selected', !canSelectPath(roots, 'd:/a', 'directory', 'resources'))
check('outside paths cannot be selected', !canSelectPath(roots, 'C:/Other', 'directory', 'conversations'))
check('conversation scope excludes files and sessions', !canSelectPath(roots, 'D:/A/x', 'file', 'conversations') && !canSelectPath(roots, 'D:/A/x', 'session', 'conversations'))
check('resources select files and directories', canSelectPath(roots, 'D:/A/x', 'file', 'resources') && canSelectPath(roots, 'D:/A/x', 'directory', 'resources'))
const resources = [{path:'D:/A/sub/a',type:'file'}, {path:'D:/A/a',type:'file'}, {path:'D:/A/sub2',type:'directory'}]
check('resource hiding filters files and subtree on segment boundaries', filterResourceEntries(resources, ['D:/A/sub','D:/A/a']).map(x=>x.path).join() === 'D:/A/sub2')
const convHidden = buildConversationForest(roots, snapshot, {}, [], ['D:/A/sub'])
check('conversation hiding removes descendant sessions but not root sessions', !convHidden.forest.find(x=>x.root?.id==='a').node.directories.has('sub') && convHidden.forest.find(x=>x.root?.id==='a').node.sessions.length > 0)
check('resource hidden lists never enter conversation state', visibilityLists({resourceHiddenEntries:['D:/A/sub']}).conversationHiddenDirectories.length === 0)
check('filesystem-root containment and segments work', pathContains('D:/', 'D:/a') && pathSegmentsAfter('/', '/a/b').join('/') === 'a/b')

console.log('\nreference payloads and component wiring')
check('file URI encodes spaces unicode hash percent and query', fileUriFor('D:/中文 a/#%?.txt') === 'file:///D:/%E4%B8%AD%E6%96%87%20a/%23%25%3F.txt')
check('UNC URI keeps server authority', fileUriFor('\\\\server\\share\\a b') === 'file://server/share/a%20b')
check('POSIX URI uses triple slash', fileUriFor('/tmp/a b') === 'file:///tmp/a%20b')
const payload = workspaceDragPayload('D:/A/a.txt', 'file', 'a')
check('drag JSON retains canonical path type and root', JSON.stringify(JSON.parse(payload['application/x-dsh-workspace-path'])) === JSON.stringify({path:'D:/A/a.txt',type:'file',rootId:'a'}))
const transfer = { data: {}, setData(type,value) { this.data[type] = value } }
startWorkspaceDrag({dataTransfer:transfer}, 'D:/A/a.txt', 'file', 'a')
check('dragstart writes three payloads and copy only', Object.keys(transfer.data).length === 3 && transfer.effectAllowed === 'copy' && transfer.data['text/plain'] === 'D:/A/a.txt')
const controller = new ExplorerController({get:()=>undefined})
controller.patch({phase:'ready',roots,tab:'resources',selectionMode:'resources',expanded:{'res:d:/a/sub':true,'conv:d:/a/sub':true},levels:{},conversationHiddenDirectories:[],resourceHiddenEntries:[]})
const dir = ResourceDirectory({controller,root:roots[1],entry:{path:'D:/A/sub',name:'sub'},depth:1})
check('resource directory wires draggable and dragstart', dir.children[0].props.draggable === true && typeof dir.children[0].props.onDragStart === 'function')
const fileLevel = ResourceLevel({controller,root:roots[1],directoryPath:'D:/A',depth:1,level:{phase:'ready',entries:[resources[1]]}})
check('resource file wires draggable and dragstart', fileLevel.children[0][0].props.draggable === true && typeof fileLevel.children[0][0].props.onDragStart === 'function')
check('Row forwards drag properties to DOM', Row({depth:1,draggable:true,onDragStart:startWorkspaceDrag}).props.draggable === true)
check('root has no selection control and no drag', RootBlock({controller,root:roots[1],tab:'resources'}).children[0].props.draggable !== true && !RootBlock({controller,root:roots[1],tab:'resources'}).children[0].children.some(x=>x?.type===SelectionCircle))
check('resource directory menu includes copy path', directoryMenuItems(controller,'D:/A/sub').some(x=>x.key==='copy-path'))
controller.patch({tab:'conversations',selectionMode:'conversations'})
check('conversation directory menu excludes copy path', !directoryMenuItems(controller,'D:/A/sub').some(x=>x.key==='copy-path'))
check('selection circle absent for roots and conversation files', SelectionCircle({controller,path:'D:/A',type:'directory'}) === null && SelectionCircle({controller,path:'D:/A/a',type:'file'}) === null)
const conv = ConversationNode({controller,node:{path:'D:/A/sub',name:'sub',directories:new Map(),sessions:[]},depth:1,root:roots[1]})
check('conversation rows are not draggable', conv.children[0].props.draggable !== true && SessionRow({controller,session:{id:'s',title:'s'},depth:1}).props.draggable !== true)
check('conversation component renders ordered content helper', conv.children[1].children[0].type === ConversationChildren)
const circle = SelectionCircle({controller,path:'D:/A/other',type:'directory'})
let stopped = false
circle.props.onClick({preventDefault(){},stopPropagation(){stopped=true}})
check('circle stops propagation and selects directory only', stopped && controller.store.getSnapshot().selectedPaths.includes('d:/a/other'))
controller.setTab('resources')
check('tab switch cancels selection without submitting', controller.store.getSnapshot().selectionMode === null && controller.store.getSnapshot().selectedPaths.length === 0)
let posted
const previousFetch = globalThis.fetch
globalThis.fetch = async (_url, options) => { posted = JSON.parse(options.body); return { json: async () => ({ ok:true, value:{roots,conversationHiddenDirectories:[],resourceHiddenEntries:posted.paths ?? []} }) } }
await controller.toggleSelection()
controller.selectPath('D:/A/a.txt','file')
await controller.toggleSelection()
check('eye submits atomic scoped paths and exits', posted.scope === 'resources' && posted.hidden === true && posted.paths.join() === 'd:/a/a.txt' && controller.store.getSnapshot().selectionMode === null)
await controller.setDirectoryHidden('D:/A/a.txt',false,'resources')
check('restore preserves resource scope protocol', posted.scope === 'resources' && posted.hidden === false && posted.path === 'D:/A/a.txt')
const saved = { conversations: ['D:/A/one','D:/A/two'], resources: ['D:/A/file.txt'] }
const writes = []
globalThis.fetch = async (_url, options) => {
  const body = JSON.parse(options.body); writes.push(body)
  const keys = body.paths.map(foldPath)
  saved[body.scope] = saved[body.scope].filter(path => !keys.includes(foldPath(path)))
  if (body.hidden) saved[body.scope].push(...body.paths)
  return { json: async () => ({ok:true,value:{roots,conversationHiddenDirectories:[...saved.conversations],resourceHiddenEntries:[...saved.resources]}}) }
}
controller.patch({conversationHiddenDirectories:[...saved.conversations],resourceHiddenEntries:[...saved.resources]})
controller.setTab('conversations')
await controller.toggleSelection()
check('conversation eye preselects persisted hidden directories', controller.store.getSnapshot().selectedPaths.join() === 'd:/a/one,d:/a/two')
check('conversation edit renders without hidden filtering', bundle.__internals.ExplorerBody({controller}).children[0].props.hiddenDirectories.length === 0)
controller.selectPath('D:/A/one','directory')
await controller.toggleSelection()
check('conversation deselection restores only deselected directory', saved.conversations.join() === 'D:/A/two' && saved.resources.join() === 'D:/A/file.txt')
await controller.toggleSelection()
controller.selectPath('D:/A/two','directory')
await controller.toggleSelection()
check('conversation empty selection clears hiding', saved.conversations.length === 0)
const countBefore = writes.length
await controller.toggleSelection(); await controller.toggleSelection()
check('unchanged empty selection sends no invalid empty batch', writes.length === countBefore && controller.store.getSnapshot().selectionMode === null)
controller.setTab('resources'); await controller.toggleSelection()
controller.selectPath('D:/A/file.txt','file'); await controller.toggleSelection()
check('resource deselection also restores persisted hiding', saved.resources.length === 0)
globalThis.fetch = previousFetch
controller.dispose()

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`)
process.exitCode = failed === 0 ? 0 : 1
