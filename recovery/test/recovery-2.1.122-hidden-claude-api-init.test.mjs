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
    added: 0,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    added: 1,
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

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

test('authenticates target-only Claude API skill and new-init gates', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const witness of [
      'tengu_claude_api_skill_loaded',
      'tengu_new_init',
      '["migrate","managed-agents-onboard"]',
    ]) {
      assert.equal(
        occurrences(bundle, witness),
        release.added,
        `${release.version}: ${witness}`,
      )
    }
  }

  const target = readBundle(releases[1])
  for (const witness of [
    'detected_lang:',
    'subcommand:',
    'has_args:',
    'managed-agents-onboard',
    'CLAUDE_CODE_NEW_INIT',
  ]) {
    assert.ok(target.includes(witness), `target: ${witness}`)
  }
})

test('source exposes and instruments the target Claude API skill surface', () => {
  const source = compact(
    fs.readFileSync(
      path.join(repo, 'src/skills/bundled/claudeApi.ts'),
      'utf8',
    ),
  )
  for (const fragment of [
    "const KNOWN_SUBCOMMANDS = ['migrate', 'managed-agents-onboard']",
    "return KNOWN_SUBCOMMANDS.find(subcommand => subcommand === candidate) ?? 'none'",
    "logEvent('tengu_claude_api_skill_loaded'",
    "detected_lang: lang ?? 'none'",
    'subcommand: matchSubcommand(args)',
    'has_args: args.trim().length > 0',
    'files: getProcessedFiles()',
    'export function processSkillMarkdown',
    'export const CLAUDE_API_SKILL_DESCRIPTION',
    'shared/managed-agents-overview.md',
  ]) {
    assert.ok(source.includes(compact(fragment)), fragment)
  }

  const content = fs.readFileSync(
    path.join(repo, 'src/skills/bundled/claudeApiContent.ts'),
    'utf8',
  )
  assert.ok(content.includes("'shared/managed-agents-onboarding.md'"))
})

test('source selects the new init prompt from env or cached feature value', () => {
  const source = compact(
    fs.readFileSync(path.join(repo, 'src/commands/init.ts'), 'utf8'),
  )
  assert.ok(
    source.includes(
      compact(`
        isEnvTruthy(process.env.CLAUDE_CODE_NEW_INIT) ||
        getFeatureValue_CACHED_MAY_BE_STALE('tengu_new_init', false)
      `),
    ),
  )
  assert.equal(occurrences(source, 'isNewInitEnabled()'), 3)
})
