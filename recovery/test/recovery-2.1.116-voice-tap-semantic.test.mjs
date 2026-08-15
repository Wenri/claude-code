import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_116_BUNDLE is required'
      : false,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
      : false,
}
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function assertFragments(relative, fragments) {
  const contents = source(relative)
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
  }
  return contents
}

const pinnedUnits = new Map([
  [
    2563,
    [
      1055953,
      1075949,
      '9ce087b0336c2b4622f419d315d0f41a2071cad9dbf1acf27014177d4dd0f6b2',
      'unresolved',
    ],
  ],
  [
    17632,
    [
      10897914,
      10908207,
      'e70665a66d87c95d4629903b82e8f07c230b07b987c805e5596488b27182a081',
      'unresolved',
    ],
  ],
  [
    17633,
    [
      10908207,
      10908302,
      '1925ddf39c8091c8fc9c83a111903fb7a8a913dc07ea26b38d972c5e8c2e05c2',
      'unresolved',
    ],
  ],
  [
    17637,
    [
      10909438,
      10909561,
      '468a3f69e7defe6c37742420c010a5d59c7c2169e21cc0067115c96056672a83',
      'unresolved',
    ],
  ],
  [
    17638,
    [
      10909561,
      10911977,
      '14d093c7060306454aadb9c966171705d801f89980d7d6a60c5279f39f58a2df',
      'unresolved',
    ],
  ],
  [
    17643,
    [
      10912080,
      10912358,
      'b451e95f5ca731d3423cad5cee904512b41f7a7a60baa79e706a8e450f04332e',
      'unresolved',
    ],
  ],
  [
    19965,
    [
      12085898,
      12088319,
      '917970bd00c927256f65f47a443b21639caf534b7ae312f7091a6ed2b42a46a8',
      'unresolved',
    ],
  ],
  [
    19966,
    [
      12088319,
      12091041,
      '8ccb057258a8715aa22f567a4268d15769d2f9248d996cf357896d78860ff38c',
      'unresolved',
    ],
  ],
])

test('2.1.116 pins every changed voice tap runtime owner', bundleOptions, () => {
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(targetBytes.length, 13_102_272)
  assert.equal(
    sha256(targetBytes),
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
  )
  const target = targetBytes.toString('utf8')

  for (const [index, [start, end, sourceHash, classification]] of pinnedUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, classification, `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(target.slice(start, end)), sourceHash, `${index}: bytes`)
  }

  assert.match(
    target.slice(10909438, 10909561),
    /trim\(\)\.toLowerCase\(\).*"hold".*"tap".*"off".*"invalid"/,
  )
  for (const fragment of [
    '[voice] Toggle silence timeout \\u2014 auto-finishing',
    '[voice] Toggle max-duration cap \\u2014 auto-finishing',
    '[voice] toggle: starting recording',
    '[voice] toggle: finishing recording',
    ' (with input empty) to start, tap again to send.',
    '[hold|tap|off]',
    'Voice mode settings (hold-to-talk / tap-to-toggle dictation)',
  ]) {
    assert.equal(target.includes(fragment), true, fragment)
  }
})

test('voice tap behavior is introduced at the 2.1.114 to 2.1.116 boundary', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(baselineBytes.length, 12_986_755)
  assert.equal(
    sha256(baselineBytes),
    'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
  )
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  for (const fragment of [
    '[voice] Toggle silence timeout \\u2014 auto-finishing',
    '[voice] Toggle max-duration cap \\u2014 auto-finishing',
    '[voice] toggle: starting recording',
    '[voice] toggle: finishing recording',
    ' (with input empty) to start, tap again to send.',
    '[hold|tap|off]',
    'Voice mode settings (hold-to-talk / tap-to-toggle dictation)',
  ]) {
    assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
    assert.equal(target.includes(fragment), true, `${fragment}: target`)
  }
  assert.match(baseline, /function \w+\(\w+\)\{return\}/)
})

test('source reproduces the target command parser and mode-specific presentation', sourceOptions, () => {
  const command = assertFragments('src/commands/voice/voice.ts', [
    "type VoiceMode = 'hold' | 'tap'",
    'const normalized = args.trim().toLowerCase()',
    "normalized === 'hold' || normalized === 'tap' || normalized === 'off'",
    "return 'invalid'",
    "parsedMode === 'off' || (parsedMode === undefined && isCurrentlyEnabled)",
    "parsedMode === 'hold' || parsedMode === 'tap'",
    "tap_mode: mode === 'tap'",
    "mode === 'tap'",
    'Tap ${key} (with input empty) to start, tap again to send.',
    'Voice mode enabled (${mode}). ${instruction}${langNote}',
  ])
  assert.ok(command.indexOf("const parsedMode = parseVoiceMode(args)") < command.indexOf("parsedMode === 'off'"))
  assertFragments('src/commands/voice/index.ts', [
    "argumentHint: '[hold|tap|off]'",
  ])
  assertFragments('src/utils/settings/types.ts', [
    ".enum(['hold', 'tap'])",
    "'hold' (default): hold to talk. 'tap': tap to start, tap to stop+submit.",
    'Submit the prompt when hold-to-talk is released (hold mode only)',
    'Voice mode settings (hold-to-talk / tap-to-toggle dictation)',
  ])
})

test('source reproduces tap recording deadlines, cleanup, and toggle behavior', sourceOptions, () => {
  const hook = assertFragments('src/hooks/useVoice.ts', [
    'const TOGGLE_SILENCE_TIMEOUT_MS = 15_000',
    'const TOGGLE_MAX_DURATION_MS = 120_000',
    'function armToggleSilenceTimer(): void',
    'function armToggleMaxDurationTimer(): void',
    "stateRef.current === 'recording' && toggleTriggeredRef.current",
    '[voice] Toggle silence timeout — auto-finishing',
    '[voice] Toggle max-duration cap — auto-finishing',
    "if (mode === 'tap')",
    '[voice] toggle: starting recording',
    '[voice] toggle: finishing recording',
    'armToggleSilenceTimer()',
    'armToggleMaxDurationTimer()',
    'cancelRecording: () => void',
  ])
  assert.ok(
    hook.indexOf('clearTimeout(toggleSilenceTimerRef.current)') <
      hook.indexOf("updateState('processing')"),
  )
  assert.match(hook, /\[enabled, focusMode, mode, cleanup\]/)
})

test('source reproduces tap transcript submission and keybinding cancellation', sourceOptions, () => {
  const integration = assertFragments('src/hooks/useVoiceIntegration.tsx', [
    "const autoSubmit = useAppState(s => s.settings.voice?.autoSubmit === true)",
    "const voiceMode = useAppState(s => s.settings.voice?.mode ?? 'hold')",
    "(voiceMode === 'tap' || autoSubmit) &&",
    'text.trim().split(/\\s+/).length >= 3',
    'insertTextRef.current?.submit?.(newInput, true)',
    'mode: voiceMode',
    "e.key === 'escape' && getVoiceState().voiceState === 'recording'",
    'voiceCancelRecording()',
    "if (voiceMode === 'tap')",
    "if (isStarting && inputValueRef.current.length > 0) return",
    "if (currentVoiceState === 'processing')",
  ])
  assert.ok(
    integration.indexOf("if (voiceMode === 'tap')") <
      integration.indexOf('// Guard: only swallow keypresses'),
  )
  assertFragments('src/components/PromptInput/PromptInput.tsx', [
    'const voiceSubmitRef = React.useRef<',
    'void voiceSubmitRef.current?.(value, fromKeybinding)',
    'voiceSubmitRef.current = onSubmit',
  ])
})
