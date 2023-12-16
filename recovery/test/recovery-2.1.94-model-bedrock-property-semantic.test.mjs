import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.92-to-2.1.94'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const isCurrentSource =
  sourceRoot === path.resolve(path.join(repositoryRoot, 'src'))
const baselinePath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_94_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_92_BUNDLE and CLAUDE_CODE_2_1_94_BUNDLE are required'
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

const units = new Map([
  [3041, [2285116, 2285407, 'FunctionDeclaration', '8b3df85570b0f22b6435e2917193180db22027a89d27b0ea749c716e7c37b0d2']],
  [3043, [2285433, 2285535, 'FunctionDeclaration', '9e8e7d293fde4ed058925a3f49133b234e08d1b94c82e13af17b0c38eabb55ee']],
  [3210, [2416615, 2417163, 'FunctionDeclaration', '99a648a54b33d17ee803ec181fec303ac34696e169a0c12f185f2049679e0c1e']],
  [10004, [8187822, 8188459, 'VariableDeclaration', '64d6e13458b23396d42f877cf21946f590cf2510c81603a81d2ac21828e49d3d']],
  [10135, [8233428, 8233958, 'FunctionDeclaration', '132c642314e93d39e7744279baf8a7028ae1af948c8de8c0cb063a5148dceb3c']],
  [11759, [9216100, 9217040, 'FunctionDeclaration', '8bed4af9469e5e960229efbd243dc1be2a8629617515ba8b71d0d22ded46650d']],
  [12577, [9665952, 9674768, 'VariableDeclaration', '04c718824a137828bdd7ef5a585fd459c55d2f190e3fefe0d954075c8940ad76']],
  [18063, [12642367, 12643537, 'FunctionDeclaration', '4c6cb4d97093b69b96854383e2845c1d0e856d8c6033fefd4c36ca4315aeae93']],
  [18088, [12655293, 12655520, 'VariableDeclaration', '3c8f99029b8962fc943dcc4d9331a993f1bd52e0adb02db5799aa8d1974227e4']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function assertFragments(relative, fragments) {
  const contents = source(relative)
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
  }
  return contents
}

test('target94 authenticates every model and Bedrock property/control row', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(
    sha256(baselineBytes),
    '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362',
  )
  assert.equal(
    sha256(targetBytes),
    '11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564',
  )
  const target = targetBytes.toString('utf8')
  for (const [index, [start, end, nodeType, expectedHash]] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.nodeType, region.target.sourceHash],
      [start, end, nodeType, expectedHash],
      `${index}: structural identity`,
    )
    const unit = target.slice(start, end)
    assert.equal(sha256(unit), expectedHash, `${index}: bytes`)
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
      1,
      `${index}: one complete AST unit`,
    )
  }
})

test('target94 boundary introduces Mantle model routing and Bedrock upgrade behavior', bundleOptions, () => {
  const baseline = fs.readFileSync(baselinePath, 'utf8')
  const target = fs.readFileSync(targetPath, 'utf8')
  for (const fragment of [
    'CLAUDE_CODE_USE_MANTLE',
    'ANTHROPIC_BEDROCK_MANTLE_BASE_URL',
    'tengu_bedrock_upgrade_check',
    'tengu_bedrock_probe_result',
    'tengu_bedrock_upgrade_accepted',
    'tengu_bedrock_upgrade_declined',
  ]) {
    assert.equal(baseline.includes(fragment), false, `baseline: ${fragment}`)
    assert.equal(target.includes(fragment), true, `target: ${fragment}`)
  }
  assert.ok(target.slice(2416615, 2417163).includes('startsWith("anthropic.")'))
  assert.ok(target.slice(9216100, 9217040).includes('startsWith("anthropic.")'))
  assert.ok(target.slice(8187822, 8188459).includes('"AWS_REGION"'))
  assert.ok(
    target
      .slice(8233428, 8233958)
      .includes('awsAccessKey:Y.accessKeyId,awsSecretKey:Y.secretAccessKey,awsSessionToken:Y.sessionToken'),
  )
})

test('source owns exact Mantle allowlisting, picker, and teammate propagation', sourceOptions, () => {
  assertFragments('utils/model/providers.ts', [
    "'mantle'",
    'process.env.CLAUDE_CODE_USE_MANTLE',
    "getAPIProvider() === 'bedrock'",
    "return 'mantle'",
    "model.startsWith('anthropic.')",
  ])
  const allowlist = assertFragments('utils/model/modelAllowlist.ts', [
    'const normalizedInputModel = model.trim().toLowerCase()',
    "normalizedInputModel.startsWith('anthropic.')",
    'normalizedAllowlist.includes(normalizedInputModel)',
    'return true',
  ])
  const directMantle = allowlist.indexOf(
    "normalizedInputModel.startsWith('anthropic.')",
  )
  const aliasResolution = allowlist.indexOf('resolveOverriddenModel(model)')
  assert.ok(directMantle >= 0 && directMantle < aliasResolution)

  assertFragments('utils/model/modelOptions.ts', [
    'const { availableModels } = getSettings_DEPRECATED() ?? {}',
    'for (const configuredModel of availableModels)',
    "!model.startsWith('anthropic.')",
    'options.some(existing => existing.value === model)',
    "options.push({ value: model, label: model, description: 'Custom model' })",
  ])
  assertFragments('utils/swarm/spawnUtils.ts', ["'AWS_REGION'"])
})

test('source owns the model-family cyber reminder with the correct polarity', sourceOptions, () => {
  const fileRead = assertFragments('tools/FileReadTool/FileReadTool.ts', [
    'const CYBER_RISK_MITIGATION_MODELS = new Set([',
    "'claude-3-opus'",
    "'claude-3-sonnet'",
    "'claude-3-haiku'",
    "'claude-3-5-sonnet'",
    "'claude-3-5-haiku'",
    "'claude-3-7-sonnet'",
    "'claude-sonnet-4-5'",
    "'claude-opus-4-1'",
    "'claude-opus-4-5'",
    "'claude-haiku-4-5'",
    'return CYBER_RISK_MITIGATION_MODELS.has(shortName)',
  ])
  assert.equal(fileRead.includes('MITIGATION_EXEMPT_MODELS'), false)
  if (isCurrentSource) {
    assert.ok(fileRead.includes("'claude-sonnet-4-0'"))
    assert.ok(fileRead.includes("'claude-opus-4-0'"))
  } else {
    assert.ok(fileRead.includes("'claude-sonnet-4'"))
    assert.ok(fileRead.includes("'claude-opus-4'"))
  }
})

test('source owns the reachable Bedrock upgrade search and UI outcomes', sourceOptions, () => {
  assertFragments('utils/model/bedrockModelUpgrade.tsx', [
    "getAPIProvider() !== 'bedrock'",
    'process.env.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST',
    "'application-inference-profile'",
    'MODEL_KEYS.indexOf(pinnedKey) >= MODEL_KEYS.indexOf(config.defaultKey)',
    'await getBedrockInferenceProfiles()',
    "logEvent('tengu_bedrock_upgrade_check'",
    'await probeBedrockModelAvailability(',
    "logEvent('tengu_bedrock_probe_result'",
  ])
  const startup = assertFragments('interactiveHelpers.tsx', [
    'findBedrockUpgradeCandidates()',
    "logEvent('tengu_bedrock_upgrade_accepted'",
    "logEvent('tengu_bedrock_upgrade_declined'",
    "logEvent('tengu_bedrock_upgrade_relaunch'",
  ])
  if (isCurrentSource) {
    assert.ok(startup.includes('await runBedrockUpgradeCheck(root)'))
    assert.ok(startup.includes('await runBedrockFallbackCheck(root)'))
    assert.ok(startup.includes('MODEL_TIER_LABELS[candidate.tier]'))
  } else {
    assert.ok(startup.includes('await runBedrockModelChecks(root)'))
    assert.ok(
      startup.includes(
        'candidate.tier[0]!.toUpperCase() + candidate.tier.slice(1)',
      ),
    )
  }
})

const wizardExists = fs.existsSync(
  path.join(sourceRoot, 'components/BedrockSetupWizard.tsx'),
)
test(
  'inherited Bedrock wizard owns explicit bearer and SigV4 client props',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !wizardExists
        ? 'target92 inherited owner is supplied by the cumulative semantic lineage'
        : false,
  },
  () => {
    const wizard = source('components/BedrockSetupWizard.tsx')
    assertFragments('components/BedrockSetupWizard.tsx', [
      'awsRegion: data.region',
      'maxRetries: 0',
      'getProxyFetchOptions({ forAnthropicAPI: true })',
      'awsAccessKey: credentials.accessKeyId',
      'awsSecretKey: credentials.secretAccessKey',
      'awsSessionToken: credentials.sessionToken',
    ])
    if (isCurrentSource) {
      assert.ok(wizard.includes('apiKey: data.bearerToken'))
    } else {
      assert.ok(wizard.includes('skipAuth: true'))
      assert.ok(
        wizard.includes('Authorization: `Bearer ${data.bearerToken}`'),
      )
    }
  },
)
