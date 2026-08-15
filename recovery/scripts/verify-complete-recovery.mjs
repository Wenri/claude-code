#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

function usage() {
  console.error(
    'Usage: verify-complete-recovery.mjs --case manifest.json ' +
      '--artifacts DIR --baseline-tarball FILE [--repo DIR]',
  )
}

function parseArguments(argv) {
  const result = {}
  const allowed = new Set([
    'artifacts',
    'baseline-tarball',
    'case',
    'repo',
  ])
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument.startsWith('--')) {
      throw new Error(`Unexpected argument: ${argument}`)
    }
    const key = argument.slice(2)
    if (!allowed.has(key)) throw new Error(`Unknown argument: ${argument}`)
    if (result[key] !== undefined) {
      throw new Error(`Duplicate argument: ${argument}`)
    }
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}`)
    }
    result[key] = value
    index += 1
  }
  return result
}

function safeRelative(root, relative, label) {
  const parts = relative.split('/')
  if (
    path.isAbsolute(relative) ||
    relative.includes('\\') ||
    parts.length === 0 ||
    parts.includes('') ||
    parts.includes('.') ||
    parts.includes('..')
  ) {
    throw new Error(`${label}: unsafe relative path ${relative}`)
  }
  const filename = path.resolve(root, ...parts)
  if (!filename.startsWith(`${path.resolve(root)}${path.sep}`)) {
    throw new Error(`${label}: path escaped root`)
  }
  return filename
}

function runJson(script, arguments_, repositoryRoot) {
  const result = spawnSync(process.execPath, [script, ...arguments_], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `${path.basename(script)} failed (${result.status})\n` +
        `${result.stdout ?? ''}${result.stderr ?? ''}`,
    )
  }
  try {
    return JSON.parse(result.stdout)
  } catch (error) {
    throw new Error(`${path.basename(script)} returned invalid JSON`, {
      cause: error,
    })
  }
}

function artifactPath(manifest, artifactsRoot, id) {
  const item = manifest.artifacts.find(artifact => artifact.id === id)
  if (!item) throw new Error(`Unknown artifact: ${id}`)
  return safeRelative(artifactsRoot, item.localPath, id)
}

function assertion(manifest, relative) {
  const result = manifest.generatedRecovery.fileAssertions.find(
    item => item.path === relative,
  )
  if (!result) throw new Error(`No generated assertion for ${relative}`)
  return result
}

function main() {
  const args = parseArguments(process.argv.slice(2))
  if (!args.case || !args.artifacts || !args['baseline-tarball']) {
    usage()
    process.exitCode = 2
    return
  }
  const manifestPath = path.resolve(args.case)
  const caseRoot = path.dirname(manifestPath)
  const repositoryRoot = args.repo
    ? path.resolve(args.repo)
    : path.resolve(caseRoot, '../../..')
  const artifactsRoot = path.resolve(args.artifacts)
  const toolingRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..',
  )
  const scripts = path.join(toolingRoot, 'recovery/scripts')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const baseline = artifactPath(manifest, artifactsRoot, 'baselineBundle')
  const target = artifactPath(manifest, artifactsRoot, 'targetBundle')
  const baselineEvidence = manifest.artifacts.find(
    item => item.id === 'baselineBundle',
  )
  const targetEvidence = manifest.artifacts.find(
    item => item.id === 'targetBundle',
  )
  const generated = manifest.generatedRecovery

  const evidenceFor = id => {
    const item = manifest.artifacts.find(artifact => artifact.id === id)
    if (!item) throw new Error(`Unknown artifact: ${id}`)
    return item
  }

  const evidence = runJson(
    path.join(scripts, 'verify-case.mjs'),
    [
      '--case',
      manifestPath,
      '--repo',
      repositoryRoot,
      '--artifacts',
      artifactsRoot,
    ],
    repositoryRoot,
  )
  const bunExtraction = generated.bunExtraction
    ? runJson(
        path.join(scripts, 'verify-bun-container.mjs'),
        [
          '--case',
          manifestPath,
          '--artifacts',
          artifactsRoot,
        ],
        repositoryRoot,
      )
    : null
  const sourcePatches = manifest.sourceLineage
    ? runJson(
        path.join(scripts, 'verify-source-lineage.mjs'),
        [
          '--case',
          manifestPath,
          '--repo',
          repositoryRoot,
          '--artifacts',
          artifactsRoot,
        ],
        repositoryRoot,
      )
    : runJson(
        path.join(scripts, 'verify-recovered-patches.mjs'),
        [
          '--case',
          manifestPath,
          '--artifacts',
          artifactsRoot,
          '--repo',
          repositoryRoot,
        ],
        repositoryRoot,
      )
  const sourceReproductionAudit = runJson(
    path.join(scripts, 'audit-source-reproduction.mjs'),
    [
      '--artifacts',
      artifactsRoot,
      '--case',
      manifestPath,
      '--repo',
      toolingRoot,
      '--ledger',
      path.join(toolingRoot, 'recovery/source-reproduction-gaps.json'),
    ],
    repositoryRoot,
  )
  const sourceReproduction = sourceReproductionAudit.results[0]
  const exactBundleDelta = runJson(
    path.join(scripts, 'build-exact-delta.mjs'),
    [
      '--baseline',
      baseline,
      '--target',
      target,
      '--output',
      safeRelative(caseRoot, generated.exactBundleDelta.path, 'bundle delta'),
      '--expected-baseline-sha256',
      baselineEvidence.sha256,
      '--expected-target-sha256',
      targetEvidence.sha256,
    ],
    repositoryRoot,
  )

  const attributionSummary = assertion(
    manifest,
    generated.attribution.summary,
  )
  const attributionBaselineArtifact =
    generated.attribution.baselineArtifact ?? 'baselineBundle'
  const attributionBaselineEvidence = manifest.artifacts.find(
    item => item.id === attributionBaselineArtifact,
  )
  if (!attributionBaselineEvidence) {
    throw new Error(
      `Unknown attribution baseline artifact: ${attributionBaselineArtifact}`,
    )
  }
  const attributionTargetEvidence = evidenceFor(
    generated.attribution.targetArtifact ?? 'targetBundle',
  )
  const attribution = runJson(
    path.join(scripts, 'verify-attribution-report.mjs'),
    [
      '--report',
      safeRelative(
        caseRoot,
        generated.attribution.directory,
        'attribution report',
      ),
      '--expected-summary-sha256',
      attributionSummary.sha256,
      '--expected-baseline-sha256',
      attributionBaselineEvidence.sha256,
      '--expected-target-sha256',
      attributionTargetEvidence.sha256,
    ],
    repositoryRoot,
  )

  const structuralAssertion = assertion(
    manifest,
    generated.structural.ledger,
  )
  const structuralBaselineEvidence = evidenceFor(
    generated.structural.baselineArtifact ?? 'baselineBundle',
  )
  const structuralTargetEvidence = evidenceFor(
    generated.structural.targetArtifact ?? 'targetBundle',
  )
  const structural = runJson(
    path.join(scripts, 'verify-structural-ledger.mjs'),
    [
      '--ledger',
      safeRelative(caseRoot, generated.structural.ledger, 'structural ledger'),
      '--expected-sha256',
      structuralAssertion.sha256,
      '--expected-bytes',
      String(structuralAssertion.bytes),
      '--expected-baseline-sha256',
      structuralBaselineEvidence.sha256,
      '--expected-target-sha256',
      structuralTargetEvidence.sha256,
      '--expected-target-tokens',
      String(generated.structural.targetTokens),
      '--expected-target-units',
      String(generated.structural.targetUnits),
    ],
    repositoryRoot,
  )

  const semanticContract = generated.semanticCorrespondence
  const semanticCorrespondence = semanticContract
    ? runJson(
        path.join(scripts, 'verify-semantic-correspondence.mjs'),
        [
          '--attribution',
          safeRelative(
            caseRoot,
            semanticContract.attributionDirectory ??
              generated.attribution.directory,
            'semantic attribution report',
          ),
          '--structural',
          safeRelative(
            caseRoot,
            semanticContract.structuralLedger ?? generated.structural.ledger,
            'semantic structural ledger',
          ),
          '--obligations',
          safeRelative(
            caseRoot,
            semanticContract.obligations,
            'semantic obligations',
          ),
          '--changelog',
          safeRelative(
            caseRoot,
            semanticContract.changelog,
            'semantic changelog section',
          ),
          '--source-root',
          path.join(repositoryRoot, manifest.sourceLineage?.root ?? 'src'),
          '--baseline',
          artifactPath(
            manifest,
            artifactsRoot,
            semanticContract.baselineArtifact ??
              generated.structural.baselineArtifact ??
              'baselineBundle',
          ),
          '--target',
          artifactPath(
            manifest,
            artifactsRoot,
            semanticContract.targetArtifact ??
              generated.structural.targetArtifact ??
              'targetBundle',
          ),
          '--report',
          safeRelative(caseRoot, semanticContract.report, 'semantic report'),
          '--summary',
          safeRelative(caseRoot, semanticContract.summary, 'semantic summary'),
          '--expected-report-sha256',
          assertion(manifest, semanticContract.report).sha256,
          '--expected-summary-sha256',
          assertion(manifest, semanticContract.summary).sha256,
        ],
        repositoryRoot,
      )
    : null
  let semanticReproduction = null
  if (semanticCorrespondence) {
    if (semanticCorrespondence.obligations.unverifiedObligationCount !== 0) {
      throw new Error(
        'Cannot verify source semantic reproduction with unverified obligations',
      )
    }
    const lineageTestFiles = new Set(
      manifest.sourceLineage?.testFiles ??
        manifest.sourceLineage?.tests?.files ??
        [],
    )
    for (const testEntry of semanticCorrespondence.testCatalog) {
      if (!lineageTestFiles.has(testEntry.path)) {
        throw new Error(
          `Semantic test is not executed by source lineage: ${testEntry.path}`,
        )
      }
    }
    const semanticTestIds = new Set(
      semanticCorrespondence.testCatalog.map(testEntry => testEntry.id),
    )
    const changedSourcePaths = new Set(
      (manifest.sourceLineage?.changedFiles ?? []).map(entry => entry.path),
    )
    for (const localization of semanticCorrespondence.manualLocalizations ?? []) {
      if (localization.basis !== 'authenticated-behavior-test') {
        throw new Error(
          `Unknown manual localization basis: ${localization.id}`,
        )
      }
      for (const sourcePath of localization.changedSourcePaths) {
        if (!changedSourcePaths.has(sourcePath)) {
          throw new Error(
            `Manual semantic localization path is not changed by source lineage: ${localization.id}: ${sourcePath}`,
          )
        }
      }
      for (const sourcePath of localization.retainedSourcePaths) {
        if (changedSourcePaths.has(sourcePath)) {
          throw new Error(
            `Manual semantic localization retained path is changed by source lineage: ${localization.id}: ${sourcePath}`,
          )
        }
      }
      for (const testId of localization.testIds) {
        if (!semanticTestIds.has(testId)) {
          throw new Error(
            `Manual semantic localization uses an unauthenticated test: ${localization.id}: ${testId}`,
          )
        }
      }
    }
    semanticReproduction = {
      status: 'whole-bundle-source-semantics-verified',
      correspondence: semanticCorrespondence.status,
      executedTestFiles: semanticCorrespondence.testCatalog.length,
      targetTokens: semanticCorrespondence.targetTokens,
      unclassifiedTokens: semanticCorrespondence.unclassifiedTokens,
      manualLocalizationCount:
        semanticCorrespondence.manualLocalizations?.length ?? 0,
    }
  }

  const readableMetadata = assertion(
    manifest,
    generated.readableDiff.metadata,
  )
  const readableBaselineEvidence = evidenceFor(
    generated.readableDiff.baselineArtifact ?? 'baselineBundle',
  )
  const readableTargetEvidence = evidenceFor(
    generated.readableDiff.targetArtifact ?? 'targetBundle',
  )
  const readableDiff = runJson(
    path.join(scripts, 'verify-readable-diff.mjs'),
    [
      '--report',
      safeRelative(
        caseRoot,
        generated.readableDiff.directory,
        'readable diff',
      ),
      '--expected-metadata-sha256',
      readableMetadata.sha256,
      '--expected-baseline-sha256',
      readableBaselineEvidence.sha256,
      '--expected-target-sha256',
      readableTargetEvidence.sha256,
    ],
    repositoryRoot,
  )

  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'claude-code-complete-recovery-'),
  )
  let packageTree
  let embeddedCode
  try {
    embeddedCode = generated.embeddedCode
      ? runJson(
          path.join(scripts, 'reconstruct-embedded-code.mjs'),
          [
            '--case',
            manifestPath,
            '--artifacts',
            artifactsRoot,
            '--output',
            path.join(temporary, 'embedded-code'),
          ],
          repositoryRoot,
        )
      : null
    packageTree = runJson(
      path.join(scripts, 'reconstruct-package.mjs'),
      [
        '--case',
        manifestPath,
        '--artifacts',
        artifactsRoot,
        '--baseline-tarball',
        path.resolve(args['baseline-tarball']),
        '--output',
        path.join(temporary, 'package'),
      ],
      repositoryRoot,
    )
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }

  console.log(
    JSON.stringify(
      {
        case: manifest.case,
        status: 'complete-recovery-verified',
        scope: manifest.recoveryScope,
        checks: {
          evidence: evidence.status,
          bunExtraction: bunExtraction?.status ?? null,
          sourcePatches: sourcePatches.status,
          sourceReproduction: sourceReproductionAudit.status,
          exactBundleDelta: exactBundleDelta.status,
          attribution: attribution.status,
          structural: structural.status,
          semanticCorrespondence: semanticCorrespondence?.status ?? null,
          sourceSemanticReproduction: semanticReproduction?.status ?? null,
          readableDiff: readableDiff.status,
          embeddedCode: embeddedCode?.status ?? null,
          packageTree: packageTree.status,
        },
        packageTree: {
          members: packageTree.members,
          bytes: packageTree.bytes,
          framedTreeSha256: packageTree.framedTreeSha256,
        },
        sourceTree: {
          state: evidence.baseline.repositoryState.kind,
          patchSet:
            sourcePatches.appliedSourceTree?.patchSet ??
            sourcePatches.patchSet ??
            null,
          files:
            sourcePatches.appliedSourceTree?.files.length ??
            sourcePatches.target?.files ??
            0,
          semanticCriterion:
            sourceReproduction.sourceReproduction.criterion,
          semanticAncestryCasesVerified:
            sourceReproductionAudit.ancestryCasesVerified,
          firstPartySemanticEquivalentFromSrc:
            sourceReproduction.sourceReproduction
              .firstPartySemanticEquivalentFromSrc,
          wholeBundleSemanticEquivalentFromSrc:
            sourceReproduction.sourceReproduction
              .wholeBundleSemanticEquivalentFromSrc,
          semanticBuildInputs:
            sourceReproduction.sourceReproduction.buildInputs,
          semanticTargetCommit:
            sourceReproduction.sourceReproduction.targetCommit,
          semanticSupplements:
            sourceReproduction.sourceReproduction.cumulativeSupplements,
          semanticCoverage:
            sourceReproduction.sourceReproduction.coverage,
          semanticEvidenceTests:
            sourceReproduction.sourceReproduction.semanticEvidenceTests,
          semanticLiteralResidueAudit:
            sourceReproduction.sourceReproduction
              .semanticLiteralResidueAudit,
          semanticAncestryEvidenceTests:
            sourceReproductionAudit.semanticEvidenceTests,
          currentSourceSemanticEvidenceTests:
            sourceReproductionAudit.currentSourceSemanticEvidenceTests,
          currentSourceSemanticOwnerSyntax:
            sourceReproductionAudit.currentSourceSemanticOwnerSyntax,
          byteExactSourceBuildClaimed:
            sourceReproduction.sourceReproduction.byteExactSourceBuildClaimed,
        },
        bundle: {
          bytes: exactBundleDelta.target.bytes,
          sha256: exactBundleDelta.target.sha256,
        },
        analyzedBundle: {
          bytes: structural.target.bytes,
          sha256: structural.target.sha256,
        },
        embeddedCode: embeddedCode
          ? {
              files: embeddedCode.targetFiles,
              bytes: embeddedCode.targetBytes,
              framedTreeSha256: embeddedCode.targetFramedTreeSha256,
            }
          : null,
        accounting: {
          targetUtf16: attribution.coverage.targetUtf16,
          unaccountedTargetUtf16:
            attribution.coverage.unaccountedTargetUtf16,
          targetTokens: structural.target.tokenCount,
          classifiedTargetTokens:
            structural.coverage.tokens.matched +
            structural.coverage.tokens.moved +
            structural.coverage.tokens.changed +
            structural.coverage.tokens.unresolved,
          sourceSemanticTokens:
            semanticCorrespondence?.accountedTokens ?? null,
          unclassifiedSourceSemanticTokens:
            semanticCorrespondence?.unclassifiedTokens ?? null,
        },
        tests: sourcePatches.semanticTests ?? sourcePatches.tests ?? null,
        semanticReproduction,
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
