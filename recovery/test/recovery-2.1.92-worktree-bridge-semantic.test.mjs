import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.91-to-2.1.92'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
const targetSha256 =
  '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362'
const selected = !semanticCase || semanticCase === caseName
const historical = semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_92_BUNDLE is not set'
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
  [16054, ['unresolved', 11575973, 11576137, '99074496fca1ecb664d7e80efbc5f310ad05ed10ef9ba66cdffbe3247b15af39']],
  [16055, ['unresolved', 11576137, 11576362, '048e4a5846ea4f85ac1ebf1e9844fcccf7446580fc33e8657f7aa34f306fd3e2']],
  [16056, ['unresolved', 11576362, 11576509, '05b39b62a0083c59d52eccb25b6b0693210c47ef3e2e50e448f766aa2ae4dab4']],
  [16057, ['unresolved', 11576509, 11578121, '6a2b4eed0296b9684849fbb5da4b3dbe383a472627dfaca54733ed299b006f84']],
  [16058, ['unresolved', 11578121, 11579367, 'c1eb95857ec077303a86c744c382ff346b190ce8d5358079eb632c29f81dc157']],
  [16059, ['unresolved', 11579367, 11580151, '54563a028aa445f6a8dc56f6c8cbd19a045b605752797bc9fcc904061bbd1084']],
  [16067, ['unresolved', 11582372, 11583193, 'fe617d72623e7975372f588fa327f5bb3f7c4a665a61dabcdd6ccf47468cf715']],
  [16068, ['unresolved', 11583193, 11583921, 'bc915891758f5a983dd7b0733a59bbe1278b4bc67d0fd01120aff905657bd235']],
  [16069, ['unresolved', 11583921, 11584309, 'f7dbd939e7180f663a6c84706bcc768916c16b8a0eb4be7a6dcda34fa5d75531']],
  [16070, ['unresolved', 11584309, 11584956, '9ea0261db314441d0ddc556be67e80b63bc10c11413f8673b484856253f6b431']],
  [16072, ['unresolved', 11585676, 11585757, 'f42f51f09baf3508139cd69cdf8aa0f2caccbfa82d2817549ab18f2ca7f70079']],
  [16073, ['unresolved', 11585757, 11589140, 'e4dda3b99d4116f01f4831b9e48cb24c097b9ebcad96d579174a42ab10f34e52']],
  [16074, ['unresolved', 11589140, 11589193, 'b23970299b1649c10e4f0e1896e18e137b51cd72b2357eb42db688a0650a546f']],
  [16266, ['unresolved', 11680431, 11694672, '094ea84ff2a06229ec5d484303641e83b9289040d1388ca03379b60b2c9a05d7']],
  [16272, ['unresolved', 11695704, 11696320, '13f35d1a31774b6464df1cbebb839398740218f0e4cfe2b6eb08c4e006cdf8a0']],
  [16276, ['unresolved', 11698728, 11701121, '9123c14dfab969773186421f3d8c770793f5be02e7caf8aeee9fbed1193303b8']],
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

function assertFragments(relative, fragments) {
  const text = source(relative)
  for (const fragment of fragments) {
    assert.ok(text.includes(fragment), `${relative}: ${fragment}`)
  }
  return text
}

test('target92 pins the complete worktree baseline and bridge-retention graph', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), targetSha256)
  const bundle = bytes.toString('utf8')

  for (const [index, [classification, start, end, sourceHash]] of pinnedUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, classification, `${index}: class`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
  }

  for (const fragment of [
    'ClK="CLAUDE_BASE"',
    '[worktree] cannot write baseline: gitdir unresolvable for',
    '[worktree] failed to write baseline to',
    'headCommit:X??O',
    'if(_?.fromHead)$="HEAD"',
    'WorktreeRemove hook did not remove worktree, left at:',
    'WorktreeRemove hook did not remove agent worktree, left at:',
    'git error checking changes',
    'uncommitted changes · ${A}',
    'kept worktree ${q.worktreePath} · ${$}',
    'worktree removal failed, kept:',
    'Remote Control - Connect your local environment to claude.ai/code',
  ]) {
    assert.ok(bundle.includes(fragment), fragment)
  }
})

test('source persists and reuses the worktree creation baseline', sourceOptions, () => {
  const worktree = assertFragments('src/utils/worktree.ts', [
    "const WORKTREE_BASELINE_FILE = 'CLAUDE_BASE'",
    "await readFile(join(worktreePath, '.git'), 'utf-8')",
    "gitPointer.startsWith('gitdir:')",
    "resolve(worktreePath, gitPointer.slice('gitdir:'.length).trim())",
    '[worktree] cannot write baseline: gitdir unresolvable for',
    '[worktree] failed to write baseline to',
    'await writeFile(join(gitDir, WORKTREE_BASELINE_FILE), baseSha',
    'return isValidGitSha(baseline) ? baseline : null',
    'const baseline = await readWorktreeBaseline(worktreePath)',
    'headCommit: baseline ?? existingHead',
    'if (options?.fromHead)',
    "baseBranch = 'HEAD'",
    'await writeWorktreeBaseline(worktreePath, baseSha)',
    'options?: { fromCwd?: string; fromHead?: boolean }',
    'findCanonicalGitRoot(options?.fromCwd ?? getCwd())',
    'await getOrCreateWorktree(gitRoot, slug, options)',
  ])
  assert.ok(
    worktree.indexOf('const baseline = await readWorktreeBaseline') <
      worktree.indexOf('headCommit: baseline ?? existingHead'),
  )
  assert.ok(
    worktree.indexOf('await writeWorktreeBaseline(worktreePath, baseSha)') <
      worktree.indexOf('headCommit: baseSha'),
  )
})

test('source recovers fail-closed worktree status and hook cleanup semantics', sourceOptions, () => {
  const statusFunction = source('src/utils/worktree.ts').includes(
    'export async function getWorktreeChangeStatus(',
  )
    ? 'getWorktreeChangeStatus'
    : 'getAgentWorktreeChanges'
  const worktree = assertFragments('src/utils/worktree.ts', [
    `export async function ${statusFunction}(`,
    'return { dirty: true, commitsAhead: 0, gitError: true }',
    'const dirty = statusOutput.trim().length > 0',
    'if (!headCommit)',
    "['rev-list', '--count', `${headCommit}..HEAD`]",
    'commitsAhead: parseInt(revListOutput.trim(), 10) || 0',
    `const { dirty, commitsAhead } = await ${statusFunction}(`,
    'return dirty || commitsAhead > 0',
    'WorktreeRemove hook did not remove worktree, left at:',
    'WorktreeRemove hook did not remove agent worktree, left at:',
  ])
  assert.ok(
    worktree.indexOf('return { dirty: true, commitsAhead: 0, gitError: true }') <
      worktree.indexOf('const dirty = statusOutput.trim().length > 0'),
  )
})

test('source preserves changed bridge worktrees through every cleanup path', sourceOptions, () => {
  const bridgeSource = source('src/bridge/bridgeMain.ts')
  const statusFunction = bridgeSource.includes('await getWorktreeChangeStatus(')
    ? 'getWorktreeChangeStatus'
    : 'getAgentWorktreeChanges'
  const hasForcedCleanup = bridgeSource.includes('options?: { force?: boolean }')
  const bridge = assertFragments('src/bridge/bridgeMain.ts', [
    'type BridgeWorktree = {',
    'headCommit?: string',
    'async function cleanupBridgeWorktree(',
    `await ${statusFunction}(`,
    'worktree.headCommit,',
    "`${commitsAhead} ${plural(commitsAhead, 'commit')}`",
    "? 'git error checking changes'",
    '? `uncommitted changes · ${commitSummary}`',
    "? 'uncommitted changes'",
    'logger.logStatus(`kept worktree ${worktree.worktreePath} · ${reason}`)',
    'logger.logStatus(`removed worktree ${worktree.worktreePath}`)',
    '`worktree removal failed, kept: ${worktree.worktreePath}`',
    'headCommit: wt.headCommit,',
    'trackCleanup(cleanupBridgeWorktree(wt, logger))',
    'remainingWorktrees.map(wt => cleanupBridgeWorktree(wt, logger))',
  ])
  assert.equal(
    bridge.match(/trackCleanup\(cleanupBridgeWorktree\(wt, logger\)\)/g)?.length,
    hasForcedCleanup ? 1 : 2,
    'ordinary cleanup paths use the preservation helper',
  )
  if (hasForcedCleanup) {
    assertFragments('src/bridge/bridgeMain.ts', [
      'options?: { force?: boolean }',
      'const forceCleanup =',
      'trackCleanup(cleanupBridgeWorktree(wt, logger, { force: true }))',
    ])
  }
  assert.ok(
    bridge.indexOf('headCommit: wt.headCommit,') <
      bridge.indexOf('sessionDir = wt.worktreePath'),
  )
})

test('reference preservation reasons match target92 branches', () => {
  const reason = ({ dirty, commitsAhead, gitError }) => {
    const commits = `${commitsAhead} ${commitsAhead === 1 ? 'commit' : 'commits'}`
    return gitError
      ? 'git error checking changes'
      : dirty && commitsAhead > 0
        ? `uncommitted changes · ${commits}`
        : dirty
          ? 'uncommitted changes'
          : commits
  }
  assert.equal(reason({ dirty: false, commitsAhead: 0, gitError: true }), 'git error checking changes')
  assert.equal(reason({ dirty: true, commitsAhead: 0 }), 'uncommitted changes')
  assert.equal(reason({ dirty: true, commitsAhead: 2 }), 'uncommitted changes · 2 commits')
  assert.equal(reason({ dirty: false, commitsAhead: 1 }), '1 commit')
})
