import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.96-to-2.1.97'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_96_BUNDLE
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
      : false,
}
const adjacentOptions = {
  skip:
    bundleOptions.skip || !baselineBundlePath
      ? bundleOptions.skip || 'CLAUDE_CODE_2_1_96_BUNDLE is not set'
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test('target97 pins non-tracking worktree creation', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(bytes),
    '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988',
  )
  const region = structural.regions[16179]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [
      11662841,
      11664466,
      '90fff566cd99f2b5e0a0657d9202ce8f2e4b2fe2999ad9e3ee6e88bee161d80f',
    ],
  )
  const owner = bytes
    .toString('utf8')
    .slice(region.target.start, region.target.end)
  assert.equal(sha256(owner), region.target.sourceHash)
  assert.ok(owner.includes('["worktree","add"]'))
  assert.ok(owner.includes('.push("--no-checkout")'))
  assert.ok(owner.includes('.push("--no-track","-B"'))
  assert.ok(owner.includes('["sparse-checkout","set","--cone","--"'))
})

test('source creates sparse or full worktrees without branch tracking', sourceOptions, () => {
  const source = fs.readFileSync(path.join(sourceRoot, 'utils/worktree.ts'), 'utf8')
  for (const fragment of [
    "const addArgs = ['worktree', 'add']",
    "addArgs.push('--no-checkout')",
    "addArgs.push('--no-track', '-B', worktreeBranch, worktreePath, baseBranch)",
    "['sparse-checkout', 'set', '--cone', '--', ...sparsePaths]",
  ]) {
    assert.ok(source.includes(fragment), fragment)
  }
})

test('2.1.96 still creates a tracking worktree', adjacentOptions, () => {
  const bytes = fs.readFileSync(baselineBundlePath)
  assert.equal(
    sha256(bytes),
    '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e',
  )
  assert.equal(bytes.toString('utf8').includes('"--no-track"'), false)
})
