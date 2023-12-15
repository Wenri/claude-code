#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.117-to-2.1.118'

const TARGET_FRAGMENT_EVIDENCE = 'target118-frame-urls-target-fragments'
const SOURCE_REPLAY_EVIDENCE = 'target118-frame-urls-source-replay-test'
const SOURCE_AST_EVIDENCE = 'target118-frame-urls-source-ast-test'

export const TARGET118_FRAME_URLS_INPUT_FILES = Object.freeze([
  Object.freeze({
    path: 'src/state/AppStateStore.ts',
    bytes: 22641,
    sha256: '32c9cac2ebfd936b3f1f32d1446dc86a1dabc9b6f9f183140c3e46b62f74590e',
  }),
  Object.freeze({
    path: 'src/commands/clear/conversation.ts',
    bytes: 9573,
    sha256: '74ff4d4eb9631b9fff5fb4e33da893c88679a1c48a73c8ec6887020a863b375f',
  }),
  Object.freeze({
    path: 'src/main.tsx',
    bytes: 808444,
    sha256: '9edfedd84c9154bdd800ca72cc879049e4c7a8fbf0b185a42adfe874cd3fa0bb',
  }),
])

export const TARGET118_FRAME_URLS_OUTPUT_FILES = Object.freeze([
  Object.freeze({
    path: 'src/state/AppStateStore.ts',
    bytes: 22696,
    sha256: '4ea37feff50e29f64370335a599105dbe04e2baf78b13c3bd5400e4ba4041089',
  }),
  Object.freeze({
    path: 'src/commands/clear/conversation.ts',
    bytes: 9596,
    sha256: '30cfd69eb471eebafa04da3c5787ebf5f9d7ed1280008507ac9202d4832392d7',
  }),
  Object.freeze({
    path: 'src/main.tsx',
    bytes: 808465,
    sha256: '263874a2733f298f2c41359da8a398f78984e33d4f790861081bde852cf67ef6',
  }),
])

export const TARGET118_FRAME_URLS_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:11049`,
    targetIndex: 11049,
    paths: Object.freeze(['src/state/AppStateStore.ts']),
    declarations: Object.freeze(['AppState', 'getDefaultAppState']),
    evidenceIds: Object.freeze([
      TARGET_FRAGMENT_EVIDENCE,
      SOURCE_REPLAY_EVIDENCE,
      SOURCE_AST_EVIDENCE,
    ]),
    behavior:
      'Target118 default application state owns an empty frameUrls map alongside notification and elicitation state; the recovered AppState declaration and default initializer preserve that exact state shape.',
  }),
  Object.freeze({
    key: `${CASE_NAME}:15311`,
    targetIndex: 15311,
    paths: Object.freeze(['src/commands/clear/conversation.ts']),
    declarations: Object.freeze(['clearConversation']),
    evidenceIds: Object.freeze([
      TARGET_FRAGMENT_EVIDENCE,
      SOURCE_REPLAY_EVIDENCE,
      SOURCE_AST_EVIDENCE,
    ]),
    behavior:
      'Target118 conversation clearing resets frameUrls to a fresh empty map while preserving eligible background tasks and the MCP reconnect generation.',
  }),
])

const OPERATIONS = Object.freeze({
  'src/state/AppStateStore.ts': Object.freeze([
    Object.freeze({
      before: [
        '  notifications: {',
        '    current: Notification | null',
        '    queue: Notification[]',
        '  }',
        '  elicitation: {',
      ].join('\n'),
      after: [
        '  notifications: {',
        '    current: Notification | null',
        '    queue: Notification[]',
        '  }',
        '  frameUrls: Record<string, string>',
        '  elicitation: {',
      ].join('\n'),
    }),
    Object.freeze({
      before: [
        '    notifications: {',
        '      current: null,',
        '      queue: [],',
        '    },',
        '    elicitation: {',
      ].join('\n'),
      after: [
        '    notifications: {',
        '      current: null,',
        '      queue: [],',
        '    },',
        '    frameUrls: {},',
        '    elicitation: {',
      ].join('\n'),
    }),
  ]),
  'src/commands/clear/conversation.ts': Object.freeze([
    Object.freeze({
      before: [
        '        attribution: createEmptyAttributionState(),',
        '        // Clear standalone agent context',
      ].join('\n'),
      after: [
        '        attribution: createEmptyAttributionState(),',
        '        frameUrls: {},',
        '        // Clear standalone agent context',
      ].join('\n'),
    }),
  ]),
  'src/main.tsx': Object.freeze([
    Object.freeze({
      before: [
        '      notifications: {',
        '        current: null,',
        '        queue: initialNotifications',
        '      },',
        '      elicitation: {',
      ].join('\n'),
      after: [
        '      notifications: {',
        '        current: null,',
        '        queue: initialNotifications',
        '      },',
        '      frameUrls: {},',
        '      elicitation: {',
      ].join('\n'),
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
      `${relativePath} frameUrls`,
    )
  }
  return Buffer.from(output)
}

export function applyTarget118FrameUrlsStateSourceRecovery({ sourceRoot } = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')

  const inputs = TARGET118_FRAME_URLS_INPUT_FILES
  const outputs = TARGET118_FRAME_URLS_OUTPUT_FILES
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
      .map((item, index) =>
        `${inputs[index].path}:${item.descriptor.bytes}/${item.descriptor.sha256}`,
      )
      .join(', ')
    throw new Error(`Target118 frameUrls source state is mixed or unknown: ${state}`)
  }
  if (recovered) {
    return {
      status: 'already-recovered',
      outputFiles: outputs,
      ownerOverrides: TARGET118_FRAME_URLS_OWNER_OVERRIDES.length,
    }
  }

  const postimages = observed.map((item, index) => {
    const relativePath = inputs[index].path
    const value = buildPostimage(item.value.toString('utf8'), relativePath)
    const descriptor = describe(value)
    if (!sameDescriptor(descriptor, outputs[index])) {
      throw new Error(
        `${relativePath} frameUrls postimage drift: ${descriptor.bytes}/${descriptor.sha256}`,
      )
    }
    return { ...item, value }
  })

  for (const item of postimages) fs.writeFileSync(item.filename, item.value)
  for (const [index, item] of postimages.entries()) {
    const written = describe(fs.readFileSync(item.filename))
    if (!sameDescriptor(written, outputs[index])) {
      throw new Error(`${outputs[index].path} written frameUrls postimage differs`)
    }
  }

  return {
    status: 'recovered',
    outputFiles: outputs,
    ownerOverrides: TARGET118_FRAME_URLS_OWNER_OVERRIDES.length,
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceRootIndex = process.argv.indexOf('--source-root')
  if (sourceRootIndex < 0 || !process.argv[sourceRootIndex + 1]) {
    throw new Error('usage: replay-frame-urls-state-source-gap.mjs --source-root DIR')
  }
  process.stdout.write(
    `${JSON.stringify(applyTarget118FrameUrlsStateSourceRecovery({ sourceRoot: path.resolve(process.argv[sourceRootIndex + 1]) }))}\n`,
  )
}
