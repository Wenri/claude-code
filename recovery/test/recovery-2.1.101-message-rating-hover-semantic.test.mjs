import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? path.join(root, 'src'),
)
const historical = sourceRoot !== path.join(root, 'src')
const baselinePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
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
  'target101 pins the message-rating hover delay transition',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.100 and 2.1.101 bundles are required'
        : false,
  },
  () => {
    const baseline = fs.readFileSync(baselinePath, 'utf8')
    const target = fs.readFileSync(targetPath, 'utf8')
    const baselineRegion = baseline.slice(7546061, 7547044)
    assert.equal(
      sha256(baselineRegion),
      'ef78ea7345e11931c68906a339db0f8009666f024486ca6ffd3b2a1cb7efc7f6',
    )
    assert.match(baselineRegion, /setTimeout\([^;]+,150,/)

    const region = structural.regions[10235]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [
        7570242,
        7571225,
        'd7965ed0acf93d433cc0e3ef44819693f57ae66254fd74eccd240c20c2d40862',
      ],
    )
    const targetRegion = target.slice(7570242, 7571225)
    assert.equal(sha256(targetRegion), region.target.sourceHash)
    assert.match(targetRegion, /setTimeout\([^;]+,500,/)
    assert.doesNotMatch(targetRegion, /surface:/)
  },
)

test(
  'source retains the longer hover leave window and later rating evolution',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const source = fs.readFileSync(
      path.join(sourceRoot, 'components/messageRating.tsx'),
      'utf8',
    )
    assert.ok(source.includes('setTimeout(setHoveredMessageUuid, 500, null)'))
    assert.equal(
      source.includes('setTimeout(setHoveredMessageUuid, 150, null)'),
      false,
    )
    if (historical) {
      assert.equal(source.includes('MessageRatingSurface'), false)
      assert.equal(source.includes('...metadata'), false)
    } else {
      assert.ok(source.includes("surface = 'tool_use'"))
      assert.ok(source.includes('...metadata'))
    }
  },
)
