import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import vm from 'node:vm'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  applyTarget121GrowthBookExperimentCacheSourceRecovery,
  TARGET121_GROWTHBOOK_EXPERIMENT_CACHE_INPUT_FILES,
  TARGET121_GROWTHBOOK_EXPERIMENT_CACHE_OUTPUT_FILES,
  TARGET121_GROWTHBOOK_EXPERIMENT_CACHE_OWNER_OVERRIDES,
} from '../cases/2.1.120-to-2.1.121/recovered/replay-growthbook-experiment-cache-source-gap.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.121-growthbook-experiment-cache-source-gap.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })
const artifactDescriptor = row => ({ bytes: row.bytes, sha256: row.sha256 })
const semanticEqual = (left, right) =>
  JSON.stringify(left) === JSON.stringify(right)
const plainValue = value => JSON.parse(JSON.stringify(value))

let typescriptPromise
function loadTypeScript() {
  typescriptPromise ??= import(
    pathToFileURL(
      path.join(
        root,
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      ),
    ).href
  ).then(imported => imported.default ?? imported)
  return typescriptPromise
}

function materializeRawSources() {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target121-growthbook-experiment-cache-'),
  )
  const sourceRoot = path.join(temporary, 'src')
  for (const spec of fixture.inputs.sourceFiles) {
    const result = spawnSync(
      'git',
      ['show', `${fixture.sourceCommit}:${spec.path}`],
      { cwd: root, encoding: null },
    )
    assert.equal(result.status, 0, result.stderr?.toString())
    assert.deepEqual(descriptor(result.stdout), spec.input)
    const filename = path.join(sourceRoot, spec.path.replace(/^src\//, ''))
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, result.stdout)
  }
  return { temporary, sourceRoot }
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (!['start', 'end', 'loc', 'range'].includes(key)) walk(child, visit)
  }
}

function parseUnit(bundle, unit) {
  const value = bundle.subarray(unit.start, unit.end)
  assert.deepEqual(descriptor(value), {
    bytes: unit.bytes,
    sha256: unit.sourceHash,
  })
  const ast = parse(value.toString('utf8'), {
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  assert.equal(ast.body.length, 1)
  assert.equal(ast.body[0].type, unit.nodeType)
  return { value, text: value.toString('utf8'), node: ast.body[0] }
}

function findSourceDeclarations(ts, parsed, names) {
  const wanted = new Set(names)
  const declarations = new Map()
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && wanted.has(node.name?.text)) {
      assert(!declarations.has(node.name.text), node.name.text)
      declarations.set(node.name.text, node)
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  assert.equal(declarations.size, wanted.size)
  return declarations
}

function sourceFile(ts, filename, text) {
  const parsed = ts.createSourceFile(
    filename,
    text,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(parsed.parseDiagnostics.length, 0)
  return parsed
}

function targetRuntime(targetBundle) {
  const units = new Map(fixture.targetUnits.map(unit => [unit.index, unit]))
  const definitions = [6665, 6666, 6674]
    .map(index => {
      const unit = units.get(index)
      return targetBundle.slice(unit.start, unit.end)
    })
    .join('\n')
  const state = {
    enabled: true,
    config: {},
    saves: 0,
    remoteFeatures: new Map(),
    experimentData: new Map(),
  }
  const context = {
    Sp: state.remoteFeatures,
    f5H: state.experimentData,
    I$: () => state.config,
    S$H: () => state.enabled,
    G3: semanticEqual,
    a$: updater => {
      state.saves++
      state.config = updater(state.config)
    },
  }
  vm.runInNewContext(
    `${definitions}\nglobalThis.api = { hasGrowthBookCachedValue: Vr8, isFeatureFromExperiment: kr8, syncRemoteEvalToDisk: iYK }`,
    context,
  )
  return { api: context.api, state }
}

function sourceRuntime(ts, growthbookText, parsed) {
  const names = [
    'hasGrowthBookCachedValue',
    'isFeatureFromExperiment',
    'syncRemoteEvalToDisk',
  ]
  const declarations = findSourceDeclarations(ts, parsed, names)
  const definitions = names
    .map(name =>
      growthbookText
        .slice(declarations.get(name).getStart(parsed), declarations.get(name).end)
        .replace(/^export /, ''),
    )
    .join('\n')
  const program = `
const remoteEvalFeatureValues = runtime.remoteFeatures
const experimentDataByFeature = runtime.experimentData
const getGlobalConfig = () => runtime.config
const isGrowthBookEnabled = () => runtime.enabled
const isEqual = deepEqual
const saveGlobalConfig = updater => {
  runtime.saves++
  runtime.config = updater(runtime.config)
}
${definitions}
globalThis.api = { hasGrowthBookCachedValue, isFeatureFromExperiment, syncRemoteEvalToDisk }
`
  const transpiled = ts.transpileModule(program, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  })
  assert.equal(
    transpiled.diagnostics?.filter(
      diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
    ).length,
    0,
  )
  const state = {
    enabled: true,
    config: {},
    saves: 0,
    remoteFeatures: new Map(),
    experimentData: new Map(),
  }
  const context = { runtime: state, deepEqual: semanticEqual }
  vm.runInNewContext(transpiled.outputText, context)
  return { api: context.api, state }
}

test('Target121 GrowthBook fixture freezes two exact strict source-gap units', () => {
  assert.equal(
    sha256(fixtureBytes),
    '1ec39774d5a9bbfbfee50571cc5e97e7fbf84ed682d5478847295fa02e5a1900',
  )
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.120-to-2.1.121')
  assert.deepEqual(fixture.summary, {
    units: 2,
    residues: 3,
    indicesSha256: sha256(
      JSON.stringify(fixture.strictRows.map(row => row.targetIndex)),
    ),
    residueIdentitiesSha256: sha256(
      JSON.stringify(fixture.residueIdentities),
    ),
  })
  assert.deepEqual(
    TARGET121_GROWTHBOOK_EXPERIMENT_CACHE_INPUT_FILES,
    fixture.inputs.sourceFiles.map(row => ({ path: row.path, ...row.input })),
  )
  assert.deepEqual(
    TARGET121_GROWTHBOOK_EXPERIMENT_CACHE_OUTPUT_FILES,
    fixture.inputs.sourceFiles.map(row => ({ path: row.path, ...row.output })),
  )
  assert.deepEqual(
    TARGET121_GROWTHBOOK_EXPERIMENT_CACHE_OWNER_OVERRIDES.map(row => ({
      targetIndex: row.targetIndex,
      paths: [...row.paths],
      evidenceIds: [...row.evidenceIds],
    })),
    fixture.strictRows.map(row => ({
      targetIndex: row.targetIndex,
      paths: [row.ownerPath],
      evidenceIds: row.evidenceIds,
    })),
  )
  for (const row of fixture.strictRows) {
    assert.notEqual(row.ownerPath, row.rejectedOwnerPath)
  }
})

test('authenticated bundles pin the cache delta, exports, and warm-resume consumer', () => {
  const baselineBundle = fs.readFileSync(
    path.join(root, fixture.inputs.baselineBundle.path),
  )
  const targetBundle = fs.readFileSync(
    path.join(root, fixture.inputs.targetBundle.path),
  )
  const ledgerBytes = fs.readFileSync(
    path.join(root, fixture.inputs.structuralLedger.path),
  )
  assert.deepEqual(
    descriptor(baselineBundle),
    artifactDescriptor(fixture.inputs.baselineBundle),
  )
  assert.deepEqual(
    descriptor(targetBundle),
    artifactDescriptor(fixture.inputs.targetBundle),
  )
  assert.deepEqual(
    descriptor(ledgerBytes),
    artifactDescriptor(fixture.inputs.structuralLedger),
  )
  const ledger = JSON.parse(gunzipSync(ledgerBytes))

  for (const unit of fixture.baselineUnits) {
    const structural = ledger.unmatchedBaseline.find(row => row.index === unit.index)
    assert(structural, `baseline u${unit.index}`)
    assert.deepEqual(
      {
        nodeType: structural.nodeType,
        start: structural.start,
        end: structural.end,
        sourceHash: structural.sourceHash,
        coarseHash: structural.coarseHash,
      },
      {
        nodeType: unit.nodeType,
        start: unit.start,
        end: unit.end,
        sourceHash: unit.sourceHash,
        coarseHash: unit.coarseHash,
      },
    )
    parseUnit(baselineBundle, unit)
  }
  for (const unit of fixture.targetUnits) {
    const region = ledger.regions.find(row => row.target?.index === unit.index)
    assert(region, `target u${unit.index}`)
    assert.deepEqual(
      {
        nodeType: region.target.nodeType,
        start: region.target.start,
        end: region.target.end,
        sourceHash: region.target.sourceHash,
        coarseHash: region.target.coarseHash,
      },
      {
        nodeType: unit.nodeType,
        start: unit.start,
        end: unit.end,
        sourceHash: unit.sourceHash,
        coarseHash: unit.coarseHash,
      },
    )
    parseUnit(targetBundle, unit)
  }

  const byIndex = new Map(fixture.targetUnits.map(unit => [unit.index, unit]))
  const baselineMembership = parseUnit(baselineBundle, fixture.baselineUnits[0])
  const targetMembership = parseUnit(targetBundle, byIndex.get(6666))
  assert.match(baselineMembership.text, /\.has\(H\)/)
  assert.doesNotMatch(baselineMembership.text, /cachedExperimentFeatures/)
  assert.match(targetMembership.text, /f5H\.has\(H\)/)
  assert.match(targetMembership.text, /!S\$H\(\)/)
  assert.match(targetMembership.text, /cachedExperimentFeatures\?\?\[\]/)

  const baselineSync = parseUnit(baselineBundle, fixture.baselineUnits[1])
  const targetSync = parseUnit(targetBundle, byIndex.get(6674))
  assert.doesNotMatch(baselineSync.text, /cachedExperimentFeatures|sort\(\)/)
  assert.match(targetSync.text, /Array\.from\(f5H\.keys\(\)\)\.sort\(\)/)
  assert.equal(
    targetSync.text.split('cachedExperimentFeatures').length - 1,
    2,
  )

  const exportUnit = parseUnit(targetBundle, byIndex.get(6660))
  const properties = []
  walk(exportUnit.node, node => {
    if (node.type === 'Property') properties.push(node)
  })
  for (const binding of fixture.targetBindings) {
    const matches = properties.filter(
      property => (property.key.name ?? property.key.value) === binding.exportName,
    )
    assert.equal(matches.length, 1)
    const property = matches[0]
    assert.equal(property.start + byIndex.get(6660).start, binding.propertyStart)
    assert.equal(property.end + byIndex.get(6660).start, binding.propertyEnd)
    assert.equal(property.value.type, 'ArrowFunctionExpression')
    assert.equal(property.value.params.length, 0)
    assert.equal(property.value.body.name, binding.localName)
    const definition = parseUnit(targetBundle, byIndex.get(binding.definitionIndex))
    assert.equal(definition.node.id.name, binding.localName)
  }

  const consumer = parseUnit(targetBundle, byIndex.get(17190))
  assert.match(
    consumer.text,
    /return kr8\(lz8\)\|\|VK\$\(lz8\)\|\|lz8 in Nr8\(\)/,
  )
  assert.equal(
    baselineBundle.toString('utf8').split('cachedExperimentFeatures').length - 1,
    0,
  )
  for (const [index, kind, value, start, end] of fixture.residueIdentities) {
    assert([6666, 6674].includes(index))
    assert.equal(kind, 'property')
    assert.equal(value, 'cachedExperimentFeatures')
    assert.equal(targetBundle.subarray(start, end).toString('utf8'), value)
  }
})

test('GrowthBook experiment-cache replay is exact, typed, and fail-closed', async t => {
  const ts = await loadTypeScript()
  const { temporary, sourceRoot } = materializeRawSources()
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  assert.deepEqual(
    applyTarget121GrowthBookExperimentCacheSourceRecovery({ sourceRoot }),
    {
      status: 'recovered',
      files: fixture.inputs.sourceFiles.map(row => row.path),
    },
  )
  assert.deepEqual(
    applyTarget121GrowthBookExperimentCacheSourceRecovery({ sourceRoot }),
    { status: 'already-recovered', files: [] },
  )

  const sourceText = new Map()
  for (const spec of fixture.inputs.sourceFiles) {
    const filename = path.join(sourceRoot, spec.path.replace(/^src\//, ''))
    const value = fs.readFileSync(filename)
    assert.deepEqual(descriptor(value), spec.output)
    sourceText.set(spec.path, value.toString('utf8'))
  }

  const declarationsByPath = new Map()
  for (const [sourcePath, rows] of Map.groupBy(
    fixture.sourceDeclarations,
    row => row.path,
  )) {
    const text = sourceText.get(sourcePath)
    const parsed = sourceFile(ts, sourcePath, text)
    const declarations = findSourceDeclarations(
      ts,
      parsed,
      rows.map(row => row.name),
    )
    declarationsByPath.set(sourcePath, { parsed, declarations })
    for (const expected of rows) {
      const declaration = declarations.get(expected.name)
      const declarationText = text.slice(
        declaration.getStart(parsed),
        declaration.end,
      )
      assert.deepEqual(
        {
          charStart: declaration.getStart(parsed),
          charEnd: declaration.end,
          ...descriptor(Buffer.from(declarationText, 'utf8')),
        },
        {
          charStart: expected.charStart,
          charEnd: expected.charEnd,
          bytes: expected.bytes,
          sha256: expected.sha256,
        },
      )
    }
  }

  const growthbookText = sourceText.get('src/services/analytics/growthbook.ts')
  const growthbook = declarationsByPath.get(
    'src/services/analytics/growthbook.ts',
  )
  const cachedValueText = growthbookText.slice(
    growthbook.declarations.get('hasGrowthBookCachedValue').getStart(
      growthbook.parsed,
    ),
    growthbook.declarations.get('hasGrowthBookCachedValue').end,
  )
  const experimentText = growthbookText.slice(
    growthbook.declarations.get('isFeatureFromExperiment').getStart(
      growthbook.parsed,
    ),
    growthbook.declarations.get('isFeatureFromExperiment').end,
  )
  const syncText = growthbookText.slice(
    growthbook.declarations.get('syncRemoteEvalToDisk').getStart(growthbook.parsed),
    growthbook.declarations.get('syncRemoteEvalToDisk').end,
  )
  assert.match(cachedValueText, /cachedGrowthBookFeatures\?\.\[feature\] !== undefined/)
  assert.match(experimentText, /experimentDataByFeature\.has\(feature\)/)
  assert.match(experimentText, /if \(!isGrowthBookEnabled\(\)\) return false/)
  assert.match(experimentText, /cachedExperimentFeatures \?\? \[\]/)
  assert.match(syncText, /experimentDataByFeature\.keys\(\)\)\.sort\(\)/)
  assert.equal(syncText.split('cachedExperimentFeatures').length - 1, 2)

  const configPath = fixture.sourceTypeField.path
  const configText = sourceText.get(configPath)
  const configAst = sourceFile(ts, configPath, configText)
  const globalConfigs = configAst.statements.filter(
    node => ts.isTypeAliasDeclaration(node) && node.name.text === 'GlobalConfig',
  )
  assert.equal(globalConfigs.length, 1)
  const fields = globalConfigs[0].type.members.filter(
    member => member.name?.getText(configAst) === fixture.sourceTypeField.name,
  )
  assert.equal(fields.length, 1)
  const field = fields[0]
  assert(field.questionToken)
  assert(ts.isArrayTypeNode(field.type))
  assert.equal(field.type.elementType.kind, ts.SyntaxKind.StringKeyword)
  const fieldText = configText.slice(field.getStart(configAst), field.end)
  assert.deepEqual(
    {
      charStart: field.getStart(configAst),
      charEnd: field.end,
      ...descriptor(Buffer.from(fieldText, 'utf8')),
    },
    {
      charStart: fixture.sourceTypeField.charStart,
      charEnd: fixture.sourceTypeField.charEnd,
      bytes: fixture.sourceTypeField.bytes,
      sha256: fixture.sourceTypeField.sha256,
    },
  )

  const warmPath = 'src/components/WarmResumeHint.tsx'
  const warmText = sourceText.get(warmPath)
  const warmAst = sourceFile(ts, warmPath, warmText)
  const growthBookImports = warmAst.statements.filter(
    node =>
      ts.isImportDeclaration(node) &&
      node.moduleSpecifier.text === '../services/analytics/growthbook.js',
  )
  assert.equal(growthBookImports.length, 1)
  const imports = growthBookImports[0].importClause.namedBindings.elements.map(
    element => element.name.text,
  )
  assert(imports.includes('isFeatureFromExperiment'))
  assert(!imports.includes('getAllGrowthBookFeatures'))
  const warmDeclarations = findSourceDeclarations(ts, warmAst, ['isGateRegistered'])
  const warmGateText = warmText.slice(
    warmDeclarations.get('isGateRegistered').getStart(warmAst),
    warmDeclarations.get('isGateRegistered').end,
  )
  assert.match(
    warmGateText,
    /isFeatureFromExperiment\(WARM_RESUME_GATE\)[\s\S]*hasGrowthBookEnvOverride\(WARM_RESUME_GATE\)[\s\S]*WARM_RESUME_GATE in getGrowthBookConfigOverrides\(\)/,
  )

  const buildDir = path.join(temporary, 'build')
  const build = spawnSync(
    'bun',
    [
      'build',
      path.join(sourceRoot, 'services/analytics/growthbook.ts'),
      path.join(sourceRoot, 'utils/config.ts'),
      path.join(sourceRoot, 'components/WarmResumeHint.tsx'),
      '--target=node',
      '--external=*',
      '--outdir',
      buildDir,
    ],
    { cwd: root, encoding: 'utf8' },
  )
  assert.equal(build.status, 0, build.stderr)

  const invalid = materializeRawSources()
  t.after(() => fs.rmSync(invalid.temporary, { recursive: true, force: true }))
  const growthbookFilename = path.join(
    invalid.sourceRoot,
    'services/analytics/growthbook.ts',
  )
  fs.appendFileSync(growthbookFilename, '\n')
  assert.throws(
    () =>
      applyTarget121GrowthBookExperimentCacheSourceRecovery({
        sourceRoot: invalid.sourceRoot,
      }),
    /requires its exact raw or recovered source state/,
  )
  const configSpec = fixture.inputs.sourceFiles.find(
    row => row.path === 'src/utils/config.ts',
  )
  assert.deepEqual(
    descriptor(fs.readFileSync(path.join(invalid.sourceRoot, 'utils/config.ts'))),
    configSpec.input,
  )
})

test('recovered source and authenticated target have equivalent cache behavior', async t => {
  const ts = await loadTypeScript()
  const targetBundle = fs.readFileSync(
    path.join(root, fixture.inputs.targetBundle.path),
    'utf8',
  )
  const { temporary, sourceRoot } = materializeRawSources()
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  applyTarget121GrowthBookExperimentCacheSourceRecovery({ sourceRoot })
  const growthbookText = fs.readFileSync(
    path.join(sourceRoot, 'services/analytics/growthbook.ts'),
    'utf8',
  )
  const parsed = sourceFile(ts, 'growthbook.ts', growthbookText)
  const target = targetRuntime(targetBundle)
  const source = sourceRuntime(ts, growthbookText, parsed)

  for (const runtime of [target, source]) {
    runtime.state.config = { cachedGrowthBookFeatures: { disabled: false } }
    assert.equal(runtime.api.hasGrowthBookCachedValue('disabled'), true)
    assert.equal(runtime.api.hasGrowthBookCachedValue('missing'), false)

    runtime.state.experimentData.set('live', { variationId: 1 })
    runtime.state.enabled = false
    runtime.state.config.cachedExperimentFeatures = ['persisted']
    assert.equal(runtime.api.isFeatureFromExperiment('live'), true)
    assert.equal(runtime.api.isFeatureFromExperiment('persisted'), false)
    runtime.state.enabled = true
    assert.equal(runtime.api.isFeatureFromExperiment('persisted'), true)
    assert.equal(runtime.api.isFeatureFromExperiment('missing'), false)

    runtime.state.remoteFeatures.clear()
    runtime.state.remoteFeatures.set('beta', 2)
    runtime.state.remoteFeatures.set('alpha', 1)
    runtime.state.experimentData.clear()
    runtime.state.experimentData.set('zeta', {})
    runtime.state.experimentData.set('alpha', {})
    runtime.state.config = {
      cachedGrowthBookFeatures: { beta: 2, alpha: 1 },
      cachedExperimentFeatures: ['alpha', 'zeta'],
    }
    runtime.state.saves = 0
    runtime.api.syncRemoteEvalToDisk()
    assert.equal(runtime.state.saves, 0)
    runtime.state.remoteFeatures.set('gamma', 3)
    runtime.api.syncRemoteEvalToDisk()
    assert.equal(runtime.state.saves, 1)
    assert.deepEqual(plainValue(runtime.state.config), {
      cachedGrowthBookFeatures: { beta: 2, alpha: 1, gamma: 3 },
      cachedExperimentFeatures: ['alpha', 'zeta'],
    })
  }
  assert.deepEqual(
    plainValue(target.state.config),
    plainValue(source.state.config),
  )

  const consumerUnit = fixture.targetUnits.find(unit => unit.index === 17190)
  const consumerText = targetBundle.slice(consumerUnit.start, consumerUnit.end)
  const targetCalls = []
  const targetConsumer = {
    kr8: value => (targetCalls.push(['experiment', value]), false),
    VK$: value => (targetCalls.push(['environment', value]), false),
    Nr8: () => (targetCalls.push(['config']), { tengu_ember_trail: '1' }),
    lz8: 'tengu_ember_trail',
  }
  vm.runInNewContext(
    `${consumerText}\nglobalThis.result = y$5()`,
    targetConsumer,
  )
  assert.equal(targetConsumer.result, true)

  const warmText = fs.readFileSync(
    path.join(sourceRoot, 'components/WarmResumeHint.tsx'),
    'utf8',
  )
  const warmAst = sourceFile(ts, 'WarmResumeHint.tsx', warmText)
  const warmDeclaration = findSourceDeclarations(ts, warmAst, [
    'isGateRegistered',
  ]).get('isGateRegistered')
  const sourceGate = warmText
    .slice(warmDeclaration.getStart(warmAst), warmDeclaration.end)
    .replace(/: boolean/, '')
  const sourceCalls = []
  const transpiledGate = ts.transpileModule(
    `const WARM_RESUME_GATE = 'tengu_ember_trail'\n${sourceGate}\nglobalThis.result = isGateRegistered()`,
    {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
      },
    },
  )
  const sourceConsumer = {
    isFeatureFromExperiment: value =>
      (sourceCalls.push(['experiment', value]), false),
    hasGrowthBookEnvOverride: value =>
      (sourceCalls.push(['environment', value]), false),
    getGrowthBookConfigOverrides: () =>
      (sourceCalls.push(['config']), { tengu_ember_trail: '1' }),
  }
  vm.runInNewContext(transpiledGate.outputText, sourceConsumer)
  assert.equal(sourceConsumer.result, true)
  assert.deepEqual(targetCalls, sourceCalls)
})
