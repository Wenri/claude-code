import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.96-to-2.1.97'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_96_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const baselineSha256 =
  '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e'
const targetSha256 =
  '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988'
const baselineUnit = {
  index: 7_065,
  start: 5_203_011,
  end: 5_203_321,
  sourceHash:
    '9c663c3da260915afb31c1e8734cf6b47efdb50173b92229bdea7c961e8b8e2e',
}
const targetUnit = {
  index: 7_068,
  start: 5_203_016,
  end: 5_203_522,
  sourceHash:
    '234223d1a62f00a03741aa8af97344c7d35845968e655a9e5946cf8fdf548104',
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

const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_96_BUNDLE and CLAUDE_CODE_2_1_97_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test('2.1.97 authenticates the image token-compression boundary', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(baselineBytes), baselineSha256)
  assert.equal(sha256(targetBytes), targetSha256)
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  const predecessor = structural.unmatchedBaseline.find(
    unit => unit.index === baselineUnit.index,
  )
  assert.ok(predecessor)
  assert.deepEqual(
    [predecessor.start, predecessor.end, predecessor.sourceHash],
    [baselineUnit.start, baselineUnit.end, baselineUnit.sourceHash],
  )
  const region = structural.regions[targetUnit.index]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [targetUnit.start, targetUnit.end, targetUnit.sourceHash],
  )
  assert.equal(
    sha256(baseline.slice(baselineUnit.start, baselineUnit.end)),
    baselineUnit.sourceHash,
  )
  assert.equal(
    sha256(target.slice(targetUnit.start, targetUnit.end)),
    targetUnit.sourceHash,
  )

  const before = baseline.slice(baselineUnit.start, baselineUnit.end)
  const after = target.slice(targetUnit.start, targetUnit.end)
  assert.equal(before.includes('tokenCompressed'), false)
  assert.equal((after.match(/tokenCompressed/g) ?? []).length, 1)
  assert.match(after, /Math\.ceil\(\w+\.length\*0\.125\)>\w+/)
  assert.match(after, /tokenCompressed:!0/)
})

test('the authentic target function compresses only oversized token payloads and falls back safely', bundleOptions, async () => {
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  const functionSource = target.slice(targetUnit.start, targetUnit.end)
  const factory = new Function(
    'Buffer',
    'eo',
    'em1',
    'Lp1',
    `${functionSource}; return Ry`,
  )
  const dimensions = {
    originalWidth: 10,
    originalHeight: 10,
    displayWidth: 10,
    displayHeight: 10,
  }
  const resize = async buffer => ({ buffer, mediaType: 'png', dimensions })
  const calls = []
  const compress = async (buffer, maxTokens, mediaType) => {
    calls.push([buffer.length, maxTokens, mediaType])
    return { base64: 'compressed', mediaType: 'image/jpeg' }
  }
  const run = factory(Buffer, resize, 25_000, compress)

  const small = await run({ data: Buffer.alloc(100), mediaType: 'image/png' })
  assert.equal(small.tokenCompressed, undefined)
  assert.deepEqual(small.dimensions, dimensions)
  assert.equal(calls.length, 0)

  const largeBuffer = Buffer.alloc(200_000)
  const large = await run({ data: largeBuffer, mediaType: 'image/png' })
  assert.equal(large.tokenCompressed, true)
  assert.equal(large.block.source.media_type, 'image/jpeg')
  assert.equal(large.block.source.data, 'compressed')
  assert.deepEqual(calls, [[200_000, 25_000, 'image/png']])

  const fallback = factory(Buffer, resize, 25_000, async () => {
    throw new Error('compression unavailable')
  })
  const result = await fallback({ data: largeBuffer, mediaType: 'image/png' })
  assert.equal(result.tokenCompressed, undefined)
  assert.deepEqual(result.dimensions, dimensions)
  assert.equal(result.block.source.data, largeBuffer.toString('base64'))
})

test('source represents the target97 token limit only in its historical materialization', sourceOptions, () => {
  const source = fs.readFileSync(
    path.join(sourceRoot, 'utils/imageResizer.ts'),
    'utf8',
  )
  if (semanticCase === caseName) {
    for (const fragment of [
      'MAX_IMAGE_BLOCK_TOKENS = 25_000',
      'tokenCompressed?: boolean',
      'compressImageBufferWithTokenLimit(',
      'tokenCompressed: true',
    ]) {
      assert.ok(source.includes(fragment), fragment)
    }
    assert.match(
      source,
      /Math\.ceil\([^\n]+\.length \* 0\.125\) > MAX_IMAGE_BLOCK_TOKENS/,
    )
    assert.equal(source.includes('MAX_IMAGE_BLOCK_BYTES = 512_000'), false)
    assert.equal(source.includes('limits: ImageLimits'), false)
    return
  }

  // Target110 replaces the token estimate with a strict 500 KiB encoded-image
  // cap. Current source follows target116 and must not resurrect the old flag.
  assert.equal(source.includes('tokenCompressed'), false)
  assert.ok(source.includes('MAX_IMAGE_BLOCK_BYTES = 512_000'))
  assert.ok(source.includes('outputBuffer.length > MAX_IMAGE_BLOCK_BYTES'))
})
