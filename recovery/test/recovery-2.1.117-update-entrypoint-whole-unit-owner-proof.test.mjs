import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import * as ownerProofModule from '../cases/2.1.116-to-2.1.117/recovered/update-entrypoint-whole-unit-owner-overrides.mjs'

const {
  TARGET117_UPDATE_ENTRYPOINT_WHOLE_UNIT_EVIDENCE_IDS,
  TARGET117_UPDATE_ENTRYPOINT_WHOLE_UNIT_OWNER_OVERRIDES,
} = ownerProofModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const packageSourceRoot = process.env.CLAUDE_CODE_2_1_117_SOURCE_ROOT
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-update-entrypoint-whole-unit-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '863bc0b51b8ccf8751379d18b3fc94d2ef56276ed18d8811ed9cb7336bec9b07'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function expectedDescriptor(expected) {
  return { bytes: expected.bytes, sha256: expected.sha256 }
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected), label)
  return bytes
}

function artifactPath(environmentName, expected) {
  return path.resolve(
    process.env[environmentName] ?? path.join(repositoryRoot, expected.path),
  )
}

function exactSlice(bytes, expected, label) {
  const value = bytes.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(value), expectedDescriptor(expected), label)
  return value.toString('utf8')
}

function exactStringSlice(source, expected, label) {
  const value = source.slice(expected.start, expected.end)
  assert.deepEqual(
    descriptor(Buffer.from(value)),
    expectedDescriptor(expected),
    label,
  )
  return value
}

function parseUnit(bundle, expected, label) {
  const source = exactSlice(bundle, expected, label)
  const program = parse(source, { ecmaVersion: 'latest' })
  assert.equal(program.body.length, 1, `${label}: one top-level unit`)
  assert.equal(program.body[0].type, expected.nodeType)
  return { source, node: program.body[0] }
}

function walk(node, visit, parent = undefined, key = undefined) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (let index = 0; index < node.length; index += 1) {
      walk(node[index], visit, node, index)
    }
    return
  }
  if (typeof node.type === 'string') visit(node, parent, key)
  for (const [childKey, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start'].includes(childKey)) {
      walk(child, visit, node, childKey)
    }
  }
}

function propertyName(node) {
  return node.key?.name ?? node.key?.value
}

function canonicalUnit(source) {
  const program = parse(source, { ecmaVersion: 'latest' })
  let metadataPropertyCount = 0
  walk(program, candidate => {
    if (
      candidate.type === 'Property' &&
      !candidate.computed &&
      ['VERSION', 'BUILD_TIME', 'GIT_SHA'].includes(propertyName(candidate))
    ) {
      assert.equal(candidate.value.type, 'Literal')
      assert.equal(typeof candidate.value.value, 'string')
      candidate.value.value = '<BUILD>'
      metadataPropertyCount += 1
    }
  })

  function canonicalize(value, parent = undefined, key = undefined) {
    if (Array.isArray(value)) {
      return value.map((child, index) => canonicalize(child, value, index))
    }
    if (value === null || typeof value !== 'object') return value
    const result = {}
    for (const [childKey, child] of Object.entries(value)) {
      if (['end', 'loc', 'range', 'raw', 'start'].includes(childKey)) continue
      if (value.type === 'Identifier' && childKey === 'name') {
        const retain =
          (parent?.type === 'Property' && key === 'key' && !parent.computed) ||
          (parent?.type === 'MemberExpression' &&
            key === 'property' &&
            !parent.computed) ||
          (parent?.type === 'MethodDefinition' &&
            key === 'key' &&
            !parent.computed)
        result[childKey] = retain ? child : '@id'
      } else {
        result[childKey] = canonicalize(child, value, childKey)
      }
    }
    return result
  }

  const normalized = JSON.stringify(canonicalize(program))
  return { metadataPropertyCount, normalized, ...descriptor(normalized) }
}

function expandedMetadataRows() {
  const proof = fixture.pairedWholeUnitProof.targetMetadata
  const rows = []
  for (let index = 0; index < fixture.pairedWholeUnitProof.macroObjectCount; index += 1) {
    for (const name of ['VERSION', 'BUILD_TIME', 'GIT_SHA']) {
      const expected = proof[name]
      rows.push({
        literalKind: 'string',
        value: expected.value,
        baselineOccurrenceCount: expected.baselineOccurrenceCount,
        targetOccurrenceNumber: expected.firstTargetOccurrenceNumber + index,
        start: expected.starts[index],
        end: expected.starts[index] + expected.bytes,
        bytes: expected.bytes,
        sha256: expected.sha256,
        strict: true,
      })
    }
  }
  return rows
}

function tupleDigest(rows) {
  const mapped = [...rows]
    .sort((left, right) => left.start - right.start)
    .map(row => [
      row.literalKind,
      row.value,
      row.start,
      row.end,
      row.baselineOccurrenceCount,
      row.targetOccurrenceNumber,
      true,
    ])
  const encoded = JSON.stringify(mapped)
  return { rows: mapped.length, ...descriptor(encoded) }
}

function gitBytes(commit, sourcePath) {
  return execFileSync('git', ['show', `${commit}:${sourcePath}`], {
    cwd: repositoryRoot,
  })
}

function gitText(args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim()
}

function sourceFilename(root, sourcePath) {
  assert.ok(sourcePath.startsWith('src/'))
  const resolvedRoot = path.resolve(root)
  const filename = path.resolve(resolvedRoot, sourcePath.slice(4))
  assert.ok(filename.startsWith(`${resolvedRoot}${path.sep}`))
  return filename
}

function assertRealFile(filename, label) {
  const stat = fs.lstatSync(filename)
  assert.equal(stat.isSymbolicLink(), false, `${label}: no symlink`)
  assert.equal(stat.isFile(), true, `${label}: regular file`)
}

function typescript() {
  return require(
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  )
}

function tsDescendants(ts, root, predicate) {
  const matches = []
  function visit(node) {
    if (predicate(node)) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(root)
  return matches
}

function assertSource(bytes, expected, label) {
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected), label)
  const source = bytes.toString('utf8')
  assert.equal(source.length, expected.chars, `${label}: UTF-16 length`)
  const ts = typescript()
  const sourceFile = ts.createSourceFile(
    expected.path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${label}: parses`)
  const declarations = sourceFile.statements.filter(
    node => ts.isFunctionDeclaration(node) && node.name?.text === 'update',
  )
  assert.equal(declarations.length, 1, `${label}: one update declaration`)
  const declaration = declarations[0]
  assert.deepEqual(
    [declaration.getStart(sourceFile), declaration.end],
    [expected.declaration.start, expected.declaration.end],
  )
  exactStringSlice(source, expected.declaration, `${label}: update declaration`)

  const macroVersions = tsDescendants(
    ts,
    declaration,
    node =>
      ts.isPropertyAccessExpression(node) &&
      node.getText(sourceFile) === expected.macroVersionAccesses.exact,
  )
  assert.equal(macroVersions.length, expected.macroVersionAccesses.count)
  for (const [position, descriptorForAccess] of [
    [0, expected.macroVersionAccesses.first],
    [macroVersions.length - 1, expected.macroVersionAccesses.last],
  ]) {
    const node = macroVersions[position]
    assert.deepEqual(
      [node.getStart(sourceFile), node.end],
      [descriptorForAccess.start, descriptorForAccess.end],
    )
    assert.equal(
      exactStringSlice(source, descriptorForAccess, `${label}: MACRO.VERSION`),
      expected.macroVersionAccesses.exact,
    )
  }
}

test(
  'Target117 update fixture, structural pairing, and mixed-unit wiring are exact',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    readExact(
      path.join(repositoryRoot, fixture.ownerOverride.path),
      fixture.ownerOverride,
      'update entrypoint owner override',
    )
    readExact(
      path.join(repositoryRoot, fixture.buildMetadataComponent.path),
      fixture.buildMetadataComponent,
      'Target117 build-metadata component fixture',
    )
    assert.match(
      fixture.buildMetadataComponent.note,
      /macro-only units.*mixed update unit.*full baseline-target whole-unit equivalence/,
    )
    assert.deepEqual(
      TARGET117_UPDATE_ENTRYPOINT_WHOLE_UNIT_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(TARGET117_UPDATE_ENTRYPOINT_WHOLE_UNIT_OWNER_OVERRIDES, [
      {
        key: `${caseName}:20768`,
        targetIndex: 20768,
        paths: ['src/cli/update.ts'],
        declarations: ['update'],
        evidenceIds: fixture.evidenceIds,
        behavior:
          TARGET117_UPDATE_ENTRYPOINT_WHOLE_UNIT_OWNER_OVERRIDES[0].behavior,
      },
    ])
    assert.match(
      TARGET117_UPDATE_ENTRYPOINT_WHOLE_UNIT_OWNER_OVERRIDES[0].behavior,
      /identical after all 23 embedded copies.*two remaining.*dot residues.*static paired whole-unit proof.*never a source replay/,
    )
    assert.deepEqual(
      Object.keys(ownerProofModule).sort(),
      [
        'TARGET117_UPDATE_ENTRYPOINT_WHOLE_UNIT_EVIDENCE_IDS',
        'TARGET117_UPDATE_ENTRYPOINT_WHOLE_UNIT_OWNER_OVERRIDES',
      ],
    )
    assert.equal(fixture.generatorWiring.replayHelper, null)

    const ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.structuralLedger.path),
          fixture.structuralLedger,
          'Target117 structural ledger',
        ),
      ),
    )
    const target = ledger.unresolvedTarget.find(
      row => row.target.index === fixture.targetUnit.targetIndex,
    )
    assert.ok(target, 'u20768 unresolved target unit')
    assert.deepEqual(
      {
        classification: target.classification,
        baselineUnitIndex: target.baselineUnitIndex ?? null,
        nodeType: target.target.nodeType,
        start: target.target.start,
        end: target.target.end,
        tokenCount: target.target.tokenCount,
        topDefinitionCount: target.target.topDefinitionCount,
        unknownFreeIdentifierCount: target.unknownFreeIdentifierCount,
        sha256: target.target.sourceHash,
        coarseHash: target.target.coarseHash,
      },
      {
        classification: fixture.targetUnit.classification,
        baselineUnitIndex: fixture.targetUnit.baselineUnitIndex,
        nodeType: fixture.targetUnit.nodeType,
        start: fixture.targetUnit.start,
        end: fixture.targetUnit.end,
        tokenCount: fixture.targetUnit.tokenCount,
        topDefinitionCount: fixture.targetUnit.topDefinitionCount,
        unknownFreeIdentifierCount: fixture.targetUnit.unknownFreeIdentifierCount,
        sha256: fixture.targetUnit.sha256,
        coarseHash: fixture.targetUnit.coarseHash,
      },
    )
    const baseline = ledger.unmatchedBaseline.find(
      unit => unit.index === fixture.baselineUnit.baselineIndex,
    )
    assert.ok(baseline, 'u20703 unmatched baseline unit')
    assert.deepEqual(
      {
        nodeType: baseline.nodeType,
        start: baseline.start,
        end: baseline.end,
        tokenCount: baseline.tokenCount,
        topDefinitionCount: baseline.topDefinitionCount,
        sha256: baseline.sourceHash,
        coarseHash: baseline.coarseHash,
      },
      {
        nodeType: fixture.baselineUnit.nodeType,
        start: fixture.baselineUnit.start,
        end: fixture.baselineUnit.end,
        tokenCount: fixture.baselineUnit.tokenCount,
        topDefinitionCount: fixture.baselineUnit.topDefinitionCount,
        sha256: fixture.baselineUnit.sha256,
        coarseHash: fixture.baselineUnit.coarseHash,
      },
    )

    const metadata = expandedMetadataRows()
    assert.equal(metadata.length, fixture.ownerResidues.buildMetadataRows)
    assert.equal(
      fixture.ownerResidues.addedOwnerRows,
      metadata.length + fixture.ownerResidues.retainedOccurrenceShifts.length,
    )
    assert.deepEqual(
      tupleDigest(metadata),
      fixture.ownerResidues.tupleDigests.strictRows,
    )
    assert.deepEqual(
      tupleDigest([
        ...metadata,
        ...fixture.ownerResidues.retainedOccurrenceShifts,
      ]),
      fixture.ownerResidues.tupleDigests.addedOwnerRows,
    )
  },
)

test(
  'authenticated update units are completely equivalent after build normalization',
  { skip: !selected },
  () => {
    const baselineBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_116_INNER_BUNDLE', fixture.baselineBundle),
      fixture.baselineBundle,
      'Target116 inner bundle',
    )
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_117_INNER_BUNDLE', fixture.targetBundle),
      fixture.targetBundle,
      'Target117 inner bundle',
    )
    const baseline = parseUnit(
      baselineBundle,
      fixture.baselineUnit,
      'Target116 update entrypoint',
    )
    const target = parseUnit(
      targetBundle,
      fixture.targetUnit,
      'Target117 update entrypoint',
    )
    const normalizedBaseline = canonicalUnit(baseline.source)
    const normalizedTarget = canonicalUnit(target.source)
    assert.equal(
      normalizedBaseline.metadataPropertyCount,
      fixture.pairedWholeUnitProof.metadataPropertyCount,
    )
    assert.equal(
      normalizedTarget.metadataPropertyCount,
      fixture.pairedWholeUnitProof.metadataPropertyCount,
    )
    assert.equal(normalizedBaseline.normalized, normalizedTarget.normalized)
    assert.deepEqual(
      {
        bytes: normalizedTarget.bytes,
        sha256: normalizedTarget.sha256,
      },
      {
        bytes: fixture.pairedWholeUnitProof.canonicalBytes,
        sha256: fixture.pairedWholeUnitProof.canonicalSha256,
      },
    )

    const metadataRows = expandedMetadataRows()
    for (const row of metadataRows) {
      assert.equal(
        JSON.parse(exactSlice(targetBundle, row, `u20768 ${row.value}`)),
        row.value,
      )
    }
    for (const expected of fixture.ownerResidues.retainedOccurrenceShifts) {
      assert.equal(
        exactSlice(targetBundle, expected, 'u20768 retained dot'),
        expected.value,
      )
    }

    for (const [side, unit, unitStart, expectedValues] of [
      [
        'baseline',
        baseline,
        fixture.baselineUnit.start,
        fixture.pairedWholeUnitProof.baselineValues,
      ],
      [
        'target',
        target,
        fixture.targetUnit.start,
        Object.fromEntries(
          Object.entries(fixture.pairedWholeUnitProof.targetMetadata).map(
            ([name, expected]) => [name, expected.value],
          ),
        ),
      ],
    ]) {
      const properties = {}
      walk(unit.node, candidate => {
        if (
          candidate.type === 'Property' &&
          !candidate.computed &&
          ['VERSION', 'BUILD_TIME', 'GIT_SHA'].includes(propertyName(candidate))
        ) {
          ;(properties[propertyName(candidate)] ??= []).push(candidate)
        }
      })
      for (const name of ['VERSION', 'BUILD_TIME', 'GIT_SHA']) {
        assert.equal(properties[name].length, fixture.pairedWholeUnitProof.macroObjectCount)
        assert.ok(properties[name].every(property => property.value.value === expectedValues[name]))
        if (side === 'target') {
          assert.deepEqual(
            properties[name].map(property => unitStart + property.value.start),
            fixture.pairedWholeUnitProof.targetMetadata[name].starts,
          )
        }
      }
    }
  },
)

test(
  'raw Target117 source authenticates update ownership and authored macro accesses',
  { skip: !selected },
  () => {
    assert.equal(gitText(['rev-parse', `${fixture.source.commit}^{tree}`]), fixture.source.tree)
    assert.equal(
      gitText(['rev-parse', `${fixture.source.commit}:${fixture.source.path}`]),
      fixture.source.blob,
    )
    assertSource(
      gitBytes(fixture.source.commit, fixture.source.path),
      fixture.source,
      'raw Target117 update source',
    )
  },
)

test(
  'packaged Target117 update source preserves the static-only boundary',
  { skip: !selected || !packageSourceRoot },
  () => {
    const filename = sourceFilename(packageSourceRoot, fixture.source.path)
    assertRealFile(filename, 'packaged Target117 update source')
    assertSource(
      fs.readFileSync(filename),
      { ...fixture.source, ...fixture.source.packagePostimage },
      'packaged Target117 update source',
    )
    assert.equal(
      fixture.sourceReplayBlocker.decision,
      'static paired whole-unit owner proof only; no replay helper and no source writes',
    )
    assert.match(
      fixture.sourceReplayBlocker.reason,
      /semantically identical outside release build metadata.*14 authored MACRO.VERSION.*23 runtime sites.*without admitting.*macro-only/,
    )
    assert.equal(
      fs.existsSync(
        path.join(
          repositoryRoot,
          'recovery/cases/2.1.116-to-2.1.117/recovered/replay-update-entrypoint-whole-unit-source-gap.mjs',
        ),
      ),
      false,
    )
  },
)
