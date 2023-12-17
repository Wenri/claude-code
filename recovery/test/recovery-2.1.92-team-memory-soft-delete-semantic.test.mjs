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
const bundlePath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
const bundleSha =
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

const pins = new Map([
  [12050, [9_351_239, 9_351_341, 'f205b013ee19f41c1263ccb92c482fb2eb16a9cb61d80d3913d2f82e94d6a062']],
  [12059, [9_354_999, 9_356_401, 'a15d9a5fdd74556406eeaa749069a720768adec48d58aaba432825791831be3c']],
  [12060, [9_356_401, 9_357_678, '851ec4f62babeeb1c1505d6aa341b8d2da1b89f4de008b2e5e44d1808b4488cb']],
  [12061, [9_357_678, 9_358_654, '2519b439c7674b24fe619d3444f0a3665fc18f04492ebcebc478a0ccd234c123']],
  [12063, [9_358_682, 9_360_146, 'b0e7c8d8e6ca73dc308cb1b10e0a9ea7ffd57702a39dd55aa8cf8be4a72f786d']],
  [12064, [9_360_146, 9_364_013, '25611d4901f0bfaba9eb72bef1b9617d52931532ed29115d18ee46767b229c10']],
  [12066, [9_364_240, 9_364_807, 'e33fbca73960c09813a321ea430e810a0c93879633560df1feb0ea81f651680d']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test(
  '2.1.92 pins the complete team-memory soft-delete runtime graph',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !bundlePath
        ? 'CLAUDE_CODE_2_1_92_BUNDLE is not set'
        : false,
  },
  () => {
    const bytes = fs.readFileSync(bundlePath)
    assert.equal(sha256(bytes), bundleSha)
    const bundle = bytes.toString('utf8')
    for (const [index, [start, end, hash]] of pins) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(bundle.slice(start, end)), hash, `${index}: bytes`)
    }
    for (const fragment of [
      'soft_delete_keys=[...Y]',
      'diskTrusted:O',
      'outcome:"matched"',
      'entries skipped',
      'team dir inaccessible — suppressing soft-delete',
      'files_soft_deleted',
    ]) {
      assert.ok(bundle.includes(fragment), fragment)
    }
  },
)

test(
  'materialized target92 source owns safe deletion, retry, and accounting semantics',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const source = fs.readFileSync(
      path.join(sourceRoot, 'services/teamMemorySync/index.ts'),
      'utf8',
    )
    for (const fragment of [
      'pulled: false',
      'body.soft_delete_keys = [...softDeleteKeys]',
      'diskKeys.add(relPath)',
      "e.code === 'EACCES' || e.code === 'EPERM'",
      "result => result.outcome === 'written'",
      "result => result.outcome === 'failed'",
      'for (const key of unwrittenKeys) state.serverChecksums.delete(key)',
      'state.pulled = true',
      'if (state.pulled && diskTrusted)',
      "'team-memory-sync: team dir inaccessible — suppressing soft-delete'",
      'if (deltaCount === 0 && softDeleteKeys.length === 0)',
      'if (batches.length === 0) batches.push({})',
      semanticCase === caseName
        ? 'const deletes = batchIndex === 0 ? softDeleteKeys : undefined'
        : 'const batchSoftDeleteKeys = batchIndex === 0 ? softDeleteKeys : []',
      'if (previouslyKnownKeys.has(key) || diskKeys.has(key))',
      'files_soft_deleted: outcome.filesSoftDeleted',
    ]) {
      assert.ok(source.includes(fragment), fragment)
    }
    const types = fs.readFileSync(
      path.join(sourceRoot, 'services/teamMemorySync/types.ts'),
      'utf8',
    )
    assert.match(types, /filesSoftDeleted\?: number/)
  },
)
