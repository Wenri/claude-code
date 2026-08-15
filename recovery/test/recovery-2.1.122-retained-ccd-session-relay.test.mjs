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

test('authenticates the retained ccd_session notification relay', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      occurrences(bundle, 'ccd_session'),
      1,
      `${release.version}: server-name cardinality`,
    )

    const anchor = bundle.indexOf('ccd_session')
    const relay = bundle.slice(anchor - 100, anchor + 900)
    const declaration = relay.match(/function ([A-Za-z_$][\w$]*)\(/)
    assert.ok(declaration, `${release.version}: relay declaration`)
    assert.equal(
      occurrences(bundle, `${declaration[1]}(`),
      2,
      `${release.version}: declaration plus callsite`,
    )
    assert.match(relay, /\.find\(\([^)]+\)=>[^.]+\.name==="ccd_session"\)/)
    assert.match(relay, /\.type!=="connected"\)return/)
    assert.match(relay, /\.client\.setNotificationHandler\([^,]+,async\(/)
    assert.match(relay, /new Set\(\["tengu_message_rated"\]\)/)
    assert.match(relay, /\.has\([A-Za-z_$][\w$]*\)\)return/)
    assert.match(relay, /==null\?void 0:String\(/)
    assert.match(
      relay,
      /message_uuid:[^,]+,sentiment:[^,]+,surface:[^,]+,cleared:[^.]+\.cleared===!0/,
    )
  }
})

test('source allowlists, normalizes, and registers the relay after SDK setup', () => {
  const relay = fs.readFileSync(
    path.join(repo, 'src/services/mcp/ccdSessionSdkMcp.ts'),
    'utf8',
  )
  const print = fs.readFileSync(path.join(repo, 'src/cli/print.ts'), 'utf8')

  for (const fragment of [
    "new Set(['tengu_message_rated'])",
    "client.name === 'ccd_session'",
    "connection.type !== 'connected'",
    'LogEventNotificationSchema()',
    '!ALLOWED_CCD_SESSION_EVENTS.has(eventName)',
    'value == null',
    'String(',
    'message_uuid: optionalString(data.message_uuid)',
    'sentiment: optionalString(data.sentiment)',
    'surface: optionalString(data.surface)',
    'cleared: data.cleared === true',
  ]) {
    assert.ok(relay.includes(fragment), fragment)
  }

  const vscodeCall = print.indexOf('setupVscodeSdkMcp(sdkClients)')
  const ccdCall = print.indexOf('setupCcdSessionSdkMcp(sdkClients)')
  assert.ok(vscodeCall >= 0, 'VSCode setup call')
  assert.ok(ccdCall > vscodeCall, 'ccd_session setup follows VSCode setup')
})
