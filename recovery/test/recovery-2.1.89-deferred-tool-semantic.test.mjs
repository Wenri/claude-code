import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : fileURLToPath(new URL('../../src/', import.meta.url))
const structuralPath = fileURLToPath(
  new URL(
    '../cases/2.1.88-to-2.1.89/structural/generated-delta.json.gz',
    import.meta.url,
  ),
)
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_88_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_89_BUNDLE
const BASELINE_SHA256 =
  '75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f'
const TARGET_SHA256 =
  'a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01'

function requiredBundle(filename, label, expectedSha256) {
  assert.ok(filename, `${label} environment variable must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    expectedSha256,
  )
  return bytes.toString('utf8')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test('2.1.89 target contains the complete deferred-tool runtime cluster', () => {
  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_88_BUNDLE',
    BASELINE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_89_BUNDLE',
    TARGET_SHA256,
  )
  assert.equal(baseline.includes('hook_deferred_tool'), false)

  const requiredTargetFragments = [
    'L.enum(["allow","deny","ask","defer"])',
    'returned permissionDecision=defer in interactive mode; ignoring (defer is print-mode only)',
    'ignoring (defer is solo-only — siblings would be orphaned on resume)',
    'type:"hook_deferred_tool",toolUseID:',
    'return{reason:"tool_deferred"}',
    ' · resume with -p --resume to continue',
    'Deferred tool resume: permissionMode mismatch',
    'Deferred tool resume: re-emitting',
    "is no longer available (MCP server disconnected or tool removed)",
    'stop_reason:"tool_deferred_unavailable"',
    'stop_reason:"tool_deferred"',
    'No deferred tool marker found in the resumed session.',
    '[print.ts] Auto-resuming deferred tool:',
    'value:"Continue from where you left off."',
    'await VB(q,1048576)',
    'new Set([O.toolUseID])',
    'deferred_tool_use:',
  ]
  for (const fragment of requiredTargetFragments) {
    assert.ok(target.includes(fragment), `target fragment drifted: ${fragment}`)
  }
})

test('pinned structural units retain deferred hook, replay, and print owners', () => {
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_89_BUNDLE',
    TARGET_SHA256,
  )
  const structural = JSON.parse(
    zlib.gunzipSync(fs.readFileSync(structuralPath)).toString('utf8'),
  )
  const pinned = new Map([
    [7730, '49541040c11639fe84df2ac4b97673cb97522ba81a779cef7044fc294b4c1c38'],
    [9705, 'f70b6f38ecaad6a33e24aef3370ccfa8dc2749690d1f13e530b45fb488fe3a76'],
    [10163, '59a855498c8cbb03e8c5693745dfe533a00eedf4ca2e31c33f3b8d801431382e'],
    [10466, 'c0dc59e294fcf719918b0ee57dad004dafb2f6767dc50e61b0500c2cfe6457ab'],
    [11995, '9ecb0769088b27bc9029a7e87a6e617c6738f3d7439ef6ad68c9a7ca3a9408f9'],
    [12007, '784deebf5c60b1e92d3fcb0e57a486797c1a3e8fffa54f016d68a759fa84556e'],
    [12086, '494973d6e8cefd372b17b653b4be30cf1608b4fe7bbb3a1aec9a6d67142e6bd4'],
    [12652, '2fe7392ec9d27e6e638424d288486bcb2833f7085dee9d28bd3d466b133d1db4'],
    [12703, '3d84882f4fb053a5c0ab9c7ebf167d4f9a4f4ba52a13c5fa7d904caa458c253c'],
    [15687, 'b5d9b6ae7331ee6f1f9121cc3089a3ec51518c2f6d5126bfc39cc96baedd7814'],
    [15730, '256a972576b2cab013952b7517c60adcf11a06aaed5a683a6f3d81695c43eb69'],
    [15732, 'a567df8086b0e0ee9f533473be9813423bbb186ec792f19ccf85dc6ed629c4fc'],
    [15749, 'a68f77e6ff4b7b527aa85af9ab3694a101a2fbf85ec29e3293257dc7de7b3ad0'],
    [18011, '81b9052b5e824d9c97058ca14fad739ba90b23b7e3222df08adabc5626b8c19a'],
    [18012, '84b19f4e866bf8e7b9bb77bdddb63d60bcd696610430925a2b3ccc139d6c8231'],
    [18041, '5dc3f32b088bad9b6e7badf95fbfdc5174f1542e5cbc5ad7970a18f9fcc8b1fa'],
    [18042, 'c7358ea7b5df60df4bf1da92d70b0baf3aa11cc4552977ead152839d13c40cec'],
    [18052, '7ed22c619a524eb0a518fea8e577ff6c43993ac71ae5348259fe284166df0ece'],
  ])

  for (const [index, sourceHash] of pinned) {
    const unit = structural.regions[index]
    assert.equal(unit.target.index, index)
    assert.equal(unit.target.sourceHash, sourceHash)
    const bytes = target.slice(unit.target.start, unit.target.end)
    assert.equal(
      crypto.createHash('sha256').update(bytes).digest('hex'),
      sourceHash,
      `target structural unit ${index} coordinate/hash drift`,
    )
  }
})

test('source owns defer precedence, print-only solo suspension, and attachment behavior', () => {
  const schemas = source('entrypoints/sdk/coreSchemas.ts')
  const hookTypes = source('types/hooks.ts')
  const hooks = source('utils/hooks.ts')
  const toolHooks = source('services/tools/toolHooks.ts')
  const execution = source('services/tools/toolExecution.ts')
  const attachments = source('utils/attachments.ts')
  const messages = source('utils/messages.ts')
  const view = source('components/messages/AttachmentMessage.tsx')
  const query = source('query.ts')

  assert.match(schemas, /HookPermissionBehaviorSchema[\s\S]*?'defer'/)
  assert.match(schemas, /permissionDecision: HookPermissionBehaviorSchema\(\)/)
  assert.match(hookTypes, /hookPermissionBehaviorSchema[\s\S]*?'defer'/)
  assert.match(hooks, /precedence: deny > defer > ask > allow/)
  assert.match(
    hooks,
    /result\.permissionBehavior === 'allow'[\s\S]*?result\.permissionBehavior === 'ask'/,
  )
  assert.match(
    toolHooks,
    /result\.permissionBehavior === 'defer'[\s\S]*?deferredHookName[\s\S]*?continue/,
  )
  assert.match(toolHooks, /deferredHookName && !hookDenied/)
  assert.match(
    execution,
    /!toolUseContext\.options\.isNonInteractiveSession[\s\S]*?defer is print-mode only/,
  )
  assert.match(
    execution,
    /toolCallCount > 1[\s\S]*?defer is solo-only — siblings would be orphaned on resume/,
  )
  assert.match(
    execution,
    /type: 'hook_deferred_tool'[\s\S]*?toolUseID[\s\S]*?toolInput: processedInput[\s\S]*?permissionMode:/,
  )
  assert.match(attachments, /export type HookDeferredToolAttachment[\s\S]*?permissionMode:/)
  assert.match(messages, /type === 'hook_deferred_tool'[\s\S]*?isHookAttachmentMessage/)
  assert.match(
    messages,
    /case 'hook_deferred_tool':(?:\s*case '[^']+':)*\s*return \[\]/,
  )
  assert.match(
    view,
    /deferred \{attachment\.toolName\} · resume with -p --resume to continue/,
  )
  assert.match(query, /wasToolDeferred = true[\s\S]*?reason: 'tool_deferred'/)
})

test('source owns tail staleness, transcript preservation, replay, SDK result, and auto-resume', () => {
  const storage = source('utils/sessionStorage.ts')
  const messages = source('utils/messages.ts')
  const recovery = source('utils/conversationRecovery.ts')
  const helpers = source('utils/queryHelpers.ts')
  const engine = source('QueryEngine.ts')
  const schemas = source('entrypoints/sdk/coreSchemas.ts')
  const print = source('cli/print.ts')

  assert.match(storage, /tailFile\(path, 1_048_576\)/)
  assert.match(storage, /if \(bytesRead < bytesTotal\) lines\.shift\(\)/)
  assert.match(storage, /for \(let index = lines\.length - 1; index >= 0; index--\)/)
  assert.match(storage, /`"tool_use_id":"\$\{marker\.toolUseID\}"`/)
  assert.match(storage, /markerIndex \+ 1[\s\S]*?return null/)
  assert.match(
    messages,
    /!toolResultIds\.has\(id\) && !preservedUnresolvedToolUseIds\?\.has\(id\)/,
  )
  assert.match(
    recovery,
    /findDeferredToolUse\(transcriptPath\)[\s\S]*?new Set\(\[deferredToolUse\.toolUseID\]\)/,
  )
  assert.match(
    recovery,
    /preservedUnresolvedToolUseIds\?\.size[\s\S]*?kind: 'none'/,
  )
  assert.match(
    helpers,
    /Deferred tool resume: permissionMode mismatch[\s\S]*?--permission-mode/,
  )
  assert.match(helpers, /Deferred tool resume: tool_use[\s\S]*?not found in transcript/)
  assert.match(helpers, /Deferred tool resume: re-emitting[\s\S]*?through PreToolUse/)
  assert.match(helpers, /runTools\([\s\S]*?\[toolUseBlock as ToolUseBlock\]/)
  assert.match(engine, /hasHandledDeferredToolResume/)
  assert.match(engine, /tool_deferred_unavailable/)
  assert.match(engine, /redeferredToolUse[\s\S]*?stop_reason: 'tool_deferred'/)
  assert.match(engine, /deferredToolUseFromQuery[\s\S]*?deferred_tool_use:/)
  assert.match(schemas, /SDKDeferredToolUseSchema[\s\S]*?deferred_tool_use:/)
  assert.match(
    print,
    /No deferred tool marker found in the resumed session\.[\s\S]*?tail-scan window/,
  )
  assert.match(
    print,
    /\[print\.ts\] Auto-resuming deferred tool:[\s\S]*?Continue from where you left off\.[\s\S]*?isMeta: true/,
  )
  assert.match(print, /deferredToolUse: pendingDeferredToolUse/)
  assert.match(print, /pendingDeferredToolUse = undefined/)
})
