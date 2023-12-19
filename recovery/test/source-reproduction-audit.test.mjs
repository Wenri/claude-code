import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  semanticEvidenceTestFilesForCoverage,
  validateRetiredOwner,
  validateSemanticLiteralResidueReport,
} from '../scripts/audit-source-reproduction.mjs'

const REPOSITORY = fileURLToPath(new URL('../..', import.meta.url))
const SCRIPT = path.join(
  REPOSITORY,
  'recovery',
  'scripts',
  'audit-source-reproduction.mjs',
)
const INVENTORY = path.join(
  REPOSITORY,
  'recovery',
  'source-reproduction-gaps.json',
)
const FIRST_CASE = path.join(
  REPOSITORY,
  'recovery/cases/2.1.88-to-2.1.89/manifest.json',
)
const FINAL_CASE = path.join(
  REPOSITORY,
  'recovery/cases/2.1.114-to-2.1.116/manifest.json',
)
const CASE_108_COVERAGE = path.join(
  REPOSITORY,
  'recovery/cases/2.1.107-to-2.1.108/semantic/source-coverage.json.gz',
)

function invoke(arguments_ = []) {
  return spawnSync(
    process.execPath,
    [SCRIPT, '--repo', REPOSITORY, ...arguments_],
    {
      cwd: REPOSITORY,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  )
}

function temporaryInventory(update) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'semantic-source-audit-test-'),
  )
  const filename = path.join(root, 'inventory.json')
  const inventory = JSON.parse(fs.readFileSync(INVENTORY, 'utf8'))
  update(inventory)
  fs.writeFileSync(filename, `${JSON.stringify(inventory, null, 2)}\n`)
  return { filename, root }
}

function git(repository, ...arguments_) {
  const result = spawnSync('git', arguments_, {
    cwd: repository,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function retiredOwnerFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'retired-owner-audit-test-'))
  git(root, 'init', '--quiet')
  git(root, 'config', 'user.name', 'Recovery Test')
  git(root, 'config', 'user.email', 'recovery-test@example.invalid')
  const ownerPath = 'src/components/HistoricalOwner.tsx'
  const ownerFilename = path.join(root, ownerPath)
  fs.mkdirSync(path.dirname(ownerFilename), { recursive: true })
  fs.writeFileSync(ownerFilename, 'export const historicalOwner = true\n')
  git(root, 'add', ownerPath)
  git(root, 'commit', '--quiet', '-m', 'historical owner')
  const baseCommit = git(root, 'rev-parse', 'HEAD')
  fs.rmSync(ownerFilename)
  git(root, 'add', '--all')
  git(root, 'commit', '--quiet', '-m', 'retire owner')
  const targetCommit = git(root, 'rev-parse', 'HEAD')

  const retiredInCase = '2.1.90-to-2.1.91'
  const caseRoot = path.join(root, 'recovery', 'cases', retiredInCase)
  const overlayRelative = 'recovered/source-facing-overlay.patch'
  const overlayFilename = path.join(caseRoot, overlayRelative)
  const manifestFilename = path.join(caseRoot, 'manifest.json')
  fs.mkdirSync(path.dirname(overlayFilename), { recursive: true })

  function writeManifest(overlay, semanticTargetCommit = targetCommit) {
    fs.writeFileSync(overlayFilename, overlay)
    const value = Buffer.from(overlay)
    fs.writeFileSync(
      manifestFilename,
      `${JSON.stringify({
        case: retiredInCase,
        recoveredFileAssertions: [
          {
            path: overlayRelative,
            bytes: value.length,
            sha256: crypto.createHash('sha256').update(value).digest('hex'),
          },
        ],
        semanticSourceLineage: { targetCommit: semanticTargetCommit },
        sourceLineage: {
          baseCommit,
          patchOrder: [overlayRelative],
        },
      }, null, 2)}\n`,
    )
  }

  const deletion = [
    `diff --git a/${ownerPath} b/${ownerPath}`,
    'deleted file mode 100644',
    'index 1111111..0000000',
    `--- a/${ownerPath}`,
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-export const historicalOwner = true',
    '',
  ].join('\n')
  writeManifest(deletion)
  return {
    baseCommit,
    caseName: '2.1.88-to-2.1.89',
    deletion,
    owner: {
      id: 'owner-historical',
      path: ownerPath,
      retiredInCase,
    },
    ownerFilename,
    root,
    targetCommit,
    writeManifest,
  }
}

function assertSemanticCase(entry) {
  assert.equal(entry.generatedReplay.byteExactGeneratedReplay, true)
  assert.equal(entry.generatedReplay.byteReplayVerified, false)
  assert.equal(entry.generatedReplay.replay, null)

  const source = entry.sourceReproduction
  assert.equal(source.criterion, 'compiled-ast-function-semantics-v1')
  assert.equal(source.firstPartySemanticCoverageClaimed, true)
  assert.equal(source.firstPartySemanticEquivalentFromSrc, false)
  assert.equal(source.wholeBundleSemanticEquivalentFromSrc, false)
  assert.equal(source.byteExactSourceBuildClaimed, false)
  assert.equal(source.coverage.sourceRuntimeGaps, 0)
  assert.ok(source.coverage.nonmatchedUnits > 0)
  assert.ok(source.coverage.dependencyRuntimeGaps >= 0)
  assert.equal(source.buildInputs.hermetic, false)
  assert.equal(source.buildInputs.applicationManifest, false)
  assert.equal(source.buildInputs.dependencySourceArchivePinned, false)
  assert.match(source.buildInputs.gap, /manifest|dependency|build/i)
  assert.equal(
    source.dependencyAudit.dependencyRows,
    source.coverage.dependencyRuntimeGaps,
  )
  assert.equal(source.dependencyAudit.pinnedSourceBuildInputs, 0)
  assert.equal(
    source.semanticEvidenceTests.status,
    'not-run-without-authenticated-artifacts',
  )
  assert.equal(
    source.semanticLiteralResidueAudit.status,
    'not-run-without-authenticated-artifacts',
  )
  assert.equal(source.semanticLiteralResidueAudit.targetAddedOccurrences, null)
  assert.equal(
    source.semanticLiteralResidueAudit.sourceRuntimeTargetOccurrences,
    null,
  )
  assert.ok(source.semanticEvidenceTests.files.length > 0)
  assert.ok(source.semanticOwnerPaths.length > 0)
  assert.ok(source.supplementIntroductionProofs.length > 0)
  for (const proof of source.supplementIntroductionProofs) {
    assert.ok(proof.syntaxCheckedSourceFiles > 0)
  }
}

function typedResidueFixture({
  baselineOccurrenceCount = 2,
  evidence = [
    {
      id: 'semantic-test',
      kind: 'semantic-test',
      path: 'recovery/test/example.test.mjs',
    },
    { id: 'source-map', kind: 'source-map-attribution' },
  ],
  targetAdded = false,
  targetOccurrenceNumber = 2,
} = {}) {
  const residue = {
    baselineOccurrenceCount,
    literalKind: 'property',
    targetAdded,
    targetOccurrenceNumber,
    value: 'createElement',
    structural: { index: 42 },
  }
  return {
    caseName: '2.1.108-to-2.1.109',
    coverage: {
      evidence,
      rows: [
        {
          targetIndex: 42,
          disposition: 'source-runtime-covered',
          evidenceIds: evidence.map(item => item.id),
          ownerIds: ['owner-example'],
        },
      ],
    },
    report: {
      targetAddedOccurrences: targetAdded ? 1 : 0,
      sourceRuntimeTargetOccurrences: 1,
      sourceRuntimeOwnerResidues: 1,
      sourceRuntimeAddedOwnerResidues: targetAdded ? 1 : 0,
      sourceRuntimeOwnerResiduesByKind: {
        string: 0,
        number: 0,
        bigint: 0,
        regexp: 0,
        property: 1,
      },
      unclassifiedAddedOccurrences: 0,
      sourceRuntimeOwnerResidueRows: [residue],
      sourceRuntimeAddedOwnerResidueRows: targetAdded ? [residue] : [],
    },
  }
}

test('typed owner residues use authenticated baseline occurrence accounting', () => {
  const inherited = validateSemanticLiteralResidueReport(
    typedResidueFixture(),
  )
  assert.deepEqual(
    {
      inheritedResidues: inherited.inheritedResidues,
      inheritedResidueUnits: inherited.inheritedResidueUnits,
      explicitlyProvedResidues: inherited.explicitlyProvedResidues,
      explicitlyProvedResidueUnits: inherited.explicitlyProvedResidueUnits,
      ownerResidues: inherited.ownerResidues,
      ownerResidueUnits: inherited.ownerResidueUnits,
    },
    {
      inheritedResidues: 1,
      inheritedResidueUnits: 1,
      explicitlyProvedResidues: 0,
      explicitlyProvedResidueUnits: 0,
      ownerResidues: 1,
      ownerResidueUnits: 1,
    },
  )

  assert.throws(
    () =>
      validateSemanticLiteralResidueReport(
        typedResidueFixture({
          baselineOccurrenceCount: 1,
          targetAdded: false,
          targetOccurrenceNumber: 2,
        }),
      ),
    /targetAdded disagrees with authenticated baseline occurrence accounting/,
  )
})

test('target-added owner residues still require executable or static proof', () => {
  assert.throws(
    () =>
      validateSemanticLiteralResidueReport(
        typedResidueFixture({
          baselineOccurrenceCount: 1,
          targetAdded: true,
          targetOccurrenceNumber: 2,
        }),
      ),
    /target-added property value.*lacks executable target-fragment or static-AST/i,
  )

  const staticProof = validateSemanticLiteralResidueReport(
    typedResidueFixture({
      baselineOccurrenceCount: 1,
      evidence: [
        {
          id: 'semantic-test',
          kind: 'semantic-test',
          path: 'recovery/test/example.test.mjs',
        },
        { id: 'static-proof', kind: 'static-ast' },
      ],
      targetAdded: true,
      targetOccurrenceNumber: 2,
    }),
  )
  assert.equal(staticProof.inheritedResidues, 0)
  assert.equal(staticProof.explicitlyProvedResidues, 1)
  assert.equal(staticProof.explicitlyProvedResidueUnits, 1)
})

test('semantic evidence execution ignores unreferenced catalog entries', () => {
  const coverage = {
    rows: [
      {
        evidenceIds: ['used-fragment', 'used-semantic-test'],
      },
    ],
    evidence: [
      {
        id: 'used-fragment',
        kind: 'target-fragment',
        path: 'recovery/test/used.test.mjs',
      },
      {
        id: 'used-semantic-test',
        kind: 'semantic-test',
        path: 'recovery/test/used.test.mjs',
      },
      {
        id: 'future-unused-semantic-test',
        kind: 'semantic-test',
        path: 'recovery/test/future.test.mjs',
      },
    ],
  }

  assert.deepEqual(semanticEvidenceTestFilesForCoverage(coverage), [
    'recovery/test/used.test.mjs',
  ])
})

test('audits all 21 releases at compiled-AST/function semantics', () => {
  const result = invoke()
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)

  assert.equal(report.status, 'semantic-source-reproduction-ledgers-verified')
  assert.equal(report.criterion, 'compiled-ast-function-semantics-v1')
  assert.equal(report.cases, 21)
  assert.equal(report.ancestryCasesVerified, 21)
  assert.equal(report.generatedReplayExactClaims, 21)
  assert.equal(report.generatedReplayByteVerified, 0)
  assert.equal(report.ancestryGeneratedReplayByteVerified, 0)
  assert.equal(report.firstPartySemanticCoverageClaims, 21)
  assert.equal(report.ancestryFirstPartySemanticCoverageClaims, 21)
  assert.equal(report.firstPartySemanticEquivalentFromSource, 0)
  assert.equal(report.ancestryFirstPartySemanticEquivalentFromSource, 0)
  assert.equal(report.ancestryWholeBundleSemanticEquivalentFromSource, 0)
  assert.equal(report.ancestrySourceRuntimeGaps, 0)
  assert.equal(
    report.ancestryDependencyRuntimeGaps,
    report.dependencyRuntimeGaps,
  )
  assert.equal(report.ancestryMissingHermeticBuildInputCases, 21)
  assert.equal(report.wholeBundleSemanticEquivalentFromSource, 0)
  assert.equal(report.sourceRuntimeGaps, 0)
  assert.ok(report.dependencyRuntimeGaps > 0)
  assert.equal(report.missingHermeticBuildInputCases, 21)
  assert.equal(report.byteExactSourceBuildClaims, 0)
  assert.equal(
    report.semanticEvidenceTests.status,
    'not-run-without-authenticated-artifacts',
  )
  assert.equal(report.semanticEvidenceTests.caseRuns.length, 21)
  const case108Coverage = JSON.parse(
    gunzipSync(fs.readFileSync(CASE_108_COVERAGE)),
  )
  const case108ReferencedEvidenceIds = new Set(
    case108Coverage.rows.flatMap(row => row.evidenceIds ?? []),
  )
  const case108ReferencedSemanticTestPaths = [
    ...new Set(
      case108Coverage.evidence
        .filter(
          evidence =>
            evidence.kind === 'semantic-test' &&
            case108ReferencedEvidenceIds.has(evidence.id),
        )
        .map(evidence => evidence.path),
    ),
  ].sort()
  const case108Run = report.semanticEvidenceTests.caseRuns.find(
    run => run.case === '2.1.107-to-2.1.108',
  )
  assert.ok(case108Run)
  assert.deepEqual(case108Run.files, case108ReferencedSemanticTestPaths)
  for (const unusedTarget111Test of [
    'recovery/test/recovery-2.1.111-runtime-repairs.test.mjs',
    'recovery/test/recovery-2.1.111-ui-platform.test.mjs',
    'recovery/test/recovery-2.1.111-ultrareview.test.mjs',
  ]) {
    assert.equal(case108Run.files.includes(unusedTarget111Test), false)
  }
  assert.equal(
    report.currentSourceSemanticEvidenceTests.status,
    'not-run-without-authenticated-artifacts',
  )
  assert.ok(report.currentSourceSemanticEvidenceTests.files.length > 0)
  assert.equal(report.currentSourceSemanticOwnerSyntax.status, 'passed')
  assert.ok(report.currentSourceSemanticOwnerSyntax.files.length > 0)
  assert.equal(report.results.length, 21)
  for (const entry of report.results) assertSemanticCase(entry)
})

test('a selected case still verifies its full semantic ancestry', () => {
  let result = invoke(['--case', FIRST_CASE])
  assert.equal(result.status, 0, result.stderr)
  let report = JSON.parse(result.stdout)
  assert.equal(report.cases, 1)
  assert.equal(report.ancestryCasesVerified, 1)
  assert.equal(report.ancestryFirstPartySemanticCoverageClaims, 1)
  assert.equal(report.results[0].case, '2.1.88-to-2.1.89')
  assertSemanticCase(report.results[0])

  result = invoke(['--case', FINAL_CASE])
  assert.equal(result.status, 0, result.stderr)
  report = JSON.parse(result.stdout)
  assert.equal(report.cases, 1)
  assert.equal(report.ancestryCasesVerified, 21)
  assert.equal(report.ancestryFirstPartySemanticCoverageClaims, 21)
  assert.equal(report.ancestryFirstPartySemanticEquivalentFromSource, 0)
  assert.equal(report.ancestryWholeBundleSemanticEquivalentFromSource, 0)
  assert.equal(report.ancestrySourceRuntimeGaps, 0)
  assert.ok(report.ancestryDependencyRuntimeGaps > 0)
  assert.equal(report.ancestryMissingHermeticBuildInputCases, 21)
  assert.equal(
    report.currentSourceSemanticEvidenceTests.status,
    'not-run-without-authenticated-artifacts',
  )
  assert.equal(report.results[0].case, '2.1.114-to-2.1.116')
  assertSemanticCase(report.results[0])
})

test('whole-bundle source equivalence fails closed while build inputs are missing', () => {
  const result = invoke(['--case', FIRST_CASE, '--require-exact-source'])
  assert.notEqual(result.status, 0)
  assert.match(
    result.stderr,
    /whole-bundle semantic source equivalence required.*build-input gaps remain/i,
  )
})

test('retired semantic owners require a later pinned deletion and current absence', () => {
  const fixture = retiredOwnerFixture()
  try {
    assert.deepEqual(
      validateRetiredOwner({
        caseName: fixture.caseName,
        introductionSupplement: undefined,
        owner: fixture.owner,
        repositoryRoot: fixture.root,
      }),
      {
        case: fixture.owner.retiredInCase,
        mode: 'pinned-source-overlay-deletion',
        path: 'recovered/source-facing-overlay.patch',
        targetCommit: fixture.targetCommit,
      },
    )

    assert.throws(
      () => validateRetiredOwner({
        caseName: fixture.caseName,
        introductionSupplement: undefined,
        owner: { ...fixture.owner, retiredInCase: fixture.caseName },
        repositoryRoot: fixture.root,
      }),
      /retirement case must follow the owner case/,
    )

    fixture.writeManifest(fixture.deletion, fixture.baseCommit)
    assert.throws(
      () => validateRetiredOwner({
        caseName: fixture.caseName,
        introductionSupplement: undefined,
        owner: fixture.owner,
        repositoryRoot: fixture.root,
      }),
      /owner still exists in retirement target/,
    )

    fixture.writeManifest(fixture.deletion)
    fs.mkdirSync(path.dirname(fixture.ownerFilename), { recursive: true })
    fs.writeFileSync(fixture.ownerFilename, 'export const returned = true\n')
    assert.throws(
      () => validateRetiredOwner({
        caseName: fixture.caseName,
        introductionSupplement: undefined,
        owner: fixture.owner,
        repositoryRoot: fixture.root,
      }),
      /retired owner still exists in current src/,
    )
    fs.rmSync(fixture.ownerFilename)

    fixture.writeManifest(
      fixture.deletion.replaceAll('HistoricalOwner.tsx', 'DifferentOwner.tsx'),
    )
    assert.throws(
      () => validateRetiredOwner({
        caseName: fixture.caseName,
        introductionSupplement: undefined,
        owner: fixture.owner,
        repositoryRoot: fixture.root,
      }),
      /no pinned deletion or semantic introduction proof/,
    )

    const introductionFilename = path.join(fixture.root, 'semantic-introduction.patch')
    const introduction = [
      `diff --git a/${fixture.owner.path} b/${fixture.owner.path}`,
      'new file mode 100644',
      'index 0000000..1111111',
      '--- /dev/null',
      `+++ b/${fixture.owner.path}`,
      '@@ -0,0 +1 @@',
      '+export const historicalOwner = true',
      '',
    ].join('\n')
    fs.writeFileSync(introductionFilename, introduction)
    assert.deepEqual(
      validateRetiredOwner({
        caseName: fixture.caseName,
        introductionSupplement: {
          case: fixture.caseName,
          filename: introductionFilename,
          path: 'semantic-introduction.patch',
        },
        owner: fixture.owner,
        repositoryRoot: fixture.root,
      }),
      {
        case: fixture.owner.retiredInCase,
        mode: 'pinned-supplement-introduction-and-later-target-absence',
        path: 'semantic-introduction.patch',
        targetCommit: fixture.targetCommit,
      },
    )

    fs.writeFileSync(
      introductionFilename,
      introduction.replace('\nnew file mode 100644', '\nindex 1111111..2222222 100644'),
    )
    assert.throws(
      () => validateRetiredOwner({
        caseName: fixture.caseName,
        introductionSupplement: {
          case: fixture.caseName,
          filename: introductionFilename,
          path: 'semantic-introduction.patch',
        },
        owner: fixture.owner,
        repositoryRoot: fixture.root,
      }),
      /introduction patch does not create owner/,
    )
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('rejects an omitted case or an unsupported inventory status', () => {
  let fixture = temporaryInventory(inventory => {
    inventory.cases.pop()
  })
  try {
    let result = invoke(['--ledger', fixture.filename])
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /inventory differs from case chain/i)
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }

  fixture = temporaryInventory(inventory => {
    inventory.cases[0].status = 'assumed-covered'
  })
  try {
    const result = invoke(['--ledger', fixture.filename])
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /invalid inventory status/i)
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})
