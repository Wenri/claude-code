import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
      : false,
}

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
    6446,
    [
      2969027,
      2969198,
      'FunctionDeclaration',
      '125ddeaf04bda2d65e128861bd23c546197798484dcf0e1a6c6b2b8f8a554baf',
    ],
  ],
  [
    13604,
    [
      8589712,
      8603636,
      'FunctionDeclaration',
      'd1efb963531943feeab5ff1521cdfa20debc75304a810573537027233ff6fcdb',
    ],
  ],
])

const subagentLiteral = ['"subagent_type"', 2969113, 2969128]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function extractFunction(contents, marker) {
  const start = contents.indexOf(marker)
  assert.notEqual(start, -1, marker)
  const bodyStart = contents.indexOf('{', start)
  assert.notEqual(bodyStart, -1, `${marker} body`)
  let depth = 0
  for (let index = bodyStart; index < contents.length; index += 1) {
    if (contents[index] === '{') depth += 1
    if (contents[index] === '}') {
      depth -= 1
      if (depth === 0) return contents.slice(start, index + 1)
    }
  }
  assert.fail(`unterminated function: ${marker}`)
}

function extractBetween(contents, startMarker, endMarker) {
  const start = contents.indexOf(startMarker)
  assert.notEqual(start, -1, startMarker)
  const end = contents.indexOf(endMarker, start)
  assert.notEqual(end, -1, endMarker)
  return contents.slice(start, end)
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

async function compileCommonJs(contents) {
  const ts = await loadTypeScript()
  return ts.transpileModule(contents, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
}

function executeCommonJs(javascript) {
  const module = { exports: {} }
  new Function('exports', 'module', javascript)(module.exports, module)
  return module.exports
}

test(
  'authenticated target116 adds privacy-gated Skill and subagent telemetry',
  bundleOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
    )
    assert.equal(
      sha256(targetBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )

    for (const [index, identity] of targetUnits) {
      const region = structural.regions[index]
      assert.notEqual(region.classification, 'matched')
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        identity,
      )
      assert.equal(
        sha256(targetBytes.subarray(identity[0], identity[1])),
        identity[3],
      )
    }

    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    assert.equal(baseline.split(subagentLiteral[0]).length - 1, 0)
    assert.equal(
      target.slice(subagentLiteral[1], subagentLiteral[2]),
      subagentLiteral[0],
    )

    const helper = target.slice(2969027, 2969198)
    const caller = target.slice(8589712, 8603636)
    const helperName = /^function ([A-Za-z_$][\w$]*)\(/.exec(helper)?.[1]
    assert.ok(helperName)
    for (const fragment of [
      '!=="Agent"',
      '!=="Task"',
      '"subagent_type"in',
      '.subagent_type==="string"',
      'return $.subagent_type',
    ]) {
      assert.ok(helper.includes(fragment), fragment)
    }
    assert.equal(caller.split(`${helperName}(`).length - 1, 2)
    assert.match(
      caller,
      /"file_path"in [A-Za-z_$][\w$]*&&[A-Za-z_$][\w$]*\(\)\)/,
    )
    assert.match(
      caller,
      /"command"in [A-Za-z_$][\w$]*&&[A-Za-z_$][\w$]*\(\)\)/,
    )
    assert.ok(caller.includes('.skill_name='))
    assert.equal(caller.split('.subagent_type=').length - 1, 2)
  },
)

test('source owns the exact gated telemetry edges', sourceOptions, () => {
  const metadata = source('services/analytics/metadata.ts')
  const execution = source('services/tools/toolExecution.ts')
  for (const fragment of [
    'export function extractSubagentType(',
    "toolName !== 'Agent' && toolName !== 'Task'",
    "'subagent_type' in input",
    "typeof (input as { subagent_type: unknown }).subagent_type === 'string'",
  ]) {
    assert.ok(metadata.includes(fragment), fragment)
  }
  assert.ok(execution.includes('extractSubagentType,'))
  for (const fragment of [
    "'file_path' in processedInput &&\n      isToolDetailsLoggingEnabled()",
    "'command' in processedInput &&\n      isToolDetailsLoggingEnabled()",
    'const skillName = extractSkillName(tool.name, processedInput)',
    'const subagentType = extractSubagentType(tool.name, processedInput)',
    'toolAttributes.subagent_type = subagentType',
    'toolParameters.subagent_type = subagentType',
  ]) {
    assert.ok(execution.includes(fragment), fragment)
  }
})

test('actual source helpers enforce opt-in and strict subtype extraction', sourceOptions, async () => {
  const metadata = source('services/analytics/metadata.ts')
  const execution = source('services/tools/toolExecution.ts')
  const skillHelper = extractFunction(metadata, 'export function extractSkillName')
  const subagentHelper = extractFunction(
    metadata,
    'export function extractSubagentType',
  )
  const attributes = extractBetween(
    execution,
    '  const toolAttributes: Record<string, string | number | boolean> = {}',
    '\n  startToolSpan(',
  )
  const parameters = extractBetween(
    execution,
    '  let toolParameters: Record<string, unknown> = {}',
    '\n  const decisionInfo',
  )

  const javascript = await compileCommonJs(`
    type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS = string
    ${skillHelper}
    ${subagentHelper}

    export function buildAttributes(
      toolName: string,
      processedInput: Record<string, unknown> | null,
      enabled: boolean,
    ) {
      const tool = { name: toolName }
      const FILE_READ_TOOL_NAME = 'Read'
      const FILE_EDIT_TOOL_NAME = 'Edit'
      const FILE_WRITE_TOOL_NAME = 'Write'
      const BASH_TOOL_NAME = 'Bash'
      type BashToolInput = { command: string }
      const isToolDetailsLoggingEnabled = () => enabled
      ${attributes}
      return toolAttributes
    }

    export function buildParameters(
      toolName: string,
      processedInput: Record<string, unknown>,
      enabled: boolean,
    ) {
      const tool = { name: toolName }
      const BASH_TOOL_NAME = 'Bash'
      type BashToolInput = {
        command: string
        timeout?: number
        description?: string
        dangerouslyDisableSandbox?: boolean
      }
      const isToolDetailsLoggingEnabled = () => enabled
      const extractMcpToolDetails = () => undefined
      ${parameters}
      return toolParameters
    }
  `)
  const { buildAttributes, buildParameters, extractSubagentType } =
    executeCommonJs(javascript)

  assert.equal(extractSubagentType('Agent', { subagent_type: 'Explore' }), 'Explore')
  assert.equal(extractSubagentType('Task', { subagent_type: 'Plan' }), 'Plan')
  assert.equal(extractSubagentType('Skill', { subagent_type: 'Explore' }), undefined)
  assert.equal(extractSubagentType('Agent', { subagent_type: 7 }), undefined)
  assert.equal(extractSubagentType('Agent', null), undefined)

  assert.deepEqual(buildAttributes('Read', { file_path: '/private/a' }, false), {})
  assert.deepEqual(buildAttributes('Bash', { command: 'cat secret' }, false), {})
  assert.deepEqual(buildAttributes('Agent', { subagent_type: 'Explore' }, false), {})
  assert.deepEqual(buildAttributes('Read', { file_path: '/tmp/a' }, true), {
    file_path: '/tmp/a',
  })
  assert.deepEqual(buildAttributes('Bash', { command: 'pwd' }, true), {
    full_command: 'pwd',
  })
  assert.deepEqual(buildAttributes('Skill', { skill: 'pdf' }, true), {
    skill_name: 'pdf',
  })
  assert.deepEqual(buildAttributes('Agent', { subagent_type: 'Explore' }, true), {
    subagent_type: 'Explore',
  })

  assert.deepEqual(buildParameters('Agent', { subagent_type: 'Explore' }, false), {})
  assert.deepEqual(buildParameters('Agent', { subagent_type: 'Explore' }, true), {
    subagent_type: 'Explore',
  })
  assert.deepEqual(buildParameters('Skill', { skill: 'pdf' }, true), {
    skill_name: 'pdf',
  })
  assert.deepEqual(buildParameters('Bash', { command: 'git status' }, true), {
    bash_command: 'git',
    full_command: 'git status',
  })
})
