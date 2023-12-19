import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.107-to-2.1.108'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const historicalTarget108 = Boolean(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT && semanticCase === caseName,
)
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_107_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_108_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_107_BUNDLE and CLAUDE_CODE_2_1_108_BUNDLE are required'
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

const units = new Map([
  [5128, [3762449, 3762684, 'FunctionDeclaration', '416772fad8f4c5ee4a14adf1cbb64e7f0cbaf6a50f5f68176f93cd99a35ab5a7']],
  [11642, [8952544, 8956864, 'FunctionDeclaration', '29f4e244cb42816ade8c3b289a7ee9d5d9006b44001de45d847e665f2cd89b12']],
  [11658, [8959148, 8960320, 'FunctionDeclaration', 'dd5f7d363f2751cd1b85628c3ffa27e17d96ab9b32bef833593d9631c41e869f']],
  [11677, [8970511, 8972795, 'FunctionDeclaration', 'f6b9cc76ecc161001f4e153549cc3f85fac110701b656f5064ef05cfbde2302a']],
  [11680, [8972896, 8972919, 'ImportDeclaration', '52864c3c5590e3350e4c033bd077d8bb1af234b3347eadddc6bd742f12905a05']],
  [11690, [8979315, 8980318, 'FunctionDeclaration', 'c6eee444c30abcdfb7785faa9703b4caadcc39303a7a5317410d6472d80b3a05']],
  [11694, [8980905, 8980928, 'ImportDeclaration', '127f97ed23f435532e9c16a00c33a9e8019d319fdc41358c1cadfa0d27226da2']],
  [11701, [8982129, 8982692, 'FunctionDeclaration', '5c827fda6610f05d6fca0b5d1143739b27ed59a47f17a031344951ba7f312ec4']],
  [11704, [8983163, 8984310, 'FunctionDeclaration', '150e20cce2513791f1f9094631dc436cb6b5986fd11ecc02edd9a0b851f0f406']],
  [11706, [8984524, 8984776, 'FunctionDeclaration', 'ee290611468a6e8421e5828418994f0adb83835903e680a345cc3eb81df93cac']],
  [11716, [8985596, 8985619, 'ImportDeclaration', '8e2f04ca3acd29ed6a823f2b8cb22f6e443e5fd54c3a788117c317c29b1ce44e']],
  [11727, [8987399, 8992777, 'VariableDeclaration', 'd6b8afa5fdb871ae5959054271a71804e6da28911589d5efb4a0537e4f586b3b']],
  [12055, [9149868, 9151376, 'FunctionDeclaration', '7c71488d090fb2e5accda678009147e27d598fefcf5ff603b2952638a03cba6d']],
  [12118, [9176003, 9190057, 'FunctionDeclaration', '988e1fb7baa1036f2aec07e4041da8972b3ad0d595cf33ae54de3620207e2883']],
  [12129, [9192140, 9194093, 'FunctionDeclaration', '57013c05321582d0ce648ebe96b432be2bd6a472fe32ccbe7118904d06e96a80']],
  [12490, [9372952, 9373843, 'FunctionDeclaration', '5aa6e5cc195a116386b4e0ee037cdba5b56073f28436a1f4905d05641b3349ce']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function assertFragments(relative, fragments) {
  const contents = source(relative)
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
  }
  return contents
}

test('target108 pins the persistent REPL runtime and every observable progress handoff', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(
    sha256(baselineBytes),
    '6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844',
  )
  assert.equal(
    sha256(targetBytes),
    'dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73',
  )
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')
  assert.equal(baseline.includes('tengu_slate_harbor'), false)
  assert.equal(baseline.includes('repl_sampling'), false)
  for (const [index, identity] of units) {
    const region = structural.regions[index]
    assert.notEqual(region.classification, 'matched', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.nodeType, region.target.sourceHash],
      identity,
      `${index}: structural identity`,
    )
    assert.equal(
      sha256(target.slice(identity[0], identity[1])),
      identity[3],
      `${index}: bytes`,
    )
  }

  const replRuntime = target.slice(8952544, 8992777)
  for (const fragment of [
    'REPL is your **only way** to investigate',
    ': prompt must be a string',
    ': schema must be JSON-serializable',
    ': schema must be an object',
    'querySource:"repl_sampling"',
    'type:"repl_tool_call"',
    'pendingName',
    'blocks replayed cleanly',
    'codeGeneration:{strings:!0,wasm:!1}',
  ]) assert.ok(replRuntime.includes(fragment), fragment)
  const sdkProgress = target.slice(9192140, 9194093)
  for (const fragment of [
    'tool_name:"REPL"',
    'inner_tool_name:',
    'inner_tool_input:',
    'inner_tool_use_id:',
    'elapsed_time_seconds:0',
  ]) assert.ok(sdkProgress.includes(fragment), fragment)
})

test('source owns target108 REPL enablement, prompt, VM, sampling, and replay semantics', sourceOptions, () => {
  assertFragments('tools/REPLTool/constants.ts', [
    'if (!isRunningWithBun()) return false',
    'isEnvDefinedFalsy(process.env.CLAUDE_CODE_REPL)',
    'isEnvTruthy(process.env.CLAUDE_CODE_REPL)',
    "entrypoint === 'cli' || entrypoint === 'remote'",
    "getFeatureValue_CACHED_MAY_BE_STALE('tengu_slate_harbor', false)",
  ])
  assertFragments('tools/REPLTool/prompt.ts', [
    'REPL is your **only way** to investigate',
    'Aim for 1-3 REPL calls per turn',
    'the vm context is sealed',
    'haiku(prompt,schema?)',
  ])
  assertFragments('tools/REPLTool/REPLTool.ts', [
    "import * as vm from 'node:vm'",
    "const MODULE_LOADING_RE = /\\b(import|require)\\s*\\(/",
    "throw new Error('haiku: prompt must be a string')",
    "throw new Error('haiku: schema must be JSON-serializable')",
    "throw new Error('haiku: schema must be an object')",
    "querySource: 'repl_sampling'",
    "type: 'repl_tool_call'",
    "phase: 'start'",
    "phase: 'complete'",
    "phase: 'error'",
    'vm.createContext(Object.create(null)',
    'codeGeneration: { strings: true, wasm: false }',
    'pendingToolName',
    'summarizeReplay(results)',
    'blocks replayed cleanly',
  ])
})

test('source propagates inner REPL activity to background tasks and SDK tool progress', sourceOptions, () => {
  assertFragments('tasks/LocalMainSessionTask.ts', [
    "event.data.type === 'repl_tool_call'",
    "event.data.phase === 'start'",
    'toolName: event.data.toolName',
    'input: event.data.toolInput',
    'if (block.name === REPL_TOOL_NAME) continue',
  ])
  assertFragments('tasks/LocalAgentTask/LocalAgentTask.tsx', [
    "message.data.type === 'repl_tool_call'",
    "message.data.phase === 'start'",
    'getToolSearchOrReadInfo(toolName, toolInput, tools)',
    'content.name !== REPL_TOOL_NAME',
  ])
  assertFragments('utils/queryHelpers.ts', [
    "message.data.type === 'repl_tool_call'",
    "tool_name: 'REPL'",
    'inner_tool_name: message.data.toolName',
    'inner_tool_input: message.data.toolInput',
    'inner_tool_use_id: message.data.toolUseId',
    'elapsed_time_seconds: 0',
  ])
  assertFragments('services/tools/toolExecution.ts', [
    'onToolProgress({',
    'toolUseID: progress.toolUseID',
    'data: progress.data',
  ])
})

test('historical and cumulative source select the intended REPL evolution only', sourceOptions, () => {
  const runtime = source('tools/REPLTool/REPLTool.ts')
  if (historicalTarget108) {
    assert.equal(runtime.includes('evaluateToolIsolation'), false)
  } else {
    assert.ok(runtime.includes('evaluateToolIsolation'))
  }
})
