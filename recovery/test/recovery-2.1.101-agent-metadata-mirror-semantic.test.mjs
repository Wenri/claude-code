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
      path.join(repositoryRoot, 'recovery/cases', caseName, 'structural/generated-delta.json.gz'),
    ),
  ),
)
const unit = [16085, 11641805, 11642110, 'd5320628dcffceb8dba949d447c0a7f468ee39bc97c09ceec9e771762a4b0532']

const sourceOptions = { skip: selected ? false : `not applicable to ${semanticCase}` }
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

test('target101 pins the agent metadata writer unit', pairOptions, () => {
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  const [index, start, end, hash] = unit
  const region = structural.regions[index]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [start, end, hash],
  )
  assert.equal(sha256(target.slice(start, end)), hash)
})

test('agent metadata mirroring enters at target101', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  for (const fragment of ['agent_metadata', '\\.meta\\.json$']) {
    assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
    assert.equal(target.includes(fragment), true, `${fragment}: target`)
  }
})

test('source mirrors sidecar metadata to the transcript identity', sourceOptions, () => {
  const source = fs.readFileSync(path.join(sourceRoot, 'utils/sessionStorage.ts'), 'utf8')
  const start = source.indexOf('export async function writeAgentMetadata(')
  const end = source.indexOf('export async function readAgentMetadata(', start)
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  const writer = source.slice(start, end)
  for (const fragment of [
    "path.replace(/\\.meta\\.json$/, '.jsonl')",
    'fireSessionMirror(transcriptPath, [',
    "type: 'agent_metadata'",
    'agentType: metadata.agentType',
    'metadata.worktreePath && { worktreePath: metadata.worktreePath }',
    'metadata.description && { description: metadata.description }',
  ]) assert.ok(writer.includes(fragment), fragment)
  assert.ok(writer.indexOf('await writeFile(') < writer.indexOf('fireSessionMirror('))
})
