# dsh-multi-root-explorer

A Workspace Explorer for [DeepSeek Harness](https://github.com/anywhere-labs/dsh-desktop): it replaces the sidebar's workspace region with a two-tab browser — **Conversations** grouped by each session's real working directory, and a read-only **Resources** tree that previews files in the native right sidebar.

[中文说明](README.zh.md) | English

![The plugin in the sidebar: a registered workspace expanded into conversation folders with counts, the Conversations/Resources tabs, and the eye, refresh and settings controls](assets/sidebar.png)

> **Status: preview.** The automated suite passes, but live-runtime acceptance on every DSH build has not been done. See [Known limitations](#known-limitations) before you install.

## What it does

- **Fixed, multi-root workspaces.** Directories you import stay put instead of being recomputed from a common ancestor as sessions come and go.
- **Conversations as a directory tree.** Every session is filed under its real `cwd`, with direct conversations first and child folders after them, recursively. Sessions whose `cwd` is outside your roots stay reachable as their own anchor; sessions with no `cwd` get a separate group.
- **Resources, read-only.** Directory levels load on demand and paginate, so opening a big drive never rescans the disk. Clicking a file opens it in DSH's own right sidebar, leaving the main conversation where it was.
- **Two-state hiding, per tab.** The eye button in the panel header enters a selection mode where hidden entries are shown and pre-selected; toggle the circles, click the eye again, and exactly the selected set is hidden. Hiding is display-only and fully reversible — no file, directory, or session record is touched.
- **Per-folder actions.** Right-click or the trailing `···` on any folder to start a new session in that directory, open it in the system file manager, or (for resources) copy its absolute path.
- **Drag a file or folder out of the tree.** Resource rows are drag sources carrying `text/plain`, `text/uri-list`, and `application/x-dsh-workspace-path`; the effect is always `copy`.
- **Native archive support.** Archive and unarchive sessions through DSH's own service, with archive kept clearly distinct from permanent deletion.
- **Survives uninstalling.** Directories that hold ordinary sessions are also registered as native DSH workspaces while the plugin runs, so disabling or removing it does not hide your conversations.

## Requirements

- DeepSeek Harness `>= 0.2.0-rc.1` (declared as `dsh.engines.dsh`).
- A browser with the **Popover API** (`element.showPopover`). Menus and hover cards render in the top layer; without it the plugin reports the problem and closes the menu instead of misplacing it.
- DSH access over loopback. The plugin's HTTP routes refuse non-loopback sockets, non-loopback `Host` headers, and cross-site requests.

The plugin ships with **no runtime dependencies** — only the `react` that DSH's client module loader already provides.

## Install

Pick whichever route matches how you manage DSH. All of them end with a **Host restart** (or app restart) and a page refresh.

### 1. Plugin market (easiest)

If it is listed in the community catalog, open **Settings → Plugin market**, search for `dsh-multi-root-explorer`, and install it. The market handles the profile wiring and tells you when to restart.

### 2. Command line

```sh
dsh plugin --profile <your-profile> add dsh-multi-root-explorer
```

From this repository instead of npm:

```sh
dsh plugin --profile <your-profile> add git+https://github.com/Nethur-auro/dsh-multi-root-explorer.git
```

Replace `<your-profile>` with your profile name (`web` and `desktop` are common). Then restart `dsh web`.

### 3. By hand

The plugin manager ultimately edits your profile's `package.json` at
`$DSH_HOME/profiles/<your-profile>/package.json` (default `~/.dsh`). Add the
dependency and the bundle entry:

```json
{
  "dependencies": {
    "dsh-multi-root-explorer": "git+https://github.com/Nethur-auro/dsh-multi-root-explorer.git"
  },
  "dsh": {
    "profile": {
      "bundles": ["dsh-multi-root-explorer"]
    }
  }
}
```

Then install the profile's dependencies with `pnpm install` inside that
directory and restart DSH. Doing this by hand is equivalent to what the plugin
manager does, so prefer option 1 or 2 unless you have a reason not to.

### Verify it loaded

Open the sidebar. The workspace region should now show **对话 / Conversations**
and **资源 / Resources** tabs with the panel's own header row. If the region
looks unchanged, the Host has not picked the plugin up yet: restart DSH rather
than only refreshing the page — host-side routes are not hot-reloaded.

## Usage

1. Click **Add workspace** and pick a directory. Repeat for every root you want.
2. **Conversations** lists folders and sessions; **Resources** lists folders and files. A directory loads its level the first time you expand it.
3. Click a file to preview it in the right sidebar. A usable session is required as the preview's authorization context.
4. Right-click a folder, or use its `···`, to start a session there, open it in the file manager, or copy a resource path.
5. Right-click a session to open, rename, archive, or permanently delete it. Permanent deletion is dangerous — read [Security and permanent deletion](#security-and-permanent-deletion).
6. Use the **eye** button to hide entries per tab, and **Settings** to reveal anything you hid.
7. **Show hidden entries** also reveals dot-prefixed names, `node_modules`, and `dsh-acl-recovery`, which are hidden by default.

## Data and privacy

Everything the plugin owns lives under `$DSH_HOME/storages/workspace-explorer/`:

- `config.json` — version 3: roots, directory aliases, the two independent hidden lists, expansion state, and preferences. Version 1 and 2 files are backed up before migration; a damaged or newer-version file is protected from overwrite rather than silently replaced.
- `native-bridge.json` — the plugin's own idempotency and progress receipts. It is bookkeeping, **not** a copy of your sessions or native workspace state.

Writes are serialized and atomically replaced. Removing the bundle does not
delete this directory; clean it up manually only after resolving any pending
session-creation operation, and never delete DSH session data as part of
plugin cleanup.

Resource browsing is read-only at every level: the plugin never creates,
writes, moves, or deletes files inside your workspaces. Requests are fenced by
registered root, `realpath` containment (including intermediate links), and a
loopback/same-origin trust check.

## Security and permanent deletion

**Permanent deletion is a pre-existing, deliberately separate feature and it is
irreversible.** The target DSH builds expose no official session-deletion API,
so that one action removes the session's own persistence artifacts directly. It
is version-sensitive, it is not a supported DSH surface, and it should be
treated as a last resort. Prefer archive.

Disabling the plugin, uninstalling it, or clearing its configuration never
invokes that code path.

## Known limitations

- **Automated tests are contract tests, not live acceptance.** They use mocks and never touch your real sessions. Named-but-unsent sessions across a fresh Host process, native visibility right after uninstall, and popover placement at unusual zoom levels still need checking on your build. Do not force-close a running profile to test persistence.
- **Drag payloads are offered, not guaranteed to be consumed.** The tree provides standard `DataTransfer` formats; whether a given DSH build turns them into a composer reference or attachment has not been verified here, and the plugin does not call any undocumented composer API to force it.
- **Selection covers what is loaded.** The resource tree is paginated and lazy, so a parent folder's "select everything" applies to the descendants already loaded in the client. Expand or load more before relying on it for a very large tree.
- **Menus need the Popover API.** On a browser without it, the plugin degrades to an explicit error notice instead of showing a misplaced menu.
- **Source changes are not a running Host.** Editing files in this repository does not update a live DSH process; host routes require a restart.

## Tests

No dependencies and no install step:

```sh
node test/run.mjs
# or: npm test
```

The runner discovers every `*.test.mjs` plus `selftest.mjs` and executes them
with the same Node executable. Coverage is directory listing and pagination,
configuration and migration, the route family and its trust fence, the
conversation tree model, visibility scoping, drag payload encoding, and the
native bridge's create/rename/durability contracts.

## Design notes

- [Bug fix plan and acceptance matrix](docs/bugfix-design-2026-10-01.md)
- [Tree ordering and independent visibility design](docs/tree-visibility-design-2026-10-02.md)

## License

[MIT](LICENSE) © 2026 Nethur-auro
