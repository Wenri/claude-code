#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_MARKETPLACE_CACHE_PATH_INPUT_FILE = Object.freeze({
  path: 'src/utils/plugins/marketplaceManager.ts',
  bytes: 94088,
  sha256: '5084bdc593ba7cbb33320f6de1cd200e36cba444ab37479d05ea48c50bc020a0',
})

export const TARGET117_MARKETPLACE_CACHE_PATH_OUTPUT_FILE = Object.freeze({
  path: 'src/utils/plugins/marketplaceManager.ts',
  bytes: 94174,
  sha256: '65fd661ac83fb2e90569dd363f88104116faabac99eff72634bd121f79b39231',
})

const TARGET_FRAGMENT_EVIDENCE =
  'target117-marketplace-cache-path-target-fragment'
const BASELINE_FRAGMENT_EVIDENCE =
  'target116-marketplace-cache-path-baseline-fragment'
const REPLAY_EVIDENCE = 'target117-marketplace-cache-path-source-replay-test'

export const TARGET117_MARKETPLACE_CACHE_PATH_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:13991`,
    targetIndex: 13991,
    paths: Object.freeze(['src/utils/plugins/marketplaceManager.ts']),
    declarations: Object.freeze(['getCachePathForSource']),
    evidenceIds: Object.freeze([
      TARGET_FRAGMENT_EVIDENCE,
      BASELINE_FRAGMENT_EVIDENCE,
      REPLAY_EVIDENCE,
    ]),
    behavior:
      'Target117 normalizes every GitHub/npm slash, replaces non-portable cache-name characters, and falls back to a timestamp name if sanitization produces the empty string.',
  }),
])

const CACHE_PATH_INPUT = `function getCachePathForSource(source: MarketplaceSource): string {
  const tempName =
    source.source === 'github'
      ? source.repo.replace('/', '-')
      : source.source === 'npm'
        ? source.package.replace('@', '').replace('/', '-')
        : source.source === 'file'
          ? basename(source.path).replace('.json', '')
          : source.source === 'directory'
            ? basename(source.path)
            : 'temp_' + Date.now()
  return tempName
}`

const CACHE_PATH_OUTPUT = `function getCachePathForSource(source: MarketplaceSource): string {
  const tempName = (
    source.source === 'github'
      ? source.repo.replaceAll('/', '-')
      : source.source === 'npm'
        ? source.package.replace('@', '').replaceAll('/', '-')
        : source.source === 'file'
          ? basename(source.path).replace('.json', '')
          : source.source === 'directory'
            ? basename(source.path)
            : 'temp_' + Date.now()
  ).replace(/[^a-zA-Z0-9\\-_]/g, '-')
  return tempName === '' ? 'temp_' + Date.now() : tempName
}`

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function descriptorsEqual(left, right) {
  return left.bytes === right.bytes && left.sha256 === right.sha256
}

function replaceExactlyOnce(source, before, after) {
  const first = source.indexOf(before)
  if (first === -1 || source.indexOf(before, first + before.length) !== -1) {
    throw new Error('marketplace cache path: expected exactly one input declaration')
  }
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`
}

function sourceFilename(sourceRoot) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(
    root,
    TARGET117_MARKETPLACE_CACHE_PATH_INPUT_FILE.path.slice(4),
  )
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error('marketplace cache path escapes the supplied source root')
  }
  return filename
}

export function applyTarget117MarketplaceCachePathSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const filename = sourceFilename(sourceRoot)
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(
      `${TARGET117_MARKETPLACE_CACHE_PATH_INPUT_FILE.path}: expected a real source file`,
    )
  }
  const input = fs.readFileSync(filename)
  const actual = descriptor(input)
  if (descriptorsEqual(actual, TARGET117_MARKETPLACE_CACHE_PATH_OUTPUT_FILE)) {
    return Object.freeze({
      caseName: CASE_NAME,
      status: 'already-recovered',
      file: TARGET117_MARKETPLACE_CACHE_PATH_OUTPUT_FILE,
      ownerOverrides: TARGET117_MARKETPLACE_CACHE_PATH_OWNER_OVERRIDES.length,
    })
  }
  if (!descriptorsEqual(actual, TARGET117_MARKETPLACE_CACHE_PATH_INPUT_FILE)) {
    throw new Error(
      `Refusing non-target marketplace cache path recovery: ${actual.bytes}/${actual.sha256}`,
    )
  }

  const output = Buffer.from(
    replaceExactlyOnce(input.toString('utf8'), CACHE_PATH_INPUT, CACHE_PATH_OUTPUT),
  )
  const recovered = descriptor(output)
  if (!descriptorsEqual(recovered, TARGET117_MARKETPLACE_CACHE_PATH_OUTPUT_FILE)) {
    throw new Error(
      `Recovered marketplace cache path descriptor mismatch: ${recovered.bytes}/${recovered.sha256}`,
    )
  }
  fs.writeFileSync(filename, output)
  const written = descriptor(fs.readFileSync(filename))
  if (!descriptorsEqual(written, TARGET117_MARKETPLACE_CACHE_PATH_OUTPUT_FILE)) {
    throw new Error(
      `Written marketplace cache path descriptor mismatch: ${written.bytes}/${written.sha256}`,
    )
  }
  return Object.freeze({
    caseName: CASE_NAME,
    status: 'recovered',
    file: TARGET117_MARKETPLACE_CACHE_PATH_OUTPUT_FILE,
    ownerOverrides: TARGET117_MARKETPLACE_CACHE_PATH_OWNER_OVERRIDES.length,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = applyTarget117MarketplaceCachePathSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
