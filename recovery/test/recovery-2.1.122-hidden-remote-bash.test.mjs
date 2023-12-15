import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))

const RELEASES = [
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

function loadBundle(release) {
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

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

function compact(value) {
  return value.replaceAll(/\s+/g, ' ').trim()
}

function assertSourceIncludes(relativePath, fragments) {
  const contents = compact(source(relativePath))
  for (const fragment of fragments) {
    assert.ok(
      contents.includes(compact(fragment)),
      `${relativePath}: missing ${fragment}`,
    )
  }
}

test('authenticates target-only Remote Control bash and effort surfaces', () => {
  const baseline = loadBundle(RELEASES[0])
  const target = loadBundle(RELEASES[1])
  const targetOnly = [
    'Shell command to execute verbatim via a one-shot',
    '@internal A user-initiated shell command dispatched',
    'Skipping duplicate bash_command message:',
    'Command failed: missing command',
    '[sendBashCommandToRemoteSession]',
    'Sending bash_command to session',
  ]
  for (const fragment of targetOnly) {
    assert.equal(occurrences(baseline, fragment), 0, `baseline: ${fragment}`)
    assert.equal(occurrences(target, fragment), 1, `target: ${fragment}`)
  }
  assert.equal(occurrences(baseline, 'bash-exit-code'), 0)
  assert.equal(occurrences(target, 'bash-exit-code'), 2)
  assert.equal(occurrences(baseline, 'effort_level'), 0)
  assert.equal(occurrences(target, 'effort_level'), 2)
})

test('authenticates retained message provenance and non-query contract', () => {
  const baseline = loadBundle(RELEASES[0])
  const target = loadBundle(RELEASES[1])
  const retained = [
    'When false, the message is appended to the transcript without triggering an assistant turn. It will be merged into the next user message that does query.',
    'Provenance of a user-role message (peer session, team lead, channel). Absent or `human` means keyboard input from the user.',
  ]
  for (const fragment of retained) {
    assert.equal(occurrences(baseline, fragment), 1, `baseline: ${fragment}`)
    assert.equal(occurrences(target, fragment), 1, `target: ${fragment}`)
  }
  assert.equal(occurrences(baseline, 'file_attachments'), 8)
  assert.equal(occurrences(target, 'file_attachments'), 8)
})

test('recovers Remote Control bash schema, execution, and relay semantics', () => {
  assertSourceIncludes('src/entrypoints/sdk/coreSchemas.ts', [
    "kind: z.literal('channel'), server: z.string()",
    "kind: z.literal('peer')",
    "type: z.literal('bash_command')",
    'Shell command to execute verbatim via a one-shot',
    'Working directory for the command. Falls back to the session cwd when omitted.',
  ])
  assertSourceIncludes('src/entrypoints/sdk/controlSchemas.ts', [
    'SDKBashCommandSchema()',
  ])
  assertSourceIncludes('src/constants/xml.ts', [
    "BASH_EXIT_CODE_TAG = 'bash-exit-code'",
    'BASH_EXIT_CODE_TAG,',
  ])
  assertSourceIncludes('src/cli/headlessBashCommand.ts', [
    "resolveDefaultShell() === 'powershell'",
    "{ file: 'pwsh', args: ['-NoProfile', '-Command', command] }",
    "{ file: '/bin/sh', args: ['-c', command] }",
    'preserveOutputOnError: true',
    'error.startsWith(`Command failed with exit code ${code}`)',
    '<${BASH_EXIT_CODE_TAG}>${code}</${BASH_EXIT_CODE_TAG}>',
  ])
  assertSourceIncludes('src/utils/teleport/api.ts', [
    'async function sendRemoteSessionEvent(',
    "type: 'bash_command'",
    "'[sendBashCommandToRemoteSession]'",
    "...(command.cwd !== undefined && { cwd: command.cwd })",
  ])
  assertSourceIncludes('src/remote/RemoteSessionManager.ts', [
    'async sendBashCommand(',
    'sendBashCommandToRemoteSession(',
    'Sending bash_command to session',
  ])
})

test('recovers print bash lifecycle and flag metadata updates', () => {
  assertSourceIncludes('src/cli/print.ts', [
    "message.type !== 'bash_command'",
    "if (message.type === 'bash_command')",
    'Skipping duplicate bash_command message:',
    'Command failed: missing command',
    "import( './headlessBashCommand.js' )",
    'abortSignal: controlRequestAbortController.signal',
    'pendingBashCommands.add(pending)',
    'await Promise.allSettled(pendingBashCommands)',
    'mainLoopModelForSession: newModel',
    "if ('effortLevel' in incoming)",
    'effort_level: incoming.effortLevel == null ? null : String(incoming.effortLevel)',
  ])
})

test('recovers retained queue, replay, origin, and non-query threading', () => {
  assertSourceIncludes('src/types/textInputTypes.ts', [
    'shouldQuery?: boolean',
    'fileAttachments?: unknown[]',
    'stopHookActive?: boolean',
  ])
  assertSourceIncludes('src/utils/processUserInput/processUserInput.ts', [
    'if (shouldQuery === false)',
    'result.shouldQuery = false',
  ])
  assertSourceIncludes('src/utils/attachments.ts', [
    'fileAttachments?: unknown[]',
    'fileAttachments: _.fileAttachments',
  ])
  assertSourceIncludes('src/QueryEngine.ts', [
    'processedShouldQuery && options?.shouldQuery !== false',
    "if (message.type === 'user') message.origin = options.origin",
    'options?.shouldQuery === false ? messagesToAck : []',
    'file_attachments: fileAttachments',
    'stopHookActive: options?.stopHookActive',
    'message.attachment.fileAttachments',
    'origin: message.attachment.origin',
  ])
  assertSourceIncludes('src/cli/print.ts', [
    'next.shouldQuery === head.shouldQuery',
    'originsEqual(head.origin, next.origin)',
    'fileAttachments: batch.flatMap(',
    'if (command.shouldQuery !== false)',
    'shouldQuery: cmd.shouldQuery',
    'fileAttachments: cmd.fileAttachments',
    'if (cmd.shouldQuery === false)',
    'cmd.shouldQuery !== false',
    'shouldQuery: message.shouldQuery',
    'extractInboundAttachments(message)',
  ])
})
