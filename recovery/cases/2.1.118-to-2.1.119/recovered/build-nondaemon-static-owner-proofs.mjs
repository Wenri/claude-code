#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const root = fileURLToPath(new URL('../../../..', import.meta.url))
const sourceRoot = path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src')
const analysisPath = path.join(
  root,
  'recovery/test/recovery-2.1.119-owner-residue-analysis.json',
)
const daemonFixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-daemon-cluster-residue-proofs.json',
)
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
  'recovery/test/recovery-2.1.119-nondaemon-static-owner-proofs.json',
)

const EXPECTED = {
  units: 24,
  residues: 527,
  targetIndicesSha256:
    '6ea9e203e133016bd69f888f6677abda53b94e02268d38cca553997e7937ac81',
  residueIdentitiesSha256:
    '80835220e05e3775cd0e126a384e77383f52f37e06c9a98dec0ae032a766cbaf',
}
const EVIDENCE_IDS = [
  'target119-nondaemon-declaration-owner-target-fragment',
  'target119-nondaemon-declaration-owner-source-ast-test',
]
const BUILD_METADATA = new Map([
  [
    'ISSUES_EXPLAINER',
    'report the issue at https://github.com/anthropics/claude-code/issues',
  ],
  ['PACKAGE_URL', '@anthropic-ai/claude-code'],
  ['README_URL', 'https://code.claude.com/docs/en/overview'],
  ['VERSION', '2.1.119'],
  ['FEEDBACK_CHANNEL', 'https://github.com/anthropics/claude-code/issues'],
  ['BUILD_TIME', '2026-04-23T19:08:52Z'],
  ['GIT_SHA', '6f68554839756189e277b8285a18fe47acd9a5a1'],
])

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
    file: descriptor(bytes),
    scopes,
    values: sourceNodeAudit(ts, sourceFile, sourceFile),
  }
}

function targetAudit(source) {
  const values = new Map()
  const occurrences = []
  const cacheBindings = new Set()
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
      if (node.regex) {
        add(
          'regexp',
          { pattern: node.regex.pattern, flags: node.regex.flags },
          node,
          parents,
        )
      } else if (typeof node.value === 'string') {
        add('string', node.value, node, parents)
      }
      else if (typeof node.value === 'number') {
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
    if (
      node.type === 'VariableDeclarator' &&
      node.id?.type === 'Identifier' &&
      node.init?.type === 'CallExpression' &&
      node.init.callee?.type === 'MemberExpression' &&
      node.init.callee.computed === false &&
      node.init.callee.property?.type === 'Identifier' &&
      node.init.callee.property.name === 'c' &&
      node.init.arguments[0]?.type === 'Literal' &&
      typeof node.init.arguments[0].value === 'number'
    ) {
      cacheBindings.add(node.id.name)
    }
    const nextParents = [...parents, node]
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
        visit(child, nextParents)
      }
    }
  }
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' })
  visit(ast)
  return { ast, cacheBindings, occurrences, values }
}

function metadataObject(occurrence) {
  const object = [...occurrence.parents]
    .reverse()
    .find(parent => parent.type === 'ObjectExpression')
  if (!object || object.properties.length !== BUILD_METADATA.size) return false
  const actual = new Map()
  for (const property of object.properties) {
    if (
      property.type !== 'Property' ||
      property.computed ||
      property.key.type !== 'Identifier' ||
      property.value.type !== 'Literal' ||
      typeof property.value.value !== 'string'
    ) {
      return false
    }
    actual.set(property.key.name, property.value.value)
  }
  return (
    actual.size === BUILD_METADATA.size &&
    [...BUILD_METADATA].every(([key, value]) => actual.get(key) === value)
  )
}

function isPromiseResolveMember(node) {
  return (
    node?.type === 'MemberExpression' &&
    node.computed === false &&
    node.object?.type === 'Identifier' &&
    node.object.name === 'Promise' &&
    node.property?.type === 'Identifier' &&
    node.property.name === 'resolve'
  )
}

function targetRepresentation(audit, residue, occurrence) {
  const parent = occurrence.parents.at(-1)
  if (metadataObject(occurrence)) return 'build-metadata-object-expansion'
  if (
    residue.literalKind === 'property' &&
    residue.value === 'resolve' &&
    isPromiseResolveMember(parent)
  ) {
    return 'dynamic-import-promise-resolve'
  }
  if (
    residue.literalKind === 'property' &&
    residue.value === 'then' &&
    parent?.type === 'MemberExpression' &&
    parent.object?.type === 'CallExpression' &&
    isPromiseResolveMember(parent.object.callee)
  ) {
    return 'dynamic-import-promise-then'
  }
  if (
    residue.literalKind === 'property' &&
    residue.value === 'createElement' &&
    parent?.type === 'MemberExpression' &&
    occurrence.parents.some(
      ancestor =>
        ancestor.type === 'CallExpression' && ancestor.callee === parent,
    )
  ) {
    return 'jsx-create-element-lowering'
  }
  if (
    residue.literalKind === 'property' &&
    residue.value === 'Fragment' &&
    parent?.type === 'MemberExpression'
  ) {
    return 'jsx-fragment-lowering'
  }
  if (
    residue.literalKind === 'property' &&
    residue.value === 'default' &&
    parent?.type === 'MemberExpression' &&
    occurrence.parents.some(
      ancestor =>
        ancestor.type === 'CallExpression' &&
        (ancestor.callee === parent || ancestor.callee?.object === parent),
    )
  ) {
    return 'default-import-call-lowering'
  }
  if (
    residue.literalKind === 'number' &&
    occurrence.parents.some(
      ancestor =>
        (ancestor.type === 'MemberExpression' &&
          ancestor.computed &&
          ancestor.property === occurrence.node &&
          ancestor.object?.type === 'Identifier' &&
          audit.cacheBindings.has(ancestor.object.name)) ||
        (ancestor.type === 'CallExpression' &&
          ancestor.arguments.includes(occurrence.node) &&
          ancestor.callee?.type === 'MemberExpression' &&
          ancestor.callee.computed === false &&
          ancestor.callee.property?.name === 'c'),
    )
  ) {
    return 'react-compiler-cache-index'
  }
  if (
    residue.literalKind === 'string' &&
    residue.value === 'react.memo_cache_sentinel' &&
    occurrence.parents.some(
      ancestor =>
        ancestor.type === 'CallExpression' &&
        ancestor.callee?.type === 'MemberExpression' &&
        ancestor.callee.computed === false &&
        ancestor.callee.object?.name === 'Symbol' &&
        ancestor.callee.property?.name === 'for',
    )
  ) {
    return 'react-compiler-cache-sentinel'
  }
  if (
    residue.literalKind === 'string' &&
    residue.value === 'u' &&
    occurrence.parents.some(
      ancestor =>
        ancestor.type === 'BinaryExpression' &&
        ancestor.operator === '<' &&
        ((ancestor.left?.type === 'UnaryExpression' &&
          ancestor.left.operator === 'typeof') ||
          (ancestor.right?.type === 'UnaryExpression' &&
            ancestor.right.operator === 'typeof')),
    )
  ) {
    return 'minified-typeof-undefined'
  }
  if (
    residue.literalKind === 'property' &&
    residue.value === 'constructor' &&
    parent?.type === 'MethodDefinition' &&
    parent.kind === 'constructor' &&
    parent.computed === false &&
    parent.key === occurrence.node
  ) {
    return 'class-constructor-lowering'
  }
  return null
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

function rounded(value) {
  return Number(value.toFixed(12))
}

const analysisBytes = fs.readFileSync(analysisPath)
const analysis = JSON.parse(analysisBytes)
const daemonBytes = fs.readFileSync(daemonFixturePath)
const daemon = JSON.parse(daemonBytes)
const reportBytes = fs.readFileSync(reportPath)
const report = JSON.parse(reportBytes)
const structuralBytes = fs.readFileSync(structuralPath)
const structural = JSON.parse(gunzipSync(structuralBytes))
const regions = new Map(
  structural.regions.map(region => [region.target.index, region]),
)
const baselineBundle = fs.readFileSync(baselineBundlePath)
const targetBundle = fs.readFileSync(targetBundlePath)
const targetText = targetBundle.toString('utf8')
const ts = await loadTypeScript()

const daemonIndices = new Set(daemon.rows.map(row => row.targetIndex))
const nonDaemonIndices = analysis.analysis.sourceGapReplay.ownerSupplementRequired
  .targetIndices.filter(targetIndex => !daemonIndices.has(targetIndex))
const nonDaemonSet = new Set(nonDaemonIndices)
if (nonDaemonIndices.length !== 136) {
  throw new Error('expected exact 136-unit non-daemon source-gap partition')
}
const reportRows = report.sourceRuntimeAddedOwnerResidueRows.filter(row =>
  nonDaemonSet.has(row.structural.index),
)
if (reportRows.length !== 1273) {
  throw new Error('expected exact 1,273-residue non-daemon source-gap partition')
}

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

const ownerCandidates = []
for (const targetIndex of nonDaemonIndices) {
  const region = regions.get(targetIndex)
  if (!region) throw new Error(`u${targetIndex}: structural region absent`)
  const unit = targetText.slice(region.target.start, region.target.end)
  if (sha256(unit) !== region.target.sourceHash) {
    throw new Error(`u${targetIndex}: target unit hash mismatch`)
  }
  const targetValues = targetAudit(unit)
  const scores = new Map()
  for (const key of targetValues.values.keys()) {
    const matches = inverted.get(key) ?? []
    const weight = 1 / Math.log2(matches.length + 2)
    for (const filename of matches) {
      const score = scores.get(filename) ?? { matches: 0, rare: 0, weighted: 0 }
      score.matches += 1
      score.weighted += weight
      if (matches.length <= 3) score.rare += 1
      scores.set(filename, score)
    }
  }
  const ranked = [...scores].sort(
    (left, right) =>
      right[1].weighted - left[1].weighted ||
      right[1].rare - left[1].rare ||
      right[1].matches - left[1].matches ||
      left[0].localeCompare(right[0]),
  )
  const [winner, winnerScore] = ranked[0] ?? [null, null]
  const runnerUpScore = ranked[1]?.[1]?.weighted ?? 0
  if (
    winner &&
    winnerScore.rare > 0 &&
    winnerScore.weighted - runnerUpScore > 0.05
  ) {
    ownerCandidates.push({
      targetIndex,
      owner: winner,
      region,
      targetValues,
      score: {
        matches: winnerScore.matches,
        rare: winnerScore.rare,
        weighted: rounded(winnerScore.weighted),
        margin: rounded(winnerScore.weighted - runnerUpScore),
        runnerUp: ranked[1]?.[0] ?? null,
        runnerUpWeighted: rounded(runnerUpScore),
      },
    })
  }
}

const ownerCandidateIndices = ownerCandidates.map(row => row.targetIndex)
if (
  ownerCandidates.length !== 105 ||
  sha256(Buffer.from(JSON.stringify(ownerCandidateIndices))) !==
    '663a9a80eabbaca873c40586f14b232875cf300b4becee6f4a902b5533b5bb86'
) {
  throw new Error('provisional rare-identity owner candidate selection drifted')
}
const sourceGapRows = new Map(
  analysis.analysis.sourceSupplementGaps.map(row => [row.targetIndex, row]),
)
const rows = []
for (const selection of ownerCandidates) {
  const ownerAudit = sourceAudits.get(selection.owner)
  const rankedScopes = ownerAudit.scopes
    .map(scope => ({
      ...scope,
      targetMatches: [...selection.targetValues.values.keys()].filter(key =>
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
    declaration.targetMatches <= (declarationRunner?.targetMatches ?? 0)
  ) {
    continue
  }
  const live = reportRows.filter(
    row => row.structural.index === selection.targetIndex,
  )
  const residues = []
  let closed = true
  for (const row of live) {
    const key = identity(row.literalKind, row.value)
    const sourceKinds = [...(declaration.values.get(key) ?? [])].sort()
    const targetKinds = [
      ...(selection.targetValues.values.get(key) ?? []),
    ].sort()
    if (targetKinds.length === 0) {
      throw new Error(`u${selection.targetIndex}: residue absent from target AST`)
    }
    const occurrence = selection.targetValues.occurrences.find(
      item =>
        item.key === key &&
        item.node.start + selection.region.target.start === row.target.start &&
        item.node.end + selection.region.target.start === row.target.end,
    )
    if (!occurrence) {
      throw new Error(`u${selection.targetIndex}: residue occurrence absent`)
    }
    const representation = sourceKinds.length
      ? 'source-declaration-ast'
      : targetRepresentation(selection.targetValues, row, occurrence)
    if (!representation) {
      closed = false
      break
    }
    residues.push({
      kind: row.literalKind,
      value: row.value,
      start: row.target.start,
      end: row.target.end,
      baselineCount: row.baselineOccurrenceCount,
      targetOrdinal: row.targetOccurrenceNumber,
      representation,
      sourceKinds,
      targetKinds,
      scannerRetainedAfterCorrection: !(row.sourceMatches ?? []).includes(
        selection.owner,
      ),
    })
  }
  if (!closed) continue
  const prior = sourceGapRows.get(selection.targetIndex)
  if (!prior) throw new Error(`u${selection.targetIndex}: prior source-gap row`)
  const declarationBytes = declaration.end - declaration.start
  rows.push({
    targetIndex: selection.targetIndex,
    sourceOwner: `src/${selection.owner}`,
    priorOwnerPaths: prior.ownerPaths.map(owner => `src/${owner}`),
    target: {
      classification: selection.region.classification,
      nodeType: selection.region.target.nodeType,
      start: selection.region.target.start,
      end: selection.region.target.end,
      bytes: selection.region.target.end - selection.region.target.start,
      sourceHash: selection.region.target.sourceHash,
      tokenCount: selection.region.target.tokenCount,
    },
    source: {
      path: `src/${selection.owner}`,
      ...ownerAudit.file,
    },
    declaration: {
      statementIndex: declaration.index,
      kind: declaration.kind,
      name: declaration.name,
      start: declaration.start,
      end: declaration.end,
      bytes: declarationBytes,
      sourceHash: declaration.sourceHash,
      targetIdentityMatches: declaration.targetMatches,
      runnerUpStatementIndex: declarationRunner?.index ?? null,
      runnerUpTargetIdentityMatches:
        declarationRunner?.targetMatches ?? 0,
    },
    binding: {
      targetIdentities: selection.targetValues.values.size,
      targetIdentitiesSha256: sha256(
        Buffer.from(
          JSON.stringify([...selection.targetValues.values.keys()].sort()),
        ),
      ),
      ...selection.score,
    },
    residues,
    behavior:
      `The complete authenticated Target119 unit u${selection.targetIndex} ` +
      `uniquely binds ${selection.owner} by rare whole-unit AST identity ` +
      `score and uniquely selects its ${declaration.kind} ` +
      `${declaration.name ?? `statement ${declaration.index}`}; every typed ` +
      'residue is pinned inside that declaration or to an exact compiler/build transformation.',
  })
}

const selectedIndices = rows.map(row => row.targetIndex)
if (
  rows.length !== EXPECTED.units ||
  sha256(Buffer.from(JSON.stringify(selectedIndices))) !==
    EXPECTED.targetIndicesSha256
) {
  throw new Error('declaration-scoped owner proof selection drifted')
}
const selectedSet = new Set(selectedIndices)
const selectedReportRows = reportRows.filter(row =>
  selectedSet.has(row.structural.index),
)
if (
  selectedReportRows.length !== EXPECTED.residues ||
  sha256(
    Buffer.from(JSON.stringify(selectedReportRows.map(canonicalResidue))),
  ) !== EXPECTED.residueIdentitiesSha256
) {
  throw new Error('declaration-scoped residue universe drifted')
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
const representationKinds = Object.fromEntries(
  [...new Set(rows.flatMap(row => row.residues.map(item => item.representation)))]
    .sort()
    .map(kind => [
      kind,
      rows
        .flatMap(row => row.residues)
        .filter(item => item.representation === kind).length,
    ]),
)
const correctedScannerRows = rows.flatMap(row =>
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
const ownerOverrides = rows.map(row => ({
  targetIndex: row.targetIndex,
  paths: [row.sourceOwner],
  evidenceIds: EVIDENCE_IDS,
  behavior: row.behavior,
}))
const sourceFilesUsed = [
  ...new Map(rows.map(row => [row.source.path, row.source])).values(),
].sort((left, right) => left.path.localeCompare(right.path))

const fixture = {
  schemaVersion: 1,
  case: '2.1.118-to-2.1.119',
  status: 'complete-unit-declaration-static-owner-proof-ready',
  criterion:
    'target119-nondaemon-unique-owner-declaration-static-transform-v2',
  evidenceIds: EVIDENCE_IDS,
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
    frozenAnalysisSnapshot: {
      path: 'recovery/test/recovery-2.1.119-owner-residue-analysis.json',
      ...descriptor(analysisBytes),
    },
    frozenScannerSnapshot: {
      path:
        '.recovery-tmp/residue-audits/2.1.118-to-2.1.119.typed-audit.json',
      ...descriptor(reportBytes),
    },
    daemonProof: {
      path:
        'recovery/test/recovery-2.1.119-daemon-cluster-residue-proofs.json',
      ...descriptor(daemonBytes),
    },
    sourceFiles: sourceFilesUsed,
  },
  selection: {
    sourceUniverseFiles: sourceAudits.size,
    provisionalOwnerCandidates: ownerCandidates.length,
    provisionalOwnerCandidateIndicesSha256: sha256(
      Buffer.from(JSON.stringify(ownerCandidateIndices)),
    ),
    minimumRareIdentities: 1,
    minimumWeightedMarginExclusive: 0.05,
    requireUniqueTopLevelDeclaration: true,
    allowedRepresentations: [
      'build-metadata-object-expansion',
      'class-constructor-lowering',
      'dynamic-import-promise-resolve',
      'dynamic-import-promise-then',
      'jsx-create-element-lowering',
      'source-declaration-ast',
    ],
  },
  summary: {
    units: rows.length,
    residues: flattened.length,
    sourceFiles: sourceFilesUsed.length,
    representationKinds,
    correctedScannerUnits: new Set(
      correctedScannerRows.map(row => row[0]),
    ).size,
    correctedScannerResidues: correctedScannerRows.length,
    targetIndicesSha256: sha256(Buffer.from(JSON.stringify(selectedIndices))),
    residueIdentitiesSha256: sha256(Buffer.from(JSON.stringify(flattened))),
    correctedScannerResidueIdentitiesSha256: sha256(
      Buffer.from(JSON.stringify(correctedScannerRows)),
    ),
  },
  ownerOverrides,
  rows,
}

const serialized = `${JSON.stringify(fixture, null, 2)}\n`
if (process.argv.includes('--write')) fs.writeFileSync(fixturePath, serialized)
else process.stdout.write(serialized)
