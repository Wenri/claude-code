import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceOptions = {
  skip:
    !semanticCase || semanticCase === caseName
      ? false
      : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip:
    semanticCase && semanticCase !== caseName
      ? `not applicable to ${semanticCase}`
      : !semanticCase &&
          (!process.env.CLAUDE_CODE_2_1_109_BUNDLE ||
            !process.env.CLAUDE_CODE_2_1_110_BUNDLE)
        ? 'authenticated target109 and target110 bundles are required'
        : false,
}

const BASELINE_SHA256 =
  '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7'
const TARGET_SHA256 =
  'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861'

const TARGET_UNITS = [
  [2565, 1014664, 1040118, 'VariableDeclaration', '0632eed3e779c53ee110d27f092df13c8d1d7a1afe596df27d3ffa9ae14cca4e'],
  [5080, 3745180, 3745407, 'FunctionDeclaration', '492a766a305052a7e985f6ac8908b64683a270340706c289d1ec74454970264e'],
  [12072, 9146317, 9149396, 'VariableDeclaration', '319beb55bac42d5cdc5a1893a2aa843fc1f6a9bd8ed47a6e34c763af219ccbb7'],
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function bundle(environmentName, expectedSha256) {
  const filename = process.env[environmentName]
  assert.ok(filename, `${environmentName} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(sha256(bytes), expectedSha256)
  return bytes.toString('utf8')
}

function source(relative) {
  const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  if (sourceRoot) return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
  return fs.readFileSync(
    fileURLToPath(new URL(`../../src/${relative}`, import.meta.url)),
    'utf8',
  )
}

test('target110 pins the plugin-settings contract and stable user-id fallback', bundleOptions, () => {
  const baseline = bundle('CLAUDE_CODE_2_1_109_BUNDLE', BASELINE_SHA256)
  const target = bundle('CLAUDE_CODE_2_1_110_BUNDLE', TARGET_SHA256)
  for (const [index, start, end, nodeType, expected] of TARGET_UNITS) {
    assert.equal(
      sha256(target.slice(start, end)),
      expected,
      `${nodeType} target unit ${index}`,
    )
  }
  for (const observable of [
    'Only keys in PLUGIN_SETTINGS_KEYS (pluginSettingsKeys.ts) are kept',
    'getOrCreateUserID: could not persist userID: ',
    'Terminal UI renderer: "fullscreen" for flicker-free alt-screen rendering, "default" for the classic renderer',
  ]) {
    assert.equal(baseline.includes(observable), false, observable)
    assert.equal(target.includes(observable), true, observable)
  }
})

test('source owns the observable schema description and non-throwing ID cache', sourceOptions, () => {
  const schema = source('utils/plugins/schemas.ts')
  assert.equal(
    schema.includes(
      'Only keys in PLUGIN_SETTINGS_KEYS (pluginSettingsKeys.ts) are kept',
    ),
    true,
  )

  const config = source('utils/config.ts')
  for (const fragment of [
    'let generatedUserID: string | undefined',
    'if (generatedUserID) return generatedUserID',
    'generatedUserID = userID',
    'try {\n    saveGlobalConfig(current => ({ ...current, userID }))',
    'getOrCreateUserID: could not persist userID: ${String(error)}',
    "{ level: 'error' }",
  ]) {
    assert.equal(config.includes(fragment), true, fragment)
  }

  const supportedSettings = source('tools/ConfigTool/supportedSettings.ts')
  for (const fragment of [
    'tui: {',
    "source: 'settings'",
    'Terminal UI renderer: "fullscreen" for flicker-free alt-screen rendering, "default" for the classic renderer',
    "options: ['default', 'fullscreen']",
  ]) {
    assert.equal(supportedSettings.includes(fragment), true, fragment)
  }
})
