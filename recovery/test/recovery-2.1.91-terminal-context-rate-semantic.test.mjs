import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.90-to-2.1.91'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_91_BUNDLE
const targetSha256 =
  'b4bf141f30cf8b40196295816c7a6b9d01a36e906908d73a9f9a865ce4cdf816'
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
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_91_BUNDLE is not set'
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
  [5219, ['unresolved', 3787681, 3788352, '05b08ef159a5049d1835a8ac51e49e44f1acc730474cb8cd74e167027b0fd17e']],
  [5229, ['unresolved', 3792950, 3794539, '8a73744f2dbdb6235e57d6db90f578af4def97250602d6b71a9df8c4efbfb82c']],
  [5484, ['unresolved', 4014432, 4015135, 'a2e1e632e4813ede170aafbc0cdb541eda21be9ab10669914ea4ac51d712b587']],
  [6288, ['unresolved', 4431092, 4431326, '61134e1dbff5e38e35c097ccc1f9f7ff57dbf6e850599bcf663538f212f09ce0']],
  [6788, ['unresolved', 4969905, 4970157, '22e287c8fb85586799516431340cf7311f241fea3439dd77a2e02345d61b06c8']],
  [6789, ['unresolved', 4970157, 4970243, '815f8ebceedd2b3a33cb5a428d141b6f74223315a266eb47dc33536f58e8ba4a']],
  [6790, ['unresolved', 4970243, 4970369, '3fdd8deffdffc9b882bf270734f1c2f81646e0086c2ab12dcfca201994acfd5a']],
  [6791, ['unresolved', 4970369, 4973202, 'eef83c873275adb9a43db9b91292775a92cde4a21676b1b914f325a9e91c0ee3']],
  [7691, ['unresolved', 6484197, 6484518, '7b825fbb2bf2da28dc82f856a82863176b3690e5f60232f75bc2ea02dbe5408b']],
  [7705, ['unresolved', 6487230, 6488162, '5da2a62e89e4734e712b86f2828c44b0233bfcb7d1bb7c4d293c065ffcbe98c9']],
  [10101, ['unresolved', 8211877, 8213281, '664acaf236d77e59dd8452159718af4f550acc8c60e35a19ace2d3cb0e9fdb0f']],
  [13500, ['unresolved', 10275808, 10277631, '86acdddb9e782e33436e99c8e25b2046dd2c710dae5cc50461c80b6ea4bb56b3']],
  [15347, ['unresolved', 11219820, 11222268, 'abf3630824d7a4086e05a47e77ba6e80510e8c9ac1f9cde3bbe92c1b84156993']],
  [15371, ['unresolved', 11226170, 11226267, '307ae315e7d71a77c975d16ce1354e4f710f583747e42c2e6009ca5c496aa23a']],
  [17585, ['unresolved', 12356359, 12357668, 'c67b03814ca86d978671e2562cdf2aa3e2fc240243a0b3a2e5325f4b695f3eeb']],
])

test('2.1.91 pins terminal, date, rate-limit, and Stats integration units', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), targetSha256)
  const bundle = bytes.toString('utf8')
  for (const [index, [classification, start, end, sourceHash]] of pinnedUnits) {
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
    'tengu_slate_finch',
    'tengu_garnet_plover',
    'try /model sonnet · ~2× runway',
    'anthropic-ratelimit-unified-upgrade-paths',
    'upgrade_plan',
    'defaultTab:"Stats"',
  ]) {
    assert.ok(bundle.includes(fragment), fragment)
  }
})

test('source owns exact terminal theme notification lifecycle', sourceOptions, () => {
  assertFragments('src/ink/termio/dec.ts', [
    'THEME_NOTIFY: 2031',
    'ENABLE_THEME_NOTIFY = decset(DEC.THEME_NOTIFY)',
    'DISABLE_THEME_NOTIFY = decreset(DEC.THEME_NOTIFY)',
  ])
  assertFragments('src/ink/parse-keypress.ts', [
    '/^\\x1b\\[\\?997;([12])n$/',
    "type: 'themeNotify'",
    "dark: m[1] === '1'",
  ])
  assertFragments('src/ink/components/App.tsx', [
    'this.props.stdout.write(ENABLE_THEME_NOTIFY)',
    'this.props.stdout.write(DISABLE_THEME_NOTIFY)',
  ])
  assertFragments('src/ink/ink.tsx', ['writeSync(1, DISABLE_THEME_NOTIFY)'])
})

test('source owns exact proxy date punctuation and formatting matrix', sourceOptions, () => {
  const context = assertFragments('src/context.ts', [
    'const DATE_PROXY_XOR_KEY = 91',
    "timezone === 'Asia/Shanghai' || timezone === 'Asia/Urumqi'",
    'hostname === domain || hostname.endsWith(`.${domain}`)',
    'hostname.includes(keyword)',
    "date.replace(/-/g, '/')",
    "? 'ʼ'",
    "? 'ʹ'",
    ": '’'",
    'return `Today${possessive}s date is ${formattedDate}.`',
  ])
  const hostInventory = context.match(
    /const DATE_PROXY_HOSTS_ENCODED =\s*'([^']+)'/,
  )?.[1]
  const labInventory = context.match(
    /const DATE_PROXY_LAB_KEYWORDS_ENCODED =\s*'([^']+)'/,
  )?.[1]
  assert.equal(hostInventory?.length, 2684)
  assert.equal(
    sha256(hostInventory),
    'fa399cb04f69c0e3cefc13a523e12a720d2493e8fd21153f7e6788e57fb1dc81',
  )
  assert.equal(labInventory?.length, 116)
  assert.equal(
    sha256(labInventory),
    '381cf6ddbe8570e7ca6d78afd693183e846cb1f657db97cfdd9f5e8ef8aa54b9',
  )
})

test('source owns effort and rate-limit lever and server upgrade gates', sourceOptions, () => {
  assertFragments('src/utils/effort.ts', [
    "value === 'high'",
    "'tengu_slate_finch'",
    ' · burns fastest — medium handles most tasks',
  ])
  assertFragments('src/services/rateLimitMessages.ts', [
    "'tengu_garnet_plover'",
    "limits.rateLimitType !== 'seven_day'",
    "model.includes('opus')",
    "text: 'try /model sonnet · ~2× runway'",
    "text: 'try /effort medium'",
  ])
  assertFragments('src/services/claudeAiLimits.ts', [
    "'anthropic-ratelimit-unified-upgrade-paths'",
    "upgradePathsHeader.split(',').map(path => path.trim())",
    '...(upgradePaths && { upgradePaths })',
  ])
  assertFragments('src/components/messages/RateLimitMessage.tsx', [
    semanticCase === caseName
      ? 'claudeAiLimits.upgradePaths !== undefined'
      : 'upgradePaths !== undefined',
    semanticCase === caseName
      ? "!claudeAiLimits.upgradePaths.includes('upgrade_plan')"
      : "!upgradePaths.includes('upgrade_plan')",
    'serverHidesUpgrade',
  ])
  assertFragments('src/commands/rate-limit-options/rate-limit-options.tsx', [
    'const serverProvidesUpgradePaths = upgradePaths !== undefined',
    semanticCase === caseName
      ? 'upgradePaths.includes("overage")'
      : "upgradePaths.includes('overage')",
    semanticCase === caseName
      ? 'upgradePaths.includes("upgrade_plan")'
      : "upgradePaths.includes('upgrade_plan')",
  ])
  assertFragments('src/hooks/notifs/useRateLimitWarningNotification.tsx', [
    'getRateLimitLeverHint(claudeAiLimits, model, effortValue)',
    "logEvent('tengu_rate_limit_lever_hint'",
  ])
})

test('source integrates Stats into Settings and routes /stats to it', sourceOptions, () => {
  const settings = assertFragments('src/components/Settings/Settings.tsx', [
    "defaultTab: 'Status' | 'Config' | 'Usage' | 'Stats' | 'Gates'",
    '<Tab key="stats" title="Stats"><Stats onClose={onClose} /></Tab>',
    'selectedTab !== "Stats"',
  ])
  if (semanticCase === caseName) {
    assert.ok(
      settings.includes(
        'defaultTab !== "Config" && defaultTab !== "Gates" && defaultTab !== "Stats"',
      ),
      '2.1.91 starts the Stats pane with its interactive content focused',
    )
  }
  assertFragments('src/commands/stats/stats.tsx', [
    'async (onDone, context)',
    '<Settings onClose={onDone} context={context} defaultTab="Stats" />',
  ])
})
