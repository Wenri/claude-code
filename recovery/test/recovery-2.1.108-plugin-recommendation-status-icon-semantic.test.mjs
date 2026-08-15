import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.107-to-2.1.108'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_107_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_108_BUNDLE
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

const baselineUnit = {
  index: 18218,
  nodeType: 'FunctionDeclaration',
  start: 12_678_213,
  end: 12_678_632,
  sourceHash:
    '94b926708cd3800169d793688d762d116ff89f71a1c0d4d0cd011e164c99f9a3',
}
const targetUnit = {
  index: 18365,
  nodeType: 'FunctionDeclaration',
  start: 12_539_304,
  end: 12_539_762,
  sourceHash:
    '5e1bcedeeb9542ec04011b87be1f2d6e041030914ad8ea194dce77ed7ae4ba95',
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function ownerSource() {
  return fs.readFileSync(
    path.join(sourceRoot, 'hooks/usePluginRecommendationBase.tsx'),
    'utf8',
  )
}

function authoredOwnerSource() {
  return ownerSource().replace(/\n\/\/# sourceMappingURL=[\s\S]*$/, '')
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

async function instantiateOwner(marketplace) {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(authoredOwnerSource(), {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const loggedErrors = []
  const React = {
    createElement(type, props, ...children) {
      return {
        type,
        props: { ...(props ?? {}), children: children.flat(Infinity) },
      }
    },
    useCallback(value) {
      return value
    },
    useRef(value) {
      return { current: value }
    },
    useState(value) {
      return [value, () => {}]
    },
  }
  const module = { exports: {} }
  const requireStub = specifier => {
    if (specifier === 'react/compiler-runtime') {
      return {
        c: size => Array(size).fill(Symbol.for('react.memo_cache_sentinel')),
      }
    }
    if (specifier === 'react') return React
    if (specifier.endsWith('/bootstrap/state.js')) {
      return { getIsRemoteMode: () => false }
    }
    if (specifier.endsWith('/design-system/StatusIcon.js')) {
      return { StatusIcon: 'StatusIcon' }
    }
    if (specifier.endsWith('/ink.js')) return { Text: 'Text' }
    if (specifier.endsWith('/utils/log.js')) {
      return { logError: error => loggedErrors.push(error) }
    }
    if (specifier.endsWith('/utils/plugins/marketplaceManager.js')) {
      return { getPluginById: async pluginId => marketplace(pluginId) }
    }
    return {}
  }
  new Function('exports', 'module', 'require', javascript)(
    module.exports,
    module,
    requireStub,
  )
  return { exports: module.exports, loggedErrors }
}

test('target108 authenticates the plugin recommendation success icon boundary', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath)
  const target = fs.readFileSync(targetBundlePath)
  assert.equal(baseline.length, 13_678_154)
  assert.equal(target.length, 13_542_838)
  assert.equal(
    sha256(baseline),
    '6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844',
  )
  assert.equal(
    sha256(target),
    'dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73',
  )

  const baselineRegion = structural.unmatchedBaseline.find(
    candidate => candidate.index === baselineUnit.index,
  )
  const targetRegion = structural.regions[targetUnit.index]
  assert.ok(baselineRegion)
  assert.ok(targetRegion)
  assert.equal(targetRegion.classification, 'unresolved')
  assert.deepEqual(
    [
      baselineRegion.nodeType,
      baselineRegion.start,
      baselineRegion.end,
      baselineRegion.sourceHash,
    ],
    [
      baselineUnit.nodeType,
      baselineUnit.start,
      baselineUnit.end,
      baselineUnit.sourceHash,
    ],
  )
  assert.deepEqual(
    [
      targetRegion.target.nodeType,
      targetRegion.target.start,
      targetRegion.target.end,
      targetRegion.target.sourceHash,
    ],
    [
      targetUnit.nodeType,
      targetUnit.start,
      targetUnit.end,
      targetUnit.sourceHash,
    ],
  )

  const baselineOwner = baseline
    .toString('utf8')
    .slice(baselineUnit.start, baselineUnit.end)
  const targetOwner = target
    .toString('utf8')
    .slice(targetUnit.start, targetUnit.end)
  assert.equal(sha256(baselineOwner), baselineUnit.sourceHash)
  assert.equal(sha256(targetOwner), targetUnit.sourceHash)

  const baselineText = baselineOwner
  const targetText = targetOwner
  assert.match(
    baselineText,
    /createElement\([^,]+,\{color:"success"\},[^,]+\.tick," ",[^,]+," installed · restart to apply"\)/,
  )
  assert.equal(baselineText.includes('withSpace:!0'), false)
  assert.match(
    targetText,
    /createElement\([^,]+,\{color:"success"\},[^.]+\.createElement\([^,]+,\{status:"success",withSpace:!0\}\),[^,]+," installed · restart to apply"\)/,
  )
  assert.equal(targetText.includes('.tick'), false)
  for (const fragment of [
    '-installed`',
    '-install-failed`',
    'priority:"immediate"',
    'timeoutMs:5000',
    '"Failed to install "',
  ]) {
    assert.ok(baselineText.includes(fragment), `baseline ${fragment}`)
    assert.ok(targetText.includes(fragment), `target ${fragment}`)
  }
})

test('source owns the StatusIcon success notification and preserves both outcomes', sourceOptions, async () => {
  const contents = authoredOwnerSource()
  assert.ok(
    contents.includes(
      "import { StatusIcon } from '../components/design-system/StatusIcon.js';",
    ),
  )
  assert.ok(
    contents.includes(
      '<StatusIcon status="success" withSpace={true} />{pluginName} installed · restart to apply',
    ),
  )
  assert.equal(contents.includes("import figures from 'figures'"), false)
  assert.equal(contents.includes('figures.tick'), false)

  const pluginData = { name: 'example-plugin' }
  const success = await instantiateOwner(async pluginId => {
    assert.equal(pluginId, 'market/example')
    return pluginData
  })
  const installed = []
  const successNotifications = []
  await success.exports.installPluginAndNotify(
    'market/example',
    'Example',
    'recommendation',
    notification => successNotifications.push(notification),
    async value => installed.push(value),
  )
  assert.deepEqual(installed, [pluginData])
  assert.deepEqual(success.loggedErrors, [])
  assert.equal(successNotifications.length, 1)
  assert.equal(successNotifications[0].key, 'recommendation-installed')
  assert.equal(successNotifications[0].priority, 'immediate')
  assert.equal(successNotifications[0].timeoutMs, 5000)
  assert.equal(successNotifications[0].jsx.type, 'Text')
  assert.equal(successNotifications[0].jsx.props.color, 'success')
  assert.deepEqual(successNotifications[0].jsx.props.children, [
    {
      type: 'StatusIcon',
      props: { status: 'success', withSpace: true, children: [] },
    },
    'Example',
    ' installed · restart to apply',
  ])

  const failure = await instantiateOwner(async () => null)
  const failedInstalls = []
  const failureNotifications = []
  await failure.exports.installPluginAndNotify(
    'market/missing',
    'Missing',
    'recommendation',
    notification => failureNotifications.push(notification),
    async value => failedInstalls.push(value),
  )
  assert.deepEqual(failedInstalls, [])
  assert.equal(failure.loggedErrors.length, 1)
  assert.match(
    failure.loggedErrors[0].message,
    /Plugin market\/missing not found in marketplace/,
  )
  assert.equal(failureNotifications.length, 1)
  assert.equal(failureNotifications[0].key, 'recommendation-install-failed')
  assert.equal(failureNotifications[0].priority, 'immediate')
  assert.equal(failureNotifications[0].timeoutMs, 5000)
  assert.equal(failureNotifications[0].jsx.type, 'Text')
  assert.equal(failureNotifications[0].jsx.props.color, 'error')
  assert.deepEqual(failureNotifications[0].jsx.props.children, [
    'Failed to install ',
    'Missing',
  ])
})
