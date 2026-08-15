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
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath || !latestPath
      ? 'authenticated 2.1.104, 2.1.105, and 2.1.116 bundles are required'
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
  [18159, ['unresolved', 12654841, 12655620, 'ClassDeclaration', '36fb79da1bc19ed89b969240facd73bc77f54e51873e26bbcfd5c1c147105804']],
  [18160, ['unresolved', 12655620, 12655647, 'VariableDeclaration', '98ef79ff7f2962322323dcb0bd59ed2d6999d5c10ac6b96dd27c3f73743e3860']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
}

function assertFragments(contents, fragments, owner) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${owner}: ${fragment}`)
  }
}

function classSource(contents, name) {
  const marker = `class ${name}`
  let start = contents.indexOf(`export ${marker}`)
  assert.notEqual(start, -1, `${name}: declaration`)
  start += 'export '.length
  const body = contents.indexOf('{', start)
  let depth = 0
  for (let index = body; index < contents.length; index++) {
    if (contents[index] === '{') depth++
    if (contents[index] === '}' && --depth === 0) {
      return contents.slice(start, index + 1)
    }
  }
  throw new Error(`${name}: unterminated declaration`)
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

async function compileSessionStateManager(contents) {
  const ts = await loadTypeScript()
  const declaration = classSource(contents, 'SessionStateManager')
  const javascript = ts.transpileModule(
    `
      type SessionState = 'idle' | 'running' | 'requires_action'
      type RequiresActionDetails = {
        tool_name: string
        action_description: string
        tool_use_id: string
        request_id: string
      }
      type SessionExternalMetadata = Record<string, unknown>
      type PermissionMode = string
      type SessionStateChangedListener = (
        state: SessionState,
        details?: RequiresActionDetails,
      ) => void
      type SessionMetadataChangedListener = (
        metadata: SessionExternalMetadata,
      ) => void
      type PermissionModeChangedListener = (mode: PermissionMode) => void
      const emittedEvents: unknown[] = []
      const isEnvTruthy = (value: string | undefined) => value === '1'
      const enqueueSdkEvent = (event: unknown) => emittedEvents.push(event)
      ${declaration}
      function getEmittedEvents() { return emittedEvents }
      export { SessionStateManager, getEmittedEvents }
    `,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const module = { exports: {} }
  new Function('exports', 'module', javascript)(module.exports, module)
  return module.exports
}

test(
  'authenticated target105 pins the session-scoped notifier refactor and unchanged notification semantics',
  bundleOptions,
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

    for (const [index, [classification, start, end, nodeType, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, classification, `${index}: class`)
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        [start, end, nodeType, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }

    const targetClass = target.slice(
      units.get(18159)[1],
      units.get(18159)[2],
    )
    assertFragments(targetClass, [
      'onStateChanged;onMetadataChanged;onPermissionModeChanged',
      'currentState="idle"',
      'hasPendingAction=!1',
      'getState(){return this.currentState}',
      'this.onStateChanged?.(q,K)',
      'this.onMetadataChanged?.({pending_action:K})',
      'this.onMetadataChanged?.({pending_action:null})',
      'if(q==="running")this.onMetadataChanged?.({post_turn_summary:null})',
      'if(q==="idle")this.onMetadataChanged?.({task_summary:null})',
      'process.env.CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS',
      'subtype:"session_state_changed",state:q',
      'notifyMetadataChanged(q){this.onMetadataChanged?.(q)}',
      'notifyPermissionModeChanged(q){this.onPermissionModeChanged?.(q)}',
    ], 'target105 session state class')

    // The running-summary clear is inherited behavior, not the target105
    // delta. 104 owns it in the global notifier; 105 moves it into the class.
    assert.ok(
      baseline.includes(
        'if(q==="running")Yu6?.({post_turn_summary:null})',
      ),
    )
    assert.ok(
      baseline.includes('if(q==="idle")Yu6?.({task_summary:null})'),
    )
    assert.equal(
      baseline.includes(
        'onStateChanged;onMetadataChanged;onPermissionModeChanged',
      ),
      false,
    )
    assert.equal(target.match(/new KA8/g)?.length, 2)

    assertFragments(latest, [
      'onStateChanged;onMetadataChanged;onPermissionModeChanged',
      'if(H==="running")this.onMetadataChanged?.({post_turn_summary:null})',
      'if(H==="idle")this.onMetadataChanged?.({task_summary:null})',
      'process.env.CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS',
    ], 'target116 session state class')
    assert.equal(latest.match(/new Qz\$/g)?.length, 2)
  },
)

test(
  'source root owns the class-backed notifier and compatibility surface',
  sourceOptions,
  () => {
    const owner = source('utils/sessionState.ts')
    assertFragments(owner, [
      'export class SessionStateManager',
      'onStateChanged: SessionStateChangedListener | null = null',
      'onMetadataChanged: SessionMetadataChangedListener | null = null',
      'onPermissionModeChanged: PermissionModeChangedListener | null = null',
      "private currentState: SessionState = 'idle'",
      'private hasPendingAction = false',
      'getState(): SessionState',
      'notifyStateChanged(',
      'this.onStateChanged?.(state, details)',
      'this.onMetadataChanged?.({ pending_action: null })',
      "state === 'running'",
      'this.onMetadataChanged?.({ post_turn_summary: null })',
      "state === 'idle'",
      'this.onMetadataChanged?.({ task_summary: null })',
      'process.env.CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS',
      "subtype: 'session_state_changed'",
      'notifyMetadataChanged(metadata: SessionExternalMetadata)',
      'notifyPermissionModeChanged(mode: PermissionMode)',
      'const defaultSessionState = new SessionStateManager()',
      'defaultSessionState.onStateChanged = cb',
      'defaultSessionState.onMetadataChanged = cb',
      'defaultSessionState.onPermissionModeChanged = cb',
      'return defaultSessionState.getState()',
      'defaultSessionState.notifyStateChanged(state, details)',
      'defaultSessionState.notifyMetadataChanged(metadata)',
      'defaultSessionState.notifyPermissionModeChanged(mode)',
    ], 'utils/sessionState.ts')
    for (const legacyGlobal of [
      'let stateListener',
      'let metadataListener',
      'let permissionModeListener',
      'let currentState',
      'let hasPendingAction',
    ]) {
      assert.equal(owner.includes(legacyGlobal), false, legacyGlobal)
    }
  },
)

test(
  'session managers execute isolated pending, running, idle, metadata, permission, and SDK-event transitions',
  sourceOptions,
  async () => {
    const runtime = await compileSessionStateManager(
      source('utils/sessionState.ts'),
    )
    const first = new runtime.SessionStateManager()
    const second = new runtime.SessionStateManager()
    const states = []
    const metadata = []
    const permissions = []
    first.onStateChanged = (state, details) => states.push({ state, details })
    first.onMetadataChanged = value => metadata.push(value)
    first.onPermissionModeChanged = mode => permissions.push(mode)

    assert.equal(first.getState(), 'idle')
    assert.equal(second.getState(), 'idle')
    const details = {
      tool_name: 'Bash',
      action_description: 'Running tests',
      tool_use_id: 'tool-1',
      request_id: 'request-1',
    }
    first.notifyStateChanged('requires_action', details)
    assert.equal(first.getState(), 'requires_action')
    assert.equal(second.getState(), 'idle')
    assert.deepEqual(states, [{ state: 'requires_action', details }])
    assert.deepEqual(metadata, [{ pending_action: details }])

    first.notifyStateChanged('running')
    assert.equal(first.getState(), 'running')
    assert.deepEqual(metadata.slice(1), [
      { pending_action: null },
      { post_turn_summary: null },
    ])

    first.notifyStateChanged('idle')
    assert.equal(first.getState(), 'idle')
    assert.deepEqual(metadata.at(-1), { task_summary: null })
    first.notifyMetadataChanged({ model: 'sonnet' })
    assert.deepEqual(metadata.at(-1), { model: 'sonnet' })
    first.notifyPermissionModeChanged('plan')
    assert.deepEqual(permissions, ['plan'])

    const previous = process.env.CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS
    try {
      delete process.env.CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS
      second.notifyStateChanged('running')
      assert.deepEqual(runtime.getEmittedEvents(), [])
      process.env.CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS = '1'
      second.notifyStateChanged('idle')
      assert.deepEqual(runtime.getEmittedEvents(), [
        {
          type: 'system',
          subtype: 'session_state_changed',
          state: 'idle',
        },
      ])
    } finally {
      if (previous === undefined) {
        delete process.env.CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS
      } else {
        process.env.CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS = previous
      }
    }
  },
)
