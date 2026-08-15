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

function assertOrder(text, ...needles) {
  let cursor = -1
  for (const needle of needles) {
    const next = text.indexOf(needle, cursor + 1)
    assert.ok(next > cursor, `${needle} is missing or out of order`)
    cursor = next
  }
}

test('authenticates retained TeamCreate exclusive-write error contract', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const anchor = bundle.indexOf(
      'Choose a different team_name, or run ${',
    )
    assert.ok(anchor >= 0, `${release.version}: no-clobber error anchor`)
    const create = bundle.slice(anchor - 650, anchor + 300)

    assert.match(
      create,
      /try\{await [\w$]+\([\w$]+,[\w$]+,\{exclusive:!0\}\)\}catch\(([\w$]+)\)\{if\([\w$]+\(\1\)==="EEXIST"&&[\w$]+\(\1\)===[\w$]+\)throw Error/,
      `${release.version}: exclusive create with code and path discrimination`,
    )
    assert.match(
      create,
      /Team "\$\{[\w$]+\}" already exists at \$\{[\w$]+\}\. Choose a different team_name, or run \$\{[\w$]+\} on the existing team first\./,
      `${release.version}: exact user-facing collision error`,
    )
  }
})

test('source never renames or overwrites an existing team', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/tools/TeamCreateTool/TeamCreateTool.ts'),
    'utf8',
  )

  assert.doesNotMatch(source, /generateUniqueTeamName|generateWordSlug|readTeamFile/)
  assertOrder(
    source,
    'const finalTeamName = team_name',
    'const teamFilePath = getTeamFilePath(finalTeamName)',
    'await writeTeamFileAsync(finalTeamName, teamFile, { exclusive: true })',
    "getErrnoCode(error) === 'EEXIST'",
    'getErrnoPath(error) === teamFilePath',
    'Team "${finalTeamName}" already exists at ${teamFilePath}. Choose a different team_name, or run ${TEAM_DELETE_TOOL_NAME} on the existing team first.',
    'registerTeamForSessionCleanup(finalTeamName)',
  )
})
