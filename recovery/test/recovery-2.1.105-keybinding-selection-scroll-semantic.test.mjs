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
  [7539, ['unresolved', 'VariableDeclaration', 5295968, 5300633, '79f2101898720d2f671ad6bb232b6bc617f0d3b0299e95ff0d12fd3851a10b86']],
  [7552, ['unresolved', 'VariableDeclaration', 5303723, 5308224, '6d283bc04f3fbadcfe9d8e2ee4e196a8ebe13adafaea03223118eda1713a700d']],
  [18335, ['unresolved', 'FunctionDeclaration', 12709278, 12712748, 'e9ede5ea9cba145e0eda241f05c55fd2eb74d1275cfa4c06de1cabff0be95b87']],
  [18338, ['matched', 'FunctionDeclaration', 12714412, 12714618, 'a5b7b57c39ff9cee7494dc5939794e29389940e03b6a5136316edd7336ffe24f']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
}

function functionSource(contents, name) {
  const start = contents.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `${name}: declaration`)
  const body = contents.indexOf('{', start)
  let depth = 0
  for (let index = body; index < contents.length; index++) {
    if (contents[index] === '{') depth++
    if (contents[index] === '}' && --depth === 0) {
      return contents.slice(start, index + 1)
    }
  }
  throw new Error(`${name}: unterminated declaration`)
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

async function transpileCommonJs(contents) {
  const ts = await loadTypeScript()
  return ts.transpileModule(contents, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
}

async function executeDefaultBindings(contents) {
  const javascript = await transpileCommonJs(contents)
  const module = { exports: {} }
  const require = id => {
    if (id === 'bun:bundle') return { feature: () => false }
    if (id.endsWith('/semver.js')) return { satisfies: () => true }
    if (id.endsWith('/bundledMode.js')) return { isRunningWithBun: () => false }
    if (id.endsWith('/platform.js')) return { getPlatform: () => 'linux' }
    throw new Error(`unexpected defaultBindings import: ${id}`)
  }
  new Function('require', 'exports', 'module', 'process', javascript)(
    require,
    module.exports,
    module,
    process,
  )
  return module.exports.DEFAULT_BINDINGS
}

async function executeFunction(contents, name) {
  const javascript = await transpileCommonJs(
    `${functionSource(contents, name)}\nmodule.exports = { ${name} }`,
  )
  const module = { exports: {} }
  new Function('exports', 'module', javascript)(module.exports, module)
  return module.exports[name]
}

test(
  'authenticated target105 pins selection keybindings, schemas, and the reachable scroll handler',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath || !latestPath
        ? 'authenticated 2.1.104, 2.1.105, and 2.1.116 bundles are required'
        : false,
  },
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
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const latest = latestBytes.toString('utf8')

    for (const [index, [classification, nodeType, start, end, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, classification, `${index}: class`)
      assert.equal(region.target.index, index, `${index}: target index`)
      assert.equal(region.target.nodeType, nodeType, `${index}: node type`)
      assert.equal(region.target.parseStatus, 'parsed', `${index}: parse`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }
    assert.equal(structural.regions[18338].baselineUnitIndex, 18175)

    const defaultUnit = target.slice(5295968, 5300633)
    const schemaUnit = target.slice(5303723, 5308224)
    const handlerUnit = target.slice(12709278, 12712748)
    for (const fragment of [
      '"ctrl+j":"chat:newline"',
      'context:"Transcript"',
      '"ctrl+u":"scroll:halfPageUp"',
      '"ctrl+f":"scroll:fullPageDown"',
      '"shift+g":"scroll:bottom"',
      '"shift+left":"selection:extendLeft"',
      '"shift+end":"selection:extendLineEnd"',
    ]) assert.ok(defaultUnit.includes(fragment), `target105 defaults: ${fragment}`)
    for (const fragment of [
      'When the /doctor diagnostics screen is open',
      'scroll:fullPageDown',
      'selection:extendLineEnd',
      'messageActions:copy',
    ]) assert.ok(schemaUnit.includes(fragment), `target105 schema: ${fragment}`)
    for (const fragment of [
      'context:"Transcript"',
      '"selection:extendLeft"',
      '"selection:extendLineEnd"',
      '.moveFocus(',
    ]) assert.ok(handlerUnit.includes(fragment), `target105 handler: ${fragment}`)

    for (const fragment of ['"ctrl+j":"chat:newline"', 'selection:extendLeft']) {
      assert.equal(baseline.includes(fragment), false, `${fragment}: baseline104`)
      assert.equal(target.includes(fragment), true, `${fragment}: target105`)
      assert.equal(latest.includes(fragment), true, `${fragment}: target116`)
    }
    assert.equal(
      baseline.includes('When the /doctor diagnostics screen is open'),
      false,
    )
    assert.ok(target.includes('When the /doctor diagnostics screen is open'))
    assert.ok(latest.includes('When the /doctor diagnostics screen is open'))

    const latestHandlerAction = latest.lastIndexOf('"selection:extendLeft"')
    assert.notEqual(latestHandlerAction, -1)
    const latestSelection = latest.slice(
      latestHandlerAction - 1800,
      latestHandlerAction + 1000,
    )
    assert.ok(latestSelection.includes('virtualAnchorRow=void 0'))
    assert.ok(latestSelection.includes('.shiftAnchor(1,'))
    assert.equal(handlerUnit.includes('virtualAnchorRow'), false)
  },
)

test(
  'source root owns target105 defaults/schema and preserves target116 selection evolution',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const defaults = source('keybindings/defaultBindings.ts')
    const schema = source('keybindings/schema.ts')
    const handler = source('components/ScrollKeybindingHandler.tsx')
    const target105Mode = !defaults.includes("'settings:periodDay'")

    assert.ok(defaults.indexOf("context: 'Doctor'") < defaults.indexOf("context: 'Confirmation'"))
    for (const fragment of [
      "'ctrl+j': 'chat:newline'",
      "'ctrl+u': 'scroll:halfPageUp'",
      "'ctrl+f': 'scroll:fullPageDown'",
      "'shift+g': 'scroll:bottom'",
      "'shift+left': 'selection:extendLeft'",
      "'shift+end': 'selection:extendLineEnd'",
    ]) assert.ok(defaults.includes(fragment), `defaults: ${fragment}`)
    for (const fragment of [
      "'Scroll'",
      "'MessageActions'",
      "'Doctor'",
      "Doctor: 'When the /doctor diagnostics screen is open'",
      "'chat:clearInput'",
      "'scroll:fullPageDown'",
      "'selection:extendLineEnd'",
      'MESSAGE_ACTION_PATTERN',
      '.regex(MESSAGE_ACTION_PATTERN)',
    ]) assert.ok(schema.includes(fragment), `schema: ${fragment}`)
    for (const fragment of [
      "context: 'Transcript'",
      "'scroll:fullPageDown': () => performNamedScroll('fullPageDown')",
      "'selection:extendLeft': () => extendSelection('left')",
      "'selection:extendLineEnd': () => extendSelection('lineEnd')",
      'repeatedModalPagerAction(input, key)',
      'repeat < input.length',
    ]) assert.ok(handler.includes(fragment), `handler: ${fragment}`)

    if (target105Mode) {
      assert.ok(handler.includes('if (!selection.hasSelection()) return false'))
      assert.ok(handler.includes('selection.moveFocus(move)'))
      assert.equal(handler.includes('const extendingAbove'), false)
      assert.equal(defaults.includes("'ctrl+u': 'scroll:halfPageUp',\n      'ctrl+d': 'scroll:halfPageDown',\n    },\n  },\n  {\n    context: 'Doctor'"), false)
    } else {
      assert.ok(defaults.includes("d: 'settings:periodDay'"))
      assert.ok(defaults.includes("t: 'settings:sortByTokens'"))
      assert.ok(handler.includes('const extendingAbove'))
      assert.ok(handler.includes('state.virtualAnchorRow = undefined'))
      assert.ok(handler.includes('if (isModal && isModalPagerInput(input_0, key_0)) return'))
    }
  },
)

test(
  'executable defaults and repeated-input fallback dispatch recovered actions',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const defaultsSource = source('keybindings/defaultBindings.ts')
    const handlerSource = source('components/ScrollKeybindingHandler.tsx')
    const bindings = await executeDefaultBindings(defaultsSource)
    const byContext = Object.fromEntries(
      bindings.map(block => [block.context, block.bindings]),
    )
    assert.equal(byContext.Global['ctrl+l'], undefined)
    assert.equal(byContext.Chat['ctrl+l'], 'chat:clearInput')
    assert.equal(byContext.Chat['ctrl+j'], 'chat:newline')
    assert.equal(byContext.Chat['shift+tab'], 'chat:cycleMode')
    assert.equal(byContext.Confirmation['shift+tab'], 'confirm:cycleMode')
    assert.deepEqual(
      Object.fromEntries([
        'ctrl+u', 'ctrl+d', 'ctrl+b', 'ctrl+f', 'ctrl+n', 'ctrl+p',
        'g', 'shift+g', 'j', 'k', 'space', 'b', 'up', 'down', 'home', 'end',
      ].map(key => [key, byContext.Transcript[key]])),
      {
        'ctrl+u': 'scroll:halfPageUp',
        'ctrl+d': 'scroll:halfPageDown',
        'ctrl+b': 'scroll:fullPageUp',
        'ctrl+f': 'scroll:fullPageDown',
        'ctrl+n': 'scroll:lineDown',
        'ctrl+p': 'scroll:lineUp',
        g: 'scroll:top',
        'shift+g': 'scroll:bottom',
        j: 'scroll:lineDown',
        k: 'scroll:lineUp',
        space: 'scroll:fullPageDown',
        b: 'scroll:fullPageUp',
        up: 'scroll:lineUp',
        down: 'scroll:lineDown',
        home: 'scroll:top',
        end: 'scroll:bottom',
      },
    )
    assert.deepEqual(
      Object.fromEntries([
        'shift+left', 'shift+right', 'shift+up', 'shift+down',
        'shift+home', 'shift+end',
      ].map(key => [key, byContext.Scroll[key]])),
      {
        'shift+left': 'selection:extendLeft',
        'shift+right': 'selection:extendRight',
        'shift+up': 'selection:extendUp',
        'shift+down': 'selection:extendDown',
        'shift+home': 'selection:extendLineStart',
        'shift+end': 'selection:extendLineEnd',
      },
    )

    const repeatedModalPagerAction = await executeFunction(
      handlerSource,
      'repeatedModalPagerAction',
    )
    const key = { ctrl: false, meta: false, shift: false }
    assert.equal(repeatedModalPagerAction('j', key), null)
    assert.equal(repeatedModalPagerAction('jjj', key), 'lineDown')
    assert.equal(repeatedModalPagerAction('kk', key), 'lineUp')
    assert.equal(repeatedModalPagerAction('bbb', key), 'fullPageUp')
    assert.equal(repeatedModalPagerAction('  ', key), 'fullPageDown')
    assert.equal(repeatedModalPagerAction('GG', key), 'bottom')
    assert.equal(
      repeatedModalPagerAction('gg', { ...key, shift: true }),
      'bottom',
    )
    assert.equal(repeatedModalPagerAction('jk', key), null)
    assert.equal(repeatedModalPagerAction('jj', { ...key, ctrl: true }), null)
  },
)
