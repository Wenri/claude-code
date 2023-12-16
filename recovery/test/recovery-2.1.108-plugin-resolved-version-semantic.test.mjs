import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.107-to-2.1.108'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_107_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_108_BUNDLE
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
    2558,
    [
      1013138,
      1038944,
      'b32fa6db32af715b72f928bfe4ba126e4dfead115e1c2a0925d507b8b2fb8b87',
    ],
  ],
  [
    6102,
    [
      4363511,
      4364609,
      'a1ba724e9990ff1d25d476e0b6fbdf14bf7aa8f00b133db7c7277896d8ae72cd',
    ],
  ],
  [
    13251,
    [
      9765287,
      9765743,
      '05f01c02793994d3da748b9d7e560f8e8ef847c810430348e033b141fd71ea48',
    ],
  ],
  [
    13275,
    [
      9772901,
      9774235,
      '35fedc17be414fb2c0ad7767833751c6b7cc3290108ae2850d00a67f39a52d20',
    ],
  ],
  [
    13310,
    [
      9797629,
      9799276,
      'c5e777d91fc08c6695a7b7597e6e30e9b7d36bdf38a5b36be6ce1f375350c57c',
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
      ? 'CLAUDE_CODE_2_1_107_BUNDLE and CLAUDE_CODE_2_1_108_BUNDLE are required'
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

function assertFragments(contents, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${label}: ${fragment}`)
  }
}

test('target108 pins the complete resolved-version persistence graph', pairOptions, () => {
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
  for (const [index, identity] of targetUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
      `${index}: structural identity`,
    )
    const unit = target.slice(identity[0], identity[1])
    assert.equal(sha256(unit), identity[2], `${index}: target bytes`)
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
      1,
      `${index}: one top-level statement`,
    )
    assert.ok(unit.includes('resolvedVersion'), `${index}: resolvedVersion`)
  }
})

test('target108 introduces resolved-version schema, write, load, and constraint use', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  assert.equal(baseline.split('resolvedVersion').length - 1, 0)
  assert.equal(target.split('resolvedVersion').length - 1, 10)
  const writer = target.slice(9765287, 9765743)
  assert.ok(
    writer.includes(
      '...K.resolvedVersion&&{resolvedVersion:K.resolvedVersion}',
    ),
  )
  assert.ok(
    target.includes(
      'Tag-derived semver this install resolved to (when fetched via a version constraint). Used by verifyAndDemote in preference to manifest.version',
    ),
  )
  assert.match(
    target,
    /resolvedVersion\?\?[^;]{0,120}manifest\.version/,
  )
  const installation = target.slice(9772901, 9774235)
  assert.ok(installation.includes('using tag-derived'))
  assert.ok(installation.includes('for constraint checks'))
  assert.ok(installation.includes('...A&&{resolvedVersion:A.version}'))
})

test('source persists tag resolution and consumes it after reload', sourceOptions, () => {
  const schemas = source('src/utils/plugins/schemas.ts')
  const manager = source('src/utils/plugins/installedPluginsManager.ts')
  const installation = source('src/utils/plugins/pluginInstallationHelpers.ts')
  const loader = source('src/utils/plugins/pluginLoader.ts')
  const resolver = source('src/utils/plugins/dependencyResolver.ts')
  const pluginType = source('src/types/plugin.ts')

  assertFragments(
    schemas,
    [
      'resolvedVersion: z',
      'Tag-derived semver this install resolved to (when fetched via a version constraint). Used by verifyAndDemote',
      "describe('Tag-derived semver this install resolved to')",
    ],
    'src/utils/plugins/schemas.ts',
  )
  assertFragments(
    manager,
    [
      'const v2Entry: PluginInstallationEntry = {',
      '...(metadata.resolvedVersion && {',
      'resolvedVersion: metadata.resolvedVersion',
      'saveInstalledPluginsV2(v2Data)',
    ],
    'src/utils/plugins/installedPluginsManager.ts',
  )
  assertFragments(
    installation,
    [
      'resolvedTag.version !== cacheResult.manifest.version',
      'using tag-derived ${resolvedTag.version} for constraint checks',
      '...(resolvedTag && { resolvedVersion: resolvedTag.version })',
      'addInstalledPlugin(',
    ],
    'src/utils/plugins/pluginInstallationHelpers.ts',
  )
  assertFragments(
    loader,
    [
      'const installEntry = installedPluginsData.plugins[pluginId]?.[0]',
      'installEntry?.resolvedVersion !== undefined',
      'plugin.resolvedVersion = installEntry.resolvedVersion',
    ],
    'src/utils/plugins/pluginLoader.ts',
  )
  assertFragments(
    resolver,
    [
      'installedPlugin?.resolvedVersion ??',
      'installedPlugin?.manifest.version',
      ...(semanticCase
        ? [
            'const normalizedInstalled = installed',
            '!semver.satisfies(normalizedInstalled, required)',
          ]
        : [
            'satisfiesVersionConstraint(installed, required)',
            'semver.satisfies(normalized, range)',
          ]),
    ],
    'src/utils/plugins/dependencyResolver.ts',
  )
  assert.ok(pluginType.includes('resolvedVersion?: string'))

  const writeIndex = manager.indexOf('resolvedVersion: metadata.resolvedVersion')
  assert.ok(writeIndex > manager.indexOf('const v2Entry: PluginInstallationEntry'))
  assert.ok(writeIndex < manager.indexOf('saveInstalledPluginsV2(v2Data)', writeIndex))
})
