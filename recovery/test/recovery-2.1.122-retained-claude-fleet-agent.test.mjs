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
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
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

function source(relative) {
  return fs.readFileSync(path.join(repo, relative), 'utf8')
}

test('authenticates the retained Claude fleet agent and all default-template edges', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const definition = bundle.match(
      /([A-Za-z_$][\w$]*)=\{agentType:"claude",whenToUse:"Catch-all for any task that doesn't fit a more specific agent\. FleetView's default when no agent name is typed\.",tools:\["\*"\],source:"built-in",baseDir:"built-in",appendSystemPrompt:!0,\.\.\.\{permissionMode:"auto"\},isolation:"worktree",getSystemPrompt:\(\)=>`This session is a background job\./,
    )
    assert.ok(definition, `${release.version}: exact Claude agent definition`)
    for (const fragment of [
      '**Narrate.** State your approach before acting (one line).',
      '**Restate.** When you reach a result, state it in your message',
      'For noisy investigation \\u2014 grep sweeps, log trawling, broad search \\u2014 spawn a subagent',
      '**Done** means \\`result:\\` on its own line',
      "Everything else, keep working. Don't ask when a reasonable guess is cheaper than the round-trip.",
    ]) {
      assert.equal(
        bundle.split(fragment).length - 1,
        1,
        `${release.version}: ${fragment}`,
      )
    }

    assert.match(
      bundle,
      /if\(![A-Za-z_$][\w$]*\(\)&&[A-Za-z_$][\w$]*\("tengu_slate_meadow",!1\)\)\{let\{CLAUDE_AGENT:[A-Za-z_$][\w$]*\}=.{0,80}?;[A-Za-z_$][\w$]*\.push\([A-Za-z_$][\w$]*\)\}/,
      `${release.version}: active fleet-gated built-in registration`,
    )

    const templateHelper = bundle.match(
      /function ([A-Za-z_$][\w$]*)\(H\)\{return\{name:H\.agentType,description:H\.whenToUse,initialPrompt:H\.initialPrompt\}\}/,
    )
    assert.ok(templateHelper, `${release.version}: agent-to-template helper`)
    assert.match(
      bundle,
      new RegExp(
        `=${templateHelper[1]}\\(${definition[1]}\\)`,
      ),
      `${release.version}: default template derives from Claude agent`,
    )
  }
})

test('source restores the Claude agent, append policy, registration, and Fleet defaults', () => {
  const claudeAgent = source(
    'src/tools/AgentTool/built-in/claudeAgent.ts',
  )
  for (const fragment of [
    "agentType: 'claude'",
    "Catch-all for any task that doesn't fit a more specific agent. FleetView's default when no agent name is typed.",
    "tools: ['*']",
    "source: 'built-in'",
    "baseDir: 'built-in'",
    'appendSystemPrompt: true',
    "permissionMode: 'auto'",
    "isolation: 'worktree'",
    'This session is a background job.',
    '**Done** means \\`result:\\` on its own line',
  ]) {
    assert.ok(claudeAgent.includes(fragment), fragment)
  }

  const builtIns = source('src/tools/AgentTool/builtInAgents.ts')
  assert.match(
    builtIns,
    /if \(isAgentsFleetEnabled\(\)\) \{\s*agents\.push\(CLAUDE_AGENT\)\s*\}/,
  )

  const jobs = source('src/cli/handlers/templateJobs.ts')
  assert.match(
    jobs,
    /DEFAULT_TEMPLATE: TemplateJob = \{\s*name: CLAUDE_AGENT\.agentType,\s*description: CLAUDE_AGENT\.whenToUse,\s*initialPrompt: CLAUDE_AGENT\.initialPrompt,\s*\}/,
  )
  assert.equal(jobs.includes("['--agent', 'general-purpose']"), false)
  assert.equal(jobs.includes("template: { name: 'general-purpose' }"), false)

  const fleet = source('src/components/FleetView.tsx')
  assert.match(fleet, /import \{[\s\S]*?DEFAULT_TEMPLATE,[\s\S]*?\} from '\.\.\/cli\/handlers\/templateJobs\.js'/)
  assert.equal(fleet.includes("name: 'general-purpose'"), false)

  const prompt = source('src/utils/systemPrompt.ts')
  assert.match(
    prompt,
    /agentSystemPrompt && mainThreadAgentDefinition\?\.appendSystemPrompt/,
  )
  const main = source('src/main.tsx')
  assert.match(
    main,
    /if \(mainThreadAgentDefinition\.appendSystemPrompt\) \{[\s\S]*?`\$\{agentSystemPrompt\}\\n\\n\$\{appendSystemPrompt\}`/,
  )
})
