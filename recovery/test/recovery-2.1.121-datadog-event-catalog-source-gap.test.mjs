import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  applyTarget121DatadogEventCatalogSourceRecovery,
  TARGET121_DATADOG_ALLOWED_EVENTS,
  TARGET121_DATADOG_EVENT_CATALOG_EVIDENCE_IDS,
  TARGET121_DATADOG_EVENT_CATALOG_INPUT_FILES,
  TARGET121_DATADOG_EVENT_CATALOG_OUTPUT_FILES,
  TARGET121_DATADOG_EVENT_CATALOG_OWNER_OVERRIDES,
  TARGET121_DATADOG_TAG_FIELDS,
} from '../cases/2.1.120-to-2.1.121/recovered/replay-datadog-event-catalog-source-gap.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.121-datadog-event-catalog-source-gap.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })
const catalogDescriptor = values => ({
  count: values.length,
  sha256: sha256(JSON.stringify(values)),
})

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

function materializeRawSource() {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target121-datadog-event-catalog-'),
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
  const bytes = bundle.subarray(unit.start, unit.end)
  assert.deepEqual(descriptor(bytes), {
    bytes: unit.bytes,
    sha256: unit.sourceHash,
  })
  const ast = parse(bytes.toString('utf8'), {
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  assert.equal(ast.body.length, 1)
  assert.equal(ast.body[0].type, unit.nodeType)
  return { bytes, text: bytes.toString('utf8'), node: ast.body[0] }
}

function bundleCatalogs(unit) {
  const sets = []
  const arrays = []
  walk(unit.node, node => {
    if (node.type !== 'AssignmentExpression') return
    if (
      node.right.type === 'NewExpression' &&
      node.right.callee.name === 'Set' &&
      node.right.arguments[0]?.type === 'ArrayExpression'
    ) {
      const values = node.right.arguments[0].elements.map(element => element.value)
      if (values.every(value => typeof value === 'string')) sets.push(values)
      return
    }
    if (node.right.type === 'ArrayExpression') {
      const values = node.right.elements.map(element => element.value)
      if (values.every(value => typeof value === 'string')) arrays.push(values)
    }
  })
  sets.sort((left, right) => right.length - left.length)
  arrays.sort((left, right) => right.length - left.length)
  assert.ok(sets[0]?.length > 0)
  assert.ok(arrays[0]?.length > 0)
  return { allowedEvents: sets[0], tagFields: arrays[0] }
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

function sourceCatalogs(ts, filename, bytes) {
  const text = bytes.toString('utf8')
  const parsed = sourceFile(ts, filename, text)
  const catalogs = new Map()
  for (const statement of parsed.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      const name = declaration.name.getText(parsed)
      if (!['DATADOG_ALLOWED_EVENTS', 'TAG_FIELDS'].includes(name)) continue
      const array =
        name === 'DATADOG_ALLOWED_EVENTS'
          ? declaration.initializer.arguments[0]
          : declaration.initializer
      const values = array.elements.map(element => element.text)
      const start = statement.getStart(parsed)
      catalogs.set(name, {
        values,
        declaration: {
          path: fixture.inputs.sourceFile.path,
          name,
          charStart: start,
          charEnd: statement.end,
          ...descriptor(bytes.subarray(start, statement.end)),
        },
      })
    }
  }
  assert.equal(catalogs.size, 2)
  return { parsed, text, catalogs }
}

function functionText(ts, parsed, text, name) {
  const matches = []
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      matches.push(text.slice(node.getStart(parsed), node.end))
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  assert.equal(matches.length, 1)
  return matches[0]
}

function readCoverage() {
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

test('Target121 Datadog fixture freezes one complete 14-residue lane', () => {
  assert.equal(
    sha256(fixtureBytes),
    '53d9c8976ab8dad3a9c84e5dc99bfaba60cbfd38dbb87eda4007b0cb9c2e28dd',
  )
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.120-to-2.1.121')
  assert.deepEqual(fixture.summary, {
    units: 1,
    residues: 14,
    indicesSha256: sha256(JSON.stringify([6786])),
    residueIdentitiesSha256: sha256(
      JSON.stringify(fixture.residueIdentities),
    ),
  })
  assert.deepEqual(TARGET121_DATADOG_EVENT_CATALOG_INPUT_FILES, [
    { path: fixture.inputs.sourceFile.path, ...fixture.inputs.sourceFile.input },
  ])
  assert.deepEqual(TARGET121_DATADOG_EVENT_CATALOG_OUTPUT_FILES, [
    { path: fixture.inputs.sourceFile.path, ...fixture.inputs.sourceFile.output },
  ])
  assert.deepEqual(
    catalogDescriptor(TARGET121_DATADOG_ALLOWED_EVENTS),
    fixture.catalogs.target.allowedEvents,
  )
  assert.deepEqual(
    catalogDescriptor(TARGET121_DATADOG_TAG_FIELDS),
    fixture.catalogs.target.tagFields,
  )
  assert.deepEqual(
    TARGET121_DATADOG_EVENT_CATALOG_OWNER_OVERRIDES.map(row => ({
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
    [...TARGET121_DATADOG_EVENT_CATALOG_EVIDENCE_IDS],
    fixture.strictRows[0].evidenceIds,
  )
})

test('authenticated bundles pin the complete Target120-to-Target121 catalog delta', () => {
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
  const baselineStructural = [
    ...(structural.unmatchedBaseline ?? []),
    ...structural.regions.map(region => region.baseline).filter(Boolean),
  ].find(unit => unit.index === fixture.baselineUnit.index)
  assert(baselineStructural)
  assert.deepEqual(
    {
      nodeType: baselineStructural.nodeType,
      start: baselineStructural.start,
      end: baselineStructural.end,
      sourceHash: baselineStructural.sourceHash,
      coarseHash: baselineStructural.coarseHash,
    },
    {
      nodeType: fixture.baselineUnit.nodeType,
      start: fixture.baselineUnit.start,
      end: fixture.baselineUnit.end,
      sourceHash: fixture.baselineUnit.sourceHash,
      coarseHash: fixture.baselineUnit.coarseHash,
    },
  )
  const baselineCatalogs = bundleCatalogs(
    parseUnit(baseline, fixture.baselineUnit),
  )

  const targetUnits = new Map()
  for (const expected of fixture.targetUnits) {
    const region = structural.regions.find(
      candidate => candidate.target?.index === expected.index,
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
    targetUnits.set(expected.index, parseUnit(target, expected))
  }
  const targetCatalogs = bundleCatalogs(targetUnits.get(6786))
  assert.deepEqual(
    catalogDescriptor(baselineCatalogs.allowedEvents),
    fixture.catalogs.baseline.allowedEvents,
  )
  assert.deepEqual(
    catalogDescriptor(baselineCatalogs.tagFields),
    fixture.catalogs.baseline.tagFields,
  )
  assert.deepEqual(
    catalogDescriptor(targetCatalogs.allowedEvents),
    fixture.catalogs.target.allowedEvents,
  )
  assert.deepEqual(
    catalogDescriptor(targetCatalogs.tagFields),
    fixture.catalogs.target.tagFields,
  )
  assert.deepEqual(
    targetCatalogs.allowedEvents.filter(
      value => !baselineCatalogs.allowedEvents.includes(value),
    ),
    fixture.catalogs.targetDelta.addedEvents,
  )
  assert.deepEqual(
    baselineCatalogs.allowedEvents.filter(
      value => !targetCatalogs.allowedEvents.includes(value),
    ),
    fixture.catalogs.targetDelta.removedEvents,
  )
  assert.deepEqual(
    targetCatalogs.tagFields.filter(
      value => !baselineCatalogs.tagFields.includes(value),
    ),
    fixture.catalogs.targetDelta.addedTagFields,
  )
  assert.deepEqual(
    baselineCatalogs.tagFields.filter(
      value => !targetCatalogs.tagFields.includes(value),
    ),
    fixture.catalogs.targetDelta.removedTagFields,
  )
  assert.match(targetUnits.get(6783).text, /!wY_\.has\(H\)/)
  assert.match(targetUnits.get(6783).text, /jY_\.filter/)
  for (const [, kind, value, start, end] of fixture.residueIdentities) {
    assert.equal(kind, 'string')
    assert.equal(JSON.parse(target.subarray(start, end).toString('utf8')), value)
    assert(targetCatalogs.allowedEvents.includes(value))
  }
})

test('Datadog catalog replay is exact, typed, idempotent, and fail-closed', async t => {
  const ts = await loadTypeScript()
  const { temporary, sourceRoot, filename } = materializeRawSource()
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const rawBytes = fs.readFileSync(filename)
  const raw = sourceCatalogs(ts, filename, rawBytes)
  assert.deepEqual(
    catalogDescriptor(raw.catalogs.get('DATADOG_ALLOWED_EVENTS').values),
    fixture.catalogs.rawSource.allowedEvents,
  )
  assert.deepEqual(
    catalogDescriptor(raw.catalogs.get('TAG_FIELDS').values),
    fixture.catalogs.rawSource.tagFields,
  )

  assert.deepEqual(
    applyTarget121DatadogEventCatalogSourceRecovery({ sourceRoot }),
    { status: 'recovered', files: [fixture.inputs.sourceFile.path] },
  )
  assert.deepEqual(
    applyTarget121DatadogEventCatalogSourceRecovery({ sourceRoot }),
    { status: 'already-recovered', files: [] },
  )
  const outputBytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(outputBytes), fixture.inputs.sourceFile.output)
  const output = sourceCatalogs(ts, filename, outputBytes)
  assert.deepEqual(
    output.catalogs.get('DATADOG_ALLOWED_EVENTS').values,
    [...TARGET121_DATADOG_ALLOWED_EVENTS],
  )
  assert.deepEqual(
    output.catalogs.get('TAG_FIELDS').values,
    [...TARGET121_DATADOG_TAG_FIELDS],
  )
  assert.deepEqual(
    fixture.sourceDeclarations,
    [...output.catalogs.values()].map(item => item.declaration),
  )
  const consumer = functionText(
    ts,
    output.parsed,
    output.text,
    'trackDatadogEvent',
  )
  assert.match(consumer, /!DATADOG_ALLOWED_EVENTS\.has\(eventName\)/)
  assert.match(consumer, /TAG_FIELDS\.filter/)

  const build = spawnSync(
    'bun',
    [
      'build',
      filename,
      '--target=node',
      '--external=*',
      '--outfile',
      path.join(temporary, 'datadog.js'),
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
      applyTarget121DatadogEventCatalogSourceRecovery({
        sourceRoot: invalid.sourceRoot,
      }),
    /requires its exact raw or recovered source state/,
  )
  assert.deepEqual(fs.readFileSync(invalid.filename), invalidBefore)
})

test('recovered source has exact target allowlist and tag-selection behavior', async t => {
  const ts = await loadTypeScript()
  const target = fs.readFileSync(path.join(root, fixture.inputs.targetBundle.path))
  const targetCatalogUnit = fixture.targetUnits.find(unit => unit.index === 6786)
  const targetCatalogs = bundleCatalogs(parseUnit(target, targetCatalogUnit))
  const { temporary, sourceRoot, filename } = materializeRawSource()
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  applyTarget121DatadogEventCatalogSourceRecovery({ sourceRoot })
  const source = sourceCatalogs(ts, filename, fs.readFileSync(filename))
  const sourceEvents = source.catalogs.get('DATADOG_ALLOWED_EVENTS').values
  const sourceTags = source.catalogs.get('TAG_FIELDS').values
  const targetSet = new Set(targetCatalogs.allowedEvents)
  const sourceSet = new Set(sourceEvents)
  const candidates = new Set([
    ...targetCatalogs.allowedEvents,
    ...fixture.catalogs.targetDelta.removedEvents,
    'not_a_datadog_event',
  ])
  for (const candidate of candidates) {
    assert.equal(sourceSet.has(candidate), targetSet.has(candidate), candidate)
  }
  for (const event of fixture.catalogs.targetDelta.addedEvents) {
    assert.equal(sourceSet.has(event), true, event)
  }
  for (const event of fixture.catalogs.targetDelta.removedEvents) {
    assert.equal(sourceSet.has(event), false, event)
  }

  const properties = Object.fromEntries(
    [...new Set([...targetCatalogs.tagFields, ...sourceTags])].map(
      (field, index) => [field, index],
    ),
  )
  const select = (fields, values) =>
    fields.filter(field => values[field] !== undefined && values[field] !== null)
  assert.deepEqual(
    select(sourceTags, properties),
    select(targetCatalogs.tagFields, properties),
  )
  assert.deepEqual(sourceEvents, targetCatalogs.allowedEvents)
  assert.deepEqual(sourceTags, targetCatalogs.tagFields)
})

test('Target121 coverage is either generic pre-replay state or fully integrated', () => {
  const ledger = readCoverage()
  const expected = TARGET121_DATADOG_EVENT_CATALOG_OWNER_OVERRIDES[0]
  const row = ledger.rows.find(item => item.targetIndex === expected.targetIndex)
  assert(row)
  const ownerById = new Map(ledger.owners.map(owner => [owner.id, owner.path]))
  const paths = row.ownerIds.map(id => ownerById.get(id)).sort()
  assert.deepEqual(paths, [...expected.paths])
  const evidenceSignal = expected.evidenceIds.some(id =>
    row.evidenceIds.includes(id),
  )
  if (!evidenceSignal) {
    assert.deepEqual(row.evidenceIds, [
      'source-map-attribution',
      'semantic-test',
    ])
    assert.match(row.behavior, /current cumulative src/)
    return
  }
  assert.deepEqual(row.evidenceIds, [...expected.evidenceIds])
  assert.equal(row.behavior, expected.behavior)
  for (const evidenceId of expected.evidenceIds) {
    assert(ledger.evidence.some(evidence => evidence.id === evidenceId))
  }
})
