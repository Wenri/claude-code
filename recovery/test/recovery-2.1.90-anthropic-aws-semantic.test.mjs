import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.89-to-2.1.90'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_90_BUNDLE
const targetSha256 =
  '069185909d50518b8b239acc0f9ae9b062a610595299b35955fc53e6e2c2f5e9'
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

const pins = new Map([
  [2033, ['unresolved', 869602, 870006, '3c8db7b33f23fb8de70046d3999fd850af9f1f46779d9f4007783c3c2f07ad3a']],
  [3024, ['unresolved', 2276734, 2279139, '551905f32a6decb214032ce9934ef9bb33127833a68ee5332b6bdecc22491f10']],
  [3025, ['unresolved', 2279139, 2279382, '4adb34c1fbea8082062c667618913ceacc27c680503580bb5a0694ddca5469b0']],
  [3027, ['unresolved', 2279409, 2279473, '8df72815bab4de88bac061821ed656add2f7060b226dc8a82d4ab16cbd926436']],
  [3197, ['unresolved', 2411759, 2411954, 'bf20100c8c3e658a12a6f7ff1b6a183973d83f8d7523da0fe4edebe21f51fe0e']],
  [3198, ['unresolved', 2411954, 2412157, 'd8d7ff6fa4a7efc0faaa0e027b924f634752b0d67756c12dce6ca6eceebc1664']],
  [4447, ['unresolved', 3432996, 3436478, '44bcf3c874fa503326e2b52d7ac6d07338b358a01a6594718ce694259897611f']],
  [4450, ['unresolved', 3436840, 3437236, '68e3f8032793763bc2949b6d4d19344330309add6c20f54970fe6355016511a0']],
  [4478, ['unresolved', 3441615, 3441872, '612977e6544711435dc39dd6d990f6426804e6eb7ce84a7bc1202966445e50e5']],
  [4480, ['unresolved', 3441996, 3442224, 'fb6c9c897bd8f94156b165ee95d936c3d1384e019d875a74a4bd59900f1fc1b2']],
  [4481, ['unresolved', 3442224, 3442520, '513743b07a3981d89104ec512ee515e48c33cf58936896bbc8c605e401ef120e']],
  [4482, ['unresolved', 3442520, 3442792, '6114f2b2ac2246338bf7de489d8dfb01b12b3a47c12502cb5ab8f7af52027092']],
  [4484, ['unresolved', 3442871, 3443014, '1b3a79e02d095bd1ad3eaef48b26f181a6f71da983109bc74182057750a48743']],
  [4485, ['unresolved', 3443014, 3443142, '840c6c8547b4de973cbb757a49198e80cd35a10000c044c1f82a8a579be6ca02']],
  [4538, ['unresolved', 3473444, 3473976, '7f5d9df8f7daa09b90e4b7668291f647dfa5425aab19398cfeea4f0dee6d8ad7']],
  [4584, ['unresolved', 3487783, 3488004, 'daee81f36301929958053c2d143a65fe1f620cf8d1dd284dddde07aab57d7a14']],
  [4596, ['unresolved', 3488966, 3489159, 'ad23db1c1f40ec20da91cf5b878e062c3f6ac9fd076e0f43f98a125bbb5fe1b3']],
  [5033, ['unresolved', 3721650, 3722274, '4b2abaa1884670bd38438da085e98218885386109374afe443cf25b91da6b174']],
  [6253, ['unresolved', 4425030, 4425250, 'e5599df79b347a0133129da12e5c364a123a703740a5554fb348a2818c21cb49']],
  [6254, ['unresolved', 4425250, 4425539, 'ad365e7f00f675ade78ac0ff4affa8ad31e1fcad7bc3d14990284676e8bed305']],
  [8500, ['unresolved', 6802650, 6803310, '6791df4cc2d947242a9dd0e94b48545fcdec37d2fefbde22d6722e5796bcc6ef']],
  [8978, ['unresolved', 7019120, 7023269, '10419bd2b26b25a868729395cf419778b3c1e7640a84d4030da544eb84a83dee']],
  [9541, ['unresolved', 7901266, 7903268, '3369f7b40915dd06ac452469533a6a3363a3ecca0ccc0ea3f648d84f4bffc1b6']],
  [9738, ['unresolved', 8064010, 8095910, '61aa30532901f041c99f19640a1d176fb84a386b852bac41573d29efbeed6e5b']],
  [9857, ['unresolved', 8133639, 8134157, 'c120637759f0bf05e5bc3ee91090b4c993af0f7a916bd26fae86e510a49e9be6']],
  [11419, ['unresolved', 9064122, 9068687, '4593c827c530df5a1b85ab1d1b6290f9f6fedc2f19205768c740788ee7b2ef0d']],
  [15982, ['unresolved', 11547634, 11565362, '8d0206d169d5804cbe91203a69040cb5d0fa905ed268269edc4192d37e13d1b7']],
  [16124, ['unresolved', 11672163, 11672719, '8fb617724c014c96915e97c0ca6ac0a50f0744694b5b64a329e5e5e66fbfa5a7']],
  [17541, ['unresolved', 12338925, 12339489, '8ac422a3ac15d42a53fc4219e6dbf20e05d963ec1547d14a3fcb1a136a29e802']],
  [18255, ['unresolved', 12999017, 12999523, 'f7da6d39979dcf02a605b97179a61274531a008f46d700a8e80bca5742c0b23a']],
])

test('2.1.90 pins every first-party Anthropic-on-AWS runtime unit', {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_90_BUNDLE is not set'
      : false,
}, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), targetSha256)
  const bundle = bytes.toString('utf8')
  for (const [index, [classification, start, end, sourceHash]] of pins) {
    const region = structural.regions[index]
    assert.equal(region.classification, classification, `${index}: class`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: identity`,
    )
    assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
  }
  for (const fragment of [
    'CLAUDE_CODE_USE_ANTHROPIC_AWS',
    'CLAUDE_CODE_SKIP_ANTHROPIC_AWS_AUTH',
    'ANTHROPIC_AWS_API_KEY',
    'ANTHROPIC_AWS_BASE_URL',
    'ANTHROPIC_AWS_WORKSPACE_ID',
    'awsSecretAccessKey',
    'Claude Platform on AWS base URL',
    'Claude Platform on AWS auth skipped',
    'anthropicAws:"claude-opus-4-6"',
    'q!=="firstParty"&&q!=="anthropicAws"',
    'z==="anthropicAws"&&!process.env.ANTHROPIC_AWS_BASE_URL',
  ]) assert.ok(bundle.includes(fragment), fragment)
})

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test('materialized target90 source owns the full provider, auth, client, model, status, and propagation graph', {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}, () => {
  const providers = source('utils/model/providers.ts')
  assert.match(
    providers,
    /USE_BEDROCK[\s\S]*USE_FOUNDRY[\s\S]*USE_ANTHROPIC_AWS[\s\S]*USE_VERTEX/,
  )
  assert.ok(providers.includes("return provider === 'firstParty' || provider === 'anthropicAws'"))

  const configs = source('utils/model/configs.ts')
  for (const model of [
    'claude-3-7-sonnet-20250219',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-haiku-4-5-20251001',
    'claude-sonnet-4-20250514',
    'claude-sonnet-4-5-20250929',
    'claude-opus-4-20250514',
    'claude-opus-4-1-20250805',
    'claude-opus-4-5-20251101',
    'claude-opus-4-6',
    'claude-sonnet-4-6',
  ]) assert.ok(configs.includes(`anthropicAws: '${model}'`), model)

  const client = source('services/api/client.ts')
  for (const fragment of [
    semanticCase === caseName
      ? "if (isEnvTruthy(process.env.CLAUDE_CODE_USE_ANTHROPIC_AWS))"
      : "if (apiProvider === 'anthropicAws')",
    "import('@anthropic-ai/aws-sdk')",
    'CLAUDE_CODE_SKIP_ANTHROPIC_AWS_AUTH',
    '!process.env.ANTHROPIC_AWS_API_KEY',
    'anthropicAwsArgs.awsAccessKey = cachedCredentials.accessKeyId',
    'anthropicAwsArgs.awsSecretAccessKey = cachedCredentials.secretAccessKey',
    'anthropicAwsArgs.awsSessionToken = cachedCredentials.sessionToken',
    'return new AnthropicAws(anthropicAwsArgs)',
  ]) assert.ok(client.includes(fragment), fragment)

  const expectedByFile = new Map([
    ['utils/log.ts', ['CLAUDE_CODE_USE_ANTHROPIC_AWS']],
    semanticCase === caseName
      ? ['utils/model/model.ts', ["provider !== 'firstParty' && provider !== 'anthropicAws'"]]
      : ['utils/model/providers.ts', ["provider === 'anthropicAws'"]],
    ['utils/betas.ts', ["provider === 'firstParty' || provider === 'anthropicAws'", "provider !== 'anthropicAws'"]],
    ['utils/auth.ts', ['CLAUDE_CODE_USE_ANTHROPIC_AWS']],
    ['constants/system.ts', ["provider !== 'anthropicAws'"]],
    semanticCase === caseName
      ? ['utils/thinking.ts', ["provider === 'anthropicAws'"]]
      : ['utils/thinking.ts', ['isFirstPartyCompatibleAPIProvider(provider)']],
    ['utils/subprocessEnv.ts', ["'ANTHROPIC_AWS_API_KEY'"]],
    ['utils/managedEnvConstants.ts', ["'CLAUDE_CODE_USE_ANTHROPIC_AWS'", "'ANTHROPIC_AWS_BASE_URL'", "'ANTHROPIC_AWS_WORKSPACE_ID'", "'ANTHROPIC_AWS_API_KEY'", "'CLAUDE_CODE_SKIP_ANTHROPIC_AWS_AUTH'"]],
    ['utils/status.tsx', ["apiProvider === 'anthropicAws'", 'Claude Platform on AWS base URL', 'Workspace ID', 'Claude Platform on AWS auth skipped']],
    ['entrypoints/sdk/coreSchemas.ts', ["'anthropicAws'"]],
    ['utils/swarm/spawnUtils.ts', ["'CLAUDE_CODE_USE_ANTHROPIC_AWS'", "'ANTHROPIC_AWS_WORKSPACE_ID'", "'ANTHROPIC_AWS_BASE_URL'", "'ANTHROPIC_AWS_API_KEY'", "'CLAUDE_CODE_SKIP_ANTHROPIC_AWS_AUTH'"]],
    ['tools/WebSearchTool/WebSearchTool.ts', ["provider === 'firstParty' || provider === 'anthropicAws'"]],
    ['services/api/claude.ts', ["provider === 'anthropicAws'", '!process.env.ANTHROPIC_AWS_BASE_URL']],
    ['utils/apiPreconnect.ts', ['CLAUDE_CODE_USE_ANTHROPIC_AWS']],
    ['utils/model/deprecation.ts', ['anthropicAws: null']],
    ['main.tsx', ['CLAUDE_CODE_USE_ANTHROPIC_AWS', 'CLAUDE_CODE_SKIP_ANTHROPIC_AWS_AUTH']],
  ])
  for (const [file, fragments] of expectedByFile) {
    const body = source(file)
    for (const fragment of fragments) {
      assert.ok(body.includes(fragment), `${file}: ${fragment}`)
    }
  }
})

test('the bundled AWS SDK/sigv4 runtime remains a pinned dependency build-input gap', {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_90_BUNDLE is not set'
      : false,
}, () => {
  const bundle = fs.readFileSync(targetBundlePath, 'utf8')
  assert.ok(bundle.includes('sigv4'))
  assert.ok(source('services/api/client.ts').includes("import('@anthropic-ai/aws-sdk')"))
  assert.equal(fs.existsSync(path.join(repositoryRoot, 'package.json')), false)
})
