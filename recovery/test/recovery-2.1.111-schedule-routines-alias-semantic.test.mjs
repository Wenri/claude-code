import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.110-to-2.1.111'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_111_BUNDLE
const baselineSha256 =
  'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861'
const targetSha256 =
  '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0'

const baselineUnit = {
  index: 19014,
  start: 12907321,
  end: 12909733,
  sourceHash:
    'c5b69f32bd070b1cb867fc1b6fb562b140a882bcef2365bd8111cb340fce19ba',
  nodeType: 'FunctionDeclaration',
}
const targetUnit = {
  index: 19076,
  start: 12933647,
  end: 12936080,
  sourceHash:
    '880916a1c2b537d88b9852dbe1950a7375ad4852c252ca76eedb80c26d51705e',
  nodeType: 'FunctionDeclaration',
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

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_110_BUNDLE and CLAUDE_CODE_2_1_111_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(value, needle) {
  return value.split(needle).length - 1
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test('target111 authenticates the /routines scheduled-agent alias', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(baselineBytes), baselineSha256)
  assert.equal(sha256(targetBytes), targetSha256)

  const baselineRegion = structural.unmatchedBaseline.find(
    region => region.index === baselineUnit.index,
  )
  assert.ok(baselineRegion)
  assert.deepEqual(
    [
      baselineRegion.start,
      baselineRegion.end,
      baselineRegion.sourceHash,
      baselineRegion.nodeType,
    ],
    [
      baselineUnit.start,
      baselineUnit.end,
      baselineUnit.sourceHash,
      baselineUnit.nodeType,
    ],
  )
  const targetRegion = structural.regions[targetUnit.index]
  assert.equal(targetRegion.classification, 'unresolved')
  assert.deepEqual(
    [
      targetRegion.target.start,
      targetRegion.target.end,
      targetRegion.target.sourceHash,
      targetRegion.target.nodeType,
    ],
    [
      targetUnit.start,
      targetUnit.end,
      targetUnit.sourceHash,
      targetUnit.nodeType,
    ],
  )

  const baselineOwner = baselineBytes
    .toString('utf8')
    .slice(baselineUnit.start, baselineUnit.end)
  const targetOwner = targetBytes
    .toString('utf8')
    .slice(targetUnit.start, targetUnit.end)
  assert.equal(sha256(baselineOwner), baselineUnit.sourceHash)
  assert.equal(sha256(targetOwner), targetUnit.sourceHash)
  assert.equal(occurrences(baselineOwner, 'aliases:["routines"]'), 0)
  assert.equal(occurrences(targetOwner, 'aliases:["routines"]'), 1)
  assert.equal(occurrences(baselineOwner, 'CLAUDE_CODE_REMOTE'), 1)
  assert.equal(occurrences(targetOwner, 'CLAUDE_CODE_REMOTE'), 1)
})

test('source forwards /routines through alias-aware command resolution', sourceOptions, () => {
  const owner = source('skills/bundled/scheduleRemoteAgents.ts')
  const registry = source('skills/bundledSkills.ts')
  const commands = source('commands.ts')
  assert.equal(occurrences(owner, "aliases: ['routines']"), 1)
  assert.equal(occurrences(registry, 'aliases: definition.aliases'), 1)
  assert.match(commands, /\.aliases\?\.includes\(commandName\)/)
})
