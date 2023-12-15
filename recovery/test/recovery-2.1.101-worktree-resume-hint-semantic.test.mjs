import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

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
const latestBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
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

const targetUnits = new Map([
  [10248, [7573748, 7573773, '1afeec88e29a814e72cca5b862d3657aa18a6d203dd3bf1b51a01c680a0a89bd']],
  [10249, [7573773, 7573819, '486e54115356ceb392496f189cf1c20a40b664b57964348e45e3cde92a75f126']],
  [10250, [7573819, 7573864, '7bc4f6e6b8d5eafdaa162dfe6e21d5d78d57316f91374d7a1fc8da0cc5a7e452']],
  [10251, [7573864, 7573888, 'b7708b417fd700dcfbc4f96b973112f06ddb4998a357bbf9083701e4cb6e161e']],
  [10255, [7574341, 7574648, '5653ab8d2d24d4492678040facb3128d3bb015c36b11fe4b529daacfc4e21377']],
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

test('target101 pins worktree state helpers and resume hint', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be',
  )
  assert.equal(
    sha256(targetBytes),
    'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
  )
  const target = targetBytes.toString('utf8')
  for (const [index, identity] of targetUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: class`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
      `${index}: identity`,
    )
    const unit = target.slice(identity[0], identity[1])
    assert.equal(sha256(unit), identity[2], `${index}: bytes`)
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
      1,
      `${index}: one top-level statement`,
    )
  }
})

test('worktree resume argument enters at target101 and persists', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  assert.equal(baseline.includes('`--worktree ${'), false)
  assert.equal(target.includes('`--worktree ${'), true)
  const hint = target.slice(...targetUnits.get(10255).slice(0, 2))
  assert.ok(hint.includes('Resume this session with:'))
  assert.ok(hint.includes('--resume ${'))
  assert.ok(hint.includes('`--worktree ${'))
  const setter = target.slice(...targetUnits.get(10249).slice(0, 2))
  assert.ok(setter.includes('.worktreeName'))
  assert.ok(setter.includes('if('))
  if (latestBundlePath) {
    const latest = fs.readFileSync(latestBundlePath, 'utf8')
    assert.ok(latest.includes('`--worktree ${'))
    assert.match(latest, /\.enteredExisting\?null:[\w$]+\.worktreeName/)
  }
})

test('source retains the worktree name until cleanup and renders it in the hint', sourceOptions, () => {
  const worktree = source('utils/worktree.ts')
  const shutdown = source('utils/gracefulShutdown.ts')
  for (const fragment of [
    'let resumeWorktreeName: string | null = null',
    'function setCurrentWorktreeSessionValue(',
    'resumeWorktreeName = session.worktreeName',
    'export function getResumeWorktreeName(): string | null {',
    'function clearResumeWorktreeName(): void {',
    'setCurrentWorktreeSessionValue(session)',
    'clearResumeWorktreeName()',
  ]) {
    assert.ok(worktree.includes(fragment), `worktree: ${fragment}`)
  }
  const cleanup = worktree.slice(
    worktree.indexOf('export async function cleanupWorktree'),
  )
  assert.ok(
    cleanup.includes('setCurrentWorktreeSession(null)') ||
      cleanup.includes('setCurrentWorktreeSessionValue(null)'),
  )
  assert.ok(cleanup.includes('clearResumeWorktreeName()'))
  for (const fragment of [
    "import { getResumeWorktreeName } from './worktree.js'",
    'const worktreeName = getResumeWorktreeName()',
    "const worktreeArg = worktreeName ? `--worktree ${worktreeName} ` : ''",
    'claude ${worktreeArg}--resume ${resumeArg}',
  ]) {
    assert.ok(shutdown.includes(fragment), `gracefulShutdown: ${fragment}`)
  }

  if (isCurrentSource) {
    assert.ok(worktree.includes('if (session && !session.enteredExisting)'))
    assert.ok(worktree.includes('return currentWorktreeSession.enteredExisting'))
  } else {
    assert.ok(worktree.includes('if (session) resumeWorktreeName'))
    assert.ok(
      worktree.includes(
        'return currentWorktreeSession?.worktreeName ?? resumeWorktreeName',
      ),
    )
  }
})
