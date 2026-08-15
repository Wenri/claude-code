import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const releases = [
  ['2.1.121', process.env.CLAUDE_CODE_2_1_121_BUNDLE],
  ['2.1.122', process.env.CLAUDE_CODE_2_1_122_BUNDLE],
]

function occurrences(text, needle) {
  return text.split(needle).length - 1
}

function source(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8').replace(
    /\s+/g,
    ' ',
  )
}

test('authenticates retained shared scroll configuration and TUI telemetry', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')

    assert.equal(occurrences(bundle, 'useDecayCurve'), 6, version)
    assert.equal(occurrences(bundle, 'useAdaptiveDrain'), 2, version)
    assert.equal(occurrences(bundle, 'scroll_decay_curve'), 1, version)
    assert.equal(occurrences(bundle, 'scroll_base'), 1, version)
    assert.equal(occurrences(bundle, 'scroll_xtermjs'), 1, version)
    assert.match(
      bundle,
      /return [A-Za-z_$][\w$]*=\{useDecayCurve:[A-Za-z_$][\w$]*\|\|[A-Za-z_$][\w$]*==="win32"\|\|[A-Za-z_$][\w$]*,useAdaptiveDrain:[A-Za-z_$][\w$]*,base:[A-Za-z_$][\w$]*\([A-Za-z_$][\w$]*\),xtermJs:[A-Za-z_$][\w$]*,termProgram:process\.env\.TERM_PROGRAM\?\?"unset",xtversion:[A-Za-z_$][\w$]*\?\?"\(no reply\)",wtSession:[A-Za-z_$][\w$]*,scrollSpeedEnv:process\.env\.CLAUDE_CODE_SCROLL_SPEED\?\?"unset",platform:[A-Za-z_$][\w$]*\}/,
      `${version}: exact cached terminal scroll descriptor`,
    )
    assert.match(
      bundle,
      /let [A-Za-z_$][\w$]*=[A-Za-z_$][\w$]*\|\|!1\|\|process\.env\.WT_SESSION\?3:1,[A-Za-z_$][\w$]*=process\.env\.CLAUDE_CODE_SCROLL_SPEED;if\(![A-Za-z_$][\w$]*\)return [A-Za-z_$][\w$]*;let [A-Za-z_$][\w$]*=parseFloat\([A-Za-z_$][\w$]*\);return Number\.isNaN\([A-Za-z_$][\w$]*\)\|\|[A-Za-z_$][\w$]*<=0\?[A-Za-z_$][\w$]*:Math\.min\([A-Za-z_$][\w$]*,20\)/,
      `${version}: default base and env clamp`,
    )
    assert.match(
      bundle,
      /tengu_tui_command",\{fullscreen:[A-Za-z_$][\w$]*,from:[A-Za-z_$][\w$]*,to:[A-Za-z_$][\w$]*,session_age_ms:Math\.round\(process\.uptime\(\)\*1000\),bounce:process\.env\.CLAUDE_CODE_TUI_JUST_SWITCHED==="fullscreen"&&[A-Za-z_$][\w$]*==="default",scroll_decay_curve:[A-Za-z_$][\w$]*\.useDecayCurve,scroll_base:[A-Za-z_$][\w$]*\.base,scroll_xtermjs:[A-Za-z_$][\w$]*\.xtermJs\}/,
      `${version}: complete /tui event`,
    )
    assert.match(
      bundle,
      /wheel accel: \$\{[A-Za-z_$][\w$]*\.useDecayCurve\?"decay":"window \(native\)"\} .*?base=\$\{[A-Za-z_$][\w$]*\.base\} .*?platform=\$\{[A-Za-z_$][\w$]*\.platform\} .*?TERM_PROGRAM=\$\{[A-Za-z_$][\w$]*\.termProgram\}/,
      `${version}: wheel state uses the shared descriptor`,
    )
  }
})

test('source reconstructs shared wheel, drain, and TUI behavior', () => {
  const config = source('src/ink/scroll-config.ts')
  const wheel = source('src/components/ScrollKeybindingHandler.tsx')
  const render = source('src/ink/render-node-to-output.ts')
  const tui = source('src/commands/tui/tui.ts')

  for (const witness of [
    "useDecayCurve: xtermJs || platform === 'win32' || wtSession",
    'useAdaptiveDrain: xtermJs',
    'base: readScrollSpeedBase(xtermJs)',
    "xtermJs || process.platform === 'win32' || process.env.WT_SESSION ? 3 : 1",
    'Math.min(value, 20)',
  ]) {
    assert.ok(config.includes(witness), `missing scroll-config witness: ${witness}`)
  }
  assert.ok(wheel.includes('if (!state.useDecayCurve)'))
  assert.ok(wheel.includes('const config = getScrollConfig()'))
  assert.ok(wheel.includes('initWheelAccel(config.useDecayCurve, config.base)'))
  assert.ok(render.includes('getScrollConfig().useAdaptiveDrain'))
  for (const field of [
    'from,',
    'to: renderer',
    'session_age_ms: Math.round(process.uptime() * 1000)',
    'bounce:',
    'scroll_decay_curve: scrollConfig.useDecayCurve',
    'scroll_base: scrollConfig.base',
    'scroll_xtermjs: scrollConfig.xtermJs',
  ]) {
    assert.ok(tui.includes(field), `missing /tui telemetry field: ${field}`)
  }
})
