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
    hardenedMatcherCount: 0,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    hardenedMatcherCount: 1,
  },
]

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

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

function loadSourceMatcher() {
  const filename = path.join(repo, 'src/utils/urlPattern.ts')
  const source = fs
    .readFileSync(filename, 'utf8')
    .replace("import { randomBytes } from 'crypto'", '')
    .replace(
      'export function urlMatchesPattern(url: string, pattern: string): boolean {',
      'function urlMatchesPattern(url, pattern) {',
    )
    .replace('let parsedUrl: URL', 'let parsedUrl')
    .replace('let parsedPattern: URL | undefined', 'let parsedPattern')
  return Function(
    'randomBytes',
    `${source}\nreturn urlMatchesPattern`,
  )(crypto.randomBytes)
}

test('authenticates the target-only component-aware URL matcher', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      occurrences(bundle, 'zzwildcard'),
      release.hardenedMatcherCount,
      `${release.version}: randomized wildcard sentinel`,
    )
    assert.equal(
      occurrences(bundle, '.replaceAll("*","[^/]*")'),
      release.hardenedMatcherCount * 2,
      `${release.version}: component-bounded wildcard replacements`,
    )
  }
})

test('shared source matcher reproduces target protocol, host, port, path, and query semantics', () => {
  const matches = loadSourceMatcher()
  const cases = [
    ['not an absolute URL', '*', true],
    ['https://example.com', 'https://example.com', true],
    ['https://example.com/a?x=1', 'https://example.com', true],
    ['http://example.com/a', 'https://example.com', false],
    ['http://example.com/v1', '*://example.com/*', true],
    ['https://api.example.com/v1', 'https://*.example.com/*', true],
    [
      'https://evil.test/path.example.com/secret',
      'https://*.example.com/*',
      false,
    ],
    [
      'https://api.example.com:8443/v1',
      'https://*.example.com/*',
      true,
    ],
    [
      'https://example.com:8443/v1',
      'https://example.com:*/*',
      true,
    ],
    ['https://example.com/v1', 'https://example.com/', false],
    ['https://example.com/v1/child', 'https://example.com/v*', true],
    [
      'https://example.com/v1?token=abc',
      'https://example.com/v*?token=*',
      true,
    ],
    [
      'https://example.com/v1?other=abc',
      'https://example.com/v*?token=*',
      false,
    ],
    ['https://example.com./v1', 'https://example.com/*', true],
  ]
  for (const [url, pattern, expected] of cases) {
    assert.equal(matches(url, pattern), expected, `${pattern} against ${url}`)
  }
})

test('MCP policy and HTTP hooks both use the shared matcher', () => {
  const config = fs.readFileSync(
    path.join(repo, 'src/services/mcp/config.ts'),
    'utf8',
  )
  const hooks = fs.readFileSync(
    path.join(repo, 'src/utils/hooks/execHttpHook.ts'),
    'utf8',
  )
  for (const source of [config, hooks]) {
    assert.match(
      source,
      /import \{ urlMatchesPattern \} from ['"][^'"]+urlPattern\.js['"]/,
    )
    assert.match(source, /urlMatchesPattern\([^,]+, [^)]+\)/)
  }
  assert.doesNotMatch(config, /function urlPatternToRegex/)
  assert.doesNotMatch(hooks, /function urlMatchesPattern/)
})
