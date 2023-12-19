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
const followupPath = process.env.CLAUDE_CODE_2_1_107_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath || !followupPath || !latestPath
      ? 'authenticated 2.1.104, 2.1.105, 2.1.107, and 2.1.116 bundles are required'
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

const markers = new Map([
  ['tengu_malformed_tool_use_response', 1],
  ['Your tool call was malformed and could not be parsed. Please retry.', 1],
  ["The model's tool call could not be parsed (retry also failed).", 1],
  ['malformed_tool_use_retry', 2],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
}

function functionSource(contents, name) {
  const marker = `function ${name}(`
  const start = contents.indexOf(marker)
  assert.notEqual(start, -1, `${name}: declaration`)
  const signatureEnd = contents.indexOf(')', start + marker.length)
  const bodyOffset = contents.slice(signatureEnd + 1).search(/\{\r?\n/)
  assert.notEqual(bodyOffset, -1, `${name}: body`)
  const body = signatureEnd + 1 + bodyOffset
  let depth = 0
  for (let index = body; index < contents.length; index++) {
    if (contents[index] === '{') depth++
    if (contents[index] === '}' && --depth === 0) {
      return contents.slice(start, index + 1)
    }
  }
  throw new Error(`${name}: unterminated declaration`)
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

async function compileFunction(contents, name) {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(
    `${functionSource(contents, name)}\nexport { ${name} };`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const module = { exports: {} }
  new Function('exports', 'module', javascript)(module.exports, module)
  return module.exports[name]
}

test(
  'authenticated target105 introduces one reachable malformed tool-use retry and preserves it through target116',
  bundleOptions,
  () => {
    const artifacts = [
      [
        baselinePath,
        'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
        false,
      ],
      [
        targetPath,
        '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
        true,
      ],
      [
        followupPath,
        '6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844',
        true,
      ],
      [
        latestPath,
        'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
        true,
      ],
    ]

    for (const [filename, hash, present] of artifacts) {
      const bytes = fs.readFileSync(filename)
      assert.equal(sha256(bytes), hash, filename)
      const contents = bytes.toString('utf8')
      for (const [marker, count] of markers) {
        assert.equal(
          occurrences(contents, marker),
          present ? count : 0,
          `${path.basename(filename)}: ${marker}`,
        )
      }
    }

    const target = fs.readFileSync(targetPath, 'utf8')
    const baseline = fs.readFileSync(baselinePath, 'utf8')
    const targetRegion = structural.regions[12746]
    assert.equal(targetRegion.classification, 'unresolved')
    assert.deepEqual(
      [
        targetRegion.target.index,
        targetRegion.target.nodeType,
        targetRegion.target.start,
        targetRegion.target.end,
        targetRegion.target.tokenCount,
        targetRegion.target.sourceHash,
      ],
      [
        12746,
        'FunctionDeclaration',
        9731500,
        9746246,
        4671,
        '53675c8c172c312b1486d90018276b1e1be94c1ddfd23b6b3b8b07f9c288129b',
      ],
    )
    assert.equal(
      sha256(target.slice(9731500, 9746246)),
      targetRegion.target.sourceHash,
    )

    const baselineRegion = structural.unmatchedBaseline.find(
      region => region.index === 12583,
    )
    assert.deepEqual(
      [
        baselineRegion?.nodeType,
        baselineRegion?.start,
        baselineRegion?.end,
        baselineRegion?.tokenCount,
        baselineRegion?.sourceHash,
      ],
      [
        'FunctionDeclaration',
        9661249,
        9675137,
        4411,
        '17ff80b02d1c0196e1dbbbb98e47c9b1f2ad857062a72b2bd887a5bd78cfa5f6',
      ],
    )
    assert.equal(
      sha256(baseline.slice(9661249, 9675137)),
      baselineRegion.sourceHash,
    )

    const wrapper = structural.regions[12745]
    assert.deepEqual(
      [
        wrapper.classification,
        wrapper.baselineUnitIndex,
        wrapper.target.start,
        wrapper.target.end,
        wrapper.target.sourceHash,
      ],
      [
        'matched',
        12582,
        9731376,
        9731500,
        'eefd0747b34ff1cdebde7c81fa0f679323a3f705bf635d0f506f52c548bbecc7',
      ],
    )
    assert.equal(
      sha256(target.slice(9731376, 9731500)),
      wrapper.target.sourceHash,
    )
    assert.ok(
      target.slice(9731376, 9731500).includes('yield*LfY(q,K)'),
      'the authenticated public wrapper delegates to target unit 12746',
    )

    for (const [filename, start, end, hash] of [
      [
        followupPath,
        9731600,
        9746346,
        '2f0a781e7132e13cf8b163770c97fca03c174ed819c1f76c14ab3e66f17ddf91',
      ],
      [
        latestPath,
        8661458,
        8676492,
        'a8bd5ef1e8303e938e61bec2c279ec7be5382722c13ed1f56eb9c32572abab79',
      ],
    ]) {
      const unit = fs.readFileSync(filename, 'utf8').slice(start, end)
      assert.equal(sha256(unit), hash, filename)
      for (const marker of markers.keys()) {
        assert.ok(unit.includes(marker), `${path.basename(filename)}: ${marker}`)
      }
    }
  },
)

test(
  'source root owns the bounded malformed tool-use stream detection, retry, telemetry, and terminal failure path',
  sourceOptions,
  () => {
    const query = source('query.ts')
    for (const [marker, expected] of markers) {
      assert.equal(occurrences(query, marker), expected, marker)
    }

    for (const fragment of [
      'let lastStreamStopReason: string | null | undefined = null',
      "message.type === 'stream_event'",
      "message.event.type === 'message_delta'",
      'lastStreamStopReason = message.event.delta.stop_reason',
      'lastMessage?.message.stop_reason ?? lastStreamStopReason',
      'toolUseBlocks.length,',
      'lastMessage?.isApiErrorMessage,',
      'state.transition?.reason,',
      "logEvent('tengu_malformed_tool_use_response'",
      'will_retry: willRetry,',
      'model: currentModel,',
      'content: malformedToolUseRecovery.message,',
      'isMeta: true,',
      '...messagesForQuery,',
      '...assistantMessages,',
      'maxOutputTokensRecoveryCount: 0,',
      'hasAttemptedReactiveCompact: false,',
      'stopHookActive,',
      "transition: { reason: 'malformed_tool_use_retry' }",
      'createAssistantAPIErrorMessage({',
      'void executeStopFailureHooks(failureMessage, toolUseContext)',
      "return { reason: 'completed' }",
    ]) {
      assert.ok(query.includes(fragment), fragment)
    }

    assert.ok(
      query.indexOf('lastStreamStopReason = message.event.delta.stop_reason') <
        query.indexOf('// Withhold recoverable errors'),
      'stream stop metadata is retained before final response handling',
    )
    assert.ok(
      query.indexOf('const malformedToolUseRecovery =') <
        query.indexOf('// Skip stop hooks when the last message is an API error'),
      'malformed tool-use recovery runs before ordinary API-error and stop-hook handling',
    )
  },
)

test(
  'malformed tool-use classifier executes the one-retry state machine and excludes valid or API-error responses',
  sourceOptions,
  async () => {
    const classify = await compileFunction(
      source('query.ts'),
      'getMalformedToolUseRecovery',
    )

    assert.equal(classify('end_turn', 0, false, undefined), undefined)
    assert.equal(classify('tool_use', 1, false, undefined), undefined)
    assert.equal(classify('tool_use', 0, true, undefined), undefined)
    assert.deepEqual(classify('tool_use', 0, false, undefined), {
      kind: 'retry',
      message:
        'Your tool call was malformed and could not be parsed. Please retry.',
    })
    assert.deepEqual(
      classify('tool_use', 0, false, 'malformed_tool_use_retry'),
      {
        kind: 'failed',
        message:
          "The model's tool call could not be parsed (retry also failed).",
      },
    )

    const first = classify('tool_use', 0, false, undefined)
    const second = classify(
      'tool_use',
      0,
      false,
      first.kind === 'retry' ? 'malformed_tool_use_retry' : undefined,
    )
    assert.deepEqual(
      [first.kind, second.kind],
      ['retry', 'failed'],
      'a malformed response is retried once, then terminates',
    )
  },
)
