import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { verifyBindingGraph } from '../../binding-graph.mjs'
import { collectRuntimeNameIdentifiers, indexBindingIdentifiers, sharedClassDeclarationOwners } from '../../binding-name-constraints.mjs'
import { RECOVERY, canonical, sha256, validateToolPins, readCanonicalJSON } from './toolchain.mjs'

const require = createRequire(path.join(RECOVERY, 'package.json'))
const { parse, tokenizer } = require('acorn')
const { analyze } = require('eslint-scope')
const PARSE = { ecmaVersion: 2026, sourceType: 'module', allowHashBang: true, ranges: true }
const SCOPE = { ecmaVersion: 2024, sourceType: 'module', optimistic: true, ignoreEval: true }
export const RESERVED_NAMES = Object.freeze(['y58', 'h58', 't38'])
const rangeKey = n => `${n.start}:${n.end}`
const hashPattern = /^[0-9a-f]{64}$/
function keys(value, expected, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} fields differ; unsupported payload`)
}
function digest(value, label) { assert(typeof value === 'string' && hashPattern.test(value), `${label} must be SHA-256`) }
export function assertBoundIdentifierSpelling(name) {
  assert(typeof name === 'string' && name.length > 0, 'Identifier spelling must be nonempty')
  const stream = tokenizer(name, PARSE), token = stream.getToken()
  assert(token.type.label === 'name' && token.start === 0 && token.end === name.length && token.value === name && stream.getToken().type.label === 'eof', 'Spelling must be one literal Identifier token without escapes')
  const ast = parse(`let ${name};`, PARSE)
  assert(ast.body.length === 1 && ast.body[0].declarations[0].id.type === 'Identifier', 'Spelling is not a module binding name')
}
function decode(candidateBytes) {
  assert(Buffer.isBuffer(candidateBytes), 'candidateBytes must be a Buffer of exact UTF-8 bytes')
  const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(candidateBytes)
  assert(Buffer.from(source).equals(candidateBytes), 'Candidate UTF-8 must round trip byte exactly')
  return source
}
function nodes(program, visit) {
  const pending = [program]
  while (pending.length) {
    const node = pending.pop()
    visit(node)
    for (const [key, value] of Object.entries(node)) {
      if (['start', 'end', 'loc', 'range'].includes(key) || !value || typeof value !== 'object') continue
      for (const child of Array.isArray(value) ? value : [value]) if (typeof child?.type === 'string') pending.push(child)
    }
  }
}

// This is a candidate-only inventory, suitable for offline recipe enrichment.
// It neither chooses replacement names nor accepts comparator bodies/maps.
function indexCandidate(source) {
  const ast = parse(source, PARSE), manager = analyze(ast, SCOPE)
  const scopeIndices = new Map(manager.scopes.map((scope, index) => [scope, index]))
  function identity(scope, variable) {
    return {
      scope: { index: scopeIndices.get(scope), type: scope.type, blockType: scope.block.type,
        blockRange: [scope.block.start, scope.block.end], upperIndex: scope.upper ? scopeIndices.get(scope.upper) : null },
      identifierRanges: variable.identifiers.map(node => [node.start, node.end]).sort((a, b) => a[0] - b[0] || a[1] - b[1]),
      definitions: variable.defs.map(def => ({ type: def.type, kind: def.kind ?? null,
        nameRange: def.name ? [def.name.start, def.name.end] : null,
        nodeType: def.node?.type ?? null, nodeRange: def.node ? [def.node.start, def.node.end] : null,
        parentType: def.parent?.type ?? null, parentRange: def.parent ? [def.parent.start, def.parent.end] : null })),
    }
  }
  const rows = manager.scopes.flatMap(scope => scope.variables.map(v => ({ scope, v, identity: identity(scope, v) })))
  const byIdentity = new Map()
  for (const row of rows) {
    row.key = canonical(row.identity)
    // Implicit variables have no declaration range and cannot appear in a recipe.
    if (!row.v.identifiers.length) continue
    assert(!byIdentity.has(row.key), 'Candidate has ambiguous lexical declaration identity')
    byIdentity.set(row.key, row)
  }
  const runtimeNames = collectRuntimeNameIdentifiers(ast), runtimeRanges = new Set()
  nodes(ast, node => { if (runtimeNames.has(node)) runtimeRanges.add(rangeKey(node)) })
  const bindingAt = indexBindingIdentifiers(rows)
  const ownersByRange = new Map()
  for (const row of rows) for (const node of [...row.v.identifiers, ...row.v.references.map(ref => ref.identifier)]) {
    const owners = ownersByRange.get(rangeKey(node)) ?? new Set()
    owners.add(row); ownersByRange.set(rangeKey(node), owners)
  }
  return { ast, manager, rows, byIdentity, runtimeRanges, bindingAt, ownersByRange }
}

export function inspectCandidateBindings(candidateBytes) {
  const source = decode(candidateBytes), index = indexCandidate(source)
  return { candidate: { sha256: sha256(candidateBytes), bytes: candidateBytes.length },
    bindings: index.rows.filter(row => row.v.identifiers.length).map(row => ({ from: row.v.name, identity: row.identity })) }
}

// Candidate-only grouped inventory for offline conversion. A range signature
// with several owners is legal only for the exact candidate class-owner pair.
export function inspectCandidateDeclarationGroups(candidateBytes) {
  const source = decode(candidateBytes), index = indexCandidate(source), byRanges = new Map()
  for (const row of index.rows) {
    if (!row.v.identifiers.length) continue
    const key = canonical(row.identity.identifierRanges), group = byRanges.get(key) ?? []
    group.push(row); byRanges.set(key, group)
  }
  const groups = []
  for (const rows of byRanges.values()) {
    if (rows.length > 1) {
      const node = rows[0].v.identifiers[0], shared = sharedClassDeclarationOwners(index.bindingAt.get(node), node)
      assert(shared && shared.length === rows.length && shared.every(row => rows.includes(row)), 'Ambiguous candidate declaration-range owner group')
    }
    groups.push({ identifierRanges: rows[0].identity.identifierRanges,
      owners: rows.map(row => ({ from: row.v.name, identity: row.identity })) })
  }
  return { candidate: { sha256: sha256(candidateBytes), bytes: candidateBytes.length }, groups }
}

function validateRecipe(recipe, candidateBytes, expectedToolPinsSha256) {
  keys(recipe, ['schemaVersion', 'kind', 'targetId', 'candidate', 'toolPinsSha256', 'reservedNames', 'bindings'], 'Recipe')
  assert.equal(recipe.schemaVersion, 1, 'Unsupported recipe schema')
  assert.equal(recipe.kind, 'reviewed-bound-symbol-emission-recipe', 'Unsupported recipe kind')
  assert(typeof recipe.targetId === 'string' && recipe.targetId.length > 0 && recipe.targetId.length <= 200, 'Recipe requires a bounded target ID')
  keys(recipe.candidate, ['sha256', 'bytes'], 'Recipe candidate')
  digest(recipe.candidate.sha256, 'Candidate hash'); digest(recipe.toolPinsSha256, 'Tool pins hash')
  assert.equal(recipe.candidate.bytes, candidateBytes.length, 'Candidate byte length differs')
  assert.equal(recipe.candidate.sha256, sha256(candidateBytes), 'Candidate hash differs')
  assert.equal(recipe.toolPinsSha256, expectedToolPinsSha256, 'Recipe tool pins digest differs')
  assert(Array.isArray(recipe.reservedNames) && (recipe.reservedNames.length === 0 || canonical(recipe.reservedNames) === canonical(RESERVED_NAMES)),
    'Reservations must explicitly be [] or the complete synthetic-name reservation set')
  assert(Array.isArray(recipe.bindings), 'Recipe bindings must be an array')
}

function plan(index, source, recipe) {
  const selected = new Map(), selectedByVariable = new Map()
  for (let rowIndex = 0; rowIndex < recipe.bindings.length; rowIndex++) {
    const record = recipe.bindings[rowIndex]
    keys(record, ['from', 'to', 'identity'], `Binding ${rowIndex}`)
    assertBoundIdentifierSpelling(record.from); assertBoundIdentifierSpelling(record.to)
    assert(!recipe.reservedNames.includes(record.to), `Reserved synthesized spelling cannot be allocated: ${record.to}`)
    const row = index.byIdentity.get(canonical(record.identity))
    assert(row, `Binding ${rowIndex} has missing, stale or ambiguous declaration identity`)
    assert(!selected.has(row), `Duplicate binding record ${rowIndex}`)
    assert.equal(record.from, row.v.name, `Binding ${rowIndex} expected spelling differs`)
    const entry = { record, rowIndex, row }
    selected.set(row, entry); selectedByVariable.set(row.v, entry)
    for (const node of [...row.v.identifiers, ...row.v.references.map(ref => ref.identifier)]) {
      assert.equal(source.slice(node.start, node.end), record.from, 'Selected identifier token bytes differ from expected spelling')
      if (record.from !== record.to) assert(!index.runtimeRanges.has(rangeKey(node)), `Runtime-name token cannot be edited: ${rangeKey(node)}`)
    }
  }
  // Every overlapping owner is either the exact eslint-scope class pair or an
  // unsupported ambiguity. Complete pair records must be explicitly reviewed.
  for (const [row, entry] of selected) for (const node of [...row.v.identifiers, ...row.v.references.map(ref => ref.identifier)]) {
    const owners = index.ownersByRange.get(rangeKey(node))
    if (owners.size <= 1) continue
    const group = sharedClassDeclarationOwners(index.bindingAt.get(node), node)
    assert(group && group.length === owners.size && group.every(owner => owners.has(owner)), 'Unsupported ambiguous/shared token ownership')
    for (const owner of group) {
      assert(selected.has(owner), 'Shared class declaration requires the complete owner group')
      assert.equal(selected.get(owner).record.to, entry.record.to, 'Shared class owners require one target spelling')
    }
  }
  // No automatic collision repair, extra rename, or target-dependent fallback.
  for (const scope of index.manager.scopes) {
    const names = new Map()
    for (const variable of scope.variables) {
      const name = selectedByVariable.get(variable)?.record.to ?? variable.name
      assert(!names.has(name), `Planned scope name collision: ${name}`)
      names.set(name, variable)
    }
  }
  // Do not reconstruct reference resolution by walking scope.variables: a
  // function's parameter initializers cannot see declarations in its body,
  // even when eslint-scope records both in the same function scope. The pinned
  // analyzer's complete original/output reference graphs, checked below by
  // unchanged verifyBindingGraph before any write, are authoritative for all
  // resolution/capture rules. No scope or reference is filtered out there.
  const editsByRange = new Map(), coverage = []
  for (const [row, entry] of selected) {
    const declarationRanges = row.v.identifiers.map(n => [n.start, n.end])
    const referenceRanges = row.v.references.map(ref => [ref.identifier.start, ref.identifier.end])
    const tokenRanges = new Map()
    for (const [role, list] of [['declaration', row.v.identifiers], ['reference', row.v.references.map(ref => ref.identifier)]]) for (const node of list) {
      const key = rangeKey(node), roles = tokenRanges.get(key) ?? new Set()
      roles.add(role); tokenRanges.set(key, roles)
      if (entry.record.from === entry.record.to) continue
      let edit = editsByRange.get(key)
      if (!edit) { edit = { start: node.start, end: node.end, text: entry.record.to, from: entry.record.from, ownerRecords: new Set(), roles: new Set() }; editsByRange.set(key, edit) }
      assert.equal(edit.text, entry.record.to, 'Contradictory token edit')
      edit.ownerRecords.add(entry.rowIndex); edit.roles.add(role)
    }
    coverage.push({ record: entry.rowIndex, identitySha256: sha256(row.key), from: entry.record.from, to: entry.record.to,
      declarationRanges, referenceRanges, distinctTokenCount: tokenRanges.size, editedTokenCount: entry.record.from === entry.record.to ? 0 : tokenRanges.size })
  }
  return { edits: [...editsByRange.values()].sort((a, b) => a.start - b.start), coverage }
}

function emitBytes(candidateBytes, source, edits) {
  const pieces = [], lineage = [], editReceipt = []
  let inputPosition = 0, outputPosition = 0, inputByte = 0, outputByte = 0
  function unchanged(end) {
    const count = Buffer.byteLength(source.slice(inputPosition, end)), chunk = candidateBytes.subarray(inputByte, inputByte + count)
    pieces.push(chunk)
    if (count) lineage.push({ kind: 'unchanged', inputUtf16: [inputPosition, end], outputUtf16: [outputPosition, outputPosition + end - inputPosition],
      inputBytes: [inputByte, inputByte + count], outputBytes: [outputByte, outputByte + count], sha256: sha256(chunk) })
    outputPosition += end - inputPosition; inputPosition = end; inputByte += count; outputByte += count
  }
  for (const edit of edits) {
    assert(edit.start >= inputPosition && edit.end > edit.start, 'Overlapping or empty edit')
    unchanged(edit.start)
    const oldBytes = Buffer.from(edit.from), replacement = Buffer.from(edit.text)
    assert(candidateBytes.subarray(inputByte, inputByte + oldBytes.length).equals(oldBytes), 'Byte edit lineage mismatch')
    const receipt = { kind: 'identifier-edit', inputUtf16: [edit.start, edit.end], outputUtf16: [outputPosition, outputPosition + edit.text.length],
      inputBytes: [inputByte, inputByte + oldBytes.length], outputBytes: [outputByte, outputByte + replacement.length], from: edit.from, to: edit.text,
      ownerRecords: [...edit.ownerRecords].sort((a, b) => a - b), roles: [...edit.roles].sort() }
    pieces.push(replacement); lineage.push(receipt); editReceipt.push(receipt)
    inputPosition = edit.end; outputPosition += edit.text.length; inputByte += oldBytes.length; outputByte += replacement.length
  }
  unchanged(source.length)
  assert.equal(inputByte, candidateBytes.length, 'Incomplete byte lineage')
  return { outputBytes: Buffer.concat(pieces), lineage, editReceipt }
}

function verifyTokens(source, output, edits, editReceipt, reservedNames) {
  const reserved = new Set(reservedNames)
  const before = tokenizer(source, PARSE), after = tokenizer(output, PARSE)
  let tokenCount = 0, editIndex = 0, delta = 0
  while (true) {
    const a = before.getToken(), b = after.getToken(), edit = edits[editIndex]
    assert.equal(b.type.label, a.type.label, 'Token kind changed')
    const isEdit = edit && edit.start === a.start
    assert.equal(b.start, a.start + delta, 'Token-start lineage changed')
    if (isEdit) {
      assert(a.type.label === 'name' && a.end === edit.end && a.value === edit.from && b.value === edit.text, 'Edit is not an exact Identifier token')
      assert.equal(output.slice(b.start, b.end), edit.text, 'Emitted token bytes differ')
      editReceipt[editIndex].tokenIndex = tokenCount
      delta += edit.text.length - (edit.end - edit.start); editIndex++
    } else assert.equal(output.slice(b.start, b.end), source.slice(a.start, a.end), 'Unselected token bytes changed')
    assert.equal(b.end, a.end + delta, 'Token-end lineage changed')
    assert(!(b.type.label === 'name' && reserved.has(b.value)), `Reserved spelling remains in output: ${b.value}`)
    if (a.type.label === 'eof') break
    tokenCount++
  }
  assert.equal(editIndex, edits.length, 'Not every edit matched an Identifier token')
  return { criterion: 'lockstep-token-kinds-and-exact-unchanged-token-bytes', tokenCount, editedTokenCount: editIndex }
}

// The only inputs containing JavaScript are candidateBytes. There is no AST,
// replacement-body, target-bundle, source-map, or reference-path input.
export function emitFrozenNaming(options) {
  keys(options, ['candidateBytes', 'recipeBytes', 'expectedRecipeSha256', 'toolPins'], 'Emitter options')
  const { candidateBytes, recipeBytes, expectedRecipeSha256, toolPins } = options
  assert(Buffer.isBuffer(candidateBytes), 'candidateBytes must be a Buffer of exact UTF-8 bytes')
  digest(expectedRecipeSha256, 'Explicit expected recipe digest')
  assert(Buffer.isBuffer(recipeBytes), 'Recipe must be exact canonical UTF-8 bytes')
  assert.equal(sha256(recipeBytes), expectedRecipeSha256, 'Frozen recipe digest differs')
  const recipe = readCanonicalJSON(recipeBytes, 'Frozen recipe')
  const toolPinsSha256 = validateToolPins(toolPins)
  validateRecipe(recipe, candidateBytes, toolPinsSha256)
  const source = decode(candidateBytes)
  let index = indexCandidate(source)
  const { edits, coverage } = plan(index, source, recipe)
  // All planned edits/coverage are plain offsets and strings. Release the
  // complete candidate AST/scope model before independent verifier reparsing.
  index = null
  const { outputBytes, lineage, editReceipt } = emitBytes(candidateBytes, source, edits)
  const output = decode(outputBytes)
  const tokenLineage = verifyTokens(source, output, edits, editReceipt, recipe.reservedNames)
  const bindingGraph = verifyBindingGraph({ originalSource: source, renamedSource: output, edits: edits.map(({ start, end, text }) => ({ start, end, text })) })
  return { outputBytes, receipt: { schemaVersion: 1, kind: 'body-blind-frozen-naming-receipt', targetId: recipe.targetId,
    input: { bytes: candidateBytes.length, utf16Length: source.length, sha256: sha256(candidateBytes) },
    output: { bytes: outputBytes.length, utf16Length: output.length, sha256: sha256(outputBytes) },
    recipeSha256: expectedRecipeSha256, toolPinsSha256, reservedNames: [...recipe.reservedNames], suppliedBindingCount: recipe.bindings.length,
    selectedBindingCoverage: coverage, edits: editReceipt, lineage, tokenLineage, bindingGraph,
    finalTargetAstEqualityEstablished: false, semanticEquivalenceEstablished: false,
    limitations: ['Candidate-only exact binding edits; frozen spelling choices require independent review.',
      'Static graph preservation does not establish eval, reflection, function/class name or host semantic equivalence.',
      'No reference bundle/map read; the unchanged independent complete final AST verifier is still required.',
      'No synthesized free-symbol renaming, source-map regeneration, source-origin proof or compiler authentication is supplied.'] } }
}
