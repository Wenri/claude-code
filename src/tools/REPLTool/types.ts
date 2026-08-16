import type { Context } from 'vm'
import type { Tool } from '../../Tool.js'

export type ReplRegisteredTool = {
  name: string
  description: string
  schema: Record<string, unknown>
  handler: (args: Record<string, unknown>) => Promise<unknown>
  displayName?: string
}

export type ReplConsole = {
  log: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  debug: (...args: unknown[]) => void
  getStdout: () => string
  getStderr: () => string
  clear: () => void
}

export type ReplCallResult =
  | { kind: 'ok'; toolName: string; result: unknown }
  | { kind: 'err'; toolName: string; error: string }

export type ReplReplayEntry = {
  code: string
  calls: ReplCallResult[]
  threw: boolean
}

export type ReplProgressEvent = {
  type: 'repl_tool_call'
  toolName: string
  toolInput: unknown
  toolUseId: string
  phase: 'start' | 'complete' | 'error'
  result?: unknown
  error?: string
}

export type ReplProgressRecord = Omit<ReplProgressEvent, 'type'>

export type ReplSealers = {
  fn<T extends (...args: never[]) => unknown>(fn: T): T
  clone<T>(value: T): T
  throwVM(message: string): never
  asyncData(
    fn: (input: Record<string, unknown>) => Promise<unknown>,
  ): (input: Record<string, unknown>) => Promise<unknown>
  asyncDataN(
    fn: (...args: unknown[]) => Promise<unknown>,
  ): (...args: unknown[]) => Promise<unknown>
  asyncDataPropagate(
    fn: (input: unknown) => Promise<unknown>,
  ): (input: unknown) => Promise<unknown>
}

export type ReplContext = {
  vmContext: Context & Record<string, unknown>
  registeredTools: Map<string, ReplRegisteredTool>
  reservedGlobals: Set<string>
  toolWrapperNames: Set<string>
  boundaryUuid: string | null
  console: ReplConsole
  sealers: ReplSealers
  clearAllTimers: () => void
  replayLog: ReplReplayEntry[]
  helperState: { cwd: string; repo?: string | null }
}

export type ReplHydration =
  | { kind: 'fresh' }
  | { kind: 'resume' }
  | { kind: 'fork'; log: ReplReplayEntry[] }

export type ReplIsolationLatch = {
  current: 'web' | 'connectors' | null
  exemptServers?: Set<string>
  onLatch?: (value: 'web' | 'connectors') => void
}

export type ReplToolSet = readonly Tool[]
