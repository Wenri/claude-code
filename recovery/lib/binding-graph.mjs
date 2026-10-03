import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { parse, tokenizer } from 'acorn'
import { analyze } from 'eslint-scope'

const PARSE = { ecmaVersion: 2026, sourceType: 'module', allowHashBang: true, ranges: true }
const SCOPE = { ecmaVersion: 2024, sourceType: 'module', optimistic: true, ignoreEval: true }
const sha256 = text => crypto.createHash('sha256').update(text).digest('hex')
const rangeKey = (start, end) => `${start}:${end}`

// Checks static lexical reference preservation after an explicit naming edit.
// It deliberately does not certify semantic alpha equivalence: eval, reflection,
// exported/imported names and property keys can observe identifier spelling.
export function verifyBindingGraph({ originalSource, renamedSource, edits }) {
  assert.equal(typeof originalSource, 'string', 'originalSource must be a string')
  assert.equal(typeof renamedSource, 'string', 'renamedSource must be a string')
  assert(Array.isArray(edits), 'edits must be an array')
  const ordered = edits.map(edit => ({ ...edit })).sort((a, b) => a.start - b.start)
  let cursor = 0, produced = '', delta = 0
  for (const edit of ordered) {
    assert(Number.isSafeInteger(edit.start) && Number.isSafeInteger(edit.end), 'Edit range must use integer UTF-16 offsets')
    assert(edit.start >= cursor && edit.end > edit.start && edit.end <= originalSource.length, 'Edit range overlaps or is outside the original source')
    assert.equal(typeof edit.text, 'string', 'Edit replacement must be a string')
    const tokens = tokenizer(edit.text, PARSE)
    const first = tokens.getToken(), last = tokens.getToken()
    assert(first.type.label === 'name' && first.start === 0 && first.end === edit.text.length && last.type.label === 'eof', 'Edit replacement must be exactly one identifier')
    produced += originalSource.slice(cursor, edit.start) + edit.text
    edit.deltaBefore = delta
    delta += edit.text.length - (edit.end - edit.start)
    edit.deltaAfter = delta
    cursor = edit.end
  }
  produced += originalSource.slice(cursor)
  assert.equal(produced === renamedSource, true, 'Renamed source is not the exact result of the supplied edits')

  function translate(offset) {
    let low = 0, high = ordered.length
    while (low < high) {
      const mid = (low + high) >>> 1
      if (ordered[mid].end <= offset) low = mid + 1
      else high = mid
    }
    const next = ordered[low]
    assert(!next || offset <= next.start, 'AST boundary falls inside an identifier edit')
    return offset + (low ? ordered[low - 1].deltaAfter : 0)
  }

  function graph(source, translatePosition) {
    const ast = parse(source, PARSE)
    const manager = analyze(ast, SCOPE)
    const scopeIndices = new Map(manager.scopes.map((scope, index) => [scope, index]))
    const scopeKeys = new Map(manager.scopes.map((scope, index) => [scope, [
      index, scope.type, scope.block.type, translatePosition(scope.block.start),
      translatePosition(scope.block.end), scope.upper ? scopeIndices.get(scope.upper) : null,
    ].join(':')]))
    const variableKeys = new Map(), variables = new Map(), identifierRanges = new Set()
    for (const scope of manager.scopes) {
      for (const variable of scope.variables) {
        const positions = variable.identifiers.map(node => {
          identifierRanges.add(rangeKey(node.start, node.end))
          return rangeKey(translatePosition(node.start), translatePosition(node.end))
        }).sort()
        const origin = positions.length ? positions.join(',') : `implicit:${variable.name}`
        const key = `${scopeKeys.get(scope)}|${origin}`
        assert(!variables.has(key), 'Multiple static bindings share one declaration identity')
        const definitions = variable.defs.map(def => [def.type, def.kind ?? null, def.node?.type ?? null])
        variables.set(key, JSON.stringify(definitions))
        variableKeys.set(variable, key)
      }
    }
    const references = new Map()
    for (const scope of manager.scopes) {
      for (const reference of scope.references) {
        const node = reference.identifier
        identifierRanges.add(rangeKey(node.start, node.end))
        const key = rangeKey(translatePosition(node.start), translatePosition(node.end))
        const record = {
          from: scopeKeys.get(reference.from),
          target: reference.resolved ? variableKeys.get(reference.resolved) : null,
          unresolvedName: reference.resolved ? null : node.name,
          read: reference.isRead(), write: reference.isWrite(), init: reference.init ?? null,
        }
        assert(!reference.resolved || record.target !== undefined, 'Resolved binding is absent from scope graph')
        const rows = references.get(key) ?? []
        rows.push(JSON.stringify(record))
        references.set(key, rows)
      }
    }
    for (const rows of references.values()) rows.sort()
    return { scopes: [...scopeKeys.values()], variables, references, identifierRanges }
  }

  const original = graph(originalSource, translate)
  for (const edit of ordered) {
    assert(original.identifierRanges.has(rangeKey(edit.start, edit.end)), 'Edit does not cover an entire lexical declaration/reference identifier')
  }
  const renamed = graph(renamedSource, offset => offset)
  // A full bundle has tens of thousands of nodes. Report the first mismatch
  // instead of letting an assertion print both complete graphs on failure.
  const scopeLabel = 'Lexical scope topology changed'
  assert.equal(renamed.scopes.length, original.scopes.length, scopeLabel)
  for (let index = 0; index < original.scopes.length; index++) {
    assert.equal(renamed.scopes[index], original.scopes[index], `${scopeLabel} at scope ${index}`)
  }
  function compareEntries(before, after, label) {
    assert.equal(after.size, before.size, `${label}: entry count`)
    for (const [key, expected] of before) {
      assert(after.has(key), `${label}: missing identity ${key.slice(0, 300)}`)
      const actual = after.get(key)
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`${label} at ${key.slice(0, 300)}; expected ${JSON.stringify(expected).slice(0, 500)}, got ${JSON.stringify(actual).slice(0, 500)}`)
      }
    }
  }
  compareEntries(original.variables, renamed.variables, 'Static binding declaration identities changed (split, merge or lost binding)')
  compareEntries(original.references, renamed.references, 'Static reference binding changed (capture, lost binding or unresolved name change)')

  return {
    status: 'static-binding-graph-preserved', criterion: 'utf16-edit-translated-lexical-reference-graph-v1',
    originalSha256: sha256(originalSource), renamedSha256: sha256(renamedSource),
    editCount: ordered.length, scopeCount: original.scopes.length, bindingCount: original.variables.size,
    referenceCount: [...original.references.values()].reduce((sum, rows) => sum + rows.length, 0),
    parser: { name: 'acorn', ecmaVersion: PARSE.ecmaVersion, sourceType: PARSE.sourceType },
    scopeAnalysis: { name: 'eslint-scope', ...SCOPE },
    semanticEquivalenceEstablished: false,
    limitations: [
      'Only lexical declaration identities and resolved/unresolved reference targets are compared after exact identifier edits.',
      'Dynamic eval and reflection are excluded; this check does not establish semantic alpha equivalence.',
      'Import/export runtime names, shorthand/property keys, function/class names and host behavior may observe the edits even when the static binding graph is preserved.',
      'It does not authenticate source maps, source-position pairing, compiler inputs or whole-program equivalence.',
    ],
  }
}
