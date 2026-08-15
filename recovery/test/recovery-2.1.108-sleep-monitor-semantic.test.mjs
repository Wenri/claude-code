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
const historicalTarget108 = Boolean(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT && semanticCase === caseName,
)
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

const pinnedUnits = new Map([
  [12322, [9304446, 9305264, 'dc5bc58577058877ca7ede28d9f99f711c4009026e0b51d6f748a3b0f11fbbfc', 'unresolved']],
  [12338, [9314451, 9314788, 'ab8326ef3d6e7e62c064d42709fff506372b02c3ba64d25fc8b9c8d216435255', 'unresolved']],
  [12343, [9318337, 9325907, 'dd8bc22642bb2ffcccd637e4f516d9a4f05be47f6ef6b7a25e41e16614c16cc6', 'unresolved']],
  [12613, [9423315, 9427708, 'c2f79dbf181617a0c456f1786dc20ca747d0c63ca14ec844a7a848fe26b29ab2', 'unresolved']],
  [12621, [9428726, 9429006, '4326a24df4829f7eae8bd6e1ff6d095003a2963d1e60ab54128bc8dd9c3203c2', 'unresolved']],
  [12626, [9432466, 9443636, '621de19f43c0460c0131e9c7ef1c2b1030b330c3770a3257ce7aff537966e4c4', 'unresolved']],
])

const bashBlocked =
  'To wait for a condition, use Monitor with an until-loop (e.g. `until <check>; do sleep 2; done`). To wait for a command you started, use run_in_background: true. Do not chain shorter sleeps to work around this block.'
const powerShellBlocked =
  'To wait for a condition, use Monitor with an until-loop (e.g. `until <check>; do sleep 2; done` — Monitor runs bash). To wait for a command you started, use run_in_background: true. Do not chain shorter sleeps to work around this block.'
const bashBlockedRaw = bashBlocked.replaceAll('`', '\\`')
const powerShellBlockedRaw = powerShellBlocked.replaceAll('`', '\\`')
const promptGuidance =
  'Long leading `sleep` commands are blocked. To poll until a condition is met, use Monitor with an until-loop (e.g. `until <check>; do sleep 2; done`) — you get a notification when the loop exits. Do not chain shorter sleeps to work around the block.'

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

test('target 2.1.108 pins all six Monitor sleep structural units', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    '6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844',
  )
  assert.equal(
    sha256(targetBytes),
    'dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73',
  )
  const target = targetBytes.toString('utf8')
  for (const [index, [start, end, sourceHash, classification]] of pinnedUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, classification, `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(target.slice(start, end)), sourceHash, `${index}: bytes`)
  }
})

test('the authenticated boundary introduces prompt and validation behavior', bundleOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  for (const fragment of [promptGuidance, bashBlockedRaw, powerShellBlockedRaw]) {
    assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
    assert.equal(target.includes(fragment), true, `${fragment}: target`)
  }
  assert.match(
    target.slice(9304446, 9305264),
    /If you must sleep, keep the duration short to avoid blocking the user\./,
  )
  assert.match(
    target.slice(9314451, 9314788),
    /\(\\d\+\(\?:\\\.\\d\+\)\?\)/,
  )
  assert.match(
    target.slice(9428726, 9429006),
    /\(\\d\+\(\?:\\\.\\d\+\)\?\)/,
  )
})

test('Bash source owns the exact target guidance, detector, and rejection', sourceOptions, () => {
  assertFragments('src/tools/BashTool/prompt.ts', [
    promptGuidance,
    'If you must sleep, keep the duration short to avoid blocking the user.',
  ])
  const tool = assertFragments('src/tools/BashTool/BashTool.tsx', [
    'const secs = parseFloat(m[1]!)',
    bashBlockedRaw,
    'if (secs < 2) return null',
    'errorCode: 10',
  ])
  const expected = historicalTarget108
    ? 'const m = /^sleep\\s+(\\d+(?:\\.\\d+)?)\\s*$/.exec(first)'
    : 'const m = /^sleep\\s+(\\d+(?:\\.\\d*)?)\\s*$/.exec(first)'
  assert.ok(tool.includes(expected), expected)
})

test('PowerShell source owns the exact target guidance, detector, and rejection', sourceOptions, () => {
  assertFragments('src/tools/PowerShellTool/prompt.ts', [
    'Avoid unnecessary \\`Start-Sleep\\` commands:',
    'If you must sleep, keep the duration short to avoid blocking the user.',
  ])
  const tool = assertFragments('src/tools/PowerShellTool/PowerShellTool.tsx', [
    'const secs = parseFloat(m[1]!)',
    powerShellBlockedRaw,
    'if (secs < 2) return null',
    'errorCode: 10',
  ])
  const expected = historicalTarget108
    ? 'const m = /^(?:start-sleep|sleep)(?:\\s+-s(?:econds)?)?\\s+(\\d+(?:\\.\\d+)?)\\s*$/i.exec(first)'
    : 'const m = /^(?:start-sleep|sleep)(?:\\s+-s(?:econds)?)?\\s+(\\d+(?:\\.\\d*)?)\\s*$/i.exec(first)'
  assert.ok(tool.includes(expected), expected)
})
