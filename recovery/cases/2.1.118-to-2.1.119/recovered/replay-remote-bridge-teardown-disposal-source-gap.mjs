#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const CASE_NAME = '2.1.118-to-2.1.119'
const SOURCE_PATH = 'src/bridge/remoteBridgeCore.ts'

const EVIDENCE_IDS = Object.freeze([
  'target119-remote-bridge-teardown-disposal-target-fragment',
  'target119-remote-bridge-teardown-disposal-source-replay-test',
  'target119-remote-bridge-teardown-disposal-source-ast-test',
])

export const TARGET119_REMOTE_BRIDGE_TEARDOWN_DISPOSAL_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:19743`,
      targetIndex: 19743,
      paths: Object.freeze([SOURCE_PATH]),
      declarations: Object.freeze(['initEnvLessBridgeCore']),
      evidenceIds: EVIDENCE_IDS,
      behavior:
        'The complete authenticated Target119 env-less bridge declaration retains the bounded archive-retry teardown and async-disposable handle from Target118 while adding only the flush handle method. The graph-closed replay restores the shared teardown deadline, bounded OAuth refresh race, deterministic cleanup unregister, direct teardown handle, and Symbol.asyncDispose method in the sole historical owner.',
    }),
  ])

export const TARGET119_REMOTE_BRIDGE_TEARDOWN_DISPOSAL_INPUT_FILE =
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 50785,
    sha256:
      '0751b6716d0eeec353e38c65663979e4630b634d6eeb7731a4d1096f318e483c',
  })

export const TARGET119_REMOTE_BRIDGE_TEARDOWN_DISPOSAL_OUTPUT_FILE =
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 51015,
    sha256:
      'cfd078e37a19d69c01f4f04293e35c3b0841975a479552907dd3b5fd512763e4',
  })

const SKIP_ARCHIVE_INPUT = `      logEvent(
        feature('CCR_MIRROR') && outboundOnly
          ? 'tengu_ccr_mirror_teardown'
          : 'tengu_bridge_repl_teardown',
        {
          v2: true,
          archive_status:
            'skipped_teleport' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          archive_ok: false,
        },
      )
      return
`

const SKIP_ARCHIVE_OUTPUT = `      logEvent(
        feature('CCR_MIRROR') && outboundOnly
          ? 'tengu_ccr_mirror_teardown'
          : 'tengu_bridge_repl_teardown',
        {
          v2: true,
          archive_status:
            'skipped_teleport' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          archive_ok: false,
        },
      )
      unregister()
      return
`

const ARCHIVE_RETRY_INPUT = `    let token = getAccessToken()
    let status = await archiveSession(
      sessionId,
      baseUrl,
      token,
      orgUUID,
      cfg.teardown_archive_timeout_ms,
    )

    // Token is usually fresh (refresh scheduler runs 5min before expiry) but
    // laptop-wake past the refresh window leaves getAccessToken() returning a
    // stale string. Retry once on 401 — onAuth401 (= handleOAuth401Error)
    // clears keychain cache + force-refreshes. No proactive refresh on the
    // happy path: handleOAuth401Error force-refreshes even valid tokens,
    // which would waste budget 99% of the time. try/catch mirrors
    // recoverFromAuthFailure: keychain reads can throw (macOS locked after
    // wake); an uncaught throw here would skip transport.close + telemetry.
    if (status === 401 && onAuth401) {
      try {
        await onAuth401(token ?? '')
        token = getAccessToken()
        status = await archiveSession(
          sessionId,
          baseUrl,
          token,
          orgUUID,
          cfg.teardown_archive_timeout_ms,
        )
      } catch (err) {
`

const ARCHIVE_RETRY_OUTPUT = `    const timeoutMs = cfg.teardown_archive_timeout_ms
    const startedAt = Date.now()
    let token = getAccessToken()
    let status = await archiveSession(
      sessionId,
      baseUrl,
      token,
      orgUUID,
      timeoutMs,
    )
    const remainingMs = timeoutMs - (Date.now() - startedAt)

    // Token is usually fresh (refresh scheduler runs 5min before expiry) but
    // laptop-wake past the refresh window leaves getAccessToken() returning a
    // stale string. Retry once on 401 — onAuth401 (= handleOAuth401Error)
    // clears keychain cache + force-refreshes. No proactive refresh on the
    // happy path: handleOAuth401Error force-refreshes even valid tokens,
    // which would waste budget 99% of the time. try/catch mirrors
    // recoverFromAuthFailure: keychain reads can throw (macOS locked after
    // wake); an uncaught throw here would skip transport.close + telemetry.
    if (status === 401 && onAuth401 && remainingMs >= 200) {
      try {
        await Promise.race([onAuth401(token ?? ''), sleep(remainingMs)])
        token = getAccessToken()
        status = await archiveSession(
          sessionId,
          baseUrl,
          token,
          orgUUID,
          Math.max(1, timeoutMs - (Date.now() - startedAt)),
        )
      } catch (err) {
`

const NORMAL_ARCHIVE_INPUT = `    logEvent(
      feature('CCR_MIRROR') && outboundOnly
        ? 'tengu_ccr_mirror_teardown'
        : 'tengu_bridge_repl_teardown',
      {
        v2: true,
        archive_status:
          archiveStatus as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        archive_ok: typeof status === 'number' && status < 400,
        archive_http_status: typeof status === 'number' ? status : undefined,
        archive_timeout: status === 'timeout',
        archive_no_token: status === 'no_token',
      },
    )
  }
`

const NORMAL_ARCHIVE_OUTPUT = `    logEvent(
      feature('CCR_MIRROR') && outboundOnly
        ? 'tengu_ccr_mirror_teardown'
        : 'tengu_bridge_repl_teardown',
      {
        v2: true,
        archive_status:
          archiveStatus as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        archive_ok: typeof status === 'number' && status < 400,
        archive_http_status: typeof status === 'number' ? status : undefined,
        archive_timeout: status === 'timeout',
        archive_no_token: status === 'no_token',
      },
    )
    unregister()
  }
`

const HANDLE_HEAD_INPUT = `  // ── 10. Handle ──────────────────────────────────────────────────────────
  return {
`

const HANDLE_HEAD_OUTPUT = `  // ── 10. Handle ──────────────────────────────────────────────────────────
  const handle = {
`

const HANDLE_TAIL_INPUT = `    async teardown(options?: { skipArchive?: boolean }) {
      unregister()
      await teardown(options)
    },
  }
}
`

const HANDLE_TAIL_OUTPUT = `    teardown,
    [Symbol.asyncDispose]() {
      return handle.teardown()
    },
  }
  return handle
}
`

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function matches(actual, expected) {
  return actual.bytes === expected.bytes && actual.sha256 === expected.sha256
}

function replaceExactly(input, before, after, label) {
  const first = input.indexOf(before)
  const second = input.indexOf(before, first + 1)
  if (first < 0 || second >= 0) {
    throw new Error(`${CASE_NAME}: ${label} replay anchor differs`)
  }
  return input.slice(0, first) + after + input.slice(first + before.length)
}

export function buildTarget119RemoteBridgeTeardownDisposalOutput(source) {
  return replaceExactly(
    replaceExactly(
      replaceExactly(
        replaceExactly(
          replaceExactly(
            source,
            SKIP_ARCHIVE_INPUT,
            SKIP_ARCHIVE_OUTPUT,
            'skip-archive unregister',
          ),
          ARCHIVE_RETRY_INPUT,
          ARCHIVE_RETRY_OUTPUT,
          'bounded archive retry',
        ),
        NORMAL_ARCHIVE_INPUT,
        NORMAL_ARCHIVE_OUTPUT,
        'normal-archive unregister',
      ),
      HANDLE_HEAD_INPUT,
      HANDLE_HEAD_OUTPUT,
      'bridge handle declaration',
    ),
    HANDLE_TAIL_INPUT,
    HANDLE_TAIL_OUTPUT,
    'bridge teardown and async disposal handle',
  )
}

export function applyTarget119RemoteBridgeTeardownDisposalSourceRecovery({
  sourceRoot,
}) {
  const filename = path.join(sourceRoot, SOURCE_PATH.replace(/^src\//, ''))
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${CASE_NAME}: ${SOURCE_PATH} must be a real file`)
  }
  const input = fs.readFileSync(filename)
  const state = descriptor(input)
  if (matches(state, TARGET119_REMOTE_BRIDGE_TEARDOWN_DISPOSAL_OUTPUT_FILE)) {
    return { status: 'already-recovered', files: [] }
  }
  if (!matches(state, TARGET119_REMOTE_BRIDGE_TEARDOWN_DISPOSAL_INPUT_FILE)) {
    throw new Error(
      `${CASE_NAME}: remote bridge teardown/disposal replay requires its exact raw or recovered source state`,
    )
  }
  const output = Buffer.from(
    buildTarget119RemoteBridgeTeardownDisposalOutput(input.toString('utf8')),
  )
  if (
    !matches(
      descriptor(output),
      TARGET119_REMOTE_BRIDGE_TEARDOWN_DISPOSAL_OUTPUT_FILE,
    )
  ) {
    throw new Error(
      `${CASE_NAME}: remote bridge teardown/disposal replay produced unexpected source`,
    )
  }
  fs.writeFileSync(filename, output)
  return { status: 'recovered', files: [SOURCE_PATH] }
}
