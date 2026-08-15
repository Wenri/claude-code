import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

const cases = [
  '2.1.107-to-2.1.108',
  '2.1.108-to-2.1.109',
  '2.1.109-to-2.1.110',
  '2.1.110-to-2.1.111',
  '2.1.111-to-2.1.112',
  '2.1.112-to-2.1.113',
  '2.1.113-to-2.1.114',
  '2.1.114-to-2.1.116',
]

function jsonLines(filename) {
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

for (const caseName of cases) {
  const caseRoot = path.join('recovery/cases', caseName)
  const sourceRows = jsonLines(path.join(caseRoot, 'attribution/sources.jsonl.gz'))
  const sources = new Map(sourceRows.map(row => [row.sourceIndex, row.source]))
  const partitions = jsonLines(
    path.join(caseRoot, 'attribution/target-partitions.jsonl.gz'),
  )
  const initializers = jsonLines(
    path.join(caseRoot, 'attribution/target-initializers.jsonl.gz'),
  )
  const report = JSON.parse(
    fs.readFileSync(`/tmp/recovery-semantic-late-b/${caseName}.remainder.json`),
  )
  for (const row of report.remainder) {
    const initializer = initializerAt(initializers, row.start)
    const initializerOwners = (initializer?.sourceVotes ?? []).map(vote => ({
      source: sources.get(vote.value) ?? null,
      votes: vote.count,
    }))
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
    }
    const names = mapping =>
      [...mapping]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 12)
        .map(([sourceIndex, utf16]) => ({
          source: sources.get(sourceIndex) ?? null,
          utf16,
        }))
    row.ownership = {
      initializer: initializer
        ? {
            index: initializer.initializerIndex,
            start: initializer.regionStart,
            end: initializer.regionEnd,
            status: initializer.status,
            owners: initializerOwners,
          }
        : null,
      attributed: names(attributed),
      candidates: names(candidates),
    }
  }
  fs.writeFileSync(
    `/tmp/recovery-semantic-late-b/${caseName}.owners.json`,
    `${JSON.stringify(report, null, 2)}\n`,
  )
  const sourceCounts = new Map()
  for (const row of report.remainder) {
    const owner =
      row.ownership.attributed[0]?.source ??
      row.ownership.initializer?.owners[0]?.source ??
      row.ownership.candidates[0]?.source ??
      '(unresolved)'
    sourceCounts.set(owner, (sourceCounts.get(owner) ?? 0) + 1)
  }
  console.log(`===== ${caseName}`)
  console.log(
    [...sourceCounts]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 30)
      .map(([source, count]) => `${count}\t${source}`)
      .join('\n'),
  )
}
