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
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const selected = !semanticCase || semanticCase === caseName
const historicalOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_98_BUNDLE is not set'
      : false,
}
const adjacentOptions = {
  skip: bundleOptions.skip || !baselineBundlePath
    ? bundleOptions.skip || 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
    : false,
}
const structural = JSON.parse(gunzipSync(fs.readFileSync(path.join(
  repositoryRoot,
  'recovery/cases',
  caseName,
  'structural/generated-delta.json.gz',
))))

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test('target98 pins the resume-selector filter affordances', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), '27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556')
  const bundle = bytes.toString('utf8')
  const region = structural.regions.find(row => row.target?.index === 14880)
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [11054622, 11069366, '768a1a04fded15e6627d4ad051f44893d9a9809f468ea39b0ee0fe8d03515600'],
  )
  const owner = bundle.slice(region.target.start, region.target.end)
  assert.equal(sha256(owner), region.target.sourceHash)
  for (const value of [
    'only show current directory',
    'show all directories',
    'only show current branch',
    'show all branches',
    'only show current worktree',
    'show all worktrees',
  ]) {
    assert.ok(owner.includes(value), value)
  }
  assert.ok(owner.includes('chord:"ctrl+a"'))
  assert.ok(owner.includes('chord:"ctrl+b"'))
  assert.ok(owner.includes('chord:"ctrl+w"'))
  assert.ok(owner.includes('format:{modCase:"title",charCase:"upper"}'))
})

test('historical source owns stateful filter labels and display formatting', historicalOptions, () => {
  const source = fs.readFileSync(path.join(sourceRoot, 'components/LogSelector.tsx'), 'utf8')
  if (semanticCase !== caseName) {
    for (const value of [
      'only show current repo',
      'show all projects',
      'only show current branch',
      'show all branches',
      'only show current worktree',
      'show all worktrees',
    ]) {
      assert.ok(source.includes(value), value)
    }
    assert.ok(source.includes('chord="space" action="preview"'))
    assert.ok(source.includes("enabled: !enabled"))
    return
  }
  for (const value of [
    'only show current directory',
    'show all directories',
    'only show current branch',
    'show all branches',
    'only show current worktree',
    'show all worktrees',
  ]) {
    assert.ok(source.includes(value), value)
  }
  assert.ok(source.includes('showAllProjects ? "only show current directory" : "show all directories"'))
  assert.ok(source.includes('branchFilterEnabled ? "only show current branch" : "show all branches"'))
  assert.ok(source.includes('showAllWorktrees ? "only show current worktree" : "show all worktrees"'))
  assert.match(source, /shortcut="Ctrl\+[ABW]"[\s\S]*?format=\{\{ modCase: "title", charCase: "upper" \}\}/)
  assert.match(source, /shortcut="Ctrl\+V" action="preview" format=\{\{ modCase: "title", charCase: "upper" \}\}/)
  assert.ok(source.includes('enabled: showAllProjects'))
  assert.ok(source.includes('enabled: branchFilterEnabled'))
  assert.ok(source.includes('enabled: showAllWorktrees'))
  assert.ok(source.includes('$[247] !== branchFilterEnabled'))
})

test('2.1.97 predates the complete filter wording', adjacentOptions, () => {
  const bytes = fs.readFileSync(baselineBundlePath)
  assert.equal(sha256(bytes), '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988')
  const bundle = bytes.toString('utf8')
  assert.equal(bundle.includes('only show current directory'), false)
  assert.equal(bundle.includes('show all directories'), false)
})
