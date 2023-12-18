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

const targetUnit = {
  index: 12793,
  start: 9764263,
  end: 9768673,
  nodeType: 'FunctionDeclaration',
  sourceHash:
    'e0a84887c637ba374d920fa4b2717938acf1d15c8a0ada8f84cced3b91962f39',
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

async function extractCompactConversation() {
  const ts = await loadTypeScript()
  const owner = source('services/compact/compact.ts')
  const parsed = ts.createSourceFile(
    'compact.ts',
    owner,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const declaration = parsed.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'compactConversation',
  )
  assert.ok(declaration, 'compactConversation declaration')
  const snippet = declaration.getText(parsed).replace(/^export\s+/, '')
  return ts.transpileModule(
    `${snippet}\nmodule.exports = { compactConversation }`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
}

async function createFailureHarness(preHookError) {
  const telemetry = []
  const sdkStatuses = []
  const notifications = []
  const stubs = {
    ERROR_MESSAGE_NOT_ENOUGH_MESSAGES: 'not enough messages',
    tokenCountWithEstimation: () => 100,
    logPermissionContextForAnts: () => {},
    executePreCompactHooks: async () => {
      throw preHookError
    },
    addErrorNotificationIfNeeded: error => notifications.push(error),
    logCompactionEvent: event => telemetry.push(event),
  }
  const javascript = await extractCompactConversation()
  const module = { exports: {} }
  const names = Object.keys(stubs)
  new Function('module', 'exports', ...names, javascript)(
    module,
    module.exports,
    ...names.map(name => stubs[name]),
  )
  const context = {
    abortController: new AbortController(),
    getAppState: () => ({ toolPermissionContext: {} }),
    onCompactProgress() {},
    setStreamMode() {},
    resetResponseLength() {},
    setResponseLength() {},
    setSDKStatus(status, details) {
      sdkStatuses.push({ status, details })
    },
  }
  return {
    compactConversation: module.exports.compactConversation,
    context,
    notifications,
    sdkStatuses,
    telemetry,
  }
}

test(
  'authenticated target105 introduces the full-compaction completion lifecycle',
  bundleOptions,
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
    const region = structural.regions[targetUnit.index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.sourceHash,
      ],
      [
        targetUnit.start,
        targetUnit.end,
        targetUnit.nodeType,
        targetUnit.sourceHash,
      ],
    )
    const targetOwner = target.slice(targetUnit.start, targetUnit.end)
    assert.equal(sha256(targetOwner), targetUnit.sourceHash)
    assert.doesNotMatch(baseline, /"compaction failed"/)
    assert.match(targetOwner, /"compaction failed"/)
    assert.match(targetOwner, /compactMetadata\.postTokens=/)
    assert.match(targetOwner, /compactMetadata\.durationMs=/)
    assert.match(targetOwner, /trigger:[^,]+\?"auto":"manual",success:/)
    assert.match(targetOwner, /compactResult:/)
    assert.match(latest, /"compaction failed"/)
  },
)

test(
  'source reports a non-Error full-compaction failure from finally',
  sourceOptions,
  async () => {
    const harness = await createFailureHarness('opaque failure')
    await assert.rejects(
      harness.compactConversation(
        [{ type: 'user', uuid: 'user-1', message: { content: 'hi' } }],
        harness.context,
        {},
        false,
      ),
      error => error === 'opaque failure',
    )
    assert.equal(harness.notifications.length, 1)
    assert.equal(harness.telemetry.length, 1)
    assert.deepEqual(harness.telemetry[0], {
      trigger: 'manual',
      success: false,
      durationMs: harness.telemetry[0].durationMs,
      preTokens: 100,
      postTokens: undefined,
      error: 'compaction failed',
    })
    assert.ok(harness.telemetry[0].durationMs >= 0)
    assert.deepEqual(harness.sdkStatuses.at(-1), {
      status: null,
      details: {
        compactResult: 'failed',
        compactError: 'compaction failed',
      },
    })
  },
)

test(
  'source persists completion metadata and orders final lifecycle reporting',
  sourceOptions,
  () => {
    const owner = source('services/compact/compact.ts')
    const functionStart = owner.indexOf(
      'export async function compactConversation',
    )
    const functionEnd = owner.indexOf(
      'export async function partialCompactConversation',
      functionStart,
    )
    const lifecycle = owner.slice(functionStart, functionEnd)
    assert.match(lifecycle, /let compactError: string \| undefined/)
    assert.match(lifecycle, /const startedAt = performance\.now\(\)/)
    assert.match(lifecycle, /preTokens = preCompactTokenCount/)
    assert.match(
      lifecycle,
      /boundaryMarker\.compactMetadata\.postTokens =\s*truePostCompactTokenCount/,
    )
    assert.match(
      lifecycle,
      /boundaryMarker\.compactMetadata\.durationMs = durationMs/,
    )
    assert.match(lifecycle, /postTokens = truePostCompactTokenCount/)
    assert.ok(
      lifecycle.indexOf("onCompactProgress?.({ type: 'compact_end' })") <
        lifecycle.indexOf('logCompactionEvent({'),
    )
    assert.ok(
      lifecycle.indexOf('logCompactionEvent({') <
        lifecycle.indexOf('setSDKStatus?.(null, {'),
    )
  },
)
