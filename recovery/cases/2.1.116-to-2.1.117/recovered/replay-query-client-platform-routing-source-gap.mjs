#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_QUERY_CLIENT_PLATFORM_ROUTING_FILES = Object.freeze([
  Object.freeze({
    path: 'src/cost-tracker.ts',
    declaration: 'classifyQuerySource',
    raw: Object.freeze({
      bytes: 11417,
      sha256: 'ff311677594f51e0ae2e1d26df3755e57d5402aec65d1794390d456206b1e42a',
    }),
    postimage: Object.freeze({
      bytes: 11424,
      sha256: '9cad187e0cbd14ed5856c9f68dfdc9ebbdf0842d790de98189dbb7cdc84fc4bb',
    }),
  }),
  Object.freeze({
    path: 'src/query.ts',
    declaration: 'queryLoop',
    raw: Object.freeze({
      bytes: 69219,
      sha256: '630b920b1ea8e34b90c55d80c6f8ac02af08e67dbcef7485c733559fd4b62692',
    }),
    postimage: Object.freeze({
      bytes: 69442,
      sha256: 'fc1fb138cb6d59cff70dd1ec579d766d7c532ed39e1794b3798317b5a676910a',
    }),
  }),
])

const EVIDENCE_IDS = Object.freeze([
  'target117-query-routing-complete-target-unit-proof',
  'target117-query-routing-shared-classifier-proof',
  'target117-query-routing-source-replay-test',
])

export const TARGET117_QUERY_CLIENT_PLATFORM_ROUTING_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:13748`,
      targetIndex: 13748,
      paths: Object.freeze(['src/query.ts', 'src/cost-tracker.ts']),
      declarations: Object.freeze(['queryLoop', 'classifyQuerySource']),
      evidenceIds: EVIDENCE_IDS,
      behavior:
        'Target117 suppresses dump-prompts interception for auxiliary queries through the shared query-source classifier and forwards the tool-use context client platform into the model-call options.',
    }),
  ])

const CLASSIFIER_DECLARATION = 'function classifyQuerySource('
const EXPORTED_CLASSIFIER_DECLARATION = 'export function classifyQuerySource('
const QUERY_IMPORT = "import { count } from './utils/array.js'"
const CLASSIFIER_IMPORT =
  "import { classifyQuerySource } from './cost-tracker.js'"
const RAW_DUMP_PROMPTS = [
  '    const dumpPromptsFetch = config.gates.isAnt',
  '      ? createDumpPromptsFetch(toolUseContext.agentId ?? config.sessionId)',
  '      : undefined',
].join('\n')
const RECOVERED_DUMP_PROMPTS = [
  '    const dumpPromptsFetch =',
  '      config.gates.isAnt &&',
  "      classifyQuerySource(querySource) !== 'auxiliary'",
  '        ? createDumpPromptsFetch(toolUseContext.agentId ?? config.sessionId)',
  '        : undefined',
].join('\n')
const RAW_MODEL_OPTIONS = [
  '              querySource,',
  '              agents: toolUseContext.options.agentDefinitions.activeAgents,',
].join('\n')
const RECOVERED_MODEL_OPTIONS = [
  '              querySource,',
  '              messageClientPlatform:',
  '                toolUseContext.options.messageClientPlatform,',
  '              agents: toolUseContext.options.agentDefinitions.activeAgents,',
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

function replaceOnce(source, before, after, label) {
  const count = occurrenceCount(source, before)
  if (count !== 1) throw new Error(`${label}: expected one replay anchor, got ${count}`)
  return source.replace(before, after)
}

function sourceFilename(sourceRoot, sourcePath) {
  if (!sourcePath.startsWith('src/')) throw new Error(`${sourcePath}: invalid src path`)
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, sourcePath.slice(4))
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${sourcePath}: escapes supplied source root`)
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

function classify(sourceRoot, expected) {
  const filename = sourceFilename(sourceRoot, expected.path)
  const input = readRealFile(filename, expected.path)
  const actual = descriptor(input)
  if (descriptorsEqual(actual, expected.raw)) {
    return { expected, filename, source: input.toString('utf8'), state: 'raw' }
  }
  if (descriptorsEqual(actual, expected.postimage)) {
    return { expected, filename, source: input.toString('utf8'), state: 'postimage' }
  }
  throw new Error(
    `${expected.path}: refusing non-Target117 state ${actual.bytes}/${actual.sha256}`,
  )
}

function recover(file) {
  let output = file.source
  if (file.expected.path === 'src/cost-tracker.ts') {
    output = replaceOnce(
      output,
      CLASSIFIER_DECLARATION,
      EXPORTED_CLASSIFIER_DECLARATION,
      'query-source classifier export',
    )
  } else if (file.expected.path === 'src/query.ts') {
    output = replaceOnce(
      output,
      QUERY_IMPORT,
      `${QUERY_IMPORT}\n${CLASSIFIER_IMPORT}`,
      'query-source classifier import',
    )
    output = replaceOnce(
      output,
      RAW_DUMP_PROMPTS,
      RECOVERED_DUMP_PROMPTS,
      'auxiliary dump-prompts guard',
    )
    output = replaceOnce(
      output,
      RAW_MODEL_OPTIONS,
      RECOVERED_MODEL_OPTIONS,
      'model client-platform forwarding',
    )
  } else {
    throw new Error(`${file.expected.path}: missing replay transform`)
  }
  const bytes = Buffer.from(output)
  const actual = descriptor(bytes)
  if (!descriptorsEqual(actual, file.expected.postimage)) {
    throw new Error(`${file.expected.path}: replay drift ${actual.bytes}/${actual.sha256}`)
  }
  return bytes
}

export function applyTarget117QueryClientPlatformRoutingSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const files = TARGET117_QUERY_CLIENT_PLATFORM_ROUTING_FILES.map(expected =>
    classify(sourceRoot, expected),
  )
  const states = new Set(files.map(file => file.state))
  if (states.size === 1 && states.has('postimage')) {
    return Object.freeze({
      caseName: CASE_NAME,
      status: 'already-recovered',
      files: TARGET117_QUERY_CLIENT_PLATFORM_ROUTING_FILES,
      ownerOverrides: TARGET117_QUERY_CLIENT_PLATFORM_ROUTING_OWNER_OVERRIDES.length,
    })
  }
  if (states.size !== 1 || !states.has('raw')) {
    throw new Error(
      `Refusing mixed Target117 query-routing recovery: ${files.map(file => `${file.expected.path}=${file.state}`).join(', ')}`,
    )
  }
  const outputs = files.map(file => ({ file, output: recover(file) }))
  for (const { file, output } of outputs) fs.writeFileSync(file.filename, output)
  for (const { file } of outputs) {
    if (classify(sourceRoot, file.expected).state !== 'postimage') {
      throw new Error(`${file.expected.path}: written replay did not retain postimage`)
    }
  }
  return Object.freeze({
    caseName: CASE_NAME,
    status: 'recovered',
    files: TARGET117_QUERY_CLIENT_PLATFORM_ROUTING_FILES,
    ownerOverrides: TARGET117_QUERY_CLIENT_PLATFORM_ROUTING_OWNER_OVERRIDES.length,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = applyTarget117QueryClientPlatformRoutingSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
