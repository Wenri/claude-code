import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const historical = semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
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
  [12639, [9705552, 9709487, 'f7e4a2b5e280ec0e2ecca2e1613298650f892bf9c143210d8fbb18690a6c1d45', 'FunctionDeclaration']],
  [12640, [9709487, 9713233, 'fefaa5b7fe88ff20fdb5f8898c0f92a70fb95ecd16c71070971f05646c40ef9f', 'FunctionDeclaration']],
  [12643, [9713601, 9716582, '5534ae47190dce3d39bcbc1de4be39cd9ee6d68f6f1116a3e10d3980d162b863', 'FunctionDeclaration']],
  [13731, [10192791, 10194031, 'a2e5e78f7a0cab3e4b2aa3a15a0b1ec97db79b4073c22bef976b10d2a15dd04b', 'FunctionDeclaration']],
  [16323, [11729345, 11733088, 'b4413dbd14746cd20da900855d07164bbab004e03fa4f544f8dcf24f861a005d', 'FunctionDeclaration']],
  [16330, [11734404, 11737888, '2930fac737706d11792df12e52de802d16117b8c9f809c62d3d8ca51f73227eb', 'FunctionDeclaration']],
  [16356, [11744035, 11744741, '50386d11f21a1577396c3ef13cf42e9a84bf5cc508b2d2ad1f9c39c2e487a97f', 'FunctionDeclaration']],
  [16364, [11751488, 11756891, '8a252b5904c76cc1bbc3e5aee19ff1a057a145cb235d019164d96aa2d1df5671', 'FunctionDeclaration']],
  [17770, [12479413, 12481403, '46a05da8594590da8d7834c7dae206ea086ffbefb5bb451bb579318d27b7408d', 'FunctionDeclaration']],
  [18736, [13325670, 13326934, 'ea2aabf52284140b7ab5e9fc69250a3a9845eceb67b532c1e846d78f7c4109ee', 'FunctionDeclaration']],
])

const pairSkip = !selected
  ? `not applicable to ${semanticCase}`
  : !baselineBundlePath || !targetBundlePath
    ? 'CLAUDE_CODE_2_1_100_BUNDLE and CLAUDE_CODE_2_1_101_BUNDLE are required'
    : false
const sourceSkip = selected ? false : `not applicable to ${semanticCase}`

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function assertFragments(contents, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${label}: ${fragment}`)
  }
}

function count(contents, fragment) {
  return contents.split(fragment).length - 1
}

test('target101 authenticates the compact, hook, and query-state introduction', { skip: pairSkip }, () => {
  if (pairSkip) return
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
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')
  assert.deepEqual(
    [
      count(baseline, 'resetResponseLength'),
      count(baseline, 'addResponseLength'),
      count(baseline, 'rewakeMessage'),
      count(baseline, 'stopHookActive'),
    ],
    [0, 0, 0, 7],
    'target100 boundary',
  )
  assert.deepEqual(
    [
      count(target, 'resetResponseLength'),
      count(target, 'addResponseLength'),
      count(target, 'rewakeMessage'),
      count(target, 'stopHookActive'),
    ],
    [15, 13, 4, 18],
    'target101 boundary',
  )

  for (const [index, [start, end, hash, nodeType]] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: class`)
    assert.deepEqual(
      [
        region.target.start,
        region.target.end,
        region.target.sourceHash,
        region.target.nodeType,
      ],
      [start, end, hash, nodeType],
      `${index}: identity`,
    )
    assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
  }
})

test('target101 functions pin reset, streaming, rewake, and recursion semantics', { skip: pairSkip }, () => {
  if (pairSkip) return
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  for (const index of [12639, 12640, 13731]) {
    const [start, end] = units.get(index)
    const fragment = target.slice(start, end)
    assert.equal(count(fragment, 'resetResponseLength'), 2, `${index}: start and finally`)
  }
  const stream = target.slice(...units.get(12643).slice(0, 2))
  assertFragments(
    stream,
    [
      'resetResponseLength',
      'content_block_delta',
      'text_delta',
      'addResponseLength',
      '.text.length',
    ],
    'compact stream',
  )
  for (const index of [16323, 16330]) {
    const fragment = target.slice(...units.get(index).slice(0, 2))
    assert.ok(fragment.includes('addResponseLength'), `${index}: hook stream accounting`)
  }
  const backgroundHook = target.slice(...units.get(16356).slice(0, 2))
  assertFragments(
    backgroundHook,
    [
      'asyncRewake',
      'rewakeMessage',
      'Stop hook blocking error from command',
      'stopHookActive:!0',
    ],
    'async hook rewake',
  )
  const hookExec = target.slice(...units.get(16364).slice(0, 2))
  assertFragments(
    hookExec,
    ['asyncRewake:q.asyncRewake', 'rewakeMessage:q.rewakeMessage'],
    'hook execution propagation',
  )
  const queue = target.slice(...units.get(17770).slice(0, 2))
  assertFragments(
    queue,
    ['.some((n)=>n.stopHookActive)', 'await H(', ',E,l)'],
    'queued command propagation',
  )
  const sdk = target.slice(...units.get(18736).slice(0, 2))
  assertFragments(
    sdk,
    ['stopHookActive:Y', 'submitMessage(K,{uuid:_,isMeta:z,stopHookActive:Y'],
    'SDK query propagation',
  )
})

test('source owns the reachable compact response-length state', { skip: sourceSkip }, () => {
  if (sourceSkip) return
  const compact = source('services/compact/compact.ts')
  assertFragments(
    compact,
    [
      "context.setStreamMode?.('requesting')\n    context.resetResponseLength?.()",
      "event.event.type === 'content_block_delta'",
      "event.event.delta.type === 'text_delta'",
      'context.addResponseLength?.(charactersStreamed)',
    ],
    'compact service',
  )
  assert.ok(count(compact, 'context.resetResponseLength?.()') >= 5)
  const command = source('commands/compact/compact.ts')
  assert.equal(count(command, 'context.resetResponseLength?.()'), 2)

  assertFragments(
    source('utils/hooks/execPromptHook.ts'),
    ['toolUseContext.addResponseLength(content.length)'],
    'prompt hook',
  )
  assertFragments(
    source('utils/hooks/execAgentHook.ts'),
    [
      'handleMessageFromStream(',
      'newContent => toolUseContext.addResponseLength(newContent.length)',
    ],
    'agent hook',
  )
  assertFragments(
    source('Tool.ts'),
    [
      'addResponseLength: (delta: number) => void',
      'resetResponseLength: () => void',
    ],
    'tool context contract',
  )
  assertFragments(
    source('screens/REPL.tsx'),
    [
      'addResponseLength: delta => setResponseLength(previous => previous + delta)',
      'resetResponseLength: () => setResponseLength(() => 0)',
    ],
    'interactive state owner',
  )
})

test('source owns asynchronous rewake and stop-hook recursion propagation', { skip: sourceSkip }, () => {
  if (sourceSkip) return
  const hooks = source('utils/hooks.ts')
  assertFragments(
    hooks,
    [
      'asyncRewake?: boolean',
      'rewakeMessage?: string',
      'asyncRewake: hook.asyncRewake',
      'rewakeMessage: hook.rewakeMessage',
      'stopHookActive: true',
    ],
    'hook backgrounding',
  )
  assertFragments(
    source('schemas/hooks.ts'),
    ['rewakeMessage: z', '.string()', '.optional()'],
    'hook schema',
  )
  const submit = source('utils/handlePromptSubmit.ts')
  assertFragments(
    submit,
    [
      'commands.some(command => command.stopHookActive)',
      'stopHookActive,',
    ],
    'queued commands',
  )
  assertFragments(
    source('QueryEngine.ts'),
    [
      'stopHookActive?: boolean',
      'stopHookActive: options?.stopHookActive',
      'yield* engine.submitMessage(prompt, {',
      'stopHookActive,',
    ],
    'headless query',
  )
  assertFragments(
    source('query.ts'),
    ['stopHookActive?: boolean', 'stopHookActive: true'],
    'query loop',
  )

  if (historical) {
    assertFragments(
      hooks,
      [
        'Stop hook blocking error from command "${hookName}": ${stderr || stdout}',
      ],
      'target101 rewake notification',
    )
  } else {
    assertFragments(
      hooks,
      ['rewakeSummary', '<${TASK_NOTIFICATION_TAG}>', '<${SUMMARY_TAG}>'],
      'target116 structured rewake evolution',
    )
  }
})
