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
  [15178, ['FunctionDeclaration', 11197274, 11197603, 'a9b39fd3aaa7bb0f70ce880a538681c66455377e90fd28a9925949e07e42e3f2']],
  [15179, ['FunctionDeclaration', 11197603, 11197710, 'ea4739af8f6b5780e8399d5e42e27bb69681aee776e2e6ad3fa26e5c37e16d1e']],
  [15180, ['FunctionDeclaration', 11197710, 11197836, '336a1429cebd1f3dacb29968447a7346d0f4d589d85473f6eb5920717c23eba5']],
  [15181, ['FunctionDeclaration', 11197836, 11201916, '54c567110ff97b441ab958405b8be73a1a6f3cbff008579cbaec93c79a7d1168']],
  [15184, ['FunctionDeclaration', 11201989, 11202091, 'aa0e123dc312b1eef59246f000918103751edd4576a70c263b4b6a10b1a093d5']],
  [15187, ['VariableDeclaration', 11202263, 11202647, 'ffbfd67244cc2805337805ecf64f0fdbc9b11fc7bcc9556d1ef2ebdbcd4f0a06']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source() {
  return fs.readFileSync(
    path.join(sourceRoot, 'components/skills/SkillsMenu.tsx'),
    'utf8',
  )
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

function flattenText(node) {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return ''
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }
  if (Array.isArray(node)) return node.map(flattenText).join('')
  if (typeof node.type === 'function') {
    return flattenText(node.type(node.props ?? {}))
  }
  return flattenText(node.props?.children)
}

async function executeMenu(contents) {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(contents, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const stateSlots = []
  const exitCalls = []
  let keybindings
  let keybindingOptions
  const React = {
    Fragment: Symbol('Fragment'),
    createElement(type, props, ...children) {
      return {
        type,
        props: {
          ...(props ?? {}),
          children:
            children.length === 0
              ? undefined
              : children.length === 1
                ? children[0]
                : children,
        },
      }
    },
    useMemo: factory => factory(),
    useState(initial) {
      const index = stateSlots.length
      const value = typeof initial === 'function' ? initial() : initial
      stateSlots.push(value)
      return [
        value,
        next => {
          stateSlots[index] =
            typeof next === 'function' ? next(stateSlots[index]) : next
        },
      ]
    },
  }
  function Select(props) {
    return React.createElement('Select', props, props.children)
  }
  Select.Item = function SelectItem(props) {
    return React.createElement('SelectItem', props, props.children)
  }
  const settings = {
    policySettings: { skillOverrides: { policy: 'off' } },
    flagSettings: { skillOverrides: { flag: 'name-only' } },
    projectSettings: { skillOverrides: { inherited: 'name-only' } },
    userSettings: { skillOverrides: { inherited: 'off' } },
    localSettings: { skillOverrides: { local: 'off' } },
  }
  const named = name => ({
    type: 'prompt',
    loadedFrom: name === 'plugin' ? 'plugin' : 'skills',
    source: name === 'plugin' ? 'plugin' : 'projectSettings',
    name,
    tokens: 10,
  })
  const commands = [
    named('plain'),
    named('inherited'),
    named('local'),
    named('policy'),
    named('flag'),
    { ...named('author'), disableModelInvocation: true },
    named('plugin'),
    { type: 'local-jsx', name: 'not-a-skill' },
  ]
  const ReactModule = { __esModule: true, default: React, ...React }
  const require = id => {
    if (id === 'react') return ReactModule
    if (id === 'figures') {
      return {
        __esModule: true,
        default: {
          arrowDown: '↓',
          arrowUp: '↑',
          bullet: '•',
          circle: '○',
          cross: '×',
          pointer: '›',
          tick: '✓',
        },
      }
    }
    if (id.endsWith('/commands.js')) {
      return { getCommandName: command => command.name }
    }
    if (id.endsWith('/context/modalContext.js')) {
      return { useModalOrTerminalSize: size => size }
    }
    if (id.endsWith('/hooks/useTerminalSize.js')) {
      return { useTerminalSize: () => ({ columns: 80, rows: 30 }) }
    }
    if (id.endsWith('/ink.js')) return { Box: 'Box', Text: 'Text' }
    if (id.endsWith('/keybindings/shortcutFormat.js')) {
      return { getShortcutDisplay: (_action, _context, fallback) => fallback }
    }
    if (id.endsWith('/keybindings/useKeybinding.js')) {
      return {
        useKeybindings: (bindings, options) => {
          keybindings = bindings
          keybindingOptions = options
        },
      }
    }
    if (id.endsWith('/skills/loadSkillsDir.js')) {
      return { estimateSkillFrontmatterTokens: skill => skill.tokens }
    }
    if (id.endsWith('/utils/format.js')) {
      return { formatTokens: value => String(value) }
    }
    if (id.endsWith('/utils/settings/constants.js')) {
      return { getSettingSourceName: value => value.replace('Settings', '') }
    }
    if (id.endsWith('/utils/settings/settings.js')) {
      return { getSettingsForSource: value => settings[value] ?? null }
    }
    if (id.endsWith('/utils/stringUtils.js')) {
      return { plural: (count, word) => (count === 1 ? word : `${word}s`) }
    }
    if (id.endsWith('/design-system/Dialog.js')) return { Dialog: 'Dialog' }
    if (id.endsWith('/design-system/Select.js')) {
      return { Select, useSelectItemFocus: () => false }
    }
    throw new Error(`unexpected SkillsMenu import: ${id}`)
  }
  const module = { exports: {} }
  new Function('require', 'exports', 'module', javascript)(
    require,
    module.exports,
    module,
  )
  const tree = module.exports.SkillsMenu({
    commands,
    onExit: (...args) => exitCalls.push(args),
  })
  return {
    exitCalls,
    keybindings,
    keybindingOptions,
    stateSlots,
    subtitle: tree.props.subtitle,
    text: flattenText(tree),
  }
}

test(
  'authenticated target105 pins SkillsMenu override helpers and UI',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath || !latestPath
        ? 'authenticated 2.1.104, 2.1.105, and 2.1.116 bundles are required'
        : false,
  },
  () => {
    const artifacts = [
      [baselinePath, 'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39', 0, 0, 1],
      [targetPath, '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75', 7, 1, 0],
      [latestPath, 'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a', 7, 1, 0],
    ]
    const contents = artifacts.map(
      ([filename, hash, overrideCount, footerCount, oldTokenCount]) => {
        const bytes = fs.readFileSync(filename)
        assert.equal(sha256(bytes), hash)
        const text = bytes.toString('utf8')
        assert.equal(occurrences(text, 'skillOverrides'), overrideCount)
        assert.equal(
          occurrences(text, 'Plugin skills are managed via /plugin'),
          footerCount,
        )
        assert.equal(occurrences(text, 'description tokens'), oldTokenCount)
        return text
      },
    )

    const target = contents[1]
    for (const [index, [nodeType, start, end, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
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

    const menu = target.slice(11197836, 11201916)
    for (const fragment of [
      'T1("localSettings")?.skillOverrides??{}',
      'J.get(X6)?.value??w[X6.name]??j.get(X6.name)??"on"',
      'a3("select:accept","Settings","space")',
      'a3("settings:close","Settings","enter")',
      '"select:previous"',
      '"select:next"',
      '"settings:close"',
      'No skills found',
      'locked by ${j6.source}',
      'Plugin skills are managed via /plugin',
    ]) assert.ok(menu.includes(fragment), fragment)
    assert.equal(menu.includes('settings:sortByTokens'), false)
    assert.equal(contents[0].includes('settings:sortByTokens'), false)
    assert.ok(contents[2].includes('settings:sortByTokens'))
    assert.ok(contents[2].includes('sorted by tokens'))
  },
)

test(
  'source root owns target105 override UI or the preserved target116 evolution',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const contents = source()
    for (const fragment of [
      "type SkillOverride = 'on' | 'name-only' | 'user-invocable-only' | 'off'",
      "getSkillOverrides('policySettings')",
      "getSkillOverrides('flagSettings')",
      "getSkillOverrides('projectSettings')",
      "getSkillOverrides('userSettings')",
      "getSkillOverrides('localSettings')",
      "source: 'author'",
      "source: 'plugin'",
      'lockedOverrides.get(skill)?.value',
      'localOverrides[skill.name]',
      'inheritedOverrides.get(skill.name)',
      "getShortcutDisplay(\n    'select:accept'",
      "getShortcutDisplay(\n    'settings:close'",
      'Plugin skills are managed via /plugin',
      'locked by ${',
      '} tok`',
    ]) assert.ok(contents.includes(fragment), fragment)
    for (const fragment of [
      'ConfigurableShortcutHint',
      'getSkillsPath',
      'description tokens',
    ]) assert.equal(contents.includes(fragment), false, fragment)

    const target105Mode = !contents.includes('settings:sortByTokens')
    if (target105Mode) {
      assert.ok(contents.includes('const visibleCount = clamp(rows - 8'))
      assert.ok(contents.includes("'select:previous':"))
      assert.ok(contents.includes("'select:next':"))
      assert.ok(contents.includes('figures.arrowUp'))
      assert.ok(contents.includes('figures.arrowDown'))
      assert.equal(contents.includes('useSelectItemFocus'), false)
      assert.equal(contents.includes('sortByTokens'), false)
    } else {
      assert.ok(contents.includes("'settings:sortByTokens':"))
      assert.ok(contents.includes('sorted by tokens'))
      assert.ok(contents.includes('useSelectItemFocus'))
      assert.ok(contents.includes('<Select'))
    }
  },
)

test(
  'executable menu resolves locks, renders provenance, and wires close controls',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const contents = source()
    const target105Mode = !contents.includes('settings:sortByTokens')
    const result = await executeMenu(contents)
    assert.equal(result.keybindingOptions.context, 'Settings')
    assert.equal(result.keybindingOptions.isActive, true)
    assert.equal(typeof result.keybindings['select:accept'], 'function')
    assert.equal(typeof result.keybindings['settings:close'], 'function')
    assert.equal(typeof result.keybindings['confirm:no'], 'function')
    assert.ok(result.subtitle.includes('7 skills'))
    assert.ok(result.subtitle.includes('to close'))
    assert.ok(result.text.includes('🔒 off'))
    assert.ok(result.text.includes('locked by policy'))
    assert.ok(result.text.includes('locked by author'))
    assert.ok(result.text.includes('locked by plugin'))
    assert.ok(result.text.includes('Plugin skills are managed via /plugin'))
    assert.ok(result.text.includes('~10 tok'))
    result.keybindings['settings:close']()
    assert.deepEqual(result.exitCalls, [
      ['Skills dialog dismissed', { display: 'system' }],
    ])
    if (target105Mode) {
      assert.equal(typeof result.keybindings['select:previous'], 'function')
      assert.equal(typeof result.keybindings['select:next'], 'function')
      assert.equal(result.keybindings['settings:sortByTokens'], undefined)
    } else {
      assert.equal(result.keybindings['select:previous'], undefined)
      assert.equal(result.keybindings['select:next'], undefined)
      assert.equal(
        typeof result.keybindings['settings:sortByTokens'],
        'function',
      )
    }
  },
)
