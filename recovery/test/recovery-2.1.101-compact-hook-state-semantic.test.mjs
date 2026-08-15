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
  [12639, [9705552, 9709487, 'f7e4a2b5e280ec0e2ecca2e1613298650f892bf9c143210d8fbb18690a6c1d45']],
  [12640, [9709487, 9713233, 'fefaa5b7fe88ff20fdb5f8898c0f92a70fb95ecd16c71070971f05646c40ef9f']],
  [12643, [9713601, 9716582, '5534ae47190dce3d39bcbc1de4be39cd9ee6d68f6f1116a3e10d3980d162b863']],
  [13731, [10192791, 10194031, 'a2e5e78f7a0cab3e4b2aa3a15a0b1ec97db79b4073c22bef976b10d2a15dd04b']],
  [16323, [11729345, 11733088, 'b4413dbd14746cd20da900855d07164bbab004e03fa4f544f8dcf24f861a005d']],
  [16330, [11734404, 11737888, '2930fac737706d11792df12e52de802d16117b8c9f809c62d3d8ca51f73227eb']],
  [16356, [11744035, 11744741, '50386d11f21a1577396c3ef13cf42e9a84bf5cc508b2d2ad1f9c39c2e487a97f']],
  [16364, [11751488, 11756891, '8a252b5904c76cc1bbc3e5aee19ff1a057a145cb235d019164d96aa2d1df5671']],
  [17770, [12479413, 12481403, '46a05da8594590da8d7834c7dae206ea086ffbefb5bb451bb579318d27b7408d']],
  [18736, [13325670, 13326934, 'ea2aabf52284140b7ab5e9fc69250a3a9845eceb67b532c1e846d78f7c4109ee']],
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

test('target101 pins the compact, hook, queue, and SDK state graph', { skip: pairSkip }, () => {
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
  const target = targetBytes.toString('utf8')
  for (const [index, [start, end, hash]] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: class`)
    assert.deepEqual(
      [
        region.target.start,
        region.target.end,
        region.target.sourceHash,
        region.target.nodeType,
      ],
      [start, end, hash, 'FunctionDeclaration'],
      `${index}: identity`,
    )
    assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
  }
})

test('target101 introduces the observable state adapters and propagation', { skip: pairSkip }, () => {
  if (pairSkip) return
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  assert.equal(baseline.includes('resetResponseLength'), false)
  assert.equal(baseline.includes('addResponseLength'), false)
  assert.equal(baseline.includes('rewakeMessage'), false)
  assert.ok(target.split('resetResponseLength').length - 1 >= 15)
  assert.ok(target.split('addResponseLength').length - 1 >= 13)
  assert.ok(target.split('rewakeMessage').length - 1 >= 4)

  for (const index of [12639, 12640, 13731]) {
    const [start, end] = units.get(index)
    assert.ok(target.slice(start, end).includes('resetResponseLength'))
  }
  assertFragments(
    target.slice(...units.get(12643).slice(0, 2)),
    ['resetResponseLength', 'addResponseLength'],
    'direct compaction',
  )
  for (const index of [16323, 16330]) {
    const [start, end] = units.get(index)
    assert.ok(target.slice(start, end).includes('addResponseLength'))
  }
  assertFragments(
    target.slice(...units.get(16356).slice(0, 2)),
    ['rewakeMessage', 'stopHookActive:!0'],
    'background rewake',
  )
  assert.ok(
    target
      .slice(...units.get(16364).slice(0, 2))
      .includes('rewakeMessage:'),
  )
  assert.ok(
    target
      .slice(...units.get(17770).slice(0, 2))
      .includes('stopHookActive'),
  )
  assertFragments(
    target.slice(...units.get(18736).slice(0, 2)),
    [
      'stopHookActive:',
      'fileAttachments:',
      'refreshTools:',
      'sessionEnvVars:',
      'onCommandLifecycle:',
    ],
    'SDK wrapper',
  )
})

test('source owns the reachable response, Stop-hook, and SDK call graph', { skip: sourceSkip }, () => {
  if (sourceSkip) return
  assertFragments(
    source('Tool.ts'),
    [
      'addResponseLength: (delta: number) => void',
      'resetResponseLength: () => void',
      'sessionEnvVars?: Map<string, string>',
      "state: 'started' | 'completed'",
    ],
    'ToolUseContext',
  )
  assertFragments(
    source('services/compact/compact.ts'),
    ['context.resetResponseLength?.()', 'context.addResponseLength?.(charactersStreamed)'],
    'compact service',
  )
  assertFragments(
    source('commands/compact/compact.ts'),
    ['context.resetResponseLength?.()'],
    'compact command',
  )
  assertFragments(
    source('utils/hooks/execPromptHook.ts'),
    ['toolUseContext.addResponseLength(content.length)'],
    'prompt hook',
  )
  assertFragments(
    source('utils/hooks/execAgentHook.ts'),
    ['toolUseContext.addResponseLength(newContent.length)'],
    'agent hook',
  )
  assertFragments(
    source('utils/hooks.ts'),
    [
      'rewakeMessage?: string',
      'rewakeMessage: hook.rewakeMessage',
      'stopHookActive: true',
    ],
    'hook queue',
  )
  assertFragments(
    source('utils/handlePromptSubmit.ts'),
    [
      'commands.some(command => command.stopHookActive)',
      'stopHookActive,',
    ],
    'prompt submission',
  )
  assertFragments(
    source('query.ts'),
    ['stopHookActive?: boolean', 'stopHookActive: params.stopHookActive'],
    'query state',
  )
  assertFragments(
    source('screens/REPL.tsx'),
    [
      'addResponseLength: delta => setResponseLength(previous => previous + delta)',
      'resetResponseLength: () => setResponseLength(() => 0)',
      'stopHookActive,',
    ],
    'REPL adapters',
  )
  assertFragments(
    source('QueryEngine.ts'),
    [
      'refreshTools?: () => Tools',
      'sessionEnvVars?: Map<string, string>',
      "onCommandLifecycle?: ToolUseContext['onCommandLifecycle']",
      'stopHookActive?: boolean',
      'fileAttachments?: unknown[]',
      'stopHookActive: options?.stopHookActive',
      '? { file_attachments: fileAttachments }',
      historical
        ? 'taskRegistry: createQueryEngineTaskRegistry(getAppState, setAppState)'
        : 'taskRegistry: createTaskRegistry(getAppState, setAppState)',
      'addResponseLength: () => {}',
      'resetResponseLength: () => {}',
    ],
    'QueryEngine',
  )
  assertFragments(
    source('utils/forkedAgent.ts'),
    ['parentContext.addResponseLength', 'parentContext.resetResponseLength'],
    'forked-agent adapters',
  )
})
