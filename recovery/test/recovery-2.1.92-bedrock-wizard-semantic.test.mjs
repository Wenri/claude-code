import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.91-to-2.1.92'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const historical = semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_91_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
const BASELINE_BUNDLE_SHA256 =
  'b4bf141f30cf8b40196295816c7a6b9d01a36e906908d73a9f9a865ce4cdf816'
const TARGET_BUNDLE_SHA256 =
  '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362'

function requiredBundle(filename, label, expectedSha256) {
  assert.ok(filename, `${label} environment variable must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    expectedSha256,
  )
  return bytes.toString('utf8')
}

function collectLiterals(node, ranges, result = []) {
  if (!node || typeof node !== 'object') return result
  const covered = ranges.some(
    ([start, end]) => node.start >= start && node.end <= end,
  )
  if (
    covered &&
    node.type === 'Literal' &&
    typeof node.value === 'string'
  ) {
    result.push(node.value)
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'start' || key === 'end') continue
    if (Array.isArray(value)) {
      for (const child of value) collectLiterals(child, ranges, result)
    } else {
      collectLiterals(value, ranges, result)
    }
  }
  return result
}

test('all published Bedrock wizard literals have source owners or pinned implementation-only exclusions', { skip: !selected ? `not applicable to ${semanticCase}` : !baselineBundlePath || !targetBundlePath ? 'authenticated 2.1.91 and 2.1.92 bundles are unavailable' : false, timeout: 30_000 }, () => {
  if (!selected || !baselineBundlePath || !targetBundlePath) return
  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_91_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_92_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )
  assert.equal(baseline.includes('tengu_oauth_bedrock_wizard_launched'), false)
  assert.equal(target.includes('tengu_oauth_bedrock_wizard_launched'), true)

  // Auth/completion, verification+model steps, and ConsoleOAuthFlow wiring are
  // separate target initializers. The authenticated hash pins these offsets.
  const ranges = [
    [8_050_000, 8_061_700],
    [8_207_511, 8_231_200],
    [8_237_000, 8_241_000],
  ]
  const targetAst = parse(target, { ecmaVersion: 'latest', sourceType: 'module' })
  const literals = [...new Set(collectLiterals(targetAst, ranges))]
  assert.equal(literals.length, 200, 'Bedrock wizard literal set drifted')

  const sourceFiles = [
    'components/BedrockSetupWizard.tsx',
    'components/ConsoleOAuthFlow.tsx',
    'components/design-system/Dialog.tsx',
    'components/CustomSelect/select.tsx',
    'keybindings/defaultBindings.ts',
  ]
  if (!historical) sourceFiles.push('components/Form.tsx')
  const source = sourceFiles
    .map(relative => fs.readFileSync(path.join(sourceRoot, relative), 'utf8'))
    .join('\n')
    .replaceAll('\\`', '`')
  const implementationOnly = new Set([
    'react.memo_cache_sentinel',
    'react.early_return_sentinel',
    'useWizard must be used within a WizardProvider', // recovered state machine has no context guard
    'sigv4', // recovered owner passes resolved SigV4 credentials directly
    'summary', // renamed local model-picker state
    'checking', // renamed local verification state
    // The coarse ConsoleOAuthFlow range also spans adjacent provider/help UI.
    'https://code.claude.com/docs/en/google-vertex-ai',
    'Foundry and Vertex AI:',
    ' to close.',
  ])
  if (!historical) {
    // The target92 selector used `(current)`; latest source evolved this
    // label to the more precise `(currently pinned)` wording.
    implementationOnly.add('(current)')
    assert.ok(source.includes('(currently pinned)'))

    // The cumulative Form-backed access-key step derives required errors from
    // shorter field labels and replaces target92 placeholders with those live
    // labels. Authenticate the equivalent current representation explicitly.
    for (const legacy of [
      'Access key ID is required',
      'AWS access key ID',
      'Secret access key is required',
      'AWS secret access key',
      'AWS session token (optional)',
    ]) implementationOnly.add(legacy)
    for (const current of [
      "label: 'Access key ID'",
      "label: 'Secret access key'",
      "label: 'Session token'",
      "field.required && value.trim() === ''",
      'return `${field.label} is required`',
      'Only needed for temporary credentials from STS. Leave empty for long-lived keys.',
    ]) assert.ok(source.includes(current), current)
  }
  const missing = literals.filter(
    literal =>
      literal.length > 0 &&
      !implementationOnly.has(literal) &&
      !source.includes(literal),
  )
  assert.deepEqual(missing, [])
})

test('Bedrock wizard source preserves every runtime branch and a reachable ConsoleOAuthFlow owner', { skip: selected ? false : `not applicable to ${semanticCase}` }, () => {
  if (!selected) return
  const wizard = fs.readFileSync(
    path.join(sourceRoot, 'components/BedrockSetupWizard.tsx'),
    'utf8',
  )
  const oauth = fs.readFileSync(
    path.join(sourceRoot, 'components/ConsoleOAuthFlow.tsx'),
    'utf8',
  )

  assert.match(
    oauth,
    /state: 'bedrock_wizard'[\s\S]*?state: 'bedrock_done'[\s\S]*?message: string/,
  )
  assert.match(
    oauth,
    /tengu_oauth_bedrock_wizard_launched[\s\S]*?state: "bedrock_wizard"/,
  )
  assert.match(oauth, /<BedrockSetupWizard[\s\S]*?state: "bedrock_done"/)
  assert.match(oauth, /oauthStatus\.state === 'bedrock_done'/)

  assert.match(
    wizard,
    /profile: 'profile'[\s\S]*?bearer: 'bearer'[\s\S]*?accessKey: 'accessKey'[\s\S]*?environment: 'region'/,
  )
  assert.match(wizard, /fromNodeProviderChain[\s\S]*?ignoreCache: true/)
  assert.match(
    wizard,
    /STSClient[\s\S]*?GetCallerIdentityCommand[\s\S]*?ListInferenceProfilesCommand[\s\S]*?typeEquals: 'SYSTEM_DEFINED'/,
  )
  assert.match(wizard, /do \{[\s\S]*?nextToken = response\.nextToken[\s\S]*?while \(nextToken\)/)
  assert.match(
    wizard,
    /status === 401[\s\S]*?status === 403[\s\S]*?status === 400 \|\| status === 404[\s\S]*?status === 429[\s\S]*?status === undefined/,
  )
  assert.match(wizard, /max_tokens: 1[\s\S]*?content: '\.'/)
  assert.match(wizard, /Pin the working models[\s\S]*?Choose different models…[\s\S]*?Skip — use Claude Code defaults/)
  assert.match(wizard, /MODEL_TIERS\.map[\s\S]*?probeBedrockModel/)
  assert.match(
    wizard,
    /CLAUDE_CODE_USE_BEDROCK: '1'[\s\S]*?AWS_BEARER_TOKEN_BEDROCK[\s\S]*?ANTHROPIC_DEFAULT_SONNET_MODEL/,
  )
  assert.match(wizard, /updateSettingsForSource\('userSettings'/)
  assert.match(wizard, /tengu_bedrock_setup_complete/)
})

test('published /setup-bedrock command has an exact reachable source owner', { skip: !selected ? `not applicable to ${semanticCase}` : !baselineBundlePath || !targetBundlePath ? 'authenticated 2.1.91 and 2.1.92 bundles are unavailable' : false }, () => {
  if (!selected || !baselineBundlePath || !targetBundlePath) return
  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_91_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_92_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )
  const call =
    'async function XLY(q){return d("tengu_bedrock_setup_started",{}),Hz7.createElement(Pu8,{onComplete:(K)=>q(K),onCancel:()=>{d("tengu_bedrock_setup_cancelled",{}),q()}})}'
  const descriptor =
    'name:"setup-bedrock",description:"Reconfigure AWS Bedrock authentication, region, or model pins",get isHidden(){return!U6(process.env.CLAUDE_CODE_USE_BEDROCK)}'
  assert.equal(baseline.includes(call), false)
  assert.equal(baseline.includes(descriptor), false)
  assert.equal(target.includes(call), true)
  assert.equal(target.includes(descriptor), true)

  const command = fs.readFileSync(
    path.join(sourceRoot, 'commands/provider-setup/bedrock.tsx'),
    'utf8',
  )
  const registration = fs.readFileSync(
    path.join(sourceRoot, 'commands/provider-setup/index.ts'),
    'utf8',
  )
  const commandList = fs.readFileSync(path.join(sourceRoot, 'commands.ts'), 'utf8')
  assert.match(command, /tengu_bedrock_setup_started/)
  assert.match(command, /<BedrockSetupWizard/)
  assert.match(command, /tengu_bedrock_setup_cancelled/)
  assert.match(registration, /name: 'setup-bedrock'/)
  assert.match(
    registration,
    /description: 'Reconfigure AWS Bedrock authentication, region, or model pins'/,
  )
  assert.match(registration, /!isEnvTruthy\(process\.env\.CLAUDE_CODE_USE_BEDROCK\)/)
  assert.match(commandList, /setupBedrock/)
})
