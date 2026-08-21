#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'
const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url))

const PATCH_INPUTS = Object.freeze({
  target118: Object.freeze({
    path:
      'recovery/cases/2.1.117-to-2.1.118/recovered/source-facing-overlay.patch',
    bytes: 3865180,
    sha256:
      'fc47a3190c81fc255b9e497af3cb95eb97ef6371ea359fb4c12a7e16f82500d4',
  }),
  target119: Object.freeze({
    path:
      'recovery/cases/2.1.118-to-2.1.119/recovered/source-facing-overlay.patch',
    bytes: 2709667,
    sha256:
      '623cfd2740598d7a6f7cc0a7f72bfebd5000eeae13d6ccb3295f594b0abef794',
  }),
  target121: Object.freeze({
    path:
      'recovery/cases/2.1.120-to-2.1.121/recovered/source-facing-overlay.patch',
    bytes: 2747802,
    sha256:
      '5b201d69885f58a92ca64522b547594021494c950ed046bd3876f396cfab8acb',
  }),
})

function freezeFile(file) {
  return Object.freeze({ ...file })
}

function freezeOverride(override) {
  return Object.freeze({
    ...override,
    paths: Object.freeze([...override.paths]),
    evidenceIds: Object.freeze([...override.evidenceIds]),
  })
}

export const TARGET117_HISTORICAL_GAP_INPUT_FILES = Object.freeze(
  [
    ['src/QueryEngine.ts', 48302, '85996680c2665a627d61acb4c561f062503ee17e05d5ad0aef51f94418a2bded'],
    ['src/bridge/remoteBridgeCore.ts', 41779, '791572fabbb2d1e82dddb26d2b4caec829ef79f9eeacfff9ed6b99b4becfca40'],
    ['src/constants/prompts.ts', 54082, 'd7bf7589b1c1f012e4cd3a0b6b1fd3d47f2678048e6704030977c10997ba6b7e'],
    ['src/hooks/unifiedSuggestions.ts', 14245, '0a18ce1984177ba2467d5b2ccd186a34fbc4693123d9b04c85baaba6c0b56136'],
    ['src/hooks/useReplBridge.tsx', 115707, '3bd8acf68e842d5a22663eaaea82be12f1e3f285b9e540f05a21931aa4d2e80d'],
    ['src/services/api/claude.ts', 131940, '3cf4bfae89cd1c3d747846ba740487bf716d4f2f4b2d449eb9ca12261d63c21c'],
    ['src/services/api/logging.ts', 25148, '0bd5dc5e86b89200d263a6574dea606217b52d826000f4c0a828d0882001f427'],
    ['src/services/compact/microCompact.ts', 19544, '4509572de2be2f8024820df3e1e1f79e32074c708e56b3f5de0b37764f0d7bf2'],
    ['src/services/tips/tipRegistry.ts', 23617, 'e3a0e88a28908635fee2faf2a437de655826f50934e70d1b9d13cc78e551356a'],
    ['src/services/tools/toolExecution.ts', 60399, '06fc2530da78a674ba820835d601639a29711f7df7ee38dca746a3701588d0f3'],
    ['src/setup.ts', 20646, '43a7f88331f6136e5bb096c63a33ce99bbbdb5108696a97f017d3c1eb8ef1e35'],
    ['src/tools/AgentTool/runAgent.ts', 35768, '7a99609b319cb1d1d1f593fdc4ac281a7512e99f29c4c31ea3e52cb681f9c622'],
    ['src/utils/genericProcessUtils.ts', 6403, '3d6f4eee36be35e81a5cdf8cd2791d0b12aa99f6cf4096ffbf0499479fe8dc08'],
    ['src/utils/handlePromptSubmit.ts', 21712, '3cd8b139562101de37004693bd4bf59fdb270ad57c4ec17cce79cf2d8d31541e'],
    ['src/utils/proxy.ts', 13676, '878aaf385b5d89ef67c247966153d743e6223ec8910a7aa1b3718b9ffedf5022'],
  ].map(([sourcePath, bytes, sha256]) =>
    freezeFile({ path: sourcePath, bytes, sha256 }),
  ),
)

export const TARGET117_HISTORICAL_GAP_OUTPUT_FILES = Object.freeze(
  [
    ['src/QueryEngine.ts', 48368, '5e450f5547544190009ef2d14575e4c269a3262e5778cfa46b59cabe0793746a'],
    ['src/bridge/remoteBridgeCore.ts', 42839, '0ef6670b7137d4ff240cade5ce6263146cf0fcbe5f4b51967f51770f311fd871'],
    ['src/constants/prompts.ts', 54082, 'db817e30ed20a2ae2ce518341a699975e575fde26342280579966abc130923ac'],
    ['src/hooks/unifiedSuggestions.ts', 14551, 'b16aed849d9079d91afd8e67f050c8a59af2a2a8c092812afd6abb2400a2f61d'],
    ['src/hooks/useReplBridge.tsx', 116099, '8a3fcaba1cb5f51e6f691485327b328dd56d80dc4d6fd1308c8990f769461f9d'],
    ['src/services/api/claude.ts', 134029, '591492ae573ed9a7aae4b5b0a698c1f81375f15ff3a5cef8f90807095d190c51'],
    ['src/services/api/logging.ts', 25902, '638dc6ac984a7c50e4de1e7c03b7099141df6134f517da54c48264d70dfc2932'],
    ['src/services/compact/microCompact.ts', 24954, '5c2ff7b961307156de08c660b966e18d1ad2ab4a84c110f4d1ae1027324aae02'],
    ['src/services/tips/tipRegistry.ts', 24289, '38241408e2a27c7e5f18f4592b28a105ba81ffcf384b6e443ed0c6dcea4df60c'],
    ['src/services/tools/toolExecution.ts', 61801, '777625dc269c55bda8e615d915cc2c37e4825327968f3789cb13ed93fbc49b67'],
    ['src/setup.ts', 21313, '332596322ba57382a30d46f9b96250c6e0fac0f325c81082d3306cd7f3127aa1'],
    ['src/tools/AgentTool/runAgent.ts', 35841, '8caca88cc9a93caf26f5ee6dad445065593c8d867a17caca1ee88872b3cb1f23'],
    ['src/utils/genericProcessUtils.ts', 7113, 'ba3ad62e9d3939aa11d1195c959e28ba35bc307a2ec96bac35b2d08e5c40c3c7'],
    ['src/utils/handlePromptSubmit.ts', 21884, '5472b0dfe4eaf18dafbe6160ac0fdd5906f0968134c996de5764b8b43969ad7f'],
    ['src/utils/proxy.ts', 17623, '406c2f9d59ffecae1aa213630ad16b22b14d15f1cb2cb7d8dbe9b73451da1a9c'],
  ].map(([sourcePath, bytes, sha256]) =>
    freezeFile({ path: sourcePath, bytes, sha256 }),
  ),
)

export const TARGET117_HISTORICAL_GAP_NEW_FILES = Object.freeze([
  freezeFile({
    path: 'src/services/compact/contextHint.ts',
    bytes: 7625,
    sha256:
      '945f0f5418c481b693c1f350b85ceb167462d00fe77b7ab2482e1c7e77a34ab5',
    patch: 'target119',
    needle: 'export function createContextHintController',
  }),
  freezeFile({
    path: 'src/utils/teamArtifacts.ts',
    bytes: 5531,
    sha256:
      '7a8c4eeb1a89ca1a4d33e494b5f52bbd723cfa8e599e5257069412610e23fc35',
    patch: 'target118',
    needle: 'export async function getUnseenTeamArtifacts',
  }),
])

const TARGET_FRAGMENT_EVIDENCE =
  'target117-historical-owner-gap-target-fragment'
const REPLAY_EVIDENCE = 'target117-historical-owner-gap-replay-test'

const GAP_ROWS = [
  [4571, 'src/utils/genericProcessUtils.ts'],
  [8831, 'src/services/compact/microCompact.ts'],
  [8833, 'src/services/compact/microCompact.ts'],
  [10208, 'src/services/api/logging.ts'],
  [10209, 'src/services/api/logging.ts'],
  [10210, 'src/services/api/logging.ts'],
  [10211, 'src/services/api/logging.ts'],
  [13669, 'src/services/tools/toolExecution.ts'],
  [13672, 'src/services/tools/toolExecution.ts'],
  [13756, 'src/tools/AgentTool/runAgent.ts'],
  [18243, 'src/constants/prompts.ts'],
  [18307, 'src/services/api/claude.ts'],
  [18627, 'src/bridge/remoteBridgeCore.ts'],
  [18653, 'src/hooks/useReplBridge.tsx'],
  [18654, 'src/hooks/useReplBridge.tsx'],
  [19116, 'src/hooks/unifiedSuggestions.ts'],
  [19554, 'src/utils/handlePromptSubmit.ts'],
  [19821, 'src/services/tips/tipRegistry.ts'],
  [20578, 'src/setup.ts'],
  [20613, 'src/QueryEngine.ts'],
]

export const TARGET117_HISTORICAL_GAP_OVERRIDES = Object.freeze(
  GAP_ROWS.map(([targetIndex, sourcePath]) =>
    freezeOverride({
      key: `${CASE_NAME}:${targetIndex}`,
      targetIndex,
      paths: [sourcePath],
      evidenceIds: [TARGET_FRAGMENT_EVIDENCE, REPLAY_EVIDENCE],
      behavior:
        'The bounded replay restores only target-authenticated Target117 semantics into the source-map owner; later-release hunks and generic text coincidences remain excluded.',
    }),
  ),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function readAuthenticatedPatch(input) {
  const filename = path.join(repositoryRoot, input.path)
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${input.path}: expected a real patch file`)
  }
  const bytes = fs.readFileSync(filename)
  const actual = descriptor(bytes)
  if (actual.bytes !== input.bytes || actual.sha256 !== input.sha256) {
    throw new Error(
      `${input.path}: expected ${input.bytes}/${input.sha256}, got ${actual.bytes}/${actual.sha256}`,
    )
  }
  return bytes.toString('utf8')
}

function fileDiff(patchText, sourcePath) {
  const header = `diff --git a/${sourcePath} b/${sourcePath}`
  const start = patchText.indexOf(header)
  if (start < 0) throw new Error(`${sourcePath}: patch file diff not found`)
  const end = patchText.indexOf('\ndiff --git ', start + header.length)
  return patchText.slice(start, end < 0 ? patchText.length : end)
}

function addedGroups(patchText, sourcePath) {
  const groups = []
  let current = []
  for (const line of fileDiff(patchText, sourcePath).split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      current.push(line.slice(1))
    } else if (current.length > 0) {
      groups.push(`${current.join('\n')}\n`)
      current = []
    }
  }
  if (current.length > 0) groups.push(`${current.join('\n')}\n`)
  return groups
}

function uniqueGroup(patchText, sourcePath, needle) {
  const matches = addedGroups(patchText, sourcePath).filter(group =>
    group.includes(needle),
  )
  if (matches.length !== 1) {
    throw new Error(
      `${sourcePath}: expected one added group containing ${JSON.stringify(needle)}, got ${matches.length}`,
    )
  }
  return matches[0]
}

function sliceExact(text, startMarker, endMarker, includeEnd = false) {
  const start = text.indexOf(startMarker)
  if (start < 0) throw new Error(`added block start not found: ${startMarker}`)
  const end = text.indexOf(endMarker, start + startMarker.length)
  if (end < 0) throw new Error(`added block end not found: ${endMarker}`)
  return text.slice(start, includeEnd ? end + endMarker.length : end)
}

function countOccurrences(text, needle) {
  let count = 0
  let offset = 0
  while ((offset = text.indexOf(needle, offset)) >= 0) {
    count += 1
    offset += needle.length
  }
  return count
}

function replaceExact(text, before, after, expectedCount = 1, label = before) {
  const count = countOccurrences(text, before)
  if (count !== expectedCount) {
    throw new Error(
      `${label}: expected ${expectedCount} raw anchors, found ${count}`,
    )
  }
  return text.split(before).join(after)
}

function transformBlock(text, startMarker, endMarker, transform) {
  const start = text.indexOf(startMarker)
  if (start < 0) throw new Error(`block start not found: ${startMarker}`)
  const end = text.indexOf(endMarker, start + startMarker.length)
  if (end < 0) throw new Error(`block end not found: ${endMarker}`)
  const block = text.slice(start, end)
  return `${text.slice(0, start)}${transform(block)}${text.slice(end)}`
}

function addToolPlatformSpreads(text) {
  const anchor = 'queryDepth: toolUseContext.queryTracking?.depth,\n'
  const matches = [...text.matchAll(/^(\s*)queryDepth: toolUseContext\.queryTracking\?\.depth,\n/gm)]
  if (matches.length !== 9) {
    throw new Error(
      `toolExecution messageClientPlatform anchors: expected 9, got ${matches.length}`,
    )
  }
  // Target117's bundle carries the six analytics paths added in Target119's
  // authenticated source hunk. Three other queryDepth events are deliberately
  // outside that hunk and must remain untouched.
  const selectedMatches = new Set([0, 3, 4, 5, 7, 8])
  let output = ''
  let offset = 0
  for (const [index, match] of matches.entries()) {
    if (!selectedMatches.has(index)) continue
    const end = match.index + match[0].length
    const indent = match[1]
    output += text.slice(offset, end)
    output += `${indent}...(toolUseContext.options.messageClientPlatform && {\n${indent}  messageClientPlatform:\n${indent}    toolUseContext.options\n${indent}      .messageClientPlatform as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,\n${indent}}),\n`
    offset = end
  }
  output += text.slice(offset)
  if (countOccurrences(output, anchor) !== 9) {
    throw new Error('toolExecution queryDepth anchors changed unexpectedly')
  }
  return output
}

function transformGenericProcessUtils(text, patches) {
  text = replaceExact(
    text,
    "} from './execFileNoThrow.js'\n",
    "} from './execFileNoThrow.js'\nimport { readFile } from 'fs/promises'\n",
    1,
    'genericProcessUtils import anchor',
  )
  const group = uniqueGroup(
    patches.target118,
    'src/utils/genericProcessUtils.ts',
    'getProcessStartTokenAsync',
  )
  const declaration = sliceExact(
    group,
    'export async function getProcessStartTokenAsync(',
    '/** Unknown tokens are treated conservatively',
  )
  return replaceExact(
    text,
    '/**\n * Gets the ancestor process chain',
    `${declaration}/**\n * Gets the ancestor process chain`,
    1,
    'genericProcessUtils declaration anchor',
  )
}

function transformMicroCompact(text, patches) {
  const importLine = uniqueGroup(
    patches.target119,
    'src/services/compact/microCompact.ts',
    "import { isEnvTruthy }",
  )
  text = replaceExact(
    text,
    "import { logForDebugging } from '../../utils/debug.js'\n",
    `import { logForDebugging } from '../../utils/debug.js'\n${importLine}`,
    1,
    'microCompact import anchor',
  )
  const block = uniqueGroup(
    patches.target119,
    'src/services/compact/microCompact.ts',
    'export type KeepRecentMicrocompactSelection',
  )
  return replaceExact(
    text,
    "// Prefix-match because promptCategory.ts sets the querySource to\n",
    `${block}// Prefix-match because promptCategory.ts sets the querySource to\n`,
    1,
    'microCompact declaration anchor',
  )
}

function addLoggingPlatform(block, optional) {
  block = replaceExact(
    block,
    '  querySource,\n',
    '  querySource,\n  messageClientPlatform,\n',
    1,
    'logging destructuring',
  )
  block = replaceExact(
    block,
    `  querySource${optional ? '?' : ''}: string\n`,
    `  querySource${optional ? '?' : ''}: string\n  messageClientPlatform?: string\n`,
    1,
    'logging parameter type',
  )
  const eventAnchor = optional
    ? `    ...(querySource\n      ? {\n          querySource:\n            querySource as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,\n        }\n      : {}),\n`
    : `    querySource:\n      querySource as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,\n`
  const spread = `    ...(messageClientPlatform && {\n      messageClientPlatform:\n        messageClientPlatform as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,\n    }),\n`
  return replaceExact(
    block,
    eventAnchor,
    `${eventAnchor}${spread}`,
    1,
    'logging event anchor',
  )
}

function transformLogging(text) {
  text = transformBlock(
    text,
    'export function logAPIQuery(',
    'export function logAPIError(',
    block => addLoggingPlatform(block, false),
  )
  text = transformBlock(
    text,
    'export function logAPIError(',
    'function logAPISuccess(',
    block => addLoggingPlatform(block, true),
  )
  text = transformBlock(
    text,
    'function logAPISuccess(',
    'export function logAPISuccessAndDuration(',
    block => addLoggingPlatform(block, false),
  )
  const durationMarker = 'export function logAPISuccessAndDuration('
  const durationStart = text.indexOf(durationMarker)
  if (durationStart < 0) {
    throw new Error(`block start not found: ${durationMarker}`)
  }
  const prefix = text.slice(0, durationStart)
  let block = text.slice(durationStart)
  block = replaceExact(
    block,
    '  didFallBackToNonStreaming,\n  querySource,\n  headers,\n',
    '  didFallBackToNonStreaming,\n  querySource,\n  messageClientPlatform,\n  headers,\n',
    1,
    'success duration destructuring',
  )
  block = replaceExact(
    block,
    '  didFallBackToNonStreaming: boolean\n  querySource: string\n  headers?: globalThis.Headers\n',
    '  didFallBackToNonStreaming: boolean\n  querySource: string\n  messageClientPlatform?: string\n  headers?: globalThis.Headers\n',
    1,
    'success duration parameter type',
  )
  block = replaceExact(
    block,
    '    querySource,\n    gateway,\n',
    '    querySource,\n    messageClientPlatform,\n    gateway,\n',
    1,
    'success duration forwarding',
  )
  return `${prefix}${block}`
}

function transformRunAgent(text) {
  return replaceExact(
    text,
    '    agentDefinitions: toolUseContext.options.agentDefinitions,\n',
    '    agentDefinitions: toolUseContext.options.agentDefinitions,\n    messageClientPlatform: toolUseContext.options.messageClientPlatform,\n',
    1,
    'runAgent platform forwarding',
  )
}

function transformPrompts(text) {
  return replaceExact(
    text,
    "const CLAUDE_4_5_OR_4_6_MODEL_IDS = {\n  opus: 'claude-opus-4-6',\n",
    "const CLAUDE_4_5_OR_4_6_MODEL_IDS = {\n  opus: 'claude-opus-4-7',\n",
    1,
    'Target117 Opus model id',
  )
}

function transformClaude(text) {
  text = replaceExact(
    text,
    "import { getAPIContextManagement } from '../compact/apiMicrocompact.js'\n",
    "import { getAPIContextManagement } from '../compact/apiMicrocompact.js'\nimport { createContextHintController } from '../compact/contextHint.js'\n",
    1,
    'claude context hint import',
  )
  text = transformBlock(text, 'export type Options = {', 'export async function queryModelWithoutStreaming(', block => {
    block = replaceExact(
      block,
      '  onStreamingFallback?: () => void\n',
      '  onStreamingFallback?: () => void\n  onHintCleared?: (\n    clearedIds: Set<string>,\n    clearedContent: Map<string, string>,\n  ) => void\n',
      1,
      'claude hint callback type',
    )
    return replaceExact(
      block,
      '  agentId?: AgentId // Only set for subagents\n',
      '  agentId?: AgentId // Only set for subagents\n  messageClientPlatform?: string\n',
      1,
      'claude platform option type',
    )
  })
  text = transformBlock(text, 'async function* queryModel(', '\nexport function', block => {
    block = replaceExact(
      block,
      '  // Only latch from agentic queries so a classifier call doesn\'t flip the\n',
      `  const contextHintController = createContextHintController({\n    querySource: options.querySource,\n    includeFirstPartyBetas: shouldIncludeFirstPartyOnlyBetas(),\n    is529Error,\n  })\n\n  // Only latch from agentic queries so a classifier call doesn't flip the\n`,
      1,
      'claude context hint controller',
    )
    block = replaceExact(
      block,
      '    // Only send temperature when thinking is disabled — the API requires\n',
      `    let contextHintBody: {\n      context_hint: { enabled: true; target_tokens_saved?: number }\n    } | null = null\n    const contextHintParams =\n      contextHintController?.buildRequestParams(messagesForAPI)\n    if (contextHintParams) {\n      betasParams.push(contextHintParams.betaHeader)\n      contextHintBody = contextHintParams.body\n    }\n\n    // Only send temperature when thinking is disabled — the API requires\n`,
      1,
      'claude context hint request parameters',
    )
    block = replaceExact(
      block,
      '      ...extraBodyParams,\n',
      '      ...(contextHintBody ? contextHintBody : {}),\n      ...extraBodyParams,\n',
      1,
      'claude context hint request body',
    )
    block = replaceExact(
      block,
      '        querySource: options.querySource,\n        queryTracking: options.queryTracking,\n',
      '        querySource: options.querySource,\n        messageClientPlatform: options.messageClientPlatform,\n        queryTracking: options.queryTracking,\n',
      1,
      'claude query platform',
    )
    const retryAnchor = "            return 'retry:advisor-strip'\n          }\n          return undefined\n"
    block = replaceExact(
      block,
      retryAnchor,
      `            return 'retry:advisor-strip'\n          }\n          const hintResult = await contextHintController?.onRequestError(\n            error,\n            messagesForAPI,\n          )\n          if (hintResult) {\n            messagesForAPI = hintResult.messages\n            consumedCacheEdits = null\n            if (hintResult.clearedIds.size > 0) {\n              options.onHintCleared?.(\n                hintResult.clearedIds,\n                hintResult.clearedContent,\n              )\n            }\n            return 'retry:context-hint'\n          }\n          return undefined\n`,
      1,
      'claude context hint retry',
    )
    block = replaceExact(
      block,
      "      const fallbackCause = streamIdleAborted ? 'watchdog' : 'other'\n",
      `      let fallbackCause = streamIdleAborted ? 'watchdog' : 'other'\n      if (contextHintController?.classifyStreamError(streamingError)) {\n        fallbackCause = 'context_hint_sse'\n      }\n`,
      1,
      'claude stream context hint classification',
    )
    block = transformBlock(
      block,
      '      logForDebugging(\n        `Error streaming, falling back to non-streaming mode:',
      "\n      logEvent('tengu_streaming_fallback_to_non_streaming',",
      fallbackBlock =>
        replaceExact(
          fallbackBlock,
          '      didFallBackToNonStreaming = true\n      if (options.onStreamingFallback) {\n',
          `      didFallBackToNonStreaming = true\n      const hintResult = await contextHintController?.onStreamFallback(\n        messagesForAPI,\n        streamRequestId ?? undefined,\n      )\n      if (hintResult) {\n        messagesForAPI = hintResult.messages\n        consumedCacheEdits = null\n        if (hintResult.clearedIds.size > 0) {\n          options.onHintCleared?.(\n            hintResult.clearedIds,\n            hintResult.clearedContent,\n          )\n        }\n      }\n      if (options.onStreamingFallback) {\n`,
          1,
          'claude stream context hint fallback',
        ),
    )
    block = replaceExact(
      block,
      '          querySource: options.querySource,\n          llmSpan,\n',
      '          querySource: options.querySource,\n          messageClientPlatform: options.messageClientPlatform,\n          llmSpan,\n',
      1,
      'claude fallback error platform',
    )
    block = replaceExact(
      block,
      '        querySource: options.querySource,\n        llmSpan,\n',
      '        querySource: options.querySource,\n        messageClientPlatform: options.messageClientPlatform,\n        llmSpan,\n',
      1,
      'claude error platform',
    )
    return replaceExact(
      block,
      '      querySource: options.querySource,\n      headers: responseHeaders,\n',
      '      querySource: options.querySource,\n      messageClientPlatform: options.messageClientPlatform,\n      headers: responseHeaders,\n',
      1,
      'claude success platform',
    )
  })
  return text
}

function transformRemoteBridge(text) {
  text = replaceExact(
    text,
    "      : 'Remote credentials fetch failed — see debug log'\n    onStateChange?.('failed', detail)\n",
    `      : 'Remote credentials fetch failed — see debug log'\n    logForDebugging(\n      \`[remote-bridge] Creds failed; onStateChange \${onStateChange ? 'set' : 'UNSET'}, msg="\${detail}"\`,\n    )\n    onStateChange?.('failed', detail)\n`,
    1,
    'remote bridge credentials-state diagnostic',
  )
  text = replaceExact(
    text,
    '  async function teardown(): Promise<void> {\n    if (tornDown) return\n    tornDown = true\n',
    `  let skipArchive = false\n  let teardownPromise: Promise<void> | undefined\n\n  function teardown(options?: { skipArchive?: boolean }): Promise<void> {\n    if (options?.skipArchive) skipArchive = true\n    if (teardownPromise) return teardownPromise\n    tornDown = true\n    teardownPromise = performTeardown()\n    return teardownPromise\n  }\n\n  async function performTeardown(): Promise<void> {\n`,
    1,
    'remote bridge teardown state',
  )
  text = replaceExact(
    text,
    "    void transport.write(makeResultMessage(sessionId))\n\n    let token = getAccessToken()\n",
    `    void transport.write(makeResultMessage(sessionId))\n\n    if (skipArchive) {\n      transport.close()\n      logForDebugging(\n        \`[remote-bridge] Teardown complete (skipArchive): session=\${sessionId}\`,\n      )\n      logForDiagnosticsNoPII('info', 'bridge_repl_v2_teardown')\n      logEvent(\n        feature('CCR_MIRROR') && outboundOnly\n          ? 'tengu_ccr_mirror_teardown'\n          : 'tengu_bridge_repl_teardown',\n        {\n          v2: true,\n          archive_status:\n            'skipped_teleport' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,\n          archive_ok: false,\n        },\n      )\n      return\n    }\n\n    let token = getAccessToken()\n`,
    1,
    'remote bridge skip archive branch',
  )
  return replaceExact(
    text,
    '    async teardown() {\n      unregister()\n      await teardown()\n',
    '    async teardown(options?: { skipArchive?: boolean }) {\n      unregister()\n      await teardown(options)\n',
    1,
    'remote bridge public teardown',
  )
}

function transformUseReplBridge(text, patches) {
  const cleanup = uniqueGroup(
    patches.target118,
    'src/hooks/useReplBridge.tsx',
    'replBridgeSkipNextArchive',
  )
  text = replaceExact(
    text,
    "          logForDebugging(`[bridge:repl] Hook cleanup: starting teardown for env=${handleRef.current.environmentId} session=${handleRef.current.bridgeSessionId}`);\n          teardownPromiseRef.current = handleRef.current.teardown();\n",
    cleanup,
    1,
    'useReplBridge skipArchive cleanup',
  )
  text = replaceExact(
    text,
    '              const {\n                uuid\n              } = fields;\n',
    '              const {\n                uuid,\n                clientPlatform\n              } = fields;\n',
    1,
    'useReplBridge inbound fields',
  )
  return replaceExact(
    text,
    '                bridgeOrigin: true\n',
    '                bridgeOrigin: true,\n                clientPlatform\n',
    1,
    'useReplBridge inbound platform',
  )
}

function transformUnifiedSuggestions(text, patches) {
  const declaration = uniqueGroup(
    patches.target118,
    'src/hooks/unifiedSuggestions.ts',
    'function formatResourceTemplateReplacement',
  )
  return replaceExact(
    text,
    'export async function generateMcpResourceTemplateCompletions(',
    `${declaration}export async function generateMcpResourceTemplateCompletions(`,
    1,
    'unifiedSuggestions formatter declaration',
  )
}

function transformHandlePromptSubmit(text) {
  text = transformBlock(text, 'type BaseExecutionParams = {', 'type ExecuteUserInputParams =', block =>
    replaceExact(
      block,
      '    effort?: EffortValue,\n',
      '    effort?: EffortValue,\n    clientPlatform?: string,\n',
      1,
      'handlePromptSubmit query callback type',
    ),
  )
  const executeMarker = 'async function executeUserInput('
  const executeStart = text.indexOf(executeMarker)
  if (executeStart < 0) throw new Error(`block start not found: ${executeMarker}`)
  const prefix = text.slice(0, executeStart)
  let block = text.slice(executeStart)
    block = replaceExact(
      block,
      "        const shouldCallBeforeQuery = primaryMode === 'prompt'\n        await onQuery(\n",
      `        const shouldCallBeforeQuery = primaryMode === 'prompt'\n        const clientPlatform = commands.find(\n          command => command.clientPlatform,\n        )?.clientPlatform\n        await onQuery(\n`,
      1,
      'handlePromptSubmit client platform selection',
    )
  block = replaceExact(
      block,
      '          effort,\n        )\n',
      '          effort,\n          clientPlatform,\n        )\n',
      1,
      'handlePromptSubmit client platform forwarding',
  )
  return `${prefix}${block}`
}

function transformTips(text, patches) {
  const importGroup = uniqueGroup(
    patches.target118,
    'src/services/tips/tipRegistry.ts',
    'formatTeamArtifactTip,\n  getUnseenTeamArtifacts',
  )
  text = replaceExact(
    text,
    "import { OFFICIAL_MARKETPLACE_NAME } from '../../utils/plugins/officialMarketplace.js'\n",
    `import { OFFICIAL_MARKETPLACE_NAME } from '../../utils/plugins/officialMarketplace.js'\n${importGroup}`,
    1,
    'tipRegistry team artifacts import',
  )
  const object = uniqueGroup(
    patches.target118,
    'src/services/tips/tipRegistry.ts',
    "id: 'team-artifacts'",
  )
  return replaceExact(
    text,
    'const externalTips: Tip[] = [\n',
    `const externalTips: Tip[] = [\n${object}`,
    1,
    'tipRegistry external tip',
  )
}

function transformSetup(text) {
  text = replaceExact(
    text,
    "import { getCurrentProjectConfig, getGlobalConfig } from './utils/config.js'\n",
    "import {\n  checkHasTrustDialogAccepted,\n  getCurrentProjectConfig,\n  getGlobalConfig,\n} from './utils/config.js'\n",
    1,
    'setup config imports',
  )
  text = replaceExact(
    text,
    "import { getPlanSlug } from './utils/plans.js'\n",
    "import { getPlanSlug } from './utils/plans.js'\nimport {\n  _setProxyAuthHelperConfig,\n  prefetchProxyAuthFromHelperIfSafe,\n} from './utils/proxy.js'\n",
    1,
    'setup proxy imports',
  )
  text = replaceExact(
    text,
    "import { saveWorktreeState } from './utils/sessionStorage.js'\n",
    "import { saveWorktreeState } from './utils/sessionStorage.js'\nimport {\n  getSettings_DEPRECATED,\n  getSettingsForSource,\n} from './utils/settings/settings.js'\n",
    1,
    'setup settings imports',
  )
  return replaceExact(
    text,
    '  void prefetchApiKeyFromApiKeyHelperIfSafe(getIsNonInteractiveSession()) // Prefetch safely - only executes if trust already confirmed\n  profileCheckpoint(\'setup_after_prefetch\')\n',
    `  void prefetchApiKeyFromApiKeyHelperIfSafe(getIsNonInteractiveSession()) // Prefetch safely - only executes if trust already confirmed\n  const proxyAuthHelper = (getSettings_DEPRECATED() || {}).proxyAuthHelper\n  _setProxyAuthHelperConfig({\n    helper: proxyAuthHelper,\n    fromProjectOrLocal:\n      getSettingsForSource('projectSettings')?.proxyAuthHelper ===\n        proxyAuthHelper ||\n      getSettingsForSource('localSettings')?.proxyAuthHelper ===\n        proxyAuthHelper,\n    trustAccepted: checkHasTrustDialogAccepted,\n  })\n  prefetchProxyAuthFromHelperIfSafe()\n  profileCheckpoint('setup_after_prefetch')\n`,
    1,
    'setup proxy authentication configuration',
  )
}

function transformProxy(text, patches) {
  text = replaceExact(
    text,
    "import type { LookupOptions } from 'dns'\n",
    "import type { LookupOptions } from 'dns'\nimport { execa } from 'execa'\n",
    1,
    'proxy execa import',
  )
  text = replaceExact(
    text,
    "import type * as undici from 'undici'\n",
    "import type * as undici from 'undici'\nimport { getIsNonInteractiveSession } from '../bootstrap/state.js'\n",
    1,
    'proxy session-state import',
  )
  const helperBlock = uniqueGroup(
    patches.target121,
    'src/utils/proxy.ts',
    'type ProxyAuthHelperConfig',
  )
  return replaceExact(
    text,
    'export function disableKeepAlive(): void {\n',
    `${helperBlock}export function disableKeepAlive(): void {\n`,
    1,
    'proxy auth helper declarations',
  )
}

function transformQueryEngine(text) {
  const marker = 'export async function* ask({'
  const start = text.indexOf(marker)
  if (start < 0) throw new Error(`block start not found: ${marker}`)
  const prefix = text.slice(0, start)
  let block = text.slice(start)
  block = replaceExact(
    block,
    '  promptUuid,\n  isMeta,\n  cwd,\n',
    '  promptUuid,\n  isMeta,\n  clientPlatform,\n  cwd,\n',
    1,
    'QueryEngine ask destructuring',
  )
  block = replaceExact(
    block,
    '  promptUuid?: string\n  isMeta?: boolean\n  cwd: string\n',
    '  promptUuid?: string\n  isMeta?: boolean\n  clientPlatform?: string\n  cwd: string\n',
    1,
    'QueryEngine ask parameter type',
  )
  block = replaceExact(
    block,
    '      uuid: promptUuid,\n      isMeta,\n    })\n',
    '      uuid: promptUuid,\n      isMeta,\n      clientPlatform,\n    })\n',
    1,
    'QueryEngine submit platform',
  )
  return `${prefix}${block}`
}

const TRANSFORMS = Object.freeze({
  'src/QueryEngine.ts': transformQueryEngine,
  'src/bridge/remoteBridgeCore.ts': transformRemoteBridge,
  'src/constants/prompts.ts': transformPrompts,
  'src/hooks/unifiedSuggestions.ts': transformUnifiedSuggestions,
  'src/hooks/useReplBridge.tsx': transformUseReplBridge,
  'src/services/api/claude.ts': transformClaude,
  'src/services/api/logging.ts': transformLogging,
  'src/services/compact/microCompact.ts': transformMicroCompact,
  'src/services/tips/tipRegistry.ts': transformTips,
  'src/services/tools/toolExecution.ts': addToolPlatformSpreads,
  'src/setup.ts': transformSetup,
  'src/tools/AgentTool/runAgent.ts': transformRunAgent,
  'src/utils/genericProcessUtils.ts': transformGenericProcessUtils,
  'src/utils/handlePromptSubmit.ts': transformHandlePromptSubmit,
  'src/utils/proxy.ts': transformProxy,
})

function sourceFilename(sourceRoot, sourcePath) {
  if (!sourcePath.startsWith('src/')) {
    throw new Error(`${sourcePath}: expected normalized src path`)
  }
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, sourcePath.slice(4))
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${sourcePath}: escapes source root`)
  }
  return filename
}

export function applyTarget117HistoricalOwnerSourceGapRecovery({ sourceRoot }) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const patches = Object.fromEntries(
    Object.entries(PATCH_INPUTS).map(([name, input]) => [
      name,
      readAuthenticatedPatch(input),
    ]),
  )
  const outputs = new Map(
    TARGET117_HISTORICAL_GAP_OUTPUT_FILES.map(file => [file.path, file]),
  )
  const results = []
  let changed = 0

  for (const input of TARGET117_HISTORICAL_GAP_INPUT_FILES) {
    const expected = outputs.get(input.path)
    if (!expected) throw new Error(`${input.path}: output identity missing`)
    const filename = sourceFilename(sourceRoot, input.path)
    const status = fs.lstatSync(filename)
    if (!status.isFile() || status.isSymbolicLink()) {
      throw new Error(`${input.path}: expected a real source file`)
    }
    const before = fs.readFileSync(filename)
    const beforeIdentity = descriptor(before)
    if (
      beforeIdentity.bytes === expected.bytes &&
      beforeIdentity.sha256 === expected.sha256
    ) {
      results.push({ ...expected, action: 'unchanged' })
      continue
    }
    if (
      beforeIdentity.bytes !== input.bytes ||
      beforeIdentity.sha256 !== input.sha256
    ) {
      throw new Error(
        `${input.path}: expected raw ${input.bytes}/${input.sha256} or recovered ${expected.bytes}/${expected.sha256}, got ${beforeIdentity.bytes}/${beforeIdentity.sha256}`,
      )
    }
    const transform = TRANSFORMS[input.path]
    if (!transform) throw new Error(`${input.path}: transform missing`)
    const after = Buffer.from(transform(before.toString('utf8'), patches))
    const afterIdentity = descriptor(after)
    if (
      afterIdentity.bytes !== expected.bytes ||
      afterIdentity.sha256 !== expected.sha256
    ) {
      throw new Error(
        `${input.path}: replay drift; expected ${expected.bytes}/${expected.sha256}, got ${afterIdentity.bytes}/${afterIdentity.sha256}`,
      )
    }
    fs.writeFileSync(filename, after)
    results.push({ path: input.path, ...afterIdentity, action: 'recovered' })
    changed += 1
  }

  for (const expected of TARGET117_HISTORICAL_GAP_NEW_FILES) {
    const filename = sourceFilename(sourceRoot, expected.path)
    if (fs.existsSync(filename)) {
      const status = fs.lstatSync(filename)
      if (!status.isFile() || status.isSymbolicLink()) {
        throw new Error(`${expected.path}: expected a real source file`)
      }
      const actual = descriptor(fs.readFileSync(filename))
      if (
        actual.bytes !== expected.bytes ||
        actual.sha256 !== expected.sha256
      ) {
        throw new Error(
          `${expected.path}: expected absent or recovered ${expected.bytes}/${expected.sha256}, got ${actual.bytes}/${actual.sha256}`,
        )
      }
      results.push({ path: expected.path, ...actual, action: 'unchanged' })
      continue
    }
    const contents = uniqueGroup(
      patches[expected.patch],
      expected.path,
      expected.needle,
    )
    const actual = descriptor(Buffer.from(contents))
    if (
      actual.bytes !== expected.bytes ||
      actual.sha256 !== expected.sha256
    ) {
      throw new Error(
        `${expected.path}: replay drift; expected ${expected.bytes}/${expected.sha256}, got ${actual.bytes}/${actual.sha256}`,
      )
    }
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, contents)
    results.push({ path: expected.path, ...actual, action: 'recovered' })
    changed += 1
  }

  return Object.freeze({
    caseName: CASE_NAME,
    status: changed === 0 ? 'already-recovered' : 'recovered',
    files: Object.freeze(results.map(freezeFile)),
    ownerOverrides: TARGET117_HISTORICAL_GAP_OVERRIDES.length,
  })
}
