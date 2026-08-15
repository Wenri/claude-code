import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.97-to-2.1.98'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_98_BUNDLE
const targetSha256 =
  '27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556'
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_98_BUNDLE is not set'
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

const pinnedUnits = new Map([
  [12483, [9612973, 9615742, 'da3164cd5ac60426d230af793e4f729121bf2cd68b367fb3fee84b0847f4d6d9']],
  [18337, [12786766, 12788196, 'f1fa81a7923daeb8c63837f2e2b09a40ef29e7467fb5b72137b0582e3f83a565']],
  [18338, [12788196, 12789509, 'd1c689a952559ac4b2789f144b85da8dc70f7f698eca8438ed4d6dd9bfa24acb']],
  [18339, [12789509, 12789550, '70c37289fbe914a5414ea1bb295b123671c9c913b01967611c0d6b0241e00d5c']],
  [18340, [12789550, 12789671, 'e68e8f104f969c81936a12986b12ea89dd715e78ace6f09ab00041d5e7ffa09a']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

test('2.1.98 team-memory /dream evidence pins every changed unit', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), targetSha256)
  const bundle = bytes.toString('utf8')
  for (const [index, [start, end, sourceHash]] of pinnedUnits) {
    const region = structural.regions[index]
    assert.equal(region.target.index, index)
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
    )
    assert.equal(sha256(bundle.slice(start, end)), sourceHash)
  }
  for (const fragment of [
    'team_memory_enabled',
    '## Team memory (`team/` subdirectory)',
    "Other teammates' Claude sessions write here too",
    'Do not promote personal memories into `team/` during a dream',
  ]) {
    assert.ok(bundle.includes(fragment), fragment)
  }
})

test('source gates and threads team-memory state through both /dream paths', sourceOptions, () => {
  const dream = source('src/skills/bundled/dream.ts')
  const prompt = source('src/services/autoDream/consolidationPrompt.ts')
  for (const fragment of [
    "feature('TEAMMEM')",
    "require('../../memdir/teamMemPaths.js')",
    'teamMemPaths?.isTeamMemoryEnabled() ?? false',
    'team_memory_enabled: teamMemoryEnabled',
    'teamMemoryEnabled,',
  ]) {
    assert.ok(dream.includes(fragment), fragment)
  }
  for (const fragment of [
    'TEAM_MEMORY_DREAM_GUIDANCE',
    'teamMemoryEnabled = false',
    '${teamMemoryEnabled ?',
    'be conservative pruning \\`team/\\`',
    "deleting a teammate's load-bearing note costs a lot",
  ]) {
    assert.ok(prompt.includes(fragment), fragment)
  }
})
