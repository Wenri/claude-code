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
const isCurrentSource =
  path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')

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
    12817,
    [
      9771311,
      9773331,
      '08926598e9f3d5809b7ba056ef7fd2a7b01c2fec6e3055411ea19928eadc0afb',
    ],
  ],
  [
    12832,
    [
      9783340,
      9786069,
      '6b39afe96d4f76e754e0ab09860a0c7b89a1219ddae445b60c273fc2d7e755b6',
    ],
  ],
  [
    14283,
    [
      10702151,
      10703028,
      '70821850ea2c8358f1e5609bb0508bf269d24434b077c58b9e2dc4beca99566c',
    ],
  ],
])

test(
  '2.1.97 plugin-refresh evidence pins backup, debounce, and update units',
  bundleOptions,
  () => {
    const bundleBytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(bundleBytes), targetSha256)
    const bundle = bundleBytes.toString('utf8')

    for (const [index, [start, end, sourceHash]] of pinnedUnits) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: classification`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, sourceHash],
        `${index}: structural identity`,
      )
      assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
    }

    for (const fragment of [
      ', moving aside to allow re-clone',
      'Failed to clean up stale marketplace backup directory. Please manually delete the directory at ',
      "Skipping refresh for marketplace '",
      ' — refreshed ',
      "' before update; using cached data: ",
    ]) {
      assert.ok(bundle.includes(fragment), fragment)
    }
  },
)

test(
  'source uses transactional clone replacement and restores the previous clone on failure',
  sourceOptions,
  () => {
    const manager = assertFragments('src/utils/plugins/marketplaceManager.ts', [
      'const backupPath = `${cachePath}.bak`',
      'await fs.rename(backupPath, cachePath)',
      "join(\n        cachePath,\n        '.claude-plugin',\n        'marketplace.json'",
      'await fs.rm(backupPath, { recursive: true, force: true })',
      'await fs.rename(cachePath, backupPath)',
      ', moving aside to allow re-clone',
      'Failed to clean up stale marketplace backup directory.',
      'if (movedAside)',
      'await fs.rename(backupPath, cachePath)',
    ])
    const restoreOldBackup = manager.indexOf(
      'await fs.rename(backupPath, cachePath)',
    )
    const discardStaleBackup = manager.indexOf(
      'await fs.rm(backupPath, { recursive: true, force: true })',
    )
    const moveCurrentAside = manager.indexOf(
      'await fs.rename(cachePath, backupPath)',
    )
    const clone = manager.indexOf(
      'const result = await gitClone(gitUrl, cachePath, ref, sparsePaths)',
    )
    const rollback = manager.lastIndexOf(
      'await fs.rename(backupPath, cachePath)',
    )
    assert.ok(restoreOldBackup < discardStaleBackup)
    assert.ok(discardStaleBackup < moveCurrentAside)
    assert.ok(moveCurrentAside < clone)
    assert.ok(clone < rollback)
  },
)

test(
  'source skips a recent refresh and refreshes remote marketplace data before plugin lookup',
  sourceOptions,
  () => {
    const manager = assertFragments('src/utils/plugins/marketplaceManager.ts', [
      'skipIfRecent?: boolean',
      'options?.skipIfRecent && entry.lastUpdated',
      'ageMs >= 0 && ageMs < 30_000',
      "Skipping refresh for marketplace '${name}' — refreshed ${Math.round(ageMs / 1000)}s ago",
    ])
    assert.ok(
      manager.indexOf('options?.skipIfRecent && entry.lastUpdated') <
        manager.indexOf('getMarketplace.cache?.delete?.(name)'),
      'the freshness check avoids invalidating a still-current cache',
    )

    const operations = assertFragments(
      'src/services/plugins/pluginOperations.ts',
      [
        "source.source === 'github'",
        "source.source === 'git'",
        "source.source === 'url'",
        'await refreshMarketplace(marketplaceName, undefined, {',
        'skipIfRecent: true',
        "Failed to refresh marketplace '${marketplaceName}' before update; using cached data: ${errorMessage(error)}",
        'const pluginInfo = await getPluginById(plugin)',
      ],
    )
    const refreshCall = operations.indexOf(
      'await refreshMarketplace(marketplaceName',
    )
    assert.ok(
      refreshCall <
        operations.indexOf(
          'const pluginInfo = await getPluginById(plugin)',
          refreshCall,
        ),
      'marketplace refresh precedes the marketplace plugin lookup',
    )
  },
)

if (isCurrentSource) {
  test(
    'latest source coalesces refreshes and surfaces stale-version warnings',
    sourceOptions,
    () => {
      assertFragments('src/utils/plugins/marketplaceManager.ts', [
        'const inFlightMarketplaceRefreshes = new Map',
        'if (onProgress) existing.listeners.push(onProgress)',
        'for (const listener of listeners) safeCallProgress(listener, message)',
        '.finally(() => inFlightMarketplaceRefreshes.delete(key))',
      ])
      assertFragments('src/services/plugins/pluginOperations.ts', [
        'refreshWarning = `marketplace not refreshed (${errorMessage(error)})`',
        'Warning: ${refreshWarning} — version shown may be stale.',
        'Warning: ${refreshWarning}.',
      ])
    },
  )
}
