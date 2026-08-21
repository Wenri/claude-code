import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from './recovery/node_modules/acorn/dist/acorn.mjs'

const root = process.cwd()
const sourceRoot = path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src')
const targetBundle = fs.readFileSync(
  path.join(root, '.recovery-tmp/authenticated-artifacts/2.1.119-linux-x64/cli.inner.js'),
  'utf8',
)
const report = JSON.parse(
  fs.readFileSync(
    path.join(root, '.recovery-tmp/residue-audits/2.1.118-to-2.1.119.typed-audit.json'),
  ),
)
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(root, 'recovery/cases/2.1.118-to-2.1.119/structural/generated-delta.json.gz'),
    ),
  ),
)
const imported = await import(
  pathToFileURL(
    path.join(root, '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js'),
  ).href,
)
const ts = imported.default ?? imported
const selected = new Map([
  [20776, ['cli/bg.ts', 'openAgentsFromForeground']],
  [20874, ['hooks/useAwaySummary.ts', 'useAwaySummary']],
  [20880, ['hooks/useJobStateNameSync.ts', 'useJobStateNameSync']],
])
const regions = new Map(structural.regions.map(region => [region.target.index, region]))

function flags(value) {
  return [...value].sort().join('')
}

function identity(kind, value) {
  return JSON.stringify([
    kind,
    kind === 'regexp' ? { pattern: value.pattern, flags: flags(value.flags) } : value,
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
      return { pattern: text.slice(1, index), flags: flags(text.slice(index + 1)) }
    }
  }
  return null
}

function sourceFiles(directory, prefix = '') {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...sourceFiles(filename, relative))
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(relative)
  }
  return files.sort()
}

function sourceValues(sourceFile, node) {
  const values = new Map()
  const add = (kind, value) => {
    const key = identity(kind, value)
    values.set(key, (values.get(key) ?? 0) + 1)
  }
  function visit(child) {
    if (ts.isStringLiteralLike(child) || ts.isTemplateLiteralToken(child)) {
      add('string', child.text)
    } else if (ts.isJsxText(child)) {
      const value = child.getText(sourceFile)
      if (value) add('string', value)
    } else if (ts.isNumericLiteral(child)) {
      add('number', String(Number(child.text.replaceAll('_', ''))))
    } else if (ts.isRegularExpressionLiteral(child)) {
      const value = parseRegExp(child.getText(sourceFile))
      if (value) add('regexp', value)
    }
    const named =
      (ts.isPropertyAssignment(child) ||
        ts.isShorthandPropertyAssignment(child) ||
        ts.isMethodDeclaration(child) ||
        ts.isPropertyDeclaration(child) ||
        ts.isPropertySignature(child) ||
        ts.isMethodSignature(child) ||
        ts.isGetAccessorDeclaration(child) ||
        ts.isSetAccessorDeclaration(child) ||
        ts.isBindingElement(child) ||
        ts.isJsxAttribute(child) ||
        ts.isImportSpecifier(child) ||
        ts.isExportSpecifier(child)) &&
      child.name &&
      ts.isIdentifier(child.name)
    const property = named
      ? child.name.text
      : ts.isPropertyAccessExpression(child) && ts.isIdentifier(child.name)
        ? child.name.text
        : undefined
    if (property !== undefined) add('property', property)
    ts.forEachChild(child, visit)
  }
  visit(node)
  return values
}

function targetValues(source) {
  const values = new Map()
  const add = (kind, value) => {
    const key = identity(kind, value)
    values.set(key, (values.get(key) ?? 0) + 1)
  }
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
      if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) visit(child)
    }
  }
  visit(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }))
  return values
}

function statementName(sourceFile, statement) {
  if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
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

const audits = new Map()
const inverted = new Map()
for (const relative of sourceFiles(sourceRoot)) {
  const filename = path.join(sourceRoot, relative)
  const bytes = fs.readFileSync(filename)
  const source = bytes.toString('utf8')
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  if (sourceFile.parseDiagnostics.length) throw new Error(`${relative}: parse diagnostics`)
  const fileValues = sourceValues(sourceFile, sourceFile)
  const statements = sourceFile.statements.map((statement, index) => ({
    index,
    name: statementName(sourceFile, statement),
    kind: ts.SyntaxKind[statement.kind],
    start: statement.getStart(sourceFile),
    end: statement.end,
    hash: crypto
      .createHash('sha256')
      .update(source.slice(statement.getStart(sourceFile), statement.end))
      .digest('hex'),
    values: sourceValues(sourceFile, statement),
  }))
  audits.set(relative, { bytes, source, fileValues, statements })
  for (const key of fileValues.keys()) {
    const list = inverted.get(key) ?? []
    list.push(relative)
    inverted.set(key, list)
  }
}

for (const [targetIndex, [expectedOwner, expectedName]] of selected) {
  const region = regions.get(targetIndex)
  const unit = targetBundle.slice(region.target.start, region.target.end)
  const target = targetValues(unit)
  const scores = new Map()
  for (const key of target.keys()) {
    const files = inverted.get(key) ?? []
    const weight = 1 / Math.log2(files.length + 2)
    for (const relative of files) {
      const value = scores.get(relative) ?? { matches: 0, rare: 0, weighted: 0 }
      value.matches += 1
      value.weighted += weight
      if (files.length <= 3) value.rare += 1
      scores.set(relative, value)
    }
  }
  const ranked = [...scores]
    .sort((left, right) =>
      right[1].weighted - left[1].weighted ||
      right[1].rare - left[1].rare ||
      right[1].matches - left[1].matches ||
      left[0].localeCompare(right[0]),
    )
    .slice(0, 10)
  const audit = audits.get(expectedOwner)
  const statements = audit.statements
    .map(statement => ({
      ...statement,
      matches: [...target.keys()].filter(key => statement.values.has(key)).length,
    }))
    .sort((left, right) => right.matches - left.matches || left.index - right.index)
  const declaration = statements.find(row => row.name === expectedName)
  const residues = report.sourceRuntimeAddedOwnerResidueRows.filter(
    row => row.structural.index === targetIndex,
  )
  process.stdout.write(`${JSON.stringify({
    targetIndex,
    targetHash: region.target.sourceHash,
    targetBytes: region.target.end - region.target.start,
    targetIdentities: target.size,
    expectedOwner,
    expectedOwnerRank: ranked.findIndex(row => row[0] === expectedOwner) + 1,
    ranked,
    file: {
      bytes: audit.bytes.length,
      sha256: crypto.createHash('sha256').update(audit.bytes).digest('hex'),
    },
    declaration: {
      ...declaration,
      values: undefined,
      targetMatches: declaration.matches,
      runnerUpMatches: statements.filter(row => row !== declaration)[0]?.matches ?? null,
    },
    residues: residues.map(row => {
      const key = identity(row.literalKind, row.value)
      return {
        kind: row.literalKind,
        value: row.value,
        sourceCount: declaration.values.get(key) ?? 0,
        targetCount: target.get(key) ?? 0,
      }
    }),
  })}\n`)
}
