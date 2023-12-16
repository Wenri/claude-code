#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import { indexGeneratedBundle } from '../lib/structural-delta.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const targetIndices = [
  14883, 15586, 15714, 16292, 16480, 16761, 16765, 16801, 17167,
  18925, 19185, 19676, 19703, 20182, 20569, 20604, 20695, 20707,
  20709, 20726, 20727, 20731, 20733, 20744,
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function fail(message) {
  throw new Error(message)
}

function identity(kind, value) {
  if (kind === 'regexp') {
    return `regexp:${JSON.stringify(value.pattern)}/${[...value.flags]
      .sort()
      .join('')}`
  }
  if (kind === 'number') return `number:${Number(value)}`
  return `${kind}:${JSON.stringify(value)}`
}

function collect(source) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const counts = new Map()
  function add(kind, value) {
    const key = identity(kind, value)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  function walk(node) {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) walk(child)
      return
    }
    if (node.type === 'Literal') {
      if (node.regex) add('regexp', node.regex)
      else if (typeof node.value === 'string') add('string', node.value)
      else if (typeof node.value === 'number') add('number', node.value)
      else if (node.bigint !== undefined) add('bigint', node.bigint)
    } else if (node.type === 'TemplateElement') {
      const value = node.value?.cooked ?? node.value?.raw
      if (typeof value === 'string') add('string', value)
    }
    const property =
      ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(
        node.type,
      ) &&
      node.computed === false &&
      node.key?.type === 'Identifier'
        ? node.key
        : node.type === 'MemberExpression' &&
            node.computed === false &&
            node.property?.type === 'Identifier'
          ? node.property
          : null
    if (property) add('property', property.name)
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
        walk(child)
      }
    }
  }
  walk(ast)
  return counts
}

const artifactRoot = path.join(
  repositoryRoot,
  '.recovery-tmp',
  'authenticated-artifacts',
)
const baselineFilename = path.join(
  artifactRoot,
  '2.1.116-linux-x64',
  'cli.inner.js',
)
const targetFilename = path.join(
  artifactRoot,
  '2.1.117-linux-x64',
  'cli.inner.js',
)
const reportFilename = path.join(
  repositoryRoot,
  '.recovery-tmp',
  'residue-audits',
  `${caseName}.typed-audit.json`,
)
const caseRoot = path.join(repositoryRoot, 'recovery', 'cases', caseName)
const structuralFilename = path.join(
  caseRoot,
  'structural',
  'generated-delta.json.gz',
)
const coverageFilename = path.join(
  caseRoot,
  'semantic',
  'source-coverage.json.gz',
)
const outputFilename = path.join(
  repositoryRoot,
  'recovery',
  'test',
  'recovery-2.1.117-paired-local-residue-proofs.json',
)

for (const filename of [
  baselineFilename,
  targetFilename,
  reportFilename,
  structuralFilename,
  coverageFilename,
]) {
  if (!fs.existsSync(filename)) fail(`missing input: ${filename}`)
}

const baselineBytes = fs.readFileSync(baselineFilename)
const targetBytes = fs.readFileSync(targetFilename)
const report = JSON.parse(fs.readFileSync(reportFilename, 'utf8'))
const structuralBytes = fs.readFileSync(structuralFilename)
const structural = JSON.parse(gunzipSync(structuralBytes))
const coverage = JSON.parse(gunzipSync(fs.readFileSync(coverageFilename)))
const ownersById = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
const rowsByIndex = new Map(coverage.rows.map(row => [row.targetIndex, row]))
const baselineIndex = indexGeneratedBundle(baselineFilename)
const targetIndex = indexGeneratedBundle(targetFilename)
const grouped = new Map()
for (const residue of report.sourceRuntimeAddedOwnerResidueRows ?? []) {
  const index = residue?.structural?.index
  if (!targetIndices.includes(index)) continue
  const values = grouped.get(index) ?? []
  values.push(residue)
  grouped.set(index, values)
}

const rows = []
for (const index of targetIndices) {
  const residues = grouped.get(index)
  if (!residues?.length) fail(`u${index}: missing typed residue rows`)
  const region = structural.regions[index]
  if (
    region?.classification !== 'changed' ||
    !Number.isSafeInteger(region.baselineUnitIndex)
  ) {
    fail(`u${index}: not an authenticated changed pair`)
  }
  const baselineUnit = baselineIndex.publicUnits[region.baselineUnitIndex]
  const targetUnit = targetIndex.publicUnits[index]
  if (!baselineUnit || !targetUnit) fail(`u${index}: indexed unit is absent`)
  if (baselineUnit.coarseHash !== targetUnit.coarseHash) {
    fail(`u${index}: paired coarse hashes differ`)
  }
  const baselineSource = baselineIndex.source.slice(
    baselineUnit.start,
    baselineUnit.end,
  )
  const targetSource = targetIndex.source.slice(targetUnit.start, targetUnit.end)
  const baselineCounts = collect(baselineSource)
  const targetCounts = collect(targetSource)
  const coverageRow = rowsByIndex.get(index)
  if (!coverageRow) fail(`u${index}: coverage row is absent`)
  const ownerPaths = coverageRow.ownerIds.map(ownerId => ownersById.get(ownerId))
  if (ownerPaths.some(owner => typeof owner !== 'string')) {
    fail(`u${index}: coverage owner is unknown`)
  }
  const proofResidues = residues
    .map(residue => {
      const key = identity(residue.literalKind, residue.value)
      const baselineLocalCount = baselineCounts.get(key) ?? 0
      const targetLocalCount = targetCounts.get(key) ?? 0
      if (baselineLocalCount !== targetLocalCount || targetLocalCount === 0) {
        fail(`u${index}: ${key} is not a nonzero paired-local invariant`)
      }
      return {
        kind: residue.literalKind,
        value: residue.value,
        start: residue.target.start,
        end: residue.target.end,
        baselineOccurrenceCount: residue.baselineOccurrenceCount,
        targetOccurrenceNumber: residue.targetOccurrenceNumber,
        baselineLocalCount,
        targetLocalCount,
      }
    })
    .sort((left, right) => left.start - right.start)
  rows.push({
    targetIndex: index,
    ownerPaths,
    pairReason: region.pairReason,
    baseline: {
      index: region.baselineUnitIndex,
      start: baselineUnit.start,
      end: baselineUnit.end,
      nodeType: baselineUnit.nodeType,
      sourceHash: baselineUnit.sourceHash,
      coarseHash: baselineUnit.coarseHash,
    },
    target: {
      start: targetUnit.start,
      end: targetUnit.end,
      nodeType: targetUnit.nodeType,
      sourceHash: targetUnit.sourceHash,
      coarseHash: targetUnit.coarseHash,
    },
    residues: proofResidues,
  })
}

const fixture = {
  schemaVersion: 1,
  case: caseName,
  versions: { baseline: '2.1.116', target: '2.1.117' },
  inputs: {
    baselineBundle: {
      bytes: baselineBytes.length,
      sha256: sha256(baselineBytes),
    },
    targetBundle: { bytes: targetBytes.length, sha256: sha256(targetBytes) },
    structural: {
      bytes: structuralBytes.length,
      sha256: sha256(structuralBytes),
    },
  },
  proof:
    'Every admitted target-added residue has identical nonzero local AST multiplicity in the authenticated unique-coarse paired baseline and target units; the apparent addition is solely a global ordinal shift.',
  summary: {
    units: rows.length,
    residues: rows.reduce((sum, row) => sum + row.residues.length, 0),
  },
  rows,
}

fs.writeFileSync(outputFilename, `${JSON.stringify(fixture, null, 2)}\n`)
console.log(
  JSON.stringify({
    output: path.relative(repositoryRoot, outputFilename),
    bytes: fs.statSync(outputFilename).size,
    sha256: sha256(fs.readFileSync(outputFilename)),
    ...fixture.summary,
  }),
)
