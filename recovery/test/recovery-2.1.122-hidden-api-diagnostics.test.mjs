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
    diagnostics: 0,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    diagnostics: 1,
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

test('authenticates target-only redacted verbose API diagnostics', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const witness of [
      '[API REQUEST AUTH]',
      '[API REQUEST DETAIL]',
      '<opaque>',
    ]) {
      assert.equal(
        occurrences(bundle, witness),
        release.diagnostics,
        `${release.version}: ${witness}`,
      )
    }
  }
})

test('source logs only redacted auth and selected Anthropic headers', () => {
  const source = compact(
    fs.readFileSync(path.join(repo, 'src/services/api/client.ts'), 'utf8'),
  )
  for (const fragment of [
    "const authorization = headers.get('authorization')",
    "authorization.includes(' ') ? authorization.slice(0, authorization.indexOf(' ')) : '<opaque>'",
    "name === 'anthropic-beta' || name.startsWith('x-anthropic-')",
    "if (getMinDebugLogLevel() === 'verbose')",
    '[API REQUEST AUTH]',
    "{ level: 'verbose' }",
  ]) {
    assert.ok(source.includes(compact(fragment)), fragment)
  }
})

test('source logs the bounded request-detail surface on both API paths', () => {
  const source = compact(
    fs.readFileSync(path.join(repo, 'src/services/api/claude.ts'), 'utf8'),
  )
  for (const fragment of [
    "if (getMinDebugLogLevel() !== 'verbose') return",
    '[API REQUEST DETAIL]',
    'model: params.model',
    'thinking: params.thinking',
    'output_config: params.output_config',
    'temperature: params.temperature',
    'betas: params.betas ?? []',
    'anthropic_beta: params.anthropic_beta',
  ]) {
    assert.ok(source.includes(compact(fragment)), fragment)
  }
  assert.equal(source.split('logAPIRequestDetail(').length - 1, 3)
  assert.ok(
    source.includes(
      compact(`
        const adjustedParams = adjustParamsForNonStreaming(
          retryParams,
          MAX_NON_STREAMING_TOKENS,
        )
        logAPIRequestDetail(adjustedParams)
        captureRequest(adjustedParams)
      `),
    ),
  )
  assert.ok(
    source.includes(
      compact(`
        const params = paramsFromContext(context)
        logAPIRequestDetail(params)
        captureAPIRequest(params, options.querySource)
      `),
    ),
  )
})
