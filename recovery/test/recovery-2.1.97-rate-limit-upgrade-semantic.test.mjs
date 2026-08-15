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

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function assertFragments(relative, fragments) {
  const text = source(relative)
  for (const fragment of fragments) {
    assert.ok(text.includes(fragment), `${relative}: ${fragment}`)
  }
  return text
}

const pinnedUnits = new Map([
  [
    7744,
    [
      6487679,
      6488611,
      '4ca2c4f2d750b855f7f3629bd1a68045d15938799642f907ef2c3d8022fced13',
      'matched',
    ],
  ],
  [
    11313,
    [
      8778680,
      8779404,
      '53ae3df2c2a6100c854230f380b7b6ad324c53b5677173e6ea971b9391619416',
      'unresolved',
    ],
  ],
  [
    11314,
    [
      8779404,
      8781541,
      'c5265372f90edb5cb05fbf1df982d8e9800dcd3d6f1996f1bba6e583bad49c98',
      'unresolved',
    ],
  ],
  [
    15622,
    [
      11377733,
      11380731,
      '34f9aba89b8cc9cfada53f7e87d20f37da029a5151b21ba873873e9f945ee483',
      'unresolved',
    ],
  ],
  [
    17912,
    [
      12497777,
      12554545,
      '22ab8c7e7e0c98d3801202dd3635f726b32dce2beb34c81b30f7fdd59f889114',
      'unresolved',
    ],
  ],
])

test(
  '2.1.97 rate-limit evidence pins the server-path, upsell, menu, and callback units',
  bundleOptions,
  () => {
    const bundleBytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(bundleBytes), targetSha256)
    const bundle = bundleBytes.toString('utf8')

    for (const [index, [start, end, sourceHash, classification]] of pinnedUnits) {
      const region = structural.regions[index]
      assert.equal(region.classification, classification, `${index}: classification`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, sourceHash],
        `${index}: structural identity`,
      )
      assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
    }

    for (const fragment of [
      'anthropic-ratelimit-unified-upgrade-paths',
      'tengu_coral_beacon',
      'Opening your options\u2026',
      'upgrade_plan',
      'Switch to Team plan',
      'tengu_rate_limit_options_menu_select_team',
      'https://claude.ai/create/team',
    ]) {
      assert.ok(bundle.includes(fragment), fragment)
    }
    assert.equal(
      bundle.split('anthropic-ratelimit-unified-upgrade-paths').length - 1,
      1,
      'published runtime has one canonical server upgrade-path parser',
    )
  },
)

test(
  'source preserves server-gated upsell and the complete Team-plan menu behavior',
  sourceOptions,
  () => {
    const message = assertFragments(
      'src/components/messages/RateLimitMessage.tsx',
      [
        "'tengu_coral_beacon'",
        "upgradePaths.includes('upgrade_plan')",
        "upgradePaths.includes('overage')",
        "subscriptionType !== 'enterprise'",
        "menuState === 'pending'",
        "onOpenRateLimitOptions() ? 'opened' : 'blocked'",
        'serverHidesUpgrade',
        'serverHidesOverage',
      ],
    )
    assert.ok(
      message.indexOf('shouldAutoOpenRateLimitOptionsMenu)') <
        message.indexOf('const hasOverage'),
      'auto-open status takes precedence over tier-specific upsell text',
    )

    assertFragments(
      'src/commands/rate-limit-options/rate-limit-options.tsx',
      [
        "const TEAM_UPGRADE_URL = 'https://claude.ai/create/team'",
        "| 'team'",
        "upgradePaths.includes('overage')",
        "upgradePaths.includes('upgrade_plan')",
        "isMax20x ? 'Switch to Team plan' : 'Upgrade to Team plan'",
        "value: 'team'",
        "'tengu_rate_limit_options_menu_select_team'",
        'openBrowser(TEAM_UPGRADE_URL)',
        'Run /login after upgrading to use your new plan.',
        'Could not open a browser. Visit ${TEAM_UPGRADE_URL}',
      ],
    )
  },
)

test(
  'source parses server upgrade paths and propagates the boolean open contract',
  sourceOptions,
  () => {
    const limits = assertFragments('src/services/claudeAiLimits.ts', [
      'upgradePaths?: string[]',
      "'anthropic-ratelimit-unified-upgrade-paths'",
      "upgradePathsHeader.split(',').map(path => path.trim())",
      '...(upgradePaths && { upgradePaths })',
    ])
    assert.equal(
      limits.split('anthropic-ratelimit-unified-upgrade-paths').length - 1,
      1,
      'source retains the target canonical header parser only',
    )

    for (const relative of [
      'src/components/Messages.tsx',
      'src/components/Message.tsx',
      'src/components/MessageRow.tsx',
      'src/components/messages/AssistantTextMessage.tsx',
      'src/components/messages/RateLimitMessage.tsx',
    ]) {
      assertFragments(relative, [
        'onOpenRateLimitOptions?: () => boolean',
      ])
    }
    assertFragments('src/screens/REPL.tsx', [
      'if (hasOpenedRateLimitOptionsRef.current) return false',
      "onSubmitRef.current('/rate-limit-options'",
      'return true',
    ])
  },
)

test('upsell decision table matches the target branch ordering', () => {
  function targetDecision({
    show = true,
    max = false,
    overage = false,
    opening = false,
    team = false,
    billing = false,
    hidesUpgrade = false,
    hidesOverage = false,
  } = {}) {
    if (!show) return null
    if (opening) return 'opening'
    const hasOverage = overage && !hidesOverage
    if (max) return hasOverage ? 'extra' : 'login'
    if (team) {
      if (!hasOverage) return null
      return billing ? 'extra' : 'request'
    }
    if (hidesUpgrade) return hasOverage ? 'extra' : null
    return hasOverage ? 'upgrade-or-extra' : 'upgrade'
  }

  assert.equal(targetDecision({ show: false, opening: true }), null)
  assert.equal(targetDecision({ opening: true, max: true }), 'opening')
  assert.equal(targetDecision({ max: true, overage: true }), 'extra')
  assert.equal(targetDecision({ max: true }), 'login')
  assert.equal(targetDecision({ team: true, overage: true }), 'request')
  assert.equal(
    targetDecision({ team: true, overage: true, billing: true }),
    'extra',
  )
  assert.equal(targetDecision({ team: true, overage: true, hidesOverage: true }), null)
  assert.equal(targetDecision({ hidesUpgrade: true }), null)
  assert.equal(targetDecision({ hidesUpgrade: true, overage: true }), 'extra')
  assert.equal(targetDecision({ overage: true }), 'upgrade-or-extra')
  assert.equal(targetDecision(), 'upgrade')
})
