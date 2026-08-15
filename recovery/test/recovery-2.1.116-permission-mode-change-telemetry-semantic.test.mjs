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
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
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

const targetUnits = new Map([
  [9056, [4256925, 4257060, 'FunctionDeclaration', '2f0877e8e1236d23e58803d0a5439bcbdec5e32f5ca397ac22710bc17e7778bb']],
  [13249, [8419054, 8425231, 'VariableDeclaration', '7063238b3f64ab04c74d988375c05463ce26c1b5a69243b15b4edad4531733e1']],
  [14869, [9294307, 9294795, 'FunctionDeclaration', 'e22808484d7ddb3ae11481f748d4e3a2f67c85f99208b4b44099c13bb0898a85']],
  [14877, [9299863, 9301807, 'FunctionDeclaration', '7d797fa017f61a2f8a298898c4585be1f4db1b447402825ce4b9467144533f08']],
  [18809, [11570823, 11580773, 'FunctionDeclaration', '12124919d3f3e396548d68b20308c9421b7e084655f6f243c08203ed79e0dc90']],
  [19083, [11716342, 11716421, 'FunctionDeclaration', '0e9937b14b4e48fddc671d5d79a93932dae97386459f7df813e9065174f686aa']],
  [19329, [11803951, 11831855, 'FunctionDeclaration', '997c52d29b50bc489a62979e07f11275e0da97d2e5cd7ce05c534b8f8148f609']],
])

const addedOccurrences = [
  ['"permission_mode_changed"', 4256967, 4256992, true],
  ['from_mode', 4256994, 4257003, false],
  ['to_mode', 4257011, 4257018, false],
  ['"auto_gate_denied"', 9301315, 9301333, true],
  ['"shift_tab"', 11821689, 11821700, true],
  ['"auto_opt_in"', 11821999, 11822012, true],
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function extractFunction(contents, marker) {
  const start = contents.indexOf(marker)
  assert.notEqual(start, -1, marker)
  const parametersStart = contents.indexOf('(', start)
  let parameterDepth = 0
  let parametersEnd = -1
  for (let index = parametersStart; index < contents.length; index += 1) {
    if (contents[index] === '(') parameterDepth += 1
    if (contents[index] === ')') {
      parameterDepth -= 1
      if (parameterDepth === 0) {
        parametersEnd = index
        break
      }
    }
  }
  assert.notEqual(parametersEnd, -1, `${marker} parameters`)
  const bodyStart = contents.indexOf('{', parametersEnd)
  assert.notEqual(bodyStart, -1, `${marker} body`)
  let depth = 0
  for (let index = bodyStart; index < contents.length; index += 1) {
    if (contents[index] === '{') depth += 1
    if (contents[index] === '}') {
      depth -= 1
      if (depth === 0) return contents.slice(start, index + 1)
    }
  }
  assert.fail(`unterminated function: ${marker}`)
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

async function compileCommonJs(contents) {
  const ts = await loadTypeScript()
  return ts.transpileModule(contents, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
}

function executeCommonJs(javascript) {
  const module = { exports: {} }
  new Function('exports', 'module', javascript)(module.exports, module)
  return module.exports
}

test(
  'authenticated target116 adds permission-mode telemetry at all new trigger edges',
  bundleOptions,
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
    for (const [index, identity] of targetUnits) {
      const region = structural.regions[index]
      assert.notEqual(region.classification, 'matched')
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        identity,
      )
      assert.equal(
        sha256(targetBytes.subarray(identity[0], identity[1])),
        identity[3],
      )
    }

    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    for (const [value, start, end, baselineAbsent] of addedOccurrences) {
      if (baselineAbsent) assert.equal(baseline.split(value).length - 1, 0, value)
      assert.equal(target.slice(start, end), value)
    }

    const helper = target.slice(4256925, 4257060)
    const helperName = /^function ([A-Za-z_$][\w$]*)\(/.exec(helper)?.[1]
    assert.ok(helperName)
    for (const fragment of [
      '.from===H.to)return',
      '"permission_mode_changed"',
      'from_mode:H.from',
      'to_mode:H.to',
      'trigger:H.trigger',
    ]) {
      assert.ok(helper.includes(fragment), fragment)
    }
    assert.equal(target.split(`${helperName}(`).length - 1, 8)
    assert.equal(target.slice(8419054, 8425231).split(`${helperName}(`).length - 1, 1)
    assert.equal(target.slice(9294307, 9294795).split(`${helperName}(`).length - 1, 1)
    assert.equal(target.slice(9299863, 9301807).split(`${helperName}(`).length - 1, 1)
    assert.equal(target.slice(11570823, 11580773).split(`${helperName}(`).length - 1, 4)
    assert.match(target.slice(11716342, 11716421), /function [\w$]+\([^)]*,[^)]*,[^)]*\).*\([^,]+,[^,]+,[^,]+,[^)]+\)/)
    assert.ok(target.slice(11803951, 11831855).includes('"shift_tab"'))
    assert.ok(target.slice(11803951, 11831855).includes('"auto_opt_in"'))
  },
)

test('source owns the helper and exact seven reachable logging edges', sourceOptions, () => {
  const events = source('utils/telemetry/events.ts')
  const setup = source('utils/permissions/permissionSetup.ts')
  const cycle = source('utils/permissions/getNextPermissionMode.ts')
  const prompt = source('components/PromptInput/PromptInput.tsx')
  const tool = source('tools/ExitPlanModeTool/ExitPlanModeV2Tool.ts')
  const dialog = source(
    'components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx',
  )

  for (const fragment of [
    'export function logPermissionModeChanged(values:',
    "void logOTelEvent('permission_mode_changed'",
    'from_mode: values.from',
    'to_mode: values.to',
    '...(values.trigger && { trigger: values.trigger })',
  ]) {
    assert.ok(events.includes(fragment), fragment)
  }
  assert.equal(setup.split('logPermissionModeChanged({').length - 1, 2)
  assert.ok(setup.includes('logPermissionModeChanged({ from: fromMode, to: toMode, trigger })'))
  assert.ok(setup.includes("trigger: 'auto_gate_denied'"))
  assert.ok(cycle.includes('trigger?: string'))
  assert.match(cycle, /toolPermissionContext,\s*trigger,\s*\)/)
  assert.ok(prompt.includes("cyclePermissionMode(toolPermissionContext, teamContext, 'shift_tab')"))
  assert.ok(prompt.includes("toolPermissionContext, 'auto_opt_in')"))
  assert.equal(tool.split('logPermissionModeChanged({').length - 1, 1)
  assert.equal(dialog.split('logPermissionModeChanged({').length - 1, 4)
  assert.equal(
    [events, setup, tool, dialog]
      .map(contents => contents.split('logPermissionModeChanged(').length - 1)
      .reduce((sum, count) => sum + count, 0),
    8,
  )
})

test('actual recovered helper suppresses no-ops and preserves trigger metadata', sourceOptions, async () => {
  const helper = extractFunction(
    source('utils/telemetry/events.ts'),
    'export function logPermissionModeChanged',
  )
  const transition = extractFunction(
    source('utils/permissions/permissionSetup.ts'),
    'export function transitionPermissionMode',
  )
  const javascript = await compileCommonJs(`
    const emitted: unknown[] = []
    function logOTelEvent(name: string, metadata: unknown) {
      emitted.push([name, metadata])
    }
    ${helper}

    type ToolPermissionContext = { mode: string; prePlanMode?: string }
    const transitionCalls: unknown[] = []
    function handlePlanModeTransition(from: string, to: string) {
      transitionCalls.push(['plan', from, to])
    }
    function handleAutoModeTransition(from: string, to: string) {
      transitionCalls.push(['auto', from, to])
    }
    function setHasExitedPlanMode(value: boolean) {
      transitionCalls.push(['exited-plan', value])
    }
    const feature = () => false
    ${transition}
    export {
      emitted,
      transitionCalls,
      logPermissionModeChanged,
      transitionPermissionMode,
    }
  `)
  const recovered = executeCommonJs(javascript)

  recovered.logPermissionModeChanged({ from: 'default', to: 'default' })
  recovered.logPermissionModeChanged({ from: 'default', to: 'acceptEdits' })
  recovered.logPermissionModeChanged({
    from: 'plan',
    to: 'auto',
    trigger: 'exit_plan_mode',
  })
  assert.deepEqual(recovered.emitted, [
    [
      'permission_mode_changed',
      { from_mode: 'default', to_mode: 'acceptEdits' },
    ],
    [
      'permission_mode_changed',
      { from_mode: 'plan', to_mode: 'auto', trigger: 'exit_plan_mode' },
    ],
  ])

  const context = { mode: 'default' }
  assert.equal(
    recovered.transitionPermissionMode('default', 'default', context),
    context,
  )
  recovered.transitionPermissionMode(
    'default',
    'acceptEdits',
    context,
    'shift_tab',
  )
  assert.deepEqual(recovered.emitted.at(-1), [
    'permission_mode_changed',
    { from_mode: 'default', to_mode: 'acceptEdits', trigger: 'shift_tab' },
  ])
  assert.deepEqual(recovered.transitionCalls, [
    ['plan', 'default', 'acceptEdits'],
    ['auto', 'default', 'acceptEdits'],
  ])
})
