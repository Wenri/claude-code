import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.90-to-2.1.91'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_90_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_91_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath || !latestPath
      ? 'authenticated 2.1.90, 2.1.91, and 2.1.116 bundles are required'
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

const units = new Map([
  [5522, ['unresolved', 4022363, 4022399, 'FunctionDeclaration', 'aa94cc5c84594380073772b949304ee4a7aca9588cd7758a736ae07edbbadcf9']],
  [5523, ['moved', 4022399, 4022407, 'VariableDeclaration', '7ceb2aaa36f922a2312ff738f4ce242d1a0753a1bb4f4c673ece6a46ecd1206c']],
  [5524, ['unresolved', 4022407, 4022436, 'VariableDeclaration', 'ef637112c1da365e523dcb8e37232df19f6fdb2608e12d07f065dd5e06022544']],
  [5560, ['unresolved', 4034345, 4035167, 'FunctionDeclaration', '7f506c3aa9d2e81229faba1893428aff6688547417726640c71bea81107d132a']],
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

async function executeThemeNotifications(contents) {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(contents, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const module = { exports: {} }
  new Function('exports', 'module', javascript)(module.exports, module)
  return module.exports
}

test(
  'authenticated target91 pins the theme-notification registry and reachable App dispatch',
  bundleOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(baselineBytes),
      '069185909d50518b8b239acc0f9ae9b062a610595299b35955fc53e6e2c2f5e9',
    )
    assert.equal(
      sha256(targetBytes),
      'b4bf141f30cf8b40196295816c7a6b9d01a36e906908d73a9f9a865ce4cdf816',
    )
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )

    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const latest = latestBytes.toString('utf8')
    for (const [index, [classification, start, end, nodeType, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, classification, `${index}: class`)
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        [start, end, nodeType, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }

    assert.equal(occurrences(baseline, 'themeNotify'), 0)
    assert.equal(occurrences(target, 'themeNotify'), 2)
    assert.equal(occurrences(latest, 'themeNotify'), 2)
    assert.ok(target.slice(4022363, 4022436).includes('new Set'))
    assert.ok(target.slice(4034345, 4035167).includes('themeNotify'))
  },
)

test(
  'source root owns subscription, dispatch, and terminal enable-disable reachability',
  sourceOptions,
  () => {
    const notifications = source('ink/theme-notify.ts')
    const app = source('ink/components/App.tsx')

    for (const fragment of [
      'new Set<ThemeNotifySubscriber>()',
      'subscribers.add(subscriber)',
      'subscribers.delete(subscriber)',
      'for (const subscriber of subscribers) subscriber()',
    ]) {
      assert.ok(notifications.includes(fragment), fragment)
    }
    for (const fragment of [
      "import { notifyThemeChange } from '../theme-notify.js'",
      "item.response.type === 'themeNotify'",
      'notifyThemeChange()',
      'ENABLE_THEME_NOTIFY',
      'DISABLE_THEME_NOTIFY',
    ]) {
      assert.ok(app.includes(fragment), fragment)
    }
  },
)

test(
  'executable authored registry notifies every live subscriber and cleanup is idempotent',
  sourceOptions,
  async () => {
    const notifications = await executeThemeNotifications(
      source('ink/theme-notify.ts'),
    )
    const calls = []
    const unsubscribeA = notifications.subscribeToThemeNotifications(() =>
      calls.push('a'),
    )
    const unsubscribeB = notifications.subscribeToThemeNotifications(() =>
      calls.push('b'),
    )

    notifications.notifyThemeChange()
    unsubscribeA()
    unsubscribeA()
    notifications.notifyThemeChange()
    unsubscribeB()
    notifications.notifyThemeChange()
    assert.deepEqual(calls, ['a', 'b', 'b'])
  },
)
