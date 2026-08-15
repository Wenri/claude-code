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
const selected =
  !process.env.CLAUDE_CODE_SEMANTIC_CASE ||
  process.env.CLAUDE_CODE_SEMANTIC_CASE === caseName
const recoveredSourceRoot = path.join(repositoryRoot, 'src')
const comparisonSourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? recoveredSourceRoot,
)
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.113-recovered-source-gaps-batch2.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const structuralPath = path.join(
  repositoryRoot,
  'recovery/cases',
  caseName,
  'structural/generated-delta.json.gz',
)
const structuralBytes = fs.readFileSync(structuralPath)
const structural = JSON.parse(gunzipSync(structuralBytes))

const FIXTURE_SHA256 =
  'e3b5635702e881d8ca413ca3ce0064de99df8a1125e46baa9a4fc7851921f776'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function authenticatedTargetInner(filename) {
  const bytes = fs.readFileSync(filename)
  const digest = sha256(bytes)
  if (digest === fixture.artifact.targetInnerSha256) return bytes.toString('utf8')
  assert.equal(digest, fixture.artifact.targetWrapperSha256)
  const inner = bytes.subarray(
    fixture.artifact.targetWrapperPrefixLength,
    bytes.length - fixture.artifact.targetWrapperSuffixLength,
  )
  assert.equal(sha256(inner), fixture.artifact.targetInnerSha256)
  return inner.toString('utf8')
}

async function loadTypeScript() {
  const candidates = [
    path.resolve(
      path.dirname(process.execPath),
      '../lib/node_modules/typescript/lib/typescript.js',
    ),
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate, 'the pinned TypeScript compiler must be available')
  const module = await import(pathToFileURL(candidate).href)
  return module.default ?? module
}

function sourceFilename(root, owner) {
  const relative = owner.replace(/^src\//, '')
  const direct = path.join(root, relative)
  const nested = path.join(root, owner)
  if (fs.existsSync(direct)) return direct
  if (fs.existsSync(nested)) return nested
  return null
}

function sourceFile(ts, root, owner) {
  const filename = sourceFilename(root, owner)
  if (!filename) return null
  const source = fs.readFileSync(filename, 'utf8')
  const parsed = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(parsed.parseDiagnostics.length, 0, `${owner}: parses`)
  return parsed
}

function findDeclaration(ts, parsed, name) {
  let found
  function visit(node) {
    if (found) return
    if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
      node.name?.text === name
    ) {
      found = node
      return
    }
    if (
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(
        declaration =>
          ts.isIdentifier(declaration.name) && declaration.name.text === name,
      )
    ) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }
  if (parsed) visit(parsed)
  return found
}

function declarationKind(ts, declaration) {
  if (ts.isFunctionDeclaration(declaration)) return 'FunctionDeclaration'
  if (ts.isClassDeclaration(declaration)) return 'ClassDeclaration'
  if (ts.isVariableStatement(declaration)) return 'VariableDeclaration'
  return null
}

function sourceImports(ts, parsed) {
  const imports = []
  if (!parsed) return imports
  for (const statement of parsed.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue
    const module = statement.moduleSpecifier.text
    const clause = statement.importClause
    if (clause.name) {
      imports.push({
        imported: 'default',
        local: clause.name.text,
        module,
        typeOnly: clause.isTypeOnly,
      })
    }
    const named = clause.namedBindings
    if (named && ts.isNamespaceImport(named)) {
      imports.push({
        imported: '*',
        local: named.name.text,
        module,
        typeOnly: clause.isTypeOnly,
      })
    } else if (named && ts.isNamedImports(named)) {
      for (const element of named.elements) {
        imports.push({
          imported: element.propertyName?.text ?? element.name.text,
          local: element.name.text,
          module,
          typeOnly: clause.isTypeOnly || element.isTypeOnly,
        })
      }
    }
  }
  return imports
}

function sourceResidues(ts, parsed, declaration) {
  const start = declaration.getStart(parsed)
  const rows = []
  function push(kind, value, node) {
    rows.push({
      kind,
      value,
      relativeStart: node.getStart(parsed) - start,
      relativeEnd: node.end - start,
    })
  }
  function visit(node) {
    if (ts.isStringLiteralLike(node)) push('string', node.text, node)
    if (
      (ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node) ||
        ts.isMethodDeclaration(node)) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name))
    ) {
      push('property', node.name.text, node.name)
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  return rows
}

function targetResidues(fragment, offset) {
  const ast = parse(fragment, { ecmaVersion: 'latest', sourceType: 'module' })
  const rows = []
  function visit(node) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (node.type === 'Literal' && typeof node.value === 'string') {
      rows.push({
        kind: 'string',
        value: node.value,
        start: offset + node.start,
        end: offset + node.end,
      })
    }
    const property =
      node.type === 'MemberExpression' &&
      !node.computed &&
      node.property?.type === 'Identifier'
        ? node.property
        : ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(
              node.type,
            ) &&
            !node.computed &&
            node.key?.type === 'Identifier'
          ? node.key
          : null
    if (property) {
      rows.push({
        kind: 'property',
        value: property.name,
        start: offset + property.start,
        end: offset + property.end,
      })
    }
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) visit(child)
    }
  }
  visit(ast)
  return { ast, rows }
}

function expectedOccurrence(residue, source = residue.source) {
  return {
    kind: residue.kind,
    value: residue.value,
    relativeStart: source.relativeStart,
    relativeEnd: source.relativeEnd,
  }
}

test('batch2 is an exact, per-residue, fail-closed classification fixture', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, caseName)
  assert.equal(sha256(structuralBytes), fixture.artifact.structuralGzipSha256)
  assert.deepEqual(fixture.summary, {
    units: 2,
    residues: 3,
    exactAlternateOwnerResidues: 1,
    recoveredSourceGapResidues: 2,
  })
  assert.deepEqual(
    fixture.rows.map(row => row.targetIndex),
    [9828, 9919],
  )
  const classifications = fixture.rows.flatMap(row =>
    row.declarations.flatMap(declaration =>
      declaration.residues.map(residue => residue.classification),
    ),
  )
  assert.deepEqual(classifications, [
    'exact-alternate-owner',
    'recovered-source-gap',
    'recovered-source-gap',
  ])
  for (const row of fixture.rows) {
    const region = structural.regions[row.targetIndex]
    assert.equal(region?.target?.index, row.targetIndex)
    assert.deepEqual(
      {
        classification: region.classification,
        end: region.target.end,
        nodeType: region.target.nodeType,
        sourceHash: region.target.sourceHash,
        start: region.target.start,
      },
      row.target,
      `${row.targetIndex}: target identity`,
    )
    assert.ok(row.priorOwnerIds.length > 0)
  }
})

test(
  'current source pins every exact owner declaration, import, and residue occurrence',
  { skip: !selected ? `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}` : false },
  async () => {
    const ts = await loadTypeScript()
    for (const row of fixture.rows) {
      const parsed = sourceFile(ts, recoveredSourceRoot, row.recoveredOwner)
      assert.ok(parsed, `${row.targetIndex}: recovered owner exists`)
      const imports = sourceImports(ts, parsed)
      for (const expected of row.sourceImports) {
        assert.ok(
          imports.some(
            actual =>
              !actual.typeOnly &&
              actual.module === expected.module &&
              actual.imported === expected.imported &&
              actual.local === expected.local,
          ),
          `${row.targetIndex}: ${expected.module}:${expected.imported}:${expected.local}`,
        )
      }
      for (const expected of row.declarations) {
        const declaration = findDeclaration(ts, parsed, expected.name)
        assert.ok(declaration, `${row.targetIndex}: ${expected.name}`)
        assert.equal(declarationKind(ts, declaration), expected.kind)
        assert.equal(
          sha256(declaration.getText(parsed)),
          expected.sha256,
          `${row.targetIndex}: exact ${expected.name}`,
        )
        const actualResidues = sourceResidues(ts, parsed, declaration)
        for (const residue of expected.residues) {
          assert.ok(
            actualResidues.some(actual =>
              Object.entries(expectedOccurrence(residue)).every(
                ([key, value]) => actual[key] === value,
              ),
            ),
            `${row.targetIndex}: source ${residue.kind}:${residue.value}`,
          )
        }
      }
    }
  },
)

test(
  'comparison root is either selectively recovered or exactly exhibits the historical gap',
  { skip: !selected ? `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}` : false },
  async () => {
    const ts = await loadTypeScript()
    for (const row of fixture.rows) {
      const parsed = sourceFile(ts, comparisonSourceRoot, row.recoveredOwner)
      assert.ok(parsed, `${row.targetIndex}: comparison owner exists`)
      for (const expected of row.declarations) {
        const declaration = findDeclaration(ts, parsed, expected.name)
        const actualHash = declaration
          ? sha256(declaration.getText(parsed))
          : undefined
        if (actualHash === expected.sha256) continue
        if (expected.historical.state === 'declaration-absent') {
          assert.equal(declaration, undefined, `${row.targetIndex}: historical absence`)
          continue
        }
        assert.ok(declaration, `${row.targetIndex}: historical declaration`)
        assert.equal(
          actualHash,
          expected.historical.declarationSha256,
          `${row.targetIndex}: exact historical declaration`,
        )
        const actualResidues = sourceResidues(ts, parsed, declaration)
        assert.deepEqual(
          actualResidues.filter(actual =>
            expected.residues.some(
              residue =>
                actual.kind === residue.kind && actual.value === residue.value,
            ),
          ),
          expected.historical.sourceOccurrences,
          `${row.targetIndex}: exact historical residue state`,
        )
      }
    }
  },
)

test(
  'authenticated target113 pins all three exact target residue occurrences',
  {
    skip: !selected
      ? `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}`
      : !targetPath
        ? 'authenticated 2.1.113 bundle is required'
        : false,
  },
  () => {
    const target = authenticatedTargetInner(targetPath)
    for (const row of fixture.rows) {
      const fragment = target.slice(row.target.start, row.target.end)
      assert.equal(sha256(fragment), row.target.sourceHash)
      const { ast, rows } = targetResidues(fragment, row.target.start)
      assert.equal(ast.body.length, 1)
      assert.equal(ast.body[0].type, row.target.nodeType)
      for (const residue of row.declarations.flatMap(item => item.residues)) {
        assert.ok(
          rows.some(
            actual =>
              actual.kind === residue.kind &&
              actual.value === residue.value &&
              actual.start === residue.target.start &&
              actual.end === residue.target.end,
          ),
          `${row.targetIndex}: target ${residue.kind}:${residue.value}`,
        )
      }
    }
  },
)
