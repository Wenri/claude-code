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

test('authenticates retained heapdump result and diagnostic output', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')

    for (const literal of [
      '  JS heap        ',
      '  array buffers  ',
      '  other external ',
      '  unaccounted    ',
      'most memory is JS heap (inspect the .heapsnapshot)',
      'most memory is native (NOT in the .heapsnapshot)',
      '(no obvious leak indicators)',
      'Open the .heapsnapshot in Chrome DevTools \\u2192 Memory \\u2192 Load to inspect retainers.',
    ]) {
      assert.equal(occurrences(bundle, literal), 1, `${version}: ${literal}`)
    }

    assert.match(
      bundle,
      /\{success:!0,heapPath:([A-Za-z_$][\w$]*),diagPath:([A-Za-z_$][\w$]*),diagnostics:([A-Za-z_$][\w$]*)\}/,
      `${version}: successful service result retains captured diagnostics`,
    )
    assert.match(
      bundle,
      /let [A-Za-z_$][\w$]*=\[[A-Za-z_$][\w$]*\.heapPath,[A-Za-z_$][\w$]*\.diagPath,"",[A-Za-z_$][\w$]*\([A-Za-z_$][\w$]*\.diagnostics\)\]/,
      `${version}: command prints paths before the diagnostic summary`,
    )
    assert.match(
      bundle,
      /Math\.max\(0,[A-Za-z_$][\w$]*\.rss-[A-Za-z_$][\w$]*\.heapTotal-[A-Za-z_$][\w$]*\.external\)/,
      `${version}: unaccounted memory is nonnegative`,
    )
  }
})

test('source reconstructs heapdump diagnostic propagation and formatting', () => {
  const service = source('src/utils/heapDumpService.ts')
  const command = source('src/commands/heapdump/heapdump.ts')
  const rawCommand = readFileSync(
    new URL('../../src/commands/heapdump/heapdump.ts', import.meta.url),
    'utf8',
  )

  assert.ok(
    service.includes(
      'return { success: true, heapPath, diagPath, diagnostics }',
    ),
  )
  assert.ok(command.includes('formatDiagnostics(result.diagnostics)'))
  assert.ok(
    command.includes(
      'memoryUsage.rss - memoryUsage.heapTotal - memoryUsage.external',
    ),
  )
  assert.ok(
    command.includes(
      'memoryUsage.heapTotal > memoryUsage.external + unaccounted',
    ),
  )
  for (const literal of [
    '  JS heap        ',
    '  array buffers  ',
    '  other external ',
    '  unaccounted    ',
    '  ⚠ ${leak}',
    '(no obvious leak indicators)',
    'Open the .heapsnapshot in Chrome DevTools → Memory → Load to inspect retainers.',
  ]) {
    assert.ok(
      rawCommand.includes(literal),
      `missing command literal: ${literal}`,
    )
  }
  assert.ok(command.includes('(bytes / 1024 / 1024 / 1024).toFixed(2)'))
})
