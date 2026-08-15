import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.112-to-2.1.113'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? path.join(repositoryRoot, 'src'),
)
const historicalPackageSelected = Boolean(
  process.env.CLAUDE_CODE_SEMANTIC_TARGET_COMMIT,
)
const baselinePath = process.env.CLAUDE_CODE_2_1_112_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.113-safe-static-tail-proofs.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

const FIXTURE_SHA256 = '33879ee42a52ff29e503a4b42409c82b4fd88e12bc5e8db7750a874d12da679f'
const TARGET_INDICES = [
  14733, 18205, 15026, 15960, 18296, 19391, 19513, 19858, 20360,
]
const TARGET_RESIDUE_COUNTS = [1, 1, 4, 2, 3, 4, 3, 1, 2]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function identity(kind, value) {
  if (kind === 'regexp') {
    return `regexp:${JSON.stringify(value.pattern)}/${[...value.flags].sort().join('')}`
  }
  return `${kind}:${kind === 'string' || kind === 'property' ? JSON.stringify(value) : String(value)}`
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

function collectOccurrences(source) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const occurrences = []
  walk(ast, node => {
    if (node.type === 'Literal') {
      let literalIdentity
      if (node.regex) literalIdentity = identity('regexp', node.regex)
      else if (typeof node.value === 'string') literalIdentity = identity('string', node.value)
      else if (typeof node.value === 'number') literalIdentity = identity('number', node.value)
      else if (node.bigint !== undefined) literalIdentity = identity('bigint', node.bigint)
      if (literalIdentity) occurrences.push({ end: node.end, identity: literalIdentity, start: node.start })
    } else if (node.type === 'TemplateElement') {
      const value = node.value?.cooked ?? node.value?.raw
      if (typeof value === 'string') {
        occurrences.push({ end: node.end, identity: identity('string', value), start: node.start })
      }
    }
    const isProperty =
      (['Property', 'MethodDefinition', 'PropertyDefinition'].includes(node.type) &&
        node.computed === false &&
        node.key?.type === 'Identifier') ||
      (node.type === 'MemberExpression' &&
        node.computed === false &&
        node.property?.type === 'Identifier')
    if (isProperty) {
      const property = node.key ?? node.property
      occurrences.push({
        end: property.end,
        identity: identity('property', property.name),
        start: property.start,
      })
    }
  })
  occurrences.sort((left, right) => left.start - right.start)
  const grouped = new Map()
  for (const occurrence of occurrences) {
    const values = grouped.get(occurrence.identity) ?? []
    values.push(occurrence)
    grouped.set(occurrence.identity, values)
  }
  return grouped
}

function authenticatedTargetInner(filename) {
  const bytes = fs.readFileSync(filename)
  const digest = sha256(bytes)
  if (digest === '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba') {
    return bytes.toString('utf8')
  }
  assert.equal(
    digest,
    'dda4d89e787fa455706e4f41beffc8e58d42b9094c4d155fcbf62e3f19036681',
  )
  const inner = bytes.subarray(87, bytes.length - 3)
  assert.equal(
    sha256(inner),
    '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba',
  )
  return inner.toString('utf8')
}

async function loadTypeScript() {
  const candidates = [
    path.resolve(path.dirname(process.execPath), '../lib/node_modules/typescript/lib/typescript.js'),
    path.join(repositoryRoot, '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js'),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate, 'the pinned TypeScript compiler must be available')
  const module = await import(pathToFileURL(candidate).href)
  return module.default ?? module
}

function sourceFilename(owner) {
  const relative = owner.replace(/^src\//, '')
  const direct = path.join(sourceRoot, relative)
  const nested = path.join(sourceRoot, owner)
  const filename = fs.existsSync(direct) ? direct : nested
  assert.ok(fs.existsSync(filename), `${owner}: source owner exists`)
  return filename
}

function bindingName(ts, node) {
  return node && ts.isIdentifier(node) ? node.text : undefined
}

function assertStaticProof(ts, sourceFile, proof, label) {
  let matched = false
  let localName
  let declarationReferences = 1
  function visit(node) {
    if (proof.kind === 'named-import' && ts.isImportDeclaration(node)) {
      if (node.moduleSpecifier.text === proof.module) {
        const bindings = node.importClause?.namedBindings
        if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            const imported = bindingName(ts, element.propertyName) ?? bindingName(ts, element.name)
            if (!element.isTypeOnly && imported === proof.name) {
              matched = true
              localName = element.name.text
            }
          }
        }
      }
    } else if (
      proof.kind === 'default-import' &&
      ts.isImportDeclaration(node) &&
      node.moduleSpecifier.text === proof.module &&
      node.importClause?.name?.text === proof.name
    ) {
      matched = true
      localName = proof.name
    } else if (
      proof.kind === 'module-import' &&
      ts.isImportDeclaration(node) &&
      node.moduleSpecifier.text === proof.module
    ) {
      const clause = node.importClause
      const named = clause?.namedBindings
      const first =
        clause?.name?.text ??
        (named && ts.isNamespaceImport(named)
          ? named.name.text
          : named && ts.isNamedImports(named)
            ? named.elements.find(element => !element.isTypeOnly)?.name.text
            : undefined)
      if (first) {
        matched = true
        localName = first
      }
    } else if (proof.kind === 'binding-element' && ts.isBindingElement(node)) {
      const bound = bindingName(ts, node.propertyName) ?? bindingName(ts, node.name)
      if (bound === proof.name) {
        matched = true
        localName = bindingName(ts, node.name)
      }
    } else if (
      proof.kind === 'build-macro-version' &&
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'MACRO' &&
      node.name.text === 'VERSION'
    ) {
      matched = true
      localName = 'MACRO'
      declarationReferences = 0
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(matched, true, `${label}: exact ${proof.kind} proof`)
  assert.ok(localName, `${label}: local binding name`)
  let references = 0
  function count(node) {
    if (ts.isIdentifier(node) && node.text === localName) references++
    ts.forEachChild(node, count)
  }
  count(sourceFile)
  assert.ok(
    references - declarationReferences >= proof.minimumReferences,
    `${label}: at least ${proof.minimumReferences} runtime reference(s)`,
  )
}

test('the target113 safe static-tail fixture is exact and fail-closed', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, caseName)
  assert.deepEqual(fixture.derivation.admittedTargetIndices, TARGET_INDICES)
  assert.deepEqual(
    fixture.units.map(unit => unit.index),
    TARGET_INDICES,
  )
  assert.deepEqual(
    fixture.units.map(unit => unit.residues.length),
    TARGET_RESIDUE_COUNTS,
  )
  assert.deepEqual(
    [...new Set(fixture.units.flatMap(unit => unit.residues.map(row => row.start)))].length,
    TARGET_RESIDUE_COUNTS.reduce((sum, count) => sum + count, 0),
  )
  for (const unit of fixture.units) {
    const covered = unit.proofs.flatMap(proof => proof.covers).sort((left, right) => left - right)
    assert.deepEqual(
      covered,
      unit.residues.map((_, index) => index),
      `${unit.index}: every residue is covered exactly once`,
    )
    for (const proof of unit.proofs) {
      assert.ok(
        [
          'binding-element',
          'build-macro-version',
          'default-import',
          'module-import',
          'named-import',
        ].includes(proof.kind),
      )
      assert.ok(proof.minimumReferences >= 1)
      if (proof.kind === 'build-macro-version') {
        assert.equal(
          proof.covers.every(index =>
            ['2.1.113', '2026-04-17T18:18:28Z'].includes(unit.residues[index].value),
          ),
          true,
        )
      } else if (proof.kind === 'module-import') {
        assert.equal(
          proof.covers.every(index => unit.residues[index].value === proof.bundledModule),
          true,
        )
      } else if (proof.kind === 'default-import') {
        assert.equal(
          proof.covers.every(index => unit.residues[index].value === 'default'),
          true,
        )
      } else {
        assert.equal(
          proof.covers.every(index => unit.residues[index].value === proof.name),
          true,
        )
      }
    }
    assert.equal(
      unit.residues.every(
        row => row.start >= unit.structural.start && row.end <= unit.structural.end,
      ),
      true,
    )
  }
})

test(
  'authenticated target113 pins every admitted static-tail unit and residue',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.112 and 2.1.113 bundles are required'
        : false,
    timeout: 90_000,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    assert.equal(
      sha256(baselineBytes),
      'bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f',
    )
    const baseline = collectOccurrences(baselineBytes.toString('utf8'))
    const targetSource = authenticatedTargetInner(targetPath)
    const target = collectOccurrences(targetSource)
    for (const unit of fixture.units) {
      const region = structural.regions[unit.index]
      assert.deepEqual(
        {
          classification: region?.classification,
          end: region?.target?.end,
          nodeType: region?.target?.nodeType,
          sourceHash: region?.target?.sourceHash,
          start: region?.target?.start,
        },
        {
          classification: unit.structural.classification,
          end: unit.structural.end,
          nodeType: unit.structural.nodeType,
          sourceHash: unit.structural.sourceHash,
          start: unit.structural.start,
        },
        `${unit.index}: structural identity`,
      )
      assert.equal(
        sha256(targetSource.slice(unit.structural.start, unit.structural.end)),
        unit.structural.sourceHash,
        `${unit.index}: target fragment hash`,
      )
      for (const residue of unit.residues) {
        const residueIdentity = identity(residue.kind, residue.value)
        assert.equal(
          baseline.get(residueIdentity)?.length ?? 0,
          residue.baselineOccurrenceCount,
          `${unit.index}: authenticated baseline occurrence count`,
        )
        const occurrence = target.get(residueIdentity)?.[residue.targetOccurrenceNumber - 1]
        assert.deepEqual(
          occurrence && [occurrence.start, occurrence.end],
          [residue.start, residue.end],
          `${unit.index}: exact target occurrence`,
        )
        assert.ok(
          residue.targetOccurrenceNumber > residue.baselineOccurrenceCount,
          `${unit.index}: target-added ordinal`,
        )
      }
    }
  },
)

test(
  'the selected source root owns every admitted static representation',
  { skip: !selected ? `not applicable to ${semanticCase}` : false },
  async () => {
    const ts = await loadTypeScript()
    for (const unit of fixture.units) {
      const filename = sourceFilename(unit.owner)
      const bytes = fs.readFileSync(filename)
      // A selected historical audit validates the exact raw-target + semantic
      // supplement tree. Its bounded recovered owners intentionally differ
      // from both pre-recovery and cumulative whole-file hashes, so use the
      // fail-closed AST role oracle below instead of accepting arbitrary text.
      if (!historicalPackageSelected) {
        assert.ok(
          Object.values(unit.sourceHashes).includes(sha256(bytes)),
          `${unit.index}: source root is an authenticated current or materialized target113 owner`,
        )
      }
      const sourceFile = ts.createSourceFile(
        filename,
        bytes.toString('utf8'),
        ts.ScriptTarget.Latest,
        true,
        filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      )
      assert.equal(sourceFile.parseDiagnostics.length, 0, `${unit.index}: owner parses`)
      for (const proof of unit.proofs) {
        assertStaticProof(ts, sourceFile, proof, `${unit.index}: ${unit.owner}`)
      }
    }
  },
)
