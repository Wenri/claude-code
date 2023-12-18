import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? path.join(root, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        root,
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
  'target105 pins rating surface and metadata propagation',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath || !latestPath
        ? 'authenticated 2.1.104, 2.1.105, and 2.1.116 bundles are required'
        : false,
  },
  () => {
    const baseline = fs.readFileSync(baselinePath, 'utf8')
    const target = fs.readFileSync(targetPath, 'utf8')
    const latest = fs.readFileSync(latestPath, 'utf8')
    const baselineRegion = baseline.slice(7570912, 7571895)
    assert.equal(
      sha256(baselineRegion),
      '56e7027e456d12a626488efbaeaeda8b1d268430e7e90eb9e07395fafda2c365',
    )
    assert.doesNotMatch(baselineRegion, /surface:/)

    const region = structural.regions[9354]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [
        7200241,
        7201253,
        '9745405ac8388fa927ea01a7458aad70a501a7c48280d7464f0af6222a4ce9d2',
      ],
    )
    const targetRegion = target.slice(7200241, 7201253)
    assert.equal(sha256(targetRegion), region.target.sourceHash)
    for (const marker of ['...W', 'surface:P', 'P="tool_use"']) {
      assert.ok(targetRegion.includes(marker), marker)
    }
    assert.ok(latest.includes('surface:'))
    assert.ok(latest.includes('tiny_memory'))
  },
)

test(
  'source makes rating surface and metadata reachable from recalled memory',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const provider = fs.readFileSync(
      path.join(sourceRoot, 'components/messageRating.tsx'),
      'utf8',
    )
    const recalled = fs.readFileSync(
      path.join(sourceRoot, 'components/messages/RecalledMemory.tsx'),
      'utf8',
    )
    for (const fragment of [
      'MessageRatingSurface',
      "surface = 'tool_use'",
      '...metadata',
      'surface:',
      'cleared,',
      'setTimeout(setHoveredMessageUuid, 500, null)',
    ]) {
      assert.ok(provider.includes(fragment), fragment)
    }
    assert.ok(recalled.includes("'tiny_memory'"))
    assert.ok(recalled.includes('scopeCounts'))
  },
)
