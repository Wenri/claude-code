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
  'target111 pins the Opus 4.7 image-dimension override',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.110 and 2.1.111 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
    )
    assert.equal(
      sha256(targetBytes),
      '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0',
    )
    const region = structural.regions[6259]
    assert.deepEqual(
      [
        region.classification,
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.sourceHash,
      ],
      [
        'unresolved',
        4430760,
        4430857,
        'VariableDeclaration',
        '85f03d271c592520d28aaa32643af58235c32ebf348bb6bc971f1c0189846958',
      ],
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const unit = target.slice(region.target.start, region.target.end)
    assert.equal(sha256(unit), region.target.sourceHash)
    const override = '"claude-opus-4-7":{maxWidth:2576,maxHeight:2576}'
    assert.equal(baseline.includes(override), false)
    assert.equal(target.includes(override), true)
    assert.equal(unit.includes(override), true)
  },
)

test(
  'source resolves the Opus 4.7 override through the canonical model name',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const source = fs.readFileSync(
      path.join(sourceRoot, 'utils/imageLimits.ts'),
      'utf8',
    )
    assert.match(
      source,
      /'claude-opus-4-7': \{ maxWidth: 2576, maxHeight: 2576 \}/,
    )
    assert.match(source, /MODEL_IMAGE_LIMIT_OVERRIDES\[getCanonicalName\(model\)\]/)
    assert.match(source, /maxWidth: override\.maxWidth \?\? DEFAULT_IMAGE_LIMITS\.maxWidth/)
    assert.match(source, /maxHeight: override\.maxHeight \?\? DEFAULT_IMAGE_LIMITS\.maxHeight/)
  },
)
