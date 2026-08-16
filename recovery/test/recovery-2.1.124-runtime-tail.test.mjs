import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = [
  {
    env: 'CLAUDE_CODE_2_1_123_BUNDLE',
    bytes: 13_949_576,
    sha256:
      '59c8eebc0660d4bbc5c1f82af0ca5e94df5db46084687b979ad21a07fba3d7dd',
  },
  {
    env: 'CLAUDE_CODE_2_1_124_BUNDLE',
    bytes: 13_980_928,
    sha256:
      'dc2b68c385a3064737343e51e6d7c690f9e03cc40fa89c4393708ae03094d590',
  },
]

function readBundle(release) {
  const filename = process.env[release.env]
  assert.ok(filename, `${release.env} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
  )
  return bytes.toString('utf8')
}

function occurrences(value, fragment) {
  let count = 0
  let offset = 0
  while ((offset = value.indexOf(fragment, offset)) !== -1) {
    count += 1
    offset += fragment.length
  }
  return count
}

function source(relative) {
  return fs.readFileSync(path.join(repo, relative), 'utf8')
}

function compact(value) {
  return value.replaceAll(';', '').replaceAll(/\s+/g, ' ').trim()
}

function assertFragments(relative, fragments) {
  const contents = compact(source(relative))
  for (const fragment of fragments) {
    assert.ok(
      contents.includes(compact(fragment)),
      `${relative}: missing ${compact(fragment)}`,
    )
  }
}

test('authenticates retained 2.1.124 runtime-tail witnesses', () => {
  const [baseline, target] = releases.map(readBundle)
  const changedWitnesses = [
    ["History search isn't available in remote sessions yet", 0, 1],
    ['remote-history-search-unavailable', 0, 1],
    ['prideGradient', 0, 1],
    ['borderOnly', 0, 2],
    [
      'Your organization requires Trusted Devices for Remote Control',
      0,
      1,
    ],
    ['attachments_subagent', 1, 2],
    ['Cleared installed plugins cache', 0, 1],
    ['egress gateway', 0, 2],
  ]
  for (const [fragment, baselineCount, targetCount] of changedWitnesses) {
    assert.equal(occurrences(baseline, fragment), baselineCount, fragment)
    assert.equal(occurrences(target, fragment), targetCount, fragment)
  }
})

test('claimed spares and daemon activity preserve the target lifecycle', () => {
  assertFragments('src/daemon/spare.ts', [
    'export function receiveClaim( path: string, onListening?: () => void, ): Promise<ClaimFrame>',
    "server.once('listening', () => { try { onListening() } catch (error) { fail(error) } })",
    "socket.on('error', fail)",
    'export async function runClaimedSpare( frame: ClaimFrame, mainModule: Promise<typeof import(\'../main.js\')>, ): Promise<void>',
    'if (frame.sessionId) switchSession(frame.sessionId as never)',
    'await mainModule await runClaimedSpare(frame, mainModule)',
  ])
  assertFragments('src/daemon/supervisor.ts', [
    'if (adopted) this.lastInputAt = Date.now()',
    'noteActivity(): void { this.lastInputAt = Date.now() }',
    'handle.attachers.set(attachId, { cols: message.cols, rows: message.rows, }) handle.noteActivity()',
  ])
  assertFragments('src/daemon/main.ts', [
    "options.origin === 'service' ? () => auth.getAuthSnapshot() : undefined",
  ])
})

test('remote control, plugin updates, and prompt UI use retained surfaces', () => {
  assertFragments('src/entrypoints/cli.tsx', [
    "await import('../bridge/trustedDevice.js')",
    'const trustedDeviceReason = getTrustedDeviceUnenrolledReason()',
    'exitWithError(`Error: ${trustedDeviceReason}`)',
  ])
  assertFragments('src/commands/plugin/ManagePlugins.tsx', [
    'if (result.alreadyUpToDate || result.skipped)',
    'setResult(result.message)',
  ])
  assertFragments('src/components/PromptInput/PromptInput.tsx', [
    "key: 'remote-history-search-unavailable'",
    "text: \"History search isn't available in remote sessions yet\"",
    '<SwarmBannerBorder banner={swarmBanner} columns={columns} fastModeTag={fastModeTag} borderOnly />',
    'const colorCount = Math.min(colors.length, count)',
  ])
  assertFragments('src/components/PromptInput/PromptInputFooter.tsx', [
    'const error = useAppState(s_4 => s_4.replBridgeError)',
    'if (!isBridgeEnabled() || !enabled || error) return null',
  ])
  assertFragments('src/components/PromptInput/useSwarmBanner.ts', [
    'const prideGradient = standaloneAgentContext?.prideGradient',
    'if (standaloneName || standaloneColor || prideGradient)',
    'gradient: prideGradient',
  ])
})
