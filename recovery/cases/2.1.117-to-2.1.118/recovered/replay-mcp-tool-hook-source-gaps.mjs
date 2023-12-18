#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.117-to-2.1.118'
const TARGET_FRAGMENT_EVIDENCE =
  'target118-mcp-tool-hook-target-fragment'
const SOURCE_REPLAY_EVIDENCE =
  'target118-mcp-tool-hook-source-replay-test'

export const TARGET118_MCP_TOOL_HOOK_INPUT_FILES = Object.freeze([
  Object.freeze({
    path: 'src/utils/hooks/hooksSettings.ts',
    bytes: 8506,
    sha256: 'd417874dba9121fd18c809fb9191dfa2af454b24ee14607c9a65e47711bebd7b',
  }),
  Object.freeze({
    path: 'src/components/hooks/ViewHookMode.tsx',
    bytes: 17969,
    sha256: '8153b0f5c1b09b6f1abfddf6c5ac65cb894b023d9ed26ff98ead0d0e3982a47c',
  }),
])

export const TARGET118_MCP_TOOL_HOOK_OUTPUT_FILES = Object.freeze([
  Object.freeze({
    path: 'src/utils/hooks/hooksSettings.ts',
    bytes: 8856,
    sha256: '6de08d738f816b82e03d72587c437720f261c3cd0cc58f6fd1e12f53f483f5c1',
  }),
  Object.freeze({
    path: 'src/components/hooks/ViewHookMode.tsx',
    bytes: 18084,
    sha256: '5cf703f1adfa536a6258d29d31a56b312f69fdd18703828f9768dac9402aab18',
  }),
])

function override(targetIndex, path, behavior) {
  return Object.freeze({
    key: `${CASE_NAME}:${targetIndex}`,
    targetIndex,
    paths: Object.freeze([path]),
    evidenceIds: Object.freeze([
      TARGET_FRAGMENT_EVIDENCE,
      SOURCE_REPLAY_EVIDENCE,
    ]),
    behavior,
  })
}

export const TARGET118_MCP_TOOL_HOOK_OWNER_OVERRIDES = Object.freeze([
  override(
    12732,
    'src/utils/hooks/hooksSettings.ts',
    'Target118 adds exact MCP-tool hook identity comparison by server, tool, normalized input, and conditional expression to isHookEqual; the provisional sessionHooks.ts owner is rejected.',
  ),
  override(
    17170,
    'src/utils/hooks/hooksSettings.ts',
    'Target118 renders MCP-tool hook display text as server/tool in getHookDisplayText, alongside the pre-existing command, prompt, agent, HTTP, callback, and function cases.',
  ),
  override(
    17197,
    'src/components/hooks/ViewHookMode.tsx',
    'Target118 labels the MCP-tool detail field as MCP tool in the exact getContentFieldLabel declaration.',
  ),
  override(
    17198,
    'src/components/hooks/ViewHookMode.tsx',
    'Target118 renders the MCP-tool detail value as server/tool in the exact getContentFieldValue declaration.',
  ),
])

const OPERATIONS = Object.freeze({
  'src/utils/hooks/hooksSettings.ts': Object.freeze([
    Object.freeze({
      before: "import { DEFAULT_HOOK_SHELL } from '../shell/shellProvider.js'\n",
      after:
        "import { DEFAULT_HOOK_SHELL } from '../shell/shellProvider.js'\n" +
        "import { jsonStringify } from '../slowOperations.js'\n",
    }),
    Object.freeze({
      before:
        "    case 'http':\n" +
        "      return b.type === 'http' && a.url === b.url && sameIf(a, b)\n" +
        "    case 'function':",
      after:
        "    case 'http':\n" +
        "      return b.type === 'http' && a.url === b.url && sameIf(a, b)\n" +
        "    case 'mcp_tool':\n" +
        "      return (\n" +
        "        b.type === 'mcp_tool' &&\n" +
        "        a.server === b.server &&\n" +
        "        a.tool === b.tool &&\n" +
        "        jsonStringify(a.input ?? {}) === jsonStringify(b.input ?? {}) &&\n" +
        "        sameIf(a, b)\n" +
        "      )\n" +
        "    case 'function':",
    }),
    Object.freeze({
      before:
        "    case 'http':\n" +
        "      return hook.url\n" +
        "    case 'callback':",
      after:
        "    case 'http':\n" +
        "      return hook.url\n" +
        "    case 'mcp_tool':\n" +
        '      return `${hook.server}/${hook.tool}`\n' +
        "    case 'callback':",
    }),
  ]),
  'src/components/hooks/ViewHookMode.tsx': Object.freeze([
    Object.freeze({
      before:
        "    case 'http':\n" +
        "      return 'URL';\n" +
        '  }\n' +
        '}',
      after:
        "    case 'http':\n" +
        "      return 'URL';\n" +
        "    case 'mcp_tool':\n" +
        "      return 'MCP tool';\n" +
        '  }\n' +
        '}',
    }),
    Object.freeze({
      before:
        "    case 'http':\n" +
        '      return config.url;\n' +
        '  }\n' +
        '}',
      after:
        "    case 'http':\n" +
        '      return config.url;\n' +
        "    case 'mcp_tool':\n" +
        '      return `${config.server}/${config.tool}`;\n' +
        '  }\n' +
        '}',
    }),
  ]),
})

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function applyOperations(relative, input) {
  let output = input
  for (const operation of OPERATIONS[relative]) {
    const count = output.split(operation.before).length - 1
    if (count !== 1) {
      throw new Error(
        `${CASE_NAME}: ${relative} replay anchor count is ${count}, expected 1`,
      )
    }
    output = output.replace(operation.before, operation.after)
  }
  return output
}

export function applyTarget118McpToolHookSourceRecovery({ sourceRoot }) {
  const inputsByPath = new Map(
    TARGET118_MCP_TOOL_HOOK_INPUT_FILES.map(file => [file.path, file]),
  )
  const outputsByPath = new Map(
    TARGET118_MCP_TOOL_HOOK_OUTPUT_FILES.map(file => [file.path, file]),
  )
  const states = []
  for (const [relative] of Object.entries(OPERATIONS)) {
    const filename = path.join(sourceRoot, relative.replace(/^src\//, ''))
    const value = fs.readFileSync(filename)
    const actual = descriptor(value)
    const input = inputsByPath.get(relative)
    const output = outputsByPath.get(relative)
    const state =
      actual.bytes === input.bytes && actual.sha256 === input.sha256
        ? 'raw'
        : actual.bytes === output.bytes && actual.sha256 === output.sha256
          ? 'recovered'
          : 'unknown'
    states.push({ relative, filename, value, actual, input, output, state })
  }
  if (states.every(item => item.state === 'recovered')) {
    return { status: 'already-recovered', files: [] }
  }
  if (!states.every(item => item.state === 'raw')) {
    throw new Error(
      `${CASE_NAME}: MCP-tool hook replay requires one exact all-raw or all-recovered source state; got ${states.map(item => `${item.relative}:${item.state}`).join(', ')}`,
    )
  }
  const pending = states.map(item => {
    const value = Buffer.from(applyOperations(item.relative, item.value.toString()))
    const actual = descriptor(value)
    if (
      actual.bytes !== item.output.bytes ||
      actual.sha256 !== item.output.sha256
    ) {
      throw new Error(
        `${CASE_NAME}: ${item.relative} replay output differs from its pinned postimage`,
      )
    }
    return { ...item, value }
  })
  for (const item of pending) fs.writeFileSync(item.filename, item.value)
  return {
    status: 'recovered',
    files: pending.map(item => item.relative),
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceRootIndex = process.argv.indexOf('--source-root')
  const sourceRoot =
    sourceRootIndex >= 0 ? process.argv[sourceRootIndex + 1] : process.argv[2]
  if (!sourceRoot) {
    throw new Error('usage: replay-mcp-tool-hook-source-gaps.mjs --source-root DIR')
  }
  process.stdout.write(
    `${JSON.stringify(applyTarget118McpToolHookSourceRecovery({ sourceRoot }))}\n`,
  )
}
