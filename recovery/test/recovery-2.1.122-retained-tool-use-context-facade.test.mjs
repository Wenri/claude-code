import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

const repo = process.env.CLAUDE_CODE_RECOVERY_REPO ?? process.cwd()
const baselineBundle = process.env.CLAUDE_CODE_2_1_121_BUNDLE
const targetBundle = process.env.CLAUDE_CODE_2_1_122_BUNDLE

const expectedHashes = new Map([
  [
    baselineBundle,
    '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  ],
  [
    targetBundle,
    'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  ],
])

async function source(path) {
  return readFile(join(repo, path), 'utf8')
}

test('authenticates the retained ToolUseContext facade in both bundles', async () => {
  assert.ok(baselineBundle, 'CLAUDE_CODE_2_1_121_BUNDLE must be set')
  assert.ok(targetBundle, 'CLAUDE_CODE_2_1_122_BUNDLE must be set')

  for (const path of [baselineBundle, targetBundle]) {
    const bytes = await readFile(path)
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      expectedHashes.get(path),
    )
    const bundle = bytes.toString('utf8')
    for (const [name, count] of [
      ['getEffortValue', 18],
      ['getAutoCompactWindow', 9],
      ['getFastMode', 11],
      ['getCacheBreakerPhrase', 10],
      ['setToolPermissionContext', 23],
    ]) {
      assert.equal(bundle.split(name).length - 1, count, `${name} count`)
    }
    assert.match(
      bundle,
      /getEffortValue:\(\)=>[^,]+\.effortValue,getAutoCompactWindow:\(\)=>[^,]+\.autoCompactWindow,getFastMode:\(\)=>[^,]+\.fastMode,getCacheBreakerPhrase:\(\)=>[^,]+\.cacheBreakerPhrase/,
    )
    assert.match(
      bundle,
      /getEffortValue:\$\?\.getEffortValue\?\?[^,]+\.getEffortValue,[\s\S]{0,220}setToolPermissionContext:\$\?\.shareSetAppState\?[^,]+\.setToolPermissionContext:\(\)=>\{\},getAutoCompactWindow:/,
    )
    assert.match(bundle, /effortValue:[^,]+\.getEffortValue\(\)/)
    assert.match(bundle, /getAutoCompactWindow\(\)/)
    assert.match(bundle, /fastMode:[^,]+\.getFastMode\(\)/)
  }
})

test('wires facade constructors, subagent propagation, and active callers', async () => {
  const [
    tool,
    repl,
    engine,
    queryContext,
    search,
    mcp,
    forked,
    runAgent,
    query,
    execAgentHook,
  ] = await Promise.all([
    source('src/Tool.ts'),
    source('src/screens/REPL.tsx'),
    source('src/QueryEngine.ts'),
    source('src/utils/queryContext.ts'),
    source('src/utils/agenticSessionSearch.ts'),
    source('src/entrypoints/mcp.ts'),
    source('src/utils/forkedAgent.ts'),
    source('src/tools/AgentTool/runAgent.ts'),
    source('src/query.ts'),
    source('src/utils/hooks/execAgentHook.ts'),
  ])

  for (const name of [
    'getEffortValue',
    'getAutoCompactWindow',
    'getFastMode',
    'getCacheBreakerPhrase',
    'setToolPermissionContext',
  ]) {
    assert.match(tool, new RegExp(`\\b${name}\\b`))
    assert.match(repl, new RegExp(`\\b${name}\\b`))
    assert.match(engine, new RegExp(`\\b${name}\\b`))
    assert.match(queryContext, new RegExp(`\\b${name}\\b`))
    assert.match(search, new RegExp(`\\b${name}\\b`))
    assert.match(mcp, new RegExp(`\\b${name}\\b`))
  }

  assert.match(
    forked,
    /getToolPermissionContext:[\s\S]*?getEffortValue:[\s\S]*?getAutoCompactWindow:[\s\S]*?getFastMode:[\s\S]*?getCacheBreakerPhrase:[\s\S]*?setToolPermissionContext:/,
  )
  assert.match(
    forked,
    /overrides\?\.getEffortValue \?\? parentContext\.getEffortValue/,
  )
  assert.match(
    runAgent,
    /getSystemContext\(toolUseContext\.getAppState\(\)\.cacheBreakerPhrase\)/,
  )
  assert.match(runAgent, /getEffortValue: agentGetEffortValue/)
  assert.match(
    runAgent,
    /parentContext === lastParentPermissionContext[\s\S]*?lastAgentPermissionContext/,
  )
  assert.match(
    execAgentHook,
    /getToolPermissionContext\(\)[\s\S]*?mode: 'dontAsk'/,
  )
  assert.match(query, /toolUseContext\.getAutoCompactWindow\(\)/)
  assert.match(query, /fastMode: toolUseContext\.getFastMode\(\)/)
  assert.match(query, /effortValue: toolUseContext\.getEffortValue\(\)/)
})

test('routes retained permission mutations through the context setter', async () => {
  const files = await Promise.all(
    [
      'src/commands/add-dir/add-dir.tsx',
      'src/utils/queryHelpers.ts',
      'src/commands/login/login.tsx',
      'src/tools/EnterPlanModeTool/EnterPlanModeTool.ts',
      'src/tools/ExitPlanModeTool/ExitPlanModeV2Tool.ts',
      'src/utils/permissions/permissions.ts',
      'src/utils/permissions/PermissionPromptToolResultSchema.ts',
      'src/cli/structuredIO.ts',
    ].map(source),
  )
  for (const file of files) {
    assert.match(file, /\.setToolPermissionContext\b/)
  }

  const appState = await source('src/state/AppStateStore.ts')
  const clear = await source('src/commands/clear/conversation.ts')
  const context = await source('src/context.ts')
  assert.match(appState, /cacheBreakerPhrase\?: string/)
  assert.match(clear, /cacheBreakerPhrase: undefined/)
  assert.match(context, /getSystemContext = memoize\([\s\S]*?cacheBreakerPhrase\?: string/)
})
