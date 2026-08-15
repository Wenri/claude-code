import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const caseName = process.argv[2]
const treeRoot = process.argv[3] ?? '/tmp/late-final-trees.FHK116'
if (!caseName) throw new Error('usage: CASE [TREE_ROOT]')

const tsPath = path.resolve(
  path.dirname(process.execPath),
  '../lib/node_modules/typescript/lib/typescript.js',
)
const module = await import(pathToFileURL(tsPath).href)
const ts = module.default ?? module
const report = JSON.parse(
  fs.readFileSync(`/tmp/recovery-semantic-late-b/${caseName}.typed-audit.json`),
)

function kind(filename) {
  if (filename.endsWith('.tsx')) return ts.ScriptKind.TSX
  if (filename.endsWith('.jsx')) return ts.ScriptKind.JSX
  if (/\.[cm]?js$/.test(filename)) return ts.ScriptKind.JS
  return ts.ScriptKind.TS
}

function evaluate(node, sourceFile) {
  if (ts.isParenthesizedExpression(node)) return evaluate(node.expression, sourceFile)
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { kind: 'string', value: node.text }
  }
  if (ts.isNumericLiteral(node)) {
    return { kind: 'number', value: Number(node.text.replaceAll('_', '')) }
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) return { kind: 'boolean', value: true }
  if (node.kind === ts.SyntaxKind.FalseKeyword) return { kind: 'boolean', value: false }
  if (ts.isPrefixUnaryExpression(node)) {
    const child = evaluate(node.operand, sourceFile)
    if (child?.kind !== 'number') return null
    if (node.operator === ts.SyntaxKind.MinusToken) return { kind: 'number', value: -child.value }
    if (node.operator === ts.SyntaxKind.PlusToken) return child
    return null
  }
  if (ts.isBinaryExpression(node)) {
    const left = evaluate(node.left, sourceFile)
    const right = evaluate(node.right, sourceFile)
    if (!left || !right) return null
    switch (node.operatorToken.kind) {
      case ts.SyntaxKind.PlusToken:
        return left.kind === 'string' || right.kind === 'string'
          ? { kind: 'string', value: String(left.value) + String(right.value) }
          : left.kind === 'number' && right.kind === 'number'
            ? { kind: 'number', value: left.value + right.value }
            : null
      case ts.SyntaxKind.AsteriskToken:
        return left.kind === 'number' && right.kind === 'number'
          ? { kind: 'number', value: left.value * right.value }
          : null
      case ts.SyntaxKind.SlashToken:
        return left.kind === 'number' && right.kind === 'number'
          ? { kind: 'number', value: left.value / right.value }
          : null
      default:
        return null
    }
  }
  return null
}

const cache = new Map()
function valuesFor(relative) {
  if (cache.has(relative)) return cache.get(relative)
  const filename = path.join(treeRoot, caseName, 'src', relative.replace(/^src\//, ''))
  if (!fs.existsSync(filename)) return null
  const text = fs.readFileSync(filename, 'utf8')
  const sourceFile = ts.createSourceFile(
    filename,
    text,
    ts.ScriptTarget.Latest,
    true,
    kind(filename),
  )
  const strings = new Set()
  const numbers = new Set()
  const visit = node => {
    const result = evaluate(node, sourceFile)
    if (result?.kind === 'string') strings.add(result.value)
    if (result?.kind === 'number') numbers.add(String(result.value))
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  const result = { strings, numbers, text }
  cache.set(relative, result)
  return result
}

function words(value) {
  return new Set(String(value).toLowerCase().match(/[a-z0-9_./-]+/g) ?? [])
}

function similarity(left, right) {
  if (left === right) return 1
  const a = words(left)
  const b = words(right)
  if (a.size === 0 || b.size === 0) return 0
  let common = 0
  for (const item of a) if (b.has(item)) common++
  return (2 * common) / (a.size + b.size)
}

function nearestString(value, owners) {
  let best = null
  for (const owner of owners) {
    const values = valuesFor(owner)
    if (!values) continue
    for (const candidate of values.strings) {
      const score = similarity(value, candidate)
      if (!best || score > best.score) {
        best = {
          owner,
          score,
          value: candidate,
        }
      }
    }
  }
  return best
}

const residues = report.rows.filter(
  row =>
    row.targetAdded &&
    row.disposition === 'source-runtime-covered' &&
    row.ownerSourceMatches.length === 0,
)
const groups = new Map()
for (const row of residues) {
  const index = row.structural.index
  const group = groups.get(index) ?? {
    index,
    owners: row.ownerPaths,
    proved: [],
    unproved: [],
  }
  let proof = null
  for (const owner of row.ownerPaths) {
    const values = valuesFor(owner)
    if (!values) continue
    if (row.literalKind === 'string') {
      if (
        values.strings.has(row.value) ||
        values.strings.has(`${row.value}\n`) ||
        values.strings.has(`${row.value}\n\n`)
      ) proof = `${owner}:static-string-expression`
    } else if (row.literalKind === 'number' && values.numbers.has(String(row.value))) {
      proof = `${owner}:static-number-expression`
    }
    if (proof) break
  }
  ;(proof ? group.proved : group.unproved).push({
    kind: row.literalKind,
    value: row.value,
    proof,
    ...(!proof && row.literalKind === 'string'
      ? { nearest: nearestString(row.value, row.ownerPaths) }
      : {}),
  })
  groups.set(index, group)
}
const values = [...groups.values()].sort(
  (a, b) => b.unproved.length - a.unproved.length || a.index - b.index,
)
console.log(
  JSON.stringify(
    {
      caseName,
      units: values.length,
      completelyProved: values.filter(group => group.unproved.length === 0).length,
      partiallyProved: values.filter(
        group => group.proved.length > 0 && group.unproved.length > 0,
      ).length,
      unproved: values.filter(group => group.proved.length === 0).length,
      rows: values,
    },
    null,
    2,
  ),
)
