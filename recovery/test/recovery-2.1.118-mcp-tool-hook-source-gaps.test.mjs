import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  applyTarget118McpToolHookSourceRecovery,
  TARGET118_MCP_TOOL_HOOK_INPUT_FILES,
  TARGET118_MCP_TOOL_HOOK_OUTPUT_FILES,
  TARGET118_MCP_TOOL_HOOK_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/replay-mcp-tool-hook-source-gaps.mjs'

const root = process.cwd()
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(root, 'recovery/test/recovery-2.1.118-mcp-tool-hook-source-gaps.json'),
    'utf8',
  ),
)
const targetBundlePath =
  process.env.CLAUDE_CODE_2_1_118_BUNDLE ??
  path.join(
    root,
    '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
  )
const sourceRoot =
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
  path.join(root, '.recovery-tmp/semantic-trees/2.1.118/src')

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })

let typescriptPromise
function loadTypeScript() {
  typescriptPromise ??= import(
    pathToFileURL(
      path.join(
        root,
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      ),
    ).href
  ).then(imported => imported.default ?? imported)
  return typescriptPromise
}

function readCoverage() {
  return JSON.parse(
    gunzipSync(
      fs.readFileSync(
        path.join(
          root,
          'recovery/cases/2.1.117-to-2.1.118/semantic/source-coverage.json.gz',
        ),
      ),
    ),
  )
}

function materializeRawSource() {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target118-mcp-tool-hooks-'),
  )
  const temporarySource = path.join(temporary, 'src')
  for (const input of fixture.inputs.sourceFiles) {
    const relative = input.path.replace(/^src\//, '')
    const from = path.join(sourceRoot, relative)
    const to = path.join(temporarySource, relative)
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.copyFileSync(from, to)
    assert.deepEqual(descriptor(fs.readFileSync(to)), input.input)
  }
  return { temporary, temporarySource }
}

function findDeclaration(ts, sourceFile, name) {
  const matches = sourceFile.statements.filter(
    statement =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  )
  assert.equal(matches.length, 1, `${sourceFile.fileName}:${name}`)
  return matches[0]
}

function evaluateDeclaration(ts, sourceFile, declaration, names, values) {
  const declarationText = sourceFile.text
    .slice(declaration.getStart(sourceFile), declaration.end)
    .replace(/^export\s+/, '')
  const javascript = ts.transpileModule(declarationText, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText
  return new Function(...names, `${javascript}\nreturn ${declaration.name.text}`)(
    ...values,
  )
}

test('Target118 MCP-tool hook fixture is complete and deterministic', () => {
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.117-to-2.1.118')
  assert.equal(fixture.summary.units, 4)
  assert.equal(fixture.summary.residues, 6)
  assert.deepEqual(
    fixture.rows.map(row => row.targetIndex),
    [12732, 17170, 17197, 17198],
  )
  assert.equal(
    sha256(JSON.stringify(fixture.rows.map(row => row.targetIndex))),
    fixture.summary.indicesSha256,
  )
  assert.equal(
    sha256(JSON.stringify(fixture.rows.flatMap(row => row.residues))),
    fixture.summary.residueIdentitiesSha256,
  )
  assert.deepEqual(
    TARGET118_MCP_TOOL_HOOK_INPUT_FILES,
    fixture.inputs.sourceFiles.map(file => ({ path: file.path, ...file.input })),
  )
  assert.deepEqual(
    TARGET118_MCP_TOOL_HOOK_OUTPUT_FILES,
    fixture.inputs.sourceFiles.map(file => ({ path: file.path, ...file.output })),
  )
  assert.deepEqual(
    TARGET118_MCP_TOOL_HOOK_OWNER_OVERRIDES.map(row => row.targetIndex),
    fixture.rows.map(row => row.targetIndex),
  )
})

test('authenticated Target118 fragments pin all four MCP-tool hook units', () => {
  if (!fs.existsSync(targetBundlePath)) {
    return test.skip('authenticated Target118 bundle is unavailable')
  }
  const bundle = fs.readFileSync(targetBundlePath)
  assert.deepEqual(descriptor(bundle), fixture.inputs.targetBundle)
  const structural = JSON.parse(
    gunzipSync(
      fs.readFileSync(path.join(root, fixture.inputs.structuralLedger.path)),
    ),
  )
  assert.deepEqual(
    descriptor(fs.readFileSync(path.join(root, fixture.inputs.structuralLedger.path))),
    {
      bytes: fixture.inputs.structuralLedger.bytes,
      sha256: fixture.inputs.structuralLedger.sha256,
    },
  )
  const targetText = bundle.toString()
  for (const row of fixture.rows) {
    const region = structural.regions.find(
      region => region.target.index === row.targetIndex,
    )
    assert(region, `u${row.targetIndex}`)
    assert.equal(region.target.start, row.target.start)
    assert.equal(region.target.end, row.target.end)
    assert.equal(region.target.nodeType, row.target.nodeType)
    assert.equal(region.target.sourceHash, row.target.sourceHash)
    const slice = bundle.subarray(row.target.start, row.target.end)
    assert.deepEqual(descriptor(slice), {
      bytes: row.target.bytes,
      sha256: row.target.sourceHash,
    })
    assert(slice.toString().startsWith(`function ${row.targetBinding}(`))
    for (const residue of row.residues) {
      const [kind, value, start, end] = residue
      assert.equal(kind, 'string')
      assert(start >= row.target.start && end <= row.target.end)
      assert.equal(JSON.parse(targetText.slice(start, end)), value)
    }
  }
})

test('MCP-tool hook replay is exact, idempotent, typed, and executable', async t => {
  const ts = await loadTypeScript()
  const { temporary, temporarySource } = materializeRawSource()
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  assert.deepEqual(
    applyTarget118McpToolHookSourceRecovery({ sourceRoot: temporarySource }),
    {
      status: 'recovered',
      files: fixture.inputs.sourceFiles.map(file => file.path),
    },
  )
  assert.deepEqual(
    applyTarget118McpToolHookSourceRecovery({ sourceRoot: temporarySource }),
    { status: 'already-recovered', files: [] },
  )

  const sourceFiles = new Map()
  for (const sourceDescriptor of fixture.inputs.sourceFiles) {
    const relative = sourceDescriptor.path.replace(/^src\//, '')
    const filename = path.join(temporarySource, relative)
    const value = fs.readFileSync(filename)
    assert.deepEqual(descriptor(value), sourceDescriptor.output)
    const sourceFile = ts.createSourceFile(
      filename,
      value.toString(),
      ts.ScriptTarget.Latest,
      true,
      filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    assert.equal(sourceFile.parseDiagnostics.length, 0)
    sourceFiles.set(sourceDescriptor.path, sourceFile)
  }
  for (const declarationDescriptor of fixture.outputDeclarations) {
    const sourceFile = sourceFiles.get(declarationDescriptor.path)
    const declaration = findDeclaration(
      ts,
      sourceFile,
      declarationDescriptor.name,
    )
    const value = Buffer.from(sourceFile.text)
    assert.deepEqual(
      {
        start: declaration.getStart(sourceFile),
        end: declaration.end,
        ...descriptor(
          value.subarray(declaration.getStart(sourceFile), declaration.end),
        ),
      },
      {
        start: declarationDescriptor.start,
        end: declarationDescriptor.end,
        bytes: declarationDescriptor.bytes,
        sha256: declarationDescriptor.sha256,
      },
    )
  }

  const hooksSettings = sourceFiles.get('src/utils/hooks/hooksSettings.ts')
  const isHookEqual = evaluateDeclaration(
    ts,
    hooksSettings,
    findDeclaration(ts, hooksSettings, 'isHookEqual'),
    ['jsonStringify', 'DEFAULT_HOOK_SHELL'],
    [JSON.stringify, 'bash'],
  )
  const getHookDisplayText = evaluateDeclaration(
    ts,
    hooksSettings,
    findDeclaration(ts, hooksSettings, 'getHookDisplayText'),
    [],
    [],
  )
  const first = {
    type: 'mcp_tool',
    server: 'github',
    tool: 'search',
    input: { query: 'one' },
    if: 'Bash(git *)',
  }
  assert.equal(isHookEqual(first, { ...first }), true)
  assert.equal(isHookEqual(first, { ...first, server: 'linear' }), false)
  assert.equal(isHookEqual(first, { ...first, tool: 'issue' }), false)
  assert.equal(isHookEqual(first, { ...first, input: { query: 'two' } }), false)
  assert.equal(isHookEqual(first, { ...first, if: 'Bash(npm *)' }), false)
  assert.equal(getHookDisplayText(first), 'github/search')

  const view = sourceFiles.get('src/components/hooks/ViewHookMode.tsx')
  const getContentFieldLabel = evaluateDeclaration(
    ts,
    view,
    findDeclaration(ts, view, 'getContentFieldLabel'),
    [],
    [],
  )
  const getContentFieldValue = evaluateDeclaration(
    ts,
    view,
    findDeclaration(ts, view, 'getContentFieldValue'),
    [],
    [],
  )
  assert.equal(getContentFieldLabel(first), 'MCP tool')
  assert.equal(getContentFieldValue(first), 'github/search')
})

test('MCP-tool hook replay rejects mixed and mutated source states', t => {
  const { temporary, temporarySource } = materializeRawSource()
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const first = fixture.inputs.sourceFiles[0]
  const firstPath = path.join(temporarySource, first.path.replace(/^src\//, ''))
  const recovered = fs
    .readFileSync(firstPath, 'utf8')
    .replace(
      "import { DEFAULT_HOOK_SHELL } from '../shell/shellProvider.js'\n",
      "import { DEFAULT_HOOK_SHELL } from '../shell/shellProvider.js'\nimport { jsonStringify } from '../slowOperations.js'\n",
    )
  fs.writeFileSync(firstPath, recovered)
  assert.throws(
    () =>
      applyTarget118McpToolHookSourceRecovery({
        sourceRoot: temporarySource,
      }),
    /all-raw or all-recovered source state/,
  )
})

test('Target118 coverage binds all MCP-tool hook units to replay evidence', () => {
  const coverage = readCoverage()
  const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
  for (const expected of TARGET118_MCP_TOOL_HOOK_OWNER_OVERRIDES) {
    const row = coverage.rows.find(row => row.targetIndex === expected.targetIndex)
    assert(row, `u${expected.targetIndex}`)
    assert.equal(row.disposition, 'source-runtime-covered')
    assert.deepEqual(row.ownerIds.map(id => owners.get(id)), [...expected.paths])
    assert.deepEqual(row.evidenceIds, [...expected.evidenceIds])
    assert.equal(row.behavior, expected.behavior)
  }
})
