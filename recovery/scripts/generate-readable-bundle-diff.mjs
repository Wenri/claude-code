#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import v8 from 'node:v8'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { generateReadableBundleDiff } from '../readable-diff/generator.mjs'

function usage() {
  console.error(
    'Usage: generate-readable-bundle-diff.mjs ' +
      '--baseline BASELINE.js --target TARGET.js --output DIR ' +
      '[--expected-baseline-sha256 HASH] [--expected-target-sha256 HASH] ' +
      '[--retain-intermediates true]',
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
    if (!value || value.startsWith('--')) {
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
  const largeInput =
    fs.statSync(args.baseline).size > 5 * 1024 * 1024 ||
    fs.statSync(args.target).size > 5 * 1024 * 1024
  const heapLimit = v8.getHeapStatistics().heap_size_limit
  if (largeInput && heapLimit < 6 * 1024 * 1024 * 1024) {
    console.error(
      'Restarting with an 8 GiB JavaScript heap for whole-bundle scope analysis',
    )
    const result = spawnSync(
      process.execPath,
      [
        '--max-old-space-size=8192',
        fileURLToPath(import.meta.url),
        ...process.argv.slice(2),
      ],
      { stdio: 'inherit' },
    )
    if (result.error) throw result.error
    process.exitCode = result.status ?? 1
    return
  }
  const metadata = generateReadableBundleDiff({
    baselinePath: path.resolve(args.baseline),
    expectedBaselineSha256: args['expected-baseline-sha256'],
    expectedTargetSha256: args['expected-target-sha256'],
    outputPath: path.resolve(args.output),
    progress(message) {
      console.error(`${message}...`)
    },
    retainIntermediates: args['retain-intermediates'] === 'true',
    targetPath: path.resolve(args.target),
  })
  console.log(
    JSON.stringify(
      {
        matching: metadata.matching,
        output: path.resolve(args.output),
        renames: {
          accepted: metadata.renames.accepted,
          edits: metadata.renames.edits,
          rejected: metadata.renames.rejected,
        },
        comparisonInvariantHashesEqual:
          metadata.verification.comparisonInvariantHashesEqual,
      },
      null,
      2,
    ),
  )
}

main()
