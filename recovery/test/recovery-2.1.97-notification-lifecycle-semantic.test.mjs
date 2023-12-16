import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.96-to-2.1.97'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_96_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const persistencePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const baselineSha256 =
  '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e'
const targetSha256 =
  '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988'
const persistenceSha256s = new Set([
  // Exact delta-reconstructed bundle and the authenticated inner Bun payload.
  '06cb80193f3af8bb468d1536b230b0e2f854a398b1e88af3c79048ce821bf193',
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
])

const baselineUnits = [
  {
    index: 13_135,
    start: 9_943_747,
    end: 9_946_222,
    sourceHash:
      '82feb7475298c50c48c42c1580a5b28c71c701d4fdc0a010c266af165b2c771c',
  },
  {
    index: 13_137,
    start: 9_946_321,
    end: 9_946_356,
    sourceHash:
      'dfa84aff9a2d4dace16519001b1748c5e68bfaced5381c0d8b4492e96f4396bd',
  },
  {
    index: 16_450,
    start: 11_841_013,
    end: 11_841_452,
    sourceHash:
      '45cb1a4a988a143398fe9b5830db3faf6e4533514837e6d297f0ce8c6cdbdfe2',
  },
]
const targetUnits = [
  {
    index: 13_183,
    start: 9_965_001,
    end: 9_965_161,
    sourceHash:
      '4f13e8e70f80bac87cfc085f6f4759b1b3fed576e31195516087d73dc9ba8554',
  },
  {
    index: 13_184,
    start: 9_965_161,
    end: 9_967_953,
    sourceHash:
      '5f55968a82d8407f9de423775167c8c6f96da9897b69ea31beac4b59291c7898',
  },
  {
    index: 13_186,
    start: 9_968_052,
    end: 9_968_080,
    sourceHash:
      '21528d6c5ed9c73815e3424c3ff432ba0651cc4d4ce02047488cb63990e59b1b',
  },
  {
    index: 13_187,
    start: 9_968_080,
    end: 9_968_197,
    sourceHash:
      '52fcc9ee4bd5df9aa00fe1e3765fb6e1cb19e10eaea0e291b91ec88855273017',
  },
  {
    index: 16_495,
    start: 11_855_884,
    end: 11_856_446,
    sourceHash:
      'f505dbd295fbbfaa7c8fa3d820fe4452d6822a3c1b495ee99dfa72187db41d8d',
  },
]

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
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_96_BUNDLE and CLAUDE_CODE_2_1_97_BUNDLE are required'
      : false,
}
const persistenceOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !persistencePath
      ? 'CLAUDE_CODE_2_1_116_BUNDLE is required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function count(source, fragment) {
  return source.split(fragment).length - 1
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
  const loaded = await import(pathToFileURL(candidate).href)
  return loaded.default ?? loaded
}

function findNamedFunction(ts, ast, name) {
  let found
  const visit = node => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      assert.equal(found, undefined, `${name} must be unique`)
      found = node
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert.ok(found?.body, `${name} must be reachable`)
  return found
}

test('2.1.97 authenticates provider-scoped notification lifecycle and App reachability', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(sha256(baselineBytes), baselineSha256)
  assert.equal(sha256(targetBytes), targetSha256)
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  for (const unit of baselineUnits) {
    assert.equal(
      sha256(baseline.slice(unit.start, unit.end)),
      unit.sourceHash,
      `baseline unit ${unit.index}`,
    )
  }
  for (const unit of targetUnits) {
    const region = structural.regions[unit.index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [unit.start, unit.end, unit.sourceHash],
      `target unit ${unit.index}`,
    )
    assert.equal(
      sha256(target.slice(unit.start, unit.end)),
      unit.sourceHash,
      `target unit ${unit.index}`,
    )
  }

  assert.equal(count(baseline, 'currentTimeoutId'), 0)
  assert.equal(count(baseline, 'mountCount'), 0)
  assert.equal(count(target, 'currentTimeoutId'), 3)
  assert.equal(count(target, 'mountCount'), 3)

  const baselineHook = baseline.slice(
    baselineUnits[0].start,
    baselineUnits[0].end,
  )
  const baselineGlobals = baseline.slice(
    baselineUnits[1].start,
    baselineUnits[1].end,
  )
  const targetProvider = target.slice(targetUnits[0].start, targetUnits[0].end)
  const targetHook = target.slice(targetUnits[1].start, targetUnits[1].end)
  const targetContext = target.slice(targetUnits[3].start, targetUnits[3].end)
  const targetApp = target.slice(targetUnits[4].start, targetUnits[4].end)

  assert.match(baselineHook, /\w+\+\+/)
  assert.match(baselineHook, /[\w$]+--,[\w$]+===0&&[\w$]+/)
  assert.match(baselineGlobals, /=8000,[\w$]+=null,[\w$]+=0/)
  assert.ok(
    targetProvider.includes(
      'useRef({currentTimeoutId:{current:null},mountCount:{current:0}}).current',
    ),
  )
  assert.match(targetContext, /createContext\(null\)/)
  assert.match(targetHook, /useContext\(\w+\)/)
  assert.match(targetHook, /\w+\.current\+\+/)
  assert.match(targetHook, /\w+\.current--,\w+\.current===0&&\w+\.current/)
  assert.match(targetApp, /createElement\(BNK,null,.*createElement\(EgK,null,A\)/)
})

test('notification lifecycle remains provider scoped through 2.1.116', persistenceOptions, () => {
  const bytes = fs.readFileSync(persistencePath)
  assert.ok(persistenceSha256s.has(sha256(bytes)))
  const source = bytes.toString('utf8')
  assert.equal(count(source, 'currentTimeoutId'), 3)
  assert.equal(count(source, 'mountCount'), 3)
  assert.match(
    source,
    /useRef\(\{currentTimeoutId:\{current:null\},mountCount:\{current:0\}\}\)\.current/,
  )
  assert.match(source, /\.current--,\w+\.current===0&&\w+\.current/)
})

test('source owns the lifecycle provider and mounts it inside App state', sourceOptions, () => {
  const notifications = fs.readFileSync(
    path.join(sourceRoot, 'context/notifications.tsx'),
    'utf8',
  )
  const app = fs.readFileSync(
    path.join(sourceRoot, 'components/App.tsx'),
    'utf8',
  )

  for (const fragment of [
    'const NotificationLifecycleContext = createContext<NotificationLifecycle | null>(null);',
    'export function NotificationProvider',
    'currentTimeoutId: { current: null },',
    'mountCount: { current: 0 }',
    'const providerLifecycle = useContext(NotificationLifecycleContext);',
    'const { currentTimeoutId, mountCount } = providerLifecycle ?? fallbackLifecycle;',
    'mountCount.current++;',
    'mountCount.current--;',
    'mountCount.current === 0 && currentTimeoutId.current',
  ]) {
    assert.ok(notifications.includes(fragment), fragment)
  }
  assert.equal(/let\s+currentTimeoutId\b/.test(notifications), false)

  const appStateOpen = app.indexOf('<AppStateProvider')
  const providerOpen = app.indexOf('<NotificationProvider>', appStateOpen)
  const providerClose = app.indexOf('</NotificationProvider>', providerOpen)
  const appStateClose = app.indexOf('</AppStateProvider>', providerClose)
  assert.ok(app.includes("import { NotificationProvider } from '../context/notifications.js';"))
  assert.ok(appStateOpen >= 0)
  assert.ok(appStateOpen < providerOpen)
  assert.ok(providerOpen < providerClose)
  assert.ok(providerClose < appStateClose)
})

test('the actual mount effect clears a timer only after the last shared consumer leaves', sourceOptions, async () => {
  const ts = await loadTypeScript()
  const notifications = fs.readFileSync(
    path.join(sourceRoot, 'context/notifications.tsx'),
    'utf8',
  )
  const ast = ts.createSourceFile(
    'notifications.tsx',
    notifications,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const hook = findNamedFunction(ts, ast, 'useNotifications')
  let lifecycleEffect
  const visit = node => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(ast) === 'useEffect' &&
      node.arguments[0] &&
      node.arguments[0].getText(ast).includes('mountCount.current++')
    ) {
      assert.equal(lifecycleEffect, undefined, 'lifecycle effect must be unique')
      lifecycleEffect = node.arguments[0]
    }
    ts.forEachChild(node, visit)
  }
  visit(hook)
  assert.ok(lifecycleEffect, 'mount lifecycle effect must be reachable')

  const compiled = ts.transpileModule(
    `module.exports = (currentTimeoutId, mountCount, store, processQueue, clearTimeout) => {
      const effect = ${lifecycleEffect.getText(ast)};
      return effect();
    }`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: 'notification-lifecycle-runtime.ts',
      reportDiagnostics: true,
    },
  )
  const errors = (compiled.diagnostics ?? []).filter(
    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
  )
  assert.deepEqual(errors, [])
  const module = { exports: {} }
  new Function('module', 'exports', compiled.outputText)(module, module.exports)

  const currentTimeoutId = { current: null }
  const mountCount = { current: 0 }
  const queueCalls = []
  const cleared = []
  const store = {
    getState: () => ({ notifications: { queue: [{ key: 'queued' }] } }),
  }
  const processQueue = () => queueCalls.push('processed')
  const clearTimeout = timeout => cleared.push(timeout)
  const firstCleanup = module.exports(
    currentTimeoutId,
    mountCount,
    store,
    processQueue,
    clearTimeout,
  )
  const secondCleanup = module.exports(
    currentTimeoutId,
    mountCount,
    store,
    processQueue,
    clearTimeout,
  )

  assert.equal(mountCount.current, 2)
  assert.equal(queueCalls.length, 2)
  const activeTimer = { id: 97 }
  currentTimeoutId.current = activeTimer
  firstCleanup()
  assert.equal(mountCount.current, 1)
  assert.equal(currentTimeoutId.current, activeTimer)
  assert.deepEqual(cleared, [])
  secondCleanup()
  assert.equal(mountCount.current, 0)
  assert.equal(currentTimeoutId.current, null)
  assert.deepEqual(cleared, [activeTimer])
})
