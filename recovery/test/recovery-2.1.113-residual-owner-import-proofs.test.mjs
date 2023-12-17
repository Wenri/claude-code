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
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.113-residual-owner-import-proofs.json',
    import.meta.url,
  ),
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
  '9214d16c34f3791fd9e78d149ea8892e75148ad88310143977c4a810f4aa1702'

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
    if (node.type === 'Literal') {
      if (typeof node.value === 'string' || typeof node.value === 'number') {
        add(typeof node.value, node.value, node.start, node.end)
      }
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
  assert.equal(
    digest,
    fixture.artifact.targetWrapperSha256,
    'authenticated target wrapper',
  )
  const inner = bytes.subarray(
    fixture.artifact.targetWrapperPrefixLength,
    bytes.length - fixture.artifact.targetWrapperSuffixLength,
  )
  assert.equal(
    sha256(inner),
    fixture.artifact.targetInnerSha256,
    'authenticated target inner',
  )
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

function sourceFilename(owner) {
  const relative = owner.replace(/^src\//, '')
  const direct = path.join(sourceRoot, relative)
  const nested = path.join(sourceRoot, owner)
  const filename = fs.existsSync(direct) ? direct : nested
  assert.ok(fs.existsSync(filename), `${owner}: source owner exists`)
  return filename
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
    if (clause.name) {
      imports.push({ imported: 'default', local: clause.name.text, module })
    }
    const named = clause.namedBindings
    if (named && ts.isNamespaceImport(named)) {
      imports.push({ imported: '*', local: named.name.text, module })
    } else if (named && ts.isNamedImports(named)) {
      for (const element of named.elements) {
        imports.push({
          imported: element.propertyName?.text ?? element.name.text,
          local: element.name.text,
          module,
        })
      }
    }
  }
  return imports
}

function sourceIdentities(ts, declaration) {
  const identities = new Set()
  function visit(node) {
    if (
      ts.isStringLiteralLike(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      identities.add(identity('string', node.text))
    } else if (ts.isNumericLiteral(node)) {
      identities.add(identity('number', Number(node.text.replaceAll('_', ''))))
    }
    if (ts.isPropertyAccessExpression(node)) {
      identities.add(identity('property', node.name.text))
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  return identities
}

test('the target113 residual owner/import fixture is exact and fail-closed', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, caseName)
  assert.equal(sha256(structuralBytes), fixture.artifact.structuralGzipSha256)
  assert.deepEqual(fixture.summary, {
    units: 6,
    residues: 16,
    alternateOwnerUnits: 5,
    directOwnerUnits: 1,
    compilerOrImportResidues: 14,
    authoredResidues: 1,
    recoveredSourceGapResidues: 1,
  })

  const seen = new Set()
  let residues = 0
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
      `${row.targetIndex}: complete structural identity`,
    )
    for (const residue of row.residues) {
      assert.ok(
        residue.start >= row.target.start && residue.end <= row.target.end,
        `${row.targetIndex}: residue inside target unit`,
      )
    }
  }
  assert.equal(seen.size, fixture.summary.units)
  assert.equal(residues, fixture.summary.residues)
})

test(
  'every residual row has the exact dual-root source declaration and runtime imports',
  { skip: !selected ? `not applicable to ${semanticCase}` : false },
  async () => {
    const ts = await loadTypeScript()
    const failures = []
    for (const row of fixture.rows) {
      try {
        const filename = sourceFilename(row.sourceOwner)
        const source = fs.readFileSync(filename, 'utf8')
        const sourceFile = ts.createSourceFile(
          filename,
          source,
          ts.ScriptTarget.Latest,
          true,
          filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
        )
        assert.equal(sourceFile.parseDiagnostics.length, 0)
        const declaration = findDeclaration(ts, sourceFile, row.source.declaration)
        assert.ok(declaration, `${row.targetIndex}: source declaration`)
        assert.equal(
          declarationKind(ts, declaration),
          row.source.declarationKind,
          `${row.targetIndex}: declaration kind`,
        )
        const declarationSha256 = sha256(declaration.getText(sourceFile))
        assert.ok(
          row.source.acceptedDeclarationSha256.includes(declarationSha256),
          `${row.targetIndex}: accepted dual-root declaration hash`,
        )
        const imports = sourceImports(ts, sourceFile)
        for (const expected of row.source.imports) {
          assert.ok(
            imports.some(
              actual =>
                actual.module === expected.module &&
                actual.imported === expected.imported &&
                actual.local === expected.local,
            ),
            `${row.targetIndex}: import ${expected.module}:${expected.imported}:${expected.local}`,
          )
        }
        const identities = sourceIdentities(ts, declaration)
        const imported = new Set(
          row.source.imports.flatMap(item => [item.imported, item.local]),
        )
        for (const residue of row.residues) {
          const residueIdentity = identity(residue.kind, residue.value)
          if (
            residue.classification === 'recovered-source-gap' &&
            row.source.gapAbsentDeclarationSha256?.includes(declarationSha256)
          ) {
            assert.ok(
              !identities.has(residueIdentity),
              `${row.targetIndex}: historical source lacks ${residueIdentity}`,
            )
            continue
          }
          assert.ok(
            identities.has(residueIdentity) ||
              (residue.kind === 'property' && imported.has(residue.value)),
            `${row.targetIndex}: source owns ${residueIdentity}`,
          )
        }
      } catch (error) {
        failures.push(`${row.targetIndex}: ${error.message}`)
      }
    }
    assert.deepEqual(failures, [])
  },
)

test(
  'every residual row is a complete authenticated target fragment with exact residue ranges',
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
      assert.equal(ast.body.length, 1, `${row.targetIndex}: one complete unit`)
      assert.equal(ast.body[0].type, row.target.nodeType)
      for (const residue of row.residues) {
        const exact = occurrences.some(
          occurrence =>
            occurrence.identity === identity(residue.kind, residue.value) &&
            occurrence.start === residue.start &&
            occurrence.end === residue.end,
        )
        const authoredTemplateFragment =
          residue.kind === 'string' &&
          target.slice(residue.start, residue.end) === residue.value
        assert.ok(
          exact || authoredTemplateFragment,
          `${row.targetIndex}: exact ${identity(residue.kind, residue.value)} at ${residue.start}:${residue.end}`,
        )
      }
    }
  },
)
