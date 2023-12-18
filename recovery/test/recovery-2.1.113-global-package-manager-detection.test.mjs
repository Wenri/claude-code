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
  new URL(
    './recovery-2.1.113-global-package-manager-detection.json',
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
  '113b76b2b5a0919919c4e8a8c1de9a8268f167e11afca5419a4df08847668aea'

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
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(parsed.parseDiagnostics.length, 0, `${owner}: parses`)
  return { parsed, source }
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
  return found
}

function importsNamed(ts, parsed, expected) {
  return parsed.statements.some(statement => {
    if (
      !ts.isImportDeclaration(statement) ||
      statement.moduleSpecifier.text !== expected.module
    ) {
      return false
    }
    const bindings = statement.importClause?.namedBindings
    return (
      bindings &&
      ts.isNamedImports(bindings) &&
      bindings.elements.some(
        element =>
          (element.propertyName?.text ?? element.name.text) ===
            expected.imported && element.name.text === expected.local,
      )
    )
  })
}

function callsNamed(ts, declaration, name) {
  const calls = []
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === name
    ) {
      calls.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  return calls
}

function sourceResidues(ts, parsed, declaration) {
  const start = declaration.getStart(parsed)
  const rows = []
  function push(kind, value, node, tokenKind) {
    rows.push({
      kind,
      value,
      relativeStart: node.getStart(parsed) - start,
      relativeEnd: node.end - start,
      ...(tokenKind ? { tokenKind } : {}),
    })
  }
  function visit(node) {
    if (ts.isStringLiteralLike(node)) push('string', node.text, node)
    if (node.kind === ts.SyntaxKind.TemplateTail) {
      push('string', node.text, node, 'TemplateTail')
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.name)
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
    if (
      node.type === 'MemberExpression' &&
      !node.computed &&
      node.property?.type === 'Identifier'
    ) {
      rows.push({
        kind: 'property',
        value: node.property.name,
        start: offset + node.property.start,
        end: offset + node.property.end,
      })
    }
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) visit(child)
    }
  }
  visit(ast)
  return { ast, rows }
}

function assertRecoveredSource(ts, parsed) {
  const row = fixture.row
  const declaration = findFunction(ts, parsed, row.declaration.name)
  assert.ok(declaration, `${row.declaration.name}: declaration`)
  assert.equal(sha256(declaration.getText(parsed)), row.declaration.sha256)
  assert.ok(importsNamed(ts, parsed, row.sourceImport), 'bundled-mode import')

  const actualResidues = sourceResidues(ts, parsed, declaration)
  for (const residue of row.declaration.residues) {
    assert.ok(
      actualResidues.some(
        actual =>
          actual.kind === residue.kind &&
          actual.value === residue.value &&
          actual.relativeStart === residue.source.relativeStart &&
          actual.relativeEnd === residue.source.relativeEnd &&
          (!residue.source.tokenKind ||
            actual.tokenKind === residue.source.tokenKind),
      ),
      `source ${residue.kind}:${residue.value}`,
    )
  }

  for (const expected of row.callers) {
    const caller = findFunction(ts, parsed, expected.name)
    assert.ok(caller, `${expected.name}: declaration`)
    assert.equal(sha256(caller.getText(parsed)), expected.sha256)
    assert.equal(
      callsNamed(ts, caller, row.declaration.name).length,
      expected.detectorCalls,
      `${expected.name}: detector call count`,
    )
  }
  const installation = findFunction(ts, parsed, 'getInstallationPrefix')
  const install = findFunction(ts, parsed, 'installGlobalPackage')
  assert.match(
    installation.getText(parsed),
    /const isBun = detectGlobalPackageManager\(\) === 'bun'/,
  )
  assert.match(
    install.getText(parsed),
    /const packageManager = detectGlobalPackageManager\(\)/,
  )
  assert.match(
    install.getText(parsed),
    /packageManager === 'npm' && env\.isNpmFromWindowsPath\(\)/,
  )
}

test('u11276 is one exact three-residue recovered source gap', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, caseName)
  assert.equal(sha256(structuralBytes), fixture.artifact.structuralGzipSha256)
  assert.deepEqual(fixture.summary, {
    units: 1,
    residues: 3,
    recoveredSourceGapResidues: 3,
  })
  assert.equal(fixture.row.targetIndex, 11276)
  assert.deepEqual(
    fixture.row.declaration.residues.map(residue => residue.classification),
    ['recovered-source-gap', 'recovered-source-gap', 'recovered-source-gap'],
  )
  const region = structural.regions[fixture.row.targetIndex]
  assert.equal(region?.target?.index, fixture.row.targetIndex)
  assert.deepEqual(
    {
      classification: region.classification,
      end: region.target.end,
      nodeType: region.target.nodeType,
      sourceHash: region.target.sourceHash,
      start: region.target.start,
    },
    fixture.row.target,
  )
})

test(
  'recovered source pins the detector, import, residues, and both callers',
  { skip: !selected ? `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}` : false },
  async () => {
    const ts = await loadTypeScript()
    const { parsed } = parseSource(ts, recoveredSourceRoot, fixture.row.recoveredOwner)
    assertRecoveredSource(ts, parsed)
  },
)

test(
  'comparison root is either selectively recovered or pins the exact historical gap',
  { skip: !selected ? `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}` : false },
  async () => {
    const ts = await loadTypeScript()
    const { parsed, source } = parseSource(
      ts,
      comparisonSourceRoot,
      fixture.row.recoveredOwner,
    )
    const declaration = findFunction(ts, parsed, fixture.row.declaration.name)
    if (declaration) {
      assertRecoveredSource(ts, parsed)
      return
    }
    assert.equal(importsNamed(ts, parsed, fixture.row.sourceImport), false)
    for (const residue of fixture.row.declaration.residues) {
      assert.equal(source.includes(residue.value), false, `historical ${residue.value}`)
    }
    for (const expected of fixture.row.callers) {
      const caller = findFunction(ts, parsed, expected.name)
      assert.ok(caller, `${expected.name}: historical declaration`)
      assert.equal(
        sha256(caller.getText(parsed)),
        expected.historicalSha256,
        `${expected.name}: exact historical form`,
      )
      assert.equal(callsNamed(ts, caller, fixture.row.declaration.name).length, 0)
    }
  },
)

test(
  'authenticated target pins the complete detector and all exact residue occurrences',
  {
    skip: !selected
      ? `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}`
      : !targetPath
        ? 'authenticated 2.1.113 bundle is required'
        : false,
  },
  () => {
    const target = authenticatedTargetInner(targetPath)
    const fragment = target.slice(fixture.row.target.start, fixture.row.target.end)
    assert.equal(sha256(fragment), fixture.row.target.sourceHash)
    const { ast, rows } = targetResidues(fragment, fixture.row.target.start)
    assert.equal(ast.body.length, 1)
    assert.equal(ast.body[0].type, fixture.row.target.nodeType)
    for (const residue of fixture.row.declaration.residues) {
      assert.ok(
        rows.some(
          actual =>
            actual.kind === residue.kind &&
            actual.value === residue.value &&
            actual.start === residue.target.start &&
            actual.end === residue.target.end,
        ),
        `target ${residue.kind}:${residue.value}`,
      )
    }
  },
)

test(
  'source and target detectors agree over the Bun installation truth table',
  {
    skip: !selected
      ? `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}`
      : !targetPath
        ? 'authenticated 2.1.113 bundle is required'
        : false,
  },
  async () => {
    const ts = await loadTypeScript()
    const { parsed } = parseSource(ts, recoveredSourceRoot, fixture.row.recoveredOwner)
    const declaration = findFunction(ts, parsed, fixture.row.declaration.name)
    assert.ok(declaration)
    const transpiled = ts.transpileModule(
      `${declaration.getText(parsed)}\nexport { detectGlobalPackageManager }`,
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText
    const target = authenticatedTargetInner(targetPath)
    const targetFragment = target.slice(
      fixture.row.target.start,
      fixture.row.target.end,
    )
    const targetAst = parse(targetFragment, {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    const targetName = targetAst.body[0].id.name

    const cases = [
      {
        name: 'default Bun global install path wins outside Bun',
        execPath: '/home/alice/.bun/install/global/node_modules/@anthropic-ai/claude-code/cli.js',
        bunInstall: undefined,
        runningWithBun: false,
        bundled: true,
        expected: 'bun',
      },
      {
        name: 'custom BUN_INSTALL is normalized and strips trailing slashes',
        execPath: '/opt/bun/install/global/node_modules/claude/cli.js',
        bunInstall: '/opt/bun///',
        runningWithBun: false,
        bundled: false,
        expected: 'bun',
      },
      {
        name: 'Windows separators are normalized',
        execPath: 'C:\\Users\\alice\\.bun\\install\\global\\node_modules\\claude\\cli.exe',
        bunInstall: 'C:\\Users\\alice\\.bun\\',
        runningWithBun: false,
        bundled: false,
        expected: 'bun',
      },
      {
        name: 'unbundled Bun runtime uses bun',
        execPath: '/usr/local/bin/bun',
        bunInstall: undefined,
        runningWithBun: true,
        bundled: false,
        expected: 'bun',
      },
      {
        name: 'bundled Bun runtime uses npm when no global path proves Bun',
        execPath: '/usr/local/bin/claude',
        bunInstall: undefined,
        runningWithBun: true,
        bundled: true,
        expected: 'npm',
      },
      {
        name: 'empty BUN_INSTALL cannot match an absolute install/global path',
        execPath: '/install/global/node_modules/claude/cli.js',
        bunInstall: '',
        runningWithBun: false,
        bundled: false,
        expected: 'npm',
      },
      {
        name: 'Node runtime uses npm',
        execPath: '/usr/local/bin/node',
        bunInstall: undefined,
        runningWithBun: false,
        bundled: false,
        expected: 'npm',
      },
    ]

    for (const scenario of cases) {
      const fakeProcess = {
        execPath: scenario.execPath,
        env:
          scenario.bunInstall === undefined
            ? {}
            : { BUN_INSTALL: scenario.bunInstall },
      }
      const env = { isRunningWithBun: () => scenario.runningWithBun }
      const isInBundledMode = () => scenario.bundled

      const sourceModule = { exports: {} }
      Function(
        'module',
        'exports',
        'process',
        'env',
        'isInBundledMode',
        transpiled,
      )(
        sourceModule,
        sourceModule.exports,
        fakeProcess,
        env,
        isInBundledMode,
      )
      const sourceResult = sourceModule.exports.detectGlobalPackageManager()
      const targetDetector = Function(
        'process',
        'J6',
        'dz',
        `${targetFragment}; return ${targetName}`,
      )(fakeProcess, env, isInBundledMode)
      const targetResult = targetDetector()

      assert.equal(sourceResult, scenario.expected, `${scenario.name}: source`)
      assert.equal(targetResult, scenario.expected, `${scenario.name}: target`)
      assert.equal(sourceResult, targetResult, `${scenario.name}: equivalence`)
    }
  },
)
