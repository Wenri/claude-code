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
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_96_BUNDLE
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
const adjacentOptions = {
  skip:
    bundleOptions.skip || !baselineBundlePath
      ? bundleOptions.skip || 'CLAUDE_CODE_2_1_96_BUNDLE is not set'
      : false,
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

test('target97 pins the complete bounded FPS tracker', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(bytes),
    '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988',
  )
  const region = structural.regions[17946]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [
      12564699,
      12565410,
      '68688ab3e51a8c2468a69fe7170200c1ad2e60b4ab39e3337c22ade28be12d7e',
    ],
  )
  const owner = bytes
    .toString('utf8')
    .slice(region.target.start, region.target.end)
  assert.equal(sha256(owner), region.target.sourceHash)
  for (const fragment of [
    'totalFrames=0',
    'this.totalFrames++',
    'this.frameDurations.length>3600',
    'this.frameDurations.splice(0,this.frameDurations.length>>1)',
    'this.totalFrames/(q/1000)',
    'Math.ceil(_.length*0.01)-1',
  ]) {
    assert.ok(owner.includes(fragment), fragment)
  }
})

test('source bounds retained samples but keeps the lifetime frame average', sourceOptions, () => {
  const source = fs.readFileSync(path.join(sourceRoot, 'utils/fpsTracker.ts'), 'utf8')
  for (const fragment of [
    'private totalFrames = 0',
    'this.totalFrames++',
    'this.frameDurations.length > 3600',
    'this.frameDurations.splice(0, this.frameDurations.length >> 1)',
    'const averageFps = this.totalFrames / (totalTimeMs / 1000)',
    'Math.ceil(sorted.length * 0.01) - 1',
  ]) {
    assert.ok(source.includes(fragment), fragment)
  }
})

test('2.1.96 predates bounded FPS sample retention', adjacentOptions, () => {
  const bytes = fs.readFileSync(baselineBundlePath)
  assert.equal(
    sha256(bytes),
    '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e',
  )
  const bundle = bytes.toString('utf8')
  assert.equal(bundle.includes('frameDurations.length>3600'), false)
  assert.equal(bundle.includes('this.totalFrames++'), false)
})
