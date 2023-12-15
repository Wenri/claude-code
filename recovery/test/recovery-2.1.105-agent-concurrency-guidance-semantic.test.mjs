import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
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

const oldGuidance =
  'Launch multiple agents concurrently whenever possible, to maximize performance; to do that, use a single message with multiple tool uses'
const targetGuidance =
  'When you launch multiple agents for independent work, send them in a single message with multiple tool uses so they run concurrently'

const baselineUnits = [
  [
    11920,
    9066094,
    9076979,
    'FunctionDeclaration',
    '60005ed402fd71bcbaba89af39a1d83254543fa2db8080c0c62cf9f1e1e2c027',
  ],
  [
    13224,
    9976211,
    9990865,
    'FunctionDeclaration',
    '3a292a2c84dda65b64324346240b804ae51f50d5b03ac4cbfd9d833b1a2d27ed',
  ],
]
const targetUnits = [
  [
    11229,
    8756324,
    8767037,
    'FunctionDeclaration',
    'cc481da21f6067eb558e23d4d5ce10b00b58a44f64b2f41f790c95ebf0d44cec',
  ],
  [
    13334,
    10019079,
    10029025,
    'FunctionDeclaration',
    'f762fea562ab9948d220b5d4eb3341337222691566bee2037d0a4f2bdf227727',
  ],
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function readOwner(relative) {
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
  const module = await import(pathToFileURL(candidate).href)
  return module.default ?? module
}

async function compileModule(source) {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const module = { exports: {} }
  new Function('exports', 'module', javascript)(module.exports, module)
  return module.exports
}

async function compilePromptGuidance(contents) {
  const start = contents.indexOf('  const concurrencyNote =')
  const end = contents.indexOf('\n\n  // Non-coordinator', start)
  assert.notEqual(start, -1, 'Agent prompt concurrencyNote declaration')
  assert.notEqual(end, -1, 'Agent prompt concurrencyNote terminator')
  const declaration = contents.slice(start, end)
  return compileModule(`
    export function renderConcurrencyNote(
      listViaAttachment: boolean,
      getSubscriptionType: () => string,
    ): string {
      ${declaration}
      return concurrencyNote
    }
  `)
}

async function compileListingRenderer(contents) {
  const start = contents.indexOf("    case 'agent_listing_delta': {")
  const end = contents.indexOf("\n    case 'mcp_instructions_delta':", start)
  assert.notEqual(start, -1, 'agent_listing_delta branch')
  assert.notEqual(end, -1, 'agent_listing_delta branch terminator')
  const branch = contents.slice(start, end)
  return compileModule(`
    const wrapMessagesInSystemReminder = (messages: unknown[]) => messages
    const createUserMessage = (message: unknown) => message
    export function renderAgentListing(attachment: any): unknown[] {
      switch (attachment.type) {
${branch}
        default:
          return []
      }
    }
  `)
}

test(
  'authenticated target105 replaces both concurrency-guidance surfaces',
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
    for (const [, start, end, nodeType, hash] of baselineUnits) {
      const slice = baseline.slice(start, end)
      assert.equal(nodeType, 'FunctionDeclaration')
      assert.equal(sha256(slice), hash)
      assert.equal(occurrences(slice, oldGuidance), 1)
      assert.equal(occurrences(slice, targetGuidance), 0)
    }
    for (const [index, start, end, nodeType, hash] of targetUnits) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved')
      assert.deepEqual(
        [
          region.target.index,
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        [index, start, end, nodeType, hash],
      )
      const slice = target.slice(start, end)
      assert.equal(sha256(slice), hash)
      assert.equal(occurrences(slice, targetGuidance), 1)
      assert.equal(occurrences(slice, oldGuidance), 0)
    }
    assert.equal(occurrences(baseline, oldGuidance), 2)
    assert.equal(occurrences(baseline, targetGuidance), 0)
    assert.equal(occurrences(target, oldGuidance), 0)
    assert.equal(occurrences(target, targetGuidance), 2)
    assert.equal(occurrences(latest, oldGuidance), 0)
    assert.equal(occurrences(latest, targetGuidance), 2)
  },
)

test(
  'authored prompt and agent-listing branches execute the independent-work guidance',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const prompt = readOwner('tools/AgentTool/prompt.ts')
    const messages = readOwner('utils/messages.ts')
    assert.equal(occurrences(prompt, targetGuidance), 1)
    assert.equal(occurrences(messages, `${targetGuidance}.`), 1)
    assert.equal(occurrences(prompt, oldGuidance), 0)
    assert.equal(occurrences(messages, oldGuidance), 0)

    const { renderConcurrencyNote } = await compilePromptGuidance(prompt)
    assert.equal(
      renderConcurrencyNote(false, () => 'max'),
      `\n- ${targetGuidance}`,
    )
    assert.equal(renderConcurrencyNote(true, () => 'max'), '')
    assert.equal(renderConcurrencyNote(false, () => 'pro'), '')

    const { renderAgentListing } = await compileListingRenderer(messages)
    const [initial] = renderAgentListing({
      type: 'agent_listing_delta',
      addedLines: ['reviewer: reviews changes'],
      removedTypes: [],
      isInitial: true,
      showConcurrencyNote: true,
    })
    assert.equal(initial.isMeta, true)
    assert.equal(
      initial.content,
      `Available agent types for the Agent tool:\nreviewer: reviews changes\n\n${targetGuidance}.`,
    )

    const [incremental] = renderAgentListing({
      type: 'agent_listing_delta',
      addedLines: ['tester: runs tests'],
      removedTypes: ['reviewer'],
      isInitial: false,
      showConcurrencyNote: true,
    })
    assert.equal(
      incremental.content,
      'New agent types are now available for the Agent tool:\ntester: runs tests\n\nThe following agent types are no longer available:\n- reviewer',
    )
    assert.equal(occurrences(incremental.content, targetGuidance), 0)
  },
)
