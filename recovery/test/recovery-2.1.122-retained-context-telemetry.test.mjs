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

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

function source(relativePath) {
  return compact(fs.readFileSync(path.join(repo, relativePath), 'utf8'))
}

function includesAll(contents, fragments) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(compact(fragment)), `missing ${fragment}`)
  }
}

test('authenticates retained agent, API-body, and user-context witnesses', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      occurrences(bundle, 'agent_system_prompt_chars'),
      1,
      `${release.version}: agent prompt telemetry cardinality`,
    )
    assert.equal(
      occurrences(bundle, 'body_ref'),
      1,
      `${release.version}: raw body file reference cardinality`,
    )
    assert.match(
      bundle,
      /startsWith\("file:"\)[\s\S]{0,2000}OTEL_LOG_RAW_API_BODIES[\s\S]{0,2000}body_ref:/,
      `${release.version}: file:<dir> API-body mode`,
    )
    assert.match(
      bundle,
      /process\.env\.ANTHROPIC_UNIX_SOCKET\?void 0:[A-Za-z_$][\w$]*\(\)\?\.emailAddress/,
      `${release.version}: user email guard`,
    )
    assert.ok(
      bundle.includes("The user's email address is "),
      `${release.version}: user email context`,
    )
  }
})

test('source computes one agent prompt and reports its exact length', () => {
  const contents = source('src/tools/AgentTool/AgentTool.tsx')
  includesAll(contents, [
    'const agentSystemPrompt = selectedAgent.getSystemPrompt({ toolUseContext });',
    'agent_system_prompt_chars: agentSystemPrompt.length',
    'const agentPrompt = agentSystemPrompt;',
  ])
  assert.equal(
    occurrences(contents, 'selectedAgent.getSystemPrompt('),
    1,
    'selected agent prompt is evaluated exactly once',
  )
})

test('source preserves file-mode API bodies and guarded user email context', () => {
  const bodyLogging = source('src/utils/telemetry/apiBodyLogging.ts')
  includesAll(bodyLogging, [
    "raw?.startsWith('file:')",
    "{ mode: 'file', dir: resolve(dir) }",
    "const kind = eventName === 'api_request_body' ? 'request' : 'response'",
    'const requestId = /^[A-Za-z0-9_-]+$/.test(candidate)',
    'const filename = join(config.dir, `${requestId}.${kind}.json`)',
    'if (!isENOENT(error)) throw error',
    'await mkdir(dir, { recursive: true })',
    'body_ref: filename',
    'body_length: String(Buffer.byteLength(serialized))',
  ])

  const context = source('src/context.ts')
  includesAll(context, [
    'const userEmail = process.env.ANTHROPIC_UNIX_SOCKET ? undefined : getOauthAccountInfo()?.emailAddress',
    'has_user_email: Boolean(userEmail)',
    "userEmail: `The user's email address is ${userEmail}.`",
  ])
})
