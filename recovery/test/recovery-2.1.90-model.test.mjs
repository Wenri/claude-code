import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {
  DANGEROUS_DIRECTORY_ADDITION,
  IPCONFIG_READ_ONLY_FLAGS,
  KEEP_MARKETPLACE_ON_FAILURE_ENV,
  createRateLimitOptionsGate,
  marketplacePullDisposition,
} from '../cases/2.1.89-to-2.1.90/recovered/recovery-model.mjs'

const baselineBundlePath = process.env.CLAUDE_CODE_2_1_89_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_90_BUNDLE

function requiredBundle(filename, label) {
  assert.ok(filename, `${label} environment variable must be set`)
  return fs.readFileSync(filename, 'utf8')
}

test('recovers marketplace pull failure retention semantics', () => {
  assert.equal(
    marketplacePullDisposition({
      pullExitCode: 0,
      keepOnFailure: '1',
    }),
    'updated',
  )
  assert.equal(
    marketplacePullDisposition({
      pullExitCode: 1,
      keepOnFailure: 'true',
    }),
    'keep-existing',
  )
  assert.equal(
    marketplacePullDisposition({
      pullExitCode: 1,
      keepOnFailure: '0',
    }),
    'reclone',
  )

  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_89_BUNDLE',
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_90_BUNDLE',
  )
  assert.equal(baseline.includes(KEEP_MARKETPLACE_ON_FAILURE_ENV), false)
  assert.equal(target.includes(KEEP_MARKETPLACE_ON_FAILURE_ENV), true)
  assert.equal(
    target.includes(
      'git pull failed, keeping existing clone ' +
        '(CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE)',
    ),
    true,
  )
})

test('protects .husky alongside the existing dangerous directories', () => {
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_90_BUNDLE',
  )
  assert.equal(DANGEROUS_DIRECTORY_ADDITION, '.husky')
  assert.match(
    target,
    /\["\.git","\.vscode","\.idea","\.claude","\.husky"\]/,
  )
})

test('removes the DNS-cache-dumping ipconfig flag', () => {
  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_89_BUNDLE',
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_90_BUNDLE',
  )
  assert.deepEqual(IPCONFIG_READ_ONLY_FLAGS, [
    '/all',
    '/allcompartments',
  ])
  assert.match(
    baseline,
    /ipconfig:\{safeFlags:\["\/all","\/displaydns","\/allcompartments"\]/,
  )
  assert.match(
    target,
    /ipconfig:\{safeFlags:\["\/all","\/allcompartments"\]/,
  )
  assert.equal(target.includes('/displaydns'), false)
})

test('opens rate-limit options at most once per REPL lifetime', () => {
  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_89_BUNDLE',
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_90_BUNDLE',
  )
  const gate = createRateLimitOptionsGate()
  assert.equal(gate(), true)
  assert.equal(gate(), false)
  assert.equal(gate(), false)
  assert.doesNotMatch(
    baseline,
    /useRef\(!1\).{0,80}if\(.{1,20}\.current\)return;.{1,20}\.current=!0.{0,80}\/rate-limit-options/,
  )
  assert.match(
    target,
    /useRef\(!1\).{0,80}if\(.{1,20}\.current\)return;.{1,20}\.current=!0.{0,80}\/rate-limit-options/,
  )
})
