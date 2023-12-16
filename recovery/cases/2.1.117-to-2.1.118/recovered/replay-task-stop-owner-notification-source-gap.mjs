#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.117-to-2.1.118'
const SOURCE_PATH = 'src/tasks/stopTask.ts'

const TARGET_FRAGMENT_EVIDENCE =
  'target118-task-stop-owner-notification-target-fragment'
const SOURCE_REPLAY_EVIDENCE =
  'target118-task-stop-owner-notification-source-replay-test'
const SOURCE_AST_EVIDENCE =
  'target118-task-stop-owner-notification-source-ast-test'

export const TARGET118_TASK_STOP_OWNER_NOTIFICATION_INPUT_FILE =
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 2894,
    sha256: '258617890f599896b62520f0687872f229d897fa6c52c408dd1f7780471c2863',
  })

export const TARGET118_TASK_STOP_OWNER_NOTIFICATION_DONOR_FILE =
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 4644,
    sha256: '47acad782eeb2a2b4d7465db1b3e6df716cf42b525c936efff0d3ba2501d4c6f',
    blob: 'd4b34209c8fc05ac9f9db1074bc122e0023315fd',
  })

export const TARGET118_TASK_STOP_OWNER_NOTIFICATION_OUTPUT_FILE =
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 4832,
    sha256: 'd2219655fd05785f5e8aae29969b0c886eca3c74f0396f1ce6c4130c0eb2738a',
  })

export const TARGET118_TASK_STOP_OWNER_NOTIFICATION_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:13227`,
      targetIndex: 13227,
      paths: Object.freeze([SOURCE_PATH]),
      declarations: Object.freeze([
        'formatAgentId',
        'enqueueTaskStoppedNotification',
        'stopTask',
      ]),
      evidenceIds: Object.freeze([
        TARGET_FRAGMENT_EVIDENCE,
        SOURCE_REPLAY_EVIDENCE,
        SOURCE_AST_EVIDENCE,
      ]),
      behavior:
        'Target118 routes a stopped local-shell task notification back to its owning agent, formats the main session or explicit stopper identity in the summary, preserves the optional tool-use ID, and queues the XML notification at next priority.',
    }),
  ])

const DONOR_TRANSFORMS = Object.freeze([
  Object.freeze({
    label: 'generalize the stopped-task helper name and identity formatter',
    before: 'function enqueueTaskStoppedByMainNotification({\n',
    after: [
      'function formatAgentId(agentId: AgentId | undefined): string {',
      "  return agentId ?? 'main session'",
      '}',
      '',
      'function enqueueTaskStoppedNotification({',
      '',
    ].join('\n'),
  }),
  Object.freeze({
    label: 'thread the optional stopper identity into the helper contract',
    before: [
      '  ownerAgentId,',
      '}: {',
      '  taskId: string',
      '  toolUseId?: string',
      '  description: string',
      '  ownerAgentId: AgentId',
      '}): void {',
      '  const summary = `Task "${description}" was stopped by main session`',
    ].join('\n'),
    after: [
      '  ownerAgentId,',
      '  stopperAgentId,',
      '}: {',
      '  taskId: string',
      '  toolUseId?: string',
      '  description: string',
      '  ownerAgentId: AgentId',
      '  stopperAgentId?: AgentId',
      '}): void {',
      '  const summary = `Task "${description}" was stopped by ${formatAgentId(stopperAgentId)}`',
    ].join('\n'),
  }),
  Object.freeze({
    label: 'share stopper identity formatting with ownership errors',
    before:
      "`Task ${taskId} is owned by ${task.agentId ?? 'main session'}; agent ${callerAgentId} cannot stop it.`",
    after:
      '`Task ${taskId} is owned by ${formatAgentId(task.agentId)}; agent ${callerAgentId} cannot stop it.`',
  }),
  Object.freeze({
    label: 'call the generalized owner notification helper',
    before: '    enqueueTaskStoppedByMainNotification({\n',
    after: '    enqueueTaskStoppedNotification({\n',
  }),
  Object.freeze({
    label: 'pass the caller identity as the stopper identity',
    before: '      ownerAgentId: task.agentId,\n',
    after: [
      '      ownerAgentId: task.agentId,',
      '      stopperAgentId: callerAgentId,',
      '',
    ].join('\n'),
  }),
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function sameDescriptor(actual, expected) {
  return actual.bytes === expected.bytes && actual.sha256 === expected.sha256
}

function replaceExactly(source, before, after, label) {
  const count = source.split(before).length - 1
  if (count !== 1) {
    throw new Error(`${label}: anchor count ${count}, expected 1`)
  }
  return source.replace(before, after)
}

function repositoryRoot() {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../..',
  )
}

function readDonor() {
  const donorPath = path.join(repositoryRoot(), SOURCE_PATH)
  const value = fs.readFileSync(donorPath)
  const actual = descriptor(value)
  if (!sameDescriptor(actual, TARGET118_TASK_STOP_OWNER_NOTIFICATION_DONOR_FILE)) {
    throw new Error(
      `${SOURCE_PATH}: cumulative donor drift ${actual.bytes}/${actual.sha256}`,
    )
  }
  return value
}

function buildPostimage() {
  let source = readDonor().toString('utf8')
  for (const transform of DONOR_TRANSFORMS) {
    source = replaceExactly(
      source,
      transform.before,
      transform.after,
      transform.label,
    )
  }
  const output = Buffer.from(source)
  const actual = descriptor(output)
  if (!sameDescriptor(actual, TARGET118_TASK_STOP_OWNER_NOTIFICATION_OUTPUT_FILE)) {
    throw new Error(
      `${SOURCE_PATH}: generated postimage drift ${actual.bytes}/${actual.sha256}`,
    )
  }
  return output
}

function resolveSourceFile(sourceRoot) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, SOURCE_PATH.slice('src/'.length))
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${SOURCE_PATH}: escapes supplied source root`)
  }
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${SOURCE_PATH}: expected a real source file`)
  }
  return filename
}

export function applyTarget118TaskStopOwnerNotificationSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const filename = resolveSourceFile(sourceRoot)
  const current = fs.readFileSync(filename)
  const actual = descriptor(current)
  if (
    sameDescriptor(
      actual,
      TARGET118_TASK_STOP_OWNER_NOTIFICATION_OUTPUT_FILE,
    )
  ) {
    buildPostimage()
    return {
      status: 'already-recovered',
      outputFile: TARGET118_TASK_STOP_OWNER_NOTIFICATION_OUTPUT_FILE,
      ownerOverrides:
        TARGET118_TASK_STOP_OWNER_NOTIFICATION_OWNER_OVERRIDES.length,
    }
  }
  if (
    !sameDescriptor(actual, TARGET118_TASK_STOP_OWNER_NOTIFICATION_INPUT_FILE)
  ) {
    throw new Error(
      `${SOURCE_PATH}: refusing unknown preimage ${actual.bytes}/${actual.sha256}`,
    )
  }

  const output = buildPostimage()
  fs.writeFileSync(filename, output)
  const written = descriptor(fs.readFileSync(filename))
  if (
    !sameDescriptor(
      written,
      TARGET118_TASK_STOP_OWNER_NOTIFICATION_OUTPUT_FILE,
    )
  ) {
    throw new Error(`${SOURCE_PATH}: written postimage differs`)
  }
  return {
    status: 'recovered',
    outputFile: TARGET118_TASK_STOP_OWNER_NOTIFICATION_OUTPUT_FILE,
    ownerOverrides:
      TARGET118_TASK_STOP_OWNER_NOTIFICATION_OWNER_OVERRIDES.length,
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceRootIndex = process.argv.indexOf('--source-root')
  if (sourceRootIndex < 0 || !process.argv[sourceRootIndex + 1]) {
    throw new Error(
      'usage: replay-task-stop-owner-notification-source-gap.mjs --source-root DIR',
    )
  }
  process.stdout.write(
    `${JSON.stringify(
      applyTarget118TaskStopOwnerNotificationSourceRecovery({
        sourceRoot: path.resolve(process.argv[sourceRootIndex + 1]),
      }),
    )}\n`,
  )
}
