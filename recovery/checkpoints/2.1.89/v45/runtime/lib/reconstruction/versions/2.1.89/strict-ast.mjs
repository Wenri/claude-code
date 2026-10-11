import crypto from 'node:crypto'
import { parse } from 'acorn'

// A deliberately conservative whole-Program comparison. Only source positions
// and literal spelling are erased. Names, order, directives, property keys,
// operators, scope structure and all AST fields remain significant.
export function strictAstDigest(source) {
  const ast = parse(source, { ecmaVersion: 2026, sourceType: 'module', allowHashBang: true })
  return digestParsedAst(ast)
}

// Validate the complete module before inventorying its statements. A local
// export can reference another statement, so reparsing an isolated export would
// wrongly reject valid source. Preserve the validated node (including directive
// context) inside a synthetic Program; never relax undeclared-export validation.
export function strictAstInventory(source) {
  const ast = parse(source, { ecmaVersion: 2026, sourceType: 'module', allowHashBang: true })
  return {
    ast,
    strictAst: digestParsedAst(ast),
    statements: ast.body.map((node, index) => ({
      index, type: node.type, range: [node.start, node.end],
      ...digestParsedAst({ ...ast, body: [node] }),
    })),
  }
}

function digestParsedAst(ast) {
  const hash = crypto.createHash('sha256')
  let nodes = 0
  function visit(value) {
    if (value === null) { hash.update('null;'); return }
    if (Array.isArray(value)) {
      hash.update('[')
      for (const child of value) visit(child)
      hash.update(']')
    } else if (value instanceof RegExp) {
      visit({ pattern: value.source, flags: value.flags })
    } else if (typeof value === 'object') {
      if (typeof value.type === 'string') nodes += 1
      hash.update('{')
      for (const key of Object.keys(value).sort()) {
        if (['start', 'end', 'loc', 'range'].includes(key)) continue
        // Tagged templates observe TemplateElement.value.raw. Only ordinary
        // Literal spelling is redundant with its parsed value/regex/bigint.
        if (key === 'raw' && value.type === 'Literal') continue
        hash.update(JSON.stringify(key) + ':')
        visit(value[key])
      }
      hash.update('}')
    } else {
      const text = typeof value === 'bigint' ? value.toString() :
        typeof value === 'number' && !Number.isFinite(value) ? String(value) : JSON.stringify(value)
      hash.update(`${typeof value}:${text};`)
    }
  }
  visit(ast)
  return { criterion: 'strict-whole-program-ast-v2', parser: 'acorn@8.15.0', ecmaVersion: 2026, nodes, sha256: hash.digest('hex') }
}
