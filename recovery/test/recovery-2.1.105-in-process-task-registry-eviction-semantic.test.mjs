import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
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

const baselineUnit = {
  index: 11147,
  start: 8717598,
  end: 8723545,
  hash: 'af4433ba903254f733b33ec42e1a92601a0223d7363fc26957427482a96feab5',
}
const targetUnit = {
  index: 10323,
  start: 8359742,
  end: 8365912,
  hash: '8251c11f583498a1687aed61f25ef6d1ad87c4d2aca883d86815a8c44bfb28ca',
}
const latestUnit = {
  index: 13706,
  start: 8692560,
  end: 8698722,
  hash: 'da69875773dcf86e0d253287dd64a2dafb2d5976a850bb46eab4d43b5b2b4421',
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

async function loadTypeScript() {
  const candidates = [
    path.resolve(
      path.dirname(process.execPath),
      '../lib/node_modules/typescript/lib/typescript.js',
    ),
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate, 'the pinned TypeScript compiler must be available')
  const module = await import(pathToFileURL(candidate).href)
  return module.default ?? module
}

test(
  'authenticated target105 routes in-process terminal eviction through TaskRegistry',
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
        'FunctionDeclaration',
        targetUnit.hash,
      ],
    )

    const baselineFunction = baseline.slice(
      baselineUnit.start,
      baselineUnit.end,
    )
    const targetFunction = target.slice(targetUnit.start, targetUnit.end)
    const latestFunction = latest.slice(latestUnit.start, latestUnit.end)
    assert.equal(sha256(baselineFunction), baselineUnit.hash)
    assert.equal(sha256(targetFunction), targetUnit.hash)
    assert.equal(sha256(latestFunction), latestUnit.hash)
    assert.equal(occurrences(baselineFunction, '.evictTerminal('), 0)
    assert.equal(occurrences(targetFunction, '.evictTerminal('), 2)
    assert.equal(occurrences(latestFunction, '.evictTerminal('), 2)
    assert.match(targetFunction, /\{setAppState:[^,}]+,taskRegistry:[^,}]+\}=/)
    assert.match(latestFunction, /\{setAppState:[^,}]+,taskRegistry:[^,}]+\}=/)
  },
)

test(
  'source in-process runner preserves per-session and no-op registry behavior',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const ownerPath = path.join(sourceRoot, 'utils/swarm/inProcessRunner.ts')
    const owner = fs.readFileSync(ownerPath, 'utf8')
    const ts = await loadTypeScript()
    const parsed = ts.createSourceFile(
      ownerPath,
      owner,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    const declaration = parsed.statements.find(
      node =>
        ts.isFunctionDeclaration(node) &&
        node.name?.text === 'runInProcessTeammate',
    )
    assert.ok(declaration, 'runInProcessTeammate must exist')
    const body = declaration.getText(parsed)
    assert.match(body, /const\s*\{\s*setAppState,\s*taskRegistry\s*\}\s*=\s*toolUseContext/)
    assert.equal(occurrences(body, 'taskRegistry.evictTerminal(taskId)'), 2)
    assert.equal(occurrences(body, 'evictTerminalTask('), 0)
    assert.equal(
      occurrences(owner, "import { evictTerminalTask } from '../../utils/task/framework.js'"),
      0,
    )

    const calls = []
    const taskRegistry = { evictTerminal: taskId => calls.push(taskId) }
    taskRegistry.evictTerminal('completed-task')
    taskRegistry.evictTerminal('failed-task')
    assert.deepEqual(calls, ['completed-task', 'failed-task'])
  },
)
