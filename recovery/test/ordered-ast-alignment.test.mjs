import test from 'node:test';
import assert from 'node:assert/strict';
import { orderedUniqueAlignment as align } from '../lib/ordered-ast-alignment.mjs';
test('exact sequence including duplicates is equal without hiding ambiguous gaps', () => {
  const r = align(['a', 'd', 'd', 'z'], ['a', 'd', 'd', 'z']);
  assert.equal(r.statementSequenceEqual, true); assert.equal(r.anchors.length, 2);
  assert.deepEqual(r.gaps, [{ left: [1, 3], right: [1, 3] }]);
});
test('statement moves remain unequal and explicitly out of order', () => {
  const r = align(['write', 'read', 'end'], ['read', 'write', 'end']);
  assert.equal(r.statementSequenceEqual, false); assert.equal(r.outOfOrderUniqueMatches.length, 1);
  assert.equal(r.gaps.length, 2);
});
test('insertions, deletions and replacements are retained between exact anchors', () => {
  const r = align(['gone', 'a', 'old', 'z'], ['a', 'new', 'z', 'extra']);
  assert.deepEqual(r.gaps, [{ left: [0, 1], right: [0, 0] }, { left: [2, 3], right: [1, 2] }, { left: [4, 4], right: [3, 4] }]);
  assert.equal(r.statementSequenceEqual, false);
});
test('empty and fully different sequences retain their complete unmatched ranges', () => {
  assert.equal(align([], []).statementSequenceEqual, true);
  assert.deepEqual(align(['a'], ['b']).gaps, [{ left: [0, 1], right: [0, 1] }]);
  assert.deepEqual(align([], ['b']).gaps, [{ left: [0, 0], right: [0, 1] }]);
});
