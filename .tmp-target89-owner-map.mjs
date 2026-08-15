import fs from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { indexGeneratedBundle } from './recovery/lib/structural-delta.mjs'

const caseRoot = 'recovery/cases/2.1.88-to-2.1.89'
const baseline = indexGeneratedBundle(
  '/tmp/claude-recovery-audit-early-pIxKmS/2.1.88/cli.js',
)
const target = indexGeneratedBundle(
  '/tmp/claude-recovery-audit-early-pIxKmS/2.1.89/package/cli.js',
)

function jsonGzip(filename) {
  return JSON.parse(gunzipSync(fs.readFileSync(filename)))
}

function jsonLinesGzip(filename) {
  return gunzipSync(fs.readFileSync(filename))
    .toString('utf8')
    .trimEnd()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line))
}

function firstEndingAfter(partitions, offset) {
  let low = 0
  let high = partitions.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (partitions[middle].target.offsetEnd <= offset) low = middle + 1
    else high = middle
  }
  return low
}

function initializerAt(initializers, offset) {
  let low = 0
  let high = initializers.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (initializers[middle].regionStart <= offset) low = middle + 1
    else high = middle
  }
  const candidate = initializers[low - 1]
  return candidate && offset < candidate.regionEnd ? candidate : null
}

function ranked(mapping, sources) {
  return [...mapping]
    .sort((left, right) => right[1] - left[1])
    .map(([sourceIndex, score]) => ({ source: sources.get(sourceIndex), score }))
    .filter(item => typeof item.source === 'string')
}

function ownership(row, partitions, initializers, sources) {
  const attributed = new Map()
  const candidates = new Map()
  for (
    let index = firstEndingAfter(partitions, row.start);
    index < partitions.length && partitions[index].target.offsetStart < row.end;
    index += 1
  ) {
    const partition = partitions[index]
    const overlap =
      Math.min(row.end, partition.target.offsetEnd) -
      Math.max(row.start, partition.target.offsetStart)
    if (overlap <= 0) continue
    if (partition.attributedSourceIndex !== null) {
      attributed.set(
        partition.attributedSourceIndex,
        (attributed.get(partition.attributedSourceIndex) ?? 0) + overlap,
      )
    }
    for (const sourceIndex of partition.sourceCandidates ?? []) {
      candidates.set(sourceIndex, (candidates.get(sourceIndex) ?? 0) + overlap)
    }
    for (const sourceIndex of partition.relocatedSourceCandidates ?? []) {
      candidates.set(
        sourceIndex,
        (candidates.get(sourceIndex) ?? 0) + overlap / 2,
      )
    }
  }
  if (attributed.size === 0) {
    for (const vote of initializerAt(initializers, row.start)?.sourceVotes ?? []) {
      attributed.set(vote.value, vote.count)
    }
  }
  return {
    owners: ranked(attributed, sources),
    candidates: ranked(candidates, sources).slice(0, 20),
  }
}

const structural = jsonGzip(`${caseRoot}/structural/generated-delta.json.gz`)
const sourceRows = jsonLinesGzip(`${caseRoot}/attribution/sources.jsonl.gz`)
const sources = new Map(sourceRows.map(row => [row.sourceIndex, row.source]))
const partitions = jsonLinesGzip(
  `${caseRoot}/attribution/target-partitions.jsonl.gz`,
)
const initializers = jsonLinesGzip(
  `${caseRoot}/attribution/target-initializers.jsonl.gz`,
)
const baselineCoarse = new Set(baseline.units.map(unit => unit.coarseHash))
const rows = structural.regions
  .filter(region => region.classification !== 'matched')
  .map(region => {
    const unit = target.units[region.target.index]
    const base = {
      targetIndex: region.target.index,
      start: unit.start,
      end: unit.end,
      nodeType: unit.nodeType,
      sourceHash: unit.sourceHash,
      coarseHash: unit.coarseHash,
      structuralClass: region.classification,
      pairReason: region.pairReason ?? null,
      alphaByCoarse: baselineCoarse.has(unit.coarseHash),
      prefix: target.source.slice(unit.start, Math.min(unit.end, unit.start + 800)),
    }
    return { ...base, ...ownership(base, partitions, initializers, sources) }
  })

fs.writeFileSync(
  '/tmp/recovery-semantic-target89.all-owners.json',
  `${JSON.stringify({ case: '2.1.88-to-2.1.89', rows }, null, 2)}\n`,
)
console.log(JSON.stringify({ rows: rows.length }))
