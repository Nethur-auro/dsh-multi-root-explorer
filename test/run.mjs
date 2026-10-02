// Run every test suite with the same Node executable; no package dependencies.
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const directory = dirname(fileURLToPath(import.meta.url))
const suites = readdirSync(directory)
  .filter((name) => name === 'selftest.mjs' || name.endsWith('.test.mjs'))
  .sort()
let failed = false
for (const name of suites) {
  console.log(`\n=== ${name} ===`)
  const result = spawnSync(process.execPath, [join(directory, name)], { stdio: 'inherit' })
  if (result.error) console.error(result.error)
  if (result.status !== 0 || result.error) failed = true
}
console.log(`\n${failed ? 'FAIL' : 'PASS'}: ${suites.length} test suites`)
process.exitCode = failed ? 1 : 0
