import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath || !latestPath
      ? 'authenticated 2.1.104, 2.1.105, and 2.1.116 bundles are required'
      : false,
}

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
const unit = [
  12853,
  9797906,
  9798963,
  'FunctionDeclaration',
  '2cea20c20a18468142e7e3f4b483b622b8866a086132c26556a41e2826723334',
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
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

test(
  'authenticated target105 adds MCP nonblocking state to tool-search decisions',
  bundleOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(baselineBytes),
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    )
    assert.equal(
      sha256(targetBytes),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )

    const [index, start, end, nodeType, hash] = unit
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.sourceHash,
      ],
      [start, end, nodeType, hash],
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const latest = latestBytes.toString('utf8')
    assert.equal(sha256(target.slice(start, end)), hash)
    assert.equal(occurrences(target.slice(start, end), 'mcpNonBlocking'), 1)
    assert.equal(occurrences(baseline, 'mcpNonBlocking'), 0)
    assert.equal(occurrences(target, 'mcpNonBlocking'), 2)
    assert.equal(occurrences(latest, 'mcpNonBlocking'), 2)
  },
)

test(
  'source logs the live MCP connection mode in every tool-search decision',
  sourceOptions,
  async () => {
    const owner = fs.readFileSync(path.join(sourceRoot, 'utils/toolSearch.ts'), 'utf8')
    const ts = await loadTypeScript()
    const parsed = ts.createSourceFile(
      'toolSearch.ts',
      owner,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    const declaration = parsed.statements.find(
      node =>
        ts.isFunctionDeclaration(node) &&
        node.name?.text === 'isToolSearchEnabled',
    )
    assert.ok(declaration)
    const body = declaration.getText(parsed)
    assert.equal(occurrences(body, 'mcpNonBlocking'), 1)
    assert.match(
      body,
      /mcpNonBlocking:\s*isEnvTruthy\(process\.env\.MCP_CONNECTION_NONBLOCKING\)/,
    )
    assert.ok(
      body.indexOf('mcpNonBlocking:') < body.indexOf('model_unsupported'),
      'the field must live in the shared decision logger before every return branch',
    )
  },
)
