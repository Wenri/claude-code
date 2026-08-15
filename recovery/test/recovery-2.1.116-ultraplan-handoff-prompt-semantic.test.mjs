import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const selected =
  !process.env.CLAUDE_CODE_SEMANTIC_CASE ||
  process.env.CLAUDE_CODE_SEMANTIC_CASE === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${process.env.CLAUDE_CODE_SEMANTIC_CASE}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
      : false,
}

const exactMessage =
  "I'm sending this plan to Ultraplan to be refined remotely. Let me know it's been handed off and that a web link will appear here in a moment — I can use that to edit and iterate on the plan in the browser once the plan has been generated. I can continue to work here in the meantime; Claude Code will notify me when the cloud plan is ready for review, and I have the option to teleport the plan back here for implementation post-approval."

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

async function extractHandleResponse(contents) {
  const ts = await loadTypeScript()
  const sourceFile = ts.createSourceFile(
    'ExitPlanModePermissionRequest.tsx',
    contents,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  let found
  function visit(node) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === 'handleResponse'
    ) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.ok(found, 'handleResponse function')
  return contents.slice(found.getStart(sourceFile), found.end)
}

async function compileHandleResponse(contents) {
  const ts = await loadTypeScript()
  const handleResponse = await extractHandleResponse(contents)
  return ts.transpileModule(
    `${handleResponse}\nmodule.exports = { handleResponse }`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
}

test(
  'authenticated target116 replaces the local wait message with the complete remote handoff contract',
  bundleOptions,
  () => {
    const baseline = fs.readFileSync(baselinePath, 'utf8')
    const target = fs.readFileSync(targetPath, 'utf8')
    assert.equal(
      sha256(baseline),
      'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
    )
    assert.equal(
      sha256(target),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )

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
    assert.deepEqual(structural.regions[18809].target, {
      index: 18809,
      nodeType: 'FunctionDeclaration',
      parseStatus: 'parsed',
      start: 11570823,
      end: 11580773,
      tokenCount: 3227,
      sourceHash:
        '12124919d3f3e396548d68b20308c9421b7e084655f6f243c08203ed79e0dc90',
      coarseHash:
        '7b980272d5b201cef7279b22b61c9e37ea0519aafff74b0c996b8e68b128345f',
      location: { line: 8270, column: 17259 },
      topDefinitionCount: 1,
    })
    const predecessor = structural.unmatchedBaseline.find(
      unit => unit.index === 18599,
    )
    assert.deepEqual(predecessor, {
      index: 18599,
      nodeType: 'FunctionDeclaration',
      parseStatus: 'parsed',
      start: 11495453,
      end: 11504805,
      tokenCount: 3159,
      sourceHash:
        '6165cf7f88b218c95110bec8bd36c1fde34e7f0352354ccd2ec8f5be16bccb8b',
      coarseHash:
        '1c4815579feaa9377ddf589f054290091d4a4bf8769d287141bf4424a20f3581',
      location: { line: 8251, column: 17249 },
      topDefinitionCount: 1,
    })
    assert.equal(
      baseline.slice(11497646, 11497713),
      'Plan being refined via Ultraplan \\u2014 please wait for the result.',
    )
    assert.equal(
      target.slice(11573029, 11573474),
      `"${exactMessage.replace('—', '\\u2014')}"`,
    )
    assert.equal(baseline.includes(exactMessage.replace('—', '\\u2014')), false)
  },
)

test(
  'source owns the exact prompt and reuses one notification callback for progress and completion',
  sourceOptions,
  async () => {
    const contents = fs.readFileSync(
      path.join(
        sourceRoot,
        'components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx',
      ),
      'utf8',
    )
    const fn = await extractHandleResponse(contents)
    assert.equal(fn.includes(`toolUseConfirm.onReject(\"${exactMessage}\")`), true)
    assert.match(fn, /const onStatusMessage = \(message: string\) =>/)
    assert.match(fn, /onStatusMessage,\s*\}\)\.then\(onStatusMessage\)\.catch\(logError\)/s)
    assert.equal(fn.includes('Plan being refined via Ultraplan'), false)
  },
)

test(
  'the recovered branch rejects locally and reports both remote status channels',
  sourceOptions,
  async () => {
    const contents = fs.readFileSync(
      path.join(
        sourceRoot,
        'components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx',
      ),
      'utf8',
    )
    const javascript = await compileHandleResponse(contents)
    const calls = []
    const injected = {
      planFeedback: '',
      currentPlan: '# exact plan',
      logEvent: (...args) => calls.push(['event', ...args]),
      isPlanModeInterviewPhaseEnabled: () => true,
      planStructureVariant: 'variant',
      onDone: () => calls.push(['done']),
      onReject: () => calls.push(['reject']),
      toolUseConfirm: {
        onReject: message => calls.push(['tool-reject', message]),
      },
      enqueuePendingNotification: value => calls.push(['notification', value]),
      launchUltraplan: options => {
        calls.push(['launch', options])
        options.onStatusMessage('progress')
        return Promise.resolve('complete')
      },
      store: {
        getState: () => ({}),
        setState: () => {},
      },
      logError: error => calls.push(['error', error]),
    }
    const names = Object.keys(injected)
    const module = { exports: {} }
    new Function(...names, 'exports', 'module', javascript)(
      ...names.map(name => injected[name]),
      module.exports,
      module,
    )
    await module.exports.handleResponse('ultraplan')
    await Promise.resolve()

    assert.deepEqual(calls.filter(call => call[0] === 'done'), [['done']])
    assert.deepEqual(calls.filter(call => call[0] === 'reject'), [['reject']])
    assert.deepEqual(calls.find(call => call[0] === 'tool-reject'), [
      'tool-reject',
      exactMessage,
    ])
    assert.deepEqual(
      calls
        .filter(call => call[0] === 'notification')
        .map(([, value]) => value),
      [
        { value: 'progress', mode: 'task-notification' },
        { value: 'complete', mode: 'task-notification' },
      ],
    )
    const launch = calls.find(call => call[0] === 'launch')[1]
    assert.equal(launch.arg, '')
    assert.equal(launch.source, 'exit_plan_mode')
    assert.equal(launch.seedPlan, '# exact plan')
    assert.equal(typeof launch.onStatusMessage, 'function')
  },
)
