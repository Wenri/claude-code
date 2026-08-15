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

const units = new Map([
  [9315, [7191372, 7191495, 'f67dde3de3f83353aa8cd1ef0b15240e7c68c657e0a5b95c0dec8500bd2b3148']],
  [9324, [7193029, 7193414, '8fdd62b89824ede17636f6318661fc17d8f0a82064a587d320399404972cf4df']],
  [18386, [12731362, 12789746, 'a19619e44713e41b4e5b83d8f9e5e8a67ef9553396a241a74ccc40f4a7980e32']],
])

const hint =
  "tmux focus-events off · add 'set -g focus-events on' to ~/.tmux.conf and reattach for focus tracking"

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrenceCount(contents, value) {
  return contents.split(value).length - 1
}

function functionSource(contents, name) {
  const expression = new RegExp(
    `(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`,
  )
  const match = expression.exec(contents)
  assert.ok(match, `${name}: declaration`)
  const start = match.index
  const body = contents.indexOf('{', match.index + match[0].length)
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
  'target105 introduces one-shot tmux focus-event diagnostics and REPL delivery',
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
    assert.equal(occurrenceCount(baseline, hint), 0)
    assert.equal(occurrenceCount(target, hint), 1)

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

    const state = target.slice(7191372, 7191495)
    for (const property of [
      'loggedTmuxCcDisable',
      'checkedTmuxMouseHint',
      'checkedTmuxFocusHint',
      'tmuxControlModeProbed',
    ]) {
      assert.ok(state.includes(property), property)
    }
    const helper = target.slice(7193029, 7193414)
    for (const fragment of ['-gv', 'focus-events', 'checkedTmuxFocusHint', hint]) {
      assert.ok(helper.includes(fragment), fragment)
    }
    const repl = target.slice(12731362, 12789746)
    assert.match(repl, /tmux-focus-hint/)
    assert.ok(repl.includes(hint.slice(0, 21)) === false)
  },
)

test(
  'authored focus probe is injectable, one-shot, and independently mounted',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const fullscreen = fs.readFileSync(
      path.join(sourceRoot, 'utils/fullscreen.ts'),
      'utf8',
    )
    const repl = fs.readFileSync(path.join(sourceRoot, 'screens/REPL.tsx'), 'utf8')
    const isCurrent = sourceRoot === path.resolve(repositoryRoot, 'src')
    const createState = functionSource(fullscreen, 'createFullscreenState')
    const heuristic = functionSource(fullscreen, 'isTmuxControlModeEnvHeuristic')
    const probe = functionSource(fullscreen, 'probeTmuxControlModeSync')
    const isControl = functionSource(fullscreen, 'isTmuxControlMode')
    const focus = functionSource(fullscreen, 'maybeGetTmuxFocusHint')
    for (const fragment of [
      'checkedTmuxFocusHint: false',
      "['show', '-gv', 'focus-events']",
      'if (state.checkedTmuxFocusHint) return null',
      'state.checkedTmuxFocusHint = true',
      hint,
    ]) {
      assert.ok(fullscreen.includes(fragment), fragment)
    }
    if (isCurrent) assert.ok(createState.includes('gbGateCached: undefined'))
    else assert.equal(createState.includes('gbGateCached'), false)
    assert.match(
      repl,
      /maybeGetTmuxFocusHint\(\)\.then\([\s\S]*?key: 'tmux-focus-hint'/,
    )

    const ts = await loadTypeScript()
    const program = [
      createState,
      heuristic,
      probe,
      isControl,
      focus,
      'const fullscreenState = createFullscreenState()',
      'export { createFullscreenState, maybeGetTmuxFocusHint }',
    ].join('\n')
    const javascript = ts.transpileModule(program, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText
    const calls = []
    let response = { stdout: 'off\n', code: 0 }
    const execFileNoThrow = async (...args) => {
      calls.push(args)
      return response
    }
    const spawnSync = () => ({ status: 1, stdout: '' })
    const module = { exports: {} }
    new Function(
      'exports',
      'module',
      'execFileNoThrow',
      'spawnSync',
      javascript,
    )(module.exports, module, execFileNoThrow, spawnSync)
    const api = module.exports

    const prior = {
      TMUX: process.env.TMUX,
      TERM_PROGRAM: process.env.TERM_PROGRAM,
      TERM: process.env.TERM,
    }
    try {
      process.env.TMUX = '/tmp/tmux-1/default,1,0'
      process.env.TERM_PROGRAM = 'tmux'
      process.env.TERM = 'screen-256color'
      const state = api.createFullscreenState()
      assert.equal(await api.maybeGetTmuxFocusHint(state), hint)
      assert.equal(await api.maybeGetTmuxFocusHint(state), null)
      assert.equal(calls.length, 1)
      assert.deepEqual(calls[0].slice(0, 2), [
        'tmux',
        ['show', '-gv', 'focus-events'],
      ])

      response = { stdout: 'on\n', code: 0 }
      assert.equal(
        await api.maybeGetTmuxFocusHint(api.createFullscreenState()),
        null,
      )
      response = { stdout: '', code: 1 }
      assert.equal(
        await api.maybeGetTmuxFocusHint(api.createFullscreenState()),
        null,
      )
    } finally {
      for (const [key, value] of Object.entries(prior)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  },
)

test(
  'target116 retains focus probing and evolves the per-session fullscreen cache',
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
    assert.equal(occurrenceCount(latest, 'tmux focus-events off'), 1)
    assert.equal(
      occurrenceCount(latest, "add 'set -g focus-events on' to ~/.tmux.conf and reattach for focus tracking"),
      1,
    )
    assert.equal(occurrenceCount(latest, 'tmux-focus-hint'), 1)
    const at = latest.indexOf('checkedTmuxFocusHint')
    const graph = latest.slice(at - 200, at + 400)
    assert.match(graph, /gbGateCached/)
    assert.match(graph, /tmuxControlModeProbed/)
  },
)
