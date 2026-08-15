import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const isCurrentSource =
  path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
const latestBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
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
  [5075, [3724382, 3726349, 'e2cf0362015b0a536249f008454ee8c5ca0ddfb7b13fbe10906222b57b18dd43']],
  [8039, [6606341, 6606567, '63b90e977d7554e559fd7db2c0c09305b2db690e8179313e7389c8e8f77ff9fc']],
  [11058, [8658895, 8692754, '0a16beb89ac887fe516f61a18a0f53fb7d33a6c7c4b60b35caf811632c7f34c9']],
  [17639, [12425147, 12430428, '170164f4229cc2442db9b290c38d65bdd2256761cc25545869a01b2e92ddec3b']],
  [18007, [12585723, 12593614, '23bedc53a663e5b86f207bf60b85b8dcde6741ac688c14dc02c907f5445ebe8f']],
  [18735, [13309789, 13325670, '4ef669540a89176d101bf83c127b4d4b2532478088c62e9ef013491824be6301']],
  [18767, [13331502, 13337686, '0cd9386c3762c938aeb1889bd54776516ff9249bfeeaa82df13472c3a2a156e2']],
  [18768, [13337686, 13370073, 'eb9ce1904c883b5e01e624ff995e38bc8d28aac9acb24bc6048cacc0f9073cb1']],
])

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_100_BUNDLE and CLAUDE_CODE_2_1_101_BUNDLE are required'
      : false,
}
const latestOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !latestBundlePath
      ? 'CLAUDE_CODE_2_1_116_BUNDLE is required'
      : false,
}

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

async function loadTaskPatchBuilder() {
  const ts = await loadTypeScript()
  const framework = source('src/utils/task/framework.ts')
  const start = framework.indexOf('export function buildSdkTaskPatch')
  const end = framework.indexOf('/**\n * Update a task', start)
  assert.ok(start >= 0 && end > start, 'buildSdkTaskPatch source range')
  const javascript = ts.transpileModule(framework.slice(start, end), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const module = { exports: {} }
  new Function('exports', 'module', javascript)(module.exports, module)
  return module.exports.buildSdkTaskPatch
}

test('target101 pins every SDK telemetry and task-update structural unit', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be',
  )
  assert.equal(
    sha256(targetBytes),
    'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
  )
  const target = targetBytes.toString('utf8')
  for (const [index, identity] of targetUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
      `${index}: structural identity`,
    )
    const unit = target.slice(identity[0], identity[1])
    assert.equal(sha256(unit), identity[2], `${index}: target bytes`)
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
      1,
      `${index}: one top-level statement`,
    )
  }
})

test('SDK task updates and telemetry are introduced at 100 to 101', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  for (const fragment of [
    'subtype:"task_updated"',
    'Wire-safe subset of TaskState fields that changed.',
    'tengu_sdk_control_roundtrip',
    'tengu_sdk_schema_violation',
    'tengu_sdk_session_crash',
    'tengu_sdk_stall',
    'tengu_sdk_transport_error',
    'tengu_sdk_ttft',
    'tengu_sdk_result',
  ]) {
    assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
    assert.equal(target.includes(fragment), true, `${fragment}: target`)
  }
  assert.ok(target.includes('subtype==="task_progress"||'))
  assert.ok(target.includes('subtype==="task_updated"'))
})

test('source owns the complete task-update and SDK telemetry graph', sourceOptions, async () => {
  assertFragments('src/services/analytics/datadog.ts', [
    "'tengu_sdk_control_roundtrip'",
    "'tengu_sdk_result'",
    "'tengu_sdk_schema_violation'",
    "'tengu_sdk_session_crash'",
    "'tengu_sdk_stall'",
    "'tengu_sdk_ttft'",
    "'tengu_timer'",
    "'entrypoint'",
  ])
  const queue = assertFragments('src/utils/sdkEventQueue.ts', [
    "subtype: 'task_updated'",
    'is_backgrounded?: boolean',
    '| TaskUpdatedEvent',
  ])
  assert.equal(queue.includes("subtype: 'task_updated'"), true)
  assertFragments('src/utils/task/framework.ts', [
    'export function buildSdkTaskPatch',
    'patch.total_paused_ms = updated.totalPausedMs',
    'patch.is_backgrounded = updatedBackgrounded',
    "subtype: 'task_updated'",
  ])
  assertFragments('src/entrypoints/sdk/coreSchemas.ts', [
    'export const SDKTaskUpdatedMessageSchema',
    "subtype: z.literal('task_updated')",
    'Wire-safe subset of TaskState fields that changed.',
    'SDKTaskUpdatedMessageSchema()',
  ])
  const structured = assertFragments('src/cli/structuredIO.ts', [
    "logEvent('tengu_sdk_control_roundtrip'",
    "logEvent('tengu_sdk_schema_violation'",
    "logEvent('tengu_sdk_stall'",
    'SDK_STALL_TIMEOUT_MS = 300_000',
    'SDK_SCHEMA_SAMPLE_RATE = 0.01',
  ])
  if (isCurrentSource) {
    assert.equal(structured.includes("logEvent('tengu_sdk_transport_error'"), false)
    assert.ok(structured.includes("message.type !== 'result'"))
    assert.ok(structured.includes("this.sessionState.getState() !== 'running'"))
  } else {
    assert.ok(structured.includes("logEvent('tengu_sdk_transport_error'"))
    assert.ok(structured.includes('shutdown1PEventLogging()'))
    assert.equal(structured.includes("message.type !== 'result'"), false)
  }
  assertFragments('src/QueryEngine.ts', [
    'let firstAssistantAt = 0',
    "logEvent('tengu_sdk_ttft'",
    'firstAssistantAt - startTime',
  ])
  const print = assertFragments('src/cli/print.ts', [
    'let sawSdkRetry = false',
    "logEvent('tengu_sdk_result'",
    "logEvent('tengu_sdk_session_crash'",
    "message.subtype === 'task_updated'",
  ])
  if (isCurrentSource) assert.ok(print.includes('api_error_status:'))
  assertFragments('src/hooks/useRemoteSession.ts', [
    "sdkMessage.subtype === 'task_progress' ||",
    "sdkMessage.subtype === 'task_updated'",
  ])

  const buildSdkTaskPatch = await loadTaskPatchBuilder()
  const previous = {
    status: 'running',
    description: 'before',
    endTime: undefined,
    totalPausedMs: 10,
    error: 'old',
    isBackgrounded: false,
  }
  assert.deepEqual(
    buildSdkTaskPatch(previous, {
      ...previous,
      status: 'failed',
      description: 'after',
      endTime: 123,
      totalPausedMs: 20,
      error: 'new',
      isBackgrounded: true,
    }),
    {
      status: 'failed',
      description: 'after',
      end_time: 123,
      total_paused_ms: 20,
      error: 'new',
      is_backgrounded: true,
    },
  )
  assert.equal(buildSdkTaskPatch(previous, { ...previous }), null)
})

test('current source follows the target116 telemetry evolution', latestOptions, () => {
  const latestBytes = fs.readFileSync(latestBundlePath)
  assert.equal(
    sha256(latestBytes),
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
  )
  const latest = latestBytes.toString('utf8')
  for (const fragment of [
    'subtype:"task_updated"',
    'tengu_sdk_control_roundtrip',
    'tengu_sdk_init_handshake',
    'tengu_sdk_result',
    'tengu_sdk_schema_violation',
    'tengu_sdk_session_crash',
    'tengu_sdk_stall',
    'tengu_sdk_ttft',
    'tengu_timer',
  ]) {
    assert.ok(latest.includes(fragment), fragment)
  }
  assert.equal(latest.includes('tengu_sdk_transport_error'), false)
  assert.ok(latest.includes('last_message_type:'))
  assert.ok(latest.includes('pending_control_requests:'))
  assert.ok(latest.includes('api_error_status:'))
})
