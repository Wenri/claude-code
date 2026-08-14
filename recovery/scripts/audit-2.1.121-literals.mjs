#!/usr/bin/env node

import fs from 'node:fs'
import { parse } from 'acorn'

const [baselinePath, targetPath, outputPath] = process.argv.slice(2)
if (!baselinePath || !targetPath || !outputPath) {
  throw new Error('Usage: audit-2.1.121-literals.mjs BASELINE TARGET OUTPUT')
}

function collect(filename) {
  const source = fs.readFileSync(filename, 'utf8')
  const ast = parse(source, {
    ecmaVersion: 'latest',
    locations: true,
    sourceType: 'module',
  })
  const values = new Map()
  const stack = [ast]
  while (stack.length > 0) {
    const node = stack.pop()
    if (!node || typeof node !== 'object') continue
    if (node.type === 'Literal' && typeof node.value === 'string') {
      const current = values.get(node.value) ?? { count: 0, locations: [] }
      current.count += 1
      if (current.locations.length < 8) {
        current.locations.push({
          line: node.loc.start.line,
          column: node.loc.start.column,
          start: node.start,
        })
      }
      values.set(node.value, current)
    } else if (node.type === 'TemplateElement') {
      const value = node.value.cooked
      if (typeof value === 'string') {
        const current = values.get(value) ?? { count: 0, locations: [] }
        current.count += 1
        if (current.locations.length < 8) {
          current.locations.push({
            line: node.loc.start.line,
            column: node.loc.start.column,
            start: node.start,
          })
        }
        values.set(value, current)
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc' || key === 'start' || key === 'end') continue
      if (Array.isArray(value)) {
        for (let index = value.length - 1; index >= 0; index -= 1) {
          if (value[index]?.type) stack.push(value[index])
        }
      } else if (value?.type) {
        stack.push(value)
      }
    }
  }
  return values
}

const baseline = collect(baselinePath)
const target = collect(targetPath)
const values = new Set([...baseline.keys(), ...target.keys()])
const rows = []
for (const value of values) {
  const before = baseline.get(value)
  const after = target.get(value)
  const baselineCount = before?.count ?? 0
  const targetCount = after?.count ?? 0
  if (baselineCount === targetCount) continue
  rows.push({
    value,
    baselineCount,
    targetCount,
    delta: targetCount - baselineCount,
    baselineLocations: before?.locations ?? [],
    targetLocations: after?.locations ?? [],
  })
}
rows.sort((left, right) => {
  if (left.targetCount === 0 && right.targetCount !== 0) return 1
  if (left.targetCount !== 0 && right.targetCount === 0) return -1
  return right.value.length - left.value.length || left.value.localeCompare(right.value)
})
fs.writeFileSync(outputPath, `${JSON.stringify({ rows }, null, 2)}\n`)
console.log(JSON.stringify({ changedLiteralRows: rows.length }))
