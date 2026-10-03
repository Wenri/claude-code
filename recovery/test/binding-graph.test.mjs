import assert from 'node:assert/strict'
import test from 'node:test'
import { verifyBindingGraph } from '../lib/binding-graph.mjs'

function editNames(source, changes) {
  const edits = changes.map(([needle, text, occurrence = 0]) => {
    let start = -1
    for (let index = 0; index <= occurrence; index++) start = source.indexOf(needle, start + 1)
    assert(start >= 0)
    return { start, end: start + needle.length, text }
  }).sort((a, b) => a.start - b.start)
  let renamedSource = source
  for (const edit of [...edits].reverse()) renamedSource = renamedSource.slice(0, edit.start) + edit.text + renamedSource.slice(edit.end)
  return { originalSource: source, renamedSource, edits }
}

test('rejects capture by a child-scope declaration after an ancestor rename', () => {
  const source = 'let apple=1;function f(){let x=2;return apple}f()'
  assert.throws(() => verifyBindingGraph(editNames(source, [['apple', 'x'], ['apple', 'x', 1]])), /Static reference binding changed/)
})

test('rejects capture of an unresolved global by a renamed ancestor', () => {
  const source = 'let apple=1;function f(){return missing}f()'
  assert.throws(() => verifyBindingGraph(editNames(source, [['apple', 'missing']])), /Static reference binding changed/)
})

test('rejects a resolved reference becoming unresolved or changing global name', () => {
  assert.throws(() => verifyBindingGraph(editNames('let apple=1;apple', [['apple', 'other', 1]])), /Static reference binding changed/)
  assert.throws(() => verifyBindingGraph(editNames('external()', [['external', 'different']])), /Static reference binding changed/)
})

test('permits independent sibling-local renames and simultaneous binding swaps', () => {
  const sibling = 'function f(){let apple=1;return apple}function g(){let pear=2;return pear}'
  const result = verifyBindingGraph(editNames(sibling, [['apple', 'x'], ['apple', 'x', 1], ['pear', 'x'], ['pear', 'x', 1]]))
  assert.equal(result.status, 'static-binding-graph-preserved')
  assert.equal(result.semanticEquivalenceEstablished, false)
  const swap = 'let apple=1,pear=2;apple+pear'
  assert.equal(verifyBindingGraph(editNames(swap, [['apple', 'pear'], ['apple', 'pear', 1], ['pear', 'apple'], ['pear', 'apple', 1]])).editCount, 4)
})

test('tracks import bindings and shared class declaration tokens across scopes', () => {
  const imported = 'import {value as apple} from "pkg";export const answer=apple'
  assert.equal(verifyBindingGraph(editNames(imported, [['apple', 'pear'], ['apple', 'pear', 1]])).status, 'static-binding-graph-preserved')
  const shared = 'class Apple {static self(){return Apple}};new Apple'
  assert.equal(verifyBindingGraph(editNames(shared, [['Apple', 'Pear'], ['Apple', 'Pear', 1], ['Apple', 'Pear', 2]])).status, 'static-binding-graph-preserved')
})

test('rejects merged bindings and duplicate lexical declarations', () => {
  const merged = 'var apple=1,pear=2;apple+pear'
  assert.throws(() => verifyBindingGraph(editNames(merged, [['apple', 'pear'], ['apple', 'pear', 1]])), /binding declaration identities changed/)
  assert.throws(() => verifyBindingGraph(editNames('let apple=1,pear=2;', [['apple', 'pear']])), /already been declared/)
})

test('validates exact, nonoverlapping identifier edits and unchanged surrounding text', () => {
  const valid = editNames('let apple=1;apple', [['apple', 'longerName'], ['apple', 'longerName', 1]])
  assert.equal(verifyBindingGraph(valid).editCount, 2)
  assert.throws(() => verifyBindingGraph({ ...valid, renamedSource: valid.renamedSource + ';' }), /exact result/)
  assert.throws(() => verifyBindingGraph({ ...valid, edits: [...valid.edits, valid.edits[0]] }), /overlaps/)
  assert.throws(() => verifyBindingGraph({ originalSource: 'object.apple', renamedSource: 'object.pear', edits: [{ start: 7, end: 12, text: 'pear' }] }), /entire lexical/)
  assert.throws(() => verifyBindingGraph({ originalSource: 'apple', renamedSource: 'a pple', edits: [{ start: 0, end: 5, text: 'a pple' }] }), /exactly one identifier/)
  assert.throws(() => verifyBindingGraph({ originalSource: 'let =', renamedSource: 'let =', edits: [] }), SyntaxError)
})

test('translates UTF-16 offsets and explicitly excludes dynamic eval/reflection', () => {
  const source = 'const emoji="😀";function f(){let apple=1;return eval("apple")+apple}'
  const result = verifyBindingGraph(editNames(source, [['apple', 'pear'], ['apple', 'pear', 2]]))
  assert.equal(result.status, 'static-binding-graph-preserved')
  assert.equal(result.semanticEquivalenceEstablished, false)
  assert(result.limitations.some(value => value.includes('Dynamic eval')))
})
