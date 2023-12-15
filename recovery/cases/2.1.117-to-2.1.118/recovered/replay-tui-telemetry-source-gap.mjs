#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.117-to-2.1.118'
const TUI_PATH = 'src/commands/tui/tui.ts'
const SCROLL_CONFIG_PATH = 'src/ink/scroll-config.ts'
const TARGET_FRAGMENT_EVIDENCE = 'target118-tui-telemetry-target-fragment'
const SOURCE_REPLAY_EVIDENCE = 'target118-tui-telemetry-source-replay-test'
const SOURCE_AST_EVIDENCE = 'target118-tui-telemetry-source-ast-test'
const DONOR_FILENAME = fileURLToPath(
  new URL('./scroll-config.target118.ts', import.meta.url),
)

export const TARGET118_TUI_TELEMETRY_INPUT_FILE = Object.freeze({
  path: TUI_PATH,
  bytes: 1637,
  sha256: 'ce292e2fa81f332d3d3bb7e73787b4a0501e582cb0d460dcc19158c6ac9b8960',
})

export const TARGET118_TUI_TELEMETRY_OUTPUT_FILES = Object.freeze([
  Object.freeze({
    path: TUI_PATH,
    bytes: 2075,
    sha256: '323721e22848f85155df9b73166cb1da53a708a6f1713abeb0a1fd531e8866f2',
  }),
  Object.freeze({
    path: SCROLL_CONFIG_PATH,
    bytes: 1597,
    sha256: 'f124ec3dcded6b0e92483807eff02426a4d7877ccf5a5938b78dd69bd9380f6f',
  }),
])

export const TARGET118_TUI_TELEMETRY_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:17058`,
    targetIndex: 17058,
    paths: Object.freeze([TUI_PATH, SCROLL_CONFIG_PATH]),
    declarations: Object.freeze(['call', 'getScrollConfig']),
    evidenceIds: Object.freeze([
      TARGET_FRAGMENT_EVIDENCE,
      SOURCE_REPLAY_EVIDENCE,
      SOURCE_AST_EVIDENCE,
    ]),
    behavior:
      'The authenticated Target118 TUI command records renderer transition, session age, fullscreen-to-default bounce, and the shared scroll-policy snapshot before relaunching. The recovered command consumes the inherited getScrollConfig declaration that owns the exact decay, base, and xterm.js values.',
  }),
])

const OPERATIONS = Object.freeze([
  Object.freeze({
    before: "import { logEvent } from '../../services/analytics/index.js'",
    after: [
      "import { getScrollConfig } from '../../ink/scroll-config.js'",
      "import { logEvent } from '../../services/analytics/index.js'",
    ].join('\n'),
  }),
  Object.freeze({
    before: [
      '  const value = args.trim().toLowerCase()',
      '',
      "  if (value === '') {",
      '    const current =',
      '      getInitialSettings().tui ??',
      "      (isFullscreenEnvEnabled() ? 'fullscreen' : 'default')",
    ].join('\n'),
    after: [
      '  const value = args.trim().toLowerCase()',
      '  const current =',
      '    getInitialSettings().tui ??',
      "    (isFullscreenEnvEnabled() ? 'fullscreen' : 'default')",
      '',
      "  if (value === '') {",
    ].join('\n'),
  }),
  Object.freeze({
    before: "  logEvent('tengu_tui_command', { fullscreen })",
    after: [
      '  const scrollConfig = getScrollConfig()',
      "  logEvent('tengu_tui_command', {",
      '    fullscreen,',
      '    from: current,',
      '    to: renderer,',
      '    session_age_ms: Math.round(process.uptime() * 1_000),',
      '    bounce:',
      "      process.env.CLAUDE_CODE_TUI_JUST_SWITCHED === 'fullscreen' &&",
      "      renderer === 'default',",
      '    scroll_decay_curve: scrollConfig.useDecayCurve,',
      '    scroll_base: scrollConfig.base,',
      '    scroll_xtermjs: scrollConfig.xtermJs,',
      '  })',
    ].join('\n'),
  }),
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function describe(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function sameDescriptor(actual, expected) {
  return actual.bytes === expected.bytes && actual.sha256 === expected.sha256
}

function replaceExactly(source, before, after, label) {
  const occurrences = source.split(before).length - 1
  if (occurrences !== 1) {
    throw new Error(`${label} anchor count ${occurrences}, expected 1`)
  }
  return source.replace(before, after)
}

function buildTuiPostimage(source) {
  let output = source
  for (const operation of OPERATIONS) {
    output = replaceExactly(
      output,
      operation.before,
      operation.after,
      'Target118 TUI telemetry',
    )
  }
  return Buffer.from(output)
}

export function applyTarget118TuiTelemetrySourceRecovery({ sourceRoot } = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')

  const tuiFilename = path.join(sourceRoot, TUI_PATH.slice('src/'.length))
  const scrollFilename = path.join(
    sourceRoot,
    SCROLL_CONFIG_PATH.slice('src/'.length),
  )
  const tuiBytes = fs.readFileSync(tuiFilename)
  const tuiDescriptor = describe(tuiBytes)
  const scrollExists = fs.statSync(scrollFilename, { throwIfNoEntry: false })
  const scrollBytes = scrollExists ? fs.readFileSync(scrollFilename) : null
  const scrollDescriptor = scrollBytes ? describe(scrollBytes) : null
  const scrollOutput = TARGET118_TUI_TELEMETRY_OUTPUT_FILES[1]
  const scrollExact =
    scrollDescriptor !== null && sameDescriptor(scrollDescriptor, scrollOutput)
  const recovered =
    sameDescriptor(tuiDescriptor, TARGET118_TUI_TELEMETRY_OUTPUT_FILES[0]) &&
    scrollExact
  if (recovered) {
    return {
      status: 'already-recovered',
      outputFiles: TARGET118_TUI_TELEMETRY_OUTPUT_FILES,
      ownerOverrides: TARGET118_TUI_TELEMETRY_OWNER_OVERRIDES.length,
    }
  }
  const raw = sameDescriptor(
    tuiDescriptor,
    TARGET118_TUI_TELEMETRY_INPUT_FILE,
  )
  if (!raw || (scrollDescriptor !== null && !scrollExact)) {
    throw new Error(
      'Target118 TUI telemetry source state is mixed or unknown: ' +
        `${TUI_PATH}:${tuiDescriptor.bytes}/${tuiDescriptor.sha256}, ` +
        `${SCROLL_CONFIG_PATH}:${
          scrollDescriptor
            ? `${scrollDescriptor.bytes}/${scrollDescriptor.sha256}`
            : 'absent'
        }`,
    )
  }

  const tuiPostimage = buildTuiPostimage(tuiBytes.toString('utf8'))
  const expectedTui = TARGET118_TUI_TELEMETRY_OUTPUT_FILES[0]
  const builtTuiDescriptor = describe(tuiPostimage)
  if (!sameDescriptor(builtTuiDescriptor, expectedTui)) {
    throw new Error(
      `Target118 TUI telemetry postimage drift: ${builtTuiDescriptor.bytes}/${builtTuiDescriptor.sha256}`,
    )
  }
  const donorBytes = fs.readFileSync(DONOR_FILENAME)
  const donorDescriptor = describe(donorBytes)
  if (!sameDescriptor(donorDescriptor, scrollOutput)) {
    throw new Error(
      `Target118 scroll-config donor drift: ${donorDescriptor.bytes}/${donorDescriptor.sha256}`,
    )
  }

  if (!scrollExact) {
    fs.mkdirSync(path.dirname(scrollFilename), { recursive: true })
    fs.writeFileSync(scrollFilename, donorBytes)
  }
  fs.writeFileSync(tuiFilename, tuiPostimage)
  for (const output of TARGET118_TUI_TELEMETRY_OUTPUT_FILES) {
    const filename = path.join(sourceRoot, output.path.slice('src/'.length))
    if (!sameDescriptor(describe(fs.readFileSync(filename)), output)) {
      throw new Error(`${output.path} written TUI telemetry postimage differs`)
    }
  }

  return {
    status: 'recovered',
    outputFiles: TARGET118_TUI_TELEMETRY_OUTPUT_FILES,
    ownerOverrides: TARGET118_TUI_TELEMETRY_OWNER_OVERRIDES.length,
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceRootIndex = process.argv.indexOf('--source-root')
  if (sourceRootIndex < 0 || !process.argv[sourceRootIndex + 1]) {
    throw new Error(
      'usage: replay-tui-telemetry-source-gap.mjs --source-root DIR',
    )
  }
  process.stdout.write(
    `${JSON.stringify(
      applyTarget118TuiTelemetrySourceRecovery({
        sourceRoot: path.resolve(process.argv[sourceRootIndex + 1]),
      }),
    )}\n`,
  )
}
