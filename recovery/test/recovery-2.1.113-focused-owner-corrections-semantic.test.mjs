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
    './recovery-2.1.113-focused-owner-corrections.json',
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
  '2cf84b883e0541aa084b769cc84aa76923ba34cf8589b9524144e7d508e413c4'
const TARGET_WRAPPER_SHA256 =
  'dda4d89e787fa455706e4f41beffc8e58d42b9094c4d155fcbf62e3f19036681'
const TARGET_WRAPPER_PREFIX_LENGTH = 87
const TARGET_WRAPPER_SUFFIX_LENGTH = 3

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function ownerId(owner) {
  return `owner-${owner
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`
}

function identity(kind, value) {
  if (kind === 'regexp') {
    return `regexp:${JSON.stringify(value.pattern)}/${[...value.flags]
      .sort()
      .join('')}`
  }
  return `${kind}:${JSON.stringify(value)}`
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
      if (node.regex) add('regexp', node.regex, node.start, node.end)
      else if (typeof node.value === 'string') {
        add('string', node.value, node.start, node.end)
      }
    } else if (node.type === 'TemplateElement') {
      const value = node.value?.cooked ?? node.value?.raw
      if (typeof value === 'string') add('string', value, node.start, node.end)
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
    if (property) add('property', property.name, property.start, property.end)
  })
  return { ast, occurrences }
}

function authenticatedTargetInner(filename) {
  const bytes = fs.readFileSync(filename)
  const digest = sha256(bytes)
  if (digest === fixture.artifact.targetInnerSha256) {
    return bytes.toString('utf8')
  }
  assert.equal(digest, TARGET_WRAPPER_SHA256, 'authenticated target wrapper')
  const inner = bytes.subarray(
    TARGET_WRAPPER_PREFIX_LENGTH,
    bytes.length - TARGET_WRAPPER_SUFFIX_LENGTH,
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
    if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
      node.name?.text === name
    ) {
      found = node
      return
    }
    if (ts.isVariableStatement(node)) {
      const match = node.declarationList.declarations.find(
        declaration =>
          ts.isIdentifier(declaration.name) && declaration.name.text === name,
      )
      if (match) {
        found = node
        return
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

function declarationKind(ts, node) {
  if (ts.isFunctionDeclaration(node)) return 'FunctionDeclaration'
  if (ts.isClassDeclaration(node)) return 'ClassDeclaration'
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

function sourceIdentities(ts, declaration) {
  const identities = new Set()
  function add(kind, value) {
    identities.add(identity(kind, value))
  }
  function visit(node) {
    if (ts.isStringLiteralLike(node)) {
      add('string', node.text)
    } else if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) {
      const match = /^\/(.*)\/([a-z]*)$/s.exec(node.text)
      if (match) add('regexp', { flags: match[2], pattern: match[1] })
    }

    if (ts.isPropertyAccessExpression(node)) {
      add('property', node.name.text)
    } else if (
      (ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isPropertyDeclaration(node) ||
        ts.isBindingElement(node) ||
        ts.isJsxAttribute(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      add('property', node.name.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  return identities
}

test('the target113 focused owner-correction fixture is exact and fail-closed', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, caseName)
  assert.equal(sha256(structuralBytes), fixture.artifact.structuralGzipSha256)
  assert.deepEqual(fixture.summary, { residues: 92, units: 61 })
  assert.deepEqual(fixture.proof, {
    target: 'complete structural unit slice authenticated by SHA-256',
    source:
      'exact named TypeScript AST declaration kind and residue identities, invariant across source roots',
    imports: 'exact non-type import module/imported/local triples',
  })

  const seen = new Set()
  let residueCount = 0
  for (const row of fixture.rows) {
    assert.ok(!seen.has(row.targetIndex), `${row.targetIndex}: unique unit`)
    seen.add(row.targetIndex)
    assert.ok(row.currentOwners.length > 0, `${row.targetIndex}: prior owner`)
    assert.ok(
      !row.currentOwners.includes(ownerId(row.correctedOwner)),
      `${row.targetIndex}: genuinely corrected owner`,
    )
    assert.ok(row.residues.length > 0, `${row.targetIndex}: residues`)
    residueCount += row.residues.length

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
        ['property', 'regexp', 'string'].includes(residue.kind),
        `${row.targetIndex}: residue kind`,
      )
      assert.ok(
        residue.start >= row.target.start && residue.end <= row.target.end,
        `${row.targetIndex}: residue inside target unit`,
      )
    }
    assert.ok(row.source.declaration.length > 0)
    assert.ok(
      ['ClassDeclaration', 'FunctionDeclaration', 'VariableDeclaration'].includes(
        row.source.declarationKind,
      ),
    )
  }
  assert.equal(seen.size, fixture.summary.units)
  assert.equal(residueCount, fixture.summary.residues)
  assert.ok(seen.has(2360), 'u2360 is included in the correction fixture')
  assert.ok(seen.has(4561), 'u4561 is included in the correction fixture')
})

test(
  'every corrected owner has the exact named source AST and runtime imports',
  { skip: !selected ? `not applicable to ${semanticCase}` : false },
  async () => {
    const ts = await loadTypeScript()
    const failures = []
    for (const row of fixture.rows) {
      try {
        const filename = sourceFilename(row.correctedOwner)
        const source = fs.readFileSync(filename, 'utf8')
        const sourceFile = ts.createSourceFile(
          filename,
          source,
          ts.ScriptTarget.Latest,
          true,
          filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
        )
        assert.equal(
          sourceFile.parseDiagnostics.length,
          0,
          `${row.targetIndex}: ${row.correctedOwner} parses`,
        )
        const declaration = findDeclaration(
          ts,
          sourceFile,
          row.source.declaration,
        )
        assert.ok(
          declaration,
          `${row.targetIndex}: ${row.source.declaration} declaration`,
        )
        assert.equal(
          declarationKind(ts, declaration),
          row.source.declarationKind,
          `${row.targetIndex}: source declaration kind`,
        )
        const actualImports = sourceImports(ts, sourceFile)
        for (const expected of row.source.imports) {
          assert.ok(
            actualImports.some(
              actual =>
                !actual.typeOnly &&
                actual.module === expected.module &&
                actual.imported === expected.imported &&
                actual.local === expected.local,
            ),
            `${row.targetIndex}: import ${expected.module}:${expected.imported}:${expected.local}`,
          )
        }

        const identities = sourceIdentities(ts, declaration)
        const importedNames = new Set(
          row.source.imports.flatMap(item => [item.imported, item.local]),
        )
        for (const residue of row.residues) {
          const residueIdentity = identity(residue.kind, residue.value)
          assert.ok(
            identities.has(residueIdentity) ||
              (residue.kind === 'property' &&
                importedNames.has(String(residue.value))),
            `${row.targetIndex}: ${row.correctedOwner} owns ${residueIdentity}`,
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
  'every corrected unit is a complete authenticated target fragment with exact residue ranges',
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
      assert.equal(
        sha256(fragment),
        row.target.sourceHash,
        `${row.targetIndex}: full target fragment`,
      )
      const { ast, occurrences } = targetOccurrences(fragment, row.target.start)
      assert.equal(ast.body.length, 1, `${row.targetIndex}: one complete unit`)
      assert.equal(
        ast.body[0].type,
        row.target.nodeType,
        `${row.targetIndex}: target node type`,
      )
      for (const residue of row.residues) {
        const residueIdentity = identity(residue.kind, residue.value)
        assert.ok(
          occurrences.some(
            occurrence =>
              occurrence.identity === residueIdentity &&
              occurrence.start === residue.start &&
              occurrence.end === residue.end,
          ),
          `${row.targetIndex}: exact target ${residueIdentity} at ${residue.start}:${residue.end}`,
        )
      }
    }
  },
)
