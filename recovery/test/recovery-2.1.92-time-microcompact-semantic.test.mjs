import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.91-to-2.1.92'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
const targetSha256 =
  '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362'
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

const pins = new Map([
  [6773, ['unresolved', 4968490, 4968613, '47454427642cfffcb6eab78d75a1e3192e369bacc1636881964a75ab01a1823e']],
  [6774, ['unresolved', 4968613, 4969544, '777d26926392de2d331a770747f81164f587573821166879c8fbe533ef47668d']],
])

test('2.1.92 pins the complete time-based microcompact trigger and clearing helper', {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_92_BUNDLE is not set'
      : false,
}, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), targetSha256)
  const bundle = bytes.toString('utf8')
  for (const [index, [classification, start, end, sourceHash]] of pins) {
    const region = structural.regions[index]
    assert.equal(region.classification, classification, `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
  }
  for (const fragment of [
    'trigger:"gap"',
    'trigger:_.trigger',
    '_.trigger==="cache_miss"?"cache_miss trigger"',
    'tokensSaved:j',
    '{messages:H,tokensSaved:j}',
  ]) {
    assert.ok(bundle.includes(fragment), fragment)
  }
})

test('materialized target92 source owns trigger telemetry, logs, and result shape', {
  skip:
    semanticCase === caseName ? false : 'historical target92 source assertion',
}, () => {
  if (semanticCase !== caseName) return
  const source = fs.readFileSync(
    path.join(sourceRoot, 'services/compact/microCompact.ts'),
    'utf8',
  )
  for (const fragment of [
    "trigger: 'gap'",
    "trigger: 'gap' | 'cache_miss'",
    "trigger === 'cache_miss' ? 'cache_miss trigger'",
    'trigger,',
    'return { messages: result, tokensSaved }',
  ]) {
    assert.ok(source.includes(fragment), fragment)
  }
})

test('current source owns the authenticated target116 context-hint evolution', {
  skip: semanticCase ? 'current-tree assertion' : false,
}, () => {
  const source = fs.readFileSync(
    path.join(repositoryRoot, 'src/services/compact/microCompact.ts'),
    'utf8',
  )
  for (const fragment of [
    'export function applyContextHintMicrocompact',
    '{ keepRecent = 5 }',
    "trigger: 'context_hint'",
    '[KEEP-RECENT MC] context_hint trigger',
    'return { messages: result, tokensSaved, clearedIds: clearSet }',
  ]) {
    assert.ok(source.includes(fragment), fragment)
  }
})
