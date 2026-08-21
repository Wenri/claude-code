import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { tokenizer } from './recovery/node_modules/acorn/dist/acorn.mjs'
import { indexGeneratedBundle } from './recovery/lib/structural-delta.mjs'

const cases = [
  ['2.1.107-to-2.1.108', '2.1.107', '2.1.108'],
  ['2.1.108-to-2.1.109', '2.1.108', '2.1.109'],
  ['2.1.109-to-2.1.110', '2.1.109', '2.1.110'],
  ['2.1.110-to-2.1.111', '2.1.110', '2.1.111'],
  ['2.1.111-to-2.1.112', '2.1.111', '2.1.112'],
  ['2.1.112-to-2.1.113', '2.1.112', '2.1.113'],
  ['2.1.113-to-2.1.114', '2.1.113', '2.1.114'],
  ['2.1.114-to-2.1.116', '2.1.114', '2.1.116'],
  ['2.1.116-to-2.1.117', '2.1.116', '2.1.117'],
  ['2.1.117-to-2.1.118', '2.1.117', '2.1.118'],
  ['2.1.118-to-2.1.119', '2.1.118', '2.1.119'],
  ['2.1.119-to-2.1.120', '2.1.119', '2.1.120'],
  ['2.1.120-to-2.1.121', '2.1.120', '2.1.121'],
]

const repositoryRoot = process.cwd()
const artifactRoot =
  process.env.CLAUDE_CODE_AUTHENTICATED_ARTIFACT_ROOT ??
  path.join(repositoryRoot, '.recovery-tmp', 'authenticated-artifacts')
const outputRoot =
  process.env.CLAUDE_CODE_LATE_GENERATOR_INPUT_ROOT ??
  path.join(repositoryRoot, '.recovery-tmp', 'generator-inputs')
fs.mkdirSync(outputRoot, { recursive: true })

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
        .replace(/2\.1\.(?:107|108|109|110|111|112|113|114|115|116|117|118|119|120|121)/g, '2.1.VERSION')
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

function ownership({ row, partitions, initializers, sources }) {
  const weighted = new Map()
  const candidateWeighted = new Map()
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
      candidateWeighted.set(
        sourceIndex,
        (candidateWeighted.get(sourceIndex) ?? 0) + overlap,
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
  return { owners: map(weighted), candidates: map(candidateWeighted).slice(0, 20) }
}

const selectedCases = new Set(process.argv.slice(2))
for (const [caseName, baselineVersion, targetVersion] of cases) {
  if (selectedCases.size > 0 && !selectedCases.has(caseName)) continue
  const caseRoot = path.join('recovery/cases', caseName)
  const semanticCorrespondencePath = path.join(
    caseRoot,
    'semantic/semantic-correspondence.json.gz',
  )
  const semanticRegions = fs.existsSync(semanticCorrespondencePath)
    ? JSON.parse(gunzipSync(fs.readFileSync(semanticCorrespondencePath))).regions
    : []
  const semanticByRange = new Map(
    semanticRegions.map(region => [`${region.start}:${region.end}`, region]),
  )
  const structural = JSON.parse(
    gunzipSync(fs.readFileSync(path.join(caseRoot, 'structural/generated-delta.json.gz'))),
  )
  const bundlePath = version =>
    Number(version.slice(4)) >= 113
      ? path.join(artifactRoot, `${version}-linux-x64`, 'cli.inner.js')
      : path.join(artifactRoot, version, 'package', 'cli.js')
  const baseline = indexGeneratedBundle(bundlePath(baselineVersion))
  const target = indexGeneratedBundle(bundlePath(targetVersion))
  const coarse = hashGroups(baseline.units, unit => unit.coarseHash)
  const metadata = hashGroups(baseline.units, unit =>
    canonical(baseline.source.slice(unit.start, unit.end), true),
  )
  const sourceRows = jsonLines(path.join(caseRoot, 'attribution/sources.jsonl.gz'))
  const sources = new Map(sourceRows.map(row => [row.sourceIndex, row.source]))
  const partitions = jsonLines(path.join(caseRoot, 'attribution/target-partitions.jsonl.gz'))
  const initializers = jsonLines(path.join(caseRoot, 'attribution/target-initializers.jsonl.gz'))
  const rows = []
  for (const region of structural.regions) {
    if (region.classification === 'matched') continue
    const unit = target.units[region.target.index]
    const source = target.source.slice(unit.start, unit.end)
    const row = {
      targetIndex: region.target.index,
      start: unit.start,
      end: unit.end,
      sourceHash: unit.sourceHash,
      coarseHash: unit.coarseHash,
      structuralClass: region.classification,
      nodeType: unit.nodeType,
      alphaByCoarse:
        region.classification === 'unresolved' && coarse.has(unit.coarseHash),
      metadataEquivalent:
        region.classification === 'unresolved' &&
        metadata.has(canonical(source, true)),
      owners: [],
      candidateOwners: [],
      prefix: source.slice(0, 500),
    }
    const mappedOwnership = ownership({ row, partitions, initializers, sources })
    row.owners = mappedOwnership.owners
    row.candidateOwners = mappedOwnership.candidates
    const semanticRegion = semanticByRange.get(`${row.start}:${row.end}`)
    if (semanticRegion) {
      row.semanticOwnership = semanticRegion.ownership
      row.semanticOwners = [
        ...(semanticRegion.exactSourcePaths ?? []),
        ...(semanticRegion.highConfidenceSourcePaths ?? []),
        ...(semanticRegion.candidateSourcePaths ?? []),
      ].filter((value, index, values) => values.indexOf(value) === index)
    }
    rows.push(row)
  }
  fs.writeFileSync(
    path.join(outputRoot, `${caseName}.all-owners.json`),
    `${JSON.stringify({ caseName, rows }, null, 2)}\n`,
  )
  const counts = new Map()
  const missing = new Map()
  for (const row of rows) {
    const owner = row.owners[0]?.source ?? '(unresolved)'
    const key = row.structuralClass + '\t' + owner
    counts.set(key, (counts.get(key) ?? 0) + 1)
    if (owner.startsWith('../src/')) {
      const currentPath = owner.slice(3)
      if (!fs.existsSync(currentPath)) {
        missing.set(owner, (missing.get(owner) ?? 0) + 1)
      }
    }
  }
  console.log(`===== ${caseName}: ${rows.length}`)
  console.log(
    [...counts]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 25)
      .map(([key, count]) => `${count}\t${key}`)
      .join('\n'),
  )
  console.log(
    'MISSING CURRENT OWNERS',
    [...missing]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 25),
  )
}
