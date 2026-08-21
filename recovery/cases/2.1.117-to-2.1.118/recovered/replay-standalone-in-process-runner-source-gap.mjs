#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.117-to-2.1.118'
const RUNNER_PATH = 'src/utils/swarm/inProcessRunner.ts'
const AUTOFIX_PATH = 'src/commands/autofix-pr/autofix-pr.tsx'

const TARGET_FRAGMENT_EVIDENCE =
  'target118-standalone-in-process-target-fragment'
const SOURCE_REPLAY_EVIDENCE =
  'target118-standalone-in-process-source-replay-test'
const SOURCE_AST_EVIDENCE = 'target118-standalone-in-process-source-ast-test'

export const TARGET118_STANDALONE_IN_PROCESS_INPUT_FILES = Object.freeze([
  Object.freeze({
    path: RUNNER_PATH,
    bytes: 54115,
    sha256: '20e269aea7453666ba2e72f1db595e22f63e629e6fa544e0f374bd280afe095b',
  }),
  Object.freeze({
    path: AUTOFIX_PATH,
    bytes: 17317,
    sha256: 'd0d60e24308ac2919bef828cfe9b4325bc229a27c67e6c373a621317397937a6',
  }),
])

export const TARGET118_STANDALONE_IN_PROCESS_OUTPUT_FILES = Object.freeze([
  Object.freeze({
    path: RUNNER_PATH,
    bytes: 54574,
    sha256: '0da81072792e28c687617b7c91678eccc089e69cd92d19988f3b81e15cb25d75',
  }),
  Object.freeze({
    path: AUTOFIX_PATH,
    bytes: 17339,
    sha256: '4020fa11e177621e4c85251b3d14c33244080f0dc583cef26e8bea50d7f7c0c9',
  }),
])

export const TARGET118_STANDALONE_IN_PROCESS_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:13777`,
    targetIndex: 13777,
    paths: Object.freeze([RUNNER_PATH]),
    evidenceIds: Object.freeze([
      TARGET_FRAGMENT_EVIDENCE,
      SOURCE_REPLAY_EVIDENCE,
      SOURCE_AST_EVIDENCE,
    ]),
    behavior:
      'Target118 in-process execution accepts an explicit standalone mode that skips team task claiming and mailbox notifications, exits through in-memory shutdown state, and suppresses team idle and failure notices while retaining normal prompt execution and task lifecycle cleanup.',
  }),
  Object.freeze({
    key: `${CASE_NAME}:15195`,
    targetIndex: 15195,
    paths: Object.freeze([AUTOFIX_PATH]),
    evidenceIds: Object.freeze([
      TARGET_FRAGMENT_EVIDENCE,
      SOURCE_REPLAY_EVIDENCE,
      SOURCE_AST_EVIDENCE,
    ]),
    behavior:
      'Target118 local autofix-pr creates an isolated in-process task and invokes startInProcessTeammate with standalone enabled so the autofix worker does not participate in team mailbox or notification flows.',
  }),
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function replaceExactlyOnce(input, before, after, label) {
  const first = input.indexOf(before)
  const second = input.indexOf(before, first + 1)
  if (first < 0 || second >= 0) {
    throw new Error(
      `${CASE_NAME}: standalone in-process replay requires one exact ${label}`,
    )
  }
  return input.slice(0, first) + after + input.slice(first + before.length)
}

export function buildTarget118StandaloneInProcessRunnerOutput(input) {
  let output = replaceExactlyOnce(
    input,
    '  invokingRequestId?: string\n}',
    [
      '  invokingRequestId?: string',
      '  /** Whether this runner is detached from team mailbox and notification flows. */',
      '  standalone?: boolean',
      '}',
    ].join('\n'),
    'runner-config field anchor',
  )
  output = replaceExactlyOnce(
    output,
    [
      '    allowPermissionPrompts,',
      '    invokingRequestId,',
      '  } = config',
    ].join('\n'),
    [
      '    allowPermissionPrompts,',
      '    invokingRequestId,',
      '    standalone = false,',
      '  } = config',
    ].join('\n'),
    'runInProcessTeammate parameter anchor',
  )
  output = replaceExactlyOnce(
    output,
    '  await tryClaimNextTask(identity.parentSessionId, identity.agentName)',
    [
      '  if (!standalone) {',
      '    await tryClaimNextTask(identity.parentSessionId, identity.agentName)',
      '  }',
    ].join('\n'),
    'initial task-claim anchor',
  )
  output = replaceExactlyOnce(
    output,
    [
      '  setAppState: SetAppStateFn,',
      '  taskListId: string,',
      '): Promise<WaitResult> {',
    ].join('\n'),
    [
      '  setAppState: SetAppStateFn,',
      '  taskListId: string,',
      '  standalone: boolean,',
      '): Promise<WaitResult> {',
    ].join('\n'),
    'poller parameter anchor',
  )
  output = replaceExactlyOnce(
    output,
    [
      '      }',
      '    }',
      '',
      '    // Wait before next poll (skip on first iteration to check immediately)',
    ].join('\n'),
    [
      '      }',
      '    }',
      '',
      '    if (',
      '      task &&',
      "      task.type === 'in_process_teammate' &&",
      '      task.shutdownRequested &&',
      '      standalone',
      '    ) {',
      "      return { type: 'aborted' }",
      '    }',
      '',
      '    // Wait before next poll (skip on first iteration to check immediately)',
    ].join('\n'),
    'standalone shutdown anchor',
  )
  output = replaceExactlyOnce(
    output,
    [
      "      return { type: 'aborted' }",
      '    }',
      '',
      '    // Check for messages in mailbox',
    ].join('\n'),
    [
      "      return { type: 'aborted' }",
      '    }',
      '',
      '    if (standalone) continue',
      '',
      '    // Check for messages in mailbox',
    ].join('\n'),
    'mailbox-skip anchor',
  )
  output = replaceExactlyOnce(
    output,
    '      if (!wasAlreadyIdle) {',
    '      if (!wasAlreadyIdle && !standalone) {',
    'idle-notification anchor',
  )
  output = replaceExactlyOnce(
    output,
    ['        identity.parentSessionId,', '      )'].join('\n'),
    ['        identity.parentSessionId,', '        standalone,', '      )'].join(
      '\n',
    ),
    'poller call anchor',
  )
  output = replaceExactlyOnce(
    output,
    [
      '    await sendIdleNotification(',
      '      identity.agentName,',
      '      identity.color,',
      '      identity.teamName,',
      '      {',
      "        idleReason: 'failed',",
      "        completedStatus: 'failed',",
      '        failureReason: errorMessage,',
      '      },',
      '    )',
    ].join('\n'),
    [
      '    if (!standalone) {',
      '      await sendIdleNotification(',
      '        identity.agentName,',
      '        identity.color,',
      '        identity.teamName,',
      '        {',
      "          idleReason: 'failed',",
      "          completedStatus: 'failed',",
      '          failureReason: errorMessage,',
      '        },',
      '      )',
      '    }',
    ].join('\n'),
    'failure-notification anchor',
  )
  return output
}

export function buildTarget118StandaloneAutofixOutput(input) {
  return replaceExactlyOnce(
    input,
    ['    allowPermissionPrompts: true,', '  })'].join('\n'),
    [
      '    allowPermissionPrompts: true,',
      '    standalone: true,',
      '  })',
    ].join('\n'),
    'autofix standalone-call anchor',
  )
}

export function applyTarget118StandaloneInProcessSourceRecovery({
  sourceRoot,
}) {
  const builders = new Map([
    [RUNNER_PATH, buildTarget118StandaloneInProcessRunnerOutput],
    [AUTOFIX_PATH, buildTarget118StandaloneAutofixOutput],
  ])
  const results = []
  for (let index = 0; index < TARGET118_STANDALONE_IN_PROCESS_INPUT_FILES.length; index += 1) {
    const input = TARGET118_STANDALONE_IN_PROCESS_INPUT_FILES[index]
    const output = TARGET118_STANDALONE_IN_PROCESS_OUTPUT_FILES[index]
    const filename = path.join(sourceRoot, input.path.replace(/^src\//, ''))
    const bytes = fs.readFileSync(filename)
    const actual = descriptor(bytes)
    if (actual.bytes === output.bytes && actual.sha256 === output.sha256) {
      results.push({ path: input.path, status: 'already-recovered', ...actual })
      continue
    }
    if (actual.bytes !== input.bytes || actual.sha256 !== input.sha256) {
      throw new Error(
        `${CASE_NAME}: ${input.path} is neither authenticated input nor recovered output (${actual.bytes}/${actual.sha256})`,
      )
    }
    const recovered = Buffer.from(builders.get(input.path)(bytes.toString('utf8')))
    const recoveredDescriptor = descriptor(recovered)
    if (
      recoveredDescriptor.bytes !== output.bytes ||
      recoveredDescriptor.sha256 !== output.sha256
    ) {
      throw new Error(
        `${CASE_NAME}: unexpected recovered ${input.path} descriptor ${recoveredDescriptor.bytes}/${recoveredDescriptor.sha256}`,
      )
    }
    fs.writeFileSync(filename, recovered)
    results.push({ path: input.path, status: 'recovered', ...recoveredDescriptor })
  }
  return results
}

function parseArgs(argv) {
  const index = argv.indexOf('--source-root')
  if (index < 0 || !argv[index + 1] || argv.length !== 2) {
    throw new Error(
      'usage: replay-standalone-in-process-runner-source-gap.mjs --source-root DIR',
    )
  }
  return { sourceRoot: path.resolve(argv[index + 1]) }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(
    `${JSON.stringify(applyTarget118StandaloneInProcessSourceRecovery(parseArgs(process.argv.slice(2))))}\n`,
  )
}
