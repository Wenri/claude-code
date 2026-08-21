#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  TARGET119_TERTIARY_DECLARATION_EVIDENCE_IDS,
  TARGET119_TERTIARY_DECLARATION_OWNER_OVERRIDES,
} from './tertiary-declaration-owner-overrides.mjs'

const root = fileURLToPath(new URL('../../../..', import.meta.url))
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src'),
)
const reportPath = path.join(
  root,
  '.recovery-tmp/residue-audits/2.1.118-to-2.1.119.typed-audit.json',
)
const structuralPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/structural/generated-delta.json.gz',
)
const baselineBundlePath =
  process.env.CLAUDE_CODE_2_1_118_BUNDLE ??
  path.join(
    root,
    '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
  )
const targetBundlePath =
  process.env.CLAUDE_CODE_2_1_119_BUNDLE ??
  path.join(
    root,
    '.recovery-tmp/authenticated-artifacts/2.1.119-linux-x64/cli.inner.js',
  )
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-tertiary-declaration-owner-proofs.json',
)

const EXPECTED_RESIDUES = Object.freeze(
  new Map([
    [12736, 1],
    [16919, 1],
    [16925, 2],
    [17980, 2],
    [17985, 1],
    [21591, 2],
  ]),
)
const PRIOR_OWNERS = Object.freeze(
  new Map([
    [12736, ['src/utils/ghPrStatus.ts']],
    [16919, ['src/components/LogoV2/feedConfigs.tsx']],
    [16925, ['src/components/LogoV2/feedConfigs.tsx']],
    [17980, ['src/components/WorktreeExitDialog.tsx']],
    [17985, ['src/components/WorktreeExitDialog.tsx']],
    [21591, ['src/main.tsx']],
  ]),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function canonicalFlags(value) {
  return [...value].sort().join('')
}

function identity(kind, value) {
  return JSON.stringify([
    kind,
    kind === 'regexp'
      ? { pattern: value.pattern, flags: canonicalFlags(value.flags) }
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
        flags: canonicalFlags(text.slice(index + 1)),
      }
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

async function loadTypeScript() {
  const filename = path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

function statementName(ts, sourceFile, statement) {
  if (
    (ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement)) &&
    statement.name
  ) {
    return statement.name.text
  }
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations
      .map(declaration => declaration.name.getText(sourceFile))
      .join(',')
  }
  return null
}

function sourceNodeValues(ts, sourceFile, node) {
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
      add(
        'number',
        String(Number(sourceNode.text.replaceAll('_', ''))),
        sourceNode,
      )
    } else if (ts.isRegularExpressionLiteral(sourceNode)) {
      const value = parseRegExp(sourceNode.getText(sourceFile))
      if (value) add('regexp', value, sourceNode)
    }
    const namedProperty =
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
    const property = namedProperty
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

function targetUnitAudit(source) {
  const values = new Map()
  const occurrences = []
  function add(kind, value, node) {
    const key = identity(kind, value)
    const kinds = values.get(key) ?? new Set()
    kinds.add(node.type)
    values.set(key, kinds)
    occurrences.push({ key, start: node.start, end: node.end })
  }
  function visit(node) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (node.type === 'Literal') {
      if (node.regex) add('regexp', node.regex, node)
      else if (typeof node.value === 'string') add('string', node.value, node)
      else if (typeof node.value === 'number') {
        add('number', String(node.value), node)
      }
    } else if (node.type === 'TemplateElement') {
      add('string', node.value?.cooked ?? node.value?.raw, node)
    }
    const property =
      ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(
        node.type,
      ) &&
      node.computed === false &&
      node.key?.type === 'Identifier'
        ? node.key
        : node.type === 'MemberExpression' &&
            node.computed === false &&
            node.property?.type === 'Identifier'
          ? node.property
          : null
    if (property) add('property', property.name, property)
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
        visit(child)
      }
    }
  }
  visit(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }))
  return { occurrences, values }
}

function sourceAudit(ts, relative) {
  const filename = path.join(sourceRoot, relative)
  const bytes = fs.readFileSync(filename)
  const source = bytes.toString('utf8')
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    relative.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  if (sourceFile.parseDiagnostics.length !== 0) {
    throw new Error(`${relative}: TypeScript parse diagnostics`)
  }
  const scopes = sourceFile.statements.map((statement, statementIndex) => {
    const start = statement.getStart(sourceFile)
    const end = statement.end
    const text = source.slice(start, end)
    return {
      node: statement,
      statementIndex,
      kind: ts.SyntaxKind[statement.kind],
      name: statementName(ts, sourceFile, statement),
      start,
      end,
      sourceHash: sha256(text),
      text,
      values: sourceNodeValues(ts, sourceFile, statement),
    }
  })
  return { bytes, scopes }
}

const report = JSON.parse(fs.readFileSync(reportPath))
const structuralBytes = fs.readFileSync(structuralPath)
const structural = JSON.parse(gunzipSync(structuralBytes))
const regions = new Map(
  structural.regions.map(region => [region.target.index, region]),
)
const baselineBundle = fs.readFileSync(baselineBundlePath)
const targetBundle = fs.readFileSync(targetBundlePath)
const targetText = targetBundle.toString('utf8')
const ts = await loadTypeScript()

const sourceAudits = new Map()
for (const relative of sourceFiles(sourceRoot)) {
  sourceAudits.set(relative, sourceAudit(ts, relative))
}

const frozenRows = fs.existsSync(fixturePath)
  ? new Map(
      JSON.parse(fs.readFileSync(fixturePath)).rows.map(row => [
        row.targetIndex,
        row,
      ]),
    )
  : new Map()
const liveRows = new Map()
for (const row of report.sourceRuntimeAddedOwnerResidueRows) {
  if (!EXPECTED_RESIDUES.has(row.structural.index)) continue
  const rows = liveRows.get(row.structural.index) ?? []
  rows.push(row)
  liveRows.set(row.structural.index, rows)
}
const liveCounts = TARGET119_TERTIARY_DECLARATION_OWNER_OVERRIDES.map(
  override => (liveRows.get(override.targetIndex) ?? []).length,
)
const expectedCounts = TARGET119_TERTIARY_DECLARATION_OWNER_OVERRIDES.map(
  override => EXPECTED_RESIDUES.get(override.targetIndex),
)
const provisionalState =
  JSON.stringify(liveCounts) === JSON.stringify(expectedCounts)
const correctedState = liveCounts.every(count => count === 0)
if (!provisionalState && !correctedState) {
  throw new Error(
    `Target119 tertiary declaration scanner is partial: ${liveCounts.join(',')}`,
  )
}
if (correctedState && frozenRows.size !== EXPECTED_RESIDUES.size) {
  throw new Error('post-correction regeneration requires the frozen fixture')
}

const rows = []
for (const override of TARGET119_TERTIARY_DECLARATION_OWNER_OVERRIDES) {
  const targetIndex = override.targetIndex
  const owner = override.paths[0].replace(/^src\//, '')
  const region = regions.get(targetIndex)
  if (!region) throw new Error(`u${targetIndex}: structural region absent`)
  const unit = targetText.slice(region.target.start, region.target.end)
  if (sha256(unit) !== region.target.sourceHash) {
    throw new Error(`u${targetIndex}: target unit hash mismatch`)
  }
  for (const marker of override.targetMarkers) {
    if (!unit.includes(marker)) {
      throw new Error(`u${targetIndex}: target marker absent: ${marker}`)
    }
  }
  const targetAudit = targetUnitAudit(unit)
  const source = sourceAudits.get(owner)
  if (!source) throw new Error(`u${targetIndex}: owner source absent`)
  const declarations = source.scopes.filter(
    scope => scope.name === override.declarationName,
  )
  if (declarations.length !== 1) {
    throw new Error(`u${targetIndex}: declaration name is not unique in owner`)
  }
  const declaration = declarations[0]
  for (const marker of override.sourceMarkers) {
    if (!declaration.text.includes(marker)) {
      throw new Error(`u${targetIndex}: source marker absent: ${marker}`)
    }
  }

  const reportRows = provisionalState
    ? liveRows.get(targetIndex)
    : frozenRows.get(targetIndex).residues.map(residue => ({
        structural: { index: targetIndex },
        literalKind: residue.kind,
        value: residue.value,
        target: { start: residue.start, end: residue.end },
        baselineOccurrenceCount: residue.baselineCount,
        targetOccurrenceNumber: residue.targetOrdinal,
      }))
  const residueKeys = new Set(
    reportRows.map(row => identity(row.literalKind, row.value)),
  )
  for (const key of residueKeys) {
    if (!declaration.values.has(key)) {
      throw new Error(`u${targetIndex}: declaration misses residue ${key}`)
    }
  }
  const candidates = []
  for (const [relative, audit] of sourceAudits) {
    for (const scope of audit.scopes) {
      if (
        override.sourceMarkers.every(marker => scope.text.includes(marker)) &&
        [...residueKeys].every(key => scope.values.has(key))
      ) {
        candidates.push({ relative, name: scope.name })
      }
    }
  }
  if (
    candidates.length !== 1 ||
    candidates[0].relative !== owner ||
    candidates[0].name !== override.declarationName
  ) {
    throw new Error(
      `u${targetIndex}: declaration binding is not sole exact candidate: ${JSON.stringify(candidates)}`,
    )
  }

  const residues = reportRows.map(reportRow => {
    const key = identity(reportRow.literalKind, reportRow.value)
    const occurrence = targetAudit.occurrences.find(
      item =>
        item.key === key &&
        item.start + region.target.start === reportRow.target.start &&
        item.end + region.target.start === reportRow.target.end,
    )
    if (!occurrence) {
      throw new Error(`u${targetIndex}: target residue occurrence absent`)
    }
    return {
      kind: reportRow.literalKind,
      value: reportRow.value,
      start: reportRow.target.start,
      end: reportRow.target.end,
      baselineCount: reportRow.baselineOccurrenceCount,
      targetOrdinal: reportRow.targetOccurrenceNumber,
      representation: 'source-declaration-ast',
      sourceKinds: [...declaration.values.get(key)].sort(),
      targetKinds: [...targetAudit.values.get(key)].sort(),
    }
  })
  rows.push({
    targetIndex,
    sourceOwner: override.paths[0],
    priorOwnerPaths: PRIOR_OWNERS.get(targetIndex),
    target: {
      classification: region.classification,
      nodeType: region.target.nodeType,
      start: region.target.start,
      end: region.target.end,
      bytes: region.target.end - region.target.start,
      sourceHash: region.target.sourceHash,
    },
    source: {
      path: override.paths[0],
      ...descriptor(source.bytes),
    },
    declaration: {
      statementIndex: declaration.statementIndex,
      kind: declaration.kind,
      name: declaration.name,
      start: declaration.start,
      end: declaration.end,
      bytes: declaration.end - declaration.start,
      sourceHash: declaration.sourceHash,
    },
    sourceMarkers: override.sourceMarkers,
    targetMarkers: override.targetMarkers,
    soleExactDeclarationCandidate: {
      sourcePath: override.paths[0],
      declarationName: override.declarationName,
      matches: 1,
    },
    residues,
    behavior: override.behavior,
  })
}

const residueRows = rows.flatMap(row =>
  row.residues.map(residue => [
    row.targetIndex,
    residue.kind,
    residue.value,
    residue.start,
    residue.end,
    residue.baselineCount,
    residue.targetOrdinal,
  ]),
)
if (rows.length !== 6 || residueRows.length !== 9) {
  throw new Error('Target119 tertiary declaration proof universe drifted')
}

const fixture = {
  schemaVersion: 1,
  case: '2.1.118-to-2.1.119',
  targetVersion: '2.1.119',
  status: 'complete-unit-tertiary-declaration-owner-proof-ready',
  criterion:
    'authenticated-target-unit-plus-sole-exact-historical-source-declaration-v1',
  evidenceIds: TARGET119_TERTIARY_DECLARATION_EVIDENCE_IDS,
  inputs: {
    baselineBundle: {
      artifact: '2.1.118-linux-x64/cli.inner.js',
      ...descriptor(baselineBundle),
    },
    targetBundle: {
      artifact: '2.1.119-linux-x64/cli.inner.js',
      ...descriptor(targetBundle),
    },
    structural: {
      path:
        'recovery/cases/2.1.118-to-2.1.119/structural/generated-delta.json.gz',
      ...descriptor(structuralBytes),
    },
    sourceUniverse: {
      root: '.recovery-tmp/semantic-trees/2.1.119/src',
      files: sourceAudits.size,
    },
    sourceFiles: [
      ...new Map(rows.map(row => [row.source.path, row.source])).values(),
    ],
  },
  selection: {
    requireCompleteUnitResidueRepresentation: true,
    requireSoleExactDeclarationCandidate: true,
    representation: 'source-declaration-ast',
  },
  summary: {
    units: rows.length,
    residues: residueRows.length,
    sourceFiles: new Set(rows.map(row => row.sourceOwner)).size,
    targetIndicesSha256: sha256(
      Buffer.from(JSON.stringify(rows.map(row => row.targetIndex))),
    ),
    residueIdentitiesSha256: sha256(
      Buffer.from(JSON.stringify(residueRows)),
    ),
  },
  ownerOverrides: TARGET119_TERTIARY_DECLARATION_OWNER_OVERRIDES,
  rows,
}

const value = `${JSON.stringify(fixture, null, 2)}\n`
if (correctedState || process.argv.includes('--check')) {
  if (!fs.existsSync(fixturePath) || fs.readFileSync(fixturePath, 'utf8') !== value) {
    throw new Error('frozen tertiary declaration fixture differs')
  }
} else {
  fs.writeFileSync(fixturePath, value)
}
process.stdout.write(`${fixturePath} ${JSON.stringify(fixture.summary)}\n`)
