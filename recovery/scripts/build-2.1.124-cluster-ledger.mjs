#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function evidence(value) {
  return { bytes: Buffer.byteLength(value), sha256: sha256(value) }
}

function jsonLines(filename) {
  return gunzipSync(fs.readFileSync(filename))
    .toString('utf8')
    .trimEnd()
    .split('\n')
    .map(line => JSON.parse(line))
}

function parseHunks(contents) {
  const hunks = []
  let current = null
  let baselineLine = 0
  let targetLine = 0
  for (const line of contents.split('\n')) {
    const header = line.match(
      /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/,
    )
    if (header) {
      current = {
        id: hunks.length + 1,
        baselineStart: Number(header[1]),
        baselineCount: Number(header[2] ?? 1),
        targetStart: Number(header[3]),
        targetCount: Number(header[4] ?? 1),
        baselineIndices: [],
        targetIndices: [],
      }
      hunks.push(current)
      baselineLine = current.baselineStart
      targetLine = current.targetStart
      continue
    }
    if (!current || line.startsWith('\\ No newline')) continue
    if (line.startsWith('-') && !line.startsWith('---')) {
      current.baselineIndices.push(baselineLine - 1)
      baselineLine += 1
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      current.targetIndices.push(targetLine - 1)
      targetLine += 1
    } else if (line.startsWith(' ')) {
      baselineLine += 1
      targetLine += 1
    }
  }
  return hunks
}

function increment(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1)
}

function boundedLiteral(node) {
  let kind
  let value
  if (node.type === 'TemplateElement') {
    kind = 'template'
    value = node.value.raw
  } else if (node.type === 'Literal') {
    kind = node.regex ? 'regex' : node.bigint !== undefined ? 'bigint' :
      node.value === null ? 'null' : typeof node.value
    value = node.regex ? `${node.regex.pattern}/${node.regex.flags}` :
      node.bigint !== undefined ? node.bigint : JSON.stringify(node.value)
  } else return null
  const text = String(value)
  return text.length <= 500
    ? `${kind}:${text}`
    : `${kind}:sha256:${sha256(text)}:bytes:${Buffer.byteLength(text)}`
}

function isSemanticIdentifier(parent, key) {
  if (!parent) return false
  if (
    (parent.type === 'MemberExpression' ||
      parent.type === 'OptionalMemberExpression') &&
    key === 'property' &&
    !parent.computed
  ) return true
  if (
    ['Property', 'PropertyDefinition', 'MethodDefinition'].includes(parent.type) &&
    key === 'key' &&
    !parent.computed
  ) return true
  if (parent.type === 'MetaProperty') return true
  if (parent.type === 'ImportSpecifier' && key === 'imported') return true
  if (parent.type === 'ExportSpecifier' && key === 'exported') return true
  if (parent.type === 'LabeledStatement' && key === 'label') return true
  if (
    ['BreakStatement', 'ContinueStatement'].includes(parent.type) &&
    key === 'label'
  ) return true
  return false
}

function inventory(nodes) {
  const result = {
    literals: new Map(),
    nodeTypes: new Map(),
    operators: new Map(),
    semanticProperties: new Map(),
  }
  const stack = nodes.map(node => ({ node, parent: null, key: null }))
  while (stack.length > 0) {
    const { node, parent, key } = stack.pop()
    if (!node || typeof node !== 'object') continue
    increment(result.nodeTypes, node.type)
    const literal = boundedLiteral(node)
    if (literal !== null) increment(result.literals, literal)
    if (typeof node.operator === 'string') {
      increment(result.operators, `${node.type}:${node.operator}`)
    }
    if (node.type === 'Identifier' && isSemanticIdentifier(parent, key)) {
      increment(result.semanticProperties, `${parent.type}:${node.name}`)
    }
    for (const [childKey, value] of Object.entries(node)) {
      if (['end', 'loc', 'raw', 'start'].includes(childKey)) continue
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child?.type) stack.push({ node: child, parent: node, key: childKey })
        }
      } else if (value?.type) {
        stack.push({ node: value, parent: node, key: childKey })
      }
    }
  }
  return result
}

function delta(left, right) {
  return [...new Set([...left.keys(), ...right.keys()])]
    .sort()
    .filter(key => (left.get(key) ?? 0) !== (right.get(key) ?? 0))
    .map(key => ({
      key,
      baseline: left.get(key) ?? 0,
      target: right.get(key) ?? 0,
      delta: (right.get(key) ?? 0) - (left.get(key) ?? 0),
    }))
}

function summarizeInventory(baselineNodes, targetNodes) {
  const baseline = inventory(baselineNodes)
  const target = inventory(targetNodes)
  return {
    literalDelta: delta(baseline.literals, target.literals),
    nodeTypeDelta: delta(baseline.nodeTypes, target.nodeTypes),
    operatorDelta: delta(baseline.operators, target.operators),
    semanticPropertyDelta: delta(
      baseline.semanticProperties,
      target.semanticProperties,
    ),
  }
}

function sourceKind(source) {
  if (source.includes('/src/')) return 'application'
  if (source.includes('/node_modules/')) return 'dependency'
  if (source.includes('/vendor/')) return 'vendor'
  return 'other'
}

function rangeStartIndex(ranges, offset) {
  let low = 0
  let high = ranges.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (ranges[middle].target.offsetEnd <= offset) low = middle + 1
    else high = middle
  }
  return low
}

function ownershipForStatements(statements, ranges, sourceByIndex) {
  const aggregate = new Map()
  for (const statement of statements) {
    for (
      let index = rangeStartIndex(ranges, statement.start);
      index < ranges.length && ranges[index].target.offsetStart < statement.end;
      index += 1
    ) {
      const range = ranges[index]
      const overlap = Math.min(statement.end, range.target.offsetEnd) -
        Math.max(statement.start, range.target.offsetStart)
      if (overlap <= 0) continue
      const divisor = Math.max(1, range.sourceIndices.length)
      for (const sourceIndex of range.sourceIndices) {
        const source = sourceByIndex.get(sourceIndex)
        const row = aggregate.get(sourceIndex) ?? {
          sourceIndex,
          source,
          kind: sourceKind(source),
          highWeight: 0,
          candidateWeight: 0,
        }
        const weight = overlap / divisor
        if (range.confidence === 'exact' || range.confidence === 'high') {
          row.highWeight += weight
        } else row.candidateWeight += weight
        aggregate.set(sourceIndex, row)
      }
    }
  }
  return [...aggregate.values()].sort((left, right) =>
    right.highWeight - left.highWeight ||
    right.candidateWeight - left.candidateWeight ||
    left.sourceIndex - right.sourceIndex)
}

function initializerOwnershipForStatements(statements, initializers, sourceByIndex) {
  const overlapping = initializers.filter(initializer =>
    statements.some(statement =>
      statement.start < initializer.regionEnd &&
      statement.end > initializer.regionStart,
    ),
  )
  return overlapping.map(initializer => ({
    initializerIndex: initializer.initializerIndex,
    helperKind: initializer.helperKind,
    regionStart: initializer.regionStart,
    regionEnd: initializer.regionEnd,
    status: initializer.status,
    uniqueLiteralAnchorCount: initializer.uniqueLiteralAnchorCount,
    sourceVotes: initializer.sourceVotes.map(({ value, count }) => ({
      sourceIndex: value,
      source: sourceByIndex.get(value),
      kind: sourceKind(sourceByIndex.get(value)),
      count,
    })),
  }))
}

function statementEvidence(source, normalizedSource, rawNodes, normalizedNodes, indices) {
  return indices.map(index => {
    const raw = rawNodes[index]
    const normalized = normalizedNodes[index]
    assert(raw && normalized, `statement index out of range: ${index}`)
    const rawText = source.slice(raw.start, raw.end)
    const normalizedText = normalizedSource.slice(normalized.start, normalized.end)
    return {
      index,
      type: raw.type,
      raw: { start: raw.start, end: raw.end, ...evidence(rawText) },
      normalized: evidence(normalizedText),
    }
  })
}

const args = Object.fromEntries(
  process.argv.slice(2).reduce((rows, value, index, all) => {
    if (index % 2 === 0) rows.push([value.replace(/^--/, ''), all[index + 1]])
    return rows
  }, []),
)
for (const key of [
  'baseline', 'target', 'baseline-normalized', 'target-normalized',
  'statement-diff', 'attribution', 'structural-ledger', 'output',
]) assert(args[key], `missing --${key}`)

const baselineSource = fs.readFileSync(args.baseline, 'utf8')
const targetSource = fs.readFileSync(args.target, 'utf8')
const baselineNormalized = fs.readFileSync(args['baseline-normalized'], 'utf8')
const targetNormalized = fs.readFileSync(args['target-normalized'], 'utf8')
const parserOptions = {
  allowHashBang: true,
  ecmaVersion: 'latest',
  sourceType: 'module',
}
const baselineAst = parse(baselineSource, parserOptions)
const targetAst = parse(targetSource, parserOptions)
const baselineNormalizedAst = parse(baselineNormalized, parserOptions)
const targetNormalizedAst = parse(targetNormalized, parserOptions)
assert(
  baselineAst.body.length === baselineNormalizedAst.body.length,
  'baseline statement cardinality changed during normalization',
)
assert(
  targetAst.body.length === targetNormalizedAst.body.length,
  'target statement cardinality changed during normalization',
)
const sources = jsonLines(path.join(args.attribution, 'sources.jsonl.gz'))
const ranges = jsonLines(path.join(args.attribution, 'target-ranges.jsonl.gz'))
const initializers = jsonLines(
  path.join(args.attribution, 'target-initializers.jsonl.gz'),
)
const sourceByIndex = new Map(sources.map(row => [row.sourceIndex, row.source]))
const hunks = parseHunks(fs.readFileSync(args['statement-diff'], 'utf8'))
const structuralLedger = JSON.parse(
  gunzipSync(fs.readFileSync(args['structural-ledger'])).toString('utf8'),
)
const structuralByTargetIndex = new Map([
  ...structuralLedger.regions,
  ...structuralLedger.unresolvedTarget,
].map(row => [row.target.index, row]))

const clusters = hunks.map(hunk => {
  const baselineNodes = hunk.baselineIndices.map(index => baselineAst.body[index])
  const targetNodes = hunk.targetIndices.map(index => targetAst.body[index])
  const ownership = ownershipForStatements(targetNodes, ranges, sourceByIndex)
  const initializerOwnership = initializerOwnershipForStatements(
    targetNodes,
    initializers,
    sourceByIndex,
  )
  const structuralEvidence = hunk.targetIndices.map(index => {
    const row = structuralByTargetIndex.get(index)
    assert(row, `target statement ${index} absent from structural ledger`)
    return {
      targetIndex: index,
      classification: row.classification,
      baselineUnitIndex: row.baselineUnitIndex,
      pairReason: row.pairReason,
      moveEvidence: row.moveEvidence,
      unknownFreeIdentifierCount: row.unknownFreeIdentifierCount,
    }
  })
  const highKinds = new Set(
    ownership.filter(row => row.highWeight > 0).map(row => row.kind),
  )
  const attributionClass = highKinds.has('application')
    ? 'application'
    : highKinds.has('dependency') || highKinds.has('vendor')
      ? 'dependency-or-vendor'
      : 'ambiguous'
  return {
    ...hunk,
    attributionClass,
    ownership: ownership.slice(0, 24),
    initializerOwnership,
    structuralEvidence,
    baselineStatements: statementEvidence(
      baselineSource,
      baselineNormalized,
      baselineAst.body,
      baselineNormalizedAst.body,
      hunk.baselineIndices,
    ),
    targetStatements: statementEvidence(
      targetSource,
      targetNormalized,
      targetAst.body,
      targetNormalizedAst.body,
      hunk.targetIndices,
    ),
    inventory: summarizeInventory(baselineNodes, targetNodes),
  }
})

const report = {
  schemaVersion: 1,
  kind: '2.1.124-binding-aware-semantic-cluster-ledger',
  inputs: {
    baseline: evidence(baselineSource),
    targetMetadataNormalized: evidence(targetSource),
    baselineNormalized: evidence(baselineNormalized),
    targetNormalized: evidence(targetNormalized),
  },
  statementCounts: {
    baseline: baselineAst.body.length,
    target: targetAst.body.length,
  },
  coverage: {
    clusterCount: clusters.length,
    baselineChangedStatementCount: clusters.reduce(
      (sum, cluster) => sum + cluster.baselineIndices.length, 0),
    targetChangedStatementCount: clusters.reduce(
      (sum, cluster) => sum + cluster.targetIndices.length, 0),
    classifications: Object.fromEntries(
      [...new Set(clusters.map(cluster => cluster.attributionClass))]
        .sort()
        .map(classification => [
          classification,
          clusters.filter(cluster => cluster.attributionClass === classification).length,
        ]),
    ),
  },
  clusters,
}
fs.writeFileSync(path.resolve(args.output), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report.coverage, null, 2))
