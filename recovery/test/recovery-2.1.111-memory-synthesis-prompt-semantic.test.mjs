import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.110-to-2.1.111'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_111_BUNDLE
const unit = {
  index: 8643,
  nodeType: 'VariableDeclaration',
  start: 5814274,
  end: 5817452,
  sourceHash:
    '57e60ba95bdafd51b1809f32087fb918ab1b5ddee28a75d341371304780b7e90',
}
const oldSentence =
  'Do not invent facts. Only extract what is explicitly written in the memories.'
const target94Sentence =
  'Do not invent facts. Only synthesize what is explicitly written in the memories.'
const newSentence =
  'Do not answer or solve the query yourself. You are a retrieval step, not the assistant: every fact must be lifted from a memory file body, not derived from general knowledge or your own reasoning about the query. If no memory covers it, return relevant_facts: [].'

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

test(
  'target111 authenticates the memory-synthesis retrieval-only prompt delta',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselineBundlePath || !targetBundlePath
        ? 'authenticated target110 and target111 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselineBundlePath)
    const targetBytes = fs.readFileSync(targetBundlePath)
    assert.equal(
      sha256(baselineBytes),
      'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
    )
    assert.equal(
      sha256(targetBytes),
      '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0',
    )

    const region = structural.regions[unit.index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [
        region.target.nodeType,
        region.target.start,
        region.target.end,
        region.target.sourceHash,
      ],
      [unit.nodeType, unit.start, unit.end, unit.sourceHash],
    )
    const targetUnit = targetBytes.toString('utf8').slice(unit.start, unit.end)
    assert.equal(sha256(targetUnit), unit.sourceHash)

    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    assert.equal(baseline.split(oldSentence).length - 1, 1)
    assert.equal(baseline.includes(newSentence), false)
    assert.equal(target.includes(oldSentence), false)
    assert.equal(target.split(newSentence).length - 1, 1)
  },
)

test(
  'the target94 supplement supplies the transitive synthesis owner',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const supplement = fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases/2.1.92-to-2.1.94/semantic-supplement.patch',
      ),
      'utf8',
    )
    assert.match(
      supplement,
      /diff --git a\/src\/memdir\/findRelevantMemories\.ts b\/src\/memdir\/findRelevantMemories\.ts/,
    )
    assert.ok(supplement.includes(target94Sentence))
  },
)

test(
  'cumulative source uses the retrieval-only synthesis sentence',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  t => {
    const ownerPath = path.join(sourceRoot, 'memdir/findRelevantMemories.ts')
    const owner = fs.readFileSync(ownerPath, 'utf8')

    // The isolated own-111 target commit predates the target94 owner recovery.
    // Ordered semanticSourceLineage applies that earlier supplement before
    // this delta; do not duplicate the whole owner in the 111 supplement.
    if (!owner.includes('SYNTHESIZE_MEMORIES_SYSTEM_PROMPT')) {
      assert.equal(semanticCase, caseName)
      t.skip('isolated own111 tree relies on the target94 transitive owner')
      return
    }

    assert.equal(owner.includes(oldSentence), false)
    assert.equal(owner.split(newSentence).length - 1, 1)
  },
)
