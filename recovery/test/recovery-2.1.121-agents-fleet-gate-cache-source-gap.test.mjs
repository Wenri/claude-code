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
  applyTarget121AgentsFleetGateCacheSourceRecovery,
  TARGET121_AGENTS_FLEET_GATE_CACHE_EVIDENCE_IDS,
  TARGET121_AGENTS_FLEET_GATE_CACHE_INPUT_FILES,
  TARGET121_AGENTS_FLEET_GATE_CACHE_OUTPUT_FILES,
  TARGET121_AGENTS_FLEET_GATE_CACHE_OWNER_OVERRIDES,
} from '../cases/2.1.120-to-2.1.121/recovered/replay-agents-fleet-gate-cache-source-gap.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.121-agents-fleet-gate-cache-source-gap.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })
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

function sourceFile(ts, filename, text) {
  const parsed = ts.createSourceFile(
    filename,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(parsed.parseDiagnostics.length, 0)
  return parsed
}

function materializeRawSource() {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target121-agents-fleet-gate-cache-'),
  )
  const sourceRoot = path.join(temporary, 'src')
  const spec = fixture.inputs.sourceFile
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
  return { temporary, sourceRoot, filename }
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

function functionDeclaration(ts, parsed, name) {
  const matches = []
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  assert.equal(matches.length, 1)
  return matches[0]
}

function count(text, value) {
  return text.split(value).length - 1
}

function coverage() {
  return JSON.parse(
    gunzipSync(
      fs.readFileSync(
        path.join(
          root,
          'recovery/cases/2.1.120-to-2.1.121/semantic/source-coverage.json.gz',
        ),
      ),
    ),
  )
}

test('Target121 agents-fleet fixture freezes one exact three-residue lane', () => {
  assert.equal(
    sha256(fixtureBytes),
    'a0565f37d415c347f21331616f81bc6afa3c10cdc234410d68264a96e7b6ee98',
  )
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.120-to-2.1.121')
  assert.deepEqual(fixture.summary, {
    units: 1,
    residues: 3,
    indicesSha256: sha256(JSON.stringify([6723])),
    residueIdentitiesSha256: sha256(
      JSON.stringify(fixture.residueIdentities),
    ),
  })
  assert.deepEqual(TARGET121_AGENTS_FLEET_GATE_CACHE_INPUT_FILES, [
    { path: fixture.inputs.sourceFile.path, ...fixture.inputs.sourceFile.input },
  ])
  assert.deepEqual(TARGET121_AGENTS_FLEET_GATE_CACHE_OUTPUT_FILES, [
    { path: fixture.inputs.sourceFile.path, ...fixture.inputs.sourceFile.output },
  ])
  assert.deepEqual(
    TARGET121_AGENTS_FLEET_GATE_CACHE_OWNER_OVERRIDES.map(row => ({
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
  assert.deepEqual(
    [...TARGET121_AGENTS_FLEET_GATE_CACHE_EVIDENCE_IDS],
    fixture.strictRows[0].evidenceIds,
  )
  assert.notEqual(
    fixture.strictRows[0].ownerPath,
    fixture.strictRows[0].rejectedOwnerPath,
  )
})

test('authenticated target binds fleet hydration to persisted GrowthBook cache', () => {
  const baseline = fs.readFileSync(
    path.join(root, fixture.inputs.baselineBundle.path),
  )
  const target = fs.readFileSync(path.join(root, fixture.inputs.targetBundle.path))
  const structuralBytes = fs.readFileSync(
    path.join(root, fixture.inputs.structuralLedger.path),
  )
  assert.deepEqual(descriptor(baseline), {
    bytes: fixture.inputs.baselineBundle.bytes,
    sha256: fixture.inputs.baselineBundle.sha256,
  })
  assert.deepEqual(descriptor(target), {
    bytes: fixture.inputs.targetBundle.bytes,
    sha256: fixture.inputs.targetBundle.sha256,
  })
  assert.deepEqual(descriptor(structuralBytes), {
    bytes: fixture.inputs.structuralLedger.bytes,
    sha256: fixture.inputs.structuralLedger.sha256,
  })
  const structural = JSON.parse(gunzipSync(structuralBytes))
  const units = new Map()
  for (const expected of fixture.targetUnits) {
    const region = structural.regions.find(
      row => row.target?.index === expected.index,
    )
    assert(region, `u${expected.index}`)
    assert.deepEqual(
      {
        nodeType: region.target.nodeType,
        start: region.target.start,
        end: region.target.end,
        sourceHash: region.target.sourceHash,
        coarseHash: region.target.coarseHash,
      },
      {
        nodeType: expected.nodeType,
        start: expected.start,
        end: expected.end,
        sourceHash: expected.sourceHash,
        coarseHash: expected.coarseHash,
      },
    )
    units.set(expected.index, parseUnit(target, expected))
  }

  const propertiesByTable = new Map()
  for (const tableIndex of [6660, 6721]) {
    const properties = []
    walk(units.get(tableIndex).node, node => {
      if (node.type === 'Property') properties.push(node)
    })
    propertiesByTable.set(tableIndex, properties)
  }
  for (const binding of fixture.targetBindings) {
    const table = fixture.targetUnits.find(
      unit => unit.index === binding.exportTableIndex,
    )
    const matches = propertiesByTable
      .get(binding.exportTableIndex)
      .filter(
        property =>
          (property.key.name ?? property.key.value) === binding.exportName,
      )
    assert.equal(matches.length, 1, binding.exportName)
    const property = matches[0]
    assert.equal(table.start + property.start, binding.propertyStart)
    assert.equal(table.start + property.end, binding.propertyEnd)
    assert.equal(property.value.type, 'ArrowFunctionExpression')
    assert.equal(property.value.body.name, binding.localName)
    if (binding.definitionIndex !== undefined) {
      assert.equal(
        units.get(binding.definitionIndex).node.id.name,
        binding.localName,
      )
    }
  }

  const hydrator = units.get(6723).text
  assert.match(
    hydrator,
    /getSettingsWithErrors:H[\s\S]*fLH\(\)\|\|VK\$\("tengu_slate_meadow"\)\|\|Vr8\("tengu_slate_meadow"\)[\s\S]*QO\(mZ\(\),300,"gb-before-fleet-gate"\)/,
  )
  assert.ok(hydrator.indexOf('getSettingsWithErrors') < hydrator.indexOf('fLH()'))
  assert.ok(hydrator.indexOf('fLH()') < hydrator.indexOf('VK$('))
  assert.ok(hydrator.indexOf('VK$(') < hydrator.indexOf('Vr8('))
  assert.ok(hydrator.indexOf('Vr8(') < hydrator.indexOf('QO('))

  const baselineText = baseline.toString('utf8')
  const targetText = target.toString('utf8')
  for (const [token, expected] of Object.entries(fixture.bundleTokenCounts)) {
    assert.equal(count(baselineText, token), expected.baseline, `${token}: baseline`)
    assert.equal(count(targetText, token), expected.target, `${token}: target`)
  }
  for (const [index, kind, value, start, end] of fixture.residueIdentities) {
    assert.equal(index, 6723)
    const targetSlice = target.subarray(start, end).toString('utf8')
    assert.equal(kind === 'string' ? JSON.parse(targetSlice) : targetSlice, value)
    assert(['property', 'string'].includes(kind))
  }
})

test('agents-fleet cache replay is exact, typed, idempotent, and fail-closed', async t => {
  const ts = await loadTypeScript()
  const { temporary, sourceRoot, filename } = materializeRawSource()
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  assert.deepEqual(
    applyTarget121AgentsFleetGateCacheSourceRecovery({ sourceRoot }),
    { status: 'recovered', files: [fixture.inputs.sourceFile.path] },
  )
  assert.deepEqual(
    applyTarget121AgentsFleetGateCacheSourceRecovery({ sourceRoot }),
    { status: 'already-recovered', files: [] },
  )
  const bytes = fs.readFileSync(filename)
  const text = bytes.toString('utf8')
  assert.deepEqual(descriptor(bytes), fixture.inputs.sourceFile.output)
  const parsed = sourceFile(ts, filename, text)

  const growthBookImports = parsed.statements.filter(
    node =>
      ts.isImportDeclaration(node) &&
      node.moduleSpecifier.text === fixture.sourceImport.module,
  )
  assert.equal(growthBookImports.length, 1)
  const importedNames = growthBookImports[0].importClause.namedBindings.elements.map(
    element => element.name.text,
  )
  assert(importedNames.includes(fixture.sourceImport.addedName))
  assert(!importedNames.includes(fixture.sourceImport.removedName))

  const declaration = functionDeclaration(
    ts,
    parsed,
    fixture.sourceDeclaration.name,
  )
  const declarationStart = declaration.getStart(parsed)
  const declarationBytes = bytes.subarray(declarationStart, declaration.end)
  assert.deepEqual(
    {
      path: fixture.inputs.sourceFile.path,
      name: declaration.name.text,
      charStart: declarationStart,
      charEnd: declaration.end,
      ...descriptor(declarationBytes),
    },
    fixture.sourceDeclaration,
  )
  const declarationText = declarationBytes.toString('utf8')
  assert.match(
    declarationText,
    /getSessionSettingsCache\(\) === null\) getSettingsWithErrors\(\)/,
  )
  assert.match(
    declarationText,
    /isFleetDisabled\(\)[\s\S]*hasGrowthBookEnvOverride\('tengu_slate_meadow'\)[\s\S]*hasGrowthBookCachedValue\('tengu_slate_meadow'\)/,
  )
  assert.doesNotMatch(declarationText, /getGrowthBookConfigOverrides/)
  assert.match(
    declarationText,
    /withTimeout\([\s\S]*initializeGrowthBook\(\),[\s\S]*300,[\s\S]*'gb-before-fleet-gate',[\s\S]*\)\.catch\(\(\) => \{\}\)/,
  )

  const build = spawnSync(
    'bun',
    [
      'build',
      filename,
      '--target=node',
      '--external=*',
      '--outfile',
      path.join(temporary, 'agentsFleet.js'),
    ],
    { cwd: root, encoding: 'utf8' },
  )
  assert.equal(build.status, 0, build.stderr)

  const invalid = materializeRawSource()
  t.after(() => fs.rmSync(invalid.temporary, { recursive: true, force: true }))
  fs.appendFileSync(invalid.filename, '\n')
  const invalidBefore = fs.readFileSync(invalid.filename)
  assert.throws(
    () =>
      applyTarget121AgentsFleetGateCacheSourceRecovery({
        sourceRoot: invalid.sourceRoot,
      }),
    /requires its exact raw or recovered source state/,
  )
  assert.deepEqual(fs.readFileSync(invalid.filename), invalidBefore)
})

function targetRuntime(targetText, state) {
  const context = {
    kU: () => (state.calls.push(['settings-cache']), state.cache),
    z6: () => state.calls.push(['settings-module']),
    SEH: {
      getSettingsWithErrors: () => {
        state.calls.push(['settings'])
        state.cache = {}
      },
    },
    fLH: () => (state.calls.push(['fleet-disabled']), state.disabled),
    VK$: value => (state.calls.push(['environment', value]), state.environment),
    Vr8: value => (state.calls.push(['cached', value]), state.cached),
    mZ: () => (state.calls.push(['initialize']), 'growthbook-client'),
    QO: (value, milliseconds, label) => {
      state.calls.push(['timeout', milliseconds, label, value])
      return state.rejectTimeout
        ? Promise.reject(new Error('timeout'))
        : Promise.resolve(value)
    },
  }
  vm.runInNewContext(`${targetText}\nglobalThis.run = Sr8`, context)
  return context.run
}

function sourceRuntime(ts, declarationText, state) {
  const program = `
const getSessionSettingsCache = () => (runtime.calls.push(['settings-cache']), runtime.cache)
const getSettingsWithErrors = () => {
  runtime.calls.push(['settings'])
  runtime.cache = {}
}
const isFleetDisabled = () => (runtime.calls.push(['fleet-disabled']), runtime.disabled)
const hasGrowthBookEnvOverride = value => (runtime.calls.push(['environment', value]), runtime.environment)
const hasGrowthBookCachedValue = value => (runtime.calls.push(['cached', value]), runtime.cached)
const initializeGrowthBook = () => (runtime.calls.push(['initialize']), 'growthbook-client')
const withTimeout = (value, milliseconds, label) => {
  runtime.calls.push(['timeout', milliseconds, label, value])
  return runtime.rejectTimeout ? Promise.reject(new Error('timeout')) : Promise.resolve(value)
}
${declarationText.replace(/^export /, '')}
globalThis.run = ensureFleetGateHydrated
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
  const context = { runtime: state }
  vm.runInNewContext(transpiled.outputText, context)
  return context.run
}

test('recovered source and authenticated target preserve hydration order and fail open', async t => {
  const ts = await loadTypeScript()
  const targetBundle = fs.readFileSync(
    path.join(root, fixture.inputs.targetBundle.path),
  )
  const targetUnit = fixture.targetUnits.find(unit => unit.index === 6723)
  const targetText = parseUnit(targetBundle, targetUnit).text
  const { temporary, sourceRoot, filename } = materializeRawSource()
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  applyTarget121AgentsFleetGateCacheSourceRecovery({ sourceRoot })
  const sourceText = fs.readFileSync(filename, 'utf8')
  const parsed = sourceFile(ts, filename, sourceText)
  const declaration = functionDeclaration(
    ts,
    parsed,
    fixture.sourceDeclaration.name,
  )
  const declarationText = sourceText.slice(
    declaration.getStart(parsed),
    declaration.end,
  )

  const scenarios = [
    {
      name: 'disabled',
      state: { cache: {}, disabled: true, environment: false, cached: false },
      calls: [['settings-cache'], ['fleet-disabled']],
    },
    {
      name: 'settings miss then disabled',
      state: { cache: null, disabled: true, environment: false, cached: false },
      calls: [['settings-cache'], ['settings'], ['fleet-disabled']],
    },
    {
      name: 'environment override',
      state: { cache: {}, disabled: false, environment: true, cached: false },
      calls: [
        ['settings-cache'],
        ['fleet-disabled'],
        ['environment', 'tengu_slate_meadow'],
      ],
    },
    {
      name: 'persisted cached value',
      state: { cache: {}, disabled: false, environment: false, cached: true },
      calls: [
        ['settings-cache'],
        ['fleet-disabled'],
        ['environment', 'tengu_slate_meadow'],
        ['cached', 'tengu_slate_meadow'],
      ],
    },
    {
      name: 'initialize',
      state: { cache: {}, disabled: false, environment: false, cached: false },
      calls: [
        ['settings-cache'],
        ['fleet-disabled'],
        ['environment', 'tengu_slate_meadow'],
        ['cached', 'tengu_slate_meadow'],
        ['initialize'],
        ['timeout', 300, 'gb-before-fleet-gate', 'growthbook-client'],
      ],
    },
    {
      name: 'timeout is suppressed',
      state: {
        cache: {},
        disabled: false,
        environment: false,
        cached: false,
        rejectTimeout: true,
      },
      calls: [
        ['settings-cache'],
        ['fleet-disabled'],
        ['environment', 'tengu_slate_meadow'],
        ['cached', 'tengu_slate_meadow'],
        ['initialize'],
        ['timeout', 300, 'gb-before-fleet-gate', 'growthbook-client'],
      ],
    },
  ]

  for (const scenario of scenarios) {
    const targetState = { ...scenario.state, calls: [] }
    const sourceState = { ...scenario.state, calls: [] }
    await targetRuntime(targetText, targetState)()
    await sourceRuntime(ts, declarationText, sourceState)()
    const targetSemanticCalls = targetState.calls.filter(
      call => call[0] !== 'settings-module',
    )
    assert.deepEqual(plainValue(targetSemanticCalls), scenario.calls, scenario.name)
    assert.deepEqual(plainValue(sourceState.calls), scenario.calls, scenario.name)
    assert.deepEqual(
      plainValue(targetSemanticCalls),
      plainValue(sourceState.calls),
      scenario.name,
    )
    if (scenario.state.cache === null) {
      assert.deepEqual(targetState.calls.slice(0, 3), [
        ['settings-cache'],
        ['settings-module'],
        ['settings'],
      ])
    }
  }
})

test('Target121 coverage is either frozen coarse-owner state or fully integrated', () => {
  const ledger = coverage()
  const expected = TARGET121_AGENTS_FLEET_GATE_CACHE_OWNER_OVERRIDES[0]
  const row = ledger.rows.find(item => item.targetIndex === expected.targetIndex)
  assert(row)
  const ownerById = new Map(ledger.owners.map(owner => [owner.id, owner.path]))
  const paths = row.ownerIds.map(id => ownerById.get(id)).sort()
  const ownerSignal =
    JSON.stringify(paths) === JSON.stringify([...expected.paths].sort())
  const evidenceSignal = expected.evidenceIds.some(id =>
    row.evidenceIds.includes(id),
  )
  if (!ownerSignal && !evidenceSignal) {
    assert.deepEqual(paths, [fixture.strictRows[0].rejectedOwnerPath])
    assert.deepEqual(row.evidenceIds, [
      'source-map-attribution',
      'semantic-test',
    ])
    return
  }
  assert(ownerSignal && evidenceSignal, 'partial agents-fleet integration')
  assert.equal(row.disposition, 'source-runtime-covered')
  assert.deepEqual(paths, [...expected.paths])
  assert.deepEqual(row.evidenceIds, [...expected.evidenceIds])
  assert.equal(row.behavior, expected.behavior)
  for (const evidenceId of expected.evidenceIds) {
    assert(ledger.evidence.some(evidence => evidence.id === evidenceId))
  }
})
