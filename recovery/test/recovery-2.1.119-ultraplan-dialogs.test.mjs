import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const BASELINE_BYTES = 13_234_618
const BASELINE_SHA256 =
  '84d06c8582112ca623b66cc28b3a55c5d57e9add86d7a1b1163d6a12a31a9ffa'
const TARGET_BYTES = 13_720_987
const TARGET_SHA256 =
  '9a1fccbe69ffe06c82345db1cc8cdbbc9a9929ed723bc8832ad48dfeff64b4ef'
const repo = fileURLToPath(new URL('../..', import.meta.url))

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function loadBundle(environmentName, expectedBytes, expectedSha256) {
  const filename = process.env[environmentName]
  assert.ok(filename, `${environmentName} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, expectedBytes, `${environmentName}: byte length`)
  assert.equal(sha256(bytes), expectedSha256, `${environmentName}: SHA-256`)
  return bytes.toString('utf8')
}

function occurrences(contents, fragment) {
  let count = 0
  let offset = 0
  while ((offset = contents.indexOf(fragment, offset)) !== -1) {
    count++
    offset += fragment.length
  }
  return count
}

function compact(value) {
  return value.replaceAll(/\s+/g, ' ').trim()
}

function assertSourceFragments(sourcePath, fragments) {
  const contents = compact(fs.readFileSync(path.join(repo, sourcePath), 'utf8'))
  for (const fragment of fragments) {
    assert.equal(
      occurrences(contents, compact(fragment)),
      1,
      `${sourcePath}: ${fragment}`,
    )
  }
}

const TARGET_FRAGMENTS = [
  {
    name: 'canonical config, subscription, and local-mode gate',
    fragment:
      'function da(){return k$("tengu_ultraplan_config",null)?.enabled===!0&&Fo$()&&!m6()}',
    sha256: '619d5e84c092001b21f5d95b483147e84e6b6649b8b670d087d08c12ffa36dcc',
    baseline: 0,
    target: 1,
  },
  {
    name: 'slash-command launch payload',
    fragment:
      'ultraplanLaunchPending:{ultraplanArg:K,source:"slash",sourcePromise:f}',
    sha256: 'b7272ca183ead43c5ede65ce39e69a2ea00408b70e24d07e21154ce25b374c4b',
    baseline: 1,
    target: 1,
  },
  {
    name: 'launch dialog title',
    fragment: 'Run ultraplan in the cloud?',
    sha256: '847c34ac953f52a328a702287bc53894387dd762483bfc631d0e2ba740dd1800',
    baseline: 1,
    target: 1,
  },
  {
    name: 'launch dialog choice telemetry',
    fragment: 'tengu_ultraplan_dialog_choice',
    sha256: '1ce7195a8f10e218b4d37decb265466983ef6e28e4fc55da59d88145e1e78a19',
    baseline: 1,
    target: 1,
  },
  {
    name: 'implement-here handoff',
    fragment: 'Ultraplan approved in browser. Here is the plan:',
    sha256: 'a2d50efe159e12a496af64fa7e9f5d55642a658e9812fbeb1f0149c26e834ef8',
    baseline: 1,
    target: 1,
  },
  {
    name: 'fresh-session handoff',
    fragment: 'Here is the approved implementation plan:',
    sha256: 'cc0030eecb6a6cbc24ae562126c4a6874a3e63e36506d26e67cc4a51b70f30f1',
    baseline: 1,
    target: 1,
  },
  {
    name: 'cancel saves beneath the plans directory with a word slug',
    fragment: 'let e=$24.join(w3(),`${Ai$()}-ultraplan.md`)',
    sha256: '609cdc3c179bacf0edc6b259d89d53b080eb8f2c08d3a88923d740795b2f9f44',
    baseline: 0,
    target: 1,
  },
  {
    name: 'choice completes task, clears launch state, and archives remote',
    fragment: 'X.update(_,xL5),j(bL5),zB(K)',
    sha256: '9c43129cf6ff4801ea6df1477efb7d81ee4f9d46d38d04ffeecab5229bd03aac',
    baseline: 0,
    target: 1,
  },
  {
    name: 'choice dialog here option',
    fragment:
      '{label:"Implement here",value:"here",description:"Inject plan into the current conversation"}',
    sha256: '5703451bf39db55a660336dcce05bf023a90811b14125a96dcf49503604faf8d',
    baseline: 1,
    target: 1,
  },
  {
    name: 'REPL choice dialog state dependencies',
    fragment:
      'Hf==="ultraplan-choice"&&t&&_8.createElement(q24,{plan:t.plan,sessionId:t.sessionId,taskId:t.taskId,setMessages:I4,readFileState:XF.current,memorySelector:iTH.current,sessionEnvVars:TOH.current,getAppState:()=>MH.getState(),setConversationId:nk,resultDedupState:jF.current,isolationLatch:Vc.current})',
    sha256: 'b38bac9881c8c53358eab7386c3df53fa6067520d0a6252640e663c5e5275cb7',
    baseline: 0,
    target: 1,
  },
  {
    name: 'REPL launch dialog source preflight',
    fragment:
      'Hf==="ultraplan-launch"&&o&&_8.createElement(xt7,{sourcePromise:o.sourcePromise',
    sha256: 'c0eb7c354aec3e68b446691e59cee4aec1956bbfbf76edcb1ce0fdb52523bb0e',
    baseline: 0,
    target: 1,
  },
  {
    name: 'remote-approved metadata cleanup',
    fragment:
      'tf$(H).catch((X)=>y(`ultraplan meta delete failed: ${String(X)}`))',
    sha256: 'a0d7357c1b237d075594a9e925abe2468d148f2822fd0aa27b4f5980f4f1d3b4',
    baseline: 0,
    target: 1,
  },
  {
    name: 'poll failure event statistics',
    fragment:
      'events_received:j?.eventsReceived,first_event_ms:j?.firstEventAt!==void 0?j.firstEventAt-z:void 0,last_event_age_ms:j?.lastEventAt!==void 0?w-j.lastEventAt:void 0',
    sha256: '1def9e109ab93593ff740e984279c353d6a12b5ef391aa790a9df7311296459f',
    baseline: 1,
    target: 1,
  },
  {
    name: 'graceful-shutdown conditional archive',
    fragment:
      'AK(async()=>{if(_().ultraplanSessionUrl===L)await zB(J.id,1500)})',
    sha256: '69c1948c5aef3a4081b30833c4f185f6177264729ab2e53451c48942ca853269',
    baseline: 0,
    target: 1,
  },
  {
    name: 'default environment and bundle launch policy',
    fragment: 'useDefaultEnvironment:!0,allowBundle:!0',
    sha256: '278bf2385b50607420349174f67afbec282f7e9575d26f15be326a9bd7468b04',
    baseline: 1,
    target: 1,
  },
]

test('authenticates the exact 2.1.119 Ultraplan dialog and dispatch witnesses', () => {
  const baseline = loadBundle(
    'CLAUDE_CODE_2_1_118_BUNDLE',
    BASELINE_BYTES,
    BASELINE_SHA256,
  )
  const target = loadBundle(
    'CLAUDE_CODE_2_1_119_BUNDLE',
    TARGET_BYTES,
    TARGET_SHA256,
  )

  for (const witness of TARGET_FRAGMENTS) {
    assert.equal(
      sha256(witness.fragment),
      witness.sha256,
      `${witness.name}: fragment SHA-256`,
    )
    assert.equal(
      occurrences(baseline, witness.fragment),
      witness.baseline,
      `${witness.name}: baseline count`,
    )
    assert.equal(
      occurrences(target, witness.fragment),
      witness.target,
      `${witness.name}: target count`,
    )
  }
})

test('binds the canonical gate, payload, and launch dialog to source', () => {
  assertSourceFragments('src/utils/ultraplan/config.ts', [
    "'tengu_ultraplan_config', null",
    'config?.enabled === true && isClaudeAISubscriber() && !getIsRemoteMode()',
    "'tengu_ultraplan_prompt_identifier'",
  ])
  assertSourceFragments('src/state/AppStateStore.ts', [
    "ultraplanArg: string source: 'slash' | 'keyword' sourcePromise?: Promise<{ cloneViable: boolean bundleSeedEnabled: boolean } | null>",
  ])
  assertSourceFragments('src/commands/ultraplan.tsx', [
    "const ultraplanArg = replaceUltraplanKeyword(args).trim()",
    "ultraplanLaunchPending: { ultraplanArg, source: 'slash', sourcePromise }",
    "source: 'ultraplan'",
    'useDefaultEnvironment: true, allowBundle: true',
  ])
  assertSourceFragments('src/utils/processUserInput/processUserInput.ts', [
    "...current.ultraplanLaunchPending, source: 'keyword'",
  ])
  assertSourceFragments('src/components/UltraplanLaunchDialog.tsx', [
    'title="Run ultraplan in the cloud?"',
    "logEvent('tengu_ultraplan_dialog_choice', {",
    "logEvent('tengu_ultraplan_first_launch', {",
    'replBridgeEnabled: false, replBridgeExplicit: false, replBridgeOutboundOnly: false',
    'hasSeenUltraplanTerms: true',
  ])
})

test('binds here, fresh, cancel, completion, archive, and scrolling to source', () => {
  assertSourceFragments('src/components/UltraplanChoiceDialog.tsx', [
    "'Ultraplan approved in browser. Here is the plan:'",
    "'The user approved this plan in the remote session. Give them a brief summary, then start implementing.'",
    'await clearConversation({ setMessages, readFileState, discoveredSkillNames, loadedNestedMemoryPaths, getAppState, setAppState, setConversationId, resultDedupState, isolationLatch, })',
    'Here is the approved implementation plan:',
    'const planPath = join( getPlansDirectory(), `${generateWordSlug()}-ultraplan.md`, )',
    "task.status !== 'running' ? task : { ...task, status: 'completed', endTime: Date.now() }",
    'ultraplanPendingChoice: undefined, ultraplanSessionUrl: undefined',
    'void archiveRemoteSession(sessionId)',
    'const MAX_VISIBLE_PLAN_LINES = 24',
    'const RESERVED_TERMINAL_ROWS = 11',
    'scrollBy(event.deltaY > 0 ? 3 : -3)',
    "label: 'Implement here'",
    "label: 'Start new session'",
    'description: "Don\'t implement — save plan and return"',
  ])
})

test('binds REPL dialog props/status replacement and poll cleanup to source', () => {
  assertSourceFragments('src/screens/REPL.tsx', [
    '<UltraplanChoiceDialog plan={ultraplanPendingChoice.plan} sessionId={ultraplanPendingChoice.sessionId} taskId={ultraplanPendingChoice.taskId} setMessages={setMessages} readFileState={readFileState.current} discoveredSkillNames={discoveredSkillNamesRef.current} loadedNestedMemoryPaths={loadedNestedMemoryPathsRef.current} getAppState={() => store.getState()} setConversationId={setConversationId} resultDedupState={resultDedupStateRef.current} isolationLatch={isolationLatchRef} />',
    '<UltraplanLaunchDialog sourcePromise={ultraplanLaunchPending.sourcePromise}',
    'if (ultraplanArg) setInputValue(ultraplanArg)',
    'const index = previous ? current.findIndex(item => item.uuid === previous) : -1',
    'promptIdentifier: opts?.promptIdentifier',
    'onStatusMessage: appendWhenIdle',
  ])
  assertSourceFragments('src/commands/ultraplan.tsx', [
    'void deleteRemoteAgentMetadata(taskId).catch(e => logForDebugging(`ultraplan meta delete failed: ${String(e)}`), )',
    'events_received: eventStats?.eventsReceived',
    'first_event_ms: eventStats?.firstEventAt !== undefined ? eventStats.firstEventAt - started : undefined',
    'last_event_age_ms: eventStats?.lastEventAt !== undefined ? failedAt - eventStats.lastEventAt : undefined',
    'registerCleanup(async () => { if (getAppState().ultraplanSessionUrl === url) { await archiveRemoteSession(session.id, 1500)',
  ])
  assertSourceFragments('src/utils/ultraplan/ccrSession.ts', [
    'eventsReceived: 0, firstEventAt: undefined, lastEventAt: undefined',
    'eventStats.eventsReceived += newEvents.length',
    'eventStats.firstEventAt ??= now',
    'eventStats.lastEventAt = now',
    'Lost connection to the remote session after repeated retries — the session may still be running',
  ])
})
