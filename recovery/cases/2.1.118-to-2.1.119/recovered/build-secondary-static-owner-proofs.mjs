#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  TARGET119_SECONDARY_STATIC_OWNER_OVERRIDES,
  TARGET119_SECONDARY_STATIC_PROOF_SPECS,
} from './secondary-static-owner-overrides.mjs'

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
const analysisPath = path.join(
  root,
  'recovery/test/recovery-2.1.119-owner-residue-analysis.json',
)
const structuralPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/structural/generated-delta.json.gz',
)
const baselineBundlePath = path.resolve(
  process.env.CLAUDE_CODE_2_1_118_BUNDLE ??
    path.join(
      root,
      '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
    ),
)
const targetBundlePath = path.resolve(
  process.env.CLAUDE_CODE_2_1_119_BUNDLE ??
    path.join(
      root,
      '.recovery-tmp/authenticated-artifacts/2.1.119-linux-x64/cli.inner.js',
    ),
)
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-secondary-static-owner-proofs.json',
)

const EXPECTED = Object.freeze({
  units: 7,
  residues: 10,
  targetIndicesSha256:
    '86028c35859ad0645fe09f8a3f21d42c39b7dc5abecdf8d5ee5935f90927b4fb',
  residueIdentitiesSha256:
    '13bde77d75a68971e11998a1dc6a7800839d42b08fa5cf0f25681c110faa39d3',
})
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

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })
const descriptorAt = (value, start, end) => ({
  start,
  end,
  ...descriptor(value.subarray(start, end)),
})

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
      kind,
      value,
      baseOffset + node.start,
      baseOffset + node.end,
    ])
    if (occurrences.has(key)) throw new Error(`duplicate target occurrence ${key}`)
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

async function loadTypeScript() {
  const filename = path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

function statementNames(ts, sourceFile, statement) {
  if (
    (ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement)) &&
    statement.name
  ) {
    return [statement.name.text]
  }
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.map(declaration =>
      ts.isIdentifier(declaration.name)
        ? declaration.name.text
        : declaration.name.getText(sourceFile),
    )
  }
  return []
}

function countIdentifier(ts, node, name) {
  let count = 0
  function visit(child) {
    if (ts.isIdentifier(child) && child.text === name) count += 1
    ts.forEachChild(child, visit)
  }
  visit(node)
  return count
}

function namedImportAudit(ts, sourceFile, scope, expected) {
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
      if (
        (element.propertyName?.text ?? element.name.text) ===
          expected.importedName &&
        element.name.text === expected.importedName
      ) {
        imports.push(element)
      }
    }
  }
  if (imports.length !== 1) {
    throw new Error(
      `${expected.module}:${expected.importedName}: expected one named import`,
    )
  }
  const references = countIdentifier(ts, scope, expected.importedName)
  if (references < 1) {
    throw new Error(
      `${expected.scopeName}:${expected.importedName}: source reference absent`,
    )
  }
  return {
    module: expected.module,
    importedName: expected.importedName,
    sourceImport: {
      start: imports[0].getStart(sourceFile),
      end: imports[0].end,
      sourceHash: sha256(imports[0].getText(sourceFile)),
    },
    sourceScopeReferences: references,
  }
}

function exactBuildMetadataObject(occurrence) {
  const object = [...occurrence.parents]
    .reverse()
    .find(parent => parent.type === 'ObjectExpression')
  if (!object || object.properties.length !== BUILD_METADATA.size) return null
  const actual = new Map()
  for (const property of object.properties) {
    if (
      property.type !== 'Property' ||
      property.computed ||
      property.key.type !== 'Identifier' ||
      property.value.type !== 'Literal' ||
      typeof property.value.value !== 'string'
    ) {
      return null
    }
    actual.set(property.key.name, property.value.value)
  }
  if (
    actual.size !== BUILD_METADATA.size ||
    ![...BUILD_METADATA].every(([key, value]) => actual.get(key) === value)
  ) {
    return null
  }
  return {
    properties: Object.fromEntries(actual),
    start: object.start,
    end: object.end,
  }
}

function sourceTypeofUndefinedCount(ts, node) {
  let count = 0
  function visit(child) {
    if (
      ts.isBinaryExpression(child) &&
      child.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken &&
      ts.isTypeOfExpression(child.left) &&
      ts.isIdentifier(child.left.expression) &&
      child.left.expression.text === 'Bun' &&
      ts.isStringLiteral(child.right) &&
      child.right.text === 'undefined'
    ) {
      count += 1
    }
    ts.forEachChild(child, visit)
  }
  visit(node)
  return count
}

function targetRepresentation(ts, sourceFile, scope, spec, residue, occurrence) {
  const parent = occurrence.parents.at(-1)
  if (spec.representation === 'named-import-member-lowering') {
    if (
      residue.literalKind !== 'property' ||
      residue.value !== spec.importedName ||
      parent?.type !== 'MemberExpression' ||
      parent.computed !== false ||
      parent.property !== occurrence.node
    ) {
      throw new Error(`u${spec.targetIndex}: named-import target role differs`)
    }
    return {
      representation: spec.representation,
      proof: namedImportAudit(ts, sourceFile, scope, {
        ...spec,
        scopeName: spec.scopeName,
      }),
    }
  }
  if (spec.representation === 'build-metadata-object-expansion') {
    const metadata = exactBuildMetadataObject(occurrence)
    if (!metadata || !scope.getText(sourceFile).includes('MACRO.VERSION')) {
      throw new Error(`u${spec.targetIndex}: exact build metadata proof differs`)
    }
    return {
      representation: spec.representation,
      proof: {
        targetObject: metadata,
        sourceMacroReference: 'MACRO.VERSION',
      },
    }
  }
  if (spec.representation === 'minified-typeof-undefined') {
    if (
      residue.literalKind !== 'string' ||
      residue.value !== 'u' ||
      parent?.type !== 'BinaryExpression' ||
      parent.operator !== '<' ||
      parent.right !== occurrence.node ||
      parent.left?.type !== 'UnaryExpression' ||
      parent.left.operator !== 'typeof' ||
      sourceTypeofUndefinedCount(ts, scope) !== 1
    ) {
      throw new Error(`u${spec.targetIndex}: typeof-undefined lowering differs`)
    }
    return {
      representation: spec.representation,
      proof: {
        sourceExpression: "typeof Bun !== 'undefined'",
        targetOperator: '<',
        targetLeftType: parent.left.type,
      },
    }
  }
  throw new Error(`u${spec.targetIndex}: unknown representation`)
}

const ts = await loadTypeScript()
const baselineBundle = fs.readFileSync(baselineBundlePath)
const targetBundle = fs.readFileSync(targetBundlePath)
const targetText = targetBundle.toString('utf8')
const structuralBytes = fs.readFileSync(structuralPath)
const structural = JSON.parse(gunzipSync(structuralBytes))
const regions = new Map(
  structural.regions.map(region => [region.target.index, region]),
)
const analysisBytes = fs.readFileSync(analysisPath)
const analysis = JSON.parse(analysisBytes)
const mappings = new Map(
  analysis.analysis.sourceSupplementGaps.map(row => [row.targetIndex, row]),
)
const report = JSON.parse(fs.readFileSync(reportPath))
const selectedIndices = TARGET119_SECONDARY_STATIC_OWNER_OVERRIDES.map(
  row => row.targetIndex,
)
if (
  selectedIndices.length !== EXPECTED.units ||
  sha256(JSON.stringify(selectedIndices)) !== EXPECTED.targetIndicesSha256 ||
  JSON.stringify(selectedIndices) !==
    JSON.stringify(
      TARGET119_SECONDARY_STATIC_PROOF_SPECS.map(row => row.targetIndex),
    )
) {
  throw new Error('Target119 secondary-static unit selection drifted')
}
const selected = new Set(selectedIndices)
const reportRows = report.sourceRuntimeAddedOwnerResidueRows.filter(row =>
  selected.has(row.structural.index),
)
if (
  reportRows.length !== EXPECTED.residues ||
  sha256(JSON.stringify(reportRows.map(canonicalResidue))) !==
    EXPECTED.residueIdentitiesSha256
) {
  throw new Error('Target119 secondary-static scanner residue universe drifted')
}
const rowsByIndex = new Map()
for (const row of reportRows) {
  const rows = rowsByIndex.get(row.structural.index) ?? []
  rows.push(row)
  rowsByIndex.set(row.structural.index, rows)
}
const overrideByIndex = new Map(
  TARGET119_SECONDARY_STATIC_OWNER_OVERRIDES.map(row => [row.targetIndex, row]),
)
const sourceFiles = new Map()
const rows = TARGET119_SECONDARY_STATIC_PROOF_SPECS.map(unitSpec => {
  const override = overrideByIndex.get(unitSpec.targetIndex)
  const mapping = mappings.get(unitSpec.targetIndex)
  const region = regions.get(unitSpec.targetIndex)
  const live = rowsByIndex.get(unitSpec.targetIndex) ?? []
  if (!override || !mapping || !region) {
    throw new Error(`u${unitSpec.targetIndex}: proof input absent`)
  }
  const ownerRelative = override.paths[0].replace(/^src\//, '')
  if (
    JSON.stringify(mapping.ownerPaths) !== JSON.stringify([ownerRelative]) ||
    live.some(row => (row.sourceMatches ?? []).includes(ownerRelative))
  ) {
    throw new Error(`u${unitSpec.targetIndex}: exact current-owner gap differs`)
  }
  if (live.length !== unitSpec.representations.length) {
    throw new Error(`u${unitSpec.targetIndex}: complete residue count differs`)
  }
  const targetUnit = targetText.slice(region.target.start, region.target.end)
  if (sha256(targetUnit) !== region.target.sourceHash) {
    throw new Error(`u${unitSpec.targetIndex}: target unit hash differs`)
  }
  const targetOccurrences = targetOccurrenceMap(
    targetUnit,
    region.target.start,
  )
  const sourceFilename = path.join(sourceRoot, ownerRelative)
  const sourceBytes = fs.readFileSync(sourceFilename)
  const sourceText = sourceBytes.toString('utf8')
  const sourceFile = ts.createSourceFile(
    sourceFilename,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ownerRelative.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  if (sourceFile.parseDiagnostics.length !== 0) {
    throw new Error(`u${unitSpec.targetIndex}: source parse diagnostics`)
  }
  const scopes = sourceFile.statements.filter(statement =>
    statementNames(ts, sourceFile, statement).includes(unitSpec.scopeName),
  )
  if (scopes.length !== 1) {
    throw new Error(`u${unitSpec.targetIndex}: exact source scope absent`)
  }
  const scope = scopes[0]
  sourceFiles.set(override.paths[0], {
    path: override.paths[0],
    ...descriptor(sourceBytes),
  })
  const residues = live.map((residue, index) => {
    const expected = unitSpec.representations[index]
    if (
      residue.literalKind !== expected.kind ||
      JSON.stringify(residue.value) !== JSON.stringify(expected.value)
    ) {
      throw new Error(`u${unitSpec.targetIndex}: residue/spec order differs`)
    }
    const occurrence = targetOccurrences.get(
      JSON.stringify([
        residue.literalKind,
        residue.value,
        residue.target.start,
        residue.target.end,
      ]),
    )
    if (!occurrence) {
      throw new Error(`u${unitSpec.targetIndex}: target occurrence absent`)
    }
    const represented = targetRepresentation(
      ts,
      sourceFile,
      scope,
      { ...expected, targetIndex: unitSpec.targetIndex, scopeName: unitSpec.scopeName },
      residue,
      occurrence,
    )
    return {
      kind: residue.literalKind,
      value: residue.value,
      start: residue.target.start,
      end: residue.target.end,
      baselineCount: residue.baselineOccurrenceCount,
      targetOrdinal: residue.targetOccurrenceNumber,
      ...represented,
    }
  })
  const scopeStart = scope.getStart(sourceFile)
  const scopeEnd = scope.end
  return {
    targetIndex: unitSpec.targetIndex,
    ownerPath: override.paths[0],
    priorOwnerPaths: mapping.ownerPaths.map(value => `src/${value}`),
    behavior: override.behavior,
    evidenceIds: override.evidenceIds,
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
      ...descriptor(sourceBytes),
    },
    scope: {
      name: unitSpec.scopeName,
      kind: ts.SyntaxKind[scope.kind],
      ...descriptorAt(sourceBytes, scopeStart, scopeEnd),
    },
    residues,
  }
})

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
if (
  flattened.length !== EXPECTED.residues ||
  sha256(JSON.stringify(flattened)) !== EXPECTED.residueIdentitiesSha256
) {
  throw new Error('Target119 secondary-static frozen identities drifted')
}
const representationCounts = Object.fromEntries(
  [...new Set(rows.flatMap(row => row.residues.map(item => item.representation)))]
    .sort()
    .map(representation => [
      representation,
      rows
        .flatMap(row => row.residues)
        .filter(item => item.representation === representation).length,
    ]),
)
const fixture = {
  schemaVersion: 1,
  case: '2.1.118-to-2.1.119',
  targetVersion: '2.1.119',
  status: 'authenticated-secondary-static-source-compiler-owner-proof',
  criterion:
    'exact-current-owner-plus-complete-target-unit-and-source-scope-and-closed-compiler-transform-v1',
  evidenceIds: TARGET119_SECONDARY_STATIC_OWNER_OVERRIDES[0].evidenceIds,
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
    frozenAnalysis: {
      path: 'recovery/test/recovery-2.1.119-owner-residue-analysis.json',
      ...descriptor(analysisBytes),
    },
    sourceFiles: [...sourceFiles.values()].sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
  },
  summary: {
    units: rows.length,
    residues: flattened.length,
    sourceFiles: sourceFiles.size,
    representationCounts,
    targetIndicesSha256: EXPECTED.targetIndicesSha256,
    residueIdentitiesSha256: EXPECTED.residueIdentitiesSha256,
  },
  ownerOverrides: TARGET119_SECONDARY_STATIC_OWNER_OVERRIDES,
  rows,
}

const serialized = `${JSON.stringify(fixture, null, 2)}\n`
if (process.argv.includes('--write')) fs.writeFileSync(fixturePath, serialized)
else process.stdout.write(serialized)
