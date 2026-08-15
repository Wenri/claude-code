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
      ? 'authenticated target114 and target116 bundles are required'
      : false,
}

const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'
const baselineUnit = {
  index: 11742,
  start: 7482835,
  end: 7488349,
  sourceHash:
    '3c8bab065c191543be73d905a8e34fee8ae9947524cd3b96bc33780006562ca3',
}
const targetUnit = {
  index: 11850,
  start: 7523219,
  end: 7528784,
  sourceHash:
    '3bc954477f976bc09f7552d72e854090bc1fc710a32822f66536592393ea26d8',
}
const oldLabel =
  'Login method pre-selected: API Usage Billing (Anthropic Console)'
const targetLabel =
  'Login method pre-selected: API usage billing (Anthropic Console)'
const typedRow = {
  currentRow: 445,
  literalKind: 'string',
  start: 7523529,
  end: 7523595,
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

function forcedConsoleLabel(owner) {
  const marker = "forceLoginMethod === 'console'"
  const markerIndex = owner.indexOf(marker)
  assert.notEqual(markerIndex, -1)
  const quoteStart = owner.indexOf("'", markerIndex + marker.length)
  assert.notEqual(quoteStart, -1)
  const quoteEnd = owner.indexOf("'", quoteStart + 1)
  assert.notEqual(quoteEnd, -1)
  return owner.slice(quoteStart + 1, quoteEnd)
}

test(
  'authenticated target116 normalizes the forced Console login label',
  bundleOptions,
  () => {
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
      JSON.stringify(targetLabel),
    )
    assert.equal(targetUnit.index, 11850)
    assert.equal(baseline.split(JSON.stringify(oldLabel)).length - 1, 1)
    assert.equal(baseline.includes(targetLabel), false)
    assert.equal(target.includes(oldLabel), false)
    assert.equal(target.split(JSON.stringify(targetLabel)).length - 1, 1)
  },
)

test(
  'source uses the exact target capitalization for forced Console login',
  sourceOptions,
  () => {
    const owner = source('components/ConsoleOAuthFlow.tsx')
    assert.equal(forcedConsoleLabel(owner), targetLabel)
    assert.equal(owner.includes(oldLabel), false)
    assert.match(
      owner,
      /forceLoginMethod === 'claudeai'[\s\S]*Subscription Plan \(Claude Pro\/Max\)[\s\S]*forceLoginMethod === 'console'/,
    )
  },
)
