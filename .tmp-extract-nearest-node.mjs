import fs from 'node:fs'
import { parse } from './recovery/node_modules/acorn/dist/acorn.mjs'

const [filename, needle] = process.argv.slice(2)
if (!filename || !needle) {
  throw new Error('usage: node .tmp-extract-nearest-node.mjs FILE NEEDLE')
}

const source = fs.readFileSync(filename, 'utf8')
const ast = parse(source, {
  ecmaVersion: 'latest',
  sourceType: 'module',
  allowHashBang: true,
})
const enclosingTypes = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'VariableDeclaration',
  'MethodDefinition',
])
const matches = []

function walk(node, ancestors = []) {
  if (!node || typeof node !== 'object') return
  const matched =
    (needle.startsWith('id:') &&
      node.type === 'Identifier' &&
      node.name === needle.slice(3)) ||
    (node.type === 'Literal' &&
      typeof node.value === 'string' &&
      node.value.includes(needle)) ||
    (node.type === 'TemplateElement' &&
      node.value?.cooked?.includes(needle))
  if (matched) {
    const enclosing = [...ancestors]
      .reverse()
      .find(parent => enclosingTypes.has(parent.type))
    if (enclosing && !matches.some(item => item.start === enclosing.start)) {
      matches.push(enclosing)
    }
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'start' || key === 'end' || key === 'loc') continue
    if (Array.isArray(value)) {
      for (const child of value) walk(child, [...ancestors, node])
    } else if (value && typeof value === 'object' && value.type) {
      walk(value, [...ancestors, node])
    }
  }
}
walk(ast)

for (const match of matches) {
  process.stdout.write(`/* ${match.type} ${match.start}:${match.end} */\n`)
  process.stdout.write(`${source.slice(match.start, match.end)}\n`)
}
