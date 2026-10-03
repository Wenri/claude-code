import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { loadSelectedMappings, originalPositionFor } from '../lib/source-map.mjs'

test('an explicit unmapped segment ends the preceding source attribution', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-map-boundary-'))
  try {
    const filename = path.join(directory, 'input.map')
    // Column 0 maps to a.ts:0:0; column 5 is unmapped; column 10 maps
    // to b.ts:0:0. The next line starts unmapped and maps at column 3.
    fs.writeFileSync(filename, JSON.stringify({
      version: 3,
      sources: ['a.ts', 'b.ts'],
      sourcesContent: ['a', 'b'],
      names: [],
      mappings: 'AAAA,K,KCAA;A,GAAA',
    }))
    const mappings = loadSelectedMappings(filename, new Set([0, 1]))
    assert.equal(originalPositionFor(mappings, 0, 0)?.source, 'a.ts')
    assert.equal(originalPositionFor(mappings, 0, 4)?.source, 'a.ts')
    assert.equal(originalPositionFor(mappings, 0, 5), null)
    assert.equal(originalPositionFor(mappings, 0, 9), null)
    assert.equal(originalPositionFor(mappings, 0, 10)?.source, 'b.ts')
    assert.equal(originalPositionFor(mappings, 0, 100)?.source, 'b.ts')
    assert.equal(originalPositionFor(mappings, 1, 0), null)
    assert.equal(originalPositionFor(mappings, 1, 2), null)
    assert.equal(originalPositionFor(mappings, 1, 3)?.source, 'b.ts')
    assert.equal(originalPositionFor(mappings, 2, 0), null)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('queries before the first segment and after a terminal unmapped boundary have no owner', () => {
  const mappings = { selected: new Map([[0, [
    { generatedColumn: 4, source: 'a.ts', originalLine: 0, originalColumn: 0 },
    { generatedColumn: 8 },
  ]]]) }
  assert.equal(originalPositionFor(mappings, 0, 3), null)
  assert.equal(originalPositionFor(mappings, 0, 4)?.source, 'a.ts')
  assert.equal(originalPositionFor(mappings, 0, 8), null)
  assert.equal(originalPositionFor(mappings, 0, 100), null)
})
