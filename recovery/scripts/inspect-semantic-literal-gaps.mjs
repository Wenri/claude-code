#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

function argumentsFrom(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error(`Invalid argument near ${key ?? '<end>'}`)
    }
    result[key.slice(2)] = value
  }
  return result
}

function walk(value, visit) {
  if (value === null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const child of value) walk(child, visit)
    return
  }
  if (typeof value.type === 'string') visit(value)
  for (const [key, child] of Object.entries(value)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
      walk(child, visit)
    }
  }
}

function canonicalFlags(flags) {
  return [...flags].sort().join('')
}

function literalIdentity(literal) {
  switch (literal.kind) {
    case 'string':
      return `string:${JSON.stringify(literal.value)}`
    case 'number':
      return `number:${literal.value}`
    case 'bigint':
      return `bigint:${literal.value}`
    case 'property':
      return `property:${JSON.stringify(literal.value)}`
    case 'regexp':
      return `regexp:${JSON.stringify(literal.pattern)}/${canonicalFlags(literal.flags)}`
    default:
      throw new Error(`Unsupported literal kind: ${literal.kind}`)
  }
}

function acornLiteral(node) {
  if (node.type === 'Literal') {
    if (node.regex) {
      return {
        flags: canonicalFlags(node.regex.flags),
        kind: 'regexp',
        pattern: node.regex.pattern,
      }
    }
    if (typeof node.value === 'string') {
      return { kind: 'string', value: node.value }
    }
    if (typeof node.value === 'number') {
      return { kind: 'number', value: String(node.value) }
    }
    if (typeof node.value === 'bigint') {
      return { kind: 'bigint', value: node.value.toString() }
    }
  }
  if (node.type === 'TemplateElement') {
    const value = node.value?.cooked ?? node.value?.raw
    if (typeof value === 'string') return { kind: 'string', value }
  }
  return null
}

function acornProperty(node) {
  if (
    (node.type === 'Property' ||
      node.type === 'MethodDefinition' ||
      node.type === 'PropertyDefinition') &&
    node.computed === false &&
    node.key?.type === 'Identifier'
  ) {
    return {
      end: node.key.end,
      literal: { kind: 'property', value: node.key.name },
      start: node.key.start,
    }
  }
  if (
    node.type === 'MemberExpression' &&
    node.computed === false &&
    node.property?.type === 'Identifier'
  ) {
    return {
      end: node.property.end,
      literal: { kind: 'property', value: node.property.name },
      start: node.property.start,
    }
  }
  return null
}

function literalOccurrences(filename) {
  const source = fs.readFileSync(filename, 'utf8')
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const occurrences = []
  walk(ast, node => {
    const literal = acornLiteral(node)
    if (literal) occurrences.push({ end: node.end, literal, start: node.start })
    const property = acornProperty(node)
    if (property) occurrences.push(property)
  })
  return { occurrences, source }
}

function readJsonGzip(filename) {
  return JSON.parse(gunzipSync(fs.readFileSync(filename)))
}

function readJsonLinesGzip(filename) {
  return gunzipSync(fs.readFileSync(filename))
    .toString('utf8')
    .trimEnd()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line))
}

function sourceFiles(root) {
  const result = []
  const pending = [root]
  while (pending.length > 0) {
    const current = pending.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const filename = path.join(current, entry.name)
      if (entry.isDirectory()) pending.push(filename)
      else if (entry.isFile()) result.push(filename)
    }
  }
  return result.sort()
}

async function loadTypeScript() {
  const candidates = [
    path.resolve(
      path.dirname(process.execPath),
      '../lib/node_modules/typescript/lib/typescript.js',
    ),
    path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      '../../.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ]
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue
    const module = await import(pathToFileURL(candidate).href)
    return module.default ?? module
  }
  throw new Error(
    'TypeScript compiler API is required to compare cooked TS/TSX literals; run through the pinned Pixi environment.',
  )
}

function scriptKind(ts, filename) {
  if (filename.endsWith('.tsx')) return ts.ScriptKind.TSX
  if (filename.endsWith('.jsx')) return ts.ScriptKind.JSX
  if (filename.endsWith('.js') || filename.endsWith('.mjs') || filename.endsWith('.cjs')) {
    return ts.ScriptKind.JS
  }
  return ts.ScriptKind.TS
}

function parseTypeScriptRegExp(text) {
  if (!text.startsWith('/')) return null
  let inCharacterClass = false
  let escaped = false
  for (let index = 1; index < text.length; index += 1) {
    const character = text[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (character === '\\') {
      escaped = true
      continue
    }
    if (character === '[') {
      inCharacterClass = true
      continue
    }
    if (character === ']' && inCharacterClass) {
      inCharacterClass = false
      continue
    }
    if (character === '/' && !inCharacterClass) {
      const flags = text.slice(index + 1)
      if (!/^[a-z]*$/i.test(flags)) return null
      return {
        flags: canonicalFlags(flags),
        kind: 'regexp',
        pattern: text.slice(1, index),
      }
    }
  }
  return null
}

function typeScriptLiteral(ts, node, sourceFile) {
  if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) {
    if (typeof node.text === 'string') return { kind: 'string', value: node.text }
  }
  if (ts.isJsxText(node)) {
    return { kind: 'string', value: node.getText(sourceFile) }
  }
  if (ts.isNumericLiteral(node)) {
    const value = Number(node.text.replaceAll('_', ''))
    if (!Number.isNaN(value)) return { kind: 'number', value: String(value) }
  }
  if (ts.isBigIntLiteral(node)) {
    const text = node.text.replaceAll('_', '').replace(/n$/i, '')
    try {
      return { kind: 'bigint', value: BigInt(text).toString() }
    } catch {
      return null
    }
  }
  if (ts.isRegularExpressionLiteral(node)) {
    return parseTypeScriptRegExp(node.getText(sourceFile))
  }
  return null
}

function typeScriptProperty(ts, node) {
  if (
    (ts.isPropertyAssignment(node) ||
      ts.isShorthandPropertyAssignment(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node) ||
      ts.isPropertyDeclaration(node)) &&
    node.name &&
    ts.isIdentifier(node.name)
  ) {
    return { kind: 'property', value: node.name.text }
  }
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name)) {
    return { kind: 'property', value: node.name.text }
  }
  return null
}

function cookedSourceValues(ts, filename, source) {
  if (!/\.(?:[cm]?[jt]sx?)$/.test(filename)) return new Set()
  const runtimeSource = ts.transpileModule(source, {
    compilerOptions: {
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
    },
    fileName: filename,
    reportDiagnostics: false,
  }).outputText
  const sourceFile = ts.createSourceFile(
    filename,
    runtimeSource,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(ts, filename),
  )
  const result = new Set()
  const visit = node => {
    const literal = typeScriptLiteral(ts, node, sourceFile)
    if (literal) result.add(literalIdentity(literal))
    const property = typeScriptProperty(ts, node)
    if (property) result.add(literalIdentity(property))
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return result
}

function sourceInventory(root, ts) {
  return sourceFiles(root).map(filename => {
    const text = fs.readFileSync(filename, 'utf8')
    return {
      cookedValues: cookedSourceValues(ts, filename, text),
      filename,
      isCode: /\.(?:[cm]?[jt]sx?)$/.test(filename),
      text,
    }
  })
}

function overlappingPartitions(partitions, start, end) {
  return partitions.filter(
    partition =>
      partition.target.offsetStart < end && partition.target.offsetEnd > start,
  )
}

function containingRegion(regions, start, end) {
  let low = 0
  let high = regions.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (regions[middle].target.end <= start) low = middle + 1
    else high = middle
  }
  const region = regions[low]
  return region && region.target.start <= start && region.target.end >= end
    ? region
    : null
}

function directOwnerMatches(sourceByPath, ownerPaths, identity, literal) {
  return ownerPaths.filter(ownerPath => {
    const source = sourceByPath.get(ownerPath)
    if (!source) return false
    if (source.cookedValues.has(identity)) return true
    return (
      !source.isCode &&
      literal.kind === 'string' &&
      source.text.includes(literal.value)
    )
  })
}

async function main() {
  const args = argumentsFrom(process.argv.slice(2))
  for (const key of [
    'baseline',
    'target',
    'source-root',
    'structural',
    'partitions',
    'sources',
  ]) {
    if (!args[key]) throw new Error(`Missing --${key}`)
  }
  const baseline = literalOccurrences(args.baseline)
  const target = literalOccurrences(args.target)
  const baselineCounts = new Map()
  for (const item of baseline.occurrences) {
    const identity = literalIdentity(item.literal)
    baselineCounts.set(identity, (baselineCounts.get(identity) ?? 0) + 1)
  }
  const structural = readJsonGzip(args.structural)
  const partitions = readJsonLinesGzip(args.partitions)
  const sources = readJsonLinesGzip(args.sources)
  const coverage = args.coverage ? readJsonGzip(args.coverage) : null
  const coverageRows = new Map(
    (coverage?.rows ?? []).map(row => [row.targetIndex, row]),
  )
  const coverageOwners = new Map(
    (coverage?.owners ?? []).map(owner => [owner.id, owner]),
  )
  const sourceByIndex = new Map(sources.map(item => [item.sourceIndex, item.source]))
  const ts = await loadTypeScript()
  const sourceTexts = sourceInventory(args['source-root'], ts)
  const sourceByPath = new Map(
    sourceTexts.map(item => [
      path.relative(args['source-root'], item.filename),
      item,
    ]),
  )
  const targetCounts = new Map()
  const rows = []
  const sourceRuntimeOwnerResidueRows = []
  let sourceRuntimeTargetOccurrences = 0
  for (const occurrence of target.occurrences) {
    const identity = literalIdentity(occurrence.literal)
    const occurrenceNumber = (targetCounts.get(identity) ?? 0) + 1
    targetCounts.set(identity, occurrenceNumber)
    const region = containingRegion(
      structural.regions,
      occurrence.start,
      occurrence.end,
    )
    const coverageRow = region ? coverageRows.get(region.target.index) : null
    const ownerPaths = (coverageRow?.ownerIds ?? [])
      .map(ownerId => coverageOwners.get(ownerId)?.path)
      .filter(Boolean)
      .map(ownerPath =>
        ownerPath.startsWith('src/') ? ownerPath.slice('src/'.length) : ownerPath,
      )
      .sort()
    const ownerSourceMatches = directOwnerMatches(
      sourceByPath,
      ownerPaths,
      identity,
      occurrence.literal,
    )
    const commonRow = {
      baselineOccurrenceCount: baselineCounts.get(identity) ?? 0,
      literalKind: occurrence.literal.kind,
      targetAdded:
        occurrenceNumber > (baselineCounts.get(identity) ?? 0),
      targetOccurrenceNumber: occurrenceNumber,
      value:
        occurrence.literal.kind === 'regexp'
          ? {
              flags: occurrence.literal.flags,
              pattern: occurrence.literal.pattern,
            }
          : occurrence.literal.value,
      target: { start: occurrence.start, end: occurrence.end },
      structural: region
        ? {
            index: region.target.index,
            classification: region.classification,
            sourceHash: region.target.sourceHash,
          }
        : null,
      disposition: coverageRow?.disposition ?? null,
      ownerPaths,
      ownerSourceMatches,
    }
    if (coverageRow?.disposition === 'source-runtime-covered') {
      sourceRuntimeTargetOccurrences += 1
      if (ownerSourceMatches.length === 0) {
        sourceRuntimeOwnerResidueRows.push(commonRow)
      }
    }
    if (occurrenceNumber <= (baselineCounts.get(identity) ?? 0)) continue
    const candidates = new Set()
    for (const partition of overlappingPartitions(
      partitions,
      occurrence.start,
      occurrence.end,
    )) {
      for (const index of [
        ...(partition.sourceCandidates ?? []),
        ...(partition.relocatedSourceCandidates ?? []),
        partition.attributedSourceIndex,
      ]) {
        if (Number.isInteger(index) && sourceByIndex.has(index)) {
          candidates.add(sourceByIndex.get(index))
        }
      }
    }
    const rawSourceMatches = occurrence.literal.kind === 'string'
      ? sourceTexts
          .filter(
            item =>
              !item.isCode && item.text.includes(occurrence.literal.value),
          )
          .map(item => path.relative(args['source-root'], item.filename))
      : []
    const cookedSourceMatches = sourceTexts
      .filter(item => item.cookedValues.has(identity))
      .map(item => path.relative(args['source-root'], item.filename))
    const sourceMatches = [...new Set([
      ...rawSourceMatches,
      ...cookedSourceMatches,
    ])].sort()
    rows.push({
      ...commonRow,
      candidates: [...candidates].sort(),
      cookedSourceMatches,
      rawSourceMatches,
      sourceMatches,
    })
  }
  const missing = rows.filter(row => row.sourceMatches.length === 0)
  const sourceRuntimeRows = rows.filter(
    row => row.disposition === 'source-runtime-covered',
  )
  const sourceRuntimeAddedOwnerResidues = sourceRuntimeRows.filter(
    row => row.ownerSourceMatches.length === 0,
  )
  const unclassifiedRows = rows.filter(row => row.structural === null)
  const countByKind = values =>
    Object.fromEntries(
      ['string', 'number', 'bigint', 'regexp', 'property'].map(kind => [
        kind,
        values.filter(row => row.literalKind === kind).length,
      ]),
    )
  console.log(
    JSON.stringify(
      {
        baselineLiterals: baseline.occurrences.length,
        baselineStrings: baseline.occurrences.filter(
          occurrence => occurrence.literal.kind === 'string',
        ).length,
        targetLiterals: target.occurrences.length,
        targetStrings: target.occurrences.filter(
          occurrence => occurrence.literal.kind === 'string',
        ).length,
        targetAddedOccurrences: rows.length,
        absentFromSource: missing.length,
        targetAddedByKind: countByKind(rows),
        absentFromSourceByKind: countByKind(missing),
        sourceRuntimeAddedOccurrences: sourceRuntimeRows.length,
        sourceRuntimeAddedOwnerResidues:
          sourceRuntimeAddedOwnerResidues.length,
        sourceRuntimeAddedOwnerResidueRows:
          sourceRuntimeAddedOwnerResidues,
        sourceRuntimeTargetOccurrences,
        sourceRuntimeOwnerResidues: sourceRuntimeOwnerResidueRows.length,
        sourceRuntimeOwnerResiduesByKind: countByKind(
          sourceRuntimeOwnerResidueRows,
        ),
        sourceRuntimeOwnerResidueRows,
        unclassifiedAddedOccurrences: unclassifiedRows.length,
        unclassifiedAddedOccurrenceRows: unclassifiedRows,
        rows: missing,
      },
      null,
      2,
    ),
  )
}

await main()
