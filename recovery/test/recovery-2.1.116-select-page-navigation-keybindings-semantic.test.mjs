import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'

const baselineUnits = [
  {
    index: 7377,
    start: 3467696,
    end: 3472442,
    sourceHash:
      '5cb195ab12b47c0cc12b82870eff7b9a8763dec95d5895a790ac5d70e8b4be98',
  },
  {
    index: 7390,
    start: 3475592,
    end: 3480178,
    sourceHash:
      '8bd3ae5b552133e7f3c360e2cd81a6fdac07d5b052a8fd599285e50b51e7ac7c',
  },
]
const targetUnits = [
  {
    index: 7441,
    start: 3489704,
    end: 3494646,
    sourceHash:
      'a038c1928025dfc41f1d57e2ce99e1de89c990ce947a614f33147c4d125779b5',
  },
  {
    index: 7454,
    start: 3497796,
    end: 3502445,
    sourceHash:
      'aff8345e9304c46bda7bef5097b03df5d128d5208c48ff6a75683f4e956eda60',
  },
  {
    index: 16725,
    start: 10510257,
    end: 10511763,
    sourceHash:
      '801eafdef5b9ffa316467925d326e9c65fc8597ee4a0ca99b0d1c762c199625f',
  },
]
const typedRows = [
  {
    historicalRow: 102,
    currentRow: 98,
    value: 'select:pageUp',
    start: 3500669,
    end: 3500684,
  },
  {
    historicalRow: 103,
    currentRow: 99,
    value: 'select:pageDown',
    start: 3500685,
    end: 3500702,
  },
  {
    historicalRow: 104,
    currentRow: 100,
    value: 'select:first',
    start: 3500703,
    end: 3500717,
  },
  {
    historicalRow: 105,
    currentRow: 101,
    value: 'select:last',
    start: 3500718,
    end: 3500731,
  },
]

const expectedBindings = {
  pageup: 'select:pageUp',
  pagedown: 'select:pageDown',
  home: 'select:first',
  end: 'select:last',
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

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
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

function exactLiteralCount(contents, value) {
  return contents.split(JSON.stringify(value)).length - 1
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

async function transpileCommonJs(contents) {
  const ts = await loadTypeScript()
  return ts.transpileModule(contents, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
}

async function executeDefaultBindings() {
  const javascript = await transpileCommonJs(
    source('src/keybindings/defaultBindings.ts'),
  )
  const module = { exports: {} }
  const requireStub = specifier => {
    if (specifier === 'bun:bundle') return { feature: () => false }
    if (specifier.endsWith('/semver.js')) return { satisfies: () => true }
    if (specifier.endsWith('/bundledMode.js')) {
      return { isRunningWithBun: () => false }
    }
    if (specifier.endsWith('/platform.js')) {
      return { getPlatform: () => 'linux' }
    }
    throw new Error(`unexpected defaultBindings import: ${specifier}`)
  }
  new Function('require', 'exports', 'module', 'process', javascript)(
    requireStub,
    module.exports,
    module,
    process,
  )
  return module.exports.DEFAULT_BINDINGS
}

async function executeKeybindingActions() {
  const javascript = await transpileCommonJs(source('src/keybindings/schema.ts'))
  const module = { exports: {} }
  const requireStub = specifier => {
    if (specifier === 'zod/v4') return { z: {} }
    if (specifier.endsWith('/lazySchema.js')) {
      return { lazySchema: factory => ({ factory }) }
    }
    throw new Error(`unexpected schema import: ${specifier}`)
  }
  new Function('require', 'exports', 'module', javascript)(
    requireStub,
    module.exports,
    module,
  )
  return module.exports.KEYBINDING_ACTIONS
}

test('target116 authenticates Select page-navigation defaults and actions', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(baselineBytes), baselineSha256)
  assert.equal(sha256(targetBytes), targetSha256)
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  for (const unit of baselineUnits) {
    const region = structural.unmatchedBaseline.find(
      candidate => candidate.index === unit.index,
    )
    assert.ok(region, `baseline unit ${unit.index}`)
    assert.deepEqual(
      [region.start, region.end, region.sourceHash],
      [unit.start, unit.end, unit.sourceHash],
    )
    assert.equal(sha256(baseline.slice(unit.start, unit.end)), unit.sourceHash)
  }

  for (const unit of targetUnits) {
    const region = structural.regions[unit.index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [unit.start, unit.end, unit.sourceHash],
    )
    assert.equal(sha256(target.slice(unit.start, unit.end)), unit.sourceHash)
  }

  const targetDefaults = target.slice(targetUnits[0].start, targetUnits[0].end)
  const targetSchema = target.slice(targetUnits[1].start, targetUnits[1].end)
  const targetHandler = target.slice(targetUnits[2].start, targetUnits[2].end)
  for (const [key, action] of Object.entries(expectedBindings)) {
    assert.equal(exactLiteralCount(baseline, action), 0, `${action}: baseline`)
    assert.equal(exactLiteralCount(target, action), 3, `${action}: target`)
    assert.ok(targetDefaults.includes(`${key}:${JSON.stringify(action)}`))
    assert.ok(targetSchema.includes(JSON.stringify(action)))
    assert.ok(targetHandler.includes(JSON.stringify(action)))
  }

  for (const row of typedRows) {
    assert.equal(
      target.slice(row.start, row.end),
      JSON.stringify(row.value),
      `added-owner rows historical=${row.historicalRow} current=${row.currentRow}`,
    )
  }
})

test('source resolves Select page-navigation keys to accepted handlers', sourceOptions, async () => {
  const bindings = await executeDefaultBindings()
  const select = bindings.find(block => block.context === 'Select')
  assert.ok(select, 'Select default binding block')
  assert.deepEqual(
    Object.fromEntries(
      Object.keys(expectedBindings).map(key => [key, select.bindings[key]]),
    ),
    expectedBindings,
  )

  const acceptedActions = new Set(await executeKeybindingActions())
  for (const action of Object.values(expectedBindings)) {
    assert.equal(acceptedActions.has(action), true, `${action}: accepted`)
  }

  const handler = source('src/components/design-system/Select.tsx')
  for (const action of Object.values(expectedBindings)) {
    assert.ok(handler.includes(`'${action}':`), `${action}: registered handler`)
  }
})
