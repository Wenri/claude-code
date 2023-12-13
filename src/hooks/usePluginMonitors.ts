import { feature } from 'bun:bundle'
import { useEffect } from 'react'
import { getIsNonInteractiveSession } from '../bootstrap/state.js'
import { expandEnvVarsInString } from '../services/mcp/envExpansion.js'
import { useAppState, useAppStateStore } from '../state/AppState.js'
import { spawnShellTask } from '../tasks/LocalShellTask/LocalShellTask.js'
import type { TaskContext } from '../Task.js'
import type { LoadedPlugin } from '../types/plugin.js'
import { logForDebugging } from '../utils/debug.js'
import { isEnvTruthy } from '../utils/envUtils.js'
import { shouldSkipHookDueToTrust } from '../utils/hooks.js'
import {
  applyPluginOptionDefaults,
  getPluginStorageId,
  loadPluginOptions,
  substitutePluginVariables,
  substituteUserConfigVariables,
} from '../utils/plugins/pluginOptionsStorage.js'
import { exec } from '../utils/Shell.js'
import { getDefaultHookShell } from '../utils/shell/shellToolUtils.js'
import { skillInvoked } from '../utils/suggestions/skillUsageTracking.js'
import { enqueueMonitorEvent } from '../tools/MonitorTool/MonitorTool.js'
import {
  createLineBatcher,
  createTokenBucket,
} from '../tools/MonitorTool/stream.js'

type ResolvedPluginMonitor = {
  name: string
  command: string
  description: string
  when: string
  pluginName: string
  pluginRoot: string
}

function resolvePluginMonitor(
  monitor: NonNullable<LoadedPlugin['monitors']>[number],
  plugin: LoadedPlugin,
): ResolvedPluginMonitor {
  const userConfig = plugin.manifest.userConfig
    ? applyPluginOptionDefaults(
        loadPluginOptions(getPluginStorageId(plugin)),
        plugin.manifest.userConfig,
      )
    : undefined
  const expand = (value: string): string => {
    let expanded = substitutePluginVariables(value, plugin)
    if (userConfig) {
      expanded = substituteUserConfigVariables(expanded, userConfig)
    }
    return expandEnvVarsInString(expanded).expanded
  }

  return {
    name: monitor.name,
    command: expand(monitor.command),
    description: monitor.description,
    when: monitor.when,
    pluginName: plugin.name,
    pluginRoot: plugin.path,
  }
}

function collectPluginMonitors(
  plugins: LoadedPlugin[],
): ResolvedPluginMonitor[] {
  const monitors: ResolvedPluginMonitor[] = []
  for (const plugin of plugins) {
    if (!plugin.monitors) continue
    for (const monitor of plugin.monitors) {
      try {
        monitors.push(resolvePluginMonitor(monitor, plugin))
      } catch (error) {
        logForDebugging(
          `plugin ${plugin.name}: failed to resolve monitor "${monitor.name}": ${error}`,
          { level: 'error' },
        )
      }
    }
  }
  return monitors
}

function createPluginMonitorOutputHandler(
  monitor: ResolvedPluginMonitor,
  taskRef: { id?: string },
  enqueue = enqueueMonitorEvent,
  bucket = createTokenBucket(),
): { onBatch: (batch: string) => void; onExit: () => void } {
  let suppressedEvents = 0
  function flushSuppressedEvents(): void {
    if (suppressedEvents === 0) return
    enqueue(
      monitor.description,
      `[plugin monitor "${monitor.name}" suppressed ${suppressedEvents} events — output rate exceeded]`,
      taskRef.id,
    )
    suppressedEvents = 0
  }

  return {
    onBatch(batch) {
      if (!bucket.tryConsume()) {
        suppressedEvents++
        return
      }
      flushSuppressedEvents()
      enqueue(monitor.description, batch, taskRef.id)
    },
    onExit: flushSuppressedEvents,
  }
}

async function armPluginMonitor(
  monitor: ResolvedPluginMonitor,
  context: TaskContext,
): Promise<string | undefined> {
  if (getIsNonInteractiveSession()) return undefined
  if (shouldSkipHookDueToTrust()) {
    logForDebugging(
      `Skipping plugin monitor ${monitor.pluginName}:${monitor.name} - workspace trust not accepted`,
    )
    return undefined
  }

  const taskRef: { id?: string } = {}
  const outputHandler = createPluginMonitorOutputHandler(monitor, taskRef)
  const batcher = createLineBatcher(outputHandler.onBatch)
  const shellCommand = await exec(
    monitor.command,
    context.abortController.signal,
    getDefaultHookShell(),
    {
      preventCwdChanges: true,
      shouldUseSandbox: false,
      onStdout: batcher.onData,
    },
  )
  taskRef.id = shellCommand.taskOutput.taskId
  await spawnShellTask(
    {
      command: monitor.command,
      description: monitor.description,
      shellCommand,
      toolUseId: undefined,
      agentId: undefined,
      kind: 'monitor',
    },
    context,
  )
  void shellCommand.result.then(() => {
    batcher.flush(true)
    outputHandler.onExit()
  })
  return taskRef.id
}

const armedPluginMonitors = new Set<string>()

async function armPluginMonitors(
  plugins: LoadedPlugin[],
  shouldArm: (monitor: ResolvedPluginMonitor) => boolean,
  context: TaskContext,
  arm = armPluginMonitor,
  armed = armedPluginMonitors,
): Promise<void> {
  if (!feature('MONITOR_TOOL')) return
  if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS)) return

  for (const monitor of collectPluginMonitors(plugins)) {
    if (!shouldArm(monitor)) continue
    const key = `${monitor.pluginName}:${monitor.name}`
    if (armed.has(key)) continue
    armed.add(key)
    try {
      if ((await arm(monitor, context)) === undefined) armed.delete(key)
    } catch (error) {
      armed.delete(key)
      logForDebugging(`plugin monitor ${key}: failed to arm: ${error}`, {
        level: 'error',
      })
    }
  }
}

export function usePluginMonitors({ enabled }: { enabled: boolean }): void {
  const store = useAppStateStore()
  const enabledPlugins = useAppState(state => state.plugins.enabled)

  useEffect(() => {
    if (!enabled) return
    const createContext = (): TaskContext => ({
      abortController: new AbortController(),
      getAppState: store.getState,
      setAppState: store.setState,
    })

    void armPluginMonitors(
      enabledPlugins,
      monitor => monitor.when === 'always',
      createContext(),
    )
    return skillInvoked.subscribe(skillName => {
      void armPluginMonitors(
        store.getState().plugins.enabled,
        monitor => monitor.when === `on-skill-invoke:${skillName}`,
        createContext(),
      )
    })
  }, [enabled, enabledPlugins, store])
}
