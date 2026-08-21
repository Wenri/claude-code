#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { rebuildRelease21124Core } from './build-2.1.124-semantic-delta.mjs'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function evidence(filename) {
  const bytes = fs.readFileSync(filename)
  return {
    bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  }
}

export function verifyRelease21124SemanticDelta({
  baselinePath,
  targetPath,
  caseRoot,
  sourceRoot,
}) {
  const structural = path.join(path.resolve(caseRoot), 'structural')
  const paths = {
    rawLedgerPath: path.join(structural, 'generated-delta.json.gz'),
    metadataLedgerPath: path.join(
      structural,
      'metadata-normalized-delta.json.gz',
    ),
    exactLedgerPath: path.join(structural, 'known-delta-ledger.json.gz'),
    clusterLedgerPath: path.join(
      structural,
      'semantic-cluster-ledger.json.gz',
    ),
  }
  const result = rebuildRelease21124Core({
    baselinePath,
    targetPath,
    sourceRoot,
    ...paths,
  })
  const proofPath = path.join(structural, 'known-delta-proof.json')
  const committed = JSON.parse(fs.readFileSync(proofPath, 'utf8'))
  const { artifacts, ...committedCore } = committed
  assert(
    JSON.stringify(committedCore) === JSON.stringify(result.proof),
    'committed proof differs from deterministic core proof',
  )
  const artifactPaths = {
    rawLedger: paths.rawLedgerPath,
    metadataLedger: paths.metadataLedgerPath,
    exactLedger: paths.exactLedgerPath,
    clusterLedger: paths.clusterLedgerPath,
  }
  for (const [key, filename] of Object.entries(artifactPaths)) {
    assert(artifacts[key]?.path === `structural/${path.basename(filename)}`,
      `${key} proof path`)
    assert(
      JSON.stringify(evidence(filename)) ===
        JSON.stringify({ bytes: artifacts[key].bytes, sha256: artifacts[key].sha256 }),
      `${key} proof identity`,
    )
  }
  return {
    status: '2.1.124-semantic-delta-verified',
    complete: true,
    clusters: committed.knownDelta.clusterInventory.totalClusters,
    directClusters: committed.knownDelta.clusterInventory.direct.reduce(
      (sum, row) => sum + row.clusterIds.length,
      0,
    ),
    accountingOnlyClusters:
      committed.knownDelta.clusterInventory.accountingOnly.reduce(
        (sum, row) => sum + row.clusterIds.length,
        0,
      ),
    supportBindings:
      committed.knownDelta.clusterInventory.supportBindings.length,
    exact: committed.ledgers.knownDeltaExact.coverage,
    proof: {
      path: 'structural/known-delta-proof.json',
      ...evidence(proofPath),
    },
  }
}

function parseArguments(argv) {
  const result = {}
  const allowed = new Set(['baseline', 'target', 'case-root', 'source-root'])
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, '')
    const value = argv[index + 1]
    assert(allowed.has(key) && value, `invalid argument: ${argv[index] ?? ''}`)
    result[key] = value
  }
  return result
}

function main() {
  const args = parseArguments(process.argv.slice(2))
  assert(args.baseline && args.target && args['case-root'] && args['source-root'],
    'Usage: verify-2.1.124-semantic-delta.mjs --baseline PATH --target PATH --case-root PATH --source-root PATH')
  console.log(JSON.stringify(verifyRelease21124SemanticDelta({
    baselinePath: args.baseline,
    targetPath: args.target,
    caseRoot: args['case-root'],
    sourceRoot: args['source-root'],
  }), null, 2))
}

const invokedAsScript =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (invokedAsScript) {
  try { main() } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error))
    process.exitCode = 1
  }
}
