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
const semanticSourceRoot =
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? path.join(repo, 'src')

function sourceFilename(sourcePath) {
  return path.join(semanticSourceRoot, sourcePath.replace(/^src\//, ''))
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function loadBundle(environmentName, expectedBytes, expectedSha256) {
  const filename = process.env[environmentName]
  assert.ok(filename, environmentName + ' must be set')
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, expectedBytes, environmentName + ': byte length')
  assert.equal(sha256(bytes), expectedSha256, environmentName + ': SHA-256')
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
  const contents = compact(fs.readFileSync(sourceFilename(sourcePath), 'utf8'))
  for (const fragment of fragments) {
    assert.equal(
      contents.includes(compact(fragment)),
      true,
      sourcePath + ': ' + fragment,
    )
  }
}

function readSource(sourcePath) {
  return fs.readFileSync(sourceFilename(sourcePath), 'utf8')
}

function sourceFiles(directory, prefix = '') {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...sourceFiles(filename, relative))
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(relative)
  }
  return files.sort()
}

function sourceSnapshot(directory) {
  const files = sourceFiles(directory).map(relative => {
    const value = fs.readFileSync(path.join(directory, relative))
    return { relative, value }
  })
  const serialized = JSON.stringify(
    files.map(({ relative, value }) => [
      relative,
      value.length,
      sha256(value),
    ]),
  )
  return {
    profile: {
      files: files.length,
      jsonBytes: Buffer.byteLength(serialized),
      sha256: sha256(serialized),
    },
    source: files.map(({ value }) => value.toString('utf8')).join('\n'),
  }
}

const FRAGMENTS = [
  ['daemon auth status', 'daemon-auth-status.json', 0, 1, '5adac9f8771926300ce638ff3c5f78235d94cc87110b68b5199dc8bf2315568c'],
  ['daemon auth cooldown', 'daemon-auth-cooldown', 0, 1, '8306ff81490bec6f23f0b33a3f003c1e716c34d1a46663f7531846bf3059c551'],
  ['daemon auth IPC result', 'auth_401_result', 0, 4, 'f195272875d478cb4c76074ffed1c668fc8cb3432c9f895c6feab364aadaf613'],
  ['scheduled SDK worker', 'scheduled worker started tasks=', 0, 1, 'd893821496ec9888d64c0f341f3f2a899eb877e8928eb745e5f68f7e01fcc505'],
  ['SDK setting source flag', '--setting-sources=', 0, 1, 'bc5ecb60ac916bdaaa303eecf3cbf60edf1611d7c33babbf19fb7d9a2c08f18e'],
  ['interval parser', 'use an interval (5m, 2h, 1d) or 5-field cron (*/5 * * * *)', 0, 1, '9aea42863348e6bd9e7fefa66036561cc55bc28fed446dbeb5e486dfc7ee06aa'],
  ['UDS timeout', 'Timed out sending to ', 0, 1, '83108a3c64b21006e995e689478d0b0d4a69b398315f625622aee9fd2a39e29b'],
  ['Fleet heartbeat', '.fleetview-heartbeat', 0, 1, '0eb42e19f26f06f67a9eb1a6859e66c74dbbd8bedf9bb1da94fe3a48604af599'],
  ['Fleet remote grouping', 'spawnOrigin', 0, 1, '84d6865c69a58b19c4535aa69543d47c52091d0340817585df4e90f2e78d4ae6'],
  ['Fleet left-arrow guard', 'background task(s) running', 0, 1, '5bc294118414cf16798a8ae3eb429e4080f60910a432e8f556791168b3c7ce6c'],
  ['job state name sync', 'jobStateNameSync', 0, 1, 'a51bdaebe9943c73da178490019428ad3af382b31e17afac3f58d1facd586d2f'],
  ['remote binary version', 'get_binary_version', 0, 3, '51e7302ee0df0abb38e8e34e585d843e4d57d1d560632cd26f7c09f2deee8f82'],
  ['connection timing', 'ms_in_connecting', 0, 1, 'edf5014ccf38c4f7cf4efdee5a6d44161ae17f2fbd20948e97de1a1ddd82ee64'],
  ['connection offline entries', 'offline_entries', 0, 1, 'b571f5bb2473818675cd8d806c1eed940c89f403d4fee0ec1dd94f3488de92d1'],
  ['task summary schema', 'subtype:"task_summary"', 0, 1, 'c32fcbf0a423c8f0a597329944031fd1718c1971e95baa9a6b7af7ea3d006a33'],
  ['bounded mirror retries', '3 attempts with short backoff; timeouts are not retried', 0, 1, '98a7a191174b78e31c7ddc1b71d526ec8bf8f4228326da9e172f22fcf9982a4d'],
  ['assistant voice scaffold', '# Claude \\u2014 voice and values', 0, 1, 'ea34ab8624ec1f866e8ad352a3c1082c4ee54ee5a77f1ccd03ab1a386f7df46c'],
  ['assistant catch-up state', 'catch-up-state.json', 0, 9, '12b7d96aaa1b6079281f7b4707dc175e30a370ec87b4ea15382b81d668d77ba5'],
  ['hub remove task confirmation', 'Remove task?', 0, 1, '0dd3a4d25df3293eeb6eb4340540dcb946b1901991f2fd476f504e75d6117b80'],
  ['hub scheduled remove result', "Removed scheduled task '", 0, 1, 'aa7120f6c548579b8ad600dcf58b490481142f5695178e846b3e5bac0de28db4'],
  ['hub remove server confirmation', 'Remove server?', 0, 1, 'c30f3be602d84651429b5c6a199af2d7f1d99bbf37d64c0f8c11a92401b27ea6'],
  ['hub remote remove result', 'Removed remote-control server for ', 0, 1, 'b75ede7f7fb7e7fb84b735244a514ed2a162b65f617a29afe0ee7f47787a991e'],
  ['hub remote auto name', 'Auto-generated from the directory name.', 0, 1, '4a693772f8678d142c56cc2bac29aabdab1848cd590ecd1b394489a511d7d957'],
  ['hub scheduled auto id', 'Auto-generated from prompt and directory.', 0, 1, 'bf4628674383711c28be9eacd6f61c3cd4319b57cd6f2ce528ef0b568c15a53e'],
  ['Fleet peer pin guard', "Can't pin a session that's running in another terminal", 0, 1, '3b11238ea0d9cf2422e77bb35d3cbb06d2eb08b3f614b7f58e0d5a710055e3b7'],
  ['Fleet empty intro', 'Agents here keep running even if you close this terminal', 0, 1, '69edffdaa45c59f99d7e073db517fc16c54f923df21c7a5e90673dc3d1ccc464'],
  ['Fleet empty example', 'Try: paste a link, or "review PR #123 for bugs"', 0, 1, '01665315c6a59fec5988d51b571f83b1551693cf3edffecfde4d5056f3a6303a'],
  ['Fleet repin focus', '[FV-poll] follow re-pin moved focus: was=', 0, 1, '64e7e0e10976a68b93538a99d8fa46ef707d96b4f209cc46f9c17ea7fe17bd58'],
  ['Fleet attach recap trigger', 'recap.trigger', 0, 1, 'b9bb856e400e8b10f0ef2014dfc55fd1d0753a5d72848cc4be5d7a1121a7b7de'],
  ['away-summary cache guard', '[awaySummary] skipped: cache stale', 1, 1, '4673858c9284ab2dd4d4286f7213e385c5b56abbe9d45f7c24e5d9ea2a3271c3'],
  ['away-summary tool denial', 'Away summary cannot use tools', 1, 1, 'c042d3297d201a2c0a6b268141f1ab8a70ae413519993ce9fd7b7f288662758b'],
  ['away-summary settings suffix', '(disable recaps in /config)', 1, 1, '68474b474661d8c69b36beb4f4456493df8f1a1dc5b362ad944ff4a181ffa2d3'],
  ['away-summary return telemetry', 'tengu_return_to_session', 1, 1, 'ea076c64c85610712717c2306c35f8f1e1a7196678645762b649263e639be4aa'],
  ['away-summary canonical prompt', 'The user stepped away and is coming back. Recap in under 40 words, 1-2 plain sentences, no markdown. Lead with the overall goal and current task, then the one next action. Skip root-cause narrative, fix internals, secondary to-dos, and em-dash tangents.', 1, 1, '88a7beafce38addd857334e2a0c65bb94c6ac5e12d44db62dd88dfa528fd0e0b'],
  ['brief turn enforcement', 'brief-mode-enforce', 1, 1, '940932f58c995df2438e965f58b8326700aaa0de401c65e8046e1739cc30d9d7'],
  ['brief enforcement sentinel', 'In brief mode you must call SendUserMessage to communicate with the user', 1, 1, '05778b5ce285652b36e5235dc1513a2a64270c7baae0b79d3cc5aaff0d9fd51d'],
  ['stop-hook SDK notification', 'Stop hook error occurred', 2, 2, 'f72554133495560cabb45fd2724c9a9534242b9661b184ed1d353a9f503e5563'],
  ['SDK loop notification schema', 'Loop-side text notification. Mirrors the interactive REPL notification queue (key/priority/timeout). JSX notifications are not emitted on this channel.', 1, 1, 'd4eadcceb5798c2c2494a590e9b84667a5d6d80b36b6caa5fa837d4c117f0c03'],
]

const DAEMON_EVENT_COUNTS = [
  ['tengu_bg_adopt', 0, 2, 1, 2],
  ['tengu_bg_agent_action', 0, 9, 8, 9],
  ['tengu_bg_agent_dispatch', 0, 2, 1, 2],
  ['tengu_bg_agent_terminal', 0, 2, 1, 2],
  ['tengu_bg_attach', 0, 4, 1, 2],
  ['tengu_bg_attach_legacy_autorespawn', 0, 2, 1, 2],
  ['tengu_bg_classify', 0, 2, 1, 2],
  ['tengu_bg_daemon_install', 0, 2, 1, 2],
  ['tengu_bg_daemon_zombie_restart', 0, 2, 1, 2],
  ['tengu_bg_dispatch', 0, 4, 1, 2],
  ['tengu_bg_dispatch_fallback', 0, 2, 1, 2],
  ['tengu_bg_orphan_reap', 0, 2, 1, 2],
  ['tengu_bg_proto_mismatch', 0, 2, 1, 2],
  ['tengu_bg_pty_unavailable', 0, 2, 1, 2],
  ['tengu_bg_respawn_exhausted', 0, 2, 1, 2],
  ['tengu_bg_respawn_stale', 0, 2, 1, 2],
  ['tengu_bg_roster_parse_failed', 0, 3, 2, 3],
  ['tengu_bg_skew_nudge', 0, 3, 2, 3],
  ['tengu_bg_worker_exit', 0, 2, 1, 2],
  ['tengu_bg_worker_spawn', 0, 2, 1, 2],
  ['tengu_daemon_config_reload', 0, 2, 1, 2],
  ['tengu_daemon_control', 0, 3, 2, 3],
  ['tengu_daemon_idle_exit', 0, 2, 1, 2],
  ['tengu_daemon_install', 0, 2, 1, 2],
  ['tengu_daemon_self_restart_on_upgrade', 0, 2, 1, 2],
  ['tengu_daemon_start', 0, 2, 1, 2],
  ['tengu_daemon_worker_crash', 0, 2, 1, 2],
  ['tengu_daemon_worker_permanent_exit', 0, 2, 1, 2],
]

const SOURCE_PHASES = [
  {
    id: 'historical-target119',
    profile: {
      files: 2023,
      jsonBytes: 217234,
      sha256: 'fe0e513f8584f809b612e8f0e11f3c2bbcf45a5b70b0143c13769637d7b9307a',
    },
    sourceCallColumn: 3,
    sourceOnlyDaemonEvents: 0,
  },
  {
    id: 'recovered-target119-package',
    profile: {
      files: 2024,
      jsonBytes: 217359,
      sha256: 'b0c92062b28f681fe84320874e61bf3479f6d8537fb8bff460c53b9199f0fde6',
    },
    sourceCallColumn: 4,
    sourceOnlyDaemonEvents: 1,
  },
]

const DAEMON_EVENT_SOURCE_PATHS = [
  ['tengu_bg_adopt', ['src/daemon/supervisor.ts']],
  [
    'tengu_bg_agent_action',
    [
      'src/cli/handlers/templateJobs.ts',
      'src/cli/bg.ts',
      'src/commands/exit/exit.tsx',
      'src/components/FleetView.tsx',
    ],
  ],
  ['tengu_bg_agent_dispatch', ['src/jobs/classifier.ts']],
  ['tengu_bg_agent_terminal', ['src/jobs/classifier.ts']],
  ['tengu_bg_attach', ['src/daemon/supervisor.ts']],
  ['tengu_bg_attach_legacy_autorespawn', ['src/daemon/supervisor.ts']],
  ['tengu_bg_classify', ['src/jobs/classifier.ts']],
  ['tengu_bg_daemon_install', ['src/daemon/client.ts']],
  ['tengu_bg_daemon_zombie_restart', ['src/daemon/client.ts']],
  ['tengu_bg_dispatch', ['src/cli/bg.ts']],
  ['tengu_bg_dispatch_fallback', ['src/cli/bg.ts']],
  ['tengu_bg_orphan_reap', ['src/daemon/supervisor.ts']],
  ['tengu_bg_proto_mismatch', ['src/daemon/supervisor.ts']],
  ['tengu_bg_pty_unavailable', ['src/daemon/ptyHost.ts']],
  ['tengu_bg_respawn_exhausted', ['src/daemon/supervisor.ts']],
  ['tengu_bg_respawn_stale', ['src/daemon/supervisor.ts']],
  ['tengu_bg_roster_parse_failed', ['src/daemon/supervisor.ts']],
  ['tengu_bg_skew_nudge', ['src/daemon/client.ts']],
  ['tengu_bg_worker_exit', ['src/daemon/supervisor.ts']],
  ['tengu_bg_worker_spawn', ['src/daemon/supervisor.ts']],
  ['tengu_daemon_config_reload', ['src/daemon/main.ts']],
  ['tengu_daemon_control', ['src/daemon/main.ts']],
  ['tengu_daemon_idle_exit', ['src/daemon/main.ts']],
  ['tengu_daemon_install', ['src/daemon/main.ts']],
  ['tengu_daemon_self_restart_on_upgrade', ['src/daemon/main.ts']],
  ['tengu_daemon_start', ['src/daemon/main.ts']],
  ['tengu_daemon_worker_crash', ['src/daemon/main.ts']],
  ['tengu_daemon_worker_permanent_exit', ['src/daemon/main.ts']],
]

const DAEMON_SEMANTIC_EVIDENCE = [
  [
    'AUD-006-fleet-routine-cache-inert',
    [
      [
        '$34=new Map',
        0,
        1,
        '2f4bcee6ed3cbed3813a748def0ec1d30d72fd6dfd7f83991d0124e15160bbb2',
      ],
      [
        'function Iz5(){gY8.clear(),PE6.clear(),WE6.clear(),$34.clear()}',
        0,
        1,
        '23eeb1eff45e6b0cd1a8b3efeebb9191ed204ef200dce24d85342418711a833d',
      ],
      [
        'AH=B.get(NH)??B.get(Z)??dY4',
        0,
        1,
        '6dbca0a924f7be678ff08a9122c43b4fd06d72569b0854b0d9f55954c051d018',
      ],
    ],
    [
      [
        'src/components/FleetView.tsx',
        'const routines = useMemo<FleetRoutine[]>(() => [], [])',
        1,
        'eb8036ad6582e8cccfdd86d9976eb3aa2552bfc961bff33841e627d45bd4c31a',
      ],
    ],
    [
      [
        '$34.set(',
        0,
        '964985d9fb836029ed47b326518a6716b8f1d5b52f6b87d3a27c23be1dfae844',
      ],
    ],
  ],
  [
    'AUD-007-daemon-status-hint-gate',
    [
      [
        'function qqH(){return!1}',
        0,
        1,
        '843fc7ce45afd4c76f6087e9d835f2a327610deedca6e5deb8bf3ba3bcb08aea',
      ],
      [
        'function AM$(H){return qqH()?',
        0,
        1,
        '7e389375a5c08f7a9768d15d62658d3b80fc2e6f94fb2c850ebab0361e94a804',
      ],
      [
        'AM$("status")',
        0,
        3,
        '1752e1be75e652ae5e9246bb388aa7d42831bd9e853532f6138e864422a78078',
      ],
    ],
    [
      [
        'src/utils/agentsFleet.ts',
        'export function isDaemonCliEnabled(): boolean {\n  return false\n}',
        1,
        '3ef3130a607322802378d2262d7f73e1bac474f21e39e25cd3fda71bdb85abc3',
      ],
      [
        'src/cli/bg.ts',
        "function daemonHint(command: 'status'): string {",
        1,
        'bb549245a665578e77fe9fcd87ab94ab3afc1727ffb4dcc7a5922d295fc55aa4',
      ],
      [
        'src/cli/bg.ts',
        "daemonHint('status')",
        3,
        'a6c55ed0d13d0ce9e42248ae0e5f3ff2505e2ce06de550b00bc61ec16b76c950',
      ],
    ],
    [],
  ],
  [
    'AUD-008-supervisor-idle-respawn-race',
    [
      [
        'if(this.upgrading||!this.pty||this.record.pid===0)return{respawned:!1,reason:"in-progress"}',
        0,
        2,
        'd23bc85a561bb4984102b9a003e6905928fef0a3b24ac34c87cd7a125bc92f50',
      ],
    ],
    [
      [
        'src/daemon/supervisor.ts',
        'if (this.upgrading || !this.pty || !this.record.pid) {',
        2,
        '914cef4efc54fef9a9d12b8993a0f1ba864fb956dfbb884827c104540571181e',
      ],
    ],
    [],
  ],
  [
    'AUD-009-dispatch-watcher-readiness-errors',
    [
      [
        '[bg-dispatch] rejected ',
        0,
        1,
        '4ed92df3ed1a2f04f162efb86e70735861ba1e9f9a8976607ae29d545ed9dbba',
      ],
      [
        '[bg-dispatch] watcher error: ',
        0,
        1,
        'b0d383d47154f528829570d203418efbf64e5ca63bf23cf4a1f2565494b309c4',
      ],
      [
        '[bg-dispatch] watcher ready wait: ',
        0,
        1,
        '2f2a99940c94a108585d0cb8cfdb3179ca445b18f9ff792018ef56d21a651c05',
      ],
      [
        '[bg-dispatch] cold-start drain: ',
        0,
        1,
        '973e31b83e69b05f2de4c48d7a5875c5da825a99ca93d96926ee764063bb80de',
      ],
      [
        'chokidar ready',
        0,
        1,
        'ac634c5ebf7255f0c76eb8a13a0cc43275acc80292557f87cc4182fe798c670c',
      ],
    ],
    [
      [
        'src/daemon/supervisor.ts',
        '[bg-dispatch] rejected ',
        1,
        '4ed92df3ed1a2f04f162efb86e70735861ba1e9f9a8976607ae29d545ed9dbba',
      ],
      [
        'src/daemon/supervisor.ts',
        '[bg-dispatch] watcher error: ',
        1,
        'b0d383d47154f528829570d203418efbf64e5ca63bf23cf4a1f2565494b309c4',
      ],
      [
        'src/daemon/supervisor.ts',
        '[bg-dispatch] watcher ready wait: ',
        1,
        '2f2a99940c94a108585d0cb8cfdb3179ca445b18f9ff792018ef56d21a651c05',
      ],
      [
        'src/daemon/supervisor.ts',
        '[bg-dispatch] cold-start drain: ',
        1,
        '973e31b83e69b05f2de4c48d7a5875c5da825a99ca93d96926ee764063bb80de',
      ],
      [
        'src/daemon/supervisor.ts',
        'chokidar ready',
        1,
        'ac634c5ebf7255f0c76eb8a13a0cc43275acc80292557f87cc4182fe798c670c',
      ],
    ],
    [],
  ],
  [
    'AUD-011-fleet-remount-terminal-providers',
    [
      [
        'R$.createElement(zY5,null,R$.createElement(ww',
        0,
        1,
        '3d7b1cbf9c6aa2eaae5308524e5b00184103dd63a41aaf50e0c397d8e93f84e4',
      ],
      [
        'R$.createElement(Lj,null,R$.createElement(O34',
        0,
        1,
        '08896031559427b8497c3a8fc5887594c0b55b09c9d901630ffb4b979825f9dd',
      ],
    ],
    [
      [
        'src/components/FleetView.tsx',
        '<AppStateProvider',
        1,
        '436b1f71b35bf401b4bf3a186c3d38246bff84ee047922c1fca7a049a088808e',
      ],
      [
        'src/components/FleetView.tsx',
        '<ThemeProvider>',
        1,
        '6408576d50f984dcce88d59bc550cd88ebb98d4019888c82a261f03c53fa252d',
      ],
      [
        'src/components/FleetView.tsx',
        '<FleetView',
        1,
        'fb50f3f35b2ad747b5a5e044e7b757dedc70c5ef1aa31fff5c4a5f0dc1407fa2',
      ],
      [
        'src/components/FleetView.tsx',
        '<AlternateScreen',
        1,
        '9709848bbd91e5052f9398b5bc6da63a686434b7dd86129fbb521fe740892e28',
      ],
    ],
    [],
  ],
  [
    'AUD-012-daemon-startup-ordering',
    [
      [
        'P.ready.then(()=>_Y4',
        0,
        1,
        'fc58083da9a16d7beaa882940d2189c78e937af8c53163baad3b8cb8b7adcca4',
      ],
      [
        'await P.ready;let m=0;for(let i of Object.keys(Hc))',
        0,
        1,
        'e33ec7b763a666dd07815008a5328209aa3affa3b2aded7c77edc4f225e1b46d',
      ],
      [
        'k.manager=i,I()',
        0,
        1,
        '1f5e249af6a6e606e41f6b56c74ae580600d90712aa325e455ffc1b8dd2f518c',
      ],
    ],
    [
      [
        'src/daemon/main.ts',
        'const supervisorStart = auth.ready',
        1,
        'f7acfb9cef65c93cfba5b2fdb2f44c4125827dcde2301707fe0d290e10792572',
      ],
      [
        'src/daemon/main.ts',
        'let lastGoodConfig = await loadWorkerConfigDetails(options.jsonPath)',
        1,
        'ebcc6bcce734c325ac316776cee6956a62bc21b49d9c62fa14aa7b1ae7a9c1a7',
      ],
      [
        'src/daemon/main.ts',
        'await auth.ready',
        1,
        '773bc2c12c471d8cb1e68fc9f73a9347a14fd1566ff286b896ba4dde28d206ab',
      ],
      [
        'src/daemon/main.ts',
        'supervisor = manager\n      updateKeepAlive()',
        1,
        '5f01ead4da93e304af2cf63062457ce892b9d2e33279342c22c570cf92b64337',
      ],
    ],
    [],
  ],
  [
    'DFQ-013-performance-markers',
    [
      ['[PERF:bg-attach-start]', 0, 1, '023a420b05f82537853b3573419b3ff19cdf95283de6b07fa61e4711734ac5c0'],
      ['[PERF:bg-attach-end]', 0, 1, '525fcad16f351a3cefb6daf5b1d77b86d0ca5b9020a0f259df538c8bb7b3df7c'],
      ['[PERF:bg-dispatch-start]', 0, 1, '8bd9ea11264fb197ecaad6a9df31809134b5888ec98fec4239041b2de7159c46'],
      ['[PERF:bg-dispatch-end]', 0, 1, 'b764606ca6eeb9495732a2383970092a0d8bcd4f2f8f47320ec790fdbec7a54d'],
      ['[PERF:bg-claim-start]', 0, 1, '7a4329e423e3319f445fd7ab78d4a2f9782a5de47f8bf95f145dd73a4744394d'],
      ['[PERF:bg-claim-end]', 0, 1, '074665cdbb1813b774b2c0f151291c8e7a8cc1d32a4a6bef4b8987e8651c676c'],
      ['[PERF:bg-remount-start]', 0, 1, 'da2ef5460af7f0b4c2486219856ac7d9cdbf0c0808b6cc0a1ca285c6f592bae4'],
      ['[PERF:bg-remount-end]', 0, 1, '700a8b2d47ccc5c637e001f0c8a29395257560125704071f1eb581a22dd529a2'],
      ['[PERF:bg-spare-start]', 0, 1, '2530e5b4f9f5b23f8e8945f1f0481a0dc7f21df7d6c426ce449ab8a24223708f'],
      ['[PERF:bg-spare-spawned]', 0, 1, '67c91c2c50b6df354ce7181d5494bea87dcd155f0d9a7b1006f5c57359323465'],
    ],
    [
      ['src/cli/bg.ts', '[PERF:bg-attach-start]', 1, '023a420b05f82537853b3573419b3ff19cdf95283de6b07fa61e4711734ac5c0'],
      ['src/cli/bg.ts', '[PERF:bg-attach-end]', 1, '525fcad16f351a3cefb6daf5b1d77b86d0ca5b9020a0f259df538c8bb7b3df7c'],
      ['src/cli/handlers/templateJobs.ts', '[PERF:bg-dispatch-start]', 1, '8bd9ea11264fb197ecaad6a9df31809134b5888ec98fec4239041b2de7159c46'],
      ['src/cli/handlers/templateJobs.ts', '[PERF:bg-dispatch-end]', 1, 'b764606ca6eeb9495732a2383970092a0d8bcd4f2f8f47320ec790fdbec7a54d'],
      ['src/cli/handlers/templateJobs.ts', '[PERF:bg-claim-start]', 1, '7a4329e423e3319f445fd7ab78d4a2f9782a5de47f8bf95f145dd73a4744394d'],
      ['src/cli/handlers/templateJobs.ts', '[PERF:bg-claim-end]', 1, '074665cdbb1813b774b2c0f151291c8e7a8cc1d32a4a6bef4b8987e8651c676c'],
      ['src/components/FleetView.tsx', '[PERF:bg-remount-start]', 2, 'da2ef5460af7f0b4c2486219856ac7d9cdbf0c0808b6cc0a1ca285c6f592bae4'],
      ['src/components/FleetView.tsx', '[PERF:bg-remount-end]', 1, '700a8b2d47ccc5c637e001f0c8a29395257560125704071f1eb581a22dd529a2'],
      ['src/cli/handlers/templateJobs.ts', '[PERF:bg-spare-start]', 1, '2530e5b4f9f5b23f8e8945f1f0481a0dc7f21df7d6c426ce449ab8a24223708f'],
      ['src/cli/handlers/templateJobs.ts', '[PERF:bg-spare-spawned]', 1, '67c91c2c50b6df354ce7181d5494bea87dcd155f0d9a7b1006f5c57359323465'],
    ],
    [],
  ],
]

test('2.1.119 daemon, Fleet, query, and assistant fragments are authenticated', () => {
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
  for (const [name, fragment, baselineCount, targetCount, fragmentSha256] of FRAGMENTS) {
    assert.equal(sha256(fragment), fragmentSha256, name + ': fragment SHA-256')
    assert.equal(occurrences(baseline, fragment), baselineCount, name + ': baseline count')
    assert.equal(occurrences(target, fragment), targetCount, name + ': target count')
  }
})

test('daemon and background telemetry call sites match authenticated target counts', () => {
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
  const snapshot = sourceSnapshot(semanticSourceRoot)
  const sourcePhase = SOURCE_PHASES.find(
    candidate =>
      JSON.stringify(candidate.profile) === JSON.stringify(snapshot.profile),
  )
  assert.ok(
    sourcePhase,
    `unrecognized Target119 source phase: ${JSON.stringify(snapshot.profile)}`,
  )
  for (const row of DAEMON_EVENT_COUNTS) {
    const [event, baselineCount, targetCount] = row
    const sourceCalls = row[sourcePhase.sourceCallColumn]
    assert.equal(occurrences(baseline, event), baselineCount, event + ': baseline')
    assert.equal(occurrences(target, event), targetCount, event + ': target')
    assert.equal(
      occurrences(snapshot.source, `'${event}'`) +
        occurrences(snapshot.source, `"${event}"`),
      sourceCalls,
      event + ': recovered runtime calls',
    )
  }
  assert.equal(occurrences(target, 'tengu_daemon_auto_uninstall'), 1)
  assert.equal(occurrences(target, 'tengu_daemon_lease'), 1)
  assert.equal(
    occurrences(snapshot.source, "'tengu_daemon_auto_uninstall'"),
    sourcePhase.sourceOnlyDaemonEvents,
  )
  assert.equal(
    occurrences(snapshot.source, "'tengu_daemon_lease'"),
    sourcePhase.sourceOnlyDaemonEvents,
  )
})

test('daemon telemetry events bind to their exact recovered source paths', () => {
  const sourcePaths = new Map(DAEMON_EVENT_SOURCE_PATHS)
  assert.equal(sourcePaths.size, DAEMON_EVENT_COUNTS.length)
  for (const [event, , , expectedSourceCalls] of DAEMON_EVENT_COUNTS) {
    const paths = sourcePaths.get(event)
    assert.ok(paths, event + ': source paths')
    const source = paths.map(sourcePath => readSource(sourcePath)).join('\n')
    assert.equal(
      occurrences(source, `'${event}'`) + occurrences(source, `"${event}"`),
      expectedSourceCalls,
      event + ': path-scoped recovered runtime calls',
    )
  }
})

test('sparse daemon audit obligations bind exact target and source evidence', () => {
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
  for (const [id, targetEvidence, sourceEvidence, targetAbsences] of
    DAEMON_SEMANTIC_EVIDENCE) {
    for (const [fragment, baselineCount, targetCount, fragmentSha256] of
      targetEvidence) {
      assert.equal(sha256(fragment), fragmentSha256, id + ': ' + fragment)
      assert.equal(occurrences(baseline, fragment), baselineCount, id + ': baseline')
      assert.equal(occurrences(target, fragment), targetCount, id + ': target')
    }
    for (const [sourcePath, fragment, count, fragmentSha256] of sourceEvidence) {
      assert.equal(sha256(fragment), fragmentSha256, id + ': ' + fragment)
      assert.equal(
        occurrences(readSource(sourcePath), fragment),
        count,
        id + ': ' + sourcePath + ': ' + fragment,
      )
    }
    for (const [fragment, count, fragmentSha256] of targetAbsences) {
      assert.equal(sha256(fragment), fragmentSha256, id + ': ' + fragment)
      assert.equal(occurrences(target, fragment), count, id + ': target absence')
    }
    if (id === 'AUD-012-daemon-startup-ordering') {
      const source = readSource('src/daemon/main.ts')
      const supervisorStart = source.indexOf('const supervisorStart = auth.ready')
      const configLoad = source.indexOf(
        'let lastGoodConfig = await loadWorkerConfigDetails(options.jsonPath)',
      )
      const authReady = source.indexOf('await auth.ready', configLoad)
      assert.ok(
        supervisorStart !== -1 &&
          configLoad !== -1 &&
          authReady !== -1 &&
          supervisorStart < configLoad &&
          configLoad < authReady,
        id + ': supervisor starts before config load and workers await auth',
      )
    }
  }
})

test('recovers daemon auth, worker runtime, scheduling, UDS, and hub mutation', () => {
  assertSourceFragments('src/daemon/auth.ts', [
    'const TOKEN_VALIDITY_WINDOW_MS = 5 * 60_000',
    'const REFRESH_AHEAD_MS = 4 * 60_000',
    'const REAUTH_COOLDOWN_MS = 5 * 60_000',
    'const KEYCHAIN_RECHECK_MS = 30_000',
    "join(configDir, 'daemon-auth-status.json')",
    "type: 'auth_401_result'",
    'handleOAuth401Error(failedToken)',
  ])
  assertSourceFragments('src/daemon/workerRegistry.ts', [
    'scheduled worker started tasks=',
    "await import('../entrypoints/agentSdk.js')",
    'allowDangerouslySkipPermissions: true',
    'workload: WORKLOAD_CRON',
  ])
  assertSourceFragments('src/entrypoints/agentSdk.ts', [
    "'--input-format'",
    "args.push('--allow-dangerously-skip-permissions')",
    "args.push(`--setting-sources=${options.settingSources.join(',')}`)",
    "env.CLAUDE_CODE_ENTRYPOINT = 'sdk-ts'",
    'delete env.NODE_OPTIONS',
    "type: 'user'",
    'parent_tool_use_id: null',
  ])
  assertSourceFragments('src/daemon/config.ts', [
    'export function parseSchedule',
    'minimum interval is 1 minute',
    'use an interval (5m, 2h, 1d) or 5-field cron (*/5 * * * *)',
    'export async function upsertAssistant',
  ])
  assertSourceFragments('src/utils/udsClient.ts', [
    'sendToUdsSocket',
    'sendControlToUdsSocket',
    'Timed out sending to ${socketPath}',
    '<cross-session-message>\\n${message}\\n</cross-session-message>',
  ])
  assertSourceFragments('src/daemon/hub.tsx', [
    'renderDaemonHubStandalone',
    'saveScheduledTask',
    'upsertRemoteControl',
    'installAssistant',
    'setPathTrusted',
    "options: ['dontAsk', 'auto', 'default', 'acceptEdits', 'plan', 'bypassPermissions']",
    "logEvent('tengu_assistant_install'",
    'Promise.resolve([] as AssistantConfig[])',
    'getModelOptions(false)',
    'idDirty',
    'nameDirty',
    'Remove task?',
    "Removed scheduled task '${task.id}'.",
    'Remove server?',
    'Removed remote-control server for ${server.dir}.',
    "data.status?.workers['scheduled:0']?.pid",
    'data.status?.workers[`remoteControl:${index}`]?.pid',
    'formatRelativeTime(new Date(status.lastFiredAt), { now })',
    'isRunning={Boolean(data.lock)}',
    'remote-control add failed:',
  ])
  assertSourceFragments('src/daemon/main.ts', [
    'execPath gone (version GC?) — re-resolved to',
    'stdin write error:',
    'writeDaemonStatus',
    'removeDaemonStatus',
    'worker.status',
    'processLooksLikeDaemon(contender.pid)',
    'auth.ready .then(() => runBackgroundSupervisor',
    "supervisor?.killAll('SIGTERM')",
  ])
  assertSourceFragments('src/daemon/status.ts', [
    'export async function getBgDaemonStatus',
    'export function formatBgDaemonStatus',
    'bg daemon:',
    'control.sock:',
    'on different binary',
  ])
})

test('recovers Fleet activation, persistence guards, name sync, and remote version', () => {
  assertSourceFragments('src/components/FleetView.tsx', [
    'prewarmTemplateJob',
    'claimPrewarmedJob',
    'respawnTemplateJob',
    'replyDrafts',
    'fleetSuggestions',
    'findRepoRemoteSlug',
    'spawnOrigin',
    'attachJob',
    'stopFleetJob',
    'killJob(short, knownState)',
    'optimisticReplyState',
    'Press Ctrl-C again to exit',
    'ctrl+r rename',
    'delete all',
    'sendControlToUdsSocket',
    'AppStateProvider',
    'ThemeProvider',
    'AlternateScreen',
    '[PERF:bg-remount-start]',
    '[PERF:bg-remount-end]',
    "Can't pin a session that's running in another terminal",
    'Agents here keep running even if you close this terminal',
    'Try: paste a link, or "review PR #123 for bugs"',
    '[FV-poll] follow re-pin moved focus: was=',
    'followedJobId',
    'followedHeaderGroup',
  ])
  assertSourceFragments('src/cli/bg.ts', [
    '/ERESPAWNING|ESTARTING/.test(outcome.msg)',
    'Session ${short} is respawning — reconnecting…',
    'ENTER_ALT_SCREEN',
    'ENABLE_MODIFY_OTHER_KEYS',
    'EXIT_ALT_SCREEN',
    'nextCols < currentCols || nextRows < currentRows',
    "writeFile(join(getJobDir(short), 'recap.trigger'), '')",
    'drainStdin()',
    "response.code === 'ESTARTING'",
  ])
  assertSourceFragments('src/hooks/useAwaySummary.ts', [
    'const DEFAULT_DELAY_MS = 180_000',
    'const MIN_TOTAL_USER_TURNS = 3',
    'const MIN_USER_TURNS_SINCE_RECAP = 2',
    'const RECAP_TRIGGER_POLL_MS = 500',
    'if (!recapEnabled || !isBgSession()) return',
    "should1hCacheTTL('repl_main_thread')",
    'cacheTtl * 0.9',
    'draftInputRef?.current',
    'isEligibleForAutomaticRecap',
    '(disable recaps in /config)',
    "logEvent('tengu_return_to_session'",
    "last?.type === 'system' && last.subtype === 'api_metrics'",
    'const trigger = join(jobDir, RECAP_TRIGGER_FILENAME)',
    'if (isLoadingRef.current) return',
    'await unlink(trigger)',
    'generateRef.current?.({ force: true })',
  ])
  assertSourceFragments('src/services/awaySummary.ts', [
    'getLastCacheSafeParams()',
    'runForkedAgent({',
    "querySource: 'away_summary'",
    "forkLabel: 'away_summary'",
    'maxTurns: 1',
    'skipCacheWrite: true',
    'skipTranscript: true',
    'Away summary cannot use tools',
    'Recap in under 40 words, 1-2 plain sentences, no markdown.',
  ])
  assertSourceFragments('src/daemon/client.ts', [
    'getRelaunchLauncher()',
    'delete env.CLAUDE_CODE_OAUTH_TOKEN',
    "response.code === 'ESTARTING'",
    "session.kind !== 'bg'",
  ])
  assertSourceFragments('src/daemon/supervisor.ts', [
    'currentTranscriptValid',
    'source session ${sourceSessionId} not found',
    'CLAUDE_CODE_RESUME_INTERRUPTED_TURN',
    'startPidPoll()',
    'resizeForRepaint',
    "withTail.includes('\\x1B[2J')",
    "new Promise<void>((resolve) => watcher.once('ready', resolve))",
    '5_000,',
    'getDaemonRuntimeDir()',
  ])
  assertSourceFragments('src/utils/concurrentSessions.ts', [
    "const FLEETVIEW_HEARTBEAT = '.fleetview-heartbeat'",
    'export async function clearFleetViewHeartbeat',
  ])
  assertSourceFragments('src/screens/REPL.tsx', [
    'Cannot open agents — ${summary.count} background task(s) running.',
    'applyHintClears:',
    'resultDedupState:',
    'new ConnectionLifecycleTracker()',
  ])
  assertSourceFragments('src/hooks/useJobStateNameSync.ts', [
    '[jobStateNameSync] watch skipped:',
    "filename.toString() !== 'state.json'",
    'setJobStateNameHandler',
  ])
  assertSourceFragments('src/entrypoints/sdk/controlSchemas.ts', [
    "subtype: z.literal('get_binary_version')",
    'buildTime: z.string().optional()',
  ])
  assertSourceFragments('src/cli/print.ts', [
    "message.request.subtype === 'get_binary_version'",
    'buildTime: MACRO.BUILD_TIME',
  ])
})

test('recovers classifier summaries, context clears, result dedup, and connection lifecycle', () => {
  assertSourceFragments('src/query.ts', [
    'onHintCleared:',
    'toolUseContext.applyHintClears?.(',
    'getReadPathsForClearedToolResults',
    'resetResultDedupState(toolUseContext.resultDedupState)',
    'jobClassifier.markTurnActive',
    "getCommandsByMaxPriority('next')",
  ])
  assertSourceFragments('src/query/stopHooks.ts', [
    'classifiedToPostTurnSummary',
    'taskSummaryModule!.engineFor',
    'classifierState.onClassified',
    'briefToolModule?.isBriefEnabled()',
    'brief-mode-enforce',
    'BRIEF_ENFORCE_SENTINEL',
    "subtype: 'notification'",
    "text: 'Stop hook error occurred'",
    'executeTeammateIdleHooks(',
    'undefined, toolUseContext',
  ])
  const stopHooksSource = fs.readFileSync(
    sourceFilename('src/query/stopHooks.ts'),
    'utf8',
  )
  assert.equal(stopHooksSource.includes('notifySessionMetadataChanged'), false)
  assert.equal(stopHooksSource.includes("sleepRan ? 'later' : 'next'"), false)
  assertSourceFragments('src/utils/hooks.ts', [
    'export async function* executeTeammateIdleHooks',
    'toolUseContext?: ToolUseContext',
    'toolUseContext,',
  ])
  assertSourceFragments('src/utils/sdkEventQueue.ts', [
    "subtype: 'notification'",
    "priority: 'immediate'",
  ])
  assertSourceFragments('src/entrypoints/sdk/coreSchemas.ts', [
    'SDKNotificationMessageSchema',
    "subtype: z.literal('notification')",
    "priority: z.enum(['low', 'medium', 'high', 'immediate'])",
  ])
  assertSourceFragments('src/services/tools/resultDedup.ts', [
    'export function resetResultDedupState',
    'export function reconstructResultDedupState',
  ])
  assertSourceFragments('src/services/api/connectionState.ts', [
    'export class ConnectionLifecycleTracker',
    'OFFLINE_FAILURE_WINDOW_MS = 60_000',
    'OFFLINE_FAILURE_THRESHOLD = 2',
    'ms_in_connecting:',
    'offline_entries:',
  ])
  assertSourceFragments('src/services/api/claude.ts', [
    "options.connection?.push({ type: 'sending' })",
    "options.connection.push({ type: 'receiving', bytes })",
    'connectionSummary: options.connection?.summary()',
  ])
  assertSourceFragments('src/entrypoints/sdk/coreSchemas.ts', [
    "subtype: z.literal('task_summary')",
    'detail: z.string().nullable()',
    '3 attempts with short backoff; timeouts are not retried',
  ])
  assertSourceFragments('src/utils/sessionState.ts', [
    'let hasTaskSummary = false',
    "if (state === 'running') metadataListener?.({ post_turn_summary: null })",
    "subtype: 'task_summary'",
    'notifySessionMetadataChanged({ task_summary: null })',
  ])
  assertSourceFragments('src/cli/print.ts', [
    'runClassifierSummaryForBlocked(details',
    "message.subtype === 'task_summary'",
  ])
  assertSourceFragments('src/cli/transports/ccrClient.ts', [
    'raw_command: details.raw_command',
    'tool_use_id: details.tool_use_id',
  ])
  assertSourceFragments('src/jobs/classifier.ts', [
    "before?.tempo === 'blocked'",
    "should1hCacheTTL('agent_classifier')",
    '[classifier] no text block in response, types=',
    'const latest = (await readJobState(jobDir)) ?? current',
    'sleep(60_000, undefined, { unref: true })',
  ])
  assertSourceFragments('src/utils/taskSummary.ts', [
    "getRuntimeCapabilities().workspace === 'remote'",
    'isReplBridgeActive()',
  ])
})

test('assistant scaffold template bytes match the authenticated bundle exactly', () => {
  const target = loadBundle(
    'CLAUDE_CODE_2_1_119_BUNDLE',
    TARGET_BYTES,
    TARGET_SHA256,
  )
  const source = fs.readFileSync(sourceFilename('src/assistant/install.ts'), 'utf8')
  const assets = [
    ['S94', 'I94'],
    ['C94', 'R94'],
    ['x94', 'b94'],
    ['m94', 'u94'],
    ['B94', 'p94'],
    ['U94', 'F94'],
  ]
  for (const [name, targetNext] of assets) {
    const sourceStart = source.indexOf('const ' + name + '=`')
    const sourceEnd = source.indexOf('`;', sourceStart)
    const targetStart = target.indexOf('var ' + name + '=`')
    const targetEnd = target.indexOf('`;var ' + targetNext, targetStart)
    assert.notEqual(sourceStart, -1, name + ': source start')
    assert.notEqual(sourceEnd, -1, name + ': source end')
    assert.notEqual(targetStart, -1, name + ': target start')
    assert.notEqual(targetEnd, -1, name + ': target end')
    assert.equal(
      source.slice(sourceStart + ('const ' + name + '=`').length, sourceEnd),
      target.slice(targetStart + ('var ' + name + '=`').length, targetEnd),
      name + ': exact template bytes',
    )
  }
})
