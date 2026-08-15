import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = [
  {
    version: '2.1.121',
    env: 'CLAUDE_CODE_2_1_121_BUNDLE',
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
    counts: [0, 0, 0, 3, 0, 5, 0, 0],
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    counts: [1, 1, 4, 4, 2, 6, 1, 1],
  },
]

const bundleFragments = [
  'probeExternalClear: detected wipe (',
  'terminal reports row=1 col=',
  'chat:clearScreen',
  'chat:clearInput',
  'cmd+k',
  'action:"clear"',
  'needsEraseBeforePaint=!0,this.displayCursor=null,this.resetFramesForAltScreen()',
  'if(q?.row!==1)return!1',
]

function readBundle(release) {
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

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

function source(relativePath) {
  return compact(fs.readFileSync(path.join(repo, relativePath), 'utf8'))
}

test('authenticates the target-only fullscreen clear-screen contract', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    bundleFragments.forEach((fragment, index) => {
      assert.equal(
        occurrences(bundle, fragment),
        release.counts[index],
        `${release.version}: ${fragment}`,
      )
    })
  }
})

test('recovers atomic alt-screen redraw and guarded external-wipe probing', () => {
  const ink = source('src/ink/ink.tsx')
  for (const fragment of [
    'const EXTERNAL_CLEAR_CURSOR_POSITION_QUERY = cursorPositionQuery();',
    'if (this.altScreenActive) { this.needsEraseBeforePaint = true; this.displayCursor = null; this.resetFramesForAltScreen(); } else',
    'if (!this.altScreenActive || this.isPaused || this.isUnmounted) return false;',
    'if (!parked || parked.y < 1) return false;',
    'const response = await querier.send(EXTERNAL_CLEAR_CURSOR_POSITION_QUERY);',
    'if (response?.row !== 1) return false;',
    'probeExternalClear: detected wipe (parked at y=${parked.y}, terminal reports row=1 col=${response.col})',
  ]) {
    assert.ok(ink.includes(compact(fragment)), fragment)
  }
  assert.equal(
    occurrences(ink, 'this.options.stdout.write(ERASE_SCREEN + CURSOR_HOME);'),
    0,
    'forceRedraw must defer erase until the next atomic paint',
  )

  const activate = ink.slice(
    ink.indexOf('setAltScreenActive(active: boolean'),
    ink.indexOf('get isAltScreenActive'),
  )
  assert.ok(activate.includes('if (active) { this.ensureInteractive(); this.resetFramesForAltScreen(); }'))
})

test('recovers terminal-gated polling with abort-responsive 200ms cadence', () => {
  const hook = source(
    'src/components/PromptInput/useExternalClearDetection.ts',
  )
  for (const fragment of [
    'if (!isFullscreenEnvEnabled() || !querier) return;',
    "if (env.terminal !== 'iTerm.app' && env.terminal !== 'Apple_Terminal') return;",
    'const ink = instances.get(process.stdout); if (!ink) return;',
    'while (!controller.signal.aborted)',
    'const detected = await ink.probeExternalClear(querier);',
    'if (controller.signal.aborted) return;',
    'if (detected) callbackRef.current();',
    'await sleep(200, controller.signal, { unref: true });',
    'return () => controller.abort();',
  ]) {
    assert.ok(hook.includes(compact(fragment)), fragment)
  }
})

test('recovers clear input/screen bindings and double-press lifecycle', () => {
  const defaults = source('src/keybindings/defaultBindings.ts')
  assert.ok(defaults.includes("'ctrl+l': 'chat:clearInput'"))
  assert.ok(defaults.includes("'cmd+k': 'chat:clearScreen'"))
  const globalBindings = defaults.slice(
    defaults.indexOf("context: 'Global'"),
    defaults.indexOf("context: 'Chat'"),
  )
  assert.ok(!globalBindings.includes("'ctrl+l'"))

  const schema = source('src/keybindings/schema.ts')
  assert.ok(schema.includes("'chat:clearInput', 'chat:clearScreen'"))

  const doublePress = source('src/hooks/useDoublePress.ts')
  for (const fragment of [
    'timeoutMs = DOUBLE_PRESS_TIMEOUT_MS',
    'timeSinceLastPress <= timeoutMs',
    'timeoutMs, setPending, timeoutRef',
    '[setPending, onDoublePress, onFirstPress, clearTimeoutSafe, timeoutMs]',
  ]) {
    assert.ok(doublePress.includes(compact(fragment)), fragment)
  }
})

test('recovers PromptInput clear actions, footer protection, and redraw', () => {
  const prompt = source('src/components/PromptInput/PromptInput.tsx')
  for (const fragment of [
    "getShortcutDisplay('chat:clearScreen', 'Chat', 'cmd+k')",
    "getShortcutDisplay('chat:clearInput', 'Chat', 'ctrl+l')",
    "action: 'clear'",
    "submitRef.current?.('/clear', true);",
    'useDoublePress(setClearPending, submitClear, undefined, 2000)',
    'useExternalClearDetection(handleClearScreen);',
    "trackAndSetInput(''); setCursorOffset(0); clearBuffer(); resetHistory(); onModeChange('prompt'); setPastedContents({}); setRedrawVersion(version => version + 1);",
    "'chat:clearScreen': handleClearScreen",
    "'chat:clearInput': handleClearInput",
    'isActive: !isModalOverlayActive && !isSearchingHistory',
    "previous.action === 'clear' ? previous : { show: false }",
  ]) {
    assert.ok(prompt.includes(compact(fragment)), fragment)
  }
  assert.ok(
    prompt.includes(
      'useLayoutEffect(() => { if (redrawVersion === 0) return; instances.get(process.stdout)?.forceRedraw(); }, [redrawVersion]);',
    ),
  )

  const footer = source(
    'src/components/PromptInput/PromptInputFooterLeftSide.tsx',
  )
  assert.ok(
    footer.includes("exitMessage.action === 'clear' ? '/clear'"),
  )
  const footerProps = source('src/components/PromptInput/PromptInputFooter.tsx')
  assert.ok(footerProps.includes("action?: 'clear';"))
})
