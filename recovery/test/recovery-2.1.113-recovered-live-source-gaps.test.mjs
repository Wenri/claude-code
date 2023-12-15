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
  new URL('./recovery-2.1.113-recovered-live-source-gaps.json', import.meta.url),
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
  '2c96a3ca83992fdf30700e145265587cabe3dd7b24d4b4cc3288374e0bb434b6'

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
        : ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(
              node.type,
            ) &&
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
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) visit(child)
    }
  }
  visit(ast)
  return { ast, rows }
}

function compile(fragment, dependencies, name) {
  return Function(
    ...Object.keys(dependencies),
    `${fragment}; return ${name}`,
  )(...Object.values(dependencies))
}

test('the recovered live-source-gap fixture is exact and fail-closed', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, caseName)
  assert.equal(sha256(structuralBytes), fixture.artifact.structuralGzipSha256)
  assert.deepEqual(fixture.summary, { residues: 3, units: 3 })
  assert.deepEqual(
    fixture.rows.map(row => row.targetIndex),
    [8711, 10147, 20261],
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
    assert.equal(row.residues.length, 1)
    assert.ok(row.priorOwnerIds.length > 0)
    assert.ok(row.historicalGap.length > 0)
  }
})

test(
  'recovered source pins each exact named declaration, hash, and runtime import',
  { skip: !selected ? `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}` : false },
  async () => {
    const ts = await loadTypeScript()
    for (const row of fixture.rows) {
      const parsed = sourceFile(ts, recoveredSourceRoot, row.recoveredOwner)
      assert.ok(parsed, `${row.targetIndex}: recovered owner exists`)
      const declaration = findDeclaration(ts, parsed, row.source.declaration)
      assert.ok(declaration, `${row.targetIndex}: recovered declaration`)
      assert.equal(declarationKind(ts, declaration), row.source.declarationKind)
      assert.equal(
        sha256(declaration.getText(parsed)),
        row.source.declarationSha256,
        `${row.targetIndex}: exact recovered declaration`,
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
          `${row.targetIndex}: ${expected.module}:${expected.imported}:${expected.local}`,
        )
      }
    }
  },
)

test(
  'the comparison source root contains the packaged recovery or proves the recorded pre-package gap',
  { skip: !selected ? `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}` : false },
  async () => {
    const ts = await loadTypeScript()
    for (const row of fixture.rows) {
      const parsed = sourceFile(ts, comparisonSourceRoot, row.recoveredOwner)
      const declaration = findDeclaration(ts, parsed, row.source.declaration)
      if (declaration) {
        assert.equal(
          declarationKind(ts, declaration),
          row.source.declarationKind,
          `${row.targetIndex}: packaged declaration kind`,
        )
        assert.equal(
          sha256(declaration.getText(parsed)),
          row.source.declarationSha256,
          `${row.targetIndex}: packaged declaration identity`,
        )
      } else if (row.historicalGap === 'owner-file-absent') {
        assert.equal(parsed, null, `${row.targetIndex}: historical owner file absent`)
      } else {
        assert.equal(declaration, undefined, `${row.targetIndex}: historical declaration absent`)
      }
    }
  },
)

test(
  'authenticated target113 pins exact residues and executes the three recovered behaviors',
  {
    skip: !selected
      ? `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}`
      : !targetPath
        ? 'authenticated 2.1.113 bundle is required'
        : false,
  },
  () => {
    const target = authenticatedTargetInner(targetPath)
    const fragments = new Map()
    for (const row of fixture.rows) {
      const fragment = target.slice(row.target.start, row.target.end)
      fragments.set(row.targetIndex, fragment)
      assert.equal(sha256(fragment), row.target.sourceHash)
      const { ast, rows } = targetProperties(fragment, row.target.start)
      assert.equal(ast.body.length, 1)
      assert.equal(ast.body[0].type, row.target.nodeType)
      const residue = row.residues[0]
      assert.ok(
        rows.some(
          property =>
            property.value === residue.value &&
            property.start === residue.start &&
            property.end === residue.end,
        ),
        `${row.targetIndex}: exact target property`,
      )
    }

    const hashFileStateContent = compile(
      fragments.get(8711),
      { AYK: crypto },
      'zYK',
    )
    assert.equal(
      hashFileStateContent('recovered'),
      crypto.createHash('sha1').update('recovered').digest('base64url'),
    )

    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' })
    const readLoopFile = compile(
      fragments.get(10147),
      {
        Di8: path.posix,
        T_: error => error.code === 'ENOENT',
        U8: error => error.code,
        kX9: value => value,
        l9: () => '/project',
        nTK: {
          readFileSync(filename) {
            if (filename.startsWith('/project/')) throw missing
            return '  loop task  '
          },
        },
        s8: () => '/cwd',
      },
      'aTK',
    )
    assert.deepEqual(readLoopFile(), {
      content: 'loop task',
      path: '/cwd/loop.md',
    })

    const getSdkMemoryRecallEvent = compile(
      fragments.get(20261),
      {
        ED7: value => (value === '/team' ? 'project' : undefined),
        J1_: { randomUUID: () => 'memory-uuid' },
        R$: () => 'session-id',
        j1_: value =>
          value.startsWith('<synthesis:') ? value.slice(11, -1) : undefined,
      },
      'X1_',
    )
    assert.equal(getSdkMemoryRecallEvent([]), undefined)
    assert.deepEqual(getSdkMemoryRecallEvent([{ path: '/team', content: 'x' }]), {
      memories: [{ path: '/team', scope: 'project' }],
      mode: 'select',
      session_id: 'session-id',
      subtype: 'memory_recall',
      type: 'system',
      uuid: 'memory-uuid',
    })
    assert.deepEqual(
      getSdkMemoryRecallEvent([{ path: '<synthesis:/team>', content: 'memo' }]),
      {
        memories: [
          {
            content: 'memo',
            path: '<synthesis:/team>',
            scope: 'project',
          },
        ],
        mode: 'synthesize',
        session_id: 'session-id',
        subtype: 'memory_recall',
        type: 'system',
        uuid: 'memory-uuid',
      },
    )
  },
)
