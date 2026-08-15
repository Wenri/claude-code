import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = [
  {
    version: '2.1.121',
    envNames: ['CLAUDE_CODE_2_1_121_BUNDLE', 'CLAUDE_2_1_121_CLI_INNER'],
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  {
    version: '2.1.122',
    envNames: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
]

function readBundle(release) {
  const filename = release.envNames.map(name => process.env[name]).find(Boolean)
  assert.ok(filename, `${release.envNames.join(' or ')} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return bytes.toString('utf8')
}

function occurrences(value, fragment) {
  return value.split(fragment).length - 1
}

test('authenticated adjacent bundles retain the complete dependency-pinner repair', () => {
  const fragments = new Map([
    ['installed-unsatisfied', 2],
    ['is installed at ', 2],
    [', which does not satisfy: ', 1],
    ['version-unsatisfied but policy-blocked; not force-including', 1],
    ['resolveDependencyClosure: force-included ', 1],
    [' has no catalog entry; skipping (pinner stays demoted)', 1],
    [' fetch threw (', 2],
    [' has disjoint pinner ranges ', 1],
    [' has no tag satisfying ', 1],
    ['); skipping (pinner stays demoted)', 2],
  ])

  for (const release of releases) {
    const bundle = readBundle(release)
    for (const [fragment, expected] of fragments) {
      assert.equal(
        occurrences(bundle, fragment),
        expected,
        `${release.version}: ${fragment}`,
      )
    }
    assert.match(
      bundle,
      /Array\.isArray\([^)]*\?\.\[[^\]]+\]\)\)continue;[\s\S]{0,250}?version-unsatisfied but policy-blocked; not force-including[\s\S]{0,150}?\.version\)\)[^.]{0,30}\.add\(/,
      `${release.version}: detect unpinned demoted dependency`,
    )
    assert.match(
      bundle,
      /\.closureSet\.has\([^)]+\)\|\|[^.]+\.alreadyEnabled\.has\([^)]+\)&&![^.]+\.forceInclude\.has\([^)]+\)\)continue;[\s\S]{0,250}?![^.]+\.alreadyEnabled\.has\(/,
      `${release.version}: plugin.json force-include and cross-market policy`,
    )
    assert.match(
      bundle,
      /why:"installed-unsatisfied",installed:/,
      `${release.version}: installed-version conflict result`,
    )
  }
})

test('source reconstructs force-inclusion, pin preservation, fallback, and validation', () => {
  const resolver = fs.readFileSync(
    path.join(repo, 'src/utils/plugins/dependencyResolver.ts'),
    'utf8',
  )
  const installer = fs.readFileSync(
    path.join(repo, 'src/utils/plugins/pluginInstallationHelpers.ts'),
    'utf8',
  )
  const operations = fs.readFileSync(
    path.join(repo, 'src/services/plugins/pluginOperations.ts'),
    'utf8',
  )

  assert.match(
    resolver,
    /export function isPluginVersionSatisfied\([\s\S]*?semver\.valid\(version\)[\s\S]*?semver\.coerce\(version\)\?\.version[\s\S]*?semver\.satisfies\(normalized, range\)/,
  )
  assert.match(
    resolver,
    /alreadyEnabled\.has\(id\)[\s\S]{0,100}?!forceInclude\?\.has\(id\)/,
  )
  assert.match(
    resolver,
    /force-included \$\{id\} has no catalog entry; skipping \(pinner stays demoted\)/,
  )
  assert.match(
    resolver,
    /case 'installed-unsatisfied':[\s\S]{0,250}?is installed at \$\{truncateConstraintText\(sanitizeConstraintText\(installed \?\? 'an unknown version'\)\)\}, which does not satisfy:/,
  )

  assert.match(
    installer,
    /const allLoaded = \[\.\.\.loaded\.enabled, \.\.\.loaded\.disabled\][\s\S]*?const installedVersions = new Map[\s\S]*?const forceInclude = new Set/,
  )
  assert.match(
    installer,
    /if \(Array\.isArray\(enabledPluginSettings\?\.\[dependency\]\)\) continue/,
  )
  assert.match(
    installer,
    /version-unsatisfied but policy-blocked; not force-including/,
  )
  assert.match(
    installer,
    /resolveDependencyClosure\([\s\S]{0,500}?alreadyEnabled,[\s\S]{0,80}?allowedCrossMarketplaces,[\s\S]{0,80}?forceInclude,/,
  )
  assert.match(
    installer,
    /if \(id === pluginId \|\| alreadyEnabled\.has\(id\)\) continue/,
  )
  assert.match(
    installer,
    /closureEnabled\[id\] = Array\.isArray\(previous\) \? previous : true/,
  )
  assert.match(
    installer,
    /id === pluginId &&[\s\S]{0,100}?materialized\.has\(id\) &&[\s\S]{0,100}?!Array\.isArray\(previousEnabled\[id\]\)/,
  )
  assert.match(
    installer,
    /force-included \$\{id\} fetch threw[\s\S]*?has disjoint pinner ranges[\s\S]*?has no tag satisfying/,
  )
  assert.match(
    installer,
    /const rootManifestDependencyIds = new Set[\s\S]*?forceInclude\.has\(dependency\)[\s\S]*?rootManifestDependencyIds\.has\(dependency\)[\s\S]*?why: 'installed-unsatisfied',[\s\S]*?installed,/,
  )
  assert.match(
    installer,
    /alreadyEnabled\.has\(dependency\) && !forceInclude\.has\(dependency\)/,
  )
  assert.match(
    installer,
    /dependencyMarketplace[\s\S]{0,300}?!alreadyEnabled\.has\(dependency\)/,
  )
  assert.match(
    installer,
    /\[\.\.\.materialized\]\.filter\(id => id !== pluginId\)/,
  )
  assert.equal(
    occurrences(installer, 'result.installed'),
    1,
    'UI formatter receives the installed version',
  )
  assert.equal(
    occurrences(operations, 'result.installed'),
    1,
    'CLI formatter receives the installed version',
  )
  assert.match(installer, /dependency "\$\{result\.blockedDependency\}" is from marketplace/)
  assert.match(operations, /Plugin "\$\{result\.pluginName\}" is from marketplace/)
})
