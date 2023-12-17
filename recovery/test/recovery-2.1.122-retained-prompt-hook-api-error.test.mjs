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

test('authenticates the retained prompt-hook API-error fast path', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const debugPrefix = 'Hooks: prompt-hook evaluator API error: '
    const attachmentPrefix = 'Hook evaluator API error: '
    assert.equal(bundle.split(debugPrefix).length - 1, 1, release.version)
    assert.equal(bundle.split(attachmentPrefix).length - 1, 1, release.version)

    const anchor = bundle.indexOf(debugPrefix)
    const fastPath = bundle.slice(anchor - 180, anchor + 500)
    assert.match(
      fastPath,
      /\.isApiErrorMessage\)\{let .*?\.message\.content\)\.trim\(\);return .*?\{level:"error"\}\),\{hook:/,
      `${release.version}: API error is returned before normal parsing`,
    )
    assert.match(
      fastPath,
      /outcome:"non_blocking_error".*?type:"hook_non_blocking_error".*?stderr:`Hook evaluator API error: \$\{.*?\}`.*?stdout:"",exitCode:1/,
      `${release.version}: fail-open hook attachment`,
    )
    assert.ok(
      fastPath.indexOf(attachmentPrefix) <
        fastPath.indexOf('Hooks: Model response:'),
      `${release.version}: fast path precedes normal response logging`,
    )
  }
})

test('source returns API errors before response accounting and JSON parsing', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/utils/hooks/execPromptHook.ts'),
    'utf8',
  )
  const start = source.indexOf('if (response.isApiErrorMessage)')
  const normal = source.indexOf('// Extract text content from response')
  assert.notEqual(start, -1)
  assert.ok(start < normal)
  const fastPath = source.slice(start, normal)
  assert.match(fastPath, /extractTextContent\(response\.message\.content\)\.trim\(\)/)
  assert.match(fastPath, /`Hooks: prompt-hook evaluator API error: \$\{apiError\}`/)
  assert.match(fastPath, /\{ level: 'error' \}/)
  assert.match(fastPath, /outcome: 'non_blocking_error'/)
  assert.match(fastPath, /type: 'hook_non_blocking_error'/)
  assert.match(fastPath, /stderr: `Hook evaluator API error: \$\{apiError\}`/)
  assert.match(fastPath, /stdout: ''/)
  assert.match(fastPath, /exitCode: 1/)
  assert.doesNotMatch(fastPath, /setResponseLength|safeParseJSON/)
})
