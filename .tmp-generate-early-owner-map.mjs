import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { tokenizer } from './recovery/node_modules/acorn/dist/acorn.mjs'
import { indexGeneratedBundle } from './recovery/lib/structural-delta.mjs'

const artifactRoot = '/tmp/claude-recovery-all-artifacts.9cj1Zk'
const outputRoot = '/tmp/early-semantic-owners'
const cases = [
  ['2.1.89-to-2.1.90', '2.1.89', '2.1.90'],
  ['2.1.90-to-2.1.91', '2.1.90', '2.1.91'],
  ['2.1.91-to-2.1.92', '2.1.91', '2.1.92'],
  ['2.1.92-to-2.1.94', '2.1.92', '2.1.94'],
  ['2.1.94-to-2.1.96', '2.1.94', '2.1.96'],
]

const parseOptions = {
  allowHashBang: true,
  ecmaVersion: 'latest',
  sourceType: 'module',
}

function canonical(source, metadata = false) {
  const result = []
  const stream = tokenizer(source, parseOptions)
  while (true) {
    const token = stream.getToken()
    if (token.type.label === 'eof') break
    let raw = source.slice(token.start, token.end)
    if (token.type.label === 'name') raw = '@id'
    if (metadata) {
      raw = raw
        .replace(/2\.1\.(?:89|90|91|92|93|94|95|96)/g, '2.1.VERSION')
        .replace(/20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z/g, 'BUILD_TIME')
        .replace(/external-build-\d+/g, 'external-build-N')
        .replace(/build[-_ ](?:id[-_ ]?)?\d+/gi, 'build-N')
    }
    result.push(token.type.label, raw)
  }
  return result.join('\0')
}

function hashGroups(units, key) {
  const result = new Map()
  for (const unit of units) {
    const hash = key(unit)
    result.set(hash, (result.get(hash) ?? 0) + 1)
  }
  return result
}

function gzipLines(filename) {
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

function ownership({ row, partitions, initializers, sources }) {
  const weighted = new Map()
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
      weighted.set(
        partition.attributedSourceIndex,
        (weighted.get(partition.attributedSourceIndex) ?? 0) + overlap,
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
  if (weighted.size === 0) {
    const initializer = initializerAt(initializers, row.start)
    for (const vote of initializer?.sourceVotes ?? []) {
      weighted.set(vote.value, vote.count)
    }
  }
  const map = entries =>
    [...entries]
      .sort((left, right) => right[1] - left[1])
      .map(([sourceIndex, score]) => ({ source: sources.get(sourceIndex), score }))
      .filter(owner => owner.source)
  return { owners: map(weighted), candidateOwners: map(candidates).slice(0, 30) }
}

function bundlePath(version) {
  return path.join(artifactRoot, version, 'package/cli.js')
}

fs.mkdirSync(outputRoot, { recursive: true })
const selectedCases = new Set(process.argv.slice(2))
for (const [caseName, baselineVersion, targetVersion] of cases) {
  if (selectedCases.size > 0 && !selectedCases.has(caseName)) continue
  const caseRoot = path.join('recovery', 'cases', caseName)
  const structural = JSON.parse(
    gunzipSync(
      fs.readFileSync(path.join(caseRoot, 'structural/generated-delta.json.gz')),
    ),
  )
  const baseline = indexGeneratedBundle(bundlePath(baselineVersion))
  const target = indexGeneratedBundle(bundlePath(targetVersion))
  const coarse = hashGroups(baseline.units, unit => unit.coarseHash)
  const metadata = hashGroups(baseline.units, unit =>
    canonical(baseline.source.slice(unit.start, unit.end), true),
  )
  const sources = new Map(
    gzipLines(path.join(caseRoot, 'attribution/sources.jsonl.gz')).map(row => [
      row.sourceIndex,
      row.source,
    ]),
  )
  const partitions = gzipLines(
    path.join(caseRoot, 'attribution/target-partitions.jsonl.gz'),
  )
  const initializers = gzipLines(
    path.join(caseRoot, 'attribution/target-initializers.jsonl.gz'),
  )
  const rows = []
  for (const region of structural.regions) {
    if (region.classification === 'matched') continue
    const unit = target.units[region.target.index]
    const snippet = target.source.slice(unit.start, unit.end)
    const base = {
      targetIndex: region.target.index,
      start: unit.start,
      end: unit.end,
      sourceHash: unit.sourceHash,
      coarseHash: unit.coarseHash,
      structuralClass: region.classification,
      nodeType: unit.nodeType,
      alphaByCoarse:
        region.classification !== 'moved' && coarse.has(unit.coarseHash),
      metadataEquivalent:
        region.classification !== 'moved' &&
        metadata.has(canonical(snippet, true)),
      prefix: snippet.slice(0, 800),
    }
    rows.push({
      ...base,
      ...ownership({ row: base, partitions, initializers, sources }),
    })
  }
  fs.writeFileSync(
    path.join(outputRoot, `${caseName}.json`),
    `${JSON.stringify({ caseName, targetVersion, rows }, null, 2)}\n`,
  )
  console.log(caseName, rows.length)
}
