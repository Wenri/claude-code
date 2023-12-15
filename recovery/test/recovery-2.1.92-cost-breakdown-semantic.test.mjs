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

const pins = new Map([
  [
    11168,
    [
      'unresolved',
      8_745_918,
      8_746_393,
      'bcfa795afdfbd751833d033acabcd8ae2e65cc58bbe6149d8737d1e95b57b292',
    ],
  ],
  [
    13693,
    [
      'unresolved',
      10_350_476,
      10_350_903,
      'e60b6c753745274966d963cf22335464d715858e4d3ce5ad826378614163ba81',
    ],
  ],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test(
  '2.1.92 pins the cost breakdown helper and reachable /cost gate',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetBundlePath
        ? 'CLAUDE_CODE_2_1_92_BUNDLE is not set'
        : false,
  },
  () => {
    const bytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(bytes), targetSha256)
    const bundle = bytes.toString('utf8')
    for (const [index, [classification, start, end, sourceHash]] of pins) {
      const region = structural.regions[index]
      assert.equal(region.classification, classification, `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, sourceHash],
        `${index}: identity`,
      )
      assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
    }
    for (const fragment of [
      'cache hit: ${Math.round(O/w*100)}%',
      'breakdown · ${$.join(" · ")}',
      'S8("tengu_amber_lark",!1)',
    ]) {
      assert.ok(bundle.includes(fragment), fragment)
    }
  },
)

test(
  'materialized target92 source owns all cost aggregation and display branches',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const tracker = fs.readFileSync(
      path.join(sourceRoot, 'cost-tracker.ts'),
      'utf8',
    )
    for (const fragment of [
      "if (model.includes('opus')) return 'opus'",
      'costByFamily[family] = (costByFamily[family] ?? 0) + usage.costUSD',
      'right[1] - left[1]',
      'inputTokens + cacheReadTokens + cacheCreationTokens',
      '`cache hit: ${Math.round((cacheReadTokens / cacheDenominator) * 100)}%`',
      "`breakdown · ${parts.join(' · ')}`",
    ]) {
      assert.ok(tracker.includes(fragment), fragment)
    }

    const command = fs.readFileSync(
      path.join(sourceRoot, 'commands/cost/cost.ts'),
      'utf8',
    )
    assert.match(
      command,
      /getFeatureValue_CACHED_MAY_BE_STALE\('tengu_amber_lark', false\)/,
    )
    assert.match(command, /const breakdown = formatCostBreakdown\(\)/)
    assert.match(command, /if \(breakdown\) value \+= `\\n\\n\$\{breakdown\}`/)
  },
)
