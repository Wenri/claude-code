import { isAbsolute, resolve } from 'path'
import * as vm from 'vm'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import type {
  AssistantMessage,
} from '../../types/message.js'
import type {
  Tool,
  ToolCallProgress,
  ToolUseContext,
} from '../../Tool.js'
import { getCwd } from '../../utils/cwd.js'
import { BASH_TOOL_NAME } from '../BashTool/toolName.js'
import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '../FileWriteTool/prompt.js'
import { GLOB_TOOL_NAME } from '../GlobTool/prompt.js'
import { GREP_TOOL_NAME } from '../GrepTool/prompt.js'
import { POWERSHELL_TOOL_NAME } from '../PowerShellTool/toolName.js'
import { isBashToolEnabled } from '../../utils/shell/shellToolUtils.js'
import { installSamplingHelpers } from './sampling.js'
import { createToolWrappers } from './toolWrappers.js'
import type {
  ReplConsole,
  ReplContext,
  ReplProgressEvent,
  ReplRegisteredTool,
  ReplSealers,
} from './types.js'

const CONSOLE_LIMIT_BYTES = 52_428_800
const REGISTERED_TOOL_NAME = /^[a-zA-Z0-9_-]{1,111}$/
const RESERVED_HELPERS = [
  'sh',
  'cat',
  'rg',
  'rgf',
  'gl',
  'put',
  'gh',
  'chdir',
  'log',
  'str',
  'o',
  'REPO',
]
const GH_REPO_COMMAND = /^(pr|issue|run|workflow|release|label|cache)\b/
const GH_HAS_REPO = /(^|\s)(-R|--repo\b)/

type InnerCall = { id: string; name: string; input: unknown }

function createReplConsole(): ReplConsole {
  const stdout: string[] = []
  const stderr: string[] = []
  let bytes = 0

  const append = (target: string[], value: string) => {
    if (bytes >= CONSOLE_LIMIT_BYTES) return
    bytes += value.length
    target.push(value)
    if (bytes >= CONSOLE_LIMIT_BYTES) {
      target.push('[console output truncated at 50MB]')
    }
  }
  const format = (args: unknown[]) =>
    args
      .map(value => {
        if (typeof value === 'string') return value
        try {
          return JSON.stringify(value, null, 2)
        } catch {
          return String(value)
        }
      })
      .join(' ')

  return {
    log: (...args) => append(stdout, format(args)),
    info: (...args) => append(stdout, format(args)),
    debug: (...args) => append(stdout, format(args)),
    error: (...args) => append(stderr, format(args)),
    warn: (...args) => append(stderr, format(args)),
    getStdout: () => stdout.join('\n'),
    getStderr: () => stderr.join('\n'),
    clear: () => {
      stdout.length = 0
      stderr.length = 0
      bytes = 0
    },
  }
}

function stripPrototype<T extends object>(value: T): T {
  Object.setPrototypeOf(value, null)
  try {
    delete (value as { constructor?: unknown }).constructor
    delete (value as { prototype?: unknown }).prototype
  } catch {
    // Best effort: VM-bound functions are still installed as non-host globals.
  }
  return value
}

function createSealers(context: vm.Context): ReplSealers {
  const helpers = vm.runInContext(
    `({
      arr: () => [],
      obj: () => ({}),
      wrap: (hostFn, cloneFn) => async (input) => {
        try { return cloneFn(await hostFn(input)) }
        catch (e) {
          if (e?.name === 'ReplayCacheExhausted') throw e
          return { error: typeof e?.message === 'string' ? e.message : String(e) }
        }
      },
      wrapN: (hostFn, cloneFn) => async (...args) => {
        try { return cloneFn(await hostFn(...args)) }
        catch (e) {
          if (e?.name === 'ReplayCacheExhausted') throw e
          return { error: typeof e?.message === 'string' ? e.message : String(e) }
        }
      },
      wrapPropagate: (hostFn, cloneFn, Err) => async (input) => {
        try { return cloneFn(await hostFn(input)) }
        catch (e) {
          const err = new Err(typeof e?.message === 'string' ? e.message : String(e))
          if (typeof e?.name === 'string') err.name = e.name
          throw err
        }
      },
      Err: Error,
    })`,
    context,
  ) as {
    arr: () => unknown[]
    obj: () => Record<string, unknown>
    wrap: (
      fn: (input: unknown) => Promise<unknown>,
      clone: (value: unknown) => unknown,
    ) => (input: unknown) => Promise<unknown>
    wrapN: (
      fn: (...args: unknown[]) => Promise<unknown>,
      clone: (value: unknown) => unknown,
    ) => (...args: unknown[]) => Promise<unknown>
    wrapPropagate: (
      fn: (input: unknown) => Promise<unknown>,
      clone: (value: unknown) => unknown,
      error: ErrorConstructor,
    ) => (input: unknown) => Promise<unknown>
    Err: ErrorConstructor
  }

  const clone = <T>(value: T, seen = new WeakMap<object, unknown>()): T => {
    if (typeof value === 'function') return undefined as T
    if (value === null || typeof value !== 'object') return value
    const prior = seen.get(value)
    if (prior !== undefined) return prior as T
    if (Array.isArray(value)) {
      const result = helpers.arr()
      seen.set(value, result)
      for (let index = 0; index < value.length; index++) {
        result[index] = clone(value[index], seen)
      }
      return result as T
    }
    const result = helpers.obj()
    seen.set(value, result)
    for (const key of Object.keys(value)) {
      result[key] = clone((value as Record<string, unknown>)[key], seen)
    }
    return result as T
  }

  const throwAsVmError = (error: unknown): never => {
    let message: string
    try {
      message =
        typeof (error as { message?: unknown })?.message === 'string'
          ? (error as { message: string }).message
          : String(error)
    } catch {
      message = '<unprintable thrown value>'
    }
    throw new helpers.Err(message)
  }

  return {
    fn: fn =>
      stripPrototype(((...args: never[]) => {
        try {
          return fn(...args)
        } catch (error) {
          throwAsVmError(error)
        }
      }) as typeof fn),
    clone,
    throwVM: message => {
      throw new helpers.Err(message)
    },
    asyncData: fn => {
      const host = stripPrototype((input: Record<string, unknown>) => fn(input))
      return helpers.wrap(host, clone) as never
    },
    asyncDataN: fn => {
      const host = stripPrototype((...args: unknown[]) => fn(...args))
      return helpers.wrapN(host, clone)
    },
    asyncDataPropagate: fn => {
      const host = stripPrototype((input: unknown) => fn(input))
      return helpers.wrapPropagate(host, clone, helpers.Err)
    },
  }
}

function quotePosix(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function installHelperShorthands(
  vmContext: vm.Context & Record<string, unknown>,
  sealers: ReplSealers,
  helperState: ReplContext['helperState'],
): void {
  const absolute = (value: unknown) => {
    const path = String(value)
    return isAbsolute(path) ? path : resolve(helperState.cwd, path)
  }
  const invoke = (name: string, input: Record<string, unknown>) => {
    const tool = vmContext[name]
    if (typeof tool !== 'function') {
      sealers.throwVM(`${name} tool is not available in this REPL context`)
    }
    return (tool as (input: Record<string, unknown>) => Promise<unknown>)(input)
  }
  const object = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {}
  const stringField = (value: Record<string, unknown>, key: string) =>
    typeof value[key] === 'string' ? (value[key] as string) : ''
  const pathArg = (value: unknown) =>
    value !== undefined
      ? { path: absolute(value) }
      : helperState.cwd !== getCwd()
        ? { path: helperState.cwd }
        : {}

  const shell = async (command: string, timeout?: number) => {
    const isBash = isBashToolEnabled()
    const cwdPrefix =
      helperState.cwd === getCwd()
        ? ''
        : isBash
          ? `cd ${quotePosix(helperState.cwd)} && `
          : `Set-Location -LiteralPath '${helperState.cwd.replace(/'/g, "''")}'; `
    const result = object(
      await invoke(isBash ? BASH_TOOL_NAME : POWERSHELL_TOOL_NAME, {
        command: cwdPrefix + command,
        ...(typeof timeout === 'number' ? { timeout } : {}),
      }),
    )
    const stdout = stringField(result, 'stdout')
    const stderr = stringField(result, 'stderr')
    const error = stringField(result, 'error')
    return [
      stdout,
      stderr && `[stderr]\n${stderr}`,
      error && `[error] ${error}`,
    ]
      .filter(Boolean)
      .join('\n')
  }

  vmContext.sh = sealers.asyncDataN((command, timeout) =>
    shell(String(command), typeof timeout === 'number' ? timeout : undefined),
  )
  vmContext.gh = sealers.asyncDataN(async args => {
    let command = String(args).trim()
    const repo = helperState.repo
    if (repo && !GH_HAS_REPO.test(command)) {
      if (GH_REPO_COMMAND.test(command)) command = `${command} -R ${repo}`
      command = command.replaceAll('repos/:owner/:repo', `repos/${repo}`)
    }
    return shell(`gh ${command}`)
  })
  vmContext.cat = sealers.asyncDataN(async (path, offset, limit) => {
    const result = object(
      await invoke(FILE_READ_TOOL_NAME, {
        file_path: absolute(path),
        ...(typeof offset === 'number' ? { offset } : {}),
        ...(typeof limit === 'number' ? { limit } : {}),
      }),
    )
    return stringField(object(result.file), 'content') || stringField(result, 'error')
  })
  vmContext.rg = sealers.asyncDataN(async (pattern, path, options) => {
    const flags = object(options)
    const result = object(
      await invoke(GREP_TOOL_NAME, {
        pattern: String(pattern),
        output_mode: 'content',
        '-n': true,
        ...pathArg(path),
        ...(flags.A !== undefined ? { '-A': flags.A } : {}),
        ...(flags.B !== undefined ? { '-B': flags.B } : {}),
        ...(flags.C !== undefined ? { '-C': flags.C } : {}),
        ...(flags.glob !== undefined ? { glob: flags.glob } : {}),
        ...(flags.head !== undefined ? { head_limit: flags.head } : {}),
        ...(flags.type !== undefined ? { type: flags.type } : {}),
        ...(flags.i !== undefined ? { '-i': flags.i } : {}),
      }),
    )
    return stringField(result, 'content') || stringField(result, 'error')
  })
  vmContext.rgf = sealers.asyncDataN(async (pattern, path, glob) => {
    const result = object(
      await invoke(GREP_TOOL_NAME, {
        pattern: String(pattern),
        output_mode: 'files_with_matches',
        ...pathArg(path),
        ...(typeof glob === 'string' ? { glob } : {}),
      }),
    )
    return Array.isArray(result.filenames) ? result.filenames : []
  })
  vmContext.gl = sealers.asyncDataN(async (pattern, path) => {
    const result = object(
      await invoke(GLOB_TOOL_NAME, {
        pattern: String(pattern),
        ...pathArg(path),
      }),
    )
    return Array.isArray(result.filenames) ? result.filenames : []
  })
  vmContext.put = sealers.asyncDataN(async (path, content) => {
    const result = object(
      await invoke(FILE_WRITE_TOOL_NAME, {
        file_path: absolute(path),
        content: String(content),
      }),
    )
    const error = stringField(result, 'error')
    return error ? `[error] ${error}` : ''
  })
  vmContext.chdir = sealers.fn((path: never) => {
    helperState.cwd = absolute(path)
  })
  vmContext.log = (vmContext.console as { log: unknown }).log
  vmContext.str = sealers.fn(((value: unknown, replacer?: unknown, space?: unknown) => {
    if (typeof replacer === 'function') {
      sealers.throwVM('str: function replacer not supported')
    }
    return JSON.stringify(value, replacer as never, space as never)
  }) as never)
}

function installGlobals(
  vmContext: vm.Context & Record<string, unknown>,
  sealers: ReplSealers,
  replConsole: ReplConsole,
  toolWrappers: Record<string, (input: Record<string, unknown>) => Promise<unknown>>,
  samplers: Record<string, (...args: never[]) => Promise<unknown>>,
  registeredTools: Map<string, ReplRegisteredTool>,
  reservedGlobals: Set<string>,
  timers: Set<ReturnType<typeof setTimeout>>,
  helperState: ReplContext['helperState'],
): void {
  vmContext.console = {
    __proto__: null,
    log: sealers.fn(replConsole.log as never),
    info: sealers.fn(replConsole.info as never),
    debug: sealers.fn(replConsole.debug as never),
    error: sealers.fn(replConsole.error as never),
    warn: sealers.fn(replConsole.warn as never),
  }
  for (const [name, wrapper] of Object.entries(toolWrappers)) {
    vmContext[name] = sealers.asyncData(wrapper)
  }
  for (const [name, sampler] of Object.entries(samplers)) {
    vmContext[name] = sealers.asyncDataN(sampler)
  }

  vmContext.setTimeout = sealers.fn(((callback: () => void, delay?: number) => {
    const timer = setTimeout(callback, delay)
    timers.add(timer)
    return Number(timer)
  }) as never)
  vmContext.clearTimeout = sealers.fn(((timer: ReturnType<typeof setTimeout>) => {
    clearTimeout(timer)
    timers.delete(timer)
  }) as never)
  vmContext.setInterval = sealers.fn(((callback: () => void, delay?: number) => {
    const timer = setInterval(callback, delay)
    timers.add(timer)
    return Number(timer)
  }) as never)
  vmContext.clearInterval = sealers.fn(((timer: ReturnType<typeof setInterval>) => {
    clearInterval(timer)
    timers.delete(timer)
  }) as never)
  vmContext.atob = sealers.fn(((value: string) => atob(value)) as never)
  vmContext.btoa = sealers.fn(((value: string) => btoa(value)) as never)
  vmContext.shQuote = sealers.fn(
    ((value: unknown) => `'${String(value).replaceAll("'", "'\\''")}'`) as never,
  )
  vmContext.registerTool = sealers.fn(
    ((
      name: unknown,
      description: string,
      schema: Record<string, unknown>,
      handler: (input: Record<string, unknown>) => Promise<unknown>,
      options?: { displayName?: string },
    ) => {
      if (typeof name !== 'string' || !REGISTERED_TOOL_NAME.test(name)) {
        sealers.throwVM(
          `registerTool: name must match ^[a-zA-Z0-9_-]{1,111}$ (wire name is prefixed with 'eval_registered__'), got ${typeof name}: ${String(name).slice(0, 50)}`,
        )
      }
      if (reservedGlobals.has(name) && !registeredTools.has(name)) {
        sealers.throwVM(
          `registerTool: '${name}' collides with a built-in global; choose a different name`,
        )
      }
      registeredTools.set(name, {
        name,
        description,
        schema,
        handler,
        displayName: options?.displayName,
      })
      vmContext[name] = sealers.asyncData(handler)
    }) as never,
  )
  vmContext.unregisterTool = sealers.fn(((name: string) => {
    if (!registeredTools.has(name)) return false
    delete vmContext[name]
    return registeredTools.delete(name)
  }) as never)
  vmContext.listTools = sealers.fn(
    (() => sealers.clone([...registeredTools.keys()])) as never,
  )
  installHelperShorthands(vmContext, sealers, helperState)
  vmContext.getTool = sealers.fn(((name: string) => {
    const registration = registeredTools.get(name)
    return registration
      ? sealers.clone({
          name: registration.name,
          description: registration.description,
          schema: registration.schema,
          displayName: registration.displayName,
        })
      : undefined
  }) as never)
}

export function resetReplHelpers(context: ReplContext, repo?: string | null): void {
  context.helperState.cwd = getCwd()
  if (repo !== undefined) context.helperState.repo = repo
  context.vmContext.REPO = context.helperState.repo ?? ''
  context.vmContext.o = context.sealers.clone({})
}

export async function awaitObjectPromises(
  context: ReplContext,
  value: unknown,
): Promise<unknown> {
  const result = value === undefined ? context.vmContext.o : value
  if (result === null || typeof result !== 'object' || Array.isArray(result)) {
    return result
  }
  const object = result as Record<string, unknown>
  try {
    for (const key of Object.keys(object)) {
      try {
        const pending = object[key]
        if (
          pending === null ||
          typeof pending !== 'object' ||
          typeof (pending as { then?: unknown }).then !== 'function'
        ) {
          continue
        }
        object[key] = await pending
      } catch (error) {
        const message = (error as { message?: unknown })?.message
        object[key] = {
          error: typeof message === 'string' ? message : String(error),
        }
      }
    }
  } catch {
    // Cross-realm/proxy access can fail; return the original value unchanged.
  }
  return object
}

export function createReplContext(
  tools: readonly Tool[],
  toolContext: ToolUseContext,
  canUseTool: CanUseToolFn,
  parentMessage: AssistantMessage,
  onProgress?: ToolCallProgress<ReplProgressEvent>,
): ReplContext {
  const registeredTools = new Map<string, ReplRegisteredTool>()
  const replConsole = createReplConsole()
  const reservedGlobals = new Set<string>()
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const helperState: ReplContext['helperState'] = {
    cwd: getCwd(),
    repo: undefined,
  }
  const vmContext = vm.createContext(
    { __proto__: null },
    { codeGeneration: { strings: true, wasm: false } },
  ) as vm.Context & Record<string, unknown>
  const sealers = createSealers(vmContext)
  vm.runInContext(
    `Object.defineProperty(Error, 'prepareStackTrace', {
      value: (err, sites) => String(err.stack ?? err),
      writable: false, configurable: false,
    });
    delete globalThis.ShadowRealm;
    delete globalThis.WebAssembly;`,
    vmContext,
  )
  const innerCalls: InnerCall[] = []
  const wrappers = createToolWrappers(
    tools,
    toolContext,
    canUseTool,
    parentMessage,
    innerCalls,
    [...toolContext.options.tools, ...tools],
    onProgress,
  )
  const samplers = installSamplingHelpers(toolContext, onProgress)
  installGlobals(
    vmContext,
    sealers,
    replConsole,
    wrappers,
    samplers as never,
    registeredTools,
    reservedGlobals,
    timers,
    helperState,
  )
  Object.keys(vmContext).forEach(name => reservedGlobals.add(name))
  RESERVED_HELPERS.forEach(name => reservedGlobals.add(name))
  try {
    const globals = vm.runInContext(
      'Object.getOwnPropertyNames(globalThis)',
      vmContext,
    ) as string[]
    globals.forEach(name => reservedGlobals.add(name))
  } catch {
    ;['JSON', 'Array', 'Object', 'Promise', 'globalThis'].forEach(name =>
      reservedGlobals.add(name),
    )
  }
  reservedGlobals.add('__proto__')
  return {
    vmContext,
    registeredTools,
    reservedGlobals,
    toolWrapperNames: new Set([
      ...Object.keys(wrappers),
      ...Object.keys(samplers),
    ]),
    boundaryUuid: null,
    console: replConsole,
    sealers,
    clearAllTimers: () => {
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
    },
    replayLog: [],
    helperState,
  }
}

export function refreshReplContext(
  replContext: ReplContext,
  tools: readonly Tool[],
  toolContext: ToolUseContext,
  canUseTool: CanUseToolFn,
  parentMessage: AssistantMessage,
  onProgress?: ToolCallProgress<ReplProgressEvent>,
): void {
  const innerCalls: InnerCall[] = []
  const wrappers = createToolWrappers(
    tools,
    toolContext,
    canUseTool,
    parentMessage,
    innerCalls,
    [...toolContext.options.tools, ...tools],
    onProgress,
  )
  const samplers = installSamplingHelpers(toolContext, onProgress)
  installGlobals(
    replContext.vmContext,
    replContext.sealers,
    replContext.console,
    wrappers,
    samplers as never,
    replContext.registeredTools,
    replContext.reservedGlobals,
    new Set(),
    replContext.helperState,
  )
  Object.keys(wrappers).forEach(name => replContext.toolWrapperNames.add(name))
  Object.keys(samplers).forEach(name => replContext.toolWrapperNames.add(name))
}
