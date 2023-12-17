import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.110-to-2.1.111'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_111_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath || !latestPath
      ? 'authenticated 2.1.110, 2.1.111, and 2.1.116 bundles are required'
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

const units = new Map([
  [
    12426,
    [
      9348675,
      9354933,
      'FunctionDeclaration',
      '5223b0df2afdd1b550108764734007f24e664aec91a822833e01c51b94d48b89',
    ],
  ],
  [
    18526,
    [
      12584947,
      12598327,
      'VariableDeclaration',
      '2231fe1ccb004730a57e350b3413c161637a1fe837a0374374e7cb8572730910',
    ],
  ],
  [
    19326,
    [
      13436453,
      13454014,
      'ClassDeclaration',
      'a3a2cfa3750f2808b581ec098092df9e542590c563c8c84505d95c3363c02113',
    ],
  ],
  [
    19327,
    [
      13454014,
      13455444,
      'FunctionDeclaration',
      '44c24d3acd829e733211906aa812aa9403838dbfdaa8c87b2761cb724253087d',
    ],
  ],
  [
    19361,
    [
      13466823,
      13501657,
      'FunctionDeclaration',
      '5fe376fbd219aa280fdd2a4d70572fa0d30be9ff32ca629b6ee81c0581de6175',
    ],
  ],
  [
    19366,
    [
      13503880,
      13506230,
      'FunctionDeclaration',
      '37a84075f435fbbde5837965366a02b8064c780445f49bb147652a694e7491c3',
    ],
  ],
  [
    19511,
    [
      13582359,
      13637914,
      'FunctionDeclaration',
      '2790ed0d4a6a98b5d044b23d40f0e0c902e6535bb50732916aed0c2e70c5ee48',
    ],
  ],
])

const description =
  '@internal Additional system prompt appended to every Task-tool subagent (and propagated to nested subagents). Gated by CLAUDE_CODE_ENABLE_APPEND_SUBAGENT_PROMPT.'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
}

function extract(contents, startMarker, endMarker) {
  const start = contents.indexOf(startMarker)
  assert.notEqual(start, -1, `missing section start: ${startMarker}`)
  const end = contents.indexOf(endMarker, start)
  assert.notEqual(end, -1, `missing section end: ${endMarker}`)
  return contents.slice(start, end)
}

test(
  'authenticated target111 pins the complete appendSubagentSystemPrompt propagation graph',
  bundleOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(baselineBytes),
      'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
    )
    assert.equal(
      sha256(targetBytes),
      '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0',
    )
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )

    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const latest = latestBytes.toString('utf8')
    for (const [index, [start, end, nodeType, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
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
      assert.ok(
        target.slice(start, end).includes('appendSubagentSystemPrompt'),
        `${index}: feature reachability`,
      )
    }

    assert.equal(occurrences(baseline, 'appendSubagentSystemPrompt'), 0)
    assert.equal(occurrences(target, 'appendSubagentSystemPrompt'), 16)
    assert.equal(occurrences(latest, 'appendSubagentSystemPrompt'), 16)
    assert.equal(
      occurrences(baseline, 'CLAUDE_CODE_ENABLE_APPEND_SUBAGENT_PROMPT'),
      0,
    )
    assert.equal(
      occurrences(target, 'CLAUDE_CODE_ENABLE_APPEND_SUBAGENT_PROMPT'),
      2,
    )
    assert.equal(
      occurrences(latest, 'CLAUDE_CODE_ENABLE_APPEND_SUBAGENT_PROMPT'),
      2,
    )
    assert.ok(target.includes(description))
    assert.ok(latest.includes(description))
  },
)

test(
  'source root carries the SDK value through headless setup, QueryEngine, and every nested Task agent',
  sourceOptions,
  () => {
    const tool = source('Tool.ts')
    const runAgent = source('tools/AgentTool/runAgent.ts')
    const schemas = source('entrypoints/sdk/controlSchemas.ts')
    const queryEngine = source('QueryEngine.ts')
    const print = source('cli/print.ts')
    const main = source('main.tsx')

    assert.ok(tool.includes('appendSubagentSystemPrompt?: string'))
    assert.ok(schemas.includes(description))
    assert.ok(
      runAgent.includes(
        'isEnvTruthy(process.env.CLAUDE_CODE_ENABLE_APPEND_SUBAGENT_PROMPT)',
      ),
    )
    assert.ok(runAgent.includes('!useExactTools &&'))
    assert.ok(
      runAgent.includes(
        'appendSubagentSystemPrompt:\n      toolUseContext.options.appendSubagentSystemPrompt',
      ),
    )
    assert.equal(
      occurrences(runAgent, 'systemPrompt: subagentSystemPrompt'),
      2,
    )

    assert.ok(queryEngine.includes('appendSubagentSystemPrompt?: string'))
    assert.ok(
      occurrences(queryEngine, 'appendSubagentSystemPrompt') >= 7,
      'QueryEngine must accept, destructure, and propagate the value',
    )
    assert.ok(
      print.includes(
        'appendSubagentSystemPrompt:\n                options.appendSubagentSystemPrompt',
      ),
    )
    assert.ok(
      print.includes('request.appendSubagentSystemPrompt !== undefined'),
    )
    assert.ok(
      print.includes(
        'options.appendSubagentSystemPrompt = request.appendSubagentSystemPrompt',
      ),
    )
    assert.ok(main.includes('appendSubagentSystemPrompt: undefined'))
  },
)

test(
  'the recovered runAgent branch appends only for enabled non-exact Task agents and remains nested',
  sourceOptions,
  () => {
    const runAgent = source('tools/AgentTool/runAgent.ts')
    const branch = extract(
      runAgent,
      '  const subagentSystemPrompt =',
      '\n\n  // Determine abortController',
    )
    const choosePrompt = new Function(
      'useExactTools',
      'envValue',
      'append',
      `
        const process = {
          env: { CLAUDE_CODE_ENABLE_APPEND_SUBAGENT_PROMPT: envValue },
        }
        const isEnvTruthy = value => value === '1'
        const asSystemPrompt = value => value
        const agentSystemPrompt = ['base']
        const toolUseContext = {
          options: { appendSubagentSystemPrompt: append },
        }
        ${branch}
        return subagentSystemPrompt
      `,
    )

    assert.deepEqual(choosePrompt(false, undefined, 'nested'), ['base'])
    assert.deepEqual(choosePrompt(false, '1', undefined), ['base'])
    assert.deepEqual(choosePrompt(true, '1', 'nested'), ['base'])
    assert.deepEqual(choosePrompt(false, '1', 'nested'), ['base', 'nested'])
  },
)
