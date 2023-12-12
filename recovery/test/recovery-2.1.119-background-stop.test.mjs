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
  [
    'background registration and alias',
    'name:"background",aliases:["bg"],description:"Continue this session in the background and free the terminal",isEnabled:()=>!0',
    'a48ce9810770102efdee08b39673c114c75a529c73586ea567cd135cec2fe0a5',
  ],
  [
    'materialized transcript fork',
    'M=NN6(),D=await b3H([...M!==null?["--resume",M,"--fork-session"]:[]',
    'f16fd9434a4ac9867797756003d6bca80f4d404eed95d70e1912bc04880e7636',
  ],
  [
    'owned worktree dispatch metadata',
    'worktree:O?{path:Y.worktreePath,branch:Y.worktreeBranch,hookBased:Y.hookBased??!1,originCwd:Y.originalCwd}:void 0',
    '8e2e654ee60dda73cd8703e5b7f64e4712e7030581b6166de36b0f96c4206595',
  ],
  [
    'foreground worktree release',
    'if(Q("tengu_background",{via_flag:!1,via:K}),Y)O_$(null),Wi$()',
    '9ca41fdf315d5ec197213a685ffa6e110d7f667fc6e9026f187c282acea9a44c',
  ],
  [
    'title promise registered for shutdown',
    'if(K==="command")AK(()=>j)',
    '1c61e5c63e9644187f265797b36926291ba2597b47882b7516e1927e0430324a',
  ],
  [
    'title generation timeout',
    'N_5=3000',
    '4681e51ef4ad680ad210f2adafd828cb1ba52542a13142e0ec27214dbeb03682',
  ],
  [
    'persistence guard',
    'Cannot background \\u2014 session persistence is disabled, so the forked job would have nothing to resume.',
    'ca243073a32ce6b31c1804bc55053e78f172b5ade81c507fc430b8b4c6c8b2c9',
  ],
  [
    'no-turn guard',
    'Nothing to background yet \\u2014 send a message first.',
    '426b48465b1d5fd50c2a7ec34b848d2915d352f03c1774ccc598d3b9d58d6c1a',
  ],
  [
    'active-task confirmation',
    'Background anyway (tasks will be abandoned)',
    '04a158ebf0525e5ebc87e181f587084da6e4408c83419948fb4fe0859a3f2dcd',
  ],
  [
    'fork telemetry dimensions',
    'Q("tengu_background_fork",{confirmed:O.count>0,inflight_count:O.count,had_prompt:K.length>0,had_worktree:v.hadWorktree,worktree_handed_off:v.handedOff})',
    'f85528cdc1055f00fb7a25bd14b7ac926c3c691599d7d7387adef78080ffb000',
  ],
  [
    'graceful background hint',
    'suppressResumeHint:!0,finalMessage:uz8(v.short,v.handedOff?"(worktree handed off)":void 0)',
    'c06fbbeada3762e579dfe217995393ee5f20fb2173823d4b99e81557e1586643',
  ],
  [
    'already-backgrounded detach',
    'Q("tengu_background_already_bg",{}),H(),E0H(),null',
    'b8acea957de4534d085db66a03676c279f015739f62013984cea4200e95a6c1e',
  ],
  [
    'stop confirmation',
    'title:"Stop this background session?",subtitle:"Restart it from agents anytime."',
    '5c66a6a0111ca522817033381ed68a884632e9d8c3d1bf34da947e2c75d22ffb',
  ],
  [
    'stop dispatch source',
    'onConfirm:()=>void T3H("stop_command")',
    'b0d49d199fdbc7e04edb77986d622a62c123db1fbbadbda52664629fae8c9481',
  ],
  [
    'noninteractive stop',
    'async function C_5(){return await T3H("bridge"),{type:"skip"}}',
    'd8cdd09f7c27ef95d77ea8efe609ab926a53ce1593bba2dabd826b19b15ce531',
  ],
  [
    'background-only interactive stop registration',
    'name:"stop",description:"Stop this background session; transcript and worktree are kept",immediate:!0,isEnabled:S9,requires:{ink:!0}',
    '69706bc3b2475cc5ae98b7f768c61e5f473bafa05d44b0403412b79ea888cfc3',
  ],
  [
    'background-only noninteractive stop registration',
    'name:"stop",supportsNonInteractive:!0,description:"Stop this background session; transcript and worktree are kept",isEnabled:S9',
    'bc6939eb715c5afffbe7b6f5541373591c92493941e0bfc253c0445874fc35d6',
  ],
  [
    'Fleet feature registration gate',
    '...m54&&CZH()?[m54]:[],...p54&&CZH()?[p54]:[]',
    '92f9c24c474573507efb4e1fe2ebb43caa92339743b6c5c21e250f3abf9497d6',
  ],
  [
    'detach choice telemetry',
    'item_count:q.length,chose_exit:i==="exit",chose_detach:i==="detach"',
    '1812c53c2a87cdfaf7254879354d77b88f56c5aa3e229423ab6b9d401d9a530b',
  ],
  [
    'detach option',
    'label:"Detach (keep running)",value:"detach"',
    '9c77cfbb06b5f31f98214b286e2cd610ff137072c19bb0e4f3b6886fb094bb24',
  ],
  [
    'detach live-task hint',
    'still running. Run \\`claude agents\\` to see your background sessions.',
    '239c82a77c630ad12f374d7d7041b012b26f4e9da2ac526391702fa9c44ecdc0',
  ],
  [
    'background exit rows',
    'if(!GD(K)||K.type==="remote_agent")continue;if(!$&&K.type==="dream")continue;q.push({label:v65[K.type],detail:v7(K.description,VK4,!0)})',
    '2636cd5ba88d6583a04f56883894016648fbd0de908fadcc0ee59c04639fc8d9',
  ],
]

test('authenticates the exact 2.1.119 /background and /stop target cluster', () => {
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
  for (const [name, fragment, fragmentSha256] of TARGET_FRAGMENTS) {
    assert.equal(sha256(fragment), fragmentSha256, `${name}: fragment SHA-256`)
    assert.equal(occurrences(baseline, fragment), 0, `${name}: baseline count`)
    assert.equal(occurrences(target, fragment), 1, `${name}: target count`)
  }
})

test('binds target behavior to the recovered source implementation', () => {
  assertSourceFragments('src/commands/background/index.ts', [
    "name: 'background'",
    "aliases: ['bg']",
    "description: 'Continue this session in the background and free the terminal'",
    'isEnabled: () => true',
  ])
  assertSourceFragments('src/commands/background/background.tsx', [
    "logEvent('tengu_background_already_bg', {})",
    'isTranscriptPersistenceDisabled()',
    'Nothing to background yet — send a message first.',
    'getBackgroundTaskSummary(tasks)',
    'Background anyway (tasks will be abandoned)',
    "spawnBackgroundFork( seed, prompt, effort, 'command', messages, )",
    "logEvent('tengu_background_fork', {",
    'worktree_handed_off: result.handedOff',
    'suppressResumeHint: true',
    "result.handedOff ? '(worktree handed off)' : undefined",
  ])
  assertSourceFragments('src/cli/bg.ts', [
    'export function deriveBackgroundSeed(',
    'const resumable = getCurrentSessionFile()',
    "...(resumable ? ['--resume', resumable, '--fork-session'] : [])",
    'if (worktree) restoreWorktreeSession(null)',
    'AbortSignal.timeout(BACKGROUND_TITLE_TIMEOUT_MS)',
    "if (via === 'command') registerCleanup(() => titlePromise)",
    'handedOff: ownsWorktree',
    'hadWorktree: worktree !== null',
    'chalk.cyan(short)',
  ])
  assertSourceFragments('src/commands/stop/index.ts', [
    "const stop = { type: 'local-jsx', name: 'stop'",
    'immediate: true, isEnabled: isBgSession',
    "export const stopNonInteractive = { type: 'local', name: 'stop', supportsNonInteractive: true",
  ])
  assertSourceFragments('src/commands/stop/stop.tsx', [
    'Stop this background session?',
    'Restart it from agents anytime.',
    "stopBackgroundSession('stop_command')",
  ])
  assertSourceFragments('src/commands/stop/stop-noninteractive.ts', [
    "await stopBackgroundSession('bridge')",
    "return { type: 'skip' }",
  ])
  assertSourceFragments('src/commands/exit/exit.tsx', [
    "source: 'bridge' | 'exit_dialog' | 'stop_command'",
    "logEvent('tengu_bg_agent_action', {",
    "process.stdout.write(encodeDetach(getDetachMessage()))",
    'still running. Run \\`claude agents\\` to see your background sessions.',
  ])
  assertSourceFragments('src/components/BackgroundExitDialog.tsx', [
    "chose_detach: choice === 'detach'",
    "label: 'Detach (keep running)'",
  ])
  assertSourceFragments('src/tasks/pillLabel.ts', [
    'export function getBackgroundTaskExitItems(',
    "task.type === 'remote_agent'",
    "!includeDream && task.type === 'dream'",
    'detail: truncate(task.description, 50, true)',
  ])
  assertSourceFragments('src/screens/REPL.tsx', [
    'getBackgroundTaskExitItems(store.getState().tasks)',
    'onDetach={isBgSession() ? () => { cancel(); detachBackgroundSession(); } : undefined}',
  ])
  assertSourceFragments('src/commands.ts', [
    '...(isAgentsFleetEnabled() ? [background] : [])',
    '...(isAgentsFleetEnabled() ? [stop] : [])',
    'exitNonInteractive, stopNonInteractive,',
  ])
  assertSourceFragments('src/utils/sessionStorage.ts', [
    'export function getCurrentSessionFile(): string | null',
    'export function isTranscriptPersistenceDisabled(): boolean',
  ])
})
