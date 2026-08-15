import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.107-to-2.1.108'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_107_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_108_BUNDLE
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_107_BUNDLE and CLAUDE_CODE_2_1_108_BUNDLE are required'
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
  [7561, [5318058, 5322770, '07a87fdc4f515f467a44e1225d23efa85280d36835944adc9ea60f4eebada2e9']],
  [7574, [5325860, 5330404, 'dd78ba3a169f3ce8a977654b3ac284d7b2de57f158c9d89baf5d240a119af261']],
  [14088, [10160790, 10160900, '236b9703ef4bbd888fe904ae14a4808d1bd7bfcd6a93171b773c1c9b4ce4c27c']],
  [14089, [10160900, 10160990, '85e2e310d95b3422d3ef414f9943b64e0836ea263aa4988564a8d037314da0bd']],
  [14090, [10160990, 10161147, '8cb51654cbace2eda3a4326ec54ac3ae8124df03f56a9d0fa682450251268f1c']],
  [14091, [10161147, 10161602, '984c8b3c1e1d4eab030a69e37fb14d8e2f819268b3d8b2f5f12e8787d41691d5']],
  [14092, [10161602, 10162077, '0482a08b8dbde8ac5aaae80b4e734651d1ff88be3f7623522e9c061532ee1b31']],
  [14093, [10162077, 10162898, '9dd92b14646cf86bf4231713f986728f465018468a038d0d177e989863098a07']],
  [14094, [10162898, 10163026, '4680308e5304210a832ed9306c936e5a8c37a757cb7f6015bdb0962a996c79b9']],
  [14095, [10163026, 10163117, 'd782079e024cf786ef4f6555dabcefe26d74dfe45bf332e12c28695b0181d68f']],
  [14096, [10163117, 10164122, '580eae283feb468930aedda5d2d80a7f6296c9705878935c94e8588768709e45']],
  [14097, [10164122, 10164284, 'cf41f3912446a06cb397a9326dcf067fe54f723becd9e99edacb99553163f942']],
  [14098, [10164284, 10164602, '86640080dbf10e61312379ca28b5634243e39925b8db003408ee0e96ff93a905']],
  [14099, [10164602, 10164826, '337b5d3fa1cab062f4f1e575abc827dec1654f5319e5eafe197598e0fafbfb85']],
  [14100, [10164826, 10165378, '066edfda67718ef8bcd4d1901713f41f722739da879e4796d04333276aee9ac1']],
  [14101, [10165378, 10165417, '997f3a66a98a9dd602279822dc56966fc4b3fd45a9fc40e10c7fd018135d6eb9']],
  [14102, [10165417, 10165483, '546ecd92249f6997ef19a3656c414abac6749389f22f84ddeca73a69a0daa965']],
  [14103, [10165483, 10165587, '2fa591f74e9fd3e73f211587294fefbb092dca2d58691ff473b0e7e41feed8fc']],
  [14104, [10165587, 10168599, '134e0beea3497c9938231037a2233ddbb56c4b179d32b345b7eafba7f2c6b165']],
  [14105, [10168599, 10168686, '46c9be7aae6e49148b42cc6097a67a125cd3127a990d358c7614eff9d9bb4a87']],
  [14106, [10168686, 10169072, '8780a08b3fe7654e5e79fb58f12b6907f627b444bfa8f01d434a4f84f6282bc0']],
  [14107, [10169072, 10169861, 'c984d267d56151c7e434999f96d64f5b4c14161d8dd24c3250ac3baafaca264b']],
  [14108, [10169861, 10169887, '60845a4ed14890e0f822c102157e0f87e7d2370828badac3f0b943cf985bc725']],
  [14109, [10169887, 10171102, '88694eb227ebd210b2db884d64d58c8787196d0b48b3f868dbfd61eb28e4cfbb']],
  [14111, [10172845, 10174689, '9ebcc809afea43eba19e607530ccdc7fa3558f7a203c2e153db80c4c9b362d08']],
])

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
  const contents = source(relative)
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
  }
  return contents
}

test('target 2.1.108 pins every usage-contributor structural unit', bundleOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baseline),
    '6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844',
  )
  assert.equal(
    sha256(targetBytes),
    'dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73',
  )
  const target = targetBytes.toString('utf8')
  for (const [index, [start, end, sourceHash]] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(target.slice(start, end)), sourceHash, `${index}: bytes`)
  }
})

test('the complete contributor scanner appears at the authenticated 107 to 108 boundary', bundleOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  for (const fragment of [
    'tengu_birch_compass',
    "What's contributing to your limits usage?",
    'Cannot compute breakdown — ',
    'sessions active for 8+ hours',
  ]) {
    assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
    assert.equal(target.includes(fragment), true, `${fragment}: target`)
  }
})

test('source owns the exact transcript discovery, parsing, and weighting pipeline', sourceOptions, () => {
  const owner = assertFragments('src/components/Settings/UsageContributors.tsx', [
    'const MAX_FILE_BYTES = 200 * 1024 * 1024',
    'const FILE_BATCH_SIZE = 16',
    'const MIN_SIGNIFICANT_PERCENT = 10',
    'const TIMESTAMP_RE = /"timestamp":"([^\"]+)"/',
    'const REQUEST_ID_RE = /"requestId":"([^\"]+)"/',
    "scanRecentUsageRecords(7)",
    'Date.now() - 24 * 60 * 60 * 1000',
    "join(projectDir, sessionDirectory, 'subagents')",
    "readdir(directory, { recursive: true })",
    "if (fileStat.size > MAX_FILE_BYTES) return 'oversized'",
    "line.includes('\"type\":\"assistant\"')",
    "line.includes('\"usage\":{')",
    "line.includes('\"isSidechain\":true')",
    'REQUEST_ID_RE.exec(line)?.[1]',
    'MESSAGE_ID_RE.exec(line)?.[1]',
    'UUID_RE.exec(line)?.[1]',
    'record.uncached * 10',
    'record.cacheCreate * 12.5',
    'record.output * 50',
    'record.modelTier',
    "normalized.includes('opus')",
    "normalized.includes('haiku')",
  ])
  assert.ok(
    owner.indexOf("REQUEST_ID_RE.exec(line)?.[1]") <
      owner.indexOf("MESSAGE_ID_RE.exec(line)?.[1]"),
  )
})

test('source owns all five target behavior classifiers and thresholds', sourceOptions, () => {
  const owner = assertFragments('src/components/Settings/UsageContributors.tsx', [
    "| 'cache_miss'",
    "| 'long_context'",
    "| 'subagent_heavy'",
    "| 'high_parallel'",
    "| 'cron'",
    'uncached > 100_000',
    'inputTokens > 150_000',
    'session.subCost / session.cost > 0.5',
    'window.sessionIds.size >= 4',
    'session.hours.size >= 8',
    '(behavior.cost / stats.totalCost) * 100 >= MIN_SIGNIFICANT_PERCENT',
    '>100k-token cache miss',
    '>150k context',
    'subagent-heavy sessions',
    '4+ sessions ran in parallel',
    'sessions active for 8+ hours',
  ])
  assert.ok(owner.indexOf("key: 'cache_miss'") < owner.indexOf("key: 'cron'"))
})

test('source owns the target gate, suspense/error states, and Usage reachability', sourceOptions, () => {
  assertFragments('src/keybindings/defaultBindings.ts', [
    "d: 'settings:periodDay'",
    "w: 'settings:periodWeek'",
  ])
  assertFragments('src/keybindings/schema.ts', [
    "'settings:periodDay'",
    "'settings:periodWeek'",
  ])
  assertFragments('src/components/Settings/UsageContributors.tsx', [
    "getFeatureValue_CACHED_MAY_BE_STALE('tengu_birch_compass', false)",
    "subscriptionType !== 'pro' && subscriptionType !== 'max'",
    '<Suspense fallback={fallback}>',
    'Scanning local sessions…',
    'Cannot compute breakdown — {result.oversizedFiles.length} session',
    "result.oversizedFiles.slice(0, 3)",
    "Last {period === 'day' ? '24h' : '7d'}",
    'Nothing over {MIN_SIGNIFICANT_PERCENT}% in this period',
    "What's contributing to your limits usage?",
    'Approximate, based on local sessions on this machine — does not include',
    'action="settings:periodDay"',
    'action="settings:periodWeek"',
  ])
  assertFragments('src/components/Settings/Usage.tsx', [
    "import { UsageContributors } from './UsageContributors.js'",
    '<UsageContributors maxWidth={maxWidth} />',
  ])
})
