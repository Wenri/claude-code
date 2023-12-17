import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  TARGET119_PRO_TRIAL_START_JSX_TEXT_LOWERINGS,
  TARGET119_PRO_TRIAL_START_OWNER_OVERRIDES,
  TARGET119_PRO_TRIAL_START_SOURCE_MARKERS,
} from '../cases/2.1.118-to-2.1.119/recovered/pro-trial-start-owner-overrides.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-pro-trial-start-owner-proofs.json',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/pro-trial-start-owner-overrides.mjs',
)
const historicalSourceRoot = path.join(
  root,
  '.recovery-tmp/semantic-trees/2.1.119/src',
)
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? historicalSourceRoot,
)
const artifactRoot = path.join(root, '.recovery-tmp/authenticated-artifacts')
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const FIXTURE_SHA256 =
  '8aa44d898e96ae92bf0924c87d35310ad950186af43b1e17390dc33c04bf8f36'
const HELPER_SHA256 =
  '930312d39aea18506bc372a131629c6912ce008bfe15e5896154563c271550a6'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function selectArtifactPhase(typedAudit, sourceCoverage, sourceCoverageRaw) {
  const matches = fixture.artifactPhasePolicy.acceptedPairs.filter(
    pair =>
      pair.typedAudit.bytes === typedAudit.bytes &&
      pair.typedAudit.sha256 === typedAudit.sha256 &&
      pair.sourceCoverage.bytes === sourceCoverage.bytes &&
      pair.sourceCoverage.sha256 === sourceCoverage.sha256 &&
      (pair.sourceCoverageRaw === undefined ||
        (sourceCoverageRaw !== undefined &&
          pair.sourceCoverageRaw.bytes === sourceCoverageRaw.bytes &&
          pair.sourceCoverageRaw.sha256 === sourceCoverageRaw.sha256)),
  )
  if (matches.length !== 1) {
    throw new Error('unknown or hybrid Target119 Pro trial artifact phase')
  }
  return matches[0]
}

function partitionDescriptor(rows) {
  const bytes = Buffer.from(JSON.stringify(rows))
  return { rows: rows.length, jsonBytes: bytes.length, sha256: sha256(bytes) }
}

function gitBlobSha1(value) {
  return crypto
    .createHash('sha1')
    .update(Buffer.from(`blob ${value.length}\0`))
    .update(value)
    .digest('hex')
}

function artifactPath(environmentName, input) {
  return process.env[environmentName]
    ? path.resolve(process.env[environmentName])
    : path.join(artifactRoot, input.artifact)
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

function canonicalFlags(value) {
  return [...value].sort().join('')
}

function identity(kind, value) {
  return JSON.stringify([
    kind,
    kind === 'regexp'
      ? { pattern: value.pattern, flags: canonicalFlags(value.flags) }
      : value,
  ])
}

function canonicalProofResidues(targetIndex, residues) {
  return residues.map(residue => [
    targetIndex,
    residue.kind,
    residue.value,
    residue.start,
    residue.end,
    residue.baselineCount,
    residue.targetOrdinal,
  ])
}

function bundleOccurrences(source) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const occurrences = new Map()
  function add(kind, value, start, end) {
    const key = identity(kind, value)
    const rows = occurrences.get(key) ?? []
    rows.push({ start, end })
    occurrences.set(key, rows)
  }
  function visit(node) {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (node.type === 'Literal') {
      if (node.regex) add('regexp', node.regex, node.start, node.end)
      else if (typeof node.value === 'string') {
        add('string', node.value, node.start, node.end)
      } else if (typeof node.value === 'number') {
        add('number', String(node.value), node.start, node.end)
      }
    } else if (node.type === 'TemplateElement') {
      add(
        'string',
        node.value?.cooked ?? node.value?.raw,
        node.start,
        node.end,
      )
    }
    const property =
      ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(
        node.type,
      ) &&
      node.computed === false &&
      node.key?.type === 'Identifier'
        ? node.key
        : node.type === 'MemberExpression' &&
            node.computed === false &&
            node.property?.type === 'Identifier'
          ? node.property
          : null
    if (property) add('property', property.name, property.start, property.end)
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
        visit(child)
      }
    }
  }
  visit(ast)
  for (const rows of occurrences.values()) {
    rows.sort((left, right) => left.start - right.start)
  }
  return occurrences
}

function sourceFiles(directory, prefix = '') {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...sourceFiles(filename, relative))
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(relative)
  }
  return files.sort()
}

async function loadTypeScript() {
  const filename = path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

function sourceValues(ts, sourceFile) {
  const values = new Set()
  function add(kind, value) {
    values.add(identity(kind, value))
  }
  function visit(node) {
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) {
      add('string', node.text)
    } else if (ts.isJsxText(node)) {
      const value = node.getText(sourceFile)
      if (value) add('string', value)
    } else if (ts.isNumericLiteral(node)) {
      add('number', String(Number(node.text.replaceAll('_', ''))))
    }
    const namedProperty =
      (ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isPropertyDeclaration(node) ||
        ts.isPropertySignature(node) ||
        ts.isMethodSignature(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node) ||
        ts.isBindingElement(node) ||
        ts.isJsxAttribute(node) ||
        ts.isImportSpecifier(node) ||
        ts.isExportSpecifier(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    const property = namedProperty
      ? node.name.text
      : ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name)
        ? node.name.text
        : undefined
    if (property !== undefined) add('property', property)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return values
}

function jsxElementCount(ts, node) {
  let count = 0
  function visit(child) {
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) count += 1
    ts.forEachChild(child, visit)
  }
  visit(node)
  return count
}

function canonicalReportResidue(row) {
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

function assertLatestArtifactProjection(report, coverage) {
  for (const unit of fixture.latestArtifactProjection.units) {
    for (const [key, expected] of Object.entries(unit.partitions)) {
      const rows = report[key].filter(
        row => row.structural.index === unit.targetIndex,
      )
      assert.deepEqual(partitionDescriptor(rows), expected.full)
      assert.deepEqual(
        partitionDescriptor(rows.map(canonicalReportResidue)),
        expected.identities,
      )
    }
    const coverageRows = coverage.rows.filter(
      row => row.targetIndex === unit.targetIndex,
    )
    assert.deepEqual(partitionDescriptor(coverageRows), unit.coverageRows)
    const ownerIds = new Set(coverageRows.flatMap(row => row.ownerIds))
    assert.deepEqual(
      coverage.owners.filter(owner => ownerIds.has(owner.id)),
      unit.ownerCatalog,
    )
  }
}

function targetDescriptor(region) {
  return {
    classification: region.classification,
    nodeType: region.target.nodeType,
    parseStatus: region.target.parseStatus,
    start: region.target.start,
    end: region.target.end,
    bytes: region.target.end - region.target.start,
    tokenCount: region.target.tokenCount,
    sourceHash: region.target.sourceHash,
    coarseHash: region.target.coarseHash,
  }
}

function sourceDeclarationDescriptor(sourceFile, sourceText, declaration) {
  const start = declaration.getStart(sourceFile)
  const text = sourceText.slice(start, declaration.end)
  return {
    kind: 'FunctionDeclaration',
    name: declaration.name.text,
    start,
    end: declaration.end,
    bytes: Buffer.byteLength(text),
    sourceHash: sha256(text),
  }
}

test(
  'Target119 Pro trial proof fixtures and owner override remain frozen',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.equal(fixture.schemaVersion, 2)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(fixture.summary, {
      units: 3,
      residues: 38,
      targetIndicesSha256:
        'e31c3f0a7f314fc259e920637bd694b2ffb195c409965fe5ed8e9092f9b9783a',
      residueIdentitiesSha256:
        'd2dd9e38c5443ea8814ad981c9ded5b26920b2c97a43ae3dc1e1ca7062322e70',
      representationCounts: {
        'source-named-export-binding': 1,
        'source-dynamic-import-ast': 2,
        'source-file-ast': 20,
        'jsx-create-element-lowering': 10,
        'react-compiler-memo-cache': 1,
        'jsx-text-lowering': 4,
      },
    })
    assert.deepEqual(
      TARGET119_PRO_TRIAL_START_OWNER_OVERRIDES,
      fixture.rows.map(row => ({
        key: `${caseName}:${row.targetIndex}`,
        targetIndex: row.targetIndex,
        paths: [row.sourceOwner],
        evidenceIds: row.evidenceIds,
        declarationName: row.declaration.name,
        behavior: row.behavior,
      })),
    )
    assert.deepEqual(
      TARGET119_PRO_TRIAL_START_SOURCE_MARKERS,
      fixture.rows.find(row => row.targetIndex === 21281).sourceMarkers,
    )
    assert.deepEqual(
      TARGET119_PRO_TRIAL_START_JSX_TEXT_LOWERINGS,
      fixture.compilerProof.jsxTextLowerings,
    )
    const corrected = fixture.coverageEvolution.correctedScanner
    assert.deepEqual(
      {
        units: corrected.units,
        residues: corrected.residues,
        residueIdentitiesSha256: corrected.residueIdentitiesSha256,
        representationCounts: corrected.representationCounts,
        sourceBoldAttributes: corrected.sourceBoldAttributes,
      },
      {
        units: 1,
        residues: 43,
        residueIdentitiesSha256:
          'c32a0553bb9aed9d0a5ba83c8cb9d9291a381252b8558275a8604074f84a9903',
        representationCounts: {
          'jsx-boolean-attribute-lowering': 2,
          'jsx-create-element-lowering': 10,
          'react-compiler-cache-sentinel-call': 8,
          'react-compiler-cache-slot': 21,
          'react-compiler-memo-cache': 1,
          'source-file-ast': 1,
        },
        sourceBoldAttributes: 2,
      },
    )
    assert.equal(
      sha256(
        JSON.stringify(
          canonicalProofResidues(
            21281,
            corrected.rows,
          ),
        ),
      ),
      corrected.residueIdentitiesSha256,
    )
    const addedRows = canonicalProofResidues(
      21281,
      corrected.rows,
    )
    const ownerRows = [
      ...addedRows,
      ...fixture.frozenPartitions.owner.ownerOnlyRetainedRows,
    ].sort(
      (left, right) =>
        left[3] - right[3] || left[4] - right[4] ||
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
    )
    assert.deepEqual(
      partitionDescriptor(ownerRows),
      {
        rows: fixture.frozenPartitions.owner.rows,
        jsonBytes: fixture.frozenPartitions.owner.jsonBytes,
        sha256: fixture.frozenPartitions.owner.sha256,
      },
    )
    assert.deepEqual(
      partitionDescriptor(addedRows),
      {
        rows: fixture.frozenPartitions.addedOwner.rows,
        jsonBytes: fixture.frozenPartitions.addedOwner.jsonBytes,
        sha256: fixture.frozenPartitions.addedOwner.sha256,
      },
    )
    assert.deepEqual(
      partitionDescriptor(fixture.frozenPartitions.strict.canonicalRows),
      {
        rows: fixture.frozenPartitions.strict.rows,
        jsonBytes: fixture.frozenPartitions.strict.jsonBytes,
        sha256: fixture.frozenPartitions.strict.sha256,
      },
    )
    assert.equal(fixture.sourceReplay.mode, 'static')
    assert.equal(fixture.sourceReplay.authorized, false)
  },
)

test(
  'Target119 Pro trial binding and consumer partitions preserve the raw strict and coverage boundary snapshot',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const reportPath = path.join(
      root,
      fixture.inputs.immutableReportSnapshot.path,
    )
    const coveragePath = path.join(
      root,
      fixture.inputs.immutableCoverageSnapshot.path,
    )
    const reportBytes = fs.readFileSync(reportPath)
    const coverageBytes = fs.readFileSync(coveragePath)
    const coverageRaw = gunzipSync(coverageBytes)
    const phase = selectArtifactPhase(
      descriptor(reportBytes),
      descriptor(coverageBytes),
      descriptor(coverageRaw),
    )
    const report = JSON.parse(reportBytes)
    const coverage = JSON.parse(coverageRaw)
    const snapshot = fixture.bindingAndConsumerPartitionSnapshot
    const empty = snapshot.emptyPartition
    const postIntegration = phase.projection === 'postIntegration'
    assert.deepEqual(partitionDescriptor([]), empty)

    for (const candidate of fixture.artifactPhasePolicy.acceptedPairs) {
      assert.equal(
        selectArtifactPhase(
          candidate.typedAudit,
          candidate.sourceCoverage,
          candidate.sourceCoverageRaw,
        ).phase,
        candidate.phase,
      )
    }
    const [prior, current] =
      fixture.artifactPhasePolicy.acceptedPairs.slice(-2)
    assert.throws(
      () =>
        selectArtifactPhase(
          prior.typedAudit,
          current.sourceCoverage,
          prior.sourceCoverageRaw,
        ),
      /unknown or hybrid/,
    )
    assert.throws(
      () =>
        selectArtifactPhase(
          {...current.typedAudit, bytes: 0},
          current.sourceCoverage,
          current.sourceCoverageRaw,
        ),
      /unknown or hybrid/,
    )
    if (fixture.latestArtifactProjection.phases.includes(phase.phase)) {
      assertLatestArtifactProjection(report, coverage)
    }

    for (const target of snapshot.byTarget) {
      const belongs = row => row.structural.index === target.targetIndex
      for (const [reportKey, snapshotKey] of [
        ['sourceRuntimeOwnerResidueRows', 'sourceRuntimeOwnerResidueRows'],
        [
          'sourceRuntimeAddedOwnerResidueRows',
          'sourceRuntimeAddedOwnerResidueRows',
        ],
        ['rows', 'rawStrictRows'],
        ['unclassifiedAddedOccurrenceRows', 'unclassifiedAddedOccurrenceRows'],
      ]) {
        const rows = report[reportKey]
          .filter(belongs)
          .map(canonicalReportResidue)
        const postExpected = postIntegration
          ? snapshot.postIntegration[`${snapshotKey}ByTarget`]?.[
              target.targetIndex
            ]
          : undefined
        const expectedValue = postExpected ?? target[snapshotKey]
        const expected =
          expectedValue === 'emptyPartition'
            ? empty
            : expectedValue === 'rawStrictRows'
              ? target.rawStrictRows
            : expectedValue
        assert.deepEqual(
          partitionDescriptor(rows),
          {
            rows: expected.rows,
            jsonBytes: expected.jsonBytes,
            sha256: expected.sha256,
          },
          `u${target.targetIndex} ${snapshotKey}`,
        )
        if (expected.canonicalRows) {
          assert.deepEqual(rows, expected.canonicalRows)
        }
      }

      const coverageRows = coverage.rows.filter(
        row => row.targetIndex === target.targetIndex,
      )
      assert.equal(coverageRows.length, target.coverage.rowPresent ? 1 : 0)
      const coverageRow = coverageRows[0]
      if (postIntegration) {
        assert.deepEqual(
          coverageRow,
          snapshot.postIntegration.coverageRows.find(
            row => row.targetIndex === target.targetIndex,
          ),
        )
        continue
      }
      assert.equal(
        coverageRow.ownerIds.length === 0,
        target.coverage.sourceOwnershipAbsent,
      )
      if (target.coverage.row) {
        assert.deepEqual(coverageRow, target.coverage.row)
      } else {
        assert.deepEqual(coverageRow.ownerIds, target.coverage.ownerIds)
        assert.deepEqual(coverageRow.evidenceIds, target.coverage.evidenceIds)
      }
    }

    const bindingRow = report.rows.find(
      row => row.structural.index === 21280,
    )
    assert.deepEqual(
      {
        baselineOccurrenceCount: bindingRow.baselineOccurrenceCount,
        literalKind: bindingRow.literalKind,
        targetAdded: bindingRow.targetAdded,
        targetOccurrenceNumber: bindingRow.targetOccurrenceNumber,
        value: bindingRow.value,
        target: bindingRow.target,
        structural: bindingRow.structural,
        disposition: bindingRow.disposition,
        ownerPaths: bindingRow.ownerPaths,
        candidates: bindingRow.candidates,
      },
      {
        baselineOccurrenceCount: 0,
        literalKind: 'property',
        targetAdded: true,
        targetOccurrenceNumber: 1,
        value: 'ProTrialStartScreen',
        target: { start: 12799953, end: 12799972 },
        structural: {
          index: 21280,
          classification: 'unresolved',
          sourceHash:
            'ed253fb5cf8e5baf5b1253c0a4a4953e33c5a6f5a35f1523d0ef64f6eadc272a',
        },
        disposition: postIntegration
          ? 'source-runtime-covered'
          : 'alpha-equivalent',
        ownerPaths: postIntegration
          ? ['components/ProTrialStartScreen.tsx']
          : [],
        candidates: [
          '../src/components/BypassPermissionsModeDialog.tsx',
          '../src/components/TrustDialog/TrustDialog.tsx',
        ],
      },
    )
  },
)

test(
  'Target119 Pro trial proof authenticates the binding, function, initializer, and live consumer lineage',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  async () => {
    const baselineBytes = readExact(
      artifactPath('CLAUDE_CODE_2_1_118_BUNDLE', fixture.inputs.baselineBundle),
      fixture.inputs.baselineBundle,
      'Target118 baseline bundle',
    )
    const targetBytes = readExact(
      artifactPath('CLAUDE_CODE_2_1_119_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'Target119 target bundle',
    )
    const structuralBytes = readExact(
      path.join(root, fixture.inputs.structural.path),
      fixture.inputs.structural,
      'Target119 structural delta',
    )
    const structural = JSON.parse(gunzipSync(structuralBytes))
    const targetBundleText = targetBytes.toString('utf8')
    const functionRow = fixture.rows.find(row => row.targetIndex === 21281)
    for (const row of fixture.rows) {
      const region = structural.regions.find(
        item => item.target.index === row.targetIndex,
      )
      assert.ok(region, `u${row.targetIndex} structural region`)
      assert.deepEqual(targetDescriptor(region), row.target)
      const text = targetBundleText.slice(row.target.start, row.target.end)
      assert.equal(sha256(text), row.target.sourceHash)
      parse(text, { ecmaVersion: 'latest', sourceType: 'module' })
    }
    const functionText = targetBundleText.slice(
      functionRow.target.start,
      functionRow.target.end,
    )
    for (const marker of functionRow.sourceMarkers) {
      assert.ok(functionText.includes(marker))
    }
    assert.match(
      functionText,
      /^function\s+[A-Za-z_$][\w$]*\([^)]*\)\{let\s+[^,]+=[^;]+\.c\(9\),/,
    )

    const baselineOccurrences = bundleOccurrences(baselineBytes.toString('utf8'))
    const targetOccurrences = bundleOccurrences(targetBundleText)
    for (const row of fixture.rows) {
      for (const residue of row.residues) {
        const key = identity(residue.kind, residue.value)
        assert.equal(
          (baselineOccurrences.get(key) ?? []).length,
          residue.baselineCount,
          `${residue.kind}:${JSON.stringify(residue.value)} baseline count`,
        )
        const occurrence =
          (targetOccurrences.get(key) ?? [])[residue.targetOrdinal - 1]
        assert.deepEqual(
          occurrence,
          { start: residue.start, end: residue.end },
          `${residue.kind}:${JSON.stringify(residue.value)} target occurrence`,
        )
        assert.ok(
          residue.start >= row.target.start && residue.end <= row.target.end,
          `u${row.targetIndex}: every frozen residue belongs to its complete unit`,
        )
      }
    }
    for (const residue of fixture.coverageEvolution.correctedScanner.rows) {
      const key = identity(residue.kind, residue.value)
      assert.equal(
        (baselineOccurrences.get(key) ?? []).length,
        residue.baselineCount,
        `${residue.kind}:${JSON.stringify(residue.value)} corrected baseline count`,
      )
      const occurrence =
        (targetOccurrences.get(key) ?? [])[residue.targetOrdinal - 1]
      assert.deepEqual(
        occurrence,
        { start: residue.start, end: residue.end },
        `${residue.kind}:${JSON.stringify(residue.value)} corrected target occurrence`,
      )
      assert.ok(
        residue.start >= functionRow.target.start &&
          residue.end <= functionRow.target.end,
        'every corrected scanner residue belongs to the complete authenticated unit',
      )
    }

    const sourceBytes = readExact(
      path.join(sourceRoot, functionRow.sourceOwner.replace(/^src\//, '')),
      fixture.inputs.sourceFile,
      functionRow.sourceOwner,
    )
    const committedSourceBytes = execFileSync(
      'git',
      [
        'show',
        `${fixture.inputs.sourceHistory.targetCommit}:${functionRow.sourceOwner}`,
      ],
      { cwd: root },
    )
    assert.deepEqual(committedSourceBytes, sourceBytes)
    assert.equal(
      gitBlobSha1(committedSourceBytes),
      fixture.inputs.sourceFile.gitBlob,
    )
    const baselinePath = spawnSync(
      'git',
      [
        'cat-file',
        '-e',
        `${fixture.inputs.sourceHistory.baselineCommit}:${functionRow.sourceOwner}`,
      ],
      { cwd: root },
    )
    assert.equal(fixture.inputs.sourceHistory.baselinePathPresent, false)
    assert.notEqual(baselinePath.status, 0)
    const sourceText = sourceBytes.toString('utf8')
    const ts = await loadTypeScript()
    const sourceFile = ts.createSourceFile(
      functionRow.sourceOwner,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    assert.equal(sourceFile.parseDiagnostics.length, 0)
    const declarations = sourceFile.statements.filter(
      statement =>
        ts.isFunctionDeclaration(statement) &&
        statement.name?.text === functionRow.declaration.name,
    )
    assert.equal(declarations.length, 1)
    const declaration = declarations[0]
    assert.deepEqual(
      {
        kind: 'FunctionDeclaration',
        name: declaration.name.text,
        start: declaration.getStart(sourceFile),
        end: declaration.end,
        bytes: Buffer.byteLength(
          sourceText.slice(declaration.getStart(sourceFile), declaration.end),
        ),
        sourceHash: sha256(
          sourceText.slice(declaration.getStart(sourceFile), declaration.end),
        ),
      },
      functionRow.declaration,
    )
    const declarationText = sourceText.slice(
      functionRow.declaration.start,
      functionRow.declaration.end,
    )
    for (const marker of functionRow.sourceMarkers) {
      assert.ok(declarationText.includes(marker))
    }

    const bindingProof = fixture.moduleBindingProof
    assert.deepEqual(
      sourceDeclarationDescriptor(sourceFile, sourceText, declaration),
      functionRow.declaration,
    )
    const exportModifier = declaration.modifiers?.find(
      modifier => modifier.kind === ts.SyntaxKind.ExportKeyword,
    )
    assert.ok(exportModifier, 'ProTrialStartScreen is a named source export')
    assert.deepEqual(
      {
        start: exportModifier.getStart(sourceFile),
        end: exportModifier.end,
        text: exportModifier.getText(sourceFile),
      },
      bindingProof.sourceExport.exportModifier,
    )
    assert.deepEqual(
      {
        start: declaration.name.getStart(sourceFile),
        end: declaration.name.end,
        text: declaration.name.text,
      },
      bindingProof.sourceExport.exportedName,
    )

    for (const unit of Object.values(bindingProof.compiledModuleUnits)) {
      const region = structural.regions.find(
        candidate => candidate.target.index === unit.targetIndex,
      )
      assert.ok(region, `u${unit.targetIndex} module-lineage region`)
      assert.deepEqual(
        {
          targetIndex: region.target.index,
          start: region.target.start,
          end: region.target.end,
          nodeType: region.target.nodeType,
          tokenCount: region.target.tokenCount,
          sourceHash: region.target.sourceHash,
        },
        {
          targetIndex: unit.targetIndex,
          start: unit.start,
          end: unit.end,
          nodeType: unit.nodeType,
          tokenCount: unit.tokenCount,
          sourceHash: unit.sourceHash,
        },
      )
      const text = targetBundleText.slice(unit.start, unit.end)
      assert.equal(sha256(text), unit.sourceHash)
      if (unit.text) assert.equal(text, unit.text)
    }

    const bindingUnit = bindingProof.compiledModuleUnits.binding
    const bindingProgram = parse(bindingUnit.text, {
      ecmaVersion: 'latest',
      sourceType: 'module',
    })
    assert.equal(bindingProgram.body.length, 1)
    const bindingCall = bindingProgram.body[0].expression
    assert.equal(bindingCall.type, 'CallExpression')
    assert.equal(bindingCall.callee.type, 'Identifier')
    const [namespaceArgument, exportMap] = bindingCall.arguments
    assert.deepEqual(
      { type: namespaceArgument.type, name: namespaceArgument.name },
      { type: 'Identifier', name: 'Dv4' },
    )
    assert.equal(exportMap.type, 'ObjectExpression')
    assert.equal(exportMap.properties.length, 1)
    const exportBinding = exportMap.properties[0]
    assert.deepEqual(
      {
        keyType: exportBinding.key.type,
        keyName: exportBinding.key.name,
        valueType: exportBinding.value.type,
        parameters: exportBinding.value.params.length,
        bodyType: exportBinding.value.body.type,
        bodyName: exportBinding.value.body.name,
      },
      {
        keyType: 'Identifier',
        keyName: 'ProTrialStartScreen',
        valueType: 'ArrowFunctionExpression',
        parameters: 0,
        bodyType: 'Identifier',
        bodyName: 'EZ5',
      },
    )
    const exportHelper = bindingProof.exportHelper
    assert.equal(
      targetBundleText.slice(exportHelper.start, exportHelper.end),
      exportHelper.text,
    )
    assert.equal(sha256(exportHelper.text), exportHelper.sha256)
    assert.match(exportHelper.text, /\{get:\$\[q\],enumerable:!0/)

    const compiledConsumer = bindingProof.compiledConsumer
    const consumerRegion = structural.regions.find(
      candidate => candidate.target.index === compiledConsumer.targetIndex,
    )
    assert.ok(consumerRegion)
    assert.deepEqual(
      {
        targetIndex: consumerRegion.target.index,
        start: consumerRegion.target.start,
        end: consumerRegion.target.end,
        nodeType: consumerRegion.target.nodeType,
        tokenCount: consumerRegion.target.tokenCount,
        sourceHash: consumerRegion.target.sourceHash,
      },
      {
        targetIndex: compiledConsumer.targetIndex,
        start: compiledConsumer.start,
        end: compiledConsumer.end,
        nodeType: compiledConsumer.nodeType,
        tokenCount: compiledConsumer.tokenCount,
        sourceHash: compiledConsumer.sourceHash,
      },
    )
    for (const edge of [compiledConsumer.dynamicImport, compiledConsumer.render]) {
      assert.equal(targetBundleText.slice(edge.start, edge.end), edge.text)
      assert.equal(sha256(edge.text), edge.sha256)
      assert.ok(edge.start >= compiledConsumer.start)
      assert.ok(edge.end <= compiledConsumer.end)
    }
    assert.match(
      compiledConsumer.dynamicImport.text,
      /\(wv4\(\),Dv4\)\)/,
    )
    assert.match(
      compiledConsumer.render.text,
      /createElement\(O,\{onDone:M\}\)/,
    )

    const consumerRow = fixture.rows.find(row => row.targetIndex === 21342)
    const consumerBytes = readExact(
      path.join(
        sourceRoot,
        fixture.inputs.consumerSourceFile.path.replace(/^src\//, ''),
      ),
      fixture.inputs.consumerSourceFile,
      fixture.inputs.consumerSourceFile.path,
    )
    const committedConsumerBytes = execFileSync(
      'git',
      [
        'show',
        `${fixture.inputs.sourceHistory.targetCommit}:${fixture.inputs.consumerSourceFile.path}`,
      ],
      { cwd: root },
    )
    assert.deepEqual(committedConsumerBytes, consumerBytes)
    assert.equal(
      gitBlobSha1(committedConsumerBytes),
      fixture.inputs.consumerSourceFile.gitBlob,
    )
    const consumerText = consumerBytes.toString('utf8')
    const consumerSourceFile = ts.createSourceFile(
      consumerRow.sourceOwner,
      consumerText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    assert.equal(consumerSourceFile.parseDiagnostics.length, 0)
    const consumerDeclaration = consumerSourceFile.statements.find(
      statement =>
        ts.isFunctionDeclaration(statement) &&
        statement.name?.text === consumerRow.declaration.name,
    )
    assert.ok(consumerDeclaration)
    assert.deepEqual(
      sourceDeclarationDescriptor(
        consumerSourceFile,
        consumerText,
        consumerDeclaration,
      ),
      consumerRow.declaration,
    )
    let importCall
    let renderedJsx
    function visitConsumer(node) {
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        ts.isStringLiteral(node.arguments[0]) &&
        node.arguments[0].text === './components/ProTrialStartScreen.js'
      ) {
        importCall = node
      }
      if (
        ts.isJsxSelfClosingElement(node) &&
        node.tagName.getText(consumerSourceFile) === 'ProTrialStartScreen'
      ) {
        renderedJsx = node
      }
      ts.forEachChild(node, visitConsumer)
    }
    visitConsumer(consumerDeclaration)
    assert.ok(importCall)
    assert.ok(renderedJsx)
    const sourceConsumer = bindingProof.sourceConsumer
    const importText = consumerText.slice(
      importCall.getStart(consumerSourceFile),
      importCall.end,
    )
    assert.deepEqual(
      {
        start: importCall.getStart(consumerSourceFile),
        end: importCall.end,
        bytes: Buffer.byteLength(importText),
        sha256: sha256(importText),
      },
      sourceConsumer.dynamicImport,
    )
    const jsxText = consumerText.slice(
      renderedJsx.getStart(consumerSourceFile),
      renderedJsx.end,
    )
    assert.deepEqual(
      {
        start: renderedJsx.getStart(consumerSourceFile),
        end: renderedJsx.end,
        bytes: Buffer.byteLength(jsxText),
        sha256: sha256(jsxText),
      },
      sourceConsumer.renderedJsx,
    )
    let proTrialBlock = importCall.parent
    while (
      proTrialBlock &&
      !(
        ts.isBlock(proTrialBlock) &&
        proTrialBlock.getStart(consumerSourceFile) ===
          sourceConsumer.proTrialBlock.start
      )
    ) {
      proTrialBlock = proTrialBlock.parent
    }
    assert.ok(proTrialBlock)
    const blockText = consumerText.slice(
      proTrialBlock.getStart(consumerSourceFile),
      proTrialBlock.end,
    )
    assert.deepEqual(
      {
        start: proTrialBlock.getStart(consumerSourceFile),
        end: proTrialBlock.end,
        bytes: Buffer.byteLength(blockText),
        sha256: sha256(blockText),
      },
      sourceConsumer.proTrialBlock,
    )
    for (const marker of consumerRow.sourceMarkers) {
      assert.ok(blockText.includes(marker))
    }

    for (const candidate of bindingProof.rejectedScannerCandidates) {
      const candidateBytes = readExact(
        path.join(sourceRoot, candidate.path.replace(/^src\//, '')),
        candidate,
        candidate.path,
      )
      const candidateText = candidateBytes.toString('utf8')
      const candidateSource = ts.createSourceFile(
        candidate.path,
        candidateText,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      )
      assert.equal(candidateSource.parseDiagnostics.length, 0)
      assert.equal(
        candidateText.includes('ProTrialStartScreen'),
        candidate.containsProTrialStartScreen,
      )
      const exportedFunctions = candidateSource.statements.filter(
        statement =>
          ts.isFunctionDeclaration(statement) &&
          statement.modifiers?.some(
            modifier => modifier.kind === ts.SyntaxKind.ExportKeyword,
          ),
      )
      assert.ok(
        exportedFunctions.some(
          statement => statement.name?.text === candidate.exportedDeclaration,
        ),
      )
    }

    const universe = sourceFiles(sourceRoot)
    const trackedUniverse = execFileSync(
      'git',
      [
        'ls-tree',
        '-r',
        '--name-only',
        fixture.inputs.sourceUniverse.commit,
        'src',
      ],
      { cwd: root, encoding: 'utf8' },
    )
      .trim()
      .split('\n')
      .filter(relative => /\.(?:ts|tsx)$/.test(relative))
      .map(relative => relative.replace(/^src\//, ''))
      .sort()
    assert.equal(trackedUniverse.length, fixture.inputs.sourceUniverse.files)
    const trackedSet = new Set(trackedUniverse)
    const universeSet = new Set(universe)
    const missingFromSourceRoot = trackedUniverse.filter(
      relative => !universeSet.has(relative),
    )
    const addedToSourceRoot = universe.filter(
      relative => !trackedSet.has(relative),
    )
    assert.deepEqual(missingFromSourceRoot, [])
    const expectedDelta =
      fixture.inputs.freshPackageSourceUniverse.exactDeltaFromAuthenticatedTarget
    if (addedToSourceRoot.length === 0) {
      assert.equal(universe.length, fixture.inputs.sourceUniverse.files)
    } else {
      assert.equal(
        universe.length,
        fixture.inputs.freshPackageSourceUniverse.files,
      )
      assert.deepEqual(
        addedToSourceRoot.map(relative => `src/${relative}`),
        expectedDelta.map(item => item.path),
      )
      for (const item of expectedDelta) {
        readExact(
          path.join(sourceRoot, item.path.replace(/^src\//, '')),
          item,
          item.path,
        )
      }
    }
    const markerCandidates = universe
      .filter(relative => {
        const text = fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
        return functionRow.sourceMarkers.every(marker => text.includes(marker))
      })
      .map(relative => `src/${relative}`)
    const universeDescriptor =
      addedToSourceRoot.length === 0
        ? fixture.inputs.sourceUniverse
        : fixture.inputs.freshPackageSourceUniverse
    assert.deepEqual(markerCandidates, universeDescriptor.markerCandidates)

    const values = sourceValues(ts, sourceFile)
    const jsxTextTargets = new Set(
      fixture.compilerProof.jsxTextLowerings.map(item => item.target),
    )
    const actualCounts = {
      'source-named-export-binding': 0,
      'source-dynamic-import-ast': 0,
      'source-file-ast': 0,
      'jsx-create-element-lowering': 0,
      'react-compiler-memo-cache': 0,
      'jsx-text-lowering': 0,
    }
    const consumerValues = sourceValues(ts, consumerSourceFile)
    for (const row of fixture.rows) {
      for (const residue of row.residues) {
        const expected =
          row.targetIndex === 21280 &&
          residue.kind === 'property' &&
          residue.value === 'ProTrialStartScreen'
            ? 'source-named-export-binding'
            : row.targetIndex === 21342 &&
                consumerValues.has(identity(residue.kind, residue.value))
              ? 'source-dynamic-import-ast'
              : values.has(identity(residue.kind, residue.value))
                ? 'source-file-ast'
                : residue.kind === 'property' &&
                    residue.value === 'createElement'
                  ? 'jsx-create-element-lowering'
                  : residue.kind === 'property' && residue.value === 'c'
                    ? 'react-compiler-memo-cache'
                    : residue.kind === 'string' &&
                        jsxTextTargets.has(residue.value)
                      ? 'jsx-text-lowering'
                      : null
        assert.equal(expected, residue.representation)
        actualCounts[residue.representation] += 1
      }
    }
    assert.deepEqual(actualCounts, fixture.summary.representationCounts)
    assert.equal(
      jsxElementCount(ts, declaration),
      fixture.compilerProof.sourceJsxElements,
    )
    assert.equal(
      fixture.compilerProof.sourceJsxElements,
      fixture.compilerProof.targetCreateElementResidues,
    )
  },
)
