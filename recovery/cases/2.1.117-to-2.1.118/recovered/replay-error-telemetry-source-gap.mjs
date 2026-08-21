import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const CASE_NAME = '2.1.117-to-2.1.118'
const TARGET_FRAGMENT_EVIDENCE =
  'target118-error-telemetry-source-gap-target-fragment'
const SOURCE_REPLAY_EVIDENCE =
  'target118-error-telemetry-source-gap-source-replay-test'

const FILE = Object.freeze({
  path: 'src/utils/gracefulShutdown.ts',
  before: Object.freeze({
    bytes: 20840,
    sha256: '1cc0c7af7ecb33b345ccc4e3ca76c6b115a0c6dda7b86ccc1f92b495002776ee',
  }),
  after: Object.freeze({
    bytes: 23952,
    sha256: '235cee67b85df57479ee0bd2a3637f0b43469d06128843d73d6671f63a9ad9cb',
  }),
})

const ERROR_METADATA_SOURCE = String.raw`
function shortErrorHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}

function sanitizeErrorMessage(value: string): string {
  return value
    .slice(0, 500)
    .replace(/https?:\/\/\S+/gi, '<url>')
    .replace(/\b[\w.+-]+@[\w.-]+\.\w{2,}\b/g, '<email>')
    .replace(
      /\b(?:sk-ant|sk|pk|ghp|gho|ghs|ghu|github_pat|xox[bpoars])[-_][\w-]{8,}\b/gi,
      '<key>',
    )
    .replace(/[A-Za-z]:\\[^\s"']*/g, '<path>')
    .replace(/\\\\[^\s"']+/g, '<path>')
    .replace(/(?:[^\s"'\\]+\\){2,}[^\s"']+/g, '<path>')
    .replace(/(?:\/[^\s"':]+){2,}/g, '<path>')
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      '<id>',
    )
    .replace(/\b[0-9a-fA-F]{16,}\b/g, '<id>')
    .replace(/\b[A-Za-z0-9+/]{32,}={0,2}/g, '<b64>')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '<ip>')
    .replace(/\b\d{4,}\b/g, '<num>')
}

function parseErrorStack(
  stack: string,
  limit = 5,
): { names: string[]; topFrame?: string } {
  const names: string[] = []
  let topFrame: string | undefined
  for (const line of stack.slice(0, 4000).split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('at ')) continue
    const frame = trimmed.slice(3)
    const parenIndex = frame.indexOf(' (')
    if (topFrame === undefined) {
      const location = (parenIndex !== -1
        ? frame.slice(parenIndex + 2, -1)
        : frame
      ).match(/([^/\\]+:\d+:\d+)\)?$/)
      if (location) topFrame = location[1]
    }
    let name = parenIndex !== -1 ? frame.slice(0, parenIndex) : frame
    name = name.replace(/^async\s+/, '').replace(/^new\s+/, '')
    if (name.includes('/') || name.includes('\\') || /:\d/.test(name)) continue
    if (name) names.push(name)
    if (names.length >= limit) break
  }
  return { names, topFrame }
}

function safeErrorString(value: unknown): string {
  try {
    return String(value)
  } catch {
    return '[unstringifiable]'
  }
}

function getSafeErrorMetadata(error: unknown): Record<string, string> {
  try {
    const value = safeErrorString(
      error instanceof Error ? error.message : error,
    )
    const metadata: Record<string, string> = {
      error_message_hash: shortErrorHash(sanitizeErrorMessage(value)),
    }
    const code = (error as { code?: unknown } | null)?.code
    if (typeof code === 'string' && /^[A-Z][A-Z0-9_]*$/.test(code)) {
      metadata.error_code = code
    }
    if (error instanceof Error) {
      const constructorName = error.constructor?.name
      if (typeof constructorName === 'string') {
        metadata.error_constructor = constructorName
      }
      if (typeof error.stack === 'string') {
        const { names, topFrame } = parseErrorStack(error.stack)
        if (names.length > 0) {
          metadata.error_stack_hash = shortErrorHash(names.join('|'))
        }
        if (topFrame !== undefined) metadata.error_top_frame = topFrame
      }
    }
    return metadata
  } catch {
    return {}
  }
}
`

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function replaceExactly(value, before, after, label) {
  const first = value.indexOf(before)
  const last = value.lastIndexOf(before)
  if (first < 0 || first !== last) {
    throw new Error(`Target118 error telemetry ${label} anchor is not unique`)
  }
  return `${value.slice(0, first)}${after}${value.slice(first + before.length)}`
}

function recover(value) {
  let next = value
  next = replaceExactly(
    next,
    "import chalk from 'chalk'\nimport { writeSync } from 'fs'",
    "import chalk from 'chalk'\nimport { createHash } from 'crypto'\nimport { writeSync } from 'fs'",
    'crypto import',
  )
  next = replaceExactly(
    next,
    "import { profileReport } from './startupProfiler.js'\n\n/**",
    `import { profileReport } from './startupProfiler.js'\n${ERROR_METADATA_SOURCE}\n/**`,
    'helper declarations',
  )
  next = replaceExactly(
    next,
    `      error_name:\n        error.name as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,\n    })`,
    `      error_name:\n        error.name as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,\n      ...getSafeErrorMetadata(error),\n    })`,
    'uncaught exception metadata',
  )
  next = replaceExactly(
    next,
    `      error_name:\n        errorName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,\n    })`,
    `      error_name:\n        errorName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,\n      ...getSafeErrorMetadata(reason),\n    })`,
    'unhandled rejection metadata',
  )
  return next
}

function resolveSourceRoot(root) {
  const absolute = path.resolve(root)
  if (fs.existsSync(path.join(absolute, 'utils/gracefulShutdown.ts'))) {
    return absolute
  }
  if (fs.existsSync(path.join(absolute, FILE.path))) {
    return path.join(absolute, 'src')
  }
  throw new Error('Target118 error telemetry replay source root is missing gracefulShutdown.ts')
}

export const TARGET118_ERROR_TELEMETRY_REPLAY = Object.freeze({
  case: CASE_NAME,
  file: FILE,
})

function override(targetIndex, behavior) {
  return Object.freeze({
    key: `${CASE_NAME}:${targetIndex}`,
    targetIndex,
    paths: Object.freeze([FILE.path]),
    evidenceIds: Object.freeze([
      TARGET_FRAGMENT_EVIDENCE,
      SOURCE_REPLAY_EVIDENCE,
    ]),
    behavior,
  })
}

export const TARGET118_ERROR_TELEMETRY_OWNER_OVERRIDES = Object.freeze([
  override(
    9866,
    'The authenticated Target118 sanitizer redacts URLs, email addresses, credential-like keys, paths, identifiers, base64 payloads, IP addresses, and long numbers before hashing error metadata.',
  ),
  override(
    9867,
    'The authenticated Target118 stack parser extracts bounded function names and the first source-location basename without retaining full paths.',
  ),
  override(
    9869,
    'The authenticated Target118 safe-error metadata collector records bounded hashes, error codes, constructors, stack names, and a redacted top frame for uncaught exceptions and rejected promises.',
  ),
])

export function applyTarget118ErrorTelemetryReplay({ sourceRoot }) {
  const resolved = resolveSourceRoot(sourceRoot)
  const filename = path.join(resolved, FILE.path.replace(/^src\//, ''))
  const value = fs.readFileSync(filename, 'utf8')
  const actual = descriptor(Buffer.from(value))
  if (actual.bytes === FILE.after.bytes && actual.sha256 === FILE.after.sha256) {
    return { state: 'already-recovered', changes: [] }
  }
  if (actual.bytes !== FILE.before.bytes || actual.sha256 !== FILE.before.sha256) {
    throw new Error(
      `Target118 error telemetry replay requires pinned pre/postimage, got ${actual.bytes}/${actual.sha256}`,
    )
  }
  const recovered = recover(value)
  const recoveredDescriptor = descriptor(Buffer.from(recovered))
  if (
    recoveredDescriptor.bytes !== FILE.after.bytes ||
    recoveredDescriptor.sha256 !== FILE.after.sha256
  ) {
    throw new Error(
      `Target118 error telemetry replay produced ${recoveredDescriptor.bytes}/${recoveredDescriptor.sha256}`,
    )
  }
  fs.writeFileSync(filename, recovered)
  return { state: 'recovered', changes: [FILE.path] }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sourceRoot = process.argv[2]
  if (!sourceRoot) {
    throw new Error('usage: replay-error-telemetry-source-gap.mjs <tree-or-src-root>')
  }
  process.stdout.write(
    `${JSON.stringify(applyTarget118ErrorTelemetryReplay({ sourceRoot }))}\n`,
  )
}
