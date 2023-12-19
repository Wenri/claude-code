import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
const latestBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
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

const targetUnits = new Map([
  [
    10745,
    [
      8421732,
      8422005,
      'd074b4cc72d321e4d5363398d0baca6a3e2eda24ce7462fb464caff43e32ce32',
    ],
  ],
  [
    10746,
    [
      8422005,
      8422085,
      'acf749b30d36cb7e644e9847537f008f5bfedb5e6b37fd603ff60f01e4aca44b',
    ],
  ],
  [
    17267,
    [
      12264444,
      12267551,
      '96e73a90d9308e35c08443d30b7f7e4f97433cd41212b562fd6b9ea925f01c2b',
    ],
  ],
  [
    18876,
    [
      13421115,
      13434604,
      'd71ba42b7a0784efc7f49a9aade5d998785ee8250d25b0b1c37525921e6bb216',
    ],
  ],
])

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_100_BUNDLE and CLAUDE_CODE_2_1_101_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test('target101 pins Homebrew version lookup, fallback, and both callers', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be',
  )
  assert.equal(
    sha256(targetBytes),
    'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
  )
  const target = targetBytes.toString('utf8')
  for (const [index, identity] of targetUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: class`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
      `${index}: identity`,
    )
    const unit = target.slice(identity[0], identity[1])
    assert.equal(sha256(unit), identity[2], `${index}: bytes`)
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
      1,
      `${index}: one top-level statement`,
    )
  }
})

test('Homebrew API lookup and GCS fallback enter at target101 and persist', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  const fragments = [
    'https://formulae.brew.sh/api/cask/',
    ' from formulae.brew.sh: ',
    'Could not check for updates (network check skipped or unavailable).',
    'To update manually, run:',
  ]
  for (const fragment of fragments) {
    assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
    assert.equal(target.includes(fragment), true, `${fragment}: target`)
    if (latestBundlePath) {
      assert.equal(
        fs.readFileSync(latestBundlePath, 'utf8').includes(fragment),
        true,
        `${fragment}: target116`,
      )
    }
  }
  assert.match(
    target,
    /Promise\.all\(\[[A-Za-z_$][\w$]*\([^)]*\),[A-Za-z_$][\w$]*\([^)]*\)\]\);return [A-Za-z_$][\w$]*\?\?[A-Za-z_$][\w$]*/,
  )
})

test('source owns authoritative Homebrew lookup and fail-open callers', sourceOptions, () => {
  const updater = source('utils/autoUpdater.ts')
  for (const fragment of [
    'export async function getLatestVersionFromHomebrewCask(',
    '`https://formulae.brew.sh/api/cask/${caskName}.json`',
    "{ timeout: 5000, responseType: 'json' }",
    "return typeof version === 'string' ? version : null",
    'Failed to fetch ${caskName} from formulae.brew.sh: ${error}',
    'export async function getLatestVersionForHomebrew(',
    'const [homebrewVersion, gcsVersion] = await Promise.all([',
    'getLatestVersionFromHomebrewCask(caskName)',
    'getLatestVersionFromGcs(channel)',
    'return homebrewVersion ?? gcsVersion',
  ]) {
    assert.ok(updater.includes(fragment), `autoUpdater: ${fragment}`)
  }

  const packageManager = source('components/PackageManagerAutoUpdater.tsx')
  assert.ok(packageManager.includes('getLatestVersionForHomebrew'))
  assert.ok(
    packageManager.includes(
      'pm === "homebrew" ? await getLatestVersionForHomebrew(homebrewCaskName ?? "claude-code", effectiveChannel)',
    ),
  )

  const update = source('cli/update.ts')
  assert.ok(update.includes('getLatestVersionForHomebrew('))
  assert.ok(update.includes('if (latest === null)'))
  assert.ok(
    update.includes(
      'Could not check for updates (network check skipped or unavailable).',
    ),
  )
  assert.ok(update.includes("writeToStdout('To update manually, run:\\n')"))
  assert.ok(update.indexOf('if (latest === null)') < update.indexOf('else if (!gte'))
})
