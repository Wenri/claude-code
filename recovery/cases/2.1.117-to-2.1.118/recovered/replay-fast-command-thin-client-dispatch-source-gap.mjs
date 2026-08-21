#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.117-to-2.1.118'
const SOURCE_PATH = 'src/commands/fast/index.ts'

const TARGET_FRAGMENT_EVIDENCE =
  'target118-fast-command-thin-client-dispatch-target-fragment'
const SOURCE_REPLAY_EVIDENCE =
  'target118-fast-command-thin-client-dispatch-source-replay-test'
const SOURCE_AST_EVIDENCE =
  'target118-fast-command-thin-client-dispatch-source-ast-test'

export const TARGET118_FAST_COMMAND_THIN_CLIENT_DISPATCH_INPUT = Object.freeze({
  path: SOURCE_PATH,
  bytes: 693,
  sha256: '114ad2b63f64ad326bb428bbfed0922b2f7f1d3df1dca0c5100c7061f212966f',
})

export const TARGET118_FAST_COMMAND_THIN_CLIENT_DISPATCH_OUTPUT =
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 734,
    sha256:
      '63ee05aa4a4bcac20265df24de01fc3c4a2f1e31fb8455632093523ffb77a940',
  })

export const TARGET118_FAST_COMMAND_THIN_CLIENT_DISPATCH_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:17142`,
      targetIndex: 17142,
      paths: Object.freeze([SOURCE_PATH]),
      declarations: Object.freeze(['fast']),
      evidenceIds: Object.freeze([
        TARGET_FRAGMENT_EVIDENCE,
        SOURCE_REPLAY_EVIDENCE,
        SOURCE_AST_EVIDENCE,
      ]),
      behavior:
        "The complete authenticated Target118 fast command descriptor dispatches through the thin-client control-request channel while retaining its JSX loader, visibility, availability, and immediate-command policy; commands/fast/fast.tsx is rejected as a coarse neighboring implementation owner.",
    }),
  ])

const INSERTION_INPUT = `  get immediate() {
    return shouldInferenceConfigCommandBeImmediate()
  },
  load: () => import('./fast.js'),`

const INSERTION_OUTPUT = `  get immediate() {
    return shouldInferenceConfigCommandBeImmediate()
  },
  thinClientDispatch: 'control-request',
  load: () => import('./fast.js'),`

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
  const filename = path.resolve(root, SOURCE_PATH.slice('src/'.length))
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${CASE_NAME}: fast command path escapes source root`)
  }
  return filename
}

function buildPostimage(input) {
  const source = input.toString('utf8')
  const first = source.indexOf(INSERTION_INPUT)
  if (first < 0 || source.indexOf(INSERTION_INPUT, first + 1) >= 0) {
    throw new Error(
      `${CASE_NAME}: Target118 fast command replay requires one exact insertion anchor`,
    )
  }
  const output = Buffer.from(
    `${source.slice(0, first)}${INSERTION_OUTPUT}${source.slice(
      first + INSERTION_INPUT.length,
    )}`,
  )
  const actual = descriptor(output)
  if (
    !descriptorsEqual(
      actual,
      TARGET118_FAST_COMMAND_THIN_CLIENT_DISPATCH_OUTPUT,
    )
  ) {
    throw new Error(
      `${CASE_NAME}: Target118 fast command postimage drift ` +
        `${actual.bytes}/${actual.sha256}`,
    )
  }
  return output
}

export function applyTarget118FastCommandThinClientDispatchSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const filename = sourceFilename(sourceRoot)
  const input = fs.readFileSync(filename)
  const actual = descriptor(input)

  if (
    descriptorsEqual(
      actual,
      TARGET118_FAST_COMMAND_THIN_CLIENT_DISPATCH_OUTPUT,
    )
  ) {
    return Object.freeze({
      status: 'already-recovered',
      files: Object.freeze([]),
      ownerOverrides:
        TARGET118_FAST_COMMAND_THIN_CLIENT_DISPATCH_OWNER_OVERRIDES.length,
    })
  }
  if (
    !descriptorsEqual(
      actual,
      TARGET118_FAST_COMMAND_THIN_CLIENT_DISPATCH_INPUT,
    )
  ) {
    throw new Error(
      `${CASE_NAME}: fast command thin-client replay requires the exact raw or recovered source; received ` +
        `${actual.bytes}/${actual.sha256}`,
    )
  }

  const output = buildPostimage(input)
  fs.writeFileSync(filename, output)
  const written = descriptor(fs.readFileSync(filename))
  if (
    !descriptorsEqual(
      written,
      TARGET118_FAST_COMMAND_THIN_CLIENT_DISPATCH_OUTPUT,
    )
  ) {
    throw new Error(
      `${CASE_NAME}: written fast command postimage differs ` +
        `${written.bytes}/${written.sha256}`,
    )
  }
  return Object.freeze({
    status: 'recovered',
    files: Object.freeze([SOURCE_PATH]),
    ownerOverrides:
      TARGET118_FAST_COMMAND_THIN_CLIENT_DISPATCH_OWNER_OVERRIDES.length,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceRootIndex = process.argv.indexOf('--source-root')
  const sourceRoot =
    sourceRootIndex >= 0 ? process.argv[sourceRootIndex + 1] : process.argv[2]
  if (!sourceRoot) {
    throw new Error(
      'usage: replay-fast-command-thin-client-dispatch-source-gap.mjs --source-root DIR',
    )
  }
  process.stdout.write(
    `${JSON.stringify(
      applyTarget118FastCommandThinClientDispatchSourceRecovery({ sourceRoot }),
      null,
      2,
    )}\n`,
  )
}
