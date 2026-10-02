/**
 * Read the persisted Session logs and report every durable title event, so a
 * "did the rename actually commit?" question can be answered from disk instead
 * of from the UI.
 *
 * The JSONL backend appends one checksummed Zstandard frame per write, and
 * Node's decoder stops at the first frame, so the file is split on the zstd
 * frame magic and each candidate frame is decoded on its own. A split point
 * inside compressed data simply fails to decode and contributes nothing.
 *
 * Usage: node tools/session-title-scan.mjs [sessionsRoot]
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

const root = process.argv[2] ?? join(process.env.USERPROFILE ?? '', '.dsh', 'sessions')

/** The zstd frame magic, little-endian on the wire. */
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/**
 * Decode every frame of one log file.
 * @param path - the log file.
 * @returns the decoded text.
 */
async function decode(path) {
  const buffer = await readFile(path)
  const starts = []
  let at = buffer.indexOf(MAGIC, 0)
  while (at !== -1) {
    starts.push(at)
    at = buffer.indexOf(MAGIC, at + MAGIC.length)
  }
  const text = []
  for (let index = 0; index < starts.length; index += 1) {
    const slice = buffer.subarray(starts[index], index + 1 < starts.length ? starts[index + 1] : buffer.length)
    try {
      text.push(zstdDecompressSync(slice).toString('utf8'))
    } catch {
      /* a false magic match inside compressed data decodes to nothing */
    }
  }
  return text.join('')
}

const projects = await readdir(root, { withFileTypes: true })
const rows = []
for (const project of projects) {
  if (!project.isDirectory()) continue
  const projectPath = join(root, project.name)
  for (const session of await readdir(projectPath, { withFileTypes: true })) {
    if (!session.isDirectory()) continue
    const sessionPath = join(projectPath, session.name)
    for (const file of await readdir(sessionPath)) {
      if (!file.includes('.jsonl')) continue
      const full = join(sessionPath, file)
      const info = await stat(full)
      const text = await decode(full)
      const events = text.split('\n').filter((line) => line.trim() !== '')
      const titles = []
      let cwd
      let origin
      for (const line of events) {
        try {
          const event = JSON.parse(line)
          // The durable header carries cwd at the event's top level; later
          // events repeat it under `data`.
          if (typeof event?.cwd === 'string') cwd ??= event.cwd
          if (typeof event?.data?.cwd === 'string') cwd ??= event.data.cwd
          if (typeof event?.origin === 'string') origin ??= event.origin
          if (event?.type === 'session/title') titles.push(`${event.data.source?.kind}:${JSON.stringify(event.data.title)}`)
        } catch {
          /* a torn or partially decoded line is not interesting here */
        }
      }
      rows.push({
        session: session.name,
        project: project.name,
        bytes: info.size,
        mtime: info.mtime.toISOString(),
        events: events.length,
        cwd,
        origin,
        titles: titles.join(' '),
      })
    }
  }
}

rows.sort((left, right) => (left.mtime < right.mtime ? 1 : -1))
for (const row of rows) {
  console.log(`${row.mtime}  ${String(row.bytes).padStart(6)}B  ${String(row.events).padStart(4)} ev  ${row.session}${row.origin === undefined ? '' : `  [${row.origin}]`}`)
  console.log(`        cwd    ${row.cwd ?? '(none in this file)'}`)
  console.log(`        titles ${row.titles === '' ? '(none)' : row.titles}`)
}
console.log(`\n${rows.length} session log(s) under ${root}`)
