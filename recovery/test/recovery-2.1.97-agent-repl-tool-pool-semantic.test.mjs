import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.96-to-2.1.97'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_96_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const baselineSha256 =
  '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e'
const targetSha256 =
  '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988'
const baselineUnits = [
  {
    index: 11_922,
    start: 9_284_433,
    end: 9_287_093,
    sourceHash:
      'e3e72cc5036f0482355812d607b75f70c81c963ea9fca3a7fe097b6c091c1f89',
  },
  {
    index: 11_946,
    start: 9_299_381,
    end: 9_299_510,
    sourceHash:
      'cf6490424bbe5fd3ca638a6e0583b4fa8bf8dcd6ebcb24a22b6b6e62151bc93b',
  },
  {
    index: 11_947,
    start: 9_299_510,
    end: 9_300_189,
    sourceHash:
      'f9b194266afc16f355dfa5eb43c007c1a6c42e78ed060d19849a3e9ec1cb3e4e',
  },
  {
    index: 11_979,
    start: 9_329_290,
    end: 9_346_609,
    sourceHash:
      '1c9e58c9f89a6bdf1f5032f2f5e0c80280acaec4352424f686387c2708ab9f39',
  },
]
const targetUnits = [
  {
    index: 11_761,
    start: 9_001_249,
    end: 9_018_590,
    sourceHash:
      '5a97ca64d5e642b4110be0554c1a6bf7a509980696d2d0db3179cc32701b0ef1',
  },
  {
    index: 12_231,
    start: 9_447_854,
    end: 9_450_518,
    sourceHash:
      '8ba5613e752255d9c6822172f813616d6241e22ef37cfd89fe871ba1b4846a9c',
  },
  {
    index: 12_255,
    start: 9_462_806,
    end: 9_462_939,
    sourceHash:
      'a95d0c1d23316c8098f24a45c89a2c7bf8b786a880b224763772ac08dd321a8a',
  },
  {
    index: 12_256,
    start: 9_462_939,
    end: 9_463_666,
    sourceHash:
      'd04625ef229a78b1d8d13a174397ad15d59ecca67f29d6a2486659906d835714',
  },
]
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

const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_96_BUNDLE and CLAUDE_CODE_2_1_97_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
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
  const loaded = await import(pathToFileURL(candidate).href)
  return loaded.default ?? loaded
}

test('2.1.97 authenticates the two worker callers and option-aware tool-pool functions', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(baselineBytes), baselineSha256)
  assert.equal(sha256(targetBytes), targetSha256)
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  for (const unit of baselineUnits) {
    const region = structural.unmatchedBaseline.find(
      candidate => candidate.index === unit.index,
    )
    assert.ok(region, `baseline unit ${unit.index}`)
    assert.deepEqual(
      [region.start, region.end, region.sourceHash],
      [unit.start, unit.end, unit.sourceHash],
    )
    assert.equal(
      sha256(baseline.slice(unit.start, unit.end)),
      unit.sourceHash,
    )
  }
  for (const unit of targetUnits) {
    const region = structural.regions[unit.index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [unit.start, unit.end, unit.sourceHash],
    )
    assert.equal(sha256(target.slice(unit.start, unit.end)), unit.sourceHash)
  }

  assert.equal((baseline.match(/skipReplFilter/g) ?? []).length, 0)
  assert.equal((target.match(/skipReplFilter/g) ?? []).length, 4)
  for (const unit of targetUnits.slice(0, 2)) {
    assert.match(
      target.slice(unit.start, unit.end),
      /\{skipReplFilter:!0\}/,
      `worker caller ${unit.index}`,
    )
  }
  assert.match(
    target.slice(targetUnits[2].start, targetUnits[2].end),
    /function \w+\(\w+,\w+,\w+\)\{let \w+=\w+\(\w+,\w+\)/,
  )
  const getTools = target.slice(targetUnits[3].start, targetUnits[3].end)
  assert.equal((getTools.match(/!\w+\?\.skipReplFilter/g) ?? []).length, 2)
})

test('source threads skipReplFilter only through independent worker pools', sourceOptions, () => {
  const tools = source('tools.ts')
  const agent = source('tools/AgentTool/AgentTool.tsx')
  const resume = source('tools/AgentTool/resumeAgent.ts')

  for (const fragment of [
    'skipReplFilter?: boolean',
    'options?: ToolPoolOptions',
    'isReplModeEnabled() && !options?.skipReplFilter && REPLTool',
    'isReplModeEnabled() && !options?.skipReplFilter',
    'getTools(permissionContext, options)',
  ]) {
    assert.ok(tools.includes(fragment), fragment)
  }
  assert.equal(
    tools.split('!options?.skipReplFilter').length - 1,
    2,
    'both simple and normal REPL filters are bypassable',
  )
  for (const [relative, text] of [
    ['AgentTool.tsx', agent],
    ['resumeAgent.ts', resume],
  ]) {
    assert.match(
      text,
      /assembleToolPool\([\s\S]{0,180}\{\s*skipReplFilter:\s*true[,\s}]/,
      relative,
    )
  }
})

test('the actual getTools and assembleToolPool bodies preserve primitives for workers', sourceOptions, async () => {
  const ts = await loadTypeScript()
  const text = source('tools.ts')
  const ast = ts.createSourceFile(
    'tools.ts',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const getToolsStatement = ast.statements.find(
    statement =>
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        declaration => declaration.name.getText(ast) === 'getTools',
      ),
  )
  const assembleStatement = ast.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'assembleToolPool',
  )
  assert.ok(getToolsStatement, 'getTools declaration')
  assert.ok(assembleStatement, 'assembleToolPool declaration')

  const isolated = `
    type Tool = any
    type Tools = any[]
    type ToolPermissionContext = any
    type ToolPoolOptions = { skipReplFilter?: boolean }
    ${getToolsStatement.getText(ast).replace(/^export\s+/, '')}
    ${assembleStatement.getText(ast).replace(/^export\s+/, '')}
  `
  const javascript = ts.transpileModule(isolated, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText

  const primitive = name => ({ name, isEnabled: () => true })
  const BashTool = primitive('Bash')
  const FileReadTool = primitive('Read')
  const FileEditTool = primitive('Edit')
  const REPLTool = primitive('REPL')
  const mcpTool = primitive('mcp__server__tool')
  const dependencies = {
    process: { env: {} },
    isEnvTruthy: () => false,
    isReplModeEnabled: () => true,
    REPLTool,
    feature: () => false,
    coordinatorModeModule: undefined,
    TaskStopTool: primitive('TaskStop'),
    getSendMessageTool: () => primitive('SendMessage'),
    BashTool,
    FileReadTool,
    FileEditTool,
    filterToolsByDenyRules: tools => [...tools],
    getAllBaseTools: () => [BashTool, FileReadTool, FileEditTool, REPLTool],
    ListMcpResourcesTool: primitive('ListMcpResources'),
    ReadMcpResourceTool: primitive('ReadMcpResource'),
    SYNTHETIC_OUTPUT_TOOL_NAME: 'SyntheticOutput',
    toolMatchesName: (tool, name) => tool.name === name,
    REPL_TOOL_NAME: 'REPL',
    REPL_ONLY_TOOLS: new Set(['Bash', 'Read', 'Edit']),
    uniqBy: (items, key) => [
      ...new Map(items.map(item => [item[key], item])).values(),
    ],
  }
  const names = Object.keys(dependencies)
  const factory = new Function(
    ...names,
    `${javascript}; return { getTools, assembleToolPool }`,
  )
  const runtime = factory(...names.map(name => dependencies[name]))
  const permissionContext = {}

  assert.deepEqual(
    runtime.getTools(permissionContext).map(tool => tool.name),
    ['REPL'],
    'the main REPL pool hides primitive tools',
  )
  assert.deepEqual(
    runtime.getTools(permissionContext, { skipReplFilter: true }).map(
      tool => tool.name,
    ),
    ['Bash', 'Read', 'Edit', 'REPL'],
    'an independent worker keeps the ordinary primitive tools',
  )
  assert.deepEqual(
    runtime
      .assembleToolPool(permissionContext, [mcpTool], {
        skipReplFilter: true,
      })
      .map(tool => tool.name),
    ['Bash', 'Edit', 'Read', 'REPL', 'mcp__server__tool'],
    'the option reaches getTools while MCP assembly remains intact',
  )
})
