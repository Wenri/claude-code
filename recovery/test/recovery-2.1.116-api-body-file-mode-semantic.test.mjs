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
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'

const baselineUnits = {
  enabled: {
    index: 10009,
    start: 5031025,
    end: 5031087,
    sourceHash:
      '91abd60ee6e8f75eaa2475fb796e06604a215967d4127cf48a532d4451009a64',
  },
  inlineBody: {
    index: 10010,
    start: 5031087,
    end: 5031275,
    sourceHash:
      '226ea5696e831cf7aa48e3398b4fbdd98a20c55b80c9663b17742845e1df1133',
  },
}

const targetUnits = {
  configParser: {
    index: 10115,
    start: 5067192,
    end: 5067359,
    sourceHash:
      '78f9910cca5cc6cbe22137ec9d1b91e7849cd74c691a82c374b3310b65528fbb',
  },
  configCache: {
    index: 10116,
    start: 5067359,
    end: 5067481,
    sourceHash:
      '6676a04936e0150aa510861b2035693eb7a17577fe2cd2f6f6fcb0adf142958e',
  },
  enabled: {
    index: 10117,
    start: 5067481,
    end: 5067527,
    sourceHash:
      '4ba1445025d88a1cc1e25ee5dafa03d0016d8208d01bec50fae4eabe86147200',
  },
  fileWriter: {
    index: 10118,
    start: 5067527,
    end: 5067669,
    sourceHash:
      'dfbc555665837cd87265b8e37a3431e0cfc94aba49b2b23a70bab2b75b9ed9d3',
  },
  bodyDispatcher: {
    index: 10119,
    start: 5067669,
    end: 5068247,
    sourceHash:
      'f06908689a1d7d4913dd1cf481a696f20dc8faca08ec5a7990efb642a07cb8be',
  },
}

const typedProperty = {
  row: 354,
  value: 'body_ref',
  start: 5068021,
  end: 5068029,
}

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
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

async function instantiateSourceHarness() {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(
    source('src/utils/telemetry/apiBodyLogging.ts'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const state = {
    events: [],
    writes: [],
    mkdirs: [],
    debug: [],
    uuids: [],
    writeImpl: async () => {},
    mkdirImpl: async () => {},
  }
  const module = { exports: {} }
  const requireStub = specifier => {
    if (specifier === 'crypto') {
      return {
        randomUUID() {
          const value = state.uuids.shift()
          assert.ok(value, 'a deterministic randomUUID value must be queued')
          return value
        },
      }
    }
    if (specifier === 'fs/promises') {
      return {
        async writeFile(...args) {
          state.writes.push(args)
          return state.writeImpl(...args)
        },
        async mkdir(...args) {
          state.mkdirs.push(args)
          return state.mkdirImpl(...args)
        },
      }
    }
    if (specifier === 'path') return path
    if (specifier.endsWith('/debug.js')) {
      return {
        logForDebugging(message, options) {
          state.debug.push({ message, options })
        },
      }
    }
    if (specifier.endsWith('/envUtils.js')) {
      return {
        isEnvTruthy(value) {
          if (!value) return false
          if (typeof value === 'boolean') return value
          return ['1', 'true', 'yes', 'on'].includes(
            value.toLowerCase().trim(),
          )
        },
      }
    }
    if (specifier.endsWith('/errors.js')) {
      return { isENOENT: error => error?.code === 'ENOENT' }
    }
    if (specifier.endsWith('/slowOperations.js')) {
      return { jsonStringify: JSON.stringify }
    }
    if (specifier.endsWith('/events.js')) {
      return {
        async logOTelEvent(eventName, attributes) {
          state.events.push({ eventName, attributes })
        },
      }
    }
    throw new Error(`unexpected apiBodyLogging import: ${specifier}`)
  }
  new Function('exports', 'module', 'require', javascript)(
    module.exports,
    module,
    requireStub,
  )
  return { ...module.exports, state }
}

function errno(code) {
  return Object.assign(new Error(code), { code })
}

function responseMessage(content) {
  return {
    message: {
      id: 'message-1',
      type: 'message',
      role: 'assistant',
      model: 'claude-test',
      content,
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {},
    },
  }
}

async function turn() {
  await new Promise(resolve => setImmediate(resolve))
}

test(
  'target116 authenticates the raw API body file-mode helper graph',
  pairOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselineBundlePath)
    const targetBytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(baselineBytes), baselineSha256)
    assert.equal(sha256(targetBytes), targetSha256)
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')

    for (const unit of Object.values(baselineUnits)) {
      assert.equal(
        sha256(baseline.slice(unit.start, unit.end)),
        unit.sourceHash,
        `baseline structural unit ${unit.index}`,
      )
    }
    for (const unit of Object.values(targetUnits)) {
      const region = structural.regions[unit.index]
      assert.equal(region.classification, 'unresolved')
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [unit.start, unit.end, unit.sourceHash],
      )
      assert.equal(
        sha256(target.slice(unit.start, unit.end)),
        unit.sourceHash,
        `target structural unit ${unit.index}`,
      )
    }
    assert.equal(
      target.slice(typedProperty.start, typedProperty.end),
      typedProperty.value,
      `typed-audit row ${typedProperty.row}`,
    )

    const baselineBody = baseline.slice(
      baselineUnits.inlineBody.start,
      baselineUnits.inlineBody.end,
    )
    const targetParser = target.slice(
      targetUnits.configParser.start,
      targetUnits.configParser.end,
    )
    const targetCache = target.slice(
      targetUnits.configCache.start,
      targetUnits.configCache.end,
    )
    const targetWriter = target.slice(
      targetUnits.fileWriter.start,
      targetUnits.fileWriter.end,
    )
    const targetBody = target.slice(
      targetUnits.bodyDispatcher.start,
      targetUnits.bodyDispatcher.end,
    )
    assert.doesNotMatch(baselineBody, /body_ref|mode==="file"/)
    assert.match(targetParser, /startsWith\("file:"\)/)
    assert.match(targetParser, /mode:"inline"/)
    assert.match(targetParser, /mode:"disabled"/)
    assert.match(targetCache, /raw!==H/)
    assert.match(targetWriter, /recursive:!0/)
    assert.match(targetBody, /mode==="file"/)
    assert.match(targetBody, /Buffer\.byteLength\(_\)/)
    assert.match(targetBody, /\^\[A-Za-z0-9_-\]\+\$/)
    assert.match(targetBody, /OTEL raw body file write failed/)
  },
)

test(
  'source preserves disabled/inline behavior and writes private file references',
  sourceOptions,
  async () => {
    const previous = process.env.OTEL_LOG_RAW_API_BODIES
    const harness = await instantiateSourceHarness()
    const {
      logRawAPIRequestBody,
      logRawAPIResponseBody,
      state,
    } = harness
    try {
      delete process.env.OTEL_LOG_RAW_API_BODIES
      logRawAPIRequestBody({ model: 'disabled', messages: [] }, 'user')
      process.env.OTEL_LOG_RAW_API_BODIES = 'file:'
      logRawAPIRequestBody({ model: 'empty-file', messages: [] }, 'user')
      assert.deepEqual(state.events, [])
      assert.deepEqual(state.writes, [])

      process.env.OTEL_LOG_RAW_API_BODIES = 'true'
      logRawAPIRequestBody(
        {
          model: 'inline',
          messages: [
            {
              role: 'assistant',
              content: [
                { type: 'thinking', thinking: 'private thought' },
                { type: 'redacted_thinking', data: 'private data' },
                { type: 'text', text: 'visible' },
              ],
            },
          ],
        },
        'user',
      )
      assert.equal(state.events.length, 1)
      assert.equal(state.events[0].eventName, 'api_request_body')
      assert.equal(typeof state.events[0].attributes.body, 'string')
      assert.match(state.events[0].attributes.body, /<REDACTED>/)
      assert.doesNotMatch(state.events[0].attributes.body, /private thought/)
      assert.doesNotMatch(state.events[0].attributes.body, /private data/)
      assert.equal('body_ref' in state.events[0].attributes, false)
      assert.deepEqual(state.writes, [])

      state.events.length = 0
      process.env.OTEL_LOG_RAW_API_BODIES = 'file:./raw-api-output'
      state.uuids.push('generated-request-id')
      logRawAPIRequestBody(
        {
          model: 'file-model',
          messages: [
            {
              role: 'assistant',
              content: [{ type: 'thinking', thinking: 'secret β' }],
            },
          ],
        },
        'tool',
      )
      assert.equal(state.events.length, 1)
      assert.equal(state.writes.length, 1)
      const requestPath = path.resolve(
        'raw-api-output',
        'generated-request-id.request.json',
      )
      assert.equal(state.writes[0][0], requestPath)
      assert.equal(state.events[0].attributes.body_ref, requestPath)
      assert.equal('body' in state.events[0].attributes, false)
      assert.equal('body_truncated' in state.events[0].attributes, false)
      assert.equal(
        state.events[0].attributes.body_length,
        String(Buffer.byteLength(state.writes[0][1])),
      )
      assert.match(state.writes[0][1], /<REDACTED>/)
      assert.doesNotMatch(state.writes[0][1], /secret β/)
      await turn()

      state.events.length = 0
      state.writes.length = 0
      logRawAPIResponseBody(
        [responseMessage([{ type: 'text', text: 'response λ' }])],
        {
          model: 'file-model',
          querySource: 'tool',
          requestId: 'safe_ID-42',
        },
      )
      const safeResponsePath = path.resolve(
        'raw-api-output',
        'safe_ID-42.response.json',
      )
      assert.equal(state.writes[0][0], safeResponsePath)
      assert.equal(state.events[0].attributes.body_ref, safeResponsePath)
      assert.equal(state.events[0].attributes.request_id, 'safe_ID-42')
      assert.equal(
        state.events[0].attributes.body_length,
        String(Buffer.byteLength(state.writes[0][1])),
      )

      state.events.length = 0
      state.writes.length = 0
      state.uuids.push('replacement-id')
      logRawAPIResponseBody(
        [responseMessage([{ type: 'text', text: 'unsafe id' }])],
        {
          model: 'file-model',
          querySource: 'tool',
          requestId: '../../escape',
        },
      )
      assert.equal(
        state.writes[0][0],
        path.resolve('raw-api-output', 'replacement-id.response.json'),
      )
      assert.equal(state.events[0].attributes.request_id, '../../escape')

      state.events.length = 0
      state.writes.length = 0
      state.mkdirs.length = 0
      let attempts = 0
      state.writeImpl = async () => {
        attempts++
        if (attempts === 1) throw errno('ENOENT')
      }
      logRawAPIResponseBody(
        [responseMessage([{ type: 'text', text: 'retry' }])],
        {
          model: 'file-model',
          querySource: 'tool',
          requestId: 'retry-id',
        },
      )
      await turn()
      assert.equal(state.writes.length, 2)
      assert.deepEqual(state.mkdirs, [
        [path.resolve('raw-api-output'), { recursive: true }],
      ])
      assert.equal(state.events.length, 1)

      state.events.length = 0
      state.writes.length = 0
      state.mkdirs.length = 0
      state.debug.length = 0
      state.writeImpl = async () => {
        throw errno('EACCES')
      }
      logRawAPIResponseBody(
        [responseMessage([{ type: 'text', text: 'denied' }])],
        {
          model: 'file-model',
          querySource: 'tool',
          requestId: 'denied-id',
        },
      )
      assert.equal(state.events.length, 1)
      await turn()
      assert.deepEqual(state.mkdirs, [])
      assert.equal(state.debug.length, 1)
      assert.match(
        state.debug[0].message,
        /^OTEL raw body file write failed: Error: EACCES$/,
      )
      assert.deepEqual(state.debug[0].options, { level: 'error' })

      state.events.length = 0
      state.writes.length = 0
      process.env.OTEL_LOG_RAW_API_BODIES = 'false'
      logRawAPIRequestBody({ model: 'disabled-again', messages: [] }, 'user')
      assert.deepEqual(state.events, [])
      assert.deepEqual(state.writes, [])
    } finally {
      if (previous === undefined) {
        delete process.env.OTEL_LOG_RAW_API_BODIES
      } else {
        process.env.OTEL_LOG_RAW_API_BODIES = previous
      }
    }
  },
)
