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
    index: 14_965,
    start: 11_113_421,
    end: 11_113_467,
    sourceHash:
      '5e48f718f45f67c546102c5114ab03056000ba59bc1acae81cca4b7b4a94e5ef',
  },
  {
    index: 14_966,
    start: 11_113_467,
    end: 11_113_493,
    sourceHash:
      'c7f79881247b3b850b36654ae22dd482eed9c38de90ecd69f089fb3512a0bb4d',
  },
  {
    index: 14_967,
    start: 11_113_493,
    end: 11_113_508,
    sourceHash:
      '8d740afdea75556a169d3467c0a71543df40e85b7a0ddcabd2c5b002a8ef6d44',
  },
  {
    index: 14_968,
    start: 11_113_508,
    end: 11_113_532,
    sourceHash:
      '93986c99876ad7093dbdc8187856beb28d87d7d98ffd98a28a0bb0f4738760ec',
  },
  {
    index: 14_980,
    start: 11_118_997,
    end: 11_121_171,
    sourceHash:
      '4f72f5a43afde2a87832c100e2c5393bfd51e0962eb4773477fa1ed3cbef5de1',
  },
  {
    index: 14_999,
    start: 11_129_743,
    end: 11_139_618,
    sourceHash:
      'cb5a856c7146427ed7a564a86fbde66d468418a74a0c94a27cfc13df4025a69f',
  },
  {
    index: 16_450,
    start: 11_841_013,
    end: 11_841_452,
    sourceHash:
      '45cb1a4a988a143398fe9b5830db3faf6e4533514837e6d297f0ce8c6cdbdfe2',
  },
  {
    index: 17_471,
    start: 12_354_438,
    end: 12_356_635,
    sourceHash:
      '1c9c8c870f8d69b79f8a405e6c60f5dc3f9ad48ffca31763be0987f7eb8f85af',
  },
]
const targetUnits = [
  {
    index: 15_040,
    start: 11_145_221,
    end: 11_145_633,
    sourceHash:
      '9ae49237abbae95ed3fe87a1ede2ad7b31c3a9be773fb3887f8a1df0d307615a',
  },
  {
    index: 15_041,
    start: 11_145_633,
    end: 11_145_675,
    sourceHash:
      '2643f4365c1ddd741113bdfb3bef7ebf7f36a567e9f7bd775fbc920e253d5b1f',
  },
  {
    index: 15_042,
    start: 11_145_675,
    end: 11_145_694,
    sourceHash:
      'a9a153c836e71e5ea24d0276cef8b1915de25e93b398a9e2334b61dea5db8659',
  },
  {
    index: 15_043,
    start: 11_145_694,
    end: 11_145_794,
    sourceHash:
      '602f3943576c62a4dc127a2125d724d553bb479045b2382f33e5be9343e6ae42',
  },
  {
    index: 15_055,
    start: 11_151_259,
    end: 11_153_452,
    sourceHash:
      'bd1913a420c21988f506dd4d9b98965592f797ffd1bae9beabf068bd85d82b94',
  },
  {
    index: 15_073,
    start: 11_161_996,
    end: 11_171_917,
    sourceHash:
      '78949815f7cac865d5f1b653ca87ccb834ded009d89728c263b20140cab192a3',
  },
  {
    index: 16_495,
    start: 11_855_884,
    end: 11_856_446,
    sourceHash:
      'f505dbd295fbbfaa7c8fa3d820fe4452d6822a3c1b495ee99dfa72187db41d8d',
  },
  {
    index: 17_448,
    start: 12_313_300,
    end: 12_315_535,
    sourceHash:
      '962277562147f48ea76c0300dca78039b1a3afdf57a0bcbe3439c777e610e492',
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

test('2.1.97 authenticates provider-scoped auto-mode denials and every consumer edge', bundleOptions, () => {
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

  assert.equal(count(baseline, 'getDenials'), 0)
  assert.equal(count(baseline, 'recordDenial'), 0)
  assert.equal(count(target, 'getDenials'), 4)
  assert.equal(count(target, 'recordDenial'), 3)

  const provider = target.slice(targetUnits[0].start, targetUnits[0].end)
  const hook = target.slice(targetUnits[1].start, targetUnits[1].end)
  const context = target.slice(targetUnits[3].start, targetUnits[3].end)
  const recentDenials = target.slice(targetUnits[4].start, targetUnits[4].end)
  const permissionRules = target.slice(targetUnits[5].start, targetUnits[5].end)
  const app = target.slice(targetUnits[6].start, targetUnits[6].end)
  const canUseTool = target.slice(targetUnits[7].start, targetUnits[7].end)

  assert.match(provider, /useRef\([^)]*\)/)
  assert.match(provider, /getDenials:\(\)=>\w+\.current/)
  assert.match(provider, /recordDenial:\(\w+\)=>\{\w+\.current=\[/)
  assert.match(provider, /\.slice\(0,\w+-1\)/)
  assert.match(hook, /useContext\(\w+\)/)
  assert.ok(context.includes('createContext({getDenials:()=>[],recordDenial:()=>{}})'))
  assert.match(recentDenials, /\{getDenials:\w+\}=\w+\(\),\[\w+\]=\w+\.useState\(\w+\)/)
  assert.match(permissionRules, /\{getDenials:\w+\}=\w+\(\),\w+;if\([^)]*!==\w+\)\w+=\w+\(\)/)
  assert.match(canUseTool, /\{recordDenial:\w+\}=\w+\(\)/)
  assert.match(canUseTool, /classifier==="auto-mode"\)\w+\(\{toolName:/)
  assert.match(app, /createElement\(\w+,null,\w+\.default\.createElement\(\w+,null,\w+\)\)/)
})

test('provider-scoped denial storage persists through 2.1.116', persistenceOptions, () => {
  const bytes = fs.readFileSync(persistencePath)
  assert.ok(persistenceSha256s.has(sha256(bytes)))
  const source = bytes.toString('utf8')
  assert.equal(count(source, 'getDenials'), 4)
  assert.equal(count(source, 'recordDenial'), 3)
  assert.match(source, /createContext\(\{getDenials:\(\)=>\[\],recordDenial:\(\)=>\{\}\}\)/)
  assert.match(source, /getDenials:\(\)=>\w+\.current/)
  assert.match(source, /\.slice\(0,\w+-1\)/)
})

test('source owns the denial provider, all consumers, and the App wrapper order', sourceOptions, () => {
  const owner = fs.readFileSync(
    path.join(sourceRoot, 'utils/autoModeDenials.ts'),
    'utf8',
  )
  const recentDenials = fs.readFileSync(
    path.join(sourceRoot, 'components/permissions/rules/RecentDenialsTab.tsx'),
    'utf8',
  )
  const permissionRules = fs.readFileSync(
    path.join(sourceRoot, 'components/permissions/rules/PermissionRuleList.tsx'),
    'utf8',
  )
  const canUseTool = fs.readFileSync(
    path.join(sourceRoot, 'hooks/useCanUseTool.tsx'),
    'utf8',
  )
  const app = fs.readFileSync(
    path.join(sourceRoot, 'components/App.tsx'),
    'utf8',
  )

  for (const fragment of [
    'const AutoModeDenialsContext = createContext<AutoModeDenialsApi>',
    'export function AutoModeDenialsProvider',
    'const denials = useRef<readonly AutoModeDenial[]>([])',
    'getDenials: () => denials.current',
    "if (!feature('TRANSCRIPT_CLASSIFIER')) return",
    'denials.current = [denial, ...denials.current.slice(0, MAX_DENIALS - 1)]',
    'export function useAutoModeDenials()',
  ]) {
    assert.ok(owner.includes(fragment), fragment)
  }
  assert.equal(/\blet\s+DENIALS\b/.test(owner), false)

  assert.ok(recentDenials.includes('useAutoModeDenials'))
  assert.ok(recentDenials.includes('const { getDenials } = useAutoModeDenials();'))
  assert.ok(recentDenials.includes('const [denials] = useState(getDenials);'))
  assert.ok(permissionRules.includes('useAutoModeDenials'))
  assert.ok(permissionRules.includes('const { getDenials } = useAutoModeDenials();'))
  assert.ok(permissionRules.includes('const t1 = useMemo(getDenials, [getDenials]);'))
  assert.ok(canUseTool.includes('const { recordDenial } = useAutoModeDenials();'))
  assert.ok(canUseTool.includes('recordDenial({'))

  const appStateOpen = app.indexOf('<AppStateProvider')
  const notificationOpen = app.indexOf('<NotificationProvider>', appStateOpen)
  const denialOpen = app.indexOf('<AutoModeDenialsProvider>', notificationOpen)
  const killRingOpen = app.indexOf('<KillRingProvider>', denialOpen)
  const children = app.indexOf('{children}', denialOpen)
  const denialClose = app.indexOf('</AutoModeDenialsProvider>', children)
  const notificationClose = app.indexOf('</NotificationProvider>', denialClose)
  const appStateClose = app.indexOf('</AppStateProvider>', notificationClose)
  assert.ok(app.includes("import { AutoModeDenialsProvider } from '../utils/autoModeDenials.js';"))
  assert.ok(appStateOpen >= 0)
  assert.ok(appStateOpen < notificationOpen)
  assert.ok(notificationOpen < denialOpen)
  assert.ok(denialOpen < children)
  if (killRingOpen >= 0) {
    assert.ok(denialOpen < killRingOpen)
    assert.ok(killRingOpen < children)
  }
  assert.ok(children < denialClose)
  assert.ok(denialClose < notificationClose)
  assert.ok(notificationClose < appStateClose)
})

test('the actual provider implementation isolates consumers, caps at twenty, and honors its gate', sourceOptions, async () => {
  const ts = await loadTypeScript()
  const owner = fs.readFileSync(
    path.join(sourceRoot, 'utils/autoModeDenials.ts'),
    'utf8',
  )
  const ast = ts.createSourceFile(
    'autoModeDenials.ts',
    owner,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const provider = findNamedFunction(ts, ast, 'AutoModeDenialsProvider')
  const providerText = provider.getText(ast).replace(/^export\s+/, '')
  const compiled = ts.transpileModule(
    `module.exports = enabled => {
      const MAX_DENIALS = 20;
      const feature = () => enabled;
      const AutoModeDenialsContext = { Provider: Symbol('provider') };
      const useRef = current => ({ current });
      const createElement = (type, props, children) => ({ type, props, children });
      ${providerText}
      return children => AutoModeDenialsProvider({ children });
    }`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: 'auto-mode-denials-provider-runtime.ts',
      reportDiagnostics: true,
    },
  )
  const errors = (compiled.diagnostics ?? []).filter(
    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
  )
  assert.deepEqual(errors, [])
  const module = { exports: {} }
  new Function('module', 'exports', compiled.outputText)(module, module.exports)

  const mountEnabled = module.exports(true)
  const first = mountEnabled('first').props.value
  const second = mountEnabled('second').props.value
  for (let id = 0; id < 25; id++) {
    first.recordDenial({
      toolName: 'Bash',
      display: `command-${id}`,
      reason: 'classifier',
      timestamp: id,
    })
  }
  assert.deepEqual(first.getDenials().map(denial => denial.timestamp), [
    24, 23, 22, 21, 20, 19, 18, 17, 16, 15,
    14, 13, 12, 11, 10, 9, 8, 7, 6, 5,
  ])
  assert.deepEqual(second.getDenials(), [])

  const disabled = module.exports(false)('disabled').props.value
  disabled.recordDenial({
    toolName: 'Bash',
    display: 'blocked-by-gate',
    reason: 'classifier',
    timestamp: 97,
  })
  assert.deepEqual(disabled.getDenials(), [])
})
