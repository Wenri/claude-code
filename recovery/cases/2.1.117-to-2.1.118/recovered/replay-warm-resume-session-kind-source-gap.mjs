#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.117-to-2.1.118'
const TARGET_FRAGMENT_EVIDENCE =
  'target118-warm-resume-session-kind-target-fragment'
const SOURCE_REPLAY_EVIDENCE =
  'target118-warm-resume-session-kind-source-replay-test'
const SOURCE_AST_EVIDENCE =
  'target118-warm-resume-session-kind-source-ast-test'

export const TARGET118_WARM_RESUME_SESSION_KIND_INPUT_FILES = Object.freeze([
  Object.freeze({
    path: 'src/components/WarmResumeHint.tsx',
    bytes: 6300,
    sha256: 'a01f7c00629ff583a2156dc40838f8876d415c7c6c00fe97708c3b87c573df09',
  }),
  Object.freeze({
    path: 'src/utils/concurrentSessions.ts',
    bytes: 6808,
    sha256: 'e4ca77513dc97cc36fec8722dc3ec4a37cc97af95ec9cc7a6fd37e5b460a6afa',
  }),
])

export const TARGET118_WARM_RESUME_SESSION_KIND_OUTPUT_FILES = Object.freeze([
  Object.freeze({
    path: 'src/components/WarmResumeHint.tsx',
    bytes: 6415,
    sha256: '43e0d73d2796e5753b0ec5a0b6810925a3f136e7044a1d8c37c9d9d3e9454ac9',
  }),
  Object.freeze({
    path: 'src/utils/concurrentSessions.ts',
    bytes: 6815,
    sha256: '9913df1f21af24f60b89e379488f7dcb5cbbff4423e7e5639ae26a1bd99404d0',
  }),
])

export const TARGET118_WARM_RESUME_SESSION_KIND_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:16619`,
      targetIndex: 16619,
      paths: Object.freeze([
        'src/components/WarmResumeHint.tsx',
        'src/utils/concurrentSessions.ts',
      ]),
      declarations: Object.freeze(['isLaunchEligible', 'envSessionKind']),
      evidenceIds: Object.freeze([
        TARGET_FRAGMENT_EVIDENCE,
        SOURCE_REPLAY_EVIDENCE,
        SOURCE_AST_EVIDENCE,
      ]),
      behavior:
        'Target118 launch eligibility rejects explicit CLI arguments, every non-interactive session kind, teammate sessions, and CI. The recovered WarmResumeHint declaration calls the same exported envSessionKind implementation used by concurrent-session registration.',
    }),
  ])

const OPERATIONS = Object.freeze({
  'src/components/WarmResumeHint.tsx': Object.freeze([
    Object.freeze({
      before: "import { env } from '../utils/env.js'",
      after: [
        "import { envSessionKind } from '../utils/concurrentSessions.js'",
        "import { env } from '../utils/env.js'",
      ].join('\n'),
    }),
    Object.freeze({
      before: [
        '  if (process.argv.length > 2) return false',
        '  if (isTeammate()) return false',
      ].join('\n'),
      after: [
        '  if (process.argv.length > 2) return false',
        '  if (envSessionKind() !== undefined) return false',
        '  if (isTeammate()) return false',
      ].join('\n'),
    }),
  ]),
  'src/utils/concurrentSessions.ts': Object.freeze([
    Object.freeze({
      before: 'function envSessionKind(): SessionKind | undefined {',
      after: 'export function envSessionKind(): SessionKind | undefined {',
    }),
  ]),
})

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

function buildPostimage(source, relativePath) {
  let output = source
  for (const operation of OPERATIONS[relativePath]) {
    output = replaceExactly(
      output,
      operation.before,
      operation.after,
      `${relativePath} WarmResume session-kind`,
    )
  }
  return Buffer.from(output)
}

export function applyTarget118WarmResumeSessionKindSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')

  const inputs = TARGET118_WARM_RESUME_SESSION_KIND_INPUT_FILES
  const outputs = TARGET118_WARM_RESUME_SESSION_KIND_OUTPUT_FILES
  const observed = inputs.map(input => {
    const filename = path.join(sourceRoot, input.path.slice('src/'.length))
    const value = fs.readFileSync(filename)
    return { filename, value, descriptor: describe(value) }
  })
  const raw = observed.every((item, index) =>
    sameDescriptor(item.descriptor, inputs[index]),
  )
  const recovered = observed.every((item, index) =>
    sameDescriptor(item.descriptor, outputs[index]),
  )
  if (!raw && !recovered) {
    const state = observed
      .map(
        (item, index) =>
          `${inputs[index].path}:${item.descriptor.bytes}/${item.descriptor.sha256}`,
      )
      .join(', ')
    throw new Error(
      `Target118 WarmResume session-kind source state is mixed or unknown: ${state}`,
    )
  }
  if (recovered) {
    return {
      status: 'already-recovered',
      outputFiles: outputs,
      ownerOverrides:
        TARGET118_WARM_RESUME_SESSION_KIND_OWNER_OVERRIDES.length,
    }
  }

  const postimages = observed.map((item, index) => {
    const relativePath = inputs[index].path
    const value = buildPostimage(item.value.toString('utf8'), relativePath)
    const descriptor = describe(value)
    if (!sameDescriptor(descriptor, outputs[index])) {
      throw new Error(
        `${relativePath} WarmResume session-kind postimage drift: ${descriptor.bytes}/${descriptor.sha256}`,
      )
    }
    return { ...item, value }
  })

  for (const item of postimages) fs.writeFileSync(item.filename, item.value)
  for (const [index, item] of postimages.entries()) {
    const written = describe(fs.readFileSync(item.filename))
    if (!sameDescriptor(written, outputs[index])) {
      throw new Error(
        `${outputs[index].path} written WarmResume session-kind postimage differs`,
      )
    }
  }

  return {
    status: 'recovered',
    outputFiles: outputs,
    ownerOverrides: TARGET118_WARM_RESUME_SESSION_KIND_OWNER_OVERRIDES.length,
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceRootIndex = process.argv.indexOf('--source-root')
  if (sourceRootIndex < 0 || !process.argv[sourceRootIndex + 1]) {
    throw new Error(
      'usage: replay-warm-resume-session-kind-source-gap.mjs --source-root DIR',
    )
  }
  process.stdout.write(
    `${JSON.stringify(
      applyTarget118WarmResumeSessionKindSourceRecovery({
        sourceRoot: path.resolve(process.argv[sourceRootIndex + 1]),
      }),
    )}\n`,
  )
}
