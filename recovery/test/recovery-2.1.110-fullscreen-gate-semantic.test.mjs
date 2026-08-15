import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const historical = semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(root, 'src')
const baselinePath = process.env.CLAUDE_CODE_2_1_109_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(root, 'recovery/cases', caseName, 'structural/generated-delta.json.gz'),
    ),
  ),
)

const units = new Map([
  [6189, [4415959, 4416102, '0617bb27511c273dfc3b0c2adf7c0930c27071e1ac4cb7e05cea5cc4d0637045']],
  [6193, [4416706, 4417144, '41758da98e7caffe27d8c23f220fa1734db18f095d5cb6afe22c86fd8e136e3e']],
])
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')

test(
  'target110 pins the cached fullscreen GrowthBook default',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.109 and 2.1.110 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(sha256(baselineBytes), '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7')
    assert.equal(sha256(targetBytes), 'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861')
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    for (const [index, [start, end, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }
    assert.equal(baseline.includes('tengu_pewter_brook'), false)
    assert.equal(target.includes('tengu_pewter_brook'), true)
    assert.match(target.slice(4416706, 4417144), /gbGateCached/)
  },
)

test(
  'source preserves explicit overrides and caches the target default gate',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const source = fs.readFileSync(path.join(sourceRoot, 'utils/fullscreen.ts'), 'utf8')
    if (historical) {
      assert.match(source, /let fullscreenGateCached: boolean \| undefined/)
      assert.match(
        source,
        /fullscreenGateCached \?\?= getFeatureValue_CACHED_MAY_BE_STALE\(\s*'tengu_pewter_brook',\s*false,?\s*\)/,
      )
      assert.match(source, /_resetForTesting[\s\S]*?fullscreenGateCached = undefined/)
    } else {
      assert.match(source, /type FullscreenState = \{[\s\S]*?gbGateCached: boolean \| undefined/)
      assert.match(
        source,
        /state\.gbGateCached \?\?= getFeatureValue_CACHED_MAY_BE_STALE\(\s*'tengu_pewter_brook',\s*false,?\s*\)/,
      )
      assert.match(source, /_resetForTesting[\s\S]*?fullscreenState\.gbGateCached = undefined/)
    }
    const fn = source.match(/export function isFullscreenEnvEnabled[\s\S]*?\n\}/)?.[0]
    assert.ok(fn)
    assert.ok(fn.indexOf('CLAUDE_CODE_NO_FLICKER') < fn.indexOf('tengu_pewter_brook'))
    assert.ok(fn.indexOf('isTmuxControlMode()') < fn.indexOf('tengu_pewter_brook'))
    assert.ok(fn.indexOf("case 'fullscreen'") < fn.indexOf('tengu_pewter_brook'))
  },
)
