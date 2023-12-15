#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.117-to-2.1.118'

export const TARGET118_PROACTIVE_OAUTH_REFRESH_INPUT_FILES = Object.freeze([
  Object.freeze({
    path: 'src/bridge/remoteBridgeCore.ts',
    bytes: 46231,
    sha256: 'a87b0055b4ef461d3265b3572b5c99c91cd020421bee23a3f9240b7f3a829976',
  }),
  Object.freeze({
    path: 'src/bridge/initReplBridge.ts',
    bytes: 27090,
    sha256: '97d4700e746bee60ce209da6b582a51a6be4b057f13124bb4cb6cf213c1a3b61',
  }),
])

export const TARGET118_PROACTIVE_OAUTH_REFRESH_OUTPUT_FILES = Object.freeze([
  Object.freeze({
    path: 'src/bridge/remoteBridgeCore.ts',
    bytes: 46305,
    sha256: '0797fa8de203e7ca057402d7e0b2b1b5546e8e416731aa82b6f324ee79c4367d',
  }),
  Object.freeze({
    path: 'src/bridge/initReplBridge.ts',
    bytes: 27189,
    sha256: 'a2611636c2f0e44054c622f8c431d9231f455ed9fcff0357f513634d0724f797',
  }),
])

const EVIDENCE_IDS = Object.freeze([
  'target118-proactive-oauth-refresh-target-fragments',
  'target118-proactive-oauth-refresh-source-replay-test',
  'target118-proactive-oauth-refresh-source-ast-test',
])

export const TARGET118_PROACTIVE_OAUTH_REFRESH_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:18793`,
      targetIndex: 18793,
      paths: Object.freeze(['src/bridge/remoteBridgeCore.ts']),
      declarations: Object.freeze([
        'EnvLessBridgeParams',
        'initEnvLessBridgeCore',
      ]),
      evidenceIds: EVIDENCE_IDS,
      behavior:
        'The authenticated Target118 env-less bridge core retains reattachSessionId and reattachSequenceNum, snapshots the current OAuth token before proactive refresh, awaits the optional onProactiveRefresh callback, and returns the refreshed token with the stale token as a bounded fallback.',
    }),
    Object.freeze({
      key: `${CASE_NAME}:18802`,
      targetIndex: 18802,
      paths: Object.freeze(['src/bridge/initReplBridge.ts']),
      declarations: Object.freeze(['initReplBridge']),
      evidenceIds: EVIDENCE_IDS,
      behavior:
        'The authenticated Target118 REPL bridge wrapper supplies an onProactiveRefresh callback that awaits checkAndRefreshOAuthTokenIfNeeded before the env-less credential scheduler fetches its replacement OAuth token.',
    }),
  ])

const OPERATIONS = Object.freeze({
  'src/bridge/remoteBridgeCore.ts': Object.freeze([
    Object.freeze({
      label: 'proactive refresh callback contract',
      before:
        '  onAuth401?: (staleAccessToken: string) => Promise<boolean>\n',
      after:
        '  onAuth401?: (staleAccessToken: string) => Promise<boolean>\n' +
        '  onProactiveRefresh?: () => Promise<void>\n',
    }),
    Object.freeze({
      label: 'proactive refresh callback binding',
      before: '    onAuth401,\n    toSDKMessages,\n',
      after:
        '    onAuth401,\n' +
        '    onProactiveRefresh,\n' +
        '    toSDKMessages,\n',
    }),
    Object.freeze({
      label: 'proactive refresh callback invocation',
      before: "      if (onAuth401) await onAuth401(stale ?? '')\n",
      after:
        '      if (onProactiveRefresh) await onProactiveRefresh()\n',
    }),
  ]),
  'src/bridge/initReplBridge.ts': Object.freeze([
    Object.freeze({
      label: 'env-less proactive refresh caller',
      before: [
        '    const handle = await initEnvLessBridgeCore({',
        '      baseUrl,',
        '      orgUUID,',
        '      title,',
        '      getAccessToken: getBridgeAccessToken,',
        '      onAuth401: handleOAuth401Error,',
        '      toSDKMessages,',
      ].join('\n'),
      after: [
        '    const handle = await initEnvLessBridgeCore({',
        '      baseUrl,',
        '      orgUUID,',
        '      title,',
        '      getAccessToken: getBridgeAccessToken,',
        '      onAuth401: handleOAuth401Error,',
        '      onProactiveRefresh: async () => {',
        '        await checkAndRefreshOAuthTokenIfNeeded()',
        '      },',
        '      toSDKMessages,',
      ].join('\n'),
    }),
  ]),
})

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function sameDescriptor(actual, expected) {
  return actual.bytes === expected.bytes && actual.sha256 === expected.sha256
}

function replaceExactly(source, operation, relative) {
  const count = source.split(operation.before).length - 1
  if (count !== 1) {
    throw new Error(
      `${CASE_NAME}: ${relative} ${operation.label} anchor count ${count}, expected 1`,
    )
  }
  return source.replace(operation.before, operation.after)
}

export function buildTarget118ProactiveOAuthRefreshOutput(relative, input) {
  let output = input
  for (const operation of OPERATIONS[relative] ?? []) {
    output = replaceExactly(output, operation, relative)
  }
  return Buffer.from(output)
}

function resolveSourcePath(sourceRoot, relative) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, relative.replace(/^src\//, ''))
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${relative}: escapes supplied source root`)
  }
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${relative}: expected a real source file`)
  }
  return filename
}

export function applyTarget118ProactiveOAuthRefreshSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const inputs = new Map(
    TARGET118_PROACTIVE_OAUTH_REFRESH_INPUT_FILES.map(file => [
      file.path,
      file,
    ]),
  )
  const outputs = new Map(
    TARGET118_PROACTIVE_OAUTH_REFRESH_OUTPUT_FILES.map(file => [
      file.path,
      file,
    ]),
  )
  const states = Object.keys(OPERATIONS).map(relative => {
    const filename = resolveSourcePath(sourceRoot, relative)
    const value = fs.readFileSync(filename)
    const actual = descriptor(value)
    const state = sameDescriptor(actual, inputs.get(relative))
      ? 'raw'
      : sameDescriptor(actual, outputs.get(relative))
        ? 'recovered'
        : 'unknown'
    return { relative, filename, value, state }
  })
  if (states.every(item => item.state === 'recovered')) {
    return {
      status: 'already-recovered',
      files: TARGET118_PROACTIVE_OAUTH_REFRESH_OUTPUT_FILES.map(
        file => file.path,
      ),
    }
  }
  if (!states.every(item => item.state === 'raw')) {
    throw new Error(
      `${CASE_NAME}: proactive OAuth refresh replay requires one exact all-raw or all-recovered state; got ${states.map(item => `${item.relative}:${item.state}`).join(', ')}`,
    )
  }
  const pending = states.map(item => {
    const value = buildTarget118ProactiveOAuthRefreshOutput(
      item.relative,
      item.value.toString('utf8'),
    )
    const actual = descriptor(value)
    const expected = outputs.get(item.relative)
    if (!sameDescriptor(actual, expected)) {
      throw new Error(
        `${CASE_NAME}: ${item.relative} replay output differs ${actual.bytes}/${actual.sha256}`,
      )
    }
    return { ...item, value }
  })
  for (const item of pending) fs.writeFileSync(item.filename, item.value)
  for (const item of pending) {
    const actual = descriptor(fs.readFileSync(item.filename))
    if (!sameDescriptor(actual, outputs.get(item.relative))) {
      throw new Error(`${CASE_NAME}: ${item.relative} written postimage differs`)
    }
  }
  return {
    status: 'recovered',
    files: pending.map(item => item.relative),
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceRootIndex = process.argv.indexOf('--source-root')
  const sourceRoot =
    sourceRootIndex >= 0 ? process.argv[sourceRootIndex + 1] : process.argv[2]
  if (!sourceRoot) {
    throw new Error(
      'usage: replay-proactive-oauth-refresh-source-gap.mjs --source-root DIR',
    )
  }
  process.stdout.write(
    `${JSON.stringify(
      applyTarget118ProactiveOAuthRefreshSourceRecovery({
        sourceRoot: path.resolve(sourceRoot),
      }),
    )}\n`,
  )
}
