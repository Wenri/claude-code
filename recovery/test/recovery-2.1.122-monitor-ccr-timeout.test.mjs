import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const releases = [
  ['2.1.121', process.env.CLAUDE_CODE_2_1_121_BUNDLE],
  ['2.1.122', process.env.CLAUDE_CODE_2_1_122_BUNDLE],
]

test('authenticates the retained CCR monitor timeout cap', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')

    assert.equal(
      bundle.split('applyCcrTimeoutCap').length - 1,
      1,
      `${version}: retained exported helper`,
    )
    assert.match(
      bundle,
      /function [\w$]+\(([\w$]+)\)\{if\(![\w$]+\(process\.env\.CLAUDE_CODE_REMOTE\)\)return\{timeout_ms:\1\.timeout_ms,persistent:\1\.persistent};return\{timeout_ms:\1\.persistent\?[\w$]+:Math\.min\(\1\.timeout_ms,[\w$]+\),persistent:!1}}/,
      `${version}: local pass-through and remote 30-minute cap`,
    )
    assert.match(
      bundle,
      /\{description:[\w$]+}=[\w$]+,\{timeout_ms:[\w$]+,persistent:[\w$]+}=[\w$]+\([\w$]+\)/,
      `${version}: monitor execution consumes the capped values`,
    )
  }
})

test('source applies the cap before scheduling monitor cleanup', () => {
  const source = readFileSync(
    new URL('../../src/tools/MonitorTool/MonitorTool.tsx', import.meta.url),
    'utf8',
  )

  assert.ok(source.includes('const CCR_MAX_TIMEOUT_MS = 1_800_000'))
  assert.ok(source.includes('export function applyCcrTimeoutCap('))
  assert.match(
    source,
    /if \(!isEnvTruthy\(process\.env\.CLAUDE_CODE_REMOTE\)\)[\s\S]*?timeout_ms: input\.persistent[\s\S]*?Math\.min\(input\.timeout_ms, CCR_MAX_TIMEOUT_MS\)[\s\S]*?persistent: false/,
  )
  assert.ok(
    source.includes(
      'const { timeout_ms: timeoutMs, persistent } = applyCcrTimeoutCap(input)',
    ),
  )
})
