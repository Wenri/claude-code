import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  TARGET119_DIRECT_DECLARATION_IMPORT_LOWERINGS,
  TARGET119_DIRECT_DECLARATION_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/direct-declaration-owner-overrides.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-direct-declaration-owner-proofs.json',
)
const builderPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/build-direct-declaration-owner-proofs.mjs',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/direct-declaration-owner-overrides.mjs',
)
const historicalSourceRoot = path.join(
  root,
  '.recovery-tmp/semantic-trees/2.1.119/src',
)
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? historicalSourceRoot,
)
const artifactRoot = path.join(root, '.recovery-tmp/authenticated-artifacts')
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const FIXTURE_SHA256 =
  'a65c6f99fb8dd77d547cc1984062a89c312d92ca0f5e88c2cf05ee1e7093daac'
const BUILDER_SHA256 =
  'c46a618a3945666e7c1e799682e36dcca3bf0476f70ce9e7450eb960d8b912fb'
const HELPER_SHA256 =
  'ec6642e6e09fb2673a59d3aae5e015f15e7340912fe9764d02a1e948dd2c8878'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function artifactPath(environmentName, input) {
  return process.env[environmentName]
    ? path.resolve(process.env[environmentName])
    : path.join(artifactRoot, input.artifact)
}

function readExact(filename, expected, label = filename) {
  const value = fs.readFileSync(filename)
  assert.deepEqual(
    descriptor(value),
    { bytes: expected.bytes, sha256: expected.sha256 },
    label,
  )
  return value
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

function canonicalFixtureResidues(rows, predicate = () => true) {
  return rows.flatMap(row =>
    row.residues.filter(predicate).map(residue => [
      row.targetIndex,
      residue.kind,
      residue.value,
      residue.start,
      residue.end,
      residue.baselineCount,
      residue.targetOrdinal,
    ]),
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

function sourceAudit(ts, sourceRoot_, relative) {
  const filename = path.join(sourceRoot_, relative)
  const bytes = fs.readFileSync(filename)
  const source = bytes.toString('utf8')
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, relative)
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
    sourceFile,
    scopes,
    values: sourceNodeAudit(ts, sourceFile, sourceFile),
  }
}

function targetAudit(source, includeOccurrences = true) {
  const values = new Map()
  const occurrences = []
  function add(kind, value, node, parents) {
    const key = identity(kind, value)
    const kinds = values.get(key) ?? new Set()
    kinds.add(node.type)
    values.set(key, kinds)
    if (includeOccurrences) occurrences.push({ key, node, parents })
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

function globalOccurrences(source) {
  const values = new Map()
  const audit = targetAudit(source)
  for (const occurrence of audit.occurrences) {
    const rows = values.get(occurrence.key) ?? []
    rows.push({ start: occurrence.node.start, end: occurrence.node.end })
    values.set(occurrence.key, rows)
  }
  return values
}

function namedImportTargetRole(residue, occurrence, expected) {
  const member = occurrence.parents.at(-1)
  const call = occurrence.parents.at(-2)
  if (
    residue.kind !== 'property' ||
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

test(
  'Target119 direct-declaration fixture authenticates all three complete units',
  { skip: !selected, timeout: 120_000 },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(builderPath)), BUILDER_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.equal(fixture.case, caseName)
    assert.equal(
      fixture.criterion,
      'target119-unique-whole-unit-owner-and-named-declaration-with-import-lowering-v1',
    )
    assert.deepEqual(fixture.summary, {
      units: 3,
      residues: 51,
      sourceFiles: 3,
      representationKinds: {
        'named-import-call-lowering': 3,
        'source-declaration-ast': 48,
      },
      correctedScannerUnits: 3,
      correctedScannerResidues: 3,
      targetIndicesSha256:
        '104ac9286f768585d97b4de28ed04f13bc9f959e16944fbd832bc7168292c569',
      residueIdentitiesSha256:
        'e377afdd4d2ed9a8b4aa693f3004d896146f0bd534aa3725277ed88af23f3ebc',
      correctedScannerResidueIdentitiesSha256:
        '99ab50721d622d51bb728385e7315861a400941fea61d48074659326f9435ddf',
    })
    assert.deepEqual(
      fixture.rows.map(row => row.targetIndex),
      [20776, 20874, 20880],
    )
    assert.equal(
      sha256(
        Buffer.from(JSON.stringify(fixture.rows.map(row => row.targetIndex))),
      ),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      sha256(Buffer.from(JSON.stringify(canonicalFixtureResidues(fixture.rows)))),
      fixture.summary.residueIdentitiesSha256,
    )
    assert.deepEqual(
      fixture.ownerOverrides,
      TARGET119_DIRECT_DECLARATION_OWNER_OVERRIDES,
    )

    const baseline = readExact(
      artifactPath('CLAUDE_CODE_2_1_118_BUNDLE', fixture.inputs.baselineBundle),
      fixture.inputs.baselineBundle,
      'Target118 baseline bundle',
    ).toString('utf8')
    const target = readExact(
      artifactPath('CLAUDE_CODE_2_1_119_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'Target119 target bundle',
    ).toString('utf8')
    const baselineOccurrences = globalOccurrences(baseline)
    const targetOccurrences = globalOccurrences(target)
    for (const row of fixture.rows) {
      const unit = target.slice(row.target.start, row.target.end)
      assert.equal(Buffer.byteLength(unit), row.target.bytes)
      assert.equal(sha256(unit), row.target.sourceHash)
      const unitAudit = targetAudit(unit)
      assert.equal(unitAudit.values.size, row.binding.targetIdentities)
      assert.equal(
        sha256(
          Buffer.from(JSON.stringify([...unitAudit.values.keys()].sort())),
        ),
        row.binding.targetIdentitiesSha256,
      )
      for (const residue of row.residues) {
        const key = identity(residue.kind, residue.value)
        assert.ok(unitAudit.values.has(key), `u${row.targetIndex}: ${key}`)
        assert.equal(
          (baselineOccurrences.get(key) ?? []).length,
          residue.baselineCount,
          `u${row.targetIndex}: baseline ${key}`,
        )
        const occurrence =
          (targetOccurrences.get(key) ?? [])[residue.targetOrdinal - 1]
        assert.ok(occurrence, `u${row.targetIndex}: target ordinal ${key}`)
        assert.deepEqual(
          [occurrence.start, occurrence.end],
          [residue.start, residue.end],
          `u${row.targetIndex}: target range ${key}`,
        )
      }
    }
  },
)

test(
  'Target119 whole-unit owners, declarations, and named-import lowerings are fail closed',
  { skip: !selected, timeout: 120_000 },
  async () => {
    const ts = await loadTypeScript()
    const historicalAudits = new Map()
    const inverted = new Map()
    for (const relative of sourceFiles(historicalSourceRoot)) {
      const audit = sourceAudit(ts, historicalSourceRoot, relative)
      historicalAudits.set(relative, audit)
      for (const key of audit.values.keys()) {
        const files = inverted.get(key) ?? []
        files.push(relative)
        inverted.set(key, files)
      }
    }
    assert.equal(historicalAudits.size, fixture.selection.sourceUniverseFiles)
    const target = readExact(
      artifactPath('CLAUDE_CODE_2_1_119_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'Target119 target bundle',
    ).toString('utf8')
    for (const row of fixture.rows) {
      const relative = row.sourceOwner.slice(4)
      const historical = historicalAudits.get(relative)
      assert.ok(historical, `u${row.targetIndex}: historical owner`)
      assert.deepEqual(descriptor(historical.bytes), {
        bytes: row.source.bytes,
        sha256: row.source.sha256,
      })
      const packaged = sourceAudit(ts, sourceRoot, relative)
      assert.deepEqual(descriptor(packaged.bytes), {
        bytes: row.source.bytes,
        sha256: row.source.sha256,
      })
      const unitAudit = targetAudit(
        target.slice(row.target.start, row.target.end),
      )
      const scores = new Map()
      for (const key of unitAudit.values.keys()) {
        const matches = inverted.get(key) ?? []
        const weight = 1 / Math.log2(matches.length + 2)
        for (const filename of matches) {
          const score = scores.get(filename) ?? {
            matches: 0,
            rare: 0,
            weighted: 0,
          }
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
      assert.equal(ranked[0][0], relative, `u${row.targetIndex}: unique owner`)
      assert.deepEqual(
        {
          matches: ranked[0][1].matches,
          rare: ranked[0][1].rare,
          weighted: rounded(ranked[0][1].weighted),
          margin: rounded(
            ranked[0][1].weighted - (ranked[1]?.[1].weighted ?? 0),
          ),
          runnerUp: ranked[1]?.[0] ?? null,
          runnerUpWeighted: rounded(ranked[1]?.[1].weighted ?? 0),
        },
        {
          matches: row.binding.matches,
          rare: row.binding.rare,
          weighted: row.binding.weighted,
          margin: row.binding.margin,
          runnerUp: row.binding.runnerUp,
          runnerUpWeighted: row.binding.runnerUpWeighted,
        },
      )
      assert.ok(row.binding.rare >= fixture.selection.minimumRareIdentities)
      assert.ok(row.binding.margin > 0)

      for (const audit of [historical, packaged]) {
        const scopes = audit.scopes
          .map(scope => ({
            ...scope,
            targetMatches: [...unitAudit.values.keys()].filter(key =>
              scope.values.has(key),
            ).length,
          }))
          .sort(
            (left, right) =>
              right.targetMatches - left.targetMatches ||
              left.index - right.index,
          )
        const declaration = scopes[0]
        const declarationRunner = scopes[1]
        assert.deepEqual(
          {
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
          row.declaration,
          `u${row.targetIndex}: unique declaration`,
        )
        assert.ok(
          declaration.targetMatches >
            (declarationRunner?.targetMatches ?? 0),
          `u${row.targetIndex}: declaration margin`,
        )
        const expectedImport =
          TARGET119_DIRECT_DECLARATION_IMPORT_LOWERINGS[row.targetIndex]
        const importAudit = importedCallAudit(
          ts,
          audit.sourceFile,
          declaration.node,
          expectedImport,
        )
        assert.equal(importAudit.imports.length, 1)
        assert.equal(importAudit.declarationCalls, 1)
        for (const residue of row.residues) {
          const key = identity(residue.kind, residue.value)
          const occurrence = unitAudit.occurrences.find(
            item =>
              item.key === key &&
              item.node.start + row.target.start === residue.start &&
              item.node.end + row.target.start === residue.end,
          )
          assert.ok(occurrence, `u${row.targetIndex}: target occurrence ${key}`)
          if (residue.representation === 'source-declaration-ast') {
            assert.deepEqual(
              [...(declaration.values.get(key) ?? [])].sort(),
              residue.sourceKinds,
              `u${row.targetIndex}: declaration AST ${key}`,
            )
            assert.equal(residue.importLowering, null)
          } else {
            assert.deepEqual(residue.sourceKinds, [])
            const role = namedImportTargetRole(
              residue,
              occurrence,
              expectedImport,
            )
            assert.ok(role, `u${row.targetIndex}: named import target role`)
            assert.deepEqual(
              {
                importedName: role.importedName,
                module: role.module,
                sourceImport: importAudit.imports[0],
                sourceDeclarationCalls: importAudit.declarationCalls,
                targetNamespaceNodeType: role.targetNamespaceNodeType,
              },
              residue.importLowering,
              `u${row.targetIndex}: exact named import lowering`,
            )
          }
          assert.deepEqual(
            [...(unitAudit.values.get(key) ?? [])].sort(),
            residue.targetKinds,
            `u${row.targetIndex}: target node kinds ${key}`,
          )
        }
      }
    }
  },
)

test(
  'Target119 direct-declaration coverage and scanner correction are atomic',
  { skip: !selected },
  () => {
    const coverage = JSON.parse(
      gunzipSync(
        fs.readFileSync(
          path.join(
            root,
            'recovery/cases/2.1.118-to-2.1.119/semantic/source-coverage.json.gz',
          ),
        ),
      ),
    )
    const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
    const coverageRows = new Map(
      coverage.rows.map(row => [row.targetIndex, row]),
    )
    const states = new Set()
    for (const proof of fixture.rows) {
      const row = coverageRows.get(proof.targetIndex)
      assert.ok(row, `u${proof.targetIndex}: coverage row`)
      const ownerPaths = row.ownerIds.map(ownerId => owners.get(ownerId))
      const provisional =
        JSON.stringify(ownerPaths) ===
          JSON.stringify(proof.priorOwnerPaths) &&
        JSON.stringify(row.evidenceIds) ===
          JSON.stringify(['source-map-attribution', 'semantic-test'])
      const corrected =
        JSON.stringify(ownerPaths) === JSON.stringify([proof.sourceOwner]) &&
        JSON.stringify(row.evidenceIds) ===
          JSON.stringify(fixture.evidenceIds) &&
        row.behavior === proof.behavior
      assert.ok(
        provisional || corrected,
        `u${proof.targetIndex}: exact provisional or corrected coverage`,
      )
      states.add(corrected ? 'corrected' : 'provisional')
    }
    assert.equal(states.size, 1, 'three-unit owner correction must be atomic')

    const reportPath = path.join(
      root,
      '.recovery-tmp/residue-audits/2.1.118-to-2.1.119.typed-audit.json',
    )
    if (fs.existsSync(reportPath)) {
      const report = JSON.parse(fs.readFileSync(reportPath))
      const indices = new Set(fixture.rows.map(row => row.targetIndex))
      const live = report.sourceRuntimeAddedOwnerResidueRows
        .filter(row => indices.has(row.structural.index))
        .map(row => [
          row.structural.index,
          row.literalKind,
          row.value,
          row.target.start,
          row.target.end,
          row.baselineOccurrenceCount,
          row.targetOccurrenceNumber,
        ])
      const provisional = canonicalFixtureResidues(fixture.rows)
      const corrected = canonicalFixtureResidues(
        fixture.rows,
        residue => residue.scannerRetainedAfterCorrection,
      )
      assert.ok(
        JSON.stringify(live) === JSON.stringify(provisional) ||
          JSON.stringify(live) === JSON.stringify(corrected),
        'scanner must be exact 51-residue provisional or three-residue corrected state',
      )
    }
  },
)
