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
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_98_BUNDLE
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

const units = [
  [
    6306,
    4433319,
    4433466,
    'b67f46e5fd1dbcd17c631c15bfc9e455d158449ba0cad2495af020cdc0f6083e',
  ],
  [
    6307,
    4433466,
    4433600,
    'f4e8dbbe176e9984c41b771abbcc9ce0ef492b705f31ed6deda401c5c1cc07dc',
  ],
  [
    6325,
    4435489,
    4436103,
    'caa620aa949308c2dc9f47e02ce7f0183b820fcbcfc609df707b648b22f84205',
  ],
]

const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_97_BUNDLE and CLAUDE_CODE_2_1_98_BUNDLE are required'
      : false,
}
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function functionBody(source, name) {
  const declaration = source.indexOf(`function ${name}(`)
  assert.notEqual(declaration, -1, `${name}: declaration`)
  const bodyStart = source.indexOf('{', declaration)
  let depth = 0
  for (let index = bodyStart; index < source.length; index++) {
    if (source[index] === '{') depth++
    if (source[index] !== '}') continue
    depth--
    if (depth === 0) return source.slice(bodyStart + 1, index)
  }
  assert.fail(`${name}: body`)
}

test('target98 pins normalized max-effort capability units', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath)
  const target = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baseline),
    '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988',
  )
  assert.equal(
    sha256(target),
    '27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556',
  )
  const targetText = target.toString('utf8')
  for (const [index, start, end, sourceHash] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
    )
    assert.equal(sha256(targetText.slice(start, end)), sourceHash)
  }
  const baselineText = baseline.toString('utf8')
  for (const [index, start, end] of units) {
    assert.equal(
      baselineText.includes(targetText.slice(start, end)),
      false,
      `${index}: exact target unit absent from baseline`,
    )
  }
  for (const fragment of [
    'claude-[a-z0-9-]+',
    '-v\\d+(:\\d+)?$',
    'claude-opus-4-5',
  ]) assert.equal(targetText.includes(fragment), true, `${fragment}: target`)
})

test('source owns target98 model normalization and override precedence', sourceOptions, () => {
  const owner = fs.readFileSync(path.join(sourceRoot, 'utils/effort.ts'), 'utf8')
  for (const fragment of [
    'const MODELS_WITHOUT_MAX_EFFORT = new Set([',
    "'claude-3-opus'",
    "'claude-opus-4-5'",
    'function normalizeModelForEffortCapability(model: string): string',
    'lower.match(/claude-[a-z0-9-]+/)',
    ".replace(/-\\d{8}$/, '')",
    "get3PModelCapabilityOverride(model, 'max_effort')",
  ]) assert.ok(owner.includes(fragment), fragment)
  const target116Dispatch = owner.includes(
    'const canonical = getCanonicalName(model)',
  )
  assert.ok(
    target116Dispatch || owner.includes("model.toLowerCase().includes('haiku')"),
    'target98 legacy dispatch or its target116 exact-dispatch replacement',
  )

  const normalize = Function('model', functionBody(owner, 'normalizeModelForEffortCapability'))
  assert.equal(normalize('BEDROCK/CLAUDE-OPUS-4-5-V1:0'), 'claude-opus-4-5')
  assert.equal(normalize('claude-opus-4-6-20260101'), 'claude-opus-4-6')

  const legacy = new Set([
    'claude-3-opus',
    'claude-3-sonnet',
    'claude-3-5-sonnet',
    'claude-3-7-sonnet',
    'claude-sonnet-4',
    'claude-sonnet-4-0',
    'claude-sonnet-4-5',
    'claude-opus-4',
    'claude-opus-4-0',
    'claude-opus-4-1',
    'claude-opus-4-5',
  ])
  const buildSupports = override => {
    const names = [
      'get3PModelCapabilityOverride',
      'MODELS_WITHOUT_MAX_EFFORT',
      'normalizeModelForEffortCapability',
      'getCanonicalName',
      'getAPIProviderForModel',
      'isFirstPartyCompatibleAPIProvider',
    ]
    return Function(
      ...names,
      `return model => {${functionBody(owner, 'modelSupportsMaxEffort')}}`,
    )(
      () => override,
      legacy,
      normalize,
      normalize,
      () => 'firstParty',
      () => true,
    )
  }
  const supports = buildSupports(undefined)
  assert.equal(supports('claude-opus-4-5-v1:0'), false)
  assert.equal(supports('claude-opus-4-6-20260101'), true)
  assert.equal(supports('claude-haiku-9-9'), target116Dispatch)
  assert.equal(buildSupports(true)('claude-haiku-9-9'), true)
  assert.equal(buildSupports(false)('claude-opus-4-6'), false)
})
