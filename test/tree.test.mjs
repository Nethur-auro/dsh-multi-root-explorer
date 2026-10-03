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
  selectionCoverage, selectedVisibilityPaths, rootForPath, selectionChildren, withoutSubtree, sessionBusyIndex, goalIsActive, MAX_SELECTION, DOUBLE_CLICK_MS,
  conversationContents, fileUriFor, referenceFor, workspaceDragPayload, startWorkspaceDrag, workspaceReferenceSource, knownMentionList, rememberMention, MAX_KNOWN_MENTIONS,
  droppedReference, droppedInComposer, promoteDroppedReference, DRAG_MARKER,
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
check('a reference omits the base directory', referenceFor('D:/A/sub/a.txt', 'file', 'D:/A') === '@sub/a.txt')
check('a directory reference keeps its trailing slash', referenceFor('D:/A/sub', 'directory', 'D:/A') === '@sub/')
check('a reference quotes whitespace', referenceFor('D:/A/my file.txt', 'file', 'D:/A') === '@"my file.txt"')
check('a quoted directory leaves the quote open for drilling, like the official grammar', referenceFor('D:/A/my dir', 'directory', 'D:/A') === '@"my dir/')
check('an apostrophe needs no quote', referenceFor("D:/A/it's.txt", 'file', 'D:/A') === "@it's.txt")
check('a double quote has no mention form and falls back to the plain path', referenceFor('D:/A/say "hi".txt', 'file', 'D:/A') === 'D:/A/say "hi".txt')
check('a path outside the base stays absolute', referenceFor('D:/B/x.txt', 'file', 'D:/A') === '@D:/B/x.txt')
check('a reference without a base stays absolute', referenceFor('D:/A/sub/a.txt', 'file', undefined) === '@D:/A/sub/a.txt')
const refTransfer = { data: {}, setData(type, value) { this.data[type] = value } }
startWorkspaceDrag({ dataTransfer: refTransfer }, 'D:/A/sub/a.txt', 'file', 'a', referenceFor('D:/A/sub/a.txt', 'file', 'D:/A'))
check('drag carries the reference as plain text and keeps the file URI',
  refTransfer.data['text/plain'] === '@sub/a.txt' && refTransfer.data['text/uri-list'] === 'file:///D:/A/sub/a.txt'
  && JSON.parse(refTransfer.data['application/x-dsh-workspace-path']).path === 'D:/A/sub/a.txt')

console.log('\nworking state folds in subagents')
const busyRows = {
  a: { id: 'a', running: false, parentSessionId: undefined },
  b: { id: 'b', running: true, parentSessionId: 'a' },
  c: { id: 'c', running: false, parentSessionId: 'b' },
  d: { id: 'd', running: false },
  e: { id: 'e', running: true },
}
const busy = sessionBusyIndex(busyRows)
check('a session whose own agent runs is busy', busy('e') === true && busy('b') === true)
check('an idle parent of a running subagent reads busy', busy('a') === true)
check('a descendant does not inherit its parent work', busy('c') === false)
check('an idle session with no running descendant is idle', busy('d') === false)
const cyclicRows = { x: { id: 'x', running: false, parentSessionId: 'y' }, y: { id: 'y', running: false, parentSessionId: 'x' } }
check('a cyclic parent chain degrades to idle instead of hanging', sessionBusyIndex(cyclicRows)('x') === false)

console.log('\ngoal-driven work counts as working')
const goalSession = phase => ({ projections: { faceOf: kind => kind === 'goal' ? { getSnapshot: () => ({ goal: { phase } }) } : undefined } })
check('an active goal reads as working', goalIsActive(goalSession('active')) === true)
check('a paused or finished goal does not', goalIsActive(goalSession('paused')) === false && goalIsActive(goalSession('complete')) === false)
check('a missing goal projection never invents activity', goalIsActive({}) === false && goalIsActive(undefined) === false)
check('a projection that throws never invents activity', goalIsActive({ projections: { faceOf: () => { throw new Error('no goal bundle') } } }) === false)
const busyStub = Object.assign(Object.create(ExplorerController.prototype), {
  service: key => key === 'sessions' ? { binding: id => ({ session: goalSession(id === 'working' ? 'active' : 'paused') }) } : undefined,
})
check('only goal-active sessions join the extra-busy set',
  [...busyStub.busySessionIds({ ids: ['working', 'resting'] })].join() === 'working')

console.log('\nsubagents working under a parent')
const subagentStub = (entries, statuses, parentId = 'parent-1') => Object.assign(Object.create(ExplorerController.prototype), {
  service: key => key === 'sessions'
    ? { list: { getSnapshot: () => ({ projectionsBySession: entries === undefined ? {} : { [parentId]: { values: { subagentCatalog: entries } } } }) } }
    : key === 'uiSession' ? { sessionStatus: { getSnapshot: () => new Map(statuses) } } : undefined,
})
check('a running catalogued subagent keeps its parent busy',
  subagentStub([{ id: 'child-1' }], [['child-1', { running: true }]]).subagentWorking('parent-1') === true)
check('a subagent that stopped does not', subagentStub([{ id: 'child-1' }], [['child-1', { running: false }]]).subagentWorking('parent-1') === false)
check('another session running is not this parent busy',
  subagentStub([{ id: 'child-1' }], [['child-2', { running: true }]]).subagentWorking('parent-1') === false)
check('a parent with no catalog is not busy',
  subagentStub(undefined, []).subagentWorking('parent-1') === false && subagentStub([], []).subagentWorking('parent-1') === false)
check('a missing status service never invents activity',
  Object.assign(Object.create(ExplorerController.prototype), { service: key => key === 'sessions' ? { list: { getSnapshot: () => ({ projectionsBySession: { p: { values: { subagentCatalog: [{ id: 'c' }] } } } }) } } : undefined }).subagentWorking('p') === false)
check('the extra-busy set includes a session whose subagent works',
  [...subagentStub([{ id: 'child-1' }], [['child-1', { running: true }]]).busySessionIds({ ids: ['parent-1', 'other'] })].join() === 'parent-1')

console.log('\n@ reference source')
const searched = []
globalThis.fetch = async (url) => {
  const text = String(url)
  if (!text.includes('workspace-explorer/search')) throw new Error(`unexpected request: ${text}`)
  searched.push(text)
  return { json: async () => ({ ok: true, value: { candidates: [
    { path: 'D:/A/sub/b', relative: 'sub/b', name: 'b', type: 'directory', rootId: 'a' },
    { path: 'D:/A/sub/a.txt', relative: 'sub/a.txt', name: 'a.txt', type: 'file', rootId: 'a' },
  ] } }) }
}
const atController = { cwdOf: () => undefined, currentSessionId: () => undefined, openFile() {} }
const atSource = workspaceReferenceSource(atController)
check('the source is an @ source under a non-clashing name', atSource.trigger === '@' && atSource.name === 'workspace' && atSource.name !== 'reference')
const atRows = await atSource.candidates({ sessionId: 's1' }, { query: 'sub' })
check('the query reaches the host route', searched.length === 1 && searched[0].includes('q=sub'))
check('a candidate carries a basename label and a root-relative description',
  atRows.length === 2 && atRows[0].label === 'b' && atRows[0].description === 'sub/b' && atRows[0].kind === 'directory' && atRows[1].kind === 'file')
const fileInsert = atSource.onPick({ candidate: atRows[1] })
check('a file pick matches the shipped chip payload field for field',
  fileInsert.insert.source === 'workspace' && fileInsert.insert.appearance === 'file' && fileInsert.insert.label === 'a.txt'
  && fileInsert.insert.ref === '@D:/A/sub/a.txt' && fileInsert.insert.clipboardText === fileInsert.insert.ref)
const dirInsert = atSource.onPick({ candidate: atRows[0] })
check('a folder pick inserts a folder chip whose label keeps the slash',
  dirInsert.insert.appearance === 'folder' && dirInsert.insert.label === 'b/' && dirInsert.insert.ref === '@D:/A/sub/b/')
check('a candidate without a path inserts nothing', atSource.onPick({ candidate: {} }) === undefined)
check('the codec submits and copies the mention unchanged',
  await atSource.codec.serialize('@sub/a.txt') === '@sub/a.txt' && atSource.codec.clipboardText('@x') === '@x')
check('a folder chip declines the file preview', atSource.openReference({ sessionId: 's1' }, { ref: '@D:/A/sub/b/', appearance: 'folder' }) === false)

console.log('\nplain-text reference lexicon')
check('a drag claims the mention it drops', knownMentionList().includes('sub/a.txt'))
check('an offered candidate claims its mention', knownMentionList().includes('D:/A/sub/b/'))
check('the lexicon is an array the pipeline can scan', Array.isArray(knownMentionList()) && typeof knownMentionList().includes === 'function')
const lexiconNotices = []
const offLexicon = atSource.subscribeLexicon({ sessionId: 's1' }, () => lexiconNotices.push('notified'))
rememberMention('@D:/A/late.txt')
check('a new mention notifies subscribers so the pipeline re-reads', lexiconNotices.length === 1 && knownMentionList().includes('D:/A/late.txt'))
check('the same mention does not notify twice', (rememberMention('@D:/A/late.txt'), lexiconNotices.length === 1))
offLexicon()
rememberMention('@D:/A/later.txt')
check('an unsubscribed watcher stops hearing about mentions', lexiconNotices.length === 1)
check('a non-mention never enters the lexicon', (rememberMention('D:/A/plain.txt'), !knownMentionList().includes(':/A/plain.txt')))
check('the lexicon is bounded', Number.isSafeInteger(MAX_KNOWN_MENTIONS) && MAX_KNOWN_MENTIONS > 0)

console.log('\ndropped references promote into chips')
check('a foreign drag is not ours', droppedReference({ getData: () => '' }) === undefined && droppedReference(null) === undefined)
check('a malformed payload is ignored', droppedReference({ getData: () => 'not json' }) === undefined)
check('a payload without a path is ignored', droppedReference({ getData: () => '{"type":"file"}' }) === undefined)
const dropTransfer = { getData: (format) => workspaceDragPayload('D:/A/sub/a.txt', 'file', 'a', '@sub/a.txt')[format] }
check('our own drag is recognised with its absolute path', droppedReference(dropTransfer)?.path === 'D:/A/sub/a.txt' && DRAG_MARKER === 'application/x-dsh-workspace-path')
check('a drop inside the composer is recognised', droppedInComposer({ closest: (selector) => selector.includes('[data-composer-card]') ? {} : null }) === true)
check('a drop outside the composer is not', droppedInComposer({ closest: () => null }) === false && droppedInComposer(null) === false)

/** A controller stub exposing only what the promotion reads. */
const fakeController = surface => ({
  service: key => key === 'inputTriggers' ? { sessionOf: () => surface } : key === 'sessions' ? { scope: () => ({ sessionId: 's1' }) } : undefined,
  currentSessionId: () => 's1',
})
const surfacePicks = []
/** A surface whose menu closes when a pick settles, the way the real one does. */
const settlingSurface = menu => {
  let open = true
  return {
    pick: (source, index) => { surfacePicks.push(`${source},${index}`); open = false },
    hit: { trigger: '@' },
    menu: { getSnapshot: () => open ? menu : { open: false, groups: [] } },
  }
}
/** A surface whose pick is silently refused, the way one with stale guards is. */
const refusingSurface = menu => ({ pick: (source, index) => surfacePicks.push(`${source},${index}`), hit: { trigger: '@' }, menu: { getSnapshot: () => menu } })
const readyMenu = { open: true, groups: [{ source: 'workspace', status: 'ready', items: [{ path: 'D:/A/other' }, { path: 'D:/A/sub/a.txt' }] }] }
check('a dropped path is picked at its own candidate index',
  await promoteDroppedReference(fakeController(settlingSurface(readyMenu)), 'D:/A/sub/a.txt', 60) === 'promoted' && surfacePicks.join() === 'workspace,1')
check('a candidate is still matched when the row carries no absolute path',
  await promoteDroppedReference(fakeController(settlingSurface({ open: true, groups: [{ source: 'workspace', status: 'ready', items: [{ name: 'a.txt' }] }] })), 'D:/A/sub/a.txt', 60) === 'promoted')
check('a pick the pipeline refuses is retried and then named',
  await promoteDroppedReference(fakeController(refusingSurface(readyMenu)), 'D:/A/sub/a.txt', 120) === 'pick-refused')
check('a menu that never opens names the missing menu', await promoteDroppedReference(fakeController(refusingSurface({ open: false, groups: [] })), 'D:/A/sub/a.txt', 40) === 'no-menu')
check('a still-loading group names the missing menu', await promoteDroppedReference(fakeController(refusingSurface({ open: true, groups: [{ source: 'workspace', status: 'loading', items: [] }] })), 'D:/A/sub/a.txt', 40) === 'no-menu')
check('a ready group without our path names the missing candidate',
  await promoteDroppedReference(fakeController(refusingSurface({ open: true, groups: [{ source: 'workspace', status: 'ready', items: [{ path: 'D:/A/other' }] }] })), 'D:/A/sub/a.txt', 40) === 'no-candidate')
check('an unrelated trigger names the missing menu',
  await promoteDroppedReference(fakeController({ pick: () => surfacePicks.push('nope'), hit: { trigger: '/' }, menu: { getSnapshot: () => readyMenu } }), 'D:/A/sub/a.txt', 40) === 'no-menu')
check('a missing service names itself', await promoteDroppedReference({ service: () => undefined, currentSessionId: () => 's1' }, 'D:/A/x', 40) === 'no-service')
check('a missing session names itself', await promoteDroppedReference({ service: key => key === 'inputTriggers' ? { sessionOf: () => ({}) } : undefined, currentSessionId: () => undefined }, 'D:/A/x', 40) === 'no-session')
check('a service without pick names the surface', await promoteDroppedReference(fakeController({ menu: { getSnapshot: () => readyMenu } }), 'D:/A/x', 40) === 'no-surface')
check('a scope that refuses the session names itself',
  await promoteDroppedReference({ service: key => key === 'inputTriggers' ? { sessionOf: () => { throw new Error('requires a retained Session scope') } } : { scope: () => ({}) }, currentSessionId: () => 's1' }, 'D:/A/x', 40) === 'no-scope')
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

console.log('\nselect-all, exclusions and the empty-folder double click')
check('child filtering follows the scope', selectionChildren([{path:'D:/A/x',type:'file'},{path:'D:/A/y',type:'directory'}], 'conversations').join() === 'd:/a/y'
  && selectionChildren([{path:'D:/A/x',type:'file'},{path:'D:/A/y',type:'directory'}], 'resources').join() === 'd:/a/x,d:/a/y')
check('the client cap matches the host cap', MAX_SELECTION === 200 && DOUBLE_CLICK_MS > 0)
check('a root resolves to itself for level lookups', rootForPath(roots, 'd:/a/sub/b')?.id === 'a')

// One /list-served directory tree. Levels are fetched on demand, so nothing is
// pre-expanded unless a test loads it on purpose — which is the whole point:
// selecting a folder must cover children the user never opened.
const tree = {
  'd:/a': [{path:'D:/A/sub',name:'sub',type:'directory'},{path:'D:/A/other',name:'other',type:'directory'},{path:'D:/A/top.txt',name:'top.txt',type:'file'}],
  'd:/a/sub': [{path:'D:/A/sub/a.txt',name:'a.txt',type:'file'},{path:'D:/A/sub/b',name:'b',type:'directory'},{path:'D:/A/sub/e',name:'e',type:'directory'}],
  'd:/a/sub/b': [{path:'D:/A/sub/b/c',name:'c',type:'directory'},{path:'D:/A/sub/b/d.txt',name:'d.txt',type:'file'}],
  'd:/a/sub/e': [],
  'd:/a/other': [],
}
const listed = []
globalThis.fetch = async (url) => {
  const text = String(url)
  if (!text.includes('workspace-explorer/list')) throw new Error(`unexpected request: ${text}`)
  const path = foldPath(new URLSearchParams(text.slice(text.indexOf('?') + 1)).get('path'))
  listed.push(path)
  return { json: async () => ({ ok: true, value: { entries: tree[path] ?? [], nextCursor: null } }) }
}

const selection = () => controller.store.getSnapshot().selectedPaths
// The fixture registers D:/A/sub as a nested root, and a registered root is
// deliberately not hideable — so these cases drop it and select ordinary folders.
const selectRoots = roots.filter(root => root.id !== 'a-child')
const reset = (mode, initial = []) => controller.patch({ roots: selectRoots, tab: mode, selectionMode: mode, selectedPaths: initial, levels: {} })

await reset('resources')
check('children are fetched for a folder that was never expanded', (await controller.childrenOf('D:/A/sub', 'resources')).join() === 'd:/a/sub/a.txt,d:/a/sub/b,d:/a/sub/e')
await reset('conversations')
check('the conversation scope materialises directories only', (await controller.childrenOf('D:/A/sub', 'conversations')).join() === 'd:/a/sub/b,d:/a/sub/e')

await reset('resources')
await controller.selectPath('D:/A/sub', 'directory')
check('clicking an unselected folder selects it', selection().join() === 'd:/a/sub')

await reset('resources', ['d:/a/sub'])
await controller.selectPath('D:/A/sub/b', 'directory')
check('excluding a covered child keeps only its siblings', selection().join() === 'd:/a/sub/a.txt,d:/a/sub/e')

await reset('conversations', ['d:/a/sub'])
await controller.selectPath('D:/A/sub/b', 'directory')
check('the conversation scope can exclude a covered child too', selection().join() === 'd:/a/sub/e')

await reset('resources', ['d:/a/sub'])
await controller.selectPath('D:/A/sub/b/c', 'directory')
check('excluding a covered grandchild expands every level on the way down', selection().join() === 'd:/a/sub/a.txt,d:/a/sub/e,d:/a/sub/b/d.txt')

await reset('resources', ['d:/a/sub'])
await controller.selectPath('D:/A/sub', 'directory')
check('clicking a selected folder clears its whole subtree', selection().length === 0)

await reset('resources', ['d:/a/sub'])
await controller.selectPath('D:/A/sub', 'directory')
await controller.selectPath('D:/A/sub', 'directory', true)
check('the second half of a double click leaves an empty folder', selection().join() === 'd:/a/sub/a.txt,d:/a/sub/b,d:/a/sub/e')

await reset('resources', ['d:/a/sub'])
check('the first click on a selected folder is not yet a double click', controller.circleClick('D:/A/sub') === false)
check('an immediate second click on it is a double click', controller.circleClick('D:/A/sub') === true)
await reset('resources')
controller.circleClick('D:/A/sub')
check('double clicking an unselected folder stays an ordinary toggle', controller.circleClick('D:/A/sub') === false)

await reset('resources', Array.from({ length: MAX_SELECTION + 1 }, (_, index) => `d:/a/bulk${index}`))
let capWrites = 0
globalThis.fetch = async () => { capWrites += 1; return { json: async () => ({ ok: true, value: {} }) } }
await controller.toggleSelection()
check('a selection past the host cap is refused before any request',
  capWrites === 0 && controller.store.getSnapshot().notice?.kind === 'error' && controller.store.getSnapshot().selectionMode === 'resources')

globalThis.fetch = previousFetch
controller.dispose()

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`)
process.exitCode = failed === 0 ? 0 : 1
