import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const isCurrentSource = sourceRoot === path.join(repositoryRoot, 'src')
const baselinePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath || !latestPath
      ? 'authenticated 2.1.104, 2.1.105, and 2.1.116 bundles are required'
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
  [
    13186,
    [
      9937216,
      9938745,
      'FunctionDeclaration',
      'fbcdac5420b50543d5fe7f94373e6524e4a99d84c35aa587ad1cbdb9a083eac2',
    ],
  ],
  [
    13187,
    [
      9938745,
      9940065,
      'FunctionDeclaration',
      '69f8b20644410f2e75b68f481b9fc22c66c4a8011ef74c109c7bc6a7f0258d91',
    ],
  ],
  [
    14597,
    [
      10855905,
      10857255,
      'FunctionDeclaration',
      'b2fa0429b75e07e745ac076ea3ff5d42d24d3a23f9e514509de3dac7edb3d5be',
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

async function functionText(contents, name) {
  const ts = await loadTypeScript()
  const parsed = ts.createSourceFile(
    'owner.ts',
    contents,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const declaration = parsed.statements.find(
    node => ts.isFunctionDeclaration(node) && node.name?.text === name,
  )
  assert.ok(declaration, `${name} must be a top-level function declaration`)
  return declaration.getText(parsed)
}

test(
  'authenticated target105 adds core plugin-install OTel and both trigger callers',
  bundleOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(baselineBytes),
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    )
    assert.equal(
      sha256(targetBytes),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )

    const target = targetBytes.toString('utf8')
    for (const [index, [start, end, nodeType, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        [start, end, nodeType, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }

    const baseline = baselineBytes.toString('utf8')
    const latest = latestBytes.toString('utf8')
    assert.equal(occurrences(baseline, '"plugin_installed"'), 0)
    assert.equal(occurrences(target, '"plugin_installed"'), 1)
    assert.equal(occurrences(latest, '"plugin_installed"'), 1)
    assert.equal(occurrences(baseline, '"install.trigger"'), 0)
    assert.equal(occurrences(target, '"install.trigger"'), 1)
    assert.equal(occurrences(latest, '"install.trigger"'), 1)
    assert.equal(occurrences(target, 'trigger:"ui"'), 1)
    assert.equal(occurrences(target, 'trigger:"cli"'), 1)
    assert.equal(occurrences(latest, 'trigger:"ui"'), 1)
    assert.equal(occurrences(latest, 'trigger:"cli"'), 1)
  },
)

test(
  'source owns one core event and exact UI and CLI trigger propagation',
  sourceOptions,
  async () => {
    const helpers = source('utils/plugins/pluginInstallationHelpers.ts')
    const operations = source('services/plugins/pluginOperations.ts')
    const core = await functionText(helpers, 'installResolvedPlugin')
    const interactive = await functionText(
      helpers,
      'installPluginFromMarketplace',
    )

    assert.equal(occurrences(helpers, "logOTelEvent('plugin_installed'"), 1)
    assert.match(core, /trigger\?: string/)
    assert.match(core, /'marketplace\.is_official'/)
    assert.match(core, /'install\.trigger'/)
    assert.match(interactive, /trigger: 'ui'/)
    assert.match(operations, /trigger: 'cli'/)

    if (!isCurrentSource) {
      assert.match(core, /'plugin\.name': entry\.name/)
      assert.match(core, /'plugin\.version': entry\.version/)
      assert.doesNotMatch(core, /logPluginDetails|isToolDetailsLoggingEnabled/)
    } else {
      assert.match(core, /logPluginDetails/)
      assert.match(core, /isToolDetailsLoggingEnabled/)
    }
  },
)

test(
  'source keeps telemetry after cache invalidation and before dependency result formatting',
  sourceOptions,
  async () => {
    const core = await functionText(
      source('utils/plugins/pluginInstallationHelpers.ts'),
      'installResolvedPlugin',
    )
    const clear = core.indexOf('clearAllCaches()')
    const event = core.indexOf("logOTelEvent('plugin_installed'")
    const suffix = core.indexOf('formatDependencyCountSuffix')
    assert.ok(clear >= 0 && event > clear && suffix > event)
  },
)
