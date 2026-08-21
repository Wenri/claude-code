#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.117-to-2.1.118'
const SOURCE_PATH = 'src/commands/effort/index.ts'

const TARGET_FRAGMENT_EVIDENCE =
  'target118-effort-command-thin-client-dispatch-target-fragment'
const SOURCE_REPLAY_EVIDENCE =
  'target118-effort-command-thin-client-dispatch-source-replay-test'
const SOURCE_AST_EVIDENCE =
  'target118-effort-command-thin-client-dispatch-source-ast-test'

export const TARGET118_EFFORT_COMMAND_THIN_CLIENT_DISPATCH_INPUT =
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 434,
    sha256:
      'c411f09e44a5a7bd0aab0cdec098387f3ee456853734a3f3bd0f22cdc5531200',
  })

export const TARGET118_EFFORT_COMMAND_THIN_CLIENT_DISPATCH_OUTPUT =
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 475,
    sha256:
      '5302f666fc64da11add9854e1007735be91f5b5c9e3eabe29c784e7d9565fe8b',
  })

export const TARGET118_EFFORT_COMMAND_THIN_CLIENT_DISPATCH_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:17726`,
      targetIndex: 17726,
      paths: Object.freeze([SOURCE_PATH]),
      declarations: Object.freeze(['default']),
      evidenceIds: Object.freeze([
        TARGET_FRAGMENT_EVIDENCE,
        SOURCE_REPLAY_EVIDENCE,
        SOURCE_AST_EVIDENCE,
      ]),
      behavior:
        "The complete authenticated Target118 effort command descriptor dispatches through the thin-client control-request channel while retaining its JSX loader, argument domain, and immediate-command policy; commands/effort/effort.tsx is rejected as a coarse neighboring implementation owner.",
    }),
  ])

const INSERTION_INPUT = `  get immediate() {
    return shouldInferenceConfigCommandBeImmediate()
  },
  load: () => import('./effort.js'),`

const INSERTION_OUTPUT = `  get immediate() {
    return shouldInferenceConfigCommandBeImmediate()
  },
  thinClientDispatch: 'control-request',
  load: () => import('./effort.js'),`

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
    throw new Error(`${CASE_NAME}: effort command path escapes source root`)
  }
  return filename
}

function buildPostimage(input) {
  const source = input.toString('utf8')
  const first = source.indexOf(INSERTION_INPUT)
  if (first < 0 || source.indexOf(INSERTION_INPUT, first + 1) >= 0) {
    throw new Error(
      `${CASE_NAME}: Target118 effort command replay requires one exact insertion anchor`,
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
      TARGET118_EFFORT_COMMAND_THIN_CLIENT_DISPATCH_OUTPUT,
    )
  ) {
    throw new Error(
      `${CASE_NAME}: Target118 effort command postimage drift ` +
        `${actual.bytes}/${actual.sha256}`,
    )
  }
  return output
}

export function applyTarget118EffortCommandThinClientDispatchSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const filename = sourceFilename(sourceRoot)
  const input = fs.readFileSync(filename)
  const actual = descriptor(input)

  if (
    descriptorsEqual(
      actual,
      TARGET118_EFFORT_COMMAND_THIN_CLIENT_DISPATCH_OUTPUT,
    )
  ) {
    return Object.freeze({
      status: 'already-recovered',
      files: Object.freeze([]),
      ownerOverrides:
        TARGET118_EFFORT_COMMAND_THIN_CLIENT_DISPATCH_OWNER_OVERRIDES.length,
    })
  }
  if (
    !descriptorsEqual(
      actual,
      TARGET118_EFFORT_COMMAND_THIN_CLIENT_DISPATCH_INPUT,
    )
  ) {
    throw new Error(
      `${CASE_NAME}: effort command thin-client replay requires the exact raw or recovered source; received ` +
        `${actual.bytes}/${actual.sha256}`,
    )
  }

  const output = buildPostimage(input)
  fs.writeFileSync(filename, output)
  const written = descriptor(fs.readFileSync(filename))
  if (
    !descriptorsEqual(
      written,
      TARGET118_EFFORT_COMMAND_THIN_CLIENT_DISPATCH_OUTPUT,
    )
  ) {
    throw new Error(
      `${CASE_NAME}: written effort command postimage differs ` +
        `${written.bytes}/${written.sha256}`,
    )
  }
  return Object.freeze({
    status: 'recovered',
    files: Object.freeze([SOURCE_PATH]),
    ownerOverrides:
      TARGET118_EFFORT_COMMAND_THIN_CLIENT_DISPATCH_OWNER_OVERRIDES.length,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceRootIndex = process.argv.indexOf('--source-root')
  const sourceRoot =
    sourceRootIndex >= 0 ? process.argv[sourceRootIndex + 1] : process.argv[2]
  if (!sourceRoot) {
    throw new Error(
      'usage: replay-effort-command-thin-client-dispatch-source-gap.mjs --source-root DIR',
    )
  }
  process.stdout.write(
    `${JSON.stringify(
      applyTarget118EffortCommandThinClientDispatchSourceRecovery({
        sourceRoot,
      }),
      null,
      2,
    )}\n`,
  )
}
