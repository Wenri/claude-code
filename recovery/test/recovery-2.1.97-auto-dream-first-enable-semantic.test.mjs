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
const baselineSha256 =
  '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e'
const targetSha256 =
  '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988'
const baselineUnit = {
  index: 13_906,
  start: 10_459_246,
  end: 10_463_877,
  sourceHash:
    '815d7b527d7873694dc555b088324fc70885296d4c83a421985c5ea7d394f6b1',
}
const targetUnit = {
  index: 13_953,
  start: 10_481_300,
  end: 10_486_186,
  sourceHash:
    '851a005f4a7d6bb681f9cd8393e66f20605400768316335b57a1efa1afbbb01e',
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
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
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

function findNamedFunction(ts, ast, name) {
  let found
  const visit = node => {
    if (
      (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) &&
      node.name?.text === name
    ) {
      assert.equal(found, undefined, `${name} must be unique`)
      found = node
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert.ok(found, `${name} must be reachable`)
  return found
}

test('2.1.97 authenticates the first-enable telemetry boundary', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(sha256(baselineBytes), baselineSha256)
  assert.equal(sha256(targetBytes), targetSha256)
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')
  assert.equal(
    sha256(baseline.slice(baselineUnit.start, baselineUnit.end)),
    baselineUnit.sourceHash,
  )
  const region = structural.regions[targetUnit.index]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [targetUnit.start, targetUnit.end, targetUnit.sourceHash],
  )
  assert.equal(
    sha256(target.slice(targetUnit.start, targetUnit.end)),
    targetUnit.sourceHash,
  )
  assert.equal(baseline.split('is_first_enable').length - 1, 0)
  assert.equal(target.split('is_first_enable').length - 1, 1)
  assert.match(
    target.slice(targetUnit.start, targetUnit.end),
    /\w+=\w+&&\w+\(\)\.autoDreamEnabled===void 0/,
  )
})

test('source records first enable before persisting the new setting', sourceOptions, () => {
  const owner = fs.readFileSync(
    path.join(sourceRoot, 'components/memory/MemoryFileSelector.tsx'),
    'utf8',
  )
  const snapshot =
    'const isFirstEnable = newValue_0 && getInitialSettings().autoDreamEnabled === undefined;'
  const persist = 'updateSettingsForSource("userSettings", {'
  const event = 'is_first_enable: isFirstEnable'
  for (const fragment of [
    "import { getInitialSettings, updateSettingsForSource } from '../../utils/settings/settings.js';",
    snapshot,
    event,
  ]) {
    assert.ok(owner.includes(fragment), fragment)
    assert.equal(owner.split(fragment).length - 1, 1, fragment)
  }
  const snapshotAt = owner.indexOf(snapshot)
  const persistAt = owner.indexOf(persist, snapshotAt)
  assert.ok(snapshotAt < persistAt)
  assert.ok(persistAt < owner.indexOf(event))
})

test('the actual toggle handler distinguishes first enable, later enable, and disable', sourceOptions, async () => {
  const ts = await loadTypeScript()
  const owner = fs.readFileSync(
    path.join(sourceRoot, 'components/memory/MemoryFileSelector.tsx'),
    'utf8',
  )
  const ast = ts.createSourceFile(
    'MemoryFileSelector.tsx',
    owner,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const handler = findNamedFunction(ts, ast, 'handleToggleAutoDream')
  const handlerText = handler.getText(ast)
  const compiled = ts.transpileModule(
    `module.exports = (autoDreamOn, initialValue) => {
      const calls = [];
      const getInitialSettings = () => ({ autoDreamEnabled: initialValue });
      const updateSettingsForSource = (...args) => calls.push(['update', ...args]);
      const setAutoDreamOn = value => calls.push(['set', value]);
      const logEvent = (...args) => calls.push(['event', ...args]);
      const handler = ${handlerText};
      handler();
      return calls;
    }`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: 'auto-dream-first-enable.ts',
      reportDiagnostics: true,
    },
  )
  const errors = (compiled.diagnostics ?? []).filter(
    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
  )
  assert.deepEqual(errors, [])
  const module = { exports: {} }
  new Function('module', 'exports', compiled.outputText)(module, module.exports)

  const firstEnable = module.exports(false, undefined)
  assert.deepEqual(firstEnable.at(-1), [
    'event',
    'tengu_auto_dream_toggled',
    { enabled: true, is_first_enable: true },
  ])
  assert.deepEqual(firstEnable[0], [
    'update',
    'userSettings',
    { autoDreamEnabled: true },
  ])

  assert.deepEqual(module.exports(false, false).at(-1), [
    'event',
    'tengu_auto_dream_toggled',
    { enabled: true, is_first_enable: false },
  ])
  assert.deepEqual(module.exports(true, undefined).at(-1), [
    'event',
    'tengu_auto_dream_toggled',
    { enabled: false, is_first_enable: false },
  ])
})
