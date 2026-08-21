import fs from 'node:fs'
import path from 'node:path'
import { parse } from './recovery/node_modules/acorn/dist/acorn.mjs'

const sourceRoot = '.recovery-tmp/semantic-trees/2.1.119/src'
const fixture = JSON.parse(
  fs.readFileSync(
    'recovery/test/recovery-2.1.119-nondaemon-static-owner-proofs.json',
  ),
)

function flags(value) {
  return [...value].sort().join('')
}

function identity(kind, value) {
  return JSON.stringify([
    kind,
    kind === 'regexp'
      ? { pattern: value.pattern, flags: flags(value.flags) }
      : value,
  ])
}

function walk(node, visit) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (typeof node.type === 'string') visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
      walk(child, visit)
    }
  }
}

function values(source) {
  const output = new Set()
  const add = (kind, value) => output.add(identity(kind, value))
  walk(
    parse(source, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    }),
    node => {
      if (node.type === 'Literal' && node.regex) add('regexp', node.regex)
      else if (node.type === 'Literal' && typeof node.value === 'string') {
        add('string', node.value)
      } else if (node.type === 'Literal' && typeof node.value === 'number') {
        add('number', String(node.value))
      } else if (node.type === 'TemplateElement') {
        add('string', node.value?.cooked ?? node.value?.raw)
      }
      const property =
        ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(
          node.type,
        ) &&
        node.computed === false &&
        node.key?.type === 'Identifier'
          ? node.key.name
          : node.type === 'MemberExpression' &&
              node.computed === false &&
              node.property?.type === 'Identifier'
            ? node.property.name
            : undefined
      if (property !== undefined) add('property', property)
    },
  )
  return output
}

const audits = new Map()
for (const relative of new Set(fixture.rows.map(row => row.sourceOwner.slice(4)))) {
  const filename = path.join(sourceRoot, relative)
  const source = fs.readFileSync(filename, 'utf8')
  const transpiler = new Bun.Transpiler({
    loader: filename.endsWith('.tsx') ? 'tsx' : 'ts',
    target: 'bun',
  })
  const output = transpiler.transformSync(source)
  audits.set(relative, { output, values: values(output) })
}

const result = { matched: 0, unmatched: 0, byUnit: [] }
for (const row of fixture.rows) {
  const audit = audits.get(row.sourceOwner.slice(4))
  const unmatched = []
  const matched = []
  for (const residue of row.residues) {
    if (residue.representation !== 'authenticated-target-static-ast') continue
    const key = identity(residue.kind, residue.value)
    if (audit.values.has(key)) {
      result.matched += 1
      matched.push([residue.kind, residue.value, residue.start, residue.end])
    }
    else {
      result.unmatched += 1
      unmatched.push([residue.kind, residue.value, residue.start, residue.end])
    }
  }
  if (matched.length > 0 || unmatched.length > 0) {
    result.byUnit.push({
      targetIndex: row.targetIndex,
      owner: row.sourceOwner,
      matched,
      unmatched,
    })
  }
}
console.log(JSON.stringify(result, null, 2))
