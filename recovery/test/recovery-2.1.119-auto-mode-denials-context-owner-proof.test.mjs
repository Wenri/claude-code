import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET119_AUTO_MODE_DENIALS_CONTEXT_EVIDENCE_IDS,
  TARGET119_AUTO_MODE_DENIALS_CONTEXT_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/auto-mode-denials-context-owner-overrides.mjs'

const root = process.cwd()
const require = createRequire(import.meta.url)
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-auto-mode-denials-context-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '23caca0bb84aa844d783e533d2623c8e158e1c838f7a48f5130cec83bde0ffd1'
const configuredSourceRoot =
  process.env.CLAUDE_CODE_2_1_119_SOURCE_ROOT ??
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
const sourceRoot = configuredSourceRoot
  ? path.resolve(configuredSourceRoot)
  : path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src')

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)

function descriptor(value) {
  return { bytes: Buffer.byteLength(value), sha256: sha256(value) }
}

function sourceDescriptor(value) {
  return {
    chars: value.length,
    bytes: Buffer.byteLength(value),
    sha256: sha256(value),
  }
}

function readPinned(input) {
  const value = fs.readFileSync(path.join(root, input.path))
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return value
}

function slicePinned(bundle, input) {
  const value = bundle.subarray(input.start, input.end)
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return value
}

function readLedger(input) {
  return JSON.parse(gunzipSync(readPinned(input)))
}

function parseUnit(value) {
  return parse(value.toString(), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  })
}

function walk(node, predicate, values = []) {
  if (!node || typeof node !== 'object') return values
  if (predicate(node)) values.push(node)
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc', 'range'].includes(key)) continue
    if (Array.isArray(value)) {
      for (const child of value) walk(child, predicate, values)
    } else {
      walk(value, predicate, values)
    }
  }
  return values
}

function canonicalAst(value, parent = null, parentKey = null) {
  if (Array.isArray(value)) {
    return value.map((entry, index) => canonicalAst(entry, value, index))
  }
  if (!value || typeof value !== 'object') return value
  const result = {}
  for (const [key, child] of Object.entries(value)) {
    if (['start', 'end', 'loc', 'range', 'raw'].includes(key)) continue
    if (key === 'name' && value.type === 'Identifier') {
      const preserve =
        (parent?.type === 'MemberExpression' &&
          parent.computed === false &&
          parentKey === 'property') ||
        (parent?.type === 'Property' &&
          parent.computed === false &&
          parent.shorthand === false &&
          parentKey === 'key') ||
        (parent?.type === 'MethodDefinition' &&
          parent.computed === false &&
          parentKey === 'key')
      result[key] = preserve ? child : '@id'
    } else {
      result[key] = canonicalAst(child, value, key)
    }
  }
  return result
}

function canonicalDescriptor(value) {
  const serialized = JSON.stringify(canonicalAst(parseUnit(value)))
  return {
    bytes: Buffer.byteLength(serialized),
    sha256: sha256(serialized),
    serialized,
  }
}

function removeDenialPropertyDescriptor(value) {
  const ast = parseUnit(value)
  let removed = 0
  walk(ast, node => {
    if (node.type !== 'ObjectExpression') return
    const before = node.properties.length
    node.properties = node.properties.filter(
      property =>
        !(
          property.type === 'Property' &&
          property.computed === false &&
          property.key.type === 'Identifier' &&
          property.key.name === 'removeDenial'
        ),
    )
    removed += before - node.properties.length
  })
  const serialized = JSON.stringify(canonicalAst(ast))
  return {
    removed,
    bytes: Buffer.byteLength(serialized),
    sha256: sha256(serialized),
    serialized,
  }
}

function cacheFacts(value) {
  const ast = parseUnit(value)
  const declaration = ast.body[0].body.body[0].declarations[0]
  const binding = declaration.id.name
  const identifiers = walk(
    ast,
    node => node.type === 'Identifier' && node.name === binding,
  )
  const members = walk(
    ast,
    node =>
      node.type === 'MemberExpression' &&
      node.computed === true &&
      node.object.type === 'Identifier' &&
      node.object.name === binding &&
      node.property.type === 'Literal' &&
      Number.isInteger(node.property.value),
  )
  const indices = members.map(member => member.property.value)
  const unique = [...new Set(indices)].sort((left, right) => left - right)
  const serialized = JSON.stringify(
    unique.map(index => [
      index,
      indices.filter(candidate => candidate === index).length,
    ]),
  )
  return {
    size: declaration.init.arguments[0].value,
    identifierOccurrences: identifiers.length,
    memberOccurrences: members.length,
    indices: unique,
    indexCountsBytes: Buffer.byteLength(serialized),
    indexCountsSha256: sha256(serialized),
  }
}

function assertTargetRegion(ledger, expected) {
  const region = ledger.regions.find(
    candidate => candidate.target.index === expected.targetIndex,
  )
  assert(region, `u${expected.targetIndex}`)
  assert.deepEqual(
    {
      classification: region.classification,
      nodeType: region.target.nodeType,
      start: region.target.start,
      end: region.target.end,
      bytes: region.target.end - region.target.start,
      tokenCount: region.target.tokenCount,
      sha256: region.target.sourceHash,
      coarseHash: region.target.coarseHash,
    },
    {
      classification: expected.classification,
      nodeType: expected.nodeType,
      start: expected.start,
      end: expected.end,
      bytes: expected.bytes,
      tokenCount: expected.tokenCount,
      sha256: expected.sha256,
      coarseHash: expected.coarseHash,
    },
  )
  if ('baselineUnitIndex' in expected) {
    assert.equal(region.baselineUnitIndex, expected.baselineUnitIndex)
    assert.equal(region.pairReason, expected.pairReason)
  }
  if ('unknownFreeIdentifierCount' in expected) {
    assert.equal(
      region.unknownFreeIdentifierCount,
      expected.unknownFreeIdentifierCount,
    )
  }
  return region
}

function assertBaselineUnit(ledger, expected) {
  const unit = ledger.unmatchedBaseline.find(
    candidate => candidate.index === expected.targetIndex,
  )
  assert(unit, `baseline u${expected.targetIndex}`)
  assert.deepEqual(
    {
      nodeType: unit.nodeType,
      start: unit.start,
      end: unit.end,
      bytes: unit.end - unit.start,
      tokenCount: unit.tokenCount,
      sha256: unit.sourceHash,
      coarseHash: unit.coarseHash,
    },
    {
      nodeType: expected.nodeType,
      start: expected.start,
      end: expected.end,
      bytes: expected.bytes,
      tokenCount: expected.tokenCount,
      sha256: expected.sha256,
      coarseHash: expected.coarseHash,
    },
  )
}

function gitShow(commit, sourcePath) {
  const result = spawnSync('git', ['show', `${commit}:${sourcePath}`], {
    cwd: root,
    encoding: null,
  })
  assert.equal(result.status, 0, result.stderr?.toString())
  return result.stdout
}

function gitBlob(commit, sourcePath) {
  const result = spawnSync('git', ['rev-parse', `${commit}:${sourcePath}`], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function tsDeclarationDescriptor(sourceFile, source, name) {
  const declaration = sourceFile.statements.find(
    statement => statement.name?.text === name,
  )
  assert(declaration, name)
  const value = source.slice(declaration.pos, declaration.end)
  return {
    start: declaration.pos,
    end: declaration.end,
    ...sourceDescriptor(value),
  }
}

function countOccurrences(value, needle) {
  return value.split(needle).length - 1
}

function rowIdentity(row) {
  return [
    row.structural.index,
    row.literalKind,
    row.value,
    row.target.start,
    row.target.end,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
    row.targetAdded,
  ]
}

function rowSetDescriptor(rows) {
  const serialized = JSON.stringify(rows.map(rowIdentity))
  return {
    count: rows.length,
    jsonBytes: Buffer.byteLength(serialized),
    sha256: sha256(serialized),
  }
}

test('Target119 exposes two atomic static owner overrides and no replay', () => {
  assert.equal(fixture.status.includes('static-whole-module-proof'), true)
  assert.equal(fixture.summary.units, 2)
  assert.equal(fixture.summary.productionStrictRows, 2)
  assert.equal(fixture.summary.sourceReplayHelpers, 0)
  assert.deepEqual(
    TARGET119_AUTO_MODE_DENIALS_CONTEXT_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  assert.deepEqual(
    TARGET119_AUTO_MODE_DENIALS_CONTEXT_OWNER_OVERRIDES.map(override => ({
      key: override.key,
      targetIndex: override.targetIndex,
      paths: override.paths,
      declarations: override.declarations,
      evidenceIds: override.evidenceIds,
      behavior: override.behavior,
    })),
    [
      {
        key: '2.1.118-to-2.1.119:17435',
        targetIndex: 17435,
        paths: [fixture.ownerResidues.correctedOwnerPath],
        declarations: ['AutoModeDenialsProvider'],
        evidenceIds: fixture.evidenceIds,
        behavior: fixture.ownerBehavior,
      },
      {
        key: '2.1.118-to-2.1.119:17438',
        targetIndex: 17438,
        paths: [fixture.ownerResidues.correctedOwnerPath],
        declarations: ['AutoModeDenialsContext'],
        evidenceIds: fixture.evidenceIds,
        behavior: fixture.ownerBehavior,
      },
    ],
  )
})

test('provider and context default differ from Target118 by removeDenial alone', () => {
  const baselineBundle = readPinned(fixture.inputs.baselineBundle)
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const ledger = readLedger(fixture.inputs.targetLedger)
  assertBaselineUnit(ledger, fixture.baselineUnits.provider)
  assertBaselineUnit(ledger, fixture.baselineUnits.initializer)
  assertTargetRegion(ledger, fixture.targetUnits.provider)
  assertTargetRegion(ledger, fixture.targetUnits.initializer)

  const baselineProvider = slicePinned(
    baselineBundle,
    fixture.baselineUnits.provider,
  )
  const targetProvider = slicePinned(targetBundle, fixture.targetUnits.provider)
  const baselineInitializer = slicePinned(
    baselineBundle,
    fixture.baselineUnits.initializer,
  )
  const targetInitializer = slicePinned(
    targetBundle,
    fixture.targetUnits.initializer,
  )
  for (const [value, expected] of [
    [baselineProvider, fixture.baselineUnits.provider],
    [targetProvider, fixture.targetUnits.provider],
    [baselineInitializer, fixture.baselineUnits.initializer],
    [targetInitializer, fixture.targetUnits.initializer],
  ]) {
    const actual = canonicalDescriptor(value)
    assert.deepEqual(
      { bytes: actual.bytes, sha256: actual.sha256 },
      {
        bytes: expected.canonicalAstBytes,
        sha256: expected.canonicalAstSha256,
      },
    )
  }

  const normalizedProvider = removeDenialPropertyDescriptor(targetProvider)
  const normalizedInitializer = removeDenialPropertyDescriptor(targetInitializer)
  assert.equal(normalizedProvider.removed, 1)
  assert.equal(normalizedInitializer.removed, 1)
  assert.deepEqual(
    { bytes: normalizedProvider.bytes, sha256: normalizedProvider.sha256 },
    {
      bytes: fixture.delta.providerNormalization.canonicalAstBytes,
      sha256: fixture.delta.providerNormalization.canonicalAstSha256,
    },
  )
  assert.deepEqual(
    { bytes: normalizedInitializer.bytes, sha256: normalizedInitializer.sha256 },
    {
      bytes: fixture.delta.initializerNormalization.canonicalAstBytes,
      sha256: fixture.delta.initializerNormalization.canonicalAstSha256,
    },
  )
  assert.equal(
    normalizedProvider.serialized,
    canonicalDescriptor(baselineProvider).serialized,
  )
  assert.equal(
    normalizedInitializer.serialized,
    canonicalDescriptor(baselineInitializer).serialized,
  )
  assert.equal(removeDenialPropertyDescriptor(baselineProvider).removed, 0)
  assert.equal(removeDenialPropertyDescriptor(baselineInitializer).removed, 0)
  assert.deepEqual(cacheFacts(baselineProvider), fixture.delta.cache)
  assert.deepEqual(cacheFacts(targetProvider), fixture.delta.cache)
})

test('exact removal methods, hook, context bindings, and App provider tree are authenticated', () => {
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const ledger = readLedger(fixture.inputs.targetLedger)
  assert.equal(
    slicePinned(targetBundle, fixture.delta.providerProperty).toString(),
    fixture.delta.providerProperty.text,
  )
  assert.equal(
    slicePinned(targetBundle, fixture.delta.defaultProperty).toString(),
    fixture.delta.defaultProperty.text,
  )
  for (const unit of [
    fixture.moduleBoundary.hook,
    fixture.moduleBoundary.bindings,
    fixture.moduleBoundary.appUnit,
  ]) {
    assertTargetRegion(ledger, unit)
    slicePinned(targetBundle, unit)
  }
  assert.equal(
    slicePinned(targetBundle, fixture.moduleBoundary.hook).toString(),
    'function zQH(){return D3H.useContext(pH4)}',
  )
  assert.match(
    slicePinned(targetBundle, fixture.moduleBoundary.appProviderTree).toString(),
    /createElement\(BH4,null/,
  )
  assert.equal(
    slicePinned(targetBundle, fixture.moduleBoundary.providerCallPrefix).toString(),
    'c3H.default.createElement(BH4,null',
  )
})

test('Target120 and Target121 retain both exact runtime units', () => {
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const targetProvider = canonicalDescriptor(
    slicePinned(targetBundle, fixture.targetUnits.provider),
  )
  const targetInitializer = canonicalDescriptor(
    slicePinned(targetBundle, fixture.targetUnits.initializer),
  )
  for (const lineage of fixture.runtimeLineage) {
    const ledger = readLedger(fixture.inputs[lineage.ledgerInput])
    const bundle = readPinned(fixture.inputs[lineage.bundleInput])
    assertTargetRegion(ledger, lineage.provider)
    assertTargetRegion(ledger, lineage.initializer)
    const provider = canonicalDescriptor(slicePinned(bundle, lineage.provider))
    const initializer = canonicalDescriptor(
      slicePinned(bundle, lineage.initializer),
    )
    assert.deepEqual(
      { bytes: provider.bytes, sha256: provider.sha256 },
      {
        bytes: lineage.provider.canonicalAstBytes,
        sha256: lineage.provider.canonicalAstSha256,
      },
    )
    assert.deepEqual(
      { bytes: initializer.bytes, sha256: initializer.sha256 },
      {
        bytes: lineage.initializer.canonicalAstBytes,
        sha256: lineage.initializer.canonicalAstSha256,
      },
    )
    assert.equal(provider.serialized, targetProvider.serialized)
    assert.equal(initializer.serialized, targetInitializer.serialized)
  }
})

test('source lineage proves the owner and rejects every available replay graph', () => {
  const ts = require(
    path.join(
      root,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  )
  const graph = fixture.sourceGraph
  const sourcePath = path.join(sourceRoot, graph.path.replace(/^src\//, ''))
  const stat = fs.lstatSync(sourcePath)
  assert.equal(stat.isFile(), true)
  assert.equal(stat.isSymbolicLink(), false)
  const source = fs.readFileSync(sourcePath, 'utf8')
  assert.deepEqual(sourceDescriptor(source), {
    chars: graph.target119.chars,
    bytes: graph.target119.bytes,
    sha256: graph.target119.sha256,
  })
  assert.equal(gitBlob(graph.target119.commit, graph.path), graph.target119.blob)
  assert.equal(sha256(gitShow(graph.target119.commit, graph.path)), graph.target119.sha256)
  const sourceFile = ts.createSourceFile(
    graph.path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  for (const marker of graph.target119.requiredMarkers) {
    assert.ok(countOccurrences(source, marker) >= 1, marker)
  }
  for (const marker of graph.target119.missingMarkers) {
    assert.equal(countOccurrences(source, marker), 0, marker)
  }
  assert.equal(gitBlob(graph.target120.commit, graph.path), graph.target120.blob)
  assert.equal(sha256(gitShow(graph.target120.commit, graph.path)), graph.target119.sha256)

  const later = gitShow(graph.target121.commit, graph.path).toString()
  assert.equal(gitBlob(graph.target121.commit, graph.path), graph.target121.blob)
  assert.deepEqual(sourceDescriptor(later), {
    chars: graph.target121.chars,
    bytes: graph.target121.bytes,
    sha256: graph.target121.sha256,
  })
  const laterFile = ts.createSourceFile(
    graph.path,
    later,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(laterFile.parseDiagnostics.length, 0)
  assert.deepEqual(
    tsDeclarationDescriptor(
      laterFile,
      later,
      'AutoModeDenialsProvider',
    ),
    graph.target121.providerDeclaration,
  )
  for (const marker of graph.target121.requiredMarkers) {
    assert.ok(countOccurrences(later, marker) >= 1, marker)
  }
  for (const marker of graph.target121.missingMarkers) {
    assert.equal(countOccurrences(later, marker), 0, marker)
  }
  assert.equal(countOccurrences(later, 'DENIALS ='), 2)

  const currentAppPath = path.join(
    sourceRoot,
    graph.appPath.replace(/^src\//, ''),
  )
  const currentApp = fs.readFileSync(currentAppPath, 'utf8')
  assert.deepEqual(sourceDescriptor(currentApp), {
    chars: graph.target119App.chars,
    bytes: graph.target119App.bytes,
    sha256: graph.target119App.sha256,
  })
  assert.equal(
    gitBlob(graph.target119App.commit, graph.appPath),
    graph.target119App.blob,
  )
  assert.equal(
    countOccurrences(currentApp, 'AutoModeDenialsProvider'),
    graph.target119App.providerOccurrences,
  )
  const laterApp = gitShow(graph.target121App.commit, graph.appPath).toString()
  assert.equal(
    gitBlob(graph.target121App.commit, graph.appPath),
    graph.target121App.blob,
  )
  assert.deepEqual(sourceDescriptor(laterApp), {
    chars: graph.target121App.chars,
    bytes: graph.target121App.bytes,
    sha256: graph.target121App.sha256,
  })
  assert.equal(
    countOccurrences(laterApp, 'AutoModeDenialsProvider'),
    graph.target121App.providerOccurrences,
  )
})

test('both exact removeDenial rows are fail closed and report-state tolerant', () => {
  const reportPath = path.join(root, fixture.inputs.observedReport.path)
  if (!fs.existsSync(reportPath)) return
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  for (const expectedRow of fixture.ownerResidues.rows) {
    const index = expectedRow[0]
    const expected = fixture.ownerResidues.units[String(index)]
    const select = rows => rows.filter(row => row.structural.index === index)
    const allOwnerRows = select(report.sourceRuntimeOwnerResidueRows)
    const addedOwnerRows = select(report.sourceRuntimeAddedOwnerResidueRows)
    const rawRows = select(report.rows)
    let corrected = false
    if (allOwnerRows.length > 0) {
      const actual = rowSetDescriptor(allOwnerRows)
      corrected =
        JSON.stringify(expected.correctedAllOwnerRows) === JSON.stringify(actual)
      assert.ok(
        [expected.allOwnerRows, expected.correctedAllOwnerRows].some(
          state => JSON.stringify(state) === JSON.stringify(actual),
        ),
        `u${index} has an exact provisional or corrected all-owner row state`,
      )
    }
    assert.ok(
      addedOwnerRows.length === 0 ||
        JSON.stringify(addedOwnerRows.map(rowIdentity)) ===
          JSON.stringify([expectedRow]),
      `u${index} is exact pre-correction or corrected state`,
    )
    if (addedOwnerRows.length > 0) {
      assert.deepEqual(rowSetDescriptor(addedOwnerRows), expected.addedOwnerRows)
      assert.deepEqual(
        addedOwnerRows[0].ownerPaths,
        [
          corrected
            ? fixture.ownerResidues.correctedOwnerPath.replace(/^src\//, '')
            : fixture.ownerResidues.generatedOwnerPath,
        ],
      )
      assert.deepEqual(addedOwnerRows[0].ownerSourceMatches, [])
      assert.deepEqual(addedOwnerRows[0].sourceMatches, [])
    }
    assert.deepEqual(rowSetDescriptor(rawRows), expected.rawRows)
  }
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  for (const row of fixture.ownerResidues.rows) {
    assert.equal(targetBundle.subarray(row[3], row[4]).toString(), 'removeDenial')
  }
})
