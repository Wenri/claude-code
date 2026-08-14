import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const bundles = [
  [
    'CLAUDE_CODE_2_1_120_BUNDLE',
    13_784_743,
    'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f',
  ],
  [
    'CLAUDE_CODE_2_1_121_BUNDLE',
    13_908_188,
    '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  ],
]

function readSource(relative) {
  return fs.readFileSync(path.join(repo, relative), 'utf8')
}

function readBundle([environmentName, expectedBytes, expectedSha256]) {
  const filename = process.env[environmentName]
  assert.ok(filename, `${environmentName} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, expectedBytes, `${environmentName}: bytes`)
  assert.equal(
    crypto.createHash('sha256').update(value).digest('hex'),
    expectedSha256,
    `${environmentName}: SHA-256`,
  )
  return value.toString('utf8')
}

function templateValue(raw) {
  assert.equal(raw.includes('${'), false, 'template interpolation is forbidden')
  return Function(`return \`${raw}\``)()
}

test('authenticates inherited-active powerup and team-onboarding bundle semantics', () => {
  const [baseline, target] = bundles.map(readBundle)
  for (const fragment of [
    'tengu_powerup_lesson_opened',
    'tengu_powerup_lesson_completed',
    'checks JWT expiry and signature.',
    'Subagents run in isolated context. For true parallel sessions',
    'All powered up',
    'Power-ups closed',
    'tengu_team_onboarding_invoked',
    'tengu_team_onboarding_generated',
    'team-onboarding: failed to read .mcp.json',
    'tengu_team_onboarding_discovery_shown',
    "Looking at how you've used Claude over the last",
    'Ask a teammate to run /team-onboarding and share the guide.',
    'Edit(ONBOARDING.md)',
    'scanning usage data',
  ]) {
    assert.equal(baseline.split(fragment).length - 1, 1, `2.1.120 ${fragment}`)
    assert.equal(target.split(fragment).length - 1, 1, `2.1.121 ${fragment}`)
  }
})

test('source recovers all powerup lessons, animation mechanics, and system completion', () => {
  const command = readSource('src/commands/powerup/index.ts')
  const source = readSource('src/commands/powerup/powerup.tsx')
  assert.match(command, /type: 'local-jsx'/)
  assert.match(command, /name: 'powerup'/)
  assert.match(command, /requires: \{ ink: true \}/)

  for (const id of [
    'at-mentions',
    'modes',
    'undo',
    'background',
    'memory',
    'mcp',
    'automate',
    'subagents',
    'cross-device',
    'model-dial',
  ]) {
    assert.equal(source.split(`id: '${id}'`).length - 1, 1, id)
  }
  assert.match(source, /DEMO_INTERVAL_MS = 3000/)
  assert.match(source, /FRAME_MARKUP = \/\\\[\(\\w\+\):\(\[\^\\\]\]\*\)\\\]\/g/)
  assert.match(source, /useShortcutDisplay\('chat:cycleMode', 'Chat', 'shift\+tab'\)/)
  assert.match(source, /CONFETTI_DURATION_MS = 1400/)
  assert.match(source, /createPowerupConfetti\(40\)/)
  assert.match(source, /computeShimmerSegments\(text, glimmerIndex\)/)
  assert.match(source, /powerupsUnlocked: \[\.\.\.next\]/)
  assert.match(source, /all_unlocked: next\.size === LESSONS\.length/)
  assert.match(source, /onDone\(result, \{ display: 'system' \}\)/)
})

test('source recovers the bounded transcript collector and exact guide prompt', () => {
  const source = readSource('src/commands/team-onboarding/index.ts')
  assert.match(source, /MAX_SESSION_BYTES = 52_428_800/)
  assert.match(source, /MAX_FIRST_MESSAGE_LENGTH = 200/)
  assert.match(source, /MAX_SESSION_DESCRIPTORS = 60/)
  assert.match(source, /if \(isENOENT\(error\)\) return usage/)
  assert.match(source, /if \(isENOENT\(error\)\) continue/g)
  assert.match(source, /COMMAND_NAME_PATTERN = \/<command-name>/)
  assert.match(source, /MCP_TOOL_PATTERN = \/"name":"mcp__/)
  assert.match(source, /!line\.includes\('\"content\":\['\)/)
  assert.match(source, /\.replace\(\/\\\\n\/g, ' '\)/)
  assert.match(source, /return bScore - aScore/)
  assert.match(source, /normalizeGitRemoteUrl\(remote\) \?\? basename\(cwd\)/)
  assert.match(source, /slashCommandCount: usage\.slashCommandCounts\.size/)
  assert.match(source, /mcpServerCount: usage\.mcpServerCounts\.size/)
  assert.match(source, /allowedTools: ALLOWED_TOOLS/)
  assert.match(source, /disableModelInvocation: true/)

  const match = source.match(
    /GUIDE_TEMPLATE = `([\s\S]*?)`\n\nexport const DEFAULT_PROMPT = `([\s\S]*?)`\n\nconst ALLOWED_TOOLS/,
  )
  assert.ok(match)
  const guide = templateValue(match[1])
  const prompt = templateValue(match[2])
  assert.equal(guide.length, 1744)
  assert.equal(prompt.length, 4539)
  assert.equal(
    crypto.createHash('sha256').update(guide).digest('hex'),
    '5198d59c6114f7383ee2e4b0c8f4eaa66a61c631373228f7ebe280bf1667ae25',
  )
  assert.equal(
    crypto.createHash('sha256').update(prompt).digest('hex'),
    'd14de6d8e1dd5836a5bf2862f281f3eca85f92f315cb8bfc9a52333a7cfde917',
  )
})

test('source wires discovery step and banner into authenticated onboarding consumers', () => {
  const team = readSource('src/commands/team-onboarding/index.ts')
  const step = readSource('src/components/TeamOnboardingDiscoveryStep.tsx')
  const interactive = readSource('src/interactiveHelpers.tsx')
  const main = readSource('src/main.tsx')
  const commands = readSource('src/commands.ts')
  const config = readSource('src/utils/config.ts')

  assert.match(team, /if \(isConsumerSubscriber\(\)\) return 'off'/)
  assert.match(team, /CLAUDE_CODE_TEAM_ONBOARDING/)
  assert.match(team, /getFeatureValue_CACHED_MAY_BE_STALE\([\s\S]*?'tengu_cedar_inlet'/)
  assert.match(step, /'confirm:yes': onDone/)
  assert.match(step, /<WelcomeV2 \/>/)
  assert.match(step, /<Box width=\{70\}>/)
  assert.match(step, /<PressEnterToContinue \/>/)
  assert.match(interactive, /withTimeout\(initializeGrowthBook\(\), 1000, 'cedar-inlet'\)/)
  assert.match(interactive, /resolveTeamOnboardingDiscoveryArm\(\) === 'step'/)
  assert.match(main, /resolveTeamOnboardingDiscoveryArm\(\) === 'banner'/)
  assert.match(main, /buildTeamOnboardingDiscoveryMessages\(\{[\s\S]*?onboardingShown/)
  assert.match(main, /\[\.\.\.startupMessages, \.\.\.hookMessages\]/)
  assert.match(commands, /import powerup from '\.\/commands\/powerup\/index\.js'/)
  assert.match(commands, /import teamOnboarding from '\.\/commands\/team-onboarding\/index\.js'/)
  assert.match(commands, /plan,[\s\S]*?powerup,[\s\S]*?privacySettings/)
  assert.match(commands, /REMOTE_SAFE_COMMANDS[\s\S]*?plan,[\s\S]*?powerup,/)
  assert.match(config, /powerupsUnlocked\?: string\[\]/)
})
