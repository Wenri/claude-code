#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  TARGET119_PRO_TRIAL_START_JSX_TEXT_LOWERINGS,
  TARGET119_PRO_TRIAL_START_OWNER_OVERRIDES,
  TARGET119_PRO_TRIAL_START_SOURCE_MARKERS,
} from './pro-trial-start-owner-overrides.mjs'

const root = fileURLToPath(new URL('../../../..', import.meta.url))
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src'),
)
const reportPath = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_RESIDUE_REPORT ??
    path.join(
      root,
      '.recovery-tmp/residue-audits/2.1.118-to-2.1.119.typed-audit.json',
    ),
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
  'recovery/test/recovery-2.1.119-pro-trial-start-owner-proofs.json',
)

const EXPECTED = Object.freeze({
  targetIndex: 21281,
  residues: 35,
  sourceUniverseFiles: 2023,
  sourceFileAst: 20,
  jsxCreateElement: 10,
  reactCompilerMemoCache: 1,
  jsxText: 4,
  correctedScannerResidues: 43,
  correctedScannerResidueIdentitiesSha256:
    'c32a0553bb9aed9d0a5ba83c8cb9d9291a381252b8558275a8604074f84a9903',
})

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

function targetOccurrenceMap(source, baseOffset) {
  const occurrences = new Map()
  function add(kind, value, node, parents) {
    const key = JSON.stringify([
      baseOffset + node.start,
      baseOffset + node.end,
      kind,
      value,
    ])
    if (occurrences.has(key)) {
      throw new Error(`duplicate Target119 u21281 target occurrence ${key}`)
    }
    occurrences.set(key, { kind, value, node, parents })
  }
  function visit(node, parents = []) {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child, parents)
      return
    }
    if (node.type === 'Literal') {
      if (typeof node.value === 'string') add('string', node.value, node, parents)
      else if (typeof node.value === 'number') {
        add('number', String(node.value), node, parents)
      }
    } else if (node.type === 'TemplateElement') {
      add('string', node.value?.cooked ?? node.value?.raw, node, parents)
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
    if (property) add('property', property.name, property, [...parents, node])
    const next = [...parents, node]
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
        visit(child, next)
      }
    }
  }
  visit(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }))
  return occurrences
}

function compilerRepresentation(row, occurrence, sourceValueSet) {
  const parent = occurrence.parents.at(-1)
  const grandparent = occurrence.parents.at(-2)
  if (
    row.literalKind === 'property' &&
    row.value === 'c' &&
    parent?.type === 'MemberExpression' &&
    parent.property === occurrence.node &&
    grandparent?.type === 'CallExpression' &&
    grandparent.callee === parent &&
    grandparent.arguments.length === 1 &&
    grandparent.arguments[0]?.type === 'Literal' &&
    grandparent.arguments[0].value === 9
  ) {
    return 'react-compiler-memo-cache'
  }
  if (
    row.literalKind === 'property' &&
    row.value === 'createElement' &&
    parent?.type === 'MemberExpression' &&
    parent.property === occurrence.node &&
    grandparent?.type === 'CallExpression' &&
    grandparent.callee === parent
  ) {
    return 'jsx-create-element-lowering'
  }
  if (
    row.literalKind === 'property' &&
    row.value === 'for' &&
    parent?.type === 'MemberExpression' &&
    parent.object?.type === 'Identifier' &&
    parent.object.name === 'Symbol' &&
    parent.property === occurrence.node &&
    grandparent?.type === 'CallExpression' &&
    grandparent.callee === parent
  ) {
    return 'react-compiler-cache-sentinel-call'
  }
  if (
    row.literalKind === 'string' &&
    row.value === 'react.memo_cache_sentinel' &&
    parent?.type === 'CallExpression' &&
    parent.arguments.includes(occurrence.node) &&
    parent.callee?.type === 'MemberExpression' &&
    parent.callee.object?.type === 'Identifier' &&
    parent.callee.object.name === 'Symbol' &&
    parent.callee.property?.name === 'for'
  ) {
    return 'react-compiler-cache-sentinel-call'
  }
  if (
    row.literalKind === 'number' &&
    row.value === '0' &&
    parent?.type === 'UnaryExpression' &&
    parent.operator === '!' &&
    parent.argument === occurrence.node &&
    occurrence.parents.some(
      ancestor =>
        ancestor.type === 'Property' &&
        ancestor.computed === false &&
        ancestor.key?.type === 'Identifier' &&
        ancestor.key.name === 'bold',
    )
  ) {
    return 'jsx-boolean-attribute-lowering'
  }
  if (
    row.literalKind === 'number' &&
    ((parent?.type === 'MemberExpression' &&
      parent.computed &&
      parent.property === occurrence.node) ||
      (parent?.type === 'CallExpression' &&
        parent.arguments.includes(occurrence.node) &&
        parent.callee?.type === 'MemberExpression' &&
        parent.callee.property?.name === 'c'))
  ) {
    return 'react-compiler-cache-slot'
  }
  if (sourceValueSet.has(identity(row.literalKind, row.value))) {
    return 'source-file-ast'
  }
  throw new Error(
    `Target119 u21281 corrected residue lacks a closed representation: ${row.literalKind}:${JSON.stringify(row.value)}`,
  )
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

function sourceValues(ts, sourceFile) {
  const values = new Set()
  function add(kind, value) {
    values.add(identity(kind, value))
  }
  function visit(node) {
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) {
      add('string', node.text)
    } else if (ts.isJsxText(node)) {
      const value = node.getText(sourceFile)
      if (value) add('string', value)
    } else if (ts.isNumericLiteral(node)) {
      add('number', String(Number(node.text.replaceAll('_', ''))))
    }
    const namedProperty =
      (ts.isPropertyAssignment(node) ||
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
      ts.isIdentifier(node.name)
    const property = namedProperty
      ? node.name.text
      : ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name)
        ? node.name.text
        : undefined
    if (property !== undefined) add('property', property)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return values
}

function jsxElementCount(ts, node) {
  let count = 0
  function visit(child) {
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) count += 1
    ts.forEachChild(child, visit)
  }
  visit(node)
  return count
}

function jsxBooleanAttributeCount(ts, node, name) {
  let count = 0
  function visit(child) {
    if (
      ts.isJsxAttribute(child) &&
      child.name.text === name &&
      child.initializer === undefined
    ) {
      count += 1
    }
    ts.forEachChild(child, visit)
  }
  visit(node)
  return count
}

const ts = await loadTypeScript()
const baselineBundle = fs.readFileSync(baselineBundlePath)
const targetBundle = fs.readFileSync(targetBundlePath)
const structuralBytes = fs.readFileSync(structuralPath)
const structural = JSON.parse(gunzipSync(structuralBytes))
const report = JSON.parse(fs.readFileSync(reportPath))
const overrides = TARGET119_PRO_TRIAL_START_OWNER_OVERRIDES
if (overrides.length !== 1) throw new Error('expected one owner override')
const ownerOverride = overrides[0]
if (ownerOverride.targetIndex !== EXPECTED.targetIndex) {
  throw new Error('unexpected owner-override target index')
}

const region = structural.regions.find(
  item => item.target.index === EXPECTED.targetIndex,
)
if (!region) throw new Error('missing Target119 u21281 structural region')
const targetText = targetBundle
  .toString('utf8')
  .slice(region.target.start, region.target.end)
if (sha256(targetText) !== region.target.sourceHash) {
  throw new Error('Target119 u21281 target fragment differs')
}
parse(targetText, { ecmaVersion: 'latest', sourceType: 'module' })

const liveResidueRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
  row => row.structural.index === EXPECTED.targetIndex,
)
let residueRows
let priorOwnerPaths
let frozen
let correctedLiveRows = null
if (liveResidueRows.length === EXPECTED.residues) {
  residueRows = liveResidueRows
  priorOwnerPaths = [
    ...new Set(residueRows.flatMap(row => row.ownerPaths ?? [])),
  ].sort()
  if (
    JSON.stringify(priorOwnerPaths) !==
    JSON.stringify(['components/TrustDialog/TrustDialog.tsx'])
  ) {
    throw new Error(`Target119 u21281 prior owner differs: ${priorOwnerPaths}`)
  }
  frozen = fs.existsSync(fixturePath)
    ? JSON.parse(fs.readFileSync(fixturePath))
    : null
} else if (fs.existsSync(fixturePath)) {
  frozen = JSON.parse(fs.readFileSync(fixturePath))
  const frozenRow = frozen.rows?.find(
    row => row.targetIndex === EXPECTED.targetIndex,
  )
  if (!frozenRow || frozenRow.residues.length !== EXPECTED.residues) {
    throw new Error('Target119 u21281 frozen pre-correction row differs')
  }
  const correctedCanonical = liveResidueRows.map(canonicalResidue)
  if (
    correctedCanonical.length !== EXPECTED.correctedScannerResidues ||
    sha256(JSON.stringify(correctedCanonical)) !==
      EXPECTED.correctedScannerResidueIdentitiesSha256
  ) {
    throw new Error(
      `Target119 u21281 scanner is neither exact provisional nor corrected state (${liveResidueRows.length} rows)`,
    )
  }
  correctedLiveRows = liveResidueRows
  residueRows = frozenRow.residues.map(residue => ({
    structural: { index: EXPECTED.targetIndex },
    literalKind: residue.kind,
    value: residue.value,
    target: { start: residue.start, end: residue.end },
    baselineOccurrenceCount: residue.baselineCount,
    targetOccurrenceNumber: residue.targetOrdinal,
  }))
  priorOwnerPaths = frozenRow.priorOwnerPaths.map(relative =>
    relative.replace(/^src\//, ''),
  )
} else {
  throw new Error(
    `Target119 u21281 expected ${EXPECTED.residues} provisional residues, got ${liveResidueRows.length}`,
  )
}

const sourceRelative = ownerOverride.paths[0].replace(/^src\//, '')
const sourceFilename = path.join(sourceRoot, sourceRelative)
const sourceBytes = fs.readFileSync(sourceFilename)
const sourceText = sourceBytes.toString('utf8')
const sourceFile = ts.createSourceFile(
  sourceFilename,
  sourceText,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
)
if (sourceFile.parseDiagnostics.length !== 0) {
  throw new Error('ProTrialStartScreen source has parse diagnostics')
}
const declarations = sourceFile.statements.filter(
  statement =>
    ts.isFunctionDeclaration(statement) &&
    statement.name?.text === ownerOverride.declarationName,
)
if (declarations.length !== 1) {
  throw new Error('expected one ProTrialStartScreen declaration')
}
const declaration = declarations[0]
const declarationStart = declaration.getStart(sourceFile)
const declarationEnd = declaration.end
const declarationText = sourceText.slice(declarationStart, declarationEnd)
for (const marker of TARGET119_PRO_TRIAL_START_SOURCE_MARKERS) {
  if (!declarationText.includes(marker)) {
    throw new Error(`ProTrialStartScreen declaration lacks ${marker}`)
  }
  if (!targetText.includes(marker)) {
    throw new Error(`Target119 u21281 fragment lacks ${marker}`)
  }
}

const universe = sourceFiles(sourceRoot)
if (universe.length !== EXPECTED.sourceUniverseFiles) {
  throw new Error(`Target119 source universe changed: ${universe.length}`)
}
const markerCandidates = universe.filter(relative => {
  const text = fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
  return TARGET119_PRO_TRIAL_START_SOURCE_MARKERS.every(marker =>
    text.includes(marker),
  )
})
if (JSON.stringify(markerCandidates) !== JSON.stringify([sourceRelative])) {
  throw new Error(`ProTrialStartScreen marker candidates differ: ${markerCandidates}`)
}

const values = sourceValues(ts, sourceFile)
const targetOccurrences = targetOccurrenceMap(targetText, region.target.start)
const jsxTextLowerings = new Map(
  TARGET119_PRO_TRIAL_START_JSX_TEXT_LOWERINGS.map(row => [row.target, row]),
)
const representationCounts = {
  'source-file-ast': 0,
  'jsx-create-element-lowering': 0,
  'react-compiler-memo-cache': 0,
  'jsx-text-lowering': 0,
}
const residues = residueRows.map(row => {
  let representation
  if (values.has(identity(row.literalKind, row.value))) {
    representation = 'source-file-ast'
  } else if (row.literalKind === 'property' && row.value === 'createElement') {
    representation = 'jsx-create-element-lowering'
  } else if (row.literalKind === 'property' && row.value === 'c') {
    representation = 'react-compiler-memo-cache'
  } else if (
    row.literalKind === 'string' &&
    jsxTextLowerings.has(row.value)
  ) {
    representation = 'jsx-text-lowering'
  } else {
    throw new Error(
      `Target119 u21281 residue lacks a closed representation: ${row.literalKind}:${JSON.stringify(row.value)}`,
    )
  }
  representationCounts[representation] += 1
  return {
    kind: row.literalKind,
    value: row.value,
    start: row.target.start,
    end: row.target.end,
    baselineCount: row.baselineOccurrenceCount,
    targetOrdinal: row.targetOccurrenceNumber,
    representation,
  }
})
if (
  JSON.stringify(representationCounts) !==
  JSON.stringify({
    'source-file-ast': EXPECTED.sourceFileAst,
    'jsx-create-element-lowering': EXPECTED.jsxCreateElement,
    'react-compiler-memo-cache': EXPECTED.reactCompilerMemoCache,
    'jsx-text-lowering': EXPECTED.jsxText,
  })
) {
  throw new Error(
    `Target119 u21281 representation counts differ: ${JSON.stringify(representationCounts)}`,
  )
}
const sourceJsxElements = jsxElementCount(ts, declaration)
if (sourceJsxElements !== EXPECTED.jsxCreateElement) {
  throw new Error(`ProTrialStartScreen JSX element count differs: ${sourceJsxElements}`)
}
if (!/^function\s+[A-Za-z_$][\w$]*\([^)]*\)\{let\s+[^,]+=[^;]+\.c\(9\),/.test(targetText)) {
  throw new Error('Target119 u21281 React compiler memo-cache prefix differs')
}

const canonicalRows = residueRows.map(canonicalResidue)
let correctedScanner
if (correctedLiveRows) {
  const correctedResidues = correctedLiveRows.map(row => {
    const occurrence = targetOccurrences.get(
      JSON.stringify([
        row.target.start,
        row.target.end,
        row.literalKind,
        row.value,
      ]),
    )
    if (!occurrence) {
      throw new Error(
        `Target119 u21281 corrected residue occurrence is absent: ${row.target.start}-${row.target.end}`,
      )
    }
    return {
      kind: row.literalKind,
      value: row.value,
      start: row.target.start,
      end: row.target.end,
      baselineCount: row.baselineOccurrenceCount,
      targetOrdinal: row.targetOccurrenceNumber,
      representation: compilerRepresentation(row, occurrence, values),
    }
  })
  const correctedRepresentationCounts = Object.fromEntries(
    [...new Set(correctedResidues.map(row => row.representation))]
      .sort()
      .map(representation => [
        representation,
        correctedResidues.filter(row => row.representation === representation)
          .length,
      ]),
  )
  const sourceBoldAttributes = jsxBooleanAttributeCount(
    ts,
    declaration,
    'bold',
  )
  if (
    sourceBoldAttributes !== 2 ||
    correctedRepresentationCounts['jsx-boolean-attribute-lowering'] !==
      sourceBoldAttributes
  ) {
    throw new Error(
      'Target119 u21281 JSX boolean-attribute lowering count differs',
    )
  }
  correctedScanner = {
    units: 1,
    residues: correctedResidues.length,
    residueIdentitiesSha256:
      EXPECTED.correctedScannerResidueIdentitiesSha256,
    representationCounts: correctedRepresentationCounts,
    sourceBoldAttributes,
    rows: correctedResidues,
  }
} else {
  correctedScanner = frozen?.coverageEvolution?.correctedScanner
  if (
    correctedScanner?.residues !== EXPECTED.correctedScannerResidues ||
    correctedScanner?.residueIdentitiesSha256 !==
      EXPECTED.correctedScannerResidueIdentitiesSha256
  ) {
    throw new Error(
      'Target119 u21281 provisional regeneration requires the exact frozen corrected scanner proof',
    )
  }
}
const fixture = {
  schemaVersion: 1,
  case: '2.1.118-to-2.1.119',
  targetVersion: '2.1.119',
  status: 'authenticated-complete-unit-source-and-compiler-owner-proof',
  criterion:
    'exact-target-unit-and-residue-plus-sole-source-marker-candidate-and-closed-compiler-lowering',
  evidenceIds: ownerOverride.evidenceIds,
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
      release: '2.1.119',
      files: universe.length,
      markerCandidates: markerCandidates.map(relative => `src/${relative}`),
    },
    sourceFile: {
      path: ownerOverride.paths[0],
      ...descriptor(sourceBytes),
    },
  },
  summary: {
    units: 1,
    residues: residues.length,
    targetIndicesSha256: sha256(JSON.stringify([EXPECTED.targetIndex])),
    residueIdentitiesSha256: sha256(JSON.stringify(canonicalRows)),
    representationCounts,
  },
  compilerProof: {
    sourceJsxElements,
    targetCreateElementResidues: representationCounts['jsx-create-element-lowering'],
    reactCompilerMemoCache: { property: 'c', slots: 9 },
    jsxTextLowerings: TARGET119_PRO_TRIAL_START_JSX_TEXT_LOWERINGS,
  },
  coverageEvolution: {
    correctedScanner,
  },
  rows: [
    {
      targetIndex: EXPECTED.targetIndex,
      priorOwnerPaths: priorOwnerPaths.map(relative => `src/${relative}`),
      sourceOwner: ownerOverride.paths[0],
      declaration: {
        kind: 'FunctionDeclaration',
        name: ownerOverride.declarationName,
        start: declarationStart,
        end: declarationEnd,
        bytes: Buffer.byteLength(declarationText),
        sourceHash: sha256(declarationText),
      },
      target: {
        classification: region.classification,
        nodeType: region.target.nodeType,
        start: region.target.start,
        end: region.target.end,
        bytes: region.target.end - region.target.start,
        sourceHash: region.target.sourceHash,
      },
      behavior: ownerOverride.behavior,
      evidenceIds: ownerOverride.evidenceIds,
      sourceMarkers: TARGET119_PRO_TRIAL_START_SOURCE_MARKERS,
      residues,
    },
  ],
}

fs.writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`)
process.stdout.write(
  `${JSON.stringify({ fixturePath, ...fixture.summary, sourceFile: fixture.inputs.sourceFile })}\n`,
)
