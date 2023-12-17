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
  return value.toString('utf8')
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

function compact(value) {
  return value.replaceAll(';', '').replaceAll(/\s+/g, ' ').trim()
}

function source(relative) {
  return fs
    .readFileSync(path.join(repo, relative), 'utf8')
    .split('\n//# sourceMappingURL=', 1)[0]
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

test('authenticates the 2.1.124 MCP OAuth snapshot and dedup cluster', () => {
  const [baseline, target] = releases.map(readBundle)
  const targetOnlyFragments = [
    'function Yq8(){return O1().read()?.mcpOAuth}',
    'function fq8(H,$,q){if(Ic()&&$.oauth?.xaa)return!1;if($.headersHelper||$.headers&&Object.keys($.headers).length>0)return!1;let K=(q??Yq8())?.[sj(H,$)];return K!==void 0&&!K.accessToken&&!K.refreshToken&&K.discoveryState?.oauthMetadataFound===!0}',
    'function bM7(H,$,q){if(Ic()&&$.oauth?.xaa)return!1;if($.headersHelper||$.headers&&Object.keys($.headers).length>0)return!1;let K=(q??Yq8())?.[sj(H,$)];return K!==void 0&&!!K.accessToken&&!K.refreshToken&&K.expiresAt!==void 0&&K.expiresAt<Date.now()}',
    'cM7=["/v2/session_ingress/shttp/mcp/","/v2/session_ingress/mcp/ws/","/v2/ccr-sessions/"],hJ_=process.env.SESSION_INGRESS_URL??process.env.ANTHROPIC_BASE_URL',
    'function lM7(H){let $=hJ_;if(!$)return!1;let q,K;try{q=new URL(H),K=new URL($)}catch{return!1}if((q.protocol==="wss:"?`https://${q.host}`:q.protocol==="ws:"?`http://${q.host}`:q.origin)!==K.origin)return!1;return cM7.some((A)=>q.pathname.includes(A))}',
    'function sf$(H,$){let q=Yq8()??{},K=new Map;for(let[z,Y]of Object.entries($)){if(Bv(z))continue;if((Y.type==="sse"||Y.type==="http")&&(fq8(z,Y,q)||bM7(z,Y,q)))continue;let f=q3H(Y);if(f&&!K.has(f))K.set(f,{name:z,scope:Y.scope})}',
    'z="url"in $&&lM7($.url)?D2():null;',
  ]

  for (const fragment of targetOnlyFragments) {
    assert.equal(occurrences(baseline, fragment), 0, `baseline: ${fragment}`)
    assert.equal(occurrences(target, fragment), 1, `target: ${fragment}`)
  }
})

test('source snapshots OAuth and excludes unrecoverable manual duplicates', () => {
  assertSourceFragments('src/services/mcp/auth.ts', [
    "export function getMcpOAuthEntries(): SecureStorageData['mcpOAuth'] | undefined { return getSecureStorage().read()?.mcpOAuth }",
    "oauthEntries?: SecureStorageData['mcpOAuth']",
    'const entry = (oauthEntries ?? getMcpOAuthEntries())?.[serverKey]',
    'entry !== undefined && !entry.accessToken && !entry.refreshToken && entry.discoveryState?.oauthMetadataFound === true',
    'export function hasExpiredMcpAccessTokenWithoutRefresh(',
    'entry !== undefined && !!entry.accessToken && !entry.refreshToken && entry.expiresAt !== undefined && entry.expiresAt < Date.now()',
  ])

  assertSourceFragments('src/services/mcp/config.ts', [
    "'/v2/session_ingress/mcp/ws/'",
    'process.env.SESSION_INGRESS_URL ?? process.env.ANTHROPIC_BASE_URL',
    "parsedUrl.protocol === 'wss:' ? `https://${parsedUrl.host}` : parsedUrl.protocol === 'ws:' ? `http://${parsedUrl.host}` : parsedUrl.origin",
    'if (normalizedOrigin !== parsedBaseUrl.origin) { return false }',
    'return CCR_PROXY_PATH_MARKERS.some(marker => parsedUrl.pathname.includes(marker), )',
    'const oauthEntries = getMcpOAuthEntries() ?? {}',
    "if (isMcpServerDisabled(name)) continue if ( (config.type === 'sse' || config.type === 'http') && (hasMcpDiscoveryButNoToken(name, config, oauthEntries) || hasExpiredMcpAccessTokenWithoutRefresh(name, config, oauthEntries)) ) { continue }",
  ])

  assertSourceFragments('src/services/mcp/client.ts', [
    "'url' in serverRef && isCcrProxyUrl(serverRef.url) ? getSessionIngressAuthToken() : null",
  ])
})

test('expired access tokens require a timestamp and have auth exemptions', () => {
  const expired = (entry, { xaa = false, headers = false } = {}) => {
    if (xaa || headers) return false
    return (
      entry !== undefined &&
      !!entry.accessToken &&
      !entry.refreshToken &&
      entry.expiresAt !== undefined &&
      entry.expiresAt < 100
    )
  }

  assert.equal(expired({ accessToken: 'token', expiresAt: 99 }), true)
  assert.equal(expired({ accessToken: 'token', expiresAt: 100 }), false)
  assert.equal(expired({ accessToken: 'token' }), false)
  assert.equal(
    expired({ accessToken: 'token', refreshToken: 'refresh', expiresAt: 99 }),
    false,
  )
  assert.equal(expired({ accessToken: 'token', expiresAt: 99 }, { xaa: true }), false)
  assert.equal(
    expired({ accessToken: 'token', expiresAt: 99 }, { headers: true }),
    false,
  )
})
