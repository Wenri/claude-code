#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

function usage() {
  console.error(
    'Usage: extract-changelog-section.mjs --input CHANGELOG.md ' +
      '--version VERSION --output SECTION.md',
  )
}

function parseArguments(argv) {
  const result = {}
  const allowed = new Set(['input', 'version', 'output'])
  for (let index = 0; index < argv.length; index += 2) {
    const argument = argv[index]
    const value = argv[index + 1]
    if (!argument?.startsWith('--') || value === undefined) {
      usage()
      throw new Error('Every option must have a value')
    }
    const key = argument.slice(2)
    if (!allowed.has(key)) throw new Error(`Unknown option: ${argument}`)
    if (result[key] !== undefined) {
      throw new Error(`Duplicate option: ${argument}`)
    }
    result[key] = value
  }
  return result
}

function main() {
  const args = parseArguments(process.argv.slice(2))
  if (!args.input || !args.version || !args.output) {
    usage()
    process.exitCode = 2
    return
  }
  if (!/^\d+\.\d+\.\d+$/.test(args.version)) {
    throw new Error(`Invalid version: ${args.version}`)
  }
  const input = fs.readFileSync(path.resolve(args.input), 'utf8')
  const heading = `## ${args.version}\n`
  const start = input.indexOf(heading)
  if (start < 0) throw new Error(`Changelog has no ${args.version} section`)
  if (start !== input.lastIndexOf(heading)) {
    throw new Error(`Changelog has duplicate ${args.version} sections`)
  }
  const next = input.indexOf('\n## ', start + heading.length)
  const section = input.slice(start, next < 0 ? input.length : next + 1)
  if (!section.endsWith('\n')) {
    throw new Error('Extracted changelog section has no final newline')
  }
  const bulletCount = section.split('\n').filter(line => line.startsWith('- ')).length
  if (bulletCount === 0) throw new Error('Extracted section has no bullets')
  const output = path.resolve(args.output)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, section)
  console.log(JSON.stringify({ version: args.version, bulletCount }))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
}
