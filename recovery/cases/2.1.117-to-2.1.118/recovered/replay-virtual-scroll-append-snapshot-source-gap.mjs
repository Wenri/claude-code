#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.117-to-2.1.118'
const SOURCE_PATH = 'src/hooks/useVirtualScroll.ts'
const TARGET_FRAGMENT_EVIDENCE =
  'target118-virtual-scroll-append-snapshot-target-fragment'
const SOURCE_REPLAY_EVIDENCE =
  'target118-virtual-scroll-append-snapshot-source-replay-test'
const SOURCE_AST_EVIDENCE =
  'target118-virtual-scroll-append-snapshot-source-ast-test'

export const TARGET118_VIRTUAL_SCROLL_APPEND_SNAPSHOT_INPUT_FILE =
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 35122,
    sha256: 'd27382b007c98ab3af5e2940b0d1f6db041ccbe2897963ce19f63afb340ea4b7',
  })

export const TARGET118_VIRTUAL_SCROLL_APPEND_SNAPSHOT_OUTPUT_FILE =
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 35641,
    sha256: '003426538b320bb7bc69578e1841ce6a79c88a6d56ae1ab3e116d5a157b3d31d',
  })

export const TARGET118_VIRTUAL_SCROLL_APPEND_SNAPSHOT_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:16656`,
      targetIndex: 16656,
      paths: Object.freeze([SOURCE_PATH]),
      declarations: Object.freeze(['useVirtualScroll']),
      evidenceIds: Object.freeze([
        TARGET_FRAGMENT_EVIDENCE,
        SOURCE_REPLAY_EVIDENCE,
        SOURCE_AST_EVIDENCE,
      ]),
      behavior:
        'Target118 useVirtualScroll snapshots item-key length and boundary identities, skips cache garbage collection only for append-only growth, and refreshes the snapshot before every early return. The recovered declaration preserves the complete virtual-scroll implementation around that optimization.',
    }),
  ])

const OPERATIONS = Object.freeze([
  Object.freeze({
    before: [
      '  const refCache = useRef(new Map<string, (el: DOMElement | null) => void>())',
      '  // Inline ref-compare:',
    ].join('\n'),
    after: [
      '  const refCache = useRef(new Map<string, (el: DOMElement | null) => void>())',
      '  const previousItemKeysRef = useRef<{',
      '    len: number',
      '    first: string | undefined',
      '    last: string | undefined',
      '  }>({ len: 0, first: undefined, last: undefined })',
      '  // Inline ref-compare:',
    ].join('\n'),
  }),
  Object.freeze({
    before: [
      '  useMemo(() => {',
      '    const live = new Set(itemKeys)',
    ].join('\n'),
    after: [
      '  useMemo(() => {',
      '    const previous = previousItemKeysRef.current',
      '    const first = itemKeys[0]',
      '    const appendOnly =',
      '      itemKeys.length >= previous.len &&',
      '      first === previous.first &&',
      '      itemKeys[previous.len - 1] === previous.last',
      '    previous.len = itemKeys.length',
      '    previous.first = first',
      '    previous.last = itemKeys.at(-1)',
      '    if (appendOnly) return',
      '    const live = new Set(itemKeys)',
    ].join('\n'),
  }),
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function describe(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function sameDescriptor(actual, expected) {
  return actual.bytes === expected.bytes && actual.sha256 === expected.sha256
}

function replaceExactly(source, before, after, label) {
  const occurrences = source.split(before).length - 1
  if (occurrences !== 1) {
    throw new Error(`${label} anchor count ${occurrences}, expected 1`)
  }
  return source.replace(before, after)
}

function buildPostimage(source) {
  let output = source
  for (const operation of OPERATIONS) {
    output = replaceExactly(
      output,
      operation.before,
      operation.after,
      'useVirtualScroll append snapshot',
    )
  }
  return Buffer.from(output)
}

export function applyTarget118VirtualScrollAppendSnapshotSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')

  const filename = path.join(
    sourceRoot,
    TARGET118_VIRTUAL_SCROLL_APPEND_SNAPSHOT_INPUT_FILE.path.slice(
      'src/'.length,
    ),
  )
  const value = fs.readFileSync(filename)
  const observed = describe(value)
  if (
    sameDescriptor(
      observed,
      TARGET118_VIRTUAL_SCROLL_APPEND_SNAPSHOT_OUTPUT_FILE,
    )
  ) {
    return {
      status: 'already-recovered',
      outputFile: TARGET118_VIRTUAL_SCROLL_APPEND_SNAPSHOT_OUTPUT_FILE,
      ownerOverrides:
        TARGET118_VIRTUAL_SCROLL_APPEND_SNAPSHOT_OWNER_OVERRIDES.length,
    }
  }
  if (
    !sameDescriptor(
      observed,
      TARGET118_VIRTUAL_SCROLL_APPEND_SNAPSHOT_INPUT_FILE,
    )
  ) {
    throw new Error(
      `Target118 useVirtualScroll source state is unknown: ${observed.bytes}/${observed.sha256}`,
    )
  }

  const postimage = buildPostimage(value.toString('utf8'))
  const outputDescriptor = describe(postimage)
  if (
    !sameDescriptor(
      outputDescriptor,
      TARGET118_VIRTUAL_SCROLL_APPEND_SNAPSHOT_OUTPUT_FILE,
    )
  ) {
    throw new Error(
      `Target118 useVirtualScroll postimage drift: ${outputDescriptor.bytes}/${outputDescriptor.sha256}`,
    )
  }
  fs.writeFileSync(filename, postimage)
  const written = describe(fs.readFileSync(filename))
  if (
    !sameDescriptor(
      written,
      TARGET118_VIRTUAL_SCROLL_APPEND_SNAPSHOT_OUTPUT_FILE,
    )
  ) {
    throw new Error('Target118 useVirtualScroll written postimage differs')
  }

  return {
    status: 'recovered',
    outputFile: TARGET118_VIRTUAL_SCROLL_APPEND_SNAPSHOT_OUTPUT_FILE,
    ownerOverrides:
      TARGET118_VIRTUAL_SCROLL_APPEND_SNAPSHOT_OWNER_OVERRIDES.length,
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceRootIndex = process.argv.indexOf('--source-root')
  if (sourceRootIndex < 0 || !process.argv[sourceRootIndex + 1]) {
    throw new Error(
      'usage: replay-virtual-scroll-append-snapshot-source-gap.mjs --source-root DIR',
    )
  }
  process.stdout.write(
    `${JSON.stringify(
      applyTarget118VirtualScrollAppendSnapshotSourceRecovery({
        sourceRoot: path.resolve(process.argv[sourceRootIndex + 1]),
      }),
    )}\n`,
  )
}
