import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.92-to-2.1.94'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_94_BUNDLE
const targetSha256 =
  '11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564'
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

const pins = new Map([
  [15666, ['unresolved', 11383021, 11384555, 'f758ed15ba27bb65853052a8223054b91a445187a6217b9df7e629cd6014714e']],
  [15667, ['unresolved', 11384555, 11384770, 'ae3f9806724c6925dae23dd069aaa99140b7bb7d6ded074d4663a8cc2cd61eca']],
  [15668, ['unresolved', 11384770, 11384977, 'a75291194dfc41e582821ba673c440894b317999c0fd18b5e21e3c7b77253538']],
  [15670, ['unresolved', 11384988, 11385095, '5ab1d5a49afef69b5f94133b17eac6c0a09c4ea653a4a99714f5cb8b538151e7']],
  [15673, ['unresolved', 11385182, 11385241, 'fa321a58261794573be6d4c742c3db70aa415bf4767db0fcc9df7a1372db6553']],
  [15674, ['unresolved', 11385241, 11385562, '47a57d8eaaf5e19ba68ffe0dc5e88eabd54586c7eb25fb4cfd38eafee2dc16e5']],
  [15675, ['unresolved', 11385562, 11386346, 'd5d24aa7a68b7fd093f9c8b5a610e1fb0193ff0cbf7b218b48404af0b9cd5d0a']],
  [15676, ['unresolved', 11386346, 11392712, 'b48c6729b55b9367e5daa8b074460c62fd726ecd20631b0caa528c94c82f6940']],
  [15677, ['unresolved', 11392712, 11394213, '0d7110de5b416f11c398b1786089ce3710eeb03bce380f533c5d025811b416c1']],
  [18082, ['unresolved', 12648749, 12651626, 'f389b7e92beba9efa95d640f17b2e8693f77065c4a33f742bd663efc7f9fb21e']],
])

test('2.1.94 pins the complete team-onboarding command and startup-discovery runtime', {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_94_BUNDLE is not set'
      : false,
}, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), targetSha256)
  const bundle = bytes.toString('utf8')
  for (const [index, [classification, start, end, sourceHash]] of pins) {
    const region = structural.regions[index]
    assert.equal(region.classification, classification, `${index}: class`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: identity`,
    )
    assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
  }
  for (const fragment of [
    'team-onboarding: failed to read .mcp.json:',
    'Edit(ONBOARDING.md)',
    'Bash(ls:*)',
    'tengu_flint_harbor_prompt',
    'tengu_team_onboarding_invoked',
    'tengu_team_onboarding_generated',
    'tengu_cedar_inlet',
    'tengu_team_onboarding_discovery_shown',
    'Ask a teammate to run /team-onboarding and share the guide.',
    'Saved to \\`ONBOARDING.md\\`. Drop it in your team docs and channels',
    'process.env.CLAUDE_CODE_TEAM_ONBOARDING==="banner"',
  ]) assert.ok(bundle.includes(fragment), fragment)
})

test('materialized target94 source owns the exact command, data scan, prompt, and discovery wiring', {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}, () => {
  const command = fs.readFileSync(
    path.join(sourceRoot, 'commands/team-onboarding.ts'),
    'utf8',
  )
  for (const fragment of [
    'const MAX_SESSION_BYTES = 50 * 1024 * 1024',
    'const MAX_FIRST_MESSAGE_CHARS = 200',
    'const MAX_SESSION_DESCRIPTORS = 60',
    'Date.now() - windowDays * 24 * 60 * 60 * 1000',
    'if (!fileStat.isFile() || fileStat.mtimeMs < cutoff) continue',
    'if (fileStat.size > MAX_SESSION_BYTES) continue',
    semanticCase === caseName
      ? "allowedTools: ['Edit(ONBOARDING.md)', 'Bash(ls:*)']"
      : "allowedTools: ['Edit(ONBOARDING.md)', 'Bash(ls *)']",
    semanticCase === caseName
      ? "getFeatureValue_CACHED_MAY_BE_STALE('tengu_flint_harbor', false)"
      : 'isEnabled: () => true',
    "}>('tengu_flint_harbor_prompt', {})",
    "logEvent('tengu_team_onboarding_invoked'",
    "logEvent('tengu_team_onboarding_generated'",
    "getFeatureValue_CACHED_MAY_BE_STALE<TeamOnboardingDiscoveryArm>(",
    "'tengu_cedar_inlet'",
    "if (arm !== 'off')",
    "logEvent('tengu_team_onboarding_discovery_shown', { arm })",
    'return arm',
    'Saved to \\`ONBOARDING.md\\`. Drop it in your team docs and channels',
  ]) assert.ok(command.includes(fragment), fragment)

  const commands = fs.readFileSync(path.join(sourceRoot, 'commands.ts'), 'utf8')
  assert.ok(commands.includes("import teamOnboarding from './commands/team-onboarding.js'"))
  assert.match(commands, /COMMANDS[\s\S]*teamOnboarding/)

  const interactive = fs.readFileSync(
    path.join(sourceRoot, 'interactiveHelpers.tsx'),
    'utf8',
  )
  if (semanticCase === caseName) {
    assert.ok(interactive.includes("process.env.CLAUDE_CODE_TEAM_ONBOARDING === 'banner'"))
    assert.ok(interactive.includes("process.env.CLAUDE_CODE_TEAM_ONBOARDING === 'step'"))
  } else {
    assert.ok(interactive.includes('TeamOnboardingDiscoveryStep'))
  }
  assert.ok(interactive.includes("resolveTeamOnboardingDiscoveryArm() === 'step'"))

  const main = fs.readFileSync(path.join(sourceRoot, 'main.tsx'), 'utf8')
  assert.ok(main.includes("resolveTeamOnboardingDiscoveryArm() === 'banner'"))
  assert.ok(main.includes('TEAM_ONBOARDING_DISCOVERY_COPY'))
})
