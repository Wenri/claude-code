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
const baselinePath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_111_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(repositoryRoot, 'recovery/cases', caseName, 'structural/generated-delta.json.gz'),
    ),
  ),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test(
  'target111 pins prompt/media failure-surface telemetry in the query loop',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated target110 and target111 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(sha256(baselineBytes), 'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861')
    assert.equal(sha256(targetBytes), '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0')
    const region = structural.regions[12417]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.nodeType, region.target.start, region.target.end, region.target.sourceHash],
      ['FunctionDeclaration', 9331369, 9346355, '1eaf3b77e0ad4dd70bc01b9f51a857edeffac08c2f5fc673d8808f1045c5e51f'],
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const unit = target.slice(region.target.start, region.target.end)
    assert.equal(sha256(unit), region.target.sourceHash)
    assert.equal(baseline.includes('tengu_ptl_surfaced_to_user'), false)
    assert.equal(target.split('tengu_ptl_surfaced_to_user').length - 1, 1)
    assert.match(
      unit,
      /image_error.*prompt_too_long.*tengu_ptl_surfaced_to_user.*reason:.*querySource:.*wasGatedByPriorAttempt:/s,
    )
  },
)

test(
  'source logs the exact reason and prior-attempt gate before surfacing',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const owner = fs.readFileSync(path.join(sourceRoot, 'query.ts'), 'utf8')
    assert.match(
      owner,
      /const surfacedReason = isWithheldMedia[\s\S]*'image_error'[\s\S]*'prompt_too_long'[\s\S]*logEvent\('tengu_ptl_surfaced_to_user',[\s\S]*reason: surfacedReason[\s\S]*querySource[\s\S]*wasGatedByPriorAttempt: hasAttemptedReactiveCompact[\s\S]*yield lastMessage/,
    )
    assert.match(
      owner,
      /CONTEXT_COLLAPSE[\s\S]*isWithheld413[\s\S]*logEvent\('tengu_ptl_surfaced_to_user',[\s\S]*reason: 'prompt_too_long'[\s\S]*wasGatedByPriorAttempt: hasAttemptedReactiveCompact[\s\S]*yield lastMessage/,
    )
  },
)
