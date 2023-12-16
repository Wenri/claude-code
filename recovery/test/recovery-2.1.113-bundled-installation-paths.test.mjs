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
  new URL('./recovery-2.1.113-bundled-installation-paths.json', import.meta.url),
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
  '1f7b039470c4c86bbd68a98214f6bffcb70bdfa12d6e432f0eeddb0aecb33fdb'

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
  return { parsed, source }
}

function findFunction(ts, parsed, name) {
  let found
  function visit(node) {
    if (!found && ts.isFunctionDeclaration(node) && node.name?.text === name) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  return found
}

function namedImports(ts, parsed) {
  const imports = []
  for (const statement of parsed.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue
    const bindings = statement.importClause.namedBindings
    if (!bindings || !ts.isNamedImports(bindings)) continue
    for (const element of bindings.elements) {
      imports.push({
        imported: element.propertyName?.text ?? element.name.text,
        local: element.name.text,
        module: statement.moduleSpecifier.text,
      })
    }
  }
  return imports
}

function assertRecoveredSource(ts, root) {
  const row = fixture.row
  const { parsed } = parseSource(ts, root, row.recoveredOwner)
  const declaration = findFunction(ts, parsed, row.declaration.name)
  assert.ok(declaration, `${row.declaration.name}: source declaration`)
  assert.equal(declaration.kind, ts.SyntaxKind.FunctionDeclaration)
  const text = declaration.getText(parsed)
  assert.equal(sha256(text), row.declaration.sha256)
  assert.match(text, /const \[invokedPath, execPath\] = getNormalizedPaths\(\)/)
  const imports = namedImports(ts, parsed)
  assert.ok(
    imports.some(
      actual =>
        actual.module === row.sourceImport.module &&
        actual.imported === row.sourceImport.imported &&
        actual.local === row.sourceImport.local,
    ),
    'config-home binding is imported from the exact module',
  )
  for (const residue of row.declaration.residues) {
    assert.equal(
      text.slice(residue.source.relativeStart, residue.source.relativeEnd),
      JSON.stringify(residue.value).replaceAll('"', "'"),
      `${residue.kind}:${residue.value}: exact source range`,
    )
  }
  return { declaration, parsed }
}

function targetOccurrences(fragment, absoluteStart) {
  const ast = parse(fragment, { ecmaVersion: 'latest', sourceType: 'module' })
  const occurrences = []
  function visit(node) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (node.type === 'Literal' && typeof node.value === 'string') {
      occurrences.push({
        end: absoluteStart + node.end,
        kind: 'string',
        start: absoluteStart + node.start,
        value: node.value,
      })
    }
    for (const [name, child] of Object.entries(node)) {
      if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(name)) {
        visit(child)
      }
    }
  }
  visit(ast)
  return { ast, occurrences }
}

function compileTarget(fragment, dependencies) {
  return Function(
    ...Object.keys(dependencies),
    `${fragment}; return Rt`,
  )(...Object.values(dependencies))
}

function compileSource(ts, parsed, declaration, dependencies) {
  const source = declaration.getText(parsed).replace(/^export\s+/, '')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  return Function(
    ...Object.keys(dependencies),
    `${output}; return getCurrentInstallationType`,
  )(...Object.values(dependencies))
}

function sourceDependencies({ configHome, execPath }) {
  const falsy = () => false
  return {
    detectApk: falsy,
    detectAsdf: falsy,
    detectDeb: falsy,
    detectHomebrew: falsy,
    detectMise: falsy,
    detectPacman: falsy,
    detectRpm: falsy,
    detectWinget: falsy,
    execa: async () => ({ exitCode: 1, stdout: '' }),
    getClaudeConfigHomeDir: () => configHome,
    getNormalizedPaths: () => [execPath, execPath],
    isInBundledMode: () => true,
    isRunningFromLocalInstallation: falsy,
    process: { env: {} },
  }
}

function targetDependencies({ configHome, execPath }) {
  const falsy = () => false
  return {
    $H6: falsy,
    AH6: falsy,
    KH6: falsy,
    Nj: async () => ({ exitCode: 1, stdout: '' }),
    UF9: () => [execPath, execPath],
    _H6: falsy,
    dz: () => true,
    fH6: falsy,
    fIH: falsy,
    process: { env: {} },
    qH6: falsy,
    s8: () => configHome,
    zH6: falsy,
    znK: falsy,
  }
}

test('the bundled-installation path fixture is exact and fail-closed', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, caseName)
  assert.equal(sha256(structuralBytes), fixture.artifact.structuralGzipSha256)
  assert.deepEqual(fixture.summary, {
    units: 1,
    residues: 2,
    recoveredSourceGapResidues: 2,
  })
  const row = fixture.row
  assert.equal(row.targetIndex, 11298)
  assert.equal(row.declaration.residues.length, fixture.summary.residues)
  for (const residue of row.declaration.residues) {
    assert.equal(residue.classification, 'recovered-source-gap')
    assert.ok(residue.target.start >= row.target.start)
    assert.ok(residue.target.end <= row.target.end)
  }
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
  )
})

test(
  'current source owns the exact recovered bundled-path checks',
  { skip: !selected ? `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}` : false },
  async () => {
    const ts = await loadTypeScript()
    assertRecoveredSource(ts, recoveredSourceRoot)
  },
)

test(
  'comparison root is either selectively recovered or pins the exact prior gap',
  { skip: !selected ? `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}` : false },
  async () => {
    const ts = await loadTypeScript()
    const { parsed } = parseSource(ts, comparisonSourceRoot, fixture.row.recoveredOwner)
    const declaration = findFunction(ts, parsed, fixture.row.declaration.name)
    assert.ok(declaration)
    const text = declaration.getText(parsed)
    if (sha256(text) === fixture.row.declaration.sha256) {
      assertRecoveredSource(ts, comparisonSourceRoot)
      return
    }
    assert.equal(sha256(text), fixture.row.declaration.historicalSha256)
    assert.equal(text.includes('/local/node_modules/'), false)
    assert.equal(text.includes('/node_modules/@anthropic-ai/'), false)
    assert.match(text, /const \[invokedPath\] = getNormalizedPaths\(\)/)
    const imports = namedImports(ts, parsed)
    assert.equal(
      imports.some(
        actual =>
          actual.module === fixture.row.sourceImport.module &&
          actual.imported === fixture.row.sourceImport.imported,
      ),
      false,
    )
  },
)

test(
  'authenticated target113 pins the complete unit and both exact residues',
  {
    skip: !selected
      ? `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}`
      : !targetPath
        ? 'authenticated 2.1.113 bundle is required'
        : false,
  },
  () => {
    const target = authenticatedTargetInner(targetPath)
    const row = fixture.row
    const fragment = target.slice(row.target.start, row.target.end)
    assert.equal(sha256(fragment), row.target.sourceHash)
    const { ast, occurrences } = targetOccurrences(fragment, row.target.start)
    assert.equal(ast.body.length, 1)
    assert.equal(ast.body[0].type, row.target.nodeType)
    for (const residue of row.declaration.residues) {
      assert.ok(
        occurrences.some(
          actual =>
            actual.kind === residue.kind &&
            actual.value === residue.value &&
            actual.start === residue.target.start &&
            actual.end === residue.target.end,
        ),
        `${residue.kind}:${residue.value}`,
      )
    }
  },
)

test(
  'source and authenticated target distinguish local, global, and native bundled paths',
  {
    skip: !selected
      ? `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}`
      : !targetPath
        ? 'authenticated 2.1.113 bundle is required'
        : false,
  },
  async () => {
    const ts = await loadTypeScript()
    const source = parseSource(ts, recoveredSourceRoot, fixture.row.recoveredOwner)
    const declaration = findFunction(ts, source.parsed, fixture.row.declaration.name)
    const target = authenticatedTargetInner(targetPath)
    const fragment = target.slice(fixture.row.target.start, fixture.row.target.end)
    const cases = [
      {
        configHome: '/users/alice/.claude/',
        execPath: '/users/alice/.claude/local/node_modules/@anthropic-ai/claude-code/cli.js',
        expected: 'npm-local',
      },
      {
        configHome: '/users/alice/.claude',
        execPath: '/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js',
        expected: 'npm-global',
      },
      {
        configHome: '/users/alice/.claude',
        execPath: '/opt/claude/versions/2.1.113',
        expected: 'native',
      },
    ]
    for (const values of cases) {
      const sourceFunction = compileSource(
        ts,
        source.parsed,
        declaration,
        sourceDependencies(values),
      )
      const targetFunction = compileTarget(fragment, targetDependencies(values))
      assert.equal(await sourceFunction(), values.expected)
      assert.equal(await targetFunction(), values.expected)
    }
  },
)
