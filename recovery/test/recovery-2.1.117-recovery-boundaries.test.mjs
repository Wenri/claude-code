import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const overlayPath =
  process.env.CLAUDE_CODE_2_1_117_OVERLAY ??
  `${repo}/recovery/cases/2.1.116-to-2.1.117/recovered/source-facing-overlay.patch`

export const RECOVERY_BOUNDARIES = [
  {
    id: 'background-job-agent',
    classification: 'generated-only-new-internal-module',
    evidence: 'target-only generated initializer has no authenticated authored path',
  },
  {
    id: 'fork-command-module',
    classification: 'inherited-generated-feature-module',
    evidence: '2.1.116 authored mirror already references the compile-time feature module',
  },
  {
    id: 'vscode-manage-plugins',
    classification: 'external-component',
    evidence: 'CLI plugin handlers are generated alpha-equivalent across the adjacent bundles',
  },
  {
    id: 'resume-stale-summary',
    classification: 'unsupported-no-authenticated-adjacent-cli-hunk',
    evidence: 'message summarization flow is generated alpha-equivalent',
  },
  {
    id: 'context-hint-controller',
    classification: 'generated-only-new-internal-module',
    evidence: 'target initializer has no uniquely attributable historical authored path',
  },
]

test('unlocalizable generated and external boundaries remain explicit', () => {
  assert.deepEqual(
    RECOVERY_BOUNDARIES.map(entry => entry.classification),
    [
      'generated-only-new-internal-module',
      'inherited-generated-feature-module',
      'external-component',
      'unsupported-no-authenticated-adjacent-cli-hunk',
      'generated-only-new-internal-module',
    ],
  )
  for (const entry of RECOVERY_BOUNDARIES) {
    assert.ok(entry.evidence.length > 20, entry.id)
  }

  const overlay = fs.readFileSync(overlayPath, 'utf8')
  assert.equal(overlay.includes('This session is a background job.'), false)
  assert.equal(overlay.includes(String.raw`Usage: /fork \\<directive\\>`), false)
  assert.equal(overlay.includes('src/commands/fork/index.ts'), false)
})

test('authenticated termio target slice is pinned independently of source attribution', () => {
  const targetPath = process.env.CLAUDE_CODE_2_1_117_BUNDLE
  assert.ok(targetPath, 'CLAUDE_CODE_2_1_117_BUNDLE must be set')
  const target = fs.readFileSync(targetPath)
  const termioSlice = target.subarray(3_438_639, 3_447_096)
  assert.equal(termioSlice.length, 8_457)
  assert.equal(
    crypto.createHash('sha256').update(termioSlice).digest('hex'),
    '920e5b1cfe4403220971ce95f94e7b90123d7e653b6304dcddefcdb7af66a003',
  )
})
