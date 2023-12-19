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
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_96_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const target114Path = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const target116Path = process.env.CLAUDE_CODE_2_1_116_BUNDLE

const baselineSha256 =
  '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e'
const targetSha256 =
  '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988'
const target114Sha256s = new Set([
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
  '5db5e2191a2ea9d74713e0881fa689ab244a2c1c4a58986840fb7b02cd162c83',
])
const target116Sha256s = new Set([
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
  '06cb80193f3af8bb468d1536b230b0e2f854a398b1e88af3c79048ce821bf193',
])

const baselineUnits = [
  {
    index: 8_779,
    nodeType: 'FunctionDeclaration',
    start: 6_901_207,
    end: 6_902_324,
    sourceHash:
      '9fbc769d1c32b023d657861433fb2c1ffe56431229ae0a8cd5256bfb995233a3',
  },
  {
    index: 8_780,
    nodeType: 'FunctionDeclaration',
    start: 6_902_324,
    end: 6_904_308,
    sourceHash:
      '22cea2ecf8c822d3a010e84d1fb9da31bda5315dc3e01c9ed813453f979139fd',
  },
  {
    index: 8_781,
    nodeType: 'FunctionDeclaration',
    start: 6_904_308,
    end: 6_906_656,
    sourceHash:
      '46366be2cc4e74c64c852303e193b3998dde6db27fb340c8a168d85e0aa2939e',
  },
  {
    index: 8_786,
    nodeType: 'VariableDeclaration',
    start: 6_908_210,
    end: 6_925_450,
    sourceHash:
      '2a02037d9c7c55e0369b2a4e7528b2b0a455e1a6ce38467b072802f9d977bf54',
  },
]

const targetUnits = [
  {
    index: 8_734,
    nodeType: 'FunctionDeclaration',
    start: 6_890_013,
    end: 6_891_158,
    sourceHash:
      'f8588568f12da28924ad1f67bc1ff202c557032f1273ac1c0dce65ee4e42fb96',
  },
  {
    index: 8_735,
    nodeType: 'FunctionDeclaration',
    start: 6_891_158,
    end: 6_893_197,
    sourceHash:
      '367804fc1c7142a335c3efbe02a88977f736fbe22869f026c98c146cbbadf4f5',
  },
  {
    index: 8_736,
    nodeType: 'FunctionDeclaration',
    start: 6_893_197,
    end: 6_895_576,
    sourceHash:
      '1444a22adee63cae52648e79b36faf824813a1b995eb378357811828fda8505c',
  },
  {
    index: 8_741,
    nodeType: 'VariableDeclaration',
    start: 6_897_130,
    end: 6_914_396,
    sourceHash:
      '5cb51dab9069dc52c6903937e43062edafe52ed5d58f8a7b5c65b2c8d328254d',
  },
]

const annotationRanges = [
  [6_891_300, 6_891_323],
  [6_891_420, 6_891_443],
  [6_893_294, 6_893_317],
  [6_911_938, 6_911_961],
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

const sourceOptions = {
  skip: !selected,
}
const bundleOptions = {
  skip: !selected || !baselinePath || !targetPath,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(value, fragment) {
  return value.split(fragment).length - 1
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
  const loaded = await import(pathToFileURL(candidate).href)
  return loaded.default ?? loaded
}

function parseOwner(ts, contents) {
  return ts.createSourceFile(
    'mcp-client.ts',
    contents,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
}

function findFunction(ts, ast, name) {
  const declaration = ast.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  )
  assert.ok(declaration?.body, `${name} must be a reachable function`)
  return declaration
}

function findNode(ts, root, predicate, label) {
  let found
  function visit(node) {
    if (found) return
    if (predicate(node)) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(root)
  assert.ok(found, `${label} must be reachable`)
  return found
}

function compileTypeScript(ts, contents, filename) {
  const result = ts.transpileModule(contents, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
    reportDiagnostics: true,
  })
  const errors = (result.diagnostics ?? []).filter(
    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
  )
  assert.deepEqual(
    errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')),
    [],
    `${filename} must transpile`,
  )
  const module = { exports: {} }
  new Function('exports', 'module', result.outputText)(module.exports, module)
  return module.exports
}

function actualFactoryResolver(ts, owner, ast) {
  const requested = findNode(
    ts,
    ast,
    node =>
      ts.isVariableDeclaration(node) &&
      node.name.getText(ast) === 'requestedMaxResultSizeChars',
    'requested MCP result-size declaration',
  )
  let block = requested.parent
  while (block && !ts.isBlock(block)) block = block.parent
  assert.ok(block, 'MCP tool factory block must be reachable')

  const declarations = block.statements.filter(
    statement =>
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(declaration =>
        [
          'requestedMaxResultSizeChars',
          'hasRequestedMaxResultSizeChars',
        ].includes(declaration.name.getText(ast)),
      ),
  )
  assert.equal(declarations.length, 2)
  const returned = block.statements.find(
    statement =>
      ts.isReturnStatement(statement) &&
      statement.expression &&
      ts.isObjectLiteralExpression(statement.expression),
  )
  assert.ok(returned?.expression)
  const propertyInitializer = name => {
    const property = returned.expression.properties.find(
      candidate =>
        ts.isPropertyAssignment(candidate) &&
        candidate.name.getText(ast) === name,
    )
    assert.ok(property && ts.isPropertyAssignment(property), `${name} property`)
    return property.initializer.getText(ast)
  }

  return compileTypeScript(
    ts,
    `
      const MCPTool = { maxResultSizeChars: 100_000 }
      const MAX_MCP_RESULT_SIZE_CHARS = 500_000
      function resolve(requested) {
        const tool = { _meta: { 'anthropic/maxResultSizeChars': requested } }
        ${declarations.map(statement => statement.getText(ast)).join('\n')}
        return {
          hasResultSizeAnnotation: hasRequestedMaxResultSizeChars,
          maxResultSizeChars: ${propertyInitializer('maxResultSizeChars')},
          persistenceThresholdCeiling: ${propertyInitializer('persistenceThresholdCeiling')},
        }
      }
      module.exports = { resolve }
    `,
    'mcp-result-size-factory.ts',
  ).resolve
}

function actualProcessResult(ts, ast) {
  const imageCheck = findFunction(ts, ast, 'contentContainsImages')
  const processResult = findFunction(ts, ast, 'processMCPResult')
  const parameterNames = processResult.parameters.map(parameter =>
    parameter.name.getText(ast),
  )
  const annotationIndex = parameterNames.indexOf('hasResultSizeAnnotation')
  assert.ok(annotationIndex === 3 || annotationIndex === 4)

  const runtime = compileTypeScript(
    ts,
    `
      const state = {
        needsTruncation: true,
        envDisabled: true,
        checks: 0,
        truncations: 0,
        persists: 0,
        events: [],
      }
      const reset = overrides => Object.assign(state, {
        needsTruncation: true,
        envDisabled: true,
        checks: 0,
        truncations: 0,
        persists: 0,
        events: [],
      }, overrides)
      const getCurrentImageLimits = () => ({})
      const transformMCPResult = async result => result
      const mcpContentNeedsTruncation = async () => {
        state.checks++
        return state.needsTruncation
      }
      const getContentSizeEstimate = () => 123
      const isEnvDefinedFalsy = () => state.envDisabled
      const logEvent = (name, values) => state.events.push({ name, values })
      const truncateMcpContentIfNeeded = async () => {
        state.truncations++
        return 'TRUNCATED'
      }
      const normalizeNameForMCP = value => value
      const shouldUseMcpSubagentPrompt = () => false
      const jsonStringify = JSON.stringify
      const persistToolResult = async value => {
        state.persists++
        return { filepath: '/tmp/mcp-result', originalSize: value.length }
      }
      const isPersistError = () => false
      const getFormatDescription = () => 'json'
      const getLargeOutputInstructions = (filepath, originalSize) => ({
        kind: 'persisted', filepath, originalSize,
      })
      ${imageCheck.getText(ast)}
      ${processResult.getText(ast).replace(/^export /, '')}
      module.exports = { processMCPResult, reset, state }
    `,
    'mcp-process-result.ts',
  )

  return {
    ...runtime,
    invoke(result, annotation) {
      const args = [result, 'search', 'server']
      if (annotationIndex === 4) args.push({ maxWidth: 1, maxHeight: 1 })
      if (annotation !== undefined) args[annotationIndex] = annotation
      return runtime.processMCPResult(...args)
    },
  }
}

function actualRetry(ts, ast) {
  const retry = findFunction(ts, ast, 'callMCPToolWithUrlElicitationRetry')
  return compileTypeScript(
    ts,
    `
      class McpError extends Error {
        constructor(code, data) {
          super('elicitation required')
          this.code = code
          this.data = data
        }
      }
      const ErrorCode = { UrlElicitationRequired: -32042 }
      const callMCPTool = () => { throw new Error('injected call required') }
      const getCurrentImageLimits = () => ({})
      const extractUrlElicitations = error => error.data.elicitations
      const logMCPDebug = () => {}
      const jsonStringify = JSON.stringify
      const runElicitationHooks = async () => ({ action: 'accept' })
      const runElicitationResultHooks = async (_server, result) => result
      ${retry.getText(ast).replace(/^export /, '')}
      async function exercise(hasResultSizeAnnotation, failures) {
        const seen = []
        const result = await callMCPToolWithUrlElicitationRetry({
          client: {},
          clientConnection: { type: 'connected', name: 'server' },
          tool: 'search',
          args: {},
          signal: new AbortController().signal,
          setAppState: () => {},
          imageLimits: {},
          hasResultSizeAnnotation,
          callToolFn: async options => {
            seen.push(options.hasResultSizeAnnotation)
            if (seen.length <= failures) {
              throw new McpError(-32042, {
                elicitations: [{
                  mode: 'url',
                  elicitationId: 'one',
                  url: 'https://example.test',
                  message: 'Open the URL to continue',
                }],
              })
            }
            return { content: 'ok' }
          },
        })
        return { seen, result }
      }
      module.exports = { exercise }
    `,
    'mcp-result-size-retry.ts',
  ).exercise
}

test(
  'authenticated target97 introduces the complete result-size annotation graph',
  bundleOptions,
  () => {
    if (bundleOptions.skip) return
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(sha256(baselineBytes), baselineSha256)
    assert.equal(sha256(targetBytes), targetSha256)
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')

    const unmatchedBaseline = new Map(
      structural.unmatchedBaseline.map(unit => [unit.index, unit]),
    )
    for (const unit of baselineUnits) {
      const structuralUnit = unmatchedBaseline.get(unit.index)
      assert.ok(structuralUnit, `baseline unit ${unit.index}`)
      assert.deepEqual(
        [
          structuralUnit.nodeType,
          structuralUnit.start,
          structuralUnit.end,
          structuralUnit.sourceHash,
        ],
        [unit.nodeType, unit.start, unit.end, unit.sourceHash],
      )
      assert.equal(
        sha256(baseline.slice(unit.start, unit.end)),
        unit.sourceHash,
      )
    }

    const unitSource = new Map()
    for (const unit of targetUnits) {
      const region = structural.regions[unit.index]
      assert.equal(region.classification, 'unresolved', `${unit.index}: class`)
      assert.deepEqual(
        [
          region.target.nodeType,
          region.target.start,
          region.target.end,
          region.target.sourceHash,
        ],
        [unit.nodeType, unit.start, unit.end, unit.sourceHash],
        `${unit.index}: identity`,
      )
      const exact = target.slice(unit.start, unit.end)
      unitSource.set(unit.index, exact)
      assert.equal(sha256(exact), unit.sourceHash, `${unit.index}: exact bytes`)
    }

    assert.equal(occurrences(baseline, 'hasResultSizeAnnotation'), 0)
    assert.equal(occurrences(target, 'hasResultSizeAnnotation'), 4)
    for (const [start, end] of annotationRanges) {
      assert.equal(target.slice(start, end), 'hasResultSizeAnnotation')
    }
    assert.equal(occurrences(baseline, 'anthropic/maxResultSizeChars'), 1)
    assert.equal(occurrences(target, 'anthropic/maxResultSizeChars'), 1)
    assert.equal(occurrences(baseline, 'persistenceThresholdCeiling'), 3)
    assert.equal(occurrences(target, 'persistenceThresholdCeiling'), 3)

    assert.match(unitSource.get(8_734), /if\(z&&!Su4\(Y\)\)return Y/)
    assert.match(
      unitSource.get(8_735),
      /hasResultSizeAnnotation:H=!1[\s\S]*hasResultSizeAnnotation:H/,
    )
    assert.match(
      unitSource.get(8_736),
      /hasResultSizeAnnotation:w=!1[\s\S]*content:await F0z\(P,z,K,w\)/,
    )
    assert.match(
      unitSource.get(8_741),
      /handleElicitation:j\.handleElicitation,hasResultSizeAnnotation:\$/,
    )
    assert.match(unitSource.get(8_741), /VERSION:"2\.1\.97"/)
    assert.match(unitSource.get(8_741), /BUILD_TIME:/)

    for (const [label, filename, expectedHashes] of [
      ['2.1.114', target114Path, target114Sha256s],
      ['2.1.116', target116Path, target116Sha256s],
    ]) {
      if (!filename) continue
      const bytes = fs.readFileSync(filename)
      assert.ok(expectedHashes.has(sha256(bytes)), `${label}: bundle hash`)
      assert.equal(
        occurrences(bytes.toString('utf8'), 'hasResultSizeAnnotation'),
        4,
        `${label}: persistent annotation graph`,
      )
    }
  },
)

test(
  'client source owns all four propagation edges and the image-safe bypass',
  sourceOptions,
  async () => {
    if (sourceOptions.skip) return
    const ts = await loadTypeScript()
    const owner = source('services/mcp/client.ts')
    const ast = parseOwner(ts, owner)
    assert.equal(occurrences(owner, 'hasResultSizeAnnotation'), 10)

    const processResult = findFunction(ts, ast, 'processMCPResult')
    const processText = processResult.getText(ast)
    const ide = processText.indexOf("name === 'ide'")
    const bypass = processText.indexOf(
      'hasResultSizeAnnotation && !contentContainsImages(content)',
    )
    const truncate = processText.indexOf('mcpContentNeedsTruncation(content)')
    assert.ok(ide >= 0 && ide < bypass && bypass < truncate)

    const retry = findFunction(ts, ast, 'callMCPToolWithUrlElicitationRetry')
    const retryText = retry.getText(ast)
    assert.match(retryText, /hasResultSizeAnnotation = false/)
    assert.match(
      retryText,
      /return await callToolFn\(\{[\s\S]*hasResultSizeAnnotation,[\s\S]*\}\)/,
    )

    const direct = findFunction(ts, ast, 'callMCPTool')
    const directCall = findNode(
      ts,
      direct,
      node =>
        ts.isCallExpression(node) &&
        node.expression.getText(ast) === 'processMCPResult',
      'direct processMCPResult call',
    )
    assert.equal(
      directCall.arguments.at(-1).getText(ast),
      'hasResultSizeAnnotation',
    )

    const factoryCall = findNode(
      ts,
      ast,
      node =>
        ts.isPropertyAssignment(node) &&
        node.name.getText(ast) === 'hasResultSizeAnnotation' &&
        node.initializer.getText(ast) === 'hasRequestedMaxResultSizeChars',
      'MCP factory annotation edge',
    )
    assert.equal(factoryCall.initializer.getText(ast), 'hasRequestedMaxResultSizeChars')
  },
)

test(
  'actual source validates annotations, bypasses only non-images, and preserves retries',
  sourceOptions,
  async () => {
    if (sourceOptions.skip) return
    const ts = await loadTypeScript()
    const owner = source('services/mcp/client.ts')
    const ast = parseOwner(ts, owner)

    const resolve = actualFactoryResolver(ts, owner, ast)
    for (const invalid of [undefined, null, 0, -1, Infinity, NaN, '250000']) {
      assert.deepEqual(resolve(invalid), {
        hasResultSizeAnnotation: false,
        maxResultSizeChars: 100_000,
        persistenceThresholdCeiling: undefined,
      })
    }
    assert.deepEqual(resolve(250_000), {
      hasResultSizeAnnotation: true,
      maxResultSizeChars: 250_000,
      persistenceThresholdCeiling: 500_000,
    })
    assert.deepEqual(resolve(750_000), {
      hasResultSizeAnnotation: true,
      maxResultSizeChars: 500_000,
      persistenceThresholdCeiling: 500_000,
    })

    const runtime = actualProcessResult(ts, ast)
    const textResult = { content: 'large text', type: 'toolResult' }
    runtime.reset({ needsTruncation: true, envDisabled: true })
    assert.equal(await runtime.invoke(textResult, true), 'large text')
    assert.deepEqual(
      [runtime.state.checks, runtime.state.truncations, runtime.state.persists],
      [0, 0, 0],
    )

    const imageResult = {
      content: [{ type: 'image', data: 'base64' }],
      type: 'toolResult',
    }
    runtime.reset({ needsTruncation: true, envDisabled: true })
    assert.equal(await runtime.invoke(imageResult, true), 'TRUNCATED')
    assert.deepEqual(
      [runtime.state.checks, runtime.state.truncations, runtime.state.persists],
      [1, 1, 0],
    )

    runtime.reset({ needsTruncation: true, envDisabled: true })
    assert.equal(await runtime.invoke(textResult, false), 'TRUNCATED')
    assert.deepEqual(
      [runtime.state.checks, runtime.state.truncations, runtime.state.persists],
      [1, 1, 0],
    )

    runtime.reset({ needsTruncation: true, envDisabled: false })
    assert.deepEqual(await runtime.invoke(textResult, false), {
      kind: 'persisted',
      filepath: '/tmp/mcp-result',
      originalSize: 10,
    })
    assert.deepEqual(
      [runtime.state.checks, runtime.state.truncations, runtime.state.persists],
      [1, 0, 1],
    )

    const retry = actualRetry(ts, ast)
    assert.deepEqual(await retry(true, 2), {
      seen: [true, true, true],
      result: { content: 'ok' },
    })
    assert.deepEqual(await retry(undefined, 0), {
      seen: [false],
      result: { content: 'ok' },
    })
  },
)
