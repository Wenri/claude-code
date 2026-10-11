// Diagnostic alignment only. Every unaligned statement remains visible, and
// exact statements found out of order are never accepted as ordered equality.
export function orderedUniqueAlignment(left, right) {
  const positions = values => {
    const map = new Map();
    values.forEach((value, index) => { const rows = map.get(value) ?? []; rows.push(index); map.set(value, rows); });
    return map;
  };
  const a = positions(left), b = positions(right);
  const common = [];
  for (const [value, rows] of a) {
    if (rows.length === 1 && b.get(value)?.length === 1) common.push({ left: rows[0], right: b.get(value)[0], value });
  }
  common.sort((x, y) => x.left - y.left);
  const tails = [], previous = new Array(common.length).fill(-1);
  common.forEach((row, index) => {
    let lo = 0, hi = tails.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (common[tails[mid]].right < row.right) lo = mid + 1; else hi = mid; }
    if (lo) previous[index] = tails[lo - 1];
    tails[lo] = index;
  });
  const selected = [];
  for (let index = tails.at(-1); index !== undefined && index !== -1; index = previous[index]) selected.push(index);
  selected.reverse();
  const chosen = new Set(selected), anchors = selected.map(i => common[i]), gaps = [];
  let old = 0, current = 0;
  for (const anchor of [...anchors, { left: left.length, right: right.length }]) {
    if (old !== anchor.left || current !== anchor.right) gaps.push({ left: [old, anchor.left], right: [current, anchor.right] });
    old = anchor.left + 1; current = anchor.right + 1;
  }
  return {
    statementSequenceEqual: left.length === right.length && left.every((value, index) => value === right[index]),
    anchors, gaps, outOfOrderUniqueMatches: common.filter((_, i) => !chosen.has(i)),
    limitations: ['Unique exact statement anchors are only a diagnostic partition; gaps include unequal statements and duplicate exact statements. Out-of-order matches are not equivalence.'],
  };
}
