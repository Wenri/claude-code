import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = [
  {
    version: '2.1.121',
    envNames: ['CLAUDE_CODE_2_1_121_BUNDLE', 'CLAUDE_2_1_121_CLI_INNER'],
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
    sessionStateCount: 30,
    notifyMetadataCount: 3,
  },
  {
    version: '2.1.122',
    envNames: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    sessionStateCount: 31,
    notifyMetadataCount: 4,
  },
]

function readBundle(release) {
  const filename = release.envNames
    .map(name => process.env[name])
    .find(Boolean)
  assert.ok(filename, `${release.envNames.join(' or ')} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return bytes.toString('utf8')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function readSource(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

function sourceFiles(directory) {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...sourceFiles(filename))
    else if (/\.tsx?$/.test(entry.name)) files.push(filename)
  }
  return files
}

test('authenticates target instance manager and complete callgraph cardinality', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      occurrences(bundle, 'sessionState'),
      release.sessionStateCount,
      `${release.version}: sessionState cardinality`,
    )
    assert.equal(occurrences(bundle, '.sessionState.getState()'), 3)
    assert.equal(occurrences(bundle, '.sessionState.notifyStateChanged'), 4)
    assert.equal(
      occurrences(bundle, '.sessionState.notifyMetadataChanged'),
      release.notifyMetadataCount,
    )
    assert.equal(
      occurrences(bundle, 'sessionState:this.config.sessionState'),
      2,
    )
    assert.equal(occurrences(bundle, 'onPermissionModeChanged'), 3)
  }

  const target = readBundle(releases[1])
  assert.match(
    target,
    /class [\w$]+\{onStateChanged;onMetadataChanged;onInternalMetadataChanged;onPermissionModeChanged;currentState="idle";hasPendingAction=!1;hasTaskSummary=!1;getState\(\)\{return this\.currentState\}/,
  )
  assert.match(
    target,
    /sessionState;outbound=.*?constructor\([^)]*\)\{.*?this\.sessionState=.*?\?\?new [\w$]+/s,
  )
  for (const fragment of [
    'q?.notifyPermissionModeChanged(_)',
    'if(q&&H.tasks!==$.tasks)',
    'q?.notifyInternalMetadataChanged({session_allow_rules:',
    'if(H.effortValue!==$.effortValue)q?.notifyMetadataChanged({effort_level:H.effortValue==null?null:String(H.effortValue)})',
  ]) {
    assert.equal(occurrences(target, fragment), 1, fragment)
  }
  assert.match(
    target,
    /q\?\.notifyMetadataChanged\(\{model:f\?\?[\w$]+\(\)\}\)/,
  )
  assert.match(
    target,
    /mainLoopModelForSession:[\w$]+\}\)\),[\w$]+\.sessionState\.notifyMetadataChanged\(\{model:[\w$]+\}\)/,
  )
})

test('manager state, latches, and callbacks are instance-owned', () => {
  const manager = compact(readSource('src/utils/sessionState.ts'))
  for (const fragment of [
    'export class SessionStateManager',
    'onStateChanged?: SessionStateChangedListener',
    'onMetadataChanged?: SessionMetadataChangedListener',
    'onInternalMetadataChanged?: SessionInternalMetadataChangedListener',
    'onPermissionModeChanged?: PermissionModeChangedListener',
    "private currentState: SessionState = 'idle'",
    'private hasPendingAction = false',
    'private hasTaskSummary = false',
    'return this.currentState',
    'this.onStateChanged?.(state, details)',
    'this.onMetadataChanged?.(metadata)',
    'this.onInternalMetadataChanged?.(metadata)',
    'this.onPermissionModeChanged?.(mode)',
  ]) {
    assert.ok(manager.includes(compact(fragment)), fragment)
  }
  assert.doesNotMatch(manager, /(?:^| )let currentState(?: |:|=)/)
  assert.doesNotMatch(manager, /setSessionStateChangedListener/)
})

test('threads one owner through store, IO, print, and both query contexts', () => {
  const manager = compact(readSource('src/utils/sessionState.ts'))
  const main = compact(readSource('src/main.tsx'))
  const state = compact(readSource('src/state/onChangeAppState.ts'))
  const structuredIO = compact(readSource('src/cli/structuredIO.ts'))
  const remoteIO = compact(readSource('src/cli/remoteIO.ts'))
  const print = compact(readSource('src/cli/print.ts'))
  const engine = compact(readSource('src/QueryEngine.ts'))

  for (const fragment of [
    'export class SessionStateManager',
    'onStateChanged?: SessionStateChangedListener',
    'onMetadataChanged?: SessionMetadataChangedListener',
    'onInternalMetadataChanged?: SessionInternalMetadataChangedListener',
    'onPermissionModeChanged?: PermissionModeChangedListener',
    "private currentState: SessionState = 'idle'",
  ]) {
    assert.ok(manager.includes(compact(fragment)), fragment)
  }
  assert.ok(main.includes('const sessionState = new SessionStateManager()'))
  assert.ok(main.includes(compact('onChangeAppState(args, sessionState)')))
  assert.ok(main.includes(compact('sessionStartHooksPromise, sessionState')))
  assert.ok(
    state.includes(
      compact('sessionState?: SessionStateManager, ) {'),
    ),
  )
  for (const fragment of [
    'sessionState?.notifyPermissionModeChanged(newMode)',
    'if (sessionState && newState.tasks !== oldState.tasks)',
    'sessionState?.notifyInternalMetadataChanged({ session_allow_rules:',
    'model: selected ?? getDefaultMainLoopModel()',
    'newState.effortValue == null ? null : String(newState.effortValue)',
    "getRuntimeCapabilities().workspace !== 'remote'",
    'checkHasTrustDialogAccepted()',
  ]) {
    assert.ok(state.includes(compact(fragment)), fragment)
  }
  assert.equal(occurrences(state, 'session_allow_rules:'), 1)
  assert.ok(
    structuredIO.includes(
      compact('readonly sessionState: SessionStateManager'),
    ),
  )
  assert.ok(
    structuredIO.includes(
      compact('this.sessionState = sessionState ?? new SessionStateManager()'),
    ),
  )
  assert.ok(
    remoteIO.includes(compact('super(inputStream, replayUserMessages, sessionState)')),
  )
  assert.ok(
    remoteIO.includes(compact('this.sessionState.onStateChanged =')),
  )
  assert.ok(
    remoteIO.includes(compact('this.sessionState.onMetadataChanged =')),
  )
  assert.ok(
    remoteIO.includes(compact('this.sessionState.onInternalMetadataChanged =')),
  )
  assert.equal(
    occurrences(print, 'structuredIO.sessionState.notifyStateChanged'),
    3,
  )
  assert.ok(
    print.includes(
      compact(
        'mainLoopModelForSession: model, })) structuredIO.sessionState.notifyMetadataChanged({ model })',
      ),
    ),
  )
  assert.equal(
    occurrences(engine, 'sessionState: this.config.sessionState'),
    2,
  )
  assert.ok(print.includes('sessionState: structuredIO.sessionState'))

  for (const legacy of [
    'setSessionStateChangedListener',
    'setSessionMetadataChangedListener',
    'setSessionInternalMetadataChangedListener',
    'setPermissionModeChangedListener',
    'getSessionState',
    'notifySessionStateChanged',
    'notifySessionMetadataChanged',
    'notifySessionInternalMetadataChanged',
  ]) {
    assert.equal(
      occurrences(manager, `export function ${legacy}`),
      0,
      `removed global ${legacy}`,
    )
  }

  const legacyImports = sourceFiles(path.join(repo, 'src')).filter(filename => {
    const source = fs.readFileSync(filename, 'utf8')
    return /import\s*\{[^}]*\b(?:getSessionState|notifySessionStateChanged|notifySessionMetadataChanged|notifySessionInternalMetadataChanged|setSessionStateChangedListener|setSessionMetadataChangedListener|setSessionInternalMetadataChangedListener|setPermissionModeChangedListener)\b[^}]*\}\s*from\s*['"][^'"]*sessionState\.js['"]/.test(
      source,
    )
  })
  assert.deepEqual(legacyImports, [])
})
