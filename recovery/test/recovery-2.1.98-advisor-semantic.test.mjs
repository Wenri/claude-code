import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.97-to-2.1.98'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const historicalSource = semanticCase === caseName
const targetBundlePath = process.env.CLAUDE_CODE_2_1_98_BUNDLE
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = { skip: selected ? false : `not applicable to ${semanticCase}` }
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_98_BUNDLE is not set'
      : false,
}
const adjacentOptions = {
  skip: bundleOptions.skip || !baselineBundlePath
    ? bundleOptions.skip || 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
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

test('target98 pins advisor rollout and the complete reviewer contract', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), '27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556')
  const bundle = bytes.toString('utf8')
  const expected = new Map([
    [9326, [7208047, 7208210, '9061a2352d07df78dd0c893133610bf880b24186d50147769ae73b30f7b4a6fa']],
    [9332, [7208888, 7210922, '2de7b1401df86708ed2d5bad23169ccb7f325f62d1db9999a09b33175ca932c0']],
  ])
  for (const [index, identity] of expected) {
    const region = structural.regions.find(row => row.target?.index === index)
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
    )
    assert.equal(sha256(bundle.slice(region.target.start, region.target.end)), identity[2])
  }
  const enabled = bundle.slice(...expected.get(9326).slice(0, 2))
  const prompt = bundle.slice(...expected.get(9332).slice(0, 2))
  assert.ok(enabled.includes('CLAUDE_CODE_DISABLE_ADVISOR_TOOL'))
  assert.ok(enabled.includes('tengu_sage_compass2'))
  assert.ok(prompt.includes('when you call advisor()'))
  assert.ok(prompt.includes('write the file, save the result, commit the change'))
  assert.ok(prompt.includes('the paper states Y'))
})

test('source owns target98 advisor gating and exact reviewer instructions', sourceOptions, () => {
  const source = fs.readFileSync(path.join(sourceRoot, 'utils/advisor.ts'), 'utf8')
  assert.ok(source.includes("getAPIProvider() !== 'firstParty'"))
  assert.ok(source.includes('CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS'))
  assert.ok(source.includes("'tengu_sage_compass2'"))
  assert.ok(source.includes('when you call advisor()'))
  assert.ok(source.includes('write the file, save the result, commit the change'))
  assert.ok(source.includes('the paper states Y'))
  assert.equal(source.includes('when you call it, your entire conversation history'), false)
  if (historicalSource) {
    assert.equal(source.includes('CLAUDE_CODE_ENABLE_EXPERIMENTAL_ADVISOR_TOOL'), false)
    assert.equal(source.includes("m.includes('opus-4-7')"), false)
  }
})

test('2.1.97 retains the preceding advisor rollout and wording', adjacentOptions, () => {
  const bytes = fs.readFileSync(baselineBundlePath)
  assert.equal(sha256(bytes), '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988')
  const bundle = bytes.toString('utf8')
  assert.ok(bundle.includes('tengu_sage_compass'))
  assert.equal(bundle.includes('tengu_sage_compass2'), false)
  assert.ok(bundle.includes('when you call it, your entire conversation history'))
  assert.equal(bundle.includes('when you call advisor()'), false)
})
