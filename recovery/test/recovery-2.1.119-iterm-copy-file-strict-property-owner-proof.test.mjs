import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import * as helper from '../cases/2.1.118-to-2.1.119/recovered/iterm-copy-file-strict-property-owner-overrides.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-iterm-copy-file-strict-property-owner-proof.json',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/iterm-copy-file-strict-property-owner-overrides.mjs',
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
  '4ad482358b6158689114b607de70229cb75118e48b975687c288b6ba34cbcbc2'
const HELPER_SHA256 =
  'a657a4c3751440ac770e13c8c90fd0155d074269859f9737a8c2acb4b127731a'

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
    phase =>
      phase.typedAudit.bytes === typedAudit.bytes &&
      phase.typedAudit.sha256 === typedAudit.sha256 &&
      phase.sourceCoverage.bytes === sourceCoverage.bytes &&
      phase.sourceCoverage.sha256 === sourceCoverage.sha256 &&
      (phase.sourceCoverageRaw === undefined
        ? sourceCoverageRaw === undefined
        : sourceCoverageRaw !== undefined &&
          phase.sourceCoverageRaw.bytes === sourceCoverageRaw.bytes &&
          phase.sourceCoverageRaw.sha256 === sourceCoverageRaw.sha256),
  )
  if (matches.length !== 1) {
    throw new Error('unknown or hybrid Target119 artifact phase')
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
          parentKey === 'key')
      result[key] = preserve ? child : '@id'
    } else {
      result[key] = canonicalAst(child, value, key)
    }
  }
  return result
}

function canonicalProgramDescriptor(value) {
  const program = parseProgram(value)
  assert.equal(program.body.length, 1)
  const bytes = Buffer.from(JSON.stringify(canonicalAst(program.body[0])))
  return { jsonBytes: bytes.length, sha256: sha256(bytes) }
}

function functionName(value) {
  const statement = parseProgram(value).body[0]
  assert.equal(statement.type, 'FunctionDeclaration')
  assert.equal(statement.id.type, 'Identifier')
  return statement.id.name
}

function declaredNames(value) {
  const statement = parseProgram(value).body[0]
  assert.equal(statement.type, 'VariableDeclaration')
  return statement.declarations.flatMap(declaration =>
    declaration.id.type === 'Identifier' ? [declaration.id.name] : [],
  )
}

function copyFileMembers(value, absoluteStart) {
  const statement = parseProgram(value).body[0]
  return walk(
    statement,
    node =>
      node.type === 'MemberExpression' &&
      node.computed === false &&
      node.property?.type === 'Identifier' &&
      node.property.name === 'copyFile',
  ).map(({ node }) => ({
    object: node.object.name,
    start: absoluteStart + node.property.start,
    end: absoluteStart + node.property.end,
  }))
}

function requiredNamespaceBinding(value, moduleName) {
  const statement = parseProgram(value).body[0]
  const matches = walk(
    statement,
    node =>
      node.type === 'AssignmentExpression' &&
      node.left?.type === 'Identifier' &&
      node.right?.type === 'CallExpression' &&
      node.right.callee?.type === 'Identifier' &&
      node.right.callee.name === 'require' &&
      node.right.arguments.length === 1 &&
      node.right.arguments[0].type === 'Literal' &&
      node.right.arguments[0].value === moduleName,
  )
  assert.equal(matches.length, 1)
  return matches[0].node.left.name
}

function structuralDescriptor(row) {
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

async function loadTypeScript() {
  const filename = path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

function parseSource(ts, text, input) {
  const sourceFile = ts.createSourceFile(
    input.path,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.deepEqual(sourceFile.parseDiagnostics, [])
  return sourceFile
}

function tsNodeDescriptor(text, sourceFile, node) {
  const start = node.getStart(sourceFile)
  const end = node.end
  return { start, end, ...descriptor(text.slice(start, end)) }
}

function tsDeclarations(ts, sourceFile) {
  return new Map(
    sourceFile.statements.flatMap(statement =>
      ts.isFunctionDeclaration(statement) && statement.name
        ? [[statement.name.text, statement]]
        : [],
    ),
  )
}

function sourceDeclarationText(text, sourceFile, declaration) {
  return text.slice(declaration.getStart(sourceFile), declaration.end)
}

function compileSourceFunction(ts, declarationText, dependencies) {
  const output = ts.transpileModule(declarationText, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  return Function(
    'exports',
    'getIterm2RecoveryInfo',
    'markITerm2SetupComplete',
    'stat',
    'copyFile',
    'getITerm2PlistPath',
    'logError',
    `${output}\nreturn ${fixture.source.declarationName}`,
  )(
    {},
    dependencies.recoveryInfo,
    dependencies.markComplete,
    dependencies.stat,
    dependencies.copyFile,
    dependencies.plistPath,
    dependencies.logError,
  )
}

function compileRawFunction(unitText, bindings, dependencies) {
  return Function(
    bindings.recoveryInfo,
    bindings.markComplete,
    bindings.fsPromisesNamespace,
    bindings.plistPath,
    bindings.logError,
    `${unitText}\nreturn ${bindings.function}`,
  )(
    dependencies.recoveryInfo,
    dependencies.markComplete,
    { stat: dependencies.stat, copyFile: dependencies.copyFile },
    dependencies.plistPath,
    dependencies.logError,
  )
}

function semanticHarness(scenario) {
  const events = []
  return {
    events,
    dependencies: {
      recoveryInfo() {
        events.push('recovery-info')
        return {
          inProgress: scenario.inProgress,
          backupPath: scenario.backupPath,
        }
      },
      markComplete() {
        events.push('mark-complete')
      },
      async stat(filename) {
        events.push(`stat:${filename}`)
        if (scenario.statError) throw new Error(scenario.statError)
      },
      plistPath() {
        events.push('plist-path')
        return '/iterm.plist'
      },
      async copyFile(source, destination) {
        events.push(`copy:${source}->${destination}`)
        if (scenario.copyError) throw new Error(scenario.copyError)
      },
      logError(error) {
        events.push(`log:${error.message}`)
      },
    },
  }
}

test(
  'Target119 iTerm copyFile fixture, helper exports, and one-time partitions remain frozen',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(Object.keys(helper), [
      'TARGET119_ITERM_COPY_FILE_DEPENDENCY_TARGET_INDICES',
      'TARGET119_ITERM_COPY_FILE_IMPORT_LOWERING',
      'TARGET119_ITERM_COPY_FILE_MATCHED_STATIC_PROOF_SPEC',
      'TARGET119_ITERM_COPY_FILE_STRICT_PROPERTY_EVIDENCE_IDS',
      'TARGET119_ITERM_COPY_FILE_STRICT_PROPERTY_OWNER_OVERRIDES',
    ])
    assert.deepEqual(
      helper.TARGET119_ITERM_COPY_FILE_STRICT_PROPERTY_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      helper.TARGET119_ITERM_COPY_FILE_DEPENDENCY_TARGET_INDICES,
      fixture.override.dependencyTargetIndices,
    )
    assert.deepEqual(helper.TARGET119_ITERM_COPY_FILE_IMPORT_LOWERING, {
      importedName: 'copyFile',
      module: 'fs/promises',
      namespaceBinding: fixture.target.bindings.fsPromisesNamespace,
      bindingTargetIndex: 21681,
      initializerTargetIndex: 21682,
    })
    assert.deepEqual(helper.TARGET119_ITERM_COPY_FILE_MATCHED_STATIC_PROOF_SPEC, {
      targetIndex: 21680,
      baselineUnitIndex: 20774,
      structuralClassification: 'matched',
      coverageLane: 'matched-static-proof',
      coverageTargetRowPresent: false,
      allOwnerInputTargetRowPresent: false,
      coverageGeneratorWiringAuthorized: false,
      synthesizedCorrectionAccepted: false,
    })
    assert.deepEqual(
      helper.TARGET119_ITERM_COPY_FILE_STRICT_PROPERTY_OWNER_OVERRIDES.map(
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
          key: `${caseName}:21680`,
          targetIndex: fixture.override.targetIndex,
          paths: fixture.override.ownerPaths,
          declarations: fixture.override.declarations,
          dependencyTargetIndices: fixture.override.dependencyTargetIndices,
          evidenceIds: fixture.evidenceIds,
        },
      ],
    )
    const override =
      helper.TARGET119_ITERM_COPY_FILE_STRICT_PROPERTY_OWNER_OVERRIDES[0]
    assert.equal(override.behavior.includes('global occurrence-ordinal spill'), true)
    assert.equal(override.behavior.includes('authorizes no source replay'), true)
    assert.equal(Object.isFrozen(override), true)

    assert.deepEqual(fixture.partitionSnapshot, {
      productionStrictRows: 1,
      ownerResidueRows: 0,
      addedOwnerResidueRows: 0,
      unclassifiedAddedOccurrenceRows: 0,
      coverageTargetRowPresent: false,
      allOwnerInputTargetRowPresent: false,
      coverageRows: 5139,
      allOwnerInputRows: 5139,
      byStructuralClass: { changed: 732, moved: 2035, unresolved: 2372 },
      byStructuralClassJsonBytes: 46,
      byStructuralClassSha256:
        'ecb12776bc70ed421a5ea7b18cdfa4928c9a3cba940950ec99220cced8dba306',
    })

    assert.deepEqual(fixture.artifactPhasePolicy, {
      pairing: 'exact-report-and-coverage-descriptor-pair',
      rejectHybridPairs: true,
      rejectUnknownPairs: true,
      acceptedPairs: [
        {
          phase: 'pre-u21367',
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
        },
      ],
    })
    const [pre, postRendezvous, postStreaming] =
      fixture.artifactPhasePolicy.acceptedPairs
    assert.deepEqual(resolveArtifactPhase(pre.typedAudit, pre.sourceCoverage), pre)
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
    assert.throws(
      () =>
        resolveArtifactPhase(pre.typedAudit, postRendezvous.sourceCoverage),
      /unknown or hybrid Target119 artifact phase/,
    )
    assert.throws(
      () =>
        resolveArtifactPhase(postRendezvous.typedAudit, pre.sourceCoverage),
      /unknown or hybrid Target119 artifact phase/,
    )
    assert.throws(
      () =>
        resolveArtifactPhase(
          { bytes: 1, sha256: 'unknown-report' },
          postRendezvous.sourceCoverage,
        ),
      /unknown or hybrid Target119 artifact phase/,
    )
    assert.deepEqual(fixture.postRendezvous, {
      typedResiduesDescriptor:
        fixture.snapshotPartitions.typedResiduesDescriptor,
      coverageTargetRowsDescriptor:
        fixture.snapshotPartitions.coverageTargetRowsDescriptor,
      typedResiduesUnchangedFromSnapshot: true,
      coverageTargetRowsUnchangedFromSnapshot: true,
      matchedStatic: true,
    })
    assert.deepEqual(fixture.postStreaming, {
      typedResiduesDescriptor:
        fixture.snapshotPartitions.typedResiduesDescriptor,
      coverageTargetRowsDescriptor:
        fixture.snapshotPartitions.coverageTargetRowsDescriptor,
      coverageGraphDescriptor: {
        rows: 3,
        jsonBytes: 2566,
        sha256:
          'dd70b8cc4ad7cda40485e99659435612f09ee975a9b42833982a705215f76045',
      },
      typedResiduesUnchangedFromPostRendezvous: true,
      coverageTargetRowsUnchangedFromPostRendezvous: true,
      matchedStatic: true,
    })

    // These rows are the one-time snapshot. The proof never reopens the live
    // typed report or source-coverage artifact.
    assert.deepEqual(
      partitionDescriptor(fixture.snapshotPartitions.typedResidues),
      fixture.snapshotPartitions.typedResiduesDescriptor,
    )
    assert.deepEqual(
      partitionDescriptor(fixture.snapshotPartitions.coverageGraph),
      fixture.snapshotPartitions.coverageGraphDescriptor,
    )
    assert.deepEqual(
      partitionDescriptor(fixture.snapshotPartitions.coverageTargetRows),
      fixture.snapshotPartitions.coverageTargetRowsDescriptor,
    )
    assert.deepEqual(
      partitionDescriptor(fixture.snapshotPartitions.allOwnerInputTargetRows),
      fixture.snapshotPartitions.allOwnerInputTargetRowsDescriptor,
    )
    assert.deepEqual(fixture.snapshotPartitions.coverageTargetRows, [])
    assert.deepEqual(fixture.snapshotPartitions.allOwnerInputTargetRows, [])
    assert.deepEqual(
      fixture.snapshotPartitions.typedResidues.map(row => ({
        targetIndex: row.structural.index,
        classification: row.structural.classification,
        kind: row.literalKind,
        value: row.value,
        start: row.target.start,
        end: row.target.end,
        baselineCount: row.baselineOccurrenceCount,
        targetOrdinal: row.targetOccurrenceNumber,
        disposition: row.disposition,
        ownerPaths: row.ownerPaths,
        candidates: row.candidates,
      })),
      [
        {
          targetIndex: 21680,
          classification: 'matched',
          kind: 'property',
          value: 'copyFile',
          start: 13464067,
          end: 13464075,
          baselineCount: 26,
          targetOrdinal: 30,
          disposition: null,
          ownerPaths: [],
          candidates: ['../src/utils/iTermBackup.ts'],
        },
      ],
    )
    assert.deepEqual(
      fixture.snapshotPartitions.coverageGraph.map(row => ({
        targetIndex: row.targetIndex,
        owners: row.ownerIds,
      })),
      [
        {
          targetIndex: 21678,
          owners: [
            'owner-src-utils-iTermBackup-ts',
            'owner-src-services-SessionMemory-sessionMemory-ts',
          ],
        },
        { targetIndex: 21682, owners: ['owner-src-utils-iTermBackup-ts'] },
        { targetIndex: 21685, owners: ['owner-src-setup-ts'] },
      ],
    )

    const allOwnerInput = JSON.parse(
      readExact(
        path.join(root, fixture.inputs.allOwnerInput.path),
        fixture.inputs.allOwnerInput,
        'Target119 deterministic all-owner input',
      ),
    )
    assert.equal(allOwnerInput.caseName, caseName)
    assert.equal(allOwnerInput.rows.length, fixture.partitionSnapshot.allOwnerInputRows)
    assert.equal(
      allOwnerInput.rows.some(row => row.targetIndex === fixture.override.targetIndex),
      false,
      'matched u21680 must never enter the all-owner synthesis input',
    )
    assert.equal(
      allOwnerInput.rows.every(row => row.structuralClass !== 'matched'),
      true,
      'all-owner synthesis input is nonmatched-only',
    )
    assert.deepEqual(
      Object.fromEntries(
        [...new Set(allOwnerInput.rows.map(row => row.structuralClass))]
          .sort()
          .map(classification => [
            classification,
            allOwnerInput.rows.filter(
              row => row.structuralClass === classification,
            ).length,
          ]),
      ),
      fixture.partitionSnapshot.byStructuralClass,
    )
  },
)

test(
  'authenticated target and predecessor prove one retained production copyFile unit and its import/caller graph',
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
    const targetUnits = new Map(
      fixture.target.units.map(row => [
        row.role,
        sliceExact(targetBundle, row, `Target119 ${row.role}`),
      ]),
    )
    const baselineUnits = new Map(
      fixture.baseline.units.map(row => [
        row.role,
        sliceExact(baselineBundle, row, `Target118 ${row.role}`),
      ]),
    )
    const targetMain = targetUnits.get('check-and-restore')
    const baselineMain = baselineUnits.get('check-and-restore')
    assert.equal(targetMain.toString(), fixture.target.mainText)
    assert.equal(baselineMain.toString(), fixture.baseline.mainText)
    assert.equal(functionName(targetMain), fixture.target.bindings.function)
    assert.equal(functionName(baselineMain), fixture.baseline.bindings.function)
    assert.deepEqual(
      canonicalProgramDescriptor(targetMain),
      fixture.target.canonicalProgram,
    )
    assert.deepEqual(
      canonicalProgramDescriptor(baselineMain),
      fixture.baseline.canonicalProgram,
    )
    assert.deepEqual(
      fixture.target.canonicalProgram,
      fixture.baseline.canonicalProgram,
    )

    for (const [units, section] of [
      [targetUnits, fixture.target],
      [baselineUnits, fixture.baseline],
    ]) {
      const main = units.get('check-and-restore')
      const mainInput = section.units.find(row => row.role === 'check-and-restore')
      const members = copyFileMembers(main, mainInput.start)
      assert.deepEqual(members, [
        {
          object: section.bindings.fsPromisesNamespace,
          start: section.copyFileProperty.start,
          end: section.copyFileProperty.end,
        },
      ])
      assert.deepEqual(
        descriptor(
          (section === fixture.target ? targetBundle : baselineBundle).subarray(
            section.copyFileProperty.start,
            section.copyFileProperty.end,
          ),
        ),
        {
          bytes: section.copyFileProperty.bytes,
          sha256: section.copyFileProperty.sha256,
        },
      )
      assert.equal(
        declaredNames(units.get('import-bindings')).includes(
          section.bindings.fsPromisesNamespace,
        ),
        true,
      )
      assert.equal(
        requiredNamespaceBinding(
          units.get('module-initializer'),
          fixture.source.fsPromisesImport.module,
        ),
        section.bindings.fsPromisesNamespace,
      )
    }

    assert.equal(
      sliceExact(
        targetBundle,
        fixture.target.callerFragment,
        'Target119 setup caller fragment',
      ).toString(),
      fixture.target.callerFragment.text,
    )
    assert.equal(
      sliceExact(
        baselineBundle,
        fixture.baseline.callerFragment,
        'Target118 setup caller fragment',
      ).toString(),
      fixture.baseline.callerFragment.text,
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
    for (const expected of fixture.target.units) {
      const region = regions.get(expected.targetIndex)
      assert(region, `u${expected.targetIndex}`)
      assert.equal(region.classification, expected.classification)
      assert.deepEqual(structuralDescriptor(region.target), {
        nodeType: expected.nodeType,
        start: expected.start,
        end: expected.end,
        bytes: expected.bytes,
        tokenCount: expected.tokenCount,
        sha256: expected.sha256,
        coarseHash: expected.coarseHash,
      })
      if (expected.baselineUnitIndex !== undefined) {
        assert.equal(region.baselineUnitIndex, expected.baselineUnitIndex)
        assert.equal(region.pairReason, expected.pairReason)
      } else {
        assert.equal(region.baselineUnitIndex, undefined)
      }
    }
    for (const role of [
      'mark-setup-complete',
      'recovery-info',
      'plist-path',
      'check-and-restore',
      'import-bindings',
      'module-initializer',
    ]) {
      assert.equal(
        fixture.target.units.find(row => row.role === role).coarseHash,
        fixture.baseline.units.find(row => row.role === role).coarseHash,
        `${role} predecessor skeleton`,
      )
    }
    assert.equal(fixture.impact.productionRuntime, true)
    assert.equal(fixture.impact.macroOnly, false)
  },
)

test(
  'exact Targets118-121 source pins the named import, complete declaration graph, and setup caller',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  async () => {
    const ts = await loadTypeScript()
    const targetInput = fixture.inputs.sourceFiles.itermTarget
    const baselineInput = fixture.inputs.sourceFiles.itermBaseline
    const targetBytes = readExact(
      sourceFilename(targetInput),
      targetInput,
      'Target119 iTermBackup source',
    )
    const baselineRoot = path.join(
      root,
      '.recovery-tmp/semantic-trees/2.1.118/src',
    )
    const baselineBytes = readExact(
      sourceFilename(baselineInput, baselineRoot),
      baselineInput,
      'Target118 iTermBackup source',
    )
    assert.equal(targetBytes.equals(baselineBytes), true)
    assert.equal(gitBlobSha1(targetBytes), targetInput.gitBlobSha1)
    assert.equal(gitBlobSha1(baselineBytes), baselineInput.gitBlobSha1)
    for (const retained of fixture.inputs.sourceFiles.itermRetained) {
      const directory = path.join(
        root,
        `.recovery-tmp/semantic-trees/${retained.version}/src`,
      )
      const bytes = readExact(
        sourceFilename(retained, directory),
        retained,
        `Target${retained.version} retained iTermBackup source`,
      )
      assert.equal(bytes.equals(targetBytes), true)
      assert.equal(gitBlobSha1(bytes), retained.gitBlobSha1)
    }

    const targetText = targetBytes.toString('utf8')
    const sourceFile = parseSource(ts, targetText, targetInput)
    const declarations = tsDeclarations(ts, sourceFile)
    const importDeclaration = sourceFile.statements.find(
      statement =>
        ts.isImportDeclaration(statement) &&
        statement.moduleSpecifier.text === fixture.source.fsPromisesImport.module,
    )
    assert(importDeclaration)
    assert.deepEqual(
      tsNodeDescriptor(targetText, sourceFile, importDeclaration),
      {
        start: fixture.source.fsPromisesImport.start,
        end: fixture.source.fsPromisesImport.end,
        bytes: fixture.source.fsPromisesImport.bytes,
        sha256: fixture.source.fsPromisesImport.sha256,
      },
    )
    assert.deepEqual(
      importDeclaration.importClause.namedBindings.elements.map(
        element => element.name.text,
      ),
      fixture.source.fsPromisesImport.names,
    )
    for (const expected of fixture.source.declarations) {
      const declaration = declarations.get(expected.name)
      assert(declaration)
      assert.deepEqual(tsNodeDescriptor(targetText, sourceFile, declaration), {
        start: expected.start,
        end: expected.end,
        bytes: expected.bytes,
        sha256: expected.sha256,
      })
    }
    const copyFileIdentifiers = []
    function visitCopyFile(node) {
      if (ts.isIdentifier(node) && node.text === 'copyFile') {
        copyFileIdentifiers.push({
          role: ts.isImportSpecifier(node.parent)
            ? 'import-specifier'
            : 'restore-call',
          ...tsNodeDescriptor(targetText, sourceFile, node),
        })
      }
      ts.forEachChild(node, visitCopyFile)
    }
    visitCopyFile(sourceFile)
    assert.deepEqual(copyFileIdentifiers, fixture.source.copyFileIdentifiers)

    const setupTargetInput = fixture.inputs.sourceFiles.setupTarget
    const setupTargetRecoveredInput =
      fixture.inputs.sourceFiles.setupTargetRecovered
    const setupBaselineInput = fixture.inputs.sourceFiles.setupBaseline
    const setupTargetFilename = sourceFilename(setupTargetInput)
    const selectedSetupState = descriptor(
      fs.readFileSync(setupTargetFilename),
    )
    const selectedSetupInput = [
      setupTargetInput,
      setupTargetRecoveredInput,
    ].find(
      input =>
        input.bytes === selectedSetupState.bytes &&
        input.sha256 === selectedSetupState.sha256,
    )
    assert(selectedSetupInput, 'Target119 setup source state')
    const setupTargetBytes = readExact(
      setupTargetFilename,
      selectedSetupInput,
      'Target119 setup source',
    )
    const setupBaselineBytes = readExact(
      sourceFilename(setupBaselineInput, baselineRoot),
      setupBaselineInput,
      'Target118 setup source',
    )
    if (selectedSetupInput === setupTargetInput) {
      assert.equal(setupTargetBytes.equals(setupBaselineBytes), true)
      assert.equal(gitBlobSha1(setupTargetBytes), setupTargetInput.gitBlobSha1)
    } else {
      assert.equal(selectedSetupInput, setupTargetRecoveredInput)
      assert.equal(setupTargetBytes.equals(setupBaselineBytes), false)
    }
    const setupText = setupTargetBytes.toString('utf8')
    const setupFile = parseSource(ts, setupText, selectedSetupInput)
    const setupImport = setupFile.statements.find(
      statement =>
        ts.isImportDeclaration(statement) &&
        statement.moduleSpecifier.text === './utils/iTermBackup.js',
    )
    assert(setupImport)
    assert.deepEqual(
      tsNodeDescriptor(setupText, setupFile, setupImport),
      fixture.source.setupImport,
    )
    const callerMatches = []
    function visitCaller(node) {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === fixture.source.declarationName
      ) {
        let statement = node
        while (statement.parent && !ts.isVariableStatement(statement)) {
          statement = statement.parent
        }
        callerMatches.push({ node, statement })
      }
      ts.forEachChild(node, visitCaller)
    }
    visitCaller(setupFile)
    assert.equal(callerMatches.length, 1)
    assert.deepEqual(
      tsNodeDescriptor(
        setupText,
        setupFile,
        callerMatches[0].statement,
      ),
      selectedSetupInput === setupTargetInput
        ? fixture.source.setupCallerStatement
        : fixture.source.setupCallerStatementPostRendezvous,
    )
    assert.deepEqual(
      tsNodeDescriptor(setupText, setupFile, callerMatches[0].node),
      selectedSetupInput === setupTargetInput
        ? fixture.source.setupCallerCall
        : fixture.source.setupCallerCallPostRendezvous,
    )
  },
)

test(
  'target, predecessor, and authored declaration have identical restore behavior on every branch',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  async () => {
    const ts = await loadTypeScript()
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
    const targetMainInput = fixture.target.units.find(
      row => row.role === 'check-and-restore',
    )
    const baselineMainInput = fixture.baseline.units.find(
      row => row.role === 'check-and-restore',
    )
    const targetMain = sliceExact(targetBundle, targetMainInput, 'Target119 main')
    const baselineMain = sliceExact(
      baselineBundle,
      baselineMainInput,
      'Target118 main',
    )
    const sourceInput = fixture.inputs.sourceFiles.itermTarget
    const sourceText = readExact(
      sourceFilename(sourceInput),
      sourceInput,
    ).toString('utf8')
    const sourceFile = parseSource(ts, sourceText, sourceInput)
    const declaration = tsDeclarations(ts, sourceFile).get(
      fixture.source.declarationName,
    )
    assert(declaration)
    const declarationText = sourceDeclarationText(
      sourceText,
      sourceFile,
      declaration,
    )

    for (const scenario of fixture.source.semanticScenarios) {
      const implementations = [
        {
          name: 'Target119',
          build(dependencies) {
            return compileRawFunction(
              targetMain.toString(),
              fixture.target.bindings,
              dependencies,
            )
          },
        },
        {
          name: 'Target118',
          build(dependencies) {
            return compileRawFunction(
              baselineMain.toString(),
              fixture.baseline.bindings,
              dependencies,
            )
          },
        },
        {
          name: 'authored source',
          build(dependencies) {
            return compileSourceFunction(ts, declarationText, dependencies)
          },
        },
      ]
      for (const implementation of implementations) {
        const harness = semanticHarness(scenario)
        const subject = implementation.build(harness.dependencies)
        assert.deepEqual(
          await subject(),
          scenario.expectedResult,
          `${implementation.name} ${scenario.name} result`,
        )
        assert.deepEqual(
          harness.events,
          scenario.expectedEvents,
          `${implementation.name} ${scenario.name} events`,
        )
      }
    }
  },
)

test(
  'u21680 remains a matched-static proof with no synthesized correction or replay',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    assert.deepEqual(fixture.override, {
      targetIndex: 21680,
      ownerPaths: ['src/utils/iTermBackup.ts'],
      declarations: ['checkAndRestoreITerm2Backup'],
      dependencyTargetIndices: [21677, 21678, 21679, 21681, 21682, 21685],
      disposition: 'matched-static-proof',
      replayAuthorized: false,
      coverageGeneratorWiringAuthorized: false,
      synthesizedCorrectionAccepted: false,
    })
    assert.deepEqual(fixture.impact, {
      provenUnits: 1,
      provenStrictResidues: 1,
      synthesizedCoverageCorrections: 0,
      synthesizedOwnerRows: 0,
      beforeOwnerPaths: [],
      staticProofOwnerPaths: ['src/utils/iTermBackup.ts'],
      property: 'copyFile',
      baselineOccurrenceCount: 26,
      targetOccurrenceNumber: 30,
      globalOrdinalDelta: 4,
      productionRuntime: true,
      macroOnly: false,
    })
  },
)
