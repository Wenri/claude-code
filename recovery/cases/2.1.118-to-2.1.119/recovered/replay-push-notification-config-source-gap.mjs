#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.118-to-2.1.119'
const TARGET_FRAGMENT_EVIDENCE =
  'target119-push-notification-config-target-fragment'
const SOURCE_REPLAY_EVIDENCE =
  'target119-push-notification-config-source-replay-test'

export const TARGET119_PUSH_NOTIFICATION_CONFIG_FILES = Object.freeze([
  Object.freeze({
    path: 'src/hooks/useRemoteControlIdleUpsell.tsx',
    input: Object.freeze({
      bytes: 4957,
      sha256:
        '25f7072d1373d44655336353f8cfdbc0a280eb50b5bdb1789b42d8d597fbf34d',
    }),
    output: Object.freeze({
      bytes: 5050,
      sha256:
        'f9fc79a6d3578c143760553b54224c50c66ac639aabfbe060b416ed9330da2b3',
    }),
    importAnchor: "} from '../utils/config.js'\n",
    importText:
      "import { getConfigValue } from '../utils/settings/configSettings.js'\n",
  }),
  Object.freeze({
    path: 'src/services/tips/tipRegistry.ts',
    input: Object.freeze({
      bytes: 25930,
      sha256:
        'cd02a4e52bab668e3da047ba569937e78b0779d12f94ac0ca501aa5b335727b5',
    }),
    output: Object.freeze({
      bytes: 26026,
      sha256:
        'a6b00668635103783f14d7179216447c3f29cc8b1e276634b11c0a9a344083f0',
    }),
    importAnchor: "} from '../../utils/config.js'\n",
    importText:
      "import { getConfigValue } from '../../utils/settings/configSettings.js'\n",
  }),
])

export const TARGET119_PUSH_NOTIFICATION_CONFIG_EVIDENCE_IDS = Object.freeze([
  TARGET_FRAGMENT_EVIDENCE,
  SOURCE_REPLAY_EVIDENCE,
])

export const TARGET119_PUSH_NOTIFICATION_CONFIG_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:18156`,
      targetIndex: 18156,
      paths: Object.freeze([
        'src/hooks/useRemoteControlIdleUpsell.tsx',
      ]),
      evidenceIds: TARGET119_PUSH_NOTIFICATION_CONFIG_EVIDENCE_IDS,
      behavior:
        'The complete authenticated Target119 unit is the recovered shouldShowPushNotificationIdleUpsell declaration: it gates the idle push-notification upsell on bridge availability, the feature flag, prior remote-control use, the settings-backed agentPushNotifEnabled value, and the impression cap; the provisional RemoteCallout owner is rejected.',
    }),
    Object.freeze({
      key: `${CASE_NAME}:18157`,
      targetIndex: 18157,
      paths: Object.freeze(['src/services/tips/tipRegistry.ts']),
      evidenceIds: TARGET119_PUSH_NOTIFICATION_CONFIG_EVIDENCE_IDS,
      behavior:
        'The complete authenticated Target119 unit is the recovered isPushNotificationTipRelevant declaration: it gates the tip on bridge availability, the feature flag, prior remote-control use, and the settings-backed agentPushNotifEnabled value; the provisional RemoteCallout owner is rejected.',
    }),
  ])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function sourceDescriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

export function buildTarget119PushNotificationConfigOutput(input, file) {
  if (input.split(file.importAnchor).length !== 2) {
    throw new Error(`${file.path}: config import anchor differs`)
  }
  if (input.split(file.importText).length !== 1) {
    throw new Error(`${file.path}: getConfigValue import already present`)
  }
  const priorExpression = 'config.agentPushNotifEnabled !== true'
  if (input.split(priorExpression).length !== 2) {
    throw new Error(`${file.path}: legacy config expression differs`)
  }
  return input
    .replace(file.importAnchor, file.importAnchor + file.importText)
    .replace(
      priorExpression,
      "getConfigValue('agentPushNotifEnabled', false).value !== true",
    )
}

export function applyTarget119PushNotificationConfigReplay({ sourceRoot }) {
  const states = TARGET119_PUSH_NOTIFICATION_CONFIG_FILES.map(file => {
    const filename = path.join(sourceRoot, file.path.replace(/^src\//, ''))
    const input = fs.readFileSync(filename)
    const actual = sourceDescriptor(input)
    if (
      actual.bytes === file.input.bytes &&
      actual.sha256 === file.input.sha256
    ) {
      return { file, filename, input, state: 'raw' }
    }
    if (
      actual.bytes === file.output.bytes &&
      actual.sha256 === file.output.sha256
    ) {
      return { file, filename, input, state: 'recovered' }
    }
    throw new Error(
      `${file.path}: unknown source image ${actual.bytes}/${actual.sha256}`,
    )
  })
  const uniqueStates = new Set(states.map(state => state.state))
  if (uniqueStates.size !== 1) {
    throw new Error('Target119 push-notification replay source state is partial')
  }
  if (states[0].state === 'recovered') {
    return Object.freeze({ status: 'already-recovered', changed: false })
  }
  const outputs = states.map(({ file, filename, input }) => {
    const output = Buffer.from(
      buildTarget119PushNotificationConfigOutput(input.toString('utf8'), file),
    )
    const actual = sourceDescriptor(output)
    if (
      actual.bytes !== file.output.bytes ||
      actual.sha256 !== file.output.sha256
    ) {
      throw new Error(
        `${file.path}: replay produced ${actual.bytes}/${actual.sha256}`,
      )
    }
    return { filename, output }
  })
  for (const { filename, output } of outputs) fs.writeFileSync(filename, output)
  return Object.freeze({ status: 'recovered', changed: true })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceRoot = process.argv[2]
  if (!sourceRoot) {
    throw new Error(
      'usage: replay-push-notification-config-source-gap.mjs <source-root>',
    )
  }
  console.log(applyTarget119PushNotificationConfigReplay({ sourceRoot }))
}
