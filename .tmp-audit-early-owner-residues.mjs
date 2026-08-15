import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from './recovery/node_modules/acorn/dist/acorn.mjs'

const [caseName, baseline, target, sourceRoot] = process.argv.slice(2)
if (!caseName || !baseline || !target || !sourceRoot) {
  throw new Error('usage: CASE BASELINE TARGET SOURCE_ROOT')
}

const repositoryRoot = process.cwd()
const caseRoot = path.join(repositoryRoot, 'recovery/cases', caseName)
const coveragePath = path.join(caseRoot, 'semantic/source-coverage.json.gz')
const coverage = JSON.parse(gunzipSync(fs.readFileSync(coveragePath)))
const rows = new Map(coverage.rows.map(row => [row.targetIndex, row]))
const evidence = new Map(coverage.evidence.map(item => [item.id, item]))

const scanner = spawnSync(
  process.execPath,
  [
    'recovery/scripts/inspect-semantic-literal-gaps.mjs',
    '--baseline', baseline,
    '--target', target,
    '--source-root', sourceRoot,
    '--structural', path.join(caseRoot, 'structural/generated-delta.json.gz'),
    '--partitions', path.join(caseRoot, 'attribution/target-partitions.jsonl.gz'),
    '--sources', path.join(caseRoot, 'attribution/sources.jsonl.gz'),
    '--coverage', coveragePath,
  ],
  {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 1024,
  },
)
if (scanner.status !== 0) throw new Error(scanner.stderr || scanner.stdout)
const report = JSON.parse(scanner.stdout)

const tsPath = path.resolve(
  path.dirname(process.execPath),
  '../lib/node_modules/typescript/lib/typescript.js',
)
const imported = await import(pathToFileURL(tsPath).href)
const ts = imported.default ?? imported

function scriptKind(filename) {
  if (filename.endsWith('.tsx')) return ts.ScriptKind.TSX
  if (filename.endsWith('.jsx')) return ts.ScriptKind.JSX
  if (/\.[cm]?js$/.test(filename)) return ts.ScriptKind.JS
  return ts.ScriptKind.TS
}

function evaluate(node) {
  if (ts.isParenthesizedExpression(node)) return evaluate(node.expression)
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { kind: 'string', value: node.text }
  }
  if (ts.isNumericLiteral(node)) {
    return { kind: 'number', value: Number(node.text.replaceAll('_', '')) }
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return { kind: 'boolean', value: true }
  }
  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return { kind: 'boolean', value: false }
  }
  if (ts.isPrefixUnaryExpression(node)) {
    const child = evaluate(node.operand)
    if (child?.kind !== 'number') return null
    if (node.operator === ts.SyntaxKind.MinusToken) {
      return { kind: 'number', value: -child.value }
    }
    if (node.operator === ts.SyntaxKind.PlusToken) return child
    return null
  }
  if (!ts.isBinaryExpression(node)) return null
  const left = evaluate(node.left)
  const right = evaluate(node.right)
  if (!left || !right) return null
  switch (node.operatorToken.kind) {
    case ts.SyntaxKind.PlusToken:
      return left.kind === 'string' || right.kind === 'string'
        ? { kind: 'string', value: String(left.value) + String(right.value) }
        : left.kind === 'number' && right.kind === 'number'
          ? { kind: 'number', value: left.value + right.value }
          : null
    case ts.SyntaxKind.MinusToken:
      return left.kind === 'number' && right.kind === 'number'
        ? { kind: 'number', value: left.value - right.value }
        : null
    case ts.SyntaxKind.AsteriskToken:
      return left.kind === 'number' && right.kind === 'number'
        ? { kind: 'number', value: left.value * right.value }
        : null
    case ts.SyntaxKind.SlashToken:
      return left.kind === 'number' && right.kind === 'number'
        ? { kind: 'number', value: left.value / right.value }
        : null
    case ts.SyntaxKind.AsteriskAsteriskToken:
      return left.kind === 'number' && right.kind === 'number'
        ? { kind: 'number', value: left.value ** right.value }
        : null
    default:
      return null
  }
}

const sourceCache = new Map()
function sourceValues(relative) {
  if (sourceCache.has(relative)) return sourceCache.get(relative)
  const filename = path.join(sourceRoot, relative.replace(/^src\//, ''))
  if (!fs.existsSync(filename)) return null
  const text = fs.readFileSync(filename, 'utf8')
  const sourceFile = ts.createSourceFile(
    filename,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(filename),
  )
  const strings = new Set()
  const numbers = new Set()
  const visit = node => {
    const result = evaluate(node)
    if (result?.kind === 'string') strings.add(result.value)
    if (result?.kind === 'number') numbers.add(String(result.value))
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  const result = { numbers, strings }
  sourceCache.set(relative, result)
  return result
}

function hasStaticAssembly(residue) {
  for (const owner of residue.ownerPaths) {
    const values = sourceValues(owner)
    if (!values) continue
    if (
      residue.literalKind === 'string' &&
      (values.strings.has(residue.value) ||
        values.strings.has(`${residue.value}\n`) ||
        values.strings.has(`${residue.value}\n\n`))
    ) return true
    if (
      residue.literalKind === 'number' &&
      values.numbers.has(String(residue.value))
    ) return true
  }
  return false
}

function hasFocusedPair(targetIndex) {
  const row = rows.get(targetIndex)
  const items = row.evidenceIds.map(id => evidence.get(id)).filter(Boolean)
  const semanticPaths = new Set(
    items
      .filter(item => item.kind === 'semantic-test')
      .map(item => item.path),
  )
  return items.some(
    item =>
      item.kind === 'target-fragment' &&
      semanticPaths.has(item.path) &&
      !/early-typed-residue-semantic/.test(item.path),
  )
}

const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(path.join(caseRoot, 'structural/generated-delta.json.gz')),
  ),
)
const targetText = fs.readFileSync(target, 'utf8')
function controlSignature(targetIndex) {
  const region = structural.regions[targetIndex]
  const value = targetText.slice(region.target.start, region.target.end)
  const ast = parse(value, {
    allowHashBang: true,
    allowReturnOutsideFunction: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const controls = new Map()
  const operators = new Map()
  const visit = node => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (/^(?:If|Switch|For|While|DoWhile|Try|Catch|Conditional|Logical|Await|Yield|Return|Throw)/.test(node.type)) {
      controls.set(node.type, (controls.get(node.type) ?? 0) + 1)
    }
    if (typeof node.operator === 'string') {
      operators.set(node.operator, (operators.get(node.operator) ?? 0) + 1)
    }
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'loc', 'raw', 'start'].includes(key)) visit(child)
    }
  }
  visit(ast)
  const flatten = map => [...map].sort().map(([key, count]) => `${key}:${count}`)
  return { controls: flatten(controls), operators: flatten(operators) }
}

const groups = new Map()
for (const residue of report.sourceRuntimeOwnerResidueRows) {
  if (!residue.targetAdded) continue
  const targetIndex = residue.structural.index
  const group = groups.get(targetIndex) ?? {
    targetIndex,
    owners: residue.ownerPaths,
    staticAssembly: 0,
    focusedPair: hasFocusedPair(targetIndex),
    unresolved: [],
  }
  if (hasStaticAssembly(residue)) group.staticAssembly += 1
  else {
    group.unresolved.push({
      kind: residue.literalKind,
      value: residue.value,
      occurrence: residue.targetOccurrenceNumber,
      baselineOccurrences: residue.baselineOccurrenceCount,
    })
  }
  groups.set(targetIndex, group)
}

for (const group of groups.values()) {
  group.control = controlSignature(group.targetIndex)
}
const results = [...groups.values()].sort((left, right) =>
  right.unresolved.length - left.unresolved.length ||
  left.targetIndex - right.targetIndex,
)
const gapIndexes = new Set(
  coverage.rows
    .filter(row => row.disposition === 'source-runtime-gap')
    .map(row => row.targetIndex),
)
const gaps = new Map()
for (const row of report.rows) {
  const targetIndex = row.structural?.index
  if (!gapIndexes.has(targetIndex)) continue
  const group = gaps.get(targetIndex) ?? {
    targetIndex,
    candidates: row.candidates,
    missing: [],
    control: controlSignature(targetIndex),
  }
  const candidateTextMatches = row.candidates
    .map(candidate => candidate.replace(/^\.\.\/src\//, ''))
    .filter(candidate => {
      const filename = path.join(sourceRoot, candidate)
      return (
        fs.existsSync(filename) &&
        fs.readFileSync(filename, 'utf8').includes(String(row.value))
      )
    })
  group.missing.push({
    kind: row.literalKind,
    value: row.value,
    occurrence: row.targetOccurrenceNumber,
    baselineOccurrences: row.baselineOccurrenceCount,
    candidateTextMatches,
  })
  gaps.set(targetIndex, group)
}
console.log(JSON.stringify({
  caseName,
  targetAddedResidueRows: results.reduce(
    (sum, group) => sum + group.staticAssembly + group.unresolved.length,
    0,
  ),
  targetAddedResidueUnits: results.length,
  fullyStaticAssembly: results.filter(group => group.unresolved.length === 0).length,
  fullyFocused: results.filter(
    group => group.unresolved.length > 0 && group.focusedPair,
  ).length,
  unresolvedUnits: results.filter(
    group => group.unresolved.length > 0 && !group.focusedPair,
  ).length,
  groups: results,
  gaps: [...gaps.values()].sort((left, right) => left.targetIndex - right.targetIndex),
}, null, 2))
