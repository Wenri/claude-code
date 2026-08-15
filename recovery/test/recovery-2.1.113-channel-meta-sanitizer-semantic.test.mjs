import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.112-to-2.1.113'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_112_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const unit = {
  index: 15783,
  nodeType: 'FunctionDeclaration',
  start: 9963392,
  end: 9963720,
  sourceHash:
    '79d549d92d5e0c4223ba074774b423d34a25f5c7b044bd8c54a5376f05a20c51',
}
const typedRows = [
  ["[channel] ", 9963489, 9963499],
  [': dropped ', 9963503, 9963513],
  [" meta key(s) that don't match ", 9963524, 9963554],
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

async function instantiateChannelNotification() {
  const ts = await loadTypeScript()
  const owner = fs.readFileSync(
    path.join(sourceRoot, 'services/mcp/channelNotification.ts'),
    'utf8',
  )
  const javascript = ts.transpileModule(owner, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const state = { debug: [] }
  const module = { exports: {} }
  const partition = (values, predicate) => {
    const accepted = []
    const rejected = []
    for (const value of values) {
      ;(predicate(value) ? accepted : rejected).push(value)
    }
    return [accepted, rejected]
  }
  const requireStub = specifier => {
    if (specifier === 'lodash-es/partition.js') {
      return { __esModule: true, default: partition }
    }
    if (specifier === 'zod/v4') return { z: {} }
    if (specifier.endsWith('/bootstrap/state.js')) {
      return { getAllowedChannels: () => [] }
    }
    if (specifier.endsWith('/constants/xml.js')) return { CHANNEL_TAG: 'channel' }
    if (specifier.endsWith('/utils/auth.js')) {
      return {
        getClaudeAIOAuthTokens: () => undefined,
        getSubscriptionType: () => 'individual',
      }
    }
    if (specifier.endsWith('/utils/debug.js')) {
      return {
        logForDebugging(message, options) {
          state.debug.push({ message, options })
        },
      }
    }
    if (specifier.endsWith('/utils/lazySchema.js')) {
      return { lazySchema: () => () => undefined }
    }
    if (specifier.endsWith('/utils/plugins/pluginIdentifier.js')) {
      return { parsePluginIdentifier: () => null }
    }
    if (specifier.endsWith('/utils/settings/settings.js')) {
      return { getSettingsForSource: () => undefined }
    }
    if (specifier.endsWith('/utils/xml.js')) {
      return {
        escapeXmlAttr: value =>
          String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;'),
      }
    }
    if (specifier.endsWith('/channelAllowlist.js')) {
      return {
        getChannelAllowlist: () => [],
        isChannelsEnabled: () => false,
      }
    }
    throw new Error(`unexpected channelNotification import: ${specifier}`)
  }
  new Function('exports', 'module', 'require', javascript)(
    module.exports,
    module,
    requireStub,
  )
  return { ...module.exports, state }
}

test(
  'target113 authenticates the channel metadata rejection diagnostic',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath || !latestPath
        ? 'authenticated target112, target113, and target116 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(baselineBytes),
      'bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f',
    )
    assert.equal(
      sha256(targetBytes),
      '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba',
    )
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const latest = latestBytes.toString('utf8')
    const region = structural.regions[unit.index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [
        region.target.nodeType,
        region.target.start,
        region.target.end,
        region.target.sourceHash,
      ],
      [unit.nodeType, unit.start, unit.end, unit.sourceHash],
    )
    assert.equal(sha256(target.slice(unit.start, unit.end)), unit.sourceHash)
    for (const [value, start, end] of typedRows) {
      assert.equal(target.slice(start, end), value)
      assert.equal(target.split(value).length - 1, 1)
      assert.equal(baseline.split(value).length - 1, 0)
      assert.equal(latest.split(value).length - 1, 1)
    }
  },
)

test(
  'source drops unsafe metadata and reports every rejected key in order',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const { wrapChannelMessage, state } =
      await instantiateChannelNotification()
    assert.equal(
      wrapChannelMessage('slack&bot', 'hello', {
        user: 'alice',
        'x-y': 'ignored',
        'bad key': 'ignored',
        thread_id: '7',
      }),
      '<channel source="slack&amp;bot" user="alice" thread_id="7">\nhello\n</channel>',
    )
    assert.deepEqual(state.debug, [
      {
        message:
          "[channel] slack&bot: dropped 2 meta key(s) that don't match ^[a-zA-Z_][a-zA-Z0-9_]*$: x-y, bad key",
        options: { level: 'warn' },
      },
    ])

    state.debug.length = 0
    assert.equal(
      wrapChannelMessage('safe', 'ok', { user: 'bob' }),
      '<channel source="safe" user="bob">\nok\n</channel>',
    )
    assert.deepEqual(state.debug, [])
  },
)
