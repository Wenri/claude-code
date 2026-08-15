import fs from 'node:fs'
import { parse } from './recovery/node_modules/acorn/dist/acorn.mjs'

const [filename, indexText] = process.argv.slice(2)
const source = fs.readFileSync(filename, 'utf8')
const ast = parse(source, {
  allowHashBang: true,
  ecmaVersion: 'latest',
  sourceType: 'module',
})
function unitRecord(unit, index) {
  if (!unit) throw new Error(`No top-level unit ${index}`)
  const values = []
  function walk(node) {
  if (!node || typeof node !== 'object') return
  if (node.type === 'Literal' && typeof node.value === 'string') {
    values.push(node.value)
  } else if (node.type === 'TemplateElement') {
    values.push(node.value.cooked ?? node.value.raw)
  }
    for (const [key, value] of Object.entries(node)) {
      if (['end', 'loc', 'raw', 'start'].includes(key)) continue
      if (Array.isArray(value)) value.forEach(walk)
      else if (value && typeof value === 'object') walk(value)
    }
  }
  walk(unit)
  return {
    end: unit.end,
    index,
    source: source.slice(unit.start, unit.end),
    start: unit.start,
    values,
  }
}
const [startText, endText] = indexText.split(':')
const start = Number(startText)
const end = endText === undefined ? start : Number(endText)
const records = []
for (let index = start; index <= end; index += 1) {
  records.push(unitRecord(ast.body[index], index))
}
process.stdout.write(JSON.stringify(records.length === 1 ? records[0] : records))
