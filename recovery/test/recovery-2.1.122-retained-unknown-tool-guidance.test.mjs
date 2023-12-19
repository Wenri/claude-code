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

function occurrences(value, fragment) {
  return value.split(fragment).length - 1
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function assignedIdentifiers(bundle, value) {
  const identifiers = new Set()
  const matcher = new RegExp(
    `([A-Za-z_$][\\w$]*)="${escapeRegExp(value)}"`,
    'g',
  )
  for (const match of bundle.matchAll(matcher)) identifiers.add(match[1])
  return identifiers
}

function readSetMembers(bundle, identifier) {
  const match = new RegExp(
    `${escapeRegExp(identifier)}=new Set\\(\\[([^\\]]*)\\]\\)`,
  ).exec(bundle)
  assert.ok(match, `set assignment for ${identifier}`)
  return match[1].split(',').map(member => member.trim())
}

function assertSetNames(bundle, identifier, expected, label) {
  const members = readSetMembers(bundle, identifier)
  assert.equal(members.length, expected.length, `${label}: cardinality`)
  for (const name of expected) {
    const identifiers = assignedIdentifiers(bundle, name)
    assert.ok(
      members.some(member => identifiers.has(member)),
      `${label}: ${name}`,
    )
  }
}

const guidanceHelper =
  /function ([\w$]+)\(H,\$,q\)\{if\(([\w$]+)\(\)&&([\w$]+)\.has\(H\)&&([\w$]+)\(\$,([\w$]+)\)\)return`\. \$\{H\} is only available inside \$\{\5\}\. Use \$\{\5\} with code: await \$\{H\}\(\{\.\.\.\}\)\.`;let K=\4\(([\w$]+)\(\),H\);if\(q&&K&&([\w$]+)\.has\(K\.name\)\)return`\. \$\{H\} is not available inside subagents\. Complete the task with the tools provided and return findings to the orchestrator\.`;if\(K\)return`\. \$\{H\} exists but is not enabled in this context\. Use one of the available tools instead\.`;return""\}/

test('authenticated adjacent bundles retain exact unknown-tool guidance and sets', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const helper = guidanceHelper.exec(bundle)
    assert.ok(helper, `${release.version}: exact guidance branch order and copy`)
    const [, helperName, , replOnlySet, , , , subagentSet] = helper

    assertSetNames(
      bundle,
      replOnlySet,
      ['Read', 'Glob', 'Grep', 'Bash', 'PowerShell', 'NotebookEdit'],
      `${release.version}: REPL-only set`,
    )
    assertSetNames(
      bundle,
      subagentSet,
      [
        'TaskOutput',
        'ExitPlanMode',
        'EnterPlanMode',
        'Agent',
        'AskUserQuestion',
      ],
      `${release.version}: subagent-unavailable set`,
    )

    assert.match(
      bundle,
      new RegExp(
        `let D=[\\w$]+\\(_\\),w=${escapeRegExp(helperName)}\\(_,K\\.options\\.tools,K\\.agentId\\);`,
      ),
      `${release.version}: guidance receives exact unavailable-tool context`,
    )
    assert.equal(
      occurrences(bundle, 'No such tool available: ${_}${w}'),
      2,
      `${release.version}: content and toolUseResult both carry guidance`,
    )

    const primitiveTools =
      /function ([\w$]+)\(\)\{if\(([\w$]+)\)return \2;let\{PowerShellTool:H\}=\([\s\S]{0,100}?\);return \2=\[([^\]]+)\]\}/.exec(
        bundle,
      )
    assert.ok(primitiveTools, `${release.version}: REPL primitive tool assembly`)
    const primitiveMembers = primitiveTools[3].split(',').map(value => value.trim())
    assert.equal(primitiveMembers.length, 8, `${release.version}: primitive count`)
    assert.equal(primitiveMembers[6], 'H', `${release.version}: PowerShell position`)
  }
})

test('source reproduces exact REPL and unknown-tool recovery behavior', () => {
  const constants = fs.readFileSync(
    path.join(repo, 'src/tools/REPLTool/constants.ts'),
    'utf8',
  )
  const primitives = fs.readFileSync(
    path.join(repo, 'src/tools/REPLTool/primitiveTools.ts'),
    'utf8',
  )
  const execution = fs.readFileSync(
    path.join(repo, 'src/services/tools/toolExecution.ts'),
    'utf8',
  )

  assert.match(
    constants,
    /REPL_ONLY_TOOLS = new Set\(\[\s*FILE_READ_TOOL_NAME,\s*GLOB_TOOL_NAME,\s*GREP_TOOL_NAME,\s*BASH_TOOL_NAME,\s*POWERSHELL_TOOL_NAME,\s*NOTEBOOK_EDIT_TOOL_NAME,\s*\]\)/,
  )
  assert.match(
    primitives,
    /return \(_primitiveTools \?\?= \[\s*FileReadTool,\s*FileWriteTool,\s*FileEditTool,\s*GlobTool,\s*GrepTool,\s*BashTool,\s*PowerShellTool,\s*NotebookEditTool,\s*\]\)/,
  )
  assert.match(
    execution,
    /SUBAGENT_UNAVAILABLE_TOOLS = new Set\(\[\s*TASK_OUTPUT_TOOL_NAME,\s*EXIT_PLAN_MODE_V2_TOOL_NAME,\s*ENTER_PLAN_MODE_TOOL_NAME,\s*AGENT_TOOL_NAME,\s*ASK_USER_QUESTION_TOOL_NAME,\s*\]\)/,
  )
  assert.match(
    execution,
    /isReplModeEnabled\(\)[\s\S]{0,100}?REPL_ONLY_TOOLS\.has\(toolName\)[\s\S]{0,100}?findToolByName\(availableTools, REPL_TOOL_NAME\)[\s\S]{0,200}?is only available inside \$\{REPL_TOOL_NAME\}\. Use \$\{REPL_TOOL_NAME\} with code: await \$\{toolName\}\(\{\.\.\.\}\)\./,
  )
  assert.match(
    execution,
    /const knownTool = findToolByName\(getAllBaseTools\(\), toolName\)[\s\S]{0,150}?agentId && knownTool && SUBAGENT_UNAVAILABLE_TOOLS\.has\(knownTool\.name\)[\s\S]{0,250}?is not available inside subagents\. Complete the task with the tools provided and return findings to the orchestrator\.[\s\S]{0,150}?if \(knownTool\)[\s\S]{0,200}?exists but is not enabled in this context\. Use one of the available tools instead\./,
  )
  assert.match(
    execution,
    /getUnknownToolRecoveryGuidance\(\s*toolName,\s*toolUseContext\.options\.tools,\s*toolUseContext\.agentId,\s*\)/,
  )
  assert.equal(
    occurrences(execution, '${toolName}${recoveryGuidance}'),
    2,
    'content and toolUseResult both carry recovery guidance',
  )
})
