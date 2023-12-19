import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.119-nondaemon-static-owner-proofs.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '818bc4c000183a866dbab92b7fdd7f8c6bff53603f4d5171b7516c94715bc2bd'
const BUILDER_SHA256 =
  '85ac4cb02996d6de6d9efb881630078d14aacccd3031e9d255e7f08bd518d6f7'
const historicalSourceRoot = path.join(
  root,
  '.recovery-tmp/semantic-trees/2.1.119/src',
)
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? historicalSourceRoot,
)
const artifactRoot = path.join(root, '.recovery-tmp/authenticated-artifacts')
const builderPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/build-nondaemon-static-owner-proofs.mjs',
)
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

function jsonDescriptor(value) {
  const bytes = Buffer.from(JSON.stringify(value))
  return { jsonBytes: bytes.length, sha256: sha256(bytes) }
}

function partitionDescriptor(rows) {
  return { rows: rows.length, ...jsonDescriptor(rows) }
}

function rowTuple(row) {
  return [
    row.value,
    row.literalKind,
    row.targetAdded,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
    row.target.start,
    row.target.end,
    row.structural.index,
    row.structural.classification,
    row.structural.sourceHash,
    row.disposition,
    row.ownerPaths,
  ]
}

function selectArtifactPhase(typedAudit, sourceCoverage, sourceCoverageRaw) {
  const matches = fixture.artifactPhasePolicy.acceptedPairs.filter(
    pair =>
      pair.typedAudit.bytes === typedAudit.bytes &&
      pair.typedAudit.sha256 === typedAudit.sha256 &&
      pair.sourceCoverage.bytes === sourceCoverage.bytes &&
      pair.sourceCoverage.sha256 === sourceCoverage.sha256 &&
      pair.sourceCoverageRaw.bytes === sourceCoverageRaw.bytes &&
      pair.sourceCoverageRaw.sha256 === sourceCoverageRaw.sha256,
  )
  assert.equal(matches.length, 1, 'unknown or hybrid report/coverage pair')
  return matches[0].phase
}

function artifactPath(environmentName, input) {
  return process.env[environmentName]
    ? path.resolve(process.env[environmentName])
    : path.join(artifactRoot, input.artifact)
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), {
    bytes: expected.bytes,
    sha256: expected.sha256,
  }, label)
  return bytes
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

function walk(node, visit) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (typeof node.type === 'string') visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
      walk(child, visit)
    }
  }
}

function acornValues(source, includeOccurrences = false) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const values = new Map()
  function add(kind, value, node) {
    const key = identity(kind, value)
    const records = values.get(key) ?? []
    records.push(
      includeOccurrences ? { start: node.start, end: node.end } : node.type,
    )
    values.set(key, records)
  }
  walk(ast, node => {
    if (node.type === 'Literal' && node.regex) {
      add('regexp', node.regex, node)
    } else if (node.type === 'Literal' && typeof node.value === 'string') {
      add('string', node.value, node)
    } else if (node.type === 'Literal' && typeof node.value === 'number') {
      add('number', String(node.value), node)
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
  })
  if (includeOccurrences) {
    for (const records of values.values()) {
      records.sort((left, right) => left.start - right.start)
    }
  }
  return values
}

async function loadTypeScript() {
  const filename = path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
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

function sourceStatementName(ts, sourceFile, statement) {
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

function sourceValues(ts, sourceRoot_, relative) {
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
      index,
      kind: ts.SyntaxKind[statement.kind],
      name: sourceStatementName(ts, sourceFile, statement),
      start,
      end,
      sourceHash: sha256(source.slice(start, end)),
      values: sourceNodeValues(ts, sourceFile, statement),
    }
  })
  return {
    bytes,
    scopes,
    values: sourceNodeValues(ts, sourceFile, sourceFile),
  }
}

function targetTransformAudit(source) {
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
    if (
      node.type === 'VariableDeclarator' &&
      node.id?.type === 'Identifier' &&
      node.init?.type === 'CallExpression' &&
      node.init.callee?.type === 'MemberExpression' &&
      node.init.callee.computed === false &&
      node.init.callee.property?.name === 'c' &&
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
    residue.kind === 'property' &&
    residue.value === 'resolve' &&
    isPromiseResolveMember(parent)
  ) {
    return 'dynamic-import-promise-resolve'
  }
  if (
    residue.kind === 'property' &&
    residue.value === 'then' &&
    parent?.type === 'MemberExpression' &&
    parent.object?.type === 'CallExpression' &&
    isPromiseResolveMember(parent.object.callee)
  ) {
    return 'dynamic-import-promise-then'
  }
  if (
    residue.kind === 'property' &&
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
    residue.kind === 'property' &&
    residue.value === 'Fragment' &&
    parent?.type === 'MemberExpression'
  ) {
    return 'jsx-fragment-lowering'
  }
  if (
    residue.kind === 'property' &&
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
    residue.kind === 'number' &&
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
    residue.kind === 'string' &&
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
    residue.kind === 'string' &&
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
    residue.kind === 'property' &&
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

function rounded(value) {
  return Number(value.toFixed(12))
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

function canonicalReportResidues(rows) {
  return rows.map(row => [
    row.structural.index,
    row.literalKind,
    row.value,
    row.target.start,
    row.target.end,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
  ])
}

function representationCounts(residues) {
  const counts = new Map()
  for (const residue of residues) {
    counts.set(
      residue.representation,
      (counts.get(residue.representation) ?? 0) + 1,
    )
  }
  return Object.fromEntries(
    [...counts].sort(([left], [right]) => left.localeCompare(right)),
  )
}

test(
  'Target119 non-daemon static-owner fixture authenticates every unit and residue',
  { skip: !selected, timeout: 120_000 },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(builderPath)), BUILDER_SHA256)
    assert.equal(fixture.case, caseName)
    assert.equal(
      fixture.criterion,
      'target119-nondaemon-unique-owner-declaration-static-transform-v2',
    )
    assert.deepEqual(fixture.artifactPhasePolicy, {
      pairing: 'exact-report-and-coverage-descriptor-pair',
      rejectHybridPairs: true,
      rejectUnknownPairs: true,
      acceptedPairs: [
        {
          phase: 'post-u21759',
          typedAudit: {
            path: '.recovery-tmp/residue-audits/2.1.118-to-2.1.119.typed-audit.json',
            bytes: 24_991_569,
            sha256:
              'c4ab243f3937141db7984b0d4d9cdde7900805369a74a8b9b7589b13fbd1e78d',
          },
          sourceCoverage: {
            path: 'recovery/cases/2.1.118-to-2.1.119/semantic/source-coverage.json.gz',
            bytes: 382_108,
            sha256:
              '09d6075beeb3174217b97555ddbf67593b72fb5ba9c67e1e143154bd955af810',
          },
          sourceCoverageRaw: {
            bytes: 3_290_710,
            sha256:
              '858d4a5dcfb37ce36a43078351ed68dd76c1e565e883617ff451974c2fde1071',
          },
        },
        {
          phase: 'post-u21878',
          typedAudit: {
            path: '.recovery-tmp/residue-audits/2.1.118-to-2.1.119.typed-audit.json',
            bytes: 24_991_569,
            sha256:
              'c4ab243f3937141db7984b0d4d9cdde7900805369a74a8b9b7589b13fbd1e78d',
          },
          sourceCoverage: {
            path: 'recovery/cases/2.1.118-to-2.1.119/semantic/source-coverage.json.gz',
            bytes: 383_456,
            sha256:
              '874421d61f40166898113e0967be904859cda7c00493ee57303b97164bbb0015',
          },
          sourceCoverageRaw: {
            bytes: 3_297_173,
            sha256:
              '0facb150b84243148609b0e5562484d5d9e5c29f895d03c3a3566484b347b08e',
          },
        },
      ],
    })
    assert.deepEqual(fixture.summary, {
      units: 24,
      residues: 527,
      sourceFiles: 23,
      representationKinds: {
        'build-metadata-object-expansion': 240,
        'class-constructor-lowering': 4,
        'dynamic-import-promise-resolve': 44,
        'dynamic-import-promise-then': 44,
        'jsx-create-element-lowering': 10,
        'source-declaration-ast': 185,
      },
      correctedScannerUnits: 18,
      correctedScannerResidues: 385,
      targetIndicesSha256:
        '6ea9e203e133016bd69f888f6677abda53b94e02268d38cca553997e7937ac81',
      residueIdentitiesSha256:
        '80835220e05e3775cd0e126a384e77383f52f37e06c9a98dec0ae032a766cbaf',
      correctedScannerResidueIdentitiesSha256:
        '9722d6a75f5c550090939b947f4f43f4326982c69a72b49f32ac1b78908e9aa5',
    })
    assert.deepEqual(fixture.selection, {
      sourceUniverseFiles: 2023,
      provisionalOwnerCandidates: 105,
      provisionalOwnerCandidateIndicesSha256:
        '663a9a80eabbaca873c40586f14b232875cf300b4becee6f4a902b5533b5bb86',
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
    })
    assert.equal(new Set(fixture.rows.map(row => row.targetIndex)).size, 24)
    assert.equal(
      sha256(
        Buffer.from(
          JSON.stringify(fixture.rows.map(row => row.targetIndex)),
        ),
      ),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      sha256(
        Buffer.from(JSON.stringify(canonicalFixtureResidues(fixture.rows))),
      ),
      fixture.summary.residueIdentitiesSha256,
    )

    const baseline = readExact(
      artifactPath('CLAUDE_CODE_2_1_118_BUNDLE', fixture.inputs.baselineBundle),
      fixture.inputs.baselineBundle,
      'baseline bundle',
    ).toString('utf8')
    const target = readExact(
      artifactPath('CLAUDE_CODE_2_1_119_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'target bundle',
    ).toString('utf8')
    const baselineOccurrences = acornValues(baseline, true)
    const targetOccurrences = acornValues(target, true)
    for (const row of fixture.rows) {
      const unit = target.slice(row.target.start, row.target.end)
      assert.equal(Buffer.byteLength(unit), row.target.bytes)
      assert.equal(sha256(unit), row.target.sourceHash)
      const targetUnitValues = acornValues(unit)
      assert.equal(targetUnitValues.size, row.binding.targetIdentities)
      assert.equal(
        sha256(
          Buffer.from(JSON.stringify([...targetUnitValues.keys()].sort())),
        ),
        row.binding.targetIdentitiesSha256,
      )
      for (const residue of row.residues) {
        const key = identity(residue.kind, residue.value)
        assert.ok(targetUnitValues.has(key), `u${row.targetIndex}: ${key}`)
        assert.equal(
          (baselineOccurrences.get(key) ?? []).length,
          residue.baselineCount,
          `u${row.targetIndex}: ${key} baseline count`,
        )
        const occurrence =
          (targetOccurrences.get(key) ?? [])[residue.targetOrdinal - 1]
        assert.ok(occurrence, `u${row.targetIndex}: ${key} target ordinal`)
        assert.deepEqual(
          [occurrence.start, occurrence.end],
          [residue.start, residue.end],
          `u${row.targetIndex}: ${key} target range`,
        )
      }
    }
  },
)

test(
  'Target119 non-daemon owners, declarations, and compiler roles are fail closed',
  { skip: !selected, timeout: 120_000 },
  async () => {
    const ts = await loadTypeScript()
    const historicalAudits = new Map()
    const inverted = new Map()
    for (const relative of sourceFiles(historicalSourceRoot)) {
      const audit = sourceValues(ts, historicalSourceRoot, relative)
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
      'target bundle',
    ).toString('utf8')
    const packagedAudits = new Map()
    for (const row of fixture.rows) {
      const relative = row.sourceOwner.slice(4)
      const raw = historicalAudits.get(relative)
      assert.ok(raw, `u${row.targetIndex}: historical owner`)
      assert.deepEqual(descriptor(raw.bytes), {
        bytes: row.source.bytes,
        sha256: row.source.sha256,
      })
      let packaged = packagedAudits.get(relative)
      if (!packaged) {
        packaged = sourceValues(ts, sourceRoot, relative)
        packagedAudits.set(relative, packaged)
      }
      const unitAudit = targetTransformAudit(
        target.slice(row.target.start, row.target.end),
      )
      const unitValues = unitAudit.values
      const scores = new Map()
      for (const key of unitValues.keys()) {
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
      assert.ok(
        row.binding.margin > fixture.selection.minimumWeightedMarginExclusive,
      )

      const rankedScopes = raw.scopes
        .map(scope => ({
          ...scope,
          targetMatches: [...unitValues.keys()].filter(key =>
            scope.values.has(key),
          ).length,
        }))
        .sort(
          (left, right) =>
            right.targetMatches - left.targetMatches ||
            left.index - right.index,
        )
      const declaration = rankedScopes[0]
      const declarationRunner = rankedScopes[1]
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
        `u${row.targetIndex}: exact unique historical declaration`,
      )
      assert.ok(
        declaration.targetMatches >
          (declarationRunner?.targetMatches ?? 0),
        `u${row.targetIndex}: declaration winner is unique`,
      )
      const packagedDeclarations = packaged.scopes.filter(
        scope =>
          scope.kind === row.declaration.kind &&
          scope.name === row.declaration.name,
      )
      assert.equal(
        packagedDeclarations.length,
        1,
        `u${row.targetIndex}: one packaged declaration`,
      )
      const packagedDeclaration = packagedDeclarations[0]
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
            `u${row.targetIndex}: historical declaration AST ${key}`,
          )
          assert.deepEqual(
            [...(packagedDeclaration.values.get(key) ?? [])].sort(),
            residue.sourceKinds,
            `u${row.targetIndex}: packaged declaration AST ${key}`,
          )
        } else {
          assert.deepEqual(
            residue.sourceKinds,
            [],
            `u${row.targetIndex}: transformed value is absent from declaration`,
          )
          assert.equal(
            targetRepresentation(unitAudit, residue, occurrence),
            residue.representation,
            `u${row.targetIndex}: exact compiler/build role ${key}`,
          )
        }
        assert.deepEqual(
          [...(unitAudit.values.get(key) ?? [])].sort(),
          residue.targetKinds,
          `u${row.targetIndex}: target node kinds ${key}`,
        )
      }
    }
  },
)

test(
  'Target119 non-daemon coverage and focused u21860/u21891 partitions are exact',
  { skip: !selected },
  () => {
    const accepted = fixture.artifactPhasePolicy.acceptedPairs[0]
    const typedAuditPath = path.resolve(
      process.env.CLAUDE_CODE_TYPED_AUDIT_PATH ??
        path.join(root, accepted.typedAudit.path),
    )
    const sourceCoveragePath = path.resolve(
      process.env.CLAUDE_CODE_SOURCE_COVERAGE_PATH ??
        path.join(root, accepted.sourceCoverage.path),
    )
    const typedAuditBytes = fs.readFileSync(typedAuditPath)
    const sourceCoverageBytes = fs.readFileSync(sourceCoveragePath)
    const sourceCoverageRaw = gunzipSync(sourceCoverageBytes)
    const typedAuditDescriptor = descriptor(typedAuditBytes)
    const sourceCoverageDescriptor = descriptor(sourceCoverageBytes)
    const sourceCoverageRawDescriptor = descriptor(sourceCoverageRaw)
    const artifactPhase = selectArtifactPhase(
      typedAuditDescriptor,
      sourceCoverageDescriptor,
      sourceCoverageRawDescriptor,
    )
    assert.ok(['post-u21759', 'post-u21878'].includes(artifactPhase))
    for (const pair of fixture.artifactPhasePolicy.acceptedPairs) {
      assert.equal(
        selectArtifactPhase(
          pair.typedAudit,
          pair.sourceCoverage,
          pair.sourceCoverageRaw,
        ),
        pair.phase,
      )
    }
    assert.throws(
      () =>
        selectArtifactPhase(
          { ...typedAuditDescriptor, bytes: typedAuditDescriptor.bytes + 1 },
          sourceCoverageDescriptor,
          sourceCoverageRawDescriptor,
        ),
      /unknown or hybrid/,
    )
    assert.throws(
      () =>
        selectArtifactPhase(
          fixture.artifactPhasePolicy.acceptedPairs[0].typedAudit,
          fixture.artifactPhasePolicy.acceptedPairs[1].sourceCoverage,
          fixture.artifactPhasePolicy.acceptedPairs[0].sourceCoverageRaw,
        ),
      /unknown or hybrid/,
    )
    assert.throws(
      () =>
        selectArtifactPhase(
          typedAuditDescriptor,
          sourceCoverageDescriptor,
          { ...sourceCoverageRawDescriptor, bytes: 0 },
        ),
      /unknown or hybrid/,
    )

    const report = JSON.parse(typedAuditBytes)
    const coverage = JSON.parse(sourceCoverageRaw)
    const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
    const rows = new Map(coverage.rows.map(row => [row.targetIndex, row]))
    const states = new Set()
    for (const proof of fixture.rows) {
      const row = rows.get(proof.targetIndex)
      assert.ok(row, `u${proof.targetIndex}: coverage row`)
      assert.deepEqual(
        {
          targetIndex: row.targetIndex,
          start: row.start,
          end: row.end,
          nodeType: row.nodeType,
          sourceHash: row.sourceHash,
          structuralClass: row.structuralClass,
          disposition: row.disposition,
        },
        {
          targetIndex: proof.targetIndex,
          start: proof.target.start,
          end: proof.target.end,
          nodeType: proof.target.nodeType,
          sourceHash: proof.target.sourceHash,
          structuralClass: proof.target.classification,
          disposition: 'source-runtime-covered',
        },
        `u${proof.targetIndex}: exact coverage projection`,
      )
      const ownerPaths = row.ownerIds.map(ownerId => {
        const owner = owners.get(ownerId)
        assert.ok(owner, `u${proof.targetIndex}: owner ${ownerId}`)
        return owner
      })
      const provisional =
        JSON.stringify(ownerPaths) === JSON.stringify(proof.priorOwnerPaths) &&
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
    assert.equal(states.size, 1, '24-unit owner correction is atomic')
    assert.deepEqual(
      [...states],
      ['corrected'],
      'post-u21759 has the exact corrected 24-unit coverage group',
    )

    const inherited = fixture.focusedInheritedStrictAudit
    assert.equal(inherited.disposition, 'inherited-existing-static-owner-proof')
    assert.equal(inherited.replayAuthorized, false)
    assert.equal(inherited.newHelperRequired, false)
    assert.equal(inherited.newOwnerOverrideRows, 0)
    assert.equal(inherited.coverageCorrectionRequired, false)
    assert.deepEqual(inherited.tupleSchema, [
      'value',
      'literalKind',
      'targetAdded',
      'baselineOccurrenceCount',
      'targetOccurrenceNumber',
      'target.start',
      'target.end',
      'structural.index',
      'structural.classification',
      'structural.sourceHash',
      'disposition',
      'ownerPaths',
    ])

    for (const expected of inherited.units) {
      const proof = fixture.rows.find(
        row => row.targetIndex === expected.targetIndex,
      )
      assert.ok(proof, `u${expected.targetIndex}: inherited fixture row`)
      assert.equal(proof.sourceOwner, expected.sourceOwner)
      assert.equal(
        fixture.ownerOverrides.filter(
          row => row.targetIndex === expected.targetIndex,
        ).length,
        1,
        `u${expected.targetIndex}: exactly one existing override`,
      )
      const ownerRows = report.sourceRuntimeOwnerResidueRows.filter(
        row => row.structural.index === expected.targetIndex,
      )
      const addedRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
        row => row.structural.index === expected.targetIndex,
      )
      const strictRows = report.rows.filter(
        row => row.structural.index === expected.targetIndex,
      )
      const retainedRows = ownerRows.filter(row => row.targetAdded === false)
      assert.deepEqual(
        {
          owner: ownerRows.length,
          added: addedRows.length,
          strict: strictRows.length,
          retainedOwner: retainedRows.length,
        },
        expected.partitionCounts,
      )
      assert.deepEqual(partitionDescriptor(ownerRows), expected.ownerDescriptor)
      assert.deepEqual(
        partitionDescriptor(ownerRows.map(rowTuple)),
        expected.ownerTupleDescriptor,
      )
      assert.deepEqual(partitionDescriptor(addedRows), expected.addedDescriptor)
      assert.deepEqual(
        partitionDescriptor(addedRows.map(rowTuple)),
        expected.addedTupleDescriptor,
      )
      assert.deepEqual(partitionDescriptor(strictRows), expected.strictDescriptor)
      assert.deepEqual(
        partitionDescriptor(strictRows.map(rowTuple)),
        expected.strictTupleDescriptor,
      )
      assert.deepEqual(
        partitionDescriptor(retainedRows),
        expected.retainedDescriptor,
      )
      assert.deepEqual(
        partitionDescriptor(retainedRows.map(rowTuple)),
        expected.retainedTupleDescriptor,
      )
      assert.ok(
        retainedRows.every(row => row.targetAdded === false),
        `u${expected.targetIndex}: retained owner rows are not additions`,
      )
      assert.ok(
        proof.residues.every(residue => residue.scannerRetainedAfterCorrection),
        `u${expected.targetIndex}: all inherited added residues remain retained`,
      )
      assert.deepEqual(
        representationCounts(proof.residues),
        expected.representationCounts,
      )
      const fixtureAdded = canonicalFixtureResidues([proof])
      assert.deepEqual(
        partitionDescriptor(fixtureAdded),
        expected.fixtureAddedCanonicalDescriptor,
      )
      assert.deepEqual(canonicalReportResidues(addedRows), fixtureAdded)
      const addedTupleSet = new Set(
        addedRows.map(row => JSON.stringify(rowTuple(row))),
      )
      assert.ok(
        strictRows.every(row => addedTupleSet.has(JSON.stringify(rowTuple(row)))),
        `u${expected.targetIndex}: strict rows are a subset of added rows`,
      )

      const coverageTarget = coverage.rows.filter(
        row => row.targetIndex === expected.targetIndex,
      )
      assert.deepEqual(coverageTarget, expected.coverageTarget)
      assert.deepEqual(
        partitionDescriptor(coverageTarget),
        expected.coverageDescriptor,
      )
      const ownerIds = new Set(coverageTarget.flatMap(row => row.ownerIds))
      const ownerCatalog = coverage.owners.filter(owner => ownerIds.has(owner.id))
      assert.deepEqual(ownerCatalog, expected.ownerCatalog)
      assert.deepEqual(
        partitionDescriptor(ownerCatalog),
        expected.ownerCatalogDescriptor,
      )
    }

    const indices = new Set(fixture.rows.map(row => row.targetIndex))
    const live = canonicalReportResidues(
      report.sourceRuntimeAddedOwnerResidueRows.filter(row =>
        indices.has(row.structural.index),
      ),
    )
    assert.deepEqual(
      partitionDescriptor(live),
      inherited.aggregateCurrentScannerCanonicalDescriptor,
    )
    const originalPost = canonicalFixtureResidues(
      fixture.rows,
      residue => residue.scannerRetainedAfterCorrection,
    )
    const originalPostSet = new Set(
      originalPost.map(tuple => JSON.stringify(tuple)),
    )
    assert.ok(
      originalPost.every(tuple =>
        live.some(liveTuple => JSON.stringify(liveTuple) === JSON.stringify(tuple)),
      ),
      'all original corrected scanner rows remain present',
    )
    assert.deepEqual(
      live.filter(tuple => !originalPostSet.has(JSON.stringify(tuple))),
      inherited.independentLaterRetainedRows,
      'only the two independently corrected later rows extend the original group',
    )
  },
)
