import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const historical = semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_109_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
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

const identities = new Map([
  [7784, [5137834, 5138480, 'FunctionDeclaration', '81fda513e9e20ba6ba1437fe361aa78a8130441a7120da2a248053b365d5ddf7']],
  [7785, [5138480, 5142137, 'FunctionDeclaration', '3e47cf6bd3c80d0c1d2ac1874f9c849c28609d0815d8ef4ab96314ad45dc6171']],
  [7789, [5143899, 5143951, 'VariableDeclaration', 'b676cd19f24e831aad5a260e6e1aaac18d0cd00fe7609fd3710b95151b09cb9f']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test(
  'target110 pins plugin.json dependency reconciliation and its install call path',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.109 and 2.1.110 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7',
    )
    assert.equal(
      sha256(targetBytes),
      'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
    )
    const target = targetBytes.toString('utf8')
    const units = new Map()
    for (const [index, identity] of identities) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        identity,
        `${index}: identity`,
      )
      const unit = target.slice(region.target.start, region.target.end)
      assert.equal(sha256(unit), region.target.sourceHash, `${index}: bytes`)
      units.set(index, unit)
    }

    const reconcile = units.get(7784)
    for (const fragment of [
      'rootManifestDeps??[]',
      '.closureSet.has(',
      '.alreadyEnabled.has(',
      '.allowedCrossMarketplaces.has(',
      'different marketplace; not auto-installing',
      'blockedDependency:',
      'not found in any known marketplace; not auto-installing',
      '.depInfo.set(',
      'return{ok:!0,ids:',
    ]) {
      assert.ok(reconcile.includes(fragment), fragment)
    }
    const install = units.get(7785)
    for (const fragment of [
      'allowCrossMarketplaceDependenciesOn',
      'rootManifestDeps:',
      'closureSet:',
      'alreadyEnabled:',
      'allowedCrossMarketplaces:',
      'depInfo:',
      'dependency-blocked-by-policy',
      'settings-write-failed',
      'catalog may be stale',
    ]) {
      assert.ok(install.includes(fragment), fragment)
    }
    assert.match(units.get(7789), /=\["agent","subagentStatusLine"\]/)
    assert.equal(
      baselineBytes.toString('utf8').includes('rootManifestDeps'),
      false,
    )
  },
)

test(
  'source preserves the target reconciliation policy under descriptive parameter names',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const owner = fs.readFileSync(
      path.join(sourceRoot, 'utils/plugins/pluginInstallationHelpers.ts'),
      'utf8',
    )
    const fragments = [
      'async function resolvePluginJsonDependencies({',
      'rootManifestDependencies,',
      'closure,',
      'alreadyEnabled,',
      'allowedCrossMarketplaces,',
      'dependencyInfo,',
      'for (const rawDependency of rootManifestDependencies ?? [])',
      'allowedCrossMarketplaces.has(dependencyMarketplace)',
      'different marketplace; not auto-installing',
      'return { ok: false, blockedDependency: dependency }',
      'not found in any known marketplace; not auto-installing',
      'dependencyInfo.set(dependency, info)',
      'const pluginJsonDependencies = await resolvePluginJsonDependencies({',
      'rootManifestDependencies,',
      'closure: closureSet,',
      'dependencyInfo: depInfo,',
      "reason: 'dependency-blocked-by-policy'",
    ]
    if (historical) {
      fragments.push(
        'closure.has(dependency) || alreadyEnabled.has(dependency)',
      )
      assert.equal(owner.includes('forceInclude,'), false)
    } else {
      fragments.push(
        'forceInclude,',
        '(alreadyEnabled.has(dependency) && !forceInclude.has(dependency))',
      )
    }
    for (const fragment of fragments) {
      assert.ok(owner.includes(fragment), fragment)
    }
    const reconcile = owner.indexOf('async function resolvePluginJsonDependencies')
    const invocation = owner.indexOf(
      'const pluginJsonDependencies = await resolvePluginJsonDependencies',
    )
    assert.ok(reconcile >= 0 && invocation > reconcile)

    const loader = fs.readFileSync(
      path.join(sourceRoot, 'utils/plugins/pluginLoader.ts'),
      'utf8',
    )
    assert.match(
      loader,
      /const PluginSettingsSchema[\s\S]*?\.pick\(\{[\s\S]*?agent:\s*true[\s\S]*?subagentStatusLine:\s*true/,
    )
  },
)
