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
const targetBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const targetSha256 =
  '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988'
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
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test('2.1.97 VCR evidence pins the base64 image redactor', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), targetSha256)
  const bundle = bytes.toString('utf8')
  const region = structural.regions[12559]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [
      9666488,
      9666595,
      'c1f48edb5a847dbf4f2a04c21ee7ea31a2f732db31f8eb3c0c23094b03e00360',
    ],
  )
  const targetFunction = bundle.slice(region.target.start, region.target.end)
  assert.equal(sha256(targetFunction), region.target.sourceHash)
  assert.ok(targetFunction.includes('source.type!=="base64"'))
  assert.ok(targetFunction.includes('data:"[IMAGE_DATA]"'))
})

test(
  'source redacts base64 payloads without mutating non-base64 image blocks',
  sourceOptions,
  () => {
    const source = fs.readFileSync(
      path.join(sourceRoot, 'services/vcr.ts'),
      'utf8',
    )
    for (const fragment of [
      'return dehydrateImage(_)',
      'function dehydrateImage(image: ImageBlockParam): ImageBlockParam',
      "if (image.source.type !== 'base64') return image",
      "data: '[IMAGE_DATA]'",
    ]) {
      assert.ok(source.includes(fragment), fragment)
    }

    const redact = image =>
      image.source.type !== 'base64'
        ? image
        : {
            ...image,
            source: { ...image.source, data: '[IMAGE_DATA]' },
          }
    const base64 = {
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'secret' },
    }
    assert.deepEqual(redact(base64), {
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: '[IMAGE_DATA]',
      },
    })
    const url = { type: 'image', source: { type: 'url', url: 'https://x' } }
    assert.equal(redact(url), url)
  },
)
