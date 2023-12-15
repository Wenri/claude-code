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
    env: 'CLAUDE_CODE_2_1_121_BUNDLE',
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
    skillTools: 0,
    buildSkillTools: 0,
    skillsAsToolsCheck: 0,
    skipReplFilter: 4,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    skillTools: 16,
    buildSkillTools: 1,
    skillsAsToolsCheck: 1,
    skipReplFilter: 4,
  },
]

function readBundle(release) {
  const filename = process.env[release.env]
  assert.ok(filename, `${release.env} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return bytes.toString('utf8')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

test('authenticates target-added skill-tool state and guarded updater', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(occurrences(bundle, 'skillTools'), release.skillTools)
    assert.equal(
      occurrences(bundle, 'buildSkillTools'),
      release.buildSkillTools,
    )
    assert.equal(
      occurrences(bundle, 'isSkillsAsToolsEnabled'),
      release.skillsAsToolsCheck,
    )
    assert.equal(
      occurrences(bundle, 'skipReplFilter'),
      release.skipReplFilter,
    )
  }

  const target = readBundle(releases[1])
  for (const fragment of [
    'skillTools??[]',
    'skillTools.length===',
    '{emitTelemetry:',
    'skillTools.length===0',
  ]) {
    assert.ok(target.includes(fragment), fragment)
  }
})

test('source assembles denied-filtered skill tools after built-ins', () => {
  const tools = compact(source('src/tools.ts'))
  for (const fragment of [
    'skipReplFilter?: boolean',
    'skillTools?: Tools',
    "options?: Pick<ToolPoolOptions, 'skipReplFilter'>",
    'isReplModeEnabled() && !options?.skipReplFilter',
    'const builtInTools = getTools(permissionContext, options)',
    'const skillTools = options?.skillTools ?? []',
    'allowedMcpTools .concat(filterToolsByDenyRules(skillTools, permissionContext)) .sort(byName)',
    '[...builtInTools].sort(byName).concat(allowedDynamicTools)',
  ]) {
    assert.ok(tools.includes(compact(fragment)), fragment)
  }
})

test('source retains exact updater gate, cancellation, filtering, and telemetry', () => {
  const hook = compact(source('src/hooks/useSkillTools.ts'))
  for (const fragment of [
    "const skillToolsModule = feature('SKILLS_AS_TOOLS')",
    'if (!skillToolsModule || !isSkillsAsToolsEnabled()) return',
    'getCommands(getProjectRoot())',
    'if (cancelled) return',
    'const mcpSkills = getMcpSkillCommands(mcpCommands)',
    'filterCommandsBySkillAllowlist( [...localCommands, ...mcpSkills], getSessionSkillAllowlist(), )',
    'if (state.skillTools.length === commands.length) return state',
    'skillToolsModule.buildSkillTools(commands, { emitTelemetry: state.skillTools.length === 0, })',
    '.catch(logError)',
    'cancelled = true',
    '}, [setAppState, mcpCommands])',
  ]) {
    assert.ok(hook.includes(compact(fragment)), fragment)
  }

  const skillTool = compact(source('src/tools/SkillTool/SkillTool.ts'))
  assert.ok(
    skillTool.includes(
      compact(`
        export function isSkillsAsToolsEnabled(): boolean {
          if (feature('SKILLS_AS_TOOLS')) return true
          return false
        }
      `),
    ),
  )

  const attachments = compact(source('src/utils/attachments.ts'))
  assert.ok(
    attachments.includes(
      'if (skillToolsModule?.isSkillsAsToolsEnabled()) { return [] }',
    ),
  )
})

test('source threads skill tools through every authenticated tool-pool callsite', () => {
  const appState = compact(source('src/state/AppStateStore.ts'))
  assert.ok(appState.includes('skillTools: Tool[]'))
  assert.ok(appState.includes('skillTools: []'))
  assert.ok(compact(source('src/main.tsx')).includes('skillTools: []'))

  const merged = compact(source('src/hooks/useMergedTools.ts'))
  assert.ok(merged.includes('state => state.skillTools'))
  assert.ok(merged.includes('assembleToolPool(toolPermissionContext, mcpTools, { skillTools, })'))
  assert.ok(merged.includes('mcpTools, skillTools, toolPermissionContext'))

  const repl = compact(source('src/screens/REPL.tsx'))
  assert.ok(repl.includes('useSkillTools();'))
  assert.ok(
    repl.includes(
      'assembleToolPool(state.toolPermissionContext, state.mcp.tools, { skillTools: state.skillTools })',
    ),
  )

  const print = compact(source('src/cli/print.ts'))
  assert.ok(
    print.includes(
      'assembleToolPool( appState.toolPermissionContext, appState.mcp.tools, { skillTools: appState.skillTools }, )',
    ),
  )

  const agent = compact(source('src/tools/AgentTool/AgentTool.tsx'))
  for (const fragment of [
    'toolUseContext.options.tools.filter(isMcpTool)',
    'currentAppState.mcp.tools.concat(sdkMcpTools)',
    'skipReplFilter: true',
    'skillTools: currentAppState.skillTools',
  ]) {
    assert.ok(agent.includes(compact(fragment)), fragment)
  }

  const resume = compact(source('src/tools/AgentTool/resumeAgent.ts'))
  for (const fragment of [
    'toolUseContext.options.tools.filter(isMcpTool)',
    'currentAppState.mcp.tools.concat(sdkMcpTools)',
    'skipReplFilter: true',
    'skillTools: currentAppState.skillTools',
  ]) {
    assert.ok(resume.includes(compact(fragment)), fragment)
  }
})
