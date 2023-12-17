import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const script = path.join(repositoryRoot, 'recovery', 'scripts', 'verify-all-source-pins.mjs')

test('every case source pin resolves and the cross-case chain is contiguous', () => {
  const stdout = execFileSync(process.execPath, [script, '--repo', repositoryRoot], {
    encoding: 'utf8',
  })
  const report = JSON.parse(stdout)
  assert.equal(report.status, 'all-source-pins-verified')
  assert.equal(report.cases.length >= 30, true)
  assert.equal(
    report.cases.filter(row => row.base === 'verified').length,
    report.cases.length - 1,
    'every non-genesis case verifies its base endpoint',
  )
  assert.equal(report.cases.filter(row => row.semanticTarget === 'verified').length, 21)
  assert.equal(report.links.manifestSha256 >= 28, true)
  assert.equal(report.links.semanticTargetToNextBase, 21)
  assert.equal(report.carrierHeads, 5)
  assert.deepEqual(report.expectedAnomalies, ['legacy-T119-target-tree-absent'])
})
