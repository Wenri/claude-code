#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.117-to-2.1.118'

export const TARGET118_MCP_CLIENT_ACCESSOR_INPUT_FILES = Object.freeze([
  Object.freeze({
    path: 'src/bootstrap/state.ts',
    bytes: 59526,
    sha256: '7e7a2ffc49d5ea805023bda9346d2eba9bab8e9edce04dfdc9cdd51b4f0e28cf',
  }),
  Object.freeze({
    path: 'src/state/AppState.tsx',
    bytes: 23480,
    sha256: '51165c47d76886fe6a0e9151615f146e2455ba4f198fb2c8d0afc7988681cabe',
  }),
  Object.freeze({
    path: 'src/utils/hooks/execMcpToolHook.ts',
    bytes: 3421,
    sha256: '525327cfee4a61f927e6e2ff234d1e08882169643f9d177546ce64358a92c7d4',
  }),
  Object.freeze({
    path: 'src/cli/print.ts',
    bytes: 220728,
    sha256: '119c6cd287e2c7e4329c3aae28fe056a7b0b558742485c30726753b75b84acc6',
  }),
])

export const TARGET118_MCP_CLIENT_ACCESSOR_OUTPUT_FILES = Object.freeze([
  Object.freeze({
    path: 'src/bootstrap/state.ts',
    bytes: 59923,
    sha256: '61d86a84b52373ffee4742f9cae9cd23d7d7d10c717d3c34553bae98c0ac3157',
  }),
  Object.freeze({
    path: 'src/state/AppState.tsx',
    bytes: 23692,
    sha256: '86b0f0f3edea36d759438f84dcf31466839147bb34973893814cbb159d9d2c8f',
  }),
  Object.freeze({
    path: 'src/utils/hooks/execMcpToolHook.ts',
    bytes: 3574,
    sha256: 'efcc949e18038e60d2fc99ab8acc2b9e6c093bb7219214c6bf8242c2b95bddf5',
  }),
  Object.freeze({
    path: 'src/cli/print.ts',
    bytes: 220876,
    sha256: 'c167a878f441028ff6b7850aa658845a7750af4f39eeca66c83a97c291a538e3',
  }),
])

export const TARGET118_MCP_CLIENT_ACCESSOR_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:365`,
    targetIndex: 365,
    paths: Object.freeze(['src/bootstrap/state.ts']),
    evidenceIds: Object.freeze([
      'target118-mcp-client-accessor-target-fragment',
      'target118-mcp-client-accessor-source-replay-test',
      'target118-mcp-client-accessor-source-ast-test',
    ]),
    behavior:
      'The authenticated Target118 bootstrap export registry binds the exact parent-settings and cache-diagnosis accessors, the prompt-index incrementer, and the recovered MCP-client accessor. The accessor is installed by interactive AppState lifecycle or headless CLI setup, cleared on provider cleanup, and used only as execMcpToolHook fallback when no explicit client list is supplied.',
  }),
])

const OPERATIONS = Object.freeze({
  'src/bootstrap/state.ts': Object.freeze([
    Object.freeze({
      before:
        "import type { HookEvent, ModelUsage } from 'src/entrypoints/agentSdkTypes.js'\n",
      after:
        "import type { HookEvent, ModelUsage } from 'src/entrypoints/agentSdkTypes.js'\n" +
        "import type { MCPServerConnection } from 'src/services/mcp/types.js'\n",
    }),
    Object.freeze({
      before: 'const STATE: State = getInitialState()\n',
      after:
        'const STATE: State = getInitialState()\n\n' +
        'let mcpClientsAccessor: (() => MCPServerConnection[]) | undefined\n',
    }),
    Object.freeze({
      before:
        'export function getInitJsonSchema(): Record<string, unknown> | null {\n' +
        '  return STATE.initJsonSchema\n' +
        '}\n',
      after:
        'export function getInitJsonSchema(): Record<string, unknown> | null {\n' +
        '  return STATE.initJsonSchema\n' +
        '}\n\n' +
        'export function setMcpClientsAccessor(\n' +
        '  accessor: (() => MCPServerConnection[]) | undefined,\n' +
        '): void {\n' +
        '  mcpClientsAccessor = accessor\n' +
        '}\n\n' +
        'export function getMcpClientsFromAccessor():\n' +
        '  | MCPServerConnection[]\n' +
        '  | undefined {\n' +
        '  return mcpClientsAccessor?.()\n' +
        '}\n',
    }),
  ]),
  'src/state/AppState.tsx': Object.freeze([
    Object.freeze({
      before: "import { MailboxProvider } from '../context/mailbox.js';\n",
      after:
        "import { setMcpClientsAccessor } from '../bootstrap/state.js';\n" +
        "import { MailboxProvider } from '../context/mailbox.js';\n",
    }),
    Object.freeze({
      before: '  const [store] = useState(t1);\n',
      after:
        '  const [store] = useState(t1);\n' +
        '  useEffect(() => {\n' +
        '    setMcpClientsAccessor(() => store.getState().mcp.clients);\n' +
        '    return () => setMcpClientsAccessor(undefined);\n' +
        '  }, [store]);\n',
    }),
  ]),
  'src/utils/hooks/execMcpToolHook.ts': Object.freeze([
    Object.freeze({
      before:
        "import type { HookEvent } from 'src/entrypoints/agentSdkTypes.js'\n",
      after:
        "import type { HookEvent } from 'src/entrypoints/agentSdkTypes.js'\n" +
        "import { getMcpClientsFromAccessor } from '../../bootstrap/state.js'\n",
    }),
    Object.freeze({
      before: '  if (clients === undefined) {\n',
      after:
        '  const availableClients = clients ?? getMcpClientsFromAccessor()\n' +
        '  if (availableClients === undefined) {\n',
    }),
    Object.freeze({
      before:
        '  const server = clients.find(client => client.name === hook.server)\n',
      after:
        '  const server = availableClients.find(client => client.name === hook.server)\n',
    }),
  ]),
  'src/cli/print.ts': Object.freeze([
    Object.freeze({
      before:
        '  setSessionSkillAllowlist,\n' +
        "} from 'src/bootstrap/state.js'\n",
      after:
        '  setSessionSkillAllowlist,\n' +
        '  setMcpClientsAccessor,\n' +
        "} from 'src/bootstrap/state.js'\n",
    }),
    Object.freeze({
      before:
        '  let dynamicMcpState: DynamicMcpState = {\n' +
        '    clients: [],\n' +
        '    tools: [],\n' +
        '    configs: {},\n' +
        '  }\n',
      after:
        '  let dynamicMcpState: DynamicMcpState = {\n' +
        '    clients: [],\n' +
        '    tools: [],\n' +
        '    configs: {},\n' +
        '  }\n\n' +
        '  setMcpClientsAccessor(() => [\n' +
        '    ...getAppState().mcp.clients,\n' +
        '    ...sdkClients,\n' +
        '    ...dynamicMcpState.clients,\n' +
        '  ])\n',
    }),
  ]),
})

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

export function buildTarget118McpClientAccessorOutput(relative, input) {
  let output = input
  for (const operation of OPERATIONS[relative] ?? []) {
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

export function applyTarget118McpClientAccessorSourceRecovery({ sourceRoot }) {
  const inputs = new Map(
    TARGET118_MCP_CLIENT_ACCESSOR_INPUT_FILES.map(file => [file.path, file]),
  )
  const outputs = new Map(
    TARGET118_MCP_CLIENT_ACCESSOR_OUTPUT_FILES.map(file => [file.path, file]),
  )
  const states = Object.keys(OPERATIONS).map(relative => {
    const filename = path.join(sourceRoot, relative.replace(/^src\//, ''))
    const value = fs.readFileSync(filename)
    const actual = descriptor(value)
    const input = inputs.get(relative)
    const output = outputs.get(relative)
    const state =
      actual.bytes === input.bytes && actual.sha256 === input.sha256
        ? 'raw'
        : actual.bytes === output.bytes && actual.sha256 === output.sha256
          ? 'recovered'
          : 'unknown'
    return { relative, filename, value, actual, input, output, state }
  })
  if (states.every(item => item.state === 'recovered')) {
    return { status: 'already-recovered', files: [] }
  }
  if (!states.every(item => item.state === 'raw')) {
    throw new Error(
      `${CASE_NAME}: MCP-client accessor replay requires one exact all-raw or all-recovered source state; got ${states.map(item => `${item.relative}:${item.state}`).join(', ')}`,
    )
  }
  const pending = states.map(item => {
    const value = Buffer.from(
      buildTarget118McpClientAccessorOutput(
        item.relative,
        item.value.toString(),
      ),
    )
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
    throw new Error(
      'usage: replay-mcp-client-accessor-source-gap.mjs --source-root DIR',
    )
  }
  process.stdout.write(
    `${JSON.stringify(applyTarget118McpClientAccessorSourceRecovery({ sourceRoot }))}\n`,
  )
}
