#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  TARGET119_DIRECT_DECLARATION_IMPORT_LOWERINGS,
  TARGET119_DIRECT_DECLARATION_OWNER_OVERRIDES,
} from './direct-declaration-owner-overrides.mjs'

const root = fileURLToPath(new URL('../../../..', import.meta.url))
const sourceRoot = path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src')
const reportPath = path.join(
  root,
  '.recovery-tmp/residue-audits/2.1.118-to-2.1.119.typed-audit.json',
)
const structuralPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/structural/generated-delta.json.gz',
)
const baselineBundlePath = path.join(
  root,
  '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
)
const targetBundlePath = path.join(
  root,
  '.recovery-tmp/authenticated-artifacts/2.1.119-linux-x64/cli.inner.js',
)
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-direct-declaration-owner-proofs.json',
)

const EXPECTED = {
  units: 3,
  residues: 51,
  sourceUniverseFiles: 2023,
}
const PRIOR_OWNERS = new Map([
  [20776, ['src/utils/sessionRestore.ts']],
  [20874, ['src/hooks/notifs/useInstallMessages.tsx']],
  [20880, ['src/hooks/notifs/useInstallMessages.tsx']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function rounded(value) {
  return Number(value.toFixed(12))
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

function canonicalResidue(row) {
  return [
    row.structural.index,
    row.literalKind,
    row.value,
    row.target.start,
    row.target.end,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
  ]
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
      ts.isClassDeclaration(statement)) &&
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

function sourceNodeAudit(ts, sourceFile, node) {
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

function importedCallAudit(ts, sourceFile, declaration, expected) {
  const imports = []
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== expected.module ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue
    }
    for (const element of statement.importClause.namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text
      if (
        importedName === expected.importedName &&
        element.name.text === expected.importedName
      ) {
        imports.push({
          start: element.getStart(sourceFile),
          end: element.end,
          sourceHash: sha256(element.getText(sourceFile)),
        })
      }
    }
  }
  let declarationCalls = 0
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === expected.importedName
    ) {
      declarationCalls += 1
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  return { imports, declarationCalls }
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
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  if (sourceFile.parseDiagnostics.length !== 0) {
    throw new Error(`${relative}: TypeScript parse diagnostics`)
  }
  const scopes = sourceFile.statements.map((statement, index) => {
    const start = statement.getStart(sourceFile)
    const end = statement.end
    return {
      node: statement,
      index,
      kind: ts.SyntaxKind[statement.kind],
      name: statementName(ts, sourceFile, statement),
      start,
      end,
      sourceHash: sha256(source.slice(start, end)),
      values: sourceNodeAudit(ts, sourceFile, statement),
    }
  })
  return {
    bytes,
    source,
    sourceFile,
    scopes,
    values: sourceNodeAudit(ts, sourceFile, sourceFile),
  }
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
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child, parents)
      return
    }
    if (node.type === 'Literal') {
      if (node.regex) add('regexp', node.regex, node, parents)
      else if (typeof node.value === 'string') {
        add('string', node.value, node, parents)
      } else if (typeof node.value === 'number') {
        add('number', String(node.value), node, parents)
      }
    } else if (node.type === 'TemplateElement') {
      add('string', node.value?.cooked ?? node.value?.raw, node, parents)
    }
    const propertyNode =
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
    if (propertyNode) {
      add('property', propertyNode.name, propertyNode, [...parents, node])
    }
    const nextParents = [...parents, node]
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
        visit(child, nextParents)
      }
    }
  }
  visit(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }))
  return { occurrences, values }
}

function namedImportTargetRole(residue, occurrence, expected) {
  const member = occurrence.parents.at(-1)
  const call = occurrence.parents.at(-2)
  if (
    residue.literalKind !== 'property' ||
    residue.value !== expected.importedName ||
    occurrence.node.type !== 'Identifier' ||
    member?.type !== 'MemberExpression' ||
    member.computed !== false ||
    member.property !== occurrence.node ||
    call?.type !== 'CallExpression' ||
    call.callee !== member
  ) {
    return null
  }
  return {
    representation: 'named-import-call-lowering',
    importedName: expected.importedName,
    module: expected.module,
    targetNamespaceNodeType: member.object.type,
  }
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
const inverted = new Map()
for (const relative of sourceFiles(sourceRoot)) {
  const audit = sourceAudit(ts, relative)
  sourceAudits.set(relative, audit)
  for (const key of audit.values.keys()) {
    const files = inverted.get(key) ?? []
    files.push(relative)
    inverted.set(key, files)
  }
}
if (sourceAudits.size !== EXPECTED.sourceUniverseFiles) {
  throw new Error('Target119 TypeScript source universe drifted')
}

const fixtureRowsByIndex = fs.existsSync(fixturePath)
  ? new Map(
      JSON.parse(fs.readFileSync(fixturePath)).rows.map(row => [
        row.targetIndex,
        row,
      ]),
    )
  : new Map()
const liveRowsByIndex = new Map()
for (const row of report.sourceRuntimeAddedOwnerResidueRows) {
  if (
    !TARGET119_DIRECT_DECLARATION_OWNER_OVERRIDES.some(
      override => override.targetIndex === row.structural.index,
    )
  ) {
    continue
  }
  const values = liveRowsByIndex.get(row.structural.index) ?? []
  values.push(row)
  liveRowsByIndex.set(row.structural.index, values)
}
const liveCounts = TARGET119_DIRECT_DECLARATION_OWNER_OVERRIDES.map(
  override => (liveRowsByIndex.get(override.targetIndex) ?? []).length,
)
const provisionalState = JSON.stringify(liveCounts) === JSON.stringify([27, 17, 7])
const correctedState = JSON.stringify(liveCounts) === JSON.stringify([1, 1, 1])
if (!provisionalState && !correctedState) {
  throw new Error(
    `Target119 direct-declaration scanner is partial: ${liveCounts.join(',')}`,
  )
}
if (correctedState && fixtureRowsByIndex.size !== EXPECTED.units) {
  throw new Error('post-correction regeneration requires the frozen fixture')
}

const rows = []
for (const override of TARGET119_DIRECT_DECLARATION_OWNER_OVERRIDES) {
  const targetIndex = override.targetIndex
  const owner = override.paths[0].slice(4)
  const region = regions.get(targetIndex)
  if (!region) throw new Error(`u${targetIndex}: structural region absent`)
  const unit = targetText.slice(region.target.start, region.target.end)
  if (sha256(unit) !== region.target.sourceHash) {
    throw new Error(`u${targetIndex}: target unit hash mismatch`)
  }
  const target = targetAudit(unit)
  const scores = new Map()
  for (const key of target.values.keys()) {
    const matches = inverted.get(key) ?? []
    const weight = 1 / Math.log2(matches.length + 2)
    for (const relative of matches) {
      const score = scores.get(relative) ?? { matches: 0, rare: 0, weighted: 0 }
      score.matches += 1
      score.weighted += weight
      if (matches.length <= 3) score.rare += 1
      scores.set(relative, score)
    }
  }
  const ranked = [...scores].sort(
    (left, right) =>
      right[1].weighted - left[1].weighted ||
      right[1].rare - left[1].rare ||
      right[1].matches - left[1].matches ||
      left[0].localeCompare(right[0]),
  )
  if (ranked[0]?.[0] !== owner || ranked[0][1].rare < 1) {
    throw new Error(`u${targetIndex}: intended source is not unique winner`)
  }

  const source = sourceAudits.get(owner)
  const rankedScopes = source.scopes
    .map(scope => ({
      ...scope,
      targetMatches: [...target.values.keys()].filter(key =>
        scope.values.has(key),
      ).length,
    }))
    .sort(
      (left, right) =>
        right.targetMatches - left.targetMatches || left.index - right.index,
    )
  const declaration = rankedScopes[0]
  const declarationRunner = rankedScopes[1]
  if (
    !declaration ||
    declaration.name !== override.declarationName ||
    declaration.targetMatches <= (declarationRunner?.targetMatches ?? 0)
  ) {
    throw new Error(`u${targetIndex}: declaration is not unique winner`)
  }
  const importExpected =
    TARGET119_DIRECT_DECLARATION_IMPORT_LOWERINGS[targetIndex]
  const importAudit = importedCallAudit(
    ts,
    source.sourceFile,
    declaration.node,
    importExpected,
  )
  if (importAudit.imports.length !== 1 || importAudit.declarationCalls !== 1) {
    throw new Error(`u${targetIndex}: named import call is not exact`)
  }

  const reportRows = provisionalState
    ? liveRowsByIndex.get(targetIndex)
    : fixtureRowsByIndex.get(targetIndex).residues.map(residue => ({
        structural: { index: targetIndex },
        literalKind: residue.kind,
        value: residue.value,
        target: { start: residue.start, end: residue.end },
        baselineOccurrenceCount: residue.baselineCount,
        targetOccurrenceNumber: residue.targetOrdinal,
        sourceMatches: residue.scannerRetainedAfterCorrection
          ? []
          : [owner],
      }))
  const residues = reportRows.map(reportRow => {
    const key = identity(reportRow.literalKind, reportRow.value)
    const occurrence = target.occurrences.find(
      item =>
        item.key === key &&
        item.node.start + region.target.start === reportRow.target.start &&
        item.node.end + region.target.start === reportRow.target.end,
    )
    if (!occurrence) {
      throw new Error(`u${targetIndex}: target residue occurrence absent`)
    }
    const sourceKinds = [...(declaration.values.get(key) ?? [])].sort()
    const targetKinds = [...(target.values.get(key) ?? [])].sort()
    const lowering = sourceKinds.length
      ? null
      : namedImportTargetRole(reportRow, occurrence, importExpected)
    if (!sourceKinds.length && !lowering) {
      throw new Error(`u${targetIndex}: residue is not declaration-owned`)
    }
    return {
      kind: reportRow.literalKind,
      value: reportRow.value,
      start: reportRow.target.start,
      end: reportRow.target.end,
      baselineCount: reportRow.baselineOccurrenceCount,
      targetOrdinal: reportRow.targetOccurrenceNumber,
      representation: lowering?.representation ?? 'source-declaration-ast',
      sourceKinds,
      targetKinds,
      importLowering: lowering
        ? {
            importedName: lowering.importedName,
            module: lowering.module,
            sourceImport: importAudit.imports[0],
            sourceDeclarationCalls: importAudit.declarationCalls,
            targetNamespaceNodeType: lowering.targetNamespaceNodeType,
          }
        : null,
      scannerRetainedAfterCorrection: !(
        reportRow.sourceMatches ?? []
      ).includes(owner),
    }
  })
  if (
    residues.filter(
      residue => residue.representation === 'named-import-call-lowering',
    ).length !== 1
  ) {
    throw new Error(`u${targetIndex}: expected one named-import lowering`)
  }
  const winner = ranked[0][1]
  const runner = ranked[1]
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
      tokenCount: region.target.tokenCount,
    },
    source: {
      path: override.paths[0],
      ...descriptor(source.bytes),
    },
    declaration: {
      statementIndex: declaration.index,
      kind: declaration.kind,
      name: declaration.name,
      start: declaration.start,
      end: declaration.end,
      bytes: declaration.end - declaration.start,
      sourceHash: declaration.sourceHash,
      targetIdentityMatches: declaration.targetMatches,
      runnerUpStatementIndex: declarationRunner?.index ?? null,
      runnerUpTargetIdentityMatches:
        declarationRunner?.targetMatches ?? 0,
    },
    binding: {
      targetIdentities: target.values.size,
      targetIdentitiesSha256: sha256(
        Buffer.from(JSON.stringify([...target.values.keys()].sort())),
      ),
      matches: winner.matches,
      rare: winner.rare,
      weighted: rounded(winner.weighted),
      margin: rounded(winner.weighted - (runner?.[1].weighted ?? 0)),
      runnerUp: runner?.[0] ?? null,
      runnerUpWeighted: rounded(runner?.[1].weighted ?? 0),
    },
    residues,
    behavior: override.behavior,
  })
}

const flattened = rows.flatMap(row =>
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
if (rows.length !== EXPECTED.units || flattened.length !== EXPECTED.residues) {
  throw new Error('Target119 direct-declaration proof universe drifted')
}
const corrected = rows.flatMap(row =>
  row.residues
    .filter(residue => residue.scannerRetainedAfterCorrection)
    .map(residue => [
      row.targetIndex,
      residue.kind,
      residue.value,
      residue.start,
      residue.end,
      residue.baselineCount,
      residue.targetOrdinal,
    ]),
)
if (corrected.length !== 3) {
  throw new Error('Target119 direct-declaration corrected scanner tail drifted')
}

const fixture = {
  schemaVersion: 1,
  case: '2.1.118-to-2.1.119',
  targetVersion: '2.1.119',
  status: 'complete-unit-direct-declaration-owner-proof-ready',
  criterion:
    'target119-unique-whole-unit-owner-and-named-declaration-with-import-lowering-v1',
  evidenceIds: [
    'target119-direct-declaration-owner-target-fragment',
    'target119-direct-declaration-owner-source-ast-test',
  ],
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
    sourceFiles: rows.map(row => row.source),
  },
  selection: {
    sourceUniverseFiles: sourceAudits.size,
    minimumRareIdentities: 1,
    requireUniqueWholeUnitOwner: true,
    requireUniqueTopLevelDeclaration: true,
    allowedRepresentations: [
      'named-import-call-lowering',
      'source-declaration-ast',
    ],
  },
  summary: {
    units: rows.length,
    residues: flattened.length,
    sourceFiles: new Set(rows.map(row => row.source.path)).size,
    representationKinds: Object.fromEntries(
      ['named-import-call-lowering', 'source-declaration-ast'].map(kind => [
        kind,
        rows
          .flatMap(row => row.residues)
          .filter(residue => residue.representation === kind).length,
      ]),
    ),
    correctedScannerUnits: new Set(corrected.map(row => row[0])).size,
    correctedScannerResidues: corrected.length,
    targetIndicesSha256: sha256(
      Buffer.from(JSON.stringify(rows.map(row => row.targetIndex))),
    ),
    residueIdentitiesSha256: sha256(Buffer.from(JSON.stringify(flattened))),
    correctedScannerResidueIdentitiesSha256: sha256(
      Buffer.from(JSON.stringify(corrected)),
    ),
  },
  ownerOverrides: TARGET119_DIRECT_DECLARATION_OWNER_OVERRIDES,
  rows,
}

const value = `${JSON.stringify(fixture, null, 2)}\n`
if (correctedState && fs.readFileSync(fixturePath, 'utf8') !== value) {
  throw new Error('post-correction regeneration differs from frozen fixture')
}
fs.writeFileSync(fixturePath, value)
process.stdout.write(
  `${fixturePath} ${JSON.stringify(fixture.summary)}\n`,
)
