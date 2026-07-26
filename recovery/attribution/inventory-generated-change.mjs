#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { locateExactLiteralAnchors } from '../lib/literal-anchor-locator.mjs'

const BASE64 =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const BASE64_VALUES = new Map(
  [...BASE64].map((character, index) => [character, index]),
)

function usage() {
  console.error(
    'Usage: inventory-generated-change.mjs --baseline BUNDLE ' +
      '--map BASELINE.map --target BUNDLE --output DIR ' +
      '[--target-package-json FILE] [--target-dts FILE] [--changelog FILE]',
  )
}

function parseArguments(argv) {
  const result = {}
  const allowed = new Set([
    'baseline',
    'map',
    'target',
    'output',
    'target-package-json',
    'target-dts',
    'changelog',
    'minimum-literal-length',
  ])
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument.startsWith('--')) throw new Error(`Unexpected ${argument}`)
    const key = argument.slice(2)
    if (!allowed.has(key)) throw new Error(`Unknown argument: ${argument}`)
    if (result[key] !== undefined) {
      throw new Error(`Duplicate argument: ${argument}`)
    }
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}`)
    }
    result[key] = value
    index += 1
  }
  return result
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function evidence(filename) {
  const value = fs.readFileSync(filename)
  return { bytes: value.length, sha256: sha256(value) }
}

function compareText(left, right) {
  if (left === right) return 0
  return left < right ? -1 : 1
}

function lineStarts(text) {
  const result = [0]
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) result.push(index + 1)
  }
  return result
}

function decodeVlq(segment, cursor) {
  let result = 0
  let shift = 0
  let continuation
  do {
    if (cursor.index >= segment.length) {
      throw new Error('Invalid VLQ segment in source map')
    }
    const digit = BASE64_VALUES.get(segment[cursor.index])
    cursor.index += 1
    if (digit === undefined) throw new Error('Invalid base64 VLQ character')
    continuation = (digit & 32) !== 0
    result += (digit & 31) << shift
    shift += 5
  } while (continuation)
  const negative = (result & 1) === 1
  result >>>= 1
  return negative ? -result : result
}

function decodeSegment(segment) {
  const values = []
  const cursor = { index: 0 }
  while (cursor.index < segment.length) {
    values.push(decodeVlq(segment, cursor))
  }
  return values
}

function buildOwnershipRuns(map, baselineText) {
  if (
    map.version !== 3 ||
    !Array.isArray(map.sources) ||
    !Array.isArray(map.sourcesContent) ||
    map.sources.length !== map.sourcesContent.length ||
    typeof map.mappings !== 'string'
  ) {
    throw new Error('Invalid outer source-map topology')
  }
  const starts = lineStarts(baselineText)
  const runs = []
  const seenSources = new Set()
  let sourceIndex = 0
  let originalLine = 0
  let originalColumn = 0
  let mappedSegmentCount = 0

  for (const [generatedLine, encodedLine] of map.mappings
    .split(';')
    .entries()) {
    if (generatedLine >= starts.length) {
      throw new Error('Source map has more generated lines than the bundle')
    }
    let generatedColumn = 0
    if (!encodedLine) continue
    for (const encoded of encodedLine.split(',')) {
      if (!encoded) continue
      const fields = decodeSegment(encoded)
      if (fields.length !== 4 && fields.length !== 5) {
        throw new Error(`Unexpected mapped segment arity: ${fields.length}`)
      }
      generatedColumn += fields[0]
      sourceIndex += fields[1]
      originalLine += fields[2]
      originalColumn += fields[3]
      if (sourceIndex < 0 || sourceIndex >= map.sources.length) {
        throw new Error(`Source index out of range: ${sourceIndex}`)
      }
      const generatedOffset = starts[generatedLine] + generatedColumn
      const last = runs.at(-1)
      if (!last || last.sourceIndex !== sourceIndex) {
        if (seenSources.has(sourceIndex)) {
          throw new Error(
            `Source has multiple disjoint generated runs: ${map.sources[sourceIndex]}`,
          )
        }
        seenSources.add(sourceIndex)
        runs.push({
          runIndex: runs.length,
          sourceIndex,
          source: map.sources[sourceIndex],
          mappedSegmentCount: 1,
          mappedStart: {
            offset: generatedOffset,
            line: generatedLine,
            column: generatedColumn,
          },
          mappedEnd: {
            offset: generatedOffset,
            line: generatedLine,
            column: generatedColumn,
          },
          originalStart: {
            line: originalLine,
            column: originalColumn,
          },
          originalEnd: {
            line: originalLine,
            column: originalColumn,
          },
        })
      } else {
        last.mappedSegmentCount += 1
        last.mappedEnd = {
          offset: generatedOffset,
          line: generatedLine,
          column: generatedColumn,
        }
        last.originalEnd = {
          line: originalLine,
          column: originalColumn,
        }
      }
      mappedSegmentCount += 1
    }
  }

  if (runs.length !== map.sources.length) {
    throw new Error(
      `Expected one run for each of ${map.sources.length} sources, got ${runs.length}`,
    )
  }
  for (let index = 0; index < runs.length; index += 1) {
    const run = runs[index]
    run.envelopeStart = run.mappedStart.offset
    run.envelopeEnd =
      runs[index + 1]?.mappedStart.offset ?? baselineText.length
  }
  return { runs, mappedSegmentCount }
}

function upperBound(values, value, select = item => item) {
  let low = 0
  let high = values.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (select(values[middle]) <= value) low = middle + 1
    else high = middle
  }
  return low
}

function ownerForOffset(runs, offset) {
  const index =
    upperBound(runs, offset, run => run.mappedStart.offset) - 1
  if (index < 0) return { sourceIndex: null, basis: 'unowned-header' }
  const run = runs[index]
  return {
    sourceIndex: run.sourceIndex,
    basis:
      offset <= run.mappedEnd.offset ? 'mapped-run' : 'source-envelope',
  }
}

function sourceRangeForOffsets(runs, start, end) {
  const result = []
  const first =
    upperBound(runs, start, run => run.mappedStart.offset) - 1
  const finalOffset = end > start ? end - 1 : end
  const last =
    upperBound(runs, finalOffset, run => run.mappedStart.offset) - 1
  for (
    let index = Math.max(0, first);
    index <= Math.min(runs.length - 1, Math.max(first, last));
    index += 1
  ) {
    result.push(runs[index].sourceIndex)
  }
  return result
}

function discoverWrapperNames(text) {
  const common = text.match(
    /[,;]([A-Za-z_$][A-Za-z0-9_$]*)=\(q,K\)=>\(\)=>\(K\|\|q\(\(K=\{exports:\{\}\}\)\.exports,K\),K\.exports\)/,
  )
  const initializer = text.match(
    /var ([A-Za-z_$][A-Za-z0-9_$]*)=\(q,K\)=>\(\)=>\(q&&\(K=q\(q=0\)\),K\)/,
  )
  if (!common || !initializer) {
    throw new Error('Could not discover Bun wrapper helper names')
  }
  return { common: common[1], initializer: initializer[1] }
}

function initializerBoundaries(text) {
  const wrappers = discoverWrapperNames(text)
  const expression = new RegExp(
    `=(${wrappers.common}|${wrappers.initializer})\\(`,
    'g',
  )
  const boundaries = []
  let match
  while ((match = expression.exec(text)) !== null) {
    const helper = match[1]
    const suffix = text.slice(expression.lastIndex, expression.lastIndex + 4)
    if (
      (helper === wrappers.initializer && !suffix.startsWith('()=>')) ||
      (helper === wrappers.common && !suffix.startsWith('('))
    ) {
      continue
    }
    boundaries.push({
      initializerIndex: boundaries.length,
      helperKind:
        helper === wrappers.initializer ? 'esm-initializer' : 'commonjs-module',
      expressionOffset: match.index + 1,
    })
  }
  for (let index = 0; index < boundaries.length; index += 1) {
    boundaries[index].regionStart = boundaries[index].expressionOffset
    boundaries[index].regionEnd =
      boundaries[index + 1]?.expressionOffset ?? text.length
  }
  return { wrappers, boundaries }
}

function anchorsInRange(sortedAnchors, start, end, field) {
  const first = upperBound(
    sortedAnchors,
    start - 1,
    anchor => anchor[field].offset,
  )
  const result = []
  for (let index = first; index < sortedAnchors.length; index += 1) {
    const anchor = sortedAnchors[index]
    if (anchor[field].offset >= end) break
    result.push(anchor)
  }
  return result
}

function countVotes(values) {
  const counts = new Map()
  for (const value of values) {
    if (value === null || value === undefined) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value - right.value)
}

function gzipJsonLines(records) {
  const text =
    records.map(record => JSON.stringify(record)).join('\n') + '\n'
  return zlib.gzipSync(text, { level: 9, mtime: 0 })
}

function ensureEmptyOutput(output) {
  if (!fs.existsSync(output)) {
    fs.mkdirSync(output, { recursive: true })
    return
  }
  const status = fs.lstatSync(output)
  if (!status.isDirectory() || status.isSymbolicLink()) {
    throw new Error(`Output is not a real directory: ${output}`)
  }
  const entries = fs.readdirSync(output)
  if (entries.length > 0) {
    throw new Error(`Refusing non-empty output: ${output} (${entries[0]})`)
  }
}

function releaseEvidence(args) {
  const result = {}
  if (args['target-package-json']) {
    const filename = path.resolve(args['target-package-json'])
    const packageJson = JSON.parse(fs.readFileSync(filename, 'utf8'))
    result.targetPackage = {
      ...evidence(filename),
      name: packageJson.name,
      version: packageJson.version,
    }
  }
  if (args['target-dts']) {
    const filename = path.resolve(args['target-dts'])
    const content = fs.readFileSync(filename, 'utf8')
    result.targetDeclarations = {
      ...evidence(filename),
      staleReadFileStateHint:
        content.includes('staleReadFileStateHint?: string;') &&
        content.includes(
          'Model-facing note listing readFileState entries whose mtime bumped',
        ),
    }
  }
  if (args.changelog) {
    const filename = path.resolve(args.changelog)
    const content = fs.readFileSync(filename, 'utf8')
    const sectionStart = content.search(/^## 2\.1\.89[^\n]*$/m)
    const bodyStart =
      sectionStart === -1 ? -1 : content.indexOf('\n', sectionStart) + 1
    const nextSection =
      bodyStart <= 0 ? -1 : content.slice(bodyStart).search(/^## /m)
    const body =
      bodyStart <= 0
        ? ''
        : content.slice(
            bodyStart,
            nextSection === -1 ? content.length : bodyStart + nextSection,
          )
    const bullets = body
      .split('\n')
      .filter(line => line.startsWith('- '))
      .map(line => line.slice(2))
    result.officialChangelog = {
      ...evidence(filename),
      section: '2.1.89',
      bulletCount: bullets.length,
      bullets,
    }
  }
  return result
}

function main() {
  const args = parseArguments(process.argv.slice(2))
  if (!args.baseline || !args.map || !args.target || !args.output) {
    usage()
    process.exitCode = 2
    return
  }
  const minimumLiteralLength = Number.parseInt(
    args['minimum-literal-length'] ?? '8',
    10,
  )
  if (!Number.isInteger(minimumLiteralLength) || minimumLiteralLength < 1) {
    throw new Error('--minimum-literal-length must be a positive integer')
  }

  const baselinePath = path.resolve(args.baseline)
  const mapPath = path.resolve(args.map)
  const targetPath = path.resolve(args.target)
  const output = path.resolve(args.output)
  ensureEmptyOutput(output)

  console.error('Reading verified artifacts...')
  const baselineText = fs.readFileSync(baselinePath, 'utf8')
  const targetText = fs.readFileSync(targetPath, 'utf8')
  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'))
  console.error('Decoding exact source ownership runs...')
  const ownership = buildOwnershipRuns(map, baselineText)
  console.error('Locating stable exact literals...')
  const literalReport = locateExactLiteralAnchors(
    baselinePath,
    targetPath,
    { minimumLiteralLength, previewLength: 100 },
  )

  const anchorOwners = new Map()
  for (const anchor of literalReport.anchors) {
    anchorOwners.set(
      anchor.id,
      ownerForOffset(ownership.runs, anchor.baseline.offset),
    )
  }
  const baselineInitializers = initializerBoundaries(baselineText)
  const targetInitializers = initializerBoundaries(targetText)
  const baselineInitializerStarts =
    baselineInitializers.boundaries.map(unit => unit.expressionOffset)

  const targetSortedAnchors = [...literalReport.anchors].sort(
    (left, right) => left.target.offset - right.target.offset,
  )
  const nonMonotoneAnchors = targetSortedAnchors.filter(
    anchor => !anchor.monotone,
  )

  const targetUnits = targetInitializers.boundaries.map(unit => {
    const anchors = anchorsInRange(
      targetSortedAnchors,
      unit.regionStart,
      unit.regionEnd,
      'target',
    )
    const sourceVotes = countVotes(
      anchors.map(anchor => anchorOwners.get(anchor.id).sourceIndex),
    )
    const baselineUnitVotes = countVotes(
      anchors.map(anchor => {
        const offset = anchor.baseline.offset
        const index = upperBound(baselineInitializerStarts, offset) - 1
        return index >= 0 ? index : null
      }),
    )
    let status = 'unresolved-no-unique-literal'
    if (baselineUnitVotes.length === 1) {
      status = 'anchored-single-baseline-unit'
    } else if (baselineUnitVotes.length > 1) {
      status = 'anchored-multiple-baseline-units'
    }
    return {
      ...unit,
      utf16Length: unit.regionEnd - unit.regionStart,
      status,
      uniqueLiteralAnchorCount: anchors.length,
      sourceVotes,
      baselineInitializerVotes: baselineUnitVotes,
    }
  })

  const sourceRecords = ownership.runs.map(run => ({
    ...run,
    exactAnchorCount: 0,
    monotoneAnchorCount: 0,
    nonMonotoneAnchorCount: 0,
    targetAnchorClusters: [],
    partitionEvidence: {
      exactGeneratedCount: 0,
      exactGeneratedTargetUtf16: 0,
      changedHighConfidenceCount: 0,
      changedHighConfidenceTargetUtf16: 0,
      candidateCount: 0,
    },
  }))
  const sourceRecordByIndex = new Map(
    sourceRecords.map(source => [source.sourceIndex, source]),
  )
  for (const anchor of targetSortedAnchors) {
    const owner = anchorOwners.get(anchor.id)
    if (owner.sourceIndex === null) continue
    const source = sourceRecordByIndex.get(owner.sourceIndex)
    if (!source) throw new Error(`Missing source record ${owner.sourceIndex}`)
    source.exactAnchorCount += 1
    if (anchor.monotone) source.monotoneAnchorCount += 1
    else source.nonMonotoneAnchorCount += 1
  }

  let currentCluster = null
  for (const anchor of targetSortedAnchors) {
    const owner = anchorOwners.get(anchor.id)
    if (owner.sourceIndex === null) {
      currentCluster = null
      continue
    }
    if (!currentCluster || currentCluster.sourceIndex !== owner.sourceIndex) {
      currentCluster = {
        sourceIndex: owner.sourceIndex,
        targetStart: anchor.target.offset,
        targetEnd: anchor.target.endOffset,
        anchorCount: 1,
        monotoneAnchorCount: anchor.monotone ? 1 : 0,
        sampleLiteralSha256: anchor.literal.sha256,
        sampleLiteralPreview: anchor.literal.preview,
      }
      const source = sourceRecordByIndex.get(owner.sourceIndex)
      if (!source) throw new Error(`Missing source record ${owner.sourceIndex}`)
      source.targetAnchorClusters.push(currentCluster)
    } else {
      currentCluster.targetEnd = Math.max(
        currentCluster.targetEnd,
        anchor.target.endOffset,
      )
      currentCluster.anchorCount += 1
      if (anchor.monotone) currentCluster.monotoneAnchorCount += 1
    }
  }

  const anchorById = new Map(
    literalReport.anchors.map(anchor => [anchor.id, anchor]),
  )
  const partitionRecords = []
  const coverage = {
    partitionCount: 0,
    targetPartitionUtf16: 0,
    exactAnchorCount: literalReport.summary.monotoneAnchorCount,
    exactAnchorTargetUtf16: 0,
    exactGeneratedPartitionCount: 0,
    exactGeneratedTargetUtf16: 0,
    changedHighConfidencePartitionCount: 0,
    changedHighConfidenceTargetUtf16: 0,
    changedCandidatePartitionCount: 0,
    changedCandidateTargetUtf16: 0,
    unresolvedPartitionCount: 0,
    unresolvedTargetUtf16: 0,
  }
  for (const anchor of literalReport.anchors) {
    if (anchor.monotone) {
      coverage.exactAnchorTargetUtf16 +=
        anchor.target.endOffset - anchor.target.offset
    }
  }

  for (const partition of literalReport.partitions) {
    const left = partition.leftAnchorId
      ? anchorById.get(partition.leftAnchorId)
      : null
    const right = partition.rightAnchorId
      ? anchorById.get(partition.rightAnchorId)
      : null
    const leftOwner = left
      ? anchorOwners.get(left.id).sourceIndex
      : null
    const rightOwner = right
      ? anchorOwners.get(right.id).sourceIndex
      : null
    const sourceCandidates = sourceRangeForOffsets(
      ownership.runs,
      partition.baseline.offsetStart,
      partition.baseline.offsetEnd,
    )
    const relocatedSourceCandidates = [
      ...new Set(
        anchorsInRange(
          nonMonotoneAnchors,
          partition.target.offsetStart,
          partition.target.offsetEnd,
          'target',
        )
          .map(anchor => anchorOwners.get(anchor.id).sourceIndex)
          .filter(value => value !== null),
      ),
    ].sort((leftValue, rightValue) => leftValue - rightValue)
    const baselineSlice = baselineText.slice(
      partition.baseline.offsetStart,
      partition.baseline.offsetEnd,
    )
    const targetSlice = targetText.slice(
      partition.target.offsetStart,
      partition.target.offsetEnd,
    )
    const rawIdentical = baselineSlice === targetSlice
    let classification
    let confidence
    let attributedSourceIndex = null
    if (rawIdentical) {
      classification = 'exact-generated'
      confidence = sourceCandidates.length > 0 ? 'high' : 'unresolved'
    } else if (
      leftOwner !== null &&
      leftOwner === rightOwner &&
      sourceCandidates.every(value => value === leftOwner) &&
      relocatedSourceCandidates.length === 0
    ) {
      classification = 'changed-same-source'
      confidence = 'high'
      attributedSourceIndex = leftOwner
    } else if (
      sourceCandidates.length > 0 ||
      relocatedSourceCandidates.length > 0
    ) {
      classification = 'changed-source-candidates'
      confidence = 'candidate'
    } else {
      classification = 'unresolved-target-gap'
      confidence = 'unresolved'
    }
    if (
      attributedSourceIndex === null &&
      rawIdentical &&
      sourceCandidates.length === 1
    ) {
      attributedSourceIndex = sourceCandidates[0]
    }

    const targetLength = partition.target.utf16Length
    coverage.partitionCount += 1
    coverage.targetPartitionUtf16 += targetLength
    if (classification === 'exact-generated') {
      coverage.exactGeneratedPartitionCount += 1
      coverage.exactGeneratedTargetUtf16 += targetLength
    } else if (confidence === 'high') {
      coverage.changedHighConfidencePartitionCount += 1
      coverage.changedHighConfidenceTargetUtf16 += targetLength
    } else if (confidence === 'candidate') {
      coverage.changedCandidatePartitionCount += 1
      coverage.changedCandidateTargetUtf16 += targetLength
    } else {
      coverage.unresolvedPartitionCount += 1
      coverage.unresolvedTargetUtf16 += targetLength
    }

    if (attributedSourceIndex !== null) {
      const source = sourceRecordByIndex.get(attributedSourceIndex)
      if (!source) {
        throw new Error(`Missing source record ${attributedSourceIndex}`)
      }
      if (rawIdentical) {
        source.partitionEvidence.exactGeneratedCount += 1
        source.partitionEvidence.exactGeneratedTargetUtf16 += targetLength
      } else {
        source.partitionEvidence.changedHighConfidenceCount += 1
        source.partitionEvidence.changedHighConfidenceTargetUtf16 +=
          targetLength
      }
    } else {
      for (const sourceIndex of new Set([
        ...sourceCandidates,
        ...relocatedSourceCandidates,
      ])) {
        const source = sourceRecordByIndex.get(sourceIndex)
        if (!source) throw new Error(`Missing source record ${sourceIndex}`)
        source.partitionEvidence.candidateCount += 1
      }
    }

    partitionRecords.push({
      id: partition.id,
      leftAnchorId: partition.leftAnchorId,
      rightAnchorId: partition.rightAnchorId,
      baseline: {
        ...partition.baseline,
        sha256: sha256(baselineSlice),
      },
      target: {
        ...partition.target,
        sha256: sha256(targetSlice),
      },
      deltas: partition.deltas,
      rawIdentical,
      classification,
      confidence,
      attributedSourceIndex,
      boundarySourceIndices: {
        left: leftOwner,
        right: rightOwner,
      },
      sourceCandidates,
      relocatedSourceCandidates,
    })
  }

  const accountedTargetUtf16 =
    coverage.targetPartitionUtf16 + coverage.exactAnchorTargetUtf16
  if (accountedTargetUtf16 !== targetText.length) {
    throw new Error(
      `Target coverage mismatch: ${accountedTargetUtf16} != ${targetText.length}`,
    )
  }
  coverage.accountedTargetUtf16 = accountedTargetUtf16
  coverage.targetUtf16 = targetText.length
  coverage.unaccountedTargetUtf16 = 0

  const reportFiles = {
    sources: 'sources.jsonl.gz',
    targetInitializers: 'target-initializers.jsonl.gz',
    targetPartitions: 'target-partitions.jsonl.gz',
  }
  fs.writeFileSync(
    path.join(output, reportFiles.sources),
    gzipJsonLines(sourceRecords),
  )
  fs.writeFileSync(
    path.join(output, reportFiles.targetInitializers),
    gzipJsonLines(targetUnits),
  )
  fs.writeFileSync(
    path.join(output, reportFiles.targetPartitions),
    gzipJsonLines(partitionRecords),
  )

  const sourceKinds = sourceRecords.reduce(
    (counts, source) => {
      if (source.source.startsWith('../src/')) counts.application += 1
      else if (source.source.startsWith('../node_modules/')) {
        counts.nodeModules += 1
      } else if (source.source.startsWith('../vendor/')) counts.vendor += 1
      return counts
    },
    { application: 0, nodeModules: 0, vendor: 0 },
  )
  const initializerStatuses = targetUnits.reduce((counts, unit) => {
    counts[unit.status] = (counts[unit.status] ?? 0) + 1
    return counts
  }, {})
  const locatedSources = sourceRecords.filter(
    source => source.exactAnchorCount > 0,
  )
  const splitSources = sourceRecords.filter(
    source => source.targetAnchorClusters.length > 1,
  )
  const outputEvidence = {}
  for (const [key, relative] of Object.entries(reportFiles)) {
    outputEvidence[key] = {
      path: relative,
      ...evidence(path.join(output, relative)),
    }
  }

  const summary = {
    schemaVersion: 1,
    kind: 'generated-source-ownership-and-attribution-inventory',
    offsetUnit: 'utf16-code-units',
    claim:
      'Exhaustive generated-offset accounting with exact baseline source ownership; target source identities are evidence-ranked and unresolved where anchors are insufficient.',
    artifacts: {
      baselineBundle: evidence(baselinePath),
      baselineSourceMap: evidence(mapPath),
      targetBundle: evidence(targetPath),
    },
    options: { minimumLiteralLength },
    baselineOwnership: {
      sourceCount: sourceRecords.length,
      sourceKinds,
      mappedSegmentCount: ownership.mappedSegmentCount,
      contiguousRunCount: ownership.runs.length,
      eachSourceHasExactlyOneContiguousRun: true,
      generatedHeaderUtf16: ownership.runs[0].mappedStart.offset,
    },
    literalEvidence: {
      ...literalReport.summary,
      locatedSourceCount: locatedSources.length,
      locatedApplicationSourceCount: locatedSources.filter(source =>
        source.source.startsWith('../src/'),
      ).length,
      splitTargetClusterSourceCount: splitSources.length,
    },
    initializerEvidence: {
      baseline: {
        wrapperNames: baselineInitializers.wrappers,
        count: baselineInitializers.boundaries.length,
      },
      target: {
        wrapperNames: targetInitializers.wrappers,
        count: targetInitializers.boundaries.length,
        statuses: initializerStatuses,
      },
      targetNetCountDelta:
        targetInitializers.boundaries.length -
        baselineInitializers.boundaries.length,
    },
    coverage,
    releaseEvidence: releaseEvidence(args),
    reportFiles: outputEvidence,
    limitations: [
      'Exact source ownership exists only for the baseline source map.',
      'Initializer regions are delimited by successive Bun wrapper-expression starts; they are generated units, not asserted one-to-one source modules.',
      'A target initializer with no unique long literal is unresolved, not automatically target-only.',
      'Candidate ranges can include moved code; non-monotone literal owners are reported separately.',
      'Raw-different partitions include harmless minifier-name churn as well as semantic changes.',
      'No target source text is claimed reconstructed by this inventory.',
    ],
  }
  fs.writeFileSync(
    path.join(output, 'summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
  )
  console.log(JSON.stringify(summary, null, 2))
}

try {
  main()
} catch (error) {
  console.error(error.stack ?? error)
  process.exitCode = 1
}
