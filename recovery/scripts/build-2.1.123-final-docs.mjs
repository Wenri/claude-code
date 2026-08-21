#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const caseRoot = path.join(repo, 'recovery/cases/2.1.122-to-2.1.123')
const fullDiffCheckDiagnostic =
  'recovery/cases/2.1.122-to-2.1.123/evidence/CHANGELOG-2.1.123.md:4: new blank line at EOF.'
const fullDiffCheckSha256 =
  '882ecc7f8d701a4c7f8cc3e6cfc1cb196ee8902f25d7b4f7b295279f8912d2af'

const draft = JSON.parse(
  fs.readFileSync(path.join(caseRoot, 'manifest.non-source-draft.json'), 'utf8'),
)
const direct = JSON.parse(
  fs.readFileSync(path.join(caseRoot, 'semantic/direct-evidence.json'), 'utf8'),
)
const summary = JSON.parse(
  fs.readFileSync(path.join(caseRoot, 'semantic/summary.json'), 'utf8'),
)
const identity = JSON.parse(
  fs.readFileSync(
    path.join(caseRoot, 'recovered/source-freeze/identity.json'),
    'utf8',
  ),
)
const lineage = JSON.parse(
  fs.readFileSync(
    path.join(caseRoot, 'recovered/source-lineage-core.json'),
    'utf8',
  ),
)
const structural = draft.generatedRecovery.structural
const expectedKnownDeltaClosure = {
  targetUnits: 22_302,
  targetTokens: 4_394_501,
  changedUnits: 0,
  movedUnits: 0,
  unresolvedUnits: 0,
  changedTokens: 0,
  movedTokens: 0,
  unresolvedTokens: 0,
  unmatchedBaselineUnits: 0,
  unresolvedTargetUnits: 0,
}
if (
  JSON.stringify(structural.knownDeltaClosure) !==
    JSON.stringify(expectedKnownDeltaClosure) ||
  structural.rawLedger?.path !== 'structural/generated-delta.json.gz' ||
  structural.metadataNormalizedLedger?.path !==
    'structural/metadata-normalized-delta.json.gz' ||
  structural.knownDeltaExactLedger?.path !==
    'structural/known-delta-ledger.json.gz' ||
  structural.knownDeltaProof?.path !== 'structural/known-delta-proof.json'
) {
  throw new Error('known-delta structural proof is not exactly sealed')
}
if (
  identity.verification.diffCheck.scope !== 'full-target-tree' ||
  identity.verification.diffCheck.sourceDiagnosticLines !== 0 ||
  identity.verification.diffCheck.diagnosticLines !== 1 ||
  identity.verification.diffCheck.sha256 !== fullDiffCheckSha256 ||
  identity.verification.diffCheck.reviewed !== true
) {
  throw new Error('unexpected full-tree diff-check allowlist identity')
}
if (
  fs.readFileSync(
    path.join(caseRoot, 'recovered/source-freeze/diff-check.raw.txt'),
    'utf8',
  ) !== `${fullDiffCheckDiagnostic}\n`
) {
  throw new Error('unexpected full-tree diff-check diagnostic')
}

function artifact(id) {
  const value = draft.artifacts.find(entry => entry.id === id)
  if (!value) throw new Error(`missing artifact: ${id}`)
  return value
}

function number(value) {
  return value.toLocaleString('en-US')
}

function write(relative, contents) {
  const filename = path.join(caseRoot, relative)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, contents)
}

const baselineBundle = artifact('baselineBundle')
const targetBundle = artifact('targetBundle')
const baselineInner = artifact('baselineAnalyzableBundle')
const targetInner = artifact('targetAnalyzableBundle')
const coverage = summary.coverage
const obligations = coverage.obligations
const categories = Object.entries(direct.categoryCounts)
  .map(([category, count]) => `${category} ${count}`)
  .join(', ')
const shellContinuation = ` ${String.fromCharCode(92)}`
const focusedTestCommand = lineage.testFiles
  .map(
    (relative, index) =>
      `  ${relative}${index === lineage.testFiles.length - 1 ? '' : shellContinuation}`,
  )
  .join('\n')

const report = `# Claude Code 2.1.123 recovery report

The Linux x64 2.1.123 published package and embedded JavaScript graph are reconstructed exactly, and the recovered source tree reproduces the authenticated bundle semantics under a fail-closed correspondence proof. This does not claim byte-identical upstream authored TypeScript: the public artifact exposes generated code, so source recovery is an equivalent, reviewable overlay.

## Exact artifact closure

- 2.1.122 wrapper: ${number(baselineBundle.bytes)} bytes, SHA-256 \`${baselineBundle.sha256}\`.
- 2.1.123 wrapper: ${number(targetBundle.bytes)} bytes, SHA-256 \`${targetBundle.sha256}\`.
- 2.1.122 analyzable interior: ${number(baselineInner.bytes)} bytes, SHA-256 \`${baselineInner.sha256}\`.
- 2.1.123 analyzable interior: ${number(targetInner.bytes)} bytes, SHA-256 \`${targetInner.sha256}\`.
- The exact wrapper delta is \`diff/cli.js.zstd-delta\`; package-member and embedded-module reconstruction are independently asserted in \`manifest.json\`.
- Generated-offset attribution accounts for all ${number(draft.generatedRecovery.attribution.targetUtf16)} target UTF-16 units in ${number(draft.generatedRecovery.attribution.targetRangeCount)} ranges, with zero unaccounted units.
- The structural ledger accounts for all ${number(coverage.targetTokens)} target tokens across ${number(coverage.regions)} regions, with zero unclassified tokens.
- The deterministic known-delta proof closes all ${number(structural.knownDeltaClosure.targetUnits)} target structural units and ${number(structural.knownDeltaClosure.targetTokens)} target tokens with zero changed, moved, unresolved, unmatched-baseline, or unresolved-target residue. Its exact inputs are \`${structural.metadataNormalizedLedger.path}\` and \`${structural.knownDeltaExactLedger.path}\`; \`${structural.knownDeltaProof.path}\` pins their byte lengths and SHA-256 identities.

## Semantic closure

The row-scoped direct catalog contains exactly one official obligation (${categories}). It covers the single 2.1.123 changelog bullet exactly once; the reviewed adjacent delta has no additional hidden, daemon, or residual semantic rows.

- Bundle witnesses: ${number(obligations.fragmentCount)} fragments and ${number(obligations.targetAbsenceCount)} explicit target absences.
- Source witnesses: ${number(obligations.sourceAssertionCount)} exact assertions, ${number(obligations.sourceRemovalCount)} path-scoped fragment removals, and ${number(obligations.sourceFileAbsenceCount)} authenticated deleted-file identities.
- Classifications: ${Object.entries(obligations.classifications)
  .map(([name, count]) => `${name} ${count}`)
  .join(', ')}.
- Test catalog: ${obligations.usedTestCatalogEntries}/${obligations.testCatalogEntries} entries consumed.
- Unverified obligations: ${obligations.unverifiedObligationCount}.
- Unclassified target tokens: ${coverage.unclassifiedTokens}.

Every obligation binds one unique row from \`semantic/direct-evidence.json\`. The direct test pins the catalog byte length and SHA-256, then checks exact counts in both authenticated adjacent bundles and exact hashes/counts in the recovered source. All ${lineage.testFiles.length} frozen source-lineage suites are executed and consumed by the semantic proof.

## Source freeze

The incremental overlay is frozen from \`${identity.base.commit}\` to \`${identity.target.commit}\`.

- Target src Git tree: \`${identity.target.srcTree}\`.
- Overlay: ${number(identity.overlay.bytes)} bytes, SHA-256 \`${identity.overlay.sha256}\`.
- Changed source paths: ${identity.overlay.changedPaths}; ${number(identity.overlay.insertions)} insertions and ${number(identity.overlay.deletions)} deletions.
- Frozen source tree: ${number(identity.source.files)} files, ${number(identity.source.bytes)} bytes, zero symlinks.
- Authenticated target tests: ${identity.verification.targetTests.passed}/${identity.verification.targetTests.tests} passed across ${identity.verification.targetTests.files} files.
- Syntax builds: ${identity.verification.syntaxBuilds.passed} passed, ${identity.verification.syntaxBuilds.failed} failed.
- Source-only \`git diff --check\`: ${identity.verification.diffCheck.sourceDiagnosticLines} diagnostics.
- Full-tree \`git diff --check\`: exactly ${identity.verification.diffCheck.diagnosticLines} reviewed acquisition-metadata diagnostic, SHA-256 \`${identity.verification.diffCheck.sha256}\`: \`${fullDiffCheckDiagnostic}\`.
- Forward apply, complete byte comparison, reverse apply, and forward reconstruction all succeeded.

## Claim boundary

The exact claim covers the published Linux x64 package, wrapper, analyzable bundle, embedded plain-JavaScript graph, generated accounting, and recovery payloads. The equivalent-source claim covers the frozen \`src\` overlay plus authenticated semantic tests. Platform-native behavior not present in the Linux x64 artifact and original upstream TypeScript spelling are outside the claim.

Run \`RECOVERY_RUNBOOK.md\` for the single complete verifier and focused reproduction commands.
`

const semanticReadme = `# 2.1.123 semantic correspondence

This directory binds the authenticated 2.1.122→2.1.123 generated bundle to the recovered source tree without treating a suite-level ledger as row evidence.

- \`direct-evidence.json\`: ${direct.rowCount} reviewed, row-scoped evidence records (${categories}).
- \`obligations.json\`: one obligation per direct row, all catalog-bound and source-localized.
- \`semantic-correspondence.json.gz\`: canonical whole-bundle ownership and obligation report.
- \`summary.json\`: deterministic public summary and identities.

The direct catalog authenticates exact adjacent-bundle fragment counts, exact source fragment hashes/counts, path-scoped fragment removals, and deleted source files against their base identities. Each direct row is consumed exactly once. The catalog identity is itself pinned and loaded by \`recovery-2.1.123-direct-evidence.test.mjs\`; every other release-scoped focused suite is frozen and consumed by at least one row.

Closure invariants:

- target tokens: ${number(coverage.targetTokens)}
- accounted tokens: ${number(coverage.accountedTokens)}
- unclassified tokens: ${coverage.unclassifiedTokens}
- official bullets covered: ${obligations.releaseBulletsCovered}/${obligations.releaseBulletCount}
- obligations: ${obligations.obligationCount}
- unverified obligations: ${obligations.unverifiedObligationCount}
- unresolved application source owners: ${summary.sourceOwnership.unresolvedApplication}

The report proves semantic reproduction, not recovery of original authored spelling.
`

const runbook = `# Claude Code 2.1.123 recovery runbook

Run commands from the repository root. Set \`ARTIFACTS\` to the directory containing the paths recorded in \`manifest.json\`, and \`BASELINE_TARBALL\` to the authenticated 2.1.122 npm tarball.

## Install pinned verifier dependencies

\`\`\`sh
pixi run npm --prefix recovery ci --ignore-scripts
\`\`\`

This installs only the exact dependency graph pinned by \`recovery/package-lock.json\`; lifecycle scripts stay disabled.

## Complete verification

\`\`\`sh
pixi run node recovery/scripts/verify-2.1.123-recovery.mjs \\
  --case recovery/cases/2.1.122-to-2.1.123/manifest.json \\
  --artifacts "$ARTIFACTS" \\
  --baseline-tarball "$BASELINE_TARBALL" \\
  --repo .
\`\`\`

This one command re-authenticates all artifact identities, exact deltas, Bun extraction, generated attribution, all three structural ledgers, the deterministic known-delta proof, readable diff, source overlay round trip, all ${lineage.testFiles.length} semantic test files, semantic correspondence, embedded-code reconstruction, and exact package reconstruction. It must report zero changed, moved, or unresolved known-delta residue, zero unclassified tokens, and zero unverified obligations.

## Focused semantic verification

\`\`\`sh
CLAUDE_CODE_2_1_122_BUNDLE="$ARTIFACTS/${baselineInner.localPath}" \\
CLAUDE_CODE_2_1_123_BUNDLE="$ARTIFACTS/${targetInner.localPath}" \\
CLAUDE_21122_INNER="$ARTIFACTS/${baselineInner.localPath}" \\
CLAUDE_21123_INNER="$ARTIFACTS/${targetInner.localPath}" \\
CLAUDE_2_1_122_CLI_INNER="$ARTIFACTS/${baselineInner.localPath}" \\
CLAUDE_2_1_123_CLI_INNER="$ARTIFACTS/${targetInner.localPath}" \\
CLAUDE_CODE_2_1_122_WRAPPER="$ARTIFACTS/${baselineBundle.localPath}" \\
CLAUDE_CODE_2_1_123_WRAPPER="$ARTIFACTS/${targetBundle.localPath}" \\
pixi run node --test \\
${focusedTestCommand}
\`\`\`

Expected frozen result: ${identity.verification.targetTests.tests} tests, ${identity.verification.targetTests.passed} passed, ${identity.verification.targetTests.failed} failed.

## Rebuild and verify the zero-residue known delta

\`\`\`sh
pixi run node recovery/scripts/verify-2.1.123-semantic-delta.mjs \\
  --baseline "$ARTIFACTS/${baselineInner.localPath}" \\
  --target "$ARTIFACTS/${targetInner.localPath}" \\
  --output recovery/cases/2.1.122-to-2.1.123
\`\`\`

The rebuilt exact ledger must retain ${number(structural.knownDeltaClosure.targetUnits)} matched units and ${number(structural.knownDeltaClosure.targetTokens)} matched tokens, with zero changed, moved, unresolved, unmatched-baseline, or unresolved-target residue.

## Rebuild and verify semantic correspondence

\`\`\`sh
pixi run node recovery/scripts/build-2.1.123-semantic-obligations.mjs
pixi run node recovery/scripts/build-semantic-correspondence.mjs \\
  --attribution recovery/cases/2.1.122-to-2.1.123/attribution \\
  --structural recovery/cases/2.1.122-to-2.1.123/structural/generated-delta.json.gz \\
  --obligations recovery/cases/2.1.122-to-2.1.123/semantic/obligations.json \\
  --source-root src \\
  --changelog recovery/cases/2.1.122-to-2.1.123/evidence/CHANGELOG-2.1.123.md \\
  --baseline "$ARTIFACTS/${baselineInner.localPath}" \\
  --target "$ARTIFACTS/${targetInner.localPath}" \\
  --output recovery/cases/2.1.122-to-2.1.123/semantic/semantic-correspondence.json.gz \\
  --summary recovery/cases/2.1.122-to-2.1.123/semantic/summary.json
\`\`\`

The rebuilt summary must retain ${number(coverage.accountedTokens)}/${number(coverage.targetTokens)} accounted tokens, ${obligations.releaseBulletsCovered}/${obligations.releaseBulletCount} official bullets, ${obligations.obligationCount} obligation, zero unclassified tokens, and zero unverified obligations.

## Overlay identity

The frozen overlay \`recovered/source-facing-overlay.patch\` reverses the current \`src\` tree to \`${identity.base.commit}\` and reapplies to the exact target src tree \`${identity.target.srcTree}\`. \`recovered/source-freeze/SHA256SUMS\`, \`identity.json\`, and \`source-files.sha256\` pin every handoff identity. The source-lineage verifier repeats both directions and a complete per-file byte comparison; do not substitute a different base or target commit.

Source-only \`git diff --check\` must be empty. The full target tree has exactly one reviewed acquisition-metadata diagnostic: \`${fullDiffCheckDiagnostic}\`. Its exact output SHA-256 is \`${fullDiffCheckSha256}\`; \`diff-check.raw.txt\` and \`diff-check-allowlist.txt\` pin it. The freeze builder requires \`--allow-diff-check-sha256 ${fullDiffCheckSha256}\` and rejects any additional or changed diagnostic.

Target source files: ${lineage.target.files}; target source manifest SHA-256: \`${lineage.target.manifestSha256}\`.
`

write('REPORT.md', report)
write('semantic/README.md', semanticReadme)
write('RECOVERY_RUNBOOK.md', runbook)
console.log(
  JSON.stringify({
    status: '2.1.123-final-docs-built',
    obligations: obligations.obligationCount,
    unclassifiedTokens: coverage.unclassifiedTokens,
    unverifiedObligations: obligations.unverifiedObligationCount,
    sourceTargetCommit: identity.target.commit,
  }),
)
