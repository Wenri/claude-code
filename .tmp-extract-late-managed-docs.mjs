import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { parse } from './recovery/node_modules/acorn/dist/acorn.mjs'

const selections = [
  ['SKILL.md', '# Building LLM-Powered Applications with Claude'],
  ['shared/live-sources.md', '# Live Documentation Sources'],
  ['shared/managed-agents-api-reference.md', '# Managed Agents — Endpoint Reference'],
  ['INLINE_READING_GUIDE.md', '## Reference Documentation'],
  ['TRIGGER.txt', 'TRIGGER when:', 'includes'],
]

function literals(source) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const result = []
  const stack = [ast]
  while (stack.length > 0) {
    const node = stack.pop()
    if (!node || typeof node !== 'object') continue
    if (node.type === 'Literal' && typeof node.value === 'string') {
      result.push(node.value)
    } else if (node.type === 'TemplateElement' && typeof node.value?.cooked === 'string') {
      result.push(node.value.cooked)
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'start' || key === 'end' || key === 'loc') continue
      if (Array.isArray(value)) {
        for (let index = value.length - 1; index >= 0; index -= 1) {
          if (value[index] && typeof value[index] === 'object') stack.push(value[index])
        }
      } else if (value && typeof value === 'object' && value.type) {
        stack.push(value)
      }
    }
  }
  return result
}

for (const version of [107, 108, 111, 116]) {
  const suffix = version >= 113 ? 'inner' : 'cli'
  const source = fs.readFileSync(
    `/tmp/recovery-semantic-late-b/2.1.${version}.${suffix}.js`,
    'utf8',
  )
  const values = literals(source)
  const output = `/tmp/recovery-semantic-late-b/managed-docs-2.1.${version}`
  for (const [relative, prefix, mode = 'startsWith'] of selections) {
    const matches = values.filter(value =>
      mode === 'includes' ? value.includes(prefix) : value.startsWith(prefix),
    )
    if (matches.length !== 1) {
      throw new Error(`2.1.${version} ${relative}: expected one literal, got ${matches.length}`)
    }
    const value = matches[0]
    const filename = path.join(output, relative)
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, value)
    process.stdout.write(
      `2.1.${version} ${relative} ${Buffer.byteLength(value)} bytes ${value.length} chars ${crypto.createHash('sha256').update(value).digest('hex')}\n`,
    )
  }
}

if (process.argv.includes('--install-current')) {
  for (const relative of [
    'SKILL.md',
    'shared/live-sources.md',
    'shared/managed-agents-api-reference.md',
  ]) {
    fs.copyFileSync(
      path.join('/tmp/recovery-semantic-late-b/managed-docs-2.1.116', relative),
      path.join('src/skills/bundled/claude-api', relative),
    )
  }
}
