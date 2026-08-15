import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const baselinePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_PUBLISHED_BUNDLE

const BASELINE_SHA256 =
  'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be'
const TARGET_SHA256 =
  'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb'
const LATEST_SHA256 =
  '06cb80193f3af8bb468d1536b230b0e2f854a398b1e88af3c79048ce821bf193'

const targetUnits = [
  [2548, 1004893, 1008390, 'bbf74638b8ff560bf330e56d8153ad219efd683a32bcc99eba8702481608ad18'],
  [2574, 1036757, 1037495, '42da722d23493140b9c13cea74b24ebc19df0faaf826e510e53b746759181991'],
  [2616, 1073220, 1073699, 'f88fd514c1314990d0123e6018107646b005e59e36b9bf92ea660617901cff2b'],
  [2656, 1079746, 1080007, '4547b16aad07f692e8a967f943166b1dbbe52a11a2694ad4694de06006cad0fc'],
]

function authenticatedBundle(filename, expectedHash, label) {
  assert.ok(filename, `${label} bundle environment variable must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    expectedHash,
  )
  return bytes.toString('utf8')
}

function readSource(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
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

test('target101 pins all four settings and prompt boundary units', () => {
  const baseline = authenticatedBundle(baselinePath, BASELINE_SHA256, '2.1.100')
  const target = authenticatedBundle(targetPath, TARGET_SHA256, '2.1.101')
  for (const marker of [
    'Custom prefix for the system-reminder shown to the model when an asyncRewake hook exits with code 2.',
    'In brief mode you must call SendUserMessage to communicate with the user — text outside it is hidden from their view.',
    'Unknown hook event "',
    'SDK inline settings',
  ]) {
    assert.equal(baseline.includes(marker), false, marker)
    assert.equal(target.includes(marker), true, marker)
  }
  for (const [index, start, end, expectedHash] of targetUnits) {
    const unit = target.slice(start, end)
    assert.equal(
      crypto.createHash('sha256').update(unit).digest('hex'),
      expectedHash,
      `target101 unit ${index}`,
    )
  }
})

test('source owns async-rewake/brief literals and the complete settings call graph', () => {
  const hooks = readSource('schemas/hooks.ts')
  const brief = readSource('tools/BriefTool/prompt.ts')
  const validation = readSource('utils/settings/validation.ts')
  const settings = readSource('utils/settings/settings.ts')

  if (semanticCase === '2.1.100-to-2.1.101') {
    assert.ok(
      hooks.includes(
        "'Custom prefix for the system-reminder shown to the model when an asyncRewake hook exits with code 2. The hook output is appended after this prefix.'",
      ),
    )
    assert.equal(hooks.includes('@internal Custom prefix'), false)
    assert.equal(hooks.includes('One-line summary shown to the user'), false)
  } else {
    assert.ok(
      hooks.includes(
        '@internal Custom prefix for the system-reminder shown to the model when an asyncRewake hook exits with code 2. The hook output is appended after this prefix.',
      ),
    )
  }
  assert.ok(
    brief.includes(
      'In brief mode you must call SendUserMessage to communicate with the user',
    ),
  )

  for (const fragment of [
    'const VALID_HOOK_EVENTS = new Set<string>(HOOK_EVENTS)',
    'delete hooks[event]',
    'path: `hooks.${event}`',
    'Unknown hook event "${event}" was ignored. Valid events: ${HOOK_EVENTS.join',
    "severity: 'warning'",
    "docLink: 'https://code.claude.com/docs/en/hooks'",
    'delete obj.hooks',
  ]) assert.ok(validation.includes(fragment), fragment)

  assert.match(
    settings,
    /const entryWarnings = filterInvalidSettingsEntries\(data, path\)[\s\S]*SettingsSchema\(\)\.safeParse\(data\)/,
  )
  assert.match(
    settings,
    /function parseSdkInlineSettings\(\)[\s\S]*structuredClone\(inlineSettings\)[\s\S]*filterInvalidSettingsEntries\(cloned, 'SDK inline settings'\)[\s\S]*SettingsSchema\(\)\.safeParse\(cloned\)/,
  )
  assert.match(
    settings,
    /const \{ settings: inlineSettings, errors \} = parseSdkInlineSettings\(\)[\s\S]*allErrors\.push\(error\)[\s\S]*mergeWith\(/,
  )
})

test('the recovered source removes unknown hooks and preserves valid entries', async () => {
  const source = readSource('utils/settings/validation.ts')
  const start = source.indexOf('const VALID_HOOK_EVENTS')
  const end = source.indexOf('\nexport function filterInvalidSettingsEntries', start)
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  const ts = await loadTypeScript()
  const moduleSource = `const HOOK_EVENTS = ['PreToolUse', 'Stop'];\n${source.slice(start, end)}`
  const javascript = ts.transpileModule(moduleSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const module = { exports: {} }
  new Function('exports', 'module', javascript)(module.exports, module)
  const filter = module.exports.filterInvalidHookEvents
  assert.equal(typeof filter, 'function')

  const mixed = {
    hooks: {
      PreToolUse: [{ hooks: [] }],
      TypoEvent: [{ hooks: [] }],
    },
  }
  const warnings = filter(mixed, 'SDK inline settings')
  assert.deepEqual(Object.keys(mixed.hooks), ['PreToolUse'])
  assert.deepEqual(warnings, [
    {
      file: 'SDK inline settings',
      path: 'hooks.TypoEvent',
      message:
        'Unknown hook event "TypoEvent" was ignored. Valid events: PreToolUse, Stop',
      severity: 'warning',
      invalidValue: 'TypoEvent',
      docLink: 'https://code.claude.com/docs/en/hooks',
    },
  ])

  const onlyUnknown = { hooks: { TypoEvent: [] } }
  filter(onlyUnknown, 'settings.json')
  assert.equal('hooks' in onlyUnknown, false)
})

test(
  'target116 retains every recovered settings behavior',
  {
    skip: latestPath
      ? false
      : 'CLAUDE_CODE_2_1_116_PUBLISHED_BUNDLE is not set',
  },
  () => {
    const latest = authenticatedBundle(latestPath, LATEST_SHA256, '2.1.116')
    for (const marker of [
      'Custom prefix for the system-reminder shown to the model when an asyncRewake hook exits with code 2.',
      'In brief mode you must call SendUserMessage to communicate with the user',
      'Unknown hook event "',
      'SDK inline settings',
    ]) assert.ok(latest.includes(marker), marker)
  },
)
