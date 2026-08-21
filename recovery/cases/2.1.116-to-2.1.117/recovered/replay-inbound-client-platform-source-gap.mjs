#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_INBOUND_CLIENT_PLATFORM_RAW_FILE = Object.freeze({
  path: 'src/bridge/inboundMessages.ts',
  bytes: 2727,
  sha256: 'b6fbd085bb77ab2f4b8e7e5377a945e0d9625426691bfa3cc3b75584844f6ffc',
})

export const TARGET117_INBOUND_CLIENT_PLATFORM_POSTIMAGE = Object.freeze({
  path: 'src/bridge/inboundMessages.ts',
  bytes: 2946,
  sha256: 'd34bd33f96f3fff30da98493a616b081d150a109534a65649b860c24533cb993',
})

const TARGET_UNIT_EVIDENCE =
  'target117-inbound-client-platform-target-unit-proof'
const LATER_DONOR_EVIDENCE =
  'target117-inbound-client-platform-later-donor-proof'
const SOURCE_REPLAY_EVIDENCE =
  'target117-inbound-client-platform-source-replay-test'

export const TARGET117_INBOUND_CLIENT_PLATFORM_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:18561`,
    targetIndex: 18561,
    paths: Object.freeze(['src/bridge/inboundMessages.ts']),
    declarations: Object.freeze(['extractInboundMessageFields']),
    evidenceIds: Object.freeze([
      TARGET_UNIT_EVIDENCE,
      LATER_DONOR_EVIDENCE,
      SOURCE_REPLAY_EVIDENCE,
    ]),
    behavior:
      'Target117 inbound user-message extraction admits client_platform only when it is a string and returns it as clientPlatform alongside normalized content and the optional UUID.',
  }),
])

const RAW_RETURN_TYPE =
  '  | { content: string | Array<ContentBlockParam>; uuid: UUID | undefined }'
const POST_RETURN_TYPE = [
  '  | {',
  '      content: string | Array<ContentBlockParam>',
  '      uuid: UUID | undefined',
  '      clientPlatform: string | undefined',
  '    }',
].join('\n')
const UUID_BLOCK = [
  '  const uuid =',
  "    'uuid' in msg && typeof msg.uuid === 'string'",
  '      ? (msg.uuid as UUID)',
  '      : undefined',
].join('\n')
const CLIENT_PLATFORM_BLOCK = [
  '  const clientPlatform =',
  "    'client_platform' in msg && typeof msg.client_platform === 'string'",
  '      ? msg.client_platform',
  '      : undefined',
].join('\n')
const RAW_RETURN_FIELDS = [
  '    content: Array.isArray(content) ? normalizeImageBlocks(content) : content,',
  '    uuid,',
].join('\n')
const POST_RETURN_FIELDS = `${RAW_RETURN_FIELDS}\n    clientPlatform,`

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

function classifySource(input) {
  const source = input.toString('utf8')
  const actual = descriptor(input)
  const facts = {
    rawReturnType: occurrenceCount(source, RAW_RETURN_TYPE),
    postReturnType: occurrenceCount(source, POST_RETURN_TYPE),
    uuidBlock: occurrenceCount(source, UUID_BLOCK),
    clientPlatformBlock: occurrenceCount(source, CLIENT_PLATFORM_BLOCK),
    rawReturnFields: occurrenceCount(source, RAW_RETURN_FIELDS),
    postReturnFields: occurrenceCount(source, POST_RETURN_FIELDS),
  }
  if (
    descriptorsEqual(actual, TARGET117_INBOUND_CLIENT_PLATFORM_RAW_FILE) &&
    facts.rawReturnType === 1 &&
    facts.postReturnType === 0 &&
    facts.uuidBlock === 1 &&
    facts.clientPlatformBlock === 0 &&
    facts.rawReturnFields === 1 &&
    facts.postReturnFields === 0
  ) {
    return { source, state: 'raw' }
  }
  if (
    descriptorsEqual(actual, TARGET117_INBOUND_CLIENT_PLATFORM_POSTIMAGE) &&
    facts.rawReturnType === 0 &&
    facts.postReturnType === 1 &&
    facts.uuidBlock === 1 &&
    facts.clientPlatformBlock === 1 &&
    facts.rawReturnFields === 1 &&
    facts.postReturnFields === 1
  ) {
    return { source, state: 'postimage' }
  }
  throw new Error(
    `${TARGET117_INBOUND_CLIENT_PLATFORM_RAW_FILE.path}: refusing mixed or non-Target117 state ${actual.bytes}/${actual.sha256} ${JSON.stringify(facts)}`,
  )
}

export function applyTarget117InboundClientPlatformSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const sourcePath = TARGET117_INBOUND_CLIENT_PLATFORM_RAW_FILE.path
  const filename = sourceFilename(sourceRoot, sourcePath)
  const input = readRealFile(filename, sourcePath)
  const classified = classifySource(input)
  if (classified.state === 'postimage') {
    return Object.freeze({
      caseName: CASE_NAME,
      status: 'already-recovered',
      file: TARGET117_INBOUND_CLIENT_PLATFORM_POSTIMAGE,
      ownerOverrides: TARGET117_INBOUND_CLIENT_PLATFORM_OWNER_OVERRIDES.length,
    })
  }

  let output = replaceOnce(
    classified.source,
    RAW_RETURN_TYPE,
    POST_RETURN_TYPE,
    'inbound return type',
  )
  output = replaceOnce(
    output,
    UUID_BLOCK,
    `${UUID_BLOCK}\n${CLIENT_PLATFORM_BLOCK}`,
    'inbound client_platform extraction',
  )
  output = replaceOnce(
    output,
    RAW_RETURN_FIELDS,
    POST_RETURN_FIELDS,
    'inbound clientPlatform return field',
  )
  const outputBytes = Buffer.from(output)
  if (classifySource(outputBytes).state !== 'postimage') {
    throw new Error('inbound client_platform replay did not converge')
  }

  fs.writeFileSync(filename, outputBytes)
  const written = readRealFile(filename, sourcePath)
  if (classifySource(written).state !== 'postimage') {
    throw new Error('Written inboundMessages.ts lost the Target117 postimage')
  }

  return Object.freeze({
    caseName: CASE_NAME,
    status: 'recovered',
    file: TARGET117_INBOUND_CLIENT_PLATFORM_POSTIMAGE,
    ownerOverrides: TARGET117_INBOUND_CLIENT_PLATFORM_OWNER_OVERRIDES.length,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = applyTarget117InboundClientPlatformSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
