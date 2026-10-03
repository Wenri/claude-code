import assert from 'node:assert/strict'
import test from 'node:test'
import { getLineInfo, parse } from 'acorn'
import { createUtf16PositionLookup } from '../lib/utf16-source-positions.mjs'
import { originalPositionFor } from '../lib/source-map.mjs'

test('UTF-16 position index matches Acorn at every offset, including newline interiors and EOF', () => {
  const sources = [
    '', 'a', 'a\n', 'a\r', 'a\r\n', 'a\n\rb', '\r\n\r\n',
    'a\u2028b\u2029', '😀\r\nx\r\ny', 'a\ud800b\udc00\r\nc',
    '\ufeff\t😀\r\n\r\u2028\n\u2029last',
  ]
  // Exercise every adjacent combination of terminators and UTF-16 widths.
  const pieces = ['a', '😀', '\ud800', '\udc00', '\t', '\r', '\n', '\r\n', '\u2028', '\u2029']
  for (const left of pieces) for (const right of pieces) sources.push(`x${left}${right}y`)
  for (const source of sources) {
    const locate = createUtf16PositionLookup(source)
    for (let offset = 0; offset <= source.length; offset++) {
      assert.deepEqual(locate(offset), { ...getLineInfo(source, offset) }, `${JSON.stringify(source)} at ${offset}`)
    }
  }
  assert.deepEqual(createUtf16PositionLookup('a\r\nb')(2), { line: 2, column: 0 })
  assert.deepEqual(createUtf16PositionLookup('a\r\nb')(3), { line: 2, column: 0 })
  assert.deepEqual(createUtf16PositionLookup('😀x')(2), { line: 1, column: 2 })
})

test('indexed positions equal location-enabled Acorn at AST starts and ends without changing AST fields', () => {
  for (const source of [
    '#!/usr/bin/env node\r\nconst 𐐀="😀";\r\nfunction f(a=𐐀){\u2028return a;\u2029}',
    '/*a\r\nb\rc\nd\u2028e\u2029*/\tconst café=1;\r\nconst \\u0061=café;',
    'const a="x\u2028y\u2029z";const b=`😀\r\n${a}\u2028ok`;',
    '\ufeffconst x=1; //😀\r\nconst y=x;\r',
    'import {value as local} from "dep";export {local};class C {#x=1;method(a=this.#x){return a}}',
    'const r=/a/g,n=1n;function f(){using x=acquire();return x}',
  ]) {
    const options = { ecmaVersion: 2026, sourceType: 'module', allowHashBang: true, ranges: true }
    const located = parse(source, { ...options, locations: true })
    const compact = parse(source, options)
    const locate = createUtf16PositionLookup(source), pending = [located], seen = new WeakSet()
    while (pending.length) {
      const node = pending.pop()
      if (seen.has(node)) continue
      seen.add(node)
      assert.deepEqual(locate(node.start), { ...node.loc.start }, `${node.type} start`)
      assert.deepEqual(locate(node.end), { ...node.loc.end }, `${node.type} end`)
      delete node.loc
      for (const [key, value] of Object.entries(node)) {
        if (key === 'range' || !value || typeof value !== 'object') continue
        for (const child of Array.isArray(value) ? value : [value]) if (child?.type) pending.push(child)
      }
    }
    assert.deepEqual(compact, located)
  }
})

test('UTF-16 indexed source-map queries retain mapped and unmapped segment boundaries', () => {
  const source = '"😀";a; b; c;\r\n  d; e;'
  const mappings = { selected: new Map([
    [0, [{ generatedColumn: 5, source: 'a.ts' }, { generatedColumn: 8 }, { generatedColumn: 11, source: 'c.ts' }]],
    [1, [{ generatedColumn: 2, source: 'd.ts' }, { generatedColumn: 5 }]],
  ]) }
  const locate = createUtf16PositionLookup(source)
  const ast = parse(source, { ecmaVersion: 2026, sourceType: 'module', locations: true })
  const identifiers = ast.body.map(statement => statement.expression).filter(node => node.type === 'Identifier')
  assert.deepEqual(identifiers.map(node => {
    const position = locate(node.start)
    const mapped = originalPositionFor(mappings, position.line - 1, position.column)
    assert.deepEqual(mapped, originalPositionFor(mappings, node.loc.start.line - 1, node.loc.start.column))
    return mapped?.source ?? null
  }), ['a.ts', null, 'c.ts', 'd.ts', null])
})

test('position lookup rejects invalid source and out-of-range or non-integer offsets', () => {
  for (const source of [null, undefined, 1, {}, []]) assert.throws(() => createUtf16PositionLookup(source), TypeError)
  const locate = createUtf16PositionLookup('abc')
  for (const offset of [-1, 4, 0.5, NaN, Infinity, '1', null, undefined, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => locate(offset), RangeError)
  }
})
