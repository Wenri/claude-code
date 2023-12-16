#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_SEARCH_BOX_PREFIX_COLOR_INPUT_FILE = Object.freeze({
  path: 'src/components/SearchBox.tsx',
  bytes: 9421,
  sha256: 'ee45b2a89f0e04b3894aecbe61e0f73d1f24893aba5bafeb2f1c3594edee81b1',
})

export const TARGET117_SEARCH_BOX_PREFIX_COLOR_OUTPUT_FILE = Object.freeze({
  path: 'src/components/SearchBox.tsx',
  bytes: 3630,
  sha256: 'ab7cb597e9c70452afcbd6dc6f8156503f43bdb34d849deabf587cf210f2dd25',
})

export const TARGET117_SEARCH_BOX_PREFIX_COLOR_DONOR_FILE = Object.freeze({
  path: 'recovery/cases/2.1.116-to-2.1.117/recovered/SearchBox.target117.tsx',
  bytes: 3630,
  sha256: 'ab7cb597e9c70452afcbd6dc6f8156503f43bdb34d849deabf587cf210f2dd25',
})

const TARGET_FRAGMENT_EVIDENCE =
  'target117-search-box-prefix-color-target-fragment'
const REPLAY_EVIDENCE = 'target117-search-box-prefix-color-source-replay-test'

export const TARGET117_SEARCH_BOX_PREFIX_COLOR_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:15456`,
    targetIndex: 15456,
    paths: Object.freeze(['src/components/SearchBox.tsx']),
    declarations: Object.freeze(['SearchBox', 'renderSearchBoxQuery']),
    evidenceIds: Object.freeze([TARGET_FRAGMENT_EVIDENCE, REPLAY_EVIDENCE]),
    behavior:
      'The complete authenticated Target117 SearchBox function owns prefixColor: it destructures the prop and passes it only to the nested prefix Text while preserving prefixDim, highlighting, terminal cursor, and click-to-offset behavior; LanguagePicker is rejected as a coarse neighboring owner.',
  }),
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function descriptorsEqual(left, right) {
  return left.bytes === right.bytes && left.sha256 === right.sha256
}

function sourceFilename(sourceRoot) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(
    root,
    TARGET117_SEARCH_BOX_PREFIX_COLOR_INPUT_FILE.path.slice(4),
  )
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error('SearchBox prefix-color path escapes source root')
  }
  return filename
}

function donorBytes() {
  const filename = fileURLToPath(
    new URL('./SearchBox.target117.tsx', import.meta.url),
  )
  const bytes = fs.readFileSync(filename)
  const actual = descriptor(bytes)
  if (!descriptorsEqual(actual, TARGET117_SEARCH_BOX_PREFIX_COLOR_DONOR_FILE)) {
    throw new Error(
      `Refusing mutated SearchBox Target117 donor: ${actual.bytes}/${actual.sha256}`,
    )
  }
  return bytes
}

export function applyTarget117SearchBoxPrefixColorSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const filename = sourceFilename(sourceRoot)
  const input = fs.readFileSync(filename)
  const actual = descriptor(input)
  if (descriptorsEqual(actual, TARGET117_SEARCH_BOX_PREFIX_COLOR_OUTPUT_FILE)) {
    return Object.freeze({
      status: 'already-recovered',
      ownerOverrides: TARGET117_SEARCH_BOX_PREFIX_COLOR_OWNER_OVERRIDES.length,
      file: TARGET117_SEARCH_BOX_PREFIX_COLOR_OUTPUT_FILE,
    })
  }
  if (!descriptorsEqual(actual, TARGET117_SEARCH_BOX_PREFIX_COLOR_INPUT_FILE)) {
    throw new Error(
      `Refusing non-target SearchBox prefix-color recovery: ${actual.bytes}/${actual.sha256}`,
    )
  }
  const output = donorBytes()
  if (!descriptorsEqual(descriptor(output), TARGET117_SEARCH_BOX_PREFIX_COLOR_OUTPUT_FILE)) {
    throw new Error('SearchBox Target117 donor/output descriptor mismatch')
  }
  fs.writeFileSync(filename, output)
  const written = descriptor(fs.readFileSync(filename))
  if (!descriptorsEqual(written, TARGET117_SEARCH_BOX_PREFIX_COLOR_OUTPUT_FILE)) {
    throw new Error(
      `Written SearchBox prefix-color descriptor mismatch: ${written.bytes}/${written.sha256}`,
    )
  }
  return Object.freeze({
    status: 'recovered',
    ownerOverrides: TARGET117_SEARCH_BOX_PREFIX_COLOR_OWNER_OVERRIDES.length,
    file: TARGET117_SEARCH_BOX_PREFIX_COLOR_OUTPUT_FILE,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = applyTarget117SearchBoxPrefixColorSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
