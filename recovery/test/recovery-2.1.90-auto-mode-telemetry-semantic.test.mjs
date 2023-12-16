import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.89-to-2.1.90'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_90_BUNDLE
const targetSha256 =
  '069185909d50518b8b239acc0f9ae9b062a610595299b35955fc53e6e2c2f5e9'
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

const pin = [
  12845,
  'unresolved',
  9799670,
  9805834,
  'b30d40b621431f44405616373f3168b47009d0c4111ad8ec43e7ab31db590d29',
]

test('2.1.90 pins original permission-decision telemetry at its first boundary', {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_90_BUNDLE is not set'
      : false,
}, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), targetSha256)
  const [index, classification, start, end, sourceHash] = pin
  const region = structural.regions[index]
  assert.equal(region.classification, classification)
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [start, end, sourceHash],
  )
  const source = bytes.toString('utf8')
  assert.equal(sha256(source.slice(start, end)), sourceHash)
  assert.ok(
    source
      .slice(start, end)
      .includes('originalDecisionReasonType:$.decisionReason?.type'),
  )
})

test('materialized target90 source emits the original decision reason type', {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}, () => {
  const source = fs.readFileSync(
    path.join(sourceRoot, 'utils/permissions/permissions.ts'),
    'utf8',
  )
  assert.ok(source.includes('originalDecisionReasonType: result.decisionReason'))
  assert.ok(
    source.includes(
      '?.type as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS',
    ),
  )
})
