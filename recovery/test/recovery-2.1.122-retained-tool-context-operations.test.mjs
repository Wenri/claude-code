import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = {
  baseline: {
    names: ['CLAUDE_CODE_2_1_121_BUNDLE', 'CLAUDE_2_1_121_CLI_INNER'],
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  target: {
    names: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
}

function loadBundle({ names, bytes, sha256 }) {
  const filename = names.map(name => process.env[name]).find(Boolean)
  assert.ok(filename, `${names.join(' or ')} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, bytes)
  assert.equal(crypto.createHash('sha256').update(value).digest('hex'), sha256)
  return value.toString('utf8')
}

function count(value, needle) {
  let result = 0
  let offset = 0
  while ((offset = value.indexOf(needle, offset)) !== -1) {
    result++
    offset += needle.length
  }
  return result
}

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(filename)
    return /\.(?:ts|tsx)$/.test(entry.name) ? [filename] : []
  })
}

test('authenticated adjacent releases retain the complete ToolUseContext facade', () => {
  const expectedCounts = {
    sessionHooksRegistry: 11,
    setWebBrowserSlice: 8,
    setComputerUseMcpState: 10,
    getFileHistoryState: 13,
    applyFileHistoryOp: 13,
    applyAttributionOp: 13,
  }

  for (const [releaseName, release] of Object.entries(releases)) {
    const bundle = loadBundle(release)
    for (const [property, expected] of Object.entries(expectedCounts)) {
      assert.equal(
        count(bundle, property),
        expected,
        `${releaseName}: ${property} cardinality`,
      )
    }
    assert.equal(count(bundle, 'updateFileHistoryState'), 0)
    assert.equal(count(bundle, 'updateAttributionState'), 0)
    assert.equal(count(bundle, 'case"track":try{'), 1)
    assert.equal(count(bundle, 'case"snapshot":try{'), 1)
    assert.equal(count(bundle, 'case"trackEdit":return'), 1)
    assert.equal(count(bundle, 'case"trackBulk":return'), 1)
    assert.equal(count(bundle, 'case"commitBoundary":return'), 1)
  }
})

test('source exposes operation reducers and propagates the facade through every context', () => {
  const tool = source('src/Tool.ts')
  for (const property of [
    'sessionHooksRegistry',
    'setWebBrowserSlice',
    'setComputerUseMcpState',
    'getFileHistoryState',
    'applyFileHistoryOp',
    'applyAttributionOp',
  ]) {
    assert.match(tool, new RegExp(`\\b${property}\\b`))
  }

  const allSource = sourceFiles(path.join(repo, 'src'))
    .map(filename => fs.readFileSync(filename, 'utf8'))
    .join('\n')
  assert.doesNotMatch(allSource, /\bupdateFileHistoryState\b/)
  assert.doesNotMatch(allSource, /\bupdateAttributionState\b/)

  const fileHistory = source('src/utils/fileHistory.ts')
  assert.match(fileHistory, /kind: 'track'/)
  assert.match(fileHistory, /kind: 'snapshot'/)
  assert.match(fileHistory, /export function applyFileHistoryOp/)
  assert.match(
    fileHistory,
    /fileHistoryTrackEdit\(\s*getFileHistoryState:[\s\S]*dispatchFileHistoryOp:/,
  )
  assert.match(
    fileHistory,
    /dispatchFileHistoryOp\(\{\s*kind: 'track'/,
  )
  assert.match(
    fileHistory,
    /dispatchFileHistoryOp\(\{\s*kind: 'snapshot'/,
  )

  const attribution = source('src/utils/commitAttribution.ts')
  for (const kind of ['trackEdit', 'trackBulk', 'commitBoundary']) {
    assert.match(attribution, new RegExp(`kind: '${kind}'`))
  }
  assert.match(attribution, /export function applyAttributionOp/)

  for (const filename of [
    'src/screens/REPL.tsx',
    'src/QueryEngine.ts',
    'src/utils/forkedAgent.ts',
    'src/utils/queryContext.ts',
    'src/utils/agenticSessionSearch.ts',
    'src/entrypoints/mcp.ts',
  ]) {
    const value = source(filename)
    for (const property of [
      'sessionHooksRegistry',
      'setWebBrowserSlice',
      'getFileHistoryState',
      'applyFileHistoryOp',
      'applyAttributionOp',
    ]) {
      assert.match(value, new RegExp(`\\b${property}\\b`), `${filename}: ${property}`)
    }
  }
})

test('active hook, file checkpoint, attribution, and computer-use consumers use the facade', () => {
  const sessionHooks = source('src/utils/hooks/sessionHooks.ts')
  for (const method of ['add', 'addFunction', 'remove', 'removeFunction', 'clear']) {
    assert.match(sessionHooks, new RegExp(`\\b${method}\\(`))
  }
  const runAgent = source('src/tools/AgentTool/runAgent.ts')
  assert.match(runAgent, /toolUseContext\.sessionHooksRegistry/)
  assert.match(runAgent, /sessionHooksRegistry\.clear\(agentId\)/)

  for (const filename of [
    'src/tools/FileWriteTool/FileWriteTool.ts',
    'src/tools/FileEditTool/FileEditTool.ts',
    'src/tools/NotebookEditTool/NotebookEditTool.ts',
    'src/tools/BashTool/BashTool.tsx',
  ]) {
    const value = source(filename)
    assert.match(value, /\bgetFileHistoryState\b/, filename)
    assert.match(value, /\bapplyFileHistoryOp\b/, filename)
  }
  const hooks = source('src/utils/hooks.ts')
  assert.match(hooks, /applyAttributionOp: toolUseContext\.applyAttributionOp/)

  const computerUse = source('src/utils/computerUse/wrapper.tsx')
  assert.match(computerUse, /setComputerUseMcpState\?\./)
  assert.doesNotMatch(computerUse, /tuc\(\)\.setAppState/)
  assert.match(
    source('src/utils/computerUse/cleanup.ts'),
    /ctx\.setComputerUseMcpState\?\./,
  )
})
