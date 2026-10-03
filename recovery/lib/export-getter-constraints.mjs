import { deriveExportGetterBindingConstraints } from './binding-name-constraints.mjs'
import { hasConstraintAnchorConflict } from './constraint-conflicts.mjs'

const range = node => [node.start, node.end]
const add = (map, key, value) => {
  const values = map.get(key) ?? new Set()
  values.add(value); map.set(key, values)
}

// Input indexes were built from the original Programs. This pass reads only the
// pre-round snapshot; it never makes its own proposals eligible as selectors.
export function deriveAnchoredExportGetterConstraints({
  left, right, anchorSnapshot, sourceAnchors, sourceAnchorsReverse,
}) {
  const stats = { eligibleBaselineStatements: left.exportGetters.statements.length,
    eligibleCandidateStatements: right.exportGetters.statements.length,
    uniqueGetterAnchors: 0, ambiguousGetterAnchors: 0, nonreciprocalAnchors: 0,
    statementPairConflicts: 0, completeShapeAccepted: 0, completeShapeRejected: 0,
    anchorConflicts: 0, aggregateGroupConflicts: 0, reciprocalConflicts: 0, added: 0 }
  const proposed = [], fragments = [], selectorRejections = [], groups = new Map(), leftTargets = new Map(), rightTargets = new Map()
  const forward = new Map(), reverse = new Map()
  for (const anchor of anchorSnapshot) { add(forward, anchor.row, anchor.old); add(reverse, anchor.old, anchor.row) }
  const established = new Map(anchorSnapshot.map(anchor => [anchor.row, anchor.old]))
  const establishedReverse = new Map(anchorSnapshot.map(anchor => [anchor.old, anchor.row]))
  for (const anchor of anchorSnapshot) {
    const a = left.exportGetters.byBinding.get(anchor.old) ?? [], b = right.exportGetters.byBinding.get(anchor.row) ?? []
    if (!a.length || !b.length) continue
    // Do not use exported key, AST shape, relative order or a unique-looking gap
    // to reduce multiplicity. Identity alone must select one occurrence each.
    if (a.length !== 1 || b.length !== 1) {
      stats.ambiguousGetterAnchors++
      const occurrences = rows => rows.map(row => ({ statementRange: range(row.statement),
        getterRange: range(row.identifier), exportedKey: row.observableKey }))
      selectorRejections.push({ outcome: 'ambiguous-getter-role', origin: anchor.key ?? null,
        sourceBasis: anchor.basis ?? null, constraintDepth: anchor.constraintDepth ?? 0,
        baselineName: anchor.old.v.name, candidateName: anchor.row.v.name,
        baselineOccurrences: occurrences(a), candidateOccurrences: occurrences(b) })
      continue
    }
    const l = a[0].statement, r = b[0].statement
    add(leftTargets, l, r); add(rightTargets, r, l)
    const key = `${l.start}:${r.start}`
    let group = groups.get(key)
    if (!group) { group = { leftNode: l, rightNode: r, anchors: [], invalidAnchor: false }; groups.set(key, group) }
    if (forward.get(anchor.row).size !== 1 || reverse.get(anchor.old).size !== 1) {
      stats.nonreciprocalAnchors++; group.invalidAnchor = true
    }
    stats.uniqueGetterAnchors++
    group.anchors.push({ basis: sourceAnchors.get(anchor.row) === anchor.old ? 'existing-source-anchor' : 'existing-derived-anchor',
      origin: anchor.key ?? null, sourceBasis: anchor.basis ?? null, referenceEvidence: anchor.referenceEvidence,
      constraintAnchor: anchor.constraintAnchor, constraintDepth: anchor.constraintDepth ?? 0,
      baselineName: anchor.old.v.name, candidateName: anchor.row.v.name,
      baselineDeclarationRanges: anchor.old.v.identifiers.map(range), candidateDeclarationRanges: anchor.row.v.identifiers.map(range),
      baselineGetterRange: range(a[0].identifier), candidateGetterRange: range(b[0].identifier),
      baselineExportedKey: a[0].observableKey, candidateExportedKey: b[0].observableKey })
  }
  for (const group of groups.values()) {
    const fragment = { baselineRange: range(group.leftNode), candidateRange: range(group.rightNode),
      anchors: group.anchors, semanticEquivalenceEstablished: false }
    fragments.push(fragment)
    if (group.invalidAnchor || leftTargets.get(group.leftNode).size !== 1 || rightTargets.get(group.rightNode).size !== 1) {
      stats.statementPairConflicts++; fragment.outcome = 'nonreciprocal-statement-correspondence'; continue
    }
    const result = deriveExportGetterBindingConstraints({ leftProgram: left.ast, rightProgram: right.ast,
      leftNode: group.leftNode, rightNode: group.rightNode, leftBindingAt: left.bindingAt, rightBindingAt: right.bindingAt,
      leftRuntimeNames: left.runtimeNames, rightRuntimeNames: right.runtimeNames })
    if (!result.accepted) {
      stats.completeShapeRejected++; fragment.outcome = 'complete-shape-rejected'; fragment.reason = result.reason; continue
    }
    // Snapshot conflicts reject the COMPLETE statement. The existing late-
    // derived-conflict abort remains fail-closed rather than rolling back votes.
    if (result.pairs.some(pair => forward.get(pair.right)?.size > 1 || reverse.get(pair.left)?.size > 1) ||
        hasConstraintAnchorConflict({ pairs: result.pairs, established, establishedReverse, sourceAnchors, sourceAnchorsReverse })) {
      stats.anchorConflicts++; fragment.outcome = 'existing-anchor-conflict'; continue
    }
    stats.completeShapeAccepted++; fragment.outcome = 'proposed'; result.fragment = fragment
    for (const pair of result.pairs) proposed.push({ ...pair, group: result, atomicGroup: true, kind: 'export-getter',
      anchor: group.anchors[0].origin, anchorIdentity: { baselineRange: fragment.baselineRange,
        candidateRange: fragment.candidateRange, getterAnchors: fragment.anchors } })
  }
  return { proposed, stats, fragments, selectorRejections }
}
