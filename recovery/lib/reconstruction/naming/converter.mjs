import assert from 'node:assert/strict'
import { emitFrozenNaming, inspectCandidateDeclarationGroups, assertBoundIdentifierSpelling, RESERVED_NAMES } from './backend.mjs'
import { canonical, readCanonicalJSON, sha256, validateToolPins } from './toolchain.mjs'

const hashPattern = /^[0-9a-f]{64}$/
function digest(value, label) { assert(typeof value === 'string' && hashPattern.test(value), `${label} must be SHA-256`) }
function keys(value, expected, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} fields differ; only the body-free projection is accepted`)
}
function ranges(value) {
  assert(Array.isArray(value) && value.length > 0, 'Every discovery assignment needs complete declaration ranges')
  const result = value.map(range => {
    assert(Array.isArray(range) && range.length === 2 && range.every(Number.isSafeInteger) && range[0] >= 0 && range[1] > range[0], 'Malformed discovery declaration range')
    return [...range]
  }).sort((a, b) => a[0] - b[0] || a[1] - b[1])
  for (let i = 1; i < result.length; i++) assert(result[i][0] >= result[i - 1][1], 'Duplicate or overlapping discovery declaration ranges')
  return result
}

// Offline, candidate-only converter. Its caller must authenticate the original
// discovery report separately, project only its naming assignments and hashes,
// then pin the canonical projection bytes before calling. Report/profile hashes
// are recorded provenance, not independently read evidence or body authority.
export function prepareDiscoveryNamePlan(options) {
  keys(options, ['candidateBytes', 'projectionBytes', 'expectedProjectionSha256', 'toolPins', 'targetId', 'reservedNames'], 'Converter options')
  const { candidateBytes, projectionBytes, expectedProjectionSha256, toolPins, targetId, reservedNames } = options
  assert(Buffer.isBuffer(candidateBytes), 'Candidate must be exact UTF-8 bytes')
  assert(Buffer.isBuffer(projectionBytes), 'Projection must be exact canonical UTF-8 bytes')
  assert(typeof targetId === 'string' && targetId.length > 0 && targetId.length <= 200, 'Preparation requires a bounded target ID')
  assert(Array.isArray(reservedNames) && (reservedNames.length === 0 || canonical(reservedNames) === canonical(RESERVED_NAMES)),
    'Preparation reservations must explicitly be [] or the complete synthetic-name reservation set')
  digest(expectedProjectionSha256, 'Expected projection digest')
  assert.equal(sha256(projectionBytes), expectedProjectionSha256, 'Pinned discovery projection digest differs')
  const projection = readCanonicalJSON(projectionBytes, 'Discovery projection')
  keys(projection, ['schemaVersion', 'kind', 'reportSha256', 'sourceProfileSha256', 'candidateSha256', 'observedNamedSha256', 'bindings'], 'Discovery projection')
  assert.equal(projection.schemaVersion, 1, 'Unsupported discovery projection schema')
  assert.equal(projection.kind, 'pinned-discovery-name-plan-projection', 'Unsupported discovery projection kind')
  for (const key of ['reportSha256', 'sourceProfileSha256', 'candidateSha256', 'observedNamedSha256']) digest(projection[key], key)
  assert.equal(sha256(candidateBytes), projection.candidateSha256, 'Projection candidate hash differs')
  assert(Array.isArray(projection.bindings), 'Projected bindings must be an array')
  const toolPinsSha256 = validateToolPins(toolPins)
  const inventory = inspectCandidateDeclarationGroups(candidateBytes)
  const candidates = new Map(inventory.groups.map(group => [canonical(group.identifierRanges), group]))
  const assignments = new Map()
  for (let i = 0; i < projection.bindings.length; i++) {
    const assignment = projection.bindings[i]
    keys(assignment, ['from', 'to', 'identifierRanges'], `Discovery assignment ${i}`)
    assert(typeof assignment.from === 'string' && typeof assignment.to === 'string' && assignment.from && assignment.to, 'Discovery spellings must be nonempty strings')
    assertBoundIdentifierSpelling(assignment.from); assertBoundIdentifierSpelling(assignment.to)
    const key = canonical(ranges(assignment.identifierRanges)), group = candidates.get(key)
    assert(group, `Discovery assignment ${i} has missing or incomplete candidate declaration identity`)
    assert(group.owners.every(owner => owner.from === assignment.from), `Discovery assignment ${i} expected spelling differs`)
    const previous = assignments.get(key)
    if (previous) {
      assert(previous.from === assignment.from && previous.to === assignment.to, 'Conflicting discovery assignments for one declaration owner group')
      previous.rows.push(i)
    } else assignments.set(key, { from: assignment.from, to: assignment.to, rows: [i], group })
  }
  const bindings = [], groups = []
  let unchangedAssignmentsSkipped = 0
  for (const assignment of assignments.values()) {
    // Discovery emits one row per lexical owner. Identical rows are required
    // exactly twice for a candidate-derived two-owner class group, never used
    // to choose an owner by arbitrary order or to mask omitted/conflicting rows.
    assert.equal(assignment.rows.length, assignment.group.owners.length, 'Discovery owner-group omission or duplicate assignment')
    const unchanged = assignment.from === assignment.to
    if (unchanged) unchangedAssignmentsSkipped += assignment.rows.length
    const recipeRecords = []
    if (!unchanged) for (const owner of assignment.group.owners) {
      recipeRecords.push(bindings.length)
      bindings.push({ from: assignment.from, to: assignment.to, identity: owner.identity })
    }
    groups.push({ discoveryRows: assignment.rows, recipeRecords, unchanged })
  }
  const recipe = { schemaVersion: 1, kind: 'reviewed-bound-symbol-emission-recipe', targetId,
    candidate: inventory.candidate, toolPinsSha256, reservedNames, bindings }
  const recipeBytes = Buffer.from(canonical(recipe)), expectedRecipeSha256 = sha256(recipeBytes)
  const manifest = {
    schemaVersion: 1, kind: 'prepared-discovery-name-plan', status: 'prepared-unverified', projectionSha256: expectedProjectionSha256,
    provenance: { reportSha256: projection.reportSha256, sourceProfileSha256: projection.sourceProfileSha256,
      originalReportIndependentlyRead: false, criterion: 'caller-authenticated-body-free-projection' },
    candidateSha256: projection.candidateSha256, observedNamedSha256: projection.observedNamedSha256,
    recipeSha256: expectedRecipeSha256, toolPinsSha256, discoveryAssignmentCount: projection.bindings.length,
    unchangedAssignmentsSkipped, frozenBindingCount: bindings.length, groups,
    observedNamePlanReproduced: false, requiresFrozenEmitterReplay: true, mandatoryExactNameAcceptanceEstablished: false,
    finalTargetAstEqualityEstablished: false, semanticEquivalenceEstablished: false,
  }
  const conversionManifestBytes = Buffer.from(canonical(manifest))
  return { recipeBytes, expectedRecipeSha256, conversionManifestBytes,
    expectedConversionManifestSha256: sha256(conversionManifestBytes), preparationStatus: 'prepared-unverified' }
}

export function replayPreparedDiscoveryNamePlan(options) {
  keys(options, ['candidateBytes', 'recipeBytes', 'expectedRecipeSha256', 'conversionManifestBytes', 'expectedConversionManifestSha256', 'toolPins'], 'Replay options')
  const { candidateBytes, recipeBytes, expectedRecipeSha256, conversionManifestBytes, expectedConversionManifestSha256, toolPins } = options
  assert(Buffer.isBuffer(candidateBytes) && Buffer.isBuffer(conversionManifestBytes), 'Replay candidate and manifest must be exact bytes')
  digest(expectedConversionManifestSha256, 'Expected conversion manifest digest')
  assert.equal(sha256(conversionManifestBytes), expectedConversionManifestSha256, 'Pinned conversion manifest digest differs')
  const manifest = readCanonicalJSON(conversionManifestBytes, 'Conversion manifest')
  keys(manifest, ['schemaVersion', 'kind', 'status', 'projectionSha256', 'provenance', 'candidateSha256', 'observedNamedSha256',
    'recipeSha256', 'toolPinsSha256', 'discoveryAssignmentCount', 'unchangedAssignmentsSkipped', 'frozenBindingCount', 'groups',
    'observedNamePlanReproduced', 'requiresFrozenEmitterReplay', 'mandatoryExactNameAcceptanceEstablished',
    'finalTargetAstEqualityEstablished', 'semanticEquivalenceEstablished'], 'Conversion manifest')
  assert.equal(manifest.schemaVersion, 1); assert.equal(manifest.kind, 'prepared-discovery-name-plan'); assert.equal(manifest.status, 'prepared-unverified')
  for (const flag of ['observedNamePlanReproduced', 'mandatoryExactNameAcceptanceEstablished', 'finalTargetAstEqualityEstablished', 'semanticEquivalenceEstablished']) assert.equal(manifest[flag], false)
  assert.equal(manifest.requiresFrozenEmitterReplay, true)
  keys(manifest.provenance, ['reportSha256', 'sourceProfileSha256', 'originalReportIndependentlyRead', 'criterion'], 'Conversion provenance')
  assert.equal(manifest.provenance.originalReportIndependentlyRead, false)
  assert.equal(manifest.provenance.criterion, 'caller-authenticated-body-free-projection')
  for (const key of ['reportSha256', 'sourceProfileSha256']) digest(manifest.provenance[key], key)
  for (const key of ['projectionSha256', 'candidateSha256', 'observedNamedSha256', 'recipeSha256', 'toolPinsSha256']) digest(manifest[key], key)
  assert.equal(sha256(candidateBytes), manifest.candidateSha256, 'Prepared candidate hash differs')
  assert.equal(manifest.recipeSha256, expectedRecipeSha256, 'Prepared recipe digest differs')
  assert.equal(manifest.toolPinsSha256, sha256(canonical(toolPins)), 'Prepared tool pins differ')
  for (const key of ['discoveryAssignmentCount', 'unchangedAssignmentsSkipped', 'frozenBindingCount']) assert(Number.isSafeInteger(manifest[key]) && manifest[key] >= 0, 'Invalid preparation count')
  assert(Array.isArray(manifest.groups), 'Manifest owner groups must be an array')
  const rows = new Set(), records = new Set()
  let unchangedCount = 0
  for (const group of manifest.groups) {
    keys(group, ['discoveryRows', 'recipeRecords', 'unchanged'], 'Manifest owner group')
    assert(Array.isArray(group.discoveryRows) && [1, 2].includes(group.discoveryRows.length) && Array.isArray(group.recipeRecords) && typeof group.unchanged === 'boolean', 'Invalid manifest owner group')
    assert.equal(group.recipeRecords.length, group.unchanged ? 0 : group.discoveryRows.length, 'Manifest owner-group coverage differs')
    for (const row of group.discoveryRows) { assert(Number.isSafeInteger(row) && row >= 0 && row < manifest.discoveryAssignmentCount && !rows.has(row), 'Invalid or repeated discovery row'); rows.add(row) }
    for (const record of group.recipeRecords) { assert(Number.isSafeInteger(record) && record >= 0 && record < manifest.frozenBindingCount && !records.has(record), 'Invalid or repeated recipe record'); records.add(record) }
    if (group.unchanged) unchangedCount += group.discoveryRows.length
  }
  assert.equal(rows.size, manifest.discoveryAssignmentCount, 'Missing manifest discovery rows')
  assert.equal(records.size, manifest.frozenBindingCount, 'Missing manifest recipe records')
  assert.equal(unchangedCount, manifest.unchangedAssignmentsSkipped, 'Manifest unchanged coverage differs')
  // Keep runtime-token safeguards and authoritative whole-program static graph
  // verification exactly on the actual bytes emitted by the existing backend.
  const result = emitFrozenNaming({ candidateBytes, recipeBytes, expectedRecipeSha256, toolPins })
  assert.equal(result.receipt.suppliedBindingCount, manifest.frozenBindingCount, 'Emitted recipe binding count differs')
  assert.equal(result.receipt.output.sha256, manifest.observedNamedSha256,
    'Replay differs from pinned observed named-output hash: missing, extra or changed assignment')
  return { ...result, conversionReceipt: { ...manifest, kind: 'candidate-owned-discovery-plan-conversion',
    status: 'observed-name-plan-reproduced', conversionManifestSha256: expectedConversionManifestSha256,
    observedNamePlanReproduced: true, requiresFrozenEmitterReplay: false } }
}

// Convenience path for tiny inputs; the exact same two stages may be run in
// separate processes to reclaim the candidate-owner inspection heap completely.
export function convertDiscoveryNamePlan(options) {
  const prepared = prepareDiscoveryNamePlan(options)
  const result = replayPreparedDiscoveryNamePlan({ candidateBytes: options.candidateBytes, recipeBytes: prepared.recipeBytes,
    expectedRecipeSha256: prepared.expectedRecipeSha256, conversionManifestBytes: prepared.conversionManifestBytes,
    expectedConversionManifestSha256: prepared.expectedConversionManifestSha256, toolPins: options.toolPins })
  const { preparationStatus, ...artifacts } = prepared
  return { ...artifacts, ...result }
}
