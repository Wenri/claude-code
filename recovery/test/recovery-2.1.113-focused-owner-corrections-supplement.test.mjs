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
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.113-focused-owner-corrections-supplement.json',
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
  '4c8028de9f80db8dd4ae19773a1dee8b282944de7cd62f8fc942114918b07d3f'

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

function parseSource(ts, root, owner) {
  const filename = sourceFilename(root, owner)
  assert.ok(filename, `${owner}: source file exists`)
  const source = fs.readFileSync(filename, 'utf8')
  const parsed = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(parsed.parseDiagnostics.length, 0, `${owner}: parses`)
  return parsed
}

function findFunction(ts, parsed, name) {
  let found
  function visit(node) {
    if (found) return
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  assert.ok(found, `${name}: source declaration`)
  return found
}

function sourceImports(ts, parsed) {
  const imports = []
  for (const statement of parsed.statements) {
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
          typeOnly: clause.isTypeOnly || element.isTypeOnly,
        })
      }
    }
  }
  return imports
}

function identifierCallCounts(ts, declaration) {
  const counts = new Map()
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      counts.set(node.expression.text, (counts.get(node.expression.text) ?? 0) + 1)
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  return counts
}

function targetProperties(fragment, offset) {
  const ast = parse(fragment, { ecmaVersion: 'latest', sourceType: 'module' })
  const rows = []
  function visit(node) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    const property =
      node.type === 'MemberExpression' &&
      !node.computed &&
      node.property?.type === 'Identifier'
        ? node.property
        : node.type === 'Property' &&
            !node.computed &&
            node.key?.type === 'Identifier'
          ? node.key
          : null
    if (property) {
      rows.push({
        end: offset + property.end,
        start: offset + property.start,
        value: property.name,
      })
    }
    for (const [name, child] of Object.entries(node)) {
      if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(name)) {
        visit(child)
      }
    }
  }
  visit(ast)
  return { ast, rows }
}

function compileTarget(fragment, dependencies, name) {
  return Function(
    ...Object.keys(dependencies),
    `${fragment}; return ${name}`,
  )(...Object.values(dependencies))
}

function compileSource(ts, parsed, declaration, dependencies, name) {
  const source = declaration.getText(parsed).replace(/^export\s+/, '')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  return Function(
    ...Object.keys(dependencies),
    `${output}; return ${name}`,
  )(...Object.values(dependencies))
}

test('the owner-correction supplement is exact and fail-closed', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, caseName)
  assert.equal(sha256(structuralBytes), fixture.artifact.structuralGzipSha256)
  assert.deepEqual(fixture.summary, { units: 2, residues: 3 })
  assert.deepEqual(
    fixture.rows.map(row => row.targetIndex),
    [10812, 10813],
  )
  assert.equal(
    fixture.rows.reduce((sum, row) => sum + row.residues.length, 0),
    3,
  )
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
    assert.deepEqual(row.priorOwnerPaths, ['utils/generatedFiles.ts'])
    assert.equal(row.correctedOwner, 'src/utils/commitAttribution.ts')
  }
})

test(
  'commitAttribution pins exact declarations, runtime imports, and source call counts',
  { skip: !selected ? `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}` : false },
  async () => {
    const ts = await loadTypeScript()
    for (const row of fixture.rows) {
      const parsed = parseSource(ts, sourceRoot, row.correctedOwner)
      const declaration = findFunction(ts, parsed, row.source.declaration)
      assert.equal(
        sha256(declaration.getText(parsed)),
        row.source.declarationSha256,
        `${row.targetIndex}: exact source declaration`,
      )
      const imports = sourceImports(ts, parsed)
      for (const expected of row.source.imports) {
        assert.ok(
          imports.some(
            actual =>
              !actual.typeOnly &&
              actual.module === expected.module &&
              actual.imported === expected.imported &&
              actual.local === expected.local,
          ),
          `${row.targetIndex}: ${expected.module}:${expected.imported}`,
        )
      }
      const counts = identifierCallCounts(ts, declaration)
      for (const [name, count] of Object.entries(row.source.callCounts)) {
        assert.equal(counts.get(name), count, `${row.targetIndex}: ${name} calls`)
      }
    }
  },
)

test(
  'authenticated target113 pins exact properties and target/source behavior',
  {
    skip: !selected
      ? `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}`
      : !targetPath
        ? 'authenticated 2.1.113 bundle is required'
        : false,
  },
  async () => {
    const ts = await loadTypeScript()
    const target = authenticatedTargetInner(targetPath)
    const fragments = new Map()
    for (const row of fixture.rows) {
      const fragment = target.slice(row.target.start, row.target.end)
      fragments.set(row.targetIndex, fragment)
      assert.equal(sha256(fragment), row.target.sourceHash)
      const { ast, rows } = targetProperties(fragment, row.target.start)
      assert.equal(ast.body.length, 1)
      assert.equal(ast.body[0].type, row.target.nodeType)
      for (const residue of row.residues) {
        assert.ok(
          rows.some(
            actual =>
              actual.value === residue.value &&
              actual.start === residue.start &&
              actual.end === residue.end,
          ),
          `${row.targetIndex}: exact ${residue.value}`,
        )
      }
    }

    const content = 'commit attribution\n'
    const expectedHash = crypto.createHash('sha256').update(content).digest('hex')
    const targetHash = compileTarget(
      fragments.get(10812),
      { aCK: crypto },
      'Ck9',
    )
    assert.equal(targetHash(content), expectedHash)

    const fsImplementation = { realpathSync: value => value }
    const targetNormalize = compileTarget(
      fragments.get(10813),
      {
        Cx: path.posix,
        NDH: () => '/repo',
        k$: () => fsImplementation,
      },
      'vB$',
    )
    assert.equal(targetNormalize('relative/file.ts'), 'relative/file.ts')
    assert.equal(targetNormalize('/repo/src/file.ts'), 'src/file.ts')
    assert.equal(targetNormalize('/outside/file.ts'), '/outside/file.ts')

    const owner = fixture.rows[0].correctedOwner
    const parsed = parseSource(ts, sourceRoot, owner)
    const sourceHashDeclaration = findFunction(
      ts,
      parsed,
      fixture.rows[0].source.declaration,
    )
    const sourceHash = compileSource(
      ts,
      parsed,
      sourceHashDeclaration,
      { createHash: crypto.createHash },
      'computeContentHash',
    )
    assert.equal(sourceHash(content), expectedHash)

    const sourceNormalizeDeclaration = findFunction(
      ts,
      parsed,
      fixture.rows[1].source.declaration,
    )
    const sourceNormalize = compileSource(
      ts,
      parsed,
      sourceNormalizeDeclaration,
      {
        getAttributionRepoRoot: () => '/repo',
        getFsImplementation: () => fsImplementation,
        isAbsolute: path.posix.isAbsolute,
        relative: path.posix.relative,
        sep: path.posix.sep,
      },
      'normalizeFilePath',
    )
    for (const filename of [
      'relative/file.ts',
      '/repo/src/file.ts',
      '/outside/file.ts',
    ]) {
      assert.equal(sourceNormalize(filename), targetNormalize(filename))
    }
  },
)
