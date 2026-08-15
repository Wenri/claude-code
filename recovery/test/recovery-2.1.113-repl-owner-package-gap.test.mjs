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
const recoveredSourceRoot = path.join(repositoryRoot, 'src')
const comparisonSourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? recoveredSourceRoot,
)
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.113-repl-owner-package-gap.json', import.meta.url),
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
  '5c19f3de93ee4d716e9592d9544392771b571cc34da8807599b961fb5828fde3'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function identity(kind, value) {
  return `${kind}:${JSON.stringify(value)}`
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return
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

function targetOccurrences(fragment, absoluteStart) {
  const ast = parse(fragment, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const occurrences = []
  const add = (kind, value, start, end) =>
    occurrences.push({
      end: absoluteStart + end,
      identity: identity(kind, value),
      start: absoluteStart + start,
    })
  walk(ast, node => {
    if (
      node.type === 'Literal' &&
      (typeof node.value === 'string' || typeof node.value === 'number')
    ) {
      add(typeof node.value, node.value, node.start, node.end)
    }
    if (
      node.type === 'MemberExpression' &&
      !node.computed &&
      node.property?.type === 'Identifier'
    ) {
      add('property', node.property.name, node.property.start, node.property.end)
    }
  })
  return { ast, occurrences }
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

function parseSource(ts, root, owner) {
  const filename = path.join(root, owner.replace(/^src\//, ''))
  assert.ok(fs.existsSync(filename), `${owner}: recovered owner exists`)
  const source = fs.readFileSync(filename, 'utf8')
  const parsed = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(parsed.parseDiagnostics.length, 0, `${owner}: parses`)
  return { filename, parsed, source }
}

function findDeclaration(ts, sourceFile, name) {
  let found
  function visit(node) {
    if (found) return
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
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
  visit(sourceFile)
  return found
}

function declarationKind(ts, node) {
  if (ts.isFunctionDeclaration(node)) return 'FunctionDeclaration'
  if (ts.isVariableStatement(node)) return 'VariableDeclaration'
  return null
}

function sourceImports(ts, sourceFile) {
  const imports = []
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue
    const module = statement.moduleSpecifier.text
    const clause = statement.importClause
    const named = clause.namedBindings
    if (named && ts.isNamedImports(named)) {
      for (const element of named.elements) {
        imports.push({
          imported: element.propertyName?.text ?? element.name.text,
          local: element.name.text,
          module,
          statement,
        })
      }
    }
  }
  return imports
}

test('the target113 REPL owner package-gap fixture is exact and fail-closed', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, caseName)
  assert.equal(sha256(structuralBytes), fixture.artifact.structuralGzipSha256)
  assert.deepEqual(fixture.summary, {
    units: 4,
    residues: 6,
    historicalPackageGapUnits: 4,
    importLoweredResidues: 3,
    authoredResidues: 3,
  })
  let residues = 0
  const seen = new Set()
  for (const row of fixture.rows) {
    assert.ok(!seen.has(row.targetIndex), `${row.targetIndex}: unique target unit`)
    seen.add(row.targetIndex)
    residues += row.residues.length
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
      `${row.targetIndex}: structural identity`,
    )
  }
  assert.equal(seen.size, fixture.summary.units)
  assert.equal(residues, fixture.summary.residues)
})

test(
  'the observed main source pins the exact REPL owner declarations, constants, and imports',
  { skip: !selected ? `not applicable to ${semanticCase}` : false },
  async () => {
    const ts = await loadTypeScript()
    const { parsed, source } = parseSource(
      ts,
      recoveredSourceRoot,
      fixture.owner.path,
    )
    assert.equal(sha256(source), fixture.owner.observedMainSha256)
    const imports = sourceImports(ts, parsed)
    for (const row of fixture.rows) {
      if (row.source.declaration) {
        const declaration = findDeclaration(ts, parsed, row.source.declaration)
        assert.ok(declaration, `${row.targetIndex}: named owner declaration`)
        assert.equal(
          declarationKind(ts, declaration),
          row.source.declarationKind,
        )
        assert.equal(
          sha256(declaration.getText(parsed)),
          row.source.declarationSha256,
          `${row.targetIndex}: declaration hash`,
        )
        const declarationText = declaration.getText(parsed)
        for (const required of row.source.requiredStrings ?? []) {
          assert.ok(
            declarationText.includes(required),
            `${row.targetIndex}: declaration anchor ${required}`,
          )
        }
      }
      for (const expected of row.source.imports) {
        const actual = imports.find(
          item =>
            item.module === expected.module &&
            item.imported === expected.imported &&
            item.local === expected.local,
        )
        assert.ok(actual, `${row.targetIndex}: exact runtime import`)
        if (expected.statementSha256) {
          assert.equal(
            sha256(actual.statement.getText(parsed)),
            expected.statementSha256,
            `${row.targetIndex}: import statement hash`,
          )
        }
      }
      for (const expected of row.source.supportingDeclarations ?? []) {
        const declaration = findDeclaration(ts, parsed, expected.name)
        assert.ok(declaration, `${row.targetIndex}: ${expected.name}`)
        assert.equal(declarationKind(ts, declaration), expected.kind)
        assert.equal(sha256(declaration.getText(parsed)), expected.sha256)
      }
    }
  },
)

test(
  'the materialized source root proves the bounded REPL owner package omission',
  {
    skip:
      !selected || comparisonSourceRoot === recoveredSourceRoot
        ? 'a distinct materialized source root is required'
        : false,
  },
  () => {
    const historicalOwner = path.join(
      comparisonSourceRoot,
      fixture.owner.path.replace(/^src\//, ''),
    )
    assert.equal(fs.existsSync(historicalOwner), false)
    for (const sibling of ['constants.ts', 'primitiveTools.ts']) {
      assert.ok(
        fs.existsSync(path.join(path.dirname(historicalOwner), sibling)),
        `historical package retained ${sibling}`,
      )
    }
  },
)

test(
  'every REPL package-gap row is an authenticated complete target fragment',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetPath
        ? 'authenticated 2.1.113 bundle is required'
        : false,
  },
  () => {
    const target = authenticatedTargetInner(targetPath)
    for (const row of fixture.rows) {
      const fragment = target.slice(row.target.start, row.target.end)
      assert.equal(sha256(fragment), row.target.sourceHash)
      const { ast, occurrences } = targetOccurrences(fragment, row.target.start)
      assert.equal(ast.body.length, 1)
      assert.equal(ast.body[0].type, row.target.nodeType)
      for (const residue of row.residues) {
        assert.ok(
          occurrences.some(
            occurrence =>
              occurrence.identity === identity(residue.kind, residue.value) &&
              occurrence.start === residue.start &&
              occurrence.end === residue.end,
          ),
          `${row.targetIndex}: exact ${identity(residue.kind, residue.value)} at ${residue.start}:${residue.end}`,
        )
      }
    }
  },
)
