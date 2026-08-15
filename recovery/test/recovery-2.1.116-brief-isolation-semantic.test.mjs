import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
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

const targetUnits = new Map([
  [2539, [1047459, 1048613, '604108aae54eeac5a369253b5711a287d4c7fb9d2b832f948d8b4859d79d1332']],
  [10204, [5094471, 5097294, '6d1b713cf64593e4a9163ec077d1dcac73d0cd3049dbecbfc33aa08f91f10bea']],
  [10205, [5097294, 5099099, '9afa5fee7bf998146fc643ef1011e26585b69ea7e69226bc82b9bfe3dad7ba66']],
  [13098, [8349918, 8349961, 'ba32cf283e8107f0005825a650b44a9ab4a662f9478e163ae35f43c5bc8e3dbc']],
  [13099, [8349961, 8350456, 'e83b7626ab840b2a2079131c507dca66b72e52292a7e2ee649abfb2ae98e8c48']],
  [13100, [8350456, 8351096, 'bbbd7a71edb22c30998dcc31e06c42cd39e2406d1ced49cc4c928d131ea9a396']],
  [13116, [8353305, 8355917, 'e260b12d15e2b52eb841b8e6ba741b432e3020a0b7a12c0744c788371e49fa4c']],
  [13150, [8374449, 8374485, 'cd7f973e42e9cb9e219aad86e4ff3877531ba8e5857e1a8d2dea7ea63638e1fe']],
  [13151, [8374485, 8374528, '07aa7eac78bd72dedb593576778ba1c4617efaa81e501a91dede09899c82c7fe']],
  [13152, [8374528, 8374698, 'c745cdcbbbf26deb4d613a18cab9efc512fdd53d0785b4c136fa2799edb5a140']],
  [13153, [8374698, 8375032, '96df37317367f8fb86bf1c478bdce7711c398f39f7b5cc815382c6fc22af59d1']],
  [13154, [8375032, 8375284, '2be9c87a94f57c19585746202d428688c61c81eb4fa387e0a105d610d7ea1c4e']],
  [13155, [8375284, 8375362, '195e02ca865630341729417967c6afade90ac0b14be3438dd2bb1c8801174997']],
  [13156, [8375362, 8375564, 'a67b9f25029832df83aa62e6a96fa56cab8971fd167ae78e323ec3a3420d412d']],
  [13159, [8375717, 8378513, '65f6e56cd680c8ecd0d5d1f3aa8f7fbc3e962bd11eb041acb97e0b31a1d4536c']],
  [13601, [8586553, 8588732, '62a96aeaaa746d9e3d4a9c34135a8e5d704e9c5cee7b618fc3a41ccb44593489']],
  [15223, [9451392, 9453094, 'f2f860efd6f8a4ac3486f585ef8751a4549aa7d69a03c2c4c440782f7ec68491']],
  [19633, [11942570, 11946541, '6e095d3eaced786b4c3cc6d4c3727903f100c1a427b312d7bb36d4be899ca003']],
  [19998, [12102133, 12160049, '3b17ff0bd496c0d7f39baa8f2542135ed7dd3f220d3f6a628ae7f7040c9492c5']],
  [20550, [12884238, 12902574, '66c82ff554ca98afc25ad653983a1e8d357060b2390ce8bfd5203dfc0a34299f']],
  [20551, [12902574, 12904038, '86896c375cd21e5347ddefdda4b773935e096c60a9e13ccde0a32e44709f8f8f']],
  [20581, [12915603, 12954120, '66fa02021a22925ae2e3eb6c757c5a9e91a25ecb102ebe0ed8bdd47efeb44ce2']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function assertFragments(relative, fragments) {
  const contents = source(relative)
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
  }
  return contents
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

async function compileCommonJS(sourceText) {
  const ts = await loadTypeScript()
  return ts.transpileModule(sourceText, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
}

async function loadIsolationFunctions() {
  const owner = source('src/utils/toolIsolation.ts')
  const start = owner.indexOf('const ENFORCE_WEB_SEARCH_MCP_ISOLATION')
  assert.ok(start >= 0, 'tool-isolation implementation range')
  const preamble = `
const getFeatureValue_CACHED_MAY_BE_STALE = () => true;
const isPolicyAllowed = () => true;
const normalizeNameForMCP = value => value.replace(/[^a-zA-Z0-9_-]/g, '_');
const LIST_MCP_RESOURCES_TOOL_NAME = 'ListMcpResourcesTool';
const WEB_FETCH_TOOL_NAME = 'WebFetch';
const WEB_SEARCH_TOOL_NAME = 'WebSearch';
`
  const javascript = await compileCommonJS(`${preamble}\n${owner.slice(start)}`)
  const module = { exports: {} }
  new Function('exports', 'module', javascript)(module.exports, module)
  return module.exports
}

async function loadAttachmentFunctions() {
  const owner = source('src/tools/BriefTool/attachments.ts')
  const start = owner.indexOf('export type PreResolvedAttachment')
  assert.ok(start >= 0, 'attachment implementation range')
  const preamble = `
let statCalls = 0;
const getCwd = () => '/cwd';
const stat = async () => { statCalls += 1; throw new Error('unexpected stat'); };
const feature = () => { throw new Error('unexpected feature gate'); };
const isEnvTruthy = () => false;
const getErrnoCode = () => undefined;
const expandPath = value => value;
const IMAGE_EXTENSION_REGEX = /\\.(png|jpg)$/i;
exports.__getStatCalls = () => statCalls;
`
  const javascript = await compileCommonJS(`${preamble}\n${owner.slice(start)}`)
  const module = { exports: {} }
  new Function('exports', 'module', 'require', javascript)(
    module.exports,
    module,
    () => {
      throw new Error('unexpected dynamic import')
    },
  )
  return module.exports
}

test('target116 pins every Brief attachment and isolation structural unit', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
  )
  assert.equal(
    sha256(targetBytes),
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
  )
  const target = targetBytes.toString('utf8')
  for (const [index, identity] of targetUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
      `${index}: structural identity`,
    )
    const unit = target.slice(identity[0], identity[1])
    assert.equal(sha256(unit), identity[2], `${index}: target bytes`)
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
      1,
      `${index}: one top-level statement`,
    )
  }
})

test('the attachment object and isolation policy are introduced at 114 to 116', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  for (const introduced of [
    'pass that object through verbatim',
    'enforce_web_search_mcp_isolation',
    'tengu_doorbell_agave',
    'tengu_tool_use_isolation_latch_denied',
    'isolationLatch',
  ]) {
    assert.equal(baseline.includes(introduced), false, `${introduced}: baseline`)
    assert.equal(target.includes(introduced), true, `${introduced}: target`)
  }
})

test('source accepts and preserves device-uploaded Brief attachments', sourceOptions, async () => {
  assertFragments('src/tools/BriefTool/prompt.ts', [
    'accepts two forms per entry',
    '{file_uuid, file_name, size, is_image}',
    'pass that object through verbatim',
  ])
  assertFragments('src/tools/BriefTool/BriefTool.ts', [
    'z.union([',
    'file_uuid: z.string()',
    'file_name: z.string()',
    'is_image: z.boolean()',
    'Passed through without local stat or upload.',
  ])
  assertFragments('src/tools/BriefTool/attachments.ts', [
    "return typeof attachment !== 'string'",
    'if (isPreResolvedAttachment(rawPath)) continue',
    'path: rawPath.file_name',
    'isImage: rawPath.is_image',
    'if (localAttachmentIndices.length === 0) return stated',
    'Boolean(process.env.CLAUDE_CODE_REMOTE_ENVIRONMENT_TYPE)',
  ])

  const attachments = await loadAttachmentFunctions()
  const input = {
    file_uuid: 'uuid-1',
    file_name: 'camera.png',
    size: 123,
    is_image: true,
  }
  assert.deepEqual(await attachments.validateAttachmentPaths([input]), {
    result: true,
  })
  assert.deepEqual(
    await attachments.resolveAttachments([input], {
      replBridgeEnabled: false,
    }),
    [
      {
        path: 'camera.png',
        size: 123,
        isImage: true,
        file_uuid: 'uuid-1',
      },
    ],
  )
  assert.equal(attachments.__getStatCalls(), 0)
})

test('source enforces the exact session latch classification and denial behavior', sourceOptions, async () => {
  assertFragments('src/utils/toolIsolation.ts', [
    "'tengu_doorbell_agave'",
    "'enforce_web_search_mcp_isolation'",
    "'cowork'",
    "'workspace'",
    "'session-info'",
    "'mcp-registry'",
    "'plugins'",
    "'scheduled-tasks'",
    "'dispatch'",
    "'ide'",
    'tool.mcpInfo?.serverName',
    "tool.name.startsWith('mcp__')",
    'getToolIsolationDenialMessage(activeLatch)',
  ])

  const isolation = await loadIsolationFunctions()
  const webLatch = isolation.createToolIsolationLatch()
  assert.deepEqual(
    isolation.evaluateToolIsolation({ name: 'WebSearch' }, { isolationLatch: webLatch }),
    { denyMessage: null, classifiedAs: 'web', activeLatch: 'web' },
  )
  assert.equal(webLatch.current, 'web')
  assert.deepEqual(
    isolation.evaluateToolIsolation(
      { name: 'mcp__workspace__read' },
      { isolationLatch: webLatch },
    ),
    { denyMessage: null, classifiedAs: null, activeLatch: null },
  )
  const connectorDenied = isolation.evaluateToolIsolation(
    { name: 'mcp__github__get_pr' },
    { isolationLatch: webLatch },
  )
  assert.equal(connectorDenied.classifiedAs, 'connectors')
  assert.equal(connectorDenied.activeLatch, 'web')
  assert.equal(
    connectorDenied.denyMessage,
    "Connectors are unavailable in this session under your organization's web search / connector isolation policy. Start a new session to use connectors.",
  )

  const connectorLatch = isolation.createToolIsolationLatch()
  assert.equal(
    isolation.evaluateToolIsolation(
      { name: 'ReadMcpResourceTool' },
      { isolationLatch: connectorLatch },
    ).denyMessage,
    null,
  )
  const webDenied = isolation.evaluateToolIsolation(
    { name: 'WebFetch' },
    { isolationLatch: connectorLatch },
  )
  assert.equal(
    webDenied.denyMessage,
    "Web search is unavailable in this session under your organization's web search / connector isolation policy. Start a new session to use web search.",
  )
})

test('source threads the latch through direct, REPL, subagent, clear, and headless paths', sourceOptions, () => {
  const direct = assertFragments('src/services/tools/toolExecution.ts', [
    'const isolation = evaluateToolIsolation(tool, toolUseContext)',
    "logEvent('tengu_tool_use_isolation_latch_denied'",
    'isolationLatch: isolation.activeLatch',
    'isolationClassifiedAs: isolation.classifiedAs',
    '<tool_use_error>${isolation.denyMessage}</tool_use_error>',
  ])
  assert.ok(
    direct.indexOf('const isolation = evaluateToolIsolation') <
      direct.indexOf('streamedCheckPermissionsAndCallTool('),
  )

  const repl = assertFragments('src/tools/REPLTool/REPLTool.ts', [
    'const isolation = evaluateToolIsolation(tool, context)',
    'replInnerCall: true',
    'return fail(isolation.denyMessage)',
  ])
  assert.ok(
    repl.indexOf('const isolation = evaluateToolIsolation') <
      repl.indexOf('runPreToolUseHooks('),
  )

  assertFragments('src/Tool.ts', ['isolationLatch?: ToolIsolationLatch'])
  assertFragments('src/utils/forkedAgent.ts', [
    'isolationLatch?: ToolUseContext',
    'overrides?.isolationLatch ?? parentContext.isolationLatch',
  ])
  assertFragments('src/tools/AgentTool/runAgent.ts', [
    'current: toolUseContext.isolationLatch?.current ?? null',
  ])
  assertFragments('src/commands/clear/conversation.ts', [
    'if (isolationLatch && preservedAgentIds.size === 0)',
    'isolationLatch.current = null',
  ])
  assertFragments('src/screens/REPL.tsx', [
    'useRef(createToolIsolationLatch())',
    'isolationLatch: isolationLatch.current',
  ])
  assertFragments('src/QueryEngine.ts', [
    'private isolationLatch: ToolIsolationLatch',
    'config.isolationLatch ?? createToolIsolationLatch()',
    'isolationLatch: this.isolationLatch',
  ])
  assertFragments('src/cli/print.ts', [
    'const isolationLatch = createToolIsolationLatch()',
    'isolationLatch,',
  ])
  assertFragments('src/components/ultraplan/UltraplanChoiceDialog.tsx', [
    'isolationLatch?: ToolIsolationLatch',
    'isolationLatch,',
  ])
})
