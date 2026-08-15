import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
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

const targetUnit = [
  20544,
  12881861,
  12883720,
  '0cc2fe4aa081c8dcc93f1e951d1015b1b480e6a0e8bd02d379e239f847e91dd1',
]
const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function assertFragments(relative, fragments) {
  const contents = source(relative)
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
  }
  return contents
}

test('target 2.1.116 pins the complete side-question fallback function', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath)
  const target = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(baseline), baselineSha256)
  assert.equal(sha256(target), targetSha256)

  const [index, start, end, sourceHash] = targetUnit
  const region = structural.regions[index]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [start, end, sourceHash],
  )
  assert.equal(sha256(target.toString('utf8').slice(start, end)), sourceHash)
})

test('the five live state getters are introduced at the 114 to 116 boundary', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  const baselineStart = baseline.lastIndexOf('async function', 12775211)
  const baselineEnd = baseline.indexOf('var xP6=', baselineStart)
  const baselineFunction = baseline.slice(baselineStart, baselineEnd)
  const [, start, end] = targetUnit
  const targetFunction = target.slice(start, end)

  for (const fragment of [
    'getToolPermissionContext:()=>',
    'getEffortValue:()=>',
    'getAutoCompactWindow:()=>',
    'getFastMode:()=>',
    'getCacheBreakerPhrase:()=>',
  ]) {
    assert.equal(baselineFunction.includes(fragment), false, `${fragment}: baseline`)
    assert.equal(targetFunction.includes(fragment), true, `${fragment}: target`)
  }

  for (const inherited of [
    'taskRegistry:',
    'sessionHooksRegistry:',
    'setClassifierApprovals:',
    'setReplContext:',
    'setWebBrowserSlice:',
    'abortSpeculation:',
    'agentLifecycle:',
    'teammateColors:',
  ]) {
    assert.equal(baselineFunction.includes(inherited), true, `${inherited}: baseline`)
    assert.equal(targetFunction.includes(inherited), true, `${inherited}: target`)
  }
})

test('source builds the target prompt and live tool-use context', sourceOptions, () => {
  const owner = assertFragments('src/utils/queryContext.ts', [
    "typeof customSystemPrompt === 'string'",
    'Array.isArray(customSystemPrompt)',
    ': defaultSystemPrompt',
    'getToolPermissionContext: () => getAppState().toolPermissionContext',
    'getEffortValue: () => getAppState().effortValue',
    'getAutoCompactWindow: () => getAppState().autoCompactWindow',
    'getFastMode: () => getAppState().fastMode',
    'getCacheBreakerPhrase: () => getAppState().cacheBreakerPhrase',
    'taskRegistry: createTaskRegistry(getAppState, setAppState)',
    'sessionHooksRegistry: createSessionHooksRegistry(setAppState)',
    'setClassifierApprovals: createClassifierApprovalsSetter(setAppState)',
    'setReplContext: createReplContextSetter(setAppState)',
    'setWebBrowserSlice: createWebBrowserSliceSetter(setAppState)',
    'abortSpeculation: () => abortSpeculation(setAppState)',
    'agentLifecycle: createAgentLifecycle(setAppState)',
    'teammateColors: createTeammateColors(getAppState, setAppState)',
    'addResponseLength: () => {}',
    'resetResponseLength: () => {}',
    'getFileHistoryState: () => undefined',
    'applyFileHistoryOp: () => {}',
    'applyAttributionOp: () => {}',
  ])
  assert.ok(
    owner.indexOf("typeof customSystemPrompt === 'string'") <
      owner.indexOf('Array.isArray(customSystemPrompt)'),
  )
  assert.ok(
    owner.indexOf('getToolPermissionContext: () =>') <
      owner.indexOf('setToolPermissionContext:'),
  )
})

test('permission, registry, lifecycle, and browser updates preserve target identity rules', sourceOptions, () => {
  const owner = assertFragments('src/utils/queryContext.ts', [
    "typeof updater === 'function'",
    'previous.toolPermissionContext === toolPermissionContext',
    "if (!(agentId in previous.replContexts)) return previous",
    'if (updated === slice) return previous',
    'previous.agentTypesInvokedThisSession.has(agentType)',
    'if (previous.agentNameRegistry.get(name) === agentId) return previous',
    "if (!(agentId in previous.todos)) return previous",
    'const existing = colors.assignments.get(teammateId)',
    'if (previousColors.assignments.has(teammateId)) return previous',
    'index: previousColors.index + 1',
  ])
  // The exact target116 tree keeps these setters inline. The cumulative
  // current tree may factor them into dedicated helpers without changing the
  // identity-preserving guards, so authenticate whichever source orientation
  // the selected root actually owns.
  if (owner.includes("if (!(taskId in previous.tasks)) return previous")) {
    assert.ok(owner.includes("if (!(taskId in previous.tasks)) return previous"))
    assert.ok(
      owner.includes(
        'if (classifierApprovals === previous.classifierApprovals) return previous',
      ),
    )
  } else {
    assertFragments('src/utils/task/framework.ts', [
      'export function createTaskRegistry(',
      "if (!(taskId in previous.tasks)) return previous",
    ])
    assertFragments('src/utils/classifierApprovals.ts', [
      'export function createClassifierApprovalsSetter',
      'if (classifierApprovals === previous.classifierApprovals) return previous',
    ])
  }
  assert.ok(
    owner.indexOf('previous.toolPermissionContext === toolPermissionContext') <
      owner.indexOf('taskRegistry: createTaskRegistry'),
  )
})

test('AppState initializes every state slice consumed by the fallback context', sourceOptions, () => {
  assertFragments('src/state/AppStateStore.ts', [
    'classifierApprovals: {',
    'approvals: new Map()',
    'checking: new Set()',
    'teammateColors: {',
    'assignments: new Map()',
    'index: 0',
    'webBrowser: {',
    'view: undefined',
    'logs: []',
    'unreadErrors: 0',
    'unreadWarnings: 0',
    'cleanupRegistered: false',
  ])
})
