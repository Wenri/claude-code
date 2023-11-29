import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { tokenizer } from 'acorn'

const SCHEMA_VERSION = 1
const LITERAL_TOKEN_KINDS = new Set([
  'num',
  'regexp',
  'string',
  'template',
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function incrementCount(value) {
  return value >= 2 ? 2 : value + 1
}

function lineStartsFor(text) {
  const starts = [0]
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) starts.push(index + 1)
  }
  return starts
}

function locationForOffset(lineStarts, offset) {
  let low = 0
  let high = lineStarts.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (lineStarts[middle] <= offset) low = middle + 1
    else high = middle
  }
  const line = low - 1
  return {
    line,
    column: offset - lineStarts[line],
  }
}

function artifactEvidence(filename, buffer, tokenCount, literalTokenCount) {
  return {
    path: path.resolve(filename),
    bytes: buffer.length,
    sha256: sha256(buffer),
    tokenCount,
    literalTokenCount,
  }
}

function tokenizeFile(filename, onLiteral, minimumLiteralLength) {
  const buffer = fs.readFileSync(filename)
  const text = buffer.toString('utf8')
  const iterator = tokenizer(text, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    locations: false,
    sourceType: 'module',
  })
  let tokenCount = 0
  let literalTokenCount = 0

  while (true) {
    const token = iterator.getToken()
    if (token.type.label === 'eof') break

    const tokenIndex = tokenCount
    tokenCount += 1
    if (!LITERAL_TOKEN_KINDS.has(token.type.label)) continue

    literalTokenCount += 1
    const raw = text.slice(token.start, token.end)
    if (raw.length < minimumLiteralLength) continue
    onLiteral({
      end: token.end,
      kind: token.type.label,
      raw,
      start: token.start,
      tokenIndex,
    })
  }

  return {
    evidence: artifactEvidence(
      filename,
      buffer,
      tokenCount,
      literalTokenCount,
    ),
    lineStarts: lineStartsFor(text),
    utf16Length: text.length,
  }
}

function positionWithLocation(position, lineStarts) {
  return {
    offset: position.start,
    endOffset: position.end,
    tokenIndex: position.tokenIndex,
    ...locationForOffset(lineStarts, position.start),
  }
}

/**
 * Return the indices of one deterministic strictly-increasing subsequence.
 * Values are expected to be unique target token offsets.
 */
export function longestIncreasingSubsequenceIndices(values) {
  if (values.length === 0) return []

  const predecessor = new Int32Array(values.length)
  predecessor.fill(-1)
  const tailIndices = []
  const tailValues = []

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    let low = 0
    let high = tailValues.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (tailValues[middle] < value) low = middle + 1
      else high = middle
    }

    if (low > 0) predecessor[index] = tailIndices[low - 1]
    tailValues[low] = value
    tailIndices[low] = index
  }

  const result = new Array(tailIndices.length)
  let current = tailIndices[tailIndices.length - 1]
  for (let index = result.length - 1; index >= 0; index -= 1) {
    result[index] = current
    current = predecessor[current]
  }
  return result
}

function makePartition(
  index,
  left,
  right,
  baseline,
  target,
) {
  const baselineTokenStart = left ? left.baseline.tokenIndex + 1 : 0
  const baselineTokenEnd = right
    ? right.baseline.tokenIndex
    : baseline.evidence.tokenCount
  const targetTokenStart = left ? left.target.tokenIndex + 1 : 0
  const targetTokenEnd = right
    ? right.target.tokenIndex
    : target.evidence.tokenCount
  const baselineOffsetStart = left ? left.baseline.endOffset : 0
  const baselineOffsetEnd = right
    ? right.baseline.offset
    : baseline.utf16Length
  const targetOffsetStart = left ? left.target.endOffset : 0
  const targetOffsetEnd = right
    ? right.target.offset
    : target.utf16Length

  const baselineTokenCount = baselineTokenEnd - baselineTokenStart
  const targetTokenCount = targetTokenEnd - targetTokenStart
  const baselineUtf16Length = baselineOffsetEnd - baselineOffsetStart
  const targetUtf16Length = targetOffsetEnd - targetOffsetStart

  return {
    id: `partition-${String(index + 1).padStart(6, '0')}`,
    leftAnchorId: left?.id ?? null,
    rightAnchorId: right?.id ?? null,
    baseline: {
      offsetStart: baselineOffsetStart,
      offsetEnd: baselineOffsetEnd,
      tokenStart: baselineTokenStart,
      tokenEnd: baselineTokenEnd,
      tokenCount: baselineTokenCount,
      utf16Length: baselineUtf16Length,
    },
    target: {
      offsetStart: targetOffsetStart,
      offsetEnd: targetOffsetEnd,
      tokenStart: targetTokenStart,
      tokenEnd: targetTokenEnd,
      tokenCount: targetTokenCount,
      utf16Length: targetUtf16Length,
    },
    deltas: {
      tokenCount: targetTokenCount - baselineTokenCount,
      utf16Length: targetUtf16Length - baselineUtf16Length,
    },
    requiresStrictVerification: true,
  }
}

/**
 * Locate exact literal anchors shared uniquely by two generated JavaScript
 * bundles. This is deliberately a sparse, coarse locator. It does not prove
 * that text between anchors is unchanged.
 */
export function locateExactLiteralAnchors(
  baselineFilename,
  targetFilename,
  options = {},
) {
  const minimumLiteralLength = options.minimumLiteralLength ?? 8
  const previewLength = options.previewLength ?? 120
  if (
    !Number.isInteger(minimumLiteralLength) ||
    minimumLiteralLength < 1
  ) {
    throw new Error('minimumLiteralLength must be a positive integer')
  }
  if (!Number.isInteger(previewLength) || previewLength < 0) {
    throw new Error('previewLength must be a non-negative integer')
  }

  // One table is shared by both scans. Counts saturate at two because only
  // literals occurring exactly once on each side can become anchors.
  const candidates = new Map()
  const baseline = tokenizeFile(
    baselineFilename,
    literal => {
      const key = `${literal.kind}\0${literal.raw}`
      const current = candidates.get(key)
      if (current) {
        current.baselineCount = incrementCount(current.baselineCount)
        current.baseline = null
      } else {
        candidates.set(key, {
          baselineCount: 1,
          targetCount: 0,
          baseline: literal,
          target: null,
        })
      }
    },
    minimumLiteralLength,
  )

  const target = tokenizeFile(
    targetFilename,
    literal => {
      const key = `${literal.kind}\0${literal.raw}`
      const current = candidates.get(key)
      if (!current) return
      current.targetCount = incrementCount(current.targetCount)
      current.target = current.targetCount === 1 ? literal : null
    },
    minimumLiteralLength,
  )

  const common = []
  for (const [key, candidate] of candidates) {
    if (
      candidate.baselineCount !== 1 ||
      candidate.targetCount !== 1 ||
      !candidate.baseline ||
      !candidate.target
    ) {
      continue
    }
    common.push({
      key,
      baseline: candidate.baseline,
      target: candidate.target,
    })
  }
  common.sort(
    (left, right) =>
      left.baseline.tokenIndex - right.baseline.tokenIndex,
  )

  const lisIndices = longestIncreasingSubsequenceIndices(
    common.map(anchor => anchor.target.tokenIndex),
  )
  const lisSet = new Set(lisIndices)
  const monotoneRank = new Map(
    lisIndices.map((commonIndex, rank) => [commonIndex, rank]),
  )

  const anchors = common.map((anchor, index) => {
    const separator = anchor.key.indexOf('\0')
    const kind = anchor.key.slice(0, separator)
    const raw = anchor.key.slice(separator + 1)
    return {
      id: `anchor-${String(index + 1).padStart(6, '0')}`,
      monotone: lisSet.has(index),
      monotoneIndex: monotoneRank.get(index) ?? null,
      literal: {
        kind,
        utf16Length: raw.length,
        sha256: sha256(anchor.key),
        preview:
          raw.length <= previewLength
            ? raw
            : `${raw.slice(0, previewLength)}…`,
      },
      baseline: positionWithLocation(
        anchor.baseline,
        baseline.lineStarts,
      ),
      target: positionWithLocation(anchor.target, target.lineStarts),
    }
  })

  const monotoneAnchors = lisIndices.map(index => anchors[index])
  const partitions = []
  for (let index = 0; index <= monotoneAnchors.length; index += 1) {
    partitions.push(
      makePartition(
        index,
        index === 0 ? null : monotoneAnchors[index - 1],
        index === monotoneAnchors.length
          ? null
          : monotoneAnchors[index],
        baseline,
        target,
      ),
    )
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'sparse-exact-literal-locator',
    claim:
      'Coarse location evidence only; unchanged regions require a separate scope-aware strict verifier.',
    options: {
      minimumLiteralLength,
      previewLength,
    },
    baseline: {
      ...baseline.evidence,
      utf16Length: baseline.utf16Length,
    },
    target: {
      ...target.evidence,
      utf16Length: target.utf16Length,
    },
    summary: {
      uniqueCommonAnchorCount: anchors.length,
      monotoneAnchorCount: monotoneAnchors.length,
      nonMonotoneAnchorCount: anchors.length - monotoneAnchors.length,
      monotoneFraction:
        anchors.length === 0
          ? 1
          : monotoneAnchors.length / anchors.length,
      partitionCount: partitions.length,
      tokenCountDelta:
        target.evidence.tokenCount - baseline.evidence.tokenCount,
      utf16LengthDelta: target.utf16Length - baseline.utf16Length,
    },
    limitations: [
      'Only exact num, regexp, string, and template tokens at or above the configured length are anchors.',
      'Duplicate literals and literals present on only one side are not anchors.',
      'The LIS is monotone; moved regions are reported as non-monotone anchors and require secondary matching.',
      'Comments, identifier bindings, property semantics, and control flow are not verified.',
      'Every partition is a candidate window and must be checked by a scope-aware strict verifier.',
    ],
    anchors,
    partitions,
  }
}

