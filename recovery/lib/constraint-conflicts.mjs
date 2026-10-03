// A source anchor remains an input hypothesis. A derived pair must never gain
// priority merely because its supporting fragment was discovered earlier.
// This check is read-only and must run before committing a round's proposals.
export function hasConstraintAnchorConflict({
  pairs, established, establishedReverse, sourceAnchors, sourceAnchorsReverse,
}) {
  let conflict = false
  for (const pair of pairs) {
    const forward = established.has(pair.right) && established.get(pair.right) !== pair.left
    const reverse = establishedReverse.has(pair.left) && establishedReverse.get(pair.left) !== pair.right
    if (!forward && !reverse) continue
    if (forward && !sourceAnchors.has(pair.right) || reverse && !sourceAnchorsReverse.has(pair.left)) {
      throw new Error('Late conflict with a derived naming hypothesis; iterative extension aborted before output')
    }
    conflict = true
  }
  return conflict
}

// Complete AST-fragment proposals must not retain one derived class owner when
// its coordinated owner loses a reciprocal vote. Decide from the ORIGINAL round;
// filtering and recomputing votes would arbitrarily select a winning fragment.
// Source anchors are outside these groups and remain unchanged. The emitter's
// spelling-only shared-token closure does not create baseline correspondence.
export function conflictingSharedClassGroups({ proposed, forwardConstraints, reverseConstraints }) {
  const blocked = new Set()
  for (const pair of proposed) if (pair.sharedClassOwner && (
    forwardConstraints.get(pair.right)?.size !== 1 || reverseConstraints.get(pair.left)?.size !== 1
  )) blocked.add(pair.group)
  return blocked
}

// Decide against the ORIGINAL aggregate round, including proposals from other
// fragment kinds. Never prune votes and rerun them to choose a winning table.
export function conflictingAtomicConstraintGroups({ proposed, forwardConstraints, reverseConstraints }) {
  const blocked = new Set()
  for (const pair of proposed) if (pair.atomicGroup && (
    forwardConstraints.get(pair.right)?.size !== 1 || reverseConstraints.get(pair.left)?.size !== 1
  )) blocked.add(pair.group)
  return blocked
}
