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
  [
    11206,
    [
      8743677,
      8744322,
      'FunctionDeclaration',
      '8ff2c43e760902ae543419fc3d79bb30457688bb75f934217bc0ab875ced302b',
    ],
  ],
  [
    11207,
    [
      8744322,
      8744478,
      'FunctionDeclaration',
      '5e4c271e0a0921ec2bd4a3ac68dfe893c3c2b572ef3c4174e8233063b48fae9e',
    ],
  ],
  [
    11208,
    [
      8744478,
      8744666,
      'FunctionDeclaration',
      'be7532f41386a5fd522668a6738fa454a4782800485d573e2a74eb2d69b8a370',
    ],
  ],
  [
    11209,
    [
      8744666,
      8747137,
      'FunctionDeclaration',
      '4ea9191b95ae84df727bf1660a5e59a0f52ddda41ca42fd3f7738794c2b29505',
    ],
  ],
  [
    11210,
    [
      8747137,
      8749439,
      'FunctionDeclaration',
      '3dff730c410566c7747139eca661822bf0fa0d8e3ff0082ff3830801fd9fba47',
    ],
  ],
  [
    11211,
    [
      8749439,
      8750175,
      'FunctionDeclaration',
      'e8527eebf0c57f951a9b9b6a0cd1ff537ba228647f06fb05c3f569943dc4dc7d',
    ],
  ],
  [
    11212,
    [
      8750175,
      8752508,
      'FunctionDeclaration',
      '93c655bb749e360669430bdb8dc8b14cf19f7ac1a8238e079a8e263940cefbcd',
    ],
  ],
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

function assertInOrder(contents, fragments, owner) {
  let offset = 0
  for (const fragment of fragments) {
    const index = contents.indexOf(fragment, offset)
    assert.notEqual(index, -1, `${owner}: ${fragment}`)
    offset = index + fragment.length
  }
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

async function compileReservationHarness(contents, harness) {
  const ts = await loadTypeScript()
  const file = ts.createSourceFile(
    'spawnMultiAgent.ts',
    contents,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const selectedNames = new Set([
    'generateUniqueTeammateNameFromTeamFile',
    'reserveTeammateIdentity',
    'updateReservedTeammateBackend',
  ])
  const declarations = file.statements
    .filter(
      statement =>
        ts.isFunctionDeclaration(statement) &&
        statement.name &&
        selectedNames.has(statement.name.text),
    )
    .map(statement => statement.getText(file))
  assert.equal(declarations.length, selectedNames.size)

  const javascript = ts.transpileModule(
    `${declarations.join('\n')}\nexport { ${[...selectedNames].join(', ')} }`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const module = { exports: {} }
  new Function(
    'updateTeamFile',
    'formatAgentId',
    'sanitizeAgentName',
    'logForDebugging',
    'errorMessage',
    'removeTeamMember',
    'module',
    'exports',
    javascript,
  )(
    harness.updateTeamFile,
    harness.formatAgentId,
    harness.sanitizeAgentName,
    harness.logForDebugging,
    harness.errorMessage,
    harness.removeTeamMember,
    module,
    module.exports,
  )
  return module.exports
}

test(
  'authenticated target105 pins the complete atomic teammate reservation graph',
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
    for (const [index, [start, end, nodeType, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
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

    for (const marker of [
      'reserveTeammateIdentity: updateTeamFile returned undefined',
      '[spawnTeammate] pane cleanup failed for ',
      '[spawnTeammate] post-commit failure for ',
      'tmuxPaneId:"",subscriptions:[]',
    ]) {
      assert.equal(occurrences(baseline, marker), 0, `baseline: ${marker}`)
      assert.equal(occurrences(target, marker), 1, `target: ${marker}`)
      assert.equal(occurrences(latest, marker), 1, `latest: ${marker}`)
    }

    const reservation = target.slice(8743677, 8744322)
    assertInOrder(
      reservation,
      [
        '.members.push({agentId:',
        'tmuxPaneId:"",subscriptions:[]',
        'if(!',
        'reserveTeammateIdentity: updateTeamFile returned undefined',
        'pane cleanup failed for ',
        'post-commit failure for ',
      ],
      'target105 reservation helper',
    )
    for (const index of [11209, 11210, 11212]) {
      assert.match(
        target.slice(units.get(index)[0], units.get(index)[1]),
        /oq7\(/,
      )
    }
  },
)

test(
  'authored source reserves identity before spawn and commits only after launch',
  sourceOptions,
  () => {
    const spawn = source('tools/shared/spawnMultiAgent.ts')
    const tool = source('Tool.ts')

    assert.equal(occurrences(spawn, 'return reserveTeammateIdentity('), 3)
    assert.equal(occurrences(spawn, 'await updateReservedTeammateBackend('), 3)
    assert.equal(occurrences(spawn, 'await clearMailbox('), 3)
    assert.equal(occurrences(spawn, 'markCommitted()'), 3)
    assert.equal(occurrences(spawn, 'teamFile.members.push({'), 1)
    assert.equal(spawn.includes('writeTeamFileAsync'), false)
    assert.equal(spawn.includes('assignTeammateColor'), false)
    assert.match(
      spawn,
      /await removeTeamMember\(teamName, identity\.teammateId\)/,
    )
    assert.match(
      spawn,
      /if \(!committed\)[\s\S]*await cleanup\(\)[\s\S]*removeTeamMember/,
    )
    assert.match(
      spawn,
      /post-commit failure for \$\{identity\.teammateId\}; entry kept/,
    )
    assert.match(
      spawn,
      /registerCleanup\(\(\) =>[\s\S]*killPane\(paneId, !insideTmux\)/,
    )
    assert.match(
      spawn,
      /execFileNoThrow\(TMUX_COMMAND, \['kill-pane', '-t', paneId\]\)/,
    )
    assert.match(
      tool,
      /teammateColors: \{[\s\S]*assign\(teammateId: string\): string/,
    )

    const split = spawn.slice(
      spawn.indexOf('async function handleSpawnSplitPane'),
      spawn.indexOf('async function handleSpawnSeparateWindow'),
    )
    assertInOrder(
      split,
      [
        'return reserveTeammateIdentity(',
        'createTeammatePaneInSwarmView(',
        'registerCleanup(',
        'await updateReservedTeammateBackend(',
        'await clearMailbox(',
        'await writeToMailbox(',
        'await sendCommandToPane(',
        'markCommitted()',
        'setAppState(',
        'registerOutOfProcessTeammateTask(',
      ],
      'split-pane launch order',
    )

    const separate = spawn.slice(
      spawn.indexOf('async function handleSpawnSeparateWindow'),
      spawn.indexOf('function registerOutOfProcessTeammateTask'),
    )
    assertInOrder(
      separate,
      [
        'return reserveTeammateIdentity(',
        "'new-window'",
        'registerCleanup(',
        'await updateReservedTeammateBackend(',
        'await clearMailbox(',
        'await writeToMailbox(',
        "'send-keys'",
        'markCommitted()',
      ],
      'separate-window launch order',
    )

    const inProcess = spawn.slice(
      spawn.indexOf('async function handleSpawnInProcess'),
      spawn.indexOf(
        'async function handleSpawn(',
        spawn.indexOf('async function handleSpawnInProcess') + 1,
      ),
    )
    assertInOrder(
      inProcess,
      [
        'return reserveTeammateIdentity(',
        'await updateReservedTeammateBackend(',
        'await clearMailbox(',
        'await spawnInProcessTeammate(',
        'markCommitted()',
        'startInProcessTeammate(',
      ],
      'in-process launch order',
    )
  },
)

test(
  'reservation helper rolls back pre-commit failures and preserves post-commit agents',
  sourceOptions,
  async () => {
    const teamFile = { members: [] }
    const logs = []
    const removed = []
    const harness = {
      updateTeamFile: async (_teamName, updater) => updater(teamFile),
      formatAgentId: (name, teamName) => `${name}@${teamName}`,
      sanitizeAgentName: name => name.replaceAll('@', '-'),
      logForDebugging: message => logs.push(message),
      errorMessage: error => String(error?.message ?? error),
      removeTeamMember: async (_teamName, agentId) => {
        removed.push(agentId)
        const index = teamFile.members.findIndex(m => m.agentId === agentId)
        if (index !== -1) teamFile.members.splice(index, 1)
      },
    }
    const colors = {
      assign: id => `color:${id}`,
      get: () => undefined,
      clear: () => {},
    }
    const compiled = await compileReservationHarness(
      source('tools/shared/spawnMultiAgent.ts'),
      harness,
    )

    const first = await compiled.reserveTeammateIdentity(
      'Worker@A',
      'team',
      { prompt: 'one', cwd: '/tmp' },
      colors,
      async identity => identity,
    )
    const second = await compiled.reserveTeammateIdentity(
      'worker-a',
      'team',
      { prompt: 'two', cwd: '/tmp' },
      colors,
      async identity => identity,
    )
    assert.equal(first.sanitizedName, 'Worker-A')
    assert.equal(second.sanitizedName, 'worker-a-2')

    let cleanupCalls = 0
    await assert.rejects(
      compiled.reserveTeammateIdentity(
        'rollback',
        'team',
        { prompt: 'fail', cwd: '/tmp' },
        colors,
        async (_identity, _markCommitted, registerCleanup) => {
          registerCleanup(() => {
            cleanupCalls++
          })
          throw new Error('precommit')
        },
      ),
      /precommit/,
    )
    assert.equal(cleanupCalls, 1)
    assert.deepEqual(removed, ['rollback@team'])
    assert.equal(
      teamFile.members.some(member => member.agentId === 'rollback@team'),
      false,
    )

    await assert.rejects(
      compiled.reserveTeammateIdentity(
        'running',
        'team',
        { prompt: 'started', cwd: '/tmp' },
        colors,
        async (_identity, markCommitted) => {
          markCommitted()
          throw new Error('postcommit')
        },
      ),
      /postcommit/,
    )
    assert.equal(
      teamFile.members.some(member => member.agentId === 'running@team'),
      true,
    )
    assert.equal(removed.includes('running@team'), false)
    assert.ok(logs.some(message => message.includes('entry kept')))

    await compiled.updateReservedTeammateBackend('team', 'running@team', {
      tmuxPaneId: '%7',
      backendType: 'tmux',
    })
    assert.deepEqual(
      teamFile.members.find(member => member.agentId === 'running@team'),
      {
        agentId: 'running@team',
        name: 'running',
        color: 'color:running@team',
        joinedAt: teamFile.members.find(
          member => member.agentId === 'running@team',
        ).joinedAt,
        tmuxPaneId: '%7',
        subscriptions: [],
        prompt: 'started',
        cwd: '/tmp',
        backendType: 'tmux',
      },
    )
  },
)
