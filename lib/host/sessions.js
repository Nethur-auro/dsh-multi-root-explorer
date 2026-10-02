/**
 * Permanent Session deletion for the Workspace Explorer host half.
 *
 * DSH exposes no session-deletion API: `dsh-session-persistence-jsonl` states
 * that "the seam has no deletion API", and the Session controller's complete
 * `@Remote` catalogue carries only `rename`, `archiveSession`,
 * `unarchiveSession`, `pinSession`, and `unpinSession`. The design document
 * therefore shipped archive-only removal. The product owner has since asked
 * for real deletion, so this module implements it at the storage level.
 *
 * What it does, and deliberately does not do:
 *
 * - It removes one Session's own persisted artifact — the directory the
 *   backend created for that Session id — and nothing else. The project
 *   directory derived from the working directory is left in place; it is
 *   shared by every Session that ran in the same directory.
 * - It never guesses a path from a Session id. `sessionId` is validated as a
 *   single path segment, then probed as an exact child name under the
 *   persistence root and under each project directory. A trailing-dot flat
 *   layout is covered by an exact prefix match on the same validated segment,
 *   so no input can ever widen the target.
 * - It refuses a Session whose live Agent is running, because that Session is
 *   writing its log; the caller sees a stable error code and can stop it first.
 *
 * The deleted data is a conversation log. There is no undo.
 *
 * @module dsh-multi-root-explorer/host/sessions
 */
import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { ExplorerError } from './listing.js'

/** The only Session-id spelling this module will act on: one safe path segment. */
export const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

/**
 * The persistence root the shipped composition configures.
 * @param dshHome - the resolved DSH home.
 * @returns the absolute sessions root.
 */
export function sessionsRootPath(dshHome) {
  return join(dshHome, 'sessions')
}

/**
 * Whether a path exists and is a directory.
 * @param path - the candidate path.
 * @returns true for an existing directory.
 */
async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

/**
 * Remove one Session's persisted artifacts.
 * @param options - the sessions root, the Session id, and liveness probes.
 * @returns the absolute paths that were removed.
 */
export async function deleteSessionData({ root, sessionId, isLive, isRunning }) {
  if (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId)) {
    throw new ExplorerError('bad-request', 'sessionId must be one safe path segment')
  }
  if (typeof isRunning === 'function' && isRunning(sessionId) === true) {
    throw new ExplorerError('session-running', 'the session is running; stop its work before deleting it')
  }

  let projects = []
  try {
    projects = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw new ExplorerError('unreadable', `cannot read the sessions root: ${root}`)
    }
  }

  /** The exact child names to probe: `<root>/<id>`, and `<project>/<id>`. */
  const directories = [join(root, sessionId)]
  for (const entry of projects) {
    if (entry.isDirectory()) directories.push(join(root, entry.name, sessionId))
  }
  /** Flat artifacts, if this root ever used the file-per-session layout. */
  const files = []
  for (const entry of projects) {
    if (entry.isFile() && entry.name.startsWith(`${sessionId}.`)) files.push(join(root, entry.name))
  }

  const removed = []
  for (const candidate of directories) {
    if (!(await isDirectory(candidate))) continue
    try {
      await rm(candidate, { recursive: true, force: true })
    } catch (error) {
      throw new ExplorerError('session-in-use', `could not delete ${candidate}: ${error?.code ?? String(error)}`)
    }
    removed.push(candidate)
  }
  for (const candidate of files) {
    try {
      await rm(candidate, { force: true })
    } catch (error) {
      throw new ExplorerError('session-in-use', `could not delete ${candidate}: ${error?.code ?? String(error)}`)
    }
    removed.push(candidate)
  }

  if (removed.length === 0) {
    throw new ExplorerError('session-not-found', 'no persisted data was found for that session')
  }
  return { removed, live: typeof isLive === 'function' && isLive(sessionId) === true }
}
