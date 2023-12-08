import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url))
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_96_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const BASELINE_BUNDLE_SHA256 =
  '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e'
const TARGET_BUNDLE_SHA256 =
  '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988'

function source(relativePath) {
  return fs.readFileSync(`${sourceRoot}${relativePath}`, 'utf8')
}

function requiredBundle(filename, label, expectedSha256) {
  assert.ok(filename, `${label} environment variable must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    expectedSha256,
  )
  return bytes.toString('utf8')
}

test('gates DECSTBM under Zellij without disabling synchronized writes', () => {
  const terminal = source('ink/terminal.ts')
  const ink = source('ink/ink.tsx')
  const app = source('ink/components/App.tsx')

  assert.match(
    terminal,
    /const EXTENDED_KEYS_TERMINALS = \[[\s\S]*?'WarpTerminal',[\s\S]*?\]/,
  )
  assert.match(
    terminal,
    /return isSynchronizedOutputSupported\(\) && process\.env\.ZELLIJ == null/,
  )
  assert.match(
    terminal,
    /export const SYNC_OUTPUT_SUPPORTED = isSynchronizedOutputSupported\(\)/,
  )
  assert.match(terminal, /export const DECSTBM_SAFE = isDecstbmSafe\(\)/)
  assert.match(
    ink,
    /this\.log\.render\(prevFrame, frame, this\.altScreenActive,[\s\S]*?DECSTBM_SAFE\)/,
  )
  assert.match(
    ink,
    /writeDiffToTerminal\(this\.terminal, optimized, this\.altScreenActive && !SYNC_OUTPUT_SUPPORTED\)/,
  )
  assert.match(
    app,
    /`DECSTBM: \$\{DECSTBM_SAFE \? 'enabled' : 'gated'\} \(TMUX=\$\{[\s\S]*?ZELLIJ=\$\{process\.env\.ZELLIJ != null/,
  )
})

test('registers Cedar for CLI and structured-diff highlighting', () => {
  const cedar = source('utils/highlightLanguages/cedar.ts')
  const registry = source('utils/highlightLanguages/index.ts')
  const cliHighlight = source('utils/cliHighlight.ts')
  const colorDiff = source('native-ts/color-diff/index.ts')

  assert.match(cedar, /name: 'Cedar'/)
  assert.match(cedar, /aliases: \['cedarpolicy'\]/)
  assert.match(
    cedar,
    /keyword: 'permit forbid when unless if then else in has like is'/,
  )
  assert.match(
    cedar,
    /built_in:\s*'principal action resource context decimal ip contains containsAll containsAny'/,
  )
  assert.match(cedar, /begin: \/@\\w\+\//)
  assert.match(cedar, /begin: \/\\b\[A-Z\]\\w\*\(::\[A-Z\]\\w\*\)\*\//)
  assert.match(
    registry,
    /if \(!hljs\.getLanguage\(name\)\) \{[\s\S]*?hljs\.registerLanguage\(name, language\)/,
  )
  assert.match(
    cliHighlight,
    /await import\('\.\/highlightLanguages\/index\.js'\)[\s\S]*?registerExtraLanguages\(highlightJs\)[\s\S]*?loadedGetLanguage = highlightJs\.getLanguage/,
  )
  assert.match(
    colorDiff,
    /cachedHljs = 'default' in mod[\s\S]*?registerExtraLanguages\(cachedHljs\)[\s\S]*?return cachedHljs!/,
  )
})

test('authenticated 2.1.97 bundle contains the terminal and Cedar deltas', () => {
  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_96_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_97_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )

  assert.equal(baseline.includes('aliases:["cedarpolicy"]'), false)
  assert.equal(target.includes('aliases:["cedarpolicy"]'), true)
  assert.equal(
    target.includes(
      'keyword:"permit forbid when unless if then else in has like is"',
    ),
    true,
  )
  assert.equal(
    target.includes(
      'built_in:"principal action resource context decimal ip contains containsAll containsAny"',
    ),
    true,
  )

  assert.equal(
    baseline.includes('&&process.env.ZELLIJ==null'),
    false,
  )
  assert.equal(target.includes('&&process.env.ZELLIJ==null'), true)
  assert.equal(
    target.includes(
      '"windows-terminal","WarpTerminal"];jq4=rT8();oT8=qk_()',
    ),
    true,
  )
  assert.equal(
    target.includes(
      'this.log.render(w,z,this.altScreenActive,oT8)',
    ),
    true,
  )
  assert.equal(
    target.includes(
      'DECSTBM: ${oT8?"enabled":"gated"} (TMUX=${process.env.TMUX?"set":"unset"} ZELLIJ=${process.env.ZELLIJ!=null?"set":"unset"}',
    ),
    true,
  )
})
