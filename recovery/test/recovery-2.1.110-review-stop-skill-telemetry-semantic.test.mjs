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
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
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
  [15448, [11111083, 11111456, 'FunctionDeclaration', '22b09a8803db93ee105e912fac2f5811ce238bf3ae831d3b9574e70d00632eee', 'unresolved']],
  [15449, [11111456, 11112224, 'FunctionDeclaration', 'fd48e81bbbfa20e70a03d684d04a09b0c7bd425a6c6b169755e883f85986e8d2', 'unresolved']],
  [15583, [11182007, 11191505, 'FunctionDeclaration', 'fcdb6d1be951b20c0c0f29274f2bdaa31223e06c990c7dd811e1fffb4b668dcb', 'unresolved']],
  [19119, [13276586, 13276837, 'FunctionDeclaration', 'e3706921851d563b465f40638de83e1b9c0005a9f75d03bf4add9855c425b25d', 'unresolved']],
])

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const source = relative =>
  fs.readFileSync(path.join(sourceRoot, relative), 'utf8')

test(
  'target110 pins the Ultrareview stop, remote-policy, task-dialog, and skill telemetry units',
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
    for (const [index, [start, end, nodeType, hash, classification]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, classification, `${index}: class`)
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        [start, end, nodeType, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }

    assert.equal(baseline.includes('tengu_review_remote_stopped'), false)
    assert.equal(baseline.includes('Ultrareview stopped.'), false)
    assert.match(
      target.slice(11111083, 11111456),
      /kill\(q,_,z\).*tengu_review_remote_stopped.*Ultrareview stopped\..*isMeta:!0/s,
    )
    assert.match(
      target.slice(11111456, 11112224),
      /allow_remote_sessions.*tengu_ultraplan_create_failed.*policy_blocked/s,
    )
    assert.match(
      target.slice(11182007, 11191505),
      /isRemoteReview.*hw7\([^)]*,[^)]*,[^)]*,[^)]*\)/s,
    )
    assert.match(
      target.slice(13276586, 13276837),
      /source==="builtin".*tengu_skill_loaded/s,
    )
  },
)

test(
  'authored owners preserve the reachable stop and telemetry behavior',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const ultraplan = source('commands/ultraplan.tsx')
    const tasks = source('components/tasks/BackgroundTasksDialog.tsx')
    const telemetry = source('utils/telemetry/skillLoadedEvent.ts')

    for (const fragment of [
      "if (!isPolicyAllowed('allow_remote_sessions'))",
      "reason: 'policy_blocked'",
      'export async function stopUltrareview(',
      'RemoteAgentTask.kill(taskId, taskRegistry, setAppState)',
      "logEvent('tengu_review_remote_stopped', {})",
      'Ultrareview stopped.\\n\\nSession: ${url}',
      'The user stopped the ultrareview session above.',
    ]) {
      assert.ok(ultraplan.includes(fragment), fragment)
    }
    for (const fragment of [
      'currentSelection_0.task.isRemoteReview',
      'stopUltrareview(currentSelection_0.id, currentSelection_0.task.sessionId, toolUseContext.taskRegistry, setAppState)',
      'RemoteAgentTask.kill(taskId_3, toolUseContext.taskRegistry, setAppState)',
      'task_0.isRemoteReview',
      'stopUltrareview(task_0.id, task_0.sessionId, toolUseContext.taskRegistry, setAppState)',
    ]) {
      assert.ok(tasks.includes(fragment), fragment)
    }
    assert.match(
      telemetry,
      /if \(skill\.type !== 'prompt'\) continue\s+if \(skill\.source === 'builtin'\) continue\s+\n?\s*logEvent\('tengu_skill_loaded'/,
    )
  },
)
