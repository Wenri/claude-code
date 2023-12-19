import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = [
  {
    version: '2.1.123',
    env: 'CLAUDE_CODE_2_1_123_BUNDLE',
    bytes: 13_949_576,
    sha256:
      '59c8eebc0660d4bbc5c1f82af0ca5e94df5db46084687b979ad21a07fba3d7dd',
  },
  {
    version: '2.1.124',
    env: 'CLAUDE_CODE_2_1_124_BUNDLE',
    bytes: 13_980_928,
    sha256:
      'dc2b68c385a3064737343e51e6d7c690f9e03cc40fa89c4393708ae03094d590',
  },
]

function readBundle(release) {
  const filename = process.env[release.env]
  assert.ok(filename, `${release.env} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(value).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return value
}

function occurrences(contents, fragment) {
  let count = 0
  let offset = 0
  while ((offset = contents.indexOf(fragment, offset)) !== -1) {
    count += 1
    offset += fragment.length
  }
  return count
}

function source(relative) {
  return fs
    .readFileSync(path.join(repo, relative), 'utf8')
    .split('\n//# sourceMappingURL=', 1)[0]
}

function compact(value) {
  return value.replaceAll(';', '').replaceAll(/\s+/g, ' ').trim()
}

function assertSourceFragments(relative, fragments) {
  const contents = compact(source(relative))
  for (const fragment of fragments) {
    assert.ok(
      contents.includes(compact(fragment)),
      `${relative}: missing ${compact(fragment)}`,
    )
  }
}

test('authenticates the shared 2.1.124 skill-activation emitter and call sites', () => {
  const [baselineBytes, targetBytes] = releases.map(readBundle)
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  const helperStart = 4_418_704
  const helperEnd = 4_419_119
  const helper = targetBytes.subarray(helperStart, helperEnd)
  assert.equal(helper.length, 415)
  assert.equal(
    crypto.createHash('sha256').update(helper).digest('hex'),
    '717770fbc4b1dac9970023c66f242e361d2c98400ac6b1af18b689b81facb2f2',
  )
  assert.equal(
    helper.toString('utf8'),
    'function F_$(H,$,q){let K=$?.type==="prompt"?$.source:void 0,_=$?.type==="prompt"?$.pluginInfo:void 0,A=_?jK(_.repository).marketplace:void 0,Y=K==="builtin"||K==="bundled"||K==="plugin"&&FS(A)||q3();z_("skill_activated",{"skill.name":Y?H:"custom_skill",invocation_trigger:q,...K&&{"skill.source":K},...$?.kind&&{"skill.kind":$.kind},...Y&&_&&{"plugin.name":_.pluginManifest.name},...Y&&A&&{"marketplace.name":A}})}',
  )

  const targetOnlyFragments = [
    'invocation_trigger:q,...K&&{"skill.source":K}',
    'if(!(O.isMcp&&O.loadedFrom!=="mcp"))F_$(O.name,O,"user-slash");',
    'F_$($,H,J);',
    'F_$(Y,O,v);',
  ]
  for (const fragment of targetOnlyFragments) {
    assert.equal(occurrences(baseline, fragment), 0, `baseline: ${fragment}`)
    assert.equal(occurrences(target, fragment), 1, `target: ${fragment}`)
  }
  assert.equal(occurrences(baseline, 'skill_activated'), 1)
  assert.equal(occurrences(target, 'skill_activated'), 1)
})

test('source centralizes the privacy boundary and preserves all three triggers', () => {
  assertSourceFragments('src/utils/telemetry/pluginTelemetry.ts', [
    'export function recordSkillActivated( commandName: string, command: Command | undefined, invocationTrigger: InvocationTrigger, ): void',
    "const source = command?.type === 'prompt' ? command.source : undefined",
    "const pluginInfo = command?.type === 'prompt' ? command.pluginInfo : undefined",
    'parsePluginIdentifier(pluginInfo.repository).marketplace',
    "source === 'builtin' || source === 'bundled' || (source === 'plugin' && isOfficialMarketplaceName(marketplace)) || isToolDetailsLoggingEnabled()",
    "void logOTelEvent('skill_activated', { 'skill.name': canLogNames ? commandName : 'custom_skill', invocation_trigger: invocationTrigger",
    "...(source && { 'skill.source': source })",
    "...(command?.kind && { 'skill.kind': command.kind })",
    "pluginInfo && { 'plugin.name': pluginInfo.pluginManifest.name }",
    "...(canLogNames && marketplace && { 'marketplace.name': marketplace })",
  ])

  assertSourceFragments('src/utils/processUserInput/processSlashCommand.tsx', [
    "if (!(command.isMcp && command.loadedFrom !== 'mcp')) { recordSkillActivated(command.name, command, 'user-slash') }",
  ])

  const skillTool = compact(source('src/tools/SkillTool/SkillTool.ts'))
  assert.equal(occurrences(skillTool, 'recordSkillActivated('), 2)
  assert.equal(occurrences(skillTool, 'function logSkillActivated('), 0)
  assert.equal(occurrences(skillTool, "logOTelEvent('skill_activated'"), 0)
  assert.equal(
    occurrences(
      skillTool,
      compact(
        "const invocationTrigger = queryDepth > 0 ? 'nested-skill' : 'claude-proactive'",
      ),
    ),
    2,
  )
  assert.equal(
    occurrences(
      skillTool,
      'recordSkillActivated(commandName, command, invocationTrigger)',
    ),
    2,
  )
})

test('legacy MCP prompts are the only prompt commands excluded from user-slash activation', () => {
  const shouldRecord = command =>
    !(command.isMcp && command.loadedFrom !== 'mcp')

  assert.equal(shouldRecord({ isMcp: false, loadedFrom: 'skills' }), true)
  assert.equal(shouldRecord({ isMcp: true, loadedFrom: 'mcp' }), true)
  assert.equal(shouldRecord({ isMcp: true, loadedFrom: 'plugin' }), false)
  assert.equal(shouldRecord({ isMcp: true, loadedFrom: undefined }), false)
})
