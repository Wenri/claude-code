import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
      : false,
}

const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'
const baselineUnit = {
  index: 2549,
  start: 1053037,
  end: 1073201,
  sourceHash:
    'e3fc4fa6a8a3ff64bee6f0c2824b18f0ff397d80adc0faca7e61b66cca4cdec3',
}
const targetUnit = {
  index: 2563,
  start: 1055953,
  end: 1075949,
  sourceHash:
    '9ce087b0336c2b4622f419d315d0f41a2071cad9dbf1acf27014177d4dd0f6b2',
}
const targetDescription =
  '@internal When false, the session recap (shown when you return after being away for 5+ minutes) is disabled. When absent or true, recap is enabled. Hidden from public SDK types until external launch.'
const baselineDescription =
  `${targetDescription.slice(0, -1)}; mirrors voiceHandsfree pattern above.`
const typedRow = {
  historicalRow: 7,
  currentRow: 7,
  literalKind: 'string',
  value: targetDescription,
  start: 1069996,
  end: 1070197,
  structuralIndex: 2563,
}

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

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function extractDescription(owner) {
  const property = owner.indexOf('awaySummaryEnabled:')
  assert.notEqual(property, -1)
  const describe = owner.indexOf('.describe(', property)
  assert.notEqual(describe, -1)
  const quote = owner.indexOf("'", describe)
  assert.notEqual(quote, -1)
  const end = owner.indexOf("'", quote + 1)
  assert.notEqual(end, -1)
  return owner.slice(quote + 1, end)
}

test('authenticated target116 removes the stale internal description suffix', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(sha256(baselineBytes), baselineSha256)
  assert.equal(sha256(targetBytes), targetSha256)
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  const baselineRegion = structural.unmatchedBaseline.find(
    region => region.index === baselineUnit.index,
  )
  assert.ok(baselineRegion)
  assert.deepEqual(
    [baselineRegion.start, baselineRegion.end, baselineRegion.sourceHash],
    [baselineUnit.start, baselineUnit.end, baselineUnit.sourceHash],
  )
  assert.equal(
    sha256(baseline.slice(baselineUnit.start, baselineUnit.end)),
    baselineUnit.sourceHash,
  )

  const targetRegion = structural.regions[targetUnit.index]
  assert.equal(targetRegion.classification, 'unresolved')
  assert.deepEqual(
    [
      targetRegion.target.start,
      targetRegion.target.end,
      targetRegion.target.sourceHash,
    ],
    [targetUnit.start, targetUnit.end, targetUnit.sourceHash],
  )
  assert.equal(
    sha256(target.slice(targetUnit.start, targetUnit.end)),
    targetUnit.sourceHash,
  )
  assert.equal(
    target.slice(typedRow.start, typedRow.end),
    JSON.stringify(typedRow.value),
  )
  assert.equal(typedRow.structuralIndex, targetUnit.index)
  assert.equal(baseline.includes(baselineDescription), true)
  assert.equal(target.includes(baselineDescription), false)
  assert.equal(target.split(JSON.stringify(targetDescription)).length - 1, 1)
})

test('source exposes the exact target description without implementation notes', sourceOptions, () => {
  const owner = source('utils/settings/types.ts')
  assert.equal(extractDescription(owner), targetDescription)
  assert.equal(owner.includes('mirrors voiceHandsfree pattern above'), false)
  assert.match(
    owner,
    /awaySummaryEnabled: z\s*\.boolean\(\)\s*\.optional\(\)\s*\.describe\(/,
  )
})
