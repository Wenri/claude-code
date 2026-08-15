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

test('authenticates retained Content-Disposition filename escaping', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')
    assert.equal(
      occurrences(bundle, 'escapeContentDispositionFilename'),
      1,
      version,
    )
    assert.match(
      bundle,
      /function [\w$]+\([\w$]+\)\{return [\w$]+\.replace\(\/\[\\r\\n\]\/g,""\)\.replaceAll\("\\\\","\\\\\\\\"\)\.replaceAll\('\"',"\\\\\\\""\)}/,
      `${version}: exact escaping pipeline`,
    )
    assert.match(
      bundle,
      /filename="\$\{[\w$]+\([\w$]+\)}"\\r/,
      `${version}: escaped filename is used in multipart body`,
    )
  }
})

test('source exports and applies the retained escaping helper', () => {
  const source = readFileSync(
    new URL('../../src/tools/BriefTool/upload.ts', import.meta.url),
    'utf8',
  )
  assert.ok(
    source.includes(
      'export function escapeContentDispositionFilename(filename: string)',
    ),
  )
  assert.ok(source.includes(".replace(/[\\r\\n]/g, '')"))
  assert.ok(source.includes(".replaceAll('\\\\', '\\\\\\\\')"))
  assert.ok(source.includes(".replaceAll('\"',"))
  assert.ok(
    source.includes(
      'filename="${escapeContentDispositionFilename(filename)}"\\r\\n',
    ),
  )
})
