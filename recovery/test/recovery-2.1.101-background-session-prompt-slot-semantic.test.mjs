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

const promptUnit = [
  16476,
  11828598,
  11829756,
  '425491953dc6ad912d0073d7e461012ae8f9c1609d6e7827e67f929f6353707d',
  'unresolved',
]
const nullHelperUnit = [
  16485,
  11833629,
  11833656,
  'c611a0442c6d95a34379c112f939cbd18962a48b8c1bf766c7e309623280ff01',
  'matched',
]

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

test('target101 pins the reachable background-session prompt slot', pairOptions, () => {
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  for (const [index, start, end, hash, classification] of [
    promptUnit,
    nullHelperUnit,
  ]) {
    const region = structural.regions[index]
    assert.equal(region.classification, classification, `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, hash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(target.slice(start, end)), hash, `${index}: target bytes`)
  }
  assert.match(target.slice(promptUnit[1], promptUnit[2]), /"bg-session",\(\)=>\w+\(\)/)
  assert.match(target.slice(nullHelperUnit[1], nullHelperUnit[2]), /return null/)
})

test('the dormant null helper becomes a named cache slot at target101', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  assert.equal((baseline.match(/bg-session/g) ?? []).length, 2)
  assert.equal((target.match(/bg-session/g) ?? []).length, 3)
  assert.equal(baseline.includes('"bg-session",()=>'), false)
  assert.equal(target.includes('"bg-session",()=>'), true)
})

test('source owns the null-valued named prompt-cache section', sourceOptions, () => {
  const source = fs.readFileSync(path.join(sourceRoot, 'constants/prompts.ts'), 'utf8')
  assert.match(
    source,
    /function getBackgroundSessionSection\(\): null \{\s*return null\s*\}/,
  )
  assert.ok(
    source.includes(
      "systemPromptSection('bg-session', () => getBackgroundSessionSection())",
    ),
  )
  assert.ok(
    source.indexOf("systemPromptSection('output_style'") <
      source.indexOf("systemPromptSection('bg-session'"),
  )
  assert.ok(
    source.indexOf("systemPromptSection('bg-session'") <
      source.indexOf("systemPromptSection('scratchpad'"),
  )
})
