import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET121_POWERSHELL_UNC_EVIDENCE_IDS,
  TARGET121_POWERSHELL_UNC_INPUT_FILES,
  TARGET121_POWERSHELL_UNC_OUTPUT_FILES,
  TARGET121_POWERSHELL_UNC_OWNER_OVERRIDES,
  applyTarget121PowerShellUncSourceRecovery,
  buildTarget121PowerShellUncOutput,
} from '../cases/2.1.120-to-2.1.121/recovered/replay-powershell-resolved-unc-normalization-source-gap.mjs'

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-powershell-resolved-unc-normalization-source-gap.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'c929a3eb0484bf35736ae4fb4b6545ae36431530bc5e20e1f4f278035b92185c'

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
  assert.equal(program.body.length, 1)
  const node = program.body[0]
  assert.equal(node.type, expected.nodeType)
  assert.equal(
    [...tokenizer(source, { ecmaVersion: 'latest' })].length,
    expected.tokenCount,
  )
  assert.equal(node.body.body.length, expected.bodyStatementCount)
  return { node, source, unitStart: expected.start }
}

function exactNodeSlice(parsed, node, expected, label) {
  assert.equal(parsed.unitStart + node.start, expected.start)
  assert.equal(parsed.unitStart + node.end, expected.end)
  const source = parsed.source.slice(node.start, node.end)
  assert.deepEqual(descriptor(source), expectedDescriptor(expected), label)
  assert.equal(canonicalDescriptor(node).sha256, expected.canonicalSha256)
  return source
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

function tsNodeDescriptor(sourceFile, source, node, expected, label) {
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
    {
      start: expected.start,
      end: expected.end,
      chars: expected.chars,
      bytes: expected.bytes,
      sha256: expected.sha256,
      line: expected.line,
      endLine: expected.endLine,
    },
    label,
  )
  if (expected.exact !== undefined) assert.equal(text, expected.exact, label)
  return text
}

function parsePowerShellSource(source, expectedFile, recovered) {
  const ts = typescript()
  assert.equal(source.length, expectedFile.chars)
  assert.deepEqual(descriptor(source), expectedDescriptor(expectedFile))
  const sourceFile = ts.createSourceFile(
    fixture.inputs.sourceFile.path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  const main = sourceFile.statements.find(
    node =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === 'powershellToolHasPermission',
  )
  assert.ok(main)
  const expectedMain = recovered
    ? fixture.sourceState.recoveredDeclaration
    : fixture.sourceState.rawDeclaration
  tsNodeDescriptor(sourceFile, source, main, expectedMain, 'main source owner')

  const nested = []
  const visit = node => {
    if (
      ts.isFunctionDeclaration(node) &&
      ['extractProviderPathFromArg', 'providerOrUncDecisionForArg'].includes(
        node.name?.text,
      )
    ) {
      nested.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(main)
  const expectedNested = recovered
    ? fixture.sourceState.recoveredNestedDeclarations
    : fixture.sourceState.rawNestedDeclarations
  assert.deepEqual(
    nested.map(node => node.name.text),
    expectedNested.map(row => row.name),
  )
  nested.forEach((node, index) =>
    tsNodeDescriptor(
      sourceFile,
      source,
      node,
      expectedNested[index],
      expectedNested[index].name,
    ),
  )

  const imports = sourceFile.statements.filter(node =>
    ts.isImportDeclaration(node),
  )
  const uncImport = imports.find(
    node =>
      node.moduleSpecifier.text ===
      '../../utils/shell/readOnlyCommandValidation.js',
  )
  assert.ok(uncImport)
  const uncExpected = fixture.sourceState.imports.retainedUncHelper
  const shiftedUncExpected = recovered
    ? { ...uncExpected, start: 1267, end: 1357, line: 38, endLine: 38 }
    : uncExpected
  tsNodeDescriptor(
    sourceFile,
    source,
    uncImport,
    shiftedUncExpected,
    'retained UNC helper import',
  )
  const platformImport = imports.find(
    node => node.moduleSpecifier.text === '../../utils/platform.js',
  )
  if (recovered) {
    assert.ok(platformImport)
    tsNodeDescriptor(
      sourceFile,
      source,
      platformImport,
      fixture.sourceState.imports.addedPlatform,
      'getPlatform import',
    )
  } else {
    assert.equal(platformImport, undefined)
  }
  return sourceFile
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function nestedRuntime(parsed, platform) {
  const first = parsed.node.body.body[19]
  const second = parsed.node.body.body[20]
  const source = `${parsed.source.slice(first.start, first.end)};${parsed.source.slice(second.start, second.end)};globalThis.extract=j;globalThis.decide=X`
  const context = {
    bc: new Set(['-', '–', '—', '―']),
    w: /^(?:[\w.]+\\)?(env|hklm|hkcu|function|alias|variable|cert|wsman|registry)::?/i,
    uQ: () => false,
    s$: () => platform,
  }
  vm.createContext(context)
  vm.runInContext(source, context)
  return context
}

test(
  'fixture, replay descriptors, and corrected owner are exact',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.status, 'case-owned-bounded-source-replay')
    assert.deepEqual(TARGET121_POWERSHELL_UNC_EVIDENCE_IDS, fixture.evidenceIds)
    assert.deepEqual(TARGET121_POWERSHELL_UNC_INPUT_FILES, [
      {
        path: fixture.inputs.sourceFile.path,
        bytes: fixture.inputs.sourceFile.input.bytes,
        sha256: fixture.inputs.sourceFile.input.sha256,
      },
    ])
    assert.deepEqual(TARGET121_POWERSHELL_UNC_OUTPUT_FILES, [
      {
        path: fixture.inputs.sourceFile.path,
        bytes: fixture.inputs.sourceFile.output.bytes,
        sha256: fixture.inputs.sourceFile.output.sha256,
      },
    ])
    assert.deepEqual(
      TARGET121_POWERSHELL_UNC_OWNER_OVERRIDES.map(row => ({
        key: row.key,
        targetIndex: row.targetIndex,
        paths: [...row.paths],
        declarations: [...row.declarations],
        evidenceIds: [...row.evidenceIds],
      })),
      [
        {
          key: `${caseName}:14622`,
          targetIndex: 14622,
          paths: [fixture.owner.correctedOwner],
          declarations: [fixture.owner.declaration],
          evidenceIds: fixture.evidenceIds,
        },
      ],
    )
    assert.ok(
      TARGET121_POWERSHELL_UNC_OWNER_OVERRIDES.every(
        row => Object.isFrozen(row.paths) && Object.isFrozen(row.declarations),
      ),
    )
  },
)

test(
  'authenticated whole units, ledger, and all twenty owner rows are pinned',
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
    exactBufferSlice(baseline, fixture.baselineUnit, 'baseline PowerShell unit')
    exactBufferSlice(target, fixture.targetUnit, 'Target121 PowerShell unit')
    const ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
          fixture.inputs.structuralLedger,
          'structural ledger',
        ),
      ),
    )
    const region = ledger.regions.find(
      row => row.target.index === fixture.targetUnit.targetIndex,
    )
    assert.ok(region)
    assert.equal(region.classification, fixture.targetUnit.classification)
    assert.equal(region.baselineUnitIndex, undefined)
    assert.deepEqual(
      {
        nodeType: region.target.nodeType,
        start: region.target.start,
        end: region.target.end,
        tokenCount: region.target.tokenCount,
        sourceHash: region.target.sourceHash,
        coarseHash: region.target.coarseHash,
        topDefinitionCount: region.target.topDefinitionCount,
        unknownFreeIdentifierCount: region.unknownFreeIdentifierCount,
      },
      {
        nodeType: fixture.targetUnit.nodeType,
        start: fixture.targetUnit.start,
        end: fixture.targetUnit.end,
        tokenCount: fixture.targetUnit.tokenCount,
        sourceHash: fixture.targetUnit.sha256,
        coarseHash: fixture.targetUnit.coarseHash,
        topDefinitionCount: fixture.targetUnit.topDefinitionCount,
        unknownFreeIdentifierCount: fixture.targetUnit.unknownFreeIdentifierCount,
      },
    )
    const baselineRegion = ledger.unmatchedBaseline.find(
      row => row.index === fixture.baselineUnit.baselineUnitIndex,
    )
    assert.ok(baselineRegion)
    assert.equal(baselineRegion.sourceHash, fixture.baselineUnit.sha256)
    assert.equal(baselineRegion.coarseHash, fixture.baselineUnit.coarseHash)

    const { report } = readTypedReportPhase()
    const ownerRows = report.sourceRuntimeOwnerResidueRows.filter(
      row => row.structural.index === fixture.targetUnit.targetIndex,
    )
    const addedRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
      row => row.structural.index === fixture.targetUnit.targetIndex,
    )
    const strictRows = report.rows.filter(
      row => row.structural.index === fixture.targetUnit.targetIndex,
    )
    assert.equal(ownerRows.length, fixture.ownerResidues.totalRows)
    assert.equal(addedRows.length, fixture.ownerResidues.targetAddedRows)
    assert.equal(strictRows.length, fixture.ownerResidues.strictRows)
    assert.ok(
      ownerRows.every(
        row =>
          JSON.stringify(row.ownerPaths) ===
          JSON.stringify([fixture.owner.reportedOwner]),
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
      fixture.ownerResidues.rowIdentities,
    )
    assert.deepEqual(
      canonicalDigest(
        addedRows.map(row => [
          row.literalKind,
          row.value,
          row.target.start,
          row.target.end,
          row.targetOccurrenceNumber,
        ]),
      ),
      fixture.ownerResidues.addedIdentities,
    )
    const strictIdentities = strictRows.map(row => [
      row.structural.index,
      row.literalKind,
      row.value,
      row.target.start,
      row.target.end,
      row.targetOccurrenceNumber,
    ])
    assert.deepEqual(strictIdentities, fixture.ownerResidues.strictRowsExact)
    assert.deepEqual(
      canonicalDigest(strictIdentities),
      fixture.ownerResidues.strictIdentities,
    )
  },
)

test(
  'only nested provider and UNC helpers change across the complete unit',
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
    const baseline = parseUnit(
      readExact(baselinePath, fixture.inputs.baselineBundle),
      fixture.baselineUnit,
      'Target120 PowerShell unit',
    )
    const targetBytes = readExact(targetPath, fixture.inputs.targetBundle)
    const target = parseUnit(
      targetBytes,
      fixture.targetUnit,
      'Target121 PowerShell unit',
    )
    const evidence = fixture.wholeUnitEvidence
    assert.equal(
      fixture.targetUnit.bytes - fixture.baselineUnit.bytes,
      evidence.rawByteDelta,
    )
    assert.equal(
      fixture.targetUnit.tokenCount - fixture.baselineUnit.tokenCount,
      evidence.tokenDelta,
    )
    assert.deepEqual(canonicalDescriptor(baseline.node), evidence.baselineCanonical)
    assert.deepEqual(canonicalDescriptor(target.node), evidence.targetCanonical)
    const excluded = new Set(evidence.retainedStatements.excludedIndices)
    const retained = []
    for (let index = 0; index < target.node.body.body.length; index += 1) {
      if (excluded.has(index)) continue
      assert.deepEqual(
        canonicalDescriptor(target.node.body.body[index]),
        canonicalDescriptor(baseline.node.body.body[index]),
      )
      retained.push([
        index,
        canonicalDescriptor(target.node.body.body[index]).sha256,
      ])
    }
    assert.equal(retained.length, evidence.retainedStatements.count)
    assert.deepEqual(
      canonicalDigest(retained),
      expectedDescriptor(evidence.retainedStatements),
    )
    for (const changed of evidence.changedStatements) {
      exactNodeSlice(
        baseline,
        baseline.node.body.body[changed.bodyIndex],
        changed.baseline,
        `baseline nested helper ${changed.bodyIndex}`,
      )
      exactNodeSlice(
        target,
        target.node.body.body[changed.bodyIndex],
        changed.target,
        `target nested helper ${changed.bodyIndex}`,
      )
    }
    for (const regex of evidence.strictRegexLiterals) {
      exactBufferSlice(targetBytes, regex, `target regex ${regex.start}`)
    }
    const normalized = JSON.parse(JSON.stringify(target.node))
    const providerPath = normalized.body.body[19]
    const providerDecision = normalized.body.body[20]
    const outer = providerPath.body.body[1]
    assert.equal(outer.type, 'IfStatement')
    outer.test.right = outer.test.right.left
    const inner = outer.consequent.body[1]
    assert.equal(inner.type, 'IfStatement')
    inner.test = inner.test.left
    assert.equal(providerDecision.body.body[3].type, 'IfStatement')
    providerDecision.body.body.splice(3, 1)
    assert.deepEqual(
      canonicalDescriptor(normalized),
      evidence.reverseTransform.normalizedCanonical,
    )
    assert.deepEqual(
      canonicalDescriptor(normalized),
      canonicalDescriptor(baseline.node),
    )
  },
)

test(
  'bounded replay produces the exact parse-clean source and existing dependencies',
  { skip: !selected },
  () => {
    const rawPath = path.join(
      selectedBaselineSourceRoot(),
      fixture.inputs.sourceFile.path.slice(4),
    )
    const raw = readExact(
      rawPath,
      fixture.inputs.sourceFile.input,
      'raw PowerShell source',
    ).toString('utf8')
    const recovered = buildTarget121PowerShellUncOutput(raw)
    assert.equal(recovered.length, fixture.inputs.sourceFile.output.chars)
    assert.deepEqual(
      descriptor(recovered),
      expectedDescriptor(fixture.inputs.sourceFile.output),
    )
    parsePowerShellSource(raw, fixture.inputs.sourceFile.input, false)
    parsePowerShellSource(recovered, fixture.inputs.sourceFile.output, true)

    const selectedBytes = fs.readFileSync(
      sourceFilename(selectedSourceRoot(), fixture.inputs.sourceFile.path),
    )
    const selectedDescriptor = descriptor(selectedBytes)
    const selectedIsRaw =
      JSON.stringify(selectedDescriptor) ===
      JSON.stringify(expectedDescriptor(fixture.inputs.sourceFile.input))
    const selectedIsRecovered =
      JSON.stringify(selectedDescriptor) ===
      JSON.stringify(expectedDescriptor(fixture.inputs.sourceFile.output))
    assert.ok(selectedIsRaw || selectedIsRecovered)
    parsePowerShellSource(
      selectedBytes.toString('utf8'),
      selectedIsRaw
        ? fixture.inputs.sourceFile.input
        : fixture.inputs.sourceFile.output,
      selectedIsRecovered,
    )

    const ts = typescript()
    for (const dependency of fixture.sourceState.dependencies) {
      const filename = sourceFilename(selectedSourceRoot(), dependency.path)
      const source = readExact(filename, dependency, dependency.path).toString(
        'utf8',
      )
      assert.equal(source.length, dependency.chars)
      const sourceFile = ts.createSourceFile(
        filename,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      )
      assert.equal(sourceFile.parseDiagnostics.length, 0)
      const declaration = sourceFile.statements.find(statement => {
        if (ts.isFunctionDeclaration(statement)) {
          return statement.name?.text === dependency.declaration.name
        }
        return (
          ts.isVariableStatement(statement) &&
          statement.declarationList.declarations.some(
            row => row.name.getText(sourceFile) === dependency.declaration.name,
          )
        )
      })
      assert.ok(declaration)
      tsNodeDescriptor(
        sourceFile,
        source,
        declaration,
        dependency.declaration,
        dependency.declaration.name,
      )
    }
  },
)

test(
  'authenticated runtime enforces slash-drive and resolved UNC edge cases',
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
    const target = parseUnit(
      readExact(targetPath, fixture.inputs.targetBundle),
      fixture.targetUnit,
      'Target121 PowerShell unit',
    )
    const windows = nestedRuntime(target, 'windows')
    assert.equal(windows.extract('/C:env:HOME'), 'env:HOME')
    assert.equal(windows.extract('/ab:env:HOME'), 'env:HOME')
    assert.equal(windows.extract('-Path:env:HOME'), 'env:HOME')
    assert.equal(windows.extract('–Path:env:HOME'), 'env:HOME')
    assert.equal(windows.extract('/long:env:HOME'), '/long:env:HOME')
    assert.equal(windows.extract('https://server/share'), 'https://server/share')
    assert.equal(windows.extract('/not-a-drive'), '/not-a-drive')
    for (const value of fixture.runtimeContract.resolvedUnc.asksOnWindows) {
      assert.equal(windows.decide(value)?.behavior, 'ask', value)
    }
    for (const value of fixture.runtimeContract.resolvedUnc
      .doesNotAskFromNewFallback) {
      assert.equal(windows.decide(value), null, value)
    }
    const linux = nestedRuntime(target, 'linux')
    assert.equal(linux.decide('//server/share'), null)
  },
)

test(
  'filesystem replay is fail-closed, idempotent, and source-root bounded',
  { skip: !selected },
  t => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target121-powershell-unc-'),
    )
    t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }))
    const relative = fixture.inputs.sourceFile.path.slice(4)
    const targetPath = path.join(tempRoot, relative)
    fs.mkdirSync(path.dirname(targetPath), { recursive: true })
    fs.copyFileSync(
      path.join(
        selectedBaselineSourceRoot(),
        relative,
      ),
      targetPath,
    )
    assert.deepEqual(
      applyTarget121PowerShellUncSourceRecovery({ sourceRoot: tempRoot }),
      { status: 'recovered', files: [fixture.inputs.sourceFile.path] },
    )
    readExact(targetPath, fixture.inputs.sourceFile.output, 'replayed source')
    assert.deepEqual(
      applyTarget121PowerShellUncSourceRecovery({ sourceRoot: tempRoot }),
      { status: 'already-recovered', files: [] },
    )
    fs.appendFileSync(targetPath, '\n// tampered')
    assert.throws(
      () =>
        applyTarget121PowerShellUncSourceRecovery({ sourceRoot: tempRoot }),
      /requires exact raw or recovered/,
    )
    assert.throws(
      () =>
        applyTarget121PowerShellUncSourceRecovery({
          sourceRoot: path.join(tempRoot, 'missing'),
        }),
    )
  },
)

test(
  'source lineage and strict evolution remain fail-closed outside u14622',
  { skip: !selected },
  () => {
    for (const [tree, commit] of [
      [selectedBaselineRepositoryRoot(), fixture.sourceState.target120Commit],
      [selectedTargetRepositoryRoot(), fixture.sourceState.target121Commit],
    ]) {
      assert.equal(git(tree, ['rev-parse', 'HEAD']), commit)
      assert.equal(
        git(tree, [
          'rev-parse',
          `HEAD:${fixture.inputs.sourceFile.path}`,
        ]),
        fixture.sourceState.rawGitBlob,
      )
      for (const marker of fixture.sourceState.gitDonorAudit.markers) {
        assert.equal(
          git(tree, [
            'log',
            '--all',
            '--format=%H',
            `-S${marker}`,
            '--',
            fixture.sourceState.gitDonorAudit.path,
          ]),
          '',
        )
      }
    }
    assert.deepEqual(fixture.strictEvolution.before, {
      unsupportedUnits: 49,
      unsupportedResidues: 445,
      firstTargetIndex: 14622,
      productionIndexSha256:
        '57431d24ec30f01eb6c3eff2ebb676ddcd9721641e3a419c8b92da710a2d8e28',
      productionResidueSha256:
        '71f996e6173c352cb47368e93a303d4d61fc06f4fac77431fc2acdb28e826ce5',
    })
    assert.deepEqual(fixture.strictEvolution.removes, {
      targetIndices: [14622],
      units: 1,
      residueCount: 2,
    })
    assert.deepEqual(fixture.strictEvolution.predictedAfter, {
      unsupportedUnits: 48,
      unsupportedResidues: 443,
    })
  },
)
