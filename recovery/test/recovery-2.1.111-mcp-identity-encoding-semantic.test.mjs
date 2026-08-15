import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.110-to-2.1.111'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_111_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE

const BASELINE_SHA256 =
  'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861'
const TARGET_SHA256 =
  '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0'
const LATEST_SHA256 = new Set([
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
  '06cb80193f3af8bb468d1536b230b0e2f854a398b1e88af3c79048ce821bf193',
])

const baselineUnit = {
  index: 13_283,
  start: 9_771_883,
  end: 9_790_311,
  nodeType: 'VariableDeclaration',
  sourceHash:
    'b06b080f01e6aa9ec1cfa2c9b3cfef160ffb5103669e37cf706c29269e92bc4a',
}
const targetUnit = {
  index: 13_337,
  start: 9_788_964,
  end: 9_807_573,
  nodeType: 'VariableDeclaration',
  sourceHash:
    'c18c1e67ad89b2a59ddc1c16ff64efeb0eb06349521efae4a8ebf6b7acf8bb68',
}
const identityHeader = '"Accept-Encoding":"identity"'
const identityHeaderRanges = [
  [9_789_949, 9_789_977],
  [9_790_165, 9_790_193],
  [9_790_465, 9_790_493],
  [9_790_603, 9_790_631],
  [9_792_144, 9_792_172],
  [9_792_954, 9_792_982],
]

const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(value, needle) {
  return value.split(needle).length - 1
}

function unitIdentity(unit) {
  return [unit.index, unit.start, unit.end, unit.nodeType, unit.sourceHash]
}

function branch(source, start, end) {
  const branchStart = source.indexOf(start)
  assert.notEqual(branchStart, -1, `missing branch ${start}`)
  const branchEnd = source.indexOf(end, branchStart)
  assert.notEqual(branchEnd, -1, `missing branch boundary ${end}`)
  return source.slice(branchStart, branchEnd)
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
  const loaded = await import(pathToFileURL(candidate).href)
  return loaded.default ?? loaded
}

test(
  'target111 adds identity encoding to all six HTTP-backed MCP transport edges',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.110 and 2.1.111 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(sha256(baselineBytes), BASELINE_SHA256)
    assert.equal(sha256(targetBytes), TARGET_SHA256)

    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const baselineSlice = baseline.slice(baselineUnit.start, baselineUnit.end)
    const targetSlice = target.slice(targetUnit.start, targetUnit.end)
    assert.equal(sha256(baselineSlice), baselineUnit.sourceHash)
    assert.equal(sha256(targetSlice), targetUnit.sourceHash)
    assert.equal(occurrences(baselineSlice, identityHeader), 0)
    assert.equal(occurrences(targetSlice, identityHeader), 6)
    assert.equal(occurrences(baseline, identityHeader), 0)
    assert.equal(occurrences(target, identityHeader), 6)

    const region = structural.regions[targetUnit.index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(unitIdentity(region.target), unitIdentity(targetUnit))
    assert.ok(
      structural.unmatchedBaseline.some(
        unit =>
          unit.index === baselineUnit.index &&
          unit.start === baselineUnit.start &&
          unit.end === baselineUnit.end &&
          unit.sourceHash === baselineUnit.sourceHash,
      ),
    )

    for (const [start, end] of identityHeaderRanges) {
      assert.equal(target.slice(start, end), identityHeader)
      assert.ok(start >= targetUnit.start && end <= targetUnit.end)
    }

    if (latestPath) {
      const latestBytes = fs.readFileSync(latestPath)
      assert.ok(LATEST_SHA256.has(sha256(latestBytes)))
      assert.equal(
        occurrences(latestBytes.toString('utf8'), identityHeader),
        6,
      )
    }
  },
)

test(
  'MCP source sends identity encoding on SSE, SSE-IDE, HTTP, and Claude.ai proxy requests',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const owner = fs.readFileSync(
      path.join(sourceRoot, 'services/mcp/client.ts'),
      'utf8',
    )
    assert.equal(occurrences(owner, "'Accept-Encoding': 'identity'"), 6)

    const sse = branch(
      owner,
      "if (serverRef.type === 'sse')",
      "else if (serverRef.type === 'sse-ide')",
    )
    const sseIde = branch(
      owner,
      "else if (serverRef.type === 'sse-ide')",
      "else if (serverRef.type === 'ws-ide')",
    )
    const http = branch(
      owner,
      "else if (serverRef.type === 'http')",
      "else if (serverRef.type === 'sdk')",
    )
    const claudeAi = branch(
      owner,
      "else if (serverRef.type === 'claudeai-proxy')",
      "else if (\n        (serverRef.type === 'stdio'",
    )
    assert.equal(occurrences(sse, "'Accept-Encoding': 'identity'"), 2)
    assert.equal(occurrences(sseIde, "'Accept-Encoding': 'identity'"), 2)
    assert.equal(occurrences(http, "'Accept-Encoding': 'identity'"), 1)
    assert.equal(occurrences(claudeAi, "'Accept-Encoding': 'identity'"), 1)
    assert.match(
      sse,
      /'Accept-Encoding': 'identity',[\s\S]*\.\.\.combinedHeaders/,
    )
    assert.match(
      sse,
      /'Accept-Encoding': 'identity',[\s\S]*\.\.\.authHeaders,[\s\S]*\.\.\.init\?\.headers,[\s\S]*\.\.\.combinedHeaders/,
    )
    assert.match(
      http,
      /'Accept-Encoding': 'identity',[\s\S]*Authorization:[\s\S]*\.\.\.combinedHeaders/,
    )
    assert.match(
      claudeAi,
      /'Accept-Encoding': 'identity',[\s\S]*'X-Mcp-Client-Session-Id'/,
    )

    const ts = await loadTypeScript()
    const ast = ts.createSourceFile(
      'client.ts',
      owner,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    const identityProperties = []
    function visit(node) {
      if (
        ts.isPropertyAssignment(node) &&
        ts.isStringLiteral(node.name) &&
        node.name.text === 'Accept-Encoding'
      ) {
        assert.ok(ts.isStringLiteral(node.initializer))
        assert.equal(node.initializer.text, 'identity')
        identityProperties.push(node)
      }
      ts.forEachChild(node, visit)
    }
    visit(ast)
    assert.equal(identityProperties.length, 6)

    const transpiled = ts.transpileModule(owner, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: 'client.ts',
      reportDiagnostics: true,
    })
    const errors = (transpiled.diagnostics ?? []).filter(
      diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
    )
    assert.deepEqual(
      errors.map(error =>
        ts.flattenDiagnosticMessageText(error.messageText, '\n'),
      ),
      [],
    )
  },
)
