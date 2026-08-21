#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.117-to-2.1.118'
const OWNER_PATH = 'src/skills/bundled/scheduleRemoteAgents.ts'
const TARGET_FRAGMENT_EVIDENCE =
  'target118-schedule-one-off-gate-target-fragment'
const REPLAY_EVIDENCE = 'target118-schedule-one-off-gate-source-replay-test'

export const TARGET118_SCHEDULE_ONE_OFF_GATE_INPUT = Object.freeze({
  path: OWNER_PATH,
  bytes: 23033,
  sha256: 'db76c4d1f3b3e4556653ca0bae6197e14fe366083129835c496d45e0166a4364',
})

export const TARGET118_SCHEDULE_ONE_OFF_GATE_OUTPUT = Object.freeze({
  path: OWNER_PATH,
  bytes: 23624,
  sha256: 'fd40510f09f2bf37127ade428ab9a7f113ea90831f377ab488b516ebceae8cb9',
})

function override(targetIndex, behavior) {
  return Object.freeze({
    key: `${CASE_NAME}:${targetIndex}`,
    targetIndex,
    paths: Object.freeze([OWNER_PATH]),
    evidenceIds: Object.freeze([
      TARGET_FRAGMENT_EVIDENCE,
      REPLAY_EVIDENCE,
    ]),
    behavior,
  })
}

export const TARGET118_SCHEDULE_ONE_OFF_GATE_OWNER_OVERRIDES = Object.freeze([
  override(
    20566,
    'Target118 gates every one-off schedule instruction in buildPrompt behind tengu_mocha_barista while retaining recurring-only prompt text when disabled.',
  ),
  override(
    20567,
    'Target118 samples tengu_mocha_barista for each schedule invocation and passes the result into the one-off-aware prompt builder.',
  ),
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: Buffer.byteLength(value), sha256: sha256(value) }
}

function replaceExactly(value, before, after, label) {
  const count = value.split(before).length - 1
  if (count !== 1) {
    throw new Error(`Target118 schedule one-off ${label} count is ${count}`)
  }
  return value.replace(before, after)
}

function conditionalString(value) {
  return `\${oneOffEnabled ? ${JSON.stringify(value)} : ''}`
}

function recoverScheduleOneOffGate(input) {
  let value = input
  value = replaceExactly(
    value,
    '  nowLocal: string\n',
    '  nowLocal: string\n  oneOffEnabled: boolean\n',
    'option type',
  )
  value = replaceExactly(
    value,
    '    nowLocal,\n    connectorsInfo,',
    '    nowLocal,\n    oneOffEnabled,\n    connectorsInfo,',
    'option destructuring',
  )
  value = replaceExactly(
    value,
    'infrastructure, either on a recurring cron schedule or once at a specific time',
    "infrastructure${oneOffEnabled ? ', either on a recurring cron schedule or once at a specific time' : ' on a recurring cron schedule'}",
    'intro gate',
  )

  const oneTimeParagraph =
    'For a one-time run, replace \\`"cron_expression": "CRON_EXPR"\\` with \\`"run_once_at": "YYYY-MM-DDTHH:MM:SSZ"\\` (RFC3339 UTC, must be in the future). Everything else is identical.\n\n'
  value = replaceExactly(
    value,
    oneTimeParagraph,
    conditionalString(oneTimeParagraph),
    'one-time example gate',
  )

  const bothScheduleFields =
    '- Exactly ONE of:\n  - \\`cron_expression\\` (string) — 5-field cron in UTC. **Minimum interval is 1 hour.**\n  - \\`run_once_at\\` (string) — RFC3339 UTC timestamp. Must be in the future. Fires once, then auto-disables.'
  const recurringScheduleField =
    '- \\`cron_expression\\` (string) — 5-field cron in UTC. **Minimum interval is 1 hour.**'
  value = replaceExactly(
    value,
    bothScheduleFields,
    `\${oneOffEnabled ? ${JSON.stringify(bothScheduleFields)} : ${JSON.stringify(recurringScheduleField)}}`,
    'required fields gate',
  )

  value = replaceExactly(
    value,
    '- \\`name\\`, \\`cron_expression\\`, \\`run_once_at\\`, \\`enabled\\`, \\`job_config\\`',
    '- \\`name\\`, \\`cron_expression\\`' +
      `\${oneOffEnabled ? ${JSON.stringify(', \\`run_once_at\\`')} : ''}` +
      ', \\`enabled\\`, \\`job_config\\`',
    'update fields gate',
  )

  value = replaceExactly(
    value,
    'Cron expressions and \\`run_once_at\\` timestamps',
    `Cron expressions\${oneOffEnabled ? ${JSON.stringify(' and \\`run_once_at\\` timestamps')} : ''}`,
    'timezone field gate',
  )
  const conversion =
    ' For one-time runs, the same conversion applies — "run this at 3pm" → \\`"run_once_at": "YYYY-MM-DDTHH:00:00Z"\\` with their 3pm converted to UTC.'
  value = replaceExactly(
    value,
    conversion,
    conditionalString(conversion),
    'timezone example gate',
  )

  const currentTimeStart = '\n### Current Time (for one-off runs)\n'
  const currentTimeEnd = '\n## Workflow'
  const currentTimeStartIndex = value.indexOf(currentTimeStart)
  const currentTimeEndIndex = value.indexOf(
    currentTimeEnd,
    currentTimeStartIndex,
  )
  if (currentTimeStartIndex < 0 || currentTimeEndIndex < 0) {
    throw new Error('Target118 schedule current-time anchors differ')
  }
  const currentTimeSection = value.slice(
    currentTimeStartIndex,
    currentTimeEndIndex,
  )
  value = replaceExactly(
    value,
    currentTimeSection,
    `\${oneOffEnabled ? \`${currentTimeSection}\` : ''}`,
    'current-time section gate',
  )

  const workflowOneOff =
    ' If they want a one-time run (e.g., "once at 3pm", "tomorrow morning", "remind me to check X later"), use \\`run_once_at\\` instead of \\`cron_expression\\` — same timezone conversion applies. **First re-check the current time with \\`date -u\\` via Bash** (the reference time above may be stale in a long conversation), resolve the relative phrase against that fresh value, and confirm the resulting absolute timestamp with the user.'
  value = replaceExactly(
    value,
    workflowOneOff,
    conditionalString(workflowOneOff),
    'workflow gate',
  )
  const endedReason =
    '- When listing routines, \\`ended_reason: "run_once_fired"\\` means a one-shot already ran (shows as "Ran" in the web UI). The user can re-arm it by updating with a new \\`run_once_at\\`.\n'
  value = replaceExactly(
    value,
    endedReason,
    conditionalString(endedReason),
    'ended-reason gate',
  )

  const nowLocalBlock = `      const nowLocal = now.toLocaleString('en-US', {
        timeZone: userTimezone,
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
      const connectorsInfo = formatConnectorsInfo(connectors)`
  value = replaceExactly(
    value,
    nowLocalBlock,
    nowLocalBlock.replace(
      '      const connectorsInfo',
      `      const oneOffEnabled = getFeatureValue_CACHED_MAY_BE_STALE(
        'tengu_mocha_barista',
        false,
      )
      const connectorsInfo`,
    ),
    'invocation gate sample',
  )
  value = replaceExactly(
    value,
    '        nowLocal,\n        connectorsInfo,',
    '        nowLocal,\n        oneOffEnabled,\n        connectorsInfo,',
    'prompt call gate',
  )
  return value
}

function resolveSourceRoot(value) {
  const direct = path.join(value, 'skills/bundled/scheduleRemoteAgents.ts')
  if (fs.existsSync(direct)) return value
  const nested = path.join(value, 'src/skills/bundled/scheduleRemoteAgents.ts')
  if (fs.existsSync(nested)) return path.join(value, 'src')
  throw new Error(`Target118 schedule source root is invalid: ${value}`)
}

export function applyTarget118ScheduleOneOffGateReplay({ sourceRoot }) {
  const resolved = resolveSourceRoot(sourceRoot)
  const filename = path.join(
    resolved,
    'skills/bundled/scheduleRemoteAgents.ts',
  )
  const input = fs.readFileSync(filename, 'utf8')
  const observed = descriptor(input)
  if (
    observed.bytes === TARGET118_SCHEDULE_ONE_OFF_GATE_OUTPUT.bytes &&
    observed.sha256 === TARGET118_SCHEDULE_ONE_OFF_GATE_OUTPUT.sha256
  ) {
    return { status: 'already-recovered', file: TARGET118_SCHEDULE_ONE_OFF_GATE_OUTPUT }
  }
  if (
    observed.bytes !== TARGET118_SCHEDULE_ONE_OFF_GATE_INPUT.bytes ||
    observed.sha256 !== TARGET118_SCHEDULE_ONE_OFF_GATE_INPUT.sha256
  ) {
    throw new Error(
      `Target118 schedule source preimage differs: ${observed.bytes}/${observed.sha256}`,
    )
  }
  const output = recoverScheduleOneOffGate(input)
  const recovered = descriptor(output)
  if (
    recovered.bytes !== TARGET118_SCHEDULE_ONE_OFF_GATE_OUTPUT.bytes ||
    recovered.sha256 !== TARGET118_SCHEDULE_ONE_OFF_GATE_OUTPUT.sha256
  ) {
    throw new Error(
      `Target118 schedule source postimage differs: ${recovered.bytes}/${recovered.sha256}`,
    )
  }
  fs.writeFileSync(filename, output)
  return { status: 'recovered', file: TARGET118_SCHEDULE_ONE_OFF_GATE_OUTPUT }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--source-root')
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error('usage: replay-schedule-one-off-gate-source-gap.mjs --source-root DIR')
  }
  process.stdout.write(
    `${JSON.stringify(applyTarget118ScheduleOneOffGateReplay({ sourceRoot: process.argv[index + 1] }))}\n`,
  )
}
