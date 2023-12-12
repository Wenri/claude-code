#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import {
  accountGeneratedDelta,
  encodeStructuralLedger,
} from '../lib/structural-delta.mjs'

function usage() {
  console.error(
    'Usage: account-generated-delta.mjs --baseline BUNDLE ' +
      '--target BUNDLE --output REPORT.json[.gz]',
  )
}

function parseArguments(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument.startsWith('--')) {
      throw new Error(`Unexpected argument: ${argument}`)
    }
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}`)
    }
    result[argument.slice(2)] = value
    index += 1
  }
  return result
}

function main() {
  const args = parseArguments(process.argv.slice(2))
  if (!args.baseline || !args.target || !args.output) {
    usage()
    process.exitCode = 2
    return
  }
  console.error('Indexing parseable top-level units...')
  const report = accountGeneratedDelta(
    path.resolve(args.baseline),
    path.resolve(args.target),
  )
  const output = path.resolve(args.output)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(
    output,
    encodeStructuralLedger(report, { gzip: output.endsWith('.gz') }),
  )
  console.error(
    `Wrote ${report.coverage.units.total} target units: ` +
      `${report.coverage.units.matched} matched, ` +
      `${report.coverage.units.moved} moved, ` +
      `${report.coverage.units.changed} changed, ` +
      `${report.coverage.units.unresolved} unresolved`,
  )
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
}
