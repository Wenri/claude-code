import fs from 'node:fs'
import { gunzipSync } from 'node:zlib'

const root = process.cwd()
const caseName = process.argv[2] ?? '2.1.104-to-2.1.105'
const version = process.argv[3] ?? '2.1.105'
const filter = process.argv[4] ? new RegExp(process.argv[4], 'i') : null
const caseDir = `${root}/recovery/cases/${caseName}`
const bundle = fs.readFileSync(`/tmp/claude-middle-audit.DB5eTC/${version}/package/cli.js`, 'utf8')

const jsonGz = filename => JSON.parse(gunzipSync(fs.readFileSync(filename)))
const linesGz = filename =>
  gunzipSync(fs.readFileSync(filename))
    .toString('utf8')
    .trimEnd()
    .split('\n')
    .filter(Boolean)
    .map(JSON.parse)

const structural = jsonGz(`${caseDir}/structural/generated-delta.json.gz`)
const sources = new Map(
  linesGz(`${caseDir}/attribution/sources.jsonl.gz`).map(row => [
    row.sourceIndex,
    row.source,
  ]),
)
const partitions = linesGz(`${caseDir}/attribution/target-partitions.jsonl.gz`)
const initializers = linesGz(`${caseDir}/attribution/target-initializers.jsonl.gz`)

const semanticIndexes = new Set()
let targetLine = 0
for (const line of fs.readFileSync(`${caseDir}/readable-diff/statements.diff`, 'utf8').split('\n')) {
  const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
  if (match) targetLine = Number(match[1]) - 1
  else if (line.startsWith('+') && !line.startsWith('+++')) semanticIndexes.add(targetLine++)
  else if (line.startsWith(' ')) targetLine++
}

function firstPartition(offset) {
  let low = 0
  let high = partitions.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (partitions[middle].target.offsetEnd <= offset) low = middle + 1
    else high = middle
  }
  return low
}

function initializerAt(offset) {
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

function owners(target) {
  const weights = new Map()
  for (
    let index = firstPartition(target.start);
    index < partitions.length && partitions[index].target.offsetStart < target.end;
    index++
  ) {
    const partition = partitions[index]
    const overlap =
      Math.min(target.end, partition.target.offsetEnd) -
      Math.max(target.start, partition.target.offsetStart)
    if (overlap <= 0) continue
    if (partition.attributedSourceIndex !== null) {
      weights.set(
        partition.attributedSourceIndex,
        (weights.get(partition.attributedSourceIndex) ?? 0) + overlap,
      )
    }
    for (const sourceIndex of partition.sourceCandidates ?? []) {
      if (!weights.has(sourceIndex)) weights.set(sourceIndex, overlap / 1000)
    }
    for (const sourceIndex of partition.relocatedSourceCandidates ?? []) {
      if (!weights.has(sourceIndex)) weights.set(sourceIndex, overlap / 2000)
    }
  }
  if (weights.size === 0) {
    for (const vote of initializerAt(target.start)?.sourceVotes ?? []) {
      weights.set(vote.value, vote.count)
    }
  }
  return [...weights]
    .sort((left, right) => right[1] - left[1])
    .map(([index, weight]) => ({ source: sources.get(index), weight }))
    .filter(row => row.source)
}

const rows = []
for (const region of structural.regions) {
  if (region.classification === 'matched') continue
  if (!semanticIndexes.has(region.target.index)) continue
  const attributed = owners(region.target)
  const firstParty = attributed.find(row => row.source.includes('/src/'))
  const source = firstParty?.source ?? attributed[0]?.source ?? '<none>'
  if (filter && !filter.test(source)) continue
  const text = bundle.slice(region.target.start, region.target.end)
  rows.push({
    index: region.target.index,
    start: region.target.start,
    end: region.target.end,
    type: region.target.nodeType,
    class: region.classification,
    source,
    text: text.slice(0, 500).replaceAll('\n', '\\n'),
  })
}

for (const row of rows) console.log(JSON.stringify(row))
