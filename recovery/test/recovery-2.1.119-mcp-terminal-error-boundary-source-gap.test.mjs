import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  applyTarget119McpTerminalErrorBoundarySourceRecovery,
  buildTarget119McpTerminalErrorBoundaryOutput,
  TARGET119_MCP_TERMINAL_ERROR_BOUNDARY_INPUT_FILE,
  TARGET119_MCP_TERMINAL_ERROR_BOUNDARY_OUTPUT_FILE,
  TARGET119_MCP_TERMINAL_ERROR_BOUNDARY_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/replay-mcp-terminal-error-boundary-source-gap.mjs'

const root = process.cwd()
const caseName = '2.1.118-to-2.1.119'
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-mcp-terminal-error-boundary-source-gap.json',
)
const fixture = JSON.parse(fs.readFileSync(fixturePath))
const artifactRoot = path.join(root, '.recovery-tmp/authenticated-artifacts')
const selectedSourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src'),
)

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

let typescriptPromise
function loadTypeScript() {
  typescriptPromise ??= import(
    pathToFileURL(
      path.join(
        root,
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      ),
    ).href,
  ).then(imported => imported.default ?? imported)
  return typescriptPromise
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), {
    bytes: expected.bytes,
    sha256: expected.sha256,
  }, label)
  return bytes
}

function rawSource() {
  const result = spawnSync(
    'git',
    ['show', `${fixture.sourceCommit}:${fixture.sourceFile.path}`],
    { cwd: root, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), fixture.sourceFile.input)
  return result.stdout.toString('utf8')
}

function materialize(source) {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target119-mcp-terminal-error-'),
  )
  const sourceRoot = path.join(temporary, 'src')
  const filename = path.join(
    sourceRoot,
    fixture.sourceFile.path.replace(/^src\//, ''),
  )
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, source)
  return { temporary, sourceRoot, filename }
}

function sourcePredicate(ts, text) {
  const parsed = ts.createSourceFile(
    'client.ts',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(parsed.parseDiagnostics.length, 0)
  const hits = []
  const callers = []
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(parsed) === 'isTerminalConnectionError'
    ) {
      const declaration = node.parent.parent
      const start = declaration.getStart(parsed)
      const end = declaration.end
      hits.push({ node, start, end, text: text.slice(start, end) })
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(parsed) === 'isTerminalConnectionError'
    ) {
      callers.push(node.arguments.map(argument => argument.getText(parsed)))
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  assert.equal(hits.length, 1)
  assert.deepEqual(callers, [['error']])
  const hit = hits[0]
  const expected = fixture.sourceFile.outputDeclaration
  assert.deepEqual(
    { start: hit.start, end: hit.end, ...descriptor(hit.text) },
    {
      start: expected.start,
      end: expected.end,
      bytes: expected.bytes,
      sha256: expected.sha256,
    },
  )
  const initializer = hit.node.initializer.getText(parsed)
  const javascript = ts.transpileModule(`const predicate = ${initializer}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText
  return Function(`${javascript}; return predicate`)()
}

function targetPredicate(text) {
  return Function(`return (${text.replace(/^function [^(]+/, 'function')})`)()
}

test('Target119 MCP terminal-error fixture, override, and coverage are atomic', () => {
  assert.equal(fixture.case, caseName)
  assert.deepEqual(TARGET119_MCP_TERMINAL_ERROR_BOUNDARY_INPUT_FILE, {
    path: fixture.sourceFile.path,
    ...fixture.sourceFile.input,
  })
  assert.deepEqual(TARGET119_MCP_TERMINAL_ERROR_BOUNDARY_OUTPUT_FILE, {
    path: fixture.sourceFile.path,
    ...fixture.sourceFile.output,
  })
  assert.equal(
    sha256(JSON.stringify([fixture.targetUnit.targetIndex])),
    fixture.summary.targetIndicesSha256,
  )
  assert.equal(
    sha256(JSON.stringify([fixture.residue.identity])),
    fixture.summary.residueIdentitiesSha256,
  )
  assert.equal(fixture.residue.sha256, fixture.summary.residueIdentitiesSha256)

  const coverage = JSON.parse(
    gunzipSync(
      fs.readFileSync(
        path.join(
          root,
          'recovery/cases/2.1.118-to-2.1.119/semantic/source-coverage.json.gz',
        ),
      ),
    ),
  )
  const row = coverage.rows.find(
    candidate => candidate.targetIndex === fixture.targetUnit.targetIndex,
  )
  assert(row)
  const ownerPaths = row.ownerIds.map(ownerId => {
    const owner = coverage.owners.find(candidate => candidate.id === ownerId)
    assert(owner)
    return owner.path
  })
  const exact = TARGET119_MCP_TERMINAL_ERROR_BOUNDARY_OWNER_OVERRIDES[0]
  if (row.evidenceIds.includes(exact.evidenceIds[0])) {
    assert.deepEqual(ownerPaths, exact.paths)
    assert.deepEqual(row.evidenceIds, exact.evidenceIds)
    assert.equal(row.behavior, exact.behavior)
  } else {
    assert.deepEqual(ownerPaths, ['src/services/mcp/client.ts'])
    assert(!row.evidenceIds.some(id => exact.evidenceIds.includes(id)))
  }
})

test('authenticated Target119 unit contains the exact terminal predicate', () => {
  const bundle = readExact(
    path.join(artifactRoot, fixture.inputs.targetBundle.artifact),
    fixture.inputs.targetBundle,
    'Target119 inner bundle',
  ).toString('utf8')
  const structural = JSON.parse(
    gunzipSync(
      readExact(
        path.join(root, fixture.inputs.structural.path),
        fixture.inputs.structural,
        'Target119 structural delta',
      ),
    ),
  )
  const region = structural.regions.find(
    candidate => candidate.target.index === fixture.targetUnit.targetIndex,
  )
  assert(region)
  assert.deepEqual(
    {
      nodeType: region.target.nodeType,
      start: region.target.start,
      end: region.target.end,
      sourceHash: region.target.sourceHash,
      coarseHash: region.target.coarseHash,
    },
    {
      nodeType: fixture.targetUnit.nodeType,
      start: fixture.targetUnit.start,
      end: fixture.targetUnit.end,
      sourceHash: fixture.targetUnit.sourceHash,
      coarseHash: fixture.targetUnit.coarseHash,
    },
  )
  const unit = bundle.slice(fixture.targetUnit.start, fixture.targetUnit.end)
  assert.deepEqual(descriptor(unit), {
    bytes: fixture.targetUnit.bytes,
    sha256: fixture.targetUnit.sourceHash,
  })
  const ast = parse(unit, { ecmaVersion: 'latest', sourceType: 'module' })
  assert.equal(ast.body.length, 1)
  assert.equal(ast.body[0].type, 'FunctionDeclaration')
  assert.match(unit, /name==="AbortError"/)
  assert.match(unit, /\/\\bterminated\\b\/\.test\(/)
  assert.match(unit, /SSE stream disconnected/)
  assert.match(unit, /Failed to reconnect SSE stream/)
})

test('bounded source replay is exact, idempotent, and fail closed', () => {
  const input = rawSource()
  const expected = buildTarget119McpTerminalErrorBoundaryOutput(input)
  assert.deepEqual(descriptor(expected), fixture.sourceFile.output)
  const state = materialize(input)
  try {
    assert.deepEqual(
      applyTarget119McpTerminalErrorBoundarySourceRecovery({
        sourceRoot: state.sourceRoot,
      }),
      { status: 'recovered', files: [fixture.sourceFile.path] },
    )
    assert.deepEqual(descriptor(fs.readFileSync(state.filename)), fixture.sourceFile.output)
    assert.deepEqual(
      applyTarget119McpTerminalErrorBoundarySourceRecovery({
        sourceRoot: state.sourceRoot,
      }),
      { status: 'already-recovered', files: [] },
    )
    fs.appendFileSync(state.filename, '\n// drift')
    assert.throws(
      () =>
        applyTarget119McpTerminalErrorBoundarySourceRecovery({
          sourceRoot: state.sourceRoot,
        }),
      /requires its exact raw or recovered source state/,
    )
  } finally {
    fs.rmSync(state.temporary, { recursive: true, force: true })
  }
})

test('source AST and executable behavior match the authenticated predicate', async () => {
  const ts = await loadTypeScript()
  const input = rawSource()
  const output = buildTarget119McpTerminalErrorBoundaryOutput(input)
  const selected = fs.readFileSync(
    path.join(
      selectedSourceRoot,
      fixture.sourceFile.path.replace(/^src\//, ''),
    ),
  )
  assert(
    [fixture.sourceFile.input.sha256, fixture.sourceFile.output.sha256].includes(
      sha256(selected),
    ),
  )
  const source = sourcePredicate(ts, output)
  const bundle = fs
    .readFileSync(
      path.join(artifactRoot, fixture.inputs.targetBundle.artifact),
      'utf8',
    )
    .slice(fixture.targetUnit.start, fixture.targetUnit.end)
  const target = targetPredicate(bundle)
  const scenarios = [
    { name: 'AbortError', message: 'anything', expected: true },
    { name: 'Error', message: 'ECONNRESET', expected: true },
    { name: 'Error', message: 'Body Timeout Error', expected: true },
    { name: 'Error', message: 'server terminated', expected: true },
    { name: 'Error', message: 'unterminated stream', expected: false },
    { name: 'Error', message: 'terminatedly', expected: false },
    { name: 'Error', message: 'SSE stream disconnected', expected: true },
    { name: 'Error', message: 'Failed to reconnect SSE stream', expected: true },
    { name: 'Error', message: 'random failure', expected: false },
  ]
  for (const scenario of scenarios) {
    assert.equal(source(scenario), scenario.expected)
    assert.equal(target(scenario), scenario.expected)
  }
})
