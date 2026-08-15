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
const baselinePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
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

const oldPrompt =
  'The user stepped away and is coming back. Under 40 words, 1-2 plain sentences — no markdown. Name the task, then the one next action. They remember the session — skip root-cause narrative, fix internals, secondary to-dos, and em-dash tangents.'
const prompt =
  'The user stepped away and is coming back. Recap in under 40 words, 1-2 plain sentences, no markdown. Lead with the overall goal and current task, then the one next action. Skip root-cause narrative, fix internals, secondary to-dos, and em-dash tangents.'

const baselineUnit = {
  index: 17946,
  start: 12546671,
  end: 12546925,
  hash: 'a99c9a9075f725546bd665378a619e8cea98d2add39cc53a43e4cea4541ac3cd',
}
const targetUnit = {
  index: 8752,
  start: 5938944,
  end: 5939208,
  hash: '38cd16fe08101505f059023042d442553bc03dbac1c2211afe87d8a9d080219f',
}
const latestUnit = {
  index: 10806,
  start: 6295899,
  end: 6296163,
  hash: '02f893f46043c2b4d6fa5841f33a3810c49a3bc8c233fd524454649e74ed1aad',
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

test(
  'authenticated target105 sharpens the away-summary recap prompt',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath || !latestPath
        ? 'authenticated 2.1.104, 2.1.105, and 2.1.116 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(baselineBytes),
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    )
    assert.equal(
      sha256(targetBytes),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )

    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const latest = latestBytes.toString('utf8')
    const region = structural.regions[targetUnit.index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [
        region.target.index,
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.sourceHash,
      ],
      [
        targetUnit.index,
        targetUnit.start,
        targetUnit.end,
        'VariableDeclaration',
        targetUnit.hash,
      ],
    )

    const baselineDeclaration = baseline.slice(
      baselineUnit.start,
      baselineUnit.end,
    )
    const targetDeclaration = target.slice(targetUnit.start, targetUnit.end)
    const latestDeclaration = latest.slice(latestUnit.start, latestUnit.end)
    assert.equal(sha256(baselineDeclaration), baselineUnit.hash)
    assert.equal(sha256(targetDeclaration), targetUnit.hash)
    assert.equal(sha256(latestDeclaration), latestUnit.hash)
    assert.equal(occurrences(baselineDeclaration, oldPrompt), 1)
    assert.equal(occurrences(baselineDeclaration, prompt), 0)
    assert.equal(occurrences(targetDeclaration, prompt), 1)
    assert.equal(occurrences(latestDeclaration, prompt), 1)
  },
)

test(
  'source root owns the exact stable under-40-word recap instruction',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const owner = fs.readFileSync(
      path.join(sourceRoot, 'services/awaySummary.ts'),
      'utf8',
    )
    assert.equal(occurrences(owner, prompt), 1)
    assert.equal(occurrences(owner, 'Write exactly 1-3 short sentences'), 0)
    assert.equal(occurrences(owner, oldPrompt), 0)
    assert.ok(prompt.length < 300)
    assert.match(prompt, /Recap in under 40 words, 1-2 plain sentences/)
    assert.match(prompt, /Lead with the overall goal and current task/)
    assert.match(prompt, /then the one next action/)
  },
)
