import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.91-to-2.1.92'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
const targetSha256 =
  '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362'
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

const pins = new Map([
  [15567, [11_304_179, 11_313_872, '920c2bd09beab2b6ec0370327b00a1e0c41aa59886cbf4587f9c5f883d53a6b2']],
  [15573, [11_314_810, 11_317_378, 'f21bd2576b0d1ced79d5cc96a9434298a29342a63d4bf25de7e20c3b79c5fa1d']],
  [17808, [12_447_614, 12_449_898, 'b32c3094471a30176b40a56c706fe79d3005382f21d07b0dfff4a1f2fa790ae0']],
  [17851, [12_462_977, 12_519_660, '451e503fb8a6ca23dac69ea5da7bb4283a0de219433900d174caceb7b0ef9c4f']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test(
  'target92 pins persisted voice mode, cancellation, and the complete REPL call path',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetBundlePath
        ? 'CLAUDE_CODE_2_1_92_BUNDLE is not set'
        : false,
  },
  () => {
    const bytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(bytes), targetSha256)
    const bundle = bytes.toString('utf8')
    for (const [index, [start, end, sourceHash]] of pins) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, sourceHash],
        `${index}: identity`,
      )
      assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
    }
    for (const fragment of [
      'mode:Y="hold"',
      '[voice] cancelRecording: discarding without submit',
      'cancelRecording:W.cancelRecording',
      'voiceCancelRecording:NR.cancelRecording',
      'K.voice?.enabled??K.voiceEnabled===!0',
      'voice:{...K.voice,enabled:!0,mode:H}',
      'tap_mode:H==="tap"',
      '`Hold ${dH("voice:pushToTalk","Chat","Space")} to record.`',
    ]) {
      assert.ok(bundle.includes(fragment), fragment)
    }
  },
)

test(
  'materialized target92 source owns reachable voice mode and cancellation semantics',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const command = fs.readFileSync(
      path.join(sourceRoot, 'commands/voice/voice.ts'),
      'utf8',
    )
    const historical = semanticCase === caseName
    for (const fragment of [
      historical
        ? 'function parseVoiceMode(_args: string)'
        : 'function parseVoiceMode(args: string)',
      historical ? 'return undefined' : "normalized === 'hold'",
      'currentSettings.voice?.enabled ?? currentSettings.voiceEnabled === true',
      'voice: { ...currentSettings.voice, enabled: false }',
      "currentSettings.voice?.mode ?? 'hold'",
      'voice: { ...currentSettings.voice, enabled: true, mode }',
      "tap_mode: mode === 'tap'",
      historical
        ? '`Voice mode enabled. Hold ${key} to record.${langNote}`'
        : '`Voice mode enabled (${mode}). ${instruction}${langNote}`',
    ]) {
      assert.ok(command.includes(fragment), fragment)
    }

    const hook = fs.readFileSync(path.join(sourceRoot, 'hooks/useVoice.ts'), 'utf8')
    for (const fragment of [
      "mode?: 'hold' | 'tap'",
      "mode = 'hold'",
      '[voice] cancelRecording: discarding without submit',
      'cancelRecording,',
    ]) {
      assert.ok(hook.includes(fragment), fragment)
    }

    const integration = fs.readFileSync(
      path.join(sourceRoot, 'hooks/useVoiceIntegration.tsx'),
      'utf8',
    )
    for (const fragment of [
      historical ? "mode: 'hold'" : 'mode: voiceMode',
      'cancelRecording: voice.cancelRecording',
      'voiceCancelRecording: () => void',
    ]) {
      assert.ok(integration.includes(fragment), fragment)
    }

    const repl = fs.readFileSync(path.join(sourceRoot, 'screens/REPL.tsx'), 'utf8')
    assert.match(repl, /voiceCancelRecording=\{voice\.cancelRecording\}/)
    assert.match(repl, /inputValueRef=\{inputValueRef\}/)
  },
)
