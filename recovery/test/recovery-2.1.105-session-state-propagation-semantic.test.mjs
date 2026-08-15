import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
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
  [16891, ['unresolved', 12051614, 12052567, 'FunctionDeclaration', '9a4d73cf90f7233b3e32c02afd4dc5f4625c04d60adb367b16a63a1cba36e0d3']],
  [18168, ['unresolved', 12656679, 12664647, 'ClassDeclaration', '68aaf8d17a3e069cf05c8e8b0bdd8fb21edf91367de5386417cc6d052af374c9']],
  [18920, ['unresolved', 13403831, 13406856, 'VariableDeclaration', 'a845c11b298489496aac9f1589524e8dd3a572ec8121451e49960ab0bbc6b2c3']],
  [18934, ['unresolved', 13410330, 13426994, 'ClassDeclaration', '9c1d060ead7a059c35f7a2f11f846cedaa050565fe4fcc62e0d5a1f6651204c5']],
  [18935, ['unresolved', 13426994, 13428318, 'FunctionDeclaration', '42006e68390ac01422b64f304d9e0b3627bd52d1ffebe75ff2168de133857bc9']],
  [18966, ['unresolved', 13432960, 13439202, 'FunctionDeclaration', '9ab54f2e6c25e338fbe8e889e7fc0992b51e31e6b02aa34a7ffff131556130f2']],
  [18967, ['unresolved', 13439202, 13472373, 'FunctionDeclaration', 'dff9e4822e9aeb3d9473b61353ca117788616672af04a6c2c19428c0c2d67be1']],
  [18979, ['unresolved', 13484827, 13485131, 'FunctionDeclaration', '1c7e9014f439b9f7c4fe47df0c5ff2867fc15503f30e18c729a08affea7c609b']],
  [19107, ['unresolved', 13549399, 13604560, 'FunctionDeclaration', '9a4b0aee2b5e06161abe44cd8f91c64a7333e23a736e273ce8851e9dcf8e3725']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
}

function assertFragments(contents, fragments, owner) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${owner}: ${fragment}`)
  }
}

test(
  'authenticated target105 pins per-session state and command-lifecycle propagation end to end',
  bundleOptions,
  () => {
    if (bundleOptions.skip) return
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
          region.target.index,
          region.target.parseStatus,
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        [index, 'parsed', start, end, nodeType, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }

    assert.equal(occurrences(baseline, 'sessionState'), 0)
    assert.equal(occurrences(target, 'sessionState'), 24)
    assert.equal(occurrences(latest, 'sessionState'), 28)
    assert.equal(occurrences(baseline, 'notifyStateChanged'), 0)
    assert.equal(occurrences(target, 'notifyStateChanged'), 5)
    assert.equal(occurrences(latest, 'notifyStateChanged'), 5)

    assertFragments(
      target.slice(units.get(16891)[1], units.get(16891)[2]),
      [
        '_?.notifyMetadataChanged({permission_mode:O,is_ultraplan_mode:w})',
        '_?.notifyPermissionModeChanged(Y)',
      ],
      'target105 app-state propagation',
    )
    assertFragments(
      target.slice(units.get(18168)[1], units.get(18168)[2]),
      [
        'onCommandLifecycle;sessionState',
        'this.sessionState=_??new KA8',
        'this.onCommandLifecycle?.(_,"completed")',
        'this.sessionState.notifyStateChanged("running")',
      ],
      'target105 StructuredIO',
    )
    assertFragments(
      target.slice(units.get(18920)[1], units.get(18920)[2]),
      [
        'constructor(q,K,_,z)',
        'super(Y,_,z)',
        'this.onCommandLifecycle=(X,M)=>',
        'this.sessionState.onStateChanged=(X,M)=>',
        'this.sessionState.onMetadataChanged=(X)=>',
        'this.sessionState.notifyMetadataChanged(X)',
      ],
      'target105 RemoteIO',
    )
    assert.equal(
      occurrences(
        target.slice(units.get(18934)[1], units.get(18934)[2]),
        'sessionState:this.config.sessionState',
      ),
      2,
    )
    assertFragments(
      target.slice(units.get(18935)[1], units.get(18935)[2]),
      [
        'onCommandLifecycle:U,sessionState:c',
        'onCommandLifecycle:U,sessionState:c,replayUserMessages:S',
      ],
      'target105 ask',
    )
    assert.ok(
      target
        .slice(units.get(18966)[1], units.get(18966)[2])
        .includes('$.sessionState.notifyStateChanged("requires_action",b)'),
    )
    assertFragments(
      target.slice(units.get(18967)[1], units.get(18967)[2]),
      [
        'worker_status:q.sessionState.getState()',
        'q.sessionState.onPermissionModeChanged=(Q6)=>',
        'q.sessionState.notifyStateChanged("running")',
        'q.onCommandLifecycle?.(A8,"started")',
        'onCommandLifecycle:q.onCommandLifecycle,sessionState:q.sessionState',
        'q.onCommandLifecycle?.(A8,"completed")',
        'q.sessionState.notifyStateChanged("idle")',
        'q.sessionState.notifyMetadataChanged({model:N6})',
      ],
      'target105 print loop',
    )
    assertFragments(
      target.slice(units.get(18979)[1], units.get(18979)[2]),
      [
        'new Me8(K.sdkUrl,_,K.replayUserMessages,K.sessionState)',
        'new _A8(_,K.replayUserMessages,K.sessionState)',
      ],
      'target105 transport construction',
    )
    assertFragments(
      target.slice(units.get(19107)[1], units.get(19107)[2]),
      [
        'D3=new KA8,w3=Rd(Jq,(SK)=>E66(SK,D3))',
        'sessionStartHooksPromise:v1,sessionState:D3',
      ],
      'target105 headless root',
    )
  },
)

test(
  'authored source passes one manager and one lifecycle channel through every headless layer',
  sourceOptions,
  () => {
    const tool = source('Tool.ts')
    const appState = source('state/onChangeAppState.ts')
    const structured = source('cli/structuredIO.ts')
    const remote = source('cli/remoteIO.ts')
    const query = source('QueryEngine.ts')
    const print = source('cli/print.ts')
    const main = source('main.tsx')

    assertFragments(tool, [
      "import type { SessionStateManager } from './utils/sessionState.js'",
      "onCommandLifecycle?: (",
      'sessionState?: SessionStateManager',
    ], 'Tool.ts')
    assertFragments(appState, [
      'sessionState?: SessionStateManager',
      'sessionState?.notifyMetadataChanged({',
      'sessionState?.notifyPermissionModeChanged(newMode)',
    ], 'state/onChangeAppState.ts')
    assertFragments(structured, [
      'onCommandLifecycle?: (',
      'readonly sessionState: SessionStateManager',
      'sessionState?: SessionStateManager',
      'this.sessionState = sessionState ?? new SessionStateManager()',
      "this.onCommandLifecycle?.(uuid, 'completed')",
      "this.sessionState.notifyStateChanged('running')",
    ], 'cli/structuredIO.ts')
    assertFragments(remote, [
      'sessionState?: SessionStateManager',
      'super(inputStream, replayUserMessages, sessionState)',
      'this.onCommandLifecycle = (uuid, state) =>',
      'this.sessionState.onStateChanged = (state, details) =>',
      'this.sessionState.onMetadataChanged = metadata =>',
      'this.sessionState.notifyMetadataChanged(metadata)',
    ], 'cli/remoteIO.ts')
    assert.equal(
      occurrences(query, 'sessionState: this.config.sessionState'),
      2,
    )
    assertFragments(query, [
      'sessionState: SessionStateManager',
      'onCommandLifecycle: this.config.onCommandLifecycle',
      'onCommandLifecycle,',
      'sessionState,',
    ], 'QueryEngine.ts')
    assertFragments(print, [
      'sessionState: SessionStateManager',
      "structuredIO.sessionState.notifyStateChanged('requires_action', details)",
      'worker_status: structuredIO.sessionState.getState()',
      'structuredIO.sessionState.onPermissionModeChanged = newMode =>',
      "structuredIO.onCommandLifecycle?.(uuid, 'started')",
      'onCommandLifecycle: structuredIO.onCommandLifecycle',
      'sessionState: structuredIO.sessionState',
      "structuredIO.onCommandLifecycle?.(uuid, 'completed')",
      "structuredIO.sessionState.notifyStateChanged('idle')",
      'options.sessionState',
    ], 'cli/print.ts')
    assertFragments(main, [
      "import { SessionStateManager } from './utils/sessionState.js';",
      'const sessionState = new SessionStateManager();',
      'event => onChangeAppState(event, sessionState)',
      'sessionState',
    ], 'main.tsx')

    assert.equal(
      print.includes("from 'src/utils/commandLifecycle.js'"),
      false,
      'print must not use the process-global command lifecycle channel',
    )
    const sessionStateImportEnd =
      print.indexOf("from 'src/utils/sessionState.js'") +
      "from 'src/utils/sessionState.js'".length
    const sessionStateImportStart = print.lastIndexOf(
      'import {',
      sessionStateImportEnd,
    )
    const sessionStateImport = print.slice(
      sessionStateImportStart,
      sessionStateImportEnd,
    )
    for (const legacy of [
      'getSessionState,',
      'notifySessionStateChanged,',
      'notifySessionMetadataChanged,',
      'setPermissionModeChangedListener,',
    ]) {
      assert.equal(
        sessionStateImport.includes(legacy),
        false,
        `print must not import ${legacy}`,
      )
    }
  },
)
