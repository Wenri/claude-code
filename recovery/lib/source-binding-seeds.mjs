import { sharedClassDeclarationOwners } from './binding-name-constraints.mjs'
import { conflictingSharedClassGroups } from './constraint-conflicts.mjs'

// Keys and reference positions must come from the comparator's full-path AND
// identical-source-content filter. These are source-position hypotheses, not
// AST/semantic equivalence or permission to bypass the emitter's safety gates.
export function deriveSourceBindingSeeds(baseline, candidate) {
  const sharedByRow = new Map()
  const owners = group => sharedClassDeclarationOwners(group, group?.[0]?.v?.defs?.[0]?.node?.id)
  for (const [key, rightGroup] of candidate.byKey) {
    const leftGroup = baseline.byKey.get(key)
    const left = owners(leftGroup), right = owners(rightGroup)
    if (!key || !left || !right || left.some((row, role) => row.key !== key ||
        right[role].key !== key || row.scope.type !== right[role].scope.type)) continue
    const group = { targets: new Map(right.map((row, role) => [row, left[role]])) }
    for (const row of right) sharedByRow.set(row, group)
  }

  const candidates = [], rejectedGroups = new Set()
  let ambiguous = 0, missing = 0
  for (const row of candidate.variables) {
    const choices = baseline.byKey.get(row.key), group = sharedByRow.get(row)
    const decl = group?.targets.get(row) ?? (row.key && choices?.length === 1 &&
      candidate.byKey.get(row.key)?.length === 1 && row.scope.type === choices[0].scope.type ? choices[0] : null)
    const votes = new Map()
    for (const ref of row.refs) {
      const peers = baseline.byReference.get(ref)
      if (peers?.length !== 1 || candidate.byReference.get(ref)?.length !== 1 || row.scope.type !== peers[0].scope.type) continue
      const evidence = votes.get(peers[0]) ?? []
      evidence.push(ref); votes.set(peers[0], evidence)
    }
    const references = votes.size === 1 ? [...votes][0] : null
    // A contradictory reference for either owner rejects the complete source
    // group, including when multiple reference targets disagree with its role.
    if ((group && [...votes.keys()].some(target => target !== decl)) ||
        (decl && references && decl !== references[0])) {
      if (group) rejectedGroups.add(group)
      ambiguous++; continue
    }
    const target = references && references[1].length >= 2 ? references[0] : decl
    if (!target) { missing++; continue }
    candidates.push({ row, old: target, from: row.v.name, to: target.v.name,
      key: row.key ?? references[1][0], referenceEvidence: references?.[1] ?? [], group,
      basis: group ? 'shared-class-source-declaration-position' : references && references[1].length >= 2 ?
        'unique-source-reference-positions' : 'unique-source-declaration-position' })
  }

  // Decide from the original candidate set. Never choose a class owner by
  // filtering ambiguous groups to one scope type, or by accepting its twin after
  // a conflicting proposal has been removed. Both roles survive or neither does.
  const proposed = [], forwardConstraints = new Map(), reverseConstraints = new Map()
  for (const pair of candidates) {
    const left = pair.old.v, right = pair.row.v
    const forward = forwardConstraints.get(right) ?? new Set(), reverse = reverseConstraints.get(left) ?? new Set()
    forward.add(left); reverse.add(right)
    forwardConstraints.set(right, forward); reverseConstraints.set(left, reverse)
    if (pair.group) proposed.push({ left, right, sharedClassOwner: true, group: pair.group })
  }
  const blocked = conflictingSharedClassGroups({ proposed, forwardConstraints, reverseConstraints })
  const pairs = []
  for (const { group, ...pair } of candidates) {
    if (rejectedGroups.has(group) || blocked.has(group) || forwardConstraints.get(pair.row.v).size !== 1 ||
        reverseConstraints.get(pair.old.v).size !== 1) { ambiguous++; continue }
    pairs.push(pair)
  }
  return { pairs, ambiguous, missing }
}
