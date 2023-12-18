import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET119_TIP_REGISTRY_DAY_WINDOW_EVIDENCE_IDS,
  TARGET119_TIP_REGISTRY_DAY_WINDOW_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/tip-registry-day-window-owner-overrides.mjs'

const root = process.cwd()
const require = createRequire(import.meta.url)
const ts = require(
  path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  ),
)
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const testPath =
  'recovery/test/recovery-2.1.119-tip-registry-day-window-owner-proof.test.mjs'
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-tip-registry-day-window-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '69ab8dca7f7a2d05a39e7734b48134210f356f64dfe418bc288c9f7b82d1a10e'
const configuredSourceRoot =
  process.env.CLAUDE_CODE_2_1_119_SOURCE_ROOT ??
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
const sourceRoot = configuredSourceRoot
  ? path.resolve(configuredSourceRoot)
  : path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src')

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({
  bytes: Buffer.byteLength(value),
  sha256: sha256(value),
})
const canonicalDigest = value => sha256(Buffer.from(JSON.stringify(value)))

function readPinned(input) {
  const value = fs.readFileSync(path.join(root, input.path))
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return value
}

function readLedger(input) {
  return JSON.parse(gunzipSync(readPinned(input)))
}

function findRegion(ledger, targetIndex) {
  return [...ledger.regions, ...(ledger.unresolvedTarget ?? [])].find(
    candidate => candidate.target.index === targetIndex,
  )
}

function assertRegion(ledger, expected, pairing = false) {
  const region = findRegion(ledger, expected.targetIndex)
  assert.ok(region, `u${expected.targetIndex}`)
  assert.deepEqual(
    {
      classification: region.classification,
      nodeType: region.target.nodeType,
      start: region.target.start,
      end: region.target.end,
      bytes: region.target.end - region.target.start,
      tokens: region.target.tokenCount,
      sha256: region.target.sourceHash,
      coarseHash: region.target.coarseHash,
      unknownFreeIdentifierCount: region.unknownFreeIdentifierCount,
      ...(pairing
        ? {
            baselineUnitIndex: region.baselineUnitIndex,
            pairReason: region.pairReason,
          }
        : {}),
    },
    {
      classification: expected.classification,
      nodeType: expected.nodeType,
      start: expected.start,
      end: expected.end,
      bytes: expected.bytes,
      tokens: expected.tokens,
      sha256: expected.sha256,
      coarseHash: expected.coarseHash,
      unknownFreeIdentifierCount: expected.unknownFreeIdentifierCount,
      ...(pairing
        ? {
            baselineUnitIndex: expected.baselineUnitIndex,
            pairReason: expected.pairReason,
          }
        : {}),
    },
  )
  return region
}

function walk(node, predicate, result = [], parent = null, parentKey = null) {
  if (!node || typeof node !== 'object') return result
  if (predicate(node, parent, parentKey)) {
    result.push({ node, parent, parentKey })
  }
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc', 'range', 'raw'].includes(key)) continue
    if (Array.isArray(value)) {
      for (const child of value) walk(child, predicate, result, node, key)
    } else {
      walk(value, predicate, result, node, key)
    }
  }
  return result
}

function canonicalAst(value, parent = null, parentKey = null) {
  if (Array.isArray(value)) {
    return value.map((entry, index) => canonicalAst(entry, value, index))
  }
  if (!value || typeof value !== 'object') return value
  const output = {}
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
          parentKey === 'key')
      output[key] = preserve ? child : '@id'
    } else {
      output[key] = canonicalAst(child, value, key)
    }
  }
  return output
}

function canonicalDescriptor(node) {
  const serialized = JSON.stringify(canonicalAst(node))
  return {
    jsonBytes: Buffer.byteLength(serialized),
    sha256: sha256(serialized),
  }
}

function parseProgram(value) {
  return parse(value.toString(), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  })
}

function objectId(node) {
  if (node.type !== 'ObjectExpression') return undefined
  const property = node.properties.find(
    candidate =>
      candidate.type === 'Property' &&
      candidate.computed === false &&
      ((candidate.key.type === 'Identifier' && candidate.key.name === 'id') ||
        (candidate.key.type === 'Literal' && candidate.key.value === 'id')),
  )
  return property?.value?.type === 'Literal' ? property.value.value : undefined
}

function canonicalResidue(row) {
  return [
    row.structural.index,
    row.literalKind,
    row.value,
    row.target.start,
    row.target.end,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
  ]
}

function tsDescriptor(sourceFile, source, node) {
  const start = node.getStart(sourceFile)
  const end = node.end
  return { start, end, ...descriptor(source.slice(start, end)) }
}

function evaluateNumeric(node) {
  if (ts.isParenthesizedExpression(node)) return evaluateNumeric(node.expression)
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (!ts.isBinaryExpression(node)) {
    assert.fail(`unsupported numeric AST node ${ts.SyntaxKind[node.kind]}`)
  }
  const left = evaluateNumeric(node.left)
  const right = evaluateNumeric(node.right)
  switch (node.operatorToken.kind) {
    case ts.SyntaxKind.AsteriskToken:
      return left * right
    case ts.SyntaxKind.SlashToken:
      return left / right
    case ts.SyntaxKind.PlusToken:
      return left + right
    case ts.SyntaxKind.MinusToken:
      return left - right
    default:
      assert.fail(
        `unsupported numeric operator ${ts.SyntaxKind[node.operatorToken.kind]}`,
      )
  }
}

test('Target119 tip-registry day-window fixture and override are frozen', { skip: !selected }, () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  readPinned(fixture.inputs.override)
  assert.equal(fixture.case, caseName)
  assert.equal(fixture.targetUnit.targetIndex, 20919)
  assert.deepEqual(
    TARGET119_TIP_REGISTRY_DAY_WINDOW_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  assert.deepEqual(
    TARGET119_TIP_REGISTRY_DAY_WINDOW_OWNER_OVERRIDES.map(row => ({
      key: row.key,
      targetIndex: row.targetIndex,
      paths: [...row.paths],
      declarations: [...row.declarations],
      evidenceIds: [...row.evidenceIds],
      behavior: row.behavior,
    })),
    [
      {
        key: `${caseName}:${fixture.targetUnit.targetIndex}`,
        targetIndex: fixture.targetUnit.targetIndex,
        paths: fixture.ownerOverride.paths,
        declarations: fixture.ownerOverride.declarations,
        evidenceIds: fixture.evidenceIds,
        behavior: fixture.ownerBehavior,
      },
    ],
  )
  assert.deepEqual(
    fixture.evidenceCatalog.map(item => item.id),
    fixture.evidenceIds,
  )
  assert.ok(fixture.evidenceCatalog.every(item => item.path === testPath))
  assert.equal(
    canonicalDigest([fixture.targetUnit.targetIndex]),
    fixture.summary.targetIndicesSha256,
  )
  assert.equal(fixture.sourceReplay.authorized, false)
})

test('complete paired units prove inherited literals and exact ordinal shift', { skip: !selected }, () => {
  const baselineLedger = readLedger(fixture.inputs.baselineStructuralLedger)
  const targetLedger = readLedger(fixture.inputs.targetStructuralLedger)
  assertRegion(baselineLedger, fixture.baselineUnit)
  assertRegion(targetLedger, fixture.targetUnit, true)
  assert.equal(fixture.baselineUnit.coarseHash, fixture.targetUnit.coarseHash)

  const baselineBundle = readPinned(fixture.inputs.baselineBundle)
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const baselineUnit = baselineBundle.subarray(
    fixture.baselineUnit.start,
    fixture.baselineUnit.end,
  )
  const targetUnit = targetBundle.subarray(
    fixture.targetUnit.start,
    fixture.targetUnit.end,
  )
  assert.deepEqual(descriptor(baselineUnit), {
    bytes: fixture.baselineUnit.bytes,
    sha256: fixture.baselineUnit.sha256,
  })
  assert.deepEqual(descriptor(targetUnit), {
    bytes: fixture.targetUnit.bytes,
    sha256: fixture.targetUnit.sha256,
  })
  const baselineAst = parseProgram(baselineUnit)
  const targetAst = parseProgram(targetUnit)
  assert.deepEqual(
    canonicalDescriptor(baselineAst),
    {
      jsonBytes: fixture.canonicalPairedUnit.jsonBytes,
      sha256: fixture.canonicalPairedUnit.sha256,
    },
  )
  assert.deepEqual(canonicalDescriptor(targetAst), {
    jsonBytes: fixture.canonicalPairedUnit.jsonBytes,
    sha256: fixture.canonicalPairedUnit.sha256,
  })

  for (const compiled of fixture.compiledTipObjects) {
    const baselineMatches = walk(
      baselineAst,
      node => objectId(node) === compiled.id,
    )
    const targetMatches = walk(targetAst, node => objectId(node) === compiled.id)
    assert.equal(baselineMatches.length, 1, `${compiled.id}: baseline object`)
    assert.equal(targetMatches.length, 1, `${compiled.id}: target object`)
    for (const [label, unit, match, rawSha] of [
      ['baseline', baselineUnit, baselineMatches[0], compiled.baselineSha256],
      ['target', targetUnit, targetMatches[0], compiled.targetSha256],
    ]) {
      const { node } = match
      assert.deepEqual(
        {
          relativeStart: node.start,
          relativeEnd: node.end,
          ...descriptor(unit.subarray(node.start, node.end)),
        },
        {
          relativeStart: compiled.relativeStart,
          relativeEnd: compiled.relativeEnd,
          bytes: compiled.bytes,
          sha256: rawSha,
        },
        `${compiled.id}: ${label} raw object`,
      )
      assert.deepEqual(canonicalDescriptor(node), {
        jsonBytes: compiled.canonicalJsonBytes,
        sha256: compiled.canonicalSha256,
      })
    }
    if (compiled.dayLiteralRelativeStart == null) continue
    for (const match of [baselineMatches[0], targetMatches[0]]) {
      const literals = walk(
        match.node,
        node => node.type === 'Literal' && node.value === 86_400_000,
      )
      assert.deepEqual(
        literals.map(item => [item.node.start, item.node.end]),
        [[compiled.dayLiteralRelativeStart, compiled.dayLiteralRelativeEnd]],
      )
    }
  }

  const occurrenceState = fixture.globalDayLiteralOccurrences
  const occurrences = bundle =>
    [...bundle.toString().matchAll(/86400000/g)].map((match, index) => ({
      ordinal: index + 1,
      start: match.index,
    }))
  const baselineOccurrences = occurrences(baselineBundle)
  const targetOccurrences = occurrences(targetBundle)
  assert.equal(baselineOccurrences.length, occurrenceState.baselineCount)
  assert.equal(targetOccurrences.length, occurrenceState.targetCount)
  assert.deepEqual(
    occurrenceState.baselineUnitOrdinals.map(
      ordinal => baselineOccurrences[ordinal - 1].start,
    ),
    occurrenceState.baselineUnitStarts,
  )
  assert.deepEqual(
    occurrenceState.targetUnitOrdinals.map(
      ordinal => targetOccurrences[ordinal - 1].start,
    ),
    occurrenceState.targetUnitStarts,
  )
  assert.deepEqual(
    occurrenceState.baselineUnitStarts.map(start => start - fixture.baselineUnit.start),
    occurrenceState.unitRelativeStarts,
  )
  assert.deepEqual(
    occurrenceState.targetUnitStarts.map(start => start - fixture.targetUnit.start),
    occurrenceState.unitRelativeStarts,
  )
})

test('exact historical and package source bind both folds and direct dependencies', { skip: !selected }, () => {
  const relativePath = fixture.sourceState.path.replace(/^src\//, '')
  const sourceBytes = fs.readFileSync(path.join(sourceRoot, relativePath))
  const sourceState = descriptor(sourceBytes)
  const historical = fixture.sourceState.historicalFile
  const supplemented = fixture.sourceState.supplementedPackageFile
  const isHistorical =
    sourceState.bytes === historical.bytes && sourceState.sha256 === historical.sha256
  const isSupplemented =
    sourceState.bytes === supplemented.bytes &&
    sourceState.sha256 === supplemented.sha256
  assert.equal(isHistorical || isSupplemented, true, 'exact raw or package file')
  for (const input of fixture.sourceState.historicalCommits) {
    const bytes = execFileSync(
      'git',
      ['show', `${input.commit}:${fixture.sourceState.path}`],
      { cwd: root },
    )
    assert.deepEqual(descriptor(bytes), {
      bytes: historical.bytes,
      sha256: historical.sha256,
    })
    const row = execFileSync(
      'git',
      ['ls-tree', input.commit, fixture.sourceState.path],
      { cwd: root, encoding: 'utf8' },
    ).trim()
    assert.match(row, new RegExp(`^100644 blob ${historical.gitBlob}\\t`))
  }

  const source = sourceBytes.toString()
  const sourceFile = ts.createSourceFile(
    fixture.sourceState.path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  const declarations = []
  const tipObjects = new Map()
  const imports = new Map()
  const visit = node => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(sourceFile) === fixture.sourceState.declaration.name
    ) {
      declarations.push(node)
    }
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(sourceFile) === 'id' &&
      ts.isStringLiteral(node.initializer)
    ) {
      tipObjects.set(node.initializer.text, node.parent)
    }
    if (ts.isImportDeclaration(node)) {
      const bindings = node.importClause?.namedBindings
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          imports.set(element.name.text, node.moduleSpecifier.text)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(declarations.length, 1)
  const declaration = declarations[0]
  const declarationDescriptor = tsDescriptor(sourceFile, source, declaration)
  assert.deepEqual(declarationDescriptor, {
    start: isHistorical
      ? fixture.sourceState.declaration.historicalStart
      : fixture.sourceState.declaration.supplementedPackageStart,
    end:
      (isHistorical
        ? fixture.sourceState.declaration.historicalEnd
        : fixture.sourceState.declaration.supplementedPackageEnd),
    bytes: fixture.sourceState.declaration.bytes,
    sha256: fixture.sourceState.declaration.sha256,
  })

  const divisorRows = []
  for (const expected of fixture.sourceState.tipObjects) {
    const object = tipObjects.get(expected.id)
    assert.ok(object, expected.id)
    const start = isHistorical
      ? expected.historicalStart
      : expected.supplementedPackageStart
    const end = isHistorical
      ? expected.historicalEnd
      : expected.supplementedPackageEnd
    assert.deepEqual(tsDescriptor(sourceFile, source, object), {
      start,
      end,
      bytes: expected.bytes,
      sha256: expected.sha256,
    })
    const expectedDivisor = fixture.sourceState.dayDivisors.find(
      candidate => candidate.tipId === expected.id,
    )
    const divisions = []
    const scan = node => {
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.SlashToken &&
        node.right.getText(sourceFile) === '(1000 * 60 * 60 * 24)'
      ) {
        divisions.push(node)
      }
      ts.forEachChild(node, scan)
    }
    scan(object)
    assert.equal(divisions.length, expectedDivisor ? 1 : 0, expected.id)
    if (expectedDivisor) {
      const divisor = divisions[0].right
      const divisorStart = isHistorical
        ? expectedDivisor.historicalStart
        : expectedDivisor.supplementedPackageStart
      assert.deepEqual(tsDescriptor(sourceFile, source, divisor), {
        start: divisorStart,
        end: divisorStart + expectedDivisor.bytes,
        bytes: expectedDivisor.bytes,
        sha256: expectedDivisor.sha256,
      })
      assert.equal(divisor.getText(sourceFile), expectedDivisor.text)
      assert.equal(evaluateNumeric(divisor), expectedDivisor.evaluatesTo)
      divisorRows.push(expectedDivisor.tipId)
    }
  }
  assert.deepEqual(
    divisorRows,
    fixture.sourceState.dayDivisors.map(row => row.tipId),
  )
  for (const dependency of fixture.sourceState.dependencies) {
    assert.equal(imports.get(dependency.name), dependency.module, dependency.name)
  }
})

test('complete owner and owner-added residue partitions are exact', { skip: !selected }, () => {
  const report = JSON.parse(
    fs.readFileSync(path.join(root, fixture.inputs.targetReport.path)),
  )
  const forUnit = rows =>
    rows
      .filter(row => row.structural.index === fixture.targetUnit.targetIndex)
      .map(canonicalResidue)
  const ownerRows = forUnit(report.sourceRuntimeOwnerResidueRows)
  const addedRows = forUnit(report.sourceRuntimeAddedOwnerResidueRows)
  const strictRows = forUnit(report.rows)
  assert.deepEqual(ownerRows, fixture.ownerResidues)
  assert.deepEqual(addedRows, fixture.addedOwnerResidues)
  assert.deepEqual(strictRows, fixture.typedReportStrictResidues)
  assert.equal(ownerRows.length, fixture.summary.ownerRows)
  assert.equal(addedRows.length, fixture.summary.addedOwnerRows)
  assert.equal(
    canonicalDigest(ownerRows),
    fixture.summary.ownerResidueIdentitiesSha256,
  )
  assert.equal(
    canonicalDigest(addedRows),
    fixture.summary.addedOwnerResidueIdentitiesSha256,
  )
  assert.deepEqual(
    fixture.residuePartitions.arithmeticConstantFold,
    fixture.ownerSupplementStrictResidues,
  )
  assert.deepEqual(
    Object.values(fixture.residuePartitions).flat(),
    fixture.ownerResidues,
  )
})

test('coverage accepts only provisional or complete day-window proof state', { skip: !selected }, () => {
  const coverage = JSON.parse(
    gunzipSync(
      fs.readFileSync(path.join(root, fixture.inputs.targetCoverage.path)),
    ),
  )
  const row = coverage.rows.find(
    candidate => candidate.targetIndex === fixture.targetUnit.targetIndex,
  )
  assert.ok(row)
  const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
  const paths = row.ownerIds.map(id => owners.get(id)).sort()
  const expectedPaths = [...fixture.ownerOverride.paths].sort()
  const provisional =
    JSON.stringify(paths) === JSON.stringify(expectedPaths) &&
    JSON.stringify(row.evidenceIds) ===
      JSON.stringify(['source-map-attribution', 'semantic-test'])
  const corrected =
    JSON.stringify(paths) === JSON.stringify(expectedPaths) &&
    JSON.stringify(row.evidenceIds) === JSON.stringify(fixture.evidenceIds) &&
    row.behavior ===
      TARGET119_TIP_REGISTRY_DAY_WINDOW_OWNER_OVERRIDES[0].behavior
  assert.equal(row.disposition, 'source-runtime-covered')
  assert.equal(provisional || corrected, true)
  if (corrected) {
    const evidence = new Map(coverage.evidence.map(item => [item.id, item]))
    for (const evidenceId of fixture.evidenceIds) {
      assert.equal(evidence.get(evidenceId)?.path, testPath, evidenceId)
    }
  }
})
