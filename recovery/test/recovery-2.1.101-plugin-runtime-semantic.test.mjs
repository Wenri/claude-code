import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceOptions = {
  skip:
    !semanticCase || semanticCase === caseName
      ? false
      : `not applicable to ${semanticCase}`,
}
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_PUBLISHED_BUNDLE
const latestInnerPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE

const BASELINE_SHA256 =
  'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be'
const TARGET_SHA256 =
  'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb'
const LATEST_SHA256 =
  '06cb80193f3af8bb468d1536b230b0e2f854a398b1e88af3c79048ce821bf193'
const LATEST_INNER_SHA256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'

const targetUnits = [
  [6052, 4327695, 4330661, '7a2284ae6f029e8375a3a920b7c4de3f992f93045ce690f61cd88421b15cd3f8'],
  [6073, 4333568, 4333745, 'dfae2139a960aa45e2b32b3060bf96ae460e3654861d663247e5d0622e6f5f5e'],
  [6075, 4334341, 4335419, 'be5de9ee149b675b962bed8cb5880f83902f51ae55085bdcb4d01a014a50d25e'],
  [13098, 9903856, 9905711, '1ba26122d227411573742539af3ba028c29c9e250501c0561b0469ece0cd96e4'],
  [13102, 9907399, 9908444, '54f27e5343209c1fd3c447d9da2690a85b35981e0ffc56a988992c6136e47f49'],
  [13105, 9909087, 9913823, 'c9e6d1408a9906518a8a00739b32190f7b107c8a947d4a40af85da01bcbf2c4a'],
  [13110, 9916054, 9917081, '354dc9e24def3ca476985720ba8c36b9939688d8a82433e98e95bbc17a986fca'],
  [13111, 9917081, 9919029, 'f10c7923fc5cfc32d961315d1803aee1b5f32be2954237ecba2b9d525e64e4f1'],
  [13112, 9919029, 9925131, 'b3372582753f0e90eec16661daa445472ce4ba79df03921af2ad5539e15e92c9'],
  [14443, 10767398, 10771267, '647cd7b5ea78b973217c8c6da28c7d9335702003830752b4d3c025af8e62b5c1'],
  [14467, 10788166, 10797850, '78388f95fa4b2c9295f44cc26dff8d6f020e5490af3460e72703f24045c75ac2'],
  [14469, 10798814, 10801076, '349a64d75a9e6a1f4c09fb123915d4cb7e19094f727a296b8481cf9c4ac8bf82'],
  [14487, 10807491, 10808617, 'dd0ac9fa5e22294dc55e318d435304a4c4b79fe10067a507a252d5cf0eb7376c'],
  [14488, 10808617, 10810578, '2ba5ef3e377883207594410a8081a2f31fb370cd02adea1d7b7c0a71e0335ef7'],
  [14517, 10827887, 10830743, '612c0a78af87ead1b87deda2ce00c944f7e44e574fa1aa221af4c097eeb5e253'],
  [14518, 10830743, 10833352, '9232d845d36ce9f747a6c09d4664ba1d5ed35ec3e0e85355777033400689455f'],
  [14530, 10844705, 10872891, 'e4e819458ce44fbe0c151158eb1e01af46876a0eebf91da269e929e1969ccad6'],
  [14541, 10877289, 10879780, 'ad3c1accff4f6e6aed18edd61099851056a421277d6c027e915789481ee59c9c'],
  [14546, 10883502, 10884417, '7b1a589fa768aea2d01548514b988d47c19a275e1c568757f151e5683265ce4b'],
]

const latestFormUnits = [
  [11643, 7421806, 7421845, 'b90cb5010d58947231d7284fe80d2865afea4f5886416a057df1715caf3f4488'],
  [11644, 7421845, 7427181, 'ff2499e4d609ab519fa622dc925edf3ec153b91b8fba8db9fc9c70e8446c39d9'],
  [11645, 7427181, 7427213, '0cc9c3307fab95faea96d172cc400f8879dc73623eb3301b349a528a0cec2416'],
  [11646, 7427213, 7427248, '08c13d509d0c4d8d803dcd9600ce062eca3517cb8fc2f4828a53f9c413dc94d2'],
  [11647, 7427248, 7429554, 'f5dcad4030b3be8c2b3f49bc08bc63e314584fba8cb3e0efbda5d96fd78e7af6'],
  [11649, 7429565, 7429649, '2d11ca80797bf087d4d933bb7ecfb125ef0ea8e4edd26f21480204f356e93e81'],
  [16001, 10075724, 10076031, '2761695403db1f8c06cad5c0032c0728811290fd90a0882a4a518dceaa4c829d'],
  [16002, 10076031, 10077288, 'f8941fa06b291c99ad5202d036b094a19ac5e8c11e17b14551ddf7a35589a002'],
  [16004, 10077300, 10077356, '325666f3c8e93c751cda5eaac3420493f4f9992bcb660a4864aa6de886f57780'],
  [16006, 10077475, 10078397, '16d6ea46a993cd0ee01e131b8b344bdf51c55ba07f126d2e8c462713a25e10a7'],
]

function authenticatedBundle(filename, expectedHash, label) {
  assert.ok(filename, `${label} bundle environment variable must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    expectedHash,
    label,
  )
  return bytes.toString('utf8')
}

function readSource(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `${name} declaration`)
  const body = source.indexOf('{', start)
  let depth = 0
  for (let index = body; index < source.length; index++) {
    if (source[index] === '{') depth++
    else if (source[index] === '}' && --depth === 0) {
      return source.slice(start, index + 1)
    }
  }
  throw new Error(`unterminated ${name}`)
}

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

test('target101 pins every changed plugin runtime function', () => {
  const baseline = authenticatedBundle(baselinePath, BASELINE_SHA256, '2.1.100')
  const target = authenticatedBundle(targetPath, TARGET_SHA256, '2.1.101')

  for (const fragment of [
    'dependency-version-unsatisfied',
    'all-plugins-project-installed',
    'Marketplace directory not found at path: ',
    'Copied plugin ',
  ]) {
    assert.equal(baseline.includes(fragment), false, fragment)
    assert.equal(target.includes(fragment), true, fragment)
  }
  for (const [index, start, end, expectedHash] of targetUnits) {
    assert.equal(
      crypto.createHash('sha256').update(target.slice(start, end)).digest('hex'),
      expectedHash,
      `target101 unit ${index}`,
    )
  }
})

test('source owns dependency constraints and local-marketplace loading', sourceOptions, () => {
  const types = readSource('types/plugin.ts')
  const dependencies = readSource('utils/plugins/dependencyResolver.ts')
  const loader = readSource('utils/plugins/pluginLoader.ts')
  const operations = readSource('services/plugins/pluginOperations.ts')

  for (const fragment of [
    'export type DependencyConstraint',
    'depConstraints?: Map<string, DependencyConstraint>',
    "type: 'dependency-version-unsatisfied'",
  ]) assert.ok(types.includes(fragment), fragment)
  for (const fragment of [
    'export function extractDependencyConstraints',
    'export function findDependencyConstraints',
    'const loadedById = new Map',
    "type: 'dependency-version-unsatisfied'",
    'semver.satisfies',
  ]) assert.ok(dependencies.includes(fragment), fragment)
  for (const fragment of [
    "GIT_TERMINAL_PROMPT: '0'",
    "GIT_ASKPASS: ''",
    "stdin: 'ignore'",
    'marketplaceConfig?.source',
    'isLocalMarketplaceSource(marketplaceSource)',
    'Marketplace directory not found at path:',
    'Plugin directory not found at path:',
    'Copied plugin ${entry.name} to versioned cache:',
    'extractDependencyConstraints(parsedJson)',
    'hasManifest: manifestPath !== null',
    'errors: pluginErrors,\n    hasManifest,',
  ]) assert.ok(loader.includes(fragment), fragment)
  for (const fragment of [
    'findDependencyConstraints(pluginId',
    'semver.satisfies(normalizedVersion, constraint.version)',
    "skipped: true",
    'requires ${pluginName} at a version range',
  ]) assert.ok(operations.includes(fragment), fragment)
})

test('source owns the project-installed UI and paste/validation surfaces', sourceOptions, () => {
  const discover = readSource('commands/plugin/DiscoverPlugins.tsx')
  const helpers = readSource('utils/plugins/marketplaceHelpers.ts')
  const errors = readSource('commands/plugin/PluginErrors.tsx')
  const options = readSource('commands/plugin/PluginOptionsDialog.tsx')
  const manage = readSource('commands/plugin/ManagePlugins.tsx')
  const validate = readSource('utils/plugins/validatePlugin.ts')

  for (const fragment of [
    'isPluginInstalled(pluginId)',
    "reason = 'all-plugins-project-installed'",
    'All available plugins are installed for this project.',
    'Use the Browse tab to install at user scope.',
  ]) assert.ok(discover.includes(fragment), fragment)
  assert.ok(helpers.includes("| 'all-plugins-project-installed'"))
  for (const fragment of [
    "case 'dependency-version-unsatisfied'",
    'installed ${error.installed',
    'satisfy ${error.required}',
  ]) assert.ok(errors.includes(fragment), fragment)
  assert.ok(manage.includes('handleKeyDown'), 'manage search key handler')
  assert.ok(manage.includes('handlePaste'), 'manage search paste handler')
  if (process.env.CLAUDE_CODE_SEMANTIC_CASE === '2.1.100-to-2.1.101') {
    assert.ok(options.includes('onKeyDown'), 'historical option key handler')
    assert.ok(options.includes('onPaste'), 'historical option paste handler')
  } else {
    const form = readSource('components/Form.tsx')
    assert.ok(options.includes("from '../../components/Form.js'"))
    assert.ok(options.includes('submitLabel="Save configuration"'))
    for (const fragment of [
      "'select:previous'",
      "'tabs:next'",
      'disableCursorMovementForUpDownKeys',
      'field.required && value.trim()',
    ]) assert.ok(form.includes(fragment), fragment)
  }
  for (const fragment of [
    "'.claude-plugin',",
    "'marketplace.json',",
    'No manifest found in directory. Expected',
    'Could not read ${path.relative(marketplaceRoot, pluginJsonPath)} for version cross-check:',
    'Could not parse ${path.relative(marketplaceRoot, pluginJsonPath)} for version cross-check:',
    "getErrnoCode(e) !== 'ENOTDIR'",
    'const relativeManifestPath = path.relative(',
  ]) assert.ok(validate.includes(fragment), fragment)
})

test('the recovered dependency metadata parser executes target semantics', sourceOptions, async () => {
  const source = readSource('utils/plugins/dependencyResolver.ts')
  const declaration = functionSource(source, 'extractDependencyConstraints')
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(`export ${declaration}`, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const module = { exports: {} }
  new Function('exports', 'module', javascript)(module.exports, module)
  const extract = module.exports.extractDependencyConstraints
  assert.equal(typeof extract, 'function')
  assert.deepEqual(
    [...extract({
      dependencies: [
        { name: 'a', version: '^1.2.0' },
        { name: 'b', marketplace: 'm', sha: 'abc' },
        { name: '', version: '*' },
        'ignored',
      ],
    })],
    [
      ['a', { version: '^1.2.0', sha: undefined }],
      ['b@m', { version: undefined, sha: 'abc' }],
    ],
  )
  assert.equal(extract({ dependencies: [{ name: 'a' }] }), undefined)
})

test(
  'target116 retains the recovered plugin runtime contract',
  {
    skip: latestPath
      ? false
      : 'CLAUDE_CODE_2_1_116_PUBLISHED_BUNDLE is not set',
  },
  () => {
    const latest = authenticatedBundle(latestPath, LATEST_SHA256, '2.1.116')
    for (const fragment of [
      'dependency-version-unsatisfied',
      'all-plugins-project-installed',
      'Marketplace directory not found at path: ',
      'Copied plugin ',
      'GIT_TERMINAL_PROMPT',
    ]) assert.ok(latest.includes(fragment), fragment)
  },
)

test(
  'target116 pins the shared Form and plugin-options adaptation',
  {
    skip: latestInnerPath
      ? false
      : 'CLAUDE_CODE_2_1_116_BUNDLE is not set',
  },
  () => {
    const latest = authenticatedBundle(
      latestInnerPath,
      LATEST_INNER_SHA256,
      '2.1.116 inner',
    )
    for (const [index, start, end, expectedHash] of latestFormUnits) {
      assert.equal(
        crypto.createHash('sha256').update(latest.slice(start, end)).digest('hex'),
        expectedHash,
        `target116 Form/plugin-options unit ${index}`,
      )
    }
    for (const fragment of [
      'Save configuration',
      '(unchanged)',
      'disableCursorMovementForUpDownKeys',
    ]) assert.ok(latest.includes(fragment), fragment)
  },
)
