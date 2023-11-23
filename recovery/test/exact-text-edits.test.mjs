import assert from 'node:assert/strict'
import test from 'node:test'
import { exactOrderedTextEdits } from '../lib/exact-text-edits.mjs'

const baseline =
  'export type Stable = string\n' +
  'export interface EditResult {\n' +
  '  originalFile: string;\n' +
  '}\n'

test('applies exact insertions and replacements in baseline order', () => {
  const actual = exactOrderedTextEdits(
    baseline,
    [
      {
        anchor: 'export type Stable = string\n',
        text: 'export type ToolStats = { readCount: number }\n',
      },
      {
        from: '  originalFile: string;\n',
        to: '  originalFile: string | null;\n',
      },
    ],
    'Declaration',
  )
  assert.equal(
    actual,
    'export type Stable = string\n' +
      'export type ToolStats = { readCount: number }\n' +
      'export interface EditResult {\n' +
      '  originalFile: string | null;\n' +
      '}\n',
  )
})

test('requires every edit match to be unique in the baseline', () => {
  assert.throws(
    () =>
      exactOrderedTextEdits(
        'same\nsame\n',
        [{ from: 'same', to: 'changed' }],
        'Declaration',
      ),
    /Declaration replacement 1 match is not unique/,
  )
})

test('requires edits to be listed in baseline order', () => {
  assert.throws(
    () =>
      exactOrderedTextEdits(
        baseline,
        [
          { from: 'originalFile', to: 'sourceFile' },
          { from: 'Stable', to: 'Durable' },
        ],
        'Declaration',
      ),
    /Declaration edit 2 is not in baseline order/,
  )
})

test('rejects overlapping baseline matches', () => {
  assert.throws(
    () =>
      exactOrderedTextEdits(
        'prefix anchor suffix',
        [
          { from: 'prefix anchor', to: 'first' },
          { anchor: 'anchor suffix', text: ' inserted' },
        ],
        'Declaration',
      ),
    /Declaration edit 2 overlaps edit 1/,
  )
})

test('rejects ambiguous edit shapes and no-op edits', () => {
  assert.throws(
    () =>
      exactOrderedTextEdits(
        baseline,
        [{ from: 'Stable', text: 'Durable' }],
        'Declaration',
      ),
    /must contain exactly \{from, to\} or \{anchor, text\}/,
  )
  assert.throws(
    () =>
      exactOrderedTextEdits(
        baseline,
        [{ from: 'Stable', to: 'Stable' }],
        'Declaration',
      ),
    /Declaration replacement 1 is a no-op/,
  )
})
