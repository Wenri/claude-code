import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const case113 = '2.1.112-to-2.1.113'
const case116 = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected =
  !semanticCase || semanticCase === case113 || semanticCase === case116
const sourceSelected = !semanticCase || semanticCase === case113
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const sourceVersion =
  process.env.CLAUDE_CODE_PLUGIN_FORCE_INCLUDE_SOURCE_VERSION ??
  (semanticCase === case113 ? '113' : '116')

const bundlePaths = {
  112: process.env.CLAUDE_CODE_2_1_112_BUNDLE,
  113: process.env.CLAUDE_CODE_2_1_113_BUNDLE,
  114: process.env.CLAUDE_CODE_2_1_114_BUNDLE,
  116: process.env.CLAUDE_CODE_2_1_116_BUNDLE,
}
const sourceOptions = {
  skip: sourceSelected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : Object.values(bundlePaths).some(value => !value)
      ? 'authenticated 2.1.112, 2.1.113, 2.1.114, and 2.1.116 bundles are required'
      : false,
}

function readStructural(caseName) {
  return JSON.parse(
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
}

const structural113 = readStructural(case113)
const structural116 = readStructural(case116)

const units113 = new Map([
  [
    8903,
    [
      'unresolved',
      4215062,
      4215576,
      'bf7c9169489134525220d8cd3c80fc46bd6eb6239231e23a6271dc450ab7efdb',
    ],
  ],
  [
    8905,
    [
      'unresolved',
      4215670,
      4215766,
      '8afef68a070d63dd06cf68ffda948fd7cd40f6fc32e0aa09b69847b24d9b453b',
    ],
  ],
  [
    8907,
    [
      'unresolved',
      4215942,
      4216699,
      '5d3330b214fe55e70d77243757996a488c44c8e5949894c7c07bb8cf7e916c3e',
    ],
  ],
  [
    8908,
    [
      'unresolved',
      4216699,
      4217739,
      'ac4bb03ceb3c1cb4df1c91725909347973cd457755bb958d4db9d67545081626',
    ],
  ],
  [
    9044,
    [
      'unresolved',
      4275257,
      4275958,
      '5b61e0cfb12020ffb7d9a301a3971fe6a467d9345ced23159a1f8fa40f00ded5',
    ],
  ],
  [
    9045,
    [
      'unresolved',
      4275958,
      4281494,
      'bb096e60be6117ba09e2ee368fd51f75cfa41e6d6a129a63eafde53c6ff64d5a',
    ],
  ],
  [
    15903,
    [
      'unresolved',
      10055595,
      10057182,
      'e8aceb693482ac8e68e28f8ae1443c95742b42bfe68f6326b2ca4b60c1dbdf4a',
    ],
  ],
])

const units116 = new Map([
  [
    8991,
    [
      'matched',
      4243227,
      4243741,
      '36d45bccfb87c33eb238f511be16dff707b97aeb51d08e858d1c2d23f918f4da',
    ],
  ],
  [
    8993,
    [
      'matched',
      4243835,
      4243931,
      '705c002029c69369028d28a8dccbbc9eb06cf040479e8e730b054b0ffdd29a2d',
    ],
  ],
  [
    8995,
    [
      'matched',
      4244107,
      4244864,
      'f9aa42869d63d3ebf33ae57d75b703ee47c4bb524dfee571be26143c9c307cbf',
    ],
  ],
  [
    8996,
    [
      'matched',
      4244864,
      4245904,
      'a716a34a16c0a365b16b6d702d6ebd433d340a893a5ed03aa50791174d1daecf',
    ],
  ],
  [
    9135,
    [
      'matched',
      4304033,
      4304734,
      'a17364d705453113ea5225e945095be9b91c409e00698cbd37b6a17368e5e68d',
    ],
  ],
  [
    9136,
    [
      'unresolved',
      4304734,
      4310278,
      '990b79ef32e892b155410c64598c707e8c95882e3de4928fe9d2c690ba90d3fb',
    ],
  ],
  [
    16039,
    [
      'matched',
      10109366,
      10110953,
      '980429fca75628c5d3da9dccea0469fa16afcd9ba797a6d399d73bea9b423bec',
    ],
  ],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
}

function pinUnits(structural, bundle, units, label) {
  for (const [index, [classification, start, end, sourceHash]] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, classification, `${label} ${index}: class`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${label} ${index}: identity`,
    )
    const unit = bundle.slice(start, end)
    assert.equal(sha256(unit), sourceHash, `${label} ${index}: bytes`)
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
      1,
      `${label} ${index}: one statement`,
    )
  }
}

test('authenticated bundles pin the complete 113 introduction and 116 evolution', bundleOptions, () => {
  const bytes = Object.fromEntries(
    Object.entries(bundlePaths).map(([version, filename]) => [
      version,
      fs.readFileSync(filename),
    ]),
  )
  assert.equal(
    sha256(bytes[112]),
    'bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f',
  )
  assert.equal(
    sha256(bytes[113]),
    '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba',
  )
  assert.equal(
    sha256(bytes[114]),
    'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
  )
  assert.equal(
    sha256(bytes[116]),
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
  )

  const bundles = Object.fromEntries(
    Object.entries(bytes).map(([version, value]) => [version, value.toString('utf8')]),
  )
  pinUnits(structural113, bundles[113], units113, 'target113')
  pinUnits(structural116, bundles[116], units116, 'target116')

  const introduced = {
    forceInclude: 2,
    'installed-unsatisfied': 2,
    'pinner stays demoted': 6,
    'version-unsatisfied but policy-blocked': 1,
    'resolveDependencyClosure: force-included': 1,
  }
  for (const [fragment, count] of Object.entries(introduced)) {
    assert.equal(occurrences(bundles[112], fragment), 0, `${fragment}: 112`)
    assert.equal(occurrences(bundles[113], fragment), count, `${fragment}: 113`)
    assert.equal(occurrences(bundles[114], fragment), count, `${fragment}: 114`)
    assert.equal(occurrences(bundles[116], fragment), count, `${fragment}: 116`)
  }
  assert.ok(
    bundles[113]
      .slice(10055595, 10057182)
      .includes('.ranges,O.why,O.installed'),
    'target113 CLI caller forwards the installed version',
  )
  assert.ok(
    bundles[116]
      .slice(10109366, 10110953)
      .includes('.ranges,O.why,O.installed'),
    'target116 CLI caller preserves the installed version',
  )
})

test('source reproduces force-inclusion, demoted-pinner fallback, and installed errors', sourceOptions, () => {
  const resolver = source('utils/plugins/dependencyResolver.ts')
  const installer = source('utils/plugins/pluginInstallationHelpers.ts')
  const operations = source('services/plugins/pluginOperations.ts')

  for (const fragment of [
    "| 'installed-unsatisfied'",
    'is installed at ${truncateConstraintText(',
    'export function satisfiesVersionConstraint(',
    '!forceInclude?.has(id)',
    '!alreadyEnabled.has(id) &&',
    'resolveDependencyClosure: force-included ${id} has no catalog entry; skipping (pinner stays demoted)',
    'if (!satisfiesVersionConstraint(installed, required))',
  ]) {
    assert.ok(resolver.includes(fragment), `dependencyResolver.ts: ${fragment}`)
  }

  for (const fragment of [
    'const forceInclude = new Set<string>()',
    'plugin.resolvedVersion ?? plugin.manifest.version',
    'Array.isArray(enabledPlugins?.[dependency])',
    'version-unsatisfied but policy-blocked; not force-including',
    'closureEnabled[id] = Array.isArray(previous) ? previous : true',
    'has disjoint pinner ranges ${result.ranges.join(',
    'fetch threw (${error instanceof Error ? error.message : String(error)}); skipping (pinner stays demoted)',
    "why: 'installed-unsatisfied'",
    'forceInclude,\n      rootMarketplace,',
    'result.installed,',
  ]) {
    assert.ok(installer.includes(fragment), `pluginInstallationHelpers.ts: ${fragment}`)
  }
  assert.ok(operations.includes('result.installed,'))

  if (sourceVersion === '113') {
    assert.equal(installer.includes('isToolDetailsLoggingEnabled'), false)
    assert.ok(installer.includes("'plugin.name': entry.name"))
  } else {
    assert.ok(installer.includes('isToolDetailsLoggingEnabled'))
    assert.ok(
      installer.includes(
        'isOfficialMarketplace || isToolDetailsLoggingEnabled()',
      ),
    )
    assert.ok(installer.includes("...(logPluginDetails && { 'plugin.name': entry.name })"))
  }
})

async function loadTypeScript() {
  const candidates = [
    path.resolve(
      path.dirname(process.execPath),
      '../lib/node_modules/typescript/lib/typescript.js',
    ),
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate, 'the pinned TypeScript compiler must be available')
  const module = await import(pathToFileURL(candidate).href)
  return module.default ?? module
}

async function evaluateResolver() {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(source('utils/plugins/dependencyResolver.ts'), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const logged = []
  const semver = {
    valid(value) {
      return /^\d+\.\d+\.\d+$/.test(value ?? '') ? value : null
    },
    coerce(value) {
      const match = String(value ?? '').match(/\d+\.\d+\.\d+/)
      return match ? { version: match[0] } : null
    },
    satisfies(version, range) {
      if (range === '*') return true
      if (range.startsWith('^2.')) return version.startsWith('2.')
      if (range.startsWith('^1.')) return version.startsWith('1.')
      return version === range
    },
    validRange(range) {
      return range
    },
    minVersion() {
      return { version: '0.0.0' }
    },
  }
  const module = { exports: {} }
  new Function('require', 'exports', 'module', javascript)(
    id => {
      if (id === 'semver') return semver
      if (id === 'strip-ansi') return { __esModule: true, default: value => value }
      if (id.endsWith('/debug.js')) {
        return { logForDebugging: message => logged.push(message) }
      }
      if (id.endsWith('/settings/settings.js')) {
        return { getSettingsForSource: () => undefined }
      }
      if (id.endsWith('/stringUtils.js')) {
        return { plural: (count, one, many) => (count === 1 ? one : many) }
      }
      if (id.endsWith('/pluginIdentifier.js')) {
        return {
          parsePluginIdentifier(value) {
            const split = value.lastIndexOf('@')
            return split < 0
              ? { name: value, marketplace: undefined }
              : { name: value.slice(0, split), marketplace: value.slice(split + 1) }
          },
        }
      }
      return {}
    },
    module.exports,
    module,
  )
  return { exports: module.exports, logged }
}

test('force-included installed dependencies are walked, while missing pinners stay demoted', sourceOptions, async () => {
  const { exports, logged } = await evaluateResolver()
  const root = 'root@market'
  const dependency = 'dep@market'
  const lookup = async id =>
    id === root ? { dependencies: [dependency] } : { dependencies: [] }

  const skipped = await exports.resolveDependencyClosure(
    root,
    lookup,
    new Set([dependency]),
  )
  assert.deepEqual(skipped, { ok: true, closure: [root] })

  const forced = await exports.resolveDependencyClosure(
    root,
    lookup,
    new Set([dependency]),
    new Set(),
    new Set([dependency]),
  )
  assert.deepEqual(forced, { ok: true, closure: [dependency, root] })

  const missing = await exports.resolveDependencyClosure(
    root,
    async id => (id === root ? { dependencies: [dependency] } : null),
    new Set([dependency]),
    new Set(),
    new Set([dependency]),
  )
  assert.deepEqual(missing, { ok: true, closure: [root] })
  assert.ok(logged.some(message => message.includes('pinner stays demoted')))
  assert.equal(exports.satisfiesVersionConstraint('release-2.4.0', '^2.0.0'), true)
  assert.equal(exports.satisfiesVersionConstraint('1.9.0', '^2.0.0'), false)
  assert.equal(
    exports.formatConstraintIntersectionError(
      'Dependency',
      dependency,
      ['^2.0.0'],
      'installed-unsatisfied',
      '1.9.0',
    ),
    'Dependency "dep@market" is installed at 1.9.0, which does not satisfy: ^2.0.0',
  )
})
