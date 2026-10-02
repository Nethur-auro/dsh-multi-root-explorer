/** Read-only single-level enumeration with root-realpath fencing and versioned pagination. */
import { readdir, realpath, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { canonical, containsPath, fold, isHiddenEntry, joinCanonical, relativeSegments } from './paths.js'
export const MAX_ENTRIES = 3000
const byName = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })
export class ExplorerError extends Error {
  constructor(code, message) { super(message); this.name = 'ExplorerError'; this.code = code }
}
function filesystemError(error, path) {
  if (error instanceof ExplorerError) return error
  const code = error?.code === 'ENOENT' ? 'not-found' : error?.code === 'ELOOP' ? 'link-loop' : ['EACCES', 'EPERM'].includes(error?.code) ? 'no-permission' : 'unreadable'
  return new ExplorerError(code, `directory not accessible: ${path}`)
}
/** Check EVERY intermediate component, not just the final link. Ancestor aliases form a loop. */
export async function resolveDirectory(rootPath, target) {
  const root = canonical(rootPath)
  const requested = target == null || String(target).trim() === '' ? root : canonical(target)
  const segments = relativeSegments(root, requested)
  if (!segments) throw new ExplorerError('outside-root', `path is outside the registered root: ${requested}`)
  try {
    const realRoot = canonical(await realpath(root))
    const seen = new Set([fold(realRoot)])
    let lexical = root
    let resolved = realRoot
    for (const segment of segments) {
      lexical = joinCanonical(lexical, segment)
      resolved = canonical(await realpath(lexical))
      if (!containsPath(realRoot, resolved)) throw new ExplorerError('outside-root', `linked directory leaves root: ${lexical}`)
      if (seen.has(fold(resolved))) throw new ExplorerError('link-loop', `linked directory repeats an ancestor: ${lexical}`)
      seen.add(fold(resolved))
    }
    if (!(await stat(requested)).isDirectory()) throw new ExplorerError('not-a-directory', `not a directory: ${requested}`)
    return { requested, resolved, realRoot, ancestors: seen }
  } catch (error) { throw filesystemError(error, requested) }
}
export async function listDirectory({ rootPath, target, showHidden, cursor, limit = MAX_ENTRIES }) {
  const { requested, resolved, realRoot, ancestors } = await resolveDirectory(rootPath, target)
  const pageSize = Math.min(MAX_ENTRIES, Math.max(1, Number.isSafeInteger(Number(limit)) ? Number(limit) : MAX_ENTRIES))
  let records
  try { records = await readdir(requested, { withFileTypes: true }) } catch (error) { throw filesystemError(error, requested) }
  const entries = []
  for (const entry of records) {
    if (isHiddenEntry(entry.name, showHidden === true)) continue
    const path = joinCanonical(requested, entry.name)
    let type = entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other'
    if (entry.isSymbolicLink()) {
      type = 'other'
      try {
        const destination = canonical(await realpath(path))
        if (containsPath(realRoot, destination) && !ancestors.has(fold(destination))) {
          const info = await stat(path)
          type = info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other'
        }
      } catch { /* Broken, inaccessible and looping links remain visible but not browsable. */ }
    }
    entries.push({ name: entry.name, path, type })
  }
  entries.sort((a, b) => Number(b.type === 'directory') - Number(a.type === 'directory') || byName.compare(a.name, b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  const revision = createHash('sha256').update(JSON.stringify([fold(canonical(rootPath)), fold(requested), fold(realRoot), showHidden === true, entries])).digest('hex')
  let offset = 0
  if (cursor) {
    let decoded
    try { decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) } catch { throw new ExplorerError('bad-cursor', 'invalid listing cursor') }
    if (!Number.isSafeInteger(decoded?.offset) || decoded.offset < 0 || typeof decoded.revision !== 'string') throw new ExplorerError('bad-cursor', 'invalid listing cursor')
    if (decoded.revision !== revision) throw new ExplorerError('stale-cursor', 'directory or listing conditions changed; restart pagination')
    offset = decoded.offset
    if (offset > entries.length) throw new ExplorerError('bad-cursor', 'cursor exceeds directory size')
  }
  const page = entries.slice(offset, offset + pageSize)
  const truncated = offset + page.length < entries.length
  const nextCursor = truncated ? Buffer.from(JSON.stringify({ offset: offset + page.length, revision })).toString('base64url') : null
  return { path: requested, resolvedPath: resolved, entries: page, truncated, nextCursor, revision, relative: relativeSegments(rootPath, requested) ?? [] }
}
export { fold }
