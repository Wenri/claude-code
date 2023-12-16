#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_SDK_CLIENT_PLATFORM_SCHEMA_RAW_FILE = Object.freeze({
  path: 'src/entrypoints/sdk/coreSchemas.ts',
  bytes: 57215,
  sha256: '82c3611591774b5f4c5a90563e8127426cd0eedca9e874e9c5f718c4ef59cf7d',
})

export const TARGET117_SDK_CLIENT_PLATFORM_SCHEMA_POSTIMAGE = Object.freeze({
  path: 'src/entrypoints/sdk/coreSchemas.ts',
  bytes: 57512,
  sha256: 'b12ebde2b97e2f4fb7b55f912b75f98009163d3933cc7a4a63feaed559777a9a',
})

const TARGET_UNIT_EVIDENCE =
  'target117-sdk-client-platform-schema-target-unit-proof'
const LATER_DONOR_EVIDENCE =
  'target117-sdk-client-platform-schema-later-donor-proof'
const SOURCE_REPLAY_EVIDENCE =
  'target117-sdk-client-platform-schema-source-replay-test'

export const TARGET117_SDK_CLIENT_PLATFORM_SCHEMA_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:9971`,
      targetIndex: 9971,
      paths: Object.freeze(['src/entrypoints/sdk/coreSchemas.ts']),
      declarations: Object.freeze(['SDKUserMessageContentSchema']),
      evidenceIds: Object.freeze([
        TARGET_UNIT_EVIDENCE,
        LATER_DONOR_EVIDENCE,
        SOURCE_REPLAY_EVIDENCE,
      ]),
      behavior:
        'Target117 SDK user-message validation accepts an optional string client_platform field and documents that CCR ingress injects it from anthropic-client-platform.',
    }),
  ])

const INSERTION_ANCHOR =
  "    priority: z.enum(['now', 'next', 'later']).optional(),\n"
const CLIENT_PLATFORM_PROPERTY = [
  '    client_platform: z',
  '      .string()',
  '      .optional()',
  '      .describe(',
  "        '@internal The `anthropic-client-platform` value of the client that sent this message (e.g. `ios`, `android`, `web_claude_ai`, `desktop_app`). Injected server-side by CCR ingress from the request header.',",
  '      ),',
  '',
].join('\n')

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

function classifySource(input) {
  const source = input.toString('utf8')
  const actual = descriptor(input)
  const facts = {
    anchor: occurrenceCount(source, INSERTION_ANCHOR),
    property: occurrenceCount(source, CLIENT_PLATFORM_PROPERTY),
    propertyName: occurrenceCount(source, '    client_platform: z\n'),
    description: occurrenceCount(
      source,
      '@internal The `anthropic-client-platform` value of the client that sent this message',
    ),
  }
  if (
    descriptorsEqual(actual, TARGET117_SDK_CLIENT_PLATFORM_SCHEMA_RAW_FILE) &&
    facts.anchor === 1 &&
    facts.property === 0 &&
    facts.propertyName === 0 &&
    facts.description === 0
  ) {
    return { source, state: 'raw' }
  }
  if (
    descriptorsEqual(actual, TARGET117_SDK_CLIENT_PLATFORM_SCHEMA_POSTIMAGE) &&
    facts.anchor === 1 &&
    facts.property === 1 &&
    facts.propertyName === 1 &&
    facts.description === 1
  ) {
    return { source, state: 'postimage' }
  }
  throw new Error(
    `${TARGET117_SDK_CLIENT_PLATFORM_SCHEMA_RAW_FILE.path}: refusing mixed or non-Target117 state ${actual.bytes}/${actual.sha256} ${JSON.stringify(facts)}`,
  )
}

export function applyTarget117SdkClientPlatformSchemaSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const sourcePath = TARGET117_SDK_CLIENT_PLATFORM_SCHEMA_RAW_FILE.path
  const filename = sourceFilename(sourceRoot, sourcePath)
  const input = readRealFile(filename, sourcePath)
  const classified = classifySource(input)
  if (classified.state === 'postimage') {
    return Object.freeze({
      caseName: CASE_NAME,
      status: 'already-recovered',
      file: TARGET117_SDK_CLIENT_PLATFORM_SCHEMA_POSTIMAGE,
      ownerOverrides:
        TARGET117_SDK_CLIENT_PLATFORM_SCHEMA_OWNER_OVERRIDES.length,
    })
  }

  const output = classified.source.replace(
    INSERTION_ANCHOR,
    `${INSERTION_ANCHOR}${CLIENT_PLATFORM_PROPERTY}`,
  )
  const outputBytes = Buffer.from(output)
  if (classifySource(outputBytes).state !== 'postimage') {
    throw new Error('SDK client-platform schema replay did not converge')
  }

  fs.writeFileSync(filename, outputBytes)
  const written = readRealFile(filename, sourcePath)
  if (classifySource(written).state !== 'postimage') {
    throw new Error('Written coreSchemas.ts lost the Target117 postimage')
  }

  return Object.freeze({
    caseName: CASE_NAME,
    status: 'recovered',
    file: TARGET117_SDK_CLIENT_PLATFORM_SCHEMA_POSTIMAGE,
    ownerOverrides: TARGET117_SDK_CLIENT_PLATFORM_SCHEMA_OWNER_OVERRIDES.length,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = applyTarget117SdkClientPlatformSchemaSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
