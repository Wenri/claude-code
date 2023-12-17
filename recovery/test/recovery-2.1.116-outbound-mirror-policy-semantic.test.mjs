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
const sourceTest = selected ? test : test.skip
const bundleTest = selected && baselinePath && targetPath ? test : test.skip

const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'
const baselineUnit = {
  index: 18_361,
  nodeType: 'FunctionDeclaration',
  start: 11_371_401,
  end: 11_375_234,
  sourceHash:
    '54ebbe27c878b664496f301575b31c1dc5549f8f48b0b48e2e341267fab415b5',
}
const targetUnit = {
  index: 18_572,
  nodeType: 'FunctionDeclaration',
  start: 11_447_760,
  end: 11_451_834,
  sourceHash:
    'd61c3820bef269b0584b13c7e379e4ddc8e5b2b5a56e0391ff53f5341e9623dd',
}
const mirrorPolicy = 'allow_remote_sessions'
const debugMessage =
  '[bridge:repl] Skipping mirror: allow_remote_sessions policy not allowed'
const userMessage = "disabled by your organization's policy"

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

async function compileInitReplBridge(dependencies) {
  const ts = await loadTypeScript()
  const owner = source('bridge/initReplBridge.ts')
  const sourceFile = ts.createSourceFile(
    'initReplBridge.ts',
    owner,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const declaration = sourceFile.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'initReplBridge',
  )
  assert.ok(declaration, 'initReplBridge declaration')
  const isolated = owner
    .slice(declaration.getStart(sourceFile), declaration.end)
    .replace(/^export /, '')
  const javascript = ts.transpileModule(isolated, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const dependencyNames = Object.keys(dependencies)
  return new Function(
    ...dependencyNames,
    `${javascript}\nreturn initReplBridge`,
  )(...dependencyNames.map(name => dependencies[name]))
}

async function runPolicyPath({ outboundOnly, remoteSessionsAllowed }) {
  const policyChecks = []
  const bridgeSkips = []
  const stateChanges = []
  let bridgeBaseUrlCalls = 0
  let organizationCalls = 0
  const dependencies = {
    setCseShimGate: () => {},
    isCseShimEnabled: () => true,
    isBridgeEnabledBlocking: async () => true,
    getBridgeAccessToken: () => 'token',
    logBridgeSkip: (...args) => bridgeSkips.push(args),
    waitForPolicyLimitsToLoad: async () => {},
    isPolicyAllowed: policy => {
      policyChecks.push(policy)
      return policy === 'allow_remote_control' || remoteSessionsAllowed
    },
    getBridgeTokenOverride: () => 'override-token',
    getBridgeBaseUrl: () => {
      bridgeBaseUrlCalls++
      return 'https://bridge.invalid'
    },
    getBridgeSessionNamePrefix: () => 'host',
    generateShortWordSlug: () => 'slug',
    getSessionId: () => undefined,
    getCurrentSessionTitle: () => undefined,
    getFeatureValue_CACHED_WITH_REFRESH: (_name, fallback) => fallback,
    getOrganizationUUID: async () => {
      organizationCalls++
      return undefined
    },
  }
  const initReplBridge = await compileInitReplBridge(dependencies)
  const result = await initReplBridge({
    outboundOnly,
    onStateChange: (...args) => stateChanges.push(args),
  })
  return {
    result,
    policyChecks,
    bridgeSkips,
    stateChanges,
    bridgeBaseUrlCalls,
    organizationCalls,
  }
}

bundleTest('authenticated 114→116 adds the outbound mirror policy denial', () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(baselineBytes.length, 12_986_755)
  assert.equal(targetBytes.length, 13_102_272)
  assert.equal(sha256(baselineBytes), baselineSha256)
  assert.equal(sha256(targetBytes), targetSha256)
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  const baselineRegion = structural.unmatchedBaseline.find(
    candidate => candidate.index === baselineUnit.index,
  )
  assert.ok(baselineRegion, `baseline unit ${baselineUnit.index}`)
  assert.deepEqual(
    [
      baselineRegion.nodeType,
      baselineRegion.start,
      baselineRegion.end,
      baselineRegion.sourceHash,
    ],
    [
      baselineUnit.nodeType,
      baselineUnit.start,
      baselineUnit.end,
      baselineUnit.sourceHash,
    ],
  )
  assert.equal(
    sha256(baseline.slice(baselineUnit.start, baselineUnit.end)),
    baselineUnit.sourceHash,
  )

  const targetRegion = structural.regions.find(
    candidate => candidate.target?.index === targetUnit.index,
  )
  assert.ok(targetRegion, `target unit ${targetUnit.index}`)
  assert.equal(targetRegion.classification, 'unresolved')
  assert.deepEqual(
    [
      targetRegion.target.nodeType,
      targetRegion.target.start,
      targetRegion.target.end,
      targetRegion.target.sourceHash,
    ],
    [
      targetUnit.nodeType,
      targetUnit.start,
      targetUnit.end,
      targetUnit.sourceHash,
    ],
  )
  const baselineFunction = baseline.slice(baselineUnit.start, baselineUnit.end)
  const targetFunction = target.slice(targetUnit.start, targetUnit.end)
  assert.equal(sha256(targetFunction), targetUnit.sourceHash)
  assert.equal(baselineFunction.includes(mirrorPolicy), false)
  assert.equal(baselineFunction.includes(debugMessage), false)
  assert.equal(targetFunction.includes(mirrorPolicy), true)
  assert.equal(targetFunction.includes(debugMessage), true)
  assert.equal(target.slice(11_448_933, 11_448_956), JSON.stringify(mirrorPolicy))
  assert.equal(target.slice(11_448_984, 11_449_057), JSON.stringify(debugMessage))
  assert.equal(target.slice(11_449_072, 11_449_112), JSON.stringify(userMessage))
})

sourceTest('source keeps the mirror denial between the two shared startup gates', () => {
  const owner = source('bridge/initReplBridge.ts')
  const remoteControl = owner.indexOf("isPolicyAllowed('allow_remote_control')")
  const mirror = owner.indexOf("outboundOnly && !isPolicyAllowed('allow_remote_sessions')")
  const tokenOverride = owner.indexOf('if (!getBridgeTokenOverride())')
  assert.ok(remoteControl >= 0)
  assert.ok(mirror > remoteControl)
  assert.ok(tokenOverride > mirror)
  assert.match(
    owner.slice(mirror, tokenOverride),
    /logBridgeSkip\(\s*'policy_denied',\s*'\[bridge:repl\] Skipping mirror: allow_remote_sessions policy not allowed',\s*\)/,
  )
  assert.match(
    owner.slice(mirror, tokenOverride),
    /onStateChange\?\.\('failed', "disabled by your organization's policy"\)/,
  )
})

sourceTest(
  'actual bridge initializer denies outbound mirrors but leaves inbound startup unchanged',
  async () => {
    const denied = await runPolicyPath({
      outboundOnly: true,
      remoteSessionsAllowed: false,
    })
    assert.equal(denied.result, null)
    assert.deepEqual(denied.policyChecks, [
      'allow_remote_control',
      'allow_remote_sessions',
    ])
    assert.deepEqual(denied.bridgeSkips, [
      ['policy_denied', debugMessage],
    ])
    assert.deepEqual(denied.stateChanges, [['failed', userMessage]])
    assert.equal(denied.bridgeBaseUrlCalls, 0)
    assert.equal(denied.organizationCalls, 0)

    const inbound = await runPolicyPath({
      outboundOnly: false,
      remoteSessionsAllowed: false,
    })
    assert.equal(inbound.result, null)
    assert.deepEqual(inbound.policyChecks, ['allow_remote_control'])
    assert.equal(
      inbound.bridgeSkips.some(([, message]) => message === debugMessage),
      false,
    )
    assert.deepEqual(inbound.stateChanges, [['failed', '/login']])
    assert.equal(inbound.bridgeBaseUrlCalls, 1)
    assert.equal(inbound.organizationCalls, 1)
  },
)
