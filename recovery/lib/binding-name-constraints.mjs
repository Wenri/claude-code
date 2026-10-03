const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'])
const DECLARATION_KINDS = new Set(['var', 'let', 'const'])
const POSITIONS = new Set(['start', 'end', 'loc', 'range'])
const reject = reason => ({ accepted: false, reason, semanticEquivalenceEstablished: false })

function visitNodes(program, visitor) {
  const pending = [program]
  while (pending.length) {
    const node = pending.pop()
    if (!node || typeof node.type !== 'string') continue
    visitor(node)
    for (const [key, value] of Object.entries(node)) {
      if (POSITIONS.has(key) || !value || typeof value !== 'object') continue
      for (const child of Array.isArray(value) ? value : [value]) {
        if (typeof child?.type === 'string') pending.push(child)
      }
    }
  }
}

// Supply the whole Program so enclosing named exports and shared syntax tokens
// remain visible when individual function nodes are later compared.
export function collectRuntimeNameIdentifiers(program) {
  const runtime = new WeakSet()
  const add = node => {
    if (node?.type === 'Identifier' || node?.type === 'PrivateIdentifier') runtime.add(node)
  }
  const sharedToken = (left, right) => left === right || (
    Number.isInteger(left?.start) && Number.isInteger(left?.end) &&
    left.start === right?.start && left.end === right?.end
  )
  function addPattern(pattern) {
    if (!pattern) return
    if (pattern.type === 'Identifier') add(pattern)
    else if (pattern.type === 'RestElement') addPattern(pattern.argument)
    else if (pattern.type === 'AssignmentPattern') addPattern(pattern.left)
    else if (pattern.type === 'ArrayPattern') pattern.elements.forEach(addPattern)
    else if (pattern.type === 'ObjectPattern') {
      for (const property of pattern.properties) addPattern(property.type === 'RestElement' ? property.argument : property.value)
    }
  }
  visitNodes(program, node => {
    if (node.type === 'PrivateIdentifier') add(node)
    if (['Property', 'MethodDefinition', 'PropertyDefinition', 'ImportAttribute'].includes(node.type) && !node.computed) add(node.key)
    if (node.type === 'Property' && node.shorthand) {
      add(node.key)
      addPattern(node.value)
    }
    if (node.type === 'MemberExpression' && !node.computed) add(node.property)
    if (node.type === 'MetaProperty') { add(node.meta); add(node.property) }
    if (['LabeledStatement', 'BreakStatement', 'ContinueStatement'].includes(node.type)) add(node.label)
    if (node.type === 'ImportSpecifier') {
      add(node.imported)
      if (sharedToken(node.imported, node.local)) add(node.local)
    }
    if (node.type === 'ExportSpecifier') {
      add(node.exported)
      if (sharedToken(node.exported, node.local)) add(node.local)
    }
    if (node.type === 'ExportAllDeclaration') add(node.exported)
    if (node.type === 'ExportNamedDeclaration' && node.declaration) {
      if (node.declaration.type === 'VariableDeclaration') {
        for (const declaration of node.declaration.declarations) addPattern(declaration.id)
      } else add(node.declaration.id)
    }
  })
  return runtime
}

// A declaration token can own two distinct lexical bindings (a class declaration
// has an enclosing binding and a class-self binding). Keep both; overwriting one
// or converting the token to an unresolved identifier loses real graph context.
export function indexBindingIdentifiers(records) {
  const bindingAt = new WeakMap()
  for (const row of records) for (const node of [...row.v.identifiers, ...row.v.references.map(reference => reference.identifier)]) {
    const previous = bindingAt.get(node)
    if (previous === undefined) bindingAt.set(node, row)
    else if (Array.isArray(previous)) {
      if (!previous.includes(row)) previous.push(row)
    } else if (previous !== row) bindingAt.set(node, [previous, row])
  }
  return bindingAt
}

// Support only eslint-scope's exact ClassDeclaration co-ownership. Arbitrary
// multiply owned tokens cannot be paired by ordering, name, or scope type alone.
export function sharedClassDeclarationOwners(value, node) {
  if (!Array.isArray(value) || value.length !== 2 || value.some(row => !row || typeof row !== 'object' || !row.v ||
      !Array.isArray(row.v.defs) || !Array.isArray(row.v.identifiers) || !row.scope) ||
      value[0] === value[1] || value[0].v === value[1].v) return null
  const declarations = value.map(row => row.v?.defs?.length === 1 && row.v.defs[0].type === 'ClassName' ? row.v.defs[0].node : null)
  const declaration = declarations[0]
  if (!declaration || declaration !== declarations[1] || declaration.type !== 'ClassDeclaration' ||
      node?.type !== 'Identifier' || declaration.id !== node ||
      value.some(row => row.v.defs[0].name !== node || row.v.name !== node.name ||
        row.v.identifiers.length !== 1 || row.v.identifiers[0] !== node)) return null
  const inner = value.filter(row => row.scope?.type === 'class' && row.scope.block === declaration)
  if (inner.length !== 1) return null
  const outer = value.find(row => row !== inner[0])
  if (outer.scope !== inner[0].scope.upper) return null
  return [outer, inner[0]]
}

function identifierOwners(value, node) {
  if (value === undefined) return []
  if (value === null) return null
  if (!Array.isArray(value)) return [value]
  return sharedClassDeclarationOwners(value, node)
}

// A naming hypothesis from already source-paired whole functions. A caller must
// combine these pairs reciprocally with existing source-position anchors, emit
// real edits, verify the whole static binding graph, and compare the actual AST.
// This function never establishes callee values or semantic alpha equivalence.
export function deriveBindingConstraints({
  leftNode, rightNode, leftBindingAt, rightBindingAt, leftRuntimeNames, rightRuntimeNames,
}) {
  if (!FUNCTIONS.has(leftNode?.type) || !FUNCTIONS.has(rightNode?.type)) return reject('Whole function nodes are required')
  return deriveNodeConstraints({ leftNode, rightNode, leftBindingAt, rightBindingAt, leftRuntimeNames, rightRuntimeNames })
}

// Only an independently paired named ClassDeclaration can seed this walk.
// Compare the entire declaration, including heritage, fields, methods, static
// blocks and its coordinated outer/self owners. Class expressions and detached
// methods are deliberately outside this entry point. As with other fragments,
// this supplies naming hypotheses, never source or semantic equivalence proof.
export function deriveClassBindingConstraints({
  leftNode, rightNode, leftBindingAt, rightBindingAt, leftRuntimeNames, rightRuntimeNames,
}) {
  const completeClass = node => node?.type === 'ClassDeclaration' && node.id?.type === 'Identifier' &&
    node.body?.type === 'ClassBody' && Array.isArray(node.body.body)
  if (!completeClass(leftNode) || !completeClass(rightNode)) return reject('Whole named class declarations are required')
  return deriveNodeConstraints({ leftNode, rightNode, leftBindingAt, rightBindingAt, leftRuntimeNames, rightRuntimeNames })
}

// Separate naming hypotheses for complete declarations. A single declarator
// requires its actual parent node so declaration kind cannot be omitted. Its
// sibling grouping and program order remain outside this fragment comparison.
// As with function constraints, callers must reconcile ALL candidate pairs
// against source anchors and each other, guard bindings with runtime-name uses
// elsewhere in the Program, emit edits, and verify the whole binding graph and
// actual output AST. Matching an initializer does not prove its callee values.
export function deriveDeclarationBindingConstraints({
  leftNode, rightNode, leftDeclaration, rightDeclaration,
  leftBindingAt, rightBindingAt, leftRuntimeNames, rightRuntimeNames,
}) {
  const completeDeclaration = node => node?.type === 'VariableDeclaration' &&
    DECLARATION_KINDS.has(node.kind) && Array.isArray(node.declarations) && node.declarations.length > 0 &&
    node.declarations.every(declaration => declaration?.type === 'VariableDeclarator')
  if (leftNode?.type === 'VariableDeclaration' && rightNode?.type === 'VariableDeclaration') {
    if (!completeDeclaration(leftNode) || !completeDeclaration(rightNode)) return reject('Complete var/let/const declarations are required')
  } else if (leftNode?.type === 'VariableDeclarator' && rightNode?.type === 'VariableDeclarator') {
    if (!completeDeclaration(leftDeclaration) || !completeDeclaration(rightDeclaration) ||
        !leftDeclaration.declarations.includes(leftNode) || !rightDeclaration.declarations.includes(rightNode)) {
      return reject('Each whole declarator requires its containing var/let/const declaration')
    }
    leftNode = { type: 'DeclaratorWithDeclarationKind', kind: leftDeclaration.kind, declarator: leftNode }
    rightNode = { type: 'DeclaratorWithDeclarationKind', kind: rightDeclaration.kind, declarator: rightNode }
  } else return reject('Matching whole declaration or whole declarator nodes are required')
  return deriveNodeConstraints({ leftNode, rightNode, leftBindingAt, rightBindingAt, leftRuntimeNames, rightRuntimeNames })
}

// Eligibility is intentionally syntactic and uses the original Program and its
// binding records. In particular, references in nested calls or arbitrary
// functions are not export-getter roles and cannot select a statement.
export function inspectExportGetterStatement({ program, node, bindingAt }) {
  if (program?.type !== 'Program' || !Array.isArray(program.body) || !program.body.includes(node) ||
      !(bindingAt instanceof WeakMap)) return null
  return exportGetterShape(node, bindingAt)
}

function exportGetterShape(node, bindingAt) {
  if (node?.type !== 'ExpressionStatement') return null
  const call = node.expression
  if (call?.type !== 'CallExpression' || call.optional !== false || call.callee?.type !== 'Identifier' ||
      !Array.isArray(call.arguments) || call.arguments.length !== 2 || call.arguments[0]?.type !== 'Identifier') return null
  const object = call.arguments[1]
  if (object?.type !== 'ObjectExpression' || !Array.isArray(object.properties) || !object.properties.length) return null
  const keys = new Set(), getters = []
  for (const property of object.properties) {
    if (property?.type !== 'Property' || property.kind !== 'init' || property.computed !== false ||
        property.method !== false || property.shorthand !== false) return null
    const key = property.key
    let observableKey
    if (key?.type === 'Identifier') observableKey = key.name
    else if (key?.type === 'Literal' && (typeof key.value === 'string' || typeof key.value === 'number' ||
        typeof key.value === 'bigint')) observableKey = String(key.value)
    else return null
    if (keys.has(observableKey)) return null
    keys.add(observableKey)
    const getter = property.value
    if (getter?.type !== 'ArrowFunctionExpression' || getter.async !== false || getter.generator !== false ||
        getter.expression !== true || !Array.isArray(getter.params) || getter.params.length || getter.body?.type !== 'Identifier') return null
    const binding = bindingAt.get(getter.body)
    if (!binding || Array.isArray(binding) || !binding.v?.references?.some(reference =>
      reference.identifier === getter.body && reference.resolved === binding.v)) return null
    getters.push({ binding, identifier: getter.body, observableKey })
  }
  return { node, getters }
}

// Count every eligible getter occurrence BEFORE testing a counterpart's shape.
// Two references to a binding are ambiguous even if only one table would match.
export function indexExportGetterStatements({ program, bindingAt }) {
  const byBinding = new Map(), statements = []
  if (program?.type !== 'Program' || !Array.isArray(program.body) || !(bindingAt instanceof WeakMap)) return { byBinding, statements }
  for (const node of program.body) {
    const statement = exportGetterShape(node, bindingAt)
    if (!statement) continue
    statements.push(statement)
    for (const getter of statement.getters) {
      const occurrences = byBinding.get(getter.binding) ?? []
      occurrences.push({ ...getter, statement: node })
      byBinding.set(getter.binding, occurrences)
    }
  }
  return { byBinding, statements }
}

// The whole statement is compared, not just the selecting getter. Its caller
// must independently establish reciprocal statement correspondence, reconcile
// the entire proposal group atomically, and retain the final program gates.
export function deriveExportGetterBindingConstraints({
  leftProgram, rightProgram, leftNode, rightNode,
  leftBindingAt, rightBindingAt, leftRuntimeNames, rightRuntimeNames,
}) {
  if (!inspectExportGetterStatement({ program: leftProgram, node: leftNode, bindingAt: leftBindingAt }) ||
      !inspectExportGetterStatement({ program: rightProgram, node: rightNode, bindingAt: rightBindingAt })) {
    return reject('Original top-level export-getter statements are required')
  }
  return deriveNodeConstraints({ leftNode, rightNode, leftBindingAt, rightBindingAt, leftRuntimeNames, rightRuntimeNames })
}

function deriveNodeConstraints({
  leftNode, rightNode, leftBindingAt, rightBindingAt, leftRuntimeNames, rightRuntimeNames,
}) {
  if (!(leftBindingAt instanceof WeakMap) || !(rightBindingAt instanceof WeakMap) ||
      !(leftRuntimeNames instanceof WeakSet) || !(rightRuntimeNames instanceof WeakSet)) {
    return reject('Whole-program binding maps and runtime-name sets are required')
  }
  const leftToRight = new Map(), rightToLeft = new Map(), pairs = [], pairsByLeft = new Map()
  const pending = [{ left: leftNode, right: rightNode, path: '$' }]
  while (pending.length) {
    const { left, right, path } = pending.pop()
    const at = path.slice(0, 240)
    if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
      if (!Object.is(left, right)) return reject(`Non-name AST value differs at ${at}`)
      continue
    }
    if (left instanceof RegExp || right instanceof RegExp) {
      if (!(left instanceof RegExp) || !(right instanceof RegExp) || left.source !== right.source || left.flags !== right.flags) return reject(`Regular expression differs at ${at}`)
      continue
    }
    if (Array.isArray(left) || Array.isArray(right)) {
      if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return reject(`AST array shape differs at ${at}`)
      for (let index = left.length - 1; index >= 0; index--) {
        if (Object.hasOwn(left, index) !== Object.hasOwn(right, index)) return reject(`AST array hole differs at ${at}[${index}]`)
        pending.push({ left: left[index], right: right[index], path: `${path}[${index}]` })
      }
      continue
    }
    if (left.type !== right.type) return reject(`AST node type differs at ${at}`)
    const identifier = left.type === 'Identifier'
    if (identifier) {
      if (typeof left.name !== 'string' || typeof right.name !== 'string') return reject(`Invalid identifier at ${at}`)
      if ((leftRuntimeNames.has(left) || rightRuntimeNames.has(right)) && left.name !== right.name) return reject(`Observable identifier name differs at ${at}`)
      const leftOwners = identifierOwners(leftBindingAt.get(left), left), rightOwners = identifierOwners(rightBindingAt.get(right), right)
      if (!leftOwners || !rightOwners) return reject(`Unsupported shared identifier ownership at ${at}`)
      if (Boolean(leftOwners.length) !== Boolean(rightOwners.length)) return reject(`Resolved/unresolved identifier roles differ at ${at}`)
      if (leftOwners.length !== rightOwners.length) return reject(`Resolved binding ownership count differs at ${at}`)
      if (!leftOwners.length) {
        if (left.name !== right.name) return reject(`Unresolved identifier name differs at ${at}`)
      } else for (let owner = 0; owner < leftOwners.length; owner++) {
        const leftBinding = leftOwners[owner], rightBinding = rightOwners[owner]
        const leftScope = leftBinding.scope?.type, rightScope = rightBinding.scope?.type
        if (leftScope !== rightScope) return reject(`Resolved binding scope category differs at ${at}`)
        if ((leftToRight.has(leftBinding) && leftToRight.get(leftBinding) !== rightBinding) ||
            (rightToLeft.has(rightBinding) && rightToLeft.get(rightBinding) !== leftBinding)) {
          return reject(`Resolved binding pairs are not reciprocal at ${at}`)
        }
        if (!leftToRight.has(leftBinding)) {
          leftToRight.set(leftBinding, rightBinding)
          rightToLeft.set(rightBinding, leftBinding)
          const pair = { left: leftBinding, right: rightBinding, leftIdentifier: left, rightIdentifier: right }
          pairs.push(pair); pairsByLeft.set(leftBinding, pair)
        }
        // The caller must discard this complete fragment's proposals if either
        // shared owner conflicts anywhere in the original aggregate round.
        if (leftOwners.length === 2) pairsByLeft.get(leftBinding).sharedClassOwner = true
      }
    }
    const keys = object => Object.keys(object).filter(key => !POSITIONS.has(key) &&
      !(identifier && key === 'name') && !(left.type === 'Literal' && key === 'raw')).sort()
    const leftKeys = keys(left), rightKeys = keys(right)
    if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) return reject(`Non-name AST fields differ at ${at}`)
    for (let index = leftKeys.length - 1; index >= 0; index--) {
      const key = leftKeys[index]
      pending.push({ left: left[key], right: right[key], path: `${path}.${key}` })
    }
  }
  return { accepted: true, pairs, semanticEquivalenceEstablished: false }
}
