// Current-tree regression gate, deliberately separate from frozen release evidence.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('../scripts/check-cumulative-source-syntax.mjs', import.meta.url))
const bun = process.env.CLAUDE_RECOVERY_BUN ?? 'bun'

function check(sourceRoot) {
  const result = spawnSync(bun, [script, ...(sourceRoot ? ['--source-root', sourceRoot] : [])], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    timeout: 120_000,
  })
  assert.ifError(result.error)
  assert.equal(result.signal, null, result.stderr)
  assert.ok(result.stdout.trim(), result.stderr || 'The syntax checker returned no report.')
  return { result, report: JSON.parse(result.stdout) }
}

function fixture(t, files) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cumulative-source-syntax-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(directory, name), text)
  return directory
}

test('all current source modules pass unbundled syntax validation', () => {
  const { result, report } = check()
  assert.equal(result.status, 0, JSON.stringify(report.failures, null, 2))
  assert.ok(report.sourceModules > 0)
  assert.equal(report.transformedModules, report.sourceModules)
  assert.equal(report.parsedModules, report.sourceModules)
  assert.match(report.tooling.bunVersion, /^\d+\.\d+\.\d+/)
  assert.equal(report.status, 'syntax-checked')
})

test('reports every hard failure, including duplicate imports and disabled-feature syntax', t => {
  const directory = fixture(t, {
    'duplicate.ts': 'import { x } from "./a.js"; import { x } from "./a.js"; export { x };',
    'named-list.ts': 'import { x, x } from "./a.js"; export { x };',
    'disabled.ts': 'import { feature } from "bun:bundle"; if (feature("NEVER_ENABLED")) { let x; let x; }',
    'valid.ts': 'throw new Error("Application code must never run"); import "./absent.js";',
  })
  const { result, report } = check(directory)
  assert.equal(result.status, 1)
  assert.equal(report.sourceModules, 4)
  assert.equal(report.parsedModules, 1)
  assert.deepEqual(report.failures.map(item => item.file), ['disabled.ts', 'duplicate.ts', 'named-list.ts'])
  assert.ok(report.failures.every(item =>
    ['transpile', 'emitted-javascript-parse'].includes(item.stage),
  ))
})

test('rejects empty source coverage', t => {
  const { result, report } = check(fixture(t, {}))
  assert.equal(result.status, 1)
  assert.match(report.failures[0].error, /No source modules/)
})
