import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const isCurrentSource =
  path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
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
    11242,
    [
      8750671,
      8750800,
      'a20fe7c4d07eae2cf53a1fcd7275cf5f740e75ecd884a17c52e00b8edae325fe',
    ],
  ],
  [
    12401,
    [
      9527381,
      9529602,
      '33fd2c6a0ea860457b41744fde031b0d796b7e4e1571cbf9ffa7a9bebeb00dea',
    ],
  ],
])

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_100_BUNDLE and CLAUDE_CODE_2_1_101_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test('target101 pins exclusive team-file creation and collision handling', pairOptions, () => {
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  for (const [index, [start, end, hash]] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, hash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(target.slice(start, end)), hash, `${index}: target bytes`)
  }
  assert.match(
    target.slice(...units.get(11242).slice(0, 2)),
    /exclusive\?\{flag:"wx"\}/,
  )
  const teamCreate = target.slice(...units.get(12401).slice(0, 2))
  assert.match(teamCreate, /\{exclusive:!0\}/)
  assert.match(teamCreate, /getErrnoCode|EEXIST/)
  assert.ok(teamCreate.includes('Choose a different team_name'))
})

test('target101 replaces duplicate-name mutation with a fail-closed create', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  assert.equal(baseline.includes('Choose a different team_name'), false)
  assert.equal(target.includes('Choose a different team_name'), true)
  assert.equal(baseline.includes('?{flag:"wx"}:void 0'), false)
  assert.equal(target.includes('?{flag:"wx"}:void 0'), true)
})

test('source owns exclusive persistence and preserves the requested team name', sourceOptions, () => {
  const helpers = source('utils/swarm/teamHelpers.ts')
  assert.ok(helpers.includes('options?: { exclusive?: boolean }'))
  assert.ok(helpers.includes("options?.exclusive ? { flag: 'wx' } : undefined"))

  const tool = source('tools/TeamCreateTool/TeamCreateTool.ts')
  for (const fragment of [
    'const finalTeamName = team_name',
    'writeTeamFileAsync(finalTeamName, teamFile, { exclusive: true })',
    "getErrnoCode(error) === 'EEXIST'",
    'getErrnoPath(error) === teamFilePath',
    'Choose a different team_name, or run TeamDelete on the existing team first.',
  ]) {
    assert.ok(tool.includes(fragment), fragment)
  }
  assert.equal(tool.includes('generateUniqueTeamName'), false)
  assert.equal(tool.includes('generateWordSlug'), false)
  if (isCurrentSource) {
    assert.ok(tool.includes('context.teammateColors.assign(leadAgentId)'))
  } else {
    assert.ok(tool.includes('assignTeammateColor(leadAgentId)'))
  }
})
