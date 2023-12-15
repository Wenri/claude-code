import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as ownerProofModule from '../cases/2.1.120-to-2.1.121/recovered/classifier-build-name-filter-owner-overrides.mjs'

const {
  TARGET121_CLASSIFIER_BUILD_NAME_FILTER_EVIDENCE_IDS,
  TARGET121_CLASSIFIER_BUILD_NAME_FILTER_OWNER_OVERRIDES,
} = ownerProofModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-classifier-build-name-filter-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '4732af7d2879e7fbb45ab257cec5cfda0dd3e2169d22647b61e2d367900416b8'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function expectedDescriptor(expected) {
  return { bytes: expected.bytes, sha256: expected.sha256 }
}


function sameDescriptor(actual, expected) {
  return (
    actual?.bytes === expected?.bytes && actual?.sha256 === expected?.sha256
  )
}

function selectArtifactPhase(reportDescriptor, coverageDescriptor) {
  const legacy = fixture.inputs.typedReport
  const post = fixture.inputs.postDaemonOwnerSnapshot
  if (sameDescriptor(reportDescriptor, legacy)) {
    if (coverageDescriptor !== undefined) {
      throw new Error('unknown-or-hybrid-target121-proof-phase')
    }
    return { name: 'legacy', snapshot: { typedReport: legacy } }
  }
  if (
    sameDescriptor(reportDescriptor, post.typedReport) &&
    sameDescriptor(coverageDescriptor, post.sourceCoverage)
  ) {
    return { name: 'postDaemonOwner', snapshot: post }
  }
  throw new Error('unknown-or-hybrid-target121-proof-phase')
}

function readTypedReportPhase() {
  const post = fixture.inputs.postDaemonOwnerSnapshot
  assert.equal(
    selectArtifactPhase(expectedDescriptor(fixture.inputs.typedReport)).name,
    'legacy',
  )
  assert.equal(
    selectArtifactPhase(
      expectedDescriptor(post.typedReport),
      expectedDescriptor(post.sourceCoverage),
    ).name,
    'postDaemonOwner',
  )
  assert.throws(
    () =>
      selectArtifactPhase(
        expectedDescriptor(fixture.inputs.typedReport),
        expectedDescriptor(post.sourceCoverage),
      ),
    /unknown-or-hybrid-target121-proof-phase/,
  )
  assert.throws(
    () => selectArtifactPhase(expectedDescriptor(post.typedReport)),
    /unknown-or-hybrid-target121-proof-phase/,
  )
  assert.throws(
    () =>
      selectArtifactPhase(
        { ...expectedDescriptor(post.typedReport), bytes: post.typedReport.bytes + 1 },
        expectedDescriptor(post.sourceCoverage),
      ),
    /unknown-or-hybrid-target121-proof-phase/,
  )

  const reportBytes = fs.readFileSync(
    path.join(repositoryRoot, fixture.inputs.typedReport.path),
  )
  const reportDescriptor = descriptor(reportBytes)
  if (sameDescriptor(reportDescriptor, fixture.inputs.typedReport)) {
    selectArtifactPhase(reportDescriptor)
    return { name: 'legacy', report: JSON.parse(reportBytes) }
  }

  const coverageBytes = fs.readFileSync(
    path.join(repositoryRoot, post.sourceCoverage.path),
  )
  const phase = selectArtifactPhase(
    reportDescriptor,
    descriptor(coverageBytes),
  )
  const rawCoverage = gunzipSync(coverageBytes)
  assert.deepEqual(descriptor(rawCoverage), {
    bytes: post.sourceCoverage.rawBytes,
    sha256: post.sourceCoverage.rawSha256,
  })
  const coverage = JSON.parse(rawCoverage)
  const projection = post.coverageProjection
  const coverageRows = coverage.rows.filter(row =>
    projection.targetIndices.includes(row.targetIndex),
  )
  assert.equal(coverageRows.length, projection.count)
  assert.deepEqual(descriptor(Buffer.from(JSON.stringify(coverageRows))), {
    bytes: projection.canonicalBytes,
    sha256: projection.canonicalSha256,
  })
  return { name: phase.name, report: JSON.parse(reportBytes) }
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected), label)
  return bytes
}

function exactBufferSlice(bytes, expected, label) {
  const value = bytes.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(value), expectedDescriptor(expected), label)
  if (expected.exact !== undefined) {
    assert.equal(value.toString('utf8'), expected.exact, label)
  }
  return value.toString('utf8')
}

function artifactPath(environmentName, expected) {
  return path.resolve(
    process.env[environmentName] ?? path.join(repositoryRoot, expected.path),
  )
}

function canonicalDigest(rows) {
  return descriptor(Buffer.from(JSON.stringify(rows)))
}

function countOccurrences(source, needle) {
  let count = 0
  let offset = 0
  while (true) {
    const next = source.indexOf(needle, offset)
    if (next < 0) return count
    count += 1
    offset = next + needle.length
  }
}

function walk(node, visit) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (typeof node.type === 'string') visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start'].includes(key)) {
      walk(child, visit)
    }
  }
}

function canonicalize(value, parent = null, key = null) {
  if (Array.isArray(value)) {
    return value.map((child, index) => canonicalize(child, parent, index))
  }
  if (value === null || typeof value !== 'object') return value
  const result = {}
  for (const [childKey, child] of Object.entries(value)) {
    if (['end', 'loc', 'range', 'raw', 'start'].includes(childKey)) continue
    if (value.type === 'Identifier' && childKey === 'name') {
      const preserve =
        (parent?.type === 'MemberExpression' &&
          key === 'property' &&
          !parent.computed) ||
        (parent?.type === 'Property' &&
          key === 'key' &&
          !parent.computed &&
          !parent.shorthand) ||
        (parent?.type === 'MethodDefinition' &&
          key === 'key' &&
          !parent.computed)
      result[childKey] = preserve ? child : '@id'
    } else {
      result[childKey] = canonicalize(child, value, childKey)
    }
  }
  return result
}

function canonicalDescriptor(node) {
  return descriptor(Buffer.from(JSON.stringify(canonicalize(node))))
}

function parseUnit(bundle, expected, label) {
  const source = exactBufferSlice(bundle, expected, label)
  const program = parse(source, { ecmaVersion: 'latest' })
  assert.equal(program.body.length, 1, `${label}: one top-level unit`)
  const node = program.body[0]
  assert.equal(node.type, expected.nodeType)
  assert.equal(
    [...tokenizer(source, { ecmaVersion: 'latest' })].length,
    expected.tokenCount,
  )
  if (expected.bodyStatementCount !== undefined) {
    assert.equal(node.body.body.length, expected.bodyStatementCount)
  }
  if (expected.factoryBodyStatementCount !== undefined) {
    assert.equal(
      node.declarations[0].init.arguments[0].body.body.length,
      expected.factoryBodyStatementCount,
    )
  }
  return { node, source, unitStart: expected.start }
}

function exactNodeSlice(parsed, node, expected, label) {
  assert.equal(node.type, expected.nodeType)
  assert.equal(parsed.unitStart + node.start, expected.start)
  assert.equal(parsed.unitStart + node.end, expected.end)
  const raw = parsed.source.slice(node.start, node.end)
  assert.deepEqual(descriptor(raw), expectedDescriptor(expected), label)
  if (expected.exact !== undefined) assert.equal(raw, expected.exact, label)
  assert.equal(canonicalDescriptor(node).sha256, expected.canonicalSha256)
  return raw
}

function buildMacroMember(unit) {
  const candidates = []
  walk(unit, node => {
    if (
      node.type === 'MemberExpression' &&
      !node.computed &&
      node.property?.name === 'VERSION' &&
      node.object?.type === 'ObjectExpression'
    ) {
      candidates.push(node)
    }
  })
  assert.equal(candidates.length, 1, 'one compiled MACRO.VERSION expansion')
  return candidates[0]
}

function macroFields(member) {
  return Object.fromEntries(
    member.object.properties.map(property => [
      property.key.name ?? property.key.value,
      property.value.value,
    ]),
  )
}

function normalizeBuildFields(member) {
  for (const property of member.object.properties) {
    if (['VERSION', 'BUILD_TIME', 'GIT_SHA'].includes(property.key.name)) {
      property.value.value = '@build'
      property.value.raw = '"@build"'
    }
  }
}

function typescript() {
  return require(
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  )
}

function selectedSourceRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_121_SOURCE_ROOT ??
      process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
      path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.121/src'),
  )
}

function selectedBaselineSourceRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_120_SOURCE_ROOT ??
      path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.120/src'),
  )
}

function selectedBaselineRepositoryRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_120_REPOSITORY_ROOT ??
      path.dirname(selectedBaselineSourceRoot()),
  )
}

function selectedTargetRepositoryRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_121_REPOSITORY_ROOT ??
      path.dirname(selectedSourceRoot()),
  )
}

function sourceFilename(root, sourcePath) {
  assert.ok(sourcePath.startsWith('src/'))
  return path.join(root, sourcePath.slice(4))
}

function tsNodeDescriptor(sourceFile, source, node, expected) {
  const start = node.getStart(sourceFile)
  const end = node.end
  const text = source.slice(start, end)
  assert.deepEqual(
    {
      start,
      end,
      chars: text.length,
      ...descriptor(text),
      line: sourceFile.getLineAndCharacterOfPosition(start).line + 1,
      endLine: sourceFile.getLineAndCharacterOfPosition(end).line + 1,
    },
    expected,
  )
  return text
}

function classifierSourceEvidence(ts, filename, expected) {
  const bytes = readExact(filename, expected, filename)
  const source = bytes.toString('utf8')
  assert.equal(source.length, expected.chars)
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  const classify = sourceFile.statements.find(
    node =>
      ts.isFunctionDeclaration(node) && node.name?.text === 'classifyAndPush',
  )
  const generate = sourceFile.statements.find(
    node =>
      ts.isFunctionDeclaration(node) && node.name?.text === 'generateJobName',
  )
  const isResume = sourceFile.statements.find(
    node =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(
        declaration => declaration.name.getText(sourceFile) === 'IS_RESUME',
      ),
  )
  assert.ok(classify && generate && isResume)
  const classifyText = tsNodeDescriptor(
    sourceFile,
    source,
    classify,
    expected.classifyAndPush,
  )
  const generateText = tsNodeDescriptor(
    sourceFile,
    source,
    generate,
    expected.generateJobName,
  )
  const resumeText = tsNodeDescriptor(
    sourceFile,
    source,
    isResume,
    expected.isResume,
  )

  let macro
  let candidateGuard
  let timelineSlice
  const visit = node => {
    if (
      ts.isPropertyAccessExpression(node) &&
      node.expression.getText(sourceFile) === 'MACRO' &&
      node.name.text === 'VERSION'
    ) {
      macro = node
    }
    if (
      ts.isIfStatement(node) &&
      node.expression.getText(sourceFile) === '!candidate'
    ) {
      candidateGuard = node
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(sourceFile).endsWith('.slice') &&
      node.arguments.some(argument => argument.getText(sourceFile).includes('4_000'))
    ) {
      timelineSlice = node
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.ok(macro)
  tsNodeDescriptor(sourceFile, source, macro, expected.macroVersion)
  if (expected.candidateGuard) {
    assert.ok(candidateGuard && timelineSlice)
    const guardText = tsNodeDescriptor(
      sourceFile,
      source,
      candidateGuard,
      {
        start: expected.candidateGuard.start,
        end: expected.candidateGuard.end,
        chars: expected.candidateGuard.chars,
        bytes: expected.candidateGuard.bytes,
        sha256: expected.candidateGuard.sha256,
        line: expected.candidateGuard.line,
        endLine: expected.candidateGuard.endLine,
      },
    )
    assert.equal(guardText, expected.candidateGuard.exact)
    const sliceText = tsNodeDescriptor(
      sourceFile,
      source,
      timelineSlice,
      {
        start: expected.timelineSlice.start,
        end: expected.timelineSlice.end,
        chars: expected.timelineSlice.chars,
        bytes: expected.timelineSlice.bytes,
        sha256: expected.timelineSlice.sha256,
        line: expected.timelineSlice.line,
        endLine: expected.timelineSlice.line,
      },
    )
    assert.equal(sliceText, expected.timelineSlice.exact)
  }
  return { source, classifyText, generateText, resumeText }
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

test(
  'Target121 classifier cluster fixture and corrected owner overrides are exact',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(
      fixture.status,
      'case-owned-static-owner-proof-source-replay-blocked',
    )
    assert.deepEqual(
      TARGET121_CLASSIFIER_BUILD_NAME_FILTER_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET121_CLASSIFIER_BUILD_NAME_FILTER_OWNER_OVERRIDES,
      [
        {
          key: `${caseName}:14165`,
          targetIndex: 14165,
          paths: [fixture.ownerCorrection.correctedOwner],
          declarations: ['classifyAndPush'],
          evidenceIds: fixture.evidenceIds,
          behavior:
            TARGET121_CLASSIFIER_BUILD_NAME_FILTER_OWNER_OVERRIDES[0]
              .behavior,
        },
        {
          key: `${caseName}:14171`,
          targetIndex: 14171,
          paths: [fixture.ownerCorrection.correctedOwner],
          declarations: ['IS_RESUME', 'generateJobName'],
          evidenceIds: fixture.evidenceIds,
          behavior:
            TARGET121_CLASSIFIER_BUILD_NAME_FILTER_OWNER_OVERRIDES[1]
              .behavior,
        },
      ],
    )
    assert.equal(
      Object.isFrozen(
        TARGET121_CLASSIFIER_BUILD_NAME_FILTER_OWNER_OVERRIDES,
      ),
      true,
    )
    assert.equal(fixture.generatorWiring.replayHelper, null)
  },
)

test(
  'authenticated ledger and every classifier owner residue are pinned',
  { skip: !selected },
  t => {
    const baselinePath = artifactPath(
      'CLAUDE_CODE_2_1_120_INNER_BUNDLE',
      fixture.inputs.baselineBundle,
    )
    const targetPath = artifactPath(
      'CLAUDE_CODE_2_1_121_INNER_BUNDLE',
      fixture.inputs.targetBundle,
    )
    if (!fs.existsSync(baselinePath) || !fs.existsSync(targetPath)) {
      t.skip('authenticated Target120/121 bundles are unavailable')
      return
    }
    const baseline = readExact(
      baselinePath,
      fixture.inputs.baselineBundle,
      'Target120 bundle',
    )
    const target = readExact(
      targetPath,
      fixture.inputs.targetBundle,
      'Target121 bundle',
    )
    const ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
          fixture.inputs.structuralLedger,
          'Target121 structural ledger',
        ),
      ),
    )
    const { name: reportPhase, report } = readTypedReportPhase()
    for (const unit of fixture.units) {
      const expectedResidues =
        reportPhase === 'postDaemonOwner'
          ? unit.ownerResidues.postDaemonOwner
          : unit.ownerResidues
      exactBufferSlice(baseline, unit.baseline, 'baseline classifier unit')
      exactBufferSlice(target, unit.target, `Target121 u${unit.target.targetIndex}`)
      const targetRegion = ledger.regions.find(
        row => row.target.index === unit.target.targetIndex,
      )
      assert.ok(targetRegion)
      assert.equal(targetRegion.classification, unit.target.classification)
      assert.equal(targetRegion.baselineUnitIndex, undefined)
      assert.deepEqual(
        {
          nodeType: targetRegion.target.nodeType,
          start: targetRegion.target.start,
          end: targetRegion.target.end,
          tokenCount: targetRegion.target.tokenCount,
          sourceHash: targetRegion.target.sourceHash,
          coarseHash: targetRegion.target.coarseHash,
          topDefinitionCount: targetRegion.target.topDefinitionCount,
          unknownFreeIdentifierCount: targetRegion.unknownFreeIdentifierCount,
        },
        {
          nodeType: unit.target.nodeType,
          start: unit.target.start,
          end: unit.target.end,
          tokenCount: unit.target.tokenCount,
          sourceHash: unit.target.sha256,
          coarseHash: unit.target.coarseHash,
          topDefinitionCount: unit.target.topDefinitionCount,
          unknownFreeIdentifierCount: unit.target.unknownFreeIdentifierCount,
        },
      )
      const baselineRegion = ledger.unmatchedBaseline.find(
        row => row.index === unit.baseline.baselineUnitIndex,
      )
      assert.ok(baselineRegion)
      assert.equal(baselineRegion.sourceHash, unit.baseline.sha256)
      assert.equal(baselineRegion.coarseHash, unit.baseline.coarseHash)

      const ownerRows = report.sourceRuntimeOwnerResidueRows.filter(
        row => row.structural.index === unit.target.targetIndex,
      )
      const addedRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
        row => row.structural.index === unit.target.targetIndex,
      )
      const strictRows = report.rows.filter(
        row => row.structural.index === unit.target.targetIndex,
      )
      assert.equal(ownerRows.length, expectedResidues.totalRows)
      assert.equal(addedRows.length, expectedResidues.targetAddedRows)
      assert.equal(strictRows.length, expectedResidues.strictRows)
      assert.ok(
        ownerRows.every(
          row =>
            JSON.stringify(row.ownerPaths) ===
            JSON.stringify([
              expectedResidues.reportedOwner ??
                fixture.ownerCorrection.reportedOwner,
            ]),
        ),
      )
      assert.deepEqual(
        canonicalDigest(
          ownerRows.map(row => [
            row.literalKind,
            row.value,
            row.target.start,
            row.target.end,
            row.baselineOccurrenceCount,
            row.targetOccurrenceNumber,
            row.targetAdded,
          ]),
        ),
        expectedResidues.rowIdentities,
      )
      const strictIdentities = strictRows.map(row => [
        row.structural.index,
        row.literalKind,
        row.value,
        row.target.start,
        row.target.end,
        row.targetOccurrenceNumber,
      ])
      assert.deepEqual(strictIdentities, expectedResidues.strictRowsExact)
      assert.deepEqual(
        canonicalDigest(strictIdentities),
        expectedResidues.strictIdentities,
      )
    }
  },
)

test(
  'u14165 is a complete classifier pair with an exact build-macro expansion',
  { skip: !selected },
  t => {
    const baselinePath = artifactPath(
      'CLAUDE_CODE_2_1_120_INNER_BUNDLE',
      fixture.inputs.baselineBundle,
    )
    const targetPath = artifactPath(
      'CLAUDE_CODE_2_1_121_INNER_BUNDLE',
      fixture.inputs.targetBundle,
    )
    if (!fs.existsSync(baselinePath) || !fs.existsSync(targetPath)) {
      t.skip('authenticated Target120/121 bundles are unavailable')
      return
    }
    const unit = fixture.units[0]
    const evidence = fixture.wholeUnitEvidence.u14165
    const baseline = parseUnit(
      readExact(baselinePath, fixture.inputs.baselineBundle, 'Target120 bundle'),
      unit.baseline,
      'Target120 classifyAndPush',
    )
    const target = parseUnit(
      readExact(targetPath, fixture.inputs.targetBundle, 'Target121 bundle'),
      unit.target,
      'Target121 classifyAndPush',
    )
    assert.equal(unit.target.bytes - unit.baseline.bytes, evidence.rawByteDelta)
    assert.equal(
      unit.target.tokenCount - unit.baseline.tokenCount,
      evidence.tokenDelta,
    )
    assert.deepEqual(canonicalDescriptor(baseline.node), evidence.baselineCanonical)
    assert.deepEqual(canonicalDescriptor(target.node), evidence.targetCanonical)

    const changed = new Set(evidence.changedStatements.map(row => row.index))
    const retained = []
    for (let index = 0; index < baseline.node.body.body.length; index += 1) {
      if (changed.has(index)) continue
      const baselineStatement = baseline.node.body.body[index]
      const targetStatement = target.node.body.body[index]
      assert.deepEqual(
        canonicalDescriptor(baselineStatement),
        canonicalDescriptor(targetStatement),
      )
      retained.push([index, canonicalDescriptor(targetStatement).sha256])
    }
    assert.equal(retained.length, evidence.retainedStatements.count)
    assert.deepEqual(canonicalDigest(retained), {
      bytes: evidence.retainedStatements.bytes,
      sha256: evidence.retainedStatements.sha256,
    })
    for (const row of evidence.changedStatements) {
      exactNodeSlice(
        baseline,
        baseline.node.body.body[row.index],
        row.baseline,
        `baseline statement ${row.index}`,
      )
      exactNodeSlice(
        target,
        target.node.body.body[row.index],
        row.target,
        `target statement ${row.index}`,
      )
    }

    const baselineMacro = buildMacroMember(baseline.node)
    const targetMacro = buildMacroMember(target.node)
    const macro = evidence.buildMacroExpansion
    exactNodeSlice(baseline, baselineMacro, macro.baseline, 'baseline build macro')
    exactNodeSlice(target, targetMacro, macro.target, 'target build macro')
    const baselineFields = macroFields(baselineMacro)
    const targetFields = macroFields(targetMacro)
    assert.equal(baselineFields.VERSION, macro.baseline.version)
    assert.equal(baselineFields.BUILD_TIME, macro.baseline.buildTime)
    assert.equal(baselineFields.GIT_SHA, macro.baseline.gitSha)
    assert.equal(targetFields.VERSION, macro.target.version)
    assert.equal(targetFields.BUILD_TIME, macro.target.buildTime)
    assert.equal(targetFields.GIT_SHA, macro.target.gitSha)
    for (const row of unit.ownerResidues.strictRowsExact) {
      assert.ok(row[3] >= macro.target.start && row[4] <= macro.target.end)
    }
    normalizeBuildFields(baselineMacro)
    normalizeBuildFields(targetMacro)
    assert.deepEqual(
      canonicalDescriptor(baselineMacro),
      expectedDescriptor(macro.normalizedCanonical),
    )
    assert.deepEqual(
      canonicalDescriptor(targetMacro),
      expectedDescriptor(macro.normalizedCanonical),
    )

    assert.equal(
      exactBufferSlice(
        readExact(baselinePath, fixture.inputs.baselineBundle),
        evidence.timelineTruncationGap.baseline,
        'baseline timeline truncation',
      ),
      evidence.timelineTruncationGap.baseline.exact,
    )
    assert.equal(
      exactBufferSlice(
        readExact(targetPath, fixture.inputs.targetBundle),
        evidence.timelineTruncationGap.target,
        'target timeline truncation',
      ),
      evidence.timelineTruncationGap.target.exact,
    )
  },
)

test(
  'u14171 adds exactly two dependency initializers and the placeholder regexp',
  { skip: !selected },
  t => {
    const baselinePath = artifactPath(
      'CLAUDE_CODE_2_1_120_INNER_BUNDLE',
      fixture.inputs.baselineBundle,
    )
    const targetPath = artifactPath(
      'CLAUDE_CODE_2_1_121_INNER_BUNDLE',
      fixture.inputs.targetBundle,
    )
    if (!fs.existsSync(baselinePath) || !fs.existsSync(targetPath)) {
      t.skip('authenticated Target120/121 bundles are unavailable')
      return
    }
    const unit = fixture.units[1]
    const evidence = fixture.wholeUnitEvidence.u14171
    const baseline = parseUnit(
      readExact(baselinePath, fixture.inputs.baselineBundle, 'Target120 bundle'),
      unit.baseline,
      'Target120 classifier initializer',
    )
    const target = parseUnit(
      readExact(targetPath, fixture.inputs.targetBundle, 'Target121 bundle'),
      unit.target,
      'Target121 classifier initializer',
    )
    assert.equal(unit.target.bytes - unit.baseline.bytes, evidence.rawByteDelta)
    assert.equal(
      unit.target.tokenCount - unit.baseline.tokenCount,
      evidence.tokenDelta,
    )
    assert.deepEqual(canonicalDescriptor(baseline.node), evidence.baselineCanonical)
    assert.deepEqual(canonicalDescriptor(target.node), evidence.targetCanonical)
    const body = target.node.declarations[0].init.arguments[0].body.body
    for (const expected of evidence.dependencyInitializers) {
      exactNodeSlice(
        target,
        body[expected.bodyIndex],
        expected,
        `dependency initializer ${expected.bodyIndex}`,
      )
    }
    const regexp = evidence.regexpAssignment
    const regexpStatement = body[regexp.bodyIndex]
    exactNodeSlice(target, regexpStatement, regexp, 'regexp assignment')
    assert.equal(regexpStatement.expression.type, 'AssignmentExpression')
    assert.equal(regexpStatement.expression.right.type, 'Literal')
    assert.ok(regexpStatement.expression.right.regex)
    exactBufferSlice(
      readExact(targetPath, fixture.inputs.targetBundle),
      regexp.literal,
      'regexp literal',
    )
    body.splice(22, 1)
    body.splice(18, 2)
    assert.deepEqual(
      canonicalDescriptor(target.node),
      evidence.transform.commonCanonical,
    )
    assert.deepEqual(canonicalDescriptor(target.node), canonicalDescriptor(baseline.node))
  },
)

test(
  'corrected classifier source proves macro ownership and the coupled runtime gap',
  { skip: !selected },
  t => {
    const targetPath = artifactPath(
      'CLAUDE_CODE_2_1_121_INNER_BUNDLE',
      fixture.inputs.targetBundle,
    )
    if (!fs.existsSync(targetPath)) {
      t.skip('authenticated Target121 bundle is unavailable')
      return
    }
    const ts = typescript()
    const sources = []
    for (const [root, expected] of [
      [selectedBaselineSourceRoot(), fixture.sourceState.target120],
      [selectedSourceRoot(), fixture.sourceState.target121],
    ]) {
      sources.push(
        classifierSourceEvidence(
          ts,
          sourceFilename(root, fixture.sourceState.path),
          expected,
        ),
      )
    }
    const targetSource = sources[1].source
    for (const [marker, count] of Object.entries(
      fixture.sourceState.target121.markerCounts,
    )) {
      assert.equal(countOccurrences(targetSource, marker), count, marker)
    }
    assert.equal(
      countOccurrences(sources[1].classifyText, 'MACRO.VERSION'),
      1,
    )
    assert.match(sources[1].classifyText, /nameSource/)
    assert.match(sources[1].classifyText, /bridgeSessionSeq/)
    assert.match(sources[1].classifyText, /\[calling /)
    assert.equal(sources[0].resumeText, sources[1].resumeText)

    const stale = fixture.ownerCorrection.staleCandidate
    const staleBytes = readExact(
      sourceFilename(selectedSourceRoot(), stale.path),
      stale,
      'stale autoDream candidate',
    )
    const staleSource = staleBytes.toString('utf8')
    assert.equal(staleSource.length, stale.chars)
    for (const [marker, count] of Object.entries(stale.markerCounts)) {
      assert.equal(countOccurrences(staleSource, marker), count, marker)
    }

    const target = readExact(
      targetPath,
      fixture.inputs.targetBundle,
      'Target121 bundle',
    )
    const hidden = fixture.hiddenRuntimeDependency
    exactBufferSlice(target, hidden.targetUnit, 'u14162 generateJobName unit')
    assert.equal(
      exactBufferSlice(target, hidden.targetGuard, 'target candidate guard'),
      hidden.targetGuard.exact,
    )
    assert.equal(
      exactBufferSlice(target, hidden.regexpCall, 'target regexp call'),
      hidden.regexpCall.exact,
    )
    assert.match(hidden.boundary, /not owned or removed/)

    const semanticTrees = [
      selectedBaselineRepositoryRoot(),
      selectedTargetRepositoryRoot(),
    ]
    const expectedSources = [
      fixture.sourceState.target120,
      fixture.sourceState.target121,
    ]
    for (let index = 0; index < semanticTrees.length; index += 1) {
      const root = semanticTrees[index]
      const expected = expectedSources[index]
      assert.equal(git(root, ['rev-parse', 'HEAD']), expected.gitCommit)
      assert.equal(
        git(root, ['rev-parse', `HEAD:${fixture.sourceState.path}`]),
        expected.gitBlob,
      )
      for (const marker of fixture.sourceState.gitDonorAudit.markers) {
        assert.equal(
          git(root, [
            'log',
            '--all',
            '--format=%H',
            `-S${marker}`,
            '--',
            ...fixture.sourceState.gitDonorAudit.paths,
          ]),
          '',
        )
      }
    }
  },
)

test(
  'the cohesive static proof removes four residues and is idempotent',
  { skip: !selected },
  async () => {
    assert.deepEqual(fixture.strictEvolution.before, {
      unsupportedUnits: 53,
      unsupportedResidues: 470,
      firstTargetIndices: [14165, 14171],
      productionIndexSha256:
        'cc0d1a43e804f26af625935e690df62683f307b7f95d8970eacafc989fc4c9c7',
      productionTupleSha256:
        'a15cdaacfb0ba9ca0c958a11b18cbddcee3070222d0d4e29e2d398cfb2c3c1c1',
    })
    assert.deepEqual(fixture.strictEvolution.removes.targetIndices, [14165, 14171])
    assert.equal(fixture.strictEvolution.removes.units, 2)
    assert.equal(fixture.strictEvolution.removes.residueCount, 4)
    assert.equal(
      fixture.units.reduce(
        (count, unit) => count + unit.ownerResidues.strictRows,
        0,
      ),
      4,
    )
    assert.deepEqual(fixture.strictEvolution.predictedAfter, {
      unsupportedUnits: 51,
      unsupportedResidues: 466,
    })
    assert.match(
      fixture.sourceReplayBlocker.decision,
      /static whole-unit owner proof only; no replay helper and no source writes/,
    )
    assert.match(
      fixture.sourceReplayBlocker.reason,
      /omits the Target121 placeholder regexp.*retains text\.slice.*authored identifier is also unrecoverable/,
    )
    const first = await import(
      `../cases/2.1.120-to-2.1.121/recovered/classifier-build-name-filter-owner-overrides.mjs?first`
    )
    const second = await import(
      `../cases/2.1.120-to-2.1.121/recovered/classifier-build-name-filter-owner-overrides.mjs?second`
    )
    assert.deepEqual(
      first.TARGET121_CLASSIFIER_BUILD_NAME_FILTER_OWNER_OVERRIDES,
      second.TARGET121_CLASSIFIER_BUILD_NAME_FILTER_OWNER_OVERRIDES,
    )
    assert.ok(
      first.TARGET121_CLASSIFIER_BUILD_NAME_FILTER_OWNER_OVERRIDES.every(
        row => Object.isFrozen(row.paths) && Object.isFrozen(row.declarations),
      ),
    )
  },
)
