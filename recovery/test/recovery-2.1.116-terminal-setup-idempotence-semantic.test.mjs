import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
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

const targetUnits = new Map([
  [
    7621,
    [
      3660799,
      3662686,
      '9ef22460303d5b84f23e29fb5c555e2b74fc8ffe71c6aad00241b40a0185c3b1',
    ],
  ],
  [
    7625,
    [
      3664996,
      3666431,
      '2bb241a7c8c2884b870c862e04ab216193470df5550c0d164c1ad1538b08914e',
    ],
  ],
  [
    7626,
    [
      3666431,
      3667430,
      'bed147b13b7011c108652e1794ac59efcf724ab5350386023e67b94218bf2a97',
    ],
  ],
])

const baselineUnits = new Map([
  [
    7554,
    [
      3637101,
      3639078,
      '682db147ad0cb8b434e83f7504e415b52a3fcd144343703cdeb231a7211387c1',
    ],
  ],
  [
    7558,
    [
      3641388,
      3642843,
      'f9d36bf1d25a7ee246e6667201f77fbb6b7330983c98339adabd9dcc6305a86b',
    ],
  ],
  [
    7559,
    [
      3642843,
      3643862,
      '91fcfefeb910fa2bcaf2cf357b83e5b2e92e13ce511fbfc95123bec2accd080b',
    ],
  ],
])

const addedStrings = [
  [' terminal Shift+Enter key binding already configured', 3662225, 3662277],
  [
    ' already has a Shift+Enter terminal binding with different args; leaving it as-is.',
    3662326,
    3662408,
  ],
  ['Alacritty Shift+Enter key binding already configured', 3665593, 3665647],
  ['Zed Shift+Enter key binding already configured', 3666715, 3666763],
]

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

async function executeOwner(contents, initialFiles) {
  const ts = await loadTypeScript()
  let instrumented = contents
  for (const name of [
    'installBindingsForVSCodeTerminal',
    'installBindingsForAlacritty',
    'installBindingsForZed',
  ]) {
    const before = instrumented
    instrumented = instrumented.replace(
      `async function ${name}`,
      `export async function ${name}`,
    )
    assert.notEqual(instrumented, before, `${name} must be instrumented`)
  }
  const javascript = ts.transpileModule(instrumented, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText

  const files = new Map(initialFiles)
  const state = { copies: [], mkdirs: [], writes: [] }
  const missing = filename => Object.assign(new Error(`missing ${filename}`), { code: 'ENOENT' })
  const fsPromises = {
    copyFile: async (from, to) => state.copies.push([from, to]),
    mkdir: async (...args) => state.mkdirs.push(args),
    readFile: async filename => {
      if (!files.has(filename)) throw missing(filename)
      return files.get(filename)
    },
    writeFile: async (filename, value) => {
      files.set(filename, value)
      state.writes.push([filename, value])
    },
  }
  const noop = () => undefined
  const generic = new Proxy(noop, { get: () => noop })
  const module = { exports: {} }
  new Function('require', 'exports', 'module', javascript)(
    id => {
      if (id === 'chalk') {
        return { __esModule: true, default: { dim: value => `dim:${value}` } }
      }
      if (id === 'crypto') return { randomBytes: () => Buffer.from('abcd') }
      if (id === 'fs/promises') return fsPromises
      if (id === 'os') {
        return { homedir: () => '/home/test', platform: () => 'linux', release: () => '' }
      }
      if (id === 'path') return path
      if (id === 'url') return { pathToFileURL }
      if (id.endsWith('/supports-hyperlinks.js')) return { supportsHyperlinks: () => false }
      if (id.endsWith('/ink.js')) {
        return { color: kind => value => `${kind}:${value}` }
      }
      if (id.endsWith('/env.js')) return { env: { terminal: null } }
      if (id.endsWith('/errors.js')) return { isFsInaccessible: error => error?.code === 'ENOENT' }
      if (id.endsWith('/json.js')) {
        return {
          addItemToJSONCArray: (value, item) => JSON.stringify([...JSON.parse(value), item]),
          safeParseJSONC: value => JSON.parse(value),
          setJSONCProperty: generic,
        }
      }
      if (id.endsWith('/log.js')) return { logError: noop }
      if (id.endsWith('/slowOperations.js')) {
        return { jsonParse: JSON.parse, jsonStringify: JSON.stringify }
      }
      return generic
    },
    module.exports,
    module,
  )
  return { exports: module.exports, files, state }
}

test(
  'authenticated target116 changes terminal setup from duplicate warnings to idempotent success',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.114 and 2.1.116 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
    )
    assert.equal(
      sha256(targetBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')

    for (const [index, [start, end, hash]] of targetUnits) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved')
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, hash],
      )
      assert.equal(sha256(target.slice(start, end)), hash)
    }
    for (const [index, [start, end, hash]] of baselineUnits) {
      const unit = structural.unmatchedBaseline.find(item => item.index === index)
      assert.ok(unit, `${index}: baseline unit`)
      assert.deepEqual([unit.start, unit.end, unit.sourceHash], [start, end, hash])
      assert.equal(sha256(baseline.slice(start, end)), hash)
    }
    for (const [value, start, end] of addedStrings) {
      assert.equal(baseline.split(value).length - 1, 0, `${value}: baseline`)
      assert.equal(target.split(value).length - 1, 1, `${value}: target`)
      assert.ok(target.slice(start, end).includes(value))
    }
    assert.equal(
      baseline.split('Found existing Alacritty Shift+Enter key binding. Remove it to continue.').length - 1,
      1,
    )
    assert.equal(
      target.split('Found existing Alacritty Shift+Enter key binding. Remove it to continue.').length - 1,
      0,
    )
  },
)

test(
  'source terminal installers preserve exact matches and warn only on conflicting VSCode args',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const contents = fs.readFileSync(
      path.join(sourceRoot, 'commands/terminalSetup/terminalSetup.tsx'),
      'utf8',
    )
    for (const [value] of addedStrings) assert.ok(contents.includes(value), value)
    assert.equal(contents.includes('Found existing Alacritty Shift+Enter key binding'), false)
    assert.equal(contents.includes('Found existing Zed Shift+Enter key binding'), false)

    const vscodePath = '/home/test/.config/Code/User/keybindings.json'
    const exact = JSON.stringify([
      {
        key: 'shift+enter',
        command: 'workbench.action.terminal.sendSequence',
        args: { text: '\u001b\r' },
        when: 'terminalFocus',
      },
    ])
    const vscode = await executeOwner(contents, [[vscodePath, exact]])
    const exactResult = await vscode.exports.installBindingsForVSCodeTerminal(
      'VSCode',
      'dark',
    )
    assert.match(exactResult, /success:VSCode terminal Shift\+Enter key binding already configured/)
    assert.equal(vscode.state.writes.length, 0)
    assert.equal(vscode.state.copies.length, 1)

    const conflicting = JSON.stringify([
      {
        key: 'shift+enter',
        command: 'workbench.action.terminal.sendSequence',
        args: { text: 'different' },
        when: 'terminalFocus',
      },
    ])
    const conflictRuntime = await executeOwner(contents, [[vscodePath, conflicting]])
    const conflict = await conflictRuntime.exports.installBindingsForVSCodeTerminal(
      'VSCode',
      'dark',
    )
    assert.match(conflict, /warning:VSCode already has a Shift\+Enter terminal binding with different args; leaving it as-is\./)
    assert.equal(conflictRuntime.state.writes.length, 0)

    const alacrittyPath = '/home/test/.config/alacritty/alacritty.toml'
    const alacritty = await executeOwner(contents, [
      [alacrittyPath, '[[keyboard.bindings]]\nkey = "Return"\nmods = "Shift"\n'],
    ])
    assert.match(
      await alacritty.exports.installBindingsForAlacritty('dark'),
      /success:Alacritty Shift\+Enter key binding already configured/,
    )
    assert.equal(alacritty.state.copies.length, 0)
    assert.equal(alacritty.state.writes.length, 0)

    const zedPath = '/home/test/.config/zed/keymap.json'
    const zed = await executeOwner(contents, [
      [zedPath, '[{"bindings":{"shift-enter":["terminal::SendText","x"]}}]'],
    ])
    assert.match(
      await zed.exports.installBindingsForZed('dark'),
      /success:Zed Shift\+Enter key binding already configured/,
    )
    assert.equal(zed.state.copies.length, 0)
    assert.equal(zed.state.writes.length, 0)
  },
)
