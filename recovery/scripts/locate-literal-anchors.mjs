#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { locateExactLiteralAnchors } from '../lib/literal-anchor-locator.mjs'

function usage() {
  console.error(
    'Usage: locate-literal-anchors.mjs --baseline BUNDLE --target BUNDLE ' +
      '--output REPORT.json [--min-literal-length N] [--preview-length N]',
  )
}

function parseArguments(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--help' || argument === '-h') {
      result.help = true
      continue
    }
    if (!argument.startsWith('--')) {
      throw new Error(`Unexpected argument: ${argument}`)
    }
    const key = argument.slice(2)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}`)
    }
    result[key] = value
    index += 1
  }
  return result
}

function parseNonNegativeInteger(value, flag, defaultValue, positive) {
  if (value === undefined) return defaultValue
  const parsed = Number.parseInt(value, 10)
  if (
    !Number.isInteger(parsed) ||
    (positive ? parsed < 1 : parsed < 0) ||
    String(parsed) !== value
  ) {
    throw new Error(
      `${flag} must be ${positive ? 'a positive' : 'a non-negative'} integer`,
    )
  }
  return parsed
}

function main() {
  const args = parseArguments(process.argv.slice(2))
  if (args.help) {
    usage()
    return
  }
  if (!args.baseline || !args.target || !args.output) {
    usage()
    process.exitCode = 2
    return
  }

  const minimumLiteralLength = parseNonNegativeInteger(
    args['min-literal-length'],
    '--min-literal-length',
    8,
    true,
  )
  const previewLength = parseNonNegativeInteger(
    args['preview-length'],
    '--preview-length',
    120,
    false,
  )

  console.error('Scanning baseline and target token streams...')
  const report = locateExactLiteralAnchors(
    path.resolve(args.baseline),
    path.resolve(args.target),
    {
      minimumLiteralLength,
      previewLength,
    },
  )

  const output = path.resolve(args.output)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  console.error(
    `Wrote ${report.summary.uniqueCommonAnchorCount} exact anchors ` +
      `(${report.summary.monotoneAnchorCount} monotone) and ` +
      `${report.summary.partitionCount} partitions to ${output}`,
  )
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
}

