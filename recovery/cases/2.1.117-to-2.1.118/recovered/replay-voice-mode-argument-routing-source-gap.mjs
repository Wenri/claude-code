#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.117-to-2.1.118'
const SOURCE_PATH = 'src/commands/voice/voice.ts'

const TARGET_FRAGMENT_EVIDENCE =
  'target118-voice-mode-argument-routing-target-fragment'
const SOURCE_REPLAY_EVIDENCE =
  'target118-voice-mode-argument-routing-source-replay-test'
const SOURCE_AST_EVIDENCE =
  'target118-voice-mode-argument-routing-source-ast-test'

export const TARGET118_VOICE_MODE_ARGUMENT_ROUTING_INPUT = Object.freeze({
  path: SOURCE_PATH,
  bytes: 5264,
  sha256:
    'c762dd43aaa643b005874113036d7f9a488370333ca0fdd5e61aaba2ba4892be',
})

export const TARGET118_VOICE_MODE_ARGUMENT_ROUTING_OUTPUT = Object.freeze({
  path: SOURCE_PATH,
  bytes: 6306,
  sha256:
    '2c6755401bba9d507c8416e23d56e94b432ccae42df0fcb835332237990bbcae',
})

export const TARGET118_VOICE_MODE_ARGUMENT_ROUTING_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:17842`,
      targetIndex: 17842,
      paths: Object.freeze([SOURCE_PATH]),
      declarations: Object.freeze(['parseMode', 'call']),
      evidenceIds: Object.freeze([
        TARGET_FRAGMENT_EVIDENCE,
        SOURCE_REPLAY_EVIDENCE,
        SOURCE_AST_EVIDENCE,
      ]),
      behavior:
        'The complete authenticated Target118 voice command accepts hold, tap, and off modes; persists the nested voice enabled/mode state alongside the legacy flag; emits tap-mode telemetry; and returns the mode-specific push-to-talk instruction. The historical Target118 source lacks this exact argument-routing transition, which is restored from the pinned later authored declaration.',
    }),
  ])

const REPLACEMENTS = Object.freeze([
  Object.freeze({
    before: `export const call: LocalCommandCall = async () => {`,
    after: `function parseMode(
  argument: string,
): 'hold' | 'tap' | 'off' | 'invalid' | undefined {
  const mode = argument.trim().toLowerCase()
  if (mode === '') return undefined
  if (mode === 'hold' || mode === 'tap' || mode === 'off') return mode
  return 'invalid'
}

export const call: LocalCommandCall = async argument => {`,
  }),
  Object.freeze({
    before: `  const currentSettings = getInitialSettings()
  const isCurrentlyEnabled = currentSettings.voiceEnabled === true

  // Toggle OFF — no checks needed
  if (isCurrentlyEnabled) {`,
    after: `  const currentSettings = getInitialSettings()
  const isCurrentlyEnabled =
    currentSettings.voice?.enabled ?? currentSettings.voiceEnabled === true
  const requestedMode = parseMode(argument)

  if (requestedMode === 'invalid') {
    return {
      type: 'text' as const,
      value: \`Unknown mode: "\${argument.trim()}". Use hold, tap, or off.\`,
    }
  }

  // Toggle OFF — no checks needed
  if (
    requestedMode === 'off' ||
    (requestedMode === undefined && isCurrentlyEnabled)
  ) {`,
  }),
  Object.freeze({
    before: `    const result = updateSettingsForSource('userSettings', {
      voiceEnabled: false,
    })`,
    after: `    const result = updateSettingsForSource('userSettings', {
      voiceEnabled: false,
      voice: { ...currentSettings.voice, enabled: false },
    })`,
  }),
  Object.freeze({
    before: `  // All checks passed — enable voice
  const result = updateSettingsForSource('userSettings', { voiceEnabled: true })`,
    after: `  // All checks passed — enable voice
  const mode =
    requestedMode === 'hold' || requestedMode === 'tap'
      ? requestedMode
      : (currentSettings.voice?.mode ?? 'hold')
  const result = updateSettingsForSource('userSettings', {
    voiceEnabled: true,
    voice: { ...currentSettings.voice, enabled: true, mode },
  })`,
  }),
  Object.freeze({
    before: `  settingsChangeDetector.notifyChange('userSettings')
  logEvent('tengu_voice_toggled', { enabled: true })
  const key = getShortcutDisplay('voice:pushToTalk', 'Chat', 'Space')`,
    after: `  settingsChangeDetector.notifyChange('userSettings')
  logEvent('tengu_voice_toggled', {
    enabled: true,
    tap_mode: mode === 'tap',
  })
  const key = getShortcutDisplay('voice:pushToTalk', 'Chat', 'Space')
  const instruction =
    mode === 'tap'
      ? \`Tap \${key} (with input empty) to start, tap again to send.\`
      : \`Hold \${key} to record.\``,
  }),
  Object.freeze({
    before:
      '    value: `Voice mode enabled. Hold ${key} to record.${langNote}`,',
    after:
      '    value: `Voice mode enabled (${mode}). ${instruction}${langNote}`,',
  }),
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function descriptorsEqual(left, right) {
  return left.bytes === right.bytes && left.sha256 === right.sha256
}

function sourceFilename(sourceRoot) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, SOURCE_PATH.slice('src/'.length))
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${CASE_NAME}: voice command path escapes source root`)
  }
  return filename
}

function buildPostimage(input) {
  let source = input.toString('utf8')
  for (const replacement of REPLACEMENTS) {
    const first = source.indexOf(replacement.before)
    if (
      first < 0 ||
      source.indexOf(replacement.before, first + replacement.before.length) >= 0
    ) {
      throw new Error(
        `${CASE_NAME}: Target118 voice replay requires one exact replacement anchor`,
      )
    }
    source = `${source.slice(0, first)}${replacement.after}${source.slice(
      first + replacement.before.length,
    )}`
  }
  const output = Buffer.from(source)
  const actual = descriptor(output)
  if (
    !descriptorsEqual(actual, TARGET118_VOICE_MODE_ARGUMENT_ROUTING_OUTPUT)
  ) {
    throw new Error(
      `${CASE_NAME}: Target118 voice postimage drift ` +
        `${actual.bytes}/${actual.sha256}`,
    )
  }
  return output
}

export function applyTarget118VoiceModeArgumentRoutingSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const filename = sourceFilename(sourceRoot)
  const input = fs.readFileSync(filename)
  const actual = descriptor(input)

  if (
    descriptorsEqual(actual, TARGET118_VOICE_MODE_ARGUMENT_ROUTING_OUTPUT)
  ) {
    return Object.freeze({
      status: 'already-recovered',
      files: Object.freeze([]),
      ownerOverrides:
        TARGET118_VOICE_MODE_ARGUMENT_ROUTING_OWNER_OVERRIDES.length,
    })
  }
  if (!descriptorsEqual(actual, TARGET118_VOICE_MODE_ARGUMENT_ROUTING_INPUT)) {
    throw new Error(
      `${CASE_NAME}: voice replay requires the exact raw or recovered source; received ` +
        `${actual.bytes}/${actual.sha256}`,
    )
  }

  const output = buildPostimage(input)
  fs.writeFileSync(filename, output)
  const written = descriptor(fs.readFileSync(filename))
  if (
    !descriptorsEqual(written, TARGET118_VOICE_MODE_ARGUMENT_ROUTING_OUTPUT)
  ) {
    throw new Error(
      `${CASE_NAME}: written voice postimage differs ` +
        `${written.bytes}/${written.sha256}`,
    )
  }
  return Object.freeze({
    status: 'recovered',
    files: Object.freeze([SOURCE_PATH]),
    ownerOverrides:
      TARGET118_VOICE_MODE_ARGUMENT_ROUTING_OWNER_OVERRIDES.length,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceRootIndex = process.argv.indexOf('--source-root')
  const sourceRoot =
    sourceRootIndex >= 0 ? process.argv[sourceRootIndex + 1] : process.argv[2]
  if (!sourceRoot) {
    throw new Error(
      'usage: replay-voice-mode-argument-routing-source-gap.mjs --source-root DIR',
    )
  }
  process.stdout.write(
    `${JSON.stringify(
      applyTarget118VoiceModeArgumentRoutingSourceRecovery({ sourceRoot }),
      null,
      2,
    )}\n`,
  )
}
