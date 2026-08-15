import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = {
  baseline: {
    names: ['CLAUDE_CODE_2_1_121_BUNDLE', 'CLAUDE_2_1_121_CLI_INNER'],
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  target: {
    names: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
}

function loadBundle({ names, bytes, sha256 }) {
  const filename = names.map(name => process.env[name]).find(Boolean)
  assert.ok(filename, `${names.join(' or ')} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, bytes)
  assert.equal(crypto.createHash('sha256').update(value).digest('hex'), sha256)
  return value.toString('utf8')
}

function count(value, fragment) {
  return value.split(fragment).length - 1
}

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

test('authenticates exact 2.1.121 and 2.1.122 application bundles', () => {
  assert.equal(loadBundle(releases.baseline).length, releases.baseline.bytes)
  assert.equal(loadBundle(releases.target).length, releases.target.bytes)
})

test('bundle witnesses the bounded UI, input, image, and settings deltas', () => {
  const baseline = loadBundle(releases.baseline)
  const target = loadBundle(releases.target)
  for (const [fragment, baselineCount, targetCount] of [
    ['if(!H?.excludeDefault)return!1;return H.tips.length>0', 0, 1],
    ['R!=="bash"&&!', 0, 1],
    ['maxWidth:2576,maxHeight:2576', 1, 0],
    ['maxWidth:2000,maxHeight:2000', 1, 2],
    [
      'if(w.size===0){if(!Q)Q=!0,A.updateIdleStatus();return}Q=!1',
      0,
      1,
    ],
    ['j=Y$((v)=>v.isBriefOnly);ot.useEffect(', 0, 1],
    [
      '"hooks" must be an object mapping event names to matcher arrays; received',
      0,
      1,
    ],
    ['must be an array of matchers; received', 0, 1],
    ['Caps Lock is not delivered to terminal applications', 0, 1],
    ['capslock', 0, 4],
  ]) {
    assert.equal(count(baseline, fragment), baselineCount, fragment)
    assert.equal(count(target, fragment), targetCount, fragment)
  }
})

test('source suppresses default timed tips and shell-mode exit interception', () => {
  const registry = source('src/services/tips/tipRegistry.ts')
  const spinner = source('src/components/Spinner.tsx')
  const submit = source('src/utils/handlePromptSubmit.ts')
  for (const fragment of [
    'if (!override?.excludeDefault) return false',
    'return override.tips.length > 0',
    'shouldExcludeDefaultSpinnerTips(override)',
  ]) {
    assert.ok(registry.includes(fragment), fragment)
  }
  assert.ok(
    spinner.includes(
      'shouldExcludeDefaultSpinnerTips(settings.spinnerTipsOverride)',
    ),
  )
  assert.match(
    submit,
    /if \(\s*mode !== 'bash' &&\s*!skipSlashCommands &&/,
  )
})

test('source restores target image, idle-render, brief-view, and Caps Lock behavior', () => {
  const image = source('src/utils/imageResizer.ts')
  assert.ok(
    image.includes(
      "'claude-opus-4-7': { maxWidth: 2000, maxHeight: 2000 }",
    ),
  )
  assert.equal(image.includes('maxWidth: 2576'), false)

  const bridge = source('src/bridge/bridgeMain.ts')
  for (const fragment of [
    'let idleStatusRendered = false',
    'if (!idleStatusRendered)',
    'idleStatusRendered = true',
    'idleStatusRendered = false',
  ]) {
    assert.ok(bridge.includes(fragment), fragment)
  }

  const keybindings = source('src/hooks/useGlobalKeybindings.tsx')
  for (const fragment of [
    'onGrowthBookRefresh',
    'clearStaleBriefView()',
    'isBriefOnly: false',
    'return onGrowthBookRefresh(clearStaleBriefView)',
  ]) {
    assert.ok(keybindings.includes(fragment), fragment)
  }

  const reserved = source('src/keybindings/reservedShortcuts.ts')
  for (const fragment of [
    "key: 'capslock'",
    'Caps Lock is not delivered to terminal applications',
    "caps: 'capslock'",
    "'caps-lock': 'capslock'",
    "caps_lock: 'capslock'",
  ]) {
    assert.ok(reserved.includes(fragment), fragment)
  }
})

test('all settings sources fail open around malformed hook entries', () => {
  const validation = source('src/utils/settings/validation.ts')
  for (const fragment of [
    "if (!('hooks' in obj)) return []",
    '"hooks" must be an object mapping event names to matcher arrays;',
    'Unknown hook event "${event}" was ignored.',
    'Hook event "${event}" must be an array of matchers;',
    '...filterInvalidPermissionRules(data, filePath)',
    '...filterInvalidHooks(data, filePath)',
  ]) {
    assert.ok(validation.includes(fragment), fragment)
  }

  const settings = source('src/utils/settings/settings.ts')
  for (const fragment of [
    'parseRemoteManagedSettingsFromCache()',
    'parseFlagSettingsInline()',
    "filterInvalidSettingsEntries(data, path)",
    "'parent managed settings'",
    "'remote managed settings'",
    "'SDK inline settings'",
  ]) {
    assert.ok(settings.includes(fragment), fragment)
  }

  const mdm = source('src/utils/settings/mdm/settings.ts')
  assert.ok(mdm.includes('filterInvalidSettingsEntries(data, sourcePath)'))

  const remote = source('src/services/remoteManagedSettings/index.ts')
  for (const fragment of [
    "filterInvalidSettingsEntries(sanitizedSettings, 'remote managed settings')",
    'settings: parsed.data.settings',
    'sanitizedCachedSettings',
    'sanitizedNewSettings',
  ]) {
    assert.ok(remote.includes(fragment), fragment)
  }
})
