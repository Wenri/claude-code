import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
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
  13165,
  9930591,
  9930817,
  '15e7022a21d67496deb2649454771364655532cbc7d9411e9abcb07cbf1512b9',
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrenceCount(contents, value) {
  return contents.split(value).length - 1
}

function functionSource(contents, name) {
  const start = contents.indexOf(`function ${name}`)
  assert.notEqual(start, -1, `${name}: declaration`)
  const body = contents.indexOf('{', start)
  let depth = 0
  for (let index = body; index < contents.length; index++) {
    if (contents[index] === '{') depth++
    else if (contents[index] === '}' && --depth === 0) {
      return contents.slice(start, index + 1)
    }
  }
  throw new Error(`${name}: unterminated`)
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
  'target105 pins direct plugin-manifest version extraction',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.104 and 2.1.105 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    )
    assert.equal(
      sha256(targetBytes),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    assert.equal(
      occurrenceCount(baseline, 'Could not read version from manifest for'),
      1,
    )
    assert.equal(
      occurrenceCount(target, 'Could not extract version from manifest for'),
      1,
    )

    const [index, start, end, hash] = unit
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, hash],
    )
    const owner = target.slice(start, end)
    assert.equal(sha256(owner), hash)
    assert.match(owner, /\.claude-plugin/)
    assert.match(owner, /plugin\.json/)
    assert.match(owner, /\.version\|\|"unknown"/)
    assert.match(owner, /Could not extract version from manifest for/)
  },
)

test(
  'authored manager reads one canonical manifest and reports extraction failure',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const contents = fs.readFileSync(
      path.join(sourceRoot, 'utils/plugins/installedPluginsManager.ts'),
      'utf8',
    )
    const owner = functionSource(contents, 'getPluginVersionFromManifest')
    for (const fragment of [
      "join(pluginCachePath, '.claude-plugin', 'plugin.json')",
      "fs.readFileSync(manifestPath, { encoding: 'utf-8' })",
      "return manifest.version || 'unknown'",
      'Could not extract version from manifest for ${pluginId}',
    ]) {
      assert.ok(owner.includes(fragment), fragment)
    }
    assert.equal(owner.includes('getPluginManifestPaths'), false)

    const paths = []
    const logs = []
    const getFsImplementation = () => ({
      readFileSync(file) {
        paths.push(file)
        if (file.includes('broken')) throw new Error('bad manifest')
        return '{"version":"1.2.3"}'
      },
    })
    const join = (...parts) => parts.join('/')
    const jsonParse = JSON.parse
    const logForDebugging = message => logs.push(message)
    const ts = await loadTypeScript()
    const javascript = ts.transpileModule(
      `${owner}; export { getPluginVersionFromManifest };`,
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText
    const module = { exports: {} }
    new Function(
      'exports',
      'module',
      'getFsImplementation',
      'join',
      'jsonParse',
      'logForDebugging',
      javascript,
    )(
      module.exports,
      module,
      getFsImplementation,
      join,
      jsonParse,
      logForDebugging,
    )
    const getVersion = module.exports.getPluginVersionFromManifest

    assert.equal(getVersion('/cache/example', 'example@market'), '1.2.3')
    assert.deepEqual(paths, ['/cache/example/.claude-plugin/plugin.json'])
    assert.equal(getVersion('/broken', 'broken@market'), 'unknown')
    assert.equal(
      logs.at(-1),
      'Could not extract version from manifest for broken@market',
    )
  },
)

test(
  'target116 retains direct extraction while extending persisted version metadata',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !latestPath
        ? 'authenticated 2.1.116 structural bundle is required'
        : false,
  },
  () => {
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const latest = latestBytes.toString('utf8')
    assert.equal(
      occurrenceCount(latest, 'Could not extract version from manifest for'),
      1,
    )
    assert.equal(occurrenceCount(latest, 'resolvedVersion'), 12)
    const at = latest.indexOf('Could not extract version from manifest for')
    const graph = latest.slice(at - 500, at + 200)
    assert.match(graph, /\.claude-plugin/)
    assert.match(graph, /plugin\.json/)
    assert.match(graph, /\.version\|\|"unknown"/)
  },
)
