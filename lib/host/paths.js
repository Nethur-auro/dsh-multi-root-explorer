/**
 * Path normalization, root-boundary checks, and hidden-entry rules for the
 * Workspace Explorer host half.
 *
 * Every path the plugin touches passes through this module. The rules are the
 * security boundary described in the design document (§7): absolute
 * normalization, segment-boundary containment (so `D:\deepseek2` is never
 * treated as inside `D:\deepseek`), and no `..`/case/symlink escape.
 *
 * @module dsh-workspace-explorer/host/paths
 */
import { resolve, sep } from 'node:path'

/** Whether this host compares paths case-insensitively. */
export const CASE_INSENSITIVE = process.platform === 'win32'

/**
 * Convert every backslash to a forward slash so one comparison grammar covers
 * both separator spellings.
 * @param value - a path in either separator spelling.
 * @returns the path with forward slashes only.
 */
export function slashes(value) {
  return String(value).replace(/\\/g, '/')
}

/**
 * Normalize a path to an absolute, forward-slash, trailing-separator-free
 * spelling. This is the canonical form used for comparison and for
 * `WorkspaceFileScope` addresses.
 * @param value - an absolute or relative path.
 * @param cwd - base for a relative path; defaults to the process cwd.
 * @returns the canonical path.
 */
export function canonical(value, cwd) {
  const absolute = resolve(cwd ?? process.cwd(), String(value))
  const forward = slashes(absolute).replace(/\/+$/, '')
  return forward === '' ? '/' : /^[A-Za-z]:$/.test(forward) ? `${forward}/` : forward
}

/**
 * Fold a canonical path for comparison.
 * @param value - a canonical path.
 * @returns the comparison key (lower case on Windows).
 */
export function fold(value) {
  return CASE_INSENSITIVE ? value.toLowerCase() : value
}

/**
 * Whether `target` is `root` itself or a descendant of it, compared on
 * normalized path-segment boundaries.
 * @param root - the containing directory.
 * @param target - the candidate path.
 * @returns true when target is inside root.
 */
export function containsPath(root, target) {
  const outer = fold(canonical(root))
  const inner = fold(canonical(target))
  return inner === outer || inner.startsWith(outer.endsWith('/') ? outer : `${outer}/`)
}

/** Lexical containment that explicitly excludes the root itself. */
export function containsDescendant(root, target) {
  return containsPath(root, target) && fold(canonical(root)) !== fold(canonical(target))
}

/**
 * The path segments of `target` relative to `root`, or `undefined` when the
 * target is not inside the root.
 * @param root - the containing directory.
 * @param target - the candidate path.
 * @returns the relative segments, `[]` for the root itself.
 */
export function relativeSegments(root, target) {
  if (!containsPath(root, target)) return undefined
  const outer = canonical(root)
  const inner = canonical(target)
  if (fold(inner) === fold(outer)) return []
  return inner.slice(outer.length + (outer.endsWith('/') ? 0 : 1)).split('/')
}

/**
 * Whether a path is absolute in either spelling the Host accepts (POSIX, or a
 * Windows drive or UNC prefix).
 * @param value - the path to classify.
 * @returns true for an absolute path.
 */
export function isAbsolutePath(value) {
  const text = slashes(value)
  return text.startsWith('/') || /^[A-Za-z]:\//.test(text) || text.startsWith('//')
}

/**
 * The last path segment, for display.
 * @param value - a path.
 * @returns the final segment, or the whole value when it has none.
 */
export function baseName(value) {
  const text = slashes(value).replace(/\/+$/, '')
  const cut = text.lastIndexOf('/')
  return cut === -1 ? text : text.slice(cut + 1)
}

/** Directory names hidden by default even outside the dot-prefix rule. */
const ALWAYS_HIDDEN = new Set(['node_modules', 'dsh-acl-recovery'])

/**
 * Whether one directory entry is hidden under the current preference.
 * Dot-prefixed entries (`.git`, `.dsh`, `.env`, ...) and the explicit
 * dependency directory are hidden unless the user opts in. The Windows
 * hidden *attribute* is not readable through Node's filesystem API; this
 * rule is the documented substitute.
 * @param name - the entry's base name.
 * @param showHidden - the user's "show hidden entries" preference.
 * @returns true when the entry should not be listed.
 */
export function isHiddenEntry(name, showHidden) {
  if (showHidden) return false
  if (name.startsWith('.')) return true
  return ALWAYS_HIDDEN.has(name)
}

/**
 * Windows drive-root detection, used to keep `D:` from being joined as `D:\\`.
 * @param value - a canonical path.
 * @returns true for a bare drive root such as `D:`.
 */
export function isDriveRoot(value) {
  return /^[A-Za-z]:$/.test(value)
}

/**
 * Join a canonical directory and one child name.
 * @param directory - a canonical directory path.
 * @param name - the child's base name.
 * @returns the child's canonical path.
 */
export function joinCanonical(directory, name) {
  return directory === '/' || directory.endsWith('/') || isDriveRoot(directory)
    ? `${directory === '/' ? '' : directory}/${name}`
    : `${directory}/${name}`
}

/** The native separator, re-exported so callers need no second import. */
export const nativeSeparator = sep
