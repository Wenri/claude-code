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
  exports: {
    index: 17874,
    start: 11058512,
    end: 11060176,
    sourceHash:
      'e73e815dac4b867af32d78e3590bffc8e96f14f5793b957edf9bdab4ebaf4c77',
  },
  runner: {
    index: 17901,
    start: 11078951,
    end: 11091249,
    sourceHash:
      '888c9d81f41cac37b1287295721bb579941214de269c6244dacbbe60e1ee2cc7',
  },
}

const targetUnits = {
  exports: {
    index: 18068,
    start: 11131060,
    end: 11132794,
    sourceHash:
      '9121660a115647e9cf31fba5953bf0a8b57fc7c25d37e190ee0a7d14addfbfd2',
  },
  runner: {
    index: 18095,
    start: 11151905,
    end: 11164233,
    sourceHash:
      '6aa1ccca77f46c393c664e59250acb40badfb2a0b615a89fdc5c92a270b435f7',
  },
  helper: {
    index: 18105,
    start: 11172156,
    end: 11172476,
    sourceHash:
      '40ab33ff221b7fd804a9dcf5fd6636fa0fd35f27772e48369521507e48964e13',
  },
}

const telemetryProperty = {
  typedAuditRow: 863,
  start: 11131322,
  end: 11131342,
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

async function authoredFunction(name) {
  const ts = await loadTypeScript()
  const owner = source('src/utils/hooks.ts')
  const sourceFile = ts.createSourceFile(
    'hooks.ts',
    owner,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const declaration = sourceFile.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  )
  assert.ok(declaration, `${name} declaration`)
  return {
    owner,
    source: owner.slice(declaration.getStart(sourceFile), declaration.end),
  }
}

async function instantiateTelemetryNameHelper() {
  const ts = await loadTypeScript()
  const authored = await authoredFunction('getTelemetryHookName')
  const javascript = ts.transpileModule(authored.source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const module = { exports: {} }
  let detailsEnabled = false
  new Function(
    'exports',
    'module',
    'isToolDetailsLoggingEnabled',
    'sanitizeToolNameForAnalytics',
    javascript,
  )(
    module.exports,
    module,
    () => detailsEnabled,
    toolName => (toolName.startsWith('mcp__') ? 'mcp_tool' : toolName),
  )
  return {
    getTelemetryHookName: module.exports.getTelemetryHookName,
    setDetailsEnabled(value) {
      detailsEnabled = value
    },
  }
}

test(
  'target116 authenticates the hook telemetry export, helper, and runner',
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
      target.slice(telemetryProperty.start, telemetryProperty.end),
      'getTelemetryHookName',
      `typed-audit row ${telemetryProperty.typedAuditRow}`,
    )

    const baselineExport = baseline.slice(
      baselineUnits.exports.start,
      baselineUnits.exports.end,
    )
    const targetExport = target.slice(
      targetUnits.exports.start,
      targetUnits.exports.end,
    )
    assert.doesNotMatch(baselineExport, /getTelemetryHookName/)
    const helperBinding = targetExport.match(
      /getTelemetryHookName:\(\)=>([A-Za-z_$][\w$]*)/,
    )?.[1]
    assert.ok(helperBinding, 'minified helper export binding')

    const helper = target.slice(targetUnits.helper.start, targetUnits.helper.end)
    assert.match(helper, new RegExp(`function ${helperBinding}\\(`))
    for (const fragment of [
      'PreToolUse',
      'PostToolUse',
      'PostToolUseFailure',
      'PermissionRequest',
      'PermissionDenied',
      'Elicitation',
      'ElicitationResult',
      'mcp_server',
      'SubagentStart',
    ]) {
      assert.ok(helper.includes(fragment), fragment)
    }

    const baselineRunner = baseline.slice(
      baselineUnits.runner.start,
      baselineUnits.runner.end,
    )
    const targetRunner = target.slice(
      targetUnits.runner.start,
      targetUnits.runner.end,
    )
    assert.match(baselineRunner, /hook_name:[A-Za-z_$][\w$]*/)
    assert.doesNotMatch(baselineRunner, new RegExp(`${helperBinding}\\(`))
    assert.match(targetRunner, new RegExp(`${helperBinding}\\(`))
    assert.match(targetRunner, /hook_execution_start/)
    assert.match(targetRunner, /hook_execution_complete/)
    assert.match(targetRunner, /total_duration_ms/)
    assert.match(targetRunner, /hook_definitions/)
  },
)

test(
  'source telemetry hook names preserve utility while redacting private matchers',
  sourceOptions,
  async () => {
    const helper = await instantiateTelemetryNameHelper()

    const redacted = [
      ['PreToolUse', undefined, 'PreToolUse'],
      ['PreToolUse', 'Bash', 'PreToolUse:Bash'],
      ['PostToolUse', 'mcp__private__read', 'PostToolUse:mcp_tool'],
      [
        'PostToolUseFailure',
        'mcp__private__read',
        'PostToolUseFailure:mcp_tool',
      ],
      [
        'PermissionRequest',
        'mcp__private__write',
        'PermissionRequest:mcp_tool',
      ],
      [
        'PermissionDenied',
        'mcp__private__write',
        'PermissionDenied:mcp_tool',
      ],
      ['Elicitation', 'private-server', 'Elicitation:mcp_server'],
      [
        'ElicitationResult',
        'private-server',
        'ElicitationResult:mcp_server',
      ],
      ['SubagentStart', 'private-agent', 'SubagentStart'],
      ['Notification', 'idle_prompt', 'Notification:idle_prompt'],
    ]
    for (const [event, matcher, expected] of redacted) {
      assert.equal(helper.getTelemetryHookName(event, matcher), expected)
    }

    helper.setDetailsEnabled(true)
    for (const [event, matcher] of [
      ['PostToolUse', 'mcp__private__read'],
      ['Elicitation', 'private-server'],
      ['SubagentStart', 'private-agent'],
    ]) {
      assert.equal(
        helper.getTelemetryHookName(event, matcher),
        `${event}:${matcher}`,
      )
    }
  },
)

test(
  'source routes sanitized names through OTEL and spans without exposing definitions',
  sourceOptions,
  async () => {
    const { owner } = await authoredFunction('getTelemetryHookName')
    const runnerStart = owner.indexOf('async function* executeHooks(')
    const runnerEnd = owner.indexOf('\nexport type HookOutsideReplResult', runnerStart)
    assert.ok(runnerStart >= 0, 'executeHooks declaration')
    assert.ok(runnerEnd > runnerStart, 'executeHooks boundary')
    const runner = owner.slice(runnerStart, runnerEnd)

    assert.match(
      runner,
      /isBetaTracingEnabled\(\) && isToolDetailsLoggingEnabled\(\)/,
    )
    assert.match(
      runner,
      /const telemetryHookName = getTelemetryHookName\(hookEvent, matchQuery\)/,
    )
    assert.equal(
      runner.match(/hook_name: telemetryHookName/g)?.length,
      2,
      'start and completion OTEL events use the privacy-safe name',
    )
    assert.match(runner, /startHookSpan\(\s*hookEvent,\s*telemetryHookName,/)
    assert.equal(
      runner.match(/shouldLogHookDefinitions &&/g)?.length,
      2,
      'hook definitions are gated on both start and completion events',
    )
    assert.match(runner, /total_duration_ms: String\(totalDurationMs\)/)
    assert.match(
      runner,
      /data: \{\s*type: 'hook_progress',[\s\S]*?hookName,/,
      'the user-facing progress name remains unchanged',
    )
  },
)
