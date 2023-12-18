import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.88-to-2.1.89'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetPath = process.env.CLAUDE_CODE_2_1_89_BUNDLE
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

const units = new Map([
  [13205, [9931765, 9931819, '1f5d4d580d3af61f6e1d62fd9c090d3896bd29b4e70d17250b868f9c277d2290']],
  [13206, [9931819, 9932347, '5f7a9660319278f5b3d506b6870d3813d1ed3ad799be1edd0a2cbd34176e8f7b']],
  [13207, [9932347, 9933374, 'c7a25d85aae89173df01c1896b2704302a5490f00e71a2ea2a7c27285f3dd6cc']],
  [13208, [9933374, 9933541, 'f6eedf60bfc12513deac3f2e9620ddde410ff33c6b01c873b8c3167106918b20']],
  [13212, [9933612, 9937084, '1fc2c12334f87d7a247acc42b48150ac337848f2118d16bd8df06de5da3dd905']],
  [13213, [9937084, 9937189, '87de2339ad005947a2d2561ccab6eb97d54bc1f0e9c494879ae891a13bb97599']],
  [13214, [9937189, 9937232, '2cba1597d8121d5ef6bbfc1de45152b462c4e1e8a58f1e74943199fef536d59d']],
  [13215, [9937232, 9937500, 'a01a8fc0f7ddcbc59d063c1dfb44c941186007b81684c473563531e64c7c8083']],
  [13218, [9937609, 9938166, 'bde98ad9df0e4092e875241de7b1ecf3b1fd81599f7c02bf305a1e9ff85c9eda']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test(
  'target89 pins the complete interactive and print-mode autocompact command',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetPath
        ? 'authenticated 2.1.89 bundle is required'
        : false,
  },
  () => {
    const bytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(bytes),
      'a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01',
    )
    const target = bytes.toString('utf8')
    for (const [index, [start, end, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }

    const nonInteractive = target.slice(9931819, 9933541)
    assert.match(nonInteractive, /CLAUDE_CODE_AUTO_COMPACT_WINDOW/)
    assert.match(nonInteractive, /Expected 100k–1M tokens/)
    assert.match(nonInteractive, /tengu_autocompact_command/)
    assert.match(nonInteractive, /autoCompactWindow/)
    const interactive = target.slice(9933612, 9937500)
    assert.match(interactive, /tengu_autocompact_dialog_opened/)
    assert.match(interactive, /Long context that holds up/)
    assert.match(interactive, /https:\/\/claude\.com\/blog\/1m-context-ga/)
    assert.match(target.slice(9937609, 9938166), /name:"autocompact"/)
  },
)

test(
  'source owns command mutation, UI, registration, and compaction-window flow',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const nonInteractive = source(
      'commands/autocompact/autocompact-noninteractive.ts',
    )
    const interactive = source('commands/autocompact/autocompact.tsx')
    const descriptor = source('commands/autocompact/index.ts')
    const autoCompact = source('services/compact/autoCompact.ts')

    for (const fragment of [
      'resolveAutoCompactWindow',
      'parseAutoCompactWindow',
      'CLAUDE_CODE_AUTO_COMPACT_WINDOW is set and takes precedence',
      'Expected 100k–1M tokens',
      "updateSettingsForSource('userSettings'",
      'autoCompactWindow: value',
      'context.setAppState',
      "logEvent('tengu_autocompact_command'",
    ]) {
      assert.ok(nonInteractive.includes(fragment), fragment)
    }
    assert.ok(
      nonInteractive.indexOf("updateSettingsForSource('userSettings'") <
        nonInteractive.indexOf('context.setAppState'),
    )
    assert.ok(
      nonInteractive.indexOf('context.setAppState') <
        nonInteractive.indexOf("logEvent('tengu_autocompact_command'"),
    )
    for (const fragment of [
      'AutoCompactDialog',
      "logEvent('tengu_autocompact_dialog_opened'",
      'Long context that holds up',
      'https://claude.com/blog/1m-context-ga',
      "'select:previous'",
      "'select:accept'",
    ]) {
      assert.ok(interactive.includes(fragment), fragment)
    }
    for (const fragment of [
      "name: 'autocompact'",
      "description: 'Configure the auto-compact window size'",
      'supportsNonInteractive: true',
      "argumentHint: '[tokens|reset]'",
    ]) {
      assert.ok(descriptor.includes(fragment), fragment)
    }

    assert.match(
      autoCompact,
      /getAppState\(\)\.autoCompactWindow[\s\S]*?getAutoCompactThreshold\([\s\S]*?autoCompactWindow/,
    )
    assert.match(
      autoCompact,
      /compactConversation\([\s\S]*?recompactionInfo/,
    )

    if (semanticCase === caseName) {
      assert.equal(nonInteractive.includes("source === 'experiment'"), false)
      assert.match(interactive, /args\?\.trim\(\) \|\| ''/)
      assert.match(interactive, /↑\/↓ to change · Enter to apply · Esc to cancel/)
    } else {
      assert.match(nonInteractive, /source === 'experiment'/)
      assert.match(nonInteractive, /Failed to update auto-compact window/)
      assert.match(interactive, /ConfigurableShortcutHint/)
      assert.match(
        autoCompact,
        /const stripNonEssential = shouldUseColdCompaction\(\)[\s\S]*?compactConversation\([\s\S]*?stripNonEssential/,
      )
    }
  },
)
