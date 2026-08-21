#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.117-to-2.1.118'
const SOURCE_PATH = 'src/components/SearchBox.tsx'

const TARGET_FRAGMENT_EVIDENCE =
  'target118-search-box-dim-range-cursor-target-fragment'
const SOURCE_REPLAY_EVIDENCE =
  'target118-search-box-dim-range-cursor-source-replay-test'
const SOURCE_AST_EVIDENCE =
  'target118-search-box-dim-range-cursor-source-ast-test'

export const TARGET118_SEARCH_BOX_DIM_RANGE_CURSOR_RAW_INPUT = Object.freeze({
  path: SOURCE_PATH,
  bytes: 9421,
  sha256: 'ee45b2a89f0e04b3894aecbe61e0f73d1f24893aba5bafeb2f1c3594edee81b1',
})

export const TARGET118_SEARCH_BOX_DIM_RANGE_CURSOR_INHERITED_INPUT =
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 3630,
    sha256:
      'ab7cb597e9c70452afcbd6dc6f8156503f43bdb34d849deabf587cf210f2dd25',
  })

export const TARGET118_SEARCH_BOX_DIM_RANGE_CURSOR_OUTPUT = Object.freeze({
  path: SOURCE_PATH,
  bytes: 4220,
  sha256: '3523600a86121f1f75bf6840f5117b9e7059e4ad622fdc455f68e1b37cc4a2b4',
})

export const TARGET118_SEARCH_BOX_DIM_RANGE_CURSOR_DONOR = Object.freeze({
  path:
    'recovery/cases/2.1.117-to-2.1.118/recovered/SearchBox.target118.tsx',
  bytes: 4220,
  sha256: '3523600a86121f1f75bf6840f5117b9e7059e4ad622fdc455f68e1b37cc4a2b4',
})

export const TARGET118_SEARCH_BOX_DIM_RANGE_CURSOR_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:15517`,
      targetIndex: 15517,
      paths: Object.freeze([SOURCE_PATH]),
      declarations: Object.freeze(['SearchBox', 'renderSearchBoxQuery']),
      evidenceIds: Object.freeze([
        TARGET_FRAGMENT_EVIDENCE,
        SOURCE_REPLAY_EVIDENCE,
        SOURCE_AST_EVIDENCE,
      ]),
      behavior:
        'The complete authenticated Target118 SearchBox owns dimRange and cursorChar: it partitions query text at highlight, dim-range, and cursor boundaries, dims only the requested range, substitutes a custom terminal cursor when supplied, preserves the placeholder cursor fallback, and retains prefixColor; LanguagePicker is rejected as a coarse neighboring owner.',
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
  const filename = path.resolve(root, SOURCE_PATH.replace(/^src\//, ''))
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${CASE_NAME}: SearchBox path escapes source root`)
  }
  return filename
}

function donorBytes() {
  const filename = fileURLToPath(
    new URL('./SearchBox.target118.tsx', import.meta.url),
  )
  const bytes = fs.readFileSync(filename)
  const actual = descriptor(bytes)
  if (!descriptorsEqual(actual, TARGET118_SEARCH_BOX_DIM_RANGE_CURSOR_DONOR)) {
    throw new Error(
      `${CASE_NAME}: refusing mutated SearchBox Target118 donor ` +
        `${actual.bytes}/${actual.sha256}`,
    )
  }
  return bytes
}

export function applyTarget118SearchBoxDimRangeCursorSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const filename = sourceFilename(sourceRoot)
  const input = fs.readFileSync(filename)
  const actual = descriptor(input)

  if (descriptorsEqual(actual, TARGET118_SEARCH_BOX_DIM_RANGE_CURSOR_OUTPUT)) {
    return Object.freeze({
      status: 'already-recovered',
      files: Object.freeze([]),
      ownerOverrides:
        TARGET118_SEARCH_BOX_DIM_RANGE_CURSOR_OWNER_OVERRIDES.length,
    })
  }

  const acceptedInput = [
    TARGET118_SEARCH_BOX_DIM_RANGE_CURSOR_RAW_INPUT,
    TARGET118_SEARCH_BOX_DIM_RANGE_CURSOR_INHERITED_INPUT,
  ].some(expected => descriptorsEqual(actual, expected))
  if (!acceptedInput) {
    throw new Error(
      `${CASE_NAME}: SearchBox dim-range/cursor replay requires an exact raw, inherited, or recovered source state; received ` +
        `${actual.bytes}/${actual.sha256}`,
    )
  }

  const output = donorBytes()
  if (
    !descriptorsEqual(
      descriptor(output),
      TARGET118_SEARCH_BOX_DIM_RANGE_CURSOR_OUTPUT,
    )
  ) {
    throw new Error(`${CASE_NAME}: SearchBox donor/output descriptor mismatch`)
  }
  fs.writeFileSync(filename, output)
  const written = descriptor(fs.readFileSync(filename))
  if (!descriptorsEqual(written, TARGET118_SEARCH_BOX_DIM_RANGE_CURSOR_OUTPUT)) {
    throw new Error(
      `${CASE_NAME}: written SearchBox descriptor mismatch ` +
        `${written.bytes}/${written.sha256}`,
    )
  }
  return Object.freeze({
    status: 'recovered',
    files: Object.freeze([SOURCE_PATH]),
    ownerOverrides:
      TARGET118_SEARCH_BOX_DIM_RANGE_CURSOR_OWNER_OVERRIDES.length,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceRootIndex = process.argv.indexOf('--source-root')
  const sourceRoot =
    sourceRootIndex >= 0 ? process.argv[sourceRootIndex + 1] : process.argv[2]
  if (!sourceRoot) {
    throw new Error(
      'usage: replay-search-box-dim-range-cursor-source-gap.mjs --source-root DIR',
    )
  }
  process.stdout.write(
    `${JSON.stringify(
      applyTarget118SearchBoxDimRangeCursorSourceRecovery({ sourceRoot }),
      null,
      2,
    )}\n`,
  )
}
