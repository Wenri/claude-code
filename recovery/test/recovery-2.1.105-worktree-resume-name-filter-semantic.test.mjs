import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_105_BUNDLE

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
  [
    9403,
    [
      7209625,
      7209691,
      'daa374e7c7d43e96676fc3e375153a90b373213e21e5878645e5869abbddaeaa',
    ],
  ],
  [
    9404,
    [
      7209691,
      7209773,
      'd8021e2a68121ef35b42f67e440433f9b8f0d0ff2bee49366548df36bf9017ed',
    ],
  ],
  [
    9409,
    [
      7210250,
      7210557,
      'c2989fbe38b08ec42b69126367b52366f9c927534a9bfd6fe1bd9bd23e49c894',
    ],
  ],
])

const baselineUnits = new Map([
  [
    10250,
    [
      7574443,
      7574489,
      '95b1b3751a1e3a6efdb1240dfab1e14f6d89eea9068bed4fae59b5d493710aaf',
    ],
  ],
  [
    10251,
    [
      7574489,
      7574534,
      'd2cc8f3ac94157602a9ec2e7870175733dd84146dda4807dbf8859c0d439378d',
    ],
  ],
  [
    10256,
    [
      7575011,
      7575318,
      'd221911bccb12730c2014523a317d71dda80f3b2de0ee2527d9667eaa0eb8bb9',
    ],
  ],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function readSource(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
}

function authenticatedBundle(filename, expectedSha256, label) {
  assert.ok(filename, `${label} bundle path is required`)
  const bytes = fs.readFileSync(filename)
  assert.equal(sha256(bytes), expectedSha256, `${label} bundle identity`)
  return bytes.toString('utf8')
}

test(
  'target105 authenticates the entered-existing resume-name filter',
  {
    skip:
      !selected || !baselineBundlePath || !targetBundlePath
        ? 'selected authenticated 104/105 artifacts are required'
        : false,
  },
  () => {
    const baseline = authenticatedBundle(
      baselineBundlePath,
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
      '2.1.104',
    )
    const target = authenticatedBundle(
      targetBundlePath,
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
      '2.1.105',
    )

    for (const [index, [start, end, hash]] of targetUnits) {
      const region = structural.regions[index]
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, hash],
        `target unit ${index}`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `target bytes ${index}`)
    }
    assert.equal(structural.regions[9403].classification, 'unresolved')
    assert.equal(structural.regions[9404].classification, 'unresolved')
    assert.equal(structural.regions[9409].classification, 'matched')
    assert.equal(structural.regions[9409].baselineUnitIndex, 10256)

    for (const [index, [start, end, hash]] of baselineUnits) {
      assert.equal(
        sha256(baseline.slice(start, end)),
        hash,
        `baseline bytes ${index}`,
      )
    }

    const baselineSetter = baseline.slice(...baselineUnits.get(10250).slice(0, 2))
    const baselineGetter = baseline.slice(...baselineUnits.get(10251).slice(0, 2))
    const targetSetter = target.slice(...targetUnits.get(9403).slice(0, 2))
    const targetGetter = target.slice(...targetUnits.get(9404).slice(0, 2))
    assert.ok(baselineSetter.includes('.worktreeName'))
    assert.equal(baselineSetter.includes('.enteredExisting'), false)
    assert.ok(baselineGetter.includes('.worktreeName'))
    assert.equal(baselineGetter.includes('.enteredExisting'), false)
    assert.match(targetSetter, /&&![\w$]+\.enteredExisting/)
    assert.match(targetGetter, /\.enteredExisting\?null:[\w$]+\.worktreeName/)

    const hint = target.slice(...targetUnits.get(9409).slice(0, 2))
    assert.ok(hint.includes('`--worktree ${'))
    assert.ok(hint.includes('Resume this session with:'))
  },
)

test(
  'source suppresses a duplicate worktree argument only for entered-existing sessions',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const worktree = readSource('utils/worktree.ts')
    const shutdown = readSource('utils/gracefulShutdown.ts')

    for (const fragment of [
      'let resumeWorktreeName: string | null = null',
      'function setCurrentWorktreeSessionValue(',
      'if (session && !session.enteredExisting)',
      'resumeWorktreeName = session.worktreeName',
      'export function getResumeWorktreeName(): string | null {',
      'return currentWorktreeSession.enteredExisting',
      '? null',
      ': currentWorktreeSession.worktreeName',
      'setCurrentWorktreeSessionValue(session)',
      'clearResumeWorktreeName()',
    ]) {
      assert.ok(worktree.includes(fragment), `worktree: ${fragment}`)
    }
    assert.doesNotMatch(
      worktree,
      /if \(session\)\s+resumeWorktreeName = session\.worktreeName/,
    )
    const stateHelpers = worktree.slice(
      worktree.indexOf('function setCurrentWorktreeSessionValue('),
      worktree.indexOf('/**\n * Restore the worktree session'),
    )
    assert.match(
      stateHelpers,
      /if \(session && !session\.enteredExisting\) \{\s*resumeWorktreeName = session\.worktreeName\s*\}/,
    )
    assert.match(
      stateHelpers,
      /if \(currentWorktreeSession\) \{\s*return currentWorktreeSession\.enteredExisting\s*\? null\s*: currentWorktreeSession\.worktreeName\s*\}\s*return resumeWorktreeName/,
    )
    const cleanup = worktree.slice(
      worktree.indexOf('export async function cleanupWorktree'),
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
  },
)
