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
const isCurrentSource =
  sourceRoot === path.resolve(path.join(repositoryRoot, 'src'))
const baselinePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath || !latestPath
      ? 'authenticated 2.1.104, 2.1.105, and 2.1.116 bundles are required'
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

const baselineUnits = new Map([
  [
    12850,
    [
      'FunctionDeclaration',
      9810624,
      9811754,
      'b64518972ae6c636df325a5fbeb5c087b60e2709171c454d06f9274a898f6a2c',
    ],
  ],
  [
    12851,
    [
      'VariableDeclaration',
      9811754,
      9814060,
      'eb00a55a3bf5b84ea586176f20457151ed8cba6081aa437e25e9e6bf4525636e',
    ],
  ],
])

const targetUnits = new Map([
  [
    12952,
    [
      'FunctionDeclaration',
      9848821,
      9849988,
      '5a0b51c45732fcc7885f6bb6796f2d53688a63e39d017e6b3b1a78b0229aa268',
    ],
  ],
  [
    12953,
    [
      'VariableDeclaration',
      9849988,
      9852980,
      '8fa281a8d3d2d42ae583342dd6d98f6118ebc1c82dcea8617973d7c425eca788',
    ],
  ],
])

const reachabilityUnits = new Map([
  [
    12951,
    [
      12849,
      9848599,
      9848821,
      '8d13d4b05354624599b63de7675ce09dc4ebf391af3fab723c735e6e5f70b273',
    ],
  ],
  [
    12989,
    [
      12887,
      9865894,
      9866751,
      'dee254d8ba588c91802e94b6bd44622f072da5ef8eb17a44b20522aa5d4459db',
    ],
  ],
])

const own105Sentence =
  'Do not invent facts. Only extract what is explicitly written in the memories.'
const target111Sentence =
  'Do not answer or solve the query yourself. You are a retrieval step, not the assistant: every fact must be lifted from a memory file body, not derived from general knowledge or your own reasoning about the query. If no memory covers it, return relevant_facts: [].'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
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

async function executeOwner(contents) {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(contents, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const calls = []
  const debug = []
  let response = {
    relevant_facts: [],
    cited_memories: [],
  }
  let failure
  const memories = [
    {
      filename: 'alpha.md',
      filePath: '/memory/alpha.md',
      mtimeMs: 1,
    },
    {
      filename: 'beta.md',
      filePath: '/memory/beta.md',
      mtimeMs: 2,
    },
  ]
  const module = { exports: {} }
  new Function('require', 'exports', 'module', javascript)(
    id => {
      if (id === 'bun:bundle') return { feature: () => false }
      if (id.endsWith('/debug.js')) {
        return { logForDebugging: (...args) => debug.push(args) }
      }
      if (id.endsWith('/errors.js')) {
        return { errorMessage: error => error.message }
      }
      if (id.endsWith('/model/model.js')) {
        return { getDefaultSonnetModel: () => 'sonnet-test' }
      }
      if (id.endsWith('/sideQuery.js')) {
        return {
          sideQuery: async options => {
            calls.push(options)
            if (failure) throw failure
            return {
              content: [{ type: 'text', text: JSON.stringify(response) }],
              usage: {
                cache_read_input_tokens: 11,
                cache_creation_input_tokens: 13,
              },
            }
          },
        }
      }
      if (id.endsWith('/slowOperations.js')) {
        return { jsonParse: JSON.parse }
      }
      if (id.endsWith('/memoryScan.js')) {
        return {
          formatMemoryManifest: () => 'alpha.md\nbeta.md',
          scanMemoryFiles: async () => memories,
        }
      }
      throw new Error(`unexpected memory-synthesis import: ${id}`)
    },
    module.exports,
    module,
  )
  return {
    calls,
    debug,
    owner: module.exports,
    setFailure(value) {
      failure = value
    },
    setResponse(value) {
      response = value
      failure = undefined
    },
  }
}

test(
  'authenticated target105 replaces paragraph memory synthesis with a bounded relevant-facts list',
  bundleOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    const latestBytes = fs.readFileSync(latestPath)
    assert.deepEqual(
      [baselineBytes.length, sha256(baselineBytes)],
      [
        13567412,
        'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
      ],
    )
    assert.deepEqual(
      [targetBytes.length, sha256(targetBytes)],
      [
        13676915,
        '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
      ],
    )
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )

    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const latest = latestBytes.toString('utf8')
    for (const [index, [nodeType, start, end, hash]] of baselineUnits) {
      const region = structural.unmatchedBaseline.find(
        candidate => candidate.index === index,
      )
      assert.deepEqual(
        [region?.nodeType, region?.start, region?.end, region?.sourceHash],
        [nodeType, start, end, hash],
        `baseline u${index}`,
      )
      assert.equal(sha256(baseline.slice(start, end)), hash, `baseline u${index}`)
    }
    for (const [index, [nodeType, start, end, hash]] of targetUnits) {
      const region = structural.regions.find(
        candidate => candidate.target?.index === index,
      )
      assert.equal(region?.classification, 'unresolved', `target u${index}`)
      assert.deepEqual(
        [
          region?.target.nodeType,
          region?.target.start,
          region?.target.end,
          region?.target.sourceHash,
        ],
        [nodeType, start, end, hash],
        `target u${index}`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `target u${index}`)
    }

    const statements = fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'readable-diff/statements.diff',
      ),
      'utf8',
    )
    assert.ok(statements.includes('@@ -12850,4 +12952,4 @@'))

    assert.equal(occurrences(baseline, 'one_paragraph_synthesis'), 6)
    assert.equal(occurrences(target, 'one_paragraph_synthesis'), 0)
    assert.equal(occurrences(target, 'relevant_facts'), 6)
    assert.equal(occurrences(target, 'Extract facts relevant to:'), 1)
    assert.equal(occurrences(target, own105Sentence), 1)
    assert.equal(occurrences(target, target111Sentence), 0)
    assert.equal(occurrences(latest, 'Extract facts relevant to:'), 1)
    assert.equal(occurrences(latest, 'relevant_facts'), 7)
    assert.equal(occurrences(latest, target111Sentence), 1)

    const targetFunction = target.slice(9848821, 9849988)
    assert.ok(targetFunction.includes('relevant_facts'))
    assert.ok(targetFunction.includes('.slice(0,7)'))
    assert.ok(targetFunction.includes('`- ${P}`'))
    const targetPrompt = target.slice(9849988, 9852980)
    assert.ok(targetPrompt.includes('relevant_facts: an array of facts (max 7)'))
    assert.ok(targetPrompt.includes(own105Sentence))
  },
)

test(
  'authenticated target105 wrapper and tiny-memory attachment function make the fact synthesizer reachable',
  bundleOptions,
  () => {
    const target = fs.readFileSync(targetPath, 'utf8')
    for (const [index, [baselineIndex, start, end, hash]] of reachabilityUnits) {
      const region = structural.regions.find(
        candidate => candidate.target?.index === index,
      )
      assert.equal(region?.classification, 'matched', `target u${index}`)
      assert.equal(region?.baselineUnitIndex, baselineIndex, `target u${index}`)
      assert.deepEqual(
        [region?.target.start, region?.target.end, region?.target.sourceHash],
        [start, end, hash],
        `target u${index}`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `target u${index}`)
    }
    assert.ok(target.slice(9848599, 9848821).includes('return zvY('))
    const attachment = target.slice(9865894, 9866751)
    assert.ok(attachment.includes('if(AH())'))
    assert.ok(attachment.includes('zRK(q,M,_,Y)'))
    assert.ok(attachment.includes('type:"relevant_memories"'))
  },
)

test(
  'dual-root source owns the target105 fact shape without regressing target111 wording',
  sourceOptions,
  () => {
    const owner = source('memdir/findRelevantMemories.ts')
    for (const fragment of [
      'export async function synthesizeRelevantMemories(',
      'const prompt = `Extract facts relevant to:\\n${query}`',
      "relevant_facts: { type: 'array', items: { type: 'string' } }",
      "required: ['relevant_facts', 'cited_memories']",
      'const facts = parsed.relevant_facts',
      '.filter(fact => fact.length > 0)',
      '.slice(0, 7)',
      "facts.map(fact => `- ${fact}`).join('\\n')",
      'conversation.byFilename.has(filename)',
    ]) assert.ok(owner.includes(fragment), fragment)
    assert.equal(occurrences(owner, 'one_paragraph_synthesis'), 0)
    assert.equal(occurrences(owner, own105Sentence), isCurrentSource ? 0 : 1)
    assert.equal(occurrences(owner, target111Sentence), isCurrentSource ? 1 : 0)

    if (isCurrentSource) {
      const attachments = source('utils/attachments.ts')
      const query = source('query.ts')
      assert.match(
        attachments,
        /if \(isTinyMemoryEnabled\(\)\)[\s\S]*synthesizeRelevantMemories\(/,
      )
      assert.ok(attachments.includes('startRelevantMemoryPrefetch('))
      assert.ok(query.includes('startRelevantMemoryPrefetch('))
    } else {
      const prerequisite = fs.readFileSync(
        path.join(
          repositoryRoot,
          'recovery/cases/2.1.92-to-2.1.94/semantic-supplement.patch',
        ),
        'utf8',
      )
      assert.ok(prerequisite.includes('synthesizeRelevantMemories('))
      assert.ok(prerequisite.includes('if (isTinyMemoryEnabled())'))
    }
  },
)

test(
  'fact synthesis trims, caps, formats, validates citations, and fails closed',
  sourceOptions,
  async () => {
    const harness = await executeOwner(source('memdir/findRelevantMemories.ts'))
    const state = harness.owner.createMemorySelectorState()
    const signal = new AbortController().signal
    harness.setResponse({
      relevant_facts: [
        ' first ',
        '   ',
        'second',
        'third',
        'fourth',
        'fifth',
        'sixth',
        'seventh',
        'eighth',
      ],
      cited_memories: ['alpha.md', 'unknown.md', 'beta.md'],
    })
    assert.deepEqual(
      await harness.owner.synthesizeRelevantMemories(
        'remember my setup',
        '/memory',
        state,
        signal,
      ),
      {
        synthesis:
          '- first\n- second\n- third\n- fourth\n- fifth\n- sixth\n- seventh',
        citedMemories: ['alpha.md', 'beta.md'],
      },
    )
    assert.equal(harness.calls.length, 1)
    const options = harness.calls[0]
    assert.equal(options.model, 'sonnet-test')
    assert.equal(options.max_tokens, 2000)
    assert.equal(options.querySource, 'memdir_relevance')
    assert.deepEqual(options.output_format.schema.properties.relevant_facts, {
      type: 'array',
      items: { type: 'string' },
    })
    assert.deepEqual(options.output_format.schema.required, [
      'relevant_facts',
      'cited_memories',
    ])
    assert.equal(
      options.messages.at(-1).content[0].text,
      'Extract facts relevant to:\nremember my setup',
    )
    assert.equal(
      options.system[0].text.includes(
        isCurrentSource ? target111Sentence : own105Sentence,
      ),
      true,
    )
    assert.deepEqual(state.lastUsage, {
      cacheReadInputTokens: 11,
      cacheCreationInputTokens: 13,
      turnCount: 1,
    })

    harness.setResponse({
      relevant_facts: [' ', ''],
      cited_memories: ['alpha.md'],
    })
    assert.equal(
      await harness.owner.synthesizeRelevantMemories(
        'nothing relevant',
        '/memory',
        state,
        signal,
      ),
      null,
    )

    harness.setFailure(new Error('side query failed'))
    assert.equal(
      await harness.owner.synthesizeRelevantMemories(
        'failure path',
        '/memory',
        state,
        signal,
      ),
      null,
    )
    assert.equal(state.lastUsage, null)
    assert.equal(harness.debug.length, 1)

    const aborted = new AbortController()
    aborted.abort()
    assert.equal(
      await harness.owner.synthesizeRelevantMemories(
        'aborted path',
        '/memory',
        state,
        aborted.signal,
      ),
      null,
    )
    assert.equal(harness.debug.length, 1)
  },
)
