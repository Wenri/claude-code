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
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_112_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = { skip: selected ? false : `not applicable to ${semanticCase}` }
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath || !latestPath
      ? 'authenticated 2.1.112, 2.1.113, and 2.1.116 bundles are required'
      : false,
}

const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(repositoryRoot, 'recovery/cases', caseName, 'structural/generated-delta.json.gz'),
    ),
  ),
)

const units = new Map([
  [6481, ['unresolved', 2978675, 2979506, 'FunctionDeclaration', 'f8ec85dec8fbd7aff1a20f9ce3ddf405ca7b94e8bda479e2535591c765aae7eb']],
  [6519, ['unresolved', 2988846, 2990538, 'VariableDeclaration', 'e60294a5ee865c33790ad8cc91546f1fb3da06b751e938d4231e29e6304b1e2b']],
  [10828, ['unresolved', 6336164, 6338304, 'FunctionDeclaration', '43734352b446b9eaf0136d5244beff18f70e27964741014c552ca2aef3fb5e78']],
  [13251, ['unresolved', 8442833, 8446115, 'VariableDeclaration', '83309c401e34c473db99c5b407daddb9c2272ac0e52edd4e28b9320a16fcc44b']],
  [15273, ['unresolved', 9470366, 9500554, 'FunctionDeclaration', 'e91e4116c0cfc8d4227ae37cf3766da477c74a808f89986cd1b3e7d30e609181']],
  [16326, ['unresolved', 10320199, 10320823, 'FunctionDeclaration', '80adf7eb6e890da4abbde7e1bff0c1664176fe2d65d30d533e46a80936e8fb9e']],
  [16331, ['unresolved', 10321490, 10324675, 'FunctionDeclaration', 'd8a11c182d8be2d914f76c77c8c08075795617079dd397bc1926b8dc2afb97df']],
  [16335, ['unresolved', 10325317, 10325905, 'FunctionDeclaration', '5be9a2c96d08de19ef2f53ed2616a05edf2ab94e5a3c73577e390c804b70f977']],
  [16413, ['unresolved', 10368553, 10375746, 'VariableDeclaration', '598c6a2520405839b258f3eca81998dc2d657aa7547d097e58f368c3a998e7fc']],
  [20433, ['unresolved', 12922964, 12979569, 'FunctionDeclaration', '475117eb91b4cbe5aa8dc27e7049feead92c484e180afad7c5a31c4018f775e3']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

async function loadTypeScript() {
  const candidates = [
    path.resolve(path.dirname(process.execPath), '../lib/node_modules/typescript/lib/typescript.js'),
    path.join(repositoryRoot, '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js'),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate, 'the pinned TypeScript compiler must be available')
  const module = await import(pathToFileURL(candidate).href)
  return module.default ?? module
}

async function executeTimestampModule(contents) {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(contents, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText
  const module = { exports: {} }
  const React = {
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children }
    },
  }
  new Function('require', 'exports', 'module', javascript)(
    id => {
      if (id === 'react/compiler-runtime') return { c: size => new Array(size) }
      if (id === 'react') return { __esModule: true, default: React }
      if (id.endsWith('/stringWidth.js')) return { stringWidth: value => value.length }
      if (id.endsWith('/ink.js')) return { Box: 'Box', Text: 'Text' }
      throw new Error(`unexpected timestamp import: ${id}`)
    },
    module.exports,
    module,
  )
  return module.exports
}

function assistant(content, timestamp = '2026-04-17T18:18:28Z') {
  return {
    type: 'assistant',
    timestamp,
    message: { content },
  }
}

test('authenticated target113 pins the complete gated message-timestamp graph', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  const latestBytes = fs.readFileSync(latestPath)
  assert.equal(sha256(baselineBytes), 'bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f')
  assert.equal(sha256(targetBytes), '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba')
  assert.equal(sha256(latestBytes), 'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a')

  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')
  const latest = latestBytes.toString('utf8')
  for (const [index, [classification, start, end, nodeType, hash]] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, classification, `${index}: class`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.nodeType, region.target.sourceHash],
      [start, end, nodeType, hash],
      `${index}: identity`,
    )
    assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
  }

  assert.equal(occurrences(baseline, 'showMessageTimestamps'), 0)
  assert.equal(occurrences(target, 'showMessageTimestamps'), 26)
  assert.equal(occurrences(latest, 'showMessageTimestamps'), 26)
  for (const fragment of [
    'Show a timestamp above each assistant message',
    'Show message timestamps',
    'tengu_show_message_timestamps_setting_changed',
  ]) {
    assert.equal(occurrences(baseline, fragment), 0, `${fragment}: baseline`)
    assert.equal(occurrences(target, fragment), 1, `${fragment}: target`)
    assert.equal(occurrences(latest, fragment), 1, `${fragment}: latest`)
  }
  assert.ok(target.slice(10320199, 10320823).includes('showMessageTimestamps'))
  assert.ok(target.slice(10321490, 10324675).includes('showMessageTimestamps'))
  assert.ok(target.slice(10325317, 10325905).includes('showMessageTimestamps'))
  assert.ok(target.slice(10368553, 10375746).includes('tengu_silk_hinge'))
})

test('source root owns persistence, live setting updates, and the full rendering call graph', sourceOptions, () => {
  const config = source('utils/config.ts')
  const appState = source('state/AppStateStore.ts')
  const supported = source('tools/ConfigTool/supportedSettings.ts')
  const settings = source('components/Settings/Config.tsx')
  const timestamp = source('components/MessageTimestamp.tsx')
  const row = source('components/MessageRow.tsx')
  const messages = source('components/Messages.tsx')
  const main = source('main.tsx')

  assert.ok(config.includes('showMessageTimestamps: boolean'))
  assert.ok(config.includes('showMessageTimestamps: false'))
  assert.ok(config.includes("'showMessageTimestamps'"))
  assert.ok(appState.includes('showMessageTimestamps: boolean'))
  assert.ok(appState.includes('showMessageTimestamps: false'))
  assert.ok(supported.includes("| 'showMessageTimestamps'"))
  assert.ok(supported.includes("getFeatureValue_CACHED_MAY_BE_STALE('tengu_silk_hinge', false)"))
  assert.ok(supported.includes('Show a timestamp above each assistant message'))
  assert.ok(supported.includes("appStateKey: 'showMessageTimestamps'"))

  for (const fragment of [
    'showMessageTimestamps: s_4.showMessageTimestamps',
    "id: 'showMessageTimestamps'",
    "label: 'Show message timestamps'",
    'showMessageTimestamps\n      }));',
    'showMessageTimestamps\n      });',
    'showMessageTimestamps\n      }));\n      logEvent',
    "logEvent('tengu_show_message_timestamps_setting_changed'",
    'message timestamps`)',
    'showMessageTimestamps: ia.showMessageTimestamps',
  ]) assert.ok(settings.includes(fragment), `Settings/Config.tsx: ${fragment}`)

  assert.ok(timestamp.includes('showMessageTimestamps?: boolean'))
  assert.ok(timestamp.includes('showMessageTimestamps = false'))
  assert.ok(timestamp.includes('showMessageTimestamps || isTranscriptMode'))
  assert.ok(row.includes('showMessageTimestamps: boolean'))
  assert.ok(row.includes('showMessageTimestamps={showMessageTimestamps}'))
  assert.ok(row.includes('prev.showMessageTimestamps !== next.showMessageTimestamps'))
  assert.ok(messages.includes('state => state.showMessageTimestamps'))
  assert.ok(messages.includes("getFeatureValue_CACHED_MAY_BE_STALE('tengu_silk_hinge', false)"))
  assert.ok(messages.includes('showMessageTimestamps={showMessageTimestamps}'))
  assert.ok(main.includes('showMessageTimestamps: getGlobalConfig().showMessageTimestamps ?? false'))
})

test('executable authored timestamp component preserves transcript fallback and explicit setting behavior', sourceOptions, async () => {
  const { MessageTimestamp } = await executeTimestampModule(source('components/MessageTimestamp.tsx'))
  const textAssistant = assistant([{ type: 'text', text: 'done' }])
  const toolAssistant = assistant([{ type: 'tool_use', id: '1' }])

  assert.equal(MessageTimestamp({ message: textAssistant, isTranscriptMode: false }), null)
  assert.ok(MessageTimestamp({ message: textAssistant, isTranscriptMode: true }))
  assert.ok(MessageTimestamp({ message: toolAssistant, isTranscriptMode: false, showMessageTimestamps: true }))
  assert.equal(MessageTimestamp({ message: toolAssistant, isTranscriptMode: true }), null)
  assert.equal(MessageTimestamp({ message: { ...textAssistant, type: 'user' }, isTranscriptMode: true, showMessageTimestamps: true }), null)
  assert.equal(MessageTimestamp({ message: assistant([{ type: 'text', text: 'done' }], ''), isTranscriptMode: true }), null)
})
