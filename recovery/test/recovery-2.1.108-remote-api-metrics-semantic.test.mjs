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
const historical = semanticCase === caseName
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
  [11056, [8451624, 8457672, 'FunctionDeclaration', '4f3494bb071118df1f7489bac8772d9678fdccf294758bc655da7224c933a8d2']],
  [13413, [9844745, 9846781, 'FunctionDeclaration', 'b4e444972966fb82e944879c04c034b5240d3ab26be3052f6f36fe1e6eee4deb']],
  [17948, [12356895, 12362247, 'FunctionDeclaration', 'b9aaf7c57c137abd3d854427c628931d647aa9ede3d4dcaa3eb744751f3a1a4f']],
  [18537, [12594108, 12652702, 'FunctionDeclaration', '6607b8b36e7c144573bd88bac36de43df6e8146575d7aac4505f5ef5a3d2496c']],
  [18538, [12652702, 12652925, 'VariableDeclaration', 'a9e6a9f8de70b75ebc34a40146d389d4a634ebaab578ce4635dcf1485937cc13']],
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

function identifierCount(contents, identifier) {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return [...contents.matchAll(new RegExp(`(?<![A-Za-z0-9_$])${escaped}(?![A-Za-z0-9_$])`, 'g'))].length
}

test('target108 pins the complete local, subagent, and remote API-metrics graph', bundleOptions, () => {
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
  const target = targetBytes.toString('utf8')

  for (const [index, [start, end, nodeType, expectedHash]] of units) {
    const region = structural.regions[index]
    assert.deepEqual(
      [
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.sourceHash,
      ],
      [start, end, nodeType, expectedHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(target.slice(start, end)), expectedHash, `${index}: bytes`)
  }

  const runAgent = target.slice(8451624, 8457672)
  const streamHandler = target.slice(9844745, 9846781)
  const remote = target.slice(12356895, 12362247)
  const repl = target.slice(12594108, 12652702)
  for (const owner of [runAgent, streamHandler]) {
    assert.ok(owner.includes('type:"start"'))
    assert.ok(owner.includes('type:"end"'))
    assert.ok(owner.includes('outputTokens'))
  }
  assert.equal(runAgent.split('id:').length - 1, 2)
  assert.match(
    runAgent,
    /[A-Za-z_$][\w$]*=[A-Za-z_$][\w$]*\(\),[^;]*type:"start"[^;]*id:[A-Za-z_$][\w$]*/,
  )
  for (const fragment of [
    'recordApiMetricsEvent',
    'task_progress',
    'task_updated',
    'notification',
  ]) {
    assert.ok(remote.includes(fragment), fragment)
  }
  for (const fragment of [
    'recordApiMetricsEvent',
    'outputTokens',
    '.at(-1)',
    'getResumeCompactModel',
  ]) {
    assert.ok(repl.includes(fragment), fragment)
  }
})

test('target108 generated fallback handler allocation is statically unobservable', bundleOptions, () => {
  const target = fs.readFileSync(targetPath, 'utf8')
  const repl = target.slice(12594108, 12652702)
  const initializer = target.slice(12652702, 12652925)
  const factoryMatch = initializer.match(
    /([A-Za-z_$][\w$]*)=\(\)=>\(\{pending:\[\],handleAction:\(\)=>\{\},skipForSession:\(\)=>\{\}\}\)/,
  )
  assert.ok(factoryMatch, 'fallback factory')
  const factory = factoryMatch[1]
  const destructure = repl.match(
    new RegExp(
      `\\{pending:([A-Za-z_$][\\w$]*),handleAction:([A-Za-z_$][\\w$]*),skipForSession:([A-Za-z_$][\\w$]*)\\}=${factory.replaceAll('$', '\\$')}\\(\\)`,
    ),
  )
  assert.ok(destructure, 'fallback destructuring call')
  // All three values are bound once and never read. The side-effect-free
  // factory's object allocation cannot affect first-party runtime behavior.
  for (const binding of destructure.slice(1)) {
    assert.equal(identifierCount(repl, binding), 1, binding)
  }
})

test('source owns typed request lifecycle and target108 remote propagation', sourceOptions, () => {
  assertFragments('Tool.ts', [
    "| { type: 'start'; ttftMs: number; id?: string }",
    "| { type: 'end'; outputTokens: number; id?: string }",
    'pushApiMetricsEntry?: (event: ApiMetricsEvent) => void',
  ])
  assertFragments('utils/messages.ts', [
    'onApiMetrics?: (event: ApiMetricsEvent) => void',
    "onApiMetrics?.({ type: 'start', ttftMs: message.ttftMs })",
    "type: 'end'",
    'outputTokens: message.event.usage.output_tokens',
  ])
  assertFragments('tools/AgentTool/runAgent.ts', [
    'let apiMetricsEntryId: string | undefined',
    'apiMetricsEntryId = randomUUID()',
    "type: 'start'",
    "type: 'end'",
    'apiMetricsEntryId = undefined',
  ])
  assertFragments('hooks/useRemoteSession.ts', [
    'recordApiMetricsEvent?: (event: ApiMetricsEvent) => void',
    "sdkMessage.subtype === 'task_progress'",
    "sdkMessage.subtype === 'task_updated'",
    "sdkMessage.subtype === 'notification'",
    'recordApiMetricsEvent,',
  ])
})

test('source distinguishes target108 aggregation and resume-model behavior from target116', sourceOptions, () => {
  const repl = assertFragments('screens/REPL.tsx', [
    'const recordApiMetricsEvent = useCallback((event: ApiMetricsEvent) => {',
    'id: event.id,',
    'entry.outputTokens = event.outputTokens',
    'recordApiMetricsEvent',
  ])
  const model = source('utils/model/model.ts')
  if (historical) {
    assert.ok(repl.includes('apiMetricsRef.current.at(-1)'))
    assert.equal(repl.includes('findLast(item => item.id == null)'), false)
    assert.equal(
      repl.includes('entry.responseLengthBaseline + event.outputTokens * 4'),
      false,
    )
    assertFragments('utils/model/model.ts', [
      'export function getResumeCompactModel(currentModel: ModelName): ModelName',
      "getDefaultSonnetModel() +",
      "has1mContext(currentModel) ? '[1m]' : ''",
    ])
  } else {
    assert.ok(repl.includes('findLast(item => item.id == null)'))
    assert.ok(
      repl.includes('entry.responseLengthBaseline + event.outputTokens * 4'),
    )
    assert.equal(model.includes('getResumeCompactModel'), false)
    const compactStart = repl.indexOf("if (action === 'compact')")
    assert.notEqual(compactStart, -1)
    const compact = repl.slice(compactStart, compactStart + 500)
    assert.ok(compact.includes("onSubmitRef.current('/compact'"))
    assert.equal(compact.includes('modelOverride'), false)
  }
})
