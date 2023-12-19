import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { parse, tokenizer } from 'acorn'
import { analyze as analyzeScopes } from 'eslint-scope'

const PARSE_OPTIONS = {
  allowHashBang: true,
  ecmaVersion: 'latest',
  ranges: true,
  sourceType: 'module',
}

const SCOPE_OPTIONS = {
  ecmaVersion: 2024,
  fallback: 'iteration',
  ignoreEval: true,
  impliedStrict: true,
  optimistic: false,
  sourceType: 'module',
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function framedHash(parts) {
  const hash = crypto.createHash('sha256')
  for (const part of parts) {
    const value = String(part)
    hash.update(String(Buffer.byteLength(value)))
    hash.update(':')
    hash.update(value)
    hash.update('\0')
  }
  return hash.digest('hex')
}

function tokenRaw(source, token) {
  return source.slice(token.start, token.end)
}

function tokenRecords(source) {
  const records = []
  const iterator = tokenizer(source, PARSE_OPTIONS)
  while (true) {
    const token = iterator.getToken()
    if (token.type.label === 'eof') break
    records.push({
      end: token.end,
      label: token.type.label,
      raw: tokenRaw(source, token),
      start: token.start,
    })
  }
  return records
}

function earliestIdentifierStart(variable) {
  let result = Number.POSITIVE_INFINITY
  for (const identifier of variable.identifiers) {
    result = Math.min(result, identifier.start)
  }
  for (const reference of variable.references) {
    result = Math.min(result, reference.identifier.start)
  }
  return result
}

function scopePosition(scope) {
  return [
    scope.block?.start ?? Number.POSITIVE_INFINITY,
    scope.block?.end ?? Number.POSITIVE_INFINITY,
    scope.type,
  ]
}

function compareTuple(left, right) {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] < right[index]) return -1
    if (left[index] > right[index]) return 1
  }
  return left.length - right.length
}

function scopeIdentity(program) {
  const manager = analyzeScopes(program, SCOPE_OPTIONS)
  const scopes = [...manager.scopes].sort((left, right) =>
    compareTuple(scopePosition(left), scopePosition(right)),
  )
  const moduleScope =
    scopes.find(scope => scope.type === 'module' && scope.block === program) ??
    scopes.find(scope => scope.type === 'module') ??
    manager.globalScope
  const identifierAt = new Map()
  const topDefinitions = []

  for (let scopeIndex = 0; scopeIndex < scopes.length; scopeIndex += 1) {
    const scope = scopes[scopeIndex]
    const variables = [...scope.variables]
      .filter(variable => variable.identifiers.length > 0)
      .sort((left, right) => {
        const difference =
          earliestIdentifierStart(left) - earliestIdentifierStart(right)
        return difference || left.name.localeCompare(right.name)
      })
    for (
      let variableIndex = 0;
      variableIndex < variables.length;
      variableIndex += 1
    ) {
      const variable = variables[variableIndex]
      const topLevel = scope === moduleScope
      const tag = topLevel
        ? `T${variableIndex}`
        : `S${scopeIndex}V${variableIndex}`
      for (const identifier of variable.identifiers) {
        identifierAt.set(identifier.start, {
          kind: topLevel ? 'top' : 'local',
          name: variable.name,
          tag,
        })
      }
      for (const reference of variable.references) {
        identifierAt.set(reference.identifier.start, {
          kind: topLevel ? 'top' : 'local',
          name: variable.name,
          tag,
        })
      }
      if (topLevel) {
        topDefinitions.push({
          name: variable.name,
          slot: variableIndex,
          start: earliestIdentifierStart(variable),
        })
      }
    }
  }

  for (const scope of scopes) {
    for (const reference of scope.through) {
      if (reference.resolved) continue
      const identifier = reference.identifier
      if (!identifierAt.has(identifier.start)) {
        identifierAt.set(identifier.start, {
          kind: 'free',
          name: identifier.name,
          tag: null,
        })
      }
    }
  }

  return { identifierAt, topDefinitions }
}

function normalizedTokenParts(tokens, identity, globalBindings, coarse) {
  const parts = []
  let unknownFreeIdentifierCount = 0
  for (const token of tokens) {
    let value = token.raw
    if (token.label === 'name') {
      const identifier = identity.identifierAt.get(token.start)
      if (identifier) {
        if (coarse) {
          value = '@identifier'
        } else if (identifier.kind === 'free') {
          const global = globalBindings?.get(identifier.name)
          if (global === undefined) {
            value = `free:${identifier.name}`
            unknownFreeIdentifierCount += 1
          } else {
            value = `global:${global}`
          }
        } else {
          value = identifier.tag
        }
      } else {
        // Non-reference identifiers are property, label, import/export, or
        // other runtime names. Their exact spelling is semantically relevant.
        value = `name:${value}`
      }
    }
    parts.push(token.label, value)
  }
  return { parts, unknownFreeIdentifierCount }
}

function analyzeUnitSource(source) {
  const program = parse(source, PARSE_OPTIONS)
  const tokens = tokenRecords(source)
  const identity = scopeIdentity(program)
  const coarse = normalizedTokenParts(tokens, identity, null, true)
  return {
    coarseHash: framedHash(coarse.parts),
    identity,
    nodeType:
      program.body.length === 1 ? program.body[0].type : 'ProgramFragment',
    tokenCount: tokens.length,
    tokens,
    topDefinitions: identity.topDefinitions,
  }
}

function topLevelSemicolonBoundaries(source) {
  const result = []
  const iterator = tokenizer(source, PARSE_OPTIONS)
  let braces = 0
  let brackets = 0
  let parentheses = 0
  let tokenCount = 0
  while (true) {
    const token = iterator.getToken()
    const label = token.type.label
    if (label === 'eof') break
    tokenCount += 1
    if (label === '(') parentheses += 1
    else if (label === ')') parentheses -= 1
    else if (label === '[') brackets += 1
    else if (label === ']') brackets -= 1
    else if (label === '{' || label === '${') braces += 1
    else if (label === '}') braces -= 1
    else if (
      label === ';' &&
      braces === 0 &&
      brackets === 0 &&
      parentheses === 0
    ) {
      result.push(token.end)
    }
    if (braces < 0 || brackets < 0 || parentheses < 0) {
      throw new Error(`Unbalanced token stream near UTF-16 offset ${token.start}`)
    }
  }
  if (braces !== 0 || brackets !== 0 || parentheses !== 0) {
    throw new Error('Unbalanced token stream at end of bundle')
  }
  return { boundaries: result, tokenCount }
}

function lineStartsFor(source) {
  const starts = [0]
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) starts.push(index + 1)
  }
  return starts
}

function locationForOffset(starts, offset) {
  let low = 0
  let high = starts.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (starts[middle] <= offset) low = middle + 1
    else high = middle
  }
  const line = low - 1
  return { line, column: offset - starts[line] }
}

function parsePartition(source) {
  const scan = topLevelSemicolonBoundaries(source)
  const boundaries = [...scan.boundaries]
  if (boundaries.at(-1) !== source.length) boundaries.push(source.length)
  const units = []
  const failures = []
  let groupStart = 0

  for (const end of boundaries) {
    const fragment = source.slice(groupStart, end)
    let program
    try {
      program = parse(fragment, PARSE_OPTIONS)
    } catch {
      continue
    }
    for (const node of program.body) {
      const start = groupStart + node.start
      const nodeEnd = groupStart + node.end
      const unitSource = source.slice(start, nodeEnd)
      try {
        const analysis = analyzeUnitSource(unitSource)
        units.push({
          ...analysis,
          end: nodeEnd,
          parseStatus: 'parsed',
          sourceHash: sha256(unitSource),
          start,
        })
      } catch (error) {
        const tokens = tokenRecords(unitSource)
        units.push({
          coarseHash: null,
          end: nodeEnd,
          error: error instanceof Error ? error.message : String(error),
          identity: null,
          nodeType: node.type,
          parseStatus: 'scope-unresolved',
          sourceHash: sha256(unitSource),
          start,
          tokenCount: tokens.length,
          tokens,
          topDefinitions: [],
        })
      }
    }
    groupStart = end
  }

  if (groupStart < source.length && source.slice(groupStart).trim()) {
    const tail = source.slice(groupStart)
    const tokens = tokenRecords(tail)
    failures.push({
      end: source.length,
      error: 'No parseable top-level semicolon-delimited suffix',
      start: groupStart,
      tokenCount: tokens.length,
    })
  }

  const unitTokenCount = units.reduce(
    (sum, unit) => sum + unit.tokenCount,
    0,
  )
  const failureTokenCount = failures.reduce(
    (sum, failure) => sum + failure.tokenCount,
    0,
  )
  return {
    failures,
    scannedTokenCount: scan.tokenCount,
    units,
    accountedTokenCount: unitTokenCount + failureTokenCount,
  }
}

function publicUnit(unit, starts, index) {
  return {
    index,
    nodeType: unit.nodeType,
    parseStatus: unit.parseStatus,
    start: unit.start,
    end: unit.end,
    tokenCount: unit.tokenCount,
    sourceHash: unit.sourceHash,
    coarseHash: unit.coarseHash,
    location: locationForOffset(starts, unit.start),
    topDefinitionCount: unit.topDefinitions.length,
    ...(unit.error ? { error: unit.error } : {}),
  }
}

export function indexGeneratedBundle(filename) {
  const resolved = path.resolve(filename)
  const buffer = fs.readFileSync(resolved)
  const source = buffer.toString('utf8')
  const partition = parsePartition(source)
  const lineStarts = lineStartsFor(source)
  return {
    evidence: {
      bytes: buffer.length,
      path: resolved,
      sha256: sha256(buffer),
      tokenCount: partition.scannedTokenCount,
      utf16Length: source.length,
    },
    failures: partition.failures,
    lineStarts,
    source,
    units: partition.units,
    publicUnits: partition.units.map((unit, index) =>
      publicUnit(unit, lineStarts, index),
    ),
    tokenAccounting: {
      accounted: partition.accountedTokenCount,
      scanned: partition.scannedTokenCount,
    },
  }
}

function groupIndicesBy(units, key) {
  const result = new Map()
  for (let index = 0; index < units.length; index += 1) {
    const value = units[index][key]
    if (value === null || value === undefined) continue
    const entries = result.get(value) ?? []
    entries.push(index)
    result.set(value, entries)
  }
  return result
}

function buildGlobalBindingMaps(baseline, target) {
  const baselineGroups = groupIndicesBy(baseline.units, 'coarseHash')
  const targetGroups = groupIndicesBy(target.units, 'coarseHash')
  const candidates = []
  for (const [hash, baselineIndices] of baselineGroups) {
    const targetIndices = targetGroups.get(hash)
    if (!targetIndices || baselineIndices.length !== targetIndices.length) {
      continue
    }
    // Equal coarse-hash occurrences are paired in order. The complete token
    // skeleton (including runtime property names and literals) is identical;
    // declaration position then supplies a deterministic alpha-renaming.
    for (
      let occurrence = 0;
      occurrence < baselineIndices.length;
      occurrence += 1
    ) {
      const baselineUnit = baseline.units[baselineIndices[occurrence]]
      const targetUnit = target.units[targetIndices[occurrence]]
      if (
        baselineUnit.topDefinitions.length !==
        targetUnit.topDefinitions.length
      ) {
        continue
      }
      for (
        let slot = 0;
        slot < baselineUnit.topDefinitions.length;
        slot += 1
      ) {
        candidates.push({
          baseline: baselineUnit.topDefinitions[slot].name,
          target: targetUnit.topDefinitions[slot].name,
        })
      }
    }

    // A globally unique coarse unit also provides positional evidence for
    // cross-unit references. Only free/free identifier pairs are admitted;
    // reciprocal one-to-one filtering below rejects ambiguous names.
    if (baselineIndices.length === 1) {
      const baselineUnit = baseline.units[baselineIndices[0]]
      const targetUnit = target.units[targetIndices[0]]
      if (baselineUnit.tokens.length === targetUnit.tokens.length) {
        for (
          let tokenIndex = 0;
          tokenIndex < baselineUnit.tokens.length;
          tokenIndex += 1
        ) {
          const baselineToken = baselineUnit.tokens[tokenIndex]
          const targetToken = targetUnit.tokens[tokenIndex]
          if (
            baselineToken.label !== 'name' ||
            targetToken.label !== 'name'
          ) {
            continue
          }
          const baselineIdentifier =
            baselineUnit.identity.identifierAt.get(baselineToken.start)
          const targetIdentifier =
            targetUnit.identity.identifierAt.get(targetToken.start)
          if (
            baselineIdentifier?.kind === 'free' &&
            targetIdentifier?.kind === 'free'
          ) {
            candidates.push({
              baseline: baselineIdentifier.name,
              target: targetIdentifier.name,
            })
          }
        }
      }
    }
  }

  const byBaseline = new Map()
  const byTarget = new Map()
  for (const candidate of candidates) {
    const baselineTargets = byBaseline.get(candidate.baseline) ?? new Set()
    baselineTargets.add(candidate.target)
    byBaseline.set(candidate.baseline, baselineTargets)
    const targetBaselines = byTarget.get(candidate.target) ?? new Set()
    targetBaselines.add(candidate.baseline)
    byTarget.set(candidate.target, targetBaselines)
  }

  const baselineBindings = new Map()
  const targetBindings = new Map()
  let pairCount = 0
  const sorted = [...byBaseline].sort(([left], [right]) =>
    left.localeCompare(right),
  )
  for (const [baselineName, targetNames] of sorted) {
    if (targetNames.size !== 1) continue
    const targetName = [...targetNames][0]
    if (byTarget.get(targetName)?.size !== 1) continue
    const pairId = `G${pairCount}`
    pairCount += 1
    baselineBindings.set(baselineName, pairId)
    targetBindings.set(targetName, pairId)
  }
  return { baselineBindings, pairCount, targetBindings }
}

function addStrictHashes(index, globals) {
  for (const unit of index.units) {
    if (!unit.identity || !unit.tokens) {
      unit.strictHash = null
      unit.unknownFreeIdentifierCount = 0
      continue
    }
    const normalized = normalizedTokenParts(
      unit.tokens,
      unit.identity,
      globals,
      false,
    )
    unit.strictHash = framedHash(normalized.parts)
    unit.unknownFreeIdentifierCount =
      normalized.unknownFreeIdentifierCount
  }
}

function longestIncreasingSubsequencePairSet(pairs) {
  if (pairs.length === 0) return new Set()
  const predecessor = new Int32Array(pairs.length)
  predecessor.fill(-1)
  const tails = []
  const tailValues = []
  for (let index = 0; index < pairs.length; index += 1) {
    const value = pairs[index].target
    let low = 0
    let high = tailValues.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (tailValues[middle] < value) low = middle + 1
      else high = middle
    }
    if (low > 0) predecessor[index] = tails[low - 1]
    tails[low] = index
    tailValues[low] = value
  }
  const selected = new Set()
  let current = tails.at(-1)
  while (current !== undefined && current >= 0) {
    selected.add(current)
    current = predecessor[current]
  }
  return selected
}

function exactStrictPairs(baseline, target) {
  const baselineGroups = groupIndicesBy(baseline.units, 'strictHash')
  const targetGroups = groupIndicesBy(target.units, 'strictHash')
  const pairs = []
  for (const [hash, baselineIndices] of baselineGroups) {
    const targetIndices = targetGroups.get(hash)
    if (!targetIndices) continue
    const count = Math.min(baselineIndices.length, targetIndices.length)
    for (let index = 0; index < count; index += 1) {
      pairs.push({
        baseline: baselineIndices[index],
        baselineMultiplicity: baselineIndices.length,
        hash,
        target: targetIndices[index],
        targetMultiplicity: targetIndices.length,
      })
    }
  }
  pairs.sort(
    (left, right) =>
      left.baseline - right.baseline || left.target - right.target,
  )
  const lis = longestIncreasingSubsequencePairSet(pairs)
  return pairs.map((pair, index) => ({
    ...pair,
    classification: lis.has(index) ? 'matched' : 'moved',
    moveEvidence:
      !lis.has(index) &&
      pair.baselineMultiplicity === 1 &&
      pair.targetMultiplicity === 1
        ? 'unique-exact-structural-hash'
        : !lis.has(index)
          ? 'duplicate-exact-structural-hash'
          : null,
  }))
}

function changedCoarsePairs(baseline, target, usedBaseline, usedTarget) {
  const baselineGroups = groupIndicesBy(baseline.units, 'coarseHash')
  const targetGroups = groupIndicesBy(target.units, 'coarseHash')
  const result = []
  for (const [hash, baselineIndices] of baselineGroups) {
    const targetIndices = targetGroups.get(hash)
    if (!targetIndices) continue
    const availableBaseline = baselineIndices.filter(
      index => !usedBaseline.has(index),
    )
    const availableTarget = targetIndices.filter(
      index => !usedTarget.has(index),
    )
    if (
      availableBaseline.length === 1 &&
      availableTarget.length === 1
    ) {
      result.push({
        baseline: availableBaseline[0],
        classification: 'changed',
        hash,
        target: availableTarget[0],
      })
    }
  }
  return result
}

function summarizeClassifications(target, targetClassifications) {
  const tokens = {
    changed: 0,
    matched: 0,
    moved: 0,
    unresolved: 0,
  }
  const units = {
    changed: 0,
    matched: 0,
    moved: 0,
    unresolved: 0,
  }
  const moveEvidence = {
    ambiguousDuplicate: { tokens: 0, units: 0 },
    unique: { tokens: 0, units: 0 },
  }
  for (let index = 0; index < target.units.length; index += 1) {
    const pair = targetClassifications.get(index)
    const classification = pair?.classification ?? 'unresolved'
    units[classification] += 1
    tokens[classification] += target.units[index].tokenCount
    if (classification === 'moved') {
      const bucket =
        pair.moveEvidence === 'unique-exact-structural-hash'
          ? moveEvidence.unique
          : moveEvidence.ambiguousDuplicate
      bucket.units += 1
      bucket.tokens += target.units[index].tokenCount
    }
  }
  const classified =
    tokens.changed + tokens.matched + tokens.moved + tokens.unresolved
  return {
    tokens: {
      ...tokens,
      total: target.evidence.tokenCount,
      ledgerTotal: classified,
      resolved:
        tokens.changed + tokens.matched + tokens.moved,
      resolvedFraction:
        target.evidence.tokenCount === 0
          ? 1
          : (tokens.changed + tokens.matched + tokens.moved) /
            target.evidence.tokenCount,
      exactStructuralFraction:
        target.evidence.tokenCount === 0
          ? 1
          : (tokens.matched + tokens.moved) /
            target.evidence.tokenCount,
    },
    units: {
      ...units,
      total: target.units.length,
    },
    moveEvidence,
  }
}

function unitRegion(index, unitIndex, classification, pair) {
  const unit = index.publicUnits[unitIndex]
  return {
    classification,
    target: unit,
    ...(pair === null
      ? {}
      : {
          baselineUnitIndex: pair.baseline,
          pairReason:
            classification === 'changed'
              ? 'unique-coarse-structural-hash'
              : 'exact-scope-normalized-token-hash',
        }),
    unknownFreeIdentifierCount:
      index.units[unitIndex].unknownFreeIdentifierCount ?? 0,
    ...(classification === 'moved'
      ? { moveEvidence: pair.moveEvidence }
      : {}),
  }
}

export function accountGeneratedDelta(
  baselineFilename,
  targetFilename,
) {
  const baseline = indexGeneratedBundle(baselineFilename)
  const target = indexGeneratedBundle(targetFilename)
  const globals = buildGlobalBindingMaps(baseline, target)
  addStrictHashes(baseline, globals.baselineBindings)
  addStrictHashes(target, globals.targetBindings)

  const pairs = exactStrictPairs(baseline, target)
  const usedBaseline = new Set(pairs.map(pair => pair.baseline))
  const usedTarget = new Set(pairs.map(pair => pair.target))
  const changed = changedCoarsePairs(
    baseline,
    target,
    usedBaseline,
    usedTarget,
  )
  for (const pair of changed) {
    pairs.push(pair)
    usedBaseline.add(pair.baseline)
    usedTarget.add(pair.target)
  }

  const targetClassifications = new Map()
  for (const pair of pairs) targetClassifications.set(pair.target, pair)
  const coverage = summarizeClassifications(target, targetClassifications)
  const regions = []
  for (let index = 0; index < target.units.length; index += 1) {
    const pair = targetClassifications.get(index) ?? null
    regions.push(
      unitRegion(
        target,
        index,
        pair?.classification ?? 'unresolved',
        pair,
      ),
    )
  }

  const unmatchedBaseline = baseline.publicUnits.filter(
    (_, index) => !usedBaseline.has(index),
  )
  const unresolvedTarget = regions.filter(
    region => region.classification === 'unresolved',
  )
  const { path: _baselinePath, ...baselineEvidence } = baseline.evidence
  const { path: _targetPath, ...targetEvidence } = target.evidence
  return {
    schemaVersion: 1,
    kind: 'experimental-structural-generated-delta-ledger',
    claim:
      'Complete Acorn-token ledger at top-level statement granularity. Exact matches require scope-normalized token identity; changed pairs use a coarse identifier-insensitive locator and unresolved regions remain explicit. Comments and whitespace are outside token coverage.',
    baseline: {
      ...baselineEvidence,
      failureCount: baseline.failures.length,
      tokenAccounting: baseline.tokenAccounting,
      unitCount: baseline.units.length,
    },
    target: {
      ...targetEvidence,
      failureCount: target.failures.length,
      tokenAccounting: target.tokenAccounting,
      unitCount: target.units.length,
    },
    globalBindingEvidence: {
      pairCount: globals.pairCount,
      source:
        'reciprocal one-to-one declaration slots plus free-reference positions from coarse structural pairs',
    },
    coverage,
    pairCount: pairs.length,
    regions,
    unresolvedTarget,
    unmatchedBaseline,
  }
}

export function encodeStructuralLedger(report, { gzip = false } = {}) {
  const serialized = Buffer.from(`${JSON.stringify(report, null, 2)}\n`)
  return gzip
    ? gzipSync(serialized, { level: 9, mtime: 0 })
    : serialized
}
