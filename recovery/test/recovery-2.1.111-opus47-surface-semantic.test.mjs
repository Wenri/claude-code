import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.110-to-2.1.111'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const historical = semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_111_BUNDLE
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

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_110_BUNDLE and CLAUDE_CODE_2_1_111_BUNDLE are required'
      : false,
}

const units = new Map([
  [3102, ['VariableDeclaration', 2314227, 2316990, '0d9058389b2199e9d799c88ddea454ace1a100bd3bb9c2ccf5a73214c1a1088f']],
  [4615, ['FunctionDeclaration', 3481393, 3481734, 'd9802a3bea52a63888e088730cae6cb1891233e2566b577d84516b349e183cab']],
  [5063, ['FunctionDeclaration', 3739248, 3740054, '2a035c4a6d33851eabb4e2f837b5aff64d200bacdd48ee078da3e02135e6a030']],
  [6804, ['FunctionDeclaration', 4722578, 4722678, '6be72361f5cdbe447ac19e6add1cb6aa29fb94529baa875bbd6886167f99755c']],
  [6807, ['FunctionDeclaration', 4722917, 4723001, 'e5f79a487a4af005148c3f2fcee951b8f10b74ff3c801e60fd4de32eef5250cd']],
  [6811, ['FunctionDeclaration', 4723234, 4723472, 'b38d4d90ebbe62a3e4a49a6f086672f2779ac6a994dae52ee64a6215f9b6d04c']],
  [6812, ['FunctionDeclaration', 4723472, 4723601, '2c45994627afb8116fa706b1171c3de068878ed906aa81bbd7f0cbfe6347def8']],
  [6817, ['FunctionDeclaration', 4723884, 4724301, 'ee84560c4aa0576cb7755aa7ff30c7888adb4eb2d65162e334c02d1966b81e2d']],
  [6819, ['FunctionDeclaration', 4724535, 4724709, 'fd9022780a66a7383902c5d9f69460dcc538f7d4ee5af881b6dfa8e48413d582']],
  [6821, ['VariableDeclaration', 4724720, 4725040, 'b02488c7c4104272e0c1039e24f6d7111e237bcf4c64f24f53078cb710206911']],
  [6829, ['FunctionDeclaration', 4727633, 4727967, '4f9da846b8c4be31ed5dee7163f8c8f7db2da07cf9e3588314acc5c13695f229']],
  [6879, ['FunctionDeclaration', 4747860, 4748277, '3bf0cc471f1da62bda5ed846db9113754378943e5722665e7313658f26626688']],
  [8428, ['FunctionDeclaration', 5713770, 5713892, '233f58751d533e11de0165f555d8f415cd17c49a96a42a0223ccd1eb78098edb']],
  [8429, ['FunctionDeclaration', 5713892, 5714014, 'faed1d98d0a05a105ae8523f567e2e7006644569f5b978e7bbe12a037f0bd1b7']],
  [9540, ['FunctionDeclaration', 6988197, 6988952, 'fdb1c48ac143c48d3d5b0b0a43b86065ddca9ed88f7b3fd9e55e6a0bd71629d7']],
  [9658, ['FunctionDeclaration', 7056120, 7056713, '2f0de70e06bf7df7bf657980aab5c435c3fa1820eb840f0f428ba9b9d6fb3498']],
  [10484, ['FunctionDeclaration', 8159402, 8162003, '8f6bb4178fada1dfbc8e48c00ed213702060442f82a98ff3b78415db6858bb1a']],
  [10485, ['FunctionDeclaration', 8162003, 8163286, 'fe07a63d33f990b04422fe066cb73d3525eac2f6f9cbe6b2cab45d2547179189']],
  [10540, ['FunctionDeclaration', 8187946, 8190457, '83028025334cfbb6a044527e92c41b4bae773d077091ebb09d43403d1bc6184f']],
  [10541, ['FunctionDeclaration', 8190457, 8191589, '0c95cb698fc9712349076efc39a90277770fe93b14ec5e5db3c6e08cc41ccca9']],
  [10726, ['FunctionDeclaration', 8283589, 8283708, 'e18c630ba4dcbdb81bdee25123d6d4d678a0d840e66d13048b0c96f24dffd580']],
  [12116, ['FunctionDeclaration', 9161824, 9162241, '4c2eb20a982ba8b432f6a9dfeccb1411aea9973ffbe2eb728ada5f33bdd8dec5']],
  [13514, ['FunctionDeclaration', 9876676, 9877207, 'bbef55bacb436e33040bd8aaedab05da554f56eaac6cbe2ff76444332721dbf7']],
  [15271, ['FunctionDeclaration', 11009105, 11009210, '87aa57d746e892e0e22351f782cfbbabff762aa60941d2d724b1dd5b9ce96e14']],
  [15274, ['FunctionDeclaration', 11009287, 11009407, '8387b6532cf51da6265b46740a7f4d447048a36d1dbf14d9b51bf51f02952466']],
  [15276, ['FunctionDeclaration', 11009895, 11010139, '0c3fa6b32571af773cfee1aad5713d6e069b7aa445da36eac6c7f02ce263d1f4']],
  [15277, ['VariableDeclaration', 11010139, 11010264, '5e917d3be30e0693001219f13b38bf1100c2d41a54c535f028a5de44165183c1']],
  [16204, ['FunctionDeclaration', 11464251, 11465431, '28f14964f3872b3ba057930503e4732ce9d3205917a223b58fc1b4b9d526e072']],
  [16961, ['FunctionDeclaration', 11809666, 11809761, 'a2771f905741f4199dfad213b9bd6a921f6b68921d0a81dde720135efa189c6d']],
  [16982, ['FunctionDeclaration', 11827179, 11828482, '629b68e353d4ee9b176d0024bd1cb403b233f00efeb3cd6b5643dcbe78d29ab9']],
  [16983, ['FunctionDeclaration', 11828482, 11828893, '6986adfdb8c1b50d341def11be72aa910b3ec04e30b85e0ee5218bdf18c86832']],
  [17057, ['FunctionDeclaration', 11850014, 11870777, 'b7045192f3b2b324776802515f20ec1e84eb453715f3cd893556677305fd3eef']],
  [18668, ['VariableDeclaration', 12645875, 12646422, '7b5be4259d8438c7b0642b6c80390991b7582375f8657d8f3f4f36d7bf42bb3a']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test('2.1.111 pins every structural unit in the Opus 4.7 launch surface', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
  )
  assert.equal(
    sha256(targetBytes),
    '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0',
  )
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  for (const [index, [nodeType, start, end, sourceHash]] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.equal(region.target.nodeType, nodeType, `${index}: node type`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(target.slice(start, end)), sourceHash, `${index}: bytes`)
  }

  const introduced = new Map([
    ['Welcome to Opus 4.7 xhigh!', 3],
    ['Opus 4.7 is here', 1],
    ['tengu_opus47_launch_shown', 1],
    ['opus47LaunchSeenCount', 3],
    ['unpinOpus47LaunchEffort', 13],
    ['January 2026', 1],
    ['Pin the working models with 1M context', 2],
    ['Model updated to Opus 4.7', 2],
    ['Opus with 1M context is not available', 1],
  ])
  for (const [fragment, count] of introduced) {
    assert.equal(occurrences(baseline, fragment), 0, `baseline: ${fragment}`)
    assert.equal(occurrences(target, fragment), count, `target: ${fragment}`)
  }

  const configsUnit = target.slice(2314227, 2316990)
  const opus47ProviderInitializer =
    'firstParty:"claude-opus-4-7",bedrock:"us.anthropic.claude-opus-4-7",vertex:"claude-opus-4-7",foundry:"claude-opus-4-7",anthropicAws:"claude-opus-4-7",mantle:"anthropic.claude-opus-4-7"'
  assert.equal(baseline.includes(opus47ProviderInitializer), false)
  assert.equal(configsUnit.includes(opus47ProviderInitializer), true)
  assert.equal(occurrences(configsUnit, '"claude-opus-4-7"'), 4)
  assert.equal(occurrences(configsUnit, '"us.anthropic.claude-opus-4-7"'), 1)
  assert.equal(occurrences(configsUnit, '"anthropic.claude-opus-4-7"'), 1)
  assert.equal(occurrences(configsUnit, 'opus47:'), 1)
  for (const fragment of [
    'claude-opus-4-7',
    'us.anthropic.claude-opus-4-7',
    'anthropic.claude-opus-4-7',
    'opus47:',
  ]) {
    assert.equal(baseline.includes(fragment), false, `baseline: ${fragment}`)
  }
  assert.match(
    target.slice(11009105, 11009210),
    /firstParty.*opus47LaunchSeenCount/,
  )
  assert.match(target.slice(11010139, 11010264), /tgY=12/)
  assert.match(
    target.slice(4727633, 4727967),
    /xhigh.*try \/effort medium/,
  )
  assert.match(
    target.slice(11850014, 11870777),
    /CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING.*opus-4-6.*sonnet-4-6.*type:"adaptive"/s,
  )
})

test('source owns the provider, effort, fallback, and model-copy behavior', sourceOptions, () => {
  const assertions = new Map([
    ['utils/betas.ts', ["provider !== 'firstParty' && provider !== 'anthropicAws'", '/^claude-opus-4-7/']],
    ['services/rateLimitMessages.ts', ["effort === 'xhigh'", "text: 'try /effort medium'"]],
    ['services/api/errors.ts', ["m.includes('opus-4-7')", "m.includes('opus-4-5')", 'getModelStrings().opus41']],
    ['utils/settings/applySettingsChange.ts', ['unpinOpus47LaunchEffort', 'prev.awaySummaryEnabled !== awaySummaryEnabled']],
    ['utils/commitAttribution.ts', ["includes('opus-4-7')", "return 'claude-opus-4-7'"]],
    ['utils/attribution.ts', ["'Claude Opus 4.7'"]],
    ['utils/model/validateModel.ts', ["includes('opus-4-5')", 'getModelStrings().opus41']],
    [
      historical
        ? 'commands/model/model.tsx'
        : 'commands/model/modelCommand.ts',
      ['Opus with 1M context is not available for your account.'],
    ],
    ['hooks/notifs/useModelMigrationNotifications.tsx', ['Model updated to Opus 4.7']],
    ['services/api/claude.ts', [
      'const forceBudgetThinking =',
      "canonicalModel.includes('opus-4-6')",
      "canonicalModel.includes('sonnet-4-6')",
      'modelSupportsAdaptiveThinking(options.model) &&',
      '!forceBudgetThinking',
    ]],
    ['constants/prompts.ts', [
      "includes('opus-4-7')",
      "getFeatureValue_CACHED_MAY_BE_STALE(",
      "'tengu_loud_sugary_rock'",
      "return 'January 2026'",
      'The most recent Claude model family is Claude 4.X.',
    ]],
    ['utils/advisor.ts', ["m.includes('opus-4-7')", "m.includes('sonnet-4-6')"]],
    ['utils/model/agent.ts', ['applyMergedOpusContext', 'isOpus1mMergeEnabled()', "`${model}[1m]`"]],
  ])
  for (const [relative, fragments] of assertions) {
    const contents = source(relative)
    for (const fragment of fragments) {
      assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
    }
  }

  for (const relative of [
    'components/BedrockSetupWizard.tsx',
    'components/VertexSetupWizard.tsx',
  ]) {
    const contents = source(relative)
    for (const fragment of [
      'modelSupports1M',
      'existingPin',
      'Pin the working models with 1M context',
      "value: 'pin1m'",
      "key={settled ? 'settled' : 'pending'}",
      "'(currently pinned)'",
      "'(built-in default)'",
      "'(selected)'",
    ]) {
      assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
    }
  }
})

test('source preserves the introduction-era and latest logo variants separately', sourceOptions, () => {
  const owner = source('components/LogoV2/Opus47LaunchUpsell.tsx')
  const logo = source('components/LogoV2/LogoV2.tsx')
  const condensed = source('components/LogoV2/CondensedLogo.tsx')

  if (historical) {
    assert.ok(owner.includes('const MAX_IMPRESSIONS = 12'))
    assert.equal(owner.includes('config.unpinOpus47LaunchEffort'), false)
    assert.ok(owner.includes("title: 'Opus 4.7 is here'"))
    assert.ok(owner.includes('createOpus47LaunchFeed'))
    assert.ok(owner.includes('HIGHLIGHTED_PREFIX.length < text.length'))
    assert.ok(logo.includes('createOpus47LaunchFeed()'))
    assert.ok(
      logo.includes(
        'showOpus47LaunchUpsell && !showOnboarding && !isCondensedMode',
      ),
    )
    assert.ok(
      condensed.includes('<Opus47LaunchUpsell maxWidth={textWidth} />'),
    )
  } else {
    assert.ok(owner.includes('const MAX_IMPRESSIONS = 5'))
    assert.ok(owner.includes('config.unpinOpus47LaunchEffort'))
    assert.ok(owner.includes("const AVAILABLE_HEADLINE = 'Opus 4.7 xhigh is now available!'"))
    assert.ok(owner.includes("? ' · /effort to tune speed vs. intelligence'"))
    assert.ok(owner.includes(": ' · /model to switch'"))
    assert.ok(logo.includes("getCanonicalName(model) === 'claude-opus-4-7'"))
    assert.ok(logo.includes('<Opus47LaunchUpsell isOnOpus47={isOnOpus47} />'))
    assert.equal(owner.includes('createOpus47LaunchFeed'), false)
  }
})
