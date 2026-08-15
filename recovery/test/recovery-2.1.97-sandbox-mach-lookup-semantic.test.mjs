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
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_96_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const baselineSha256 =
  '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e'
const targetSha256 =
  '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988'
const baselineUnits = [
  {
    index: 6_216,
    start: 4_390_907,
    end: 4_393_357,
    sourceHash:
      'a9e6dec9bd7fb6d29f1774b998731a8ab0815e0b3d15a7d9386c2bd8753663ad',
  },
  {
    index: 6_236,
    start: 4_397_306,
    end: 4_398_716,
    sourceHash:
      '122648fe8b7da44d81a7aac378581c84d146df9bccc046e39ad62c89d03f2aed',
  },
]
const targetUnits = [
  {
    index: 2_500,
    start: 991_231,
    end: 994_836,
    sourceHash:
      '4ca1110d4395324fe88e4e03cefbc12c394c20582c18d6e717d84f9f26ae5613',
  },
  {
    index: 6_207,
    start: 4_388_549,
    end: 4_391_051,
    sourceHash:
      'c4d5b9747e5a4816feff9965d80e7064723949b5e758d6805916dc2666e22ee3',
  },
  {
    index: 6_227,
    start: 4_395_000,
    end: 4_396_451,
    sourceHash:
      '67d0edfa829b4410fb9411f38731349469f24ad53143ad9f6f3893142c443e3f',
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

const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_96_BUNDLE and CLAUDE_CODE_2_1_97_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
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

test('2.1.97 Mach-lookup schema and adapter graph pin their exact units', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
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
    )
    assert.equal(
      sha256(target.slice(unit.start, unit.end)),
      unit.sourceHash,
      `target unit ${unit.index}`,
    )
  }

  assert.equal(
    baselineUnits.some(unit =>
      baseline.slice(unit.start, unit.end).includes('allowMachLookup'),
    ),
    false,
  )
  assert.match(
    target.slice(targetUnits[1].start, targetUnits[1].end),
    /allowMachLookup:\w+\.sandbox\?\.network\?\.allowMachLookup/,
  )
  assert.match(
    target.slice(targetUnits[2].start, targetUnits[2].end),
    /getAllowMachLookup:\w+\.getAllowMachLookup/,
  )
  assert.ok(target.includes('com.apple.coresimulator.*'))
  assert.ok(target.includes('iOS Simulator or Playwright'))
})

test('source owns the schema, runtime conversion, and manager forwarding', sourceOptions, () => {
  const sandboxTypes = fs.readFileSync(
    path.join(sourceRoot, 'entrypoints/sandboxTypes.ts'),
    'utf8',
  )
  const adapter = fs.readFileSync(
    path.join(sourceRoot, 'utils/sandbox/sandbox-adapter.ts'),
    'utf8',
  )
  for (const fragment of [
    'allowMachLookup: z',
    "service.endsWith('*') ? service.slice(0, -1) : service",
    ").includes(\n                '*',",
    'Wildcards are only allowed as a single trailing "*" (e.g., "com.example.*" or "*" for all services).',
    'macOS only: Additional XPC/Mach service names to allow looking up.',
    'iOS Simulator or Playwright.',
  ]) {
    assert.ok(sandboxTypes.includes(fragment), fragment)
  }

  const accepts = service =>
    !(service.endsWith('*') ? service.slice(0, -1) : service).includes('*')
  for (const service of [
    'com.apple.coresimulator.CoreSimulatorService',
    'com.apple.coresimulator.*',
    '*',
  ]) {
    assert.equal(accepts(service), true, service)
  }
  for (const service of ['com.*.bad', 'com.example.**', '**']) {
    assert.equal(accepts(service), false, service)
  }

  for (const fragment of [
    'allowMachLookup: settings.sandbox?.network?.allowMachLookup,',
    'getAllowMachLookup(): string[] | undefined',
    'getAllowMachLookup: BaseSandboxManager.getAllowMachLookup,',
  ]) {
    assert.ok(adapter.includes(fragment), fragment)
    assert.equal(adapter.split(fragment).length - 1, 1, fragment)
  }
})

test('the actual runtime network initializer preserves Mach service patterns', sourceOptions, async () => {
  const ts = await loadTypeScript()
  const adapter = fs.readFileSync(
    path.join(sourceRoot, 'utils/sandbox/sandbox-adapter.ts'),
    'utf8',
  )
  const ast = ts.createSourceFile(
    'sandbox-adapter.ts',
    adapter,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const converter = ast.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'convertToSandboxRuntimeConfig',
  )
  assert.ok(converter?.body, 'runtime converter must be reachable')
  const result = converter.body.statements.find(ts.isReturnStatement)
  assert.ok(
    result?.expression && ts.isObjectLiteralExpression(result.expression),
    'runtime converter must return an object literal',
  )
  const network = result.expression.properties.find(
    property =>
      ts.isPropertyAssignment(property) &&
      property.name.getText(ast) === 'network',
  )
  assert.ok(network && ts.isPropertyAssignment(network))
  const initializer = network.initializer.getText(ast)
  const compiled = ts.transpileModule(
    `module.exports = (settings, allowedDomains, deniedDomains) => (${initializer})`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: 'sandbox-mach-lookup-runtime.ts',
      reportDiagnostics: true,
    },
  )
  const errors = (compiled.diagnostics ?? []).filter(
    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
  )
  assert.deepEqual(errors, [])
  const module = { exports: {} }
  new Function('module', 'exports', compiled.outputText)(module, module.exports)

  const allowMachLookup = ['com.apple.coresimulator.*', 'com.apple.testmanagerd']
  const runtime = module.exports(
    { sandbox: { network: { allowMachLookup, allowLocalBinding: true } } },
    ['example.com'],
    ['blocked.example'],
  )
  assert.equal(runtime.allowMachLookup, allowMachLookup)
  assert.deepEqual(runtime.allowedDomains, ['example.com'])
  assert.deepEqual(runtime.deniedDomains, ['blocked.example'])
  assert.equal(runtime.allowLocalBinding, true)
})
