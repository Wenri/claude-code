import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselinePath = process.env.CLAUDE_CODE_2_1_109_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
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
  [2385, ['unresolved', 954989, 957380, 'ad17500d426b8271cbe77b0f6b421ff605087c296d795755176e40e0fd3746ad']],
  [2396, ['unresolved', 958407, 958456, '025469122d0432b3ecc64815f86de912bf6c7f8c458edb620cf732650e3b2a83']],
  [2398, ['unresolved', 958503, 958530, '7ccebd6ea04684c3f913462310fdca848534ec1806488fa8960c87b43bf6dd07']],
  [15085, ['matched', 10946985, 10947611, '858f803ce177420164d7d239cd834ecd6ac0f9ca427dd7c5d095db4721b3a5a2']],
  [17309, ['matched', 12022136, 12023103, '6a460106512cb5beb8db9667886e12f5aa79cbd1d5094f5a46c5113ed6d78e4e']],
  [17316, ['unresolved', 12024739, 12034677, '581522024a31e08111c3a4a4408a56f4b4a30bbc9f4c52bb7c12731a166167b4']],
  [17325, ['unresolved', 12036268, 12039969, '4055cccbadafbe0151e356717d8c977f5581c7207dc46ee8365c78c7622c043c']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function assertSource(relative, fragments) {
  const contents = source(relative)
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
  }
  return contents
}

test(
  'target110 pins the multi-repository watcher and reachable bridge graph',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.109 and 2.1.110 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7',
    )
    assert.equal(
      sha256(targetBytes),
      'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    for (const [index, [classification, start, end, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, classification, `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }
    assert.equal(baseline.includes('current_branches setup failed'), false)
    assert.equal(target.includes('current_branches setup failed'), true)
    const bridge = target.slice(12024739, 12034677)
    for (const fragment of [
      'current_branches',
      'addWatchedRepo',
      'getCachedBranchForRepo',
      'onRepoBranchChange',
    ]) {
      assert.ok(bridge.includes(fragment), fragment)
    }
    assert.ok(target.slice(12022136, 12023103).includes('reuse_outcome_branches'))
  },
)

test(
  'source owns branch watching, caching, invalidation, and teardown',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const git = assertSource('utils/git/gitFilesystem.ts', [
      'private repoBranches = new Map<string, string | null>()',
      'async addRepo(repoPath: string)',
      "this.watchPath(join(gitDir, 'HEAD')",
      'this.repoBranches.delete(repoPath)',
      'onRepoBranchChange(listener: () => void)',
      'async getBranchForRepo(repoPath: string)',
      'export function addWatchedRepo',
      'export function getCachedBranchForRepo',
    ])
    assert.match(git, /if \(!gitDir\) return undefined/)
    assert.match(git, /head\?\.type === 'branch' \? head\.name : null/)

    const bridge = assertSource('bridge/remoteBridgeCore.ts', [
      'gitRepoUrl?: string | null',
      "branch = ''",
      'gitRepoUrl ? { gitRepoUrl, branch } : undefined',
      'await addWatchedRepo(cwd)',
      'current_branches: { [repository]: currentBranch }',
      'invalidateRepoBranch?.()',
      'void refreshRepoBranch?.()',
      'unsubscribeRepoBranchChange?.()',
      '[remote-bridge] current_branches setup failed:',
    ])
    assert.ok(
      bridge.indexOf('invalidateRepoBranch?.()') <
        bridge.indexOf('flushGate.start()', bridge.indexOf('invalidateRepoBranch?.()')),
    )
  },
)

test(
  'source sends repository, cwd, model, and branch context at session creation',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    assertSource('bridge/gitSessionContext.ts', [
      'export async function buildGitSessionContext',
      'branch || defaultBranch || (await getDefaultBranch()) || undefined',
      'url: `https://${host}/${owner}/${name}`',
      'branches: revision ? [revision] : []',
      "return build('github.com', owner, name, revision)",
    ])
    assertSource('bridge/codeSessionApi.ts', [
      'cwd: cwd ?? getCwd()',
      '...(model && { model })',
      "await import('./gitSessionContext.js')",
      'config.reuse_outcome_branches = true',
      '{ title, bridge: {}, ...(tags?.length ? { tags } : {}), config }',
    ])
    const init = assertSource('bridge/initReplBridge.ts', [
      'const branch = await getBranch()',
      'const gitRepoUrl = await getRemoteUrl()',
      'gitRepoUrl,\n      branch,',
    ])
    assert.ok(
      init.indexOf('const branch = await getBranch()') <
        init.indexOf('if (isEnvLessBridgeEnabled()'),
    )
  },
)
