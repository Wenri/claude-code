#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const defaultRepo = fileURLToPath(new URL('../..', import.meta.url))
const fullDiffCheckDiagnostic =
  'recovery/cases/2.1.121-to-2.1.122/evidence/CHANGELOG-2.1.122.md:21: new blank line at EOF.'
const fullDiffCheckSha256 =
  '1075939c016a1591ae25d94a2c587ba8e2fa151b05326ee93197f55584393902'
function expectedTestsForRepo(repo) {
  return fs
    .readdirSync(path.join(repo, 'recovery/test'))
    .filter(name => /^recovery-2\.1\.122-.*\.test\.mjs$/.test(name))
    .map(name => `recovery/test/${name}`)
    .sort()
}

function expectedTestAssertionsForRepo(repo) {
  return [...expectedTestsForRepo(repo), 'src/utils/messageOperations.ts'].sort()
}

function parseArguments(argv) {
  const result = {}
  const allowed = new Set(['artifacts', 'baseline-tarball', 'case', 'repo'])
  for (let index = 0; index < argv.length; index += 2) {
    const argument = argv[index]
    const value = argv[index + 1]
    if (!argument?.startsWith('--') || !allowed.has(argument.slice(2))) {
      throw new Error(`unknown argument: ${argument}`)
    }
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`missing value for ${argument}`)
    }
    const key = argument.slice(2)
    if (result[key] !== undefined) throw new Error(`duplicate ${argument}`)
    result[key] = value
  }
  return result
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function readPinned(root, metadata, label) {
  assert(metadata.path.startsWith('semantic/'), `${label}: unsafe path`)
  const value = fs.readFileSync(path.join(root, metadata.path))
  assert(value.length === metadata.bytes, `${label}: byte length`)
  assert(sha256(value) === metadata.sha256, `${label}: SHA-256`)
  return JSON.parse(value)
}

function main() {
  const args = parseArguments(process.argv.slice(2))
  if (!args.artifacts || !args['baseline-tarball']) {
    throw new Error(
      'Usage: verify-2.1.122-recovery.mjs --artifacts DIR ' +
        '--baseline-tarball FILE [--case manifest.json] [--repo DIR]',
    )
  }
  const repo = path.resolve(args.repo ?? defaultRepo)
  const expectedTests = expectedTestsForRepo(repo)
  const expectedTestAssertions = expectedTestAssertionsForRepo(repo)
  const manifestPath = path.resolve(
    args.case ??
      path.join(
        repo,
        'recovery/cases/2.1.121-to-2.1.122/manifest.json',
      ),
  )
  const caseRoot = path.dirname(manifestPath)
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  assert(manifest.schemaVersion === 4, 'manifest schema')
  assert(manifest.case === '2.1.121-to-2.1.122', 'case identity')
  assert(manifest.finalization?.status === 'complete', 'finalization status')
  assert(manifest.recoveryScope?.sourceClosurePending === false, 'source closure')
  assert(
    manifest.recoveryScope?.semanticClosurePending === false,
    'semantic closure',
  )

  const semantic = manifest.generatedRecovery?.semanticCorrespondence
  assert(
    semantic?.status === 'verified-zero-unclassified-zero-unverified',
    'semantic status',
  )
  const direct = readPinned(
    caseRoot,
    semantic.fileIdentities.directEvidence,
    'direct evidence',
  )
  const summary = readPinned(
    caseRoot,
    semantic.fileIdentities.summary,
    'semantic summary',
  )
  assert(direct.rowCount === direct.rows.length, 'direct row count')
  assert(new Set(direct.rows.map(row => row.id)).size === direct.rowCount, 'row IDs')
  assert(direct.categoryCounts.official === 18, 'official 18')
  assert(direct.categoryCounts.hidden === 10, 'hidden H01-H10')
  assert(direct.categoryCounts.daemon > 0, 'daemon rows')
  assert(direct.categoryCounts.residual > 0, 'finite residual rows')
  assert(
    direct.rows.every(
      row => row.evidenceKind === 'reviewed-row-scoped-direct-evidence',
    ),
    'every row must use direct evidence',
  )
  assert(
    summary.coverage.unclassifiedTokens === 0 &&
      summary.coverage.accountedTokens === summary.coverage.targetTokens,
    'whole-bundle token closure',
  )
  assert(
    summary.coverage.obligations.releaseBulletsCovered === 18 &&
      summary.coverage.obligations.releaseBulletCount === 18,
    'official bullet closure',
  )
  assert(
    summary.coverage.obligations.unverifiedObligationCount === 0,
    'unverified obligation closure',
  )
  assert(
    summary.coverage.obligations.obligationCount === direct.rowCount,
    'obligation/direct row bijection',
  )
  assert(
    summary.coverage.obligations.testCatalogEntries ===
      summary.coverage.obligations.usedTestCatalogEntries,
    'all focused tests consumed',
  )

  assert(
    JSON.stringify(manifest.sourceLineage.testFiles) ===
      JSON.stringify(expectedTests),
    'exact source-lineage semantic tests',
  )
  assert(
    JSON.stringify(
      manifest.sourceLineage.testFileAssertions.map(entry => entry.path),
    ) === JSON.stringify(expectedTestAssertions),
    'exact source-lineage test assertions and direct dependencies',
  )
  assert(
    manifest.sourceLineage.testArtifactEnvironment
      .CLAUDE_CODE_2_1_121_WRAPPER === 'baselineBundle' &&
      manifest.sourceLineage.testArtifactEnvironment
        .CLAUDE_CODE_2_1_122_WRAPPER === 'targetBundle',
    'Fleet wrapper artifact environment',
  )
  const sourceIdentity = JSON.parse(
    fs.readFileSync(path.join(caseRoot, manifest.sourceFreeze.identity), 'utf8'),
  )
  assert(
    sha256(
      fs.readFileSync(path.join(caseRoot, manifest.sourceFreeze.identity)),
    ) === manifest.sourceFreeze.identitySha256,
    'source-freeze identity SHA-256',
  )
  assert(
    sourceIdentity.target.srcTree === manifest.sourceLineage.targetSrcGitTree,
    'source target Git tree',
  )
  assert(
    sourceIdentity.verification.targetTests.failed === 0,
    'frozen target tests',
  )
  assert(
    /^[a-f0-9]{40}$/.test(sourceIdentity.base.commit) &&
      /^[a-f0-9]{40}$/.test(sourceIdentity.target.commit),
    'source-freeze commit identities',
  )
  const expectedDiffCheck = {
    scope: 'full-target-tree',
    sourceDiagnosticLines: 0,
    diagnosticLines: 1,
    sha256: fullDiffCheckSha256,
    reviewed: true,
  }
  assert(
    JSON.stringify(sourceIdentity.verification.diffCheck) ===
      JSON.stringify(expectedDiffCheck),
    'source-freeze full-tree diff-check identity',
  )
  assert(
    JSON.stringify(manifest.sourceFreeze.diffCheck) ===
      JSON.stringify({
        ...expectedDiffCheck,
        diagnostic: fullDiffCheckDiagnostic,
        rawOutput: 'recovered/source-freeze/diff-check.raw.txt',
        allowlist: 'recovered/source-freeze/diff-check-allowlist.txt',
      }),
    'manifest full-tree diff-check allowlist',
  )
  assert(
    fs.readFileSync(
      path.join(caseRoot, manifest.sourceFreeze.diffCheck.rawOutput),
      'utf8',
    ) === `${fullDiffCheckDiagnostic}\n`,
    'frozen full-tree diff-check diagnostic',
  )
  const runDiffCheck = extraArguments => {
    const result = spawnSync(
      'git',
      [
        'diff',
        '--check',
        sourceIdentity.base.commit,
        sourceIdentity.target.commit,
        ...extraArguments,
      ],
      { cwd: repo, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
    )
    if (result.error) throw result.error
    return {
      status: result.status,
      output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    }
  }
  const fullDiffCheck = runDiffCheck([])
  assert(fullDiffCheck.status === 2, 'full-tree git diff --check status')
  assert(
    fullDiffCheck.output === `${fullDiffCheckDiagnostic}\n` &&
      sha256(Buffer.from(fullDiffCheck.output)) === fullDiffCheckSha256,
    'full-tree git diff --check exact allowlist',
  )
  const sourceDiffCheck = runDiffCheck(['--', 'src'])
  assert(
    sourceDiffCheck.status === 0 && sourceDiffCheck.output === '',
    'source-only git diff --check must be clean',
  )

  const complete = spawnSync(
    process.execPath,
    [
      path.join(repo, 'recovery/scripts/verify-complete-recovery.mjs'),
      '--case',
      manifestPath,
      '--artifacts',
      path.resolve(args.artifacts),
      '--baseline-tarball',
      path.resolve(args['baseline-tarball']),
      '--repo',
      repo,
    ],
    { cwd: repo, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
  )
  if (complete.error) throw complete.error
  if (complete.status !== 0) {
    throw new Error(
      `complete verifier failed (${complete.status})\n` +
        `${complete.stdout ?? ''}${complete.stderr ?? ''}`,
    )
  }
  const result = JSON.parse(complete.stdout)
  assert(result.status === 'complete-recovery-verified', 'complete status')
  assert(
    result.checks.sourceSemanticReproduction ===
      'whole-bundle-source-semantics-verified',
    'source semantic reproduction',
  )
  assert(result.accounting.unaccountedTargetUtf16 === 0, 'UTF-16 closure')
  assert(
    result.accounting.unclassifiedSourceSemanticTokens === 0,
    'semantic token closure',
  )
  console.log(
    JSON.stringify(
      {
        status: '2.1.122-fail-closed-recovery-verified',
        completeRecovery: result.status,
        sourceSemanticReproduction:
          result.checks.sourceSemanticReproduction,
        directRows: direct.rowCount,
        categoryCounts: direct.categoryCounts,
        officialBullets: 18,
        unverifiedObligations: 0,
        unclassifiedTokens: 0,
        sourceTargetCommit: sourceIdentity.target.commit,
        sourceTargetTree: sourceIdentity.target.srcTree,
      },
      null,
      2,
    ),
  )
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
}
