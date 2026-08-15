import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

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

const units = new Map([
  [
    10359,
    [
      7607503,
      7607600,
      '41ea66c6472ce22403ef410f545a0692785c0f7235d1baf9482b1730982a88f7',
    ],
  ],
  [
    10367,
    [
      7608479,
      7609968,
      '43ccc2a6a0282af915dc8c1a698cf56f316e1a93b82f609904bcd628f41a2a94',
    ],
  ],
  [
    10370,
    [
      7610362,
      7611660,
      'fd6f7f11038e97e1491c8d2fb17b91a3bfc2aa5a4449b0856f4e8c5bf64e5be7',
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

test('target101 pins sanitized-copy validation and security comparison', pairOptions, () => {
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
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  for (const [index, identity] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
      `${index}: structural identity`,
    )
    assert.equal(
      sha256(target.slice(identity[0], identity[1])),
      identity[2],
      `${index}: target bytes`,
    )
  }

  const helper = target.slice(...units.get(10359).slice(0, 2))
  assert.match(helper, /structuredClone\(/)
  assert.ok(helper.includes('"remote managed settings"'))

  const fetch = target.slice(...units.get(10367).slice(0, 2))
  assert.match(fetch, /structuredClone\([^)]*\.data\.settings\)/)
  assert.ok(fetch.includes('skipRetry:!0'))
  assert.match(fetch, /settings:[^.]+\.data\.settings,checksum:/)

  const load = target.slice(...units.get(10370).slice(0, 2))
  assert.match(load, /await [^(]+\([^)]*\([^)]*\),[^)]*\([^)]*\)\)/)
  const baselineFetchAnchor = baseline.indexOf('Remote settings: Fetched successfully')
  const baselineFetch = baseline.slice(baselineFetchAnchor - 1200, baselineFetchAnchor)
  assert.equal(baselineFetch.includes('structuredClone('), false)
})

test('source validates filtered clones without mutating persisted settings', sourceOptions, () => {
  const source = fs.readFileSync(
    path.join(sourceRoot, 'services/remoteManagedSettings/index.ts'),
    'utf8',
  )
  for (const fragment of [
    "import { filterInvalidSettingsEntries } from '../../utils/settings/validation.js'",
    'function cloneForRemoteSettingsValidation',
    'const cloned = structuredClone(settings)',
    "filterInvalidSettingsEntries(cloned, 'remote managed settings')",
    'const settingsForValidation = cloneForRemoteSettingsValidation(',
    'SettingsSchema().safeParse(settingsForValidation)',
    'settings: parsed.data.settings',
    'cloneForRemoteSettingsValidation(cachedSettings)',
    'cloneForRemoteSettingsValidation(newSettings)',
  ]) {
    assert.ok(source.includes(fragment), fragment)
  }
  assert.equal((source.match(/skipRetry: true/g) ?? []).length >= 2, true)
})

test(
  'target116 retains remote-settings clone-and-filter validation',
  {
    skip:
      semanticCase || !latestBundlePath
        ? 'current-source target116 bundle evidence is not available in this run'
        : false,
  },
  () => {
    const latest = fs.readFileSync(latestBundlePath, 'utf8')
    const anchor = latest.indexOf('Remote settings: Fetched successfully')
    assert.notEqual(anchor, -1)
    const fragment = latest.slice(anchor - 2200, anchor + 500)
    assert.ok(fragment.includes('"remote managed settings"'))
    assert.ok(fragment.includes('skipRetry:!0'))
  },
)
