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
const sourceOptions = { skip: selected ? false : `not applicable to ${semanticCase}` }
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
      : false,
}
const adjacentOptions = {
  skip: bundleOptions.skip || !baselineBundlePath
    ? bundleOptions.skip || 'CLAUDE_CODE_2_1_96_BUNDLE is not set'
    : false,
}
const structural = JSON.parse(gunzipSync(fs.readFileSync(path.join(
  repositoryRoot,
  'recovery/cases',
  caseName,
  'structural/generated-delta.json.gz',
))))

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test('target97 pins the complete bridge hook containing the cleanup transition', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988')
  const region = structural.regions[16636]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [11920295, 11929315, 'd4ce060fe47623fc567140137c7231f48b047da72b6a19efac460960b159c3bc'],
  )
  const owner = bytes.toString('utf8').slice(region.target.start, region.target.end)
  assert.equal(sha256(owner), region.target.sourceHash)
  assert.ok(owner.includes('[bridge:repl] Hook cleanup: starting teardown for session='))
  assert.equal(owner.includes('starting teardown for env='), false)
  assert.ok(owner.includes('.teardown()'))
})

test('source owns the target97 session-only cleanup log before starting teardown', sourceOptions, () => {
  const source = fs.readFileSync(path.join(sourceRoot, 'hooks/useReplBridge.tsx'), 'utf8')
  const log = '[bridge:repl] Hook cleanup: starting teardown for session=${handleRef.current.bridgeSessionId}'
  assert.ok(source.includes(log))
  assert.equal(source.includes('Hook cleanup: starting teardown for env='), false)
  assert.ok(source.indexOf(log) < source.indexOf('teardownPromiseRef.current = handleRef.current.teardown()'))
})

test('2.1.96 still logs both environment and session during cleanup', adjacentOptions, () => {
  const bytes = fs.readFileSync(baselineBundlePath)
  assert.equal(sha256(bytes), '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e')
  const bundle = bytes.toString('utf8')
  assert.ok(bundle.includes('[bridge:repl] Hook cleanup: starting teardown for env='))
  assert.equal(bundle.includes('[bridge:repl] Hook cleanup: starting teardown for session='), false)
})
