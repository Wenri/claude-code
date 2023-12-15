#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const CASE_NAME = '2.1.118-to-2.1.119'
const GRACEFUL_PATH = 'src/utils/gracefulShutdown.ts'
const PROCESS_PATH = 'src/utils/process.ts'
const PRINT_PATH = 'src/cli/print.ts'

const EVIDENCE_IDS = Object.freeze([
  'target119-graceful-shutdown-output-errors-target-fragment',
  'target119-graceful-shutdown-output-errors-source-replay-test',
  'target119-graceful-shutdown-output-errors-source-ast-test',
  'target119-process-output-error-handler-target-fragment',
])

export const TARGET119_GRACEFUL_SHUTDOWN_OUTPUT_ERRORS_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:10014`,
      targetIndex: 10014,
      paths: Object.freeze([GRACEFUL_PATH, PROCESS_PATH, PRINT_PATH]),
      declarations: Object.freeze([
        'setupGracefulShutdown',
        'registerProcessOutputErrorHandlers',
      ]),
      evidenceIds: EVIDENCE_IDS,
      behavior:
        'The authenticated Target119 shutdown initializer ignores SIGHUP for daemon-backed sessions and centralizes EPIPE/EIO output handling. An interactive stdout loss is logged as stdout_<code> and initiates graceful shutdown; stderr loss and non-interactive stdout loss only destroy the failed stream.',
    }),
  ])

export const TARGET119_GRACEFUL_SHUTDOWN_OUTPUT_ERRORS_INPUT_FILES =
  Object.freeze([
    Object.freeze({
      path: GRACEFUL_PATH,
      bytes: 21881,
      sha256:
        '05be4f92a1a2aded41ccc572f6228bd165d2975eedf7bc0c8cc87fae955f4daf',
    }),
    Object.freeze({
      path: PROCESS_PATH,
      bytes: 2333,
      sha256:
        'b744b56136db7ea40adaa1e00fcc232a67b4d8e9a47582ae1d427153ddff46cc',
    }),
    Object.freeze({
      path: PRINT_PATH,
      bytes: 228505,
      sha256:
        'e4cc8072e34fb6aa64ebd8f7a4a793c55e748b98bc25d9d446426115da264537',
    }),
  ])

export const TARGET119_GRACEFUL_SHUTDOWN_OUTPUT_ERRORS_OUTPUT_FILES =
  Object.freeze([
    Object.freeze({
      path: GRACEFUL_PATH,
      bytes: 22329,
      sha256:
        '4b75ac84c51b5238553775f0e8a9bd54f7789566b2ba57be9a515171c40ebcfe',
    }),
    Object.freeze({
      path: PROCESS_PATH,
      bytes: 2402,
      sha256:
        '0b92cffb381a0f346cf91903f9365170ac5524e647e5934c1d8a8028e33b42d2',
    }),
    Object.freeze({
      path: PRINT_PATH,
      bytes: 228328,
      sha256:
        '036c909aa7ef9278d40e2ceea395eb5aee87eb51dc683e7c5fc270cbaab8c951',
    }),
  ])

const PROCESS_INPUT = `function handleEPIPE(
  stream: NodeJS.WriteStream,
): (err: NodeJS.ErrnoException) => void {
  return (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') {
      stream.destroy()
    }
  }
}

// Prevents memory leak when pipe is broken (e.g., \`claude -p | head -1\`)
export function registerProcessOutputErrorHandlers(): void {
  process.stdout.on('error', handleEPIPE(process.stdout))
  process.stderr.on('error', handleEPIPE(process.stderr))
}
`

const PROCESS_OUTPUT = `// Prevents memory leaks and reports a broken stdout pipe to the global
// shutdown owner (for example, when a parent process exits).
export function registerProcessOutputErrorHandlers(
  onStdoutError: (code: 'EPIPE' | 'EIO') => void,
): void {
  for (const stream of [process.stdout, process.stderr]) {
    stream.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EPIPE' || err.code === 'EIO') {
        stream.destroy()
        if (stream === process.stdout) onStdoutError(err.code)
      }
    })
  }
}
`

const GRACEFUL_IMPORT_INPUT =
  "import { profileReport } from './startupProfiler.js'"
const GRACEFUL_IMPORT_OUTPUT = `import { registerProcessOutputErrorHandlers } from './process.js'
${GRACEFUL_IMPORT_INPUT}`

const GRACEFUL_SIGHUP_INPUT =
  "  if (process.platform !== 'win32') {\n"
const GRACEFUL_SIGHUP_OUTPUT = `  if (process.env.CLAUDE_BG_BACKEND === 'daemon') {
    process.on('SIGHUP', () => {
      logForDiagnosticsNoPII('info', 'shutdown_signal', {
        signal: 'SIGHUP_ignored_bg',
      })
    })
  } else {
`

const GRACEFUL_HANDLER_INPUT = `  }

  // Log uncaught exceptions for container observability and analytics
`
const GRACEFUL_HANDLER_OUTPUT = `  }

  registerProcessOutputErrorHandlers(code => {
    if (!getIsInteractive()) return
    logForDiagnosticsNoPII('info', 'shutdown_signal', {
      signal: \`stdout_\${code}\`,
    })
    void gracefulShutdown(0)
  })

  // Log uncaught exceptions for container observability and analytics
`

const PRINT_IMPORT_INPUT = `import {
  writeToStdout,
  registerProcessOutputErrorHandlers,
} from 'src/utils/process.js'
`
const PRINT_IMPORT_OUTPUT =
  "import { writeToStdout } from 'src/utils/process.js'\n"
const PRINT_CALL_INPUT = `  // Install errors handlers to gracefully handle broken pipes (e.g., when parent process dies)
  registerProcessOutputErrorHandlers()

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

function realFileBytes(filename, label) {
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${CASE_NAME}: ${label} must be a real file`)
  }
  return fs.readFileSync(filename)
}

export function buildTarget119ProcessOutputErrorsOutput(source) {
  return replaceExactly(
    source,
    PROCESS_INPUT,
    PROCESS_OUTPUT,
    'process output-error handler',
  )
}

export function buildTarget119GracefulShutdownOutputErrorsOutput(source) {
  return replaceExactly(
    replaceExactly(
      replaceExactly(
        source,
        GRACEFUL_IMPORT_INPUT,
        GRACEFUL_IMPORT_OUTPUT,
        'graceful-shutdown process import',
      ),
      GRACEFUL_SIGHUP_INPUT,
      GRACEFUL_SIGHUP_OUTPUT,
      'daemon SIGHUP branch',
    ),
    GRACEFUL_HANDLER_INPUT,
    GRACEFUL_HANDLER_OUTPUT,
    'stdout error callback',
  )
}

export function buildTarget119PrintOutputErrorsOutput(source) {
  return replaceExactly(
    replaceExactly(
      source,
      PRINT_IMPORT_INPUT,
      PRINT_IMPORT_OUTPUT,
      'print process import',
    ),
    PRINT_CALL_INPUT,
    '',
    'legacy print-local output handlers',
  )
}

export function applyTarget119GracefulShutdownOutputErrorsSourceRecovery({
  sourceRoot,
}) {
  const transforms = new Map([
    [GRACEFUL_PATH, buildTarget119GracefulShutdownOutputErrorsOutput],
    [PROCESS_PATH, buildTarget119ProcessOutputErrorsOutput],
    [PRINT_PATH, buildTarget119PrintOutputErrorsOutput],
  ])
  const current = TARGET119_GRACEFUL_SHUTDOWN_OUTPUT_ERRORS_INPUT_FILES.map(
    spec => {
      const filename = path.join(sourceRoot, spec.path.replace(/^src\//, ''))
      const bytes = realFileBytes(filename, spec.path)
      return { spec, filename, bytes, state: descriptor(bytes) }
    },
  )
  const output = TARGET119_GRACEFUL_SHUTDOWN_OUTPUT_ERRORS_OUTPUT_FILES
  const allInput = current.every(row => matches(row.state, row.spec))
  const allOutput = current.every((row, index) =>
    matches(row.state, output[index]),
  )
  if (allOutput) return { status: 'already-recovered', files: [] }
  if (!allInput) {
    throw new Error(
      `${CASE_NAME}: graceful-shutdown output-error replay requires its exact all-raw or all-recovered source state`,
    )
  }

  const recovered = current.map((row, index) => {
    const transform = transforms.get(row.spec.path)
    const bytes = Buffer.from(transform(row.bytes.toString('utf8')))
    if (!matches(descriptor(bytes), output[index])) {
      throw new Error(
        `${CASE_NAME}: ${row.spec.path} output-error replay produced unexpected source`,
      )
    }
    return { ...row, bytes }
  })

  for (const row of recovered) fs.writeFileSync(row.filename, row.bytes)
  return { status: 'recovered', files: output.map(file => file.path) }
}
