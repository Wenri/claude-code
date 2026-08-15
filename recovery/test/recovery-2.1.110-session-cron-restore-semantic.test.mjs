import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? path.join(root, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_109_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(root, 'recovery/cases', caseName, 'structural/generated-delta.json.gz'),
    ),
  ),
)
const units = new Map([
  [18318, [12493056, 12493665, 'FunctionDeclaration', '665e773bb5de6e9f1dce8eacaf26e0edb1018005dada8a68ffd153753ed18c9a']],
  [18319, [12493665, 12494323, 'FunctionDeclaration', '9ec2aa5ee0b15d4589300e45fce9a2017d5a57da22b34a369d334391c409b0a9']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test(
  'target110 pins transcript extraction and session-cron resurrection units',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated target109 and target110 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(sha256(baselineBytes), '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7')
    assert.equal(sha256(targetBytes), 'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861')
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    for (const [index, [start, end, nodeType, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.nodeType, region.target.sourceHash],
        [start, end, nodeType, hash],
        `${index}: structural identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: target bytes`)
    }
    assert.equal(baseline.includes('resume: resurrected '), false)
    assert.equal(target.includes('resume: resurrected '), true)
    assert.match(target.slice(12493056, 12493665), /deletedCronIds/)
    assert.match(target.slice(12493665, 12494323), /recurringMaxAgeMs/)
  },
)

test(
  'source restores only valid live session cron tasks at every resume entrypoint',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const owner = source('utils/sessionCronTasks.ts')
    for (const fragment of [
      'extractResumedCronState',
      'CRON_CREATE_TOOL_NAME',
      'CRON_DELETE_TOOL_NAME',
      'deletedCronIds',
      'result.durable === true',
      'jitterConfig.recurringMaxAgeMs !== 0',
      'oneShotJitteredNextCronRunMs',
      'setScheduledTasksEnabled(true)',
      'resume: resurrected ${resurrected} session cron task(s)',
      'resurrectSessionCronTasks(extractResumedCronState(messages))',
    ]) assert.ok(owner.includes(fragment), fragment)
    for (const [relative, fragments] of [
      ['screens/REPL.tsx', ['restoreSessionCronTasks(messages)', 'restoreSessionCronTasks(initialMessages)']],
      ['cli/print.ts', ['restoreSessionCronTasks(initialMessages)']],
    ]) {
      const contents = source(relative)
      for (const fragment of fragments) assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
    }
  },
)
