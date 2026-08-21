import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from './recovery/node_modules/acorn/dist/acorn.mjs'

const root = process.cwd()
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_TMP_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src'),
)
const report = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      '.recovery-tmp/residue-audits/2.1.118-to-2.1.119.typed-audit.json',
    ),
  ),
)
const analysis = JSON.parse(
  fs.readFileSync(
    path.join(root, 'recovery/test/recovery-2.1.119-owner-residue-analysis.json'),
  ),
)
const daemonProof = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      'recovery/test/recovery-2.1.119-daemon-cluster-residue-proofs.json',
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
const structuralByIndex = new Map(
  structural.regions.map(region => [region.target.index, region]),
)
const tsPath = path.join(
  root,
  '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
)
const imported = await import(pathToFileURL(tsPath).href)
const ts = imported.default ?? imported

const daemonIndices = new Set(daemonProof.rows.map(row => row.targetIndex))
const indices = new Set(
  analysis.analysis.sourceGapReplay.ownerSupplementRequired.targetIndices.filter(
    targetIndex => !daemonIndices.has(targetIndex),
  ),
)
const macroValues = new Set(Object.values(analysis.macro))
const selectedOwnerFixture = process.argv.includes('--fixture-owners')
  ? JSON.parse(
      fs.readFileSync(
        path.join(
          root,
          'recovery/test/recovery-2.1.119-nondaemon-static-owner-proofs.json',
        ),
      ),
    )
  : null
const selectedOwners = new Map(
  (selectedOwnerFixture?.rows ?? []).map(row => [
    row.targetIndex,
    row.sourceOwner.slice(4),
  ]),
)

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
      return { pattern: text.slice(1, index), flags: flags(text.slice(index + 1)) }
    }
  }
  return null
}

const sourceCache = new Map()
function sourceIdentities(relative) {
  const cached = sourceCache.get(relative)
  if (cached) return cached
  const filename = path.join(sourceRoot, relative.replace(/^src\//, ''))
  const bytes = fs.readFileSync(filename)
  const text = bytes.toString('utf8')
  const sourceFile = ts.createSourceFile(
    filename,
    text,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  if (sourceFile.parseDiagnostics.length > 0) {
    throw new Error(`${relative}: parse diagnostics`)
  }
  const values = new Map()
  function add(kind, value, node) {
    const key = identity(kind, value)
    const records = values.get(key) ?? []
    records.push({ kind: ts.SyntaxKind[node.kind], start: node.getStart(sourceFile), end: node.end })
    values.set(key, records)
  }
  function visit(node) {
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) {
      add('string', node.text, node)
    } else if (ts.isJsxText(node)) {
      const value = node.getText(sourceFile)
      if (value) add('string', value, node)
    } else if (ts.isNumericLiteral(node)) {
      add('number', String(Number(node.text.replaceAll('_', ''))), node)
    } else if (ts.isRegularExpressionLiteral(node)) {
      const value = regexpValue(node.getText(sourceFile))
      if (value) add('regexp', value, node)
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
    if (property !== undefined) add('property', property, node)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  const result = { bytes: bytes.length, values }
  sourceCache.set(relative, result)
  return result
}

const grouped = new Map()
for (const residue of report.sourceRuntimeAddedOwnerResidueRows) {
  const targetIndex = residue.structural.index
  if (!indices.has(targetIndex)) continue
  const rows = grouped.get(targetIndex) ?? []
  rows.push(residue)
  grouped.set(targetIndex, rows)
}

const output = []
for (const [targetIndex, residues] of grouped) {
  const ownerPaths = selectedOwners.has(targetIndex)
    ? [selectedOwners.get(targetIndex)]
    : [...new Set(residues.flatMap(row => row.ownerPaths ?? []))]
  const ownerValues = ownerPaths.map(owner => [owner, sourceIdentities(owner)])
  const roles = residues.map(residue => {
    const key = identity(residue.literalKind, residue.value)
    const sourceOwners = ownerValues
      .filter(([, audit]) => audit.values.has(key))
      .map(([owner]) => owner)
    return {
      kind: residue.literalKind,
      value: residue.value,
      start: residue.target.start,
      end: residue.target.end,
      targetOrdinal: residue.targetOccurrenceNumber,
      sourceOwners,
      macro:
        residue.literalKind === 'string' && macroValues.has(residue.value),
    }
  })
  output.push({
    targetIndex,
    ownerPaths,
    target: {
      classification: structuralByIndex.get(targetIndex).classification,
      nodeType: structuralByIndex.get(targetIndex).target.nodeType,
      start: structuralByIndex.get(targetIndex).target.start,
      end: structuralByIndex.get(targetIndex).target.end,
    },
    residues: roles.length,
    sourceAst: roles.filter(role => role.sourceOwners.length > 0).length,
    macros: roles.filter(role => role.macro).length,
    missing: roles.filter(
      role => role.sourceOwners.length === 0 && !role.macro,
    ),
  })
}

if (!process.argv.includes('--score')) {
  for (const row of output) {
    process.stdout.write(`${JSON.stringify(row)}\n`)
  }
  process.exit(0)
}

function sourceFiles(directory, prefix = '') {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...sourceFiles(filename, relative))
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(relative)
  }
  return files
}

function targetIdentities(text) {
  const values = new Set()
  function add(kind, value) {
    values.add(identity(kind, value))
  }
  function visit(node) {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (node.type === 'Literal') {
      if (node.regex) {
        add('regexp', { pattern: node.regex.pattern, flags: node.regex.flags })
      } else if (typeof node.value === 'string') add('string', node.value)
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
  visit(parse(text, { ecmaVersion: 'latest', sourceType: 'module' }))
  return values
}

const files = sourceFiles(sourceRoot)
const inverted = new Map()
for (const filename of files) {
  const audit = sourceIdentities(filename)
  for (const key of audit.values.keys()) {
    const matches = inverted.get(key) ?? []
    matches.push(filename)
    inverted.set(key, matches)
  }
}
const targetBundle = fs.readFileSync(
  path.join(
    root,
    '.recovery-tmp/authenticated-artifacts/2.1.119-linux-x64/cli.inner.js',
  ),
  'utf8',
)
for (const row of output) {
  const values = targetIdentities(
    targetBundle.slice(row.target.start, row.target.end),
  )
  const scores = new Map()
  for (const key of values) {
    const matches = inverted.get(key) ?? []
    const weight = 1 / Math.log2(matches.length + 2)
    for (const filename of matches) {
      const score = scores.get(filename) ?? { matches: 0, weighted: 0, rare: 0 }
      score.matches += 1
      score.weighted += weight
      if (matches.length <= 3) score.rare += 1
      scores.set(filename, score)
    }
  }
  const ranked = [...scores]
    .sort(
      (left, right) =>
        right[1].weighted - left[1].weighted ||
        right[1].rare - left[1].rare ||
        right[1].matches - left[1].matches ||
        left[0].localeCompare(right[0]),
    )
    .slice(0, 10)
    .map(([owner, score]) => ({ owner, ...score }))
  process.stdout.write(
    `${JSON.stringify({
      targetIndex: row.targetIndex,
      targetIdentities: values.size,
      currentOwners: row.ownerPaths,
      ranked,
    })}\n`,
  )
}
