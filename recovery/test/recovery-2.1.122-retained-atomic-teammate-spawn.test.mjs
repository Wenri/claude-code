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
  },
  {
    version: '2.1.122',
    envNames: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
]

function readBundle(release) {
  const filename = release.envNames.map(name => process.env[name]).find(Boolean)
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

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

function occurrences(text, needle) {
  return text.split(needle).length - 1
}

function section(text, start, end) {
  const from = text.indexOf(start)
  assert.ok(from >= 0, `missing section start: ${start}`)
  const to = text.indexOf(end, from + start.length)
  assert.ok(to > from, `missing section end: ${end}`)
  return text.slice(from, to)
}

function assertOrder(text, ...needles) {
  let cursor = -1
  for (const needle of needles) {
    const next = text.indexOf(needle, cursor + 1)
    assert.ok(next > cursor, `${needle} is missing or out of order`)
    cursor = next
  }
}

test('authenticates retained atomic teammate reservation and rollback protocol', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const anchor = bundle.indexOf(
      'reserveTeammateIdentity: updateTeamFile returned undefined',
    )
    assert.ok(anchor >= 0, `${release.version}: reservation anchor`)

    const transaction = bundle.slice(anchor - 500, anchor + 900)
    assert.match(
      transaction,
      /members\.push\(\{agentId:[\w$]+,name:[\w$]+,color:[\w$]+,joinedAt:Date\.now\(\),tmuxPaneId:"",subscriptions:\[\],\.\.\.[\w$]+\}\)/,
      `${release.version}: identity is persisted before spawning`,
    )
    assert.match(
      transaction,
      /let [\w$]+=!1,[\w$]+;try\{return await [\w$]+\([\w$]+,\(\)=>\{[\w$]+=!0\},\([\w$]+\)=>\{[\w$]+=[\w$]+\}\)\}/,
      `${release.version}: explicit commit and cleanup callbacks`,
    )
    assert.ok(
      transaction.includes('[spawnTeammate] pane cleanup failed for'),
      `${release.version}: cleanup failure telemetry`,
    )
    assert.match(
      transaction,
      /\[spawnTeammate\] post-commit failure for \$\{[\w$]+\.teammateId\}; entry kept \(agent already running\):/,
      `${release.version}: post-commit entry preservation`,
    )
    assert.match(
      transaction,
      /await [\w$]+\([\w$]+,[\w$]+\.teammateId\)/,
      `${release.version}: pre-commit reservation removal`,
    )

    assert.ok(
      bundle.includes(
        'realpath:!1,retries:{retries:10,minTimeout:5,maxTimeout:100},onCompromised:()=>{}',
      ),
      `${release.version}: exact team-file lock policy`,
    )
    assert.ok(
      bundle.includes('[TeammateTool] updateTeamFile lock release failed:'),
      `${release.version}: lock release is guarded`,
    )
    assert.ok(
      bundle.includes('[TeammateTool] removeTeamMember('),
      `${release.version}: rollback removal helper`,
    )
  }
})

test('source serializes team-file mutations and shares the lock with activity updates', () => {
  const helpers = source('src/utils/swarm/teamHelpers.ts')
  const update = section(
    helpers,
    'export async function updateTeamFile',
    '/** Remove a reserved team member',
  )

  for (const witness of [
    'realpath: false',
    'retries: 10',
    'minTimeout: 5',
    'maxTimeout: 100',
    'onCompromised: () => {}',
    'lockfilePath: `${teamFilePath}.lock`',
  ]) {
    assert.ok(helpers.includes(witness), `missing lock witness: ${witness}`)
  }
  assertOrder(
    update,
    'lockfile.lock(',
    'readTeamFileAsync(teamName)',
    'updater(teamFile)',
    'if (result === false)',
    'writeTeamFileAsync(teamName, teamFile)',
    'await release()',
  )

  const remove = section(
    helpers,
    'export async function removeTeamMember',
    '/**\n * Removes a teammate from the team file',
  )
  assertOrder(
    remove,
    'updateTeamFile(teamName',
    'findIndex(',
    'members.splice(memberIndex, 1)',
    '[TeammateTool] removeTeamMember(',
  )

  const activity = section(
    helpers,
    'export async function setMemberActive',
    '/**\n * Destroys a git worktree',
  )
  assert.ok(activity.includes('await updateTeamFile(teamName'))
  assert.ok(activity.includes('if (member.isActive === isActive)'))
  assert.ok(activity.includes('return false'))
})

test('source commits all three spawn backends at the authenticated launch boundary', () => {
  const spawn = source('src/tools/shared/spawnMultiAgent.ts')
  assert.equal(occurrences(spawn, 'reserveTeammateIdentity('), 3)
  assert.equal(occurrences(spawn, 'updateReservedTeammatePane('), 4)
  assert.equal(occurrences(spawn, 'teamFile.members.push({'), 1)
  assert.equal(occurrences(spawn, 'await clearMailbox('), 3)

  const reservation = section(
    spawn,
    'async function reserveTeammateIdentity',
    'async function updateReservedTeammatePane',
  )
  assertOrder(
    reservation,
    'await updateTeamFile(teamName',
    'generateUniqueTeammateNameFromTeamFile(name, teamFile)',
    'teammateColors.assign(teammateId)',
    'teamFile.members.push({',
    'let committed = false',
    'return await spawn(',
    'if (!committed)',
    'await cleanup()',
    'await removeTeamMember(teamName, reservation.teammateId)',
    'post-commit failure',
  )

  const split = section(
    spawn,
    'async function handleSpawnSplitPane',
    'async function handleSpawnSeparateWindow',
  )
  assertOrder(
    split,
    'return reserveTeammateIdentity(',
    'createTeammatePaneInSwarmView(',
    'setCleanup(',
    'updateReservedTeammatePane(',
    'await clearMailbox(',
    'await writeToMailbox(',
    'await sendCommandToPane(',
    'commit()',
    'setAppState(',
    'registerOutOfProcessTeammateTask(',
  )

  const separate = section(
    spawn,
    'async function handleSpawnSeparateWindow',
    'function registerOutOfProcessTeammateTask',
  )
  assertOrder(
    separate,
    'return reserveTeammateIdentity(',
    "'new-window'",
    'setCleanup(',
    'updateReservedTeammatePane(',
    'await clearMailbox(',
    'await writeToMailbox(',
    "'send-keys'",
    'commit()',
    'setAppState(',
    'registerOutOfProcessTeammateTask(',
  )

  const inProcess = section(
    spawn,
    'async function handleSpawnInProcess',
    '\nasync function handleSpawn(',
  )
  assertOrder(
    inProcess,
    'return reserveTeammateIdentity(',
    'updateReservedTeammatePane(',
    'await clearMailbox(',
    'spawnInProcessTeammate(config, context)',
    'commit()',
    'startInProcessTeammate({',
    'setAppState(',
  )

  const register = section(
    spawn,
    'function registerOutOfProcessTeammateTask',
    'async function handleSpawnInProcess',
  )
  assert.ok(register.includes('cwd: string'))
  assert.ok(register.includes('status: \'running\',\n    cwd,'))
})
