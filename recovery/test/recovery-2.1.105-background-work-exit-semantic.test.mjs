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

function readStructural(relativePath) {
  return JSON.parse(
    gunzipSync(fs.readFileSync(path.join(repositoryRoot, relativePath))),
  )
}

const structural = readStructural(
  'recovery/cases/2.1.104-to-2.1.105/structural/generated-delta.json.gz',
)
const latestStructural = readStructural(
  'recovery/cases/2.1.114-to-2.1.116/structural/generated-delta.json.gz',
)

const units = new Map([
  [15903, ['unresolved', 'FunctionDeclaration', 11538051, 11539215, '90086ec593027ee7c303f85fdb7b705d4dba9fdad83f230954c7cb038f472c75']],
  [15904, ['unresolved', 'FunctionDeclaration', 11539215, 11539416, 'f6875a28a273cabc653f844cc041c8ff3c5a5ac8030cd84c8b61d4c5ba333694']],
  [15914, ['unresolved', 'FunctionDeclaration', 11544380, 11544959, '0f6a4d571b9144cddb07649b147263e2013e74631be18acdcd43a58a8e9af1f7']],
  [15918, ['unresolved', 'FunctionDeclaration', 11545099, 11545231, 'e81b02dd7b06862c4d1b35fa53f88c24adf1b8624b86b7114ad1e3cc76afa1b9']],
  [15924, ['unresolved', 'FunctionDeclaration', 11545358, 11545567, '8a7d83a0f888af0ece6379913f774b4bc19700baadf208ef75477f3bb94c3c77']],
  [18386, ['unresolved', 'FunctionDeclaration', 12731362, 12789746, 'a19619e44713e41b4e5b83d8f9e5e8a67ef9553396a241a74ccc40f4a7980e32']],
])

const latestDialogUnit = [
  17410,
  'unresolved',
  'FunctionDeclaration',
  10838646,
  10840476,
  'b8924d1a452cb6e1b704e8d42688e6cdb1218b962147d7fef7a49f8981165e41',
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
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
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
}

async function executeDialog(contents, options = {}) {
  const events = []
  const elements = []
  const createElement = (type, props, ...children) => {
    const element = { type, props: { ...(props ?? {}), children } }
    elements.push(element)
    return element
  }
  const React = { createElement }
  const module = { exports: {} }
  const require = id => {
    if (id === 'react') {
      return {
        __esModule: true,
        default: React,
        useCallback: callback => callback,
      }
    }
    if (id.endsWith('/analytics/index.js')) {
      return { logEvent: (name, fields) => events.push([name, fields]) }
    }
    if (id.endsWith('/ink.js')) return { Box: 'Box', Text: 'Text' }
    if (id.endsWith('/modalContext.js')) {
      return { useIsInsideModal: () => options.insideModal ?? false }
    }
    if (id.endsWith('/useTerminalSize.js')) {
      return { useTerminalSize: () => ({ rows: options.rows ?? 40, columns: 80 }) }
    }
    if (id.endsWith('/fullscreen.js')) {
      return { isFullscreenEnvEnabled: () => options.fullscreen ?? false }
    }
    if (id.endsWith('/CustomSelect/select.js')) return { Select: 'Select' }
    if (id.endsWith('/design-system/Dialog.js')) return { Dialog: 'Dialog' }
    throw new Error(`unexpected BackgroundWorkExitDialog import: ${id}`)
  }
  const javascript = await transpileCommonJs(contents)
  new Function('require', 'exports', 'module', javascript)(
    require,
    module.exports,
    module,
  )
  return { component: module.exports.BackgroundWorkExitDialog, elements, events }
}

test(
  'authenticated target105 introduces the complete background-work exit graph and target116 caps it to the viewport',
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
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }

    const [latestIndex, latestClass, latestType, latestStart, latestEnd, latestHash] =
      latestDialogUnit
    const latestRegion = latestStructural.regions[latestIndex]
    assert.deepEqual(
      [
        latestRegion.classification,
        latestRegion.target.nodeType,
        latestRegion.target.start,
        latestRegion.target.end,
        latestRegion.target.sourceHash,
      ],
      [latestClass, latestType, latestStart, latestEnd, latestHash],
    )
    assert.equal(
      sha256(latest.slice(latestStart, latestEnd)),
      latestHash,
      'target116 dialog identity',
    )

    for (const fragment of [
      'tengu_exit_background_work_prompt',
      'Background work is running',
      'The following will stop when you exit:',
      'label:"scheduled task"',
      'backgroundItems',
    ]) {
      assert.equal(baseline.includes(fragment), false, `${fragment}: baseline104`)
      assert.equal(target.includes(fragment), true, `${fragment}: target105`)
      assert.equal(latest.includes(fragment), true, `${fragment}: target116`)
    }
    const targetDialog = target.slice(11538051, 11539215)
    assert.equal(targetDialog.includes('.slice(0,'), false)
    assert.equal(targetDialog.includes(' more"'), false)
    const latestDialog = latest.slice(latestStart, latestEnd)
    assert.ok(latestDialog.includes('Math.floor(D/2)'))
    assert.ok(latestDialog.includes('Math.max(1,J-12)'))
    assert.ok(latestDialog.includes('.slice(0,L)'))
    assert.ok(latestDialog.includes('" more"'))
    assert.ok(target.slice(11545099, 11545231).includes('DF(K.cron)'))
    assert.ok(latest.includes('Runs once in '))
  },
)

test(
  'source root owns the exit choice, scheduled-task reachability, and exact historical/latest rendering split',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const dialog = source('components/BackgroundWorkExitDialog.tsx')
    const exitFlow = source('components/ExitFlow.tsx')
    const exitCommand = source('commands/exit/exit.tsx')
    const repl = source('screens/REPL.tsx')
    const target105Mode = !dialog.includes('visibleCount')

    for (const fragment of [
      "logEvent('tengu_exit_background_work_prompt'",
      'item_count: items.length',
      'chose_exit: choseExit',
      'title="Background work is running"',
      'subtitle="The following will stop when you exit:"',
      "{ label: 'Exit anyway', value: 'exit' }",
      "{ label: 'Stay', value: 'stay' }",
    ]) assert.ok(dialog.includes(fragment), `dialog: ${fragment}`)
    for (const fragment of [
      'backgroundItems?: readonly BackgroundWorkExitItem[]',
      'backgroundItems && backgroundItems.length > 0',
      '<BackgroundWorkExitDialog',
    ]) assert.ok(exitFlow.includes(fragment), `ExitFlow: ${fragment}`)
    for (const fragment of [
      'export function getScheduledBackgroundItems()',
      "label: 'scheduled task'",
      'backgroundItems.length > 0',
      'backgroundItems={backgroundItems}',
    ]) assert.ok(exitCommand.includes(fragment), `exit command: ${fragment}`)
    for (const fragment of [
      "import { getScheduledBackgroundItems } from '../commands/exit/exit.js'",
      'const backgroundItems = getScheduledBackgroundItems()',
      'showWorktree || backgroundItems.length > 0',
      'backgroundItems={backgroundItems}',
    ]) assert.ok(repl.includes(fragment), `REPL: ${fragment}`)

    if (target105Mode) {
      assert.ok(exitCommand.includes('cronToHuman(task.cron)'))
      assert.equal(dialog.includes('items.slice(0, visibleCount)'), false)
      assert.equal(dialog.includes('…and {hiddenCount} more'), false)
    } else {
      for (const fragment of [
        'useTerminalSize()',
        'useIsInsideModal()',
        '!insideModal && isFullscreenEnvEnabled()',
        'Math.floor(rows / 2)',
        'Math.max(1, availableRows - 12)',
        'items.slice(0, visibleCount)',
        '…and {hiddenCount} more',
        'formatSessionCronTask(task)',
        'Runs once in ${formatDuration(',
      ]) assert.ok(
        dialog.includes(fragment) || exitCommand.includes(fragment),
        `target116 source: ${fragment}`,
      )
    }

    const runtime = await executeDialog(dialog, {
      rows: 20,
      fullscreen: true,
      insideModal: false,
    })
    let exited = 0
    let cancelled = 0
    runtime.component({
      items: [
        { label: 'one', detail: 'first' },
        { label: 'two' },
        { label: 'three' },
      ],
      onExit: () => exited++,
      onCancel: () => cancelled++,
    })
    const select = runtime.elements.find(element => element.type === 'Select')
    const renderedRows = runtime.elements.filter(element => element.type === 'Box')
    assert.ok(select, 'select element is reachable')
    select.props.onChange('stay')
    select.props.onChange('exit')
    assert.equal(cancelled, 1)
    assert.equal(exited, 1)
    assert.deepEqual(runtime.events, [
      ['tengu_exit_background_work_prompt', { item_count: 3, chose_exit: false }],
      ['tengu_exit_background_work_prompt', { item_count: 3, chose_exit: true }],
    ])
    if (target105Mode) assert.ok(renderedRows.length >= 4)
    else {
      assert.ok(renderedRows.length < 4, 'target116 caps visible item rows')
      assert.ok(
        runtime.elements.some(element =>
          element.props.children.flat().includes('…and '),
        ),
        'target116 renders the overflow count',
      )
    }
  },
)

test(
  'target105 source graph is absent at the authenticated baseline boundary',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.104 and 2.1.105 bundles are required'
        : false,
  },
  () => {
    const baseline = fs.readFileSync(baselinePath, 'utf8')
    const target = fs.readFileSync(targetPath, 'utf8')
    assert.equal(baseline.includes('tengu_exit_background_work_prompt'), false)
    assert.equal(baseline.includes('label:"scheduled task"'), false)
    assert.ok(target.includes('tengu_exit_background_work_prompt'))
    assert.ok(target.includes('label:"scheduled task"'))
  },
)
