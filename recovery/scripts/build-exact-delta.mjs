#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function usage() {
  console.error(
    'Usage: build-exact-delta.mjs --baseline FILE --target FILE ' +
      '--output FILE [--expected-baseline-sha256 HEX] ' +
      '[--expected-target-sha256 HEX]',
  )
}

function parseArguments(argv) {
  const result = {}
  const allowed = new Set([
    'baseline',
    'target',
    'output',
    'expected-baseline-sha256',
    'expected-target-sha256',
  ])
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument.startsWith('--')) {
      throw new Error(`Unexpected argument: ${argument}`)
    }
    const key = argument.slice(2)
    if (!allowed.has(key)) throw new Error(`Unknown argument: ${argument}`)
    if (result[key] !== undefined) {
      throw new Error(`Duplicate argument: ${argument}`)
    }
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}`)
    }
    result[key] = value
    index += 1
  }
  return result
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function fileEvidence(filename) {
  const value = fs.readFileSync(filename)
  return {
    bytes: value.length,
    sha256: sha256(value),
  }
}

function runZstd(arguments_, label) {
  const result = spawnSync('zstd', arguments_, {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `${label} failed (${result.status}): ${result.stderr || result.stdout}`,
    )
  }
  return result
}

function assertExpected(evidence, expected, label) {
  if (expected && evidence.sha256 !== expected) {
    throw new Error(
      `${label}: expected SHA-256 ${expected}, got ${evidence.sha256}`,
    )
  }
}

function verifyPatch(baseline, target, patch) {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'claude-code-exact-delta-'),
  )
  const reconstructed = path.join(temporary, 'reconstructed.js')
  try {
    runZstd(
      [
        '-d',
        `--patch-from=${baseline}`,
        patch,
        '-o',
        reconstructed,
        '--force',
      ],
      'Zstandard patch reconstruction',
    )
    const expected = fs.readFileSync(target)
    const actual = fs.readFileSync(reconstructed)
    if (!actual.equals(expected)) {
      throw new Error('Zstandard patch did not reconstruct the target bytes')
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
}

function main() {
  const args = parseArguments(process.argv.slice(2))
  if (!args.baseline || !args.target || !args.output) {
    usage()
    process.exitCode = 2
    return
  }

  const baseline = path.resolve(args.baseline)
  const target = path.resolve(args.target)
  const output = path.resolve(args.output)
  const baselineEvidence = fileEvidence(baseline)
  const targetEvidence = fileEvidence(target)
  assertExpected(
    baselineEvidence,
    args['expected-baseline-sha256'],
    'baseline',
  )
  assertExpected(targetEvidence, args['expected-target-sha256'], 'target')

  fs.mkdirSync(path.dirname(output), { recursive: true })
  if (!fs.existsSync(output)) {
    const temporary = `${output}.part-${process.pid}`
    try {
      runZstd(
        [
          `--patch-from=${baseline}`,
          target,
          '-o',
          temporary,
          '--force',
        ],
        'Zstandard patch creation',
      )
      verifyPatch(baseline, target, temporary)
      fs.renameSync(temporary, output)
    } finally {
      if (fs.existsSync(temporary)) fs.rmSync(temporary)
    }
  }

  verifyPatch(baseline, target, output)
  const version = runZstd(['--version'], 'Zstandard version query')
  const report = {
    status: 'exact-delta-verified',
    algorithm: 'zstd-dictionary-patch',
    tool: version.stdout.trim(),
    baseline: baselineEvidence,
    target: targetEvidence,
    delta: fileEvidence(output),
    reconstructionSha256: targetEvidence.sha256,
  }
  console.log(JSON.stringify(report, null, 2))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
}
