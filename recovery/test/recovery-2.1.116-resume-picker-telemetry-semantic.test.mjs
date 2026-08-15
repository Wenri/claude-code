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
      ? 'authenticated 2.1.114 and 2.1.116 bundles are required'
      : false,
}

const baselineUnit = {
  index: 19_920,
  start: 12_139_511,
  end: 12_144_247,
  hash: 'b06c8971febe0feaaf5c98b0d0b69a1471477bde59f28ee01e4cbd579e36dd95',
}
const targetUnit = {
  index: 20_192,
  start: 12_239_487,
  end: 12_243_978,
  hash: '48e1310593c0025418610bed35a6b25a0f398579a1c7f6240dac6bc1d9a156df',
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source() {
  return fs.readFileSync(
    path.join(sourceRoot, 'screens/ResumeConversation.tsx'),
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

async function compileOnSelect(contents) {
  const ts = await loadTypeScript()
  const file = ts.createSourceFile(
    'ResumeConversation.tsx',
    contents,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const component = file.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'ResumeConversation',
  )
  assert.ok(component?.body, 'ResumeConversation declaration')
  const onSelect = component.body.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === 'onSelect',
  )
  assert.ok(onSelect?.body, 'onSelect declaration')

  const isolated = `
    export function createOnSelect(dependencies: any) {
      const {
        checkCrossProjectResume,
        feature,
        loadConversationForResume,
        logError,
        logEvent,
        performance,
        restoreAgentFromSession,
        setResuming,
        toError,
      } = dependencies
      const showAllProjects = false
      const worktreePaths: string[] = []
      const forkSession = false
      const mainThreadAgentDefinition = undefined
      const agentDefinitions = undefined
      ${contents.slice(onSelect.getStart(file), onSelect.end)}
      return onSelect
    }
  `
  const javascript = ts.transpileModule(isolated, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const module = { exports: {} }
  new Function('exports', 'module', 'require', javascript)(
    module.exports,
    module,
    () => {
      throw new Error('isolated picker telemetry must not load modules')
    },
  )
  return module.exports.createOnSelect
}

function createHarness(overrides = {}) {
  const events = []
  const errors = []
  const dependencies = {
    checkCrossProjectResume: () => ({ isCrossProject: false }),
    feature: () => false,
    loadConversationForResume: async () => null,
    logError: error => errors.push(error),
    logEvent: (name, metadata) => events.push([name, metadata]),
    performance: { now: () => 100 },
    restoreAgentFromSession: () => ({ agentDefinition: undefined }),
    setResuming: () => {},
    toError: value =>
      value instanceof Error ? value : new Error(String(value)),
    ...overrides,
  }
  return { dependencies, errors, events }
}

test(
  'authenticated 114→116 separates picker not-found telemetry',
  bundleOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(baselineBytes.length, 12_986_755)
    assert.equal(targetBytes.length, 13_102_272)
    assert.equal(
      sha256(baselineBytes),
      'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
    )
    assert.equal(
      sha256(targetBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const baselineSlice = baseline.slice(baselineUnit.start, baselineUnit.end)
    const targetSlice = target.slice(targetUnit.start, targetUnit.end)
    assert.equal(sha256(baselineSlice), baselineUnit.hash)
    assert.equal(sha256(targetSlice), targetUnit.hash)

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
    assert.equal(
      structural.unmatchedBaseline.some(
        unit =>
          unit.index === baselineUnit.index &&
          unit.start === baselineUnit.start &&
          unit.end === baselineUnit.end &&
          unit.sourceHash === baselineUnit.hash,
      ),
      true,
    )
    assert.deepEqual(
      [
        structural.regions[targetUnit.index].classification,
        structural.regions[targetUnit.index].target.start,
        structural.regions[targetUnit.index].target.end,
        structural.regions[targetUnit.index].target.sourceHash,
      ],
      ['unresolved', targetUnit.start, targetUnit.end, targetUnit.hash],
    )

    for (const unit of [baselineSlice, targetSlice]) {
      assert.match(unit, /"load_error"/)
      assert.match(unit, /"processing_error"/)
      assert.match(unit, /error_name:/)
      assert.match(unit, /resume_duration_ms:/)
    }
    assert.match(baselineSlice, /failure_reason:"not_found"/)
    assert.doesNotMatch(baselineSlice, /not_found_picker/)
    assert.match(targetSlice, /failure_reason:"not_found_picker"/)
    assert.match(baselineSlice, /" Loading conversations\\u2026"/)
    assert.match(baselineSlice, /" Resuming conversation\\u2026"/)
    assert.doesNotMatch(targetSlice, /" Loading conversations\\u2026"/)
    assert.doesNotMatch(targetSlice, /" Resuming conversation\\u2026"/)
    assert.match(targetSlice, /message:"Loading conversations\\u2026"/)
    assert.match(targetSlice, /message:"Resuming conversation\\u2026"/)
  },
)

test(
  'resume picker source preserves the complete failure classification graph',
  sourceOptions,
  () => {
    const contents = source()
    assert.match(contents, /let failureAlreadyLogged = false/)
    assert.match(contents, /let failureReason = 'load_error'/)
    assert.match(contents, /failure_reason: 'not_found_picker'/)
    assert.match(contents, /failureAlreadyLogged = true/)
    assert.match(contents, /failureReason = 'processing_error'/)
    assert.match(contents, /if \(!failureAlreadyLogged\)/)
    assert.match(contents, /failure_reason: failureReason/)
    assert.match(contents, /error_name: toError\(e\)\.name/)
    assert.match(
      contents,
      /success: true,[\s\S]*?resume_duration_ms: Math\.round\(performance\.now\(\) - resumeStart\)/,
    )
    assert.match(
      contents,
      /<LoadingState message="Loading conversations…" \/>/,
    )
    assert.match(
      contents,
      /<LoadingState message="Resuming conversation…" \/>/,
    )
    assert.doesNotMatch(contents, /<Spinner \/>/)
    assert.match(
      contents,
      /const existingStandaloneAgentContext = useAppState\(s => s\.standaloneAgentContext\)/,
    )
    assert.match(
      contents,
      /existingStandaloneAgentContext \? \{[\s\S]*?\.\.\.resumedStandaloneAgentContext,[\s\S]*?\.\.\.existingStandaloneAgentContext[\s\S]*?\} : resumedStandaloneAgentContext/,
    )
    assert.match(
      contents,
      /updateSessionName\(standaloneAgentContext\?\.name\)/,
    )
  },
)

test(
  'resume picker logs each failure once with its precise phase',
  sourceOptions,
  async () => {
    const createOnSelect = await compileOnSelect(source())

    const missing = createHarness()
    await assert.rejects(
      createOnSelect(missing.dependencies)({ fullPath: '/tmp/missing.jsonl' }),
      /Failed to load conversation/,
    )
    assert.deepEqual(missing.events, [
      [
        'tengu_session_resumed',
        {
          entrypoint: 'picker',
          success: false,
          failure_reason: 'not_found_picker',
        },
      ],
    ])
    assert.equal(missing.errors.length, 1)

    const loadFailure = createHarness({
      loadConversationForResume: async () => {
        throw new RangeError('bad transcript')
      },
    })
    await assert.rejects(
      createOnSelect(loadFailure.dependencies)({ fullPath: '/tmp/bad.jsonl' }),
      /bad transcript/,
    )
    assert.deepEqual(loadFailure.events[0], [
      'tengu_session_resumed',
      {
        entrypoint: 'picker',
        success: false,
        failure_reason: 'load_error',
        error_name: 'RangeError',
      },
    ])

    const processingFailure = createHarness({
      loadConversationForResume: async () => ({}),
      restoreAgentFromSession: () => {
        throw new TypeError('bad agent metadata')
      },
    })
    await assert.rejects(
      createOnSelect(processingFailure.dependencies)({
        fullPath: '/tmp/processing.jsonl',
      }),
      /bad agent metadata/,
    )
    assert.deepEqual(processingFailure.events[0], [
      'tengu_session_resumed',
      {
        entrypoint: 'picker',
        success: false,
        failure_reason: 'processing_error',
        error_name: 'TypeError',
      },
    ])
  },
)
