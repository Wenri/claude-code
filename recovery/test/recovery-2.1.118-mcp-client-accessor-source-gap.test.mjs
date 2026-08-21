import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  applyTarget118McpClientAccessorSourceRecovery,
  TARGET118_MCP_CLIENT_ACCESSOR_INPUT_FILES,
  TARGET118_MCP_CLIENT_ACCESSOR_OUTPUT_FILES,
  TARGET118_MCP_CLIENT_ACCESSOR_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/replay-mcp-client-accessor-source-gap.mjs'

const root = process.cwd()
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      'recovery/test/recovery-2.1.118-mcp-client-accessor-source-gap.json',
    ),
    'utf8',
  ),
)

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

function materializeRawSource() {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target118-mcp-client-accessor-'),
  )
  const sourceRoot = path.join(temporary, 'src')
  for (const source of fixture.inputs.sourceFiles) {
    const relative = source.path.replace(/^src\//, '')
    const result = spawnSync(
      'git',
      ['show', `bd846a24e3886322888f02b9f747c132a4a32314:${source.path}`],
      { cwd: root, encoding: null },
    )
    assert.equal(result.status, 0, result.stderr?.toString())
    assert.deepEqual(descriptor(result.stdout), source.input)
    const filename = path.join(sourceRoot, relative)
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, result.stdout)
  }
  return { temporary, sourceRoot }
}

function sourceFile(ts, filename) {
  const value = fs.readFileSync(filename, 'utf8')
  const parsed = ts.createSourceFile(
    filename,
    value,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(parsed.parseDiagnostics.length, 0, filename)
  return parsed
}

function functionDeclaration(ts, parsed, name) {
  const declarations = parsed.statements.filter(
    statement =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  )
  assert.equal(declarations.length, 1, `${parsed.fileName}:${name}`)
  return declarations[0]
}

test('Target118 MCP-client accessor fixture freezes the complete bounded replay', () => {
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.117-to-2.1.118')
  assert.equal(fixture.summary.units, 1)
  assert.equal(fixture.summary.residues, 7)
  assert.equal(
    sha256(JSON.stringify([fixture.row.targetIndex])),
    fixture.summary.indicesSha256,
  )
  assert.equal(
    sha256(JSON.stringify(fixture.row.residues)),
    fixture.summary.residueIdentitiesSha256,
  )
  assert.deepEqual(
    TARGET118_MCP_CLIENT_ACCESSOR_INPUT_FILES,
    fixture.inputs.sourceFiles.map(file => ({ path: file.path, ...file.input })),
  )
  assert.deepEqual(
    TARGET118_MCP_CLIENT_ACCESSOR_OUTPUT_FILES,
    fixture.inputs.sourceFiles.map(file => ({ path: file.path, ...file.output })),
  )
  assert.deepEqual(
    TARGET118_MCP_CLIENT_ACCESSOR_OWNER_OVERRIDES.map(row => ({
      targetIndex: row.targetIndex,
      paths: [...row.paths],
      evidenceIds: [...row.evidenceIds],
    })),
    [
      {
        targetIndex: fixture.row.targetIndex,
        paths: [fixture.row.ownerPath],
        evidenceIds: fixture.row.evidenceIds,
      },
    ],
  )
})

test('authenticated Target118 bundle pins the export registry and full accessor call path', () => {
  const bundlePath = path.join(root, fixture.inputs.targetBundle.path)
  if (!fs.existsSync(bundlePath)) {
    return test.skip('authenticated Target118 bundle is unavailable')
  }
  const bundle = fs.readFileSync(bundlePath)
  assert.deepEqual(descriptor(bundle), {
    bytes: fixture.inputs.targetBundle.bytes,
    sha256: fixture.inputs.targetBundle.sha256,
  })
  const ledgerPath = path.join(root, fixture.inputs.structuralLedger.path)
  const ledgerBytes = fs.readFileSync(ledgerPath)
  assert.deepEqual(descriptor(ledgerBytes), {
    bytes: fixture.inputs.structuralLedger.bytes,
    sha256: fixture.inputs.structuralLedger.sha256,
  })
  const structural = JSON.parse(gunzipSync(ledgerBytes))
  const targetText = bundle.toString()
  const targetRegion = structural.regions.find(
    region => region.target.index === fixture.row.targetIndex,
  )
  assert(targetRegion)
  assert.equal(targetRegion.classification, 'unresolved')
  assert.deepEqual(
    {
      nodeType: targetRegion.target.nodeType,
      start: targetRegion.target.start,
      end: targetRegion.target.end,
      bytes: targetRegion.target.end - targetRegion.target.start,
      sourceHash: targetRegion.target.sourceHash,
    },
    fixture.row.target,
  )
  assert.deepEqual(
    descriptor(bundle.subarray(fixture.row.target.start, fixture.row.target.end)),
    { bytes: fixture.row.target.bytes, sha256: fixture.row.target.sourceHash },
  )
  for (const [kind, value, start, end] of fixture.row.residues) {
    assert.equal(kind, 'property')
    assert(start >= fixture.row.target.start && end <= fixture.row.target.end)
    assert.equal(targetText.slice(start, end), value)
  }
  for (const [index, nodeType, start, end, sourceHash, marker] of
    fixture.supportingTargetUnits) {
    const region = structural.regions.find(item => item.target.index === index)
    assert(region, `u${index}`)
    assert.equal(region.target.nodeType, nodeType)
    assert.equal(region.target.start, start)
    assert.equal(region.target.end, end)
    assert.equal(region.target.sourceHash, sourceHash)
    const slice = bundle.subarray(start, end)
    assert.deepEqual(descriptor(slice), {
      bytes: end - start,
      sha256: sourceHash,
    })
    assert(slice.toString().includes(marker), `u${index}: ${marker}`)
  }
})

test('MCP-client accessor replay is atomic, idempotent, typed, and executable', async t => {
  const ts = await loadTypeScript()
  const { temporary, sourceRoot } = materializeRawSource()
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  assert.deepEqual(
    applyTarget118McpClientAccessorSourceRecovery({ sourceRoot }),
    {
      status: 'recovered',
      files: fixture.inputs.sourceFiles.map(file => file.path),
    },
  )
  assert.deepEqual(
    applyTarget118McpClientAccessorSourceRecovery({ sourceRoot }),
    { status: 'already-recovered', files: [] },
  )

  const parsed = new Map()
  for (const source of fixture.inputs.sourceFiles) {
    const filename = path.join(sourceRoot, source.path.replace(/^src\//, ''))
    assert.deepEqual(descriptor(fs.readFileSync(filename)), source.output)
    parsed.set(source.path, sourceFile(ts, filename))
  }

  for (const [relative, names] of Object.entries(fixture.sourceDeclarations)) {
    for (const name of names) functionDeclaration(ts, parsed.get(relative), name)
  }

  const bootstrap = parsed.get('src/bootstrap/state.ts')
  const bootstrapText = bootstrap.text
  assert.match(
    bootstrapText,
    /let mcpClientsAccessor: \(\(\) => MCPServerConnection\[\]\) \| undefined/,
  )
  const accessorSource = [
    bootstrapText.match(
      /let mcpClientsAccessor:[^\n]+\n/,
    )?.[0],
    ...['setMcpClientsAccessor', 'getMcpClientsFromAccessor'].map(name => {
      const declaration = functionDeclaration(ts, bootstrap, name)
      return bootstrapText
        .slice(declaration.getStart(bootstrap), declaration.end)
        .replace(/^export\s+/, '')
    }),
  ].join('\n')
  const accessorJavascript = ts.transpileModule(accessorSource, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const accessor = new Function(
    `${accessorJavascript}\nreturn { setMcpClientsAccessor, getMcpClientsFromAccessor }`,
  )()
  assert.equal(accessor.getMcpClientsFromAccessor(), undefined)
  const clients = [{ name: 'github' }, { name: 'linear' }]
  accessor.setMcpClientsAccessor(() => clients)
  assert.equal(accessor.getMcpClientsFromAccessor(), clients)
  accessor.setMcpClientsAccessor(undefined)
  assert.equal(accessor.getMcpClientsFromAccessor(), undefined)

  assert.match(
    parsed.get('src/state/AppState.tsx').text,
    /setMcpClientsAccessor\(\(\) => store\.getState\(\)\.mcp\.clients\);[\s\S]*return \(\) => setMcpClientsAccessor\(undefined\);[\s\S]*\}, \[store\]\);/,
  )
  assert.match(
    parsed.get('src/utils/hooks/execMcpToolHook.ts').text,
    /const availableClients = clients \?\? getMcpClientsFromAccessor\(\)[\s\S]*if \(availableClients === undefined\)[\s\S]*availableClients\.find\(/,
  )
  assert.match(
    parsed.get('src/cli/print.ts').text,
    /setMcpClientsAccessor\(\(\) => \[[\s\S]*\.\.\.getAppState\(\)\.mcp\.clients,[\s\S]*\.\.\.sdkClients,[\s\S]*\.\.\.dynamicMcpState\.clients,[\s\S]*\]\)/,
  )
})

test('MCP-client accessor replay rejects mixed and mutated source states', () => {
  const { temporary, sourceRoot } = materializeRawSource()
  try {
    const statePath = path.join(sourceRoot, 'bootstrap/state.ts')
    fs.appendFileSync(statePath, '\n// mutation\n')
    assert.throws(
      () => applyTarget118McpClientAccessorSourceRecovery({ sourceRoot }),
      /requires one exact all-raw or all-recovered source state/,
    )
    for (const source of fixture.inputs.sourceFiles.slice(1)) {
      const filename = path.join(
        sourceRoot,
        source.path.replace(/^src\//, ''),
      )
      assert.deepEqual(descriptor(fs.readFileSync(filename)), source.input)
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
})

test('Target118 MCP-client accessor coverage is provisional or completely corrected', () => {
  const coverage = JSON.parse(
    gunzipSync(
      fs.readFileSync(
        path.join(
          root,
          'recovery/cases/2.1.117-to-2.1.118/semantic/source-coverage.json.gz',
        ),
      ),
    ),
  )
  const row = coverage.rows.find(
    candidate => candidate.targetIndex === fixture.row.targetIndex,
  )
  assert(row)
  const provisional =
    row.ownerIds.length === 1 &&
    row.ownerIds[0] === 'owner-src-bootstrap-state-ts' &&
    row.evidenceIds.length === 2 &&
    row.evidenceIds.includes('source-map-attribution') &&
    row.evidenceIds.includes('semantic-test')
  const corrected =
    row.ownerIds.length === 1 &&
    row.ownerIds[0] === 'owner-src-bootstrap-state-ts' &&
    fixture.row.evidenceIds.every(id => row.evidenceIds.includes(id))
  assert(provisional || corrected)
})
