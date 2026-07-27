#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

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
  const scripts = path.resolve(repositoryRoot, 'recovery/scripts')
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
  const sourcePatches = runJson(
    path.join(scripts, 'verify-recovered-patches.mjs'),
    ['--case', manifestPath, '--artifacts', artifactsRoot],
    repositoryRoot,
  )
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
      baselineEvidence.sha256,
      '--expected-target-sha256',
      targetEvidence.sha256,
    ],
    repositoryRoot,
  )

  const structuralAssertion = assertion(
    manifest,
    generated.structural.ledger,
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
      baselineEvidence.sha256,
      '--expected-target-sha256',
      targetEvidence.sha256,
      '--expected-target-tokens',
      String(generated.structural.targetTokens),
      '--expected-target-units',
      String(generated.structural.targetUnits),
    ],
    repositoryRoot,
  )

  const readableMetadata = assertion(
    manifest,
    generated.readableDiff.metadata,
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
      baselineEvidence.sha256,
      '--expected-target-sha256',
      targetEvidence.sha256,
    ],
    repositoryRoot,
  )

  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'claude-code-complete-recovery-'),
  )
  let packageTree
  try {
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
          sourcePatches: sourcePatches.status,
          exactBundleDelta: exactBundleDelta.status,
          attribution: attribution.status,
          structural: structural.status,
          readableDiff: readableDiff.status,
          packageTree: packageTree.status,
        },
        packageTree: {
          members: packageTree.members,
          bytes: packageTree.bytes,
          framedTreeSha256: packageTree.framedTreeSha256,
        },
        sourceTree: {
          state: evidence.baseline.repositoryState.kind,
          patchSet: sourcePatches.appliedSourceTree?.patchSet ?? null,
          files: sourcePatches.appliedSourceTree?.files.length ?? 0,
        },
        bundle: {
          bytes: exactBundleDelta.target.bytes,
          sha256: exactBundleDelta.target.sha256,
        },
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
        },
        tests: sourcePatches.semanticTests,
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
