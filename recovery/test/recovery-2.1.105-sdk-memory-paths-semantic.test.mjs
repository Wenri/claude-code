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

const units = new Map([
  [10235, [8299675, 8335567, 'c7c382e007d7cffc57ad1927e2c4caf70af1cf012a0b70a467df10472563703b']],
  [16951, [12066443, 12067514, '7f12ff7d1ca5f64d5c3c4f784b64d78c80c900d94a41ef8c459eef658de76c44']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function functionSource(contents, name) {
  const start = contents.indexOf(`function ${name}(`)
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
  'target105 pins the SDK memory-path schema and init-message runtime',
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
    assert.equal((baseline.match(/memory_paths/g) ?? []).length, 0)
    assert.equal((target.match(/memory_paths/g) ?? []).length, 3)

    for (const [index, identity] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        identity,
        `${index}: identity`,
      )
      assert.equal(
        sha256(target.slice(identity[0], identity[1])),
        identity[2],
        `${index}: target bytes`,
      )
    }

    const schema = target.slice(8299675, 8335567)
    assert.match(schema, /memory_paths:.+auto:.+team:/)
    assert.ok(
      schema.includes(
        '@internal Absolute directory paths for the auto-memory and team-memory stores.',
      ),
    )
    const builder = target.slice(12066443, 12067514)
    assert.equal((builder.match(/memory_paths/g) ?? []).length, 2)
    assert.match(builder, /memory_paths=\{auto:.+\}/)
    assert.match(builder, /isTeamMemoryEnabled\(\).+memory_paths\.team=/)
  },
)

test(
  'source emits only enabled auto and team memory directories',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const schema = source('entrypoints/sdk/coreSchemas.ts')
    const init = source('utils/messages/systemInit.ts')
    for (const fragment of [
      'memory_paths: z',
      'auto: z.string().optional()',
      'team: z.string().optional()',
      '@internal Absolute directory paths for the auto-memory and team-memory stores.',
    ]) {
      assert.ok(schema.includes(fragment), fragment)
    }
    for (const fragment of [
      "import { getAutoMemPath, isAutoMemoryEnabled } from '../../memdir/paths.js'",
      'if (isAutoMemoryEnabled())',
      'initMessage.memory_paths = { auto: getAutoMemPath() }',
      "if (feature('TEAMMEM'))",
      "require('../../memdir/teamMemPaths.js')",
      'if (teamMemPaths.isTeamMemoryEnabled())',
      'initMessage.memory_paths.team = teamMemPaths.getTeamMemPath()',
    ]) {
      assert.ok(init.includes(fragment), fragment)
    }

    const ts = await loadTypeScript()
    const builder = functionSource(init, 'buildSystemInitMessage')
    const javascript = ts.transpileModule(
      `type SystemInitInputs = any; type SDKMessage = any; type ApiKeySource = any;\n` +
        `let autoEnabled = false; let teamFeature = false; let teamEnabled = false;\n` +
        `const feature = (name: string) => name === 'TEAMMEM' ? teamFeature : false;\n` +
        `const isAutoMemoryEnabled = () => autoEnabled;\n` +
        `const getAutoMemPath = () => '/memory/auto/';\n` +
        `const require = () => ({ isTeamMemoryEnabled: () => teamEnabled, getTeamMemPath: () => '/memory/auto/team/' });\n` +
        `const getSettings_DEPRECATED = () => undefined; const DEFAULT_OUTPUT_STYLE_NAME = 'default';\n` +
        `const getCwd = () => '/work'; const getSessionId = () => 'session';\n` +
        `const sdkCompatToolName = (name: string) => name;\n` +
        `const getAnthropicApiKeyWithSource = () => ({ source: 'none' }); const getSdkBetas = () => [];\n` +
        `const MACRO = { VERSION: '2.1.105' }; const randomUUID = () => 'uuid';\n` +
        `const getFastModeState = () => ({ type: 'off' });\n` +
        `const consumeRemoteStartupTiming = () => undefined;\n` +
        `${builder}\n` +
        `export { buildSystemInitMessage, setFlags };\n` +
        `function setFlags(auto: boolean, featureEnabled: boolean, team: boolean) { autoEnabled = auto; teamFeature = featureEnabled; teamEnabled = team; }`,
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText
    const module = { exports: {} }
    new Function('exports', 'module', javascript)(module.exports, module)
    const inputs = {
      tools: [],
      mcpClients: [],
      model: 'model',
      permissionMode: 'default',
      commands: [],
      agents: [],
      skills: [],
      plugins: [],
      pluginErrors: [],
      fastMode: false,
    }

    module.exports.setFlags(false, true, true)
    assert.equal(module.exports.buildSystemInitMessage(inputs).memory_paths, undefined)
    module.exports.setFlags(true, false, true)
    assert.deepEqual(module.exports.buildSystemInitMessage(inputs).memory_paths, {
      auto: '/memory/auto/',
    })
    module.exports.setFlags(true, true, true)
    assert.deepEqual(module.exports.buildSystemInitMessage(inputs).memory_paths, {
      auto: '/memory/auto/',
      team: '/memory/auto/team/',
    })
  },
)

test(
  'target116 retains exactly three SDK memory-path occurrences',
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
    assert.equal((latest.match(/memory_paths/g) ?? []).length, 3)
  },
)
