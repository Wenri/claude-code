import fs from 'node:fs'

const BASE64 =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const BASE64_VALUES = new Map(
  [...BASE64].map((character, index) => [character, index]),
)

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

/**
 * Validate the mapping stream and return bounded summary data. This deliberately
 * does not materialize decoded mappings: a production bundle can contain
 * millions of segments.
 */
export function summarizeSourceMap(map) {
  if (map.version !== 3) {
    throw new Error(`Unsupported source-map version: ${map.version}`)
  }
  if (!Array.isArray(map.sources) || !Array.isArray(map.sourcesContent)) {
    throw new Error('Source map must contain sources and sourcesContent arrays')
  }
  if (map.sources.length !== map.sourcesContent.length) {
    throw new Error('sources and sourcesContent have different lengths')
  }

  let sourceIndex = 0
  let originalLine = 0
  let originalColumn = 0
  let nameIndex = 0
  let segmentCount = 0
  let mappedSegmentCount = 0
  const usedSources = new Set()
  const generatedLines = map.mappings.split(';')

  for (const encodedLine of generatedLines) {
    let generatedColumn = 0
    if (!encodedLine) continue

    for (const encoded of encodedLine.split(',')) {
      if (!encoded) continue
      const fields = decodeSegment(encoded)
      if (![1, 4, 5].includes(fields.length)) {
        throw new Error(`Invalid source-map segment arity: ${fields.length}`)
      }
      generatedColumn += fields[0]
      if (generatedColumn < 0) {
        throw new Error('Generated source-map column became negative')
      }
      segmentCount += 1

      if (fields.length >= 4) {
        sourceIndex += fields[1]
        originalLine += fields[2]
        originalColumn += fields[3]
        if (fields.length === 5) nameIndex += fields[4]
        if (sourceIndex < 0 || sourceIndex >= map.sources.length) {
          throw new Error(`Source-map source index out of range: ${sourceIndex}`)
        }
        if (originalLine < 0 || originalColumn < 0 || nameIndex < 0) {
          throw new Error('Source-map original position became negative')
        }
        mappedSegmentCount += 1
        usedSources.add(sourceIndex)
      }
    }
  }

  return {
    generatedLineCount: generatedLines.length,
    segmentCount,
    mappedSegmentCount,
    sourceCount: map.sources.length,
    usedSourceCount: usedSources.size,
  }
}

/**
 * Decode only requested generated lines while retaining the source-map delta
 * state required to interpret them.
 */
export function loadSelectedMappings(filename, requestedLines) {
  const map = JSON.parse(fs.readFileSync(filename, 'utf8'))
  const wanted = new Set(requestedLines)
  const selected = new Map()
  const generatedLines = map.mappings.split(';')

  let sourceIndex = 0
  let originalLine = 0
  let originalColumn = 0
  let nameIndex = 0

  for (
    let generatedLine = 0;
    generatedLine < generatedLines.length;
    generatedLine += 1
  ) {
    let generatedColumn = 0
    const mappings = []
    const encodedSegments = generatedLines[generatedLine]

    if (encodedSegments) {
      for (const encoded of encodedSegments.split(',')) {
        if (!encoded) continue
        const fields = decodeSegment(encoded)
        generatedColumn += fields[0]
        if (fields.length >= 4) {
          sourceIndex += fields[1]
          originalLine += fields[2]
          originalColumn += fields[3]
          if (fields.length >= 5) nameIndex += fields[4]
          if (wanted.has(generatedLine)) {
            mappings.push({
              generatedColumn,
              sourceIndex,
              source: map.sources[sourceIndex],
              originalLine,
              originalColumn,
              nameIndex: fields.length >= 5 ? nameIndex : null,
            })
          }
        } else if (wanted.has(generatedLine)) {
          mappings.push({ generatedColumn })
        }
      }
    }

    if (wanted.has(generatedLine)) selected.set(generatedLine, mappings)
  }

  return {
    sources: map.sources,
    selected,
  }
}

export function originalPositionFor(selectedMappings, line, column) {
  const segments = selectedMappings.selected.get(line)
  if (!segments?.length) return null

  let candidate = null
  for (const segment of segments) {
    if (segment.generatedColumn > column) break
    if (segment.source !== undefined) candidate = segment
  }
  return candidate
}
