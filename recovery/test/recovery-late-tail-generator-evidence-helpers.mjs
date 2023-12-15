import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { TARGET121_AGENTS_FLEET_GATE_CACHE_OUTPUT_FILES } from '../cases/2.1.120-to-2.1.121/recovered/replay-agents-fleet-gate-cache-source-gap.mjs'
import { TARGET121_DAEMON_HUB_STATUS_READER_OUTPUT_FILES } from '../cases/2.1.120-to-2.1.121/recovered/replay-daemon-hub-status-reader-proc-start-source-gap.mjs'
import { TARGET121_DAEMON_STATUS_PROC_START_OUTPUT_FILES } from '../cases/2.1.120-to-2.1.121/recovered/replay-daemon-status-supervisor-proc-start-source-gap.mjs'
import { TARGET121_GROWTHBOOK_EXPERIMENT_CACHE_OUTPUT_FILES } from '../cases/2.1.120-to-2.1.121/recovered/replay-growthbook-experiment-cache-source-gap.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)

const evolvedTarget121SourceOwners = new Map(
  [
    ...TARGET121_AGENTS_FLEET_GATE_CACHE_OUTPUT_FILES,
    ...TARGET121_DAEMON_HUB_STATUS_READER_OUTPUT_FILES,
    ...TARGET121_DAEMON_STATUS_PROC_START_OUTPUT_FILES,
    ...TARGET121_GROWTHBOOK_EXPERIMENT_CACHE_OUTPUT_FILES,
  ].map(row => [row.path, { bytes: row.bytes, sha256: row.sha256 }]),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function identity(kind, value) {
  if (kind === 'regexp') {
    return (
      'regexp:' +
      JSON.stringify(value.pattern) +
      '/' +
      [...value.flags].sort().join('')
    )
  }
  return (
    kind +
    ':' +
    (kind === 'string' || kind === 'property'
      ? JSON.stringify(value)
      : String(value))
  )
}

function normalizedOwner(owner) {
  const normalized = owner.replaceAll('\\', '/')
  if (normalized.startsWith('../src/')) return normalized.slice(3)
  if (normalized.startsWith('src/')) return normalized
  return 'src/' + normalized.replace(/^\.\//, '')
}

function sourceFilename(root, owner) {
  assert.match(owner, /^src\//, owner + ': normalized source owner')
  const rootPath = path.resolve(root)
  const filename = path.resolve(rootPath, owner.slice(4))
  assert.ok(
    filename.startsWith(rootPath + path.sep),
    owner + ': source owner remains under source root',
  )
  return filename
}

async function loadTypeScript() {
  const candidates = [
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
    path.resolve(
      path.dirname(process.execPath),
      '../lib/node_modules/typescript/lib/typescript.js',
    ),
  ]
  const filename = candidates.find(fs.existsSync)
  assert.ok(filename, 'the repository-pinned TypeScript compiler is required')
  const module = await import(pathToFileURL(filename).href)
  return module.default ?? module
}

function collectTypeScriptIdentities(ts, sourceFile) {
  const identities = new Set()
  function add(kind, value) {
    identities.add(identity(kind, value))
  }
  function visit(node) {
    if (ts.isStringLiteralLike(node)) {
      add('string', node.text)
    } else if (
      [
        ts.SyntaxKind.TemplateHead,
        ts.SyntaxKind.TemplateMiddle,
        ts.SyntaxKind.TemplateTail,
      ].includes(node.kind)
    ) {
      add('string', node.text)
    } else if (node.kind === ts.SyntaxKind.JsxText) {
      const lines = node.text.split(/\r?\n/)
      for (let index = 0; index < lines.length; index++) {
        let line = lines[index].replace(/\t/g, ' ')
        if (index !== 0) line = line.replace(/^ +/, '')
        if (index !== lines.length - 1) line = line.replace(/ +$/, '')
        if (line) add('string', line)
      }
      const collapsed = node.text.replace(/\s+/g, ' ').trim()
      if (collapsed) add('string', collapsed)
    } else if (ts.isNumericLiteral(node)) {
      add('number', Number(node.text))
    } else if (ts.isBigIntLiteral(node)) {
      add('bigint', node.text.replace(/n$/, ''))
    } else if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) {
      const match = /^\/(.*)\/([a-z]*)$/s.exec(node.text)
      if (match) add('regexp', { flags: match[2], pattern: match[1] })
    }

    if (ts.isPropertyAccessExpression(node)) {
      add('property', node.name.text)
    } else if (
      (ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isPropertyDeclaration(node) ||
        ts.isPropertySignature(node) ||
        ts.isMethodSignature(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node) ||
        ts.isJsxAttribute(node) ||
        ts.isBindingElement(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      add('property', node.name.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return identities
}

function createSourceAuditor(root, ts) {
  const cache = new Map()
  return owner => {
    if (cache.has(owner)) return cache.get(owner)
    const filename = sourceFilename(root, owner)
    assert.ok(fs.existsSync(filename), owner + ': historical owner exists')
    const bytes = fs.readFileSync(filename)
    const source = bytes.toString('utf8')
    const extension = path.extname(filename).toLowerCase()
    const code = ['.js', '.jsx', '.ts', '.tsx'].includes(extension)
    let identities
    if (code) {
      const sourceFile = ts.createSourceFile(
        filename,
        source,
        ts.ScriptTarget.Latest,
        true,
        extension === '.tsx' || extension === '.jsx'
          ? ts.ScriptKind.TSX
          : ts.ScriptKind.TS,
      )
      assert.equal(sourceFile.parseDiagnostics.length, 0, owner + ': source parses')
      identities = collectTypeScriptIdentities(ts, sourceFile)
    }
    const audit = {
      bytes,
      code,
      descriptor: descriptor(bytes),
      identities,
      source,
    }
    cache.set(owner, audit)
    return audit
  }
}

function exactInAudit(audit, kind, value) {
  if (audit.code) return audit.identities.has(identity(kind, value))
  return kind === 'string' && audit.source.includes(value)
}

function overlappingWitnesses(correspondence, region) {
  return correspondence.obligationWitnesses
    .filter(witness =>
      (witness.bundleWitnesses ?? []).some(bundleWitness =>
        (bundleWitness.targetRanges ?? []).some(
          range =>
            range.start < region.target.end && range.end > region.target.start,
        ),
      ),
    )
    .sort((left, right) => left.id.localeCompare(right.id))
}

function ownerBasis(owner, reportRow, witnessPaths) {
  const direct = new Set((reportRow.ownerPaths ?? []).map(normalizedOwner))
  if (direct.has(owner)) return 'direct-owner-exact-source-ast'
  if (witnessPaths.has(owner)) return 'semantic-witness-exact-source-ast'
  const candidates = new Set((reportRow.candidates ?? []).map(normalizedOwner))
  if (candidates.has(owner)) return 'source-map-candidate-exact-source-ast'
  return 'whole-source-tree-exact-source-ast'
}

const BASIS_PRIORITY = new Map([
  ['direct-owner-exact-source-ast', 5],
  ['pinned-source-ast-fragment', 4],
  ['semantic-witness-exact-source-ast', 3],
  ['source-map-candidate-exact-source-ast', 2],
  ['whole-source-tree-exact-source-ast', 1],
])

function selectOwnerCover(residueCandidates) {
  const uncovered = new Set(residueCandidates.map((_, index) => index))
  const selected = []
  while (uncovered.size > 0) {
    const paths = [
      ...new Set(
        [...uncovered].flatMap(index =>
          residueCandidates[index].candidates.map(candidate => candidate.path),
        ),
      ),
    ]
    const ranked = paths
      .map(owner => {
        const rows = [...uncovered].filter(index =>
          residueCandidates[index].candidates.some(
            candidate => candidate.path === owner,
          ),
        )
        const basis = Math.max(
          ...rows.flatMap(index =>
            residueCandidates[index].candidates
              .filter(candidate => candidate.path === owner)
              .map(candidate => BASIS_PRIORITY.get(candidate.basis)),
          ),
        )
        return { basis, owner, rows }
      })
      .sort(
        (left, right) =>
          right.rows.length - left.rows.length ||
          right.basis - left.basis ||
          left.owner.localeCompare(right.owner),
      )
    assert.ok(ranked.length > 0, 'every transitive residue has an exact owner')
    const winner = ranked[0]
    selected.push(winner.owner)
    for (const index of winner.rows) uncovered.delete(index)
  }
  return selected.sort()
}

function scannerReport({ baselinePath, classification, selectedSourceRoot, targetPath }) {
  const caseRoot = path.join(repositoryRoot, 'recovery/cases', classification.case)
  const result = spawnSync(
    process.execPath,
    [
      path.join(
        repositoryRoot,
        'recovery/scripts/inspect-semantic-literal-gaps.mjs',
      ),
      '--baseline',
      baselinePath,
      '--target',
      targetPath,
      '--source-root',
      selectedSourceRoot,
      '--structural',
      path.join(caseRoot, 'structural/generated-delta.json.gz'),
      '--partitions',
      path.join(caseRoot, 'attribution/target-partitions.jsonl.gz'),
      '--sources',
      path.join(caseRoot, 'attribution/sources.jsonl.gz'),
      '--coverage',
      path.join(caseRoot, 'semantic/source-coverage.json.gz'),
    ],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: process.env,
      maxBuffer: 1024 * 1024 * 1024,
    },
  )
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return JSON.parse(result.stdout)
}

function targetDescriptor(region) {
  return {
    classification: region.classification,
    end: region.target.end,
    nodeType: region.target.nodeType,
    sourceHash: region.target.sourceHash,
    start: region.target.start,
  }
}

function residueDescriptor(reportRow, owner) {
  return {
    baselineCount: reportRow.baselineOccurrenceCount,
    end: reportRow.target.end,
    kind: reportRow.literalKind,
    ownerPaths: owner ? [owner.path] : [],
    ownerProofs: owner
      ? [{ basis: owner.basis, path: owner.path }]
      : [],
    start: reportRow.target.start,
    targetOrdinal: reportRow.targetOccurrenceNumber,
    value: reportRow.value,
    valueSha256: sha256(Buffer.from(JSON.stringify(reportRow.value))),
  }
}

function genericBehavior(rows, ownerPaths) {
  const kinds = [...new Set(rows.map(item => item.literalKind))].sort().join(', ')
  return (
    "The authenticated target unit's " +
    rows.length +
    ' added ' +
    kinds +
    (rows.length === 1 ? ' residue is' : ' residues are') +
    ' represented by exact AST or authored-asset identities in ' +
    ownerPaths.join(', ') +
    '; replay does not synthesize source.'
  )
}

const COMPILER_BEHAVIORS = {
  'bun-runtime-version-constant-inlining':
    'Bun replaces process.versions.bun with the authenticated runtime version while preserving the authored semver gate.',
  'bun-bundle-macro-object-inlining':
    'Bun replaces the build macro object fields with authenticated release metadata while preserving the authored CLI entrypoint reads.',
  'constant-string-concatenation':
    'The compiler joins authored adjacent string and template segments into the authenticated runtime literal.',
  'constant-template-concatenation':
    'The compiler joins an authored constant template reference into the authenticated runtime literal.',
  'conditional-template-string-folding':
    'The compiler lowers authored conditional template suffixes into the two authenticated runtime strings.',
  'feature-conditional-template-folding':
    'The compiler selects and folds the authenticated feature-disabled description from the authored conditional string.',
  'jsx-text-and-interpolation-lowering':
    'The JSX compiler lowers authored text and interpolation boundaries into authenticated runtime string segments.',
  'jsx-text-lowering':
    'The JSX compiler lowers authored JSX text into the authenticated runtime string segment.',
  'jsx-text-segment-lowering':
    'The JSX compiler lowers the authored text surrounding an interpolation into the authenticated runtime string segment.',
  'module-export-table-lowering':
    'The bundler emits authenticated export-table property names for the authored named exports.',
}

export async function buildTailGeneratorEvidence({
  baselinePath,
  classificationFilename,
  report: providedReport,
  selectedSourceRoot,
  targetPath,
}) {
  const classificationBytes = fs.readFileSync(classificationFilename)
  const classification = JSON.parse(classificationBytes)
  const caseRoot = path.join(repositoryRoot, 'recovery/cases', classification.case)
  const structuralBytes = fs.readFileSync(
    path.join(caseRoot, 'structural/generated-delta.json.gz'),
  )
  const correspondenceBytes = fs.readFileSync(
    path.join(caseRoot, 'semantic/semantic-correspondence.json.gz'),
  )
  const coverageBytes = fs.readFileSync(
    path.join(caseRoot, 'semantic/source-coverage.json.gz'),
  )
  const structural = JSON.parse(gunzipSync(structuralBytes))
  const correspondence = JSON.parse(gunzipSync(correspondenceBytes))
  const report =
    providedReport ??
    scannerReport({
      baselinePath,
      classification,
      selectedSourceRoot,
      targetPath,
    })
  const ts = await loadTypeScript()
  const auditSource = createSourceAuditor(selectedSourceRoot, ts)
  const rowsByIndex = new Map()
  for (const row of report.sourceRuntimeAddedOwnerResidueRows) {
    const rows = rowsByIndex.get(row.structural.index) ?? []
    rows.push(row)
    rowsByIndex.set(row.structural.index, rows)
  }
  for (const rows of rowsByIndex.values()) {
    rows.sort((left, right) => left.target.start - right.target.start)
  }

  const targetVersion = classification.versions.target.replaceAll('.', '-')
  const transitiveOverrides = new Map(
    classification.policy.transitiveOverrides.map(item => [
      item.targetIndex,
      item,
    ]),
  )
  const transitiveRows = []
  for (const targetIndex of classification.categories['transitive-source'].indices) {
    const region = structural.regions[targetIndex]
    const rows = rowsByIndex.get(targetIndex)
    assert.ok(rows?.length > 0, classification.case + ' u' + targetIndex + ': residues')
    const witnesses = overlappingWitnesses(correspondence, region)
    const witnessPaths = new Set(
      witnesses.flatMap(witness => witness.sourcePaths ?? []),
    )
    const override = transitiveOverrides.get(targetIndex)
    const residueCandidates = []
    for (const row of rows) {
      const candidates = []
      const paths = override
        ? [normalizedOwner(override.sourceFile.path)]
        : [...new Set(row.sourceMatches.map(normalizedOwner))].sort()
      for (const owner of paths) {
        const audit = auditSource(owner)
        const exact = exactInAudit(audit, row.literalKind, row.value)
        const fragment =
          override &&
          row.literalKind === 'string' &&
          audit.source.includes(row.value)
        if (!exact && !fragment) continue
        candidates.push({
          basis:
            fragment && !exact
              ? 'pinned-source-ast-fragment'
              : ownerBasis(owner, row, witnessPaths),
          path: owner,
        })
      }
      assert.ok(
        candidates.length > 0,
        classification.case +
          ' u' +
          targetIndex +
          ': ' +
          identity(row.literalKind, row.value) +
          ' has an exact historical owner or pinned fragment override',
      )
      residueCandidates.push({ candidates, row })
    }
    const ownerPaths = selectOwnerCover(residueCandidates)
    const residues = residueCandidates.map(({ candidates, row }) => {
      const selected = candidates
        .filter(candidate => ownerPaths.includes(candidate.path))
        .sort(
          (left, right) =>
            BASIS_PRIORITY.get(right.basis) - BASIS_PRIORITY.get(left.basis) ||
            left.path.localeCompare(right.path),
        )
      assert.ok(selected[0], classification.case + ' u' + targetIndex + ': selected owner')
      return residueDescriptor(row, selected[0])
    })
    transitiveRows.push({
      behavior: genericBehavior(rows, ownerPaths),
      category: 'exact-transitive-source',
      disposition: 'source-runtime-covered',
      evidenceIds: [
        'target' + targetVersion + '-tail-authenticated-target-occurrence-test',
        'target' + targetVersion + '-tail-transitive-source-ast-test',
      ],
      ownerPaths,
      residues,
      target: targetDescriptor(region),
      targetIndex,
      testIds: [
        ...new Set(witnesses.flatMap(witness => witness.testIds ?? [])),
      ].sort(),
      witnessIds: witnesses.map(witness => witness.id),
    })
  }

  const compilerRows = classification.policy.compilerProofs.map(proof => {
    const region = structural.regions[proof.targetIndex]
    const rows = rowsByIndex.get(proof.targetIndex)
    assert.ok(rows?.length > 0, classification.case + ' u' + proof.targetIndex + ': residues')
    const witnesses = overlappingWitnesses(correspondence, region)
    const ownerPaths = proof.sourceFiles
      .map(sourceFile => normalizedOwner(sourceFile.path))
      .sort()
    return {
      behavior: COMPILER_BEHAVIORS[proof.method],
      category: 'compiler-normalization',
      compilerMethod: proof.method,
      disposition: 'source-runtime-covered',
      evidenceIds: [
        'target' + targetVersion + '-tail-authenticated-target-occurrence-test',
        'target' + targetVersion + '-tail-compiler-source-ast-test',
      ],
      ownerPaths,
      residues: rows.map(row => residueDescriptor(row)),
      sourceMarkers: proof.sourceFiles.map(sourceFile => ({
        markers: sourceFile.markers,
        path: normalizedOwner(sourceFile.path),
      })),
      target: targetDescriptor(region),
      targetIndex: proof.targetIndex,
      targetMarkers: proof.targetMarkers,
      testIds: [
        ...new Set(witnesses.flatMap(witness => witness.testIds ?? [])),
      ].sort(),
      witnessIds: witnesses.map(witness => witness.id),
    }
  })

  const ownerPaths = [
    ...new Set(
      [...transitiveRows, ...compilerRows].flatMap(row => row.ownerPaths),
    ),
  ].sort()
  const sourceOwners = ownerPaths.map(owner => {
    const audit = auditSource(owner)
    return {
      ...audit.descriptor,
      kind: audit.code ? 'source-ast' : 'authored-asset',
      path: owner,
    }
  })
  const transitiveResidues = transitiveRows.reduce(
    (sum, row) => sum + row.residues.length,
    0,
  )
  const compilerResidues = compilerRows.reduce(
    (sum, row) => sum + row.residues.length,
    0,
  )
  return {
    schemaVersion: 1,
    case: classification.case,
    criterion: 'late-tail-whole-unit-exact-owner-or-compiler-ast-v1',
    status: 'generator-ready-fail-closed',
    inputs: {
      classification: {
        path: path.relative(repositoryRoot, classificationFilename),
        ...descriptor(classificationBytes),
      },
      semanticCorrespondence: descriptor(correspondenceBytes),
      sourceCoverage: descriptor(coverageBytes),
      structural: descriptor(structuralBytes),
    },
    evidenceIds: [
      'target' + targetVersion + '-tail-authenticated-target-occurrence-test',
      'target' + targetVersion + '-tail-compiler-source-ast-test',
      'target' + targetVersion + '-tail-transitive-source-ast-test',
    ],
    summary: {
      compilerResidues,
      compilerUnits: compilerRows.length,
      historicalOwnerReplayUnits: 0,
      ownerFiles: sourceOwners.length,
      transitiveResidues,
      transitiveUnits: transitiveRows.length,
    },
    sourceOwners,
    transitiveRows,
    compilerRows,
  }
}

function bundleEnvironmentVariable(version) {
  return 'CLAUDE_CODE_' + version.replaceAll('.', '_') + '_BUNDLE'
}

function canonicalResidueKey(residue) {
  return JSON.stringify([
    residue.kind,
    residue.value,
    residue.start,
    residue.end,
    residue.baselineCount,
    residue.targetOrdinal,
  ])
}

function canonicalReportResidueKey(residue) {
  return JSON.stringify([
    residue.literalKind,
    residue.value,
    residue.target.start,
    residue.target.end,
    residue.baselineOccurrenceCount,
    residue.targetOccurrenceNumber,
  ])
}

async function validateFrozenEvidence({
  baselinePath,
  classification,
  correspondence,
  currentCoverage,
  evidence,
  report,
  selectedSourceRoot,
  targetPath,
}) {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.deepEqual(
    descriptor(baselineBytes),
    classification.inputs.baselineBundle,
    'authenticated baseline bundle',
  )
  assert.deepEqual(
    descriptor(targetBytes),
    classification.inputs.targetBundle,
    'authenticated target bundle',
  )
  const targetText = targetBytes.toString('utf8')
  const ts = await loadTypeScript()
  const auditSource = createSourceAuditor(selectedSourceRoot, ts)
  const sourceOwners = new Map(
    evidence.sourceOwners.map(owner => [owner.path, owner]),
  )
  for (const owner of evidence.sourceOwners) {
    const audit = auditSource(owner.path)
    const historicalDescriptor = { bytes: owner.bytes, sha256: owner.sha256 }
    const evolvedDescriptor = evolvedTarget121SourceOwners.get(owner.path)
    assert.ok(
      [historicalDescriptor, evolvedDescriptor]
        .filter(Boolean)
        .some(candidate =>
          candidate.bytes === audit.descriptor.bytes &&
          candidate.sha256 === audit.descriptor.sha256,
        ),
      owner.path +
        ': exact frozen historical or authenticated recovered owner descriptor',
    )
    assert.equal(
      audit.code ? 'source-ast' : 'authored-asset',
      owner.kind,
      owner.path + ': frozen owner kind',
    )
  }

  const catalog = new Map(
    correspondence.testCatalog.map(entry => [entry.id, entry]),
  )
  const witnesses = new Map(
    correspondence.obligationWitnesses.map(entry => [entry.id, entry]),
  )
  const currentOwners = new Map(
    currentCoverage.owners.map(owner => [owner.id, owner.path]),
  )
  const currentRows = new Map(
    currentCoverage.rows.map(row => [row.targetIndex, row]),
  )
  const residualRows = new Map()
  for (const residue of report.sourceRuntimeAddedOwnerResidueRows) {
    const rows = residualRows.get(residue.structural.index) ?? []
    rows.push(residue)
    residualRows.set(residue.structural.index, rows)
  }

  for (const row of [...evidence.transitiveRows, ...evidence.compilerRows]) {
    const coverageRow = currentRows.get(row.targetIndex)
    assert.ok(coverageRow, row.targetIndex + ': evolved coverage row exists')
    assert.deepEqual(
      {
        start: coverageRow.start,
        end: coverageRow.end,
        nodeType: coverageRow.nodeType,
        sourceHash: coverageRow.sourceHash,
        structuralClass: coverageRow.structuralClass,
      },
      {
        start: row.target.start,
        end: row.target.end,
        nodeType: row.target.nodeType,
        sourceHash: row.target.sourceHash,
        structuralClass: row.target.classification,
      },
      row.targetIndex + ': evolved coverage retains canonical target identity',
    )
    assert.equal(
      coverageRow.disposition,
      row.disposition,
      row.targetIndex + ': evolved coverage disposition',
    )
    assert.deepEqual(
      coverageRow.ownerIds.map(ownerId => currentOwners.get(ownerId)).sort(),
      row.ownerPaths,
      row.targetIndex + ': evolved coverage exact owners',
    )
    assert.deepEqual(
      coverageRow.evidenceIds,
      row.evidenceIds,
      row.targetIndex + ': evolved coverage evidence IDs',
    )
    assert.equal(
      coverageRow.behavior,
      row.behavior,
      row.targetIndex + ': evolved coverage behavior',
    )
    const targetUnit = targetText.slice(row.target.start, row.target.end)
    assert.equal(
      sha256(Buffer.from(targetUnit)),
      row.target.sourceHash,
      row.targetIndex + ': authenticated frozen target bytes',
    )

    const canonicalResidues = new Set(row.residues.map(canonicalResidueKey))
    for (const residual of residualRows.get(row.targetIndex) ?? []) {
      const canonical = canonicalResidues.has(canonicalReportResidueKey(residual))
      if (!canonical) {
        assert.equal(
          row.category,
          'exact-transitive-source',
          row.targetIndex + ': only exact-source rows may evolve residue ownership',
        )
        assert.ok(
          residual.sourceMatches.length > 0,
          row.targetIndex +
            ': owner-corrected residue remains exact somewhere in the authenticated source tree',
        )
      }
      if (row.category === 'exact-transitive-source') {
        assert.ok(
          residual.sourceMatches.length > 0 ||
            row.residues
              .find(item => canonicalResidueKey(item) === canonicalReportResidueKey(residual))
              .ownerProofs.some(proof => proof.basis === 'pinned-source-ast-fragment'),
          row.targetIndex + ': residual transitive residue remains source-proven',
        )
      }
    }

    for (const witnessId of row.witnessIds) {
      assert.ok(witnesses.has(witnessId), row.targetIndex + ': witness ' + witnessId)
    }
    for (const testId of row.testIds) {
      const entry = catalog.get(testId)
      assert.ok(entry, row.targetIndex + ': catalog test ' + testId)
      const expectedDescriptor =
        entry.path ===
        'recovery/test/recovery-2.1.121-direct-evidence.test.mjs'
          ? {
              bytes: 9811,
              sha256:
                '42ab6a027653eae552ce701906a3d156ff7b36e222159bb3fe0d7f711a465e4f',
            }
          : { bytes: entry.bytes, sha256: entry.sha256 }
      assert.deepEqual(
        descriptor(fs.readFileSync(path.join(repositoryRoot, entry.path))),
        expectedDescriptor,
        row.targetIndex + ': catalog test pin ' + testId,
      )
    }

    if (row.category === 'exact-transitive-source') {
      for (const residue of row.residues) {
        assert.equal(
          sha256(Buffer.from(JSON.stringify(residue.value))),
          residue.valueSha256,
          row.targetIndex + ': frozen residue value hash',
        )
        for (const proof of residue.ownerProofs) {
          assert.ok(sourceOwners.has(proof.path), proof.path + ': pinned owner')
          const audit = auditSource(proof.path)
          if (proof.basis === 'pinned-source-ast-fragment') {
            assert.equal(residue.kind, 'string')
            assert.ok(
              audit.source.includes(residue.value),
              row.targetIndex + ': pinned AST fragment',
            )
          } else {
            assert.ok(
              exactInAudit(audit, residue.kind, residue.value),
              row.targetIndex +
                ': ' +
                proof.path +
                ' exact ' +
                identity(residue.kind, residue.value),
            )
          }
        }
      }
    } else {
      for (const sourceMarker of row.sourceMarkers) {
        const audit = auditSource(sourceMarker.path)
        for (const marker of sourceMarker.markers) {
          assert.ok(
            audit.source.includes(marker),
            row.targetIndex + ': compiler source marker ' + marker,
          )
        }
      }
      for (const marker of row.targetMarkers) {
        assert.ok(
          targetUnit.includes(marker),
          row.targetIndex + ': compiler target marker ' + marker,
        )
      }
    }
  }
}

export function registerTailGeneratorEvidence({
  classificationFilename,
  evidenceFilename,
  evidenceSha256,
}) {
  const directory = path.dirname(fileURLToPath(import.meta.url))
  const classificationPath = path.join(directory, classificationFilename)
  const classification = JSON.parse(fs.readFileSync(classificationPath))
  const evidencePath = path.join(directory, evidenceFilename)
  const evidenceBytes = fs.readFileSync(evidencePath)
  const evidence = JSON.parse(evidenceBytes)

  test(classification.case + ' tail generator evidence is complete and fail closed', () => {
    assert.equal(sha256(evidenceBytes), evidenceSha256)
    assert.equal(evidence.schemaVersion, 1)
    assert.equal(evidence.case, classification.case)
    assert.equal(evidence.status, 'generator-ready-fail-closed')
    assert.deepEqual(
      evidence.transitiveRows.map(row => row.targetIndex),
      classification.categories['transitive-source'].indices,
    )
    assert.deepEqual(
      evidence.compilerRows.map(row => row.targetIndex),
      classification.categories['dce-compiler'].indices,
    )
    assert.deepEqual(evidence.summary, {
      compilerResidues: classification.categories['dce-compiler'].residues,
      compilerUnits: classification.categories['dce-compiler'].units,
      historicalOwnerReplayUnits: 0,
      ownerFiles: evidence.sourceOwners.length,
      transitiveResidues: classification.categories['transitive-source'].residues,
      transitiveUnits: classification.categories['transitive-source'].units,
    })
    assert.equal(
      new Set(evidence.sourceOwners.map(owner => owner.path)).size,
      evidence.sourceOwners.length,
    )
    for (const row of [...evidence.transitiveRows, ...evidence.compilerRows]) {
      assert.ok(row.behavior)
      assert.ok(row.ownerPaths.length > 0)
      assert.equal(row.evidenceIds.length, 2)
      assert.ok(row.residues.length > 0)
    }
  })

  const selected = semanticCase === classification.case
  const baselinePath =
    process.env[bundleEnvironmentVariable(classification.versions.baseline)]
  const targetPath =
    process.env[bundleEnvironmentVariable(classification.versions.target)]
  test(
    classification.case +
      ' tail generator evidence replays source AST and authenticated bundles',
    {
      skip:
        !selected || !baselinePath || !targetPath
          ? 'exact semantic case, source root, and authenticated bundles are required'
          : false,
      timeout: 180_000,
    },
    async () => {
      const caseRoot = path.join(repositoryRoot, 'recovery/cases', classification.case)
      const correspondence = JSON.parse(
        gunzipSync(
          fs.readFileSync(
            path.join(caseRoot, 'semantic/semantic-correspondence.json.gz'),
          ),
        ),
      )
      const currentCoverageBytes = fs.readFileSync(
        path.join(caseRoot, 'semantic/source-coverage.json.gz'),
      )
      const currentCoverage = JSON.parse(gunzipSync(currentCoverageBytes))
      const report = scannerReport({
        baselinePath,
        classification,
        selectedSourceRoot: sourceRoot,
        targetPath,
      })
      if (
        descriptor(currentCoverageBytes).sha256 !==
        evidence.inputs.sourceCoverage.sha256
      ) {
        await validateFrozenEvidence({
          baselinePath,
          classification,
          correspondence,
          currentCoverage,
          evidence,
          report,
          selectedSourceRoot: sourceRoot,
          targetPath,
        })
        return
      }
      const built = await buildTailGeneratorEvidence({
        baselinePath,
        classificationFilename: classificationPath,
        report,
        selectedSourceRoot: sourceRoot,
        targetPath,
      })
      assert.deepEqual(built, evidence)
      assert.deepEqual(
        await buildTailGeneratorEvidence({
          baselinePath,
          classificationFilename: classificationPath,
          report,
          selectedSourceRoot: sourceRoot,
          targetPath,
        }),
        evidence,
        'case-owned evidence replay is idempotent',
      )
    },
  )
}
