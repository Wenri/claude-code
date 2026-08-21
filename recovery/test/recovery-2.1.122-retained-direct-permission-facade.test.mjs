import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = {
  baseline: {
    names: ['CLAUDE_CODE_2_1_121_BUNDLE', 'CLAUDE_2_1_121_CLI_INNER'],
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  target: {
    names: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
}

function loadBundle({ names, bytes, sha256 }) {
  const filename = names.map(name => process.env[name]).find(Boolean)
  assert.ok(filename, `${names.join(' or ')} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, bytes)
  assert.equal(crypto.createHash('sha256').update(value).digest('hex'), sha256)
  return value.toString('utf8')
}

function count(bundle, pattern) {
  return bundle.match(pattern)?.length ?? 0
}

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

test('authenticated adjacent releases use the direct permission facade at active callsites', () => {
  for (const [name, release] of Object.entries(releases)) {
    const bundle = loadBundle(release)
    assert.equal(
      count(
        bundle,
        /=[\w$]+\.getAppState\(\),[\w$]+=[\w$]+\.getToolPermissionContext\(\)\.mode,[\w$]+=/g,
      ),
      1,
      `${name}: query setup permission mode`,
    )
    assert.equal(
      count(
        bundle,
        /options:\{async getToolPermissionContext\(\)\{return [\w$]+\.getToolPermissionContext\(\)\},model:/g,
      ),
      1,
      `${name}: query model-call getter`,
    )
    assert.equal(
      count(
        bundle,
        /let [\w$]+=[\w$]+\.getToolPermissionContext\(\)\.mode,[\w$]+=Date\.now\(\),[\w$]+=await/g,
      ),
      1,
      `${name}: tool permission timing mode`,
    )
    assert.equal(
      count(
        bundle,
        /let\{activeAgents:[\w$]+,allowedAgentTypes:[\w$]+\}=[\w$]+\.options\.agentDefinitions,[\s\S]{0,300}?\.getToolPermissionContext\(\),/g,
      ),
      1,
      `${name}: agent-list filter context`,
    )
    assert.equal(
      count(
        bundle,
        /toolPermissionContext:[\w$]+\.getToolPermissionContext\(\),abortSignal:/g,
      ),
      3,
      `${name}: three handoff classifiers`,
    )
    assert.equal(
      count(
        bundle,
        /permissionMode:[\w$]+\([\w$]+\.getToolPermissionContext\(\)\.mode,!1\)/g,
      ),
      1,
      `${name}: autofix teammate mode`,
    )
    assert.equal(
      count(
        bundle,
        /async validateInput\([^)]*,\{getToolPermissionContext:[\w$]+,options:[\w$]+\}\)[\s\S]{0,260}?\.mode;if\([\w$]+!=="plan"\)return [\w$]+\("tengu_exit_plan_mode_called_outside_plan"/g,
      ),
      1,
      `${name}: exit-plan validation`,
    )
    assert.equal(
      count(
        bundle,
        /async function [\w$]+\([^)]*\)\{let [\w$]+=[\w$]+\.getToolPermissionContext\(\),[\w$]+=[\w$]+\.command\.trim\(\);if\(![\w$]+\)return\{behavior:"allow",updatedInput:[\w$]+,decisionReason:\{type:"other",reason:"Empty command is safe"/g,
      ),
      1,
      `${name}: PowerShell permission context`,
    )
    const notification = bundle.indexOf(
      'key:"auto-mode-gate-plan-exit-fallback"',
    )
    assert.notEqual(notification, -1, `${name}: plan-exit notification anchor`)
    assert.match(
      bundle.slice(notification, notification + 1_600),
      /\.getToolPermissionContext\(\);if\([\w$]+\.mode==="plan"\)/,
      `${name}: exit-plan transition context`,
    )
  }
})

test('source routes active permission reads through ToolUseContext', () => {
  const query = source('src/query.ts')
  const execution = source('src/services/tools/toolExecution.ts')
  const attachments = source('src/utils/attachments.ts')
  const agentUtils = source('src/tools/AgentTool/agentToolUtils.ts')
  const agentTool = source('src/tools/AgentTool/AgentTool.tsx')
  const autofix = source('src/commands/autofix-pr/autofix-pr.tsx')
  const powershell = source('src/tools/PowerShellTool/powershellPermissions.ts')
  const exitPlan = source(
    'src/tools/ExitPlanModeTool/ExitPlanModeV2Tool.ts',
  )

  assert.match(
    query,
    /const appState = toolUseContext\.getAppState\(\)\s*const permissionMode = toolUseContext\.getToolPermissionContext\(\)\.mode/,
  )
  assert.match(
    query,
    /async getToolPermissionContext\(\) \{\s*return toolUseContext\.getToolPermissionContext\(\)/,
  )
  assert.match(
    execution,
    /const permissionMode = toolUseContext\.getToolPermissionContext\(\)\.mode/,
  )
  assert.match(
    attachments,
    /const permissionContext = toolUseContext\.getToolPermissionContext\(\)/,
  )
  assert.match(
    agentUtils,
    /toolPermissionContext: toolUseContext\.getToolPermissionContext\(\)/,
  )
  assert.equal(
    count(
      agentTool,
      /toolPermissionContext: toolUseContext\.getToolPermissionContext\(\)/g,
    ),
    2,
  )
  assert.match(
    autofix,
    /normalizeAgentPermissionMode\(\s*context\.getToolPermissionContext\(\)\.mode/,
  )
  assert.match(
    powershell,
    /const toolPermissionContext = context\.getToolPermissionContext\(\)/,
  )
  assert.match(
    exitPlan,
    /validateInput\(_input, \{ getToolPermissionContext, options \}\)[\s\S]{0,500}?const mode = getToolPermissionContext\(\)\.mode/,
  )
  assert.match(
    exitPlan,
    /const currentPermissionContext = context\.getToolPermissionContext\(\)\s*if \(currentPermissionContext\.mode === 'plan'\)/,
  )
})
