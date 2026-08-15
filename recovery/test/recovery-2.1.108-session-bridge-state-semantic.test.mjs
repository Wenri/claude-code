import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.107-to-2.1.108'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const isCurrentSource =
  sourceRoot === path.resolve(path.join(repositoryRoot, 'src'))
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
  [16339, [11553648, 11556715, 'ExpressionStatement', 'c5bdf53cd5c5174ce547a75c6db415122fa9700dc24325ea05f934a08db9a0a6']],
  [16380, [11560131, 11569838, 'ClassDeclaration', '030e8da09471eb197c4687a49255adb0b33f8e834ae490657301cb37fe1ee423']],
  [16421, [11580902, 11581547, 'FunctionDeclaration', 'ddef73ddd7d7806c1845bde8e3ca3075993f83090ee457e28a72f7b8315c6a8b']],
  [16422, [11581547, 11581961, 'FunctionDeclaration', 'dac34eeb18786ac80916ea33f229c4b6e65f1904a04bd9ae25bafc461510bcef']],
  [16429, [11582517, 11582569, 'FunctionDeclaration', '937a28ecea7a5615fbda010ac5f80e593e2276fdb1342146015fca0a7336bf2f']],
  [16433, [11583170, 11584635, 'FunctionDeclaration', '652a5956aba75330034dbe1c3500fc1c95d7c8ddbbfb14bd86cab50841c9166e']],
  [16439, [11587699, 11591059, 'FunctionDeclaration', '10e5fa7e25d7e2ae3c91e60d9a8394acca24c77ae0144f8d7a22a7639a7f65d0']],
  [16443, [11591220, 11592202, 'FunctionDeclaration', '4d5037372fc3f5de07784566bd52470fe36877e8e75e0a5b3645ba103c733787']],
  [16465, [11598570, 11599820, 'FunctionDeclaration', '3502e3770eb2120fb31f9a45d2450770f3fb59033d737122e4acf2fc469c242c']],
  [16476, [11604751, 11606264, 'VariableDeclaration', 'bbdf8518e9c9d61676efe9d3bf57e0ed9a5d10c9e3998df9eae8c73d3de9520b']],
  [17164, [11967262, 11976520, 'FunctionDeclaration', '9b9e619171c012e63acbe3b9c0fefe7098748510bf966bc6e950b039d64623fb']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function count(contents, fragment) {
  return contents.split(fragment).length - 1
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

test('target108 pins the complete session and envless-bridge state surface', bundleOptions, () => {
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
      [region.target.start, region.target.end, region.target.nodeType, region.target.sourceHash],
      [start, end, nodeType, expectedHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(target.slice(start, end)), expectedHash, `${index}: bytes`)
    assert.equal(
      parse(target.slice(start, end), {
        ecmaVersion: 'latest',
        sourceType: 'module',
      }).body.length,
      1,
      `${index}: one complete AST unit`,
    )
  }
})

test('target108 adds persistence gate, repl progress, and pending-action lifecycle over the inherited graph', bundleOptions, () => {
  const baseline = fs.readFileSync(baselinePath, 'utf8')
  const target = fs.readFileSync(targetPath, 'utf8')

  // Permission-mode persistence and the envless persistence callbacks are
  // inherited from target107, even though historical authored source lacked them.
  assert.equal(count(baseline, 'currentSessionPermissionMode'), 6)
  assert.equal(count(target, 'currentSessionPermissionMode'), 6)
  assert.equal(count(baseline, 'onSessionEstablished'), 2)
  assert.equal(count(target, 'onSessionEstablished'), 2)
  assert.equal(count(baseline, 'onTransportPersistenceReady'), 2)
  assert.equal(count(target, 'onTransportPersistenceReady'), 2)
  assert.equal(count(baseline, 'onTransportPersistenceTeardown'), 2)
  assert.equal(count(target, 'onTransportPersistenceTeardown'), 2)

  assert.equal(count(baseline, 'isTranscriptPersistenceDisabled'), 0)
  assert.equal(count(target, 'isTranscriptPersistenceDisabled'), 1)
  assert.equal(count(baseline, 'repl_tool_call'), 1)
  assert.equal(count(target, 'repl_tool_call'), 12)
  assert.equal(count(baseline, 'reportMetadata({pending_action'), 0)
  assert.equal(count(target, 'reportMetadata({pending_action'), 2)
  assert.equal(count(baseline, 'pending_action:null'), 2)
  assert.equal(count(target, 'pending_action:null'), 3)
  // One dependency helper has async disposal in both bundles; target108 adds
  // the app bridge handle, while another target-only occurrence is dependency code.
  assert.equal(count(baseline, '[Symbol.asyncDispose]'), 1)
  assert.equal(count(target, '[Symbol.asyncDispose]'), 3)

  const bridge = target.slice(11967262, 11976520)
  for (const fragment of [
    'onSessionEstablished:J',
    'onTransportPersistenceReady:V',
    'onTransportPersistenceTeardown:E',
    'tengu_bridge_requires_action_details',
    'reportMetadata({pending_action:',
    '[Symbol.asyncDispose](){return',
  ]) {
    assert.ok(bridge.includes(fragment), fragment)
  }
})

test('source owns permission-mode persistence and the target108 transcript gate', sourceOptions, () => {
  const session = assertFragments('utils/sessionStorage.ts', [
    "'repl_tool_call'",
    'export function isTranscriptPersistenceDisabled(): boolean',
    'process.env.TEST_ENABLE_SESSION_PERSISTENCE',
    "getNodeEnv() === 'test' && !allowTestPersistence",
    'isSessionPersistenceDisabled()',
    'process.env.CLAUDE_CODE_SKIP_PROMPT_HISTORY',
    'currentSessionPermissionMode: PermissionMode | undefined',
    "type: 'permission-mode'",
    'permissionMode: this.currentSessionPermissionMode',
    'project.currentSessionPermissionMode = meta.permissionMode',
    'project.currentSessionPermissionMode = undefined',
    'export function savePermissionMode(permissionMode: PermissionMode)',
    'const permissionModes = new Map<UUID, PermissionMode>()',
    "entry.type === 'permission-mode' && entry.sessionId",
    'permissionModes.set(entry.sessionId, entry.permissionMode)',
    'permissionMode: permissionModes.get(sessionId)',
  ])

  const gate = session.indexOf('export function isTranscriptPersistenceDisabled')
  const storageUse = session.indexOf('isTranscriptPersistenceDisabled()', gate + 1)
  assert.ok(gate >= 0 && storageUse > gate)
  const modeProperty = session.indexOf('currentSessionPermissionMode:')
  const modeAppend = session.indexOf('permissionMode: this.currentSessionPermissionMode')
  const modeRestore = session.indexOf('project.currentSessionPermissionMode = meta.permissionMode')
  const modeSave = session.indexOf('export function savePermissionMode')
  assert.ok(modeProperty < modeAppend && modeAppend < modeRestore && modeRestore < modeSave)
})

test('source owns envless persistence callbacks and pending-action state clearing', sourceOptions, () => {
  const bridge = assertFragments('bridge/remoteBridgeCore.ts', [
    'onSessionEstablished?: (sessionId: string) => void',
    'onTransportPersistenceReady?: (',
    'onTransportPersistenceTeardown?: () => void',
    'onSessionEstablished?.(sessionId)',
    'transport.getInternalEventWriter?.()',
    'transport.getInternalEventReaders?.()',
    'onTransportPersistenceReady?.(writer, readers)',
    'onTransportPersistenceTeardown?.()',
    'let hasPendingAction = false',
    "state === 'requires_action' && details",
    'transport.reportMetadata({ pending_action: details })',
    'transport.reportMetadata({ pending_action: null })',
    "'tengu_bridge_requires_action_details'",
    "reportBridgeState('requires_action', details)",
    '[Symbol.asyncDispose]()',
    'return handle.teardown()',
  ])

  assert.equal(count(bridge, 'transport.reportState('), 1)
  const setPending = bridge.indexOf('transport.reportMetadata({ pending_action: details })')
  const clearPending = bridge.indexOf('transport.reportMetadata({ pending_action: null })')
  const requireAction = bridge.indexOf("reportBridgeState('requires_action', details)")
  const resultIdle = bridge.lastIndexOf("reportBridgeState('idle')")
  assert.ok(setPending >= 0 && setPending < clearPending)
  assert.ok(clearPending < requireAction && requireAction < resultIdle)

  if (isCurrentSource) {
    assert.ok(
      bridge.includes(
        'request.request.display_name || request.request.tool_name',
      ),
    )
  } else {
    assert.ok(bridge.includes('tool_name: request.request.tool_name'))
    assert.equal(
      bridge.includes(
        'request.request.display_name || request.request.tool_name',
      ),
      false,
    )
  }
})
