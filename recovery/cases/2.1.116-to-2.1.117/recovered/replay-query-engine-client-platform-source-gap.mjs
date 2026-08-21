#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'

const QUERY_ENGINE_PATH = 'src/QueryEngine.ts'
const TOOL_PATH = 'src/Tool.ts'

export const TARGET117_QUERY_ENGINE_CLIENT_PLATFORM_QUERY_TRANSITIONS =
  Object.freeze([
    Object.freeze({
      state: 'raw-target117',
      input: Object.freeze({
        path: QUERY_ENGINE_PATH,
        bytes: 48302,
        sha256:
          '85996680c2665a627d61acb4c561f062503ee17e05d5ad0aef51f94418a2bded',
      }),
      output: Object.freeze({
        path: QUERY_ENGINE_PATH,
        bytes: 48439,
        sha256:
          '0583529a3e0b5e5f5e9480415ede6b0fa2fa61b5c51fdc168c6f81262ff62cef',
      }),
    }),
    Object.freeze({
      state: 'historical-owner-recovered',
      input: Object.freeze({
        path: QUERY_ENGINE_PATH,
        bytes: 48368,
        sha256:
          '5e450f5547544190009ef2d14575e4c269a3262e5778cfa46b59cabe0793746a',
      }),
      output: Object.freeze({
        path: QUERY_ENGINE_PATH,
        bytes: 48505,
        sha256:
          'dc919685df388b0d899a073b861c07613bda58b02864cef603c514e44845539c',
      }),
    }),
  ])

export const TARGET117_QUERY_ENGINE_CLIENT_PLATFORM_TOOL_TRANSITION =
  Object.freeze({
    input: Object.freeze({
      path: TOOL_PATH,
      bytes: 30209,
      sha256:
        '3543c14f3551f55c78347bfc4478cf928d98954bcc08c559fcfc966b0c16b266',
    }),
    output: Object.freeze({
      path: TOOL_PATH,
      bytes: 30244,
      sha256:
        '04fd182ba48e1d60c49a6b6a29da6f621bae8158b0a8120bb56bc198f94440e9',
    }),
  })

const EVIDENCE_IDS = Object.freeze([
  'target117-query-engine-client-platform-whole-unit-proof',
  'target117-query-engine-client-platform-type-contract-proof',
  'target117-query-engine-client-platform-source-replay-test',
])

export const TARGET117_QUERY_ENGINE_CLIENT_PLATFORM_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20612`,
      targetIndex: 20612,
      paths: Object.freeze([QUERY_ENGINE_PATH, TOOL_PATH]),
      declarations: Object.freeze(['QueryEngine', 'ToolUseContext']),
      evidenceIds: EVIDENCE_IDS,
      behavior:
        'Target117 carries the inbound client platform into both ProcessUserInputContext option objects; the paired ToolUseContext field and submitMessage option preserve the authenticated runtime contract in typed source.',
    }),
  ])

const RAW_SUBMIT_OPTIONS =
  '    options?: { uuid?: string; isMeta?: boolean },'
const RECOVERED_SUBMIT_OPTIONS =
  '    options?: { uuid?: string; isMeta?: boolean; clientPlatform?: string },'
const RAW_CONTEXT_TAIL = ['        maxBudgetUsd,', '      },'].join('\n')
const RECOVERED_CONTEXT_TAIL = [
  '        maxBudgetUsd,',
  '        messageClientPlatform: options?.clientPlatform,',
  '      },',
].join('\n')
const RAW_TOOL_OPTIONS = [
  '    /** Override querySource for analytics tracking */',
  '    querySource?: QuerySource',
  '    /** Optional callback to get the latest tools (e.g., after MCP servers connect mid-query) */',
].join('\n')
const RECOVERED_TOOL_OPTIONS = [
  '    /** Override querySource for analytics tracking */',
  '    querySource?: QuerySource',
  '    messageClientPlatform?: string',
  '    /** Optional callback to get the latest tools (e.g., after MCP servers connect mid-query) */',
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
    count += 1
    offset += needle.length
  }
  return count
}

function replaceExactly(source, before, after, expectedCount, label) {
  const count = occurrenceCount(source, before)
  if (count !== expectedCount) {
    throw new Error(`${label}: expected ${expectedCount} anchors, got ${count}`)
  }
  return source.split(before).join(after)
}

function sourceFilename(sourceRoot, sourcePath) {
  if (!sourcePath.startsWith('src/')) {
    throw new Error(`${sourcePath}: expected a normalized src path`)
  }
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, sourcePath.slice(4))
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${sourcePath}: escapes supplied source root`)
  }
  return filename
}

function readRealFile(sourceRoot, sourcePath) {
  const filename = sourceFilename(sourceRoot, sourcePath)
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${sourcePath}: expected a real source file`)
  }
  return { filename, bytes: fs.readFileSync(filename) }
}

function queryTransitionFor(identity, field) {
  return TARGET117_QUERY_ENGINE_CLIENT_PLATFORM_QUERY_TRANSITIONS.find(
    transition => descriptorsEqual(identity, transition[field]),
  )
}

function recoverQueryEngine(source) {
  let output = replaceExactly(
    source,
    RAW_SUBMIT_OPTIONS,
    RECOVERED_SUBMIT_OPTIONS,
    1,
    'QueryEngine submitMessage client-platform option',
  )
  output = replaceExactly(
    output,
    RAW_CONTEXT_TAIL,
    RECOVERED_CONTEXT_TAIL,
    2,
    'QueryEngine ProcessUserInputContext client-platform options',
  )
  return output
}

function recoverTool(source) {
  return replaceExactly(
    source,
    RAW_TOOL_OPTIONS,
    RECOVERED_TOOL_OPTIONS,
    1,
    'ToolUseContext client-platform option',
  )
}

export function applyTarget117QueryEngineClientPlatformSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')

  const query = readRealFile(sourceRoot, QUERY_ENGINE_PATH)
  const tool = readRealFile(sourceRoot, TOOL_PATH)
  const queryIdentity = descriptor(query.bytes)
  const toolIdentity = descriptor(tool.bytes)
  const queryInput = queryTransitionFor(queryIdentity, 'input')
  const queryOutput = queryTransitionFor(queryIdentity, 'output')
  const toolIsInput = descriptorsEqual(
    toolIdentity,
    TARGET117_QUERY_ENGINE_CLIENT_PLATFORM_TOOL_TRANSITION.input,
  )
  const toolIsOutput = descriptorsEqual(
    toolIdentity,
    TARGET117_QUERY_ENGINE_CLIENT_PLATFORM_TOOL_TRANSITION.output,
  )

  if (queryOutput && toolIsOutput) {
    return Object.freeze({
      caseName: CASE_NAME,
      status: 'already-recovered',
      sourceState: queryOutput.state,
      files: Object.freeze([
        queryOutput.output,
        TARGET117_QUERY_ENGINE_CLIENT_PLATFORM_TOOL_TRANSITION.output,
      ]),
      ownerOverrides:
        TARGET117_QUERY_ENGINE_CLIENT_PLATFORM_OWNER_OVERRIDES.length,
    })
  }

  if (!queryInput || !toolIsInput) {
    throw new Error(
      `Refusing mixed or non-Target117 query-engine client-platform recovery: ${QUERY_ENGINE_PATH}=${queryIdentity.bytes}/${queryIdentity.sha256}, ${TOOL_PATH}=${toolIdentity.bytes}/${toolIdentity.sha256}`,
    )
  }

  const queryOutputBytes = Buffer.from(
    recoverQueryEngine(query.bytes.toString('utf8')),
  )
  const toolOutputBytes = Buffer.from(recoverTool(tool.bytes.toString('utf8')))
  const recoveredQuery = descriptor(queryOutputBytes)
  const recoveredTool = descriptor(toolOutputBytes)
  if (!descriptorsEqual(recoveredQuery, queryInput.output)) {
    throw new Error(
      `${QUERY_ENGINE_PATH}: replay drift from ${queryInput.state}; expected ${queryInput.output.bytes}/${queryInput.output.sha256}, got ${recoveredQuery.bytes}/${recoveredQuery.sha256}`,
    )
  }
  if (
    !descriptorsEqual(
      recoveredTool,
      TARGET117_QUERY_ENGINE_CLIENT_PLATFORM_TOOL_TRANSITION.output,
    )
  ) {
    const expected = TARGET117_QUERY_ENGINE_CLIENT_PLATFORM_TOOL_TRANSITION.output
    throw new Error(
      `${TOOL_PATH}: replay drift; expected ${expected.bytes}/${expected.sha256}, got ${recoveredTool.bytes}/${recoveredTool.sha256}`,
    )
  }

  fs.writeFileSync(query.filename, queryOutputBytes)
  fs.writeFileSync(tool.filename, toolOutputBytes)

  const writtenQuery = descriptor(readRealFile(sourceRoot, QUERY_ENGINE_PATH).bytes)
  const writtenTool = descriptor(readRealFile(sourceRoot, TOOL_PATH).bytes)
  if (
    !descriptorsEqual(writtenQuery, queryInput.output) ||
    !descriptorsEqual(
      writtenTool,
      TARGET117_QUERY_ENGINE_CLIENT_PLATFORM_TOOL_TRANSITION.output,
    )
  ) {
    throw new Error('QueryEngine client-platform replay did not retain postimages')
  }

  return Object.freeze({
    caseName: CASE_NAME,
    status: 'recovered',
    sourceState: queryInput.state,
    files: Object.freeze([
      queryInput.output,
      TARGET117_QUERY_ENGINE_CLIENT_PLATFORM_TOOL_TRANSITION.output,
    ]),
    ownerOverrides:
      TARGET117_QUERY_ENGINE_CLIENT_PLATFORM_OWNER_OVERRIDES.length,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = applyTarget117QueryEngineClientPlatformSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
