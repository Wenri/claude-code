import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.107-to-2.1.108'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_108_BUNDLE
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
  [11226, [8530017, 8531217, '266b77140810808eccc145b1c35a4225458a3b1ad975ec3e75a741d7f1a38c48']],
  [13975, [10093005, 10095806, '206348dbae2a670f347d5e4eeabf57dd72018333068ddab2b89474bd49751a61']],
  [15229, [11015186, 11030055, '2813347682a3ecc4a425d7c9ace89db15f1ac32ab307c7f3fb8a85ca1d98e5a6']],
  [16276, [11471864, 11473290, '9c70aca0004432dd8e43c536e9acd4bdf624e8479a7c60de0e49d0935bb6fd92']],
  [18791, [12772408, 12779842, '7373c7ba7555e61c62f741cab84ab9edb011d802b36feaeb73593be321a31242']],
  [18798, [12784488, 12795339, '3c94fbb674bebd4e20f1a5142516fe8778bc6848c45b95b937c8faecae438d8d']],
  [18924, [13207361, 13208038, 'b3b42b8f4ad73909ef3e41332929ddc5f9602a9585762407fac7ba606dd5ab58']],
  [18927, [13210379, 13211194, 'a71151403be1406a2c9ed3826e83e960c9b78b59bc69024917ef6f917d3e0b16']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function assertFragments(value, fragments, owner) {
  for (const fragment of fragments) {
    assert.ok(value.includes(fragment), `${owner}: ${fragment}`)
  }
}

test(
  'target108 authenticates the tabs, log-width, onboarding, and bundled-skill owners',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetBundlePath
        ? 'CLAUDE_CODE_2_1_108_BUNDLE is required'
        : false,
  },
  () => {
    const bytes = fs.readFileSync(targetBundlePath)
    assert.equal(
      sha256(bytes),
      'dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73',
    )
    const bundle = bytes.toString('utf8')
    for (const [index, identity] of targetUnits) {
      const region = structural.regions[index]
      assert.notEqual(region.classification, 'matched', `${index}: classification`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        identity,
        `${index}: identity`,
      )
      assert.equal(
        sha256(bundle.slice(identity[0], identity[1])),
        identity[2],
        `${index}: bytes`,
      )
    }

    const unit = index => {
      const [start, end] = targetUnits.get(index)
      return bundle.slice(start, end)
    }
    assertFragments(unit(13975), [
      'focusDirection',
      'blur',
      'onBlur',
      'navFromContent',
      'registerOptIn',
    ], 'target Tabs')
    assertFragments(unit(11226), [
      'tengu_teleport_error_session_not_found_404',
      ` not found.
Run /status in Claude Code to check your account.`,
      'Run /status in Claude Code to check your account.',
    ], 'target teleport not-found handling')
    assertFragments(unit(15229), [
      'forceWidth',
      '===void 0?',
      'columns',
      'tengu_session_preview_opened',
    ], 'target LogSelector')
    assertFragments(unit(16276), [
      'Edit(ONBOARDING.md)',
      'Bash(ls *)',
      'tengu_flint_harbor_prompt',
      'Math.min(Math.max(Math.floor(',
      'tengu_team_onboarding_generated',
      'tengu_cedar_inlet',
      'return K',
    ], 'target team onboarding')
    assertFragments(unit(18791), [
      '# Skillify {{userDescriptionBlock}}',
      'Use AskUserQuestion for ALL questions!',
      '**Success criteria** is REQUIRED on every step.',
      'Does this SKILL.md look good to save?',
    ], 'target Skillify')
    assertFragments(unit(18798), [
      '## Settings File Locations',
      'Settings load in order: user → project → local',
      '## Constructing a Hook (with verification)',
      'Pipe-test the raw command.',
    ], 'target update-config docs')
    assertFragments(unit(18924), [
      'replace("<!-- __G2__ -->","")',
      'No project language was auto-detected.',
      '## Included Documentation',
      '## User Request',
    ], 'target Claude API prompt builder')
    assertFragments(unit(18927), [
      'user asks for the Claude API, Anthropic SDK, or Managed Agents',
      'SKIP: file imports `openai`/other-provider SDK',
    ], 'target Claude API routing')
  },
)

test(
  'source owns each authenticated surface and preserves intentional latest evolution',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const tabs = source('components/design-system/Tabs.tsx')
    assertFragments(tabs, [
      'focusDirection',
      'blurHeader',
      'navFromContent',
      'registerOptIn',
      'onKeyDown={handleKeyDown}',
    ], 'Tabs.tsx')

    const teleport = source('utils/teleport.tsx')
    assertFragments(teleport, [
      'tengu_teleport_error_session_not_found_404',
      "`${sessionId} not found.\\nRun /status in Claude Code to check your account.`",
      "chalk.dim('Run /status in Claude Code to check your account.')",
    ], 'teleport.tsx')

    const logs = source('components/LogSelector.tsx')
    assertFragments(logs, [
      'forceWidth?: number',
      'const columns = forceWidth === undefined ? terminalSize.columns : forceWidth',
    ], 'LogSelector.tsx')
    if (semanticCase === caseName) {
      assert.ok(logs.includes('<Divider color="suggestion" width={columns} />'))
    } else {
      assert.ok(logs.includes('<Pane color="suggestion">'))
    }

    const onboarding = source('commands/team-onboarding.ts')
    assertFragments(onboarding, [
      "allowedTools: ['Edit(ONBOARDING.md)', 'Bash(ls *)']",
      "'tengu_flint_harbor_prompt'",
      'Math.min(Math.max(Math.floor(config.windowDays), 1), 365)',
      "logEvent('tengu_team_onboarding_generated'",
      "'tengu_cedar_inlet'",
      'return arm',
    ], 'team-onboarding.ts')
    if (semanticCase === caseName) {
      assert.equal(onboarding.includes('disableModelInvocation: true'), false)
    } else {
      assert.ok(onboarding.includes('disableModelInvocation: true'))
    }

    const skillify = source('skills/bundled/skillify.ts')
    assertFragments(skillify, [
      '# Skillify {{userDescriptionBlock}}',
      'Use AskUserQuestion for ALL questions!',
      '**Success criteria** is REQUIRED on every step.',
      "name: 'skillify'",
      'getMessagesAfterCompactBoundary(context.messages)',
    ], 'skillify.ts')

    const updateConfig = source('skills/bundled/updateConfig.ts')
    assertFragments(updateConfig, [
      '## Settings File Locations',
      'Settings load in order: user → project → local',
      '## Constructing a Hook (with verification)',
      'Pipe-test the raw command.',
    ], 'updateConfig.ts')

    const claudeApi = source('skills/bundled/claudeApi.ts')
    assertFragments(claudeApi, [
      'INLINE_READING_GUIDE.replace(/\\{lang\\}/g, lang)',
      'No project language was auto-detected.',
      '## Included Documentation',
      'user asks for the Claude API, Anthropic SDK, or Managed Agents',
      'SKIP: file imports `openai`/other-provider SDK',
    ], 'claudeApi.ts')
    assert.equal(claudeApi.includes('<!-- __G2__ -->'), false)
  },
)
