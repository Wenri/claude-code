#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

// Replays only the two Target111 matrix gaps and their exact historical
// prerequisites. The recovered React executable bodies are frozen postimages;
// their historical inline source maps remain byte-for-byte unchanged. The
// structured I/O owner uses bounded Target101/105 prerequisite anchors followed
// by the exact Target111 watchdog delta. No Target113/116 behavior is included.

export const TARGET111_MATRIX_EXTRA_OWNER_HASHES = Object.freeze({
  'src/components/FeedbackSurvey/useMemorySurvey.tsx': Object.freeze({
    before: '06e677346fe2e448f393ceafd9df9927f3912d31a95ca9632fcf98f34074fac7',
    after: '0fff666d6c416e066d479a0fe09d0097781887ceb483ab538261296014699dfd',
  }),
  'src/components/FeedbackSurvey/useSurveyState.tsx': Object.freeze({
    before: 'a50493ca59a0407017eed482846fb3203e992c4bed77f3b20c392fb711e6c05f',
    after: 'f45676f844ce1e323f7612ff0392a406aa1901a44b64e138c905dabf8fa178a3',
  }),
  'src/cli/structuredIO.ts': Object.freeze({
    before: '7027317032209d29fcf0cec0833390771edf736cd25fbefb5de5999909332c31',
    after: '2e8cdd24cced26ccfad662616dc01dbdb8d52464ef0eb149cdb074e935ee8575',
  }),
  'src/utils/sessionState.ts': Object.freeze({
    before: '010af86333b3aec7a44c446089ff6a1e03c6fadf270ee3303a3ca61e0f5869d8',
    after: '33b02accdaab9bfad2d36cb6db279d68133bf0e25bd683589c12262f6394fb36',
  }),
})

const MEMORY_PREFIX_GZIP_BASE64 = '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'
const SURVEY_STATE_PREFIX_GZIP_BASE64 = 'H4sIAAAAAAACA7VXS2/bOBC++1dwL7UMCF4De7MTB+ljgQANuqjtw6IIBFqiam1kSiCpZI2u//sOSUmkKEp2UDQHx6Jnvnl9M0Nlx7JgAv1ADNOkOO52Dx/RGaWsOKJpzE6lKKarSdYIVZx8wHm+x/FzKB8+pSmJhfr6laTq/0ZgQVoIRnAsDII4lQRgtmCMxywrxeaAGajysqDcaM1/dyT+guNSzP/hPag/CUmkO5uKvZCTB6kSWc61plLRgtrLW4gxLzhJpug/NC1KQtUX+J9k9Lv6Lg6YPnP9tfUpKpU/6pRX+2MmRCNfPwLkahKDKwJtdu8fH7bRx0+f7/+OHjdg9I/FYlF7s4OEGYe+lCIDHRD5MUHokCVkq8zfp4KwR75EtDruCVvBj4U4EKZV72ORvZC7JdoXRU4wVT/TLxDFEgW4LAkGx2PykCwRFwwcnaHbNXopsgQclpnNOLmRj2utuSE5FHVAN0Rc/UzgxJ/7UXR+KKo82RyKV1NhXVzwP7gKuhOliyKR6d2w7x24ixG4NnRm7q5IzQDDr/UAUkerPLfjtbJZn0BCz6sJ+Ve1Q1rRWJJHtaBhVOAlUugjELAuxTn42NIntOgQjhYvHC5G6M3h5Lz0c3+2VNzn8mhpN6usRY65uDJ1qnS6BTrlhDQkOWkpfjWZje4O5qQf1Q2ygz/ACAvmrCLXQ+ObSoBklFDRP0F1muF6Y2VlHTQTbLYyynaeFMZn66ADNZrDdaBIaIBt1msUmPqB2RzBzBK2nQCxVv6NNuthvFFzdZsdCTNIX4moGN3CIL2R07RIZaxSpqjEug/YLqxAV09/yqQjlKUo6JuaxxVjhIpZLQVOQeex2sSYwkrJn+HzHKJvT1ZAXPaP6sbtgdAPsno6omazBrZfDQGCZhPVyCbQIGhkokWv2NHCwjJo0aLLm/q3rqZJnAqiP0VauJ5ZpSUD7ym5mdg0+/JtyTBrtp8P45XH5U7YFz2UE2TEH0ka1ajot1tzlzBkYYqfhgp2BOq2UTtv91XDIDBrN5YWVGtVD+fAp9RGVY8PLfrkZb8Job8K3r3TExjdyri0qz0SuRRqyN6DCzWYnVi4QMWEcz0n5dpyknzVXNYODTchgDaroE2dtuhNntnfdUCqvPWRzkSScdjA3SIPpaPXUZ1+QgRWrbYwfCWat+ZnPnv9C2lreuhmNL8u8tq91mR/ZAVO0T0iobk8jF0dhny16WJv7Z+gilsQJ2pnY1k0agTfwguX4q618fHQvIPUwqMkt2afazR0Xz+cUsvSuTr9xMsrz4Ux+Gt259XdPdJqw1XtqPfGsru3/Xe8ITZGi/ErX03I10zEB2RpWdnC0IHTE+HTZX3iWYAWRdohF2B+onHndqP/BDt1nts9XMWSABAKfsWZ8L3yXJob8uoxkGjLvbZ5tMGZ4w0auBEEDoQznWzlgSnVak5slBjL5HdhLoIYiPPM/mXPCH5edWpHi7Z0+iApqIgwf47wd5xRq671cvpFab8Qk+X56DT3Fyf0+K3bRo+3hunqQtJrSH1S1C+b3dcz+0ROIPu59z4JfsMb1OR/LGVW1c8SAAA='
const SESSION_STATE_SOURCE_GZIP_BASE64 = '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'

function sha256(source) {
  return crypto.createHash('sha256').update(source).digest('hex')
}

function normalizeTreeRoot(root) {
  assert.ok(root, 'Target111 matrix-extra replay requires a tree or src root')
  const resolved = path.resolve(root)
  const treeRoot = path.basename(resolved) === 'src' ? path.dirname(resolved) : resolved
  assert.ok(
    fs.statSync(path.join(treeRoot, 'src')).isDirectory(),
    `${treeRoot}: expected a source tree containing src/`,
  )
  return treeRoot
}

function decodePostimage(encoded, label) {
  const decoded = gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8')
  assert.ok(decoded.length > 0, `${label}: embedded postimage is non-empty`)
  return decoded
}

function replaceExecutablePrefix(source, encoded, relative) {
  const marker = '//# sourceMappingURL='
  const index = source.indexOf(marker)
  assert.ok(index > 0, `${relative}: expected historical inline source-map marker`)
  assert.equal(
    source.indexOf(marker, index + marker.length),
    -1,
    `${relative}: expected one inline source-map marker`,
  )
  return decodePostimage(encoded, relative) + source.slice(index)
}

function replaceExactOnce(source, before, after, label) {
  const count = source.split(before).length - 1
  assert.equal(count, 1, `${label}: expected one exact historical anchor, found ${count}`)
  return source.replace(before, after)
}

function patchMemorySurvey(source) {
  return replaceExecutablePrefix(
    source,
    MEMORY_PREFIX_GZIP_BASE64,
    'src/components/FeedbackSurvey/useMemorySurvey.tsx',
  )
}

function patchSurveyState(source) {
  return replaceExecutablePrefix(
    source,
    SURVEY_STATE_PREFIX_GZIP_BASE64,
    'src/components/FeedbackSurvey/useSurveyState.tsx',
  )
}

function patchStructuredIO(source) {
  const relative = 'src/cli/structuredIO.ts'
  let next = source
  const replace = (before, after, label) => {
    next = replaceExactOnce(next, before, after, `${relative}: ${label}`)
  }

  // Target101 prerequisites used by trackWrite only.
  replace(
    `import { SDKControlElicitationResponseSchema } from 'src/entrypoints/sdk/controlSchemas.js'`,
    `import {
  SDKControlElicitationResponseSchema,
  StdoutMessageSchema,
} from 'src/entrypoints/sdk/controlSchemas.js'`,
    'stdout schema import',
  )
  replace(
    `import type { CanUseToolFn } from 'src/hooks/useCanUseTool.js'
import type { Tool, ToolUseContext } from 'src/Tool.js'`,
    `import type { CanUseToolFn } from 'src/hooks/useCanUseTool.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import type { Tool, ToolUseContext } from 'src/Tool.js'`,
    'watchdog analytics import',
  )
  replace(
    `const MAX_RESOLVED_TOOL_USE_IDS = 1000`,
    `const MAX_RESOLVED_TOOL_USE_IDS = 1000
const SDK_STALL_TIMEOUT_MS = 300_000
const SDK_SCHEMA_SAMPLE_RATE = 0.01`,
    'Target101 watchdog constants',
  )
  replace(
    `  private readonly resolvedToolUseIds = new Set<string>()
  private prependedLines: string[] = []
  private onControlRequestSent?: (request: SDKControlRequest) => void`,
    `  private readonly resolvedToolUseIds = new Set<string>()
  private prependedLines: string[] = []
  private stallTimer?: NodeJS.Timeout
  private stallFired = false
  private readonly createdAt = Date.now()
  private onControlRequestSent?: (request: SDKControlRequest) => void`,
    'Target101 watchdog fields',
  )

  // Target105 session-scoped state prerequisite used by the Target111 payload.
  replace(
    `import {
  notifySessionStateChanged,
  type RequiresActionDetails,
  type SessionExternalMetadata,
} from '../utils/sessionState.js'`,
    `import {
  type RequiresActionDetails,
  type SessionExternalMetadata,
  SessionStateManager,
} from '../utils/sessionState.js'`,
    'session manager import',
  )
  replace(
    `  private onControlRequestResolved?: (requestId: string) => void

  // sendRequest() and print.ts both enqueue here;`,
    `  private onControlRequestResolved?: (requestId: string) => void
  readonly sessionState: SessionStateManager

  // sendRequest() and print.ts both enqueue here;`,
    'session manager field',
  )
  replace(
    `  constructor(
    private readonly input: AsyncIterable<string>,
    private readonly replayUserMessages?: boolean,
  ) {
    this.input = input
    this.structuredInput = this.read()
  }`,
    `  constructor(
    private readonly input: AsyncIterable<string>,
    private readonly replayUserMessages?: boolean,
    sessionState?: SessionStateManager,
  ) {
    this.input = input
    this.sessionState = sessionState ?? new SessionStateManager()
    this.structuredInput = this.read()
  }`,
    'session manager construction',
  )
  replace(
    `          notifySessionStateChanged('running')`,
    `          this.sessionState.notifyStateChanged('running')`,
    'session manager transition',
  )

  // Target111 exact delta: timer argument captures the message type and emits
  // session state plus pending control-request count. Deliberately no Target116
  // result-message guard and no callback-time running-state early return.
  replace(
    `  async write(message: StdoutMessage): Promise<void> {
    writeToStdout(ndjsonSafeStringify(message) + '\\n')
  }

  private async sendRequest<Response>(`,
    `  async write(message: StdoutMessage): Promise<void> {
    this.trackWrite(message)
    writeToStdout(ndjsonSafeStringify(message) + '\\n')
  }

  protected trackWrite(message: StdoutMessage): void {
    if (this.stallTimer) clearTimeout(this.stallTimer)
    if (!this.stallFired) {
      this.stallTimer = setTimeout(
        lastMessageType => {
          this.stallFired = true
          logEvent('tengu_sdk_stall', {
            session_age_ms: Date.now() - this.createdAt,
            session_state:
              this.sessionState.getState() as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            last_message_type:
              lastMessageType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            pending_control_requests: this.pendingRequests.size,
          })
        },
        SDK_STALL_TIMEOUT_MS,
        message.type,
      )
      this.stallTimer.unref()
    }
    if (message.type !== 'system' && Math.random() < SDK_SCHEMA_SAMPLE_RATE) {
      const parsed = StdoutMessageSchema().safeParse(message)
      if (!parsed.success) {
        logEvent('tengu_sdk_schema_violation', {
          message_type:
            message.type as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          error_path: (parsed.error.issues[0]?.path.join('.') ??
            '') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
      }
    }
  }

  private async sendRequest<Response>(`,
    'Target101 trackWrite plus Target111 metadata delta',
  )
  return next
}

function patchSessionState() {
  return decodePostimage(
    SESSION_STATE_SOURCE_GZIP_BASE64,
    'src/utils/sessionState.ts',
  )
}

const PATCHERS = Object.freeze({
  'src/components/FeedbackSurvey/useMemorySurvey.tsx': patchMemorySurvey,
  'src/components/FeedbackSurvey/useSurveyState.tsx': patchSurveyState,
  'src/cli/structuredIO.ts': patchStructuredIO,
  'src/utils/sessionState.ts': patchSessionState,
})

const REQUIRED_EVIDENCE = Object.freeze({
  'src/components/FeedbackSurvey/useMemorySurvey.tsx': [
    `const MEMORY_SURVEY_PROBABILITY_GATE = 'tengu_velvet_moth';`,
    'function getMemorySurveyProbability(): number',
    'Math.random() >= getMemorySurveyProbability()',
    'Math.random() < getMemorySurveyProbability()',
    'MEMORY_SURVEY_JUDGE_ENABLED = false',
    'otherSurveyActive',
  ],
  'src/components/FeedbackSurvey/useSurveyState.tsx': [
    `| 'pending'`,
    'const handleUndo = useCallback',
    'pendingSubmitTimer',
  ],
  'src/cli/structuredIO.ts': [
    'session_state:',
    'this.sessionState.getState()',
    'last_message_type:',
    'pending_control_requests: this.pendingRequests.size',
    'SDK_STALL_TIMEOUT_MS,\n        message.type,',
  ],
  'src/utils/sessionState.ts': [
    'export class SessionStateManager',
    'getState(): SessionState',
    'const defaultSessionState = new SessionStateManager()',
  ],
})

export function replayTarget111MatrixExtras(root) {
  const treeRoot = normalizeTreeRoot(root)
  const states = new Map()
  const sources = new Map()

  // Package-wide preflight makes mixed, drifted, or partial states fail before
  // any write. This also makes a complete second pass a read-only no-op.
  for (const [relative, hashes] of Object.entries(TARGET111_MATRIX_EXTRA_OWNER_HASHES)) {
    const filename = path.join(treeRoot, relative)
    assert.ok(fs.existsSync(filename), `${relative}: replay owner exists`)
    const source = fs.readFileSync(filename, 'utf8')
    const hash = sha256(source)
    const state = hash === hashes.before ? 'before' : hash === hashes.after ? 'after' : 'unknown'
    assert.notEqual(state, 'unknown', `${relative}: unrecognized or partial owner state (${hash})`)
    states.set(relative, state)
    sources.set(relative, source)
  }

  const uniqueStates = new Set(states.values())
  assert.equal(
    uniqueStates.size,
    1,
    `Target111 matrix-extra package is partially applied: ${JSON.stringify(Object.fromEntries(states))}`,
  )
  if (uniqueStates.has('after')) {
    return {
      changes: [],
      hashes: Object.fromEntries(
        Object.entries(TARGET111_MATRIX_EXTRA_OWNER_HASHES).map(([relative, value]) => [relative, value.after]),
      ),
      treeRoot,
    }
  }

  const candidates = new Map()
  for (const [relative, patcher] of Object.entries(PATCHERS)) {
    const next = patcher(sources.get(relative))
    assert.equal(
      sha256(next),
      TARGET111_MATRIX_EXTRA_OWNER_HASHES[relative].after,
      `${relative}: bounded replay output hash`,
    )
    for (const fragment of REQUIRED_EVIDENCE[relative]) {
      assert.ok(next.includes(fragment), `${relative}: recovered ${fragment}`)
    }
    candidates.set(relative, next)
  }

  const structured = candidates.get('src/cli/structuredIO.ts')
  assert.ok(!structured.includes(`message.type !== 'result'`), 'exclude Target116 result-message guard')
  assert.ok(
    !structured.includes(`this.sessionState.getState() !== 'running'`),
    'exclude Target116 callback-time running-state guard',
  )

  const changes = []
  for (const [relative, next] of candidates) {
    fs.writeFileSync(path.join(treeRoot, relative), next)
    changes.push(relative)
  }
  return {
    changes,
    hashes: Object.fromEntries(
      Object.entries(TARGET111_MATRIX_EXTRA_OWNER_HASHES).map(([relative, value]) => [relative, value.after]),
    ),
    treeRoot,
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2]
  if (!root) throw new Error('usage: replay-target111-matrix-extras.mjs <tree-or-src-root>')
  const first = replayTarget111MatrixExtras(root)
  const second = replayTarget111MatrixExtras(root)
  assert.deepEqual(second.changes, [], 'Target111 matrix-extra replay is idempotent')
  process.stdout.write(`${JSON.stringify(first, null, 2)}\n`)
}
