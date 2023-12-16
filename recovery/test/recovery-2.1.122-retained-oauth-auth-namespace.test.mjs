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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function exportedSymbol(bundle, name) {
  const matches = [
    ...bundle.matchAll(
      new RegExp(`${name}:\\(\\)=>([A-Za-z_$][\\w$]*)`, 'g'),
    ),
  ]
  assert.equal(matches.length, 1, `${name}: one export`)
  return matches[0][1]
}

function symbolReferenceCount(bundle, symbol) {
  return [
    ...bundle.matchAll(
      new RegExp(
        `(?<![\\w$])${escapeRegExp(symbol)}(?![\\w$])`,
        'g',
      ),
    ),
  ].length
}

function readSource(filename) {
  return fs.readFileSync(path.join(repo, filename), 'utf8')
}

test('authenticated bundles retain OAuth and auth namespace ownership', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const ttl = exportedSymbol(bundle, 'LONG_LIVED_OAUTH_TOKEN_TTL_SECONDS')
    const seatTier = exportedSymbol(bundle, 'getSeatTier')
    const sdkEntrypoints = exportedSymbol(bundle, 'SDK_OAUTH_REFRESH_ENTRYPOINTS')

    assert.equal(symbolReferenceCount(bundle, ttl), 5, `${release.version}: TTL`)
    assert.equal(
      symbolReferenceCount(bundle, seatTier),
      2,
      `${release.version}: seat tier`,
    )
    assert.equal(
      symbolReferenceCount(bundle, sdkEntrypoints),
      4,
      `${release.version}: SDK entrypoints`,
    )
    assert.match(bundle, new RegExp(`${escapeRegExp(ttl)}=31536000`))
    assert.match(
      bundle,
      new RegExp(
        `function ${escapeRegExp(seatTier)}\\(\\)\\{return [A-Za-z_$][\\w$]*\\(\\)\\?\\.seatTier\\?\\?null\\}`,
      ),
    )
    assert.match(
      bundle,
      new RegExp(
        `${escapeRegExp(sdkEntrypoints)}=new Set\\(\\["claude-desktop","local-agent","claude-vscode"\\]\\)`,
      ),
    )
  }
})

test('source exports and drives every retained OAuth/auth surface', () => {
  const oauth = readSource('src/constants/oauth.ts')
  assert.match(
    oauth,
    /export const LONG_LIVED_OAUTH_TOKEN_TTL_SECONDS = 365 \* 24 \* 60 \* 60/,
  )

  for (const filename of [
    'src/cli/handlers/auth.ts',
    'src/components/ConsoleOAuthFlow.tsx',
    'src/commands/install-github-app/OAuthFlowStep.tsx',
  ]) {
    const source = readSource(filename)
    assert.match(source, /import \{ LONG_LIVED_OAUTH_TOKEN_TTL_SECONDS \}/)
    assert.match(source, /expiresIn:[^\n]*LONG_LIVED_OAUTH_TOKEN_TTL_SECONDS/)
    assert.doesNotMatch(source, /365 \* 24 \* 60 \* 60/)
  }

  const auth = readSource('src/utils/auth.ts')
  assert.match(
    auth,
    /export const SDK_OAUTH_REFRESH_ENTRYPOINTS = new Set\(\[\s*'claude-desktop',\s*'local-agent',\s*'claude-vscode',\s*\]\)/,
  )
  assert.match(
    auth,
    /export function getSeatTier\(\): string \| null \{\s*return getOauthAccountInfo\(\)\?\.seatTier \?\? null\s*\}/,
  )

  const print = readSource('src/cli/print.ts')
  assert.match(
    print,
    /import \{[\s\S]{0,160}?SDK_OAUTH_REFRESH_ENTRYPOINTS,[\s\S]{0,40}?\} from 'src\/utils\/auth\.js'/,
  )
  assert.match(print, /SDK_OAUTH_REFRESH_ENTRYPOINTS\.has\(/)
  assert.doesNotMatch(
    print,
    /const SDK_OAUTH_REFRESH_ENTRYPOINTS = new Set/,
  )
})
