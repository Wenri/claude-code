import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const analysis = JSON.parse(fs.readFileSync('recovery/test/recovery-2.1.118-owner-residue-analysis.json'))
const report = JSON.parse(fs.readFileSync('/tmp/late-118-current-report.json'))
const mappings = analysis.analysis.sourceGapReplay.transitiveExactConsensus.mappings
const macro = new Set(Object.values(analysis.macro))
const tsPath = path.join(root, '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js')
const imported = await import(pathToFileURL(tsPath).href)
const ts = imported.default ?? imported

function canonicalFlags(flags) {
  return [...flags].sort().join('')
}

function identity(kind, value) {
  if (kind === 'regexp') return `regexp:${JSON.stringify(value.pattern)}/${canonicalFlags(value.flags)}`
  if (kind === 'string' || kind === 'property') return `${kind}:${JSON.stringify(value)}`
  return `${kind}:${String(value)}`
}

function parseRegExp(text) {
  if (!text.startsWith('/')) return null
  let escaped = false
  let inClass = false
  for (let i = 1; i < text.length; i += 1) {
    const c = text[i]
    if (escaped) { escaped = false; continue }
    if (c === '\\') { escaped = true; continue }
    if (c === '[') { inClass = true; continue }
    if (c === ']' && inClass) { inClass = false; continue }
    if (c === '/' && !inClass) return { pattern: text.slice(1, i), flags: canonicalFlags(text.slice(i + 1)) }
  }
  return null
}

function sourceIdentity(node, sourceFile) {
  if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) return ['string', node.text]
  if (ts.isJsxText(node)) return ['string', node.getText(sourceFile)]
  if (ts.isNumericLiteral(node)) return ['number', String(Number(node.text.replaceAll('_', '')))]
  if (ts.isRegularExpressionLiteral(node)) {
    const value = parseRegExp(node.getText(sourceFile))
    if (value) return ['regexp', value]
  }
  return null
}

function sourceProperty(node) {
  if ((ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node) ||
      ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node) || ts.isPropertyDeclaration(node) ||
      ts.isPropertySignature(node) || ts.isMethodSignature(node) ||
      ts.isBindingElement(node) || ts.isJsxAttribute(node)) &&
      node.name && ts.isIdentifier(node.name)) return node.name.text
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name)) return node.name.text
  return null
}

function identitiesIn(node, sourceFile) {
  const values = new Set()
  function visit(child) {
    const literal = sourceIdentity(child, sourceFile)
    if (literal) values.add(identity(...literal))
    const property = sourceProperty(child)
    if (property) values.add(identity('property', property))
    ts.forEachChild(child, visit)
  }
  visit(node)
  return values
}

function nameOf(node) {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text
  if (node.name && ts.isStringLiteralLike(node.name)) return node.name.text
  return undefined
}

function declarationLike(node) {
  return ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) ||
    ts.isVariableDeclaration(node) || ts.isMethodDeclaration(node) ||
    ts.isPropertyAssignment(node) || ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
}

for (const mapping of mappings) {
  const rows = report.sourceRuntimeAddedOwnerResidueRows.filter(row => row.structural.index === mapping.targetIndex)
  const sourceRows = rows.filter(row => !(row.literalKind === 'string' && macro.has(row.value)))
  const rel = mapping.replaySourcePath
  const filename = path.join(root, '.recovery-tmp/semantic-trees/2.1.118/src', rel)
  if (!/\.[cm]?[jt]sx?$/.test(filename)) {
    const bytes = fs.readFileSync(filename)
    const exact = sourceRows.length === 1 && sourceRows[0].literalKind === 'string' && sourceRows[0].value === bytes.toString('utf8')
    console.log(JSON.stringify({ targetIndex: mapping.targetIndex, source: rel, rows: rows.length, sourceRows: sourceRows.length, resourceExact: exact }))
    continue
  }
  const source = fs.readFileSync(filename, 'utf8')
  const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const expected = new Set(sourceRows.map(row => identity(row.literalKind, row.value)))
  const candidates = []
  function visit(node) {
    if (declarationLike(node) && nameOf(node)) {
      const values = identitiesIn(node, sourceFile)
      if ([...expected].every(value => values.has(value))) {
        candidates.push({kind: ts.SyntaxKind[node.kind], name: nameOf(node), start: node.getStart(sourceFile), end: node.end, bytes: node.end - node.getStart(sourceFile)})
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  candidates.sort((a,b) => a.bytes - b.bytes || a.start - b.start)
  console.log(JSON.stringify({ targetIndex: mapping.targetIndex, source: rel, rows: rows.length, sourceRows: sourceRows.length, parseDiagnostics: sourceFile.parseDiagnostics.length, candidates: candidates.slice(0, 8) }))
}
