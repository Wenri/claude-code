import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from './recovery/node_modules/acorn/dist/acorn.mjs'

const root = process.cwd()
const sourceRoot = path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src')
const report = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      '.recovery-tmp/residue-audits/2.1.118-to-2.1.119.typed-audit.json',
    ),
  ),
)
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        root,
        'recovery/cases/2.1.118-to-2.1.119/structural/generated-delta.json.gz',
      ),
    ),
  ),
)
const targetBundle = fs.readFileSync(
  path.join(
    root,
    '.recovery-tmp/authenticated-artifacts/2.1.119-linux-x64/cli.inner.js',
  ),
  'utf8',
)
const imported = await import(
  pathToFileURL(
    path.join(
      root,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ).href,
)
const ts = imported.default ?? imported

const candidates = new Map([
  [12165, 'utils/udsClient.ts'],
  [17980, 'commands/exit/exit.tsx'],
  [18804, 'commands.ts'],
  [19021, 'utils/permissions/filesystem.ts'],
  [19931, 'hooks/useDiffInIDE.ts'],
  [20891, 'utils/plugins/officialMarketplaceStartupCheck.ts'],
  [21145, 'utils/cronTasksLock.ts'],
  [21213, 'utils/githubRepoPathMapping.ts'],
])
const regions = new Map(
  structural.regions.map(region => [region.target.index, region]),
)
const reportByIndex = new Map()
for (const row of report.sourceRuntimeAddedOwnerResidueRows) {
  if (!candidates.has(row.structural.index)) continue
  const rows = reportByIndex.get(row.structural.index) ?? []
  rows.push(row)
  reportByIndex.set(row.structural.index, rows)
}

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

function regexpValue(text) {
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

function sourceValues(sourceFile, node) {
  const values = new Map()
  function add(kind, value, sourceNode) {
    const key = identity(kind, value)
    const kinds = values.get(key) ?? new Set()
    kinds.add(ts.SyntaxKind[sourceNode.kind])
    values.set(key, kinds)
  }
  function visit(sourceNode) {
    if (
      ts.isStringLiteralLike(sourceNode) ||
      ts.isTemplateLiteralToken(sourceNode)
    ) {
      add('string', sourceNode.text, sourceNode)
    } else if (ts.isJsxText(sourceNode)) {
      const value = sourceNode.getText(sourceFile)
      if (value) add('string', value, sourceNode)
    } else if (ts.isNumericLiteral(sourceNode)) {
      add('number', String(Number(sourceNode.text.replaceAll('_', ''))), sourceNode)
    } else if (ts.isRegularExpressionLiteral(sourceNode)) {
      const value = regexpValue(sourceNode.getText(sourceFile))
      if (value) add('regexp', value, sourceNode)
    }
    const named =
      (ts.isPropertyAssignment(sourceNode) ||
        ts.isShorthandPropertyAssignment(sourceNode) ||
        ts.isMethodDeclaration(sourceNode) ||
        ts.isPropertyDeclaration(sourceNode) ||
        ts.isPropertySignature(sourceNode) ||
        ts.isMethodSignature(sourceNode) ||
        ts.isGetAccessorDeclaration(sourceNode) ||
        ts.isSetAccessorDeclaration(sourceNode) ||
        ts.isBindingElement(sourceNode) ||
        ts.isJsxAttribute(sourceNode) ||
        ts.isImportSpecifier(sourceNode) ||
        ts.isExportSpecifier(sourceNode)) &&
      sourceNode.name &&
      ts.isIdentifier(sourceNode.name)
    const property = named
      ? sourceNode.name.text
      : ts.isPropertyAccessExpression(sourceNode) &&
          ts.isIdentifier(sourceNode.name)
        ? sourceNode.name.text
        : undefined
    if (property !== undefined) add('property', property, sourceNode)
    ts.forEachChild(sourceNode, visit)
  }
  visit(node)
  return values
}

function targetAudit(source) {
  const values = new Map()
  const occurrences = []
  function add(kind, value, node, parents) {
    const key = identity(kind, value)
    const kinds = values.get(key) ?? new Set()
    kinds.add(node.type)
    values.set(key, kinds)
    occurrences.push({ key, node, parents })
  }
  function visit(node, parents = []) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child, parents)
      return
    }
    if (node.type === 'Literal') {
      if (node.regex) add('regexp', node.regex, node, parents)
      else if (typeof node.value === 'string') add('string', node.value, node, parents)
      else if (typeof node.value === 'number') add('number', String(node.value), node, parents)
    } else if (node.type === 'TemplateElement') {
      add('string', node.value?.cooked ?? node.value?.raw, node, parents)
    }
    const propertyNode =
      ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(node.type) &&
      !node.computed &&
      node.key?.type === 'Identifier'
        ? node.key
        : node.type === 'MemberExpression' &&
            !node.computed &&
            node.property?.type === 'Identifier'
          ? node.property
          : null
    if (propertyNode) add('property', propertyNode.name, propertyNode, [...parents, node])
    const next = [...parents, node]
    for (const [key, child] of Object.entries(node)) {
      if (!['start', 'end', 'loc', 'range', 'raw', 'type'].includes(key)) {
        visit(child, next)
      }
    }
  }
  visit(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }))
  return { values, occurrences }
}

function statementName(sourceFile, statement) {
  if (
    (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
    statement.name
  ) {
    return statement.name.text
  }
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations
      .map(declaration =>
        ts.isIdentifier(declaration.name)
          ? declaration.name.text
          : declaration.name.getText(sourceFile),
      )
      .join(',')
  }
  return null
}

for (const [targetIndex, relative] of candidates) {
  const region = regions.get(targetIndex)
  const source = fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
  const sourceFile = ts.createSourceFile(
    relative,
    source,
    ts.ScriptTarget.Latest,
    true,
    relative.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const target = targetAudit(
    targetBundle.slice(region.target.start, region.target.end),
  )
  const scopes = sourceFile.statements
    .map((statement, index) => {
      const values = sourceValues(sourceFile, statement)
      return {
        index,
        kind: ts.SyntaxKind[statement.kind],
        name: statementName(sourceFile, statement),
        matches: [...target.values.keys()].filter(key => values.has(key)).length,
        values,
      }
    })
    .sort((left, right) => right.matches - left.matches || left.index - right.index)
  const winner = scopes[0]
  const runner = scopes[1]
  const residues = (reportByIndex.get(targetIndex) ?? []).map(row => {
    const key = identity(row.literalKind, row.value)
    const occurrence = target.occurrences.find(
      item =>
        item.key === key &&
        item.node.start + region.target.start === row.target.start &&
        item.node.end + region.target.start === row.target.end,
    )
    return {
      kind: row.literalKind,
      value: row.value,
      sourceKinds: [...(winner.values.get(key) ?? [])],
      targetAncestors: occurrence?.parents.slice(-4).map(item => item.type),
    }
  })
  console.log(
    JSON.stringify({
      targetIndex,
      owner: relative,
      targetNodeType: region.target.nodeType,
      targetIdentities: target.values.size,
      winner: {
        index: winner.index,
        kind: winner.kind,
        name: winner.name,
        matches: winner.matches,
      },
      runner: {
        index: runner?.index,
        kind: runner?.kind,
        name: runner?.name,
        matches: runner?.matches,
      },
      residues,
    }),
  )
}
