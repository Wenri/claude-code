import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import * as helper from '../cases/2.1.118-to-2.1.119/recovered/parse-pr-identifier-strict-property-owner-overrides.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-parse-pr-identifier-strict-property-owner-proof.json',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/parse-pr-identifier-strict-property-owner-overrides.mjs',
)
const artifactRoot = path.join(root, '.recovery-tmp/authenticated-artifacts')
const historicalSourceRoot = path.join(
  root,
  '.recovery-tmp/semantic-trees/2.1.119/src',
)
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? historicalSourceRoot,
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const FIXTURE_SHA256 =
  'dded9121caeddc312cebb256a1abb3cfe50a9f48bd0ffc5994460200937bcd3a'
const HELPER_SHA256 =
  '2d4a8da5c200d64f87738e623c2973f43eca98dc995cd35dec5bf2ceb27589eb'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function partitionDescriptor(rows) {
  const bytes = Buffer.from(JSON.stringify(rows))
  return { rows: rows.length, jsonBytes: bytes.length, sha256: sha256(bytes) }
}

function resolveArtifactPhase(typedAudit, sourceCoverage, sourceCoverageRaw) {
  const matches = fixture.artifactPhasePolicy.acceptedPairs.filter(
    pair =>
      pair.typedAudit.bytes === typedAudit.bytes &&
      pair.typedAudit.sha256 === typedAudit.sha256 &&
      pair.sourceCoverage.bytes === sourceCoverage.bytes &&
      pair.sourceCoverage.sha256 === sourceCoverage.sha256 &&
      (pair.sourceCoverageRaw === undefined
        ? sourceCoverageRaw === undefined
        : sourceCoverageRaw !== undefined &&
          pair.sourceCoverageRaw.bytes === sourceCoverageRaw.bytes &&
          pair.sourceCoverageRaw.sha256 === sourceCoverageRaw.sha256),
  )
  if (matches.length !== 1) {
    throw new Error(
      `unknown or hybrid Target119 artifact phase: ${typedAudit.bytes}:${typedAudit.sha256}/${sourceCoverage.bytes}:${sourceCoverage.sha256}`,
    )
  }
  return matches[0]
}

function gitBlobSha1(value) {
  return crypto
    .createHash('sha1')
    .update(Buffer.from(`blob ${value.length}\0`))
    .update(value)
    .digest('hex')
}

function readExact(filename, expected, label = filename) {
  const value = fs.readFileSync(filename)
  assert.deepEqual(
    descriptor(value),
    { bytes: expected.bytes, sha256: expected.sha256 },
    label,
  )
  return value
}

function artifactPath(environmentName, input) {
  return process.env[environmentName]
    ? path.resolve(process.env[environmentName])
    : path.join(artifactRoot, input.artifact)
}

function sourceFilename(input, directory = sourceRoot) {
  return path.join(directory, input.path.replace(/^src\//, ''))
}

function sliceExact(value, expected, label) {
  const sliced = value.subarray(expected.start, expected.end)
  assert.deepEqual(
    descriptor(sliced),
    { bytes: expected.bytes, sha256: expected.sha256 },
    label,
  )
  return sliced
}

function parseProgram(value) {
  return parse(value.toString(), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  })
}

function bindingMap(value) {
  const program = parseProgram(value)
  assert.equal(program.body.length, 1)
  const statement = program.body[0]
  assert.equal(statement.type, 'ExpressionStatement')
  const call = statement.expression
  assert.equal(call.type, 'CallExpression')
  assert.equal(call.arguments.length, 2)
  const exportsObject = call.arguments[1]
  assert.equal(exportsObject.type, 'ObjectExpression')
  return Object.fromEntries(
    exportsObject.properties.map(property => {
      assert.equal(property.type, 'Property')
      assert.equal(property.computed, false)
      assert.equal(property.value.type, 'ArrowFunctionExpression')
      assert.equal(property.value.params.length, 0)
      assert.equal(property.value.body.type, 'Identifier')
      const name =
        property.key.type === 'Identifier'
          ? property.key.name
          : property.key.value
      return [name, property.value.body.name]
    }),
  )
}

function functionName(value) {
  const program = parseProgram(value)
  assert.equal(program.body.length, 1)
  const declaration = program.body[0]
  assert.equal(declaration.type, 'FunctionDeclaration')
  assert.equal(declaration.id.type, 'Identifier')
  return declaration.id.name
}

function canonicalAst(value, parent = null, parentKey = null) {
  if (Array.isArray(value)) {
    return value.map((entry, index) => canonicalAst(entry, value, index))
  }
  if (!value || typeof value !== 'object') return value
  if (
    value.type === 'BlockStatement' &&
    value.body?.length === 1 &&
    parent?.type === 'IfStatement' &&
    ['consequent', 'alternate'].includes(parentKey)
  ) {
    return canonicalAst(value.body[0], parent, parentKey)
  }
  const result = {}
  for (const [key, child] of Object.entries(value)) {
    if (['start', 'end', 'loc', 'range', 'raw'].includes(key)) continue
    if (key === 'kind' && value.type === 'VariableDeclaration') {
      result[key] = 'var'
      continue
    }
    if (key === 'name' && value.type === 'Identifier') {
      const preserve =
        (parent?.type === 'MemberExpression' &&
          parent.computed === false &&
          parentKey === 'property') ||
        (parent?.type === 'Property' &&
          parent.computed === false &&
          parent.shorthand === false &&
          parentKey === 'key')
      result[key] = preserve ? child : '@id'
    } else {
      result[key] = canonicalAst(child, value, key)
    }
  }
  return result
}

function canonicalFunctionDescriptor(value) {
  const program = parseProgram(value)
  const declaration = program.body.find(
    statement => statement.type === 'FunctionDeclaration',
  )
  assert(declaration)
  const bytes = Buffer.from(JSON.stringify(canonicalAst(declaration)))
  return { jsonBytes: bytes.length, sha256: sha256(bytes) }
}

async function loadTypeScript() {
  const filename = path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

function sourceDeclaration(ts, text, input) {
  const sourceFile = ts.createSourceFile(
    input.path,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.deepEqual(sourceFile.parseDiagnostics, [])
  const declaration = sourceFile.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === fixture.source.declarationName,
  )
  assert(declaration)
  let regex
  function visit(node) {
    if (ts.isRegularExpressionLiteral(node)) regex = node
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  assert(regex)
  return { sourceFile, declaration, regex }
}

function nodeSlice(text, sourceFile, node) {
  return Buffer.from(text.slice(node.getStart(sourceFile), node.end))
}

function transpileDeclaration(ts, text) {
  return ts.transpileModule(text, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
    },
  }).outputText
}

function executableDeclaration(ts, text) {
  const output = ts.transpileModule(text, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  return Function(
    `'use strict';\n${output}\nreturn ${fixture.source.declarationName}`,
  )()
}

function structuralUnit(row) {
  return {
    nodeType: row.nodeType,
    start: row.start,
    end: row.end,
    bytes: row.end - row.start,
    tokenCount: row.tokenCount,
    sha256: row.sourceHash,
    coarseHash: row.coarseHash,
  }
}

test(
  'Target119 parsePrIdentifier fixture, helper exports, and strict partition remain frozen',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(Object.keys(helper), [
      'TARGET119_PARSE_PR_IDENTIFIER_DEPENDENCY_TARGET_INDICES',
      'TARGET119_PARSE_PR_IDENTIFIER_STRICT_PROPERTY_EVIDENCE_IDS',
      'TARGET119_PARSE_PR_IDENTIFIER_STRICT_PROPERTY_OWNER_OVERRIDES',
    ])
    assert.deepEqual(
      helper.TARGET119_PARSE_PR_IDENTIFIER_STRICT_PROPERTY_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      helper.TARGET119_PARSE_PR_IDENTIFIER_DEPENDENCY_TARGET_INDICES,
      fixture.override.dependencyTargetIndices,
    )
    assert.deepEqual(
      helper.TARGET119_PARSE_PR_IDENTIFIER_STRICT_PROPERTY_OWNER_OVERRIDES.map(
        row => ({
          key: row.key,
          targetIndex: row.targetIndex,
          paths: row.paths,
          declarations: row.declarations,
          dependencyTargetIndices: row.dependencyTargetIndices,
          evidenceIds: row.evidenceIds,
        }),
      ),
      [
        {
          key: `${caseName}:21367`,
          targetIndex: fixture.override.targetIndex,
          paths: fixture.override.ownerPaths,
          declarations: fixture.override.declarations,
          dependencyTargetIndices: fixture.override.dependencyTargetIndices,
          evidenceIds: fixture.evidenceIds,
        },
      ],
    )
    assert.equal(
      helper.TARGET119_PARSE_PR_IDENTIFIER_STRICT_PROPERTY_OWNER_OVERRIDES[0].behavior.includes(
        'authorizes no source replay',
      ),
      true,
    )
    assert.equal(Object.isFrozen(helper.TARGET119_PARSE_PR_IDENTIFIER_STRICT_PROPERTY_OWNER_OVERRIDES), true)
    assert.equal(Object.isFrozen(helper.TARGET119_PARSE_PR_IDENTIFIER_STRICT_PROPERTY_OWNER_OVERRIDES[0]), true)

    // These are the one-time frozen report/coverage partitions. This proof never
    // reopens either mutable source artifact.
    assert.deepEqual(
      partitionDescriptor(fixture.snapshotPartitions.typedResidues),
      fixture.snapshotPartitions.typedResiduesDescriptor,
    )
    assert.deepEqual(
      partitionDescriptor(fixture.snapshotPartitions.coverageRows),
      fixture.snapshotPartitions.coverageRowsDescriptor,
    )
    assert.deepEqual(
      partitionDescriptor(fixture.postCorrection.typedResidues),
      fixture.postCorrection.typedResiduesDescriptor,
    )
    assert.deepEqual(
      partitionDescriptor(fixture.postCorrection.coverageRows),
      fixture.postCorrection.coverageRowsDescriptor,
    )
    assert.deepEqual(
      partitionDescriptor(fixture.postCorrection.ownerCatalog),
      fixture.postCorrection.ownerCatalogDescriptor,
    )
    assert.deepEqual(fixture.snapshotPartitions.typedResidues, [
      {
        baselineOccurrenceCount: 0,
        literalKind: 'property',
        targetAdded: true,
        targetOccurrenceNumber: 1,
        value: 'parsePrIdentifier',
        target: { start: 12831125, end: 12831142 },
        structural: {
          index: 21367,
          classification: 'unresolved',
          sourceHash: fixture.target.binding.sha256,
        },
        disposition: 'alpha-equivalent',
        ownerPaths: [],
        ownerSourceMatches: [],
        candidates: [
          '../src/components/TeleportRepoMismatchDialog.tsx',
          '../src/screens/ResumeConversation.tsx',
        ],
        cookedSourceMatches: [],
        rawSourceMatches: [],
        sourceMatches: [],
      },
    ])
    assert.deepEqual(
      fixture.snapshotPartitions.coverageRows.map(row => ({
        targetIndex: row.targetIndex,
        disposition: row.disposition,
        ownerIds: row.ownerIds,
      })),
      [
        { targetIndex: 21367, disposition: 'alpha-equivalent', ownerIds: [] },
        {
          targetIndex: 21368,
          disposition: 'source-runtime-covered',
          ownerIds: ['owner-src-screens-ResumeConversation-tsx'],
        },
      ],
    )

    assert.deepEqual(fixture.artifactPhasePolicy, {
      pairing: 'exact-report-and-coverage-descriptor-pair',
      rejectHybridPairs: true,
      rejectUnknownPairs: true,
      acceptedPairs: [
        {
          phase: 'pre-correction',
          typedAudit: {
            bytes: 24701325,
            sha256:
              'e4fc8b6cc60092ba5bd3b451cefcd1bc1834bc988cb7b4f062e57cb1767cbe0b',
          },
          sourceCoverage: {
            bytes: 377500,
            sha256:
              '69b05794654d35c242fef43ae7f1844ca947c677c1f2de72d9b1d34f9972ab03',
          },
          corrected: false,
        },
        {
          phase: 'post-correction',
          typedAudit: {
            bytes: 24703386,
            sha256:
              '319ad2549d1c140f5f84a1cbe044804876a385f6673f69ff3cb3f973b8971d29',
          },
          sourceCoverage: {
            bytes: 378143,
            sha256:
              '3c29396a4f8bd5604379d07b2e2a3ebdb4083db045c1beeabf26eb11d5f548a0',
          },
          corrected: true,
        },
        {
          phase: 'post-rendezvous',
          typedAudit: {
            bytes: 24697305,
            sha256:
              '1b156d078208c9df0baea3430dc58387f14d3535cd6052724f0847bd83d4d4f7',
          },
          sourceCoverage: {
            bytes: 378822,
            sha256:
              '355c431cda776c760ac1d1e5098dc03f322087bd2deb67a4ab53dd50aa6f2f4d',
          },
          corrected: true,
        },
        {
          phase: 'post-streaming',
          typedAudit: {
            bytes: 24991569,
            sha256:
              'c4ab243f3937141db7984b0d4d9cdde7900805369a74a8b9b7589b13fbd1e78d',
          },
          sourceCoverage: {
            bytes: 380714,
            sha256:
              'ad2d435743921b83fb784ff6baf34e1651fc83dc2e31f7680997a3bfd6241654',
          },
          sourceCoverageRaw: {
            bytes: 3283017,
            sha256:
              '1b47544fc4464cbc437b27133fe03438a2fecb384d4e607118d1a57cb014cc55',
          },
          corrected: true,
        },
      ],
    })
    const [pre, post, postRendezvous, postStreaming] =
      fixture.artifactPhasePolicy.acceptedPairs
    assert.deepEqual(resolveArtifactPhase(pre.typedAudit, pre.sourceCoverage), pre)
    assert.deepEqual(
      resolveArtifactPhase(post.typedAudit, post.sourceCoverage),
      post,
    )
    assert.deepEqual(
      resolveArtifactPhase(
        postRendezvous.typedAudit,
        postRendezvous.sourceCoverage,
      ),
      postRendezvous,
    )
    assert.deepEqual(
      resolveArtifactPhase(
        postStreaming.typedAudit,
        postStreaming.sourceCoverage,
        postStreaming.sourceCoverageRaw,
      ),
      postStreaming,
    )
    assert.throws(
      () =>
        resolveArtifactPhase(
          postStreaming.typedAudit,
          postStreaming.sourceCoverage,
        ),
      /unknown or hybrid Target119 artifact phase/,
    )
    for (const [typedIndex, typedPhase] of
      fixture.artifactPhasePolicy.acceptedPairs.entries()) {
      for (const [coverageIndex, coveragePhase] of
        fixture.artifactPhasePolicy.acceptedPairs.entries()) {
        if (typedIndex === coverageIndex) continue
        assert.throws(
          () =>
            resolveArtifactPhase(
              typedPhase.typedAudit,
              coveragePhase.sourceCoverage,
            ),
          /unknown or hybrid Target119 artifact phase/,
        )
      }
    }
    assert.throws(
      () =>
        resolveArtifactPhase(
          { bytes: 1, sha256: 'unknown-report' },
          postRendezvous.sourceCoverage,
        ),
      /unknown or hybrid Target119 artifact phase/,
    )

    assert.deepEqual(fixture.postStreaming, {
      typedResiduesDescriptor:
        fixture.postCorrection.typedResiduesDescriptor,
      coverageRowsDescriptor: fixture.postCorrection.coverageRowsDescriptor,
      ownerCatalogDescriptor: fixture.postCorrection.ownerCatalogDescriptor,
      typedResiduesUnchangedFromPostCorrection: true,
      coverageRowsUnchangedFromPostCorrection: true,
      ownerCatalogUnchangedFromPostCorrection: true,
    })

    const correctedOwnerRow = fixture.postCorrection.coverageRows[0]
    const dependencyRow = fixture.postCorrection.coverageRows[1]
    assert.deepEqual(correctedOwnerRow, {
      targetIndex: 21367,
      start: fixture.target.binding.start,
      end: fixture.target.binding.end,
      nodeType: fixture.target.binding.nodeType,
      sourceHash: fixture.target.binding.sha256,
      structuralClass: 'unresolved',
      disposition: 'source-runtime-covered',
      ownerIds: ['owner-src-screens-ResumeConversation-tsx'],
      evidenceIds: fixture.evidenceIds,
      behavior:
        helper.TARGET119_PARSE_PR_IDENTIFIER_STRICT_PROPERTY_OWNER_OVERRIDES[0]
          .behavior,
    })
    assert.deepEqual(fixture.postCorrection.ownerCatalog, [
      {
        id: correctedOwnerRow.ownerIds[0],
        path: fixture.override.ownerPaths[0],
      },
    ])
    assert.deepEqual(
      fixture.postCorrection.dependencyTargetIndices,
      helper.TARGET119_PARSE_PR_IDENTIFIER_DEPENDENCY_TARGET_INDICES,
    )
    assert.equal(
      dependencyRow.targetIndex,
      fixture.postCorrection.dependencyTargetIndices[0],
    )
    assert.deepEqual(
      dependencyRow,
      fixture.snapshotPartitions.coverageRows.find(
        row => row.targetIndex === dependencyRow.targetIndex,
      ),
      'u21368 dependency row stays exact across correction phases',
    )
    assert.deepEqual(
      fixture.postCorrection.typedResidues.map(row => ({
        targetIndex: row.structural.index,
        value: row.value,
        disposition: row.disposition,
        ownerPaths: row.ownerPaths,
      })),
      [
        {
          targetIndex: 21367,
          value: 'parsePrIdentifier',
          disposition: 'source-runtime-covered',
          ownerPaths: ['screens/ResumeConversation.tsx'],
        },
      ],
    )
  },
)

test(
  'authenticated bundles prove the new export and its exact adjacent implementation dependency',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_119_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'Target119 inner bundle',
    )
    const baselineBundle = readExact(
      artifactPath(
        'CLAUDE_CODE_2_1_118_BUNDLE',
        fixture.inputs.baselineBundle,
      ),
      fixture.inputs.baselineBundle,
      'Target118 inner bundle',
    )
    const targetBinding = sliceExact(
      targetBundle,
      fixture.target.binding,
      'Target119 u21367',
    )
    const targetImplementation = sliceExact(
      targetBundle,
      fixture.target.implementation,
      'Target119 u21368',
    )
    const baselineBinding = sliceExact(
      baselineBundle,
      fixture.baseline.binding,
      'Target118 u20462',
    )
    const baselineImplementation = sliceExact(
      baselineBundle,
      fixture.baseline.implementation,
      'Target118 u20463',
    )
    assert.equal(targetBinding.toString(), fixture.target.binding.text)
    assert.equal(baselineBinding.toString(), fixture.baseline.binding.text)
    assert.equal(
      fixture.target.binding.end,
      fixture.target.implementation.start,
      'u21368 must be the immediate dependency',
    )
    assert.equal(
      fixture.baseline.binding.end,
      fixture.baseline.implementation.start,
    )

    const targetExports = bindingMap(targetBinding)
    const baselineExports = bindingMap(baselineBinding)
    assert.deepEqual(targetExports, fixture.target.binding.localBindings)
    assert.deepEqual(baselineExports, fixture.baseline.binding.localBindings)
    assert.deepEqual(Object.keys(targetExports), fixture.impact.exports.target)
    assert.deepEqual(Object.keys(baselineExports), fixture.impact.exports.baseline)
    assert.deepEqual(
      Object.keys(targetExports).filter(name => !(name in baselineExports)),
      fixture.impact.exports.added,
    )
    assert.equal(
      targetExports.parsePrIdentifier,
      functionName(targetImplementation),
    )
    assert.equal(
      baselineExports.parsePrIdentifier,
      undefined,
      'Target118 export table must not claim the old helper',
    )
    assert.equal(
      functionName(baselineImplementation),
      fixture.baseline.implementation.binding,
    )
    assert.equal(
      sliceExact(targetBundle, fixture.target.regex, 'Target119 regex').toString(),
      fixture.target.regex.text,
    )
    assert.equal(
      sliceExact(
        baselineBundle,
        fixture.baseline.regex,
        'Target118 regex',
      ).toString(),
      fixture.baseline.regex.text,
    )

    const structural = JSON.parse(
      gunzipSync(
        readExact(
          path.join(root, fixture.inputs.structural.path),
          fixture.inputs.structural,
          'Target119 structural delta',
        ),
      ),
    )
    const regions = new Map(
      structural.regions.map(region => [region.target.index, region]),
    )
    for (const expected of [
      fixture.target.binding,
      fixture.target.implementation,
    ]) {
      const region = regions.get(expected.targetIndex)
      assert(region)
      assert.equal(region.classification, 'unresolved')
      assert.equal(region.baseline ?? null, null)
      assert.deepEqual(structuralUnit(region.target), {
        nodeType: expected.nodeType,
        start: expected.start,
        end: expected.end,
        bytes: expected.bytes,
        tokenCount: expected.tokenCount,
        sha256: expected.sha256,
        coarseHash: expected.coarseHash,
      })
    }
    const unmatchedBaseline = new Map(
      structural.unmatchedBaseline.map(row => [row.index, row]),
    )
    for (const expected of [
      fixture.baseline.binding,
      fixture.baseline.implementation,
    ]) {
      const row = unmatchedBaseline.get(expected.baselineUnitIndex)
      assert(row)
      assert.deepEqual(structuralUnit(row), {
        nodeType: expected.nodeType,
        start: expected.start,
        end: expected.end,
        bytes: expected.bytes,
        tokenCount: expected.tokenCount,
        sha256: expected.sha256,
        coarseHash: expected.coarseHash,
      })
    }
  },
)

test(
  'exact Target119 source owns u21368 and the multi-host semantic expansion',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  async () => {
    const ts = await loadTypeScript()
    const targetInput = fixture.inputs.sourceFiles.target
    const baselineInput = fixture.inputs.sourceFiles.baseline
    const targetBytes = readExact(
      sourceFilename(targetInput),
      targetInput,
      'Target119 ResumeConversation source',
    )
    const baselineDirectory = path.join(
      root,
      '.recovery-tmp/semantic-trees/2.1.118/src',
    )
    const baselineBytes = readExact(
      sourceFilename(baselineInput, baselineDirectory),
      baselineInput,
      'Target118 ResumeConversation source',
    )
    assert.equal(gitBlobSha1(targetBytes), targetInput.gitBlobSha1)
    assert.equal(gitBlobSha1(baselineBytes), baselineInput.gitBlobSha1)
    for (const retained of fixture.inputs.sourceFiles.retained) {
      const directory = path.join(
        root,
        `.recovery-tmp/semantic-trees/${retained.version}/src`,
      )
      const bytes = readExact(
        sourceFilename(retained, directory),
        retained,
        `Target${retained.version} retained ResumeConversation source`,
      )
      assert.equal(gitBlobSha1(bytes), retained.gitBlobSha1)
      assert.equal(bytes.equals(targetBytes), true)
    }

    const targetText = targetBytes.toString('utf8')
    const baselineText = baselineBytes.toString('utf8')
    const targetSource = sourceDeclaration(ts, targetText, targetInput)
    const baselineSource = sourceDeclaration(ts, baselineText, baselineInput)
    const targetDeclaration = nodeSlice(
      targetText,
      targetSource.sourceFile,
      targetSource.declaration,
    )
    const baselineDeclaration = nodeSlice(
      baselineText,
      baselineSource.sourceFile,
      baselineSource.declaration,
    )
    const targetRegex = nodeSlice(
      targetText,
      targetSource.sourceFile,
      targetSource.regex,
    )
    const baselineRegex = nodeSlice(
      baselineText,
      baselineSource.sourceFile,
      baselineSource.regex,
    )
    for (const [label, bytes, node, expected] of [
      [
        'Target119 declaration',
        targetDeclaration,
        targetSource.declaration,
        fixture.source.targetDeclaration,
      ],
      [
        'Target118 declaration',
        baselineDeclaration,
        baselineSource.declaration,
        fixture.source.baselineDeclaration,
      ],
    ]) {
      assert.deepEqual(
        {
          start: node.getStart(
            label.startsWith('Target119')
              ? targetSource.sourceFile
              : baselineSource.sourceFile,
          ),
          end: node.end,
          ...descriptor(bytes),
        },
        {
          start: expected.start,
          end: expected.end,
          bytes: expected.bytes,
          sha256: expected.sha256,
        },
      )
    }
    for (const [label, bytes, node, sourceFile, expected] of [
      [
        'Target119 source regex',
        targetRegex,
        targetSource.regex,
        targetSource.sourceFile,
        fixture.source.targetDeclaration.regex,
      ],
      [
        'Target118 source regex',
        baselineRegex,
        baselineSource.regex,
        baselineSource.sourceFile,
        fixture.source.baselineDeclaration.regex,
      ],
    ]) {
      assert.deepEqual(
        {
          start: node.getStart(sourceFile),
          end: node.end,
          ...descriptor(bytes),
        },
        { start: expected.start, end: expected.end, bytes: expected.bytes, sha256: expected.sha256 },
        label,
      )
    }
    assert.equal(targetRegex.toString(), fixture.target.regex.text)
    assert.equal(baselineRegex.toString(), fixture.baseline.regex.text)

    const targetCompiled = transpileDeclaration(
      ts,
      targetDeclaration.toString(),
    )
    const baselineCompiled = transpileDeclaration(
      ts,
      baselineDeclaration.toString(),
    )
    assert.deepEqual(
      canonicalFunctionDescriptor(targetCompiled),
      fixture.source.targetDeclaration.canonicalProgram,
    )
    assert.deepEqual(
      canonicalFunctionDescriptor(baselineCompiled),
      fixture.source.baselineDeclaration.canonicalProgram,
    )

    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_119_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
    )
    const baselineBundle = readExact(
      artifactPath(
        'CLAUDE_CODE_2_1_118_BUNDLE',
        fixture.inputs.baselineBundle,
      ),
      fixture.inputs.baselineBundle,
    )
    assert.deepEqual(
      canonicalFunctionDescriptor(
        sliceExact(
          targetBundle,
          fixture.target.implementation,
          'Target119 implementation canonical form',
        ),
      ),
      fixture.source.targetDeclaration.canonicalProgram,
    )
    assert.deepEqual(
      canonicalFunctionDescriptor(
        sliceExact(
          baselineBundle,
          fixture.baseline.implementation,
          'Target118 implementation canonical form',
        ),
      ),
      fixture.source.baselineDeclaration.canonicalProgram,
    )

    const targetFunction = executableDeclaration(
      ts,
      targetDeclaration.toString(),
    )
    const baselineFunction = executableDeclaration(
      ts,
      baselineDeclaration.toString(),
    )
    for (const row of fixture.source.semanticCases) {
      assert.equal(targetFunction(row.input), row.target, `target ${row.input}`)
      assert.equal(
        baselineFunction(row.input),
        row.baseline,
        `baseline ${row.input}`,
      )
    }
  },
)

test(
  'the one strict property receives one static owner correction and no replay admission',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    assert.deepEqual(fixture.impact, {
      correctedUnits: 1,
      correctedStrictResidues: 1,
      beforeOwnerPaths: [],
      afterOwnerPaths: ['src/screens/ResumeConversation.tsx'],
      exports: {
        baseline: ['ResumeConversation'],
        target: ['parsePrIdentifier', 'ResumeConversation'],
        added: ['parsePrIdentifier'],
      },
    })
    assert.deepEqual(fixture.override, {
      targetIndex: 21367,
      ownerPaths: ['src/screens/ResumeConversation.tsx'],
      declarations: ['parsePrIdentifier'],
      dependencyTargetIndices: [21368],
      disposition: 'static-owner-proof',
      replayAuthorized: false,
    })
  },
)
