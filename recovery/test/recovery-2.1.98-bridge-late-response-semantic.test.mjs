import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.97-to-2.1.98'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_98_BUNDLE
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

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_97_BUNDLE and CLAUDE_CODE_2_1_98_BUNDLE are required'
      : false,
}

const suffix = ' (late response after local resolve, or unknown id)'

test('target98 pins the bridge late-response diagnostic boundary', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath)
  const target = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baseline),
    '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988',
  )
  assert.equal(
    sha256(target),
    '27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556',
  )
  const region = structural.regions.find(row => row.target?.index === 16781)
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [
      11995649,
      12004750,
      'a8d5e017628f944c9d83109390f840a5cb1e1086b82e3c840f393eda102a9a76',
    ],
  )
  const unit = target.toString('utf8').slice(
    region.target.start,
    region.target.end,
  )
  assert.equal(sha256(unit), region.target.sourceHash)
  assert.ok(unit.includes(suffix))
  assert.equal(baseline.toString('utf8').includes(suffix), false)
})

test('source logs and ignores an unmatched permission response before deletion', sourceOptions, () => {
  const source = fs.readFileSync(
    path.join(sourceRoot, 'hooks/useReplBridge.tsx'),
    'utf8',
  )
  const lookup = source.indexOf('pendingPermissionHandlers.get(requestId)')
  const diagnostic = source.indexOf(suffix, lookup)
  const earlyReturn = source.indexOf('return;', diagnostic)
  const deletion = source.indexOf('pendingPermissionHandlers.delete(requestId)', lookup)
  assert.ok(lookup >= 0)
  assert.ok(diagnostic > lookup)
  assert.ok(earlyReturn > diagnostic)
  assert.ok(deletion > earlyReturn)
  assert.ok(source.includes('[bridge:repl] No handler for control_response request_id=${requestId}'))
})
