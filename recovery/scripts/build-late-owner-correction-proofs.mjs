#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = path.resolve(new URL('../..', import.meta.url).pathname)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function fail(message) {
  throw new Error(message)
}

function caseVersions(caseName) {
  const match = /^(\d+\.\d+\.\d+)-to-(\d+\.\d+\.\d+)$/.exec(caseName)
  if (!match) fail(`invalid case: ${caseName}`)
  return { baseline: match[1], target: match[2] }
}

function bundlePath(version) {
  const artifactRoot =
    process.env.CLAUDE_CODE_AUTHENTICATED_ARTIFACT_ROOT ??
    path.join(repositoryRoot, '.recovery-tmp', 'authenticated-artifacts')
  return Number(version.slice(4)) >= 113
    ? path.join(artifactRoot, `${version}-linux-x64`, 'cli.inner.js')
    : path.join(artifactRoot, version, 'package', 'cli.js')
}

function parseArguments(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith('--') || value === undefined) {
      fail(`invalid argument near ${key ?? '<end>'}`)
    }
    result[key.slice(2)] = value
  }
  if (!result.case) fail('usage: --case CASE [--report REPORT] [--output OUTPUT]')
  return result
}

function normalizeCandidate(value) {
  if (typeof value !== 'string') return null
  const normalized = value.replace(/^(\.\.\/)+/, '')
  return normalized.startsWith('src/') ? normalized : null
}

function normalizeSourceMatch(value, sourceRoot) {
  if (typeof value !== 'string') return null
  const normalized = value.startsWith('src/') ? value : `src/${value}`
  return fs.existsSync(path.join(sourceRoot, normalized.slice(4)))
    ? normalized
    : null
}

const options = parseArguments(process.argv.slice(2))
const caseName = options.case
const versions = caseVersions(caseName)
const caseRoot = path.join(repositoryRoot, 'recovery', 'cases', caseName)
const sourceRoot = path.join(
  repositoryRoot,
  '.recovery-tmp',
  'semantic-trees',
  versions.target,
  'src',
)
const reportPath = path.resolve(
  options.report ??
    path.join(
      repositoryRoot,
      '.recovery-tmp',
      'residue-audits',
      `${caseName}.typed-audit.json`,
    ),
)
const outputPath = path.resolve(
  options.output ??
    path.join(
      repositoryRoot,
      'recovery',
      'test',
      `recovery-${versions.target}-exact-owner-correction-proofs.json`,
    ),
)

if (!fs.existsSync(sourceRoot)) fail(`${caseName}: target source root is absent`)
const baselineBytes = fs.readFileSync(bundlePath(versions.baseline))
const targetBytes = fs.readFileSync(bundlePath(versions.target))
const reportBytes = fs.readFileSync(reportPath)
const report = JSON.parse(reportBytes)
const structuralPath = path.join(caseRoot, 'structural', 'generated-delta.json.gz')
const structuralBytes = fs.readFileSync(structuralPath)
const structural = JSON.parse(gunzipSync(structuralBytes))
const structuralByIndex = new Map(
  structural.regions.map(region => [region.target.index, region]),
)
const coveragePath = path.join(caseRoot, 'semantic', 'source-coverage.json.gz')
const coverageBytes = fs.readFileSync(coveragePath)
const coverage = JSON.parse(gunzipSync(coverageBytes))
const coverageByIndex = new Map(coverage.rows.map(row => [row.targetIndex, row]))
const ownersById = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
const macroFixture = JSON.parse(
  fs.readFileSync(
    path.join(
      repositoryRoot,
      'recovery',
      'test',
      `recovery-${versions.target}-build-metadata-residue-proofs.json`,
    ),
  ),
)
const macroIndices = new Set(macroFixture.rows.map(row => row.targetIndex))

const grouped = new Map()
for (const residue of report.sourceRuntimeAddedOwnerResidueRows ?? []) {
  const targetIndex = residue?.structural?.index
  if (!Number.isSafeInteger(targetIndex)) fail(`${caseName}: invalid residue index`)
  if (macroIndices.has(targetIndex)) continue
  const values = grouped.get(targetIndex) ?? []
  values.push(residue)
  grouped.set(targetIndex, values)
}

const rows = []
for (const [targetIndex, residues] of [...grouped].sort((a, b) => a[0] - b[0])) {
  let sharedMatches
  for (const residue of residues) {
    const matches = new Set(
      (residue.sourceMatches ?? [])
        .map(value => normalizeSourceMatch(value, sourceRoot))
        .filter(Boolean),
    )
    sharedMatches =
      sharedMatches === undefined
        ? matches
        : new Set([...sharedMatches].filter(value => matches.has(value)))
  }
  const candidateUniverse = [
    ...new Set(
      residues
        .flatMap(residue => residue.candidates ?? [])
        .map(normalizeCandidate)
        .filter(Boolean),
    ),
  ].sort()
  const qualifiedCandidates = [...(sharedMatches ?? [])]
    .filter(candidate => candidateUniverse.includes(candidate))
    .sort()
  if (qualifiedCandidates.length !== 1) continue

  const correctedOwner = qualifiedCandidates[0]
  const coverageRow = coverageByIndex.get(targetIndex)
  const structuralRegion = structuralByIndex.get(targetIndex)
  if (!coverageRow || !structuralRegion) {
    fail(`${caseName}: u${targetIndex} lacks structural coverage`)
  }
  const currentOwnerPaths = coverageRow.ownerIds.map(ownerId => ownersById.get(ownerId))
  if (currentOwnerPaths.some(owner => typeof owner !== 'string')) {
    fail(`${caseName}: u${targetIndex} has an unknown owner`)
  }
  if (currentOwnerPaths.includes(correctedOwner)) continue
  const sourceFilename = path.join(sourceRoot, correctedOwner.slice(4))
  const sourceBytes = fs.readFileSync(sourceFilename)
  rows.push({
    targetIndex,
    currentOwnerPaths,
    correctedOwner,
    candidateUniverse,
    target: {
      classification: structuralRegion.classification,
      start: structuralRegion.target.start,
      end: structuralRegion.target.end,
      nodeType: structuralRegion.target.nodeType,
      sourceHash: structuralRegion.target.sourceHash,
    },
    source: {
      bytes: sourceBytes.length,
      sha256: sha256(sourceBytes),
    },
    residues: residues
      .map(residue => ({
        kind: residue.literalKind,
        value: residue.value,
        start: residue.target.start,
        end: residue.target.end,
        baselineOccurrenceCount: residue.baselineOccurrenceCount,
        targetOccurrenceNumber: residue.targetOccurrenceNumber,
      }))
      .sort((left, right) => left.start - right.start),
  })
}

if (rows.length === 0) fail(`${caseName}: no exact owner corrections found`)
const fixture = {
  schemaVersion: 1,
  case: caseName,
  versions,
  inputs: {
    baselineBundle: { bytes: baselineBytes.length, sha256: sha256(baselineBytes) },
    targetBundle: { bytes: targetBytes.length, sha256: sha256(targetBytes) },
    structural: { bytes: structuralBytes.length, sha256: sha256(structuralBytes) },
    derivationReport: { bytes: reportBytes.length, sha256: sha256(reportBytes) },
  },
  proof: {
    target: 'complete authenticated structural unit and exact typed residue coordinates',
    attribution:
      'corrected owner is the sole source-map candidate containing every target-added owner residue',
    source: 'exact historical target source file bytes and SHA-256',
  },
  summary: {
    units: rows.length,
    residues: rows.reduce((sum, row) => sum + row.residues.length, 0),
  },
  rows,
}

fs.writeFileSync(outputPath, `${JSON.stringify(fixture, null, 2)}\n`)
console.log(
  JSON.stringify({
    case: caseName,
    output: path.relative(repositoryRoot, outputPath),
    sha256: sha256(fs.readFileSync(outputPath)),
    ...fixture.summary,
  }),
)
