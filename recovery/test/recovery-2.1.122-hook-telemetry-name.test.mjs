import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = [
  {
    version: '2.1.121',
    envNames: ['CLAUDE_CODE_2_1_121_BUNDLE', 'CLAUDE_2_1_121_CLI_INNER'],
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  {
    version: '2.1.122',
    envNames: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
]

function readBundle(release) {
  const filename = release.envNames.map(name => process.env[name]).find(Boolean)
  assert.ok(filename, `${release.envNames.join(' or ')} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return bytes.toString('utf8')
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function countIdentifier(text, identifier) {
  return [...text.matchAll(new RegExp(`(?<![\\w$])${escapeRegex(identifier)}(?![\\w$])`, 'g'))]
    .length
}

test('authenticates retained hook telemetry privacy and lifecycle semantics', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const exportMatch = bundle.match(/getTelemetryHookName:\(\)=>([\w$]+)/)
    assert.ok(exportMatch, `${release.version}: retained helper export`)
    const helperName = exportMatch[1]
    assert.equal(
      countIdentifier(bundle, helperName),
      3,
      `${release.version}: export, live call, and definition`,
    )

    const helperStart = bundle.indexOf(`function ${helperName}(H,$){`)
    const helperEnd = bundle.indexOf('}}function', helperStart)
    assert.ok(helperStart >= 0 && helperEnd > helperStart)
    const helper = bundle.slice(helperStart, helperEnd + 2)
    assert.match(helper, /if\(!\$\)return H/)
    assert.match(helper, /if\([\w$]+\(\)\)return`\$\{H\}:\$\{\$\}`/)
    assert.match(
      helper,
      /case"PreToolUse":case"PostToolUse":case"PostToolUseFailure":case"PermissionRequest":case"PermissionDenied":return`\$\{H\}:\$\{[\w$]+\(\$\)\}`/,
    )
    assert.match(
      helper,
      /case"Elicitation":case"ElicitationResult":return`\$\{H\}:mcp_server`/,
    )
    assert.match(helper, /case"SubagentStart":return H/)
    assert.match(helper, /default:return`\$\{H\}:\$\{\$\}`/)

    assert.equal(bundle.split('"hook_execution_start"').length - 1, 1)
    assert.equal(bundle.split('"hook_execution_complete"').length - 1, 1)

    const startOffset = bundle.indexOf('"hook_execution_start"')
    const startContext = bundle.slice(startOffset - 450, startOffset + 550)
    const assignment = startContext.match(
      new RegExp(`([\\w$]+)=${escapeRegex(helperName)}\\(([\\w$]+),([\\w$]+)\\);`),
    )
    assert.ok(assignment, `${release.version}: live telemetry-name derivation`)
    const [, telemetryName, hookEvent] = assignment
    assert.ok(
      startContext.includes(
        `"hook_execution_start",{hook_event:${hookEvent},hook_name:${telemetryName}`,
      ),
      `${release.version}: normalized start event name`,
    )
    const definitions = startContext.match(
      /\.\.\.([\w$]+)&&\{hook_definitions:([\w$]+)\}/,
    )
    assert.ok(definitions, `${release.version}: definitions privacy gate`)
    const [, definitionsGate, definitionsJson] = definitions
    assert.match(
      startContext,
      new RegExp(
        `let ${escapeRegex(definitionsGate)}=[\\w$]+\\(\\)&&[\\w$]+\\(\\),${escapeRegex(definitionsJson)}=${escapeRegex(definitionsGate)}\\?`,
      ),
      `${release.version}: beta and tool-detail gates are conjunctive`,
    )
    assert.match(
      startContext,
      new RegExp(
        `[\\w$]+\\(${escapeRegex(hookEvent)},${escapeRegex(telemetryName)},[\\w$]+\\.length,${escapeRegex(definitionsJson)}\\)`,
      ),
      `${release.version}: span uses normalized name and gated definitions`,
    )

    const completeOffset = bundle.indexOf('"hook_execution_complete"')
    const completeContext = bundle.slice(completeOffset - 250, completeOffset + 700)
    assert.match(
      completeContext,
      new RegExp(
        `"hook_execution_complete",\\{hook_event:${escapeRegex(hookEvent)},hook_name:${escapeRegex(telemetryName)},[^}]+total_duration_ms:String\\([\\w$]+\\),[^}]+\\.\\.\\.${escapeRegex(definitionsGate)}&&\\{hook_definitions:${escapeRegex(definitionsJson)}\\}`,
      ),
      `${release.version}: completion retains name, duration, and privacy gate`,
    )
  }
})

test('source reproduces the authenticated hook telemetry contract', () => {
  const source = fs.readFileSync(path.join(repo, 'src/utils/hooks.ts'), 'utf8')
  const helperStart = source.indexOf('export function getTelemetryHookName')
  const executeStart = source.indexOf('async function* executeHooks', helperStart)
  assert.ok(helperStart >= 0 && executeStart > helperStart)
  const helper = source.slice(helperStart, executeStart)
  assert.match(helper, /if \(!matchQuery\) return hookEvent/)
  assert.match(helper, /process\.env\.OTEL_LOG_TOOL_DETAILS/)
  assert.match(helper, /normalizeLegacyToolName\(matchQuery\)/)
  assert.match(helper, /case 'ElicitationResult':[\s\S]+`\$\{hookEvent\}:mcp_server`/)
  assert.match(helper, /case 'SubagentStart':[\s\S]+return hookEvent/)

  const execute = source.slice(executeStart, source.indexOf('function hasBlockingResult', executeStart))
  assert.match(
    execute,
    /const includeHookDefinitions =\s*isBetaTracingEnabled\(\) &&\s*isEnvTruthy\(process\.env\.OTEL_LOG_TOOL_DETAILS\)/,
  )
  assert.match(
    execute,
    /const telemetryHookName = getTelemetryHookName\(hookEvent, matchQuery\)/,
  )
  assert.equal(execute.split("logOTelEvent('hook_execution_start'").length - 1, 1)
  assert.equal(
    execute.split("logOTelEvent('hook_execution_complete'").length - 1,
    1,
  )
  assert.equal(execute.match(/hook_name: telemetryHookName/g)?.length, 2)
  assert.match(
    execute,
    /startHookSpan\(\s*hookEvent,\s*telemetryHookName,\s*matchingHooks\.length,\s*hookDefinitionsJson/,
  )
  assert.match(execute, /total_duration_ms: String\(totalDurationMs\)/)
  assert.equal(
    execute.match(/includeHookDefinitions && \{\s*hook_definitions: hookDefinitionsJson/g)
      ?.length,
    2,
  )
})
