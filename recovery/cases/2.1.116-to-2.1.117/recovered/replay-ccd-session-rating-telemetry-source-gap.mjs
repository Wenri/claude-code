#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_CCD_SESSION_RATING_CONTEXT_FILE = Object.freeze({
  path: 'src/services/mcp/vscodeSdkMcp.ts',
  bytes: 3703,
  sha256: '2d2455646d37f074bd364d6b97b28e3d0114e74b1939d34b2e18919c2b30fcb6',
})

export const TARGET117_CCD_SESSION_RATING_RAW_PRINT_FILE = Object.freeze({
  path: 'src/cli/print.ts',
  bytes: 218976,
  sha256: 'e491160d1a4c417756b97fd921955d4af4007b851043381c83cc819beeafc690',
})

export const TARGET117_CCD_SESSION_RATING_RAW_PRINT_POSTIMAGE = Object.freeze({
  path: 'src/cli/print.ts',
  bytes: 219084,
  sha256: '3a66a2aa9704bf3cfed0c230f5261ecb724a2326acb5d8c94dcaeeb4d948e24f',
})

export const TARGET117_CCD_SESSION_RATING_RECOVERED_FILE = Object.freeze({
  path: 'src/services/mcp/ccdSessionMcp.ts',
  bytes: 1370,
  sha256: '51b662f0e9656420676a3554e23728f2bbbcfeb4b1f4428595920b1e8feab6b0',
})

const TARGET_FRAGMENT_EVIDENCE =
  'target117-ccd-session-rating-target-module-and-call-fragments'
const BASELINE_ABSENCE_EVIDENCE =
  'target116-ccd-session-rating-module-absence-test'
const SOURCE_REPLAY_EVIDENCE =
  'target117-ccd-session-rating-source-replay-test'

export const TARGET117_CCD_SESSION_RATING_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:20623`,
    targetIndex: 20623,
    paths: Object.freeze(['src/services/mcp/ccdSessionMcp.ts']),
    declarations: Object.freeze([
      'CCD_ALLOWED_EVENTS',
      'setupCcdSessionMcp',
    ]),
    evidenceIds: Object.freeze([
      TARGET_FRAGMENT_EVIDENCE,
      BASELINE_ABSENCE_EVIDENCE,
      SOURCE_REPLAY_EVIDENCE,
    ]),
    behavior:
      'Target117 registers the log_event notification schema only on the connected ccd_session SDK client, admits only tengu_message_rated, normalizes its three string fields, and coerces cleared to a strict boolean before forwarding the event to analytics.',
  }),
])

const CCD_SESSION_RATING_SOURCE = [
  'import {',
  '  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,',
  '  logEvent,',
  "} from '../analytics/index.js'",
  "import { LogEventNotificationSchema } from './vscodeSdkMcp.js'",
  "import type { MCPServerConnection } from './types.js'",
  '',
  "const CCD_ALLOWED_EVENTS = new Set(['tengu_message_rated'])",
  '',
  'export function setupCcdSessionMcp(',
  '  sdkClients: MCPServerConnection[],',
  '): void {',
  "  const client = sdkClients.find(client => client.name === 'ccd_session')",
  "  if (!client || client.type !== 'connected') return",
  '',
  '  client.client.setNotificationHandler(',
  '    LogEventNotificationSchema(),',
  '    async notification => {',
  '      const { eventName, eventData } = notification.params',
  '      if (!CCD_ALLOWED_EVENTS.has(eventName)) return',
  '',
  '      const data = eventData as Record<string, unknown>',
  '      const asString = (value: unknown): string | undefined =>',
  '        value == null ? undefined : String(value)',
  '',
  '      logEvent(eventName, {',
  '        message_uuid: asString(',
  '          data.message_uuid,',
  '        ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,',
  '        sentiment: asString(',
  '          data.sentiment,',
  '        ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,',
  '        surface: asString(',
  '          data.surface,',
  '        ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,',
  '        cleared: data.cleared === true,',
  '      })',
  '    },',
  '  )',
  '}',
  '',
].join('\n')

const VSCODE_IMPORT =
  "import { setupVscodeSdkMcp } from 'src/services/mcp/vscodeSdkMcp.js'"
const CCD_IMPORT =
  "import { setupCcdSessionMcp } from 'src/services/mcp/ccdSessionMcp.js'"
const VSCODE_SETUP_CALL = '      setupVscodeSdkMcp(sdkClients)'
const CCD_SETUP_CALL = '      setupCcdSessionMcp(sdkClients)'
const UPDATE_FUNCTION_START = '  async function updateSdkMcp() {'
const UPDATE_FUNCTION_END = '\n  }\n\n  void updateSdkMcp()'
const RAW_UPDATE_REGION = Object.freeze({
  bytes: 2719,
  sha256: '378723dcdb8fdd3f7ee527d1038feadc59ca6360c0858a8da31abea0814582ac',
})
const RECOVERED_UPDATE_REGION = Object.freeze({
  bytes: 2756,
  sha256: 'f5be7e000c12ba09f8c5bbdcab29fa76b4940dceefd67060de0264d95e367f93',
})

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function descriptorsEqual(left, right) {
  return left.bytes === right.bytes && left.sha256 === right.sha256
}

function occurrenceCount(source, needle) {
  let count = 0
  let offset = 0
  while ((offset = source.indexOf(needle, offset)) !== -1) {
    count++
    offset += needle.length
  }
  return count
}

function replaceOnce(source, before, after, label) {
  const count = occurrenceCount(source, before)
  if (count !== 1) {
    throw new Error(`${label}: expected one input anchor, got ${count}`)
  }
  return source.replace(before, after)
}

function sourceFilename(sourceRoot, sourcePath) {
  if (!sourcePath.startsWith('src/')) {
    throw new Error(`${sourcePath}: expected a normalized src path`)
  }
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, sourcePath.slice(4))
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${sourcePath}: escapes the supplied source root`)
  }
  return filename
}

function readRealFile(filename, sourcePath) {
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${sourcePath}: expected a real source file`)
  }
  return fs.readFileSync(filename)
}

function boundedUpdateRegion(source) {
  const start = source.indexOf(UPDATE_FUNCTION_START)
  const secondStart = source.indexOf(UPDATE_FUNCTION_START, start + 1)
  const endAnchor = source.indexOf(UPDATE_FUNCTION_END, start)
  const secondEnd = source.indexOf(UPDATE_FUNCTION_END, endAnchor + 1)
  if (start < 0 || secondStart >= 0 || endAnchor < 0 || secondEnd >= 0) {
    throw new Error(
      'src/cli/print.ts: expected one bounded updateSdkMcp declaration',
    )
  }
  return Buffer.from(
    source.slice(start, endAnchor + '\n  }\n'.length),
  )
}

function classifyPrint(input) {
  const source = input.toString('utf8')
  if (occurrenceCount(source, VSCODE_IMPORT) !== 1) {
    throw new Error('src/cli/print.ts: expected one VSCode MCP import anchor')
  }
  if (occurrenceCount(source, VSCODE_SETUP_CALL) !== 1) {
    throw new Error('src/cli/print.ts: expected one VSCode MCP setup anchor')
  }

  const importCount = occurrenceCount(source, CCD_IMPORT)
  const callCount = occurrenceCount(source, CCD_SETUP_CALL)
  const region = descriptor(boundedUpdateRegion(source))
  if (
    importCount === 0 &&
    callCount === 0 &&
    descriptorsEqual(region, RAW_UPDATE_REGION)
  ) {
    return { source, state: 'raw' }
  }
  if (
    importCount === 1 &&
    callCount === 1 &&
    descriptorsEqual(region, RECOVERED_UPDATE_REGION)
  ) {
    return { source, state: 'postimage' }
  }
  throw new Error(
    `src/cli/print.ts: refusing mixed or non-target CCD setup state imports=${importCount}, calls=${callCount}, region=${region.bytes}/${region.sha256}`,
  )
}

function classifyRecoveredFile(sourceRoot) {
  const expected = TARGET117_CCD_SESSION_RATING_RECOVERED_FILE
  const filename = sourceFilename(sourceRoot, expected.path)
  if (!fs.existsSync(filename)) return { filename, state: 'raw' }
  const actual = descriptor(readRealFile(filename, expected.path))
  if (descriptorsEqual(actual, expected)) {
    return { filename, state: 'postimage' }
  }
  throw new Error(
    `${expected.path}: expected absent or recovered ${expected.bytes}/${expected.sha256}, got ${actual.bytes}/${actual.sha256}`,
  )
}

export function applyTarget117CcdSessionRatingTelemetrySourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')

  const context = TARGET117_CCD_SESSION_RATING_CONTEXT_FILE
  const contextFilename = sourceFilename(sourceRoot, context.path)
  if (!fs.existsSync(contextFilename)) {
    throw new Error(`${context.path}: required source context is absent`)
  }
  const contextActual = descriptor(readRealFile(contextFilename, context.path))
  if (!descriptorsEqual(contextActual, context)) {
    throw new Error(
      `${context.path}: refusing non-target schema context ${contextActual.bytes}/${contextActual.sha256}`,
    )
  }

  const printPath = TARGET117_CCD_SESSION_RATING_RAW_PRINT_FILE.path
  const printFilename = sourceFilename(sourceRoot, printPath)
  const printInput = readRealFile(printFilename, printPath)
  const print = classifyPrint(printInput)
  const recovered = classifyRecoveredFile(sourceRoot)

  if (print.state === 'postimage' && recovered.state === 'postimage') {
    return Object.freeze({
      caseName: CASE_NAME,
      status: 'already-recovered',
      files: Object.freeze([
        TARGET117_CCD_SESSION_RATING_RAW_PRINT_POSTIMAGE,
        TARGET117_CCD_SESSION_RATING_RECOVERED_FILE,
      ]),
      ownerOverrides: TARGET117_CCD_SESSION_RATING_OWNER_OVERRIDES.length,
    })
  }
  if (print.state !== 'raw' || recovered.state !== 'raw') {
    throw new Error(
      `Refusing mixed CCD session rating recovery: print=${print.state}, module=${recovered.state}`,
    )
  }

  let printOutput = replaceOnce(
    print.source,
    VSCODE_IMPORT,
    `${VSCODE_IMPORT}\n${CCD_IMPORT}`,
    'CCD session rating import',
  )
  printOutput = replaceOnce(
    printOutput,
    VSCODE_SETUP_CALL,
    `${VSCODE_SETUP_CALL}\n${CCD_SETUP_CALL}`,
    'CCD session rating setup call',
  )
  const printOutputBytes = Buffer.from(printOutput)
  const printOutputState = classifyPrint(printOutputBytes)
  if (printOutputState.state !== 'postimage') {
    throw new Error('src/cli/print.ts: recovered local state did not converge')
  }

  const moduleOutput = Buffer.from(CCD_SESSION_RATING_SOURCE)
  const moduleDescriptor = descriptor(moduleOutput)
  if (
    !descriptorsEqual(
      moduleDescriptor,
      TARGET117_CCD_SESSION_RATING_RECOVERED_FILE,
    )
  ) {
    throw new Error(
      `CCD session module replay drift: ${moduleDescriptor.bytes}/${moduleDescriptor.sha256}`,
    )
  }

  fs.mkdirSync(path.dirname(recovered.filename), { recursive: true })
  fs.writeFileSync(recovered.filename, moduleOutput)
  fs.writeFileSync(printFilename, printOutputBytes)

  const writtenModule = descriptor(
    readRealFile(
      recovered.filename,
      TARGET117_CCD_SESSION_RATING_RECOVERED_FILE.path,
    ),
  )
  if (
    !descriptorsEqual(
      writtenModule,
      TARGET117_CCD_SESSION_RATING_RECOVERED_FILE,
    )
  ) {
    throw new Error(
      `Written CCD session module mismatch ${writtenModule.bytes}/${writtenModule.sha256}`,
    )
  }
  if (classifyPrint(readRealFile(printFilename, printPath)).state !== 'postimage') {
    throw new Error('Written src/cli/print.ts did not retain the postimage state')
  }

  return Object.freeze({
    caseName: CASE_NAME,
    status: 'recovered',
    files: Object.freeze([
      TARGET117_CCD_SESSION_RATING_RAW_PRINT_POSTIMAGE,
      TARGET117_CCD_SESSION_RATING_RECOVERED_FILE,
    ]),
    ownerOverrides: TARGET117_CCD_SESSION_RATING_OWNER_OVERRIDES.length,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = applyTarget117CcdSessionRatingTelemetrySourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
