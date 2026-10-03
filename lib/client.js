/**
 * Workspace Explorer — browser half.
 *
 * Replaces the sidebar's workspace region with two tabs:
 *
 * - 对话 / Conversations — every Session filed under the registered root that
 *   contains its real working directory (`cwd`), nested exactly like the
 *   directory it ran in, plus a 未归类 group for Sessions with no usable
 *   working directory.
 * - 资源 / Resources — a read-only file and directory tree over the same
 *   roots. Clicking a file opens it in the *native* right Sidebar through
 *   `ctx.sidebarRight.openResource`, so the shipped document preview owns
 *   text, Markdown, code, image, PDF, Office, Excel, and unsupported-file
 *   handling, and the main column keeps whatever it was showing.
 *
 * The shipped occupant of `sidebar.workspaces` (ui-workspace) is never
 * disabled. This module registers at a lower `priority`, which is how the slot
 * system expresses "shadows the shipped UI": the lowest priority renders, and
 * disposing this registration hands the region straight back.
 *
 * Only `react` is required; every other capability arrives as a Cordis service
 * (`ctx.slots`, `ctx.sessions`, `ctx.workspaces`, `ctx.uiWorkspace`,
 * `ctx.sidebarRight`, `ctx.remote`).
 *
 * @module dsh-multi-root-explorer/client
 */
window.__ModuleLoader__.load({
  id: 'dsh-multi-root-explorer',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const h = React.createElement

    // #region strings

    /** Every user-facing string, in the two languages the harness ships. */
    const STRINGS = {
      zh: {
        sectionWorkspaces: '工作区',
        tabConversations: '对话',
        tabResources: '资源',
        addRoot: '添加工作区',
        noRoots: '还没有登记任何工作区。添加一个本地目录后即可浏览其中的资源。',
        settings: '设置',
        showHidden: '显示隐藏项',
        showHiddenHint: '包括 .git、.dsh、node_modules 等以点开头或依赖目录',
        refresh: '刷新',
        resetConfig: '清除插件配置',
        resetTitle: '清除插件配置？',
        resetBody: '将删除插件登记的工作区列表、展开状态和显示偏好。不会删除任何目录、文件或 DSH 会话。',
        renameRoot: '重命名显示名称',
        renameRootTitle: '重命名工作区',
        openInFileManager: '在系统资源管理器中打开',
        removeRoot: '移除工作区',
        removeRootTitle: '移除工作区？',
        removeRootBody: '只移除插件中的登记关系，不会删除该目录、其中的文件或任何会话。',
        hideDirectory: '移除不显示',
        hideDirectoryTitle: '把“{name}”从树里移除？',
        hideDirectoryBody:
          '只是不再显示：该目录以及它下面的所有对话（包括其中的工作区）都会从「对话」选项卡隐藏；磁盘上的目录、文件与会话记录都不会被删除。可在「设置」里恢复显示。',
        hiddenList: '已移除不显示的目录',
        restoreHidden: '恢复显示',
        hiddenTreeEmpty: '所有对话目录都被移除了不显示，可在「设置」里恢复。',
        rootMissing: '工作区目录不存在',
        rootNotDirectory: '该路径不是目录',
        rootNoPermission: '没有读取权限',
        rootUnreadable: '无法读取该目录',
        recheck: '重新检查',
        loading: '正在加载…',
        loadFailed: '加载失败',
        emptyDirectory: '此目录没有可显示的资源',
        truncated: '条目过多，仅显示前 3000 项',
        noWorkingDirectory: '无工作目录',
        noWorkingDirectoryHint: '这些会话还没有记录工作目录，暂时无法归入任何文件夹',
        noSessions: '此目录下暂无对话',
        sessionMenu: '更多',
        sessionOpen: '打开',
        sessionRename: '重命名',
        sessionDelete: '永久删除对话',
        sessionDeleteTitle: '永久删除这个对话？',
        sessionDeleteBody:
          '将从磁盘上删除该会话的日志文件，无法恢复，也无法撤销。DSH 本身不提供删除会话的接口，这是本插件直接删除其持久化数据；工作目录与其中的文件不会被删除。',
        sessionDeleteRunning: '该会话正在运行，请先停止它的工作再删除。',
        sessionDeleteLive: '该会话仍在本进程中打开（可能是当前会话），删除被拒绝；请切换到其他会话或重启 DSH 后重试。',
        hostRestartNeeded: '删除接口是 Host 半边新增的路由，Host 半边不会热重载。请用应用菜单「重启应用与 Host」（或退出后重新打开 DSH）后再试。',
        newConversation: '新对话',
        createFailed: '新建对话失败',
        renameFailed: '新建的对话未能命名为「新对话」',
        openFolder: '打开本地文件夹',
        revealInFolder: '在资源管理器中显示',
        previewFile: '在右侧栏预览',
        statusLabel: '状态',
        statusWorking: '工作中',
        statusIdle: '空闲',
        statusBlank: '尚未开始',
        workingDirectory: '工作目录',
        lastActivity: '最后活动',
        unknownDirectory: '（无工作目录）',
        archivedLabel: '已归档',
        sessionUnarchive: '恢复（取消归档）',
        sessionArchive: '归档',
        sessionArchiveHint: '该会话已归档，原生工作区列表默认不显示它',
        noSessionApi: '当前 DSH 版本没有提供会话创建接口，无法新建对话。',
        rename: '保存',
        cancel: '取消',
        confirm: '确定',
        close: '关闭',
        openFailed: '系统打开失败',
        noSessionForPreview: '至少需要一个会话才能预览文件。',
        noRightbar: '当前 DSH 版本没有可用的右侧栏，无法预览；资源树仍可浏览。',
        previewFailed: '无法在右侧栏打开该文件。',
        notPreviewable: '该条目为符号链接或特殊文件，不提供浏览。',
        dirNotBrowsable: '不可浏览',
        settingsNote: '根目录只做登记。移除、停用或卸载插件都不会删除目录内容或 DSH 会话。',
        configNote: '插件配置保存在 $DSH_HOME/storages/workspace-explorer/config.json；卸载插件后如需彻底清理，可手动删除该目录。',
      },
      en: {
        sectionWorkspaces: 'Workspaces',
        tabConversations: 'Conversations',
        tabResources: 'Resources',
        addRoot: 'Add workspace',
        noRoots: 'No workspace is registered yet. Add a local directory to browse its resources.',
        settings: 'Settings',
        showHidden: 'Show hidden entries',
        showHiddenHint: 'Includes dot-prefixed entries such as .git and .dsh, and dependency directories',
        refresh: 'Refresh',
        resetConfig: 'Clear plugin configuration',
        resetTitle: 'Clear plugin configuration?',
        resetBody:
          'Deletes the registered workspace list, expansion state, and display preferences. No directory, file, or DSH session is deleted.',
        renameRoot: 'Rename display name',
        renameRootTitle: 'Rename workspace',
        openInFileManager: 'Open in system file manager',
        removeRoot: 'Remove workspace',
        removeRootTitle: 'Remove workspace?',
        removeRootBody: 'Removes the registration only. The directory, its files, and every session are untouched.',
        hideDirectory: 'Remove from the tree',
        hideDirectoryTitle: 'Remove \u201c{name}\u201d from the tree?',
        hideDirectoryBody:
          'Display only: this directory and every conversation beneath it (the workspaces inside included) leave the Conversations tab. No directory, file, or session record is deleted, and Settings can show it again.',
        hiddenList: 'Directories removed from the tree',
        restoreHidden: 'Show again',
        hiddenTreeEmpty: 'Every conversation directory is removed from the tree; restore one from Settings.',
        rootMissing: 'Workspace directory is missing',
        rootNotDirectory: 'This path is not a directory',
        rootNoPermission: 'Permission denied',
        rootUnreadable: 'Cannot read this directory',
        recheck: 'Check again',
        loading: 'Loading…',
        loadFailed: 'Failed to load',
        emptyDirectory: 'No resources to show in this directory',
        truncated: 'Too many entries; showing the first 3000',
        noWorkingDirectory: 'No working directory',
        noWorkingDirectoryHint: 'These sessions record no working directory, so no folder can hold them yet',
        noSessions: 'No conversation in this directory yet',
        sessionMenu: 'More',
        sessionOpen: 'Open',
        sessionRename: 'Rename',
        sessionDelete: 'Delete conversation permanently',
        sessionDeleteTitle: 'Delete this conversation permanently?',
        sessionDeleteBody:
          'Deletes this session\u2019s log file from disk. It cannot be undone. DSH itself exposes no session-deletion API, so this plugin removes the persisted data directly; the working directory and its files are not touched.',
        sessionDeleteRunning: 'This session is running. Stop its work before deleting it.',
        sessionDeleteLive:
          'This session is still open in this process (it may be the current one), so the deletion was refused. Switch to another conversation, or restart DSH, and retry.',
        hostRestartNeeded:
          'The deletion route belongs to the Host half, which does not hot-reload. Use the application menu\u2019s "Restart App and Host" (or quit and reopen DSH) and retry.',
        newConversation: 'New conversation',
        createFailed: 'Could not start the conversation',
        renameFailed: 'The new conversation could not be named «New conversation»',
        openFolder: 'Open local folder',
        revealInFolder: 'Show in file manager',
        previewFile: 'Preview in right Sidebar',
        statusLabel: 'Status',
        statusWorking: 'Working',
        statusIdle: 'Idle',
        statusBlank: 'Not started',
        workingDirectory: 'Working directory',
        lastActivity: 'Last activity',
        unknownDirectory: '(no working directory)',
        archivedLabel: 'Archived',
        sessionUnarchive: 'Restore (unarchive)',
        sessionArchive: 'Archive',
        sessionArchiveHint: 'This conversation is archived, so the native workspace list hides it',
        noSessionApi: 'This DSH build exposes no session-creation API, so a conversation cannot be started here.',
        rename: 'Save',
        cancel: 'Cancel',
        confirm: 'Confirm',
        close: 'Close',
        openFailed: 'Opening it in the system failed',
        noSessionForPreview: 'At least one Session is required to preview a file.',
        noRightbar: 'This DSH build exposes no usable right Sidebar, so previews are unavailable. The resource tree still browses.',
        previewFailed: 'Could not open that file in the right Sidebar.',
        notPreviewable: 'This entry is a symbolic link or a special file and is not browsable.',
        dirNotBrowsable: 'Not browsable',
        settingsNote:
          'Root directories are registrations only. Removing, disabling, or uninstalling the plugin deletes no directory content and no DSH session.',
        configNote:
          'Plugin configuration lives in $DSH_HOME/storages/workspace-explorer/config.json. To clean up completely after uninstalling, delete that directory.',
      },
    }

    // #endregion

    Object.assign(STRINGS.zh, { loadMore: '加载更多', archiveView: '已归档', mergePrompt: '将已有子工作区合并到父目录？其显示名称会保留。', restorePrompt: '恢复该目录及其祖先的显示？', sessionArchive: '归档', creating: '正在创建并保存…', retryCreation: '重试保存/打开', nativeReady: '原生回退已就绪', nativePending: '原生回退尚未就绪', nativeRepair: '核对并修复原生登记', creationPartial: '会话操作尚未完成；重试会沿用同一 ID', newConversationAction: '开启新会话' })
    Object.assign(STRINGS.en, { loadMore: 'Load more', archiveView: 'Archived', mergePrompt: 'Merge registered children into this parent? Display names will be preserved.', restorePrompt: 'Restore this directory and its hidden ancestors?', sessionArchive: 'Archive', creating: 'Creating and saving…', retryCreation: 'Retry save/open', nativeReady: 'Native fallback ready', nativePending: 'Native fallback not ready', nativeRepair: 'Check and repair native registrations', creationPartial: 'Session operation incomplete; retry uses the same ID', newConversationAction: 'Start new session' })

    Object.assign(STRINGS.zh, { selectVisibility: '选择要隐藏的项', submitVisibility: '隐藏所选并退出', exitSelection: '退出选择', selectPath: '选择隐藏', coveredPath: '已由父目录覆盖', conversationHidden: '对话隐藏目录', resourceHidden: '资源隐藏项', copyPath: '复制路径', copiedPath: '路径已复制', copyFailed: '复制失败，请使用系统资源管理器复制路径：', invalidSelection: '只能选择工作区内的非根目录或资源', tooManySelected: '选中的项过多（{n} 项）：一次最多隐藏 200 项，请先减少选择。', referencePromotionSkipped: '拖拽引用未自动转换，原因：' })
    Object.assign(STRINGS.en, { selectVisibility: 'Select entries to hide', submitVisibility: 'Hide selected and exit', exitSelection: 'Exit selection', selectPath: 'Select to hide', coveredPath: 'Covered by selected parent', conversationHidden: 'Hidden conversation directories', resourceHidden: 'Hidden resources', copyPath: 'Copy path', copiedPath: 'Path copied', copyFailed: 'Copy failed; copy the path using the system file manager: ', invalidSelection: 'Select only non-root directories or resources within a workspace', tooManySelected: 'Too many entries selected ({n}); at most 200 can be hidden in one go. Narrow the selection first.', referencePromotionSkipped: 'Drag reference was not promoted: ' })

    // #region path helpers

    /** The scheme and type every file address opens with. */
    const FILE_ADDRESS_PREFIX = 'dsh-resource://file/'

    /** Component-encode one address segment, keeping `:` literal for drive letters. */
    function encodeSegment(segment) {
      return encodeURIComponent(segment).replace(/%3A/gi, ':')
    }

    /** Encode a `/`-separated path segment by segment. */
    function encodePath(path) {
      return path.split('/').map(encodeSegment).join('/')
    }

    /** Whether a path is absolute in either spelling the Host accepts. */
    function isAbsolutePath(value) {
      const text = String(value).replace(/\\/g, '/')
      return text.startsWith('/') || /^[A-Za-z]:\//.test(text) || text.startsWith('//')
    }

    /**
     * Normalize a path for comparison: forward slashes, no trailing separator.
     * @param value - a host path.
     * @returns the normalized path.
     */
    function normalizePath(value) {
      const text = String(value).replace(/\\/g, '/')
      const trimmed = text.replace(/\/+$/, '')
      return trimmed === '' ? '/' : /^[A-Za-z]:$/.test(trimmed) ? `${trimmed}/` : trimmed
    }

    /** Whether a path uses Windows spelling, which compares case-insensitively. */
    function isWindowsStyle(value) {
      const text = String(value).replace(/\\/g, '/')
      return /^[A-Za-z]:\//.test(text) || text.startsWith('//')
    }

    /**
     * Build the address of a file read through one Session, following the
     * documented `dsh-resource://file/session/<id>/<path>` grammar the shipped
     * Sidebar document preview claims. An absolute path inside the Session's
     * workspace is stored workspace-relative; any other absolute path keeps its
     * absolute spelling, which the Host resolves through the composed
     * filesystem (file reads are not workspace-contained).
     * @param sessionId - the authorizing Session.
     * @param cwd - that Session's working directory, when known.
     * @param path - the absolute file path.
     * @returns the resource address.
     */
    function fileAddressFor(sessionId, cwd, path) {
      const base = `${FILE_ADDRESS_PREFIX}session/${encodeSegment(sessionId)}/`
      const normalized = String(path).replace(/\\/g, '/')
      if (!isAbsolutePath(normalized)) return base + encodePath(normalized.replace(/^(?:\.\/)+/, ''))
      const root = cwd === undefined || cwd === null ? '' : String(cwd).replace(/\\/g, '/').replace(/\/+$/, '')
      if (root !== '' && normalized === root) return base
      if (root !== '' && normalized.startsWith(`${root}/`)) return base + encodePath(normalized.slice(root.length + 1))
      return base + encodePath(normalized)
    }

    /**
     * The parent directory of a canonical path, keeping a bare drive root
     * usable as a directory.
     * @param path - a canonical path.
     * @returns the parent directory.
     */
    function parentDirectory(path) {
      const normalized = normalizePath(path)
      const cut = normalized.lastIndexOf('/')
      if (cut < 0) return normalized
      if (cut === 0) return '/'
      const parent = normalized.slice(0, cut)
      return /^[A-Za-z]:$/.test(parent) ? `${parent}/` : parent
    }

    /**
     * The file manager application id this browser's platform uses in the
     * Host's open-in-app catalog.
     * @returns the catalog id.
     */
    function folderAppId() {
      let platform = ''
      try {
        platform = navigator.userAgentData?.platform ?? navigator.platform ?? navigator.userAgent ?? ''
      } catch {
        platform = ''
      }
      if (/win/i.test(platform)) return 'explorer'
      if (/mac|iphone|ipad/i.test(platform)) return 'finder'
      return 'filemanager'
    }

    /** The final segment of a path. */
    function baseName(value) {
      const text = String(value).replace(/\\/g, '/').replace(/\/+$/, '')
      const cut = text.lastIndexOf('/')
      return cut === -1 ? text : text.slice(cut + 1)
    }

    /**
     * Spell a path the way its platform does, for display only. Canonical paths
     * stay forward-slashed internally because that is the comparison and
     * resource-address grammar.
     * @param value - a canonical path.
     * @returns the path in native spelling.
     */
    function displayPath(value) {
      const text = String(value)
      return /^[A-Za-z]:\//.test(text) || text.startsWith('//') ? text.replace(/\//g, '\\') : text
    }

    // #endregion

    // #region observable store

    /** A minimal observable snapshot store; the panel reads it through useSyncExternalStore. */
    function createStore(initial) {
      let state = initial
      const listeners = new Set()
      return {
        getSnapshot: () => state,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
        patch: (partial) => {
          state = { ...state, ...partial }
          for (const listener of [...listeners]) {
            try {
              listener()
            } catch (error) {
              console.error('[workspace-explorer] subscriber failed:', error)
            }
          }
        },
      }
    }

    /** Read one observable (or nothing) as a React value. */
    function useObservable(observable) {
      const subscribe = React.useCallback(
        (onChange) => (observable && typeof observable.subscribe === 'function' ? observable.subscribe(onChange) : () => {}),
        [observable],
      )
      const getSnapshot = React.useCallback(
        () => (observable && typeof observable.getSnapshot === 'function' ? observable.getSnapshot() : undefined),
        [observable],
      )
      return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    }

    // #endregion

    // #region host API

    /** Route paths mirrored from the host half. */
    const API = {
      state: 'api/workspace-explorer/state',
      list: 'api/workspace-explorer/list',
      addRoot: 'api/workspace-explorer/roots/add',
      updateRoot: 'api/workspace-explorer/roots/update',
      removeRoot: 'api/workspace-explorer/roots/remove',
      prefs: 'api/workspace-explorer/prefs',
      reset: 'api/workspace-explorer/reset',
      hidden: 'api/workspace-explorer/hidden',
      deleteSession: 'api/workspace-explorer/sessions/delete',
      createSession: 'api/workspace-explorer/sessions/create',
      nativeStatus: 'api/workspace-explorer/native/status',
      nativeSync: 'api/workspace-explorer/native/sync',
  search: 'api/workspace-explorer/search',
    }

    /** A failed host request, carrying the host's stable error code. */
    class ExplorerApiError extends Error {
      constructor(code, message) {
        super(message)
        this.name = 'ExplorerApiError'
        this.code = code
      }
    }

    /**
     * Perform one request against the plugin's own route family and unwrap the
     * uniform envelope. Routes are document-relative on purpose: the harness
     * serves the GUI with `<base href="./">`, so a sub-path deployment resolves
     * them under its own mount.
     * @param url - the relative route.
     * @param options - the fetch options.
     * @returns the unwrapped `value`.
     */
    async function request(url, options) {
      let response
      try {
        response = await fetch(url, { credentials: 'same-origin', ...options })
      } catch (error) {
        throw new ExplorerApiError('transport', error instanceof Error ? error.message : String(error))
      }
      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      if (payload === null || typeof payload !== 'object' || payload.ok !== true) {
        const code = payload?.error?.code ?? `http-${response.status}`
        const message = payload?.error?.message ?? `request failed with status ${response.status}`
        throw new ExplorerApiError(code, message)
      }
      return payload.value
    }

    /** GET one route. */
    function apiGet(url) {
      return request(url, { method: 'GET', headers: { accept: 'application/json' } })
    }

    /** POST one route with a JSON body. */
    function apiPost(url, body) {
      return request(url, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      })
    }

    /**
     * The host's own "open in app" route, used for folders. It is the route the
     * shipped sidebar's Open-in-app controls call: the Host resolves the file
     * manager from its application catalog, verifies the path is an existing
     * absolute directory, launches it, and answers with an explicit failure code
     * instead of pretending. Its request and response shapes are its own, so it
     * is not routed through this plugin's envelope.
     * @param app - the catalog application id (`explorer`, `finder`, `filemanager`).
     * @param path - an absolute native directory path.
     * @returns after the Host confirmed the launch.
     */
    async function postOpenInApp(app, path) {
      let response
      try {
        response = await fetch('open-in-app/open', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify({ app, path }),
        })
      } catch (error) {
        throw new ExplorerApiError('transport', error instanceof Error ? error.message : String(error))
      }
      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      if (payload?.ok === true) return true
      throw new ExplorerApiError(payload?.code ?? `http-${response.status}`, payload?.message ?? `open failed with status ${response.status}`)
    }

    // #endregion

    // #region conversation tree

    /** Fold a normalized path for equality and map lookup under the platform rule. */
    function foldPath(path) {
      const normalized = normalizePath(path)
      return isWindowsStyle(normalized) ? normalized.toLowerCase() : normalized
    }

    /** Whether `inner` is `outer` itself or a descendant of it, on segment boundaries. */
    function pathContains(outer, inner) {
      const a = normalizePath(outer)
      const b = normalizePath(inner)
      if (foldPath(a) === foldPath(b)) return true
      return foldPath(b).startsWith(`${foldPath(a).replace(/\/$/, '')}/`)
    }

    /**
     * The segments of `inner` below `outer`, or `undefined` when it is outside.
     * @param outer - the containing directory.
     * @param inner - the candidate path.
     * @returns the relative segments, `[]` for the directory itself.
     */
    function pathSegmentsAfter(outer, inner) {
      if (!pathContains(outer, inner)) return undefined
      const a = normalizePath(outer)
      const b = normalizePath(inner)
      if (foldPath(a) === foldPath(b)) return []
      return b.slice(a.replace(/\/$/, '').length + 1).split('/')
    }

    function uniqueRoots(roots = []) {
      return roots.filter((root, i) => !roots.some((other, j) => j !== i && pathContains(other.path, root.path) && (foldPath(other.path) !== foldPath(root.path) || j < i)))
    }

    function positionOverlay(x, y, width, height, viewportWidth, viewportHeight) {
      const left = x + width <= viewportWidth - 8 ? x : x - width
      const top = y - height >= 8 ? y - height : y
      return { left: Math.max(8, Math.min(left, viewportWidth - width - 8)), top: Math.max(8, Math.min(top, viewportHeight - height - 8)) }
    }

    function levelKey(root, path) { return `${root.id}:${foldPath(path)}` }

    function mergeDirectories(node, entries = []) {
      const children = new Map([...node.directories.values()].map(child => [foldPath(child.path), child]))
      for (const entry of entries) {
        if (entry.type !== 'directory') continue
        const key = foldPath(entry.path)
        if (!children.has(key)) children.set(key, { ...makeNode(entry.name), path: entry.path })
      }
      return [...children.values()].sort((a, b) => byName.compare(a.name, b.name))
    }

    /** Scope lists never borrow visibility from the other tab. */
    function visibilityLists(state) {
      return {
        conversationHiddenDirectories: Array.isArray(state?.conversationHiddenDirectories) ? state.conversationHiddenDirectories : Array.isArray(state?.hiddenDirectories) ? state.hiddenDirectories : [],
        resourceHiddenEntries: Array.isArray(state?.resourceHiddenEntries) ? state.resourceHiddenEntries : [],
      }
    }

    /** A second click on the same circle inside this window is a double click. */
    const DOUBLE_CLICK_MS = 300

    /**
     * The host rejects a hidden-path list longer than this in one request, so a
     * selection that materialises more children than this is refused up front
     * with a readable message instead of a failed submission.
     */
    const MAX_SELECTION = 200

    function pathIsHidden(path, hidden = []) { return hidden.some(parent => pathContains(parent, path)) }
    function filterResourceEntries(entries, hidden, revealHidden = false) { return revealHidden ? entries : entries.filter(entry => !pathIsHidden(entry.path, hidden)) }
    function canSelectPath(roots, path, type, scope) {
      return (scope === 'resources' ? type === 'directory' || type === 'file' : scope === 'conversations' && type === 'directory') &&
        !roots.some(root => foldPath(root.path) === foldPath(path)) && roots.some(root => pathContains(root.path, path))
    }
    function toggleSelectedPath(selected, path) {
      const key = foldPath(path)
      return selected.includes(key) ? selected.filter(item => item !== key) : [...selected, key]
    }
    function selectionCoverage(selected, path) {
      return pathIsHidden(path, selected) ? 'selected' : 'none'
    }
    function selectedVisibilityPaths(selected) {
      const unique = [...new Set(selected.map(foldPath))]
      return unique.filter(path => !unique.some(parent => parent !== path && pathContains(parent, path)))
    }
    /**
     * The registered root one selectable path belongs to. Every selectable path
     * has one: `canSelectPath` rejects anything outside the registered roots, so
     * the paths a root outside the tree would need never reach this.
     * @param roots - the registered roots.
     * @param path - an absolute path.
     * @returns the containing root, or undefined.
     */
    function rootForPath(roots, path) {
      return (roots ?? []).find(root => pathContains(root.path, path))
    }
    /**
     * The children of one directory that the active tab is allowed to hide.
     * The conversation scope stores directories only — the host rejects a file
     * there — while the resource scope hides files and directories alike, and a
     * folder only reads as empty when its files are gone too.
     * @param entries - one directory level's entries.
     * @param scope - the active selection scope.
     * @returns the folded child paths to hide.
     */
    function selectionChildren(entries, scope) {
      const keep = scope === 'resources' ? ['directory', 'file'] : ['directory']
      return (entries ?? []).filter(entry => keep.includes(entry.type)).map(entry => foldPath(entry.path))
    }
    /**
     * Drop every selected path that is one of the given paths or sits beneath
     * one of them — the whole subtree, so clearing a folder also clears the
     * descendants a user selected earlier by hand.
     * @param selected - the folded selection.
     * @param parents - the subtree roots to remove.
     * @returns the remaining selection.
     */
    function withoutSubtree(selected, parents) {
      return selected.filter(item => !parents.some(parent => item === parent || pathContains(parent, item)))
    }
    /**
     * A predicate answering whether a Session still has work in flight.
     *
     * A Session row's `running` reports that Session's *own* agent, and only
     * while that agent is out of its idle phase. A parent that handed work to a
     * subagent therefore reads idle while the subagent keeps working — the host
     * counts each agent separately — so the descendant chain has to be folded in
     * before the UI may call a Session idle. Subagents ride `parentSessionId`. A
     * cycle degrades to false instead of recursing forever.
     *
     * Catalogue-backed subagents need `subagentWorking` as well: their rows are
     * not ordinary list rows and the client clears `running` on them, so this
     * walk covers only descendants that appear as rows with a live bit.
     * @param byId - the Client Session list rows, keyed by id.
     * @returns a predicate over Session ids.
     */
    /**
     * Whether one Session's goal is still being worked through.
     *
     * A goal drives new turns one after another, and between two of them the
     * agent's own phase is idle — so `running` reports idle while the work plainly
     * continues, which is exactly the window a task list is finished in. The
     * projected goal phase is the authoritative answer, read through the same
     * Session binding the shipped goal UI reads. Anything unexpected reads as
     * "not working", so a missing projection can never invent activity.
     * @param session - the Client session object behind `sessions.binding(id)`.
     * @returns true only for an `active` goal.
     */
    function goalIsActive(session) {
      try {
        const snapshot = session?.projections?.faceOf?.('goal')?.getSnapshot?.()
        return snapshot?.goal?.phase === 'active'
      } catch (error) {
        return false
      }
    }
    function sessionBusyIndex(byId) {
      const children = new Map()
      for (const row of Object.values(byId)) {
        const parent = row?.parentSessionId
        if (parent === undefined) continue
        const list = children.get(parent)
        if (list === undefined) children.set(parent, [row.id])
        else list.push(row.id)
      }
      const cache = new Map()
      const walk = id => {
        const hit = cache.get(id)
        if (hit !== undefined) return hit
        cache.set(id, false)
        let busy = byId[id]?.running === true
        if (!busy) for (const child of children.get(id) ?? []) { if (walk(child)) { busy = true; break } }
        cache.set(id, busy)
        return busy
      }
      return walk
    }
    function conversationContents(node, depth) {
      return [...node.sessions.map(session => ({ kind: 'session', session, depth: depth + 1 })),
        ...[...node.directories.values()].sort((a, b) => byName.compare(a.name, b.name)).map(child => ({ kind: 'directory', node: child, depth: depth + 1 }))]
    }
    function fileUriFor(path) {
      const normalized = normalizePath(path)
      const encoded = normalized.split('/').map(part => encodeURIComponent(part).replace(/%3A/gi, ':')).join('/')
      return normalized.startsWith('//') ? `file:${encoded}` : normalized.startsWith('/') ? `file://${encoded}` : `file:///${encoded}`
    }
    /**
     * The reference text a DSH composer accepts for one workspace row.
     *
     * The shared `@path` syntax is exactly what the platform's own file
     * reference serialises to, and the composer inserts `text/plain` verbatim —
     * only an `@` token is routed back to a reference, which is why a bare
     * absolute path arrives as plain text and never colours or resolves. The
     * base directory is omitted the way the `@` completion omits it; a path
     * outside the base stays absolute so it still names exactly one file.
     * Whitespace is quoted, and a directory keeps the trailing slash that
     * marks it as a folder rather than a file.
     * @param path - the row's absolute path.
     * @param type - the entry type.
     * @param base - the Session working directory, when known.
     * @returns the `@…` reference text.
     */
    function referenceFor(path, type, base) {
      const normalized = normalizePath(path).replace(/\/+$/, '')
      const relative = base === undefined || base === null || base === '' ? undefined : pathSegmentsAfter(base, path)
      const body = relative === undefined || relative.length === 0 ? normalized : relative.join('/')
      // The official mention grammar quotes on whitespace alone; `【`, `+` and
      // friends are ordinary token characters there. A double quote or a control
      // character has no mention form at all, so that path falls back to the
      // plain text the drag carried before references existed.
      if (/[\u0000-\u001f\u007f-\u009f"]/u.test(body)) return normalized
      const suffix = type === 'directory' ? '/' : ''
      if (!/\s/u.test(body)) return `@${body}${suffix}`
      return type === 'directory' ? `@"${body}${suffix}` : `@"${body}"`
    }
    /**
     * The drag format that identifies this plugin's own rows. Private to the
     * plugin on purpose: no shipped drop target understands a filesystem path, so
     * the value only ever has to survive one round trip through one drag.
     */
    const DRAG_MARKER = 'application/x-dsh-workspace-path'

    function workspaceDragPayload(path, type, rootId, reference) {
      return { 'text/plain': reference ?? path, 'text/uri-list': fileUriFor(path), [DRAG_MARKER]: JSON.stringify({ path, type, rootId }) }
    }
    function startWorkspaceDrag(event, path, type, rootId, reference) {
      if (!event.dataTransfer) return
      const payload = workspaceDragPayload(path, type, rootId, reference)
      for (const [format, value] of Object.entries(payload)) event.dataTransfer.setData(format, value)
      event.dataTransfer.effectAllowed = 'copy'
      rememberMention(payload['text/plain'])
    }

    /**
     * The reference mentions this explorer has produced, as the input pipeline's
     * plain-text lexicon.
     *
     * An editable `@path` in the draft is routed to the source whose lexicon
     * lists it, and that routing is what decides whether the text reads as a
     * reference at all. The pipeline caches the aggregated lexicon and re-reads
     * it only when a source registers, leaves, or pushes a notification — never
     * per keystroke — so carrying the mentions this explorer actually produced is
     * enough to make a *dropped* row colour the way a picked chip does, with no
     * route that would ship the whole index to the browser. Bounded, and evicted
     * oldest-first, because a long Session can browse a great many paths.
     */
    const KNOWN_MENTIONS = new Map()
    const MAX_KNOWN_MENTIONS = 4000
    let mentionRoll = []
    let mentionRollDirty = false
    const mentionWatchers = new Set()

    /**
     * Claim one mention so the draft can recognise it.
     * @param mention - a `@…` mention, exactly as inserted or offered.
     */
    function rememberMention(mention) {
      if (typeof mention !== 'string' || !mention.startsWith('@') || mention.length < 2) return
      const token = mention.slice(1)
      if (KNOWN_MENTIONS.has(token)) return
      KNOWN_MENTIONS.set(token, true)
      if (KNOWN_MENTIONS.size > MAX_KNOWN_MENTIONS) KNOWN_MENTIONS.delete(KNOWN_MENTIONS.keys().next().value)
      mentionRollDirty = true
      for (const notify of mentionWatchers) notify()
    }

    /**
     * The claimed mentions as one array, rebuilt only after a change: the
     * pipeline spreads it, so a fresh array per call would be wasted work.
     */
    function knownMentionList() {
      if (mentionRollDirty) { mentionRoll = [...KNOWN_MENTIONS.keys()]; mentionRollDirty = false }
      return mentionRoll
    }

    /** How long a dropped reference waits for the completion menu to offer it. */
    const PROMOTE_DEADLINE_MS = 2000
    /** Poll interval while waiting for that menu. */
    const PROMOTE_POLL_MS = 25
    /** How many times one dropped reference may ask for its own candidate. */
    const PROMOTE_ATTEMPTS = 3

    /**
     * The row a drag carried, or undefined when the drag was not this plugin's.
     * @param transfer - a drop event's `dataTransfer`.
     * @returns the payload, once it names a path.
     */
    function droppedReference(transfer) {
      if (transfer === null || transfer === undefined || typeof transfer.getData !== 'function') return undefined
      let payload
      try {
        payload = JSON.parse(transfer.getData(DRAG_MARKER) || 'null')
      } catch (error) {
        return undefined
      }
      return payload !== null && typeof payload === 'object' && typeof payload.path === 'string' ? payload : undefined
    }

    /**
     * Whether a drop landed inside the composer.
     * @param target - the drop event's target.
     * @returns true for the composer card and anything inside it.
     */
    function droppedInComposer(target) {
      if (target === null || target === undefined || typeof target.closest !== 'function') return false
      return target.closest('[data-composer-card], [data-composer-seat], [data-composer-input]') !== null
    }

    /**
     * Promote a just-dropped reference into a real reference chip.
     *
     * A drop can only deliver text: the composer's editor inserts `text/plain`
     * verbatim, and a chip is minted in exactly one place — the input pipeline's
     * pick path, which derives the insertion span from the token it tracked. So
     * the drop is left alone to place its `@path` text at the pointer, which is
     * what gets the position right, and this then asks the pipeline for the pick
     * the user would have made with Tab: the pipeline's own settling, with the
     * pipeline's own span. The chip replaces the token where it lies.
     *
     * None of this is a published API, so every step is feature-detected and the
     * whole function is a no-op when any of it is missing: a DSH upgrade that
     * renames a field costs the promotion, never the drop, because the plain
     * reference text simply stays in the draft.
     *
     * ADAPTATION POINT — depends on `inputTriggers.sessionOf`, the controller's
     * `menu.getSnapshot()` (`{ open, groups: [{ source, status, items }] }`), its
     * `hit` (`{ trigger }`), `pick(source, index)`, and a candidate's `path`.
     * @param controller - the explorer controller, for services and the Session.
     * @param path - the dropped row's absolute path.
     * @param deadlineMs - how long to wait for the menu; overridable for tests.
     * @returns `'promoted'`, or the step that stopped it — named verbatim so a
     *   failure in the field says where it stopped instead of looking like nothing
     *   happened at all.
     */
    async function promoteDroppedReference(controller, path, deadlineMs = PROMOTE_DEADLINE_MS) {
      const triggers = controller.service('inputTriggers')
      const sessions = controller.service('sessions')
      const sessionId = controller.currentSessionId()
      if (triggers === undefined || typeof triggers.sessionOf !== 'function') return 'no-service'
      if (sessions === undefined || typeof sessions.scope !== 'function' || sessionId === undefined) return 'no-session'
      let surface
      try {
        surface = triggers.sessionOf(sessions.scope(sessionId))
      } catch (error) {
        return 'no-scope'
      }
      if (surface === undefined || surface === null) return 'no-scope'
      if (typeof surface.pick !== 'function' || typeof surface.menu?.getSnapshot !== 'function') return 'no-surface'
      const wantedPath = foldPath(path)
      const wantedName = foldPath(path.replace(/\/+$/, '').split('/').pop() ?? '')
      const deadline = Date.now() + deadlineMs
      let sawGroup = false
      let attempts = 0
      while (Date.now() < deadline) {
        const menu = surface.menu.getSnapshot()
        const hit = surface.hit
        if (menu?.open === true && hit !== null && hit !== undefined && hit.trigger === '@') {
          const group = (menu.groups ?? []).find(entry => entry?.source === 'workspace' && entry.status === 'ready')
          if (group !== undefined) {
            sawGroup = true
            const items = Array.isArray(group.items) ? group.items : []
            // Match the absolute path this plugin handed out. The weaker forms
            // exist so a candidate whose shape changed still degrades to a match
            // rather than to nothing.
            let index = items.findIndex(item => typeof item?.path === 'string' && foldPath(item.path) === wantedPath)
            if (index < 0) index = items.findIndex(item => typeof item?.description === 'string' && foldPath(item.description) === wantedPath)
            if (index < 0 && wantedName !== '') index = items.findIndex(item => foldPath(String(item?.name ?? '')) === wantedName)
            if (index >= 0 && attempts < PROMOTE_ATTEMPTS) {
              attempts += 1
              surface.pick('workspace', index)
              // `pick` reports nothing and is a no-op when its own guards no
              // longer hold, so success is judged by its effect: a settling pick
              // closes the menu. Anything else is retried, then named.
              await sleep(PROMOTE_POLL_MS)
              if (surface.menu.getSnapshot()?.open !== true) return 'promoted'
            }
          }
        }
        await sleep(PROMOTE_POLL_MS)
      }
      if (attempts > 0) return 'pick-refused'
      return sawGroup ? 'no-candidate' : 'no-menu'
    }

    /**
     * Watch for this plugin's own drags landing in the composer, and promote them.
     *
     * The drop is never prevented or stopped: the editor places the text and the
     * promotion converts it, so a promotion that cannot run leaves exactly the
     * reference text a drag has always left. A drop anywhere else is ignored.
     * @param controller - the explorer controller handed to the promotion.
     * @returns a disposer that removes the listener.
     */
    function watchReferenceDrops(controller) {
      const onDrop = event => {
        const payload = droppedReference(event.dataTransfer)
        if (payload === undefined) return
        if (!droppedInComposer(event.target)) {
          console.warn('[dsh-multi-root-explorer] a workspace row was dropped outside the composer', event.target)
          return
        }
        void promoteDroppedReference(controller, payload.path).then(reason => {
          if (reason === 'promoted') return
          // Diagnostic while this path is validated against real builds: naming
          // the step that stopped it is the difference between a fixable report
          // and "nothing happened".
          console.warn('[dsh-multi-root-explorer] reference promotion skipped:', reason, payload.path)
          controller.notify('error', `${controller.text.referencePromotionSkipped}${reason}`)
        })
      }
      document.addEventListener('drop', onDrop)
      return () => document.removeEventListener('drop', onDrop)
    }

    /**
     * The `@` completion source backed by the host's workspace index.
     *
     * The shipped file-reference provider indexes one Session's working
     * directory and nothing else, so a path in any *other* registered root never
     * reaches the completion menu: `@` has no candidate to offer for it. This
     * source answers for every registered root, and hands the platform the same
     * insert payload the shipped `@file` source hands it, so a pick produces the
     * same atomic reference chip — file or folder icon, basename label, business
     * colour — and the model receives the same `@path` mention on submit.
     * @param controller - the explorer controller, for the Session and previews.
     * @returns an input-trigger source.
     */
    function workspaceReferenceSource(controller) {
      return {
        trigger: '@',
        name: 'workspace',
        order: 3,
        async candidates(session, request) {
          const query = typeof request?.query === 'string' ? request.query : ''
          const value = await apiGet(`${API.search}?q=${encodeURIComponent(query)}`)
          const rows = Array.isArray(value?.candidates) ? value.candidates : []
          const cwd = controller.cwdOf(controller.currentSessionId())
          return rows.map(entry => {
            const kind = entry.type === 'directory' ? 'directory' : 'file'
            // Offering a candidate claims its mention too, so a row that reaches
            // the draft by any route still reads as a reference.
            rememberMention(referenceFor(entry.path, kind, cwd))
            return { name: entry.name, label: entry.name, description: entry.relative, path: entry.path, kind }
          })
        },
        onPick({ candidate }) {
          const path = candidate?.path
          if (typeof path !== 'string' || path === '') return undefined
          const kind = candidate.kind === 'directory' ? 'directory' : 'file'
          const mention = referenceFor(path, kind, controller.cwdOf(controller.currentSessionId()))
          return {
            insert: {
              source: 'workspace',
              ref: mention,
              label: kind === 'directory' ? `${candidate.name}/` : candidate.name,
              appearance: kind === 'directory' ? 'folder' : 'file',
              clipboardText: mention,
            },
          }
        },
        /**
         * Clicking an inserted chip previews the file in the right Sidebar, the
         * same route the explorer's own rows take. A chip whose mention is
         * relative to the Session is resolved against it first. Folders have no
         * preview here, so they decline and keep the platform's own handling.
         */
        openReference(session, reference) {
          if (reference?.appearance !== 'file') return false
          const ref = typeof reference.ref === 'string' ? reference.ref : ''
          const body = ref.startsWith('@"') ? ref.slice(2, -1) : ref.slice(1)
          if (body === '') return false
          const looksAbsolute = /^([A-Za-z]:[\\/]|[\\/])/.test(body)
          const cwd = controller.cwdOf(session?.sessionId)
          const absolute = looksAbsolute || cwd === undefined ? body : `${normalizePath(cwd)}/${normalizePath(body)}`
          controller.openFile(absolute)
          return true
        },
        // A reference is its own mention: the submitted text and the clipboard
        // text are the shared `@path` form, exactly as the shipped source does.
        codec: {
          clipboardText: ref => ref,
          serialize: ref => Promise.resolve(ref),
        },
        /**
         * The mentions this explorer has produced, for the pipeline's plain-text
         * routing. This is what makes a *dropped* row colour the way a picked
         * chip is coloured, without shipping the whole index to the browser.
         */
        lexicon() { return knownMentionList() },
        /**
         * Invalidation channel. The pipeline caches the aggregated lexicon and
         * re-reads it only when a source pushes, so a freshly claimed mention has
         * to announce itself or it would never be recognised.
         */
        subscribeLexicon(session, notify) {
          mentionWatchers.add(notify)
          return () => { mentionWatchers.delete(notify) }
        },
      }
    }

    /** One empty conversation node. */
    function makeNode(name) {
      return { name, path: '', directories: new Map(), sessions: [] }
    }

    /** Insert one Session at its relative directory path. */
    function insertSession(node, segments, session) {
      let current = node
      for (const segment of segments) {
        const existing = [...current.directories.entries()].find(([name]) => isWindowsStyle(current.path) ? name.toLowerCase() === segment.toLowerCase() : name === segment)
        let child = existing?.[1]
        if (child === undefined) {
          child = makeNode(segment)
          child.path = current.path === '' ? segment : `${current.path}/${segment}`
          current.directories.set(segment, child)
        }
        current = child
      }
      current.sessions.push(session)
    }

    /** Natural, case-insensitive name order. */
    const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

    /** Sort one conversation node: directories by name, Sessions newest first. */
    function sortNode(node) {
      node.sessions.sort((left, right) => right.updatedAt - left.updatedAt)
      for (const child of node.directories.values()) sortNode(child)
    }

    /** How many Sessions live under one conversation node. */
    function countSessions(node) {
      let total = node.sessions.length
      for (const child of node.directories.values()) total += countSessions(child)
      return total
    }

    /**
     * Build the conversation forest by walking each Session's working directory
     * up to the directory it shares with the registered workspaces, so a
     * conversation running in `D:\work\notes\math` appears as
     * `work ▸ notes ▸ math` instead of falling into an unclassified
     * bucket. Only Sessions that record no working directory at all are left
     * over, and they are reported separately.
     * @param roots - the registered workspaces.
     * @param snapshot - the `ctx.sessions.list` snapshot.
     * @param hidden - Sessions this client deleted and hides until the list rebuilds.
     * @param archived - Session ids the workspace registry holds as archived.
     * @param hiddenDirectories - directories the user removed from the tree.
     * @returns the anchor nodes, the Sessions without a directory, and a
     *   path-keyed lookup the view uses to recognize a workspace node.
     */
    function buildConversationForest(roots, snapshot, hidden, archived, hiddenDirectories, levels = {}, showArchived = false, showHidden = false, aliases = {}, extraBusy = null) {
      const ids = Array.isArray(snapshot?.ids) ? snapshot.ids : []
      const byId = snapshot?.byId ?? {}
      const archivedSet = new Set(Array.isArray(archived) ? archived : [])
      const hiddenDirs = new Set((Array.isArray(hiddenDirectories) ? hiddenDirectories : []).map((path) => foldPath(path)))
      const workspaceByPath = new Map()
      const forest = []
      const visibleRoots = uniqueRoots(roots)
      for (const root of Array.isArray(roots) ? roots : []) workspaceByPath.set(foldPath(root.path), root)
      for (const root of visibleRoots) {
        const path = normalizePath(root.path)
        workspaceByPath.set(foldPath(path), root)
        const node = makeNode(root.label ?? baseName(path)); node.path = path
        forest.push({ anchor: path, node, root })
      }
      const outside = new Map(); const orphans = []
      const isBusy = sessionBusyIndex(byId)
      for (const id of ids) {
        const row = byId[id]
        if (!row || hidden?.[row.id] === true || row.origin === 'subagent' || archivedSet.has(row.id) !== showArchived) continue
        const cwd = typeof row.cwd === 'string' && row.cwd.trim() ? normalizePath(row.cwd) : undefined
        const session = { id: row.id, title: row.title ?? row.displayTitle ?? row.id, updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0, running: row.running === true, busy: isBusy(row.id) || extraBusy?.has?.(row.id) === true, blank: row.blank === true, archived: archivedSet.has(row.id), cwd }
        if (!cwd) { orphans.push(session); continue }
        let owner = forest.find((entry) => entry.root && pathContains(entry.anchor, cwd))
        if (owner) insertSession(owner.node, pathSegmentsAfter(owner.anchor, cwd) ?? [], session)
        else {
          const key = foldPath(cwd); let entry = outside.get(key)
          if (!entry) { const node = makeNode(baseName(cwd)); node.path = cwd; entry = { anchor: cwd, node }; outside.set(key, entry); forest.push(entry) }
          insertSession(entry.node, [], session)
        }
      }
      for (const entry of forest) {
        if (!entry.root) continue
        for (const level of Object.values(levels)) {
          for (const dir of level.entries ?? []) {
            if (dir.type !== 'directory' || !pathContains(entry.anchor, dir.path)) continue
            let current = entry.node
            for (const name of pathSegmentsAfter(entry.anchor, dir.path) ?? []) {
              let child = [...current.directories.values()].find(item => foldPath(item.path) === foldPath(current.path.replace(/\/$/, '') + '/' + name))
              if (!child) { child = makeNode(name); child.path = current.path.replace(/\/$/, '') + '/' + name; current.directories.set(name, child) }
              current = child
            }
          }
        }
      }
      const visible = forest.filter((entry) => ![...hiddenDirs].some(hiddenPath => pathContains(hiddenPath, entry.anchor)))
      for (const entry of visible) {
        pruneHidden(entry.node, hiddenDirs)
        const decorate = (node) => { for (const [name, child] of node.directories) {
          if (!showHidden && (name.startsWith('.') || name.toLowerCase() === 'node_modules' || name.toLowerCase() === 'dsh-acl-recovery')) { node.directories.delete(name); continue }
          child.name = aliases[foldPath(child.path)] ?? workspaceByPath.get(foldPath(child.path))?.label ?? child.name
          decorate(child)
        } }
        decorate(entry.node); sortNode(entry.node)
      }
      // Preserve explicit root order; only session-derived anchors are name-sorted.
      visible.sort((a, b) => (a.root && b.root ? (visibleRoots.indexOf(a.root) - visibleRoots.indexOf(b.root)) : a.root ? -1 : b.root ? 1 : byName.compare(a.node.name, b.node.name))); orphans.sort((a, b) => b.updatedAt - a.updatedAt)
      return { forest: visible, orphans, workspaceByPath }
    }

    /**
     * Drop every conversation node whose directory the user removed from the
     * tree, together with the Sessions filed under it.
     * @param node - the conversation node to prune in place.
     * @param hiddenDirs - folded paths that must not appear.
     */
    function pruneHidden(node, hiddenDirs) {
      for (const [name, child] of [...node.directories]) {
        if (hiddenDirs.has(foldPath(child.path))) node.directories.delete(name)
        else pruneHidden(child, hiddenDirs)
      }
    }

    /** A short, localized "time ago" label. */
    function timeAgo(timestamp, language) {
      if (typeof timestamp !== 'number' || timestamp <= 0) return ''
      const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
      const format = (value, unit) => {
        try {
          return new Intl.RelativeTimeFormat(language, { numeric: 'auto' }).format(-value, unit)
        } catch {
          return `${value}${unit}`
        }
      }
      if (seconds < 60) return format(0, 'minute')
      if (seconds < 3600) return format(Math.round(seconds / 60), 'minute')
      if (seconds < 86400) return format(Math.round(seconds / 3600), 'hour')
      if (seconds < 2592000) return format(Math.round(seconds / 86400), 'day')
      if (seconds < 31536000) return format(Math.round(seconds / 2592000), 'month')
      return format(Math.round(seconds / 31536000), 'year')
    }

    /** Wait one short interval; used while a Host projection catches up. */
    function sleep(milliseconds) {
      return new Promise((resolve) => setTimeout(resolve, milliseconds))
    }

    /** Return one session row from a list snapshot, or null while projection catches up. */
    function sessionFromSnapshot(snapshot, sessionId) {
      const row = snapshot?.byId?.[sessionId]
      return row === undefined ? null : row
    }

    /** An absolute local timestamp for the status card, or an empty string. */
    function formatStamp(timestamp) {
      if (typeof timestamp !== 'number' || timestamp <= 0) return ''
      try {
        return new Date(timestamp).toLocaleString()
      } catch {
        return new Date(timestamp).toISOString()
      }
    }

    /** The "copy path" row, offered only where a path can be copied. */
    function copyPathMenuItem(controller, path) {
      return { key: 'copy-path', label: controller.text.copyPath, icon: PATHS.file, onSelect: () => controller.copyPath(path) }
    }

    /**
     * The context-menu rows for one directory node.
     *
     * Only a registered workspace offers removal — the inverse of "add
     * workspace". A directory that merely appears because a conversation ran
     * in it is never removable from here.
     * @param controller - the panel controller.
     * @param path - the directory's absolute path.
     * @param workspace - the registered workspace this node is, when it is one.
     * @param topLevel - whether this node is a tree top level, the only place
     *   a directory may be removed from display.
     * @returns the menu items.
     */
    function directoryMenuItems(controller, path, workspace, topLevel) {
      const text = controller.text
      const items = [
        ...(controller.store.getSnapshot().tab === 'resources' ? [copyPathMenuItem(controller, path)] : []),
        {
          key: 'new',
          label: text.newConversationAction,
          icon: PATHS.plus,
          onSelect: () => void controller.createSession(path),
        },
        {
          key: 'open',
          label: text.openFolder,
          icon: PATHS.external,
          onSelect: () => void controller.openInFileManager(path),
        },
      ]
      if (workspace !== undefined) {
        items.push({ key: 'sep', separator: true })
        items.push({
          key: 'rename',
          label: text.renameRoot,
          icon: PATHS.pencil,
          onSelect: () => controller.openModal({ kind: 'rename-root', rootId: workspace.id, value: workspace.label }),
        })
        items.push({
          key: 'remove',
          label: text.removeRoot,
          icon: PATHS.trash,
          danger: true,
          onSelect: () => controller.openModal({ kind: 'remove-root', rootId: workspace.id }),
        })
      } else if (topLevel === true) {
        // The tree derived this node from a Session's working directory, so
        // there is no registration to drop; "remove from display" is the
        // inverse of the node appearing at all.
        items.push({ key: 'sep', separator: true })
        items.push({
          key: 'hide',
          label: text.hideDirectory,
          icon: PATHS.trash,
          danger: true,
          onSelect: () => controller.openModal({ kind: 'hide-directory', path, name: baseName(path) }),
        })
      }
      return items
    }

    /**
     * The context-menu rows for one Session.
     * @param controller - the panel controller.
     * @param session - the Session the row stands for.
     * @returns the menu items.
     */
    function sessionMenuItems(controller, session) {
      const text = controller.text
      const items = [
        { key: 'open', label: text.sessionOpen, icon: PATHS.file, onSelect: () => controller.openSession(session.id) },
        {
          key: 'rename',
          label: text.sessionRename,
          icon: PATHS.pencil,
          onSelect: () => controller.openModal({ kind: 'rename-session', sessionId: session.id, value: session.title }),
        },
      ]
      // A conversation is not a folder, so it offers no folder gesture; only
      // directories (and files, in the resources tab) do.
      if (session.archived === true) {
        items.push({ key: 'unarchive', label: text.sessionUnarchive, icon: PATHS.refresh, onSelect: () => void controller.unarchiveSession(session.id) })
      } else {
        items.push({ key: 'archive', label: text.sessionArchive, icon: PATHS.trash, onSelect: () => void controller.archiveSession(session.id) })
      }
      items.push({ key: 'sep', separator: true })
      items.push({
        key: 'delete',
        label: text.sessionDelete,
        icon: PATHS.trash,
        danger: true,
        onSelect: () => controller.openModal({ kind: 'delete-session', sessionId: session.id, title: session.title }),
      })
      return items
    }

    // #endregion

    // #region controller

    /**
     * The panel's single state owner. Everything the panel draws lives here so
     * that switching tabs, collapsing directories, or remounting the body never
     * loses the root list, the expansion state, or a loaded directory level.
     */
    class ExplorerController {
      /**
       * @param ctx - the client root context.
       */
      constructor(ctx) {
        this.ctx = ctx
        const locale = ctx.get('locale', false)
        const localeSnapshot = locale?.getSnapshot?.() ?? { active: 'en' }
        this.language = localeSnapshot.active
        this.text = /^zh/i.test(this.language) ? STRINGS.zh : STRINGS.en
        this.generation = 0
        this.activeLoads = 0
        this.requests = new Map()
        this.createLocks = new Set()
        this.operations = {}
        try { this.operations = JSON.parse(sessionStorage.getItem('dwx:operations') || '{}') } catch {}
        this.navigationGeneration = 0
        this.disposed = false
        this.store = createStore({
          phase: 'loading',
          error: null,
          roots: [],
          prefs: { showHiddenEntries: false },
          tab: 'conversations',
          expanded: {},
          levels: {},
          /** The floating context menu, or null: `{ x, y, items }` in panel coordinates. */
          menu: null,
          /** The floating session status card, or null: `{ session, x, y }`. */
          hover: null,
          /** Sessions this client deleted, filtered out of the tree until the list rebuilds. */
          hiddenSessions: {},
          settingsOpen: false,
          modal: null,
          notice: null,
          previewIssue: null,
          conversationHiddenDirectories: [],
          resourceHiddenEntries: [],
          selectionMode: null,
          selectedPaths: [],
          selectionBusy: false,
        })
        this.expansionInitialized = false
        this.expansionTimer = null
        this.noticeTimer = null
        this.hoverTimer = null
        /** Guards a circle click that has to read a directory level before it can apply. */
        this.selectionPending = false
        /** The previous circle click, used to classify a double click. */
        this.circleClickState = undefined
        this.disposers = []
      }

      /** Subscribe to changes. */
      subscribe(listener) {
        return this.store.subscribe(listener)
      }

      /** Patch the snapshot. */
      patch(partial) {
        this.store.patch(partial)
      }

      /** Read one optional Cordis service; a missing service is not an error here. */
      service(key) {
        return this.ctx.get(key, false)
      }

      /** Start: load host state and follow the Session and Workspace stores. */
      async start() {
        const locale = this.service('locale')
        if (locale?.subscribe) this.disposers.push(locale.subscribe(() => { const active = locale.getSnapshot?.()?.active ?? 'en'; this.language = active; this.text = /^zh/i.test(active) ? STRINGS.zh : STRINGS.en; this.closeHover(); this.patch({ menu: null }) }))
        const sessions = this.service('sessions')
        const workspaces = this.service('workspaces')
        for (const observable of [sessions?.list, workspaces?.list]) {
          if (observable && typeof observable.subscribe === 'function') {
            // The tree derives everything from this snapshot, so a session
            // appearing, renaming, being deleted, or changing directory
            // repaints it.
            this.disposers.push(observable.subscribe(() => this.repaint()))
          }
        }
        if (typeof this.ctx.on === 'function') {
          this.disposers.push(this.ctx.on('connection/reset', () => void this.reloadState()))
        }
        await this.reloadState()
        await this.refreshNative()
      }

      async refreshNative(repair = false) {
        if (this.nativeLoading || this.disposed) return
        this.nativeLoading = true
        try { const nativeStatus = repair ? await apiPost(API.nativeSync, { repair: true }) : await apiGet(API.nativeStatus); if (!this.disposed) this.patch({ nativeStatus }) }
        catch (error) { if (!this.disposed) this.patch({ nativeStatus: { ready: false, exceptions: [{ message: error.message }] } }) }
        finally { this.nativeLoading = false }
      }

      /** Release every subscription. */
      dispose() {
        for (const dispose of this.disposers.splice(0)) {
          try {
            dispose()
          } catch {
            /* a disposed subscription is already gone */
          }
        }
        this.disposed = true
        if (this.expansionTimer !== null) clearTimeout(this.expansionTimer)
        if (this.noticeTimer !== null) clearTimeout(this.noticeTimer)
        if (this.hoverTimer !== null) clearTimeout(this.hoverTimer)
      }

      /** Wake subscribers without changing state (the Session store is the source). */
      repaint() {
        this.store.patch({})
      }

      /** Load the host configuration and root statuses. */
      async reloadState() {
        try {
          const state = await apiGet(API.state)
          const expanded = { ...this.store.getSnapshot().expanded }
          if (!this.expansionInitialized) {
            for (const key of state.expandedDirectories ?? []) expanded[key] = true
            this.expansionInitialized = true
          }
          // A build that filed directory-less Sessions under `group:untracked`
          // may have persisted that key; the anchor tree has no such node.
          if (expanded['group:untracked'] !== undefined) {
            delete expanded['group:untracked']
            this.scheduleExpansionPersist()
          }
          this.patch({ phase: 'ready', error: null, ...this.adopted(state, expanded) })
        } catch (error) {
          this.patch({ phase: 'error', error: error instanceof Error ? error.message : String(error) })
        }
      }

      /** Derive the root/preference share of a state payload. */
      adopted(state, expanded) {
        return {
          roots: state?.roots ?? [],
          directoryAliases: state?.directoryAliases ?? {},
          configProblem: state?.configProblem ?? null,
          configReadOnly: state?.configReadOnly === true,
          prefs: { showHiddenEntries: state?.prefs?.showHiddenEntries === true },
          expanded,
          ...visibilityLists(state),
          showArchived: false,
          nativeStatus: this.store?.getSnapshot?.()?.nativeStatus ?? null,
        }
      }

      /** Switch the visible tab. */
      setTab(tab) {
        if (this.store.getSnapshot().selectionBusy) return
        this.patch({ tab, menu: null, settingsOpen: false, selectionMode: null, selectedPaths: [] })
      }

      exitSelection() {
        if (!this.store.getSnapshot().selectionBusy) this.patch({ selectionMode: null, selectedPaths: [] })
      }

      /**
       * The hideable children of one directory.
       *
       * Read from that directory's own level rather than from whatever happens to
       * be expanded, and fetched on demand: a folder the user never opened — in a
       * workspace imported a minute ago, say — must still yield every child, or
       * selecting it would silently cover less than it appears to. Paginates to
       * the end for the same reason: a first page alone would drop the rest.
       * @param path - the directory's absolute path.
       * @param scope - the active selection scope.
       * @returns the folded child paths the scope may hide.
       */
      async childrenOf(path, scope) {
        const state = this.store.getSnapshot()
        const root = rootForPath(state.roots, path)
        if (root === undefined) return []
        const key = levelKey(root, path)
        if (this.store.getSnapshot().levels[key]?.phase !== 'ready') await this.loadLevel(root, path)
        let level = this.store.getSnapshot().levels[key]
        for (let page = 0; page < 40 && level?.phase === 'ready' && level.nextCursor; page += 1) {
          await this.loadLevel(root, path, true)
          level = this.store.getSnapshot().levels[key]
        }
        return level?.phase === 'ready' ? selectionChildren(level.entries, scope) : []
      }

      /**
       * Materialise a selected ancestor into explicit siblings so one descendant
       * can stay unselected.
       *
       * Only immediate children would not be enough: a selected `A` still covers
       * `A/B/C` through `A/B`, so the walk descends one level at a time and
       * selects every sibling on the way down, never the branch that leads to the
       * target. That is what lets a grandchild be switched off inside a select-all.
       * @param ancestor - the selected path that covers the target.
       * @param target - the folded path that must end up unselected.
       * @param scope - the active selection scope.
       * @returns the sibling paths to select in the ancestor's place.
       */
      async expandAncestor(ancestor, target, scope) {
        const out = []
        let current = foldPath(ancestor)
        for (let depth = 0; depth < 24 && current !== target; depth += 1) {
          const children = await this.childrenOf(current, scope)
          const branch = children.find(child => pathContains(child, target))
          if (branch === undefined) { out.push(...children); break }
          for (const child of children) if (child !== branch) out.push(child)
          current = branch
        }
        return out
      }

      /**
       * Classify one circle click as a plain click or the second half of a double
       * click.
       *
       * A browser fires a normal click first even for a double click, so the
       * second click is the one that can refine the action — and only when the
       * folder was already selected before the pair started, which keeps a double
       * click on an unselected folder behaving like any other double-toggled
       * checkbox instead of quietly becoming an empty folder.
       * @param path - the clicked row's absolute path.
       * @returns true when this click is the second half of a double click on a
       *   folder that was already selected.
       */
      circleClick(path) {
        const key = foldPath(path)
        const now = Date.now()
        const selectedNow = selectionCoverage(this.store.getSnapshot().selectedPaths, path) !== 'none'
        const previous = this.circleClickState
        const isDouble = previous !== undefined && previous.key === key && now - previous.at <= DOUBLE_CLICK_MS && previous.selected === true
        this.circleClickState = { key, at: now, selected: selectedNow }
        return isDouble
      }

      /**
       * Apply one circle click to the selection.
       *
       * - click an unselected folder → it becomes selected, so its whole subtree
       *   reads as selected;
       * - click anything already selected, or covered by a selected ancestor →
       *   that path and its whole subtree stop being selected, and the covering
       *   ancestor expands into explicit siblings so the rest of it stays hidden;
       * - double click an already selected folder → the folder itself stops being
       *   selected while every child becomes selected, which submits as an empty
       *   folder: the folder survives, everything inside it is hidden.
       *
       * @param path - the clicked path.
       * @param type - the entry type.
       * @param doubleClick - true for the second half of a double click.
       */
      async selectPath(path, type, doubleClick = false) {
        const state = this.store.getSnapshot()
        const scope = state.selectionMode
        if (state.selectionBusy || this.selectionPending || !canSelectPath(state.roots, path, type, scope)) return
        const key = foldPath(path)
        const selected = state.selectedPaths
        const covering = selected.filter(item => item !== key && pathContains(item, key)).sort((a, b) => b.length - a.length)[0]
        const covered = selected.includes(key) || covering !== undefined
        this.selectionPending = true
        try {
          let base = selected
          if (covering !== undefined) base = [...withoutSubtree(selected, [covering]), ...(await this.expandAncestor(covering, key, scope))]
          if (doubleClick && type === 'directory') {
            this.patch({ selectedPaths: [...withoutSubtree(base, [key]), ...(await this.childrenOf(key, scope))] })
          } else if (covered) {
            this.patch({ selectedPaths: withoutSubtree(base, [key]) })
          } else if (type === 'directory') {
            this.patch({ selectedPaths: [...withoutSubtree(base, [key]), key] })
          } else {
            this.patch({ selectedPaths: toggleSelectedPath(base, path) })
          }
        } finally {
          this.selectionPending = false
        }
      }

      async toggleSelection() {
        const state = this.store.getSnapshot()
        if (state.selectionBusy || state.phase !== 'ready' || state.configReadOnly) return
        if (!state.selectionMode) {
          this.closeHover()
          const hidden = state.tab === 'resources' ? state.resourceHiddenEntries : state.conversationHiddenDirectories
          this.patch({ selectionMode: state.tab, selectedPaths: hidden.map(foldPath), settingsOpen: false, menu: null })
          return
        }
        const paths = selectedVisibilityPaths(state.selectedPaths)
        // The host refuses a longer list than this in one request, so say so here
        // instead of letting the submission fail as a transport error.
        if (paths.length > MAX_SELECTION) {
          this.notify('error', this.text.tooManySelected.replace('{n}', String(paths.length)))
          return
        }
        const field = state.selectionMode === 'resources' ? 'resourceHiddenEntries' : 'conversationHiddenDirectories'
        const existing = state[field]
        const additions = paths.filter(path => !existing.some(old => foldPath(old) === foldPath(path)))
        const removals = existing.filter(path => !paths.some(next => foldPath(next) === foldPath(path)))
        this.patch({ selectionBusy: true })
        try {
          // Adopt every successful write so a failed second request can be retried
          // against the actual persisted state, without losing the selection draft.
          for (const [targets, hidden] of [[additions, true], [removals, false]]) {
            if (!targets.length) continue
            const result = await apiPost(API.hidden, { scope: state.selectionMode, paths: targets, hidden })
            this.patch(this.adopted(result, this.store.getSnapshot().expanded))
          }
          this.patch({ selectionMode: null, selectedPaths: [] })
        } catch (error) { this.notify('error', error.message) }
        finally { this.patch({ selectionBusy: false }) }
      }

      async copyPath(path) {
        try {
          await navigator.clipboard.writeText(path)
          this.notify('info', this.text.copiedPath)
        } catch {
          this.notify('error', this.text.copyFailed + path)
        }
      }

      /** Toggle the settings popover. */
      toggleSettings() {
        const open = this.store.getSnapshot().settingsOpen
        this.patch({ settingsOpen: !open, menu: null })
      }

      /** Close the settings popover. */
      closeSettings() {
        this.patch({ settingsOpen: false })
      }

      /**
       * Open the floating menu at the pointer, clamped inside the panel so it
       * is never clipped by the sidebar's own overflow.
       * @param event - the click or context-menu event that opened it.
       * @param items - the menu rows, as `Menu` renders them.
       */
      openMenu(event, items) {
        this.closeHover()
        this.menuFocus = event?.currentTarget?.focus ? event.currentTarget : null
        const rect = event.currentTarget?.getBoundingClientRect?.()
        const keyboard = !event.clientX && !event.clientY
        const x = keyboard ? rect?.left ?? 8 : event.clientX
        const y = keyboard ? rect?.bottom ?? 8 : event.clientY
        this.patch({ menu: { x, y, items }, settingsOpen: false })
      }

      /** Close the floating menu. */
      closeMenu() {
        if (this.store.getSnapshot().menu === null) return
        this.patch({ menu: null })
        try { this.menuFocus?.focus?.() } catch {}
        this.menuFocus = null
      }

      /**
       * Show one Session's status card after the row has been hovered briefly.
       * @param session - the Session to describe.
       * @param event - the enter event, used for the row's position.
       */
      openHover(session, event) {
        if (this.hoverTimer !== null) clearTimeout(this.hoverTimer)
        const x = event.clientX + 3
        const y = event.clientY - 3
        this.hoverTimer = setTimeout(() => {
          this.hoverTimer = null
          if (this.store.getSnapshot().menu !== null) return
          if (!this.disposed) this.patch({ hover: { session, x, y } })
        }, 320)
      }

      /** Hide the status card immediately. */
      closeHover() {
        if (this.hoverTimer !== null) {
          clearTimeout(this.hoverTimer)
          this.hoverTimer = null
        }
        if (this.store.getSnapshot().hover !== null) this.patch({ hover: null })
      }

      /** Show a transient message. */
      notify(kind, text) {
        if (this.noticeTimer !== null) clearTimeout(this.noticeTimer)
        this.patch({ notice: { kind, text } })
        this.noticeTimer = setTimeout(() => {
          this.noticeTimer = null
          this.patch({ notice: null })
        }, 6000)
      }

      /** Dismiss the transient message. */
      dismissNotice() {
        if (this.noticeTimer !== null) clearTimeout(this.noticeTimer)
        this.noticeTimer = null
        this.patch({ notice: null })
      }

      /** Open one modal, or close the open one with `null`. */
      openModal(modal) {
        this.patch({ modal, menu: null, settingsOpen: false, hover: null })
      }

      /** Close the open modal. */
      closeModal() {
        this.patch({ modal: null })
      }

      /** Update the modal's edited value. */
      setModalValue(value) {
        const modal = this.store.getSnapshot().modal
        if (modal === null) return
        this.patch({ modal: { ...modal, value } })
      }

      /**
       * Add a root directory. The directory is chosen through the harness's own
       * picker, so the plugin never guesses a path.
       */
      async addRoot() {
        const uiWorkspace = this.service('uiWorkspace')
        let path = null
        try {
          path = await uiWorkspace?.pickDirectory?.()
          if (path === null || path === undefined) {
            const remote = this.service('remote')
            const result = await remote?.directoryPicker?.pick?.()
            path = result?.ok === true ? result.value : null
          }
        } catch (error) {
          this.notify('error', error instanceof Error ? error.message : String(error))
          return
        }
        if (typeof path !== 'string' || path.trim() === '') return
        try {
          const body = { path }
          let state = await apiPost(API.addRoot, body)
          for (let count = 0; count < 2 && ['merge-required', 'restore-required'].includes(state.action); count++) {
            const merge = state.action === 'merge-required'
            if (!window.confirm(merge ? this.text.mergePrompt : this.text.restorePrompt)) return
            body[merge ? 'merge' : 'restore'] = true
            state = await apiPost(API.addRoot, body)
          }
          if (['merge-required', 'restore-required'].includes(state.action)) throw new Error(this.text.loadFailed)
          this.invalidateLevels()
          this.patch({ phase: 'ready', error: null, ...this.adopted(state, this.store.getSnapshot().expanded) })
          this.expansionInitialized = true
          await this.revealDirectory(state.ownerRootId, state.targetPath)
        } catch (error) {
          this.notify('error', error instanceof Error ? error.message : String(error))
        }
      }

      async revealDirectory(rootId, target) {
        const root = this.store.getSnapshot().roots.find(item => item.id === rootId)
        if (!root || !target) return
        const segments = pathSegmentsAfter(root.path, target)
        if (!segments) return
        let path = normalizePath(root.path)
        for (const segment of [...segments, null]) {
          this.setExpanded(`conv:${foldPath(path)}`, true)
          this.setExpanded(`res:${foldPath(path)}`, true)
          await this.loadLevel(root, path)
          if (segment !== null) {
            while (this.store.getSnapshot().levels[levelKey(root, path)]?.nextCursor && !this.store.getSnapshot().levels[levelKey(root, path)]?.entries?.some(entry => foldPath(entry.path) === foldPath(`${path}/${segment}`))) await this.loadLevel(root, path, true)
            path = `${path.replace(/\/$/, '')}/${segment}`
          }
        }
        this.patch({ revealPath: foldPath(target) })
      }

      /** Commit a renamed root label. */
      async commitRenameRoot(rootId, label) {
        try {
          const state = await apiPost(API.updateRoot, { id: rootId, label })
          this.patch(this.adopted(state, this.store.getSnapshot().expanded))
        } catch (error) {
          this.notify('error', error instanceof Error ? error.message : String(error))
        }
        this.closeModal()
      }

      /** Remove a root registration. */
      async commitRemoveRoot(rootId) {
        try {
          const state = await apiPost(API.removeRoot, { id: rootId })
          const known = new Set((state.roots ?? []).map((root) => `root:${root.id}`))
          const expanded = { ...this.store.getSnapshot().expanded }
          for (const key of Object.keys(expanded)) {
            if (key.startsWith('root:') && !known.has(key)) delete expanded[key]
          }
          this.patch({ levels: {}, ...this.adopted(state, expanded) })
        } catch (error) {
          this.notify('error', error instanceof Error ? error.message : String(error))
        }
        this.closeModal()
      }

      /** Clear every plugin-owned setting. */
      async commitResetConfig() {
        try {
          const state = await apiPost(API.reset, {})
          this.expansionInitialized = true
          this.patch({ levels: {}, ...this.adopted(state, {}) })
        } catch (error) {
          this.notify('error', error instanceof Error ? error.message : String(error))
        }
        this.closeModal()
      }

      /** Toggle the "show hidden entries" preference. */
      async setShowHidden(showHiddenEntries) {
        try {
          const state = await apiPost(API.prefs, { showHiddenEntries })
          // Every loaded level was filtered under the previous preference.
          this.invalidateLevels()
          this.patch(this.adopted(state, this.store.getSnapshot().expanded))
        } catch (error) {
          this.notify('error', error instanceof Error ? error.message : String(error))
        }
      }

      /**
       * Remove one directory from the conversation tree's display, or put it
       * back. Display only: no directory, file, or Session is touched.
       * @param path - the directory's absolute path.
       * @param hidden - true to remove it from the tree, false to restore it.
       */
      async setDirectoryHidden(path, hidden, scope = 'conversations') {
        try {
          const state = await apiPost(API.hidden, { scope, path, hidden })
          this.patch(this.adopted(state, this.store.getSnapshot().expanded))
        } catch (error) {
          this.notify('error', error instanceof Error ? error.message : String(error))
        }
        this.closeModal()
      }

      /** Re-check every root's status without touching the tree. */
      async recheck() {
        await this.reloadState()
      }

      /** Drop every cached directory level and reload the root statuses. */
      async refreshAll() {
        this.invalidateLevels()
        await this.reloadState()
        await this.refreshNative()
      }

      /** Record one expansion key locally and schedule a debounced persist. */
      setExpanded(key, value) {
        const expanded = { ...this.store.getSnapshot().expanded }
        if (value) expanded[key] = true
        else delete expanded[key]
        this.patch({ expanded })
        this.scheduleExpansionPersist()
      }

      /** Whether one node key is expanded. */
      isExpanded(key) {
        return this.store.getSnapshot().expanded[key] === true
      }

      /** Persist the expansion set, coalescing rapid toggles. */
      scheduleExpansionPersist() {
        if (this.expansionTimer !== null) clearTimeout(this.expansionTimer)
        this.expansionTimer = setTimeout(() => {
          this.expansionTimer = null
          const keys = Object.keys(this.store.getSnapshot().expanded)
          apiPost(API.prefs, { expandedDirectories: keys }).catch((error) => { if (!this.disposed) this.notify('error', error.message) })
        }, 500)
      }

      /**
       * Toggle one resource directory, loading its level on first expansion.
       * @param root - the owning registered root.
       * @param directoryPath - the absolute directory path, or the root's path.
       */
      async toggleResourceDirectory(root, directoryPath) {
        const key = `res:${foldPath(directoryPath)}`
        if (this.isExpanded(key)) {
          this.setExpanded(key, false)
          return
        }
        this.setExpanded(key, true)
        // The cache is keyed by root and folded path, not by the bare path, so
        // looking the level up under `directoryPath` never matched and every
        // expansion reloaded a level that was already ready.
        if (this.store.getSnapshot().levels[levelKey(root, directoryPath)]?.phase === 'ready') return
        await this.loadLevel(root, directoryPath)
      }

      /**
       * Load one directory level into the cache.
       * @param root - the owning registered root.
       * @param directoryPath - the absolute directory path.
       */
      async loadLevel(root, directoryPath, more = false) {
        if (!root || this.disposed) return
        const key = levelKey(root, directoryPath), generation = this.generation
        if (this.requests.has(key)) return this.requests.get(key)
        const before = this.store.getSnapshot().levels[key]
        const cursor = more ? before?.nextCursor : null
        const run = async () => {
          while (this.activeLoads >= 4) await sleep(20)
          if (generation !== this.generation || this.disposed) return
          this.activeLoads++
          this.patch({ levels: { ...this.store.getSnapshot().levels, [key]: { ...before, phase: 'loading', entries: before?.entries ?? [] } } })
          try {
            const query = new URLSearchParams({ rootId: root.id, path: directoryPath })
            if (cursor) query.set('cursor', cursor)
            const value = await apiGet(`${API.list}?${query}`)
            if (generation !== this.generation || this.disposed) return
            const entries = new Map((cursor ? before?.entries ?? [] : []).map(entry => [foldPath(entry.path), entry]))
            for (const entry of value.entries ?? []) entries.set(foldPath(entry.path), entry)
            this.patch({ levels: { ...this.store.getSnapshot().levels, [key]: { phase: 'ready', entries: [...entries.values()], nextCursor: value.nextCursor, revision: value.revision, truncated: value.truncated, error: null } } })
          } catch (error) {
            if (generation !== this.generation || this.disposed) return
            this.patch({ levels: { ...this.store.getSnapshot().levels, [key]: { phase: 'error', entries: error.code === 'stale-cursor' ? [] : before?.entries ?? [], error: error.message, code: error.code } } })
          } finally { this.activeLoads-- }
        }
        const pending = run().finally(() => { if (this.requests.get(key) === pending) this.requests.delete(key) })
        this.requests.set(key, pending)
        return pending
      }

      invalidateLevels() {
        this.generation++
        this.requests.clear()
        this.patch({ levels: {} })
      }

      /** Reload one directory level in place. */
      async reloadLevel(root, directoryPath) {
        await this.loadLevel(root, directoryPath)
      }

      /** The Session id that authorizes a resource read: the visible Session first, else the newest. */
      currentSessionId() {
        const snapshot = this.service('sessions')?.list?.getSnapshot?.()
        const byId = snapshot?.byId ?? {}
        for (const row of Object.values(byId)) {
          if ((row?.retainedBy?.mainView ?? 0) > 0) return row.id
        }
        const ids = Array.isArray(snapshot?.ids) ? snapshot.ids : []
        return ids.length > 0 ? ids[0] : undefined
      }

      /** The working directory recorded for one Session. */
      cwdOf(sessionId) {
        const snapshot = this.service('sessions')?.list?.getSnapshot?.()
        return snapshot?.byId?.[sessionId]?.cwd
      }

      /**
       * The `@…` reference text for one row, resolved against the Session the
       * composer would resolve it in — the visible one, or the newest when the
       * view shows none.
       */
      referenceForRow(path, type) {
        return referenceFor(path, type, this.cwdOf(this.currentSessionId()))
      }

      /**
       * Whether one Session's goal is still being worked through, asked of the
       * same Session binding the shipped goal UI reads.
       */
      sessionGoalActive(sessionId) {
        return goalIsActive(this.service('sessions')?.binding?.(sessionId)?.session)
      }

      /**
       * Whether a subagent is still working for one Session.
       *
       * Two facts make this the only correct source. Subagent sessions are
       * catalogued in their *parent's* projection rather than listed as ordinary
       * rows, and the client deliberately clears `running` on a catalogued child
       * row — a row that exists only once the delegated session has durable
       * history is not an activity signal. The live per-Session status map is,
       * and it is the same one the shipped subagent UI reads.
       * @param sessionId - the parent Session.
       * @returns true while any catalogued child reports running.
       */
      subagentWorking(sessionId) {
        const snapshot = this.service('sessions')?.list?.getSnapshot?.()
        const entries = snapshot?.projectionsBySession?.[sessionId]?.values?.subagentCatalog
        if (!Array.isArray(entries)) return false
        const statuses = this.service('uiSession')?.sessionStatus?.getSnapshot?.()
        if (statuses === undefined || typeof statuses.get !== 'function') return false
        return entries.some(entry => typeof entry?.id === 'string' && statuses.get(entry.id)?.running === true)
      }

      /**
       * The Session ids that are busy for a reason their list row cannot carry:
       * a goal whose next turn has not started yet, or a subagent still working
       * under them. Both are real work that `running` alone reports as idle.
       * @param snapshot - the Client Session list snapshot.
       * @returns the ids that stay busy.
       */
      busySessionIds(snapshot) {
        const ids = Array.isArray(snapshot?.ids) ? snapshot.ids : []
        const out = new Set()
        for (const id of ids) if (this.sessionGoalActive(id) || this.subagentWorking(id)) out.add(id)
        return out
      }

      /**
       * Preview one file in the native right Sidebar. The main column is never
       * touched: `openResource` only expands and updates the right column.
       * @param absolutePath - the file's absolute path.
       */
      openFile(absolutePath) {
        const sidebarRight = this.service('sidebarRight')
        if (sidebarRight === undefined || typeof sidebarRight.openResource !== 'function') {
          this.patch({ previewIssue: this.text.noRightbar })
          return
        }
        const sessionId = this.currentSessionId()
        if (sessionId === undefined) {
          this.patch({ previewIssue: this.text.noSessionForPreview })
          return
        }
        try {
          sidebarRight.openResource(fileAddressFor(sessionId, this.cwdOf(sessionId), absolutePath))
          this.patch({ previewIssue: null, menu: null })
        } catch (error) {
          console.error('[workspace-explorer] preview failed:', error)
          this.patch({ previewIssue: this.text.previewFailed })
        }
      }

      /**
       * Hand one path to the desktop file manager.
       *
       * Two Host mechanisms are tried in order, because they fail differently:
       * the open-in-app route (what the shipped sidebar uses; it resolves the
       * file manager, verifies the directory, and reports a real failure code),
       * then the Session Remote's native opener. A reveal falls back to opening
       * the containing folder, so the gesture always lands somewhere useful.
       * Whatever the outcome, the reason is shown rather than swallowed.
       * @param path - the absolute path.
       * @param reveal - select the item inside its folder instead of opening it.
       */
      async openInFileManager(path, reveal) {
        const native = displayPath(path)
        const app = folderAppId()
        const attempts =
          reveal === true
            ? [
                () => this.#openViaSession(native, true),
                () => postOpenInApp(app, displayPath(parentDirectory(path))),
              ]
            : [
                () => postOpenInApp(app, native),
                () => this.#openViaSession(native, false),
              ]
        let failure
        for (const attempt of attempts) {
          try {
            await attempt()
            this.patch({ menu: null })
            return
          } catch (error) {
            failure ??= error
          }
        }
        const detail = failure === undefined ? '' : ` ${failure.code ?? ''} ${failure.message ?? ''}`.trim()
        this.notify('error', detail === '' ? this.text.openFailed : `${this.text.openFailed}（${detail}）`)
        this.patch({ menu: null })
      }

      /**
       * Open or reveal one path through the Session Remote's native opener.
       * @param nativePath - the path in native spelling.
       * @param reveal - reveal instead of open.
       */
      async #openViaSession(nativePath, reveal) {
        const remote = this.service('remote')
        if (typeof remote?.session?.openWorkspacePath !== 'function') {
          throw new ExplorerApiError('no-session-remote', 'the Session Remote is unavailable')
        }
        const result = await remote.session.openWorkspacePath(reveal ? { path: nativePath, action: 'reveal' } : { path: nativePath })
        if (result?.ok !== true) {
          throw new ExplorerApiError(result?.error?.code ?? 'open-failed', result?.error?.message ?? 'the native opener refused')
        }
        return true
      }

      /** Select one Session in the main column. */
      openSession(sessionId) {
        this.navigationGeneration += 1
        const uiWorkspace = this.service('uiWorkspace')
        if (uiWorkspace === undefined || typeof uiWorkspace.openSession !== 'function') return false
        try {
          uiWorkspace.openSession(sessionId)
          this.patch({ menu: null, hover: null })
          return true
        } catch (error) {
          this.notify('error', error instanceof Error ? error.message : String(error))
          return false
        }
      }

      /**
       * Start a conversation in one directory and name it, in one gesture.
       *
       * Creation goes through the plugin's own Host route with an explicit `cwd`
       * and the title to apply. The Host half owns the naming: it drives the
       * official `sessionController.rename`, records the receipt in a durable
       * ledger, and retries from that ledger. The client therefore does not rename
       * again — a second renamer would race the first for the same title
       * projection — it checks the reported outcome instead, so a conversation
       * that came back unnamed is reported rather than opened as a folder-named
       * row.
       * @param directory - the absolute directory the conversation belongs to.
       */
      async createSession(directory) {
        const key = foldPath(directory)
        if (this.createLocks.has(key) || this.disposed) return
        const navigation = ++this.navigationGeneration
        this.createLocks.add(key)
        this.closeMenu(); this.closeHover()
        try {
          let intent = this.operations[key]
          if (!intent) {
            intent = { path: directory, operationId: 'operation_' + crypto.randomUUID().replaceAll('-', '_'), title: this.text.newConversation }
            this.operations[key] = intent
            // Refuse ambiguous creation when the browser cannot retain its retry key.
            sessionStorage.setItem('dwx:operations', JSON.stringify(this.operations))
          }
          this.patch({ creation: { path: directory, pending: true } })
          const value = await apiPost(API.createSession, intent)
          if (this.disposed) return
          this.patch({ creation: { ...value, path: directory, pending: false } })
          await this.refreshNative()
          if (!value.ok || !value.durable || !value.membership || !value.named || !value.sessionId) {
            this.notify('error', this.text.creationPartial + (value.error ? ' — ' + value.error.message : ''))
            return
          }
          await this.waitForSession(value.sessionId)
          if (this.disposed) return
          if (navigation === this.navigationGeneration && !this.openSession(value.sessionId)) throw new Error(this.text.noSessionApi)
          delete this.operations[key]
          sessionStorage.setItem('dwx:operations', JSON.stringify(this.operations))
          this.patch({ creation: null })
        } catch (error) {
          if (!this.disposed) { this.patch({ creation: { ...this.store.getSnapshot().creation, path: directory, pending: false } }); this.notify('error', this.text.creationPartial + ' — ' + error.message) }
        } finally { this.createLocks.delete(key) }
      }

      /** Wait until DSH's live Session projection contains the new id. */
      async waitForSession(sessionId, timeoutMs = 5000) {
        const started = Date.now()
        while (!this.disposed && Date.now() - started <= timeoutMs) {
          if (sessionFromSnapshot(this.service('sessions')?.list?.getSnapshot?.(), sessionId) !== null) return
          await sleep(100)
        }
        throw new ExplorerApiError('session-sync-timeout', `session ${sessionId} did not reach the client projection`)
      }

      /**
       * Rename one Session through the client Session reference the shipped
       * workspace browser uses.
       */
      async commitRenameSession(sessionId, title) {
        const sessions = this.service('sessions')
        try {
          const result = await sessions.using(sessionId, { source: 'workspaceOperation' }, (reference) =>
            reference.binding.session.rename(title),
          )
          if (result?.ok !== true) throw new Error(result?.error?.message ?? 'rename failed')
          // The new title reaches the sidebar as a projection; ask for it now so
          // the row does not keep showing the old name.
          await sessions.refreshProjections(sessionId).catch(() => {})
        } catch (error) {
          this.notify('error', error instanceof Error ? error.message : String(error))
        }
        this.closeModal()
      }

      /**
       * Restore an archived Session, the counterpart of the native workspace
       * list hiding it.
       * @param sessionId - the Session to unarchive.
       */
      async archiveSession(sessionId, options = {}) {
        const sessions = this.service('sessions'); const byId = sessions?.list?.getSnapshot?.()?.byId ?? {}; const row = byId[sessionId]
        if (sessionBusyIndex(byId)(sessionId) && options.stopActivity !== true) { this.notify('error', 'Running conversations require confirmation before archive'); return }
        try {
          const ui = this.service('uiWorkspace')
          const workspaces = this.service('workspaces')
          if (typeof ui?.archiveSession === 'function') await ui.archiveSession.call(ui, sessionId, options)
          else if (typeof workspaces?.archiveSession === 'function') await workspaces.archiveSession.call(workspaces, sessionId, options)
          else throw new Error('当前 DSH 没有归档接口')
        } catch (error) { this.notify('error', error instanceof Error ? error.message : String(error)) }
        this.patch({ menu: null })
      }

      async unarchiveSession(sessionId) {
        try {
          const ui = this.service('uiWorkspace')
          const workspaces = this.service('workspaces')
          if (typeof ui?.unarchiveSession === 'function') await ui.unarchiveSession.call(ui, sessionId)
          else if (typeof workspaces?.unarchiveSession === 'function') await workspaces.unarchiveSession.call(workspaces, sessionId)
          else throw new Error('当前 DSH 没有取消归档接口')
        } catch (error) { this.notify('error', error instanceof Error ? error.message : String(error)) }
        this.patch({ menu: null })
      }

      /**
       * Permanently delete one Session's persisted log through the plugin's own
       * host route. This is real deletion, not archive: DSH exposes no
       * session-deletion API, so the route removes the Session's own artifact
       * under the persistence root. Nothing else is touched.
       * @param sessionId - the Session to delete.
       */
      async commitDeleteSession(sessionId) {
        const snapshot = this.service('sessions')?.list?.getSnapshot?.()
        const row = snapshot?.byId?.[sessionId]
        if (sessionBusyIndex(snapshot?.byId ?? {})(sessionId)) {
          this.notify('error', this.text.sessionDeleteRunning)
          this.closeModal()
          return
        }
        try {
          await apiPost(API.deleteSession, { sessionId })
          // The client's Session list is a live projection; a deleted cold
          // Session leaves it only when the projection is rebuilt. Hiding it
          // locally makes the tree honest immediately.
          this.patch({ hiddenSessions: { ...this.store.getSnapshot().hiddenSessions, [sessionId]: true } })
          this.notify('info', this.text.sessionDelete)
        } catch (error) {
          if (error?.code === 'session-running') this.notify('error', this.text.sessionDeleteRunning)
          else if (error?.code === 'session-in-use') this.notify('error', this.text.sessionDeleteLive)
          else if (error?.code === 'http-401' || error?.code === 'http-404') this.notify('error', this.text.hostRestartNeeded)
          else this.notify('error', error instanceof Error ? error.message : String(error))
        }
        this.closeModal()
      }
    }

    // #endregion

    // #region styles

    /** One stylesheet for the panel, injected once per page. */
    const CSS = `
.dwx-root{display:flex;flex-direction:column;height:100%;min-height:0;color:var(--dsw-alias-label-primary)}
.dwx-sectionWrap{position:relative;flex:none}
.dwx-section{box-sizing:border-box;display:flex;align-items:center;gap:4px;height:36px;padding-left:4px;margin-bottom:4px;color:var(--dsw-alias-label-tertiary);overflow:hidden}
.dwx-sectionLabel{white-space:nowrap;min-width:0;max-width:45%;flex:none;line-height:20px;overflow:hidden;text-overflow:ellipsis}
.dwx-sectionActions{display:flex;align-items:center;gap:2px;margin-left:auto;flex:none}
.dwx-head{flex:none;display:flex;align-items:center;gap:4px;padding:0 8px 4px}
.dwx-tabs{display:flex;align-items:center;gap:2px;flex:1 1 auto;min-width:0}
.dwx-tab{border:0;background:transparent;color:var(--dsw-alias-label-secondary);border-radius:var(--dsw-radius-md,6px);padding:3px 8px;font:inherit;cursor:pointer}
.dwx-tab:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dwx-tab[data-active="true"]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dwx-iconbtn{border:0;background:transparent;color:var(--dsw-alias-label-secondary);width:24px;height:24px;flex:none;display:inline-flex;align-items:center;justify-content:center;border-radius:var(--dsw-radius-sm,4px);cursor:pointer;padding:0}
.dwx-iconbtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dwx-body{flex:1 1 auto;min-height:0;overflow:auto;scrollbar-gutter:stable;padding:0 6px 10px}
.dwx-row{display:flex;align-items:center;gap:6px;box-sizing:border-box;width:100%;border-radius:var(--dsw-radius-md,6px);padding:4px 6px;cursor:pointer;outline-offset:-2px}
.dwx-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dwx-row[data-selectable="false"]{cursor:default;color:var(--dsw-alias-label-secondary)}
.dwx-row[data-selectable="false"]:hover{background:transparent}
.dwx-row[data-active="true"]{background:var(--dsw-alias-interactive-bg-hover)}
.dwx-twirl{flex:none;width:14px;height:14px;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary)}
.dwx-twirl[data-open="false"] svg{transform:rotate(-90deg)}
.dwx-glyph{flex:none;width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary)}
.dwx-glyph[data-state="working"]{color:var(--dsw-alias-state-success-primary)}
.dwx-label{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dwx-sub{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:.92em}
.dwx-actions{flex:none;display:inline-flex;align-items:center;gap:2px;opacity:.65}
.dwx-row:focus-within .dwx-actions,.dwx-row:hover .dwx-actions{opacity:1}
.dwx-ctxmenu,.dwx-hovercard{inset:auto;margin:0;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:auto}
.dwx-ctxmenu:not(:popover-open),.dwx-hovercard:not(:popover-open){display:none}
.dwx-row[data-revealed="true"]{outline:2px solid var(--dsw-alias-border-l2);outline-offset:-2px}
.dwx-row:hover .dwx-actions,.dwx-row:focus-within .dwx-actions,.dwx-row[data-menu="true"] .dwx-actions{display:inline-flex}
.dwx-note{color:var(--dsw-alias-label-secondary);font-size:.92em;margin:2px 0;padding:2px 6px}
.dwx-status{display:flex;flex-direction:column;gap:2px;padding:4px 6px}
.dwx-statusline{color:var(--dsw-alias-label-secondary);font-size:.92em;margin:0;word-break:break-all}
.dwx-link{border:0;background:transparent;color:var(--dsw-alias-brand-primary);font:inherit;cursor:pointer;padding:0;text-decoration:underline;align-self:flex-start}
.dwx-add{display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;text-align:left;border-radius:var(--dsw-radius-md,6px);padding:4px 6px;cursor:pointer;margin-top:2px}
.dwx-add:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dwx-rootrow{margin-top:6px}
.dwx-rootrow:first-child{margin-top:0}
.dwx-ctxmenu{position:fixed;inset:auto;z-index:9999;display:flex;flex-direction:column;gap:1px;width:214px;background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1));border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg,10px);padding:4px;box-shadow:0 6px 24px rgb(0 0 0/.18)}
.dwx-hovercard{position:fixed;z-index:45;width:232px;display:flex;flex-direction:column;gap:4px;background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1));border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg,10px);padding:8px 10px;box-shadow:0 6px 24px rgb(0 0 0/.18);pointer-events:none}
.dwx-hovercard h5{margin:0;font-size:1em;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dwx-hoverrow{display:flex;gap:6px;font-size:.92em;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.dwx-hoverrow b{flex:none;font-weight:400;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
.dwx-hoverrow span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary)}
.dwx-state{display:inline-flex;align-items:center;gap:5px}
.dwx-state i{width:7px;height:7px;border-radius:50%;background:currentColor;flex:none}
.dwx-state[data-state="working"]{color:var(--dsw-alias-state-success-primary)}
.dwx-state[data-state="idle"]{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
.dwx-menuitem{display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;border-radius:var(--dsw-radius-md,6px);padding:5px 8px;cursor:pointer}
.dwx-menuitem:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dwx-menuitem[data-danger="true"]{color:var(--dsw-alias-state-error-primary)}
.dwx-menusep{height:1px;background:var(--dsw-alias-border-l1);margin:3px 2px}
.dwx-pop{position:absolute;top:100%;right:4px;z-index:40;width:236px;background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1));border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg,10px);padding:10px;box-shadow:0 6px 24px rgb(0 0 0/.18)}
.dwx-pop h4{margin:0 0 8px;font-size:.92em;font-weight:600}
.dwx-check{display:flex;align-items:flex-start;gap:8px;cursor:pointer}
.dwx-check input{margin-top:2px}
.dwx-check span{font-size:.92em;color:var(--dsw-alias-label-secondary)}
.dwx-popnote{margin:8px 0 0;color:var(--dsw-alias-label-secondary);font-size:.85em;line-height:1.5}
.dwx-modalwrap{position:fixed;inset:0;z-index:60;background:rgb(0 0 0/.28);display:flex;align-items:center;justify-content:center;padding:16px}
.dwx-modal{width:100%;max-width:340px;background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1));border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg,10px);padding:14px;box-shadow:0 10px 40px rgb(0 0 0/.28)}
.dwx-modal h3{margin:0 0 8px;font-size:1em;font-weight:600}
.dwx-modal p{margin:0 0 12px;color:var(--dsw-alias-label-secondary);font-size:.92em;line-height:1.6}
.dwx-modal input{box-sizing:border-box;width:100%;background:var(--dsw-alias-bg-layer-2,transparent);color:var(--dsw-alias-label-primary);border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md,6px);padding:6px 8px;font:inherit;margin-bottom:12px}
.dwx-modalrow{display:flex;justify-content:flex-end;gap:8px}
.dwx-btn{border:.5px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);border-radius:var(--dsw-radius-md,6px);padding:5px 12px;font:inherit;cursor:pointer}
.dwx-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dwx-btn[data-primary="true"]{background:var(--dsw-alias-brand-primary);border-color:transparent;color:#fff}
.dwx-btn[data-danger="true"]{background:var(--dsw-alias-state-error-primary);border-color:transparent;color:#fff}
.dwx-btn[disabled]{opacity:.5;cursor:default}
.dwx-notice{margin:0 6px 6px;border-radius:var(--dsw-radius-md,6px);padding:6px 8px;font-size:.92em;display:flex;gap:8px;align-items:flex-start}
.dwx-notice[data-kind="error"]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-state-error-primary)}
.dwx-notice[data-kind="info"]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.dwx-notice button{margin-left:auto;border:0;background:transparent;color:inherit;cursor:pointer;font:inherit;padding:0}
`

    /** Inject the stylesheet once. */
    function ensureStyles() {
      const id = 'dsh-multi-root-explorer/panel.css'
      if (typeof document === 'undefined') return
      if (document.querySelector(`style[data-plugin-css=${JSON.stringify(id)}]`) !== null) return
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-multi-root-explorer'
      tag.dataset.pluginCss = id
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    // #endregion

    // #region primitives

    /** One 16px stroke glyph. */
    function Glyph({ path, size = 16, fill = 'none' }) {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: size,
          height: size,
          fill,
          stroke: fill === 'none' ? 'currentColor' : 'none',
          strokeWidth: '1.3',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        path,
      )
    }

    const PATHS = {
      eye: [h('path', { key: 'outline', d: 'M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8z' }), h('circle', { key: 'pupil', cx: 8, cy: 8, r: 2 })],
      chevron: h('path', { key: 'p', d: 'M4 6.2 8 10l4-3.8' }),
      folder: h('path', { key: 'p', d: 'M1.8 4.2A1.2 1.2 0 0 1 3 3h2.6l1.2 1.4H13a1.2 1.2 0 0 1 1.2 1.2v6.2A1.2 1.2 0 0 1 13 13H3a1.2 1.2 0 0 1-1.2-1.2z' }),
      file: h('path', { key: 'p', d: 'M4 1.8h5.2L12.2 5v9.2H4zM9 2v3.2h3.2' }),
      image: h('path', { key: 'p', d: 'M2 3.4h12v9.2H2zM2 10l3-3 2.6 2.6L10 7l4 4' }),
      code: h('path', { key: 'p', d: 'M6 4.6 2.8 8 6 11.4M10 4.6 13.2 8 10 11.4' }),
      gear: [
        h('path', {
          key: 'body',
          // Eight teeth and the centre bore are all drawn about (8, 8): the tip
          // radius is 6.45 and the bore radius 2.2, so the two circles are
          // concentric instead of the shipped gear sweep, whose silhouette sat
          // 0.8px above its own opening.
          d: 'M8.00 3.05L9.01 1.63L10.93 2.25L10.91 4.00L11.50 4.50L13.22 4.21L14.13 6.01L12.89 7.23L12.95 8.00L14.37 9.01L13.75 10.93L12.00 10.91L11.50 11.50L11.79 13.22L9.99 14.13L8.77 12.89L8.00 12.95L6.99 14.37L5.07 13.75L5.09 12.00L4.50 11.50L2.78 11.79L1.87 9.99L3.11 8.77L3.05 8.00L1.63 6.99L2.25 5.07L4.00 5.09L4.50 4.50L4.21 2.78L6.01 1.87L7.23 3.11Z',
        }),
        h('path', { key: 'bore', d: 'M8 5.8a2.2 2.2 0 1 0 0 4.4a2.2 2.2 0 1 0 0-4.4z' }),
      ],
      more: h('path', { key: 'p', d: 'M3.4 8h.01M8 8h.01M12.6 8h.01' }),
      plus: h('path', { key: 'p', d: 'M8 3.4v9.2M3.4 8h9.2' }),
      refresh: h('path', { key: 'p', d: 'M13 8a5 5 0 1 1-1.6-3.7M13 2.6V5h-2.4' }),
      pencil: h('path', { key: 'p', d: 'M10.6 2.6l2.8 2.8-7.2 7.2-3.2.4.4-3.2z' }),
      trash: h('path', { key: 'p', d: 'M2.6 4.2h10.8M6 4.2V2.6h4v1.6M4 4.2l.7 9.2h6.6l.7-9.2' }),
      external: h('path', { key: 'p', d: 'M9 2.6h4.4V7M13.4 2.6 7.6 8.4M11 9.4v3.4H3.2V4.8h3.4' }),
      dot: h('circle', { key: 'c', cx: 8, cy: 8, r: 3, fill: 'currentColor', stroke: 'none' }),
    }

    /** The glyph for one file name. */
    function fileGlyph(name) {
      const extension = baseName(name).toLowerCase().split('.').pop() ?? ''
      if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'avif'].includes(extension)) return PATHS.image
      if (
        [
          'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'ps1', 'psm1', 'sh', 'bash', 'css', 'scss', 'html', 'htm',
          'json', 'yaml', 'yml', 'toml', 'ini', 'xml', 'sql', 'go', 'rs', 'java', 'c', 'h', 'cpp', 'hpp', 'cs', 'rb', 'php', 'lua', 'vue', 'svelte',
        ].includes(extension)
      ) {
        return PATHS.code
      }
      return PATHS.file
    }

    /** A row's leading disclosure triangle. */
    function Twirl({ open }) {
      return h('span', { className: 'dwx-twirl', 'data-open': open === true ? 'true' : 'false' }, h(Glyph, { path: PATHS.chevron, size: 14 }))
    }

    /**
     * One tree row. The row is a labelled container rather than a `<button>`, so
     * the trailing action can be a real button instead of interactive content
     * nested inside interactive content. A right-click opens the same menu the
     * trailing action does.
     */
    function Row({ depth, selectable = true, active, hasMenu, title, directoryPath, draggable = false, onDragStart, onClick, onContextMenu, onMouseEnter, onMouseLeave, children }) {
      const interactive = selectable === true && typeof onClick === 'function'
      const onKeyDown = interactive
        ? (event) => {
            if (event.target !== event.currentTarget) return
            if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') { event.preventDefault(); onContextMenu?.(event); return }
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onClick()
            } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
              const button = event.currentTarget.querySelector('button')
              if (button) { event.preventDefault(); button.focus() }
            }
          }
        : undefined
      return h(
        'div',
        {
          className: 'dwx-row',
          role: interactive ? 'button' : undefined,
          tabIndex: interactive ? 0 : undefined,
          'data-selectable': selectable === true ? undefined : 'false',
          'data-active': active === true ? 'true' : undefined,
          'data-menu': hasMenu === true ? 'true' : undefined,
          'data-directory-path': directoryPath || undefined,
          title: title === undefined ? undefined : title,
          style: { paddingInlineStart: `${6 + depth * 14}px` },
          onClick: interactive ? onClick : undefined,
          onContextMenu,
          onMouseEnter,
          onMouseLeave,
          draggable,
          onDragStart,
          onKeyDown,
        },
        children,
      )
    }

    /**
     * The floating context menu. It is absolutely positioned inside the panel —
     * never `fixed` — so an animated or clipped sidebar ancestor cannot move it,
     * and the controller clamps it inside the panel's own box.
     */
    function positionFloating(x, y, width, height, viewportWidth, viewportHeight) {
      let left = x
      let top = y - height
      if (left + width > viewportWidth - 8) left = x - width
      if (top < 8) top = y
      return { left: Math.max(8, Math.min(left, viewportWidth - width - 8)), top: Math.max(8, Math.min(top, viewportHeight - height - 8)) }
    }

    function useFloating(controller, anchor, isMenu) {
      const ref = React.useRef(null)
      React.useLayoutEffect(() => {
        if (!anchor || !ref.current) return
        const element = ref.current
        if (typeof element.showPopover !== 'function') {
          if (isMenu) controller.notify('error', /^zh/.test(controller.language) ? '当前浏览器不支持顶层菜单，请更新浏览器。' : 'This browser does not support top-layer menus. Please update it.')
          isMenu ? controller.closeMenu() : controller.closeHover()
          return
        }
        element.style.visibility = 'hidden'
        element.showPopover()
        const place = () => { const box = element.getBoundingClientRect(); const pos = positionFloating(anchor.x, anchor.y, box.width, box.height, window.innerWidth, window.innerHeight); element.style.left = `${pos.left}px`; element.style.top = `${pos.top}px`; element.style.visibility = 'visible' }
        place()
        if (isMenu) element.querySelector('[role="menuitem"]')?.focus()
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null
        observer?.observe(element)
        const close = event => { if (event?.type === 'scroll' && element.contains(event.target)) return; isMenu ? controller.closeMenu() : controller.closeHover() }
        window.addEventListener('resize', close)
        document.addEventListener('scroll', close, true)
        return () => { observer?.disconnect(); window.removeEventListener('resize', close); document.removeEventListener('scroll', close, true); if (element.matches(':popover-open')) element.hidePopover() }
      }, [controller, anchor, isMenu])
      return ref
    }

    function FloatingMenu({ controller, snapshot }) {
      const menu = snapshot.menu
      const ref = useFloating(controller, menu, true)
      if (menu === null) return null
      return h(
        'div',
        {
          ref, popover: 'manual',
          className: 'dwx-ctxmenu',
          role: 'menu',
          onKeyDown: event => { if (event.key === 'Escape' || event.key === 'Tab') { controller.closeMenu(); return } if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const items = [...event.currentTarget.querySelectorAll('[role="menuitem"]')]; const i = items.indexOf(document.activeElement); const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (i + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items[next]?.focus() } }, 
          'data-dwx-popover': '',
          style: { left: `${menu.x}px`, top: `${menu.y}px` },
        },
        menu.items.map((item, index) =>
          item.separator === true
            ? h('div', { key: `sep-${index}`, className: 'dwx-menusep' })
            : h(
                'button',
                {
                  key: item.key,
                  type: 'button',
                  role: 'menuitem',
                  className: 'dwx-menuitem',
                  'data-danger': item.danger === true ? 'true' : undefined,
                  onClick: (event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    controller.closeMenu()
                    try {
                      const result = item.onSelect()
                      if (result !== undefined && typeof result?.catch === 'function') {
                        result.catch((error) => controller.notify('error', error instanceof Error ? error.message : String(error)))
                      }
                    } catch (error) {
                      controller.notify('error', error instanceof Error ? error.message : String(error))
                    }
                  },
                },
                item.icon === undefined ? null : h('span', { className: 'dwx-glyph' }, h(Glyph, { path: item.icon, size: 14 })),
                item.label,
              ),
        ),
      )
    }

    /** The session status card the native sidebar shows on row hover. */
    function HoverCard({ controller, snapshot }) {
      const hover = snapshot.hover
      const ref = useFloating(controller, hover, false)
      const text = controller.text
      if (hover === null) return null
      const session = hover.session
      const state = session.busy === true ? 'working' : session.blank === true ? 'blank' : 'idle'
      const stateText = state === 'working' ? text.statusWorking : state === 'blank' ? text.statusBlank : text.statusIdle
      const row = (label, value) => h('div', { className: 'dwx-hoverrow' }, h('b', null, label), h('span', { title: value }, value))
      return h(
        'div',
        { ref, popover: 'manual', className: 'dwx-hovercard', 'data-dwx-popover': '', style: { left: `${hover.x}px`, top: `${hover.y}px` }, role: 'tooltip' },
        h('h5', { title: session.title }, session.title),
        h(
          'div',
          { className: 'dwx-hoverrow' },
          h('b', null, text.statusLabel),
          h(
            'span',
            { className: 'dwx-state', 'data-state': state === 'working' ? 'working' : 'idle' },
            h('i', null),
            stateText,
          ),
        ),
        row(text.workingDirectory, session.cwd === undefined ? text.unknownDirectory : displayPath(session.cwd)),
        row(text.lastActivity, `${formatStamp(session.updatedAt)}${timeAgo(session.updatedAt, controller.language) === '' ? '' : `（${timeAgo(session.updatedAt, controller.language)}）`}`),
      )
    }

    /** One compact trailing action inside a row. */
    function IconAction({ label, onClick, children }) {
      return h(
        'button',
        {
          type: 'button',
          className: 'dwx-iconbtn',
          title: label,
          'aria-label': label,
          'data-dwx-menu-trigger': '',
          'aria-haspopup': 'menu',
          onKeyDown: event => event.stopPropagation(),
          onClick: (event) => {
            event.stopPropagation()
            onClick(event)
          },
        },
        children,
      )
    }

    // #endregion

    // #region components

    /** The panel's modal layer. */
    function Modal({ controller }) {
      const snapshot = useObservable(controller.store)
      const modal = snapshot.modal
      const text = controller.text
      const inputRef = React.useRef(null)
      React.useEffect(() => {
        if (modal !== null && (modal.kind === 'rename-root' || modal.kind === 'rename-session') && inputRef.current !== null) {
          inputRef.current.focus()
          inputRef.current.select?.()
        }
      }, [modal])
      React.useEffect(() => {
        if (modal === null) return undefined
        const onKey = (event) => {
          if (event.key === 'Escape') controller.closeModal()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [modal, controller])
      if (modal === null) return null
      const editing = modal.kind === 'rename-root' || modal.kind === 'rename-session'
      const confirm = () => {
        if (modal.kind === 'rename-root') void controller.commitRenameRoot(modal.rootId, modal.value.trim())
        else if (modal.kind === 'rename-session') void controller.commitRenameSession(modal.sessionId, modal.value.trim())
        else if (modal.kind === 'remove-root') void controller.commitRemoveRoot(modal.rootId)
        else if (modal.kind === 'hide-directory') void controller.setDirectoryHidden(modal.path, true)
        else if (modal.kind === 'delete-session') void controller.commitDeleteSession(modal.sessionId)
        else if (modal.kind === 'reset-config') void controller.commitResetConfig()
      }
      const title =
        modal.kind === 'rename-root'
          ? text.renameRootTitle
          : modal.kind === 'rename-session'
            ? text.sessionRename
            : modal.kind === 'remove-root'
              ? text.removeRootTitle
              : modal.kind === 'hide-directory'
                ? text.hideDirectoryTitle.replace('{name}', modal.name)
                : modal.kind === 'delete-session'
                  ? text.sessionDeleteTitle
                  : text.resetTitle
      const body =
        modal.kind === 'remove-root'
          ? text.removeRootBody
          : modal.kind === 'hide-directory'
            ? text.hideDirectoryBody
            : modal.kind === 'delete-session'
              ? text.sessionDeleteBody
              : modal.kind === 'reset-config'
                ? text.resetBody
                : null
      const danger = modal.kind === 'remove-root' || modal.kind === 'hide-directory' || modal.kind === 'delete-session'
      return h(
        'div',
        {
          className: 'dwx-modalwrap',
          role: 'presentation',
          onClick: (event) => {
            if (event.target === event.currentTarget) controller.closeModal()
          },
        },
        h(
          'div',
          { className: 'dwx-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
          h('h3', null, title),
          body === null ? null : h('p', null, body),
          editing
            ? h('input', {
                ref: inputRef,
                value: modal.value,
                'aria-label': title,
                onChange: (event) => controller.setModalValue(event.target.value),
                onKeyDown: (event) => {
                  if (event.key === 'Enter' && modal.value.trim() !== '') confirm()
                },
              })
            : null,
          h(
            'div',
            { className: 'dwx-modalrow' },
            h('button', { type: 'button', className: 'dwx-btn', onClick: () => controller.closeModal() }, text.cancel),
            h(
              'button',
              {
                type: 'button',
                className: 'dwx-btn',
                'data-primary': danger ? undefined : 'true',
                'data-danger': danger ? 'true' : undefined,
                disabled: editing && modal.value.trim() === '',
                onClick: confirm,
              },
              danger ? text.confirm : text.rename,
            ),
          ),
        ),
      )
    }

    /** The settings popover, opened from the panel header. */
    function SettingsPopover({ controller }) {
      const snapshot = useObservable(controller.store)
      const text = controller.text
      if (!snapshot.settingsOpen) return null
      return h(
        'div',
        { className: 'dwx-pop', role: 'dialog', 'aria-label': text.settings, 'data-dwx-popover': '' },
        h('h4', null, text.settings),
        h(
          'label',
          { className: 'dwx-check' },
          h('input', {
            type: 'checkbox',
            checked: snapshot.prefs.showHiddenEntries === true,
            onChange: (event) => void controller.setShowHidden(event.target.checked),
          }),
          h('span', null, text.showHidden, h('br'), text.showHiddenHint),
        ),
        h('p', { className: 'dwx-popnote' }, text.settingsNote),
        [['conversations', text.conversationHidden, snapshot.conversationHiddenDirectories], ['resources', text.resourceHidden, snapshot.resourceHiddenEntries]].map(([scope, label, paths]) =>
          paths.length ? h('div', { key: scope, style: { marginTop: '10px' } }, h('h4', null, label),
            paths.map(path => h('div', { key: path, className: 'dwx-hoverrow' },
              h('span', { title: displayPath(path) }, displayPath(path)),
              h('button', { type: 'button', className: 'dwx-link', onClick: () => void controller.setDirectoryHidden(path, false, scope) }, text.restoreHidden)))) : null),
        h(
          'div',
          { className: 'dwx-modalrow', style: { marginTop: '10px' } },
          h('button', { type: 'button', className: 'dwx-btn', onClick: () => controller.openModal({ kind: 'reset-config' }) }, text.resetConfig),
        ),
        h('p', { className: 'dwx-popnote' }, text.configNote),
      )
    }

    /** One root's status line when the directory itself is unusable. */
    function RootProblem({ controller, root }) {
      const text = controller.text
      const reason =
        root.error === 'not-found'
          ? text.rootMissing
          : root.error === 'not-a-directory'
            ? text.rootNotDirectory
            : root.error === 'no-permission'
              ? text.rootNoPermission
              : text.rootUnreadable
      return h(
        'div',
        { className: 'dwx-status' },
        h('p', { className: 'dwx-statusline' }, `${reason} — ${displayPath(root.path)}`),
        h('button', { type: 'button', className: 'dwx-link', onClick: () => void controller.recheck() }, text.recheck),
      )
    }

    /** One conversation node (a real directory) and its children. */
    function useDirectoryLevel(controller, root, path, open) {
      const state = useObservable(controller.store)
      const level = root ? state.levels[levelKey(root, path)] : undefined
      React.useEffect(() => { if (root && open && !level && !controller.disposed) void controller.loadLevel(root, path) }, [controller, root?.id, path, open, level, controller.generation])
      return level
    }

    function DirectoryMore({ controller, path, root }) {
      return h('span', { className: 'dwx-actions' }, h(IconAction, { label: controller.text.sessionMenu, onClick: event => { event.stopPropagation(); controller.openMenu(event, directoryMenuItems(controller, path, root, !!root)) } }, h(Glyph, { path: PATHS.more, size: 14 })))
    }

    function LevelStatus({ controller, root, path, level }) {
      if (!root) return null
      if (!level || level.phase === 'loading') return h('p', { className: 'dwx-note' }, controller.text.loading)
      if (level.phase === 'error') return h('div', { className: 'dwx-note' }, level.error, h('button', { onClick: () => void controller.reloadLevel(root, path) }, controller.text.refresh))
      return level.nextCursor ? h('button', { className: 'dwx-link', onClick: () => void controller.loadLevel(root, path, true) }, controller.text.loadMore) : null
    }

    function SelectionCircle({ controller, path, type }) {
      const state = useObservable(controller.store)
      if (state.selectionMode !== state.tab || !canSelectPath(state.roots, path, type, state.selectionMode)) return null
      const coverage = selectionCoverage(state.selectedPaths, path)
      const label = `${coverage === 'covered' ? controller.text.coveredPath : controller.text.selectPath}: ${displayPath(path)}`
      return h('button', { type: 'button', className: 'dwx-iconbtn', role: 'checkbox', 'aria-checked': coverage !== 'none', 'aria-label': label, title: label,
        disabled: state.selectionBusy,
        onKeyDown: event => event.stopPropagation(),
        onClick: event => { event.preventDefault(); event.stopPropagation(); void controller.selectPath(path, type, controller.circleClick(path)) },
        onContextMenu: event => { event.preventDefault(); event.stopPropagation() },
      }, h(Glyph, { size: 14, path: h('circle', { cx: 8, cy: 8, r: 5, fill: coverage === 'none' ? 'none' : 'currentColor', opacity: coverage === 'covered' ? 0.5 : 1 }) }))
    }

    function ConversationChildren({ controller, node, depth, root }) {
      return conversationContents(node, depth).map(item => item.kind === 'session'
        ? h(SessionRow, { key: item.session.id, controller, session: item.session, depth: item.depth })
        : h(ConversationNode, { key: foldPath(item.node.path), controller, node: item.node, depth: item.depth, root }))
    }

    function ConversationNode({ controller, node, depth, root }) {
      const key = 'conv:' + foldPath(node.path), open = controller.isExpanded(key)
      const level = useDirectoryLevel(controller, root, node.path, open)
      const children = [...node.directories.values()].sort((a,b) => byName.compare(a.name,b.name))
      const alias = controller.store.getSnapshot().directoryAliases?.[foldPath(node.path)] ?? node.name
      return h(React.Fragment, null,
        h(Row, { depth, directoryPath: node.path, active: open, onClick: () => controller.setExpanded(key, !open), onContextMenu: event => { event.preventDefault(); event.stopPropagation(); controller.openMenu(event, directoryMenuItems(controller,node.path,undefined,false)) } },
          h(SelectionCircle,{controller,path:node.path,type:'directory'}),h(Twirl,{open}), h('span',{className:'dwx-glyph'},h(Glyph,{path:PATHS.folder,size:15})), h('span',{className:'dwx-label'},alias),h('span',{className:'dwx-sub'},String(countSessions(node))),h(DirectoryMore,{controller,path:node.path})),
        open ? h(React.Fragment,null,h(ConversationChildren,{controller,node,depth,root}),h(LevelStatus,{controller,root,path:node.path,level}),!root && !children.length && !node.sessions.length ? h('p',{className:'dwx-note'},controller.text.noSessions):null):null)
    }



    /** One Session leaf row with its rename and archive actions. */
    function SessionRow({ controller, session, depth }) {
      const snapshot = useObservable(controller.store)
      const text = controller.text
      return h(
        Row,
        {
          depth,
          onClick: () => controller.openSession(session.id),
          onContextMenu: (event) => {
            event.preventDefault()
            event.stopPropagation()
            controller.openMenu(event, sessionMenuItems(controller, session))
          },
          onMouseEnter: (event) => controller.openHover(session, event),
          onMouseLeave: () => controller.closeHover(),
        },
        h('span', { className: 'dwx-twirl' }),
        h(
          'span',
          { className: 'dwx-glyph', 'data-state': session.busy === true ? 'working' : undefined },
          h(Glyph, { path: session.busy === true ? PATHS.dot : PATHS.file, size: 15 }),
        ),
        h('span', { className: 'dwx-label' }, session.title),
        session.archived === true ? h('span', { className: 'dwx-sub', title: text.sessionArchiveHint }, text.archivedLabel) : null,
        h('span', { className: 'dwx-sub' }, timeAgo(session.updatedAt, controller.language)),
        h(
          'span',
          { className: 'dwx-actions' },
          h(
            IconAction,
            {
              label: text.sessionMenu,
              onClick: (event) => controller.openMenu(event, sessionMenuItems(controller, session)),
            },
            h(Glyph, { path: PATHS.more, size: 14 }),
          ),
        ),
      )
    }

    /** One resource directory node, loading a level on first expansion. */
    function ResourceDirectory({ controller, root, entry, depth }) {
      const open = controller.isExpanded('res:' + foldPath(entry.path))
      const level = useDirectoryLevel(controller, root, entry.path, open)
      return h(React.Fragment,null,
        h(Row,{depth,directoryPath:entry.path,active:open,draggable:true,onDragStart:event=>startWorkspaceDrag(event,entry.path,'directory',root.id,controller.referenceForRow(entry.path,'directory')),onClick:()=>void controller.toggleResourceDirectory(root,entry.path),onContextMenu:event=>{event.preventDefault();event.stopPropagation();controller.openMenu(event,directoryMenuItems(controller,entry.path,undefined,false))}},
          h(SelectionCircle,{controller,path:entry.path,type:'directory'}),h(Twirl,{open}),h('span',{className:'dwx-glyph'},h(Glyph,{path:PATHS.folder,size:15})),h('span',{className:'dwx-label'},controller.store.getSnapshot().directoryAliases?.[foldPath(entry.path)] ?? entry.name),h(DirectoryMore,{controller,path:entry.path})),
        open ? h(ResourceLevel,{controller,root,directoryPath:entry.path,depth:depth+1,level}):null)
    }



    /** One loaded (or loading, or failed) directory level. */
    function ResourceLevel({ controller, root, directoryPath, depth, level }) {
      const text = controller.text
      const indent = { paddingInlineStart: `${6 + depth * 14}px` }
      if (level === undefined || level.phase === 'loading') {
        return h('p', { className: 'dwx-note', style: indent }, text.loading)
      }
      if (level.phase === 'error') {
        return h(
          'div',
          { className: 'dwx-status', style: indent },
          h('p', { className: 'dwx-statusline' }, `${text.loadFailed} — ${level.error ?? ''}`),
          h('button', { type: 'button', className: 'dwx-link', onClick: () => void controller.reloadLevel(root, directoryPath) }, text.refresh),
        )
      }
      const snapshot = controller.store.getSnapshot()
      const entries = filterResourceEntries(level.entries, snapshot.resourceHiddenEntries, snapshot.selectionMode === 'resources')
      if (entries.length === 0 && !level.nextCursor) {
        return h('p', { className: 'dwx-note', style: indent }, text.emptyDirectory)
      }
      return h(
        React.Fragment,
        null,
        entries.map((entry) => {
          if (entry.type === 'directory') {
            return h(ResourceDirectory, { key: entry.path, controller, root, entry, depth })
          }
          if (entry.type === 'file') {
            return h(
              Row,
              {
                key: entry.path,
                depth,
                title: entry.path,
                draggable: true,
                onDragStart: event => startWorkspaceDrag(event, entry.path, 'file', root.id, controller.referenceForRow(entry.path, 'file')),
                onClick: () => controller.openFile(entry.path),
                onContextMenu: (event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  controller.openMenu(event, [
                    copyPathMenuItem(controller, entry.path),
                    { key: 'preview', label: text.previewFile, icon: PATHS.file, onSelect: () => controller.openFile(entry.path) },
                    {
                      key: 'reveal',
                      label: text.revealInFolder,
                      icon: PATHS.external,
                      onSelect: () => void controller.openInFileManager(entry.path, true),
                    },
                  ])
                },
              },
              h(SelectionCircle, { controller, path: entry.path, type: 'file' }),
              h('span', { className: 'dwx-twirl' }),
              h('span', { className: 'dwx-glyph' }, h(Glyph, { path: fileGlyph(entry.name), size: 15 })),
              h('span', { className: 'dwx-label' }, entry.name),
            )
          }
          return h(
            Row,
            { key: entry.path, depth, selectable: false, title: text.notPreviewable },
            h('span', { className: 'dwx-twirl' }),
            h('span', { className: 'dwx-glyph' }, h(Glyph, { path: PATHS.file, size: 15 })),
            h('span', { className: 'dwx-label' }, entry.name),
            h('span', { className: 'dwx-sub' }, text.dirNotBrowsable),
          )
        }),
        level.nextCursor ? h('button', { className: 'dwx-link', onClick: () => void controller.loadLevel(root, directoryPath, true) }, text.loadMore) : null,
      )
    }

    /** One registered root as a tree's top-level node. */
    function RootBlock({ controller, root, tab, children }) {
      const key = (tab === 'resources' ? 'res:' : 'conv:') + foldPath(root.path)
      const open = controller.isExpanded(key)
      const level = useDirectoryLevel(controller, root, root.path, open)
      return h(React.Fragment,null,
        h(Row,{depth:0,directoryPath:root.path,active:open,onClick:()=>controller.setExpanded(key,!open),onContextMenu:event=>{event.preventDefault();event.stopPropagation();controller.openMenu(event,directoryMenuItems(controller,root.path,root,true))}},h(Twirl,{open}),h('span',{className:'dwx-glyph'},h(Glyph,{path:PATHS.folder,size:15})),h('span',{className:'dwx-label'},root.label),h(DirectoryMore,{controller,path:root.path,root})),
        open ? root.error ? h(RootProblem,{controller,root}) : tab === 'resources' ? h(ResourceLevel,{controller,root,directoryPath:root.path,depth:1,level}) : h(React.Fragment,null,children,h(LevelStatus,{controller,root,path:root.path,level})) : null)
    }



    /** The conversations tab, anchored on the directories the Sessions actually ran in. */
    function ConversationTree({ controller, roots, hiddenSessions, hiddenDirectories }) {
      const state = useObservable(controller.store)
      const list = controller.service('sessions')?.list?.getSnapshot?.()
      const archived = controller.service('workspaces')?.list?.getSnapshot?.()?.archivedSessionIds ?? []
      const {forest,orphans} = buildConversationForest(roots,list,hiddenSessions,archived,hiddenDirectories,state.levels,state.showArchived===true,state.prefs.showHiddenEntries,state.directoryAliases,controller.busySessionIds(list))
      return h(React.Fragment,null,
        h('button',{className:'dwx-link',onClick:()=>controller.patch({showArchived:!state.showArchived})},state.showArchived ? controller.text.tabConversations : controller.text.archiveView),
        forest.map(entry => entry.root ? h(RootBlock,{key:entry.root.id,controller,root:entry.root,tab:'conversations'},
          h(ConversationChildren,{controller,node:entry.node,depth:0,root:entry.root})) : h(ConversationNode,{key:entry.anchor,controller,node:entry.node,depth:0})),
        orphans.length ? h('section',null,h('p',{className:'dwx-note'},controller.text.noWorkingDirectory),orphans.map(session=>h(SessionRow,{key:session.id,controller,session,depth:1}))):null)
    }



    /** The resources tab. */
    function ResourceTree({ controller, roots }) {
      return h(
        React.Fragment,
        null,
        uniqueRoots(roots).map((root) => {
          const usable = root.exists === true && root.isDirectory === true
          const level = controller.store.getSnapshot().levels[root.path]
          return h(
            RootBlock,
            { key: root.id, controller, root, tab: 'resources' },
            usable ? h(ResourceLevel, { controller, root, directoryPath: root.path, depth: 1, level }) : null,
          )
        }),
      )
    }

    /** The active tab's tree, the empty state, and the add-root row. */
    function ExplorerBody({ controller }) {
      const snapshot = useObservable(controller.store)
      const text = controller.text
      if (snapshot.phase === 'loading') return h('p', { className: 'dwx-note' }, text.loading)
      if (snapshot.configReadOnly) return h('div',{className:'dwx-status'},h('p',{className:'dwx-statusline'},`${text.loadFailed} — ${snapshot.configProblem}`),h('button',{type:'button',className:'dwx-link',onClick:()=>void controller.reloadState()},text.refresh))
      if (snapshot.phase === 'error') {
        return h(
          'div',
          { className: 'dwx-status' },
          h('p', { className: 'dwx-statusline' }, `${text.loadFailed} — ${snapshot.error ?? ''}`),
          h('button', { type: 'button', className: 'dwx-link', onClick: () => void controller.reloadState() }, text.refresh),
        )
      }


      return h(
        React.Fragment,
        null,
        snapshot.tab === 'conversations'
          ? h(ConversationTree, {
              controller,
              roots: snapshot.roots,
              hiddenSessions: snapshot.hiddenSessions,
              hiddenDirectories: snapshot.selectionMode === 'conversations' ? [] : snapshot.conversationHiddenDirectories,
            })
          : h(ResourceTree, { controller, roots: snapshot.roots }),
        h(
          'button',
          { type: 'button', className: 'dwx-add', onClick: () => void controller.addRoot() },
          h('span', { className: 'dwx-glyph' }, h(Glyph, { path: PATHS.plus, size: 15 })),
          text.addRoot,
        ),
      )
    }

    /**
     * The `sidebar.workspaces` occupant: the tab header, the tree body, the
     * transient notices, the settings popover, and the modal layer.
     * @param props - the owner share (`wide`) plus this entry's injected face.
     * @returns the workspace panel, or nothing while the sidebar is a 56px rail.
     */
    function WorkspaceExplorerPanel(props) {
      const controller = props.controller
      const snapshot = useObservable(controller.store)
      const text = controller.text
      React.useEffect(() => {
        ensureStyles()
      }, [])
      // The settings popover and the context menu both retire by themselves:
      // a press anywhere outside them, a scroll of the tree, or Escape. The
      // listener is installed only while one is open, and it ignores presses on
      // the menu's own trigger, so the trigger's own click can toggle instead of
      // closing and reopening.
      React.useEffect(() => {
        if (snapshot.menu === null && snapshot.settingsOpen !== true) return undefined
        const onDown = (event) => {
          const target = event.target
          if (target instanceof Element && target.closest('[data-dwx-popover]') !== null) return
          if (target instanceof Element && target.closest('[data-dwx-menu-trigger]') !== null) return
          controller.closeMenu()
          controller.closeSettings()
        }
        const onKey = (event) => {
          if (event.key !== 'Escape') return
          controller.closeMenu()
          controller.closeSettings()
        }
        document.addEventListener('mousedown', onDown, true)
        document.addEventListener('keydown', onKey)
        return () => {
          document.removeEventListener('mousedown', onDown, true)
          document.removeEventListener('keydown', onKey)
        }
      }, [snapshot.menu, snapshot.settingsOpen, controller])
      React.useEffect(() => {
        if (!snapshot.revealPath) return
        for (const row of document.querySelectorAll('[data-directory-path]')) {
          const match = foldPath(row.dataset.directoryPath) === snapshot.revealPath
          row.dataset.revealed = String(match)
          if (match) { row.scrollIntoView({ block: 'nearest' }); row.focus({ preventScroll: true }) }
        }
      }, [snapshot.revealPath, snapshot.levels, snapshot.tab])
      if (props.wide === false) return null
      return h(
        'div',
        { className: 'dwx-root', 'data-dsh-multi-root-explorer': '' },
        // The shell's own section row, kept as the region's title: same 36px
        // box, same tertiary label colour, same inherited font as the shipped
        // browser that this panel shadows. The panel's controls take the place
        // the shipped search button occupies.
        h(
          'div',
          { className: 'dwx-sectionWrap' },
          h(
            'div',
            { className: 'dwx-section' },
            h('span', { className: 'dwx-sectionLabel' }, text.sectionWorkspaces),
            h(
              'div',
              { className: 'dwx-sectionActions' },
              h('button', {
                type: 'button', className: 'dwx-iconbtn',
                title: snapshot.selectionMode ? text.submitVisibility : text.selectVisibility,
                'aria-label': snapshot.selectionMode ? text.submitVisibility : text.selectVisibility,
                'aria-pressed': snapshot.selectionMode === snapshot.tab,
                disabled: snapshot.phase !== 'ready' || snapshot.configReadOnly || snapshot.selectionBusy,
                onClick: () => void controller.toggleSelection(),
              }, h(Glyph, { path: PATHS.eye, size: 15 })),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dwx-iconbtn',
                  title: text.refresh,
                  'aria-label': text.refresh,
                  onClick: () => void controller.refreshAll(),
                },
                h(Glyph, { path: PATHS.refresh, size: 15 }),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dwx-iconbtn',
                  title: text.settings,
                  'aria-label': text.settings,
                  'aria-expanded': snapshot.settingsOpen,
                  'data-dwx-menu-trigger': '',
                  onClick: () => controller.toggleSettings(),
                },
                h(Glyph, { path: PATHS.gear, size: 15 }),
              ),
            ),
          ),
          h(SettingsPopover, { controller }),
        ),
        h(
          'div',
          { className: 'dwx-head' },
          h(
            'div',
            { className: 'dwx-tabs', role: 'tablist' },
            h(
              'button',
              {
                type: 'button',
                role: 'tab',
                className: 'dwx-tab',
                'data-active': snapshot.tab === 'conversations' ? 'true' : 'false',
                'aria-selected': snapshot.tab === 'conversations',
                onClick: () => controller.setTab('conversations'),
              },
              text.tabConversations,
            ),
            h(
              'button',
              {
                type: 'button',
                role: 'tab',
                className: 'dwx-tab',
                'data-active': snapshot.tab === 'resources' ? 'true' : 'false',
                'aria-selected': snapshot.tab === 'resources',
                onClick: () => controller.setTab('resources'),
              },
              text.tabResources,
            ),
          ),
        ),
        snapshot.selectionMode ? h('div', { className: 'dwx-modalrow' },
          h('button', { type: 'button', className: 'dwx-btn', disabled: snapshot.selectionBusy, onClick: () => void controller.toggleSelection() }, `${text.submitVisibility} (${snapshot.selectedPaths.length})`),
          h('button', { type: 'button', className: 'dwx-btn', disabled: snapshot.selectionBusy, onClick: () => controller.exitSelection() }, text.exitSelection)) : null,
        snapshot.notice === null
          ? null
          : h(
              'div',
              { className: 'dwx-notice', 'data-kind': snapshot.notice.kind, role: 'status' },
              h('span', null, snapshot.notice.text),
              h('button', { type: 'button', 'aria-label': text.close, onClick: () => controller.dismissNotice() }, '×'),
            ),
        snapshot.previewIssue === null
          ? null
          : h(
              'div',
              { className: 'dwx-notice', 'data-kind': 'info', role: 'status' },
              h('span', null, snapshot.previewIssue),
              h('button', { type: 'button', 'aria-label': text.close, onClick: () => controller.patch({ previewIssue: null }) }, '×'),
            ),
        h(
          'div',
          {
            className: 'dwx-body',
            onScroll: () => {
              controller.closeMenu()
              controller.closeHover()
            },
          },
          h(ExplorerBody, { controller }),
        ),
        h(FloatingMenu, { controller, snapshot }),
        h(HoverCard, { controller, snapshot }),
        h(Modal, { controller }),
      )
    }

    // #endregion

    // #region registration

    /** Services the browser half needs before it can register its seat. */
    const inject = ['slots', 'locale']

    /**
     * Shadow the sidebar's workspace region.
     *
     * `priority: -100` is the slot system's shadowing mechanism for a `single`
     * slot: several entries may occupy one cell at different priorities and the
     * lowest renders. The shipped occupant (ui-workspace, default priority 0)
     * therefore keeps its registration and simply stops rendering; disposing
     * this one — disabling the plugin, or unloading the bundle — restores it
     * with no state to unwind.
     * @param ctx - the client root context.
     */
    function apply(ctx) {
      ensureStyles()
      const controller = new ExplorerController(ctx)
      ctx.effect(() => {
        void controller.start()
        return () => controller.dispose()
      }, 'workspace-explorer: controller')
      // The `@` completion source. `registerSource` throws on a duplicate
      // (trigger, name) pair — a hot reload can leave the previous registration
      // standing — so a failed registration degrades to "no source" instead of
      // aborting this effect and taking the sidebar down with it.
      const inputTriggers = ctx.get('inputTriggers', false)
      if (inputTriggers !== undefined && typeof inputTriggers.registerSource === 'function') {
        ctx.effect(() => {
          let unregister = () => {}
          try {
            unregister = inputTriggers.registerSource(workspaceReferenceSource(controller))
          } catch (error) {
            console.warn('[dsh-multi-root-explorer] @ source registration failed:', error)
          }
          return () => unregister()
        }, 'workspace-explorer: @ source')
      }
      ctx.effect(() => {
        // Warm the host's candidate index once, so the first dragged row can
        // already be promoted: a cold index answers its first query with a
        // partial list, and the pipeline fetches candidates once per token.
        void apiGet(`${API.search}?q=`).catch(() => undefined)
        return watchReferenceDrops(controller)
      }, 'workspace-explorer: reference drops')
      ctx.effect(
        () =>
          ctx.slots.inject('sidebar.workspaces', () =>
            ctx.slots.register(
              {
                name: 'sidebar.workspaces',
                priority: -100,
                inject: () => ({ controller }),
              },
              WorkspaceExplorerPanel,
            ),
          ),
        'workspace-explorer: sidebar region',
      )
    }

    // #endregion

    exports.apply = apply
    exports.inject = inject
    // Pure helpers, published for the package's own test runner. The module
    // system reads only `apply` and `inject`, so carrying these costs nothing
    // at runtime and lets the tree/anchor algebra be tested without a DOM.
    exports.__internals = {
      visibilityLists, pathIsHidden, filterResourceEntries, canSelectPath, toggleSelectedPath, selectionCoverage, selectedVisibilityPaths,
      rootForPath, selectionChildren, withoutSubtree, referenceFor, sessionBusyIndex, goalIsActive, DOUBLE_CLICK_MS, MAX_SELECTION,
      conversationContents, fileUriFor, workspaceDragPayload, startWorkspaceDrag, workspaceReferenceSource, knownMentionList, rememberMention, MAX_KNOWN_MENTIONS,
      droppedReference, droppedInComposer, promoteDroppedReference, DRAG_MARKER,
      Row, ConversationNode, ConversationChildren, ResourceDirectory, ResourceLevel, RootBlock, SessionRow, SelectionCircle, directoryMenuItems, WorkspaceExplorerPanel, ExplorerBody,
      positionFloating,
      fileAddressFor,
      normalizePath,
      foldPath,
      pathContains,
      pathSegmentsAfter,
      buildConversationForest,
      countSessions,
      parentDirectory,
      sessionFromSnapshot,
      ExplorerController,
      levelKey,
      uniqueRoots,
      positionOverlay,
      mergeDirectories,
    }
    return module.exports
  },
})
