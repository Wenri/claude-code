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
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_98_BUNDLE
const latestBundlePath = process.env.CLAUDE_CODE_2_1_116_PUBLISHED_BUNDLE
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_97_BUNDLE and CLAUDE_CODE_2_1_98_BUNDLE are required'
      : false,
}
const latestOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !latestBundlePath
      ? 'CLAUDE_CODE_2_1_116_PUBLISHED_BUNDLE is not set'
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

const unit = [
  11341,
  8804292,
  8811444,
  '0bfa8c8c5caf8eca05f3afe6dcc4fb29cb1cf4ea0e94b039c8a985350c02a01a',
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function oauthStatusFunction(bundle) {
  const anchor = bundle.indexOf('Using 3rd-party platforms')
  assert.notEqual(anchor, -1, 'platform setup anchor')
  const start = bundle.lastIndexOf('function ', anchor)
  const end = bundle.indexOf('var ', anchor)
  assert.ok(start >= 0 && end > start, 'OAuthStatusMessage function range')
  return bundle.slice(start, end)
}

test('target 2.1.98 pins the complete Console OAuth renderer', pairOptions, () => {
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
  const [index, start, end, sourceHash] = unit
  const region = structural.regions[index]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [start, end, sourceHash],
  )
  assert.equal(sha256(target.toString('utf8').slice(start, end)), sourceHash)
})

test('2.1.98 replaces Vertex docs with an interactive wizard and restart flow', pairOptions, () => {
  const baseline = oauthStatusFunction(
    fs.readFileSync(baselineBundlePath, 'utf8'),
  )
  const target = oauthStatusFunction(fs.readFileSync(targetBundlePath, 'utf8'))

  for (const fragment of [
    'tengu_oauth_vertex_wizard_launched',
    'state:"vertex_wizard"',
    'state:"vertex_done"',
    ' to restart Claude Code.',
  ]) {
    assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
    assert.equal(target.includes(fragment), true, `${fragment}: target`)
  }
  for (const removed of [
    'tengu_oauth_platform_docs_opened",{platform:"vertex"',
    'https://code.claude.com/docs/en/google-vertex-ai',
    ' to close.',
  ]) {
    assert.equal(baseline.includes(removed), true, `${removed}: baseline`)
    assert.equal(target.includes(removed), false, `${removed}: target`)
  }
  assert.ok(
    target.indexOf('tengu_oauth_vertex_wizard_launched') <
      target.indexOf('state:"vertex_wizard"'),
  )
})

test('the target98 platform behavior remains observable in target116', latestOptions, () => {
  const latestBytes = fs.readFileSync(latestBundlePath)
  assert.equal(
    sha256(latestBytes),
    '06cb80193f3af8bb468d1536b230b0e2f854a398b1e88af3c79048ce821bf193',
  )
  const latest = oauthStatusFunction(latestBytes.toString('utf8'))
  for (const fragment of [
    '3rd-party platform',
    'Amazon Bedrock',
    'Microsoft Foundry',
    'Google Vertex AI',
    'tengu_oauth_bedrock_wizard_launched',
    'tengu_oauth_vertex_wizard_launched',
    'state:"bedrock_done"',
    'state:"vertex_done"',
    ' to restart Claude Code.',
  ]) {
    assert.ok(latest.includes(fragment), fragment)
  }
})

test('source owns the complete provider selection and wizard state machine', sourceOptions, () => {
  const owner = source('src/components/ConsoleOAuthFlow.tsx')
  for (const fragment of [
    "import { BedrockSetupWizard } from './BedrockSetupWizard.js'",
    "import { VertexSetupWizard } from './VertexSetupWizard.js'",
    "state: 'platform_setup'",
    "state: 'bedrock_wizard'",
    "state: 'bedrock_done'",
    "state: 'vertex_wizard'",
    "state: 'vertex_done'",
    '3rd-party platform ·',
    'Amazon Bedrock, Microsoft Foundry, or Vertex AI',
    'Using 3rd-party platforms',
    'Amazon Bedrock · ',
    'Microsoft Foundry · ',
    'Google Vertex AI · ',
    'interactive setup',
    'https://code.claude.com/docs/en/microsoft-foundry',
    'tengu_oauth_bedrock_wizard_launched',
    'tengu_oauth_platform_docs_opened',
    'tengu_oauth_vertex_wizard_launched',
    'state: "bedrock_wizard"',
    'state: "vertex_wizard"',
    'state: "bedrock_done"',
    'state: "vertex_done"',
    'to restart Claude Code.',
  ]) {
    assert.ok(owner.includes(fragment), fragment)
  }
  assert.equal(owner.includes('docs/en/google-vertex-ai'), false)
  assert.ok(
    owner.indexOf('tengu_oauth_vertex_wizard_launched') <
      owner.indexOf('state: "vertex_wizard"'),
  )
})

test('completed cloud setup is reachable through Enter and exits via onDone', sourceOptions, () => {
  const owner = source('src/components/ConsoleOAuthFlow.tsx')
  const keybindingStart = owner.indexOf(
    '// Handle Enter to close after a completed cloud setup',
  )
  const keybindingEnd = owner.indexOf(
    '// Handle Enter to retry on error state',
    keybindingStart,
  )
  const keybinding = owner.slice(keybindingStart, keybindingEnd)
  assert.ok(keybinding.includes("useKeybinding('confirm:yes'"))
  assert.ok(keybinding.includes('onDone();'))
  assert.ok(keybinding.includes("oauthStatus.state === 'bedrock_done'"))
  assert.ok(keybinding.includes("oauthStatus.state === 'vertex_done'"))
})
