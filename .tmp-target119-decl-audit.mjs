import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse } from './recovery/node_modules/acorn/dist/acorn.mjs'

const root = process.cwd()
const sourceRoot = path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src')
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(root, 'recovery/test/recovery-2.1.119-nondaemon-static-owner-proofs.json'),
  ),
)
const staticAudit = JSON.parse(fs.readFileSync('/tmp/t119-static-classify.json'))
const rejected = new Set(staticAudit.byUnit.map(row => row.targetIndex))
const bundle = fs.readFileSync(
  path.join(root, '.recovery-tmp/authenticated-artifacts/2.1.119-linux-x64/cli.inner.js'),
  'utf8',
)
const imported = await import(
  pathToFileURL(
    path.join(root, '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js'),
  ).href
)
const ts = imported.default ?? imported

function flags(value) {
  return [...value].sort().join('')
}

function identity(kind, value) {
  return JSON.stringify([
    kind,
    kind === 'regexp'
      ? { pattern: value.pattern, flags: flags(value.flags) }
      : value,
  ])
}

function parseRegExp(text) {
  if (!text.startsWith('/')) return null
  let escaped = false
  let inClass = false
  for (let index = 1; index < text.length; index += 1) {
    const character = text[index]
    if (escaped) escaped = false
    else if (character === '\\') escaped = true
    else if (character === '[') inClass = true
    else if (character === ']' && inClass) inClass = false
    else if (character === '/' && !inClass) {
      return {
        pattern: text.slice(1, index),
        flags: flags(text.slice(index + 1)),
      }
    }
  }
  return null
}

function sourceValues(sourceFile, source, rootNode = sourceFile) {
  const values = new Set()
  const add = (kind, value) => values.add(identity(kind, value))
  function visit(node) {
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) {
      add('string', node.text)
    } else if (ts.isJsxText(node)) {
      const value = node.getText(sourceFile)
      if (value) add('string', value)
    } else if (ts.isNumericLiteral(node)) {
      add('number', String(Number(node.text.replaceAll('_', ''))))
    } else if (ts.isRegularExpressionLiteral(node)) {
      const value = parseRegExp(node.getText(sourceFile))
      if (value) add('regexp', value)
    }
    const property =
      ((ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isPropertyDeclaration(node) ||
        ts.isPropertySignature(node) ||
        ts.isMethodSignature(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node) ||
        ts.isBindingElement(node) ||
        ts.isJsxAttribute(node) ||
        ts.isImportSpecifier(node) ||
        ts.isExportSpecifier(node)) &&
        node.name &&
        ts.isIdentifier(node.name)) ||
      (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name))
        ? node.name.text
        : undefined
    if (property !== undefined) add('property', property)
    ts.forEachChild(node, visit)
  }
  visit(rootNode)
  return values
}

function targetValues(source) {
  const values = new Set()
  const add = (kind, value) => values.add(identity(kind, value))
  function visit(node) {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (node.type === 'Literal') {
      if (node.regex) add('regexp', node.regex)
      else if (typeof node.value === 'string') add('string', node.value)
      else if (typeof node.value === 'number') add('number', String(node.value))
    } else if (node.type === 'TemplateElement') {
      add('string', node.value?.cooked ?? node.value?.raw)
    }
    const property =
      ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(node.type) &&
      node.computed === false &&
      node.key?.type === 'Identifier'
        ? node.key.name
        : node.type === 'MemberExpression' &&
            node.computed === false &&
            node.property?.type === 'Identifier'
          ? node.property.name
          : undefined
    if (property !== undefined) add('property', property)
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
        visit(child)
      }
    }
  }
  visit(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }))
  return values
}

function statementName(statement, sourceFile) {
  const node = ts.isExportAssignment(statement) ? statement.expression : statement
  if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) {
    return node.name.text
  }
  if (ts.isVariableStatement(node)) {
    return node.declarationList.declarations
      .map(declaration =>
        ts.isIdentifier(declaration.name)
          ? declaration.name.text
          : declaration.name.getText(sourceFile),
      )
      .join(',')
  }
  return null
}

for (const row of fixture.rows.filter(row => !rejected.has(row.targetIndex))) {
  const relative = row.sourceOwner.slice(4)
  const filename = path.join(sourceRoot, relative)
  const source = fs.readFileSync(filename, 'utf8')
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const target = targetValues(bundle.slice(row.target.start, row.target.end))
  const scopes = sourceFile.statements
    .map((statement, index) => {
      const values = sourceValues(sourceFile, source, statement)
      const matches = [...target].filter(key => values.has(key))
      return {
        index,
        kind: ts.SyntaxKind[statement.kind],
        name: statementName(statement, sourceFile),
        start: statement.getStart(sourceFile),
        end: statement.end,
        values,
        matches,
      }
    })
    .sort(
      (left, right) =>
        right.matches.length - left.matches.length ||
        left.index - right.index,
    )
  const winner = scopes[0]
  const residueKeys = new Set(
    row.residues
      .filter(residue => residue.representation === 'source-file-ast')
      .map(residue => identity(residue.kind, residue.value)),
  )
  console.log(
    JSON.stringify({
      targetIndex: row.targetIndex,
      owner: row.sourceOwner,
      winner: winner && {
        index: winner.index,
        kind: winner.kind,
        name: winner.name,
        start: winner.start,
        end: winner.end,
        matches: winner.matches.length,
        residueMatches: [...residueKeys].filter(key => winner.values.has(key)).length,
        residueIdentities: residueKeys.size,
      },
      runner: scopes[1] && {
        index: scopes[1].index,
        kind: scopes[1].kind,
        name: scopes[1].name,
        matches: scopes[1].matches.length,
      },
    }),
  )
}
