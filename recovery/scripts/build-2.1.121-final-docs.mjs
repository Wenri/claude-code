#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const caseRoot = path.join(repo, 'recovery/cases/2.1.120-to-2.1.121')
const fullDiffCheckDiagnostic =
  'recovery/cases/2.1.120-to-2.1.121/evidence/CHANGELOG-2.1.121.md:42: new blank line at EOF.'
const fullDiffCheckSha256 =
  'a45849856c08d527991e52348d5991ffb9ca17f9fc0d55e4acd4ab7246726b22'

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
const frozenTestFileCount = lineage.testFiles.length
const semanticCoreTestCount = obligations.testCatalogEntries
const semanticCoreUnconsumed =
  semanticCoreTestCount - obligations.usedTestCatalogEntries
const frozenTestSummary = identity.verification.targetTests
if (
  frozenTestFileCount !== 103 ||
  frozenTestSummary.files !== frozenTestFileCount
) {
  throw new Error('expected exactly 103 frozen release-scoped test files')
}
if (
  semanticCoreTestCount !== 33 ||
  obligations.usedTestCatalogEntries !== semanticCoreTestCount
) {
  throw new Error('expected a fully consumed 33-entry semantic-core catalog')
}
for (const field of ['tests', 'passed', 'failed', 'skipped']) {
  if (!Number.isSafeInteger(frozenTestSummary[field])) {
    throw new Error(`invalid frozen test ${field} count`)
  }
}
if (
  frozenTestSummary.passed +
    frozenTestSummary.failed +
    frozenTestSummary.skipped !==
  frozenTestSummary.tests
) {
  throw new Error('frozen test result counts do not close exactly')
}
const categories = Object.entries(direct.categoryCounts)
  .map(([category, count]) => `${category} ${count}`)
  .join(', ')

const report = `# Claude Code 2.1.121 recovery report

The Linux x64 2.1.121 published package and embedded JavaScript graph are reconstructed exactly, and the recovered source tree reproduces the authenticated bundle semantics under a fail-closed correspondence proof. This does not claim byte-identical upstream authored TypeScript: the public artifact exposes generated code, so source recovery is an equivalent, reviewable overlay.

## Exact artifact closure

- 2.1.120 wrapper: ${number(baselineBundle.bytes)} bytes, SHA-256 \`${baselineBundle.sha256}\`.
- 2.1.121 wrapper: ${number(targetBundle.bytes)} bytes, SHA-256 \`${targetBundle.sha256}\`.
- 2.1.120 analyzable interior: ${number(baselineInner.bytes)} bytes, SHA-256 \`${baselineInner.sha256}\`.
- 2.1.121 analyzable interior: ${number(targetInner.bytes)} bytes, SHA-256 \`${targetInner.sha256}\`.
- The exact wrapper delta is \`diff/cli.js.zstd-delta\`; package-member and embedded-module reconstruction are independently asserted in \`manifest.json\`.
- Generated-offset attribution accounts for all ${number(draft.generatedRecovery.attribution.targetUtf16)} target UTF-16 units in ${number(draft.generatedRecovery.attribution.targetRangeCount)} ranges, with zero unaccounted units.
- The structural ledger accounts for all ${number(coverage.targetTokens)} target tokens across ${number(coverage.regions)} regions, with zero unclassified tokens.

## Semantic closure

The row-scoped direct catalog contains ${direct.rowCount} obligations (${categories}). It covers all 39 official changelog bullets exactly once, H01-H13, the daemon/background lifecycle, and every finite residual source cluster.

- Bundle witnesses: ${number(obligations.fragmentCount)} fragments and ${number(obligations.targetAbsenceCount)} explicit target absences.
- Source witnesses: ${number(obligations.sourceAssertionCount)} exact assertions and ${number(obligations.sourceRemovalCount)} path-scoped removals.
- Classifications: ${Object.entries(obligations.classifications)
  .map(([name, count]) => `${name} ${count}`)
  .join(', ')}.
- Semantic-core test catalog: ${obligations.usedTestCatalogEntries}/${semanticCoreTestCount} entries consumed.
- Unverified obligations: ${obligations.unverifiedObligationCount}.
- Unclassified target tokens: ${coverage.unclassifiedTokens}.

Every obligation binds one unique row from \`semantic/direct-evidence.json\`. The direct test pins the catalog byte length and SHA-256, then checks exact counts in both authenticated adjacent bundles and exact hashes/counts in the recovered source. The frozen execution set contains ${frozenTestFileCount} release-scoped suites. The semantic proof has a separate ${semanticCoreTestCount}-entry core catalog, all consumed; the other ${frozenTestFileCount - semanticCoreTestCount} suites are frozen and executed as release regression coverage rather than represented as row-catalog entries.

## Source freeze

The incremental overlay is frozen from \`${identity.base.commit}\` to \`${identity.target.commit}\`.

- Target src Git tree: \`${identity.target.srcTree}\`.
- Overlay: ${number(identity.overlay.bytes)} bytes, SHA-256 \`${identity.overlay.sha256}\`.
- Changed source paths: ${identity.overlay.changedPaths}; ${number(identity.overlay.insertions)} insertions and ${number(identity.overlay.deletions)} deletions.
- Frozen source tree: ${number(identity.source.files)} files, ${number(identity.source.bytes)} bytes, zero symlinks.
- Authenticated release tests: ${frozenTestSummary.passed}/${frozenTestSummary.tests} passed, ${frozenTestSummary.skipped} skipped, and ${frozenTestSummary.failed} failed across ${frozenTestSummary.files} frozen files.
- Syntax builds: ${identity.verification.syntaxBuilds.passed} passed, ${identity.verification.syntaxBuilds.failed} failed.
- Source-only \`git diff --check\`: ${identity.verification.diffCheck.sourceDiagnosticLines} diagnostics.
- Full-tree \`git diff --check\`: exactly ${identity.verification.diffCheck.diagnosticLines} reviewed acquisition-metadata diagnostic, SHA-256 \`${identity.verification.diffCheck.sha256}\`: \`${fullDiffCheckDiagnostic}\`.
- Forward apply, complete byte comparison, reverse apply, and forward reconstruction all succeeded.

## Claim boundary

The exact claim covers the published Linux x64 package, wrapper, analyzable bundle, embedded plain-JavaScript graph, generated accounting, and recovery payloads. The equivalent-source claim covers the frozen \`src\` overlay plus authenticated semantic tests. Platform-native behavior not present in the Linux x64 artifact and original upstream TypeScript spelling are outside the claim.

Run \`RECOVERY_RUNBOOK.md\` for the single complete verifier and focused reproduction commands.
`

const semanticReadme = `# 2.1.121 semantic correspondence

This directory binds the authenticated 2.1.120→2.1.121 generated bundle to the recovered source tree without treating a suite-level ledger as row evidence.

- \`direct-evidence.json\`: ${direct.rowCount} reviewed, row-scoped evidence records (${categories}).
- \`obligations.json\`: one obligation per direct row, all catalog-bound and source-localized.
- \`semantic-correspondence.json.gz\`: canonical whole-bundle ownership and obligation report.
- \`summary.json\`: deterministic public summary and identities.

The direct catalog authenticates exact adjacent-bundle fragment counts, exact source fragment hashes/counts, and path-scoped source removals. Each direct row is consumed exactly once. Its ${semanticCoreTestCount}-entry test catalog is fully consumed, and its identity is itself pinned and loaded by \`recovery-2.1.121-direct-evidence.test.mjs\`. The wider ${frozenTestFileCount}-suite release set is separately hash-pinned and executed; its additional ${frozenTestFileCount - semanticCoreTestCount} suites are regression coverage, not extra row-catalog entries.

Closure invariants:

- target tokens: ${number(coverage.targetTokens)}
- accounted tokens: ${number(coverage.accountedTokens)}
- unclassified tokens: ${coverage.unclassifiedTokens}
- official bullets covered: ${obligations.releaseBulletsCovered}/${obligations.releaseBulletCount}
- obligations: ${obligations.obligationCount}
- unverified obligations: ${obligations.unverifiedObligationCount}
- unconsumed semantic-core tests: ${semanticCoreUnconsumed}
- unresolved application source owners: ${summary.sourceOwnership.unresolvedApplication}

The report proves semantic reproduction, not recovery of original authored spelling.
`

const runbook = `# Claude Code 2.1.121 recovery runbook

Run commands from the repository root. Set \`ARTIFACTS\` to the directory containing the paths recorded in \`manifest.json\`, and \`BASELINE_TARBALL\` to the authenticated 2.1.120 npm tarball.

## Install pinned verifier dependencies

\`\`\`sh
pixi run npm --prefix recovery ci --ignore-scripts
\`\`\`

This installs only the exact dependency graph pinned by \`recovery/package-lock.json\`; lifecycle scripts stay disabled.

## Complete verification

\`\`\`sh
pixi run node recovery/scripts/verify-2.1.121-recovery.mjs \\
  --case recovery/cases/2.1.120-to-2.1.121/manifest.json \\
  --artifacts "$ARTIFACTS" \\
  --baseline-tarball "$BASELINE_TARBALL" \\
  --repo .
\`\`\`

This one command re-authenticates all artifact identities, exact deltas, Bun extraction, generated attribution, structural accounting, readable diff, source overlay round trip, all ${frozenTestFileCount} frozen release-scoped test files, the ${semanticCoreTestCount}-entry semantic-core catalog, semantic correspondence, embedded-code reconstruction, and exact package reconstruction. It must report zero unclassified tokens and zero unverified obligations.

## Frozen release-suite verification

\`\`\`sh
pixi run node recovery/scripts/verify-source-lineage.mjs \\
  --case recovery/cases/2.1.120-to-2.1.121/manifest.json \\
  --artifacts "$ARTIFACTS" \\
  --repo .
\`\`\`

This is the authoritative standalone release-suite command. It authenticates isolated baseline and target Git repositories, scrubs inherited behavior and source redirects, builds a real-file sandbox from the frozen runtime closure, materializes the authenticated bundle aliases and source trees, verifies and expands the case-contained audit inputs, and copies the exact Bun runtime closure and TypeScript tool before execution. It neither reads nor links a repository \`.recovery-tmp\` tree.

Expected frozen result: ${frozenTestSummary.tests} tests, ${frozenTestSummary.passed} passed, ${frozenTestSummary.skipped} skipped, ${frozenTestSummary.failed} failed across ${frozenTestFileCount} files. The ${semanticCoreTestCount}-entry semantic-core catalog is a strict subset of this execution set.

## Rebuild and verify semantic correspondence

\`\`\`sh
pixi run node recovery/scripts/build-2.1.121-semantic-obligations.mjs
pixi run node recovery/scripts/build-semantic-correspondence.mjs \\
  --attribution recovery/cases/2.1.120-to-2.1.121/attribution \\
  --structural recovery/cases/2.1.120-to-2.1.121/structural/generated-delta.json.gz \\
  --obligations recovery/cases/2.1.120-to-2.1.121/semantic/obligations.json \\
  --source-root src \\
  --changelog recovery/cases/2.1.120-to-2.1.121/evidence/CHANGELOG-2.1.121.md \\
  --baseline "$ARTIFACTS/${baselineInner.localPath}" \\
  --target "$ARTIFACTS/${targetInner.localPath}" \\
  --output recovery/cases/2.1.120-to-2.1.121/semantic/semantic-correspondence.json.gz \\
  --summary recovery/cases/2.1.120-to-2.1.121/semantic/summary.json
\`\`\`

The rebuilt summary must retain ${number(coverage.accountedTokens)}/${number(coverage.targetTokens)} accounted tokens, 39/39 official bullets, ${obligations.obligationCount} obligations, zero unclassified tokens, and zero unverified obligations.

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
    status: '2.1.121-final-docs-built',
    obligations: obligations.obligationCount,
    unclassifiedTokens: coverage.unclassifiedTokens,
    unverifiedObligations: obligations.unverifiedObligationCount,
    sourceTargetCommit: identity.target.commit,
  }),
)
