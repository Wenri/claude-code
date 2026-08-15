import pickBy from 'lodash-es/pickBy.js'
import uniqBy from 'lodash-es/uniqBy.js'
import type { AppState } from '../../state/AppState.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../analytics/growthbook.js'
import {
  clearServerCache,
  connectToServer,
  getMcpToolsCommandsAndResources,
  getServerCacheKey,
} from './client.js'
import {
  dedupClaudeAiMcpServers,
  getMcpServerSignature,
} from './config.js'
import type {
  MCPServerConnection,
  ScopedMcpServerConfig,
} from './types.js'
import {
  excludeCommandsByServer,
  excludeResourcesByServer,
} from './utils.js'
import { logForDebugging } from '../../utils/debug.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { sleep } from '../../utils/sleep.js'

type McpState = AppState['mcp']

type McpStateAdapter = {
  getClients: () => MCPServerConnection[]
  applyMcpUpdate: (update: (mcp: McpState) => McpState) => void
}

export function createHeadlessMcpConnectionManager({
  regularMcpConfigs,
  claudeaiConfigPromise,
  state,
}: {
  regularMcpConfigs: Record<string, ScopedMcpServerConfig>
  claudeaiConfigPromise: Promise<Record<string, ScopedMcpServerConfig>>
  state: McpStateAdapter
}): { connect: () => Promise<void> } {
  const fullyAsync = isEnvTruthy(process.env.MCP_CONNECTION_NONBLOCKING)
  async function connect(): Promise<void> {
    await Promise.all([
      runConnectionGroup(
        fullyAsync,
        () => connectMcpBatch(regularMcpConfigs, 'regular', state),
        '--mcp-config servers',
      ),
      runConnectionGroup(
        fullyAsync,
        () =>
          claudeaiConfigPromise.then(claudeaiConfigs =>
            connectClaudeAiMcp({
              claudeaiConfigs,
              regularMcpConfigs,
              state,
            }),
          ),
        'claude.ai connectors',
      ),
    ])
  }
  return { connect }
}

function connectMcpBatch(
  configs: Record<string, ScopedMcpServerConfig>,
  label: string,
  state: McpStateAdapter,
): Promise<void>[] {
  const names = Object.keys(configs)
  if (names.length === 0) return []
  state.applyMcpUpdate(mcp => ({
    ...mcp,
    clients: [
      ...mcp.clients,
      ...Object.entries(configs).map(([name, config]) => ({
        name,
        type: 'pending' as const,
        config,
      })),
    ],
  }))

  const resolvers = new Map<string, () => void>()
  const ready = names.map(
    name => new Promise<void>(resolve => resolvers.set(name, resolve)),
  )
  void getMcpToolsCommandsAndResources(result => {
    applyConnectionResult(state, result)
    resolvers.get(result.client.name)?.()
  }, configs)
    .catch(error =>
      logForDebugging(`[MCP] ${label} connect error: ${error}`),
    )
    .finally(() => {
      for (const resolve of resolvers.values()) resolve()
      if (
        getFeatureValue_CACHED_MAY_BE_STALE(
          'tengu_mcp_retry_failed_remote',
          true,
        )
      ) {
        void retryFailedRemoteServers(configs, state).catch(error =>
          logForDebugging(`[MCP] ${label} retry error: ${error}`),
        )
      }
    })
  return ready
}

function applyConnectionResult(
  state: McpStateAdapter,
  {
    client,
    tools,
    commands,
  }: Parameters<Parameters<typeof getMcpToolsCommandsAndResources>[0]>[0],
): void {
  state.applyMcpUpdate(mcp => {
    if (!mcp.clients.some(existing => existing.name === client.name)) {
      if (client.type === 'connected') {
        void clearServerCache(client.name, client.config).catch(() => {})
      }
      return mcp
    }
    return {
      ...mcp,
      clients: mcp.clients.map(existing =>
        existing.name === client.name ? client : existing,
      ),
      tools: uniqBy([...mcp.tools, ...tools], 'name'),
      commands: uniqBy([...mcp.commands, ...commands], 'name'),
    }
  })
}

async function retryFailedRemoteServers(
  configs: Record<string, ScopedMcpServerConfig>,
  state: McpStateAdapter,
): Promise<void> {
  const remoteConfigs = Object.entries(configs).filter(([, config]) =>
    REMOTE_TRANSPORTS.has(config.type ?? ''),
  )
  if (remoteConfigs.length === 0) return

  for (const delay of RETRY_DELAYS_MS) {
    await sleep(delay)
    const failed = remoteConfigs.filter(([name]) =>
      state
        .getClients()
        .some(client => client.name === name && client.type === 'failed'),
    )
    if (failed.length === 0) {
      logForDebugging('[MCP] Retry: all remote servers connected, stopping')
      return
    }
    logForDebugging(
      `[MCP] Retry: ${failed.length} failed remote server(s) after ${delay}ms backoff`,
    )
    for (const [name, config] of failed) {
      connectToServer.cache.delete(getServerCacheKey(name, config))
    }
    await getMcpToolsCommandsAndResources(
      result => applyConnectionResult(state, result),
      Object.fromEntries(failed),
    )
  }

  const stillFailed = remoteConfigs.filter(([name]) =>
    state
      .getClients()
      .some(client => client.name === name && client.type === 'failed'),
  )
  if (stillFailed.length > 0) {
    logForDebugging(
      `[MCP] Retry: ${stillFailed.length} remote server(s) still failed after all retries: ${stillFailed.map(([name]) => name).join(', ')}`,
    )
  }
}

async function runConnectionGroup(
  fullyAsync: boolean,
  start: () => Promise<void>[] | Promise<Promise<void>[]>,
  label: string,
): Promise<void> {
  if (fullyAsync) {
    setImmediate(() => void Promise.resolve(start()).catch(() => {}))
    logForDebugging(
      `[MCP] ${label} running fully async (MCP_CONNECTION_NONBLOCKING)`,
    )
    return
  }

  const started = start()
  const configStartedAt = Date.now()
  let ready: Promise<void>[]
  if (Array.isArray(started)) {
    ready = started
  } else {
    let timer: ReturnType<typeof setTimeout> | undefined
    const result = await Promise.race([
      started,
      new Promise<'deadline'>(resolve => {
        timer = setTimeout(resolve, CONFIG_FETCH_DEADLINE_MS, 'deadline')
      }),
    ])
    if (timer) clearTimeout(timer)
    if (result === 'deadline') {
      void started.catch(() => {})
      logForDebugging(
        `[MCP] ${label} config fetch not ready after ${CONFIG_FETCH_DEADLINE_MS}ms — proceeding; background connection continues`,
      )
      return
    }
    ready = result
  }

  const remaining = Math.max(
    0,
    CONNECTION_DEADLINE_MS - (Date.now() - configStartedAt),
  )
  const pending = await countUnsettledAtDeadline(ready, remaining)
  if (pending > 0) {
    logForDebugging(
      `[MCP] ${label}: ${pending}/${ready.length} not ready after ${CONNECTION_DEADLINE_MS}ms — proceeding; background connection continues`,
    )
  }
}

async function connectClaudeAiMcp({
  claudeaiConfigs,
  regularMcpConfigs,
  state,
}: {
  claudeaiConfigs: Record<string, ScopedMcpServerConfig>
  regularMcpConfigs: Record<string, ScopedMcpServerConfig>
  state: McpStateAdapter
}): Promise<void>[] {
  if (Object.keys(claudeaiConfigs).length > 0) {
    const claudeaiSignatures = new Set<string>()
    for (const config of Object.values(claudeaiConfigs)) {
      const signature = getMcpServerSignature(config)
      if (signature) claudeaiSignatures.add(signature)
    }
    const suppressed = new Set<string>()
    for (const [name, config] of Object.entries(regularMcpConfigs)) {
      if (!name.startsWith('plugin:')) continue
      const signature = getMcpServerSignature(config)
      if (signature && claudeaiSignatures.has(signature)) suppressed.add(name)
    }
    if (suppressed.size > 0) {
      logForDebugging(
        `[MCP] Lazy dedup: suppressing ${suppressed.size} plugin server(s) that duplicate claude.ai connectors: ${[...suppressed].join(', ')}`,
      )
      for (const client of state.getClients()) {
        if (!suppressed.has(client.name) || client.type !== 'connected') continue
        client.client.onclose = undefined
        void clearServerCache(client.name, client.config).catch(() => {})
      }
      state.applyMcpUpdate(mcp => {
        let { clients, tools, commands, resources } = mcp
        clients = clients.filter(client => !suppressed.has(client.name))
        tools = tools.filter(
          tool =>
            !tool.mcpInfo || !suppressed.has(tool.mcpInfo.serverName),
        )
        for (const name of suppressed) {
          commands = excludeCommandsByServer(commands, name)
          resources = excludeResourcesByServer(resources, name)
        }
        return { ...mcp, clients, tools, commands, resources }
      })
    }
  }

  const nonPluginConfigs = pickBy(
    regularMcpConfigs,
    (_, name) => !name.startsWith('plugin:'),
  )
  const { servers, suppressed } = dedupClaudeAiMcpServers(
    claudeaiConfigs,
    nonPluginConfigs,
  )
  state.applyMcpUpdate(mcp => ({
    ...mcp,
    suppressedClaudeAiConnectors: suppressed,
  }))
  return connectMcpBatch(servers, 'claudeai', state)
}

async function countUnsettledAtDeadline(
  promises: Promise<void>[],
  timeoutMs: number,
): Promise<number> {
  if (promises.length === 0) return 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<'deadline'>(resolve => {
    timer = setTimeout(resolve, timeoutMs, 'deadline')
  })
  try {
    const states = await Promise.all(
      promises.map(promise =>
        Promise.race([
          promise.then(
            () => 'settled' as const,
            () => 'settled' as const,
          ),
          deadline,
        ]),
      ),
    )
    return states.filter(state => state === 'deadline').length
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const CONNECTION_DEADLINE_MS = 5_000
const CONFIG_FETCH_DEADLINE_MS = 1_000
const RETRY_DELAYS_MS = [500, 1_500, 4_000]
const REMOTE_TRANSPORTS = new Set(['http', 'sse', 'claudeai-proxy'])
