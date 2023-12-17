import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

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

function extractQuotedLiteral(contents, literalPrefix) {
  const start = contents.indexOf(literalPrefix)
  assert.notEqual(start, -1, `missing ${literalPrefix}`)
  assert.equal(contents[start], "'", `${literalPrefix}: single-quoted literal`)
  let escaped = false
  for (let index = start + 1; index < contents.length; index += 1) {
    const character = contents[index]
    if (escaped) escaped = false
    else if (character === '\\') escaped = true
    else if (character === "'") {
      return runInNewContext(contents.slice(start, index + 1))
    }
  }
  assert.fail(`${literalPrefix}: unterminated literal`)
}

function extractSourcePrompt() {
  const contents = fs.readFileSync(
    path.join(repo, 'src/skills/bundled/lessPermissionPrompts.ts'),
    'utf8',
  )
  const match = contents.match(
    /const SKILL_PROMPT = \[\n([\s\S]*?)\n\]\.join\('\\n'\)/,
  )
  assert.ok(match, 'source prompt array')
  return match[1]
    .split('\n')
    .map(line => JSON.parse(line.trim().replace(/,$/, '')))
    .join('\n')
}

test('authenticates the retained built-in skill in both releases', () => {
  const sourcePrompt = extractSourcePrompt()
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      bundle.split('fewer-permission-prompts').length - 1,
      1,
      `${release.version}: command-name cardinality`,
    )
    assert.equal(
      bundle.split('# Fewer Permission Prompts').length - 1,
      1,
      `${release.version}: prompt cardinality`,
    )
    assert.equal(
      extractQuotedLiteral(bundle, "'# Fewer Permission Prompts"),
      sourcePrompt,
      `${release.version}: exact prompt`,
    )
    assert.match(
      bundle,
      /name:"fewer-permission-prompts",description:"Scan your transcripts for common read-only Bash and MCP tool calls, then add a prioritized allowlist to project \.claude\/settings\.json to reduce permission prompts\.",userInvocable:!0,async getPromptForCommand/,
      `${release.version}: registration contract`,
    )
  }
})

test('source registers the target command and preserves argument appending', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/skills/bundled/lessPermissionPrompts.ts'),
    'utf8',
  )
  const index = fs.readFileSync(
    path.join(repo, 'src/skills/bundled/index.ts'),
    'utf8',
  )
  for (const fragment of [
    '"# Fewer Permission Prompts"',
    "name: 'fewer-permission-prompts'",
    'userInvocable: true',
    '## Additional instructions from the user',
    'return [{ type: \'text\', text: prompt }]',
  ]) {
    assert.ok(source.includes(fragment), fragment)
  }
  assert.ok(index.includes('registerLessPermissionPromptsSkill()'))
})
