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
import * as ownerProofModule from '../cases/2.1.116-to-2.1.117/recovered/mcp-entrypoint-whole-unit-owner-overrides.mjs'

const {
  TARGET117_MCP_ENTRYPOINT_WHOLE_UNIT_EVIDENCE_IDS,
  TARGET117_MCP_ENTRYPOINT_WHOLE_UNIT_OWNER_OVERRIDES,
} = ownerProofModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const packageSourceRoot = process.env.CLAUDE_CODE_2_1_117_SOURCE_ROOT
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-mcp-entrypoint-whole-unit-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'f8d4af56498782901db968c6eb273a09a149a09d30c11d514442fcd279a47192'

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

function findNodes(node, predicate) {
  const matches = []
  walk(node, candidate => {
    if (predicate(candidate)) matches.push(candidate)
  })
  return matches
}

function propertyName(node) {
  return node.key?.name ?? node.key?.value
}

function canonicalAst(source, { expression = false, eraseBuild = false } = {}) {
  const program = parse(expression ? `(${source})` : source, {
    ecmaVersion: 'latest',
  })
  if (eraseBuild) {
    walk(program, candidate => {
      if (
        candidate.type === 'Property' &&
        !candidate.computed &&
        ['VERSION', 'BUILD_TIME', 'GIT_SHA'].includes(propertyName(candidate))
      ) {
        assert.equal(candidate.value.type, 'Literal')
        assert.equal(typeof candidate.value.value, 'string')
        candidate.value.value = '<BUILD>'
      }
    })
  }

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
  return { normalized, ...descriptor(normalized) }
}

function decodeResidue(raw, row) {
  if (row.literalKind !== 'string') return raw
  return JSON.parse(raw)
}

function tupleDigest(rows) {
  const mapped = rows.map(row => [
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

function tsPropertyName(node, sourceFile) {
  return node.name?.text ?? node.name?.getText(sourceFile)
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
    node =>
      ts.isFunctionDeclaration(node) && node.name?.text === expected.declaration.name,
  )
  assert.equal(declarations.length, 1, `${label}: one startMCPServer`)
  const declaration = declarations[0]
  assert.deepEqual(
    [declaration.getStart(sourceFile), declaration.end],
    [expected.declaration.start, expected.declaration.end],
  )
  exactStringSlice(source, expected.declaration, `${label}: declaration`)

  const macroVersions = tsDescendants(
    ts,
    declaration,
    node =>
      ts.isPropertyAccessExpression(node) &&
      node.getText(sourceFile) === expected.macroVersion.exact,
  )
  assert.equal(macroVersions.length, 1, `${label}: one MACRO.VERSION`)
  assert.deepEqual(
    [macroVersions[0].getStart(sourceFile), macroVersions[0].end],
    [expected.macroVersion.start, expected.macroVersion.end],
  )
  exactStringSlice(source, expected.macroVersion, `${label}: MACRO.VERSION`)

  const contexts = tsDescendants(
    ts,
    declaration,
    node =>
      ts.isVariableDeclaration(node) &&
      node.name.getText(sourceFile) === 'toolUseContext',
  )
  assert.equal(contexts.length, 1, `${label}: one toolUseContext`)
  assert.ok(ts.isObjectLiteralExpression(contexts[0].initializer))
  const context = contexts[0].initializer
  assert.deepEqual(
    [context.getStart(sourceFile), context.end],
    [expected.toolUseContext.start, expected.toolUseContext.end],
  )
  exactStringSlice(source, expected.toolUseContext, `${label}: toolUseContext`)
  assert.deepEqual(
    context.properties.map(property => tsPropertyName(property, sourceFile)),
    expected.toolUseContext.keys,
  )
  for (const property of expected.toolUseContext.requiredRuntimePropertiesAbsent) {
    assert.equal(
      context.properties.some(
        candidate => tsPropertyName(candidate, sourceFile) === property,
      ),
      false,
      `${label}: ${property} intentionally absent from source snapshot`,
    )
  }
}

test(
  'Target117 MCP entrypoint fixture, structural pairing, and static wiring are exact',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.equal(
      fixture.status,
      'case-owned-static-owner-proof-source-replay-blocked',
    )
    readExact(
      path.join(repositoryRoot, fixture.ownerOverride.path),
      fixture.ownerOverride,
      'MCP entrypoint owner override',
    )
    readExact(
      path.join(repositoryRoot, fixture.buildMetadataComponent.path),
      fixture.buildMetadataComponent,
      'Target117 build-metadata component fixture',
    )
    assert.match(
      fixture.buildMetadataComponent.note,
      /complete macro-only units.*mixed unit.*complete paired whole-unit proof/,
    )
    assert.deepEqual(
      TARGET117_MCP_ENTRYPOINT_WHOLE_UNIT_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(TARGET117_MCP_ENTRYPOINT_WHOLE_UNIT_OWNER_OVERRIDES, [
      {
        key: `${caseName}:20680`,
        targetIndex: 20680,
        paths: ['src/entrypoints/mcp.ts'],
        declarations: ['startMCPServer'],
        evidenceIds: fixture.evidenceIds,
        behavior: TARGET117_MCP_ENTRYPOINT_WHOLE_UNIT_OWNER_OVERRIDES[0].behavior,
      },
    ])
    assert.match(
      TARGET117_MCP_ENTRYPOINT_WHOLE_UNIT_OWNER_OVERRIDES[0].behavior,
      /identical after release build metadata.*taskRegistry.*agentLifecycle.*static paired whole-unit proof.*never a source replay/,
    )
    assert.deepEqual(
      Object.keys(ownerProofModule).sort(),
      [
        'TARGET117_MCP_ENTRYPOINT_WHOLE_UNIT_EVIDENCE_IDS',
        'TARGET117_MCP_ENTRYPOINT_WHOLE_UNIT_OWNER_OVERRIDES',
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
    assert.ok(target, 'u20680 unresolved target unit')
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
    assert.ok(baseline, 'u20615 unmatched baseline unit')
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

    const rows = fixture.ownerResidues.rows
    assert.equal(rows.length, fixture.ownerResidues.addedOwnerRows)
    assert.equal(rows.filter(row => row.strict).length, fixture.ownerResidues.strictRows)
    for (const [semanticClass, expectedCount] of [
      ['build-metadata', fixture.ownerResidues.buildMetadataRows],
      ['retained-tool-context', fixture.ownerResidues.retainedToolContextRows],
      [
        'retained-occurrence-shift',
        fixture.ownerResidues.retainedOccurrenceShiftRows,
      ],
    ]) {
      assert.equal(
        rows.filter(row => row.semanticClass === semanticClass).length,
        expectedCount,
      )
    }
    assert.deepEqual(
      tupleDigest(rows),
      fixture.ownerResidues.tupleDigests.addedOwnerRows,
    )
    assert.deepEqual(
      tupleDigest(rows.filter(row => row.strict)),
      fixture.ownerResidues.tupleDigests.strictRows,
    )
  },
)

test(
  'authenticated paired units differ only in build metadata and minifier bindings',
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
      'Target116 MCP entrypoint',
    )
    const target = parseUnit(
      targetBundle,
      fixture.targetUnit,
      'Target117 MCP entrypoint',
    )
    for (const row of fixture.ownerResidues.rows) {
      const raw = exactSlice(
        targetBundle,
        row,
        `u20680 ${row.value} occurrence ${row.targetOccurrenceNumber}`,
      )
      assert.equal(decodeResidue(raw, row), row.value)
    }

    const normalizedBaseline = canonicalAst(baseline.source, {
      eraseBuild: true,
    })
    const normalizedTarget = canonicalAst(target.source, { eraseBuild: true })
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

    for (const [side, bundle, unit] of [
      ['baseline', baselineBundle, baseline],
      ['target', targetBundle, target],
    ]) {
      for (const expected of fixture.pairedWholeUnitProof.metadata[side]) {
        const raw = exactSlice(bundle, expected, `${side} ${expected.name}`)
        const property = findNodes(
          unit.node,
          candidate =>
            candidate.type === 'Property' &&
            !candidate.computed &&
            propertyName(candidate) === expected.name,
        )
        assert.equal(property.length, 1)
        assert.equal(property[0].value.value, expected.value)
        assert.ok(raw.endsWith(JSON.stringify(expected.value)))
      }
    }

    assert.equal(
      exactSlice(
        baselineBundle,
        fixture.pairedWholeUnitProof.params.baseline,
        'Target116 params binding',
      ),
      exactSlice(
        targetBundle,
        fixture.pairedWholeUnitProof.params.target,
        'Target117 params binding',
      ),
    )

    const contextProof = fixture.pairedWholeUnitProof.toolUseContext
    const contextNormalizations = []
    for (const [side, bundle, unit] of [
      ['baseline', baselineBundle, baseline],
      ['target', targetBundle, target],
    ]) {
      const expected = contextProof[side]
      const raw = exactSlice(bundle, expected, `${side} ToolUseContext object`)
      const objects = findNodes(
        unit.node,
        candidate =>
          candidate.type === 'ObjectExpression' &&
          candidate.properties.some(
            property => propertyName(property) === 'taskRegistry',
          ),
      )
      assert.equal(objects.length, 1)
      assert.deepEqual(objects[0].properties.map(propertyName), contextProof.keys)
      contextNormalizations.push(canonicalAst(raw, { expression: true }))
      for (const propertyExpected of contextProof.properties[side]) {
        exactSlice(
          bundle,
          propertyExpected,
          `${side} ${propertyExpected.name} property`,
        )
      }
    }
    assert.equal(
      contextNormalizations[0].normalized,
      contextNormalizations[1].normalized,
    )
    assert.deepEqual(
      {
        bytes: contextNormalizations[0].bytes,
        sha256: contextNormalizations[0].sha256,
      },
      {
        bytes: contextProof.canonicalBytes,
        sha256: contextProof.canonicalSha256,
      },
    )
  },
)

test(
  'raw Target117 source authenticates the owner and its older ToolUseContext snapshot',
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
      'raw Target117 MCP entrypoint',
    )
  },
)

test(
  'packaged Target117 source preserves the same static-only boundary',
  { skip: !selected || !packageSourceRoot },
  () => {
    const filename = sourceFilename(packageSourceRoot, fixture.source.path)
    assertRealFile(filename, 'packaged Target117 MCP entrypoint')
    const expected = {
      ...fixture.source,
      ...fixture.source.packagePostimage,
    }
    assertSource(
      fs.readFileSync(filename),
      expected,
      'packaged Target117 MCP entrypoint',
    )
    assert.equal(
      fixture.sourceReplayBlocker.decision,
      'static paired whole-unit owner proof only; no replay helper and no source writes',
    )
    assert.match(
      fixture.sourceReplayBlocker.reason,
      /complete ToolUseContext contract.*older snapshot lacking taskRegistry.*agentLifecycle.*not be graph-closed/,
    )
    assert.equal(
      fs.existsSync(
        path.join(
          repositoryRoot,
          'recovery/cases/2.1.116-to-2.1.117/recovered/replay-mcp-entrypoint-whole-unit-source-gap.mjs',
        ),
      ),
      false,
    )
  },
)
