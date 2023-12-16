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

const options = parseArguments(process.argv.slice(2))
const caseName = options.case
const versions = caseVersions(caseName)
const caseRoot = path.join(repositoryRoot, 'recovery', 'cases', caseName)
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
      `recovery-${versions.target}-build-metadata-residue-proofs.json`,
    ),
)

const baselineBytes = fs.readFileSync(bundlePath(versions.baseline))
const targetBytes = fs.readFileSync(bundlePath(versions.target))
const targetText = targetBytes.toString('utf8')
const macroPattern = new RegExp(
  `VERSION:"${versions.target.replaceAll('.', '\\.')}",[^}]{0,600}?` +
    'BUILD_TIME:"([^"]+)",GIT_SHA:"([a-f0-9]{40})"',
)
const macroMatch = macroPattern.exec(targetText)
if (!macroMatch) fail(`${caseName}: build macro was not found`)
const macro = {
  VERSION: versions.target,
  BUILD_TIME: macroMatch[1],
  GIT_SHA: macroMatch[2],
}
const allowedValues = new Set(Object.values(macro))

const reportBytes = fs.readFileSync(reportPath)
const report = JSON.parse(reportBytes)
const coveragePath = path.join(caseRoot, 'semantic', 'source-coverage.json.gz')
const coverageBytes = fs.readFileSync(coveragePath)
const coverage = JSON.parse(gunzipSync(coverageBytes))
const structuralPath = path.join(caseRoot, 'structural', 'generated-delta.json.gz')
const structuralBytes = fs.readFileSync(structuralPath)
const structural = JSON.parse(gunzipSync(structuralBytes))
const coverageByIndex = new Map(coverage.rows.map(row => [row.targetIndex, row]))
const structuralByIndex = new Map(
  structural.regions.map(region => [region.target.index, region]),
)
const ownersById = new Map(coverage.owners.map(owner => [owner.id, owner.path]))

const grouped = new Map()
for (const residue of report.sourceRuntimeAddedOwnerResidueRows ?? []) {
  const targetIndex = residue?.structural?.index
  if (!Number.isSafeInteger(targetIndex)) fail(`${caseName}: invalid residue index`)
  const values = grouped.get(targetIndex) ?? []
  values.push(residue)
  grouped.set(targetIndex, values)
}

const rows = []
for (const [targetIndex, residues] of [...grouped].sort((a, b) => a[0] - b[0])) {
  if (!residues.every(residue => allowedValues.has(residue.value))) continue
  if (!residues.every(residue => residue.literalKind === 'string')) {
    fail(`${caseName}: macro-only unit ${targetIndex} has a non-string residue`)
  }
  const coverageRow = coverageByIndex.get(targetIndex)
  const structuralRegion = structuralByIndex.get(targetIndex)
  if (!coverageRow || !structuralRegion) {
    fail(`${caseName}: macro-only unit ${targetIndex} lacks a ledger row`)
  }
  if (coverageRow.disposition !== 'source-runtime-covered') {
    fail(`${caseName}: macro-only unit ${targetIndex} is not source covered`)
  }
  const ownerPaths = coverageRow.ownerIds.map(ownerId => ownersById.get(ownerId))
  if (ownerPaths.some(owner => typeof owner !== 'string')) {
    fail(`${caseName}: macro-only unit ${targetIndex} has an unknown owner`)
  }
  rows.push({
    targetIndex,
    target: {
      classification: structuralRegion.classification,
      start: structuralRegion.target.start,
      end: structuralRegion.target.end,
      nodeType: structuralRegion.target.nodeType,
      sourceHash: structuralRegion.target.sourceHash,
    },
    ownerPaths,
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

if (rows.length === 0) fail(`${caseName}: no macro-only residue units found`)
const fixture = {
  schemaVersion: 1,
  case: caseName,
  versions,
  macro,
  inputs: {
    baselineBundle: { bytes: baselineBytes.length, sha256: sha256(baselineBytes) },
    targetBundle: { bytes: targetBytes.length, sha256: sha256(targetBytes) },
    structural: { bytes: structuralBytes.length, sha256: sha256(structuralBytes) },
    derivationReport: { bytes: reportBytes.length, sha256: sha256(reportBytes) },
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
