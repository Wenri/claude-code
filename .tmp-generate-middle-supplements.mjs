import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse } from './recovery/node_modules/acorn/dist/acorn.mjs'

const root = process.cwd()

function run(cwd, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: options.encoding ?? 'utf8',
    input: options.input,
    maxBuffer: 512 * 1024 * 1024,
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`)
  }
  return result.stdout
}

function replaceOnce(text, before, after, label) {
  const index = text.indexOf(before)
  if (index < 0) throw new Error(`missing ${label}`)
  if (text.indexOf(before, index + 1) >= 0) throw new Error(`duplicate ${label}`)
  return text.slice(0, index) + after + text.slice(index + before.length)
}

function block(text, start, end) {
  const startAt = text.indexOf(start)
  if (startAt < 0) throw new Error(`missing block start ${start}`)
  const endAt = text.indexOf(end, startAt)
  if (endAt < 0) throw new Error(`missing block end ${end}`)
  return text.slice(startAt, endAt)
}

function replaceBlock(text, start, end, replacement) {
  const old = block(text, start, end)
  return replaceOnce(text, old, replacement, start)
}

function diffHunks(diff, predicate) {
  if (!diff.trim()) return ''
  const lines = diff.split('\n')
  const header = []
  let index = 0
  while (index < lines.length && !lines[index].startsWith('@@ ')) header.push(lines[index++])
  const hunks = []
  while (index < lines.length) {
    const hunk = []
    if (!lines[index].startsWith('@@ ')) {
      index++
      continue
    }
    hunk.push(lines[index++])
    while (index < lines.length && !lines[index].startsWith('@@ ')) hunk.push(lines[index++])
    if (predicate(hunk.join('\n'))) hunks.push(hunk.join('\n'))
  }
  return hunks.length ? `${header.join('\n')}\n${hunks.join('\n')}\n` : ''
}

function materialize(commit, caseName) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), `middle-supplement-${caseName}-`))
  const archive = execFileSync('git', ['archive', '--format=tar', commit], { cwd: root, maxBuffer: 512 * 1024 * 1024 })
  run(temp, 'tar', ['-xf', '-'], { input: archive, encoding: 'buffer' })
  run(temp, 'git', ['init', '-q'])
  run(temp, 'git', ['config', 'user.email', 'recovery@example.invalid'])
  run(temp, 'git', ['config', 'user.name', 'Recovery Audit'])
  run(temp, 'git', ['add', '.'])
  run(temp, 'git', ['commit', '-qm', 'semantic base'])
  return temp
}

function copyFile(temp, relative) {
  const destination = path.join(temp, relative)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(path.join(root, relative), destination)
}

function buildLoopChainStartedAt97(temp) {
  const relative = 'src/bootstrap/state.ts'
  const filename = path.join(temp, relative)
  let source = fs.readFileSync(filename, 'utf8')

  source = replaceOnce(
    source,
    `export type AttributedCounter = {
  add(value: number, additionalAttributes?: Attributes): void
}

`,
    `export type AttributedCounter = {
  add(value: number, additionalAttributes?: Attributes): void
}

export type LoopChainState = {
  startedAt: number
  lastScheduledFor: number
  agedOut?: boolean
}

`,
    'target97 loop-chain state type',
  )
  source = replaceOnce(
    source,
    `  sessionCronTasks: SessionCronTask[]
  // Teams created this session via TeamCreate. cleanupSessionTeams()`,
    `  sessionCronTasks: SessionCronTask[]
  // Per-prompt lifetime state for dynamically paced /loop chains.
  loopChainStartedAt: Record<string, LoopChainState>
  // Teams created this session via TeamCreate. cleanupSessionTeams()`,
    'target97 loop-chain state field',
  )
  source = replaceOnce(
    source,
    `    sessionCronTasks: [],
    sessionCreatedTeams: new Set(),`,
    `    sessionCronTasks: [],
    loopChainStartedAt: Object.create(null) as Record<string, LoopChainState>,
    sessionCreatedTeams: new Set(),`,
    'target97 loop-chain state initializer',
  )
  source = replaceOnce(
    source,
    `export function addSessionCronTask(task: SessionCronTask): void {
  STATE.sessionCronTasks.push(task)
}

`,
    `export function addSessionCronTask(task: SessionCronTask): void {
  STATE.sessionCronTasks.push(task)
}

export function getLoopChainStartedAt(
  prompt: string,
): LoopChainState | undefined {
  return STATE.loopChainStartedAt[prompt]
}

export function setLoopChainStartedAt(
  prompt: string,
  state: LoopChainState,
): void {
  STATE.loopChainStartedAt[prompt] = state
}

export function deleteLoopChainStartedAt(prompt: string): void {
  delete STATE.loopChainStartedAt[prompt]
}

`,
    'target97 loop-chain state accessors',
  )
  fs.writeFileSync(filename, source)
}

function buildSessionWriterCoordination97(temp) {
  const edit = (relative, transform) => {
    const filename = path.join(temp, relative)
    fs.writeFileSync(filename, transform(fs.readFileSync(filename, 'utf8')))
  }

  edit('src/utils/sessionStorage.ts', source => {
    source = replaceOnce(
      source,
      `export function isChainParticipant(m: Pick<Message, 'type'>): boolean {
  return m.type !== 'progress'
}

`,
      `export function isChainParticipant(m: Pick<Message, 'type'>): boolean {
  return m.type !== 'progress'
}

/**
 * Return the transcript cursor that is safe to persist.
 *
 * While a response is streaming, its assistant message is added before the
 * final message_delta fills in stop_reason. Keep that open message (and any
 * later entries) behind the cursor until the response is complete. Terminal
 * paths can disable the guard to force the remaining entries through.
 */
export function transcriptCursorEnd(
  messages: Message[],
  startIndex: number,
  stopAtIncompleteAssistant: boolean,
): number {
  if (!stopAtIncompleteAssistant) return messages.length

  for (let index = startIndex; index < messages.length; index++) {
    const message = messages[index]!
    if (
      message.type === 'assistant' &&
      message.message.stop_reason === null
    ) {
      return index
    }
  }

  return messages.length
}

`,
      'target97 transcript cursor barrier',
    )
    source = replaceOnce(
      source,
      `export function fireSessionMirror(filePath: string, entries: Entry[]): void {
  getProject().fireMirror(filePath, entries)
}

const REMOTE_FLUSH_INTERVAL_MS = 10
`,
      `export function fireSessionMirror(filePath: string, entries: Entry[]): void {
  getProject().fireMirror(filePath, entries)
}

/** Track a write performed outside Project's normal transcript queue. */
export function trackSessionWrite<T>(fn: () => Promise<T>): Promise<T> {
  return getProject().trackExternalWrite(fn)
}

const REMOTE_FLUSH_INTERVAL_MS = 10
`,
      'target97 tracked session-write export',
    )
    source = replaceOnce(
      source,
      `  private async trackWrite<T>(fn: () => Promise<T>): Promise<T> {
    this.incrementPendingWrites()
    try {
      return await fn()
    } finally {
      this.decrementPendingWrites()
    }
  }

  private enqueueWrite(filePath: string, entry: Entry): Promise<void> {
`,
      `  private async trackWrite<T>(fn: () => Promise<T>): Promise<T> {
    this.incrementPendingWrites()
    try {
      return await fn()
    } finally {
      this.decrementPendingWrites()
    }
  }

  trackExternalWrite<T>(fn: () => Promise<T>): Promise<T> {
    return this.trackWrite(fn)
  }

  private enqueueWrite(filePath: string, entry: Entry): Promise<void> {
`,
      'target97 external-write adapter',
    )
    return source
  })

  applySelectedExactDiff(
    temp,
    root,
    'src/services/PromptSuggestion/speculation.ts',
    hunk => /trackSessionWrite|fireSessionMirror/.test(hunk),
  )
  applySelectedExactDiff(
    temp,
    root,
    'src/hooks/useLogMessages.ts',
    hunk =>
      /transcriptCursorEnd|isLoading|lastSeenLengthRef|scanStart|endIndex/.test(
        hunk,
      ),
  )

  edit('src/screens/REPL.tsx', source =>
    replaceOnce(
      source,
      '  useLogMessages(messages, messages.length === initialMessages?.length);',
      '  useLogMessages(messages, messages.length === initialMessages?.length, isLoading);',
      'target97 REPL transcript loading state',
    ),
  )

  edit('src/QueryEngine.ts', source => {
    source = replaceOnce(
      source,
      `  isLoggableMessage,
  recordTranscript,
} from './utils/sessionStorage.js'`,
      `  isLoggableMessage,
  recordTranscript,
  transcriptCursorEnd,
} from './utils/sessionStorage.js'`,
      'target97 QueryEngine cursor import',
    )
    source = replaceOnce(
      source,
      `    const messages = [...this.mutableMessages]
    let transcriptCursor = 0
    let lastRecordedUuid: UUID | undefined
    const recordNewMessages = (): Promise<UUID | null> => {
      const start = transcriptCursor
      if (start >= messages.length) return Promise.resolve(null)

      const newMessages = start === 0 ? messages : messages.slice(start)
      transcriptCursor = messages.length
      const startingParentUuid = lastRecordedUuid
`,
      `    const messages = [...this.mutableMessages]
    let transcriptCursor = 0
    let lastRecordedUuid: UUID | undefined
    const initialTranscriptLength = messages.length
    const recordNewMessages = (
      forceIncompleteAssistant: boolean = false,
    ): Promise<UUID | null> => {
      const start = transcriptCursor
      const end = transcriptCursorEnd(
        messages,
        Math.max(start, initialTranscriptLength),
        !forceIncompleteAssistant,
      )
      if (start >= end) return Promise.resolve(null)

      const newMessages =
        start === 0 && end === messages.length
          ? messages
          : messages.slice(start, end)
      transcriptCursor = end
      const startingParentUuid = lastRecordedUuid
`,
      'target97 QueryEngine guarded transcript cursor',
    )
    source = replaceOnce(
      source,
      `            if (message.event.delta.stop_reason != null) {
              lastStopReason = message.event.delta.stop_reason
            }
          }
          if (message.event.type === 'message_stop') {`,
      `            if (message.event.delta.stop_reason != null) {
              lastStopReason = message.event.delta.stop_reason
            }
            if (persistSession) void recordNewMessages()
          }
          if (message.event.type === 'message_stop') {`,
      'target97 message-delta transcript retry',
    )
    source = replaceOnce(
      source,
      `          else if (message.attachment.type === 'max_turns_reached') {
            if (persistSession) {
              if (`,
      `          else if (message.attachment.type === 'max_turns_reached') {
            if (persistSession) {
              await recordNewMessages(true)
              if (`,
      'target97 max-turn terminal transcript drain',
    )
    source = replaceOnce(
      source,
      `      if (maxBudgetUsd !== undefined && getTotalCost() >= maxBudgetUsd) {
        if (persistSession) {
          if (`,
      `      if (maxBudgetUsd !== undefined && getTotalCost() >= maxBudgetUsd) {
        if (persistSession) {
          await recordNewMessages(true)
          if (`,
      'target97 max-budget terminal transcript drain',
    )
    source = replaceOnce(
      source,
      `        if (callsThisQuery >= maxRetries) {
          if (persistSession) {
            if (`,
      `        if (callsThisQuery >= maxRetries) {
          if (persistSession) {
            await recordNewMessages(true)
            if (`,
      'target97 structured-output terminal transcript drain',
    )
    source = replaceOnce(
      source,
      `    // result message, so any unflushed writes would be lost.
    if (persistSession) {
      if (`,
      `    // result message, so any unflushed writes would be lost.
    if (persistSession) {
      await recordNewMessages(true)
      if (`,
      'target97 final transcript drain',
    )
    return source
  })
}

function buildBridgeGitSessionContext97(temp) {
  copyFile(temp, 'src/bridge/gitSessionContext.ts')
  applySelectedExactDiff(
    temp,
    root,
    'src/bridge/createSession.ts',
    hunk =>
      /buildGitSessionContext|getOriginalCwd|reuse_outcome_branches/.test(
        hunk,
      ),
  )
}

function normalizeTerminalNewline(temp, relative) {
  const filename = path.join(temp, relative)
  fs.writeFileSync(filename, `${fs.readFileSync(filename, 'utf8').trimEnd()}\n`)
}

function applyWorkingDiff(temp, files) {
  const diff = run(root, 'git', ['diff', '--binary', 'HEAD', '--', ...files])
  if (diff.trim()) run(temp, 'git', ['apply', '-'], { input: diff })
}

function applySelectedWorkingDiff(temp, relative, predicate) {
  const diff = run(root, 'git', ['diff', '--binary', 'HEAD', '--', relative])
  const selected = diffHunks(diff, predicate)
  if (selected.trim()) run(temp, 'git', ['apply', '-'], { input: selected })
}

function applySelectedExactDiff(temp, exactRoot, relative, predicate) {
  const destination = path.join(temp, relative)
  const exact = path.join(exactRoot, relative)
  if (!fs.existsSync(exact)) {
    throw new Error(`missing exact recovered owner ${exact}`)
  }
  const result = spawnSync(
    'diff',
    [
      '-u',
      '--label',
      `a/${relative}`,
      '--label',
      `b/${relative}`,
      destination,
      exact,
    ],
    { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 },
  )
  if (result.status === 0) return
  if (result.status !== 1) {
    throw new Error(`diff failed for exact owner ${relative}:\n${result.stderr}`)
  }
  const selected = diffHunks(result.stdout, predicate)
  if (selected.trim()) run(temp, 'git', ['apply', '-'], { input: selected })
}

function buildAdditionalModelCosts97(temp) {
  const edit = (relative, transform) => {
    const filename = path.join(temp, relative)
    fs.writeFileSync(filename, transform(fs.readFileSync(filename, 'utf8')))
  }

  edit('src/utils/config.ts', source => {
    source = replaceOnce(
      source,
      "import type { ImageDimensions } from './imageResizer.js'\nimport type { ModelOption } from './model/modelOptions.js'",
      "import type { ImageDimensions } from './imageResizer.js'\nimport type { ModelCosts } from './modelCost.js'\nimport type { ModelOption } from './model/modelOptions.js'",
      'target97 additional model-cost config import',
    )
    return replaceOnce(
      source,
      '  // Additional model options for the model picker (fetched during bootstrap).\n  additionalModelOptionsCache?: ModelOption[]',
      '  // Additional model options for the model picker (fetched during bootstrap).\n  additionalModelOptionsCache?: ModelOption[]\n\n  // Additional model pricing returned by bootstrap for models not in the\n  // bundled pricing table.\n  additionalModelCostsCache?: Record<string, ModelCosts>',
      'target97 additional model-cost config field',
    )
  })

  edit('src/services/api/bootstrap.ts', source => {
    source = replaceOnce(
      source,
      '      )\n      .nullish(),\n  }),',
      `      )
      .nullish(),
    additional_model_costs: z
      .record(
        z
          .object({
            input_tokens: z.number(),
            output_tokens: z.number(),
            prompt_cache_write_tokens: z.number(),
            prompt_cache_read_tokens: z.number(),
            web_search_requests: z.number().nullish(),
          })
          .transform(value => ({
            inputTokens: value.input_tokens,
            outputTokens: value.output_tokens,
            promptCacheWriteTokens: value.prompt_cache_write_tokens,
            promptCacheReadTokens: value.prompt_cache_read_tokens,
            webSearchRequests: value.web_search_requests ?? 0.01,
          })),
      )
      .nullish(),
  }),`,
      'target97 additional model-cost bootstrap schema',
    )
    source = replaceOnce(
      source,
      '    const additionalModelOptions = response.additional_model_options ?? []',
      '    const additionalModelOptions = response.additional_model_options ?? []\n    const additionalModelCosts = response.additional_model_costs ?? {}',
      'target97 additional model-cost response',
    )
    source = replaceOnce(
      source,
      '      isEqual(config.clientDataCache, clientData) &&\n      isEqual(config.additionalModelOptionsCache, additionalModelOptions)',
      '      isEqual(config.clientDataCache, clientData) &&\n      isEqual(config.additionalModelOptionsCache, additionalModelOptions) &&\n      isEqual(config.additionalModelCostsCache, additionalModelCosts)',
      'target97 additional model-cost equality',
    )
    return replaceOnce(
      source,
      '      clientDataCache: clientData,\n      additionalModelOptionsCache: additionalModelOptions,',
      '      clientDataCache: clientData,\n      additionalModelOptionsCache: additionalModelOptions,\n      additionalModelCostsCache: additionalModelCosts,',
      'target97 additional model-cost persistence',
    )
  })

  edit('src/utils/modelCost.ts', source => {
    source = replaceOnce(
      source,
      "import { setHasUnknownModelCost } from '../bootstrap/state.js'\nimport { isFastModeEnabled } from './fastMode.js'",
      "import { setHasUnknownModelCost } from '../bootstrap/state.js'\nimport { getGlobalConfig } from './config.js'\nimport { isFastModeEnabled } from './fastMode.js'",
      'target97 additional model-cost lookup import',
    )
    return replaceOnce(
      source,
      `  const costs = MODEL_COSTS[shortName]
  if (!costs) {
    trackUnknownModelCost(model, shortName)
    return (
      MODEL_COSTS[getCanonicalName(getDefaultMainLoopModelSetting())] ??
      DEFAULT_UNKNOWN_MODEL_COST
    )
  }
  return costs`,
      `  const costs = MODEL_COSTS[shortName]
  if (costs) return costs

  const additionalCosts = getGlobalConfig().additionalModelCostsCache
  const configuredCosts = additionalCosts?.[model] ?? additionalCosts?.[shortName]
  if (configuredCosts) return configuredCosts

  trackUnknownModelCost(model, shortName)
  return (
    MODEL_COSTS[getCanonicalName(getDefaultMainLoopModelSetting())] ??
    DEFAULT_UNKNOWN_MODEL_COST
  )`,
      'target97 additional model-cost fallback',
    )
  })
}

function buildSandboxMachLookup97(temp) {
  const relative = 'src/utils/sandbox/sandbox-adapter.ts'
  const filename = path.join(temp, relative)
  let source = fs.readFileSync(filename, 'utf8')

  source = replaceOnce(
    source,
    '      allowLocalBinding: settings.sandbox?.network?.allowLocalBinding,\n      httpProxyPort:',
    '      allowLocalBinding: settings.sandbox?.network?.allowLocalBinding,\n      allowMachLookup: settings.sandbox?.network?.allowMachLookup,\n      httpProxyPort:',
    'target97 sandbox Mach-lookup runtime config',
  )
  source = replaceOnce(
    source,
    '  getAllowLocalBinding(): boolean | undefined\n  getIgnoreViolations():',
    '  getAllowLocalBinding(): boolean | undefined\n  getAllowMachLookup(): string[] | undefined\n  getIgnoreViolations():',
    'target97 sandbox Mach-lookup manager interface',
  )
  source = replaceOnce(
    source,
    '  getAllowLocalBinding: BaseSandboxManager.getAllowLocalBinding,\n  getEnableWeakerNestedSandbox:',
    '  getAllowLocalBinding: BaseSandboxManager.getAllowLocalBinding,\n  getAllowMachLookup: BaseSandboxManager.getAllowMachLookup,\n  getEnableWeakerNestedSandbox:',
    'target97 sandbox Mach-lookup manager forwarding',
  )
  fs.writeFileSync(filename, source)
}

function buildAutoDreamFirstEnable97(temp) {
  const relative = 'src/components/memory/MemoryFileSelector.tsx'
  const filename = path.join(temp, relative)
  let source = fs.readFileSync(filename, 'utf8')

  source = replaceOnce(
    source,
    "import { updateSettingsForSource } from '../../utils/settings/settings.js';",
    "import { getInitialSettings, updateSettingsForSource } from '../../utils/settings/settings.js';",
    'target97 auto-dream initial-settings import',
  )
  source = replaceOnce(
    source,
    `    t6 = function handleToggleAutoDream() {
      const newValue_0 = !autoDreamOn;
      updateSettingsForSource("userSettings", {`,
    `    t6 = function handleToggleAutoDream() {
      const newValue_0 = !autoDreamOn;
      const isFirstEnable = newValue_0 && getInitialSettings().autoDreamEnabled === undefined;
      updateSettingsForSource("userSettings", {`,
    'target97 auto-dream first-enable snapshot',
  )
  source = replaceOnce(
    source,
    `      logEvent("tengu_auto_dream_toggled", {
        enabled: newValue_0
      });`,
    `      logEvent("tengu_auto_dream_toggled", {
        enabled: newValue_0,
        is_first_enable: isFirstEnable
      });`,
    'target97 auto-dream first-enable telemetry',
  )
  fs.writeFileSync(filename, source)
}

function buildReplBridgeConfigAliases97(temp) {
  const relative = 'src/bridge/envLessBridgeConfig.ts'
  const filename = path.join(temp, relative)
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    `  return cfg.should_show_app_upgrade_message
}
`,
    `  return cfg.should_show_app_upgrade_message
}

// Stable names exposed by the Remote Control config module. Keep the
// env-less names above for descriptive internal call sites.
export {
  DEFAULT_ENV_LESS_BRIDGE_CONFIG as DEFAULT_REPL_BRIDGE_CONFIG,
  checkEnvLessBridgeMinVersion as checkReplBridgeMinVersion,
  getEnvLessBridgeConfig as getReplBridgeConfig,
}
`,
    'target97 REPL bridge config aliases',
  )
  fs.writeFileSync(filename, source)
}

function buildNotificationLifecycle97(temp) {
  const notificationRelative = 'src/context/notifications.tsx'
  const notificationFilename = path.join(temp, notificationRelative)
  let notifications = fs.readFileSync(notificationFilename, 'utf8')

  notifications = replaceOnce(
    notifications,
    "import { useCallback, useEffect } from 'react';",
    "import { createContext, useCallback, useContext, useEffect, useRef } from 'react';",
    'target97 notification React hooks import',
  )
  notifications = replaceOnce(
    notifications,
    `// Track current timeout to clear it when immediate notifications arrive
let currentTimeoutId: NodeJS.Timeout | null = null;
`,
    `type NotificationLifecycle = {
  currentTimeoutId: { current: NodeJS.Timeout | null };
  mountCount: { current: number };
};

const NotificationLifecycleContext = createContext<NotificationLifecycle | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }): React.ReactNode {
  const lifecycle = useRef<NotificationLifecycle>({
    currentTimeoutId: { current: null },
    mountCount: { current: 0 }
  }).current;
  return <NotificationLifecycleContext.Provider value={lifecycle}>{children}</NotificationLifecycleContext.Provider>;
}

`,
    'target97 notification provider lifecycle',
  )

  const hookStart = notifications.indexOf('export function useNotifications')
  const hookEnd = notifications.indexOf('\nconst PRIORITIES:', hookStart)
  if (hookStart < 0 || hookEnd < 0) {
    throw new Error('missing target97 notification hook boundaries')
  }
  let hook = notifications.slice(hookStart, hookEnd)
  const timeoutReferences = hook.match(/currentTimeoutId/g)?.length ?? 0
  if (timeoutReferences !== 18) {
    throw new Error(
      `unexpected target97 notification timeout reference count ${timeoutReferences}`,
    )
  }
  hook = hook.replaceAll('currentTimeoutId', 'currentTimeoutId.current')
  for (const [before, after, label] of [
    [
      '(setAppState, nextKey, processQueue) => {',
      '(setAppState, nextKey, processQueue, currentTimeoutId) => {',
      'queue timeout lifecycle argument',
    ],
    [
      'setAppState, next.key, processQueue);',
      'setAppState, next.key, processQueue, currentTimeoutId);',
      'queue timeout lifecycle value',
    ],
    [
      '(setAppState, notif, processQueue) => {',
      '(setAppState, notif, processQueue, currentTimeoutId) => {',
      'immediate timeout lifecycle argument',
    ],
    [
      'setAppState, notif, processQueue);',
      'setAppState, notif, processQueue, currentTimeoutId);',
      'immediate timeout lifecycle value',
    ],
    [
      '(setAppState, foldedKey, processQueue) => {',
      '(setAppState, foldedKey, processQueue, currentTimeoutId) => {',
      'fold timeout lifecycle argument',
    ],
    [
      'setAppState, folded.key, processQueue);',
      'setAppState, folded.key, processQueue, currentTimeoutId);',
      'fold timeout lifecycle value',
    ],
  ]) {
    hook = replaceOnce(hook, before, after, `target97 notification ${label}`)
  }
  hook = replaceOnce(
    hook,
    `  const store = useAppStateStore();
  const setAppState = useSetAppState();
`,
    `  const store = useAppStateStore();
  const setAppState = useSetAppState();
  const providerLifecycle = useContext(NotificationLifecycleContext);
  const fallbackLifecycle = useRef<NotificationLifecycle>({
    currentTimeoutId: { current: null },
    mountCount: { current: 0 }
  }).current;
  const { currentTimeoutId, mountCount } = providerLifecycle ?? fallbackLifecycle;
`,
    'target97 notification consumer lifecycle',
  )
  hook = replaceOnce(
    hook,
    '  }, [setAppState]);',
    '  }, [setAppState, currentTimeoutId]);',
    'target97 notification process dependencies',
  )
  const consumerDependencies = '  }, [setAppState, processQueue]);'
  const dependencyCount = hook.split(consumerDependencies).length - 1
  if (dependencyCount !== 2) {
    throw new Error(
      `unexpected target97 notification consumer dependency count ${dependencyCount}`,
    )
  }
  hook = hook.replaceAll(
    consumerDependencies,
    '  }, [setAppState, processQueue, currentTimeoutId]);',
  )
  hook = replaceOnce(
    hook,
    `  useEffect(() => {
    if (store.getState().notifications.queue.length > 0) {
      processQueue();
    }
  }, []);`,
    `  useEffect(() => {
    mountCount.current++;
    if (store.getState().notifications.queue.length > 0) {
      processQueue();
    }
    return () => {
      mountCount.current--;
      if (mountCount.current === 0 && currentTimeoutId.current) {
        clearTimeout(currentTimeoutId.current);
        currentTimeoutId.current = null;
      }
    };
  }, []);`,
    'target97 notification last-consumer cleanup',
  )
  notifications =
    notifications.slice(0, hookStart) + hook + notifications.slice(hookEnd)
  fs.writeFileSync(notificationFilename, notifications)

  const appRelative = 'src/components/App.tsx'
  const appFilename = path.join(temp, appRelative)
  let app = fs.readFileSync(appFilename, 'utf8')
  app = replaceOnce(
    app,
    "import { FpsMetricsProvider } from '../context/fpsMetrics.js';",
    "import { FpsMetricsProvider } from '../context/fpsMetrics.js';\nimport { NotificationProvider } from '../context/notifications.js';",
    'target97 notification provider App import',
  )
  app = replaceOnce(
    app,
    '    t1 = <AppStateProvider initialState={initialState} onChangeAppState={onChangeAppState}>{children}</AppStateProvider>;',
    '    t1 = <AppStateProvider initialState={initialState} onChangeAppState={onChangeAppState}><NotificationProvider>{children}</NotificationProvider></AppStateProvider>;',
    'target97 notification provider App reachability',
  )
  fs.writeFileSync(appFilename, app)
}

function buildAutoModeDenialsProvider97(temp) {
  const ownerRelative = 'src/utils/autoModeDenials.ts'
  const ownerFilename = path.join(temp, ownerRelative)
  let owner = fs.readFileSync(ownerFilename, 'utf8')
  owner = replaceOnce(
    owner,
    "import { feature } from 'bun:bundle'",
    "import { feature } from 'bun:bundle'\nimport type * as React from 'react'\nimport { createContext, createElement, useContext, useRef } from 'react'",
    'target97 auto-mode denial React context imports',
  )
  owner = replaceOnce(
    owner,
    `let DENIALS: readonly AutoModeDenial[] = []
const MAX_DENIALS = 20

export function recordAutoModeDenial(denial: AutoModeDenial): void {
  if (!feature('TRANSCRIPT_CLASSIFIER')) return
  DENIALS = [denial, ...DENIALS.slice(0, MAX_DENIALS - 1)]
}

export function getAutoModeDenials(): readonly AutoModeDenial[] {
  return DENIALS
}`,
    `const MAX_DENIALS = 20

type AutoModeDenialsApi = {
  getDenials: () => readonly AutoModeDenial[]
  recordDenial: (denial: AutoModeDenial) => void
}

const AutoModeDenialsContext = createContext<AutoModeDenialsApi>({
  getDenials: () => [],
  recordDenial: () => {},
})

export function AutoModeDenialsProvider({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode {
  const denials = useRef<readonly AutoModeDenial[]>([])
  const api = useRef<AutoModeDenialsApi>({
    getDenials: () => denials.current,
    recordDenial: denial => {
      if (!feature('TRANSCRIPT_CLASSIFIER')) return
      denials.current = [denial, ...denials.current.slice(0, MAX_DENIALS - 1)]
    },
  }).current

  return createElement(AutoModeDenialsContext.Provider, { value: api }, children)
}

export function useAutoModeDenials(): AutoModeDenialsApi {
  return useContext(AutoModeDenialsContext)
}`,
    'target97 provider-scoped auto-mode denial store',
  )
  fs.writeFileSync(ownerFilename, owner)

  const recentRelative =
    'src/components/permissions/rules/RecentDenialsTab.tsx'
  const recentFilename = path.join(temp, recentRelative)
  let recent = fs.readFileSync(recentFilename, 'utf8')
  recent = replaceOnce(
    recent,
    "import { type AutoModeDenial, getAutoModeDenials } from '../../../utils/autoModeDenials.js';",
    "import { type AutoModeDenial, useAutoModeDenials } from '../../../utils/autoModeDenials.js';",
    'target97 recent denials context import',
  )
  recent = replaceOnce(
    recent,
    `  useEffect(t1, t2);
  const [denials] = useState(_temp);`,
    `  useEffect(t1, t2);
  const { getDenials } = useAutoModeDenials();
  const [denials] = useState(getDenials);`,
    'target97 recent denials context snapshot',
  )
  recent = replaceOnce(
    recent,
    `function _temp() {
  return getAutoModeDenials();
}
`,
    '',
    'target97 obsolete recent denials global getter',
  )
  fs.writeFileSync(recentFilename, recent)

  const ruleListRelative =
    'src/components/permissions/rules/PermissionRuleList.tsx'
  const ruleListFilename = path.join(temp, ruleListRelative)
  let ruleList = fs.readFileSync(ruleListFilename, 'utf8')
  ruleList = replaceOnce(
    ruleList,
    "import { type AutoModeDenial, getAutoModeDenials } from '../../../utils/autoModeDenials.js';",
    "import { type AutoModeDenial, useAutoModeDenials } from '../../../utils/autoModeDenials.js';",
    'target97 permission rules denial context import',
  )
  ruleList = replaceOnce(
    ruleList,
    `  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = getAutoModeDenials();
    $[0] = t1;
  } else {
    t1 = $[0];
  }`,
    `  const { getDenials } = useAutoModeDenials();
  const t1 = useMemo(getDenials, [getDenials]);`,
    'target97 permission rules denial context snapshot',
  )
  fs.writeFileSync(ruleListFilename, ruleList)

  const canUseRelative = 'src/hooks/useCanUseTool.tsx'
  const canUseFilename = path.join(temp, canUseRelative)
  let canUse = fs.readFileSync(canUseFilename, 'utf8')
  canUse = replaceOnce(
    canUse,
    "import { recordAutoModeDenial } from '../utils/autoModeDenials.js';",
    "import { useAutoModeDenials } from '../utils/autoModeDenials.js';",
    'target97 permission hook denial context import',
  )
  canUse = replaceOnce(
    canUse,
    `function useCanUseTool(setToolUseConfirmQueue, setToolPermissionContext) {
  const $ = _c(3);
  let t0;
  if ($[0] !== setToolPermissionContext || $[1] !== setToolUseConfirmQueue) {`,
    `function useCanUseTool(setToolUseConfirmQueue, setToolPermissionContext) {
  const $ = _c(4);
  const { recordDenial } = useAutoModeDenials();
  let t0;
  if ($[0] !== recordDenial || $[1] !== setToolPermissionContext || $[2] !== setToolUseConfirmQueue) {`,
    'target97 permission hook denial recorder dependency',
  )
  canUse = replaceOnce(
    canUse,
    '                recordAutoModeDenial({',
    '                recordDenial({',
    'target97 permission hook denial recorder call',
  )
  canUse = replaceOnce(
    canUse,
    `    $[0] = setToolPermissionContext;
    $[1] = setToolUseConfirmQueue;
    $[2] = t0;
  } else {
    t0 = $[2];`,
    `    $[0] = recordDenial;
    $[1] = setToolPermissionContext;
    $[2] = setToolUseConfirmQueue;
    $[3] = t0;
  } else {
    t0 = $[3];`,
    'target97 permission hook denial recorder memoization',
  )
  fs.writeFileSync(canUseFilename, canUse)

  const appRelative = 'src/components/App.tsx'
  const appFilename = path.join(temp, appRelative)
  let app = fs.readFileSync(appFilename, 'utf8')
  app = replaceOnce(
    app,
    "import { onChangeAppState } from '../state/onChangeAppState.js';",
    "import { onChangeAppState } from '../state/onChangeAppState.js';\nimport { AutoModeDenialsProvider } from '../utils/autoModeDenials.js';",
    'target97 auto-mode denial provider App import',
  )
  app = replaceOnce(
    app,
    '<NotificationProvider>{children}</NotificationProvider>',
    '<NotificationProvider><AutoModeDenialsProvider>{children}</AutoModeDenialsProvider></NotificationProvider>',
    'target97 auto-mode denial provider App reachability',
  )
  fs.writeFileSync(appFilename, app)
}

function buildAgentReplToolPool97(temp) {
  const edit = (relative, transform) => {
    const filename = path.join(temp, relative)
    fs.writeFileSync(filename, transform(fs.readFileSync(filename, 'utf8')))
  }

  edit('src/tools.ts', source => {
    source = replaceOnce(
      source,
      'export const getTools = (permissionContext: ToolPermissionContext): Tools => {',
      `type ToolPoolOptions = {
  skipReplFilter?: boolean
}

export const getTools = (
  permissionContext: ToolPermissionContext,
  options?: ToolPoolOptions,
): Tools => {`,
      'target97 option-aware getTools signature',
    )
    source = replaceOnce(
      source,
      'if (isReplModeEnabled() && REPLTool) {',
      'if (isReplModeEnabled() && !options?.skipReplFilter && REPLTool) {',
      'target97 simple-mode REPL filter bypass',
    )
    source = replaceOnce(
      source,
      'if (isReplModeEnabled()) {',
      'if (isReplModeEnabled() && !options?.skipReplFilter) {',
      'target97 normal REPL filter bypass',
    )
    return replaceOnce(
      source,
      `export function assembleToolPool(
  permissionContext: ToolPermissionContext,
  mcpTools: Tools,
): Tools {
  const builtInTools = getTools(permissionContext)`,
      `export function assembleToolPool(
  permissionContext: ToolPermissionContext,
  mcpTools: Tools,
  options?: ToolPoolOptions,
): Tools {
  const builtInTools = getTools(permissionContext, options)`,
      'target97 tool-pool option forwarding',
    )
  })

  edit('src/tools/AgentTool/AgentTool.tsx', source =>
    replaceOnce(
      source,
      '    const workerTools = assembleToolPool(workerPermissionContext, appState.mcp.tools);',
      `    const workerTools = assembleToolPool(workerPermissionContext, appState.mcp.tools, {
      skipReplFilter: true
    });`,
      'target97 AgentTool worker REPL-filter bypass',
    ),
  )
  edit('src/tools/AgentTool/resumeAgent.ts', source =>
    replaceOnce(
      source,
      '    : assembleToolPool(workerPermissionContext, appState.mcp.tools)',
      `    : assembleToolPool(workerPermissionContext, appState.mcp.tools, {
        skipReplFilter: true,
      })`,
      'target97 resumed worker REPL-filter bypass',
    ),
  )
}

function buildSettingsViewMode97(temp) {
  const relative = 'src/utils/settings/types.ts'
  const filename = path.join(temp, relative)
  const source = fs.readFileSync(filename, 'utf8')
  fs.writeFileSync(
    filename,
    replaceOnce(
      source,
      `      outputStyle: z
        .string()
        .optional()
        .describe('Controls the output style for assistant responses'),
      language: z`,
      `      outputStyle: z
        .string()
        .optional()
        .describe('Controls the output style for assistant responses'),
      viewMode: z
        .enum(['default', 'verbose', 'focus'])
        .optional()
        .catch(undefined)
        .describe('Default transcript view mode on startup'),
      language: z`,
      'target97 persisted transcript view mode',
    ),
  )
}

function buildImageTokenCompression97(temp) {
  const relative = 'src/utils/imageResizer.ts'
  const filename = path.join(temp, relative)
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    "type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'",
    "type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'\n\nconst MAX_IMAGE_BLOCK_TOKENS = 25_000",
    'target97 image token limit',
  )
  source = replaceOnce(
    source,
    `      if (originalSize > IMAGE_TARGET_RAW_SIZE) {
        // Create fresh sharp instance for compression`,
    `      if (originalSize > IMAGE_TARGET_RAW_SIZE) {
        logEvent('tengu_image_resize', {
          over_byte_limit: true,
          over_dimension_limit: false,
          original_size_bytes: originalSize,
        })
        // Create fresh sharp instance for compression`,
    'target97 unknown-dimension resize telemetry',
  )
  source = replaceOnce(
    source,
    `    const isPng = normalizedMediaType === 'png'

    // If dimensions are within limits but file is too large, try compression first`,
    `    const isPng = normalizedMediaType === 'png'

    logEvent('tengu_image_resize', {
      over_byte_limit: originalSize > IMAGE_TARGET_RAW_SIZE,
      over_dimension_limit: needsDimensionResize,
      original_size_bytes: originalSize,
      original_width: originalWidth,
      original_height: originalHeight,
    })

    // If dimensions are within limits but file is too large, try compression first`,
    'target97 resize-attempt telemetry',
  )
  source = replaceOnce(
    source,
    `export interface ImageBlockWithDimensions {
  block: ImageBlockParam
  dimensions?: ImageDimensions
}`,
    `export interface ImageBlockWithDimensions {
  block: ImageBlockParam
  dimensions?: ImageDimensions
  tokenCompressed?: boolean
}`,
    'target97 token-compressed result marker',
  )

  const start = source.indexOf(
    'export async function maybeResizeAndDownsampleImageBlock(',
  )
  const end = source.indexOf('/**\n * Compresses an image buffer', start)
  if (start < 0 || end < 0) {
    throw new Error('missing target97 image-block wrapper boundaries')
  }
  const replacement = `export async function maybeResizeAndDownsampleImage({
  data,
  mediaType,
}: {
  data: Buffer | string
  mediaType?: string
}): Promise<ImageBlockWithDimensions> {
  const imageBuffer = Buffer.isBuffer(data)
    ? data
    : Buffer.from(data, 'base64')
  const extension = mediaType?.includes('/')
    ? mediaType.split('/')[1] || 'png'
    : mediaType || 'png'
  const resized = await maybeResizeAndDownsampleImageBuffer(
    imageBuffer,
    imageBuffer.length,
    extension,
  )
  const base64 = resized.buffer.toString('base64')
  const resizedMediaType = \`image/\${resized.mediaType}\`

  if (Math.ceil(base64.length * 0.125) > MAX_IMAGE_BLOCK_TOKENS) {
    try {
      const compressed = await compressImageBufferWithTokenLimit(
        imageBuffer,
        MAX_IMAGE_BLOCK_TOKENS,
        \`image/\${extension}\`,
      )
      return {
        block: {
          type: 'image',
          source: {
            type: 'base64',
            media_type: compressed.mediaType,
            data: compressed.base64,
          },
        },
        tokenCompressed: true,
      }
    } catch {}
  }

  return {
    block: {
      type: 'image',
      source: {
        type: 'base64',
        media_type: resizedMediaType as Base64ImageSource['media_type'],
        data: base64,
      },
    },
    dimensions: resized.dimensions,
  }
}

/**
 * Resizes an image content block if needed
 * Takes an image ImageBlockParam and returns a resized version if necessary
 * Also returns dimension information for coordinate mapping
 */
export async function maybeResizeAndDownsampleImageBlock(
  imageBlock: ImageBlockParam,
): Promise<ImageBlockWithDimensions> {
  if (imageBlock.source.type !== 'base64') {
    return { block: imageBlock }
  }
  return maybeResizeAndDownsampleImage({
    data: imageBlock.source.data,
    mediaType: imageBlock.source.media_type,
  })
}

`
  source = source.slice(0, start) + replacement + source.slice(end)
  fs.writeFileSync(filename, source)
}

function buildMcpResultSizeAnnotation97(temp) {
  const relative = 'src/services/mcp/client.ts'
  const filename = path.join(temp, relative)
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    `  name: string, // Server name for IDE check and transformation (e.g., "slack")
): Promise<MCPToolResult> {`,
    `  name: string, // Server name for IDE check and transformation (e.g., "slack")
  hasResultSizeAnnotation = false,
): Promise<MCPToolResult> {`,
    'target97 process-result annotation argument',
  )
  source = replaceOnce(
    source,
    `  if (name === 'ide') {
    return content
  }

  // Check if content needs truncation`,
    `  if (name === 'ide') {
    return content
  }

  if (hasResultSizeAnnotation && !contentContainsImages(content)) {
    return content
  }

  // Check if content needs truncation`,
    'target97 annotated non-image result bypass',
  )
  source = replaceOnce(
    source,
    `  callToolFn = callMCPTool,
  handleElicitation,
}: {`,
    `  callToolFn = callMCPTool,
  handleElicitation,
  hasResultSizeAnnotation = false,
}: {`,
    'target97 retry annotation argument',
  )
  source = replaceOnce(
    source,
    `    onProgress?: (data: MCPProgress) => void
  }) => Promise<MCPToolCallResult>`,
    `    onProgress?: (data: MCPProgress) => void
    hasResultSizeAnnotation?: boolean
  }) => Promise<MCPToolCallResult>`,
    'target97 injected MCP caller annotation type',
  )
  source = replaceOnce(
    source,
    `  handleElicitation?: (
    serverName: string,
    params: ElicitRequestURLParams,
    signal: AbortSignal,
  ) => Promise<ElicitResult>
}): Promise<MCPToolCallResult> {`,
    `  handleElicitation?: (
    serverName: string,
    params: ElicitRequestURLParams,
    signal: AbortSignal,
  ) => Promise<ElicitResult>
  hasResultSizeAnnotation?: boolean
}): Promise<MCPToolCallResult> {`,
    'target97 retry annotation type',
  )
  source = replaceOnce(
    source,
    `        signal,
        onProgress,
      })`,
    `        signal,
        onProgress,
        hasResultSizeAnnotation,
      })`,
    'target97 retry annotation forwarding',
  )
  source = replaceOnce(
    source,
    `  signal,
  onProgress,
}: {`,
    `  signal,
  onProgress,
  hasResultSizeAnnotation = false,
}: {`,
    'target97 direct-call annotation argument',
  )
  source = replaceOnce(
    source,
    `  signal: AbortSignal
  onProgress?: (data: MCPProgress) => void
}): Promise<{`,
    `  signal: AbortSignal
  onProgress?: (data: MCPProgress) => void
  hasResultSizeAnnotation?: boolean
}): Promise<{`,
    'target97 direct-call annotation type',
  )
  source = replaceOnce(
    source,
    '    const content = await processMCPResult(result, tool, name)',
    `    const content = await processMCPResult(
      result,
      tool,
      name,
      hasResultSizeAnnotation,
    )`,
    'target97 direct-call process forwarding',
  )
  source = replaceOnce(
    source,
    `                    handleElicitation: context.handleElicitation,
                  })`,
    `                    handleElicitation: context.handleElicitation,
                    hasResultSizeAnnotation: hasRequestedMaxResultSizeChars,
                  })`,
    'target97 MCP factory annotation forwarding',
  )
  fs.writeFileSync(filename, source)
}

function buildPrompt98(temp) {
  const filename = path.join(temp, 'src/constants/prompts.ts')
  let target = fs.readFileSync(filename, 'utf8')
  const current = fs.readFileSync(path.join(root, 'src/constants/prompts.ts'), 'utf8')
  target = replaceOnce(
    target,
    '// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered\n',
    "// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered\nimport { getGlobalConfig } from '../utils/config.js'\n",
    'prompt config import',
  )

  let doing = block(
    current,
    'export function isCommunicationStyleEnabled',
    'function getActionsSection',
  )
  doing = doing
    .replace(
      'function getSimpleDoingTasksSection(model: string)',
      'function buildSimpleDoingTasksSection(model: string)',
    )
    .replace('# Text output (does not apply to tool calls)', '# Communication style')
    .replace(
      "End-of-turn summary: one or two sentences. What changed and what's next. Nothing else.",
      "End-of-turn summaries: state what changed and what's next. That's it — no recapping the journey, no restating the problem, no listing everything you considered.",
    )
    .replace(
      `For exploratory questions ("what could we do about X?", "how should we approach this?", "what do you think?"), respond in 2-3 sentences with a recommendation and the main tradeoff. Present it as something the user can redirect, not a decided plan. Don't implement until the user agrees.`,
      `When the user asks an open-ended or exploratory question ("what could we do about X?", "how should we approach this?", "what do you think?"), respond with analysis, options, and tradeoffs — do not jump straight to implementation. Let the user choose a direction before you start writing code. Even when you have a strong opinion, present it as a recommendation the user can accept or redirect, not as a fait accompli. Only start implementing after the user signals agreement, explicitly or by asking you to proceed.`,
    )
    .replace(/^\s*`For UI or frontend changes, start the dev server.*\n/m, '')
  target = replaceBlock(
    target,
    'function getSimpleDoingTasksSection()',
    'function getActionsSection',
    doing,
  )
  target = replaceBlock(
    target,
    'function getUsingYourToolsSection(enabledTools: Set<string>)',
    'function getAgentToolSection',
    block(current, 'function getUsingYourToolsSection(', 'function getAgentToolSection').replace(
      'function getUsingYourToolsSection(',
      'function buildUsingYourToolsSection(',
    ),
  )
  const sessionGuidanceEnd = target.includes(
    '// @[MODEL LAUNCH]: Remove this section when we launch numbat.',
  )
    ? '// @[MODEL LAUNCH]: Remove this section when we launch numbat.'
    : 'function getSimpleToneAndStyleSection('
  target = replaceBlock(
    target,
    'function getSessionSpecificGuidanceSection(',
    sessionGuidanceEnd,
    block(current, 'function getSessionSpecificGuidanceSection(', 'function getSimpleToneAndStyleSection('),
  )
  target = replaceBlock(
    target,
    'function getSimpleToneAndStyleSection()',
    'export async function getSystemPrompt',
    block(current, 'function getSimpleToneAndStyleSection(', 'export async function getSystemPrompt').replace(
      'function getSimpleToneAndStyleSection(',
      'function buildSimpleToneAndStyleSection(',
    ),
  )
  target = replaceOnce(
    target,
    '  mcpClients?: MCPServerConnection[],\n): Promise<string[]> {',
    '  mcpClients?: MCPServerConnection[],\n  options?: { excludeDynamicSections?: boolean },\n): Promise<string[]> {',
    'system prompt options',
  )
  target = replaceOnce(
    target,
    "      `You are Claude Code, Anthropic's official CLI for Claude.\\n\\nCWD: ${getCwd()}\\nDate: ${getSessionStartDate()}`,",
    "      options?.excludeDynamicSections\n        ? `You are Claude Code, Anthropic's official CLI for Claude.`\n        : `You are Claude Code, Anthropic's official CLI for Claude.\\n\\nCWD: ${getCwd()}\\nDate: ${getSessionStartDate()}`,",
    'simple prompt exclusion',
  )
  target = replaceOnce(
    target,
    "    systemPromptSection('session_guidance', () =>\n      getSessionSpecificGuidanceSection(enabledTools, skillToolCommands),\n    ),",
    "    ...(isCommunicationStyleEnabled(model)\n      ? [\n          systemPromptSection('anti_verbosity', () =>\n            getCommunicationStyleSection(model),\n          ),\n        ]\n      : []),\n    systemPromptSection('session_guidance', () =>\n      getSessionSpecificGuidanceSection(\n        enabledTools,\n        skillToolCommands,\n        model,\n      ),\n    ),",
    'dynamic communication section',
  )
  target = replaceOnce(
    target,
    "    systemPromptSection('memory', () => loadMemoryPrompt()),",
    "    ...(options?.excludeDynamicSections\n      ? []\n      : [systemPromptSection('memory', () => loadMemoryPrompt())]),",
    'dynamic memory section',
  )
  target = replaceOnce(
    target,
    "    systemPromptSection('env_info_simple', () =>\n      computeSimpleEnvInfo(model, additionalWorkingDirectories),\n    ),",
    "    ...(options?.excludeDynamicSections\n      ? []\n      : [\n          systemPromptSection('env_info_simple', () =>\n            computeSimpleEnvInfo(model, additionalWorkingDirectories),\n          ),\n        ]),",
    'dynamic env section',
  )
  target = replaceOnce(
    target,
    '  const resolvedDynamicSections =\n    await resolveSystemPromptSections(dynamicSections)\n\n  return [',
    '  const resolvedDynamicSections =\n    await resolveSystemPromptSections(dynamicSections)\n\n  const getSimpleDoingTasksSection = () =>\n    buildSimpleDoingTasksSection(model)\n  const getUsingYourToolsSection = (tools: Set<string>) =>\n    buildUsingYourToolsSection(tools, model)\n  const getSimpleToneAndStyleSection = () =>\n    buildSimpleToneAndStyleSection(model)\n\n  return [',
    'model-bound static section builders',
  )
  const helper = block(current, '/**\n * Build the machine-specific sections omitted by excludeDynamicSections', 'function getMcpInstructions')
  target = replaceOnce(target, '\nfunction getMcpInstructions(', `\n${helper}function getMcpInstructions(`, 'excluded sections helper')
  fs.writeFileSync(filename, target)
}

function buildMain98(temp) {
  const filename = path.join(temp, 'src/main.tsx')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    "  // @[MODEL LAUNCH]: Update the example model ID in the --model help text.\n",
    "  .option('--exclude-dynamic-system-prompt-sections', 'Move per-machine sections (cwd, env info, memory paths, git status) from the system prompt into the first user message. Improves cross-user prompt-cache reuse. Only applies with the default system prompt (ignored with --system-prompt).').default(false)\n  // @[MODEL LAUNCH]: Update the example model ID in the --model help text.\n",
    'dynamic CLI option',
  )
  source = replaceOnce(
    source,
    '        systemPrompt,\n        appendSystemPrompt,\n        userSpecifiedModel: effectiveModel,',
    '        systemPrompt,\n        appendSystemPrompt,\n        excludeDynamicSections: options.excludeDynamicSystemPromptSections || undefined,\n        userSpecifiedModel: effectiveModel,',
    'dynamic headless option',
  )
  fs.writeFileSync(filename, source)
}

function buildAdvisor98(temp) {
  copyFile(temp, 'src/utils/advisor.ts')
  const filename = path.join(temp, 'src/utils/advisor.ts')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    `  if (isEnvTruthy(process.env.CLAUDE_CODE_ENABLE_EXPERIMENTAL_ADVISOR_TOOL)) {
    return true
  }
`,
    '',
    'target98 advisor explicit-enable override',
  )
  source = source.replaceAll("    m.includes('opus-4-7') ||\n", '')
  fs.writeFileSync(filename, source)
}

function buildVertexRegion98(temp) {
  const filename = path.join(temp, 'src/utils/envUtils.ts')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    "  ['claude-3-7-sonnet', 'VERTEX_REGION_CLAUDE_3_7_SONNET'],\n",
    "  ['claude-3-7-sonnet', 'VERTEX_REGION_CLAUDE_3_7_SONNET'],\n  ['claude-opus-4-6', 'VERTEX_REGION_CLAUDE_4_6_OPUS'],\n  ['claude-opus-4-5', 'VERTEX_REGION_CLAUDE_4_5_OPUS'],\n",
    'target98 Vertex Opus 4.5 region override',
  )
  fs.writeFileSync(filename, source)
}

function buildRemoteSlug98(temp) {
  const filename = path.join(temp, 'src/utils/git.ts')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    "} from './git/gitFilesystem.js'\n",
    "} from './git/gitFilesystem.js'\nimport { parseConfigString } from './git/gitConfigParser.js'\n",
    'target98 git config parser import',
  )
  const helper = `
function readRepositoryGitConfig(repositoryRoot: string): string | null {
  for (const configPath of [
    join(repositoryRoot, '.git', 'config'),
    join(repositoryRoot, 'config'),
  ]) {
    try {
      return readFileSync(configPath, 'utf-8')
    } catch {
      // Try the bare-repository layout next.
    }
  }
  return null
}

const REMOTE_SLUG_NOT_FOUND = Symbol('remote-slug-not-found')
const findRepoRemoteSlugImpl = memoizeWithLRU(
  (repositoryRoot: string): string | typeof REMOTE_SLUG_NOT_FOUND => {
    const config = readRepositoryGitConfig(repositoryRoot)
    if (!config) return REMOTE_SLUG_NOT_FOUND
    const normalizedRemote = (key: string): string | null => {
      const value = parseConfigString(config, 'remote', 'origin', key)
      return value ? normalizeGitRemoteUrl(value) : null
    }
    return (
      normalizedRemote('pushurl') ??
      normalizedRemote('url') ??
      REMOTE_SLUG_NOT_FOUND
    )
  },
  repositoryRoot => repositoryRoot,
  50,
)

export function findRepoRemoteSlug(repositoryRoot: string): string | null {
  const result = findRepoRemoteSlugImpl(repositoryRoot)
  return result === REMOTE_SLUG_NOT_FOUND ? null : result
}
`
  source = replaceOnce(
    source,
    '\n/**\n * Returns a SHA256 hash (first 16 chars) of the normalized git remote URL.',
    `${helper}\n/**\n * Returns a SHA256 hash (first 16 chars) of the normalized git remote URL.`,
    'target98 repository remote slug helpers',
  )
  fs.writeFileSync(filename, source)
}

function buildRemoteEligibility98(temp) {
  const preconditionsFilename = path.join(
    temp,
    'src/utils/background/remote/preconditions.ts',
  )
  let preconditions = fs.readFileSync(preconditionsFilename, 'utf8')
  preconditions = replaceOnce(
    preconditions,
    "import { fetchEnvironments } from '../../teleport/environments.js'",
    "import { fetchEnvironments, type EnvironmentResource } from '../../teleport/environments.js'",
    'target98 remote environment type import',
  )
  preconditions = replaceBlock(
    preconditions,
    '/**\n * Checks if user has access to at least one remote environment',
    '/**\n * Checks if current directory is inside a git repository',
    `/**
 * Fetch remote environments while preserving an expired-login signal.
 * Non-auth failures are treated as unavailable eligibility data.
 */
export async function fetchRemoteEnvironmentsForEligibility(): Promise<
  EnvironmentResource[] | null
> {
  try {
    return await fetchEnvironments()
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      throw error
    }
    logForDebugging(
      \`fetchRemoteEnvironmentsForEligibility failed: \${errorMessage(error)}\`,
    )
    return null
  }
}

`,
  )
  fs.writeFileSync(preconditionsFilename, preconditions)

  const sessionFilename = path.join(
    temp,
    'src/utils/background/remote/remoteSession.ts',
  )
  let session = fs.readFileSync(sessionFilename, 'utf8')
  session = replaceOnce(
    session,
    '  checkHasRemoteEnvironment,\n',
    '  fetchRemoteEnvironmentsForEligibility,\n',
    'target98 remote eligibility import',
  )
  const functionStart = session.indexOf(
    'export async function checkBackgroundRemoteSessionEligibility(',
  )
  if (functionStart < 0) throw new Error('missing target98 remote eligibility function')
  session = `${session.slice(0, functionStart)}export async function checkBackgroundRemoteSessionEligibility({
  skipBundle = false,
}: {
  skipBundle?: boolean
} = {}): Promise<BackgroundRemoteSessionPrecondition[]> {
  const errors: BackgroundRemoteSessionPrecondition[] = []

  if (!isPolicyAllowed('allow_remote_sessions')) {
    errors.push({ type: 'policy_blocked' })
    return errors
  }

  const [needsLogin, repository] = await Promise.all([
    checkNeedsClaudeAiLogin(),
    detectCurrentRepositoryWithHost(),
  ])
  let environments: Awaited<
    ReturnType<typeof fetchRemoteEnvironmentsForEligibility>
  > = null
  if (needsLogin) {
    errors.push({ type: 'not_logged_in' })
  } else {
    try {
      environments = await fetchRemoteEnvironmentsForEligibility()
      if (!environments || environments.length === 0) {
        errors.push({ type: 'no_remote_environment' })
      }
    } catch {
      errors.push({ type: 'not_logged_in' })
    }
  }

  const defaultEnvironmentId = getSettings_DEPRECATED()?.remote?.defaultEnvironmentId
  const hasConfiguredByoc =
    defaultEnvironmentId !== undefined &&
    environments !== null &&
    environments.some(
      environment =>
        environment.environment_id === defaultEnvironmentId &&
        environment.kind === 'byoc',
    )
  const bundleSeedGateOn =
    !skipBundle &&
    (isEnvTruthy(process.env.CCR_FORCE_BUNDLE) ||
      isEnvTruthy(process.env.CCR_ENABLE_BUNDLE) ||
      (await checkGate_CACHED_OR_BLOCKING('tengu_ccr_bundle_seed_enabled')))

  if (!checkIsInGitRepo()) {
    errors.push({ type: 'not_in_git_repo' })
  } else if (bundleSeedGateOn) {
    // A local git repository can be uploaded as a bundle.
  } else if (repository === null) {
    errors.push({ type: 'no_git_remote' })
  } else if (!hasConfiguredByoc && repository.host === 'github.com') {
    if (!(await checkGithubAppInstalled(repository.owner, repository.name))) {
      errors.push({ type: 'github_app_not_installed' })
    }
  }

  return errors
}
`
  session = replaceOnce(
    session,
    "import { isEnvTruthy } from '../../envUtils.js'\n",
    "import { isEnvTruthy } from '../../envUtils.js'\nimport { getSettings_DEPRECATED } from '../../settings/settings.js'\n",
    'target98 remote settings import',
  )
  fs.writeFileSync(sessionFilename, session)
}

function buildTeleportEnvironmentSelection98(temp) {
  const filename = path.join(temp, 'src/utils/teleport.tsx')
  let source = fs.readFileSync(filename, 'utf8')
  const start = source.indexOf(
    '    // Select environment based on settings, then anthropic_cloud preference, then first available.',
  )
  const end = source.indexOf(
    '\n    const environmentId = selectedEnvironment.environment_id;',
    start,
  )
  if (start < 0 || end < 0) {
    throw new Error('missing target98 teleport environment selection block')
  }
  const replacement = `    // Select the configured default first, then the managed cloud environment.
    const settings = getSettings_DEPRECATED();
    const defaultEnvironmentId = settings?.remote?.defaultEnvironmentId;
    let configuredEnvironment = defaultEnvironmentId ? environments.find(env => env.environment_id === defaultEnvironmentId) : undefined;
    let cloudEnv = environments.find(env => env.kind === 'anthropic_cloud');
    if (options.useDefaultEnvironment && !configuredEnvironment && !cloudEnv) {
      logForDebugging(\`No configured default or anthropic_cloud in env list (\${environments.length} envs); retrying fetchEnvironments\`);
      environments = await fetchEnvironments();
      configuredEnvironment = defaultEnvironmentId ? environments.find(env => env.environment_id === defaultEnvironmentId) : undefined;
      cloudEnv = environments.find(env => env.kind === 'anthropic_cloud');
      if (!configuredEnvironment && !cloudEnv) {
        logError(new Error(\`No configured default or anthropic_cloud environment available after retry (got: \${environments.map(e => \`\${e.name} (\${e.kind})\`).join(', ')}\${defaultEnvironmentId ? \`; configured default \${defaultEnvironmentId} not in list\` : ''}). Silent byoc fallthrough would launch into a dead env — fail fast instead.\`));
        return null;
      }
    }
    const selectedEnvironment = configuredEnvironment || cloudEnv || environments.find(env => env.kind !== 'bridge') || environments[0];
    if (!selectedEnvironment) {
      logError(new Error('No environments available for session creation'));
      return null;
    }
    if (defaultEnvironmentId) {
      const matchedDefault = selectedEnvironment.environment_id === defaultEnvironmentId;
      logForDebugging(matchedDefault ? \`Using configured default environment: \${defaultEnvironmentId}\` : \`Configured default environment \${defaultEnvironmentId} not found, using first available\`);
    }`
  source = source.slice(0, start) + replacement + source.slice(end)
  fs.writeFileSync(filename, source)
}

function buildLogFilters98(temp) {
  const filename = path.join(temp, 'src/components/LogSelector.tsx')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    '              enabled: !showAllProjects',
    '              enabled: showAllProjects',
    'target98 all-projects telemetry records pre-toggle state',
  )
  source = replaceOnce(
    source,
    '                enabled: newEnabled',
    '                enabled: branchFilterEnabled',
    'target98 branch telemetry records pre-toggle state',
  )
  source = replaceOnce(
    source,
    '                  enabled: newValue',
    '                  enabled: showAllWorktrees',
    'target98 worktree telemetry records pre-toggle state',
  )
  source = replaceOnce(
    source,
    ' || $[233] !== viewMode) {',
    ' || $[233] !== viewMode || $[247] !== branchFilterEnabled) {',
    'target98 log-filter footer recomputation',
  )
  source = replaceOnce(
    source,
    '<KeyboardShortcutHint shortcut="Ctrl+A" action={`show ${showAllProjects ? "current dir" : "all projects"}`} />',
    '<KeyboardShortcutHint shortcut="Ctrl+A" action={showAllProjects ? "only show current directory" : "show all directories"} format={{ modCase: "title", charCase: "upper" }} />',
    'target98 directory filter hint',
  )
  source = replaceOnce(
    source,
    '<KeyboardShortcutHint shortcut="Ctrl+B" action="toggle branch" />',
    '<KeyboardShortcutHint shortcut="Ctrl+B" action={branchFilterEnabled ? "only show current branch" : "show all branches"} format={{ modCase: "title", charCase: "upper" }} />',
    'target98 branch filter hint',
  )
  source = replaceOnce(
    source,
    '<KeyboardShortcutHint shortcut="Ctrl+W" action={`show ${showAllWorktrees ? "current worktree" : "all worktrees"}`} />',
    '<KeyboardShortcutHint shortcut="Ctrl+W" action={showAllWorktrees ? "only show current worktree" : "show all worktrees"} format={{ modCase: "title", charCase: "upper" }} />',
    'target98 worktree filter hint',
  )
  source = replaceOnce(
    source,
    '<KeyboardShortcutHint shortcut="Ctrl+R" action="rename" />',
    '<KeyboardShortcutHint shortcut="Ctrl+R" action="rename" format={{ modCase: "title", charCase: "upper" }} />',
    'target98 rename hint format',
  )
  source = replaceOnce(
    source,
    '<KeyboardShortcutHint shortcut="Ctrl+V" action="preview" />',
    '<KeyboardShortcutHint shortcut="Ctrl+V" action="preview" format={{ modCase: "title", charCase: "upper" }} />',
    'target98 preview hint format',
  )
  fs.writeFileSync(filename, source)
}

function buildLogPreview101(temp) {
  const filename = path.join(temp, 'src/components/LogSelector.tsx')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    '                    if (lowerInput === "v" && key.ctrl && focusedLog) {',
    '                    if (((input === " " && keyIsNotCtrlOrMeta) || (lowerInput === "v" && key.ctrl)) && focusedLog && !isAgenticSearchOptionFocused) {',
    'target101 Space or Ctrl+V preview activation',
  )
  source = replaceOnce(
    source,
    '                      if (focusedLog && keyIsNotCtrlOrMeta && input.length > 0 && !/^\\s+$/.test(input)) {',
    '                      if (focusedLog && keyIsNotCtrlOrMeta && input.length > 0 && (input.length === 1 || !/^[a-z]+\\d*$/.test(input)) && !/^\\s+$/.test(input)) {',
    'target101 preview/search input boundary',
  )
  source = replaceOnce(
    source,
    '<KeyboardShortcutHint shortcut="Ctrl+V" action="preview" format={{ modCase: "title", charCase: "upper" }} />',
    '<KeyboardShortcutHint chord="space" action="preview" />',
    'target101 Space preview footer hint',
  )
  fs.writeFileSync(filename, source)
}

function buildResumeSelector101(temp) {
  const exactRoot = '/tmp/middle101-audit.BUXJwA'

  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/commands/resume/resume.tsx',
    hunk =>
      hunk.includes('export function ResumeCommand') ||
      hunk.includes('reloadGeneration') ||
      hunk.includes('setReloadGeneration') ||
      hunk.includes('setShowAllProjects(previous') ||
      hunk.includes('loadAllProjectsMessageLogs();') ||
      hunk.includes('initialShowAllWorktrees'),
  )

  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/components/LogSelector.tsx',
    hunk =>
      hunk.includes('isLoading?: boolean') ||
      hunk.includes('reloadGeneration') ||
      hunk.includes('initialShowAllWorktrees') ||
      hunk.includes('Refreshing…') ||
      hunk.includes('localSearchEmpty'),
  )

  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/screens/ResumeConversation.tsx',
    hunk =>
      hunk.includes('useTerminalTitle') ||
      hunk.includes('showAllProjects') ||
      hunk.includes('reloadRequestRef') ||
      hunk.includes('loadAllProjectsMessageLogsProgressive') ||
      hunk.includes('reloadGeneration') ||
      hunk.includes('initialShowAllWorktrees') ||
      hunk.includes('filteredLogs.length === 0 && !loading'),
  )
}

function buildBetaTracingPrivacy101(temp) {
  applyWorkingDiff(temp, ['src/utils/telemetry/betaSessionTracing.ts'])
  applySelectedWorkingDiff(
    temp,
    'src/services/tools/toolExecution.ts',
    hunk =>
      hunk.includes('const readResult = result.data') ||
      hunk.includes("'structuredPatch' in result.data") ||
      hunk.includes("'stdout' in result.data"),
  )

  const filename = path.join(temp, 'src/utils/managedEnvConstants.ts')
  let source = fs.readFileSync(filename, 'utf8')
  if (!source.includes("  'OTEL_LOG_TOOL_CONTENT',")) {
    source = replaceOnce(
      source,
      "  'OTEL_LOG_TOOL_DETAILS',\n",
      "  'OTEL_LOG_TOOL_CONTENT',\n  'OTEL_LOG_TOOL_DETAILS',\n",
      'target101 managed OTEL tool-content variable',
    )
    fs.writeFileSync(filename, source)
  }

  const toolExecutionFilename = path.join(
    temp,
    'src/services/tools/toolExecution.ts',
  )
  let toolExecution = fs.readFileSync(toolExecutionFilename, 'utf8')
  toolExecution = replaceOnce(
    toolExecution,
    `      durationMs,
      preToolHookDurationMs,
      toolResultSizeBytes,`,
    `      durationMs,
      preToolHookDurationMs,
      permissionDurationMs,
      toolResultSizeBytes,`,
    'target101 permission duration success telemetry',
  )
  fs.writeFileSync(toolExecutionFilename, toolExecution)
}

function buildSingleDigitSelect101(temp) {
  applyWorkingDiff(temp, [
    'src/components/CustomSelect/use-select-input.ts',
    'src/components/CustomSelect/use-multi-select-state.ts',
  ])
}

function buildClaudeApiTrigger101(temp) {
  const filename = path.join(temp, 'src/skills/bundled/claudeApi.ts')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    `    description:
      'Build apps with the Claude API or Anthropic SDK.\\n' +
      'TRIGGER when: code imports \`anthropic\`/\`@anthropic-ai/sdk\`/\`claude_agent_sdk\`, or user asks to use Claude API, Anthropic SDKs, or Agent SDK.\\n' +
      'DO NOT TRIGGER when: code imports \`openai\`/other AI SDK, general programming, or ML/data-science tasks.',`,
    `    description:
      'Build, debug, and optimize Claude API / Anthropic SDK apps. Apps built with this skill should include prompt caching.\\n' +
      'TRIGGER when: code imports \`anthropic\`/\`@anthropic-ai/sdk\`; user asks to use the Claude API, Anthropic SDKs, or Managed Agents (\`/v1/agents\`, \`/v1/sessions\`); user asks to add, modify, debug, optimize, or improve a Claude feature (prompt caching, cache hit rate, adaptive thinking, compaction, code_execution, batch, files API, citations, memory tool) or a Claude model (Opus/Sonnet/Haiku) in a file; or user asks about prompt caching / cache hit rate / cache reads / cache creation in any project that uses the Anthropic SDK (even without mentioning Claude by name).\\n' +
      'DO NOT TRIGGER when: file imports \`openai\`/non-Anthropic SDK, filename signals another provider (\`agent-openai.py\`, \`*-generic.py\`), code is provider-neutral, or task is general programming/ML.',`,
    'target101 Claude API managed-agent trigger',
  )
  fs.writeFileSync(filename, source)
}

function buildWarningRuntime101(temp) {
  applyWorkingDiff(temp, ['src/utils/warningHandler.ts'])
}

function buildLogRepoWording105(temp) {
  const filename = path.join(temp, 'src/components/LogSelector.tsx')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    'showAllProjects ? "only show current directory" : "show all directories"',
    'showAllProjects ? "only show current repo" : "show all projects"',
    'target105 repository filter wording',
  )
  fs.writeFileSync(filename, source)
}

function buildPluginScopeFallback98(temp) {
  const filename = path.join(temp, 'src/services/plugins/pluginOperations.ts')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    `  const installation = installations.find(
    inst => inst.scope === scope && inst.projectPath === projectPath,
  )
  if (!installation) {`,
    `  const scopeInstallations = installations.filter(inst => inst.scope === scope)
  const matchingInstallation = scopeInstallations.find(
    inst => inst.projectPath === projectPath,
  )
  if (!matchingInstallation && scopeInstallations.length > 1) {
    logForDebugging(
      \`updatePluginOp: \${scopeInstallations.length} \${scope}-scope installs, none match CWD '\${projectPath}'; updating '\${scopeInstallations[0]?.projectPath}' only\`,
      { level: 'warn' },
    )
  }
  const installation = matchingInstallation ?? scopeInstallations[0]
  if (!installation) {`,
    'target98 plugin scope fallback selection',
  )
  source = replaceOnce(
    source,
    `    scope,
    projectPath,
  })`,
    `    scope,
    projectPath: installation.projectPath,
  })`,
    'target98 selected plugin project path',
  )
  fs.writeFileSync(filename, source)
}

function buildProviderSetup98(temp) {
  const providerDirectory = path.join(temp, 'src/commands/provider-setup')
  fs.mkdirSync(providerDirectory, { recursive: true })

  fs.writeFileSync(
    path.join(providerDirectory, 'relaunch.ts'),
    `import { constants } from 'os'
import { isInBundledMode } from '../../utils/bundledMode.js'

function getProviderSetupLauncher(): { cmd: string; prefixArgs: string[] } {
  if (isInBundledMode()) {
    return { cmd: process.execPath, prefixArgs: [] }
  }
  const script = process.argv[1]
  if (!script) return { cmd: process.execPath, prefixArgs: [] }
  return { cmd: process.execPath, prefixArgs: [script] }
}

export async function execRelaunch(): Promise<never> {
  const { spawn } = await import('child_process')
  const { cmd, prefixArgs } = getProviderSetupLauncher()
  const args = process.argv.slice(2)
  const child = spawn(cmd, [...prefixArgs, ...args], {
    stdio: 'inherit',
    env: process.env,
  })
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(signal, () => {
      try {
        child.kill(signal)
      } catch {
        // The child may already have exited.
      }
    })
  }
  return new Promise<never>(() => {
    child.on('close', (code, signal) => {
      const signalCode = signal ? 128 + (constants.signals[signal] ?? 0) : 0
      process.exit(code ?? signalCode)
    })
    child.on('error', error => {
      process.stderr.write(\`Failed to relaunch Claude Code: \${error.message}\\n\`)
      process.exit(1)
    })
  })
}
`,
  )

  const commandSource = ({ provider, wizard, event }) => `import * as React from 'react'
import { useState } from 'react'
import { ${wizard} } from '../../components/${wizard}.js'
import { Box, Text, useApp } from '../../ink.js'
import { useKeybinding } from '../../keybindings/useKeybinding.js'
import { logEvent } from '../../services/analytics/index.js'
import type { LocalJSXCommandCall } from '../../types/command.js'

function ${provider}SetupCommand({
  onDone,
}: {
  onDone: Parameters<LocalJSXCommandCall>[0]
}): React.ReactNode {
  const app = useApp()
  const [completeMessage, setCompleteMessage] = useState<string | null>(null)

  useKeybinding(
    'confirm:yes',
    () => {
      app.exit()
      void import('./relaunch.js').then(({ execRelaunch }) => execRelaunch())
    },
    { context: 'Confirmation', isActive: completeMessage !== null },
  )

  if (completeMessage !== null) {
    return (
      <Box flexDirection="column" gap={1} marginTop={1}>
        <Text color="success">{completeMessage}</Text>
        <Text dimColor>
          Press <Text bold>Enter</Text> to restart Claude Code.
        </Text>
      </Box>
    )
  }

  return (
    <${wizard}
      onComplete={setCompleteMessage}
      onCancel={() => {
        logEvent('tengu_${event}_setup_cancelled', {})
        onDone()
      }}
    />
  )
}

export const call: LocalJSXCommandCall = async onDone => {
  logEvent('tengu_${event}_setup_started', {})
  return <${provider}SetupCommand onDone={onDone} />
}
`

  fs.writeFileSync(
    path.join(providerDirectory, 'bedrock.tsx'),
    commandSource({
      provider: 'Bedrock',
      wizard: 'BedrockSetupWizard',
      event: 'bedrock',
    }),
  )
  fs.writeFileSync(
    path.join(providerDirectory, 'vertex.tsx'),
    commandSource({
      provider: 'Vertex',
      wizard: 'VertexSetupWizard',
      event: 'vertex',
    }),
  )
  fs.writeFileSync(
    path.join(providerDirectory, 'index.ts'),
    `import type { Command } from '../../commands.js'
import { isEnvTruthy } from '../../utils/envUtils.js'

export const setupBedrock = {
  type: 'local-jsx',
  name: 'setup-bedrock',
  description: 'Reconfigure AWS Bedrock authentication, region, or model pins',
  get isHidden() {
    return !isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK)
  },
  load: () => import('./bedrock.js'),
} satisfies Command

export const setupVertex = {
  type: 'local-jsx',
  name: 'setup-vertex',
  description:
    'Reconfigure Google Vertex AI authentication, project, region, or model pins',
  get isHidden() {
    return !isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX)
  },
  load: () => import('./vertex.js'),
} satisfies Command
`,
  )

  const commandsFilename = path.join(temp, 'src/commands.ts')
  let commandsSource = fs.readFileSync(commandsFilename, 'utf8')
  commandsSource = replaceOnce(
    commandsSource,
    "import passes from './commands/passes/index.js'\n",
    "import passes from './commands/passes/index.js'\nimport { setupBedrock, setupVertex } from './commands/provider-setup/index.js'\n",
    'target98 provider setup command import',
  )
  commandsSource = replaceOnce(
    commandsSource,
    `  passes,
  ...(peersCmd ? [peersCmd] : []),`,
    `  passes,
  setupBedrock,
  setupVertex,
  ...(peersCmd ? [peersCmd] : []),`,
    'target98 provider setup command registration',
  )
  fs.writeFileSync(commandsFilename, commandsSource)
}

function buildPrDetails98(temp) {
  const relative = 'src/utils/ghPrStatus.ts'
  const destination = path.join(temp, relative)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(
    path.join('/tmp/middle98-integrated.koScjU', relative),
    destination,
  )
}

function buildWebSetupEnvironment98(temp) {
  applySelectedWorkingDiff(
    temp,
    'src/commands/remote-setup/api.ts',
    hunk => hunk.includes('[web-setup] Failed to create default environment:'),
  )
}

function buildBridgeLateResponse98(temp) {
  applySelectedWorkingDiff(
    temp,
    'src/hooks/useReplBridge.tsx',
    hunk => hunk.includes('late response after local resolve, or unknown id'),
  )
}

function buildEffortMaxCapability98(temp) {
  const filename = path.join(temp, 'src/utils/effort.ts')
  let source = fs.readFileSync(filename, 'utf8')
  const oldFunction = `export function modelSupportsMaxEffort(model: string): boolean {
  const supported3P = get3PModelCapabilityOverride(model, 'max_effort')
  if (supported3P !== undefined) {
    return supported3P
  }
  if (model.toLowerCase().includes('opus-4-6')) {
    return true
  }
  if (process.env.USER_TYPE === 'ant' && resolveAntModel(model)) {
    return true
  }
  return false
}`
  const newFunction = `const MODELS_WITHOUT_MAX_EFFORT = new Set([
  'claude-3-opus',
  'claude-3-sonnet',
  'claude-3-5-sonnet',
  'claude-3-7-sonnet',
  'claude-sonnet-4',
  'claude-sonnet-4-0',
  'claude-sonnet-4-5',
  'claude-opus-4',
  'claude-opus-4-0',
  'claude-opus-4-1',
  'claude-opus-4-5',
])

function normalizeModelForEffortCapability(model: string): string {
  const lower = model.toLowerCase()
  const matched = lower.match(/claude-[a-z0-9-]+/)?.[0] ?? lower
  return matched.replace(/-v\\d+(?::\\d+)?$/, '').replace(/-\\d{8}$/, '')
}

export function modelSupportsMaxEffort(model: string): boolean {
  const supported3P = get3PModelCapabilityOverride(model, 'max_effort')
  if (supported3P !== undefined) {
    return supported3P
  }
  if (model.toLowerCase().includes('haiku')) return false
  return !MODELS_WITHOUT_MAX_EFFORT.has(
    normalizeModelForEffortCapability(model),
  )
}`
  source = replaceOnce(
    source,
    oldFunction,
    newFunction,
    'target98 normalized max-effort capability',
  )
  fs.writeFileSync(filename, source)
}

function buildSessionsWebSocket98(temp) {
  const relative = 'src/remote/SessionsWebSocket.ts'
  const destination = path.join(temp, relative)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(
    path.join('/tmp/middle98-integrated.koScjU', relative),
    destination,
  )
}

function buildVertexModelUpgrade98(temp) {
  copyFile(temp, 'src/utils/model/vertexModelUpgrade.ts')
  copyFile(temp, 'src/utils/model/bedrockModelUpgrade.tsx')
  copyFile(temp, 'src/components/ThirdPartyModelUpgradeDialog.tsx')

  {
    const filename = path.join(temp, 'src/utils/config.ts')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      '  hasUsedBackgroundTask?: boolean // Whether the user has backgrounded a task (Ctrl+B)\n',
      "  hasUsedBackgroundTask?: boolean // Whether the user has backgrounded a task (Ctrl+B)\n  bedrockDeclinedUpgrades?: Partial<Record<'sonnet' | 'opus' | 'haiku', string>>\n  vertexDeclinedUpgrades?: Partial<Record<'sonnet' | 'opus' | 'haiku', string>>\n",
      'target98 third-party declined-upgrade config',
    )
    fs.writeFileSync(filename, source)
  }

  {
    const filename = path.join(temp, 'src/interactiveHelpers.tsx')
    let source = fs.readFileSync(filename, 'utf8')
    const current = fs.readFileSync(
      path.join(root, 'src/interactiveHelpers.tsx'),
      'utf8',
    )
    source = replaceOnce(
      source,
      "import type { RenderOptions, Root, TextProps } from './ink.js';",
      "import { Box, Text, type RenderOptions, type Root, type TextProps } from './ink.js';",
      'target98 Vertex setup Ink values',
    )
    source = replaceOnce(
      source,
      "import { applyConfigEnvironmentVariables } from './utils/managedEnv.js';\n",
      "import { applyConfigEnvironmentVariables } from './utils/managedEnv.js';\nimport { logForDebugging } from './utils/debug.js';\nimport { logError } from './utils/log.js';\n",
      'target98 Vertex setup logging imports',
    )
    const providerHelpers = block(
      current,
      'const MODEL_TIER_LABELS =',
      'export async function showSetupScreens',
    )
    source = replaceOnce(
      source,
      'export async function showSetupScreens',
      `${providerHelpers}export async function showSetupScreens`,
      'target98 third-party model setup helpers',
    )
    source = replaceOnce(
      source,
      "  if ((permissionMode === 'bypassPermissions' || allowDangerouslySkipPermissions) && !hasSkipDangerousModePermissionPrompt()) {",
      `  try {
    await runBedrockUpgradeCheck(root)
  } catch (error) {
    logError(error)
  }
  try {
    await runBedrockFallbackCheck(root)
  } catch (error) {
    logError(error)
  }
  try {
    await runVertexUpgradeCheck(root)
  } catch (error) {
    logError(error)
  }
  try {
    await runVertexFallbackCheck(root)
  } catch (error) {
    logError(error)
  }
  if ((permissionMode === 'bypassPermissions' || allowDangerouslySkipPermissions) && !hasSkipDangerousModePermissionPrompt()) {`,
      'target98 reachable third-party model setup sequence',
    )
    fs.writeFileSync(filename, source)
  }
}

function buildUltraplanLaunch98(temp) {
  for (const relative of [
    'src/commands/ultraplan.tsx',
    'src/components/ultraplan/UltraplanLaunchDialog.tsx',
    'src/state/AppStateStore.ts',
    'src/screens/REPL.tsx',
    'src/utils/teleport.tsx',
    'src/utils/ultraplan/target98Prompts.ts',
  ]) {
    const destination = path.join(temp, relative)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(
      path.join('/tmp/middle98-integrated.koScjU', relative),
      destination,
    )
  }
}

function buildAgentsRuntime98(temp) {
  copyFile(temp, 'src/components/agents/RunningAgents.tsx')
  copyFile(temp, 'src/components/agents/AgentsRuntimeMenu.tsx')

  {
    const filename = path.join(temp, 'src/components/agents/AgentsMenu.tsx')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      'export function AgentsMenu(',
      'function LegacyAgentsMenu(',
      'target98 preserve legacy Agents editor behind runtime menu',
    )
    fs.writeFileSync(
      filename,
      replaceOnce(
        source,
        '\n//# sourceMappingURL=',
        "\nexport { AgentsMenu } from './AgentsRuntimeMenu.js'\n//# sourceMappingURL=",
        'target98 Agents runtime menu export',
      ),
    )
  }

  {
    const filename = path.join(temp, 'src/state/AppStateStore.ts')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      `  // Latest-wins on collision. Used by SendMessage to route by name.
  agentNameRegistry: Map<string, AgentId>
`,
      `  // Latest-wins on collision. Used by SendMessage to route by name.
  agentNameRegistry: Map<string, AgentId>
  // Agent definitions selected during this process. The /agents library uses
  // this to keep recently invoked agents at the top of the all-sources view.
  agentTypesInvokedThisSession: Set<string>
`,
      'target98 invoked-agent state field',
    )
    source = replaceOnce(
      source,
      `    tasks: {},
    agentNameRegistry: new Map(),
    verbose: false,`,
      `    tasks: {},
    agentNameRegistry: new Map(),
    agentTypesInvokedThisSession: new Set(),
    verbose: false,`,
      'target98 default invoked-agent state',
    )
    fs.writeFileSync(filename, source)
  }

  {
    const filename = path.join(temp, 'src/main.tsx')
    const source = fs.readFileSync(filename, 'utf8')
    fs.writeFileSync(
      filename,
      replaceOnce(
        source,
        `      tasks: {},
      agentNameRegistry: new Map(),
      verbose:`,
        `      tasks: {},
      agentNameRegistry: new Map(),
      agentTypesInvokedThisSession: new Set(),
      verbose:`,
        'target98 initial invoked-agent state',
      ),
    )
  }

  {
    const filename = path.join(temp, 'src/tools/AgentTool/AgentTool.tsx')
    const source = fs.readFileSync(filename, 'utf8')
    fs.writeFileSync(
      filename,
      replaceOnce(
        source,
        `    const resolvedAgentModel = getAgentModel(selectedAgent.model, toolUseContext.options.mainLoopModel, isForkPath ? undefined : model, permissionMode);
    logEvent('tengu_agent_tool_selected', {`,
        `    const resolvedAgentModel = getAgentModel(selectedAgent.model, toolUseContext.options.mainLoopModel, isForkPath ? undefined : model, permissionMode);
    rootSetAppState(previous => previous.agentTypesInvokedThisSession.has(selectedAgent.agentType) ? previous : {
      ...previous,
      agentTypesInvokedThisSession: new Set(previous.agentTypesInvokedThisSession).add(selectedAgent.agentType)
    });
    logEvent('tengu_agent_tool_selected', {`,
        'target98 invoked-agent selection state',
      ),
    )
  }
}

function buildStatusLineResult98(temp) {
  const filename = path.join(temp, 'src/components/StatusLine.tsx')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    "import { createBaseHookInput, executeStatusLineCommand } from '../utils/hooks.js';\n",
    "import { createBaseHookInput, executeStatusLineCommand } from '../utils/hooks.js';\nimport { stringWidth } from '../ink/stringWidth.js';\n",
    'target98 status-line width import',
  )
  const helper = `
function logPendingStatusLineResult(
  pendingRef: React.MutableRefObject<boolean>,
  event: string,
  metadata: () => Record<string, number | undefined>,
  logFn: (event: string, metadata: Record<string, number | undefined>) => void = logEvent,
): void {
  if (!pendingRef.current) return;
  pendingRef.current = false;
  logFn(event, metadata());
}
`

function buildMcpResourceTemplates98(temp) {
  // The URI-template parser/completer itself is semantically unchanged in the
  // current source. Target 98 used the original argument order, though, so keep
  // that historical API shape instead of copying the later call-site refactor.
  copyFile(temp, 'src/hooks/unifiedSuggestions.ts')
  {
    const filename = path.join(temp, 'src/hooks/unifiedSuggestions.ts')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      `export async function generateUnifiedSuggestions(
  query: string,
  mcpResources: Record<string, ServerResource[]>,
  mcpResourceTemplates: Record<string, ServerResourceTemplate[]>,
  agents: AgentDefinition[],
  showOnEmpty = false,
): Promise<SuggestionItem[]> {`,
      `export async function generateUnifiedSuggestions(
  query: string,
  mcpResources: Record<string, ServerResource[]>,
  agents: AgentDefinition[],
  showOnEmpty = false,
  mcpResourceTemplates: Record<string, ServerResourceTemplate[]> = {},
): Promise<SuggestionItem[]> {`,
      'target98 unified-suggestion parameter order',
    )
    fs.writeFileSync(filename, source)
  }

  {
    const filename = path.join(temp, 'src/services/mcp/types.ts')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      `import type {
  Resource,
  ServerCapabilities,
} from '@modelcontextprotocol/sdk/types.js'`,
      `import type {
  Resource,
  ResourceTemplate,
  ServerCapabilities,
} from '@modelcontextprotocol/sdk/types.js'`,
      'target98 MCP resource-template protocol type',
    )
    source = replaceOnce(
      source,
      `export type ServerResource = Resource & { server: string }
`,
      `export type ServerResource = Resource & { server: string }
export type ServerResourceTemplate = ResourceTemplate & { server: string }
`,
      'target98 server resource-template type',
    )
    source = replaceOnce(
      source,
      `  resources: Record<string, ServerResource[]>
  normalizedNames?:`,
      `  resources: Record<string, ServerResource[]>
  resourceTemplates: Record<string, ServerResourceTemplate[]>
  normalizedNames?:`,
      'target98 serialized resource-template state',
    )
    fs.writeFileSync(filename, source)
  }

  {
    const filename = path.join(temp, 'src/state/AppStateStore.ts')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      `  MCPServerConnection,
  ServerResource,
} from '../services/mcp/types.js'`,
      `  MCPServerConnection,
  ServerResource,
  ServerResourceTemplate,
} from '../services/mcp/types.js'`,
      'target98 app-state template import',
    )
    source = replaceOnce(
      source,
      `    resources: Record<string, ServerResource[]>
    /**`,
      `    resources: Record<string, ServerResource[]>
    resourceTemplates: Record<string, ServerResourceTemplate[]>
    /**`,
      'target98 app-state template field',
    )
    source = replaceOnce(
      source,
      `      resources: {},
      pluginReconnectKey: 0,`,
      `      resources: {},
      resourceTemplates: {},
      pluginReconnectKey: 0,`,
      'target98 default app-state templates',
    )
    fs.writeFileSync(filename, source)
  }

  for (const [relative, needle, replacement, label] of [
    [
      'src/commands/clear/conversation.ts',
      `          resources: {},
          pluginReconnectKey: prev.mcp.pluginReconnectKey,`,
      `          resources: {},
          resourceTemplates: {},
          pluginReconnectKey: prev.mcp.pluginReconnectKey,`,
      'target98 clear templates state',
    ],
    [
      'src/main.tsx',
      `        resources: {},
        pluginReconnectKey: 0`,
      `        resources: {},
        resourceTemplates: {},
        pluginReconnectKey: 0`,
      'target98 initial templates state',
    ],
  ]) {
    const filename = path.join(temp, relative)
    const source = fs.readFileSync(filename, 'utf8')
    fs.writeFileSync(filename, replaceOnce(source, needle, replacement, label))
  }

  {
    const filename = path.join(temp, 'src/services/mcp/client.ts')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      `  ListResourcesResultSchema,
  ListRootsRequestSchema,`,
      `  ListResourcesResultSchema,
  ListResourceTemplatesResultSchema,
  ListRootsRequestSchema,`,
      'target98 resource-template response schema',
    )
    source = replaceOnce(
      source,
      `  ScopedMcpServerConfig,
  ServerResource,
} from './types.js'`,
      `  ScopedMcpServerConfig,
  ServerResource,
  ServerResourceTemplate,
} from './types.js'`,
      'target98 resource-template client type',
    )
    source = replaceOnce(
      source,
      `        fetchToolsForClient.cache.delete(name)
        fetchResourcesForClient.cache.delete(name)
        fetchCommandsForClient.cache.delete(name)`,
      `        fetchToolsForClient.cache.delete(name)
        fetchResourcesForClient.cache.delete(name)
        fetchResourceTemplatesForClient.cache.delete(name)
        fetchCommandsForClient.cache.delete(name)`,
      'target98 close-handler template cache',
    )
    source = replaceOnce(
      source,
      `  fetchToolsForClient.cache.delete(name)
  fetchResourcesForClient.cache.delete(name)
  fetchCommandsForClient.cache.delete(name)`,
      `  fetchToolsForClient.cache.delete(name)
  fetchResourcesForClient.cache.delete(name)
  fetchResourceTemplatesForClient.cache.delete(name)
  fetchCommandsForClient.cache.delete(name)`,
      'target98 explicit template cache clear',
    )
    const targetFunctions = `export const fetchResourceTemplatesForClient = memoizeWithLRU(
  async (client: MCPServerConnection): Promise<ServerResourceTemplate[]> => {
    if (client.type !== 'connected') return []

    try {
      if (!client.capabilities?.resources) return []
      const result = await client.client.request(
        { method: 'resources/templates/list' },
        ListResourceTemplatesResultSchema,
      )
      if (!result.resourceTemplates) return []
      return result.resourceTemplates.map(template => ({
        ...template,
        server: client.name,
      }))
    } catch (error) {
      logMCPDebug(
        client.name,
        \`Failed to fetch resource templates: \${errorMessage(error)}\`,
      )
      return []
    }
  },
  (client: MCPServerConnection) => client.name,
  MCP_FETCH_CACHE_SIZE,
)

export async function completeResourceTemplate(
  client: ConnectedMCPServer,
  uriTemplate: string,
  argumentName: string,
  argumentValue: string,
  resolvedArguments: Record<string, string>,
): Promise<string[]> {
  if (!client.capabilities?.completions) return []
  try {
    const result = await client.client.complete({
      ref: { type: 'ref/resource', uri: uriTemplate },
      argument: { name: argumentName, value: argumentValue },
      context:
        Object.keys(resolvedArguments).length > 0
          ? { arguments: resolvedArguments }
          : undefined,
    })
    return result.completion.values
  } catch (error) {
    logMCPDebug(
      client.name,
      \`Failed to complete resource template: \${errorMessage(error)}\`,
    )
    return []
  }
}

`
    source = replaceOnce(
      source,
      `export const fetchCommandsForClient = memoizeWithLRU(`,
      `${targetFunctions}export const fetchCommandsForClient = memoizeWithLRU(`,
      'target98 resource-template fetch and completion functions',
    )
    source = replaceOnce(
      source,
      `  commands: Command[]
  resources?: ServerResource[]
}> {`,
      `  commands: Command[]
  resources?: ServerResource[]
  resourceTemplates?: ServerResourceTemplate[]
}> {`,
      'target98 reconnect result type',
    )
    source = replaceOnce(
      source,
      `    const [tools, mcpCommands, mcpSkills, resources] = await Promise.all([
      fetchToolsForClient(client),
      fetchCommandsForClient(client),
      feature('MCP_SKILLS') && supportsResources
        ? fetchMcpSkillsForClient!(client)
        : Promise.resolve([]),
      supportsResources ? fetchResourcesForClient(client) : Promise.resolve([]),
    ])`,
      `    const [tools, mcpCommands, mcpSkills, resources, resourceTemplates] =
      await Promise.all([
        fetchToolsForClient(client),
        fetchCommandsForClient(client),
        feature('MCP_SKILLS') && supportsResources
          ? fetchMcpSkillsForClient!(client)
          : Promise.resolve([]),
        supportsResources
          ? fetchResourcesForClient(client)
          : Promise.resolve([]),
        supportsResources
          ? fetchResourceTemplatesForClient(client)
          : Promise.resolve([]),
      ])`,
      'target98 reconnect eager template fetch',
    )
    source = replaceOnce(
      source,
      `      commands,
      resources: resources.length > 0 ? resources : undefined,
    }`,
      `      commands,
      resources: resources.length > 0 ? resources : undefined,
      resourceTemplates,
    }`,
      'target98 reconnect template result',
    )
    source = replaceOnce(
      source,
      `    commands: Command[]
    resources?: ServerResource[]
  }) => void,`,
      `    commands: Command[]
    resources?: ServerResource[]
    resourceTemplates?: ServerResourceTemplate[]
  }) => void,`,
      'target98 initial connection callback type',
    )
    source = replaceOnce(
      source,
      `      const [tools, mcpCommands, mcpSkills, resources] = await Promise.all([
        fetchToolsForClient(client),
        fetchCommandsForClient(client),
        // Discover skills from skill:// resources
        feature('MCP_SKILLS') && supportsResources
          ? fetchMcpSkillsForClient!(client)
          : Promise.resolve([]),
        // Fetch resources if supported
        supportsResources
          ? fetchResourcesForClient(client)
          : Promise.resolve([]),
      ])`,
      `      const [tools, mcpCommands, mcpSkills, resources, resourceTemplates] =
        await Promise.all([
          fetchToolsForClient(client),
          fetchCommandsForClient(client),
          // Discover skills from skill:// resources
          feature('MCP_SKILLS') && supportsResources
            ? fetchMcpSkillsForClient!(client)
            : Promise.resolve([]),
          // Fetch resources and URI templates if supported
          supportsResources
            ? fetchResourcesForClient(client)
            : Promise.resolve([]),
          supportsResources
            ? fetchResourceTemplatesForClient(client)
            : Promise.resolve([]),
        ])`,
      'target98 initial eager template fetch',
    )
    source = replaceOnce(
      source,
      `        commands,
        resources: resources.length > 0 ? resources : undefined,
      })`,
      `        commands,
        resources: resources.length > 0 ? resources : undefined,
        resourceTemplates,
      })`,
      'target98 initial template callback',
    )
    fs.writeFileSync(filename, source)
  }

  {
    const filename = path.join(temp, 'src/services/mcp/useManageMCPConnections.ts')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      `  fetchResourcesForClient,
  fetchToolsForClient,`,
      `  fetchResourcesForClient,
  fetchResourceTemplatesForClient,
  fetchToolsForClient,`,
      'target98 connection template fetch import',
    )
    source = replaceOnce(
      source,
      `  ScopedMcpServerConfig,
  ServerResource,
} from './types.js'`,
      `  ScopedMcpServerConfig,
  ServerResource,
  ServerResourceTemplate,
} from './types.js'`,
      'target98 connection template type import',
    )
    source = replaceOnce(
      source,
      `    commands?: Command[]
    resources?: ServerResource[]
  }`,
      `    commands?: Command[]
    resources?: ServerResource[]
    resourceTemplates?: ServerResourceTemplate[]
  }`,
      'target98 pending template update',
    )
    source = replaceOnce(
      source,
      `          commands: rawCmds,
          resources: rawRes,
          ...client`,
      `          commands: rawCmds,
          resources: rawRes,
          resourceTemplates: rawTemplates,
          ...client`,
      'target98 template update destructuring',
    )
    source = replaceOnce(
      source,
      `        const resources =
          client.type === 'disabled' || client.type === 'failed'
            ? (rawRes ?? [])
            : rawRes
`,
      `        const resources =
          client.type === 'disabled' || client.type === 'failed'
            ? (rawRes ?? [])
            : rawRes
        const resourceTemplates =
          client.type === 'disabled' || client.type === 'failed'
            ? (rawTemplates ?? [])
            : rawTemplates
`,
      'target98 disabled template clearing',
    )
    source = replaceOnce(
      source,
      `        mcp = {
          ...mcp,
          clients: updatedClients,
          tools: updatedTools,
          commands: updatedCommands,
          resources: updatedResources,
        }`,
      `        const updatedResourceTemplates =
          resourceTemplates === undefined
            ? mcp.resourceTemplates
            : {
                ...mcp.resourceTemplates,
                ...(resourceTemplates.length > 0
                  ? { [client.name]: resourceTemplates }
                  : omit(mcp.resourceTemplates, client.name)),
              }

        mcp = {
          ...mcp,
          clients: updatedClients,
          tools: updatedTools,
          commands: updatedCommands,
          resources: updatedResources,
          resourceTemplates: updatedResourceTemplates,
        }`,
      'target98 template state update',
    )
    source = replaceOnce(
      source,
      `      commands,
      resources,
    }: {
      client: MCPServerConnection
      tools: Tool[]
      commands: Command[]
      resources?: ServerResource[]
    }) => {
      updateServer({ ...client, tools, commands, resources })`,
      `      commands,
      resources,
      resourceTemplates,
    }: {
      client: MCPServerConnection
      tools: Tool[]
      commands: Command[]
      resources?: ServerResource[]
      resourceTemplates?: ServerResourceTemplate[]
    }) => {
      updateServer({ ...client, tools, commands, resources, resourceTemplates })`,
      'target98 connection template callback',
    )
    source = replaceOnce(
      source,
      `                  fetchResourcesForClient.cache.delete(client.name)
                  if (feature('MCP_SKILLS')) {`,
      `                  fetchResourcesForClient.cache.delete(client.name)
                  fetchResourceTemplatesForClient.cache.delete(client.name)
                  if (feature('MCP_SKILLS')) {`,
      'target98 list-changed template invalidation',
    )
    source = replaceOnce(
      source,
      `                    const [newResources, mcpPrompts, mcpSkills] =
                      await Promise.all([
                        fetchResourcesForClient(client),
                        fetchCommandsForClient(client),
                        fetchMcpSkillsForClient!(client),
                      ])
                    updateServer({
                      ...client,
                      resources: newResources,
                      commands: [...mcpPrompts, ...mcpSkills],
                    })`,
      `                    const [
                      newResources,
                      newTemplates,
                      mcpPrompts,
                      mcpSkills,
                    ] = await Promise.all([
                      fetchResourcesForClient(client),
                      fetchResourceTemplatesForClient(client),
                      fetchCommandsForClient(client),
                      fetchMcpSkillsForClient!(client),
                    ])
                    updateServer({
                      ...client,
                      resources: newResources,
                      resourceTemplates: newTemplates,
                      commands: [...mcpPrompts, ...mcpSkills],
                    })`,
      'target98 skill-enabled list-changed template refresh',
    )
    source = replaceOnce(
      source,
      `                    const newResources = await fetchResourcesForClient(client)
                    updateServer({ ...client, resources: newResources })`,
      `                    const [newResources, newTemplates] = await Promise.all([
                      fetchResourcesForClient(client),
                      fetchResourceTemplatesForClient(client),
                    ])
                    updateServer({
                      ...client,
                      resources: newResources,
                      resourceTemplates: newTemplates,
                    })`,
      'target98 list-changed template refresh',
    )
    fs.writeFileSync(filename, source)
  }

  {
    const filename = path.join(temp, 'src/hooks/useTypeahead.tsx')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      `import { generateUnifiedSuggestions } from './unifiedSuggestions.js';`,
      `import { generateMcpResourceTemplateCompletions, generateUnifiedSuggestions } from './unifiedSuggestions.js';`,
      'target98 template completion import',
    )
    source = replaceOnce(
      source,
      `  const mcpResources = useAppState(s => s.mcp.resources);
  const store = useAppStateStore();`,
      `  const mcpResources = useAppState(s => s.mcp.resources);
  const mcpResourceTemplates = useAppState(s => s.mcp.resourceTemplates);
  const store = useAppStateStore();`,
      'target98 template state selector',
    )
    source = replaceOnce(
      source,
      `  const latestSearchTokenRef = useRef<string | null>(null);
  // Track previous input`,
      `  const latestSearchTokenRef = useRef<string | null>(null);
  const latestSearchIsAtSymbolRef = useRef(false);
  // Track previous input`,
      'target98 at-symbol search mode ref',
    )
    source = replaceOnce(
      source,
      `  const fetchFileSuggestions = useCallback(async (searchToken: string, isAtSymbol = false): Promise<void> => {
    latestSearchTokenRef.current = searchToken;
    const combinedItems = await generateUnifiedSuggestions(searchToken, mcpResources, agents, isAtSymbol);
    // Discard stale results if a newer query was initiated while waiting
    if (latestSearchTokenRef.current !== searchToken) {`,
      `  const fetchFileSuggestions = useCallback(async (searchToken: string, isAtSymbol = false): Promise<void> => {
    latestSearchTokenRef.current = searchToken;
    latestSearchIsAtSymbolRef.current = isAtSymbol;
    let templateItems = null;
    if (isAtSymbol) {
      templateItems = await generateMcpResourceTemplateCompletions(
        searchToken,
        mcpResourceTemplates,
        store.getState().mcp.clients,
      );
      if (latestSearchTokenRef.current !== searchToken) return;
    }
    const combinedItems = templateItems ?? await generateUnifiedSuggestions(
      searchToken,
      mcpResources,
      agents,
      isAtSymbol,
      mcpResourceTemplates,
    );
    // Discard stale results if a newer query was initiated while waiting
    if (latestSearchTokenRef.current !== searchToken) {`,
      'target98 typeahead template query',
    )
    source = replaceOnce(
      source,
      `  }, [mcpResources, setSuggestionsState, setSuggestionType, setMaxColumnWidth, agents]);`,
      `  }, [mcpResources, mcpResourceTemplates, store, setSuggestionsState, setSuggestionType, setMaxColumnWidth, agents]);`,
      'target98 typeahead template dependencies',
    )
    source = replaceOnce(
      source,
      `        latestSearchTokenRef.current = null;
        void fetchFileSuggestions(token, token === '');`,
      `        const isAtSymbol = latestSearchIsAtSymbolRef.current;
        latestSearchTokenRef.current = null;
        void fetchFileSuggestions(token, isAtSymbol);`,
      'target98 index refresh search mode',
    )
    source = replaceOnce(
      source,
      `        const commonPrefix = findLongestCommonPrefix(suggestions);`,
      `        const commonPrefix = suggestions.some(suggestion => suggestion.metadata?.replacement)
          ? ''
          : findLongestCommonPrefix(suggestions);`,
      'target98 template common-prefix suppression',
    )
    source = replaceOnce(
      source,
      `            const needsQuotes = suggestion.displayText.includes(' ');
            const replacementValue = formatReplacementValue({
              displayText: suggestion.displayText,
              mode,
              hasAtPrefix,
              needsQuotes,
              isQuoted: completionToken.isQuoted,
              isComplete: true // complete suggestion
            });`,
      `            const metadata = suggestion.metadata as {
              replacement?: string;
              partial?: boolean;
            } | undefined;
            const displayText = metadata?.replacement ?? suggestion.displayText;
            const needsQuotes = displayText.includes(' ');
            const replacementValue = formatReplacementValue({
              displayText,
              mode,
              hasAtPrefix,
              needsQuotes,
              isQuoted: completionToken.isQuoted,
              isComplete: !metadata?.partial
            });`,
      'target98 tab template replacement',
    )
    source = replaceOnce(
      source,
      `          suggestionItems = await generateUnifiedSuggestions(searchToken, mcpResources, agents, isAtSymbol);`,
      `          latestSearchTokenRef.current = searchToken;
          latestSearchIsAtSymbolRef.current = isAtSymbol;
          let templateItems = null;
          if (isAtSymbol) {
            templateItems = await generateMcpResourceTemplateCompletions(
              searchToken,
              mcpResourceTemplates,
              store.getState().mcp.clients,
            );
            if (latestSearchTokenRef.current !== searchToken) return;
          }
          suggestionItems = templateItems ?? await generateUnifiedSuggestions(
            searchToken,
            mcpResources,
            agents,
            isAtSymbol,
            mcpResourceTemplates,
          );
          if (latestSearchTokenRef.current !== searchToken) return;`,
      'target98 manual template suggestions',
    )
    source = replaceOnce(
      source,
      `  }, [suggestions, selectedSuggestion, input, suggestionType, commands, mode, onInputChange, setCursorOffset, onSubmit, clearSuggestions, cursorOffset, updateSuggestions, mcpResources, setSuggestionsState, agents, debouncedFetchFileSuggestions, debouncedFetchSlackChannels, effectiveGhostText]);`,
      `  }, [suggestions, selectedSuggestion, input, suggestionType, commands, mode, onInputChange, setCursorOffset, onSubmit, clearSuggestions, cursorOffset, updateSuggestions, mcpResources, mcpResourceTemplates, store, setSuggestionsState, agents, debouncedFetchFileSuggestions, debouncedFetchSlackChannels, effectiveGhostText]);`,
      'target98 tab template dependencies',
    )
    source = replaceOnce(
      source,
      `          const needsQuotes = suggestion.displayText.includes(' ');
          const replacementValue = formatReplacementValue({
            displayText: suggestion.displayText,
            mode,
            hasAtPrefix,
            needsQuotes,
            isQuoted: completionInfo.isQuoted,
            isComplete: true // complete suggestion
          });`,
      `          const metadata = suggestion.metadata as {
            replacement?: string;
            partial?: boolean;
          } | undefined;
          const displayText = metadata?.replacement ?? suggestion.displayText;
          const needsQuotes = displayText.includes(' ');
          const replacementValue = formatReplacementValue({
            displayText,
            mode,
            hasAtPrefix,
            needsQuotes,
            isQuoted: completionInfo.isQuoted,
            isComplete: !metadata?.partial
          });`,
      'target98 enter template replacement',
    )
    fs.writeFileSync(filename, source)
  }
}

const statusLineRunHelper = `
export async function runStatusLineUpdate({
  signal,
  executeCommand,
  getCommandLength,
  pendingResultLogRef,
  onResult,
  logFn = logEvent,
}: {
  signal: AbortSignal
  executeCommand: () => Promise<string | undefined>
  getCommandLength: () => number | undefined
  pendingResultLogRef: React.MutableRefObject<boolean>
  onResult: (result: string | undefined) => void
  logFn?: (event: string, metadata: Record<string, number | undefined>) => void
}): Promise<void> {
  const commandLength = getCommandLength();
  try {
    const result = await executeCommand();
    if (signal.aborted) return;
    onResult(result);
    if (result) {
      logPendingStatusLineResult(
        pendingResultLogRef,
        'tengu_status_line_result',
        () => {
          const lines = result.split('\\n');
          let visualWidth = 0;
          for (const line of lines) {
            visualWidth = Math.max(visualWidth, stringWidth(line));
          }
          return {
            char_length: result.length,
            visual_width: visualWidth,
            line_count: lines.length,
            command_length: commandLength,
          };
        },
        logFn,
      );
    }
  } catch {
    // Status-line failures never interrupt the UI.
  }
}
`
  source = replaceOnce(
    source,
    '\nexport function statusLineShouldDisplay(',
    `${helper}${statusLineRunHelper}\nexport function statusLineShouldDisplay(`,
    'target98 status-line result helper',
  )
  source = replaceOnce(
    source,
    '  const logNextResultRef = useRef(true);\n',
    '  const logNextResultRef = useRef(true);\n  const pendingResultTelemetryRef = useRef(true);\n',
    'target98 status-line result ref',
  )
  source = replaceOnce(
    source,
    `      const text = await executeStatusLineCommand(statusInput, controller.signal, undefined, logResult);
      if (!controller.signal.aborted) {
        setAppState(prev => {
          if (prev.statusLineText === text) return prev;
          return {
            ...prev,
            statusLineText: text
          };
        });
      }`,
    `      await runStatusLineUpdate({
        signal: controller.signal,
        executeCommand: () => executeStatusLineCommand(statusInput, controller.signal, undefined, logResult),
        getCommandLength: () => settingsRef.current?.statusLine?.command.length,
        pendingResultLogRef: pendingResultTelemetryRef,
        onResult: text => {
          setAppState(prev => {
            if (prev.statusLineText === text) return prev;
            return {
              ...prev,
              statusLineText: text
            };
          });
        }
      });`,
    'target98 status-line result execution',
  )
  source = replaceOnce(
    source,
    '    logNextResultRef.current = true;\n    void doUpdate();',
    '    logNextResultRef.current = true;\n    pendingResultTelemetryRef.current = true;\n    void doUpdate();',
    'target98 status-line result reset',
  )
  fs.writeFileSync(filename, source)
  buildMcpResourceTemplates98(temp)
}

function buildWrappedContentFeedback98(temp) {
  const exactRoot = '/tmp/middle98-integrated.koScjU'
  const serializer = 'src/utils/wrappedContentSerializer.ts'
  const source = path.join(exactRoot, serializer)
  if (!fs.existsSync(source)) {
    throw new Error(`missing exact target98 wrapped-content owner ${source}`)
  }
  const destination = path.join(temp, serializer)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/components/Feedback.tsx',
    hunk =>
      /serializeWrappedContent|FEEDBACK_ARRAY_FIELDS|FEEDBACK_TRANSCRIPT_MAP_FIELDS|MAX_FEEDBACK_PAYLOAD_BYTES|payloadTooLarge|finalResult|minimalReport|payloadBytes|ECONNABORTED/.test(
        hunk,
      ),
  )
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/components/FeedbackSurvey/submitTranscriptShare.ts',
    hunk =>
      /serializeWrappedContent|extraOuterFields|transformInnerChunk|\bbody\b/.test(
        hunk,
      ),
  )
}

function buildDream97(temp) {
  copyFile(temp, 'src/skills/bundled/dream.ts')
  const filename = path.join(temp, 'src/skills/bundled/dream.ts')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(source, "import { feature } from 'bun:bundle'\n", '', 'target97 dream feature import')
  source = replaceOnce(
    source,
    `const teamMemPaths = feature('TEAMMEM')
  ? require('../../memdir/teamMemPaths.js')
  : null

`,
    '',
    'target97 dream team-memory module',
  )
  source = replaceOnce(
    source,
    '  extra: string,\n  teamMemoryEnabled: boolean,\n): string {',
    '  extra: string,\n): string {',
    'target97 nightly signature',
  )
  source = replaceOnce(
    source,
    `  extra,
  teamMemoryEnabled,
)}`,
    `  extra,
)}`,
    'target97 nightly consolidation prompt',
  )
  source = replaceOnce(
    source,
    '      const teamMemoryEnabled = teamMemPaths?.isTeamMemoryEnabled() ?? false\n',
    '',
    'target97 dream team-memory gate',
  )
  source = source.replaceAll(
    '          team_memory_enabled: teamMemoryEnabled,\n',
    '',
  )
  source = source.replaceAll(
    '        team_memory_enabled: teamMemoryEnabled,\n',
    '',
  )
  source = replaceOnce(
    source,
    `              extra,
              teamMemoryEnabled,
            ),`,
    `              extra,
            ),`,
    'target97 scheduled team-memory prompt',
  )
  source = replaceOnce(
    source,
    `            trimmed,
            teamMemoryEnabled,
          ),`,
    `            trimmed,
          ),`,
    'target97 immediate team-memory prompt',
  )
  fs.writeFileSync(filename, source)
}

function buildCompactTruncation97(temp) {
  const relative = 'src/services/compact/compact.ts'
  const filename = path.join(temp, relative)
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    `  return messages
}

export const ERROR_MESSAGE_NOT_ENOUGH_MESSAGES =`,
    `  return messages
}

export function stripNonEssentialCompactAttachments(
  messages: Message[],
): Message[] {
  return messages.filter(
    message =>
      message.type !== 'attachment' ||
      message.attachment.type === 'queued_command',
  )
}

export const ERROR_MESSAGE_NOT_ENOUGH_MESSAGES =`,
    'target97 cold compact attachment filter',
  )
  source = replaceOnce(
    source,
    `export const ERROR_MESSAGE_NOT_ENOUGH_MESSAGES =
  'Not enough messages to compact.'`,
    `const COMPACT_NONESSENTIAL_STRING_LIMIT = 100

function truncateNonEssentialCompactString(value: string): string {
  if (value.length <= COMPACT_NONESSENTIAL_STRING_LIMIT) return value
  let end = COMPACT_NONESSENTIAL_STRING_LIMIT
  const lastCodeUnit = value.charCodeAt(end - 1)
  if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) end--
  return \`${'${value.slice(0, end)}'}…[truncated, original ${'${value.length}'} chars]\`
}

function truncateNonEssentialCompactValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return truncateNonEssentialCompactString(value)
  }
  if (Array.isArray(value)) {
    const mapped = value.map(truncateNonEssentialCompactValue)
    return mapped.some((item, index) => item !== value[index]) ? mapped : value
  }
  if (typeof value === 'object' && value !== null) {
    const input = value as Record<string, unknown>
    let changed = false
    const mapped: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(input)) {
      const next = truncateNonEssentialCompactValue(item)
      if (next !== item) changed = true
      mapped[key] = next
    }
    return changed ? mapped : value
  }
  return value
}

function isCompactThinkingBlock(block: { type: string }): boolean {
  return block.type === 'thinking' || block.type === 'redacted_thinking'
}

function truncateNonEssentialCompactMessages(messages: Message[]): Message[] {
  return messages.map(message => {
    if (message.type === 'assistant') {
      const content = message.message.content
      if (!Array.isArray(content)) return message
      let changed = content.some(isCompactThinkingBlock)
      const mapped = (changed
        ? content.filter(block => !isCompactThinkingBlock(block))
        : content
      ).map(block => {
        if (block.type !== 'tool_use') return block
        const input = truncateNonEssentialCompactValue(block.input)
        if (input === block.input) return block
        changed = true
        return { ...block, input }
      })
      if (!changed) return message
      return {
        ...message,
        message: { ...message.message, content: mapped },
      } as typeof message
    }
    if (message.type === 'user') {
      const content = message.message.content
      if (!Array.isArray(content)) return message
      let changed = false
      const mapped = content.map(block => {
        if (block.type !== 'tool_result') return block
        const flattened =
          typeof block.content === 'string'
            ? block.content
            : Array.isArray(block.content)
              ? block.content
                  .map(item => (item.type === 'text' ? item.text : ''))
                  .join('')
              : ''
        const next = truncateNonEssentialCompactString(flattened)
        if (block.content === next) return block
        changed = true
        return { ...block, content: next }
      })
      if (!changed) return message
      return {
        ...message,
        message: { ...message.message, content: mapped },
      } as typeof message
    }
    return message
  })
}

export const ERROR_MESSAGE_NOT_ENOUGH_MESSAGES =
  'Not enough messages to compact.'`,
    'target97 nonessential recursive truncation helpers',
  )
  source = replaceOnce(
    source,
    `  isAutoCompact: boolean = false,
  recompactionInfo?: RecompactionInfo,
): Promise<CompactionResult> {`,
    `  isAutoCompact: boolean = false,
  recompactionInfo?: RecompactionInfo,
  stripNonEssential: boolean = false,
): Promise<CompactionResult> {`,
    'target97 compact strip-nonessential parameter',
  )
  source = replaceOnce(
    source,
    `    const promptCacheSharingEnabled = getFeatureValue_CACHED_MAY_BE_STALE(
      'tengu_compact_cache_prefix',
      true,
    )`,
    `    const promptCacheSharingEnabled =
      !stripNonEssential &&
      getFeatureValue_CACHED_MAY_BE_STALE('tengu_compact_cache_prefix', true)`,
    'target97 cold compact cache-sharing bypass',
  )
  source = replaceOnce(
    source,
    `        messages: messagesToSummarize,
        summaryRequest,
        appState,
        context,
        preCompactTokenCount,
        cacheSafeParams: retryCacheSafeParams,
      })`,
    `        messages: messagesToSummarize,
        summaryRequest,
        appState,
        context,
        preCompactTokenCount,
        cacheSafeParams: retryCacheSafeParams,
        stripNonEssential,
      })`,
    'target97 stream strip-nonessential argument',
  )
  source = replaceOnce(
    source,
    `  preCompactTokenCount,
  cacheSafeParams,
}: {`,
    `  preCompactTokenCount,
  cacheSafeParams,
  stripNonEssential = false,
}: {`,
    'target97 stream strip-nonessential parameter',
  )
  source = replaceOnce(
    source,
    `  preCompactTokenCount: number
  cacheSafeParams: CacheSafeParams
}): Promise<AssistantMessage> {`,
    `  preCompactTokenCount: number
  cacheSafeParams: CacheSafeParams
  stripNonEssential?: boolean
}): Promise<AssistantMessage> {`,
    'target97 stream strip-nonessential type',
  )
  source = replaceOnce(
    source,
    `  const promptCacheSharingEnabled = getFeatureValue_CACHED_MAY_BE_STALE(
    'tengu_compact_cache_prefix',
    true,
  )`,
    `  const promptCacheSharingEnabled =
    !stripNonEssential &&
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_compact_cache_prefix', true)`,
    'target97 stream cache-sharing bypass',
  )
  source = replaceOnce(
    source,
    `      const streamingGen = queryModelWithStreaming({
        messages: normalizeMessagesForAPI(
          stripImagesFromMessages(
            stripReinjectedAttachments([
              ...getMessagesAfterCompactBoundary(messages),
              summaryRequest,
            ]),
          ),
          context.options.tools,
        ),`,
    `      const compactMessages = [
        ...getMessagesAfterCompactBoundary(messages),
        summaryRequest,
      ]
      const strippedMessages = stripImagesFromMessages(
        stripReinjectedAttachments(
          stripNonEssential
            ? stripNonEssentialCompactAttachments(compactMessages)
            : compactMessages,
        ),
      )
      const messagesForSummary = stripNonEssential
        ? truncateNonEssentialCompactMessages(strippedMessages)
        : strippedMessages
      const streamingGen = queryModelWithStreaming({
        messages: normalizeMessagesForAPI(
          messagesForSummary,
          stripNonEssential ? [] : context.options.tools,
        ),`,
    'target97 cold compact message normalization',
  )
  source = replaceOnce(
    source,
    `        tools,
        signal: context.abortController.signal,`,
    `        tools: stripNonEssential ? [] : tools,
        signal: context.abortController.signal,`,
    'target97 cold compact tool removal',
  )
  source = replaceOnce(
    source,
    `          effortValue: appState.effortValue,
        },`,
    `          effortValue: appState.effortValue,
          enablePromptCaching: false,
        },`,
    'target97 compact prompt-cache write disable',
  )
  fs.writeFileSync(filename, source)
}

function buildColdAutoCompact97(temp) {
  const filename = path.join(temp, 'src/services/compact/autoCompact.ts')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    `import { markPostCompaction } from 'src/bootstrap/state.js'
import { getSdkBetas } from '../../bootstrap/state.js'`,
    `import {
  getSdkBetas,
  getTotalDuration,
  markPostCompaction,
} from '../../bootstrap/state.js'`,
    'target97 cold compact duration import',
  )
  source = replaceOnce(
    source,
    `const MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3
`,
    `const MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3
const COLD_COMPACT_MIN_SESSION_MS = 90 * 60 * 1000

export function shouldUseColdCompaction(): boolean {
  return (
    getTotalDuration() >= COLD_COMPACT_MIN_SESSION_MS &&
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_cold_compact', false)
  )
}
`,
    'target97 cold compact gate',
  )
  source = replaceOnce(
    source,
    `  try {
    const compactionResult = await compactConversation(
      messages,`,
    `  const stripNonEssential = shouldUseColdCompaction()
  try {
    const compactionResult = await compactConversation(
      messages,`,
    'target97 cold compact gate call',
  )
  source = replaceOnce(
    source,
    `      true, // isAutoCompact
      recompactionInfo,
    )`,
    `      true, // isAutoCompact
      recompactionInfo,
      stripNonEssential,
    )`,
    'target97 cold compact argument',
  )
  fs.writeFileSync(filename, source)
}

function buildCronScheduler97(temp) {
  copyFile(temp, 'src/utils/cronScheduler.ts')
  const filename = path.join(temp, 'src/utils/cronScheduler.ts')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    "import { isLoopDefaultSentinel } from './loopSentinels.js'\n",
    '',
    'target97 pre-loop-default helper import',
  )
  source = replaceOnce(
    source,
    `  let tasks: CronTask[] = []
  let extraTasks: CronTask[] = []`,
    `  let tasks: CronTask[] = []`,
    'target97 combined scheduler task state',
  )
  source = replaceOnce(
    source,
    `    tasks = next
    extraTasks = nextExtra`,
    `    tasks = nextExtra.length > 0 ? [...next, ...nextExtra] : next`,
    'target97 combined extra-task load',
  )
  source = replaceOnce(
    source,
    `    for (const t of extraTasks) process(t, true)
`,
    '',
    'target97 owner-gated combined extra tasks',
  )
  source = replaceOnce(
    source,
    `        autonomousLoopDefault: isLoopDefaultSentinel(t.prompt),`,
    `        autonomousLoopDefault: false,`,
    'target97 scheduled-task loop telemetry',
  )
  fs.writeFileSync(filename, source)
}

function writePatch(temp, caseName, baseCommit = null) {
  run(temp, 'git', ['add', '-N', '.'])
  const diffArgs = ['diff', '--binary', '--full-index', '--unified=1']
  if (baseCommit !== null) diffArgs.push(baseCommit)
  let patch = run(temp, 'git', diffArgs)
  const lines = patch.split('\n')
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index].startsWith('@@ ')) continue
    let end = index + 1
    while (end < lines.length && !lines[end].startsWith('@@ ') && !lines[end].startsWith('diff --git ')) end++
    const text = lines.slice(index, end).join('\n')
    const decrementCounts = () => {
      lines[index] = lines[index].replace(
        /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@/,
        (_match, oldStart, oldCount, newStart, newCount) =>
          `@@ -${oldStart},${Number(oldCount) - 1} +${newStart},${Number(newCount) - 1} @@`,
      )
    }
    const prependSharedContext = line => {
      lines[index] = lines[index].replace(
        /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@/,
        (_match, oldStart, oldCount, newStart, newCount) =>
          `@@ -${Number(oldStart) - 1},${Number(oldCount) + 1} +${Number(newStart) - 1},${Number(newCount) + 1} @@`,
      )
      lines.splice(index + 1, 0, line)
      end++
    }
    if (text.includes("systemPromptSection('anti_verbosity'") && lines[index + 1] === '   const dynamicSections = [') {
      lines.splice(index + 1, 1)
      decrementCounts()
      end--
    }
    if (text.includes('getSimpleToneAndStyleSection(model)')) {
      if (lines[index + 1] === '     outputStyleConfig.keepCodingInstructions === true') {
        prependSharedContext('     outputStyleConfig === null ||')
      }
      const context = lines.lastIndexOf('     getOutputEfficiencySection(),', end - 1)
      if (context > index && context === end - 1) {
        lines.splice(context, 1)
        decrementCounts()
      }
    }
  }
  patch = lines.join('\n')
  if (!patch.trim()) throw new Error(`${caseName} produced no supplement`)
  fs.writeFileSync(path.join(root, 'recovery/cases', caseName, 'semantic-supplement.patch'), patch)
}

function build98() {
  const caseName = '2.1.97-to-2.1.98'
  const temp = materialize('5ecd35c9e33fc10ec040d98e15eff6da20b569e0', caseName)
  try {
    applyWorkingDiff(temp, [
      'src/utils/subprocessEnv.ts',
      'src/entrypoints/init.ts',
      'src/utils/Shell.ts',
      'src/utils/sandbox/sandbox-adapter.ts',
      'src/tools/BashTool/shouldUseSandbox.ts',
    ])
    for (const relative of [
      'src/utils/analyzeContext.ts',
      'src/utils/queryContext.ts',
      'src/entrypoints/sdk/controlSchemas.ts',
    ]) {
      const destination = path.join(temp, relative)
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.copyFileSync(path.join('/tmp/middle97-semantic-current', relative), destination)
    }
    applySelectedWorkingDiff(temp, 'src/QueryEngine.ts', hunk => hunk.includes('excludeDynamicSections'))
    applySelectedWorkingDiff(temp, 'src/Tool.ts', hunk => hunk.includes('excludeDynamicSections'))
    const cliDiff = run(root, 'git', ['diff', '--binary', 'HEAD', '--', 'src/cli/print.ts'])
    run(temp, 'git', ['apply', '-'], { input: diffHunks(cliDiff, hunk => hunk.includes('excludeDynamicSections')) })
    buildMain98(temp)
    for (const relative of [
      'src/tools/MonitorTool/MonitorTool.ts',
      'src/tools/MonitorTool/UI.tsx',
      'src/tools/MonitorTool/prompt.ts',
      'src/components/permissions/MonitorPermissionRequest/MonitorPermissionRequest.tsx',
      'src/components/VertexSetupWizard.tsx',
      'src/components/ConsoleOAuthFlow.tsx',
      'src/skills/bundled/dream.ts',
      'src/services/autoDream/consolidationPrompt.ts',
    ]) copyFile(temp, relative)
    buildAdvisor98(temp)
    buildVertexRegion98(temp)
    buildRemoteSlug98(temp)
    buildRemoteEligibility98(temp)
    buildTeleportEnvironmentSelection98(temp)
    buildLogFilters98(temp)
    buildPluginScopeFallback98(temp)
    buildProviderSetup98(temp)
    buildPrDetails98(temp)
    buildWebSetupEnvironment98(temp)
    buildBridgeLateResponse98(temp)
    buildEffortMaxCapability98(temp)
    buildSessionsWebSocket98(temp)
    buildVertexModelUpgrade98(temp)
    buildAgentsRuntime98(temp)
    buildStatusLineResult98(temp)
    buildUltraplanLaunch98(temp)
    buildWrappedContentFeedback98(temp)
    buildDynamicImageLimits98(temp)
    buildTypeaheadMetadata98(temp)
    buildPrompt98(temp)
    writePatch(temp, caseName)
    const materializedRoot = process.env.CLAUDE_CODE_MIDDLE_98_MATERIALIZED_ROOT
    if (materializedRoot) {
      fs.cpSync(temp, materializedRoot, { recursive: true })
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
}

function buildTypeaheadMetadata98(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle98-typeahead.EZ8Dju',
    'src/hooks/useTypeahead.tsx',
    hunk => /metadata\?\.replacement|metadata\?\.partial/.test(hunk),
  )
}

function buildRecursiveSafetyCheck97(temp) {
  const relative = 'src/utils/permissions/permissions.ts'
  const filename = path.join(temp, relative)
  let source = fs.readFileSync(filename, 'utf8')

  source = replaceOnce(
    source,
    `      if (
        result.decisionReason?.type === 'safetyCheck' &&
        !result.decisionReason.classifierApprovable
      ) {`,
    `      const safetyCheck = findSafetyCheck(
        result.decisionReason,
        reason => !reason.classifierApprovable,
      )
      if (safetyCheck) {`,
    'target97 recursive auto-mode safety check',
  )

  const directSafetyCheck =
    "    toolPermissionResult.decisionReason?.type === 'safetyCheck'"
  if (source.split(directSafetyCheck).length - 1 !== 2) {
    throw new Error('expected two target97 direct safety-check guards')
  }
  source = source
    .split(directSafetyCheck)
    .join('    findSafetyCheck(toolPermissionResult.decisionReason)')

  const innerMarker = 'async function hasPermissionsToUseToolInner('
  const helper = `type SafetyCheckDecisionReason = Extract<
  PermissionDecisionReason,
  { type: 'safetyCheck' }
>

export function findSafetyCheck(
  reason: PermissionDecisionReason | undefined,
  predicate: (reason: SafetyCheckDecisionReason) => boolean = () => true,
): SafetyCheckDecisionReason | undefined {
  if (!reason) return undefined
  if (reason.type === 'safetyCheck') {
    return predicate(reason) ? reason : undefined
  }
  if (reason.type === 'subcommandResults') {
    for (const result of reason.reasons.values()) {
      const safetyCheck = findSafetyCheck(result.decisionReason, predicate)
      if (safetyCheck) return safetyCheck
    }
  }
  return undefined
}

`
  source = replaceOnce(
    source,
    innerMarker,
    `${helper}${innerMarker}`,
    'target97 recursive safety-check helper',
  )
  fs.writeFileSync(filename, source)
}

function buildUnifiedInstalledAuthShortcut97(temp) {
  const relative = 'src/commands/plugin/UnifiedInstalledCell.tsx'
  const filename = path.join(temp, relative)
  const compiled = fs.readFileSync(filename, 'utf8')
  const encoded =
    /sourceMappingURL=data:application\/json[^,]*,([^\n]+)/.exec(compiled)?.[1]
  if (!encoded) throw new Error('missing target97 UnifiedInstalledCell source map')
  const sourceMap = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
  let source = sourceMap.sourcesContent?.[0]
  if (typeof source !== 'string') {
    throw new Error('missing target97 UnifiedInstalledCell authored source')
  }
  source = replaceOnce(
    source,
    "import { Box, color, Text, useTheme } from '../../ink.js'\n",
    "import { Box, color, Text, useTheme } from '../../ink.js'\nimport { ConfigurableShortcutHint } from '../../components/ConfigurableShortcutHint.js'\n",
    'target97 UnifiedInstalledCell shortcut import',
  )
  source = replaceOnce(
    source,
    `  // MCP server
  let statusIcon: string
  let statusText: string`,
    `  // MCP server
  let statusIcon: string
  let statusText: React.ReactNode`,
    'target97 UnifiedInstalledCell status node type',
  )
  source = replaceOnce(
    source,
    "    statusText = 'Enter to auth'",
    `    statusText = (
      <ConfigurableShortcutHint
        action="select:accept"
        context="Select"
        fallback="Enter"
        description="auth"
      />
    )`,
    'target97 UnifiedInstalledCell auth shortcut',
  )
  fs.writeFileSync(filename, source)
}

function buildDynamicImageLimits98(temp) {
  const exactRoot = '/tmp/middle98-image-limits.PXCiAF'
  for (const relative of [
    'src/utils/imageLimits.ts',
    'src/utils/model/antModels.ts',
    'src/utils/imageResizer.ts',
    'src/utils/imageValidation.ts',
    'src/utils/messages.ts',
    'src/utils/imagePaste.ts',
    'src/hooks/usePasteHandler.ts',
    'src/components/CustomSelect/select-input-option.tsx',
    'src/tools/BashTool/utils.ts',
    'src/tools/BashTool/BashTool.tsx',
    'src/tools/PowerShellTool/PowerShellTool.tsx',
    'src/tools/FileReadTool/FileReadTool.ts',
    'src/utils/attachments.ts',
    'src/screens/REPL.tsx',
    'src/query.ts',
    'src/services/api/claude.ts',
    'src/utils/processUserInput/processUserInput.ts',
    'src/components/permissions/AskUserQuestionPermissionRequest/AskUserQuestionPermissionRequest.tsx',
    'src/components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx',
    'src/components/PromptInput/PromptInput.tsx',
    'src/services/mcp/client.ts',
  ]) {
    const source = path.join(exactRoot, relative)
    if (!fs.existsSync(source)) {
      throw new Error(`missing exact target98 dynamic-image owner ${source}`)
    }
    const destination = path.join(temp, relative)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
    normalizeTerminalNewline(temp, relative)
  }
}

function build97() {
  const caseName = '2.1.96-to-2.1.97'
  const temp = materialize('45514e405eb6824b3a9c2f7819677f53038cde1e', caseName)
  try {
    const bundle = fs.readFileSync(
      '/tmp/claude-middle-audit.DB5eTC/2.1.97/package/cli.js',
      'utf8',
    )
    const ast = parse(bundle, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      allowHashBang: true,
    })
    let guide
    const targetStringValues = []
    for (const statement of ast.body) {
      if (statement.type !== 'VariableDeclaration') continue
      for (const declaration of statement.declarations) {
        const initializer = declaration.init
        const value =
          initializer?.type === 'Literal' &&
          typeof initializer.value === 'string'
            ? initializer.value
            : initializer?.type === 'TemplateLiteral' &&
                initializer.expressions.length === 0
              ? initializer.quasis[0]?.value.cooked
              : undefined
        if (typeof value === 'string') targetStringValues.push(value)
        if (value?.startsWith('## Reference Documentation')) guide = value
      }
    }
    if (guide === undefined) throw new Error('missing target97 claude-api guide')
    const registration =
      /name:"claude-api",description:("(?:\\.|[^"\\])*"),allowedTools:/.exec(
        bundle,
      )
    if (!registration) throw new Error('missing target97 claude-api registration')
    const description = JSON.parse(registration[1])

    const filename = path.join(temp, 'src/skills/bundled/claudeApi.ts')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceBlock(
      source,
      'const INLINE_READING_GUIDE =',
      'function buildPrompt(',
      `const INLINE_READING_GUIDE = ${JSON.stringify(guide)}\n\n`,
    )
    const descriptionStart = source.indexOf('    description:')
    const allowedToolsStart = source.indexOf(
      '    allowedTools:',
      descriptionStart,
    )
    if (descriptionStart < 0 || allowedToolsStart < 0) {
      throw new Error('missing claude-api description block')
    }
    source =
      source.slice(0, descriptionStart) +
      `    description: ${JSON.stringify(description)},\n` +
      source.slice(allowedToolsStart)
    fs.writeFileSync(filename, source)

    const edit = (relative, transform) => {
      const target = path.join(temp, relative)
      fs.writeFileSync(target, transform(fs.readFileSync(target, 'utf8')))
    }

    const exactTargetString = (prefix, label) => {
      const matches = targetStringValues.filter(value => value.startsWith(prefix))
      if (matches.length !== 1) {
        throw new Error(`expected one target97 ${label}, found ${matches.length}`)
      }
      return matches[0]
    }
    const verifySkillPath = path.join(
      temp,
      'src/skills/bundled/verify/SKILL.md',
    )
    fs.mkdirSync(path.dirname(verifySkillPath), { recursive: true })
    fs.writeFileSync(
      verifySkillPath,
      exactTargetString('---\nname: verify\n', 'legacy verify skill'),
    )
    for (const relative of [
      'src/skills/bundled/verify/examples/cli.md',
      'src/skills/bundled/verify/examples/server.md',
    ]) {
      copyFile(temp, relative)
    }
    const managedAgentDocuments = [
      [
        'src/skills/bundled/claude-api/curl/managed-agents.md',
        '# Managed Agents — cURL / Raw HTTP',
      ],
      [
        'src/skills/bundled/claude-api/python/managed-agents/README.md',
        '# Managed Agents — Python',
      ],
      [
        'src/skills/bundled/claude-api/SKILL.md',
        '# Building LLM-Powered Applications with Claude',
      ],
      [
        'src/skills/bundled/claude-api/shared/live-sources.md',
        '# Live Documentation Sources',
      ],
      [
        'src/skills/bundled/claude-api/shared/managed-agents-api-reference.md',
        '# Managed Agents — Endpoint Reference',
      ],
      [
        'src/skills/bundled/claude-api/shared/managed-agents-client-patterns.md',
        '# Managed Agents — Common Client Patterns',
      ],
      [
        'src/skills/bundled/claude-api/shared/managed-agents-core.md',
        '# Managed Agents — Core Concepts',
      ],
      [
        'src/skills/bundled/claude-api/shared/managed-agents-environments.md',
        '# Managed Agents — Environments & Resources',
      ],
      [
        'src/skills/bundled/claude-api/shared/managed-agents-events.md',
        '# Managed Agents — Events & Steering',
      ],
      [
        'src/skills/bundled/claude-api/shared/managed-agents-onboarding.md',
        '# Managed Agents — Onboarding Flow',
      ],
      [
        'src/skills/bundled/claude-api/shared/managed-agents-overview.md',
        '# Managed Agents — Overview',
      ],
      [
        'src/skills/bundled/claude-api/shared/managed-agents-tools.md',
        '# Managed Agents — Tools & Skills',
      ],
      [
        'src/skills/bundled/claude-api/typescript/managed-agents/README.md',
        '# Managed Agents — TypeScript',
      ],
    ]
    for (const [relative, prefix] of managedAgentDocuments) {
      const destination = path.join(temp, relative)
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.writeFileSync(destination, exactTargetString(prefix, relative))
    }
    edit('src/skills/bundled/claudeApiContent.ts', text => {
      text = replaceOnce(
        text,
        "import curlExamples from './claude-api/curl/examples.md'",
        "import curlExamples from './claude-api/curl/examples.md'\nimport curlManagedAgents from './claude-api/curl/managed-agents.md'",
        'target97 curl managed-agent import',
      )
      text = replaceOnce(
        text,
        "import pythonClaudeApiToolUse from './claude-api/python/claude-api/tool-use.md'",
        "import pythonClaudeApiToolUse from './claude-api/python/claude-api/tool-use.md'\nimport pythonManagedAgents from './claude-api/python/managed-agents/README.md'",
        'target97 Python managed-agent import',
      )
      text = replaceOnce(
        text,
        "import sharedLiveSources from './claude-api/shared/live-sources.md'",
        `import sharedLiveSources from './claude-api/shared/live-sources.md'
import sharedManagedAgentsApiReference from './claude-api/shared/managed-agents-api-reference.md'
import sharedManagedAgentsClientPatterns from './claude-api/shared/managed-agents-client-patterns.md'
import sharedManagedAgentsCore from './claude-api/shared/managed-agents-core.md'
import sharedManagedAgentsEnvironments from './claude-api/shared/managed-agents-environments.md'
import sharedManagedAgentsEvents from './claude-api/shared/managed-agents-events.md'
import sharedManagedAgentsOnboarding from './claude-api/shared/managed-agents-onboarding.md'
import sharedManagedAgentsOverview from './claude-api/shared/managed-agents-overview.md'
import sharedManagedAgentsTools from './claude-api/shared/managed-agents-tools.md'`,
        'target97 shared managed-agent imports',
      )
      text = replaceOnce(
        text,
        "import typescriptClaudeApiToolUse from './claude-api/typescript/claude-api/tool-use.md'",
        "import typescriptClaudeApiToolUse from './claude-api/typescript/claude-api/tool-use.md'\nimport typescriptManagedAgents from './claude-api/typescript/managed-agents/README.md'",
        'target97 TypeScript managed-agent import',
      )
      text = replaceOnce(
        text,
        "  'curl/examples.md': curlExamples,",
        "  'curl/examples.md': curlExamples,\n  'curl/managed-agents.md': curlManagedAgents,",
        'target97 curl managed-agent map',
      )
      text = replaceOnce(
        text,
        "  'python/claude-api/tool-use.md': pythonClaudeApiToolUse,",
        "  'python/claude-api/tool-use.md': pythonClaudeApiToolUse,\n  'python/managed-agents/README.md': pythonManagedAgents,",
        'target97 Python managed-agent map',
      )
      text = replaceOnce(
        text,
        "  'shared/live-sources.md': sharedLiveSources,",
        `  'shared/live-sources.md': sharedLiveSources,
  'shared/managed-agents-api-reference.md': sharedManagedAgentsApiReference,
  'shared/managed-agents-client-patterns.md': sharedManagedAgentsClientPatterns,
  'shared/managed-agents-core.md': sharedManagedAgentsCore,
  'shared/managed-agents-environments.md': sharedManagedAgentsEnvironments,
  'shared/managed-agents-events.md': sharedManagedAgentsEvents,
  'shared/managed-agents-onboarding.md': sharedManagedAgentsOnboarding,
  'shared/managed-agents-overview.md': sharedManagedAgentsOverview,
  'shared/managed-agents-tools.md': sharedManagedAgentsTools,`,
        'target97 shared managed-agent map',
      )
      return replaceOnce(
        text,
        "  'typescript/claude-api/tool-use.md': typescriptClaudeApiToolUse,",
        "  'typescript/claude-api/tool-use.md': typescriptClaudeApiToolUse,\n  'typescript/managed-agents/README.md': typescriptManagedAgents,",
        'target97 TypeScript managed-agent map',
      )
    })

    edit('src/utils/envUtils.ts', text =>
      replaceOnce(
        text,
        "  ['claude-3-7-sonnet', 'VERTEX_REGION_CLAUDE_3_7_SONNET'],\n  ['claude-opus-4-1', 'VERTEX_REGION_CLAUDE_4_1_OPUS'],",
        "  ['claude-3-7-sonnet', 'VERTEX_REGION_CLAUDE_3_7_SONNET'],\n  ['claude-opus-4-6', 'VERTEX_REGION_CLAUDE_4_6_OPUS'],\n  ['claude-opus-4-1', 'VERTEX_REGION_CLAUDE_4_1_OPUS'],",
        'target97 Opus 4.6 Vertex region override',
      ),
    )
    edit('src/utils/model/modelSupportOverrides.ts', text =>
      replaceOnce(
        text,
        "  {\n    modelEnvVar: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',\n    capabilitiesEnvVar: 'ANTHROPIC_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES',\n  },\n] as const",
        "  {\n    modelEnvVar: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',\n    capabilitiesEnvVar: 'ANTHROPIC_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES',\n  },\n  {\n    modelEnvVar: 'ANTHROPIC_CUSTOM_MODEL_OPTION',\n    capabilitiesEnvVar: 'ANTHROPIC_CUSTOM_MODEL_OPTION_SUPPORTED_CAPABILITIES',\n  },\n] as const",
        'target97 custom-model capability override',
      ),
    )
    edit('src/utils/managedEnvConstants.ts', text => {
      text = replaceOnce(
        text,
        "  'ANTHROPIC_CUSTOM_MODEL_OPTION_NAME',\n  'ANTHROPIC_DEFAULT_HAIKU_MODEL',",
        "  'ANTHROPIC_CUSTOM_MODEL_OPTION_NAME',\n  'ANTHROPIC_CUSTOM_MODEL_OPTION_SUPPORTED_CAPABILITIES',\n  'ANTHROPIC_DEFAULT_HAIKU_MODEL',",
        'target97 custom-model capability safe env',
      )
      return replaceOnce(
        text,
        "  'VERTEX_REGION_CLAUDE_4_1_OPUS',\n  'VERTEX_REGION_CLAUDE_4_5_SONNET',",
        "  'VERTEX_REGION_CLAUDE_4_1_OPUS',\n  'VERTEX_REGION_CLAUDE_4_6_OPUS',\n  'VERTEX_REGION_CLAUDE_4_5_SONNET',",
        'target97 Opus 4.6 Vertex safe env',
      )
    })
    edit('src/utils/authPortable.ts', text =>
      replaceOnce(
        text,
        "      throw new Error('Failed to delete keychain entry')",
        "      throw new Error(\n        result.stderr\n          ? `Failed to delete keychain entry: ${result.stderr}`\n          : 'Failed to delete keychain entry',\n      )",
        'target97 keychain stderr',
      ),
    )
    edit('src/utils/markdownConfigLoader.ts', text =>
      replaceOnce(
        text,
        "  'skills',\n  'workflows',\n  ...(feature('TEMPLATES')",
        "  'skills',\n  'workflows',\n  'routines',\n  ...(feature('TEMPLATES')",
        'target97 routines config directory',
      ),
    )
    edit('src/utils/config.ts', text => {
      text = replaceOnce(
        text,
        '  autoCompactEnabled: boolean // Controls whether auto-compact is enabled\n',
        '  autoCompactEnabled: boolean // Controls whether auto-compact is enabled\n  briefTranscript?: boolean // Persist the compact focus transcript view\n',
        'target97 brief transcript config type',
      )
      text = replaceOnce(
        text,
        '    autoCompactEnabled: true,\n',
        '    autoCompactEnabled: true,\n    briefTranscript: false,\n',
        'target97 brief transcript default',
      )
      return replaceOnce(
        text,
        "  'autoCompactEnabled',\n  'showTurnDuration',",
        "  'autoCompactEnabled',\n  'briefTranscript',\n  'showTurnDuration',",
        'target97 brief transcript persistence key',
      )
    })
    edit('src/utils/settings/types.ts', text =>
      replaceOnce(
        text,
        "'Default transcript view: chat (SendUserMessage checkpoints only) or transcript (full)'",
        "'Default transcript view mode on startup'",
        'target97 default transcript view description',
      ),
    )
    edit('src/utils/effort.ts', text => {
      text = replaceBlock(
        text,
        "// @[MODEL LAUNCH]: Add the new model to the allowlist if it supports 'max' effort.",
        'export function isEffortLevel',
        `// @[MODEL LAUNCH]: Add the new model to the allowlist if it supports 'max' effort.\nexport function modelSupportsMaxEffort(model: string): boolean {\n  const supported3P = get3PModelCapabilityOverride(model, 'max_effort')\n  if (supported3P !== undefined) {\n    return supported3P\n  }\n  const lower = model.toLowerCase()\n  if (\n    lower.includes('haiku') ||\n    lower.includes('sonnet') ||\n    lower.includes('opus')\n  ) {\n    const version = parseModelFamilyVersion(model)\n    if (!version || version.family === 'haiku') return false\n    return version.major > 4 || (version.major === 4 && version.minor >= 6)\n  }\n  return isFirstPartyCompatibleAPIProvider(getAPIProviderForModel(model))\n}\n\nfunction parseModelFamilyVersion(model: string):\n  | { family: string; major: number; minor: number }\n  | undefined {\n  const match = model\n    .toLowerCase()\n    .match(/(opus|sonnet|haiku)-(\\d+)-(\\d+)/)\n  if (!match) return undefined\n  return {\n    family: match[1]!,\n    major: Number(match[2]),\n    minor: Number(match[3]),\n  }\n}\n\n`,
      )
      text = replaceOnce(
        text,
        'export function parseEffortValue(value: unknown): EffortValue | undefined {',
        `export function clampEffortValue(\n  value: EffortValue | undefined,\n  maximum: EffortLevel,\n): EffortValue | undefined {\n  if (!getFeatureValue_CACHED_MAY_BE_STALE('tengu_pyrite_wren', false)) {\n    return value\n  }\n  if (value === undefined) return undefined\n  const normalized = convertEffortValueToLevel(value)\n  return EFFORT_LEVELS.indexOf(normalized) > EFFORT_LEVELS.indexOf(maximum)\n    ? maximum\n    : value\n}\n\nexport function parseEffortValue(value: unknown): EffortValue | undefined {`,
        'target97 effort clamp helper',
      )
      return replaceOnce(
        text,
        "      return 'Maximum capability with deepest reasoning (Opus 4.6 only)'",
        "      return 'Maximum capability with deepest reasoning'",
        'target97 max effort description',
      )
    })
    edit('src/utils/model/model.ts', text =>
      replaceOnce(
        text,
        `  const match = name.match(/(claude-(\\d+-\\d+-)?\\w+)/)\n  if (match && match[1]) {\n    return match[1]\n  }\n  // Fall back to the original name if no pattern matches\n  return name`,
        `  return name.replace(/-\\d{8}$/, '')`,
        'target97 canonical model date suffix',
      ),
    )
    edit('src/utils/model/agent.ts', text => {
      text = replaceOnce(
        text,
        "import type { PermissionMode } from '../permissions/PermissionMode.js'",
        "import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'\nimport type { PermissionMode } from '../permissions/PermissionMode.js'",
        'target97 agent model feature import',
      )
      text = replaceOnce(
        text,
        `  toolSpecifiedModel?: ModelAlias,
  permissionMode?: PermissionMode,
): string {`,
        `  toolSpecifiedModel?: ModelAlias,
  permissionMode?: PermissionMode,
  useExactTools?: boolean,
): string {`,
        'target97 exact-tools agent model parameter',
      )
      return replaceOnce(
        text,
        `    return getRuntimeMainLoopModel({
      permissionMode: permissionMode ?? 'default',
      mainLoopModel: parentModel,
      exceeds200kTokens: false,
    })`,
        `    const runtimeModel = getRuntimeMainLoopModel({
      permissionMode: permissionMode ?? 'default',
      mainLoopModel: parentModel,
      exceeds200kTokens: false,
    })
    if (
      !useExactTools &&
      getCanonicalName(runtimeModel).includes('opus') &&
      getFeatureValue_CACHED_MAY_BE_STALE('tengu_garnet_loom', false)
    ) {
      const sonnetModel = parseUserSpecifiedModel('sonnet')
      return applyParentRegionPrefix(sonnetModel, 'sonnet')
    }
    return runtimeModel`,
        'target97 inherited Opus subagent Sonnet gate',
      )
    })
    edit('src/tools/AgentTool/runAgent.ts', text => {
      text = replaceOnce(
        text,
        "import { getAgentModel } from '../../utils/model/agent.js'",
        "import { clampEffortValue } from '../../utils/effort.js'\nimport { getAgentModel } from '../../utils/model/agent.js'",
        'target97 runAgent effort helper import',
      )
      text = replaceOnce(
        text,
        "import { type AgentDefinition, isBuiltInAgent } from './loadAgentsDir.js'",
        `import { type AgentDefinition, isBuiltInAgent } from './loadAgentsDir.js'

const TASK_MANAGEMENT_TOOL_NAMES = new Set([
  'TodoWrite',
  'TaskCreate',
  'TaskUpdate',
  'TaskGet',
  'TaskList',
])

function shouldFilterTaskManagementTools(isTeammate: boolean): boolean {
  if (isTeammate) return false
  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_shale_finch', false)
}`,
        'target97 task-management prompt filter',
      )
      text = replaceOnce(
        text,
        `  transcriptSubdir,
  onQueryProgress,
}: {`,
        `  transcriptSubdir,
  onQueryProgress,
  isTeammate = false,
}: {`,
        'target97 teammate runner argument',
      )
      text = replaceOnce(
        text,
        `  onQueryProgress?: () => void
}): AsyncGenerator<Message, void> {`,
        `  onQueryProgress?: () => void
  isTeammate?: boolean
}): AsyncGenerator<Message, void> {`,
        'target97 teammate runner argument type',
      )
      text = replaceOnce(
        text,
        `    model,
    permissionMode,
  )`,
        `    model,
    permissionMode,
    useExactTools ?? false,
  )`,
        'target97 exact-tools model call',
      )
      text = replaceOnce(
        text,
        `      agentDefinition.effort !== undefined\n        ? agentDefinition.effort\n        : state.effortValue`,
        `      agentDefinition.effort !== undefined\n        ? agentDefinition.effort\n        : useExactTools\n          ? state.effortValue\n          : clampEffortValue(state.effortValue, 'medium')`,
        'target97 subagent effort clamp call',
      )
      text = replaceOnce(
        text,
        `  const additionalWorkingDirectories = Array.from(`,
        `  const promptTools =
    !useExactTools && shouldFilterTaskManagementTools(isTeammate)
      ? resolvedTools.filter(
          tool => !TASK_MANAGEMENT_TOOL_NAMES.has(tool.name),
        )
      : resolvedTools

  const additionalWorkingDirectories = Array.from(`,
        'target97 filtered prompt tools',
      )
      text = replaceOnce(
        text,
        `          additionalWorkingDirectories,
          resolvedTools,
        ),`,
        `          additionalWorkingDirectories,
          promptTools,
        ),`,
        'target97 prompt uses filtered tools',
      )
      text = replaceOnce(
        text,
        '  const agentSystemPrompt = override?.systemPrompt',
        '  const baseAgentSystemPrompt = override?.systemPrompt',
        'target97 base agent system prompt',
      )
      const promptEnd = `      )\n\n  // Determine abortController:`
      return replaceOnce(
        text,
        promptEnd,
        `      )\n\n  const agentSystemPrompt =\n    !useExactTools &&\n    getFeatureValue_CACHED_MAY_BE_STALE('tengu_flint_heron', false)\n      ? asSystemPrompt([\n          ...baseAgentSystemPrompt,\n          'Do not emit text between tool calls. Inter-tool narration is never shown to the user — go straight to the next tool call. Output text only once, at the end, as your final report.',\n        ])\n      : baseAgentSystemPrompt\n\n  // Determine abortController:`,
        'target97 narration-suppressed agent prompt',
      )
    })
    edit('src/tools/AgentTool/AgentTool.tsx', text =>
      replaceOnce(
        text,
        '    const resolvedAgentModel = getAgentModel(selectedAgent.model, toolUseContext.options.mainLoopModel, isForkPath ? undefined : model, permissionMode);',
        '    const resolvedAgentModel = getAgentModel(selectedAgent.model, toolUseContext.options.mainLoopModel, isForkPath ? undefined : model, permissionMode, isForkPath);',
        'target97 AgentTool fork model call',
      ),
    )
    edit('src/tools/AgentTool/resumeAgent.ts', text =>
      replaceOnce(
        text,
        `    undefined,
    permissionMode,
  )`,
        `    undefined,
    permissionMode,
    isResumedFork,
  )`,
        'target97 resumed fork model call',
      ),
    )
    edit('src/utils/swarm/inProcessRunner.ts', text =>
      replaceOnce(
        text,
        `            allowedTools,
            contentReplacementState: teammateReplacementState,
          })) {`,
        `            allowedTools,
            contentReplacementState: teammateReplacementState,
            isTeammate: true,
          })) {`,
        'target97 teammate runAgent call',
      ),
    )
    edit('src/components/VirtualMessageList.tsx', text => {
      text = replaceOnce(
        text,
        "import { logForDebugging } from '../utils/debug.js';",
        "import { logForDebugging } from '../utils/debug.js';\nimport { logError } from '../utils/log.js';",
        'target97 duplicate-key logger import',
      )
      text = replaceOnce(
        text,
        '\nexport function VirtualMessageList({',
        `
function makeSiblingKeysUnique(keys: string[]): string[] {
  const uniqueKeys = keys.slice()
  const counts = new Map<string, number>()
  let hasDuplicates = false
  for (let index = 0; index < uniqueKeys.length; index++) {
    const key = uniqueKeys[index]!
    const count = counts.get(key)
    if (count === undefined) counts.set(key, 1)
    else {
      hasDuplicates = true
      counts.set(key, count + 1)
      uniqueKeys[index] = \`${'${key}'}#${'${count}'}\`
    }
  }
  if (hasDuplicates) {
    const duplicateCounts = [...counts]
      .filter(([, count]) => count > 1)
      .slice(0, 3)
    logError(
      new Error(
        \`VirtualMessageList: duplicate sibling keys (leaks DOM nodes via mapRemainingChildren overwrite): ${'${duplicateCounts'}
          .map(([key, count]) => \`${'${key}'} ×${'${count}'}\`)
          .join(', ')}\`,
      ),
    )
  }
  return uniqueKeys
}

export function VirtualMessageList({`,
        'target97 duplicate-key normalizer',
      )
      return replaceOnce(
        text,
        '  const keys = useMemo(() => messages.map(itemKey), [messages, itemKey]);',
        `  const keys = useMemo(
    () => makeSiblingKeysUnique(messages.map(itemKey)),
    [messages, itemKey],
  );`,
        'target97 duplicate-key normalizer call',
      )
    })
    edit('src/services/vcr.ts', text => {
      text = replaceOnce(
        text,
        "import type { BetaContentBlock } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'",
        "import type { BetaContentBlock } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'\nimport type { ImageBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'",
        'target97 VCR image type import',
      )
      text = replaceOnce(
        text,
        `        case 'tool_use':
          return {
            ..._,
            input: mapValuesDeep(_.input as Record<string, unknown>, f),
          }
        case 'image':
          return _
        default:`,
        `        case 'tool_use':
          return {
            ..._,
            input: mapValuesDeep(_.input as Record<string, unknown>, f),
          }
        case 'image':
          return dehydrateImage(_)
        default:`,
        'target97 VCR image dehydration call',
      )
      return replaceOnce(
        text,
        '\nfunction mapValuesDeep(',
        `
function dehydrateImage(image: ImageBlockParam): ImageBlockParam {
  if (image.source.type !== 'base64') return image
  return {
    ...image,
    source: {
      ...image.source,
      data: '[IMAGE_DATA]',
    },
  }
}

function mapValuesDeep(`,
        'target97 VCR image dehydration helper',
      )
    })
    edit('src/utils/deepLink/terminalLauncher.ts', text =>
      replaceOnce(
        text,
        `function appleScriptQuote(s: string): string {
  return \`"${'${s'}.replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"')}"\`
}`,
        `function appleScriptQuote(s: string): string {
  return \`"${'${s'}
    .replaceAll('\\\\', '\\\\\\\\')
    .replaceAll('"', '\\\\"')
    .replaceAll('\\n', '\\\\n')
    .replaceAll('\\t', '\\\\t')}"\`
}`,
        'target97 AppleScript newline and tab escaping',
      ),
    )
    edit('src/utils/deepLink/terminalLauncher.ts', text =>
      replaceOnce(
        text,
        `function cmdQuote(arg: string): string {
  const stripped = arg.replace(/"/g, '').replace(/%/g, '%%')
  const escaped = stripped.replace(/(\\\\+)$/, '$1$1')
  return \`"${'${escaped}'}"\`
}`,
        `function cmdQuote(arg: string): string {
  const stripped = arg
    .replace(/[\\n\\t]/g, ' ')
    .replaceAll('"', '')
    .replaceAll('%', '%%')
  const escaped = stripped.replace(/(\\\\+)$/, '$1$1')
  return \`"${'${escaped}'}"\`
}`,
        'target97 cmd.exe newline, quote, percent, and trailing-backslash escaping',
      ),
    )
    applyWorkingDiff(temp, [
      'src/utils/permissions/shellRuleMatching.ts',
      'src/tools/BashTool/pathValidation.ts',
      'src/utils/bash/commands.ts',
      'src/ink/termio/osc.ts',
    ])
    edit('src/tools/shared/gitOperationTracking.ts', text => {
      text = replaceOnce(
        text,
        `} from '../../services/analytics/index.js'
`,
        `} from '../../services/analytics/index.js'
import { execFileNoThrow } from '../../utils/execFileNoThrow.js'
import { safeParseJSON } from '../../utils/json.js'
`,
        'target97 PR-link imports',
      )
      text = replaceOnce(
        text,
        `const GIT_REBASE_RE = gitCmdRe('rebase')
`,
        `const GIT_REBASE_RE = gitCmdRe('rebase')
const GH_PR_CHECKOUT_RE =
  /\\bgh\\s+pr\\s+checkout\\b[^&|;]*\\s(\\d+)(?=\\s|$|[&|;])/
`,
        'target97 PR checkout matcher',
      )
      text = replaceOnce(
        text,
        `function findPrInStdout(stdout: string): ReturnType<typeof parsePrUrl> {
  const m = stdout.match(/https:\\/\\/github\\.com\\/[^/\\s]+\\/[^/\\s]+\\/pull\\/\\d+/)
  return m ? parsePrUrl(m[0]) : null
}
`,
        `function findPrInStdout(stdout: string): ReturnType<typeof parsePrUrl> {
  const m = stdout.match(/https:\\/\\/github\\.com\\/[^/\\s]+\\/[^/\\s]+\\/pull\\/\\d+/)
  return m ? parsePrUrl(m[0]) : null
}

async function linkPrInfoToCurrentSession(
  prInfo: NonNullable<ReturnType<typeof parsePrUrl>>,
): Promise<void> {
  const [{ linkSessionToPR }, { getSessionId }] = await Promise.all([
    import('../../utils/sessionStorage.js'),
    import('../../bootstrap/state.js'),
  ])
  const sessionId = getSessionId()
  if (!sessionId) return
  await linkSessionToPR(
    sessionId as \`${'${string}-${string}-${string}-${string}-${string}'}\`,
    prInfo.prNumber,
    prInfo.prUrl,
    prInfo.prRepository,
  )
}

async function linkCurrentSessionToPr(prNumber?: string): Promise<void> {
  const args = ['pr', 'view', ...(prNumber ? [prNumber] : []), '--json', 'url']
  const { code, stdout } = await execFileNoThrow('gh', args, {
    timeout: 5000,
    preserveOutputOnError: false,
    useCwd: true,
  })
  if (code !== 0) return
  const parsed = safeParseJSON(stdout) as { url?: unknown } | null
  if (typeof parsed?.url !== 'string') return
  const prInfo = parsePrUrl(parsed.url)
  if (prInfo) await linkPrInfoToCurrentSession(prInfo)
}
`,
        'target97 PR link helpers',
      )
      return replaceOnce(
        text,
        `  if (command.match(/\\bglab\\s+mr\\s+create\\b/)) {
`,
        `  const checkoutMatch = command.match(GH_PR_CHECKOUT_RE)
  if (checkoutMatch?.[1]) {
    void linkCurrentSessionToPr(checkoutMatch[1]).catch(() => {})
  } else if (GIT_PUSH_RE.test(command) && !prHit) {
    void linkCurrentSessionToPr().catch(() => {})
  }
  if (command.match(/\\bglab\\s+mr\\s+create\\b/)) {
`,
        'target97 PR checkout/push linking',
      )
    })
    edit('src/tools/BashTool/readOnlyValidation.ts', text =>
      replaceOnce(
        text,
        `  if (!result.success) {
    return {
      behavior: 'passthrough',
      message: 'Command cannot be parsed, requires further permission checks',
    }
  }

  // Check the original command for safety before splitting`,
        `  if (!result.success) {
    return {
      behavior: 'passthrough',
      message: 'Command cannot be parsed, requires further permission checks',
    }
  }

  // /dev/tcp and /dev/udp are shell-provided network sockets, not ordinary
  // paths. Input and output redirects to either device are never read-only.
  if (
    result.tokens.some((part, index) => {
      if (
        typeof part !== 'object' ||
        part === null ||
        !('op' in part) ||
        !['>', '>>', '>&', '<'].includes(part.op)
      ) {
        return false
      }
      const target = result.tokens[index + 1]
      return (
        typeof target === 'string' && /^\\/dev\\/(tcp|udp)\\//.test(target)
      )
    })
  ) {
    return {
      behavior: 'passthrough',
      message: 'Command redirects through a network device',
    }
  }

  // Check the original command for safety before splitting`,
        'target97 read-only network redirect guard',
      ),
    )
    buildDream97(temp)
    const transcriptMirrorTree = '/tmp/middle97-semantic-current'
    for (const relative of [
      'src/entrypoints/sdk/coreSchemas.ts',
      'src/entrypoints/sdk/controlSchemas.ts',
      'src/utils/sessionStorage.ts',
      'src/server/directConnectManager.ts',
      'src/cli/remoteIO.ts',
      'src/cli/print.ts',
      'src/main.tsx',
    ]) {
      const recovered = path.join(transcriptMirrorTree, relative)
      if (!fs.existsSync(recovered)) {
        throw new Error(`missing target97 transcript-mirror owner ${recovered}`)
      }
      fs.copyFileSync(recovered, path.join(temp, relative))
    }
    // Exact target97 soft-delete convergence and Bash assignment/sandbox
    // behavior recovered from authenticated target units by the focused
    // team-memory/Bash audit.
    for (const relative of [
      'src/services/teamMemorySync/types.ts',
      'src/services/teamMemorySync/index.ts',
      'src/services/teamMemorySync/watcher.ts',
      'src/tools/BashTool/bashPermissions.ts',
      'src/utils/attachments.ts',
      'src/utils/suggestions/commandSuggestions.ts',
      'src/hooks/useTypeahead.tsx',
      'src/entrypoints/sandboxTypes.ts',
      'src/memdir/tinyMemoryStamps.ts',
      'src/memdir/paths.ts',
      'src/utils/backgroundHousekeeping.ts',
      'src/tools/FileReadTool/FileReadTool.ts',
      'src/tools/FileWriteTool/FileWriteTool.ts',
      'src/tools/FileEditTool/FileEditTool.ts',
      'src/memdir/memoryTypes.ts',
      'src/memdir/memdir.ts',
      'src/memdir/teamMemPrompts.ts',
      'src/services/autoDream/autoDream.ts',
      'src/services/claudeAiLimits.ts',
      'src/components/messages/RateLimitMessage.tsx',
      'src/commands/rate-limit-options/rate-limit-options.tsx',
      'src/components/Messages.tsx',
      'src/components/Message.tsx',
      'src/components/MessageRow.tsx',
      'src/components/messages/AssistantTextMessage.tsx',
      'src/screens/REPL.tsx',
      'src/utils/plugins/marketplaceManager.ts',
      'src/services/plugins/pluginOperations.ts',
      'src/services/compact/compact.ts',
      'src/commands/compact/compact.ts',
      'src/commands/branch/branch.ts',
      'src/services/tips/tipRegistry.ts',
      'src/hooks/useInboxPoller.ts',
      'src/utils/permissions/PermissionMode.ts',
      'src/utils/messages.ts',
      'src/utils/api.ts',
      'src/utils/ghPrStatus.ts',
      'src/utils/permissions/filesystem.ts',
      'src/utils/permissions/permissions.ts',
      'src/utils/hooks/execPromptHook.ts',
      'src/tools/BashTool/readOnlyValidation.ts',
      'src/utils/hooks.ts',
      'src/utils/worktree.ts',
      'src/components/PromptInput/Notifications.tsx',
      'src/utils/fpsTracker.ts',
      'src/tools/AgentTool/prompt.ts',
      'src/components/permissions/BashPermissionRequest/BashPermissionRequest.tsx',
      'src/components/permissions/PowerShellPermissionRequest/PowerShellPermissionRequest.tsx',
      'src/components/LogSelector.tsx',
      'src/screens/ResumeConversation.tsx',
      'src/hooks/useReplBridge.tsx',
      'src/commands.ts',
      'src/utils/processUserInput/processUserInput.ts',
      'src/components/messages/CollapsedReadSearchContent.tsx',
      'src/components/PromptInput/PromptInputFooter.tsx',
      'src/constants/prompts.ts',
      'src/utils/queryContext.ts',
      'src/utils/analyzeContext.ts',
      'src/QueryEngine.ts',
      'src/Tool.ts',
      'src/commands/context/context-noninteractive.ts',
      'src/context.ts',
      'src/state/AppStateStore.ts',
      'src/commands/clear/conversation.ts',
    ]) {
      const recovered = path.join(transcriptMirrorTree, relative)
      if (!fs.existsSync(recovered)) {
        throw new Error(`missing target97 team-memory/Bash owner ${recovered}`)
      }
      fs.copyFileSync(recovered, path.join(temp, relative))
    }
    buildCompactTruncation97(temp)
    buildColdAutoCompact97(temp)
    buildCronScheduler97(temp)
    buildMarkdownBlockquote97(temp)
    buildRecursiveSafetyCheck97(temp)
    buildUnifiedInstalledAuthShortcut97(temp)
    buildAdditionalModelCosts97(temp)
    buildSandboxMachLookup97(temp)
    buildAutoDreamFirstEnable97(temp)
    buildReplBridgeConfigAliases97(temp)
    buildNotificationLifecycle97(temp)
    buildAutoModeDenialsProvider97(temp)
    buildLoopChainStartedAt97(temp)
    buildAgentReplToolPool97(temp)
    buildSettingsViewMode97(temp)
    buildImageTokenCompression97(temp)
    buildMcpResultSizeAnnotation97(temp)
    buildSessionWriterCoordination97(temp)
    buildBridgeGitSessionContext97(temp)
    writePatch(temp, caseName)
    const materializedRoot = process.env.CLAUDE_CODE_MIDDLE_97_MATERIALIZED_ROOT
    if (materializedRoot) {
      fs.cpSync(temp, materializedRoot, { recursive: true })
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
}

function applyPrompt100(temp) {
  const filename = path.join(temp, 'src/constants/prompts.ts')
  let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      "End-of-turn summaries: state what changed and what's next. That's it — no recapping the journey, no restating the problem, no listing everything you considered.",
      "End-of-turn summary: one or two sentences. What changed and what's next. Nothing else.",
      '2.1.100 end summary',
    )
    source = replaceOnce(
      source,
      `When the user asks an open-ended or exploratory question ("what could we do about X?", "how should we approach this?", "what do you think?"), respond with analysis, options, and tradeoffs — do not jump straight to implementation. Let the user choose a direction before you start writing code. Even when you have a strong opinion, present it as a recommendation the user can accept or redirect, not as a fait accompli. Only start implementing after the user signals agreement, explicitly or by asking you to proceed.`,
      `For exploratory questions ("what could we do about X?", "how should we approach this?", "what do you think?"), respond in 2-3 sentences with a recommendation and the main tradeoff. Present it as something the user can redirect, not a decided plan. Don't implement until the user agrees.`,
      '2.1.100 exploratory guidance',
    )
    const numericBlock = block(
      source,
      '    // Numeric length anchors — research shows',
      "    ...(feature('TOKEN_BUDGET')",
    )
    source = replaceOnce(
      source,
      numericBlock,
      numericBlock.replace(
        "    ...(process.env.USER_TYPE === 'ant'",
        '    ...(isCommunicationStyleEnabled(model)',
      ),
      '2.1.100 numeric gate',
    )
  fs.writeFileSync(filename, source)
}

function buildSpinner100(temp) {
  const filename = path.join(temp, 'src/components/Spinner/SpinnerAnimationRow.tsx')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    "import { Byline } from '../design-system/Byline.js';\n",
    "import { Byline } from '../design-system/Byline.js';\nimport { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js';\n",
    'target100 keybinding hint import',
  )
  source = replaceOnce(
    source,
    'const SHOW_TOKENS_AFTER_MS = 30_000;',
    'const SHOW_TOKENS_AFTER_MS = 16_000;',
    'target100 token timer threshold',
  )
  source = replaceOnce(
    source,
    'useStalledAnimation(time, currentResponseLength, hasActiveTools || leaderIsIdle, reducedMotion)',
    "useStalledAnimation(time, currentResponseLength, hasActiveTools || leaderIsIdle || mode === 'thinking', reducedMotion)",
    'target100 thinking stall bypass',
  )
  source = replaceOnce(
    source,
    '<Text dimColor>(esc to interrupt </Text>',
    '<Text dimColor>(<KeyboardShortcutHint chord="escape" action="interrupt" format={{ keyCase: \'lower\' }} />{\' \'}</Text>',
    'target100 foreground teammate interrupt hint',
  )
  fs.writeFileSync(filename, source)
}

function applyPrompt101(temp) {
  const promptFilename = path.join(temp, 'src/constants/prompts.ts')
  let prompt = fs.readFileSync(promptFilename, 'utf8')
  prompt = replaceOnce(
    prompt,
    '    // @[MODEL LAUNCH]: Update comment writing for Capybara',
    `    \`For UI or frontend changes, start the dev server and use the feature in a browser before reporting the task as complete. Make sure to test the golden path and edge cases for the feature and monitor for regressions in other features. Type checking and test suites verify code correctness, not feature correctness - if you can't test the UI, say so explicitly rather than claiming success.\`,\n    // @[MODEL LAUNCH]: Update comment writing for Capybara`,
    '2.1.101 UI verification guidance',
  )
  fs.writeFileSync(promptFilename, prompt)
}

function buildLoopDefaults101(temp) {
  for (const relative of [
    'src/skills/bundled/loop.ts',
    'src/utils/loopSentinels.ts',
    'src/utils/loopWakeup.ts',
    'src/tools/ScheduleWakeupTool/prompt.ts',
    'src/tools/ScheduleWakeupTool/ScheduleWakeupTool.ts',
  ]) copyFile(temp, relative)

  applyWorkingDiff(temp, [
    'src/utils/cronTasks.ts',
    'src/utils/cronJitterConfig.ts',
  ])
  applySelectedWorkingDiff(
    temp,
    'src/tools.ts',
    hunk => hunk.includes('ScheduleWakeupTool'),
  )

  {
    const filename = path.join(temp, 'src/skills/bundled/loop.ts')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      "    aliases: ['proactive'],\n",
      '',
      'target101 loop predates proactive alias',
    )
    fs.writeFileSync(filename, source)
  }

  {
    const filename = path.join(temp, 'src/utils/loopSentinels.ts')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      "import { getGlobalConfig } from './config.js'\n",
      '',
      'target101 loop predates push config',
    )
    source = replaceBlock(
      source,
      'export function isLoopPushNotificationEnabled()',
      'function pushNotificationGuidance()',
      `export function isLoopPushNotificationEnabled(): boolean {\n  return false\n}\n\n`,
    )
    fs.writeFileSync(filename, source)
  }

  {
    const filename = path.join(temp, 'src/utils/cronScheduler.ts')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      "import { logForDebugging } from './debug.js'\n",
      "import { logForDebugging } from './debug.js'\nimport { isLoopDefaultSentinel } from './loopSentinels.js'\n",
      'target101 cron loop-default import',
    )
    source = replaceOnce(
      source,
      `        taskId:\n          t.id as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,\n      })`,
      `        taskId:\n          t.id as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,\n        autonomousLoopDefault: isLoopDefaultSentinel(t.prompt),\n      })`,
      'target101 cron loop-default telemetry',
    )
    fs.writeFileSync(filename, source)
  }

  {
    const filename = path.join(temp, 'src/hooks/useScheduledTasks.ts')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      "import { createScheduledTaskFireMessage } from '../utils/messages.js'\n",
      "import { createScheduledTaskFireMessage } from '../utils/messages.js'\nimport { resolveLoopDefaultFire } from '../utils/loopSentinels.js'\n",
      'target101 scheduled loop-default import',
    )
    source = replaceOnce(
      source,
      `    const enqueueForLead = (prompt: string) =>\n      enqueuePendingNotification({\n        value: prompt,`,
      `    const enqueueForLead = (prompt: string) =>\n      enqueuePendingNotification({\n        value: resolveLoopDefaultFire(prompt),`,
      'target101 scheduled loop-default resolver',
    )
    fs.writeFileSync(filename, source)
  }

  {
    const filename = path.join(temp, 'src/cli/print.ts')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      `const cronSchedulerModule = feature('AGENT_TRIGGERS')\n  ? (require('../utils/cronScheduler.js') as typeof import('../utils/cronScheduler.js'))\n  : null\n`,
      `const cronSchedulerModule = feature('AGENT_TRIGGERS')\n  ? (require('../utils/cronScheduler.js') as typeof import('../utils/cronScheduler.js'))\n  : null\nconst loopDefaultsModule = feature('AGENT_TRIGGERS')\n  ? (require('../utils/loopSentinels.js') as typeof import('../utils/loopSentinels.js'))\n  : null\n`,
      'target101 print loop-default module',
    )
    source = replaceOnce(
      source,
      `      onFire: prompt => {\n        if (inputClosed) return\n        enqueue({\n          mode: 'prompt',\n          value: prompt,`,
      `      onFire: prompt => {\n        if (inputClosed) return\n        enqueue({\n          mode: 'prompt',\n          value: loopDefaultsModule?.resolveLoopDefaultFire(prompt) ?? prompt,`,
      'target101 print loop-default resolver',
    )
    fs.writeFileSync(filename, source)
  }

  {
    const filename = path.join(temp, 'src/services/compact/postCompactCleanup.ts')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      "import { clearClassifierApprovals } from '../../utils/classifierApprovals.js'\n",
      "import { clearClassifierApprovals } from '../../utils/classifierApprovals.js'\nimport { resetAutonomousLoopDelivered } from '../../utils/loopSentinels.js'\n",
      'target101 compact loop-default import',
    )
    source = replaceOnce(
      source,
      "    resetGetMemoryFilesCache('compact')\n",
      "    resetGetMemoryFilesCache('compact')\n    resetAutonomousLoopDelivered()\n",
      'target101 compact loop-default reset',
    )
    fs.writeFileSync(filename, source)
  }
}

function build100() {
  const caseName = '2.1.98-to-2.1.100'
  const temp = materialize('71adf7f36c3522c296770374910eb1834dfe5d59', caseName)
  try {
    buildPrompt98(temp)
    applyPrompt100(temp)
    buildSpinner100(temp)
    writePatch(temp, caseName)
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
}

function buildMcpDirectoryRegistry101(temp) {
  applyWorkingDiff(temp, ['src/services/mcp/officialRegistry.ts'])
  const filename = path.join(temp, 'src/services/mcp/officialRegistry.ts')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    `type OfficialRegistryState = {
  urls: Set<string> | undefined
}

function createOfficialRegistryState(): OfficialRegistryState {
  return { urls: undefined }
}

const officialRegistryState = createOfficialRegistryState()`,
    'let officialUrls: Set<string> | undefined',
    'target101 MCP directory registry state',
  )
  source = source.replaceAll('officialRegistryState.urls', 'officialUrls')
  fs.writeFileSync(filename, source)
}

function buildSdkOAuthControl101(temp) {
  {
    const filename = path.join(temp, 'src/bootstrap/state.ts')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      `  // SDK-provided betas (e.g., context-1m-2025-08-07)
  sdkBetas: string[] | undefined
`,
      `  // SDK-provided betas (e.g., context-1m-2025-08-07)
  sdkBetas: string[] | undefined
  sdkOAuthTokenRefreshCallback: (() => Promise<string | null>) | null
`,
      'target101 SDK OAuth callback state type',
    )
    source = replaceOnce(
      source,
      `    // SDK-provided betas
    sdkBetas: undefined,
`,
      `    // SDK-provided betas
    sdkBetas: undefined,
    sdkOAuthTokenRefreshCallback: null,
`,
      'target101 SDK OAuth callback initial state',
    )
    source = replaceOnce(
      source,
      `export function setSdkBetas(betas: string[] | undefined): void {
  STATE.sdkBetas = betas
}
`,
      `export function setSdkBetas(betas: string[] | undefined): void {
  STATE.sdkBetas = betas
}

export function getSdkOAuthTokenRefreshCallback(): (() => Promise<string | null>) | null {
  return STATE.sdkOAuthTokenRefreshCallback
}

export function setSdkOAuthTokenRefreshCallback(
  callback: (() => Promise<string | null>) | null,
): void {
  STATE.sdkOAuthTokenRefreshCallback = callback
}
`,
      'target101 SDK OAuth callback accessors',
    )
    fs.writeFileSync(filename, source)
  }

  {
    const filename = path.join(temp, 'src/utils/auth.ts')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      `import {
  getIsNonInteractiveSession,
  preferThirdPartyAuthentication,
} from '../bootstrap/state.js'
`,
      `import {
  getIsNonInteractiveSession,
  getSdkOAuthTokenRefreshCallback,
  preferThirdPartyAuthentication,
} from '../bootstrap/state.js'
`,
      'target101 SDK OAuth callback import',
    )
    source = replaceOnce(
      source,
      `const DEFAULT_API_KEY_HELPER_TTL = 5 * 60 * 1000
`,
      `const DEFAULT_API_KEY_HELPER_TTL = 5 * 60 * 1000

export const SDK_OAUTH_REFRESH_ENTRYPOINTS = new Set([
  'claude-desktop',
  'local-agent',
  'claude-vscode',
])
`,
      'target101 SDK OAuth entrypoint allowlist',
    )
    source = replaceOnce(
      source,
      `  if (!currentTokens?.refreshToken) {
    return false
  }
`,
      `  if (!currentTokens?.refreshToken) {
    const sdkRefreshCallback = getSdkOAuthTokenRefreshCallback()
    if (sdkRefreshCallback) {
      try {
        const refreshedAccessToken = await sdkRefreshCallback()
        if (refreshedAccessToken && refreshedAccessToken !== failedAccessToken) {
          process.env.CLAUDE_CODE_OAUTH_TOKEN = refreshedAccessToken
          clearOAuthTokenCache()
          logEvent('tengu_oauth_401_sdk_callback_refreshed', {})
          return true
        }
        logForDebugging(
          refreshedAccessToken === null
            ? 'SDK getOAuthToken callback returned null (no token available)'
            : 'SDK getOAuthToken callback returned the same expired token; treating as no refresh',
          { level: refreshedAccessToken === null ? 'debug' : 'error' },
        )
      } catch (error) {
        logForDebugging(
          \`SDK getOAuthToken callback failed: \${error instanceof Error ? error.message : String(error)}\`,
          { level: 'error' },
        )
      }
    }
    return false
  }
`,
      'target101 SDK OAuth 401 callback fallback',
    )
    fs.writeFileSync(filename, source)
  }

  {
    const filename = path.join(temp, 'src/entrypoints/sdk/controlSchemas.ts')
    let source = fs.readFileSync(filename, 'utf8')
    const schemas = `export const SDKControlUserDialogRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('request_user_dialog'),
      dialog_kind: z.string().describe(
        'Identifier for the dialog the host should render. Open string union — known kinds include "it2_setup" and "computer_use_approval"; new kinds may be added without bumping the protocol.',
      ),
      payload: z.record(z.string(), z.unknown()).describe(
        'Dialog-specific data passed to the host renderer. Shape is defined per dialog_kind; the protocol transports it opaquely.',
      ),
      tool_use_id: z.string().optional(),
    })
    .describe(
      'Requests the SDK consumer to render a tool-driven blocking dialog and return the user choice. Used by tools that previously rendered Ink JSX via setToolJSX with an onDone callback.',
    ),
)

export const SDKControlUserDialogResponseSchema = lazySchema(() =>
  z
    .object({
      behavior: z.enum(['completed', 'cancelled']),
      result: z.unknown().optional().describe(
        'Dialog-specific result payload. Opaque to the protocol; the caller and dialog renderer agree on the shape per dialog_kind.',
      ),
    })
    .describe('Response from the SDK consumer for a request_user_dialog request.'),
)

export const SDKControlOAuthTokenRefreshRequestSchema = lazySchema(() =>
  z.object({ subtype: z.literal('oauth_token_refresh') }).describe(
    '@internal Request from the CLI subprocess to the SDK host for a fresh OAuth access token after a 401 with no local refresh token.',
  ),
)

export const SDKControlOAuthTokenRefreshResponseSchema = lazySchema(() =>
  z.object({ accessToken: z.string().nullable() }).describe(
    '@internal Fresh OAuth access token returned by the SDK host getOAuthToken callback, or null when the host has no token available.',
  ),
)

`
    source = replaceOnce(
      source,
      '\n\n// ============================================================================\n// Control Request/Response Wrappers',
      `\n\n${schemas}// ============================================================================\n// Control Request/Response Wrappers`,
      'target101 SDK dialog and OAuth schemas',
    )
    source = replaceOnce(
      source,
      `    SDKControlGetSettingsRequestSchema(),
    SDKControlElicitationRequestSchema(),
`,
      `    SDKControlGetSettingsRequestSchema(),
    SDKControlElicitationRequestSchema(),
    SDKControlUserDialogRequestSchema(),
    SDKControlOAuthTokenRefreshRequestSchema(),
`,
      'target101 SDK dialog and OAuth request union',
    )
    fs.writeFileSync(filename, source)
  }

  {
    const filename = path.join(temp, 'src/cli/structuredIO.ts')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      `import { SDKControlElicitationResponseSchema } from 'src/entrypoints/sdk/controlSchemas.js'
`,
      `import {
  SDKControlElicitationResponseSchema,
  SDKControlOAuthTokenRefreshResponseSchema,
  SDKControlUserDialogResponseSchema,
} from 'src/entrypoints/sdk/controlSchemas.js'
`,
      'target101 SDK response-schema imports',
    )
    source = replaceOnce(
      source,
      `  /**
   * Creates a SandboxAskCallback that forwards sandbox network permission
`,
      `  async requestUserDialog(
    dialogKind: string,
    payload: Record<string, unknown>,
    options?: { toolUseId?: string; signal?: AbortSignal },
  ): Promise<{ behavior: 'completed' | 'cancelled'; result?: unknown }> {
    try {
      return await this.sendRequest<{
        behavior: 'completed' | 'cancelled'
        result?: unknown
      }>(
        {
          subtype: 'request_user_dialog',
          dialog_kind: dialogKind,
          payload,
          tool_use_id: options?.toolUseId,
        },
        SDKControlUserDialogResponseSchema(),
        options?.signal,
      )
    } catch {
      return { behavior: 'cancelled' }
    }
  }

  /**
   * Creates a SandboxAskCallback that forwards sandbox network permission
`,
      'target101 SDK user-dialog method',
    )
    source = replaceOnce(
      source,
      `    return response.mcp_response
  }
}
`,
      `    return response.mcp_response
  }

  async requestOAuthTokenRefresh(): Promise<string | null> {
    const response = await this.sendRequest<{ accessToken: string | null }>(
      { subtype: 'oauth_token_refresh' },
      SDKControlOAuthTokenRefreshResponseSchema(),
      AbortSignal.timeout(30_000),
    )
    return response.accessToken
  }
}
`,
      'target101 SDK OAuth refresh method',
    )
    fs.writeFileSync(filename, source)
  }

  {
    const filename = path.join(temp, 'src/cli/print.ts')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      `import { getAccountInformation } from 'src/utils/auth.js'
`,
      `import {
  getAccountInformation,
  SDK_OAUTH_REFRESH_ENTRYPOINTS,
} from 'src/utils/auth.js'
`,
      'target101 SDK OAuth allowlist import',
    )
    source = replaceOnce(
      source,
      `  getInitJsonSchema,
  setSdkAgentProgressSummariesEnabled,
} from 'src/bootstrap/state.js'
`,
      `  getInitJsonSchema,
  setSdkAgentProgressSummariesEnabled,
  setSdkOAuthTokenRefreshCallback,
} from 'src/bootstrap/state.js'
`,
      'target101 SDK OAuth state setter import',
    )
    source = replaceOnce(
      source,
      `  const structuredIO = getStructuredIO(inputPrompt, options)

`,
      `  const structuredIO = getStructuredIO(inputPrompt, options)

  if (
    isEnvTruthy(process.env.CLAUDE_CODE_SDK_HAS_OAUTH_REFRESH) &&
    SDK_OAUTH_REFRESH_ENTRYPOINTS.has(process.env.CLAUDE_CODE_ENTRYPOINT ?? '')
  ) {
    setSdkOAuthTokenRefreshCallback(() =>
      structuredIO.requestOAuthTokenRefresh(),
    )
  }

`,
      'target101 SDK OAuth callback installation',
    )
    fs.writeFileSync(filename, source)
  }
}

function buildSettingsSanitization101(temp) {
  applyWorkingDiff(temp, ['src/utils/settings/validation.ts'])
  applyWorkingDiff(temp, ['src/tools/BriefTool/prompt.ts'])

  const filename = path.join(temp, 'src/schemas/hooks.ts')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    `    asyncRewake: z
      .boolean()
      .optional()
      .describe(
        'If true, hook runs in background and wakes the model on exit code 2 (blocking error). Implies async.',
      ),
`,
    `    asyncRewake: z
      .boolean()
      .optional()
      .describe(
        'If true, hook runs in background and wakes the model on exit code 2 (blocking error). Implies async.',
      ),
    rewakeMessage: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Custom prefix for the system-reminder shown to the model when an asyncRewake hook exits with code 2. The hook output is appended after this prefix.',
      ),
`,
    'target101 asyncRewake message schema',
  )
  fs.writeFileSync(filename, source)
}

function buildInkEvents101(temp) {
  const recoveredRoot = '/tmp/middle-semantic-final-101.S7iRvU'
  for (const relative of [
    'src/ink/events/event-handlers.ts',
    'src/ink/events/dispatcher.ts',
    'src/ink/events/keyboard-event.ts',
    'src/ink/events/paste-event.ts',
    'src/ink/events/wheel-event.ts',
    'src/ink/components/Box.tsx',
    'src/ink/components/App.tsx',
    'src/ink/ink.tsx',
  ]) {
    const recovered = path.join(recoveredRoot, relative)
    if (!fs.existsSync(recovered)) {
      throw new Error(`missing target101 Ink recovery owner: ${recovered}`)
    }
    const destination = path.join(temp, relative)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(recovered, destination)
  }
  const inputEventFilename = path.join(temp, 'src/ink/events/input-event.ts')
  let inputEvent = fs.readFileSync(inputEventFilename, 'utf8')
  inputEvent = replaceOnce(
    inputEvent,
    '/^\\[<\\d+;\\d+;\\d+[Mm]/',
    '/^(\\x1b?\\[<\\d[\\d;]*[Mm]?)+$/',
    'target101 complete SGR mouse-fragment suppression',
  )
  fs.writeFileSync(inputEventFilename, inputEvent)
}

function buildInkInteractiveLifecycle101(temp) {
  const inkFilename = path.join(temp, 'src/ink/ink.tsx')
  let ink = fs.readFileSync(inkFilename, 'utf8')
  ink = replaceOnce(
    ink,
    "import { logForDebugging } from 'src/utils/debug.js';\n",
    "import { logForDebugging } from 'src/utils/debug.js';\nimport { isEnvTruthy } from 'src/utils/envUtils.js';\n",
    'target101 Ink lazy-interactive env import',
  )
  ink = replaceOnce(
    ink,
    'private readonly unsubscribeTTYHandlers?: () => void;',
    'private unsubscribeTTYHandlers?: () => void;',
    'target101 mutable Ink TTY unsubscriber',
  )
  ink = replaceOnce(
    ink,
    'ENTER_ALT_SCREEN, EXIT_ALT_SCREEN, SHOW_CURSOR',
    'ENTER_ALT_SCREEN, EXIT_ALT_SCREEN, HIDE_CURSOR, SHOW_CURSOR',
    'target101 Ink hide-cursor import',
  )
  ink = replaceOnce(
    ink,
    '  private readonly hoveredNodes = new Set<dom.DOMElement>();\n',
    `  private readonly hoveredNodes = new Set<dom.DOMElement>();
  private hasRendered = false;
  private isExiting = false;
`,
    'target101 Ink render lifecycle fields',
  )
  ink = replaceOnce(
    ink,
    `    if (options.stdout.isTTY) {
      options.stdout.on('resize', this.handleResize);
      process.on('SIGCONT', this.handleResume);
      this.unsubscribeTTYHandlers = () => {
        options.stdout.off('resize', this.handleResize);
        process.off('SIGCONT', this.handleResume);
      };
    }
`,
    '',
    'target101 removes eager TTY handlers',
  )
  ink = replaceOnce(
    ink,
    `  onRender() {
    if (this.isUnmounted || this.isPaused) {
      return;
    }
`,
    `  private ensureInteractive = (): void => {
    if (this.unsubscribeTTYHandlers || !this.options.stdout.isTTY) return;
    if (!isEnvTruthy(process.env.CLAUDE_CODE_ACCESSIBILITY)) {
      this.options.stdout.write(HIDE_CURSOR);
    }
    this.options.stdout.on('resize', this.handleResize);
    process.on('SIGCONT', this.handleResume);
    this.unsubscribeTTYHandlers = () => {
      this.options.stdout.off('resize', this.handleResize);
      process.off('SIGCONT', this.handleResume);
    };
  };

  private skipSyncMarkers(): boolean {
    if (!this.options.stdout.isTTY) return true;
    if (this.altScreenActive && !SYNC_OUTPUT_SUPPORTED) return true;
    if (!this.unsubscribeTTYHandlers) return true;
    return false;
  }

  onRender() {
    if (this.isUnmounted || this.isPaused) {
      return;
    }
    if (this.hasRendered && !this.isExiting) this.ensureInteractive();
    this.hasRendered = true;
`,
    'target101 Ink lazy-interactive render path',
  )
  ink = replaceOnce(
    ink,
    'writeDiffToTerminal(this.terminal, optimized, this.altScreenActive && !SYNC_OUTPUT_SUPPORTED);',
    'writeDiffToTerminal(this.terminal, optimized, this.skipSyncMarkers());',
    'target101 Ink sync-marker decision',
  )
  ink = replaceOnce(
    ink,
    `    if (active) {
      this.resetFramesForAltScreen();`,
    `    if (active) {
      this.ensureInteractive();
      this.resetFramesForAltScreen();`,
    'target101 Ink fullscreen interactivity',
  )
  ink = replaceOnce(
    ink,
    'onStdinResume={this.reassertTerminalModes} onCursorDeclaration=',
    'onStdinResume={this.reassertTerminalModes} onRawModeEnter={this.ensureInteractive} onCursorDeclaration=',
    'target101 Ink raw-mode callback reachability',
  )
  ink = replaceOnce(
    ink,
    `    this.onRender();
    this.unsubscribeExit();`,
    `    this.isExiting = true;
    this.onRender();
    this.unsubscribeExit();`,
    'target101 Ink unmount render guard',
  )
  ink = replaceOnce(
    ink,
    'writeDiffToTerminal(this.terminal, optimize(diff));',
    'writeDiffToTerminal(this.terminal, optimize(diff), this.skipSyncMarkers());',
    'target101 Ink final sync-marker decision',
  )
  fs.writeFileSync(inkFilename, ink)

  const appFilename = path.join(temp, 'src/ink/components/App.tsx')
  let app = fs.readFileSync(appFilename, 'utf8')
  app = replaceOnce(
    app,
    '  readonly onStdinResume?: () => void;\n',
    '  readonly onStdinResume?: () => void;\n  readonly onRawModeEnter?: () => void;\n',
    'target101 Ink App raw-mode callback type',
  )
  app = replaceOnce(
    app,
    `        stopCapturingEarlyInput();
        stdin.ref();`,
    `        stopCapturingEarlyInput();
        this.props.onRawModeEnter?.();
        stdin.ref();`,
    'target101 Ink App raw-mode callback',
  )
  fs.writeFileSync(appFilename, app)
}

function buildSdkTelemetryTask101(temp) {
  const recoveredRoot = '/tmp/verify101-inksettings.O0ulD1'
  for (const relative of [
    'src/services/analytics/datadog.ts',
    'src/utils/sdkEventQueue.ts',
    'src/utils/task/framework.ts',
    'src/entrypoints/sdk/coreSchemas.ts',
    'src/cli/structuredIO.ts',
    'src/QueryEngine.ts',
    'src/cli/print.ts',
    'src/hooks/useRemoteSession.ts',
  ]) {
    const recovered = path.join(recoveredRoot, relative)
    if (!fs.existsSync(recovered)) {
      throw new Error(`missing target101 SDK telemetry owner: ${recovered}`)
    }
    const destination = path.join(temp, relative)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(recovered, destination)
  }
}

function buildPluginTypes101(temp) {
  const filename = path.join(temp, 'src/types/plugin.ts')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    'export type LoadedPlugin = {\n',
    `export type DependencyConstraint = {
  version?: string
  sha?: string
}

export type LoadedPlugin = {
`,
    'target101 dependency constraint type',
  )
  source = replaceOnce(
    source,
    '  sha?: string // Git commit SHA for version pinning (from marketplace entry source)\n',
    `  sha?: string // Git commit SHA for version pinning (from marketplace entry source)
  depConstraints?: Map<string, DependencyConstraint>
`,
    'target101 loaded dependency metadata',
  )
  source = replaceOnce(
    source,
    `  | {
      type: 'plugin-cache-miss'
      source: string
      plugin: string
      installPath: string
    }
`,
    `  | {
      type: 'dependency-version-unsatisfied'
      source: string
      plugin: string
      dependency: string
      required: string
      installed?: string
    }
  | {
      type: 'plugin-cache-miss'
      source: string
      plugin: string
      installPath: string
    }
`,
    'target101 dependency version error type',
  )
  source = replaceOnce(
    source,
    `    case 'plugin-cache-miss':
      return \`Plugin "\${error.plugin}" not cached at \${error.installPath} — run /plugins to refresh\`
`,
    `    case 'dependency-version-unsatisfied':
      return \`Requires "\${error.dependency}" \${error.required}, installed \${error.installed ?? 'version unknown'}\`
    case 'plugin-cache-miss':
      return \`Plugin "\${error.plugin}" not cached at \${error.installPath} — run /plugins to refresh\`
`,
    'target101 dependency version message',
  )
  fs.writeFileSync(filename, source)
}

function buildPluginDependencyResolver101(temp) {
  const filename = path.join(temp, 'src/utils/plugins/dependencyResolver.ts')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    "import type { LoadedPlugin, PluginError } from '../../types/plugin.js'\n",
    `import * as semver from 'semver'
import type {
  DependencyConstraint,
  LoadedPlugin,
  PluginError,
} from '../../types/plugin.js'
`,
    'target101 dependency semver imports',
  )
  const current = fs.readFileSync(
    path.join(root, 'src/utils/plugins/dependencyResolver.ts'),
    'utf8',
  )
  source = replaceOnce(
    source,
    "const INLINE_MARKETPLACE = 'inline'\n",
    `const INLINE_MARKETPLACE = 'inline'

${block(current, 'export function extractDependencyConstraints(', '/**\n * Normalize a dependency reference')}`,
    'target101 dependency metadata parser',
  )
  source = replaceOnce(
    source,
    '/**\n * Minimal shape the resolver needs from a marketplace lookup.',
    `${block(current, 'export function findDependencyConstraints(', '/**\n * Minimal shape the resolver needs from a marketplace lookup.')}/**
 * Minimal shape the resolver needs from a marketplace lookup.`,
    'target101 reverse constraint finder',
  )
  source = replaceOnce(
    source,
    '  const enabled = new Set(plugins.filter(p => p.enabled).map(p => p.source))\n',
    `  const enabled = new Set(plugins.filter(p => p.enabled).map(p => p.source))
  const loadedById = new Map(plugins.map(plugin => [plugin.source, plugin]))
`,
    'target101 loaded dependency index',
  )
  source = replaceOnce(
    source,
    `          changed = true
          break
        }
      }
    }
  }
`,
    `          changed = true
          break
        }

        const required = p.depConstraints?.get(rawDep)?.version
        if (required !== undefined && !isBare) {
          const installed = loadedById.get(dep)?.manifest.version
          const normalizedInstalled = installed
            ? (semver.valid(installed) ?? semver.coerce(installed)?.version)
            : undefined
          if (
            normalizedInstalled === undefined ||
            !semver.satisfies(normalizedInstalled, required)
          ) {
            enabled.delete(p.source)
            const count = enabledByName.get(p.name) ?? 0
            if (count <= 1) enabledByName.delete(p.name)
            else enabledByName.set(p.name, count - 1)
            errors.push({
              type: 'dependency-version-unsatisfied',
              source: p.source,
              plugin: p.name,
              dependency: dep,
              required,
              installed,
            })
            changed = true
            break
          }
        }
      }
    }
  }
`,
    'target101 dependency version demotion',
  )
  fs.writeFileSync(filename, source)
}

function buildPluginLoader101(temp) {
  const filename = path.join(temp, 'src/utils/plugins/pluginLoader.ts')
  let source = fs.readFileSync(filename, 'utf8')
  const current = fs.readFileSync(path.join(root, 'src/utils/plugins/pluginLoader.ts'), 'utf8')
  source = replaceOnce(
    source,
    `import type {
  LoadedPlugin,
`,
    `import type {
  DependencyConstraint,
  LoadedPlugin,
`,
    'target101 loader dependency type',
  )
  source = replaceOnce(
    source,
    `  errorMessage,
  getErrnoPath,
`,
    `  errorMessage,
  getErrnoCode,
  getErrnoPath,
`,
    'target101 loader errno import',
  )
  source = replaceOnce(
    source,
    "import { verifyAndDemote } from './dependencyResolver.js'\n",
    `import {
  extractDependencyConstraints,
  verifyAndDemote,
} from './dependencyResolver.js'
`,
    'target101 loader dependency parser import',
  )
  source = replaceOnce(
    source,
    `  type CommandMetadata,
  PluginHooksSchema,
`,
    `  type CommandMetadata,
  isLocalMarketplaceSource,
  type MarketplaceSource,
  PluginHooksSchema,
`,
    'target101 local marketplace imports',
  )

  source = replaceBlock(
    source,
    '/**\n * Install a plugin from a subdirectory of a git repository',
    '/**\n * Install a plugin from a local path',
    block(
      current,
      'const NONINTERACTIVE_GIT_ENV = {',
      '/**\n * Install a plugin from a local path',
    ),
  )
  source = replaceBlock(
    source,
    'export async function cachePlugin(',
    '/**\n * Loads and validates a plugin manifest',
    block(
      current,
      'export async function cachePlugin(',
      '/**\n * Loads and validates a plugin manifest',
    ),
  )
  source = replaceBlock(
    source,
    'export async function loadPluginManifest(',
    '/**\n * Loads and validates plugin hooks configuration',
    block(
      current,
      'export async function loadPluginManifest(',
      '/**\n * Loads and validates plugin hooks configuration',
    ),
  )
  source = replaceOnce(
    source,
    `  const manifestPath = join(pluginPath, '.claude-plugin', 'plugin.json')
  const manifest = await loadPluginManifest(manifestPath, fallbackName, source)
`,
    `  const { manifest, depConstraints } = await loadPluginManifest(
    pluginPath,
    fallbackName,
    source,
  )
`,
    'target101 create plugin manifest result',
  )
  source = replaceOnce(
    source,
    `    enabled, // Current enabled state
  }
`,
    `    enabled, // Current enabled state
    depConstraints,
  }
`,
    'target101 create plugin dependency metadata',
  )
  const marketplaceCallerBefore = `            result.entry,
            result.marketplaceInstallLocation,
            pluginId,
`
  const marketplaceCallerAfter = `            result.entry,
            result.marketplaceInstallLocation,
            marketplaceConfig?.source,
            pluginId,
`
  if (source.split(marketplaceCallerBefore).length !== 3) {
    throw new Error('expected two target101 marketplace loader callers')
  }
  source = source.replace(marketplaceCallerBefore, marketplaceCallerAfter)
  source = source.replace(marketplaceCallerBefore, marketplaceCallerAfter)
  source = replaceOnce(
    source,
    `async function loadPluginFromMarketplaceEntryCacheOnly(
  entry: PluginMarketplaceEntry,
  marketplaceInstallLocation: string,
  pluginId: string,
`,
    `async function loadPluginFromMarketplaceEntryCacheOnly(
  entry: PluginMarketplaceEntry,
  marketplaceInstallLocation: string,
  marketplaceSource: MarketplaceSource | undefined,
  pluginId: string,
`,
    'target101 cache-only marketplace signature',
  )
  source = replaceOnce(
    source,
    `  if (typeof entry.source === 'string') {
    if (installPath && (await pathExists(installPath))) {
      pluginPath = installPath
    } else {
      let marketplaceDir: string
      try {
        marketplaceDir = (await stat(marketplaceInstallLocation)).isDirectory()
          ? marketplaceInstallLocation
          : join(marketplaceInstallLocation, '..')
      } catch {
        errorsOut.push({
          type: 'plugin-cache-miss',
          source: pluginId,
          plugin: entry.name,
          installPath: marketplaceInstallLocation,
        })
        return null
      }
      pluginPath = join(marketplaceDir, entry.source)
    }
`,
    `  if (typeof entry.source === 'string') {
    const isLocalMarketplace =
      marketplaceSource !== undefined &&
      isLocalMarketplaceSource(marketplaceSource)
    if (
      !isLocalMarketplace &&
      installPath &&
      (await pathExists(installPath))
    ) {
      pluginPath = installPath
    } else {
      let marketplaceDir: string
      try {
        marketplaceDir = (await stat(marketplaceInstallLocation)).isDirectory()
          ? marketplaceInstallLocation
          : join(marketplaceInstallLocation, '..')
      } catch {
        errorsOut.push(
          isLocalMarketplace
            ? {
                type: 'generic-error',
                source: pluginId,
                error: \`Marketplace directory not found at path: \${marketplaceInstallLocation}\`,
              }
            : {
                type: 'plugin-cache-miss',
                source: pluginId,
                plugin: entry.name,
                installPath: marketplaceInstallLocation,
              },
        )
        return null
      }
      pluginPath = join(marketplaceDir, entry.source)
      if (!(await pathExists(pluginPath))) {
        errorsOut.push(
          isLocalMarketplace
            ? {
                type: 'generic-error',
                source: pluginId,
                error: \`Plugin directory not found at path: \${pluginPath}. Check that the marketplace entry has the correct path.\`,
              }
            : {
                type: 'plugin-cache-miss',
                source: pluginId,
                plugin: entry.name,
                installPath: pluginPath,
              },
        )
        return null
      }
    }
`,
    'target101 cache-only local marketplace behavior',
  )
  source = replaceOnce(
    source,
    `async function loadPluginFromMarketplaceEntry(
  entry: PluginMarketplaceEntry,
  marketplaceInstallLocation: string,
  pluginId: string,
`,
    `async function loadPluginFromMarketplaceEntry(
  entry: PluginMarketplaceEntry,
  marketplaceInstallLocation: string,
  marketplaceSource: MarketplaceSource | undefined,
  pluginId: string,
`,
    'target101 full marketplace signature',
  )
  const oldLocalCopy = block(
    source,
    '    // Always copy local plugins to versioned cache',
    '  } else {\n    // External source (npm, github, url, pip)',
  )
  const newLocalCopy = block(
    current,
    '    if (\n      marketplaceSource !== undefined &&\n      isLocalMarketplaceSource(marketplaceSource)',
    '  } else {\n    // External source (npm, github, url, pip)',
  )
  source = replaceOnce(
    source,
    oldLocalCopy,
    newLocalCopy,
    'target101 full local marketplace behavior',
  )
  source = replaceOnce(
    source,
    '): Promise<{ plugin: LoadedPlugin; errors: PluginError[] }> {',
    `): Promise<{
  plugin: LoadedPlugin
  errors: PluginError[]
  hasManifest: boolean
}> {`,
    'target101 plugin loader manifest return type',
  )
  source = replaceOnce(
    source,
    '  const { manifest, depConstraints } = await loadPluginManifest(\n',
    '  const { manifest, manifestPath, depConstraints } = await loadPluginManifest(\n',
    'target101 plugin loader manifest path',
  )
  source = replaceOnce(
    source,
    '  return { plugin, errors }\n',
    '  return { plugin, errors, hasManifest: manifestPath !== null }\n',
    'target101 plugin loader manifest result',
  )
  source = replaceOnce(
    source,
    `  // Check if plugin.json exists to determine if we should use marketplace manifest
  const manifestPath = join(pluginPath, '.claude-plugin', 'plugin.json')
  const hasManifest = await pathExists(manifestPath)

  const { plugin, errors: pluginErrors } = await createPluginFromPath(
`,
    `  const {
    plugin,
    errors: pluginErrors,
    hasManifest,
  } = await createPluginFromPath(
`,
    'target101 plugin manifest reachability',
  )
  fs.writeFileSync(filename, source)
}

function buildPluginOptionsDialog101(temp) {
  const filename = path.join(temp, 'src/commands/plugin/PluginOptionsDialog.tsx')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    "import { Box, Text, useInput } from '../../ink.js';\n",
    `import { Box, Text } from '../../ink.js';
import type { KeyboardEvent } from '../../ink/events/keyboard-event.js';
import type { PasteEvent } from '../../ink/events/paste-event.js';
`,
    'target101 option DOM event imports',
  )
  source = replaceBlock(
    source,
    '  let t10;\n',
    '  if (!fieldSchema || !currentField) {',
    `  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'return') {
      event.preventDefault();
      handleConfirm();
      return;
    }
    if (event.key === 'tab') {
      event.preventDefault();
      handleNextField();
      return;
    }
    if (event.key === 'backspace' || event.key === 'delete') {
      event.preventDefault();
      setCurrentInput(previous => previous.slice(0, -1));
      return;
    }
    if (event.ctrl || event.meta) return;
    if (event.key.length === 1) {
      event.preventDefault();
      setCurrentInput(previous => previous + event.key);
    }
  }

  function handlePaste(event: PasteEvent): void {
    event.preventDefault();
    const text = (event.text.split(/\\r\\n|\\r|\\n/, 2)[0] ?? '').trim();
    setCurrentInput(previous => previous + text);
  }

`,
  )
  source = replaceBlock(
    source,
    '  let t20;\n',
    '  const t21 = currentFieldIndex + 1;',
    `  const t20 = <Box
    flexDirection="column"
    tabIndex={0}
    autoFocus
    onKeyDown={handleKeyDown}
    onPaste={handlePaste}
  >{t14}{t15}{t19}</Box>;
`,
  )
  fs.writeFileSync(filename, source)
}

function buildPluginSearchUi101(temp) {
  {
    const filename = path.join(temp, 'src/utils/plugins/marketplaceHelpers.ts')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      "  | 'all-plugins-installed'\n",
      "  | 'all-plugins-installed'\n  | 'all-plugins-project-installed'\n",
      'target101 project-installed empty reason',
    )
    fs.writeFileSync(filename, source)
  }

  {
    const filename = path.join(temp, 'src/commands/plugin/DiscoverPlugins.tsx')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      "import { Box, Text, useInput, useTerminalFocus } from '../../ink.js';\n",
      `import { Box, Text, useTerminalFocus } from '../../ink.js';
import type { KeyboardEvent } from '../../ink/events/keyboard-event.js';
import type { PasteEvent } from '../../ink/events/paste-event.js';
`,
      'target101 discover DOM event imports',
    )
    source = replaceOnce(
      source,
      "import { isPluginGloballyInstalled } from '../../utils/plugins/installedPluginsManager.js';\n",
      "import { isPluginGloballyInstalled, isPluginInstalled } from '../../utils/plugins/installedPluginsManager.js';\n",
      'target101 project install detection import',
    )
    source = replaceOnce(
      source,
      `    cursorOffset: searchCursorOffset
`,
      `    cursorOffset: searchCursorOffset,
    handleKeyDown: handleSearchKeyDown,
    handlePaste: handleSearchPaste,
`,
      'target101 discover search event handlers',
    )
    source = replaceOnce(
      source,
      `                // Only block when globally installed (user/managed scope).
                // Project/local-scope installs don't block — user may want to
                // promote to user scope so it's available everywhere (gh-29997).
                isInstalled: isPluginGloballyInstalled(pluginId)
`,
      `                isInstalled: isPluginInstalled(pluginId)
`,
      'target101 discover any-scope install state',
    )
    source = replaceOnce(
      source,
      `          const reason = await detectEmptyMarketplaceReason({
            configuredMarketplaceCount: configuredCount,
            failedMarketplaceCount: failures.length
          });
          setEmptyReason(reason);
`,
      `          let reason = await detectEmptyMarketplaceReason({
            configuredMarketplaceCount: configuredCount,
            failedMarketplaceCount: failures.length
          });
          if (reason === 'all-plugins-installed' && allPlugins.length > 0 && allPlugins.every(plugin => plugin.isInstalled && !isPluginGloballyInstalled(plugin.pluginId)) && !allPlugins.some(plugin => isPluginBlockedByPolicy(plugin.pluginId))) {
            reason = 'all-plugins-project-installed';
          }
          setEmptyReason(reason);
`,
      'target101 project-installed empty classification',
    )
    source = replaceBlock(
      source,
      '  // Handle entering search mode (non-escape keys)',
      '  // Plugin-list navigation (non-search mode)',
      `  function handleKeyDown(event: KeyboardEvent): void {
    if (isSearchMode) {
      handleSearchKeyDown(event);
      return;
    }
    if (event.ctrl || event.meta || loading) return;
    if (event.key === '/') {
      event.preventDefault();
      setIsSearchMode(true);
      setSearchQuery('');
    } else if (event.key.length === 1 && event.key !== ' ') {
      event.preventDefault();
      setIsSearchMode(true);
      setSearchQuery(event.key);
    }
  }

  function handlePaste(event: PasteEvent): void {
    if (isSearchMode) {
      handleSearchPaste(event);
      return;
    }
    if (loading) return;
    const text = (event.text.split(/\\r\\n|\\r|\\n/, 2)[0] ?? '').trim();
    if (!text) return;
    event.preventDefault();
    setIsSearchMode(true);
    setSearchQuery(text);
  }

  // Plugin-list navigation (non-search mode)
`,
    )
    source = replaceOnce(
      source,
      '  return <Box flexDirection="column">\n      <Box>\n        <Text bold>Discover plugins</Text>',
      '  return <Box flexDirection="column" tabIndex={0} autoFocus onKeyDown={handleKeyDown} onPaste={handlePaste}>\n      <Box>\n        <Text bold>Discover plugins</Text>',
      'target101 discover event surface',
    )
    source = replaceOnce(
      source,
      '  const $ = _c(6);\n',
      '  const $ = _c(7);\n',
      'target101 empty-state memo slots',
    )
    source = replaceOnce(
      source,
      `    case "no-marketplaces-configured":
    default:
`,
      `    case "all-plugins-project-installed":
      {
        let t1;
        if ($[5] === Symbol.for("react.memo_cache_sentinel")) {
          t1 = <><Text dimColor={true}>All available plugins are installed for this project.</Text><Text dimColor={true}>Use the Browse tab to install at user scope.</Text></>;
          $[5] = t1;
        } else {
          t1 = $[5];
        }
        return t1;
      }
    case "no-marketplaces-configured":
    default:
`,
      'target101 project-installed empty message',
    )
    source = source.replaceAll('$[5] = t1;\n        } else {\n          t1 = $[5];\n        }\n        return t1;\n      }\n  }\n}', '$[6] = t1;\n        } else {\n          t1 = $[6];\n        }\n        return t1;\n      }\n  }\n}')
    fs.writeFileSync(filename, source)
  }

  {
    const filename = path.join(temp, 'src/commands/plugin/ManagePlugins.tsx')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      "import { Box, Text, useInput, useTerminalFocus } from '../../ink.js';\n",
      `import { Box, Text, useInput, useTerminalFocus } from '../../ink.js';
import type { KeyboardEvent } from '../../ink/events/keyboard-event.js';
import type { PasteEvent } from '../../ink/events/paste-event.js';
`,
      'target101 manage DOM event imports',
    )
    source = replaceOnce(
      source,
      `    cursorOffset: searchCursorOffset
`,
      `    cursorOffset: searchCursorOffset,
    handleKeyDown: handleSearchKeyDown,
    handlePaste: handleSearchPaste,
`,
      'target101 manage search handlers',
    )
    source = replaceBlock(
      source,
      '  // Handle input for entering search mode',
      '  // Loading state',
      `  function handleKeyDown(event: KeyboardEvent): void {
    if (isSearchMode) {
      handleSearchKeyDown(event);
      return;
    }
    if (event.ctrl || event.meta) return;
    if (event.key === '/') {
      event.preventDefault();
      setIsSearchMode(true);
      setSearchQuery('');
      setSelectedIndex(0);
    } else if (event.key.length === 1 && event.key !== ' ') {
      event.preventDefault();
      setIsSearchMode(true);
      setSearchQuery(event.key);
      setSelectedIndex(0);
    }
  }

  function handlePaste(event: PasteEvent): void {
    if (isSearchMode) {
      handleSearchPaste(event);
      return;
    }
    const text = (event.text.split(/\\r\\n|\\r|\\n/, 2)[0] ?? '').trim();
    if (!text) return;
    event.preventDefault();
    setIsSearchMode(true);
    setSearchQuery(text);
    setSelectedIndex(0);
  }

  // Loading state
`,
    )
    source = replaceOnce(
      source,
      '  return <Box flexDirection="column">\n      {/* Search box */}',
      '  return <Box flexDirection="column" tabIndex={0} autoFocus onKeyDown={handleKeyDown} onPaste={handlePaste}>\n      {/* Search box */}',
      'target101 manage event surface',
    )
    fs.writeFileSync(filename, source)
  }
}

function buildPluginErrors101(temp) {
  const filename = path.join(temp, 'src/commands/plugin/PluginErrors.tsx')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    `    case 'dependency-unsatisfied':
      return error.reason === 'not-enabled' ? \`Dependency "\${error.dependency}" is disabled\` : \`Dependency "\${error.dependency}" is not installed\`;
`,
    `    case 'dependency-unsatisfied':
      return error.reason === 'not-enabled' ? \`Dependency "\${error.dependency}" is disabled\` : \`Dependency "\${error.dependency}" is not installed\`;
    case 'dependency-version-unsatisfied':
      return \`Requires "\${error.dependency}" \${error.required}, installed \${error.installed ?? 'version unknown'}\`;
`,
    'target101 dependency version display',
  )
  source = replaceOnce(
    source,
    `    case 'dependency-unsatisfied':
      return error.reason === 'not-enabled' ? \`Enable "\${error.dependency}" or uninstall "\${error.plugin}"\` : \`Install "\${error.dependency}" or uninstall "\${error.plugin}"\`;
`,
    `    case 'dependency-unsatisfied':
      return error.reason === 'not-enabled' ? \`Enable "\${error.dependency}" or uninstall "\${error.plugin}"\` : \`Install "\${error.dependency}" or uninstall "\${error.plugin}"\`;
    case 'dependency-version-unsatisfied':
      return \`Update "\${error.dependency}" to satisfy \${error.required}, or uninstall "\${error.plugin}"\`;
`,
    'target101 dependency version guidance',
  )
  fs.writeFileSync(filename, source)
}

function buildPluginOperations101(temp) {
  const filename = path.join(temp, 'src/services/plugins/pluginOperations.ts')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    "import { dirname, join } from 'path'\n",
    "import { dirname, join } from 'path'\nimport * as semver from 'semver'\n",
    'target101 update semver import',
  )
  source = replaceOnce(
    source,
    "import { isENOENT, toError } from '../../utils/errors.js'\n",
    "import { logForDebugging } from '../../utils/debug.js'\nimport { errorMessage, isENOENT, toError } from '../../utils/errors.js'\n",
    'target101 update error imports',
  )
  source = replaceOnce(
    source,
    `import {
  findReverseDependents,
`,
    `import {
  findDependencyConstraints,
  findReverseDependents,
`,
    'target101 reverse version constraint import',
  )
  source = replaceOnce(
    source,
    `  loadKnownMarketplacesConfig,
} from '../../utils/plugins/marketplaceManager.js'
`,
    `  loadKnownMarketplacesConfig,
  refreshMarketplace,
} from '../../utils/plugins/marketplaceManager.js'
`,
    'target101 marketplace refresh import',
  )
  source = replaceOnce(
    source,
    `  alreadyUpToDate?: boolean
  scope?: PluginScope
`,
    `  alreadyUpToDate?: boolean
  skipped?: boolean
  blockedBy?: string[]
  scope?: PluginScope
`,
    'target101 skipped update result',
  )
  source = replaceOnce(
    source,
    `  const pluginId = marketplaceName ? \`${'${pluginName}'}@${'${marketplaceName}'}\` : plugin

  // Get plugin info from marketplace
`,
    `  const pluginId = marketplaceName ? \`${'${pluginName}'}@${'${marketplaceName}'}\` : plugin

  let refreshWarning: string | undefined
  if (marketplaceName) {
    const marketplaceSource =
      (await loadKnownMarketplacesConfig())[marketplaceName]?.source
    if (
      marketplaceSource &&
      (marketplaceSource.source === 'github' ||
        marketplaceSource.source === 'git' ||
        marketplaceSource.source === 'url')
    ) {
      try {
        await refreshMarketplace(marketplaceName, undefined, {
          skipIfRecent: true,
        })
      } catch (error) {
        refreshWarning = \`marketplace not refreshed (\${errorMessage(error)})\`
        logForDebugging(
          \`Failed to refresh marketplace '\${marketplaceName}' before update; using cached data: \${errorMessage(error)}\`,
          { level: 'warn' },
        )
      }
    }
  }

  // Get plugin info from marketplace
`,
    'target101 refresh marketplace before update',
  )
  source = replaceOnce(
    source,
    `    scope,
    projectPath,
  })
`,
    `    scope,
    projectPath,
    refreshWarning,
  })
`,
    'target101 pass refresh warning',
  )
  source = replaceOnce(
    source,
    `  scope,
  projectPath,
}: {
`,
    `  scope,
  projectPath,
  refreshWarning,
}: {
`,
    'target101 update implementation warning param',
  )
  source = replaceOnce(
    source,
    `  scope: PluginScope
  projectPath: string | undefined
}): Promise<PluginUpdateResult> {
`,
    `  scope: PluginScope
  projectPath: string | undefined
  refreshWarning?: string
}): Promise<PluginUpdateResult> {
`,
    'target101 update implementation warning type',
  )
  source = replaceOnce(
    source,
    `  let shouldCleanupSource = false
  let gitCommitSha: string | undefined
`,
    `  let shouldCleanupSource = false
  let gitCommitSha: string | undefined
  let pluginManifestVersion: string | undefined
`,
    'target101 update manifest version',
  )
  source = replaceOnce(
    source,
    `    const manifestPath = join(sourcePath, '.claude-plugin', 'plugin.json')
    try {
      pluginManifest = await loadPluginManifest(
        manifestPath,
        entry.name,
        entry.source,
      )
`,
    `    try {
      const loadedManifest = await loadPluginManifest(
        sourcePath,
        entry.name,
        entry.source,
      )
      pluginManifest = loadedManifest.manifest
      pluginManifestVersion = pluginManifest.version
`,
    'target101 update manifest load result',
  )
  source = replaceOnce(
    source,
    `  // Use try/finally to ensure temp directory cleanup on any error
  try {
    // Check if this version already exists in cache
`,
    `  // Use try/finally to ensure temp directory cleanup on any error
  try {
    const { enabled, disabled } = await loadAllPlugins()
    const constraints = findDependencyConstraints(pluginId, [
      ...enabled,
      ...disabled,
    ])
    if (constraints.length > 0) {
      const normalizedVersion = pluginManifestVersion
        ? (semver.valid(pluginManifestVersion) ??
          semver.coerce(pluginManifestVersion)?.version)
        : undefined
      const blockedBy = constraints
        .filter(
          ({ constraint }) =>
            constraint.version !== undefined &&
            normalizedVersion !== undefined &&
            !semver.satisfies(normalizedVersion, constraint.version),
        )
        .map(({ plugin: dependent }) => dependent.source)
      if (blockedBy.length > 0) {
        return {
          success: true,
          skipped: true,
          message: \`Skipped — \${blockedBy.join(', ')} requires \${pluginName} at a version range that \${pluginManifestVersion ?? newVersion} does not satisfy\`,
          pluginId,
          scope,
          blockedBy,
          oldVersion,
        }
      }
    }

    // Check if this version already exists in cache
`,
    'target101 update constraint guard',
  )
  source = replaceOnce(
    source,
    `    if (isUpToDate) {
      return {
        success: true,
        message: \`${'${pluginName}'} is already at the latest version (${'${newVersion}'}).\`,
`,
    `    if (isUpToDate) {
      const baseMessage = \`${'${pluginName}'} is already at the latest version (${'${newVersion}'}).\`
      return {
        success: true,
        message: refreshWarning
          ? \`${'${baseMessage}'} Warning: ${'${refreshWarning}'} — version shown may be stale.\`
          : baseMessage,
`,
    'target101 stale update warning',
  )
  source = replaceOnce(
    source,
    `    const message = \`Plugin "\${pluginName}" updated from \${oldVersion || 'unknown'} to \${newVersion} for scope \${scopeDesc}. Restart to apply changes.\`
`,
    `    const baseMessage = \`Plugin "\${pluginName}" updated from \${oldVersion || 'unknown'} to \${newVersion} for scope \${scopeDesc}. Restart to apply changes.\`
    const message = refreshWarning
      ? \`\${baseMessage} Warning: \${refreshWarning}.\`
      : baseMessage
`,
    'target101 successful update warning',
  )
  fs.writeFileSync(filename, source)
}

function buildPluginValidation101(temp) {
  applySelectedWorkingDiff(
    temp,
    'src/utils/plugins/validatePlugin.ts',
    hunk => hunk.includes('for version cross-check'),
  )
}

function buildWorktreeRecovery101(temp) {
  const filename = path.join(temp, 'src/utils/worktree.ts')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    `  symlink,
  utimes,
} from 'fs/promises'
`,
    `  rm,
  symlink,
  utimes,
} from 'fs/promises'
`,
    'target101 worktree rm import',
  )
  source = replaceOnce(
    source,
    `import { errorMessage, getErrnoCode } from './errors.js'
`,
    `import { errorMessage, getErrnoCode, isENOENT } from './errors.js'
`,
    'target101 worktree ENOENT import',
  )
  source = replaceOnce(
    source,
    `
  // New worktree: fetch base branch then add
`,
    `
  const orphanedGitDir = await resolveGitDir(worktreePath)
  if (orphanedGitDir) {
    let isOrphaned = false
    try {
      await readdir(orphanedGitDir)
    } catch (error) {
      isOrphaned = isENOENT(error)
    }
    if (isOrphaned) {
      const remotes = await execFileNoThrowWithCwd(gitExe(), ['remote'], {
        cwd: repoRoot,
      })
      if (remotes.code !== 0) {
        throw new Error(
          \`Orphaned worktree dir at \${worktreePath} but \\\`git remote\\\` failed (\${remotes.stderr.trim()}) — refusing to self-heal. Remove \${worktreePath} manually if it has no work to keep.\`,
        )
      }
      const branch = await execFileNoThrowWithCwd(
        gitExe(),
        ['rev-parse', '--verify', '--quiet', worktreeBranch],
        { cwd: repoRoot },
      )
      if (branch.code !== 0 && branch.stderr.trim().length > 0) {
        throw new Error(
          \`Orphaned worktree dir at \${worktreePath} but rev-parse on \${worktreeBranch} failed (\${branch.stderr.trim()}) — refusing to self-heal. Remove \${worktreePath} manually if it has no work to keep.\`,
        )
      }
      if (remotes.stdout.trim().length > 0 && branch.code === 0) {
        const unpushed = await execFileNoThrowWithCwd(
          gitExe(),
          ['rev-list', '--max-count=1', worktreeBranch, '--not', '--remotes'],
          { cwd: repoRoot },
        )
        if (unpushed.code !== 0) {
          throw new Error(
            \`Orphaned worktree dir at \${worktreePath} but rev-list on \${worktreeBranch} failed (\${unpushed.stderr.trim()}) — refusing to self-heal. Remove \${worktreePath} manually if it has no work to keep.\`,
          )
        }
        if (unpushed.stdout.trim().length > 0) {
          throw new Error(
            \`Orphaned worktree dir at \${worktreePath} but branch \${worktreeBranch} has unpushed commits — refusing to self-heal. Push or delete the branch, then retry.\`,
          )
        }
      }
      try {
        await rm(worktreePath, { recursive: true, force: false })
        logForDebugging(
          \`[worktree] removed orphaned worktree directory at \${worktreePath}\`,
        )
      } catch (error) {
        throw new Error(
          \`Cannot self-heal orphaned worktree at \${worktreePath}: \${errorMessage(error)}. Remove manually to proceed.\`,
        )
      }
    }
  }

  // New worktree: fetch base branch then add
`,
    'target101 orphaned worktree recovery',
  )
  source = replaceOnce(
    source,
    `
      if (removeCode !== 0) {
        logForDebugging(\`Failed to remove linked worktree: \${removeError}\`, {
          level: 'error',
        })
      } else {
        logForDebugging(\`Removed linked worktree at: \${worktreePath}\`)
      }
`,
    `
      let directoryRemoved = true
      try {
        await rm(worktreePath, { recursive: true, force: false })
      } catch (error) {
        directoryRemoved = false
        logForDebugging(
          \`[worktree] residual dir cleanup failed for \${worktreePath}: \${error}\`,
        )
      }
      if (removeCode !== 0) {
        logForDebugging(
          directoryRemoved
            ? \`git worktree remove failed (\${removeError.trim()}); rm sweep cleared \${worktreePath}\`
            : \`Failed to remove linked worktree: \${removeError}\`,
          { level: directoryRemoved ? 'debug' : 'error' },
        )
      } else {
        logForDebugging(\`Removed linked worktree at: \${worktreePath}\`)
      }
`,
    'target101 linked worktree residual cleanup',
  )
  source = replaceOnce(
    source,
    `
  if (removeCode !== 0) {
    logForDebugging(\`Failed to remove agent worktree: \${removeError}\`, {
      level: 'error',
    })
    return false
  }
  logForDebugging(\`Removed agent worktree at: \${worktreePath}\`)
`,
    `
  let directoryRemoved = true
  try {
    await rm(worktreePath, { recursive: true, force: false })
  } catch (error) {
    directoryRemoved = false
    logForDebugging(
      \`[worktree] residual dir cleanup failed for \${worktreePath}: \${error}\`,
    )
  }
  if (removeCode !== 0) {
    logForDebugging(
      directoryRemoved
        ? \`git worktree remove failed (\${removeError.trim()}); rm sweep cleared \${worktreePath}\`
        : \`Failed to remove agent worktree: \${removeError}\`,
      { level: directoryRemoved ? 'debug' : 'error' },
    )
    if (!directoryRemoved) {
      return false
    }
  } else {
    logForDebugging(\`Removed agent worktree at: \${worktreePath}\`)
  }
`,
    'target101 agent worktree residual cleanup',
  )
  fs.writeFileSync(filename, source)
}

function buildWorktreeRecovery105(temp) {
  buildWorktreeRecovery101(temp)
  const filename = path.join(temp, 'src/utils/worktree.ts')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    `import { basename, dirname, join, resolve } from 'path'
`,
    `import { basename, dirname, join, resolve } from 'path'
import { logEvent } from '../services/analytics/index.js'
`,
    'target105 worktree analytics import',
  )
  source = replaceOnce(
    source,
    `  gitRoot?: string,
  hookBased?: boolean,
): Promise<boolean> {
`,
    `  gitRoot?: string,
  hookBased?: boolean,
  source = 'unknown',
): Promise<boolean> {
`,
    'target105 worktree removal source',
  )
  source = replaceOnce(
    source,
    `    if (hookRan) {
      logForDebugging(\`Removed hook-based agent worktree at: \${worktreePath}\`)
`,
    `    if (hookRan) {
      logEvent('tengu_worktree_removed', {
        source,
        changed_files: 0,
        commits: 0,
        hook_based: true,
      })
      logForDebugging(\`Removed hook-based agent worktree at: \${worktreePath}\`)
`,
    'target105 hook worktree telemetry',
  )
  source = replaceOnce(
    source,
    `
  // Run from the main repo root, not the worktree (which we're about to delete)
`,
    `
  const status = await execFileNoThrowWithCwd(
    gitExe(),
    ['status', '--porcelain'],
    { cwd: worktreePath },
  )
  const changedFiles =
    status.code === 0 && status.stdout.trim()
      ? status.stdout.trim().split('\\n').length
      : 0

  // Run from the main repo root, not the worktree (which we're about to delete)
`,
    'target105 changed files telemetry',
  )
  source = replaceOnce(
    source,
    `
  if (!worktreeBranch) {
    return true
  }
`,
    `
  logEvent('tengu_worktree_removed', {
    source,
    changed_files: changedFiles,
    commits: 0,
  })

  if (!worktreeBranch) {
    return true
  }
`,
    'target105 worktree removed telemetry',
  )
  source = replaceOnce(
    source,
    `
/**
 * Remove stale agent/workflow worktrees older than cutoffDate.
`,
    `
async function hasGoneUpstreamWithNoUniqueCommits(
  worktreePath: string,
  defaultRemote: string,
): Promise<boolean> {
  const symbolicRef = await execFileNoThrowWithCwd(
    gitExe(),
    ['symbolic-ref', '-q', 'HEAD'],
    { cwd: worktreePath },
  )
  const branchRef = symbolicRef.stdout.trim()
  if (symbolicRef.code !== 0 || !branchRef) return false
  const upstream = await execFileNoThrowWithCwd(
    gitExe(),
    ['for-each-ref', '--format=%(upstream:track,nobracket)', branchRef],
    { cwd: worktreePath },
  )
  if (upstream.code !== 0 || upstream.stdout.trim() !== 'gone') return false
  const uniqueCommits = await execFileNoThrowWithCwd(
    gitExe(),
    [
      'rev-list',
      '--cherry-pick',
      '--right-only',
      '--no-merges',
      '--max-count=1',
      \`\${defaultRemote}...HEAD\`,
    ],
    { cwd: worktreePath },
  )
  return uniqueCommits.code === 0 && uniqueCommits.stdout.trim().length === 0
}

async function getDefaultRemoteRef(gitRoot: string): Promise<string | null> {
  const symbolicRef = await execFileNoThrowWithCwd(
    gitExe(),
    ['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD'],
    { cwd: gitRoot },
  )
  if (symbolicRef.code === 0 && symbolicRef.stdout.trim()) {
    return symbolicRef.stdout.trim()
  }
  for (const candidate of ['origin/main', 'origin/master']) {
    const exists = await execFileNoThrowWithCwd(
      gitExe(),
      ['rev-parse', '--verify', '-q', candidate],
      { cwd: gitRoot },
    )
    if (exists.code === 0) return candidate
  }
  return null
}

/**
 * Remove stale agent/workflow worktrees older than cutoffDate.
`,
    'target105 stale worktree helpers',
  )
  source = replaceOnce(
    source,
    `  const currentPath = currentWorktreeSession?.worktreePath
  let removed = 0
`,
    `  const currentPath = currentWorktreeSession?.worktreePath
  const defaultRemote = await getDefaultRemoteRef(gitRoot)
  let removed = 0
`,
    'target105 stale default remote',
  )
  source = replaceOnce(
    source,
    `        ['--no-optional-locks', 'status', '--porcelain', '-uno'],
`,
    `        ['--no-optional-locks', 'status', '--porcelain'],
`,
    'target105 stale untracked status',
  )
  source = replaceOnce(
    source,
    `    if (unpushed.code !== 0 || unpushed.stdout.trim().length > 0) {
      continue
    }

    if (
      await removeAgentWorktree(worktreePath, worktreeBranchName(slug), gitRoot)
    ) {
`,
    `    if (unpushed.code !== 0) {
      continue
    }
    if (
      unpushed.stdout.trim().length > 0 &&
      (defaultRemote === null ||
        !(await hasGoneUpstreamWithNoUniqueCommits(
          worktreePath,
          defaultRemote,
        )))
    ) {
      continue
    }

    if (
      await removeAgentWorktree(
        worktreePath,
        worktreeBranchName(slug),
        gitRoot,
        false,
        'stale_cleanup',
      )
    ) {
`,
    'target105 stale worktree cleanup policy',
  )
  fs.writeFileSync(filename, source)
}

function buildPrintResumeTitle101(temp) {
  const filename = path.join(temp, 'src/cli/print.ts')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    `  restoreSessionMetadata,
} from 'src/utils/sessionStorage.js'
`,
    `  restoreSessionMetadata,
  getSessionIdFromLog,
  searchSessionsByCustomTitle,
} from 'src/utils/sessionStorage.js'
`,
    'target101 print title imports',
  )
  source = replaceOnce(
    source,
    `      // In print mode - we require a valid session ID, JSONL file or URL
      const parsedSessionId = parseSessionIdentifier(
        typeof options.resume === 'string' ? options.resume : '',
      )
      if (!parsedSessionId) {
        let errorMessage =
          'Error: --resume requires a valid session ID when used with --print. Usage: claude -p --resume <session-id>'
        if (typeof options.resume === 'string') {
          errorMessage += \`. Session IDs must be in UUID format (e.g., 550e8400-e29b-41d4-a716-446655440000). Provided value "\${options.resume}" is not a valid UUID\`
        }
`,
    `      const resumeValue =
        typeof options.resume === 'string' ? options.resume.trim() : ''
      let parsedSessionId = parseSessionIdentifier(resumeValue)
      if (!parsedSessionId && resumeValue) {
        const matches = await searchSessionsByCustomTitle(resumeValue, {
          exact: true,
        })
        if (matches.length === 1) {
          const sessionId = getSessionIdFromLog(matches[0]!)
          if (sessionId) parsedSessionId = parseSessionIdentifier(sessionId)
        } else if (matches.length > 1) {
          const candidates = matches
            .map(
              match =>
                \`  \${getSessionIdFromLog(match) ?? '(unknown)'}  (modified \${match.modified.toISOString()})\`,
            )
            .join('\\n')
          emitLoadError(
            \`Error: --resume "\${resumeValue}" matches \${matches.length} sessions. Pass one of these session IDs to disambiguate:\\n\${candidates}\`,
            options.outputFormat,
          )
          gracefulShutdownSync(1)
          return { messages: [] }
        }
      }
      if (!parsedSessionId) {
        let errorMessage =
          'Error: --resume requires a valid session ID or session title when used with --print. Usage: claude -p --resume <session-id|title>'
        if (resumeValue) {
          errorMessage += \`. Provided value "\${resumeValue}" is not a UUID and does not match any session title.\`
        }
`,
    'target101 print title resume',
  )
  fs.writeFileSync(filename, source)
}

function buildLoopsCommand101(temp) {
  copyFile(temp, 'src/commands/loops/index.ts')
  copyFile(temp, 'src/commands/loops/loops.tsx')

  const loopsFilename = path.join(temp, 'src/commands/loops/loops.tsx')
  let loopsSource = fs.readFileSync(loopsFilename, 'utf8')
  loopsSource = replaceOnce(
    loopsSource,
    "import { getSessionHooks } from '../../utils/hooks/sessionHooks.js'\n",
    `import {
  addSessionHook,
  getSessionHooks,
  removeSessionHook,
} from '../../utils/hooks/sessionHooks.js'
`,
    'target101 loop command session hook imports',
  )
  loopsSource = replaceOnce(
    loopsSource,
    `  const sessionHooksRegistry = context.sessionHooksRegistry
  if (!sessionHooksRegistry) {
    throw new Error('Session hooks registry is unavailable')
  }
`,
    `  const setAppState = context.setAppStateForTasks ?? context.setAppState
`,
    'target101 loop command state bridge',
  )
  loopsSource = loopsSource
    .replace(
      "      sessionHooksRegistry.remove(sessionId, 'Stop', hook)",
      "      removeSessionHook(setAppState, sessionId, 'Stop', hook)",
    )
    .replace(
      "      sessionHooksRegistry.remove(sessionId, 'Stop', hook)",
      "      removeSessionHook(setAppState, sessionId, 'Stop', hook)",
    )
    .replace(
      "    sessionHooksRegistry.add(sessionId, 'Stop', '', {",
      "    addSessionHook(setAppState, sessionId, 'Stop', '', {",
    )
  fs.writeFileSync(loopsFilename, loopsSource)

  const commandsFilename = path.join(temp, 'src/commands.ts')
  let commandsSource = fs.readFileSync(commandsFilename, 'utf8')
  commandsSource = replaceOnce(
    commandsSource,
    "import hooks from './commands/hooks/index.js'\n",
    "import hooks from './commands/hooks/index.js'\nimport loops from './commands/loops/index.js'\n",
    'target101 loop command import',
  )
  commandsSource = replaceOnce(
    commandsSource,
    `  privacySettings,
  hooks,
  exportCommand,`,
    `  privacySettings,
  hooks,
  loops,
  exportCommand,`,
    'target101 loop command registration',
  )
  fs.writeFileSync(commandsFilename, commandsSource)
}

function buildSafetyUi101(temp) {
  applyWorkingDiff(temp, [
    'src/utils/binaryCheck.ts',
    'src/commands/keybindings/keybindings.ts',
  ])

  const reconnectFilename = path.join(
    temp,
    'src/components/mcp/utils/reconnectHelpers.tsx',
  )
  let reconnect = fs.readFileSync(reconnectFilename, 'utf8')
  reconnect = replaceOnce(
    reconnect,
    '}, serverName: string): ReconnectResult {',
    '}, serverName: string, options?: { hasHeadersHelper?: boolean }): ReconnectResult {',
    'target101 reconnect options',
  )
  reconnect = replaceOnce(
    reconnect,
    "        message: `${serverName} requires authentication. Use the 'Authenticate' option.`,",
    `        message: options?.hasHeadersHelper
          ? \`\${serverName} requires authentication. Check that the headersHelper script returns valid credentials, then use the 'Reconnect' option.\`
          : \`\${serverName} requires authentication. Use the 'Authenticate' option.\`,`,
    'target101 headers helper reconnect message',
  )
  fs.writeFileSync(reconnectFilename, reconnect)

  const remoteMenuFilename = path.join(
    temp,
    'src/components/mcp/MCPRemoteServerMenu.tsx',
  )
  let remoteMenu = fs.readFileSync(remoteMenuFilename, 'utf8')
  remoteMenu = replaceOnce(
    remoteMenu,
    `  if (server.client.type !== 'disabled') {
    if (server.client.type !== 'needs-auth') {`,
    `  const hasHeadersHelper =
    server.config.type !== 'claudeai-proxy' && !!server.config.headersHelper;
  if (server.client.type !== 'disabled') {
    if (server.client.type !== 'needs-auth' || hasHeadersHelper) {`,
    'target101 headers helper reconnect option',
  )
  remoteMenu = replaceOnce(
    remoteMenu,
    '} = handleReconnectResult(result_1, server.name);',
    `} = handleReconnectResult(result_1, server.name, {
                  hasHeadersHelper
                });`,
    'target101 headers helper reconnect call',
  )
  fs.writeFileSync(remoteMenuFilename, remoteMenu)

  const doctorFilename = path.join(temp, 'src/screens/Doctor.tsx')
  let doctor = fs.readFileSync(doctorFilename, 'utf8')
  doctor = replaceOnce(
    doctor,
    "import { pathExists } from '../utils/file.js';\n",
    "import { pathExists } from '../utils/file.js';\nimport { isEssentialTrafficOnly } from '../utils/privacyLevel.js';\n",
    'target101 Doctor privacy import',
  )
  doctor = replaceOnce(
    doctor,
    `function DistTagsDisplay(t0) {
  const $ = _c(8);
  const {
    promise
  } = t0;
  const distTags = use(promise);
  if (!distTags.latest) {
    let t1;
    if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
      t1 = <Text dimColor={true}>└ Failed to fetch versions</Text>;
      $[0] = t1;
    } else {
      t1 = $[0];
    }
    return t1;
  }
  let t1;
  if ($[1] !== distTags.stable) {
    t1 = distTags.stable && <Text>└ Stable version: {distTags.stable}</Text>;
    $[1] = distTags.stable;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  let t2;
  if ($[3] !== distTags.latest) {
    t2 = <Text>└ Latest version: {distTags.latest}</Text>;
    $[3] = distTags.latest;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  let t3;
  if ($[5] !== t1 || $[6] !== t2) {
    t3 = <>{t1}{t2}</>;
    $[5] = t1;
    $[6] = t2;
    $[7] = t3;
  } else {
    t3 = $[7];
  }
  return t3;
}`,
    `function DistTagsDisplay(t0) {
  const $ = _c(9);
  const {
    promise
  } = t0;
  const {
    tags: distTags,
    isNative
  } = use(promise);
  if (!distTags.latest) {
    let t1;
    if ($[0] !== isNative) {
      t1 = isNative && isEssentialTrafficOnly() ? <Text dimColor={true}>└ Version check skipped (essential-traffic-only mode)</Text> : <Text dimColor={true}>└ Failed to fetch versions</Text>;
      $[0] = isNative;
      $[1] = t1;
    } else {
      t1 = $[1];
    }
    return t1;
  }
  let t1;
  if ($[2] !== distTags.stable) {
    t1 = distTags.stable && <Text>└ Stable version: {distTags.stable}</Text>;
    $[2] = distTags.stable;
    $[3] = t1;
  } else {
    t1 = $[3];
  }
  let t2;
  if ($[4] !== distTags.latest) {
    t2 = <Text>└ Latest version: {distTags.latest}</Text>;
    $[4] = distTags.latest;
    $[5] = t2;
  } else {
    t2 = $[5];
  }
  let t3;
  if ($[6] !== t1 || $[7] !== t2) {
    t3 = <>{t1}{t2}</>;
    $[6] = t1;
    $[7] = t2;
    $[8] = t3;
  } else {
    t3 = $[8];
  }
  return t3;
}`,
    'target101 Doctor dist tags display',
  )
  doctor = replaceOnce(
    doctor,
    `function _temp6(diag) {
  const fetchDistTags = diag.installationType === "native" ? getGcsDistTags : getNpmDistTags;
  return fetchDistTags().catch(_temp5);
}`,
    `function _temp6(diag) {
  const isNative = diag.installationType === "native";
  const fetchDistTags = isNative ? getGcsDistTags : getNpmDistTags;
  return fetchDistTags().catch(_temp5).then(tags => ({
    tags,
    isNative
  }));
}`,
    'target101 Doctor dist tags promise',
  )
  fs.writeFileSync(doctorFilename, doctor)
}

function build101() {
  const caseName = '2.1.100-to-2.1.101'
  const temp = materialize('f03f4b89f427a311c3ae6493a5e392ef612f5d26', caseName)
  try {
    // The historical source commit does not contain this recovered owner.
    // Keep it uncommitted so the case supplement is independently applicable
    // at its introduction commit, as required by the semantic lineage audit.
    installMessageRating90(temp)
    buildMessageRatingHover101(temp)
    buildPrompt98(temp)
    applyPrompt100(temp)
    applyPrompt101(temp)
    buildLogFilters98(temp)
    buildLogPreview101(temp)
    buildResumeSelector101(temp)
    buildBetaTracingPrivacy101(temp)
    buildSingleDigitSelect101(temp)
    buildClaudeApiTrigger101(temp)
    buildWarningRuntime101(temp)
    buildLoopChainStartedAt97(temp)
    buildLoopDefaults101(temp)
    buildSdkOAuthControl101(temp)
    buildSettingsSanitization101(temp)
    buildInkEvents101(temp)
    buildInkInteractiveLifecycle101(temp)
    buildMcpDirectoryRegistry101(temp)
    buildSdkTelemetryTask101(temp)
    buildPluginTypes101(temp)
    buildPluginDependencyResolver101(temp)
    buildPluginLoader101(temp)
    buildPluginOptionsDialog101(temp)
    buildPluginSearchUi101(temp)
    buildPluginErrors101(temp)
    buildPluginOperations101(temp)
    buildPluginValidation101(temp)
    buildWorktreeRecovery101(temp)
    buildWorktreeResumeHint101(temp)
    buildLoopsCommand101(temp)
    buildSafetyUi101(temp)
    copyFile(temp, 'src/utils/settings/settingsSignal.ts')
    applyWorkingDiff(temp, [
      'src/utils/settings/changeDetector.ts',
      'src/utils/settings/settings.ts',
      'src/query/stopHooks.ts',
      'src/services/tools/StreamingToolExecutor.ts',
    ])
    applySelectedWorkingDiff(
      temp,
      'src/services/tools/toolExecution.ts',
      hunk =>
        hunk.includes('ALL_AGENT_DISALLOWED_TOOLS') ||
        hunk.includes('getUnavailableToolHint') ||
        hunk.includes('unavailableHint'),
    )
    applyWorkingDiff(temp, ['src/tools/McpAuthTool/McpAuthTool.ts'])
    applySelectedWorkingDiff(
      temp,
      'src/services/mcp/client.ts',
      hunk => hunk.includes('createMcpCompleteAuthenticationTool'),
    )
    buildPrintResumeTitle101(temp)
    // The exact target101 operation tree already contains the print-title and
    // SDK telemetry introductions. Apply it last so its print.ts rewind hunk
    // does not make buildPrintResumeTitle101 attempt a second replacement.
    buildStateOperations101(temp)
    buildRemoteIngress101(temp)
    buildAwaySummary101(temp)
    buildInvalidSettingsSeverity101(temp)
    buildFrameHtmlPermission101(temp)
    buildOpenFrameKeybinding101(temp)
    buildClientPresence101(temp)
    buildHomebrewVersion101(temp)
    buildManagedHookLoading101(temp)
    buildCcrSourceViability101(temp)
    buildInsightsPrompt101(temp)
    buildTrustedDeviceRetry101(temp)
    buildAgentTaskNotification101(temp)
    buildAgentBackgroundGuidance101(temp)
    buildToolSearchMcpNames101(temp)
    buildTeamMemoryAvailability101(temp)
    buildKeybindingLoaderState101(temp)
    buildAgentMetadataMirror101(temp)
    buildBackgroundSessionPromptSlot101(temp)
    buildUpdateCommand101(temp)
    buildKillRingContext101(temp)
    buildTeamCreateExclusive101(temp)
    buildFileSuggestionState101(temp)
    buildClassifierApprovalsState101(temp)
    buildToolProgressOverlay101(temp)
    buildRemoteTriggerRunBody101(temp)
    buildScheduleRemoteGate101(temp)
    buildComputerUseStateSlice101(temp)
    buildBashNewlineSandbox101(temp)
    buildBridgeWorktreePreservation101(temp)
    buildMcpInitHandshake101(temp)
    buildCompactHookState101(temp)
    buildRemoteSettingsValidation101(temp)
    buildStoredImageState101(temp)
    buildApiErrorRateLimit101(temp)
    buildContextUnattributed101(temp)
    buildOAuthUrlOutdent101(temp)
    buildSuggestionPadding101(temp)
    buildSessionEnvVars101(temp)
    buildCommandDisplaySearch101(temp)
    buildChromeOnboardingFocus101(temp)
    buildRemoteIoWriteTracking101(temp)
    writePatch(temp, caseName)
    const materializedRoot = process.env.CLAUDE_CODE_MIDDLE_101_MATERIALIZED_ROOT
    if (materializedRoot) {
      fs.cpSync(temp, materializedRoot, { recursive: true })
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
}

function installMessageRating90(temp) {
  const relative = 'src/components/messageRating.tsx'
  const source = path.join('/tmp/early-own-worktrees/90', relative)
  if (!fs.existsSync(source)) {
    throw new Error(`missing cumulative target90 message-rating owner ${source}`)
  }
  const destination = path.join(temp, relative)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
  normalizeTerminalNewline(temp, relative)
}

function buildMessageRatingHover101(temp) {
  const filename = path.join(temp, 'src/components/messageRating.tsx')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    'setTimeout(setHoveredMessageUuid, 150, null)',
    'setTimeout(setHoveredMessageUuid, 500, null)',
    'target101 message-rating hover delay',
  )
  fs.writeFileSync(filename, source)
}

function buildStateOperations101(temp) {
  const exactRoot = '/tmp/middle101-ops.gxySEp'
  const files = [
    'src/utils/fileHistory.ts',
    'src/utils/commitAttribution.ts',
    'src/Tool.ts',
    'src/QueryEngine.ts',
    'src/screens/REPL.tsx',
    'src/tools/FileEditTool/FileEditTool.ts',
    'src/tools/FileWriteTool/FileWriteTool.ts',
    'src/tools/NotebookEditTool/NotebookEditTool.ts',
    'src/tools/BashTool/BashTool.tsx',
    'src/utils/forkedAgent.ts',
    'src/entrypoints/mcp.ts',
    'src/types/hooks.ts',
    'src/utils/hooks.ts',
    'src/utils/handlePromptSubmit.ts',
    'src/cli/print.ts',
    'src/utils/queryContext.ts',
    'src/utils/agenticSessionSearch.ts',
  ]
  for (const relative of files) {
    const source = path.join(exactRoot, relative)
    if (!fs.existsSync(source)) {
      throw new Error(`missing exact target101 state-operation owner ${source}`)
    }
    const destination = path.join(temp, relative)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
    normalizeTerminalNewline(temp, relative)
  }
}

function buildRemoteIngress101(temp) {
  const exactRoot = '/tmp/middle101-integrated.PMUEjm'
  for (const relative of [
    'src/services/api/sessionIngress.ts',
    'src/utils/teleport/environments.ts',
    'src/utils/teleport.tsx',
    'src/hooks/useReplBridge.tsx',
  ]) {
    const source = path.join(exactRoot, relative)
    if (!fs.existsSync(source)) {
      throw new Error(`missing exact target101 remote-ingress owner ${source}`)
    }
    const destination = path.join(temp, relative)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
    normalizeTerminalNewline(temp, relative)
  }
}

function buildAwaySummary101(temp) {
  const exactRoot = '/tmp/middle101-stateverify.5NWYWM'
  for (const relative of [
    'src/services/awaySummary.ts',
    'src/hooks/useAwaySummary.ts',
  ]) {
    const source = path.join(exactRoot, relative)
    if (!fs.existsSync(source)) {
      throw new Error(`missing exact target101 away-summary owner ${source}`)
    }
    const destination = path.join(temp, relative)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
  }
}

function buildInvalidSettingsSeverity101(temp) {
  const relative = 'src/components/InvalidSettingsDialog.tsx'
  const source = path.join('/tmp/middle101-awayfinal.5q1ncC', relative)
  if (!fs.existsSync(source)) {
    throw new Error(`missing exact target101 invalid-settings owner ${source}`)
  }
  const destination = path.join(temp, relative)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.writeFileSync(destination, `${fs.readFileSync(source, 'utf8').trimEnd()}\n`)
}

function buildFrameHtmlPermission101(temp) {
  const filename = path.join(temp, 'src/utils/permissions/filesystem.ts')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    `function isSessionMemoryPath(absolutePath: string): boolean {
  // SECURITY: Normalize to prevent path traversal bypasses via .. segments
  const normalizedPath = normalize(absolutePath)
  return normalizedPath.startsWith(getSessionMemoryDir())
}
`,
    `function isSessionMemoryPath(absolutePath: string): boolean {
  // SECURITY: Normalize to prevent path traversal bypasses via .. segments
  const normalizedPath = normalize(absolutePath)
  return normalizedPath.startsWith(getSessionMemoryDir())
}

function getFrameDirectory(): string {
  return join(getProjectDir(getCwd()), getSessionId(), 'frame') + sep
}

function isFrameHtmlPath(absolutePath: string): boolean {
  return normalize(absolutePath) === join(getFrameDirectory(), 'frame.html')
}
`,
    'target101 frame HTML path helpers',
  )
  source = replaceOnce(
    source,
    `        reason: 'Plan files for current session are allowed for writing',
      },
    }
  }

  // Scratchpad directory for current session
  if (isScratchpadPath(normalizedPath)) {
`,
    `        reason: 'Plan files for current session are allowed for writing',
      },
    }
  }

  if (isFrameHtmlPath(normalizedPath)) {
    return {
      behavior: 'allow',
      updatedInput: input,
      decisionReason: {
        type: 'other',
        reason: 'Frame HTML files for current session are allowed for writing',
      },
    }
  }

  // Scratchpad directory for current session
  if (isScratchpadPath(normalizedPath)) {
`,
    'target101 frame HTML write allowance',
  )
  fs.writeFileSync(filename, source)
}

function buildOpenFrameKeybinding101(temp) {
  const filename = path.join(temp, 'src/keybindings/schema.ts')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    `  'app:globalSearch',
  'app:quickOpen',
`,
    `  'app:globalSearch',
  'app:quickOpen',
  'app:openFrame',
`,
    'target101 app:openFrame keybinding action',
  )
  fs.writeFileSync(filename, source)
}

function buildClientPresence101(temp) {
  const exactRoot = '/tmp/middle101-frameinvalid.J0vZzJ'
  for (const relative of [
    'src/bridge/clientPresence.ts',
    'src/bridge/initReplBridge.ts',
  ]) {
    const source = path.join(exactRoot, relative)
    if (!fs.existsSync(source)) {
      throw new Error(`missing exact target101 client-presence owner ${source}`)
    }
    const destination = path.join(temp, relative)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
    normalizeTerminalNewline(temp, relative)
  }
}

function buildClientPresence105(temp) {
  buildClientPresence101(temp)
  const filename = path.join(temp, 'src/bridge/clientPresence.ts')
  const source = replaceOnce(
    fs.readFileSync(filename, 'utf8'),
    "'anthropic-client-platform': 'cli'",
    "'anthropic-client-platform': 'claude_code_cli'",
    'target105 bridge presence client platform',
  )
  fs.writeFileSync(filename, source)
}

function buildHomebrewVersion101(temp) {
  const updater = path.join(temp, 'src/utils/autoUpdater.ts')
  let updaterSource = fs.readFileSync(updater, 'utf8')
  const currentUpdater = fs.readFileSync(
    path.join(root, 'src/utils/autoUpdater.ts'),
    'utf8',
  )
  const homebrewFunctions = block(
    currentUpdater,
    '/**\n * Resolve the version Homebrew currently advertises for a cask.',
    '/**\n * Get available versions from GCS bucket',
  )
  updaterSource = replaceOnce(
    updaterSource,
    '/**\n * Get available versions from GCS bucket',
    `${homebrewFunctions}/**\n * Get available versions from GCS bucket`,
    'target101 Homebrew version functions',
  )
  fs.writeFileSync(updater, updaterSource)

  const packageManager = path.join(
    temp,
    'src/components/PackageManagerAutoUpdater.tsx',
  )
  let packageSource = fs.readFileSync(packageManager, 'utf8')
  packageSource = replaceOnce(
    packageSource,
    'type AutoUpdaterResult, getLatestVersionFromGcs, getMaxVersion, shouldSkipVersion',
    'type AutoUpdaterResult, getLatestVersionForHomebrew, getLatestVersionFromGcs, getMaxVersion, shouldSkipVersion',
    'target101 PackageManagerAutoUpdater Homebrew import',
  )
  packageSource = replaceOnce(
    packageSource,
    'let latest = await getLatestVersionFromGcs(effectiveChannel);',
    'let latest = pm === "homebrew" ? await getLatestVersionForHomebrew(homebrewCaskName ?? "claude-code", effectiveChannel) : await getLatestVersionFromGcs(effectiveChannel);',
    'target101 PackageManagerAutoUpdater Homebrew lookup',
  )
  fs.writeFileSync(packageManager, packageSource)

  const updateCommand = path.join(temp, 'src/cli/update.ts')
  let updateSource = fs.readFileSync(updateCommand, 'utf8')
  updateSource = replaceOnce(
    updateSource,
    '  getLatestVersion,\n  type InstallStatus,',
    '  getLatestVersion,\n  getLatestVersionForHomebrew,\n  type InstallStatus,',
    'target101 update Homebrew import',
  )
  updateSource = replaceOnce(
    updateSource,
    `      const updateCommand = \`brew upgrade \${homebrewCaskName ?? 'claude-code'}\`
      const latest = await getLatestVersion(channel)
      if (latest && !gte(MACRO.VERSION, latest)) {
`,
    `      const updateCommand = \`brew upgrade \${homebrewCaskName ?? 'claude-code'}\`
      const latest = await getLatestVersionForHomebrew(
        homebrewCaskName ?? 'claude-code',
        channel,
      )
      if (latest === null) {
        writeToStdout(
          'Could not check for updates (network check skipped or unavailable).\\n',
        )
        writeToStdout('To update manually, run:\\n')
        writeToStdout(chalk.bold(\`  \${updateCommand}\`) + '\\n')
      } else if (!gte(MACRO.VERSION, latest)) {
`,
    'target101 update Homebrew lookup',
  )
  fs.writeFileSync(updateCommand, updateSource)
}

function buildManagedHookLoading101(temp) {
  const filename = path.join(temp, 'src/utils/sessionStart.ts')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    "import { loadPluginHooks } from './plugins/loadPluginHooks.js'\n",
    "import { loadPluginHooks } from './plugins/loadPluginHooks.js'\nimport { getManagedPluginNames } from './plugins/managedPlugins.js'\n",
    'target101 managed-plugin hook import',
  )
  const before = `if (shouldAllowManagedHooksOnly()) {
    logForDebugging('Skipping plugin hooks - allowManagedHooksOnly is enabled')
  }`
  const after = `if (shouldAllowManagedHooksOnly() && getManagedPluginNames() === null) {
    logForDebugging(
      'Skipping plugin hooks - allowManagedHooksOnly is enabled and no managed plugins',
    )
  }`
  const occurrences = source.split(before).length - 1
  if (occurrences !== 2) {
    throw new Error(
      `expected two target101 managed-hook loading branches, found ${occurrences}`,
    )
  }
  source = source.replaceAll(before, after)
  fs.writeFileSync(filename, source)
}

function buildWorktreeResumeHint101(temp) {
  const worktreeFilename = path.join(temp, 'src/utils/worktree.ts')
  let worktree = fs.readFileSync(worktreeFilename, 'utf8')
  worktree = replaceOnce(
    worktree,
    `let currentWorktreeSession: WorktreeSession | null = null

export function getCurrentWorktreeSession(): WorktreeSession | null {
  return currentWorktreeSession
}
`,
    `let currentWorktreeSession: WorktreeSession | null = null
let resumeWorktreeName: string | null = null

function setCurrentWorktreeSessionValue(
  session: WorktreeSession | null,
): void {
  currentWorktreeSession = session
  if (session) resumeWorktreeName = session.worktreeName
}

export function getCurrentWorktreeSession(): WorktreeSession | null {
  return currentWorktreeSession
}

export function getResumeWorktreeName(): string | null {
  return currentWorktreeSession?.worktreeName ?? resumeWorktreeName
}

function clearResumeWorktreeName(): void {
  resumeWorktreeName = null
}
`,
    'target101 worktree resume state',
  )
  worktree = replaceOnce(
    worktree,
    `export function restoreWorktreeSession(session: WorktreeSession | null): void {
  currentWorktreeSession = session
}`,
    `export function restoreWorktreeSession(session: WorktreeSession | null): void {
  setCurrentWorktreeSessionValue(session)
}`,
    'target101 restored worktree resume state',
  )
  worktree = replaceOnce(
    worktree,
    `
  // Save to project config for persistence
  saveCurrentProjectConfig(current => ({
`,
    `
  setCurrentWorktreeSessionValue(currentWorktreeSession)

  // Save to project config for persistence
  saveCurrentProjectConfig(current => ({
`,
    'target101 created worktree resume state',
  )
  worktree = replaceOnce(
    worktree,
    `    // Clear the session but keep the worktree intact
    currentWorktreeSession = null
`,
    `    // Clear the session but keep the worktree intact
    setCurrentWorktreeSessionValue(null)
`,
    'target101 preserved worktree resume state',
  )
  worktree = replaceOnce(
    worktree,
    `    // Clear the session
    currentWorktreeSession = null
`,
    `    // Clear the session
    setCurrentWorktreeSessionValue(null)
    clearResumeWorktreeName()
`,
    'target101 removed worktree resume state',
  )
  fs.writeFileSync(worktreeFilename, worktree)

  const shutdownFilename = path.join(temp, 'src/utils/gracefulShutdown.ts')
  let shutdown = fs.readFileSync(shutdownFilename, 'utf8')
  shutdown = replaceOnce(
    shutdown,
    "import { profileReport } from './startupProfiler.js'\n",
    "import { profileReport } from './startupProfiler.js'\nimport { getResumeWorktreeName } from './worktree.js'\n",
    'target101 worktree resume hint import',
  )
  shutdown = replaceOnce(
    shutdown,
    `      writeSync(
        1,
        chalk.dim(
          \`\\nResume this session with:\\nclaude --resume \${resumeArg}\\n\`,
        ),
      )`,
    `      const worktreeName = getResumeWorktreeName()
      const worktreeArg = worktreeName ? \`--worktree \${worktreeName} \` : ''

      writeSync(
        1,
        chalk.dim(
          \`\\nResume this session with:\\nclaude \${worktreeArg}--resume \${resumeArg}\\n\`,
        ),
      )`,
    'target101 worktree resume hint',
  )
  fs.writeFileSync(shutdownFilename, shutdown)
}

function buildCcrSourceViability101(temp) {
  const exactRoot = '/tmp/middle101-presence2.QFCZ1E'
  for (const relative of [
    'src/utils/background/remote/remoteSession.ts',
    'src/components/ultraplan/UltraplanLaunchDialog.tsx',
    'src/commands/ultraplan.tsx',
    'src/state/AppStateStore.ts',
    'src/screens/REPL.tsx',
    'src/utils/ultraplan/target98Prompts.ts',
  ]) {
    const source = path.join(exactRoot, relative)
    if (!fs.existsSync(source)) {
      throw new Error(`missing exact target101 CCR viability owner ${source}`)
    }
    const destination = path.join(temp, relative)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
    normalizeTerminalNewline(temp, relative)
  }
}

function buildInsightsPrompt101(temp) {
  applySelectedWorkingDiff(
    temp,
    'src/commands/insights.ts',
    hunk => hunk.includes('buildInsightsResponsePrompt'),
  )
}

function buildTrustedDeviceRetry101(temp) {
  const filename = path.join(temp, 'src/bridge/remoteBridgeCore.ts')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    "import { getTrustedDeviceToken } from './trustedDevice.js'",
    `import {
  clearTrustedDeviceTokenCache,
  getTrustedDeviceToken,
  isTrustedDeviceGateEnabled,
} from './trustedDevice.js'`,
    'target101 trusted-device retry imports',
  )
  source = replaceOnce(
    source,
    `import {
  createCodeSession,
  fetchRemoteCredentials as fetchRemoteCredentialsRaw,
  type RemoteCredentials,
} from './codeSessionApi.js'`,
    `import {
  createCodeSession,
  fetchRemoteCredentials as fetchRemoteCredentialsRaw,
  isRemoteCredentialsTerminal,
  type RemoteCredentials,
  type RemoteCredentialsResult,
} from './codeSessionApi.js'`,
    'target101 remote terminal credentials imports',
  )
  source = replaceBlock(
    source,
    'export async function fetchRemoteCredentials(',
    'type ArchiveStatus',
    `export async function fetchRemoteCredentials(
  sessionId: string,
  baseUrl: string,
  accessToken: string,
  timeoutMs: number,
): Promise<RemoteCredentialsResult | null> {
  const trustedDeviceToken = getTrustedDeviceToken()
  let credentials = await fetchRemoteCredentialsRaw(
    sessionId,
    baseUrl,
    accessToken,
    timeoutMs,
    trustedDeviceToken,
  )
  if (
    isRemoteCredentialsTerminal(credentials) &&
    isTrustedDeviceGateEnabled()
  ) {
    clearTrustedDeviceTokenCache()
    const freshTrustedDeviceToken = getTrustedDeviceToken()
    if (freshTrustedDeviceToken !== trustedDeviceToken) {
      logForDebugging(
        '[remote-bridge] Stale trusted-device token cache; retrying with fresh keychain read',
      )
      credentials =
        (await fetchRemoteCredentialsRaw(
          sessionId,
          baseUrl,
          accessToken,
          timeoutMs,
          freshTrustedDeviceToken,
        )) ?? credentials
    }
  }
  if (!credentials) return null
  if (isRemoteCredentialsTerminal(credentials)) {
    return isTrustedDeviceGateEnabled() ? credentials : null
  }
  return getBridgeBaseUrlOverride()
    ? { ...credentials, api_base_url: baseUrl }
    : credentials
}
`,
  )
  fs.writeFileSync(filename, source)
  applySelectedExactDiff(
    temp,
    '/tmp/middle101-integrated-final.tPpYsf',
    'src/bridge/trustedDevice.ts',
    hunk =>
      hunk.includes('readStoredTrustedDeviceToken') ||
      hunk.includes('isTrustedDeviceGateEnabled'),
  )
}

function buildBridgeWorktreePreservation101(temp) {
  applyWorkingDiff(temp, ['src/bridge/bridgeMain.ts'])

  // The source tree tracks the target116 cleanup attribution. The target101
  // introduction predates the fifth `source` argument while otherwise owning
  // this complete preservation graph.
  const filename = path.join(temp, 'src/bridge/bridgeMain.ts')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    `      worktree.gitRoot,
      worktree.hookBased,
      'bridge',
    )`,
    `      worktree.gitRoot,
      worktree.hookBased,
    )`,
    'target101 bridge worktree cleanup attribution rewind',
  )
  fs.writeFileSync(filename, source)
}

function buildAgentTaskNotification101(temp) {
  const exactRoot = '/tmp/middle101-ccr-worktree.nqgFpV'
  for (const relative of [
    'src/tools/AgentTool/runAgent.ts',
    'src/tools/TaskOutputTool/TaskOutputTool.tsx',
    'src/utils/messages.ts',
  ]) {
    const source = path.join(exactRoot, relative)
    if (!fs.existsSync(source)) {
      throw new Error(`missing exact target101 agent/task owner ${source}`)
    }
    const destination = path.join(temp, relative)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
    normalizeTerminalNewline(temp, relative)
  }
}

function buildAgentBackgroundGuidance101(temp) {
  applySelectedWorkingDiff(
    temp,
    'src/tools/AgentTool/prompt.ts',
    hunk =>
      hunk.includes(
        'unless the user explicitly asks for a progress check',
      ),
  )
  applySelectedWorkingDiff(
    temp,
    'src/tools/AgentTool/AgentTool.tsx',
    hunk =>
      hunk.includes("kind: 'background_hint'") ||
      hunk.includes("kind: 'clear'") ||
      hunk.includes('Do NOT ${FILE_READ_TOOL_NAME}'),
  )
}

function buildToolSearchMcpNames101(temp) {
  const filename = path.join(temp, 'src/tools/ToolSearchTool/ToolSearchTool.ts')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceBlock(
    source,
    'function parseToolName(',
    'function compileTermPatterns(',
    `function parseToolName(tool: Tool): {
  parts: string[]
  full: string
  isMcp: boolean
} {
  const { name } = tool
  const mcpNames = tool.mcpInfo
    ? [tool.mcpInfo.serverName, tool.mcpInfo.toolName]
    : name.startsWith('mcp__')
      ? name.replace(/^mcp__/, '').split('__')
      : undefined

  if (mcpNames) {
    const parts = mcpNames
      .flatMap(part => part.toLowerCase().split(/[\\s_.]+/))
      .filter(Boolean)
    return {
      parts,
      full: parts.join(' '),
      isMcp: true,
    }
  }

  const parts = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase()
    .split(/\\s+/)
    .filter(Boolean)

  return {
    parts,
    full: parts.join(' '),
    isMcp: false,
  }
}

`,
  )
  fs.writeFileSync(filename, source)
}

function buildTeamMemoryAvailability101(temp) {
  {
    const filename = path.join(temp, 'src/bootstrap/state.ts')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      '  isInteractive: boolean\n  kairosActive: boolean\n',
      '  isInteractive: boolean\n  hasStreamingInput: boolean\n  kairosActive: boolean\n',
      'target101 streaming-input state type',
    )
    source = replaceOnce(
      source,
      '  sdkAgentProgressSummariesEnabled: boolean\n  userMsgOptIn: boolean\n',
      `  sdkAgentProgressSummariesEnabled: boolean
  teamMemoryServerStatus:
    | 'has-content'
    | 'empty'
    | 'not-available'
    | undefined
  userMsgOptIn: boolean
`,
      'target101 team-memory status state type',
    )
    source = replaceOnce(
      source,
      '    isInteractive: false,\n    kairosActive: false,\n',
      '    isInteractive: false,\n    hasStreamingInput: false,\n    kairosActive: false,\n',
      'target101 streaming-input initial state',
    )
    source = replaceOnce(
      source,
      '    sdkAgentProgressSummariesEnabled: false,\n    userMsgOptIn: false,\n',
      '    sdkAgentProgressSummariesEnabled: false,\n    teamMemoryServerStatus: undefined,\n    userMsgOptIn: false,\n',
      'target101 team-memory status initial state',
    )
    source = replaceOnce(
      source,
      `export function setIsInteractive(value: boolean): void {
  STATE.isInteractive = value
}
`,
      `export function setIsInteractive(value: boolean): void {
  STATE.isInteractive = value
}

export function getHasStreamingInput(): boolean {
  return STATE.hasStreamingInput
}

export function setHasStreamingInput(value: boolean): void {
  STATE.hasStreamingInput = value
}
`,
      'target101 streaming-input accessors',
    )
    source = replaceOnce(
      source,
      `export function setSdkAgentProgressSummariesEnabled(value: boolean): void {
  STATE.sdkAgentProgressSummariesEnabled = value
}
`,
      `export function setSdkAgentProgressSummariesEnabled(value: boolean): void {
  STATE.sdkAgentProgressSummariesEnabled = value
}

export function getTeamMemoryServerStatus():
  | 'has-content'
  | 'empty'
  | 'not-available'
  | undefined {
  return STATE.teamMemoryServerStatus
}

export function setTeamMemoryServerStatus(
  status: 'has-content' | 'empty' | 'not-available',
): void {
  STATE.teamMemoryServerStatus = status
}
`,
      'target101 team-memory status accessors',
    )
    fs.writeFileSync(filename, source)
  }

  {
    const filename = path.join(temp, 'src/memdir/teamMemPaths.ts')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      "import { dirname, join, resolve, sep } from 'path'\n",
      "import { dirname, join, resolve, sep } from 'path'\nimport { getTeamMemoryServerStatus } from '../bootstrap/state.js'\n",
      'target101 team-memory status import',
    )
    source = replaceOnce(
      source,
      `export function getTeamMemPath(): string {
  return (join(getAutoMemPath(), 'team') + sep).normalize('NFC')
}
`,
      `export function getTeamMemPath(): string {
  return (join(getAutoMemPath(), 'team') + sep).normalize('NFC')
}

/** Team memory is usable for this cwd only after the server reports content. */
export function isTeamMemoryActiveForCwd(): boolean {
  if (!isTeamMemoryEnabled()) return false
  return getTeamMemoryServerStatus() === 'has-content'
}
`,
      'target101 team-memory cwd gate',
    )
    fs.writeFileSync(filename, source)
  }

  {
    const filename = path.join(temp, 'src/utils/hooks.ts')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      '  getSessionId,\n  getProjectRoot,\n',
      '  getSessionId,\n  getProjectRoot,\n  getHasStreamingInput,\n',
      'target101 hook streaming-input import',
    )
    source = replaceOnce(
      source,
      '  if ((hook.async || hook.asyncRewake) && !forceSyncExecution) {\n',
      `  const canAsyncRewake =
    !getIsNonInteractiveSession() || getHasStreamingInput()
  if (
    (hook.async || (hook.asyncRewake && canAsyncRewake)) &&
    !forceSyncExecution
  ) {
`,
      'target101 async-rewake streaming gate',
    )
    fs.writeFileSync(filename, source)
  }

  {
    const filename = path.join(temp, 'src/cli/print.ts')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      '  setSdkAgentProgressSummariesEnabled,\n',
      '  setSdkAgentProgressSummariesEnabled,\n  setHasStreamingInput,\n',
      'target101 print streaming-input import',
    )
    source = replaceOnce(
      source,
      '  const structuredIO = getStructuredIO(inputPrompt, options)\n',
      "  setHasStreamingInput(typeof inputPrompt !== 'string')\n  const structuredIO = getStructuredIO(inputPrompt, options)\n",
      'target101 print streaming-input setter',
    )
    fs.writeFileSync(filename, source)
  }

  {
    const filename = path.join(temp, 'src/services/teamMemorySync/index.ts')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      "import { join, relative, sep } from 'path'\n",
      "import { join, relative, sep } from 'path'\nimport { setTeamMemoryServerStatus } from '../../bootstrap/state.js'\n",
      'target101 team-memory setter import',
    )
    source = replaceOnce(
      source,
      'const MAX_CONFLICT_RETRIES = 2\n',
      "const MAX_CONFLICT_RETRIES = 2\nconst TEAM_MEMORY_FEATURE_UNAVAILABLE = 'team_memory_feature_unavailable'\n",
      'target101 feature-unavailable code',
    )
    source = replaceOnce(
      source,
      `    if (response.status === 404) {
      logForDebugging('team-memory-sync: no remote data (404)', {
        level: 'debug',
      })
      state.lastKnownChecksum = null
      return { success: true, isEmpty: true }
    }
`,
      `    if (response.status === 404) {
      const { serverErrorCode } = getServerErrorMetadataFromResponseData(
        response.data,
      )
      logForDebugging(
        \`team-memory-sync: no remote data (404, code=\${serverErrorCode ?? 'none'})\`,
        { level: 'debug' },
      )
      state.lastKnownChecksum = null
      return { success: true, isEmpty: true, serverErrorCode }
    }
`,
      'target101 404 server status',
    )
    source = replaceOnce(
      source,
      `  if (!result.success) {
    logPull(startTime, {
`,
      `  if (!result.success) {
    if (result.errorType === 'forbidden') {
      setTeamMemoryServerStatus('not-available')
    }
    logPull(startTime, {
`,
      'target101 forbidden team-memory status',
    )
    source = replaceOnce(
      source,
      `    state.serverChecksums.clear()
    logPull(startTime, { success: true })
`,
      `    state.serverChecksums.clear()
    setTeamMemoryServerStatus(
      result.serverErrorCode === TEAM_MEMORY_FEATURE_UNAVAILABLE
        ? 'not-available'
        : 'empty',
    )
    logPull(startTime, { success: true })
`,
      'target101 empty team-memory status',
    )
    source = replaceOnce(
      source,
      `  logForDebugging(\`team-memory-sync: pulled \${filesWritten} files\`, {
    level: 'info',
  })
`,
      `  const entryCount = Object.keys(entries).length
  setTeamMemoryServerStatus(entryCount > 0 ? 'has-content' : 'empty')
  logForDebugging(\`team-memory-sync: pulled \${filesWritten} files\`, {
    level: 'info',
  })
`,
      'target101 pulled-content status',
    )
    source = replaceOnce(
      source,
      '    entryCount: Object.keys(entries).length,\n',
      '    entryCount,\n',
      'target101 pulled entry count',
    )
    source = replaceOnce(
      source,
      `    if (result.success) {
      // Server-side delta propagation to disk`,
      `    if (result.success) {
      if (localHashes.size > 0) {
        setTeamMemoryServerStatus('has-content')
      }
      // Server-side delta propagation to disk`,
      'target101 pushed-content status',
    )
    fs.writeFileSync(filename, source)
  }
}

function buildKeybindingLoaderState101(temp) {
  const relative = 'src/keybindings/loadUserBindings.ts'
  const source = path.join('/tmp/middle101-ccr-worktree.nqgFpV', relative)
  if (!fs.existsSync(source)) {
    throw new Error(`missing exact target101 keybinding loader owner ${source}`)
  }
  const destination = path.join(temp, relative)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.writeFileSync(destination, `${fs.readFileSync(source, 'utf8').trimEnd()}\n`)
}

function buildAgentMetadataMirror101(temp) {
  applySelectedWorkingDiff(
    temp,
    'src/utils/sessionStorage.ts',
    hunk => hunk.includes("type: 'agent_metadata'"),
  )
}

function buildBackgroundSessionPromptSlot101(temp) {
  const filename = path.join(temp, 'src/constants/prompts.ts')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    'function buildSimpleToneAndStyleSection',
    `function getBackgroundSessionSection(): null {
  return null
}

function buildSimpleToneAndStyleSection`,
    'target101 background-session null section helper',
  )
  source = replaceOnce(
    source,
    `    systemPromptSection('output_style', () =>
      getOutputStyleSection(outputStyleConfig),
    ),`,
    `    systemPromptSection('output_style', () =>
      getOutputStyleSection(outputStyleConfig),
    ),
    systemPromptSection('bg-session', () => getBackgroundSessionSection()),`,
    'target101 background-session named section slot',
  )
  fs.writeFileSync(filename, source)
}

function buildUpdateCommand101(temp) {
  const exactRoot = '/tmp/middle101-ccr-worktree.nqgFpV'
  for (const relative of [
    'src/commands/update/index.ts',
    'src/commands/update/update.ts',
  ]) {
    const source = path.join(exactRoot, relative)
    if (!fs.existsSync(source)) {
      throw new Error(`missing exact target101 update owner ${source}`)
    }
    const destination = path.join(temp, relative)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
    normalizeTerminalNewline(temp, relative)
  }

  const filename = path.join(temp, 'src/commands.ts')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    "import theme from './commands/theme/index.js'\n",
    "import theme from './commands/theme/index.js'\nimport update from './commands/update/index.js'\n",
    'target101 hidden update command import',
  )
  source = replaceOnce(
    source,
    '  theme,\n  feedback,',
    '  theme,\n  update,\n  feedback,',
    'target101 hidden update command registration',
  )
  fs.writeFileSync(filename, source)
}

function buildKillRingContext101(temp) {
  const contextRelative = 'src/context/killRing.tsx'
  const contextFilename = path.join(temp, contextRelative)
  fs.mkdirSync(path.dirname(contextFilename), { recursive: true })
  fs.writeFileSync(
    contextFilename,
    `import React, { createContext, useContext, useRef } from 'react'

const KILL_RING_MAX_SIZE = 10

export type KillRingStore = {
  push(text: string, direction?: 'prepend' | 'append'): void
  getLastKill(): string
  getItem(index: number): string
  size(): number
  resetKillAccumulation(): void
  recordYank(start: number, length: number): void
  canYankPop(): boolean
  yankPop(): { text: string; start: number; length: number } | null
  updateYankLength(length: number): void
  resetYankState(): void
}

export function createKillRingStore(): KillRingStore {
  let ring: string[] = []
  let ringIndex = 0
  let lastActionWasKill = false
  let lastYankStart = 0
  let lastYankLength = 0
  let lastActionWasYank = false

  return {
    push(text, direction = 'append') {
      if (text.length === 0) return
      if (lastActionWasKill && ring.length > 0) {
        ring[0] =
          direction === 'prepend' ? text + ring[0] : ring[0] + text
      } else {
        ring.unshift(text)
        if (ring.length > KILL_RING_MAX_SIZE) ring.pop()
      }
      lastActionWasKill = true
      lastActionWasYank = false
    },
    getLastKill() {
      return ring[0] ?? ''
    },
    getItem(index) {
      if (ring.length === 0) return ''
      const normalizedIndex =
        ((index % ring.length) + ring.length) % ring.length
      return ring[normalizedIndex] ?? ''
    },
    size() {
      return ring.length
    },
    resetKillAccumulation() {
      lastActionWasKill = false
    },
    recordYank(start, length) {
      lastYankStart = start
      lastYankLength = length
      lastActionWasYank = true
      ringIndex = 0
    },
    canYankPop() {
      return lastActionWasYank && ring.length > 1
    },
    yankPop() {
      if (!lastActionWasYank || ring.length <= 1) return null
      ringIndex = (ringIndex + 1) % ring.length
      return {
        text: ring[ringIndex] ?? '',
        start: lastYankStart,
        length: lastYankLength,
      }
    },
    updateYankLength(length) {
      lastYankLength = length
    },
    resetYankState() {
      lastActionWasYank = false
    },
  }
}

const KillRingContext = createContext<KillRingStore>(createKillRingStore())

export function KillRingProvider({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode {
  const storeRef = useRef<KillRingStore | null>(null)
  if (storeRef.current === null) storeRef.current = createKillRingStore()
  return (
    <KillRingContext.Provider value={storeRef.current}>
      {children}
    </KillRingContext.Provider>
  )
}

export function useKillRing(): KillRingStore {
  return useContext(KillRingContext)
}
`,
  )

  const textInputFilename = path.join(temp, 'src/hooks/useTextInput.ts')
  let textInput = fs.readFileSync(textInputFilename, 'utf8')
  textInput = replaceOnce(
    textInput,
    `import {
  Cursor,
  getLastKill,
  pushToKillRing,
  recordYank,
  resetKillAccumulation,
  resetYankState,
  updateYankLength,
  yankPop,
} from '../utils/Cursor.js'`,
    `import { type KillRingStore, useKillRing } from '../context/killRing.js'
import { Cursor } from '../utils/Cursor.js'`,
    'target101 text input kill-ring imports',
  )
  textInput = replaceOnce(
    textInput,
    '  dim?: (text: string) => string\n}',
    '  dim?: (text: string) => string\n  killRing?: KillRingStore\n}',
    'target101 text input kill-ring property',
  )
  textInput = replaceOnce(
    textInput,
    '  dim,\n}: UseTextInputProps): TextInputState {',
    `  dim,
  killRing: providedKillRing,
}: UseTextInputProps): TextInputState {
  const contextKillRing = useKillRing()
  const killRing = providedKillRing ?? contextKillRing`,
    'target101 text input kill-ring binding',
  )
  for (const [before, after] of [
    ['pushToKillRing(', 'killRing.push('],
    ['getLastKill()', 'killRing.getLastKill()'],
    ['recordYank(', 'killRing.recordYank('],
    ['yankPop()', 'killRing.yankPop()'],
    ['updateYankLength(', 'killRing.updateYankLength('],
    ['resetKillAccumulation()', 'killRing.resetKillAccumulation()'],
    ['resetYankState()', 'killRing.resetYankState()'],
  ]) textInput = textInput.replaceAll(before, after)
  fs.writeFileSync(textInputFilename, textInput)

  const searchFilename = path.join(temp, 'src/hooks/useSearchInput.ts')
  let search = fs.readFileSync(searchFilename, 'utf8')
  search = replaceOnce(
    search,
    `import {
  Cursor,
  getLastKill,
  pushToKillRing,
  recordYank,
  resetKillAccumulation,
  resetYankState,
  updateYankLength,
  yankPop,
} from '../utils/Cursor.js'`,
    `import { type KillRingStore, useKillRing } from '../context/killRing.js'
import { Cursor } from '../utils/Cursor.js'`,
    'target101 search input kill-ring imports',
  )
  search = replaceOnce(
    search,
    '  backspaceExitsOnEmpty?: boolean\n}',
    `  backspaceExitsOnEmpty?: boolean
  multiline?: boolean
  onSpaceOnEmpty?: () => void
  killRing?: KillRingStore
}`,
    'target101 search input options',
  )
  search = replaceOnce(
    search,
    '  handleKeyDown: (e: KeyboardEvent) => void\n}',
    `  handleKeyDown: (e: KeyboardEvent) => void
  handlePaste: (e: { text: string; preventDefault(): void }) => void
}`,
    'target101 search input paste return',
  )
  search = replaceOnce(
    search,
    `  initialQuery = '',
  backspaceExitsOnEmpty = true,
}: UseSearchInputOptions): UseSearchInputReturn {`,
    `  initialQuery = '',
  backspaceExitsOnEmpty = true,
  multiline = false,
  onSpaceOnEmpty,
  killRing: providedKillRing,
}: UseSearchInputOptions): UseSearchInputReturn {
  const contextKillRing = useKillRing()
  const killRing = providedKillRing ?? contextKillRing`,
    'target101 search input kill-ring binding',
  )
  search = replaceOnce(
    search,
    `    // Exit conditions
    if (e.key === 'return' || e.key === 'down') {
      e.preventDefault()
      onExit()
      return
    }`,
    `    // Exit conditions
    if (e.key === 'return') {
      e.preventDefault()
      if (multiline) {
        if (cursorOffset > 0 && query[cursorOffset - 1] === '\\\\') {
          setQueryState(
            query.slice(0, cursorOffset - 1) + '\\n' + query.slice(cursorOffset),
          )
          return
        }
        if (e.shift || e.meta) {
          setQueryState(
            query.slice(0, cursorOffset) + '\\n' + query.slice(cursorOffset),
          )
          setCursorOffset(cursorOffset + 1)
          return
        }
      }
      onExit()
      return
    }
    if (e.key === 'down') {
      e.preventDefault()
      if (!multiline) onExit()
      return
    }`,
    'target101 search input multiline return',
  )
  search = replaceOnce(
    search,
    `    // Tab: ignore
    if (e.key === 'tab') {
      return
    }

    // Regular character input.`,
    `    // Tab: ignore
    if (e.key === 'tab') return

    if (onSpaceOnEmpty && e.key === ' ' && query === '') {
      e.preventDefault()
      onSpaceOnEmpty()
      return
    }

    // Regular character input.`,
    'target101 search input empty-space callback',
  )
  search = replaceOnce(
    search,
    `  // Backward-compat bridge: existing consumers don't yet wire handleKeyDown
  // to <Box onKeyDown>. Subscribe via useInput and adapt InputEvent →
  // KeyboardEvent until all 11 call sites are migrated (separate PRs).
  // TODO(onKeyDown-migration): remove once all consumers pass handleKeyDown.
  useInput(
    (_input, _key, event) => {
      handleKeyDown(new KeyboardEvent(event.keypress))
    },
    { isActive },
  )

  return { query, setQuery, cursorOffset, handleKeyDown }`,
    `  const handlePaste = (event: {
    text: string
    preventDefault(): void
  }): void => {
    if (!isActive || event.text.length === 0) return
    event.preventDefault()
    const text = multiline
      ? event.text
      : (event.text.split(/\\r\\n|\\r|\\n/, 2)[0] ?? '')
    if (text.length === 0) return
    const next = Cursor.fromText(query, effectiveColumns, cursorOffset).insert(text)
    setQueryState(next.text)
    setCursorOffset(next.offset)
  }

  // Retain the target101 raw-mode subscription while key and paste handling
  // are dispatched by the returned handlers.
  useInput(() => {}, { isActive })

  return { query, setQuery, cursorOffset, handleKeyDown, handlePaste }`,
    'target101 search input paste handler and raw-mode subscription',
  )
  for (const [before, after] of [
    ['pushToKillRing(', 'killRing.push('],
    ['getLastKill()', 'killRing.getLastKill()'],
    ['recordYank(', 'killRing.recordYank('],
    ['yankPop()', 'killRing.yankPop()'],
    ['updateYankLength(', 'killRing.updateYankLength('],
    ['resetKillAccumulation()', 'killRing.resetKillAccumulation()'],
    ['resetYankState()', 'killRing.resetYankState()'],
  ]) search = search.replaceAll(before, after)
  fs.writeFileSync(searchFilename, search)

  const appFilename = path.join(temp, 'src/components/App.tsx')
  let app = fs.readFileSync(appFilename, 'utf8')
  app = replaceOnce(
    app,
    "import { FpsMetricsProvider } from '../context/fpsMetrics.js';\n",
    "import { FpsMetricsProvider } from '../context/fpsMetrics.js';\nimport { KillRingProvider } from '../context/killRing.js';\n",
    'target101 app kill-ring provider import',
  )
  app = replaceOnce(
    app,
    '<AppStateProvider initialState={initialState} onChangeAppState={onChangeAppState}>{children}</AppStateProvider>',
    '<AppStateProvider initialState={initialState} onChangeAppState={onChangeAppState}><KillRingProvider>{children}</KillRingProvider></AppStateProvider>',
    'target101 app kill-ring provider reachability',
  )
  fs.writeFileSync(appFilename, app)
}

function buildTeamCreateExclusive101(temp) {
  const helpersFilename = path.join(temp, 'src/utils/swarm/teamHelpers.ts')
  let helpers = fs.readFileSync(helpersFilename, 'utf8')
  helpers = replaceOnce(
    helpers,
    `export async function writeTeamFileAsync(
  teamName: string,
  teamFile: TeamFile,
): Promise<void> {
  const teamDir = getTeamDir(teamName)
  await mkdir(teamDir, { recursive: true })
  await writeFile(getTeamFilePath(teamName), jsonStringify(teamFile, null, 2))
}`,
    `export async function writeTeamFileAsync(
  teamName: string,
  teamFile: TeamFile,
  options?: { exclusive?: boolean },
): Promise<void> {
  const teamDir = getTeamDir(teamName)
  await mkdir(teamDir, { recursive: true })
  await writeFile(
    getTeamFilePath(teamName),
    jsonStringify(teamFile, null, 2),
    options?.exclusive ? { flag: 'wx' } : undefined,
  )
}`,
    'target101 exclusive team-file writer',
  )
  fs.writeFileSync(helpersFilename, helpers)

  const toolFilename = path.join(
    temp,
    'src/tools/TeamCreateTool/TeamCreateTool.ts',
  )
  let tool = fs.readFileSync(toolFilename, 'utf8')
  tool = replaceOnce(
    tool,
    "import { jsonStringify } from '../../utils/slowOperations.js'\n",
    "import { getErrnoCode, getErrnoPath } from '../../utils/errors.js'\nimport { jsonStringify } from '../../utils/slowOperations.js'\n",
    'target101 TeamCreate errno imports',
  )
  tool = replaceOnce(
    tool,
    '  getTeamFilePath,\n  readTeamFile,\n',
    '  getTeamFilePath,\n',
    'target101 TeamCreate removes preflight read',
  )
  tool = replaceOnce(
    tool,
    "import { generateWordSlug } from '../../utils/words.js'\n",
    '',
    'target101 TeamCreate removes generated-name import',
  )
  tool = replaceBlock(
    tool,
    '/**\n * Generates a unique team name',
    'export const TeamCreateTool:',
    '',
  )
  tool = replaceOnce(
    tool,
    `    // If team already exists, generate a unique name instead of failing
    const finalTeamName = generateUniqueTeamName(team_name)`,
    '    const finalTeamName = team_name',
    'target101 TeamCreate preserves requested name',
  )
  tool = replaceOnce(
    tool,
    '    await writeTeamFileAsync(finalTeamName, teamFile)',
    `    try {
      await writeTeamFileAsync(finalTeamName, teamFile, { exclusive: true })
    } catch (error) {
      if (
        getErrnoCode(error) === 'EEXIST' &&
        getErrnoPath(error) === teamFilePath
      ) {
        throw new Error(
          \`Team "\${finalTeamName}" already exists at \${teamFilePath}. Choose a different team_name, or run TeamDelete on the existing team first.\`,
        )
      }
      throw error
    }`,
    'target101 TeamCreate exclusive collision error',
  )
  fs.writeFileSync(toolFilename, tool)
}

function buildFileSuggestionState101(temp) {
  const relative = 'src/hooks/fileSuggestions.ts'
  const source = path.join('/tmp/middle101-killring.xITrPI', relative)
  if (!fs.existsSync(source)) {
    throw new Error(`missing exact target101 file-suggestion owner ${source}`)
  }
  const destination = path.join(temp, relative)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
  normalizeTerminalNewline(temp, relative)
}

function buildClassifierApprovalsState101(temp) {
  const exactRoot = '/tmp/middle101-killring.xITrPI'
  const classifierOwners = [
    'src/state/AppStateStore.ts',
    'src/main.tsx',
    'src/utils/classifierApprovals.ts',
    'src/utils/classifierApprovalsHook.ts',
    'src/components/messages/UserToolResultMessage/UserToolSuccessMessage.tsx',
    'src/hooks/useCanUseTool.tsx',
    'src/hooks/toolPermission/PermissionContext.ts',
    'src/hooks/toolPermission/handlers/interactiveHandler.ts',
    'src/utils/permissions/permissions.ts',
  ]
  for (const relative of classifierOwners) {
    applySelectedExactDiff(
      temp,
      exactRoot,
      relative,
      hunk => /classifierApprovals|ClassifierApproval|ClassifierChecking|classifierRule|yoloReason|appStateStore/.test(hunk),
    )
  }

  for (const relative of [
    'src/services/compact/postCompactCleanup.ts',
    'src/services/compact/autoCompact.ts',
    'src/commands/compact/compact.ts',
    'src/commands/clear/caches.ts',
    'src/commands/clear/conversation.ts',
    'src/screens/REPL.tsx',
  ]) {
    applySelectedExactDiff(
      temp,
      exactRoot,
      relative,
      hunk => /runPostCompactCleanup|clearSessionCaches|clearClassifierApprovals|AppState/.test(hunk),
    )
  }
}

function buildToolProgressOverlay101(temp) {
  const exactRoot = '/tmp/middle101-toolprogress.exact'
  for (const relative of [
    'src/components/SessionBackgroundHint.tsx',
    'src/components/ToolProgressOverlay.tsx',
  ]) {
    const source = path.join(exactRoot, relative)
    if (!fs.existsSync(source)) {
      throw new Error(`missing exact target101 tool-progress owner ${source}`)
    }
    const destination = path.join(temp, relative)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
    normalizeTerminalNewline(temp, relative)
  }

  for (const relative of [
    'src/Tool.ts',
    'src/tools/BashTool/BashTool.tsx',
    'src/tools/PowerShellTool/PowerShellTool.tsx',
    'src/screens/REPL.tsx',
  ]) {
    applySelectedExactDiff(
      temp,
      exactRoot,
      relative,
      hunk => /ToolProgressOverlay|toolProgressOverlays|emitToolProgress|background_hint|SessionBackgroundHint/.test(hunk),
    )
  }
}

function buildRemoteTriggerRunBody101(temp) {
  for (const relative of [
    'src/tools/RemoteTriggerTool/prompt.ts',
    'src/tools/RemoteTriggerTool/RemoteTriggerTool.ts',
  ]) {
    copyFile(temp, relative)
  }

  // Target101 introduces the optional run payload, the trigger-id injection,
  // and the local-only gate. The schema copy evolves later (105+), so retain
  // the exact target101 description in this introduction supplement.
  const filename = path.join(
    temp,
    'src/tools/RemoteTriggerTool/RemoteTriggerTool.ts',
  )
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    ".describe('Required for create and update; optional for run'),",
    ".describe('JSON body for create and update'),",
    'target101 remote-trigger schema description',
  )
  fs.writeFileSync(filename, source)
}

function buildScheduleRemoteGate101(temp) {
  const filename = path.join(
    temp,
    'src/skills/bundled/scheduleRemoteAgents.ts',
  )
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    "import { logForDebugging } from '../../utils/debug.js'\n",
    "import { logForDebugging } from '../../utils/debug.js'\nimport { isEnvTruthy } from '../../utils/envUtils.js'\n",
    'target101 schedule remote-session gate import',
  )
  source = replaceOnce(
    source,
    `    isEnabled: () =>
      getFeatureValue_CACHED_MAY_BE_STALE('tengu_surreal_dali', false) &&
      isPolicyAllowed('allow_remote_sessions'),`,
    `    isEnabled: () =>
      !isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) &&
      getFeatureValue_CACHED_MAY_BE_STALE('tengu_surreal_dali', false) &&
      isPolicyAllowed('allow_remote_sessions'),`,
    'target101 schedule remote-session gate predicate',
  )
  fs.writeFileSync(filename, source)
}

function buildComputerUseStateSlice101(temp) {
  {
    const relative = 'src/utils/computerUse/cleanup.ts'
    const filename = path.join(temp, relative)
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      "    'getAppState' | 'setAppState' | 'sendOSNotification'\n",
      "    'getAppState' | 'setComputerUseMcpState' | 'sendOSNotification'\n",
      'target101 cleanup setter type',
    )
    source = replaceOnce(
      source,
      `    ctx.setAppState(prev =>
      prev.computerUseMcpState?.hiddenDuringTurn === undefined
        ? prev
        : {
            ...prev,
            computerUseMcpState: {
              ...prev.computerUseMcpState,
              hiddenDuringTurn: undefined,
            },
          },
    )`,
      `    ctx.setComputerUseMcpState?.(prev =>
      prev?.hiddenDuringTurn === undefined
        ? prev
        : { ...prev, hiddenDuringTurn: undefined },
    )`,
      'target101 cleanup slice update',
    )
    fs.writeFileSync(filename, source)
  }

  {
    const relative = 'src/utils/computerUse/wrapper.tsx'
    const filename = path.join(temp, relative)
    const current = fs.readFileSync(path.join(root, relative), 'utf8')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceBlock(
      source,
      '    onAllowedAppsChanged:',
      '    // ── Lock',
      block(current, '    onAllowedAppsChanged:', '    // ── Lock'),
    )
    fs.writeFileSync(filename, source)
  }

  {
    const filename = path.join(temp, 'src/Tool.ts')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      '  setAppStateForTasks?: (f: (prev: AppState) => AppState) => void\n',
      `  setAppStateForTasks?: (f: (prev: AppState) => AppState) => void
  setComputerUseMcpState?: (
    f: (
      prev: AppState['computerUseMcpState'],
    ) => AppState['computerUseMcpState'],
  ) => void
`,
      'target101 computer-use slice setter type',
    )
    fs.writeFileSync(filename, source)
  }

  {
    const filename = path.join(temp, 'src/utils/forkedAgent.ts')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      `    setAppStateForTasks:
      parentContext.setAppStateForTasks ?? parentContext.setAppState,
`,
      `    setAppStateForTasks:
      parentContext.setAppStateForTasks ?? parentContext.setAppState,
    setComputerUseMcpState: overrides?.shareSetAppState
      ? parentContext.setComputerUseMcpState
      : undefined,
`,
      'target101 forked computer-use slice sharing',
    )
    fs.writeFileSync(filename, source)
  }

  {
    const filename = path.join(temp, 'src/screens/REPL.tsx')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      `      getAppState: () => store.getState(),
      setAppState,
      messages,
`,
      `      getAppState: () => store.getState(),
      setAppState,
      setComputerUseMcpState(update) {
        setAppState(previous => {
          const computerUseMcpState = update(previous.computerUseMcpState);
          if (computerUseMcpState === previous.computerUseMcpState) {
            return previous;
          }
          return { ...previous, computerUseMcpState };
        });
      },
      messages,
`,
      'target101 REPL computer-use slice setter',
    )
    fs.writeFileSync(filename, source)
  }
}

function buildBashNewlineSandbox101(temp) {
  {
    const filename = path.join(temp, 'src/utils/bash/ast.ts')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      'export type SemanticCheckResult = { ok: true } | { ok: false; reason: string }\n',
      `export type SemanticCheckResult =
  | { ok: true }
  | { ok: false; reason: string; kind?: 'newline-hash' }
`,
      'target101 newline-hash semantic result type',
    )
    source = replaceOnce(
      source,
      'export function checkSemantics(commands: SimpleCommand[]): SemanticCheckResult {\n',
      `export function checkSemantics(commands: SimpleCommand[]): SemanticCheckResult {
  let newlineHashFailure: SemanticCheckResult | null = null
`,
      'target101 deferred newline-hash result',
    )
    for (const [subject, reason] of [
      [
        'arg',
        'Newline followed by # inside a quoted argument can hide arguments from path validation',
      ],
      [
        'ev.value',
        'Newline followed by # inside an env var value can hide arguments from path validation',
      ],
      [
        'r.target',
        'Newline followed by # inside a redirect target can hide arguments from path validation',
      ],
    ]) {
      source = replaceOnce(
        source,
        `      if (${subject}.includes('\\n') && NEWLINE_HASH_RE.test(${subject})) {
        return {
          ok: false,
          reason:
            '${reason}',
        }
      }`,
        `      if (${subject}.includes('\\n') && NEWLINE_HASH_RE.test(${subject})) {
        newlineHashFailure ??= {
          ok: false,
          kind: 'newline-hash',
          reason:
            '${reason}',
        }
      }`,
        `target101 ${subject} newline-hash result`,
      )
    }
    source = replaceOnce(
      source,
      '  return { ok: true }\n}\n',
      '  if (newlineHashFailure) return newlineHashFailure\n  return { ok: true }\n}\n',
      'target101 deferred newline-hash return',
    )
    fs.writeFileSync(filename, source)
  }

  {
    const filename = path.join(temp, 'src/tools/BashTool/bashPermissions.ts')
    let source = fs.readFileSync(filename, 'utf8')
    const helper = `
/**
 * Apply sandbox auto-allow only when the parsed argv does not contain an
 * unsafe environment assignment or a network-device redirect.
 */
function checkAstSandboxAutoAllow(
  input: z.infer<typeof BashTool.inputSchema>,
  toolPermissionContext: ToolPermissionContext,
  commands: SimpleCommand[],
): PermissionResult | null {
  if (
    !SandboxManager.isSandboxingEnabled() ||
    !SandboxManager.isAutoAllowBashIfSandboxedEnabled() ||
    !shouldUseSandbox(input)
  ) {
    return null
  }
  const result = checkSandboxAutoAllow(input, toolPermissionContext)
  if (result.behavior === 'passthrough') return null
  const assignmentStart = /^([A-Za-z_][A-Za-z0-9_]*)\\+?=/
  const hasUnsafeEnvironment = commands.some(
    command =>
      command.envVars.some(env => !isSafeEnvironmentVariable(env.name)) ||
      command.argv.some(argument => {
        const assignment = argument.match(assignmentStart)
        return (
          assignment !== null &&
          !isSafeEnvironmentVariable(assignment[1]!)
        )
      }),
  )
  const hasNetworkDeviceRedirect = commands.some(command =>
    command.redirects.some(redirect =>
      /^\\/dev\\/(tcp|udp)\\//.test(redirect.target),
    ),
  )
  if (hasUnsafeEnvironment || hasNetworkDeviceRedirect) return null
  return result
}
`
    source = replaceOnce(
      source,
      '/**\n * Filter out `cd ${cwd}` prefix subcommands, keeping astCommands aligned.\n',
      `${helper}\n/**\n * Filter out \`cd \${cwd}\` prefix subcommands, keeping astCommands aligned.\n`,
      'target101 AST sandbox helper insertion',
    )
    source = replaceOnce(
      source,
      `      if (earlyExit !== null) return earlyExit
      const decisionReason: PermissionDecisionReason = {`,
      `      if (earlyExit !== null) return earlyExit
      if (sem.kind === 'newline-hash') {
        const sandboxResult = checkAstSandboxAutoAllow(
          input,
          appState.toolPermissionContext,
          astResult.commands,
        )
        if (sandboxResult) return sandboxResult
      }
      const decisionReason: PermissionDecisionReason = {`,
      'target101 newline-hash sandbox path',
    )
    const sandboxStart = source.indexOf(
      '  // Check sandbox auto-allow (which respects explicit deny/ask rules)\n',
    )
    const exactMatchStart = source.indexOf(
      '  // Check exact match first\n',
      sandboxStart,
    )
    if (sandboxStart < 0 || exactMatchStart < 0) {
      throw new Error('missing target101 inline sandbox block')
    }
    source =
      source.slice(0, sandboxStart) +
      `  const sandboxAutoAllowResult = checkAstSandboxAutoAllow(
    input,
    appState.toolPermissionContext,
    astCommands ?? [],
  )
  if (sandboxAutoAllowResult) return sandboxAutoAllowResult

` +
      source.slice(exactMatchStart)
    fs.writeFileSync(filename, source)
  }
}

function buildMcpInitHandshake101(temp) {
  const exactRoot = '/tmp/middle101-remote.QaplzP'
  for (const relative of [
    'src/services/mcp/headlessConnectionManager.ts',
    'src/entrypoints/mcp.ts',
  ]) {
    const source = path.join(exactRoot, relative)
    if (!fs.existsSync(source)) {
      throw new Error(`missing exact target101 MCP-init owner ${source}`)
    }
    const destination = path.join(temp, relative)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
    normalizeTerminalNewline(temp, relative)
  }
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/main.tsx',
    hunk =>
      /createHeadlessMcpConnectionManager|headlessMcpConnectionManager|if \(false\)/.test(
        hunk,
      ),
  )
  const mainFilename = path.join(temp, 'src/main.tsx')
  let main = fs.readFileSync(mainFilename, 'utf8')
  const legacyEnd = `      profileCheckpoint('after_connectMcp_claudeai');

      // In headless mode, start deferred prefetches immediately`
  if (main.includes(legacyEnd)) {
    main = replaceOnce(
      main,
      legacyEnd,
      `      profileCheckpoint('after_connectMcp_claudeai');
      }

      // In headless mode, start deferred prefetches immediately`,
      'target101 unreachable legacy MCP block close',
    )
  }
  fs.writeFileSync(mainFilename, main)
}

function buildCompactHookState101(temp) {
  const exactRoot = '/tmp/middle101-integrated-final.tPpYsf'
  for (const relative of [
    'src/QueryEngine.ts',
    'src/Tool.ts',
    'src/commands/compact/compact.ts',
    'src/query.ts',
    'src/screens/REPL.tsx',
    'src/services/compact/compact.ts',
    'src/utils/forkedAgent.ts',
    'src/utils/handlePromptSubmit.ts',
    'src/utils/hooks/execAgentHook.ts',
    'src/utils/hooks/execPromptHook.ts',
    'src/utils/hooks.ts',
    'src/utils/queryContext.ts',
  ]) {
    const source = path.join(exactRoot, relative)
    if (!fs.existsSync(source)) {
      throw new Error(`missing exact target101 compact/hook owner ${source}`)
    }
    const destination = path.join(temp, relative)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
    normalizeTerminalNewline(temp, relative)
  }
}

function buildRemoteSettingsValidation101(temp) {
  const relative = 'src/services/remoteManagedSettings/index.ts'
  const source = path.join('/tmp/middle101-integrated-final.tPpYsf', relative)
  if (!fs.existsSync(source)) {
    throw new Error(`missing exact target101 remote-settings owner ${source}`)
  }
  const destination = path.join(temp, relative)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
  normalizeTerminalNewline(temp, relative)
}

function buildStoredImageState101(temp) {
  const exactRoot = '/tmp/middle101-integrated-final.tPpYsf'
  for (const relative of [
    'src/state/AppStateStore.ts',
    'src/main.tsx',
    'src/utils/imageStore.ts',
    'src/utils/processUserInput/processUserInput.ts',
    'src/commands/clear/caches.ts',
    'src/components/ClickableImageRef.tsx',
    'src/components/messages/UserImageMessage.tsx',
    'src/components/PromptInput/PromptInput.tsx',
    'src/components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx',
    'src/components/permissions/AskUserQuestionPermissionRequest/AskUserQuestionPermissionRequest.tsx',
  ]) {
    const source = path.join(exactRoot, relative)
    if (!fs.existsSync(source)) {
      throw new Error(`missing exact target101 stored-image owner ${source}`)
    }
    const destination = path.join(temp, relative)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
    normalizeTerminalNewline(temp, relative)
  }
}

function buildApiErrorRateLimit101(temp) {
  const relative = 'src/components/messages/SystemAPIErrorMessage.tsx'
  const source = path.join('/tmp/middle101-integrated-final.tPpYsf', relative)
  if (!fs.existsSync(source)) {
    throw new Error(`missing exact target101 API-error owner ${source}`)
  }
  const destination = path.join(temp, relative)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
  normalizeTerminalNewline(temp, relative)
}

function buildContextUnattributed101(temp) {
  const exactRoot = '/tmp/middle101-integrated-final.tPpYsf'
  for (const relative of [
    'src/utils/analyzeContext.ts',
    'src/entrypoints/sdk/controlSchemas.ts',
  ]) {
    const source = path.join(exactRoot, relative)
    if (!fs.existsSync(source)) {
      throw new Error(`missing exact target101 context-accounting owner ${source}`)
    }
    const destination = path.join(temp, relative)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
    normalizeTerminalNewline(temp, relative)
  }
}

function buildOAuthUrlOutdent101(temp) {
  const exactRoot = '/tmp/middle101-integrated-final.tPpYsf'
  for (const relative of [
    'src/components/ConsoleOAuthFlow.tsx',
    'src/commands/login/login.tsx',
  ]) {
    applySelectedExactDiff(
      temp,
      exactRoot,
      relative,
      hunk =>
        hunk.includes('urlOutdent') || hunk.includes('effectiveUrlOutdent'),
    )
  }
}

function buildSuggestionPadding101(temp) {
  const exactRoot = '/tmp/middle101-integrated-final.tPpYsf'
  const relative = 'src/components/PromptInput/PromptInputFooterSuggestions.tsx'
  applySelectedExactDiff(
    temp,
    exactRoot,
    relative,
    hunk =>
      hunk.includes('noPad') ||
      hunk.includes('paddingRows') ||
      hunk.includes('pad-${index}'),
  )
}

function buildSessionEnvVars101(temp) {
  const exactRoot = '/tmp/middle101-integrated-final.tPpYsf'
  const relatives = [
    'src/utils/Shell.ts',
    'src/utils/shell/shellProvider.ts',
    'src/utils/shell/bashProvider.ts',
    'src/utils/shell/powershellProvider.ts',
    'src/tools/BashTool/BashTool.tsx',
    'src/tools/PowerShellTool/PowerShellTool.tsx',
    'src/utils/forkedAgent.ts',
    'src/commands/clear/conversation.ts',
    'src/utils/bash/shellCompletion.ts',
    'src/hooks/useTypeahead.tsx',
    'src/components/PromptInput/PromptInput.tsx',
    'src/screens/REPL.tsx',
    'src/cli/print.ts',
    'src/QueryEngine.ts',
    'src/Tool.ts',
  ]
  for (const relative of relatives) {
    applySelectedExactDiff(
      temp,
      exactRoot,
      relative,
      hunk =>
        hunk.includes('sessionEnvVars') ||
        hunk.includes('getSessionEnvVars') ||
        (relative === 'src/utils/shell/bashProvider.ts' &&
          (hunk.includes('REMOTE_BUN_SOFT_DATA_LIMIT_KB') ||
            hunk.includes('ulimit -Sd '))),
    )
  }
}

function buildCommandDisplaySearch101(temp) {
  const exactRoot = '/tmp/middle101-integrated-final.tPpYsf'
  const relative = 'src/utils/suggestions/commandSuggestions.ts'
  applySelectedExactDiff(
    temp,
    exactRoot,
    relative,
    hunk =>
      hunk.includes('displayPartKey') ||
      hunk.includes('const commandName = cmd.name') ||
      hunk.includes("name: 'displayName'"),
  )
}

function buildChromeOnboardingFocus101(temp) {
  const exactRoot = '/tmp/middle101-integrated-final.tPpYsf'
  const relative = 'src/components/ClaudeInChromeOnboarding.tsx'
  applySelectedExactDiff(
    temp,
    exactRoot,
    relative,
    hunk =>
      hunk.includes("import { Box, Link, Newline, Text }") ||
      hunk.includes('_c(21)') ||
      hunk.includes("key.key === 'return'") ||
      hunk.includes('useInput(t3)') ||
      hunk.includes('tabIndex={0}'),
  )
}

function buildRemoteIoWriteTracking101(temp) {
  const exactRoot = '/tmp/middle101-integrated-final.tPpYsf'
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/cli/remoteIO.ts',
    hunk => hunk.includes('this.trackWrite(message)'),
  )
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/cli/structuredIO.ts',
    hunk => hunk.includes('protected trackWrite'),
  )
}

function build104() {
  const caseName = '2.1.101-to-2.1.104'
  const temp = materialize('0d70d13694c24c8dbe822d6f5705a0449e1d0a34', caseName)
  try {
    buildPrompt98(temp)
    applyPrompt100(temp)
    applyPrompt101(temp)
    const filename = path.join(temp, 'src/constants/prompts.ts')
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      '# Communication style',
      '# Text output (does not apply to tool calls)',
      '2.1.104 communication heading',
    )
    fs.writeFileSync(filename, source)
    writePatch(temp, caseName)
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
}

function buildPluginDependencyInstall105(temp) {
  copyFile(temp, 'src/utils/plugins/pluginDependencyInstaller.ts')

  for (const [relative, importAfter, insertionBefore, subject] of [
    [
      'src/utils/plugins/pluginLoader.ts',
      "import { parsePluginIdentifier } from './pluginIdentifier.js'\n",
      '  // Zip cache mode: convert directory to ZIP and remove the directory\n',
      'pluginId',
    ],
    [
      'src/utils/plugins/pluginInstallationHelpers.ts',
      "import {\n  addInstalledPlugin,\n  getGitCommitSha,\n} from './installedPluginsManager.js'\n",
      '  // Zip cache mode: convert directory to ZIP and remove the directory\n',
      'pluginId',
    ],
  ]) {
    const filename = path.join(temp, relative)
    let source = fs.readFileSync(filename, 'utf8')
    source = replaceOnce(
      source,
      importAfter,
      `${importAfter}import { installPluginDependencies } from './pluginDependencyInstaller.js'\n`,
      `${relative} dependency installer import`,
    )
    source = replaceOnce(
      source,
      insertionBefore,
      `  const dependencyInstall = await installPluginDependencies(${relative.endsWith('pluginLoader.ts') ? 'cachePath' : 'finalPath'})\n  if (dependencyInstall.error) {\n    logForDebugging(\n      \`Plugin dependency install warning for \${${subject}}: \${dependencyInstall.error}\`,\n      { level: 'warn' },\n    )\n  }\n\n${insertionBefore}`,
      `${relative} dependency installer call`,
    )
    fs.writeFileSync(filename, source)
  }
}

function buildManagedAgentDocs105(temp) {
  const bundle = fs.readFileSync(
    '/tmp/claude-middle-audit.DB5eTC/2.1.105/package/cli.js',
    'utf8',
  )
  const ast = parse(bundle, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    allowHashBang: true,
  })
  const declarations = new Map()
  for (const statement of ast.body) {
    if (statement.type !== 'VariableDeclaration') continue
    for (const declaration of statement.declarations) {
      if (declaration.id.type !== 'Identifier' || !declaration.init) continue
      if (
        declaration.init.type === 'Literal' &&
        typeof declaration.init.value === 'string'
      ) {
        declarations.set(declaration.id.name, declaration.init.value)
      } else if (
        declaration.init.type === 'TemplateLiteral' &&
        declaration.init.expressions.length === 0
      ) {
        declarations.set(
          declaration.id.name,
          declaration.init.quasis[0]?.value.cooked ?? '',
        )
      }
    }
  }
  const docs = {
    $25: 'SKILL.md',
    gw5: 'curl/managed-agents.md',
    Y25: 'python/managed-agents/README.md',
    D25: 'shared/managed-agents-api-reference.md',
    G25: 'shared/managed-agents-client-patterns.md',
    T25: 'shared/managed-agents-core.md',
    V25: 'shared/managed-agents-environments.md',
    N25: 'shared/managed-agents-events.md',
    y25: 'shared/managed-agents-onboarding.md',
    R25: 'shared/managed-agents-overview.md',
    S25: 'shared/managed-agents-tools.md',
    r25: 'typescript/managed-agents/README.md',
  }
  const docsRoot = path.join(temp, 'src/skills/bundled/claude-api')
  for (const [symbol, relative] of Object.entries(docs)) {
    const content = declarations.get(symbol)
    if (content === undefined) throw new Error(`missing target105 doc ${symbol}`)
    const output = path.join(docsRoot, relative)
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, content)
  }

  copyFile(temp, 'src/skills/bundled/claudeApiContent.ts')
  const filename = path.join(temp, 'src/skills/bundled/claudeApi.ts')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    '**Agent with built-in tools (file/web/terminal) (Python & TypeScript only):**\n→ Refer to \\`{lang}/agent-sdk/README.md\\` + \\`{lang}/agent-sdk/patterns.md\\`',
    '**Agent design (tool surface, context management, caching strategy):**\n→ Refer to \\`shared/agent-design.md\\`\n\n**Managed Agents (server-managed stateful agents):**\n→ Refer to \\`shared/managed-agents-overview.md\\` and the rest of the \\`shared/managed-agents-*.md\\` files. For Python, TypeScript, and cURL, language-specific code examples live in \\`{lang}/managed-agents/README.md\\`. Java, Go, Ruby, and PHP also support the API — translate the calls using your SDK\'s patterns from \\`{lang}/claude-api.md\\`. C# does not currently have Managed Agents support; use raw HTTP from \\`curl/managed-agents.md\\` as a reference.',
    'target105 managed-agent reading guide',
  )
  source = replaceOnce(
    source,
    "      'Build apps with the Claude API or Anthropic SDK.\\n' +\n      'TRIGGER when: code imports `anthropic`/`@anthropic-ai/sdk`/`claude_agent_sdk`, or user asks to use Claude API, Anthropic SDKs, or Agent SDK.\\n' +\n      'DO NOT TRIGGER when: code imports `openai`/other AI SDK, general programming, or ML/data-science tasks.',",
    "      'Build, debug, and optimize Claude API / Anthropic SDK apps. Apps built with this skill should include prompt caching.\\n' +\n      'TRIGGER when: code imports `anthropic`/`@anthropic-ai/sdk`; user asks to use the Claude API, Anthropic SDKs, or Managed Agents (`/v1/agents`, `/v1/sessions`); user asks to add, modify, debug, optimize, or improve a Claude feature (prompt caching, cache hit rate, adaptive thinking, compaction, code_execution, batch, files API, citations, memory tool) or a Claude model (Opus/Sonnet/Haiku) in a file; or user asks about prompt caching / cache hit rate / cache reads / cache creation in any project that uses the Anthropic SDK (even without mentioning Claude by name).\\n' +\n      'DO NOT TRIGGER when: file imports `openai`/non-Anthropic SDK, filename signals another provider (`agent-openai.py`, `*-generic.py`), code is provider-neutral, or task is general programming/ML.',",
    'target105 claude-api trigger',
  )
  fs.writeFileSync(filename, source)
}

function buildDoctorKeybindings105(temp) {
  const schemaFilename = path.join(temp, 'src/keybindings/schema.ts')
  let schema = fs.readFileSync(schemaFilename, 'utf8')
  schema = replaceOnce(
    schema,
    "  'Plugin',\n] as const",
    "  'Plugin',\n  'Doctor',\n] as const",
    'target105 Doctor keybinding context',
  )
  schema = replaceOnce(
    schema,
    "  Plugin: 'When the plugin dialog is open',\n}",
    "  Plugin: 'When the plugin dialog is open',\n  Doctor: 'When the doctor diagnostics screen is open',\n}",
    'target105 Doctor keybinding description',
  )
  schema = replaceOnce(
    schema,
    "  // Permission dialog actions\n",
    "  // Doctor diagnostics actions\n  'doctor:fix',\n  // Permission dialog actions\n",
    'target105 Doctor keybinding action',
  )
  fs.writeFileSync(schemaFilename, schema)

  const defaultsFilename = path.join(temp, 'src/keybindings/defaultBindings.ts')
  let defaults = fs.readFileSync(defaultsFilename, 'utf8')
  const end = defaults.lastIndexOf('\n]')
  if (end < 0) throw new Error('missing default keybindings array end')
  defaults = `${defaults.slice(0, end)}\n  {\n    context: 'Doctor',\n    bindings: {\n      f: 'doctor:fix',\n    },\n  },${defaults.slice(end)}`
  fs.writeFileSync(defaultsFilename, defaults)
}

function buildSubagentStatusLine105(temp) {
  for (const relative of [
    'src/utils/subagentStatusLine.ts',
    'src/hooks/useSubagentStatusLine.ts',
  ]) {
    copyFile(temp, relative)
  }

  for (const [relative, predicate] of [
    [
      'src/utils/settings/types.ts',
      hunk => hunk.includes('subagentStatusLine:'),
    ],
    [
      'src/state/AppStateStore.ts',
      hunk => hunk.includes('taskDecorations'),
    ],
    [
      'src/main.tsx',
      hunk => hunk.includes('taskDecorations'),
    ],
    [
      'src/components/PromptInput/PromptInputFooterLeftSide.tsx',
      hunk => hunk.includes('useSubagentStatusLine'),
    ],
    [
      'src/components/PromptInput/PromptInput.tsx',
      hunk =>
        /getDecoratedVisibleAgentTasks|preserveDecoratedTaskSelection|taskDecorations|decoratedTaskIds/.test(
          hunk,
        ),
    ],
  ]) {
    applySelectedWorkingDiff(temp, relative, predicate)
  }

  // The target105 external build DCEs the coordinator panel itself, but the
  // source-level selector and decoration-aware count are still the owners of
  // the reachable PromptInput selection behavior. Do not copy the target116
  // panel redesign into this introduction supplement.
  const relative = 'src/components/CoordinatorAgentStatus.tsx'
  const filename = path.join(temp, relative)
  let source = fs.readFileSync(filename, 'utf8')
  const current = fs.readFileSync(path.join(root, relative), 'utf8')
  source = replaceOnce(
    source,
    'export function CoordinatorTaskPanel(): React.ReactNode {',
    `${block(
      current,
      'export function getDecoratedVisibleAgentTasks(',
      'export function CoordinatorTaskPanel(): React.ReactNode {',
    )}export function CoordinatorTaskPanel(): React.ReactNode {`,
    'target105 decorated visible task selector',
  )
  source = replaceBlock(
    source,
    'export function useCoordinatorTaskCount()',
    'function MainLine',
    block(
      current,
      'export function useCoordinatorTaskCount()',
      'type StatusColor',
    ).replace(/type StatusColor[\s\S]*$/, ''),
  )
  fs.writeFileSync(filename, source)
}

function buildRecap105(temp) {
  copyFile(temp, 'src/commands/recap.ts')
  applySelectedWorkingDiff(
    temp,
    'src/commands.ts',
    hunk => hunk.includes("from './commands/recap.js'") || /^\+  recap,$/m.test(hunk),
  )
}

function buildPromptCacheBreak105(temp) {
  const exactRoot = '/tmp/middle-final-scans.1u7DtQ/105'
  for (const relative of [
    'src/services/api/promptCacheBreakDetection.ts',
    'src/services/api/claude.ts',
  ]) {
    const source = path.join(exactRoot, relative)
    if (!fs.existsSync(source)) {
      throw new Error(`missing exact target105 prompt-cache owner ${source}`)
    }
    const destination = path.join(temp, relative)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
  }
}

function buildRemoteTriggerSchema105(temp) {
  const filename = path.join(
    temp,
    'src/tools/RemoteTriggerTool/RemoteTriggerTool.ts',
  )
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    ".describe('JSON body for create and update'),",
    ".describe('Required for create and update; optional for run'),",
    'target105 remote-trigger schema description',
  )
  fs.writeFileSync(filename, source)
}

function buildTreeConnector105(temp) {
  const relative = 'src/components/design-system/Tree.tsx'
  const source = path.join(
    '/tmp/middle-semantic-final.BKAsET/2.1.104-to-2.1.105',
    relative,
  )
  if (!fs.existsSync(source)) {
    throw new Error(`missing exact target105 Tree owner ${source}`)
  }
  const destination = path.join(temp, relative)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
  normalizeTerminalNewline(temp, relative)
}

function buildTaskRegistry105(temp) {
  const exactRoot = '/tmp/middle-105-strict.hFOPWy'

  // This hook is introduced with the registry abstraction at target105, so it
  // is safe to recover as a complete owner.  The remaining files existed at
  // earlier boundaries; select only hunks that migrate their task lifecycle
  // calls instead of duplicating unrelated, transitively recovered behavior.
  const hook = 'src/hooks/useTaskRegistry.ts'
  const hookSource = path.join(exactRoot, hook)
  if (!fs.existsSync(hookSource)) {
    throw new Error(`missing exact target105 task-registry owner ${hookSource}`)
  }
  const hookDestination = path.join(temp, hook)
  fs.mkdirSync(path.dirname(hookDestination), { recursive: true })
  fs.copyFileSync(hookSource, hookDestination)

  const relatives = [
    'src/utils/task/framework.ts',
    'src/Task.ts',
    'src/Tool.ts',
    'src/QueryEngine.ts',
    'src/utils/queryContext.ts',
    'src/utils/forkedAgent.ts',
    'src/cli/print.ts',
    'src/screens/REPL.tsx',
    'src/tasks/RemoteAgentTask/RemoteAgentTask.tsx',
    'src/tasks/LocalShellTask/LocalShellTask.tsx',
    'src/tasks/LocalShellTask/killShellTasks.ts',
    'src/tasks/LocalAgentTask/LocalAgentTask.tsx',
    'src/tasks/LocalMainSessionTask.ts',
    'src/tasks/stopTask.ts',
    'src/tasks/DreamTask/DreamTask.ts',
    'src/tasks/InProcessTeammateTask/InProcessTeammateTask.tsx',
    'src/tasks/InProcessTeammateTask/types.ts',
    'src/tools/AgentTool/AgentTool.tsx',
    'src/tools/AgentTool/agentToolUtils.ts',
    'src/tools/AgentTool/resumeAgent.ts',
    'src/tools/AgentTool/runAgent.ts',
    'src/services/AgentSummary/agentSummary.ts',
    'src/hooks/useCancelRequest.ts',
    'src/tools/SendMessageTool/SendMessageTool.ts',
    'src/tools/shared/spawnMultiAgent.ts',
    'src/utils/swarm/spawnInProcess.ts',
    'src/utils/swarm/inProcessRunner.ts',
    'src/utils/swarm/backends/InProcessBackend.ts',
    'src/utils/inProcessTeammateHelpers.ts',
    'src/tools/ExitPlanModeTool/ExitPlanModeV2Tool.ts',
    'src/tools/TaskStopTool/TaskStopTool.ts',
    'src/tools/TaskOutputTool/TaskOutputTool.tsx',
    'src/hooks/useInboxPoller.ts',
    'src/hooks/useScheduledTasks.ts',
    'src/services/autoDream/autoDream.ts',
    'src/utils/attachments.ts',
    'src/tools/BashTool/BashTool.tsx',
    'src/tools/PowerShellTool/PowerShellTool.tsx',
    'src/commands/ultraplan.tsx',
    'src/components/ultraplan/UltraplanChoiceDialog.tsx',
  ]
  for (const relative of relatives) {
    const destination = path.join(temp, relative)
    const before = fs.readFileSync(destination, 'utf8')
    const inlineSourceMap = before.match(/\n\/\/# sourceMappingURL=data:[^\n]*\n?$/)?.[0]
    applySelectedExactDiff(
      temp,
      exactRoot,
      relative,
      hunk =>
        /taskRegistry|TaskRegistry|NOOP_TASK_REGISTRY|createTaskRegistry|useTaskRegistry|registerTask|updateTaskState|evictTerminalTask|applyTaskOffsetsAndEvictions|generateTaskAttachments|const tasks = state\.tasks/.test(
          hunk,
        ),
    )
    // Decompiled historical owners can carry a generated inline map.  It is
    // build metadata rather than authored behavior, and selecting a final
    // runtime hunk would otherwise replace the entire multi-hundred-kilobyte
    // map.  Keep the target commit's original map byte-for-byte.
    if (inlineSourceMap) {
      const after = fs.readFileSync(destination, 'utf8')
      fs.writeFileSync(
        destination,
        after.replace(/\n\/\/# sourceMappingURL=data:[^\n]*\n?$/, inlineSourceMap),
      )
    }
  }
}

function buildSdkMemoryPaths105(temp) {
  const exactRoot = '/tmp/middle-105-strict.hFOPWy'
  for (const relative of [
    'src/entrypoints/sdk/coreSchemas.ts',
    'src/utils/messages/systemInit.ts',
  ]) {
    applySelectedExactDiff(
      temp,
      exactRoot,
      relative,
      hunk =>
        /memory_paths|getAutoMemPath|isAutoMemoryEnabled|teamMemPaths/.test(hunk),
    )
  }
}

function buildHeadlessMcpPrewait105(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/cli/print.ts',
    hunk =>
      /waitForPendingMcpBeforeFirstCommand|tengu_headless_mcp_prewait/.test(
        hunk,
      ),
  )
}

function buildBackendRegistry105(temp) {
  const relative = 'src/utils/swarm/backends/registry.ts'
  const source = path.join('/tmp/middle-105-strict.hFOPWy', relative)
  if (!fs.existsSync(source)) {
    throw new Error(`missing exact target105 backend-registry owner ${source}`)
  }
  const destination = path.join(temp, relative)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
}

function buildSkillListingOverrides105(temp) {
  const exactRoot = '/tmp/middle-105-strict.hFOPWy'
  const newHook = 'src/hooks/notifs/useSkillTruncationNotification.tsx'
  const hookSource = path.join(exactRoot, newHook)
  if (!fs.existsSync(hookSource)) {
    throw new Error(`missing exact target105 skill notification owner ${hookSource}`)
  }
  const hookDestination = path.join(temp, newHook)
  fs.mkdirSync(path.dirname(hookDestination), { recursive: true })
  fs.copyFileSync(hookSource, hookDestination)

  const predicates = new Map([
    ['src/utils/settings/types.ts', hunk => /skillListing|skillOverrides/.test(hunk)],
    ['src/commands.ts', hunk => /SkillOverride|getSkillOverride|isSkillDisabledForModelInvocation|isSkillHidden|isSkillToolCommand/.test(hunk)],
    ['src/tools/SkillTool/prompt.ts', hunk => /skillListing|getSkillOverride|getMaxListingDescriptionChars|getRawCommandDescription|nameOnlyIndices|_getUsageScore/.test(hunk)],
    ['src/tools/SkillTool/SkillTool.ts', hunk => /isSkillDisabledForModelInvocation|skillOverrides settings/.test(hunk)],
    ['src/utils/attachments.ts', hunk => /getSkillUsageScore|formatCommandsWithinBudget/.test(hunk)],
    ['src/state/AppStateStore.ts', hunk => /SkillTruncationStats|skillTruncationStats/.test(hunk)],
    ['src/main.tsx', hunk => /skillTruncationStats/.test(hunk)],
    ['src/screens/REPL.tsx', hunk => /useSkillTruncationNotification/.test(hunk)],
  ])
  for (const [relative, predicate] of predicates) {
    applySelectedExactDiff(temp, exactRoot, relative, predicate)
  }
}

function buildEventLoopStall105(temp) {
  const exactRoot = '/tmp/middle-105-strict.hFOPWy'
  const relative = 'src/utils/eventLoopStallDetector.ts'
  const source = path.join(exactRoot, relative)
  if (!fs.existsSync(source)) {
    throw new Error(`missing exact target105 event-loop owner ${source}`)
  }
  const destination = path.join(temp, relative)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/main.tsx',
    hunk => /tengu_drift_lantern|eventLoopStallDetector/.test(hunk),
  )
}

function buildMemoryThreshold105(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/hooks/useMemoryUsage.ts',
    hunk =>
      /useRef|logEvent|STATUS_RANK|highestReportedStatus|tengu_memory_threshold_crossed|heap_used_mb|rss_mb/.test(
        hunk,
      ),
  )
}

function buildGitWatchRedaction105(temp) {
  const exactRoot = '/tmp/middle-105-strict.hFOPWy'
  const predicates = new Map([
    [
      'src/utils/git/gitFilesystem.ts',
      hunk =>
        /repoBranches|repoGitDirs|repoBranchListeners|addRepo|getBranchForRepo|addWatchedRepo|onRepoBranchChange|getCachedBranchForRepo/.test(
          hunk,
        ),
    ],
    ['src/utils/git.ts', hunk => /redactGitRemoteCredentials/.test(hunk)],
    [
      'src/utils/detectRepository.ts',
      hunk => /redactGitRemoteCredentials/.test(hunk),
    ],
    ['src/bridge/bridgeApi.ts', hunk => /redactGitRemoteCredentials/.test(hunk)],
    ['src/bridge/bridgeMain.ts', hunk => /redactGitRemoteCredentials/.test(hunk)],
  ])
  for (const [relative, predicate] of predicates) {
    applySelectedExactDiff(temp, exactRoot, relative, predicate)
  }
}

function buildAutoModeState105(temp) {
  const relative = 'src/utils/permissions/autoModeState.ts'
  const source = path.join('/tmp/middle-105-strict.hFOPWy', relative)
  if (!fs.existsSync(source)) {
    throw new Error(`missing exact target105 auto-mode state owner ${source}`)
  }
  const destination = path.join(temp, relative)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
}

function buildAtomicTeamFile105(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/utils/swarm/teamHelpers.ts',
    hunk =>
      /import \{ lock \}|TEAM_FILE_LOCK_OPTIONS|teamDoesNotExistError|updateTeamFile|removeTeamMember|setMemberActive/.test(
        hunk,
      ),
  )
}

function buildAtomicTeammateReservation105(temp) {
  const exactRoot = '/tmp/middle-105-strict.hFOPWy'
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/tools/shared/spawnMultiAgent.ts',
    hunk =>
      /reserveTeammateIdentity|ReservedTeammateIdentity|generateUniqueTeammateNameFromTeamFile|updateReservedTeammateBackend|markCommitted|registerCleanup|removeTeamMember|clearMailbox|context\.teammateColors/.test(
        hunk,
      ),
  )
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/Tool.ts',
    hunk => /teammateColors/.test(hunk),
  )
}

function buildAnalyticsState105(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/services/analytics/index.ts',
    hunk =>
      /AnalyticsState|createAnalyticsState|globalAnalyticsState|state\.eventQueue|state\.sink|newSink\.logEvent/.test(
        hunk,
      ),
  )
}

function buildTeamMemoryAcl105(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/services/teamMemorySync/watcher.ts',
    hunk =>
      /no_repo|isPermanent|serverErrorCode|team_memory_group_acl|restricted to specific groups|Contact your administrator/.test(
        hunk,
      ),
  )
}

function buildAttachmentMessageTable105(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/utils/messages.ts',
    hunk =>
      /hook_deferred_tool|max_turns_reached|current_session_memory|teammate_shutdown_batch/.test(
        hunk,
      ),
  )
}

function buildPluginSettingsDescription105(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/utils/plugins/schemas.ts',
    hunk => /currently: agent, subagentStatusLine/.test(hunk),
  )
}

function buildTrustedDevicePolicy105(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/bridge/trustedDevice.ts',
    hunk =>
      /REQUIRE_TRUSTED_DEVICES_POLICY|getPolicyLimits|waitForPolicyLimitsToLoad|Org has not enabled/.test(
        hunk,
      ),
  )
}

function buildRecalledMemoryRating105(temp) {
  const exactRoot = '/tmp/middle-105-strict.hFOPWy'
  const newOwner = 'src/components/messages/RecalledMemory.tsx'
  const source = path.join(exactRoot, newOwner)
  const destination = path.join(temp, newOwner)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
  for (const [relative, predicate] of [
    [
      'src/components/messages/AttachmentMessage.tsx',
      hunk => /RecalledMemory|messageUuid|allMemoriesAreSyntheses/.test(hunk),
    ],
    [
      'src/components/Message.tsx',
      hunk => /messageUuid=\{message\.uuid\}|\$\[3\] !== message\.uuid/.test(hunk),
    ],
    [
      'src/screens/REPL.tsx',
      hunk => /RecalledMemoryRatingInput/.test(hunk),
    ],
  ]) applySelectedExactDiff(temp, exactRoot, relative, predicate)
}

function buildApiRetryTelemetry105(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/services/api/logging.ts',
    hunk => /api_retries_exhausted|status !== undefined|total_retry_duration_ms/.test(hunk),
  )
}

function buildFirstAttemptRequestId105(temp) {
  const exactRoot = '/tmp/middle-105-strict.hFOPWy'
  for (const relative of [
    'src/services/api/logging.ts',
    'src/services/api/claude.ts',
  ]) {
    applySelectedExactDiff(
      temp,
      exactRoot,
      relative,
      hunk => hunk.includes('firstAttemptRequestId'),
    )
  }
}

function buildAuthRenderRoot105(temp) {
  const exactRoot = '/tmp/middle-105-strict.hFOPWy'
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/cli/handlers/auth.ts',
    hunk =>
      /import React|Text, type Root|authStatus\(|authLogout\(|renderedOutput|root\.render|waitUntilExit/.test(
        hunk,
      ),
  )
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/main.tsx',
    hunk =>
      /authStatus\(await createSubcommandRoot|authLogout\(await createSubcommandRoot/.test(
        hunk,
      ),
  )
}

function buildEnvHookState105(temp) {
  const exactRoot = '/tmp/middle-105-strict.hFOPWy'
  const relative = 'src/utils/hooks/fileChangedWatcher.ts'
  const source = path.join(exactRoot, relative)
  if (!fs.existsSync(source)) {
    throw new Error(`missing exact target105 env-hook state owner ${source}`)
  }
  const destination = path.join(temp, relative)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
}

function buildSkillDynamicState105(temp) {
  const exactRoot = '/tmp/middle-105-strict.hFOPWy'
  const relative = 'src/skills/loadSkillsDir.ts'
  const source = path.join(exactRoot, relative)
  if (!fs.existsSync(source)) {
    throw new Error(`missing exact target105 skill-state owner ${source}`)
  }
  const destination = path.join(temp, relative)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
  normalizeTerminalNewline(temp, relative)
}

function buildPluginManifestVersion105(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/utils/plugins/installedPluginsManager.ts',
    hunk => /Could not extract version from manifest/.test(hunk),
  )
}

function buildOfficialMarketplaceGcsRollback105(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/utils/plugins/officialMarketplaceGcs.ts',
    hunk =>
      /\.backup|hadBackup|rename\(installLocation, backup\)|rename\(backup, installLocation\)/.test(
        hunk,
      ),
  )
}

function buildMcpElicitationForm105(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/components/mcp/ElicitationDialog.tsx',
    hunk =>
      /KeyboardEvent|useStdin|useLayoutEffect|setRawMode|handleFormKeyDown|autoFocus onKeyDown|event\.preventDefault/.test(
        hunk,
      ),
  )
}

function buildReactiveCompaction105(temp) {
  const exactRoot = '/tmp/middle-105-strict.hFOPWy'
  const reactiveOwner = 'src/services/compact/reactiveCompact.ts'
  const source = path.join(exactRoot, reactiveOwner)
  if (!fs.existsSync(source)) {
    throw new Error(`missing exact target105 reactive-compaction owner ${source}`)
  }
  const destination = path.join(temp, reactiveOwner)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/utils/telemetry/events.ts',
    hunk => /logCompactionEvent/.test(hunk),
  )
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/services/compact/compact.ts',
    hunk => /CompactionError/.test(hunk),
  )
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/commands/compact/compact.ts',
    hunk =>
      /CompactionError|roughTokenCountEstimationForMessages|logCompactionEvent|resetCompactResponseLength|compactResult|compactError|preTokens|postTokens|reactive compaction failed/.test(
        hunk,
      ),
  )
}

function buildMalformedToolUseRecovery105(temp) {
  const relative = 'src/query.ts'
  const filename = path.join(temp, relative)
  let source = fs.readFileSync(filename, 'utf8')

  source = replaceOnce(
    source,
    `function isWithheldMaxOutputTokens(
  msg: Message | StreamEvent | undefined,
): msg is AssistantMessage {
  return msg?.type === 'assistant' && msg.apiError === 'max_output_tokens'
}

`,
    `function isWithheldMaxOutputTokens(
  msg: Message | StreamEvent | undefined,
): msg is AssistantMessage {
  return msg?.type === 'assistant' && msg.apiError === 'max_output_tokens'
}

type MalformedToolUseRecovery =
  | { kind: 'retry'; message: string }
  | { kind: 'failed'; message: string }

function getMalformedToolUseRecovery(
  stopReason: string | null | undefined,
  toolUseBlockCount: number,
  isApiErrorMessage: boolean | undefined,
  previousTransitionReason: string | undefined,
): MalformedToolUseRecovery | undefined {
  if (
    stopReason !== 'tool_use' ||
    toolUseBlockCount !== 0 ||
    isApiErrorMessage
  ) {
    return undefined
  }

  if (previousTransitionReason === 'malformed_tool_use_retry') {
    return {
      kind: 'failed',
      message: "The model's tool call could not be parsed (retry also failed).",
    }
  }

  return {
    kind: 'retry',
    message: 'Your tool call was malformed and could not be parsed. Please retry.',
  }
}

`,
    'target105 malformed tool-use recovery classifier',
  )
  source = replaceOnce(
    source,
    `    const toolUseBlocks: ToolUseBlock[] = []
    let needsFollowUp = false

`,
    `    const toolUseBlocks: ToolUseBlock[] = []
    let needsFollowUp = false
    let lastStreamStopReason: string | null | undefined = null

`,
    'target105 malformed tool-use stream stop state',
  )
  source = replaceOnce(
    source,
    `            // Withhold recoverable errors (prompt-too-long, max-output-tokens)
`,
    `            if (
              message.type === 'stream_event' &&
              message.event.type === 'message_delta'
            ) {
              lastStreamStopReason = message.event.delta.stop_reason
            }
            // Withhold recoverable errors (prompt-too-long, max-output-tokens)
`,
    'target105 malformed tool-use stream stop capture',
  )
  source = replaceOnce(
    source,
    `      // Skip stop hooks when the last message is an API error (rate limit,
`,
    `      const malformedToolUseRecovery = getMalformedToolUseRecovery(
        lastMessage?.message.stop_reason ?? lastStreamStopReason,
        toolUseBlocks.length,
        lastMessage?.isApiErrorMessage,
        state.transition?.reason,
      )
      if (malformedToolUseRecovery) {
        const willRetry = malformedToolUseRecovery.kind === 'retry'
        logEvent('tengu_malformed_tool_use_response', {
          will_retry: willRetry,
          model: currentModel,
        })

        if (willRetry) {
          const recoveryMessage = createUserMessage({
            content: malformedToolUseRecovery.message,
            isMeta: true,
          })
          yield recoveryMessage
          state = {
            messages: [
              ...messagesForQuery,
              ...assistantMessages,
              recoveryMessage,
            ],
            toolUseContext,
            autoCompactTracking: tracking,
            maxOutputTokensRecoveryCount: 0,
            hasAttemptedReactiveCompact: false,
            maxOutputTokensOverride: undefined,
            pendingToolUseSummary: undefined,
            stopHookActive,
            turnCount,
            transition: { reason: 'malformed_tool_use_retry' },
          }
          continue
        }

        const failureMessage = createAssistantAPIErrorMessage({
          content: malformedToolUseRecovery.message,
        })
        yield failureMessage
        void executeStopFailureHooks(failureMessage, toolUseContext)
        return { reason: 'completed' }
      }

      // Skip stop hooks when the last message is an API error (rate limit,
`,
    'target105 malformed tool-use retry branch',
  )

  fs.writeFileSync(filename, source)
}

function buildCompactionCompletion105(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/services/compact/compact.ts',
    hunk =>
      /logCompactionEvent|let compactError|let preTokens|let postTokens|startedAt|preTokens = preCompactTokenCount|postTokens = tokenCountWithEstimation|compactMetadata\.postTokens|partial compaction failed|compactResult|compactError/.test(
        hunk,
      ),
  )
}

function buildHfiAuthCleanup105(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/utils/cleanup.ts',
    hunk => /isENOENT|cleanupOldHfiAuthFile|hfi-auth\.json/.test(hunk),
  )
}

function buildSessionAppendPolicy105(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/utils/sessionStorage.ts',
    hunk =>
      /AppendEntryPolicy|ENTRY_APPEND_POLICY|route-by-agent|dedup-transcript|appendEntry invariant|switch \(ENTRY_APPEND_POLICY/.test(
        hunk,
      ),
  )
}

function buildMarkdownOrderedList105(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/components/Markdown.tsx',
    hunk => /MD_SYNTAX_RE/.test(hunk),
  )
}

function buildMarkdownBlockquote97(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle97-semantic-current',
    'src/components/Markdown.tsx',
    hunk => /import chalk|MarkdownBlockquote|token\.type === "blockquote"/.test(hunk),
  )
}

function buildMarkdownWhitespace105(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/components/Markdown.tsx',
    hunk => /replace\(\/\^\\n\+\/|trimEnd\(\)/.test(hunk),
  )
}

function buildGitBundleBaseRef105(temp) {
  const exactRoot = '/tmp/middle-105-strict.hFOPWy'
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/utils/teleport/gitBundle.ts',
    hunk => /baseRef|commit-tree|seed-base/.test(hunk),
  )
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/utils/teleport.tsx',
    hunk => /bundleBaseRef|baseRef: options\.bundleBaseRef/.test(hunk),
  )
}

function buildMetaEnterTab105(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/ink/parse-keypress.ts',
    hunk => /s === '\\x1b\\r'|s === '\\x1b\\n'|s === '\\x1b\\t'|key\.meta = s\.length === 2/.test(hunk),
  )
}

function buildGracefulShutdownPersistence105(temp) {
  const exactRoot = '/tmp/middle-105-strict.hFOPWy'
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/cost-tracker.ts',
    hunk => /isShuttingDown|lastGracefulShutdown/.test(hunk),
  )
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/costHook.ts',
    hunk => /getCurrentProjectConfig|lastGracefulShutdown|isShuttingDown/.test(hunk),
  )
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/utils/config.ts',
    hunk => /lastGracefulShutdown/.test(hunk),
  )
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/setup.ts',
    hunk => /last_session_graceful_shutdown|lastGracefulShutdown/.test(hunk),
  )
}

function buildSkillActivatedOtel105(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/tools/SkillTool/SkillTool.ts',
    hunk => /logOTelEvent|logSkillActivated|skill_activated/.test(hunk),
  )
}

function buildPluginInstallOtel105(temp) {
  const exactRoot = '/tmp/middle-105-strict.hFOPWy'
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/utils/plugins/pluginInstallationHelpers.ts',
    hunk => /logOTelEvent|plugin_installed|trigger\?: string|trigger: 'ui'|marketplace\.is_official|install\.trigger/.test(hunk),
  )
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/services/plugins/pluginOperations.ts',
    hunk => /trigger: 'cli'/.test(hunk),
  )
}

function buildToolSearchMcpNonblocking105(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/utils/toolSearch.ts',
    hunk => /mcpNonBlocking|MCP_CONNECTION_NONBLOCKING/.test(hunk),
  )
}

function buildSdkAuxiliary105(temp) {
  const exactRoot = '/tmp/middle-105-strict.hFOPWy'
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/entrypoints/sdk/coreSchemas.ts',
    hunk =>
      /skip_transcript|SDKNotificationMessageSchema|SDKMemoryRecallMessageSchema/.test(
        hunk,
      ),
  )
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/utils/sdkEventQueue.ts',
    hunk => /skip_transcript|skipTranscript|NotificationSdkEvent/.test(hunk),
  )
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/Task.ts',
    hunk => /skipTranscript/.test(hunk),
  )
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/utils/task/framework.ts',
    hunk => /skip_transcript: task\.skipTranscript/.test(hunk),
  )
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/tasks/DreamTask/DreamTask.ts',
    hunk => /emitTaskTerminatedSdk|skipTranscript/.test(hunk),
  )
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/tools/ExitPlanModeTool/ExitPlanModeV2Tool.ts',
    hunk => /enqueueSdkEvent|auto-mode-gate-plan-exit-fallback/.test(hunk),
  )
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/query/stopHooks.ts',
    hunk => /enqueueSdkEvent|stop-hook-error/.test(hunk),
  )
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/services/compact/compact.ts',
    hunk => /enqueueSdkEvent|error-compacting-conversation/.test(hunk),
  )
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/QueryEngine.ts',
    hunk =>
      /memoryScopeForPath|SYNTHESIS_MEMORY_PREFIX|getSynthesisMemoryDirectory|getSdkMemoryRecallEvent|memoryRecall|relevant_memories/.test(
        hunk,
      ),
  )
}

function buildTeleportTrustedDevice105(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/utils/teleport.tsx',
    hunk =>
      /isTrustedDeviceGateEnabled|readStoredTrustedDeviceToken|trustedDeviceToken/.test(
        hunk,
      ),
  )
}

function buildMcpOAuthDiscoveryState105(temp) {
  const exactRoot = '/tmp/middle-105-strict.hFOPWy'
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/services/mcp/auth.ts',
    hunk => /oauthMetadataFound|clearMcpOAuthEntryIfNoTokens/.test(hunk),
  )
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/services/mcp/client.ts',
    hunk => /clearMcpOAuthEntryIfNoTokens/.test(hunk),
  )
}

function buildSubprocessIsolationPaths105(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/utils/subprocessEnv.ts',
    hunk =>
      /posix as path|ALLOW_WRITE_ROOTS|runnerFileCommandsDir|workspace|pathDirs|inline-comments-buffer|\/run\/dbus|\/run\/user|actions-runner|scrub-mode stubs|workspaceDenyPaths/.test(
        hunk,
      ),
  )
}

function buildMessageRatingSurface105(temp) {
  const filename = path.join(temp, 'src/components/messageRating.tsx')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    `export type MessageRatingSentiment = 'positive' | 'negative'
type RateMessage = (messageUuid: string, sentiment: MessageRatingSentiment) => void`,
    `export type MessageRatingSentiment = 'positive' | 'negative'
export type MessageRatingSurface = 'tool_use' | 'tiny_memory'
type RatingTelemetryMetadata = Record<string, number | undefined>
type RateMessage = (
  messageUuid: string,
  sentiment: MessageRatingSentiment,
  surface?: MessageRatingSurface,
  metadata?: RatingTelemetryMetadata,
) => void`,
    'target105 message-rating callback types',
  )
  source = replaceOnce(
    source,
    'const rateMessage = useCallback<RateMessage>((messageUuid, sentiment) => {',
    "const rateMessage = useCallback<RateMessage>((messageUuid, sentiment, surface = 'tool_use', metadata) => {",
    'target105 message-rating callback parameters',
  )
  source = replaceOnce(
    source,
    `    logEvent('tengu_message_rated', {
      message_uuid: messageUuid as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,`,
    `    logEvent('tengu_message_rated', {
      ...metadata,
      message_uuid: messageUuid as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,`,
    'target105 message-rating metadata spread',
  )
  source = replaceOnce(
    source,
    `      sentiment: sentiment as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      cleared,`,
    `      sentiment: sentiment as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      surface: surface as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      cleared,`,
    'target105 message-rating surface telemetry',
  )
  fs.writeFileSync(filename, source)
}

function buildWorktreeResumeNameFilter105(temp) {
  const filename = path.join(temp, 'src/utils/worktree.ts')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    '  if (session) resumeWorktreeName = session.worktreeName',
    `  if (session && !session.enteredExisting) {
    resumeWorktreeName = session.worktreeName
  }`,
    'target105 restored-worktree resume cache filter',
  )
  source = replaceOnce(
    source,
    '  return currentWorktreeSession?.worktreeName ?? resumeWorktreeName',
    `  if (currentWorktreeSession) {
    return currentWorktreeSession.enteredExisting
      ? null
      : currentWorktreeSession.worktreeName
  }
  return resumeWorktreeName`,
    'target105 restored-worktree resume getter filter',
  )
  fs.writeFileSync(filename, source)
}

function installWorktreeResumeHint101For105(temp) {
  const worktreeFilename = path.join(temp, 'src/utils/worktree.ts')
  let worktree = fs.readFileSync(worktreeFilename, 'utf8')
  worktree = replaceOnce(
    worktree,
    `let currentWorktreeSession: WorktreeSession | null = null

export function getCurrentWorktreeSession(): WorktreeSession | null {
  return currentWorktreeSession
}`,
    `let currentWorktreeSession: WorktreeSession | null = null
let resumeWorktreeName: string | null = null

function setCurrentWorktreeSessionValue(
  session: WorktreeSession | null,
): void {
  currentWorktreeSession = session
  if (session) resumeWorktreeName = session.worktreeName
}

export function getCurrentWorktreeSession(): WorktreeSession | null {
  return currentWorktreeSession
}

export function getResumeWorktreeName(): string | null {
  return currentWorktreeSession?.worktreeName ?? resumeWorktreeName
}

function clearResumeWorktreeName(): void {
  resumeWorktreeName = null
}`,
    'target101 worktree resume state prerequisite',
  )
  worktree = replaceOnce(
    worktree,
    `export function restoreWorktreeSession(session: WorktreeSession | null): void {
  currentWorktreeSession = session
}`,
    `export function restoreWorktreeSession(session: WorktreeSession | null): void {
  setCurrentWorktreeSessionValue(session)
}`,
    'target101 restored worktree resume prerequisite',
  )
  worktree = replaceOnce(
    worktree,
    `function setCurrentWorktreeSession(session: WorktreeSession | null): void {
  currentWorktreeSession = session`,
    `function setCurrentWorktreeSession(session: WorktreeSession | null): void {
  setCurrentWorktreeSessionValue(session)`,
    'target101 persisted worktree resume prerequisite',
  )
  worktree = replaceOnce(
    worktree,
    `    // Clear the session
    setCurrentWorktreeSession(null)

    // Delete the temporary worktree branch`,
    `    // Clear the session
    setCurrentWorktreeSession(null)
    clearResumeWorktreeName()

    // Delete the temporary worktree branch`,
    'target101 removed worktree resume prerequisite',
  )
  fs.writeFileSync(worktreeFilename, worktree)

  const shutdownFilename = path.join(temp, 'src/utils/gracefulShutdown.ts')
  let shutdown = fs.readFileSync(shutdownFilename, 'utf8')
  shutdown = replaceOnce(
    shutdown,
    "import { profileReport } from './startupProfiler.js'\n",
    "import { profileReport } from './startupProfiler.js'\nimport { getResumeWorktreeName } from './worktree.js'\n",
    'target101 resume hint import prerequisite',
  )
  shutdown = replaceOnce(
    shutdown,
    `      writeSync(
        1,
        chalk.dim(
          \`\\nResume this session with:\\nclaude --resume \${resumeArg}\\n\`,
        ),
      )`,
    `      const worktreeName = getResumeWorktreeName()
      const worktreeArg = worktreeName ? \`--worktree \${worktreeName} \` : ''

      writeSync(
        1,
        chalk.dim(
          \`\\nResume this session with:\\nclaude \${worktreeArg}--resume \${resumeArg}\\n\`,
        ),
      )`,
    'target101 resume hint caller prerequisite',
  )
  fs.writeFileSync(shutdownFilename, shutdown)
}

function buildAccountLabel105(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/utils/status.tsx',
    hunk => hunk.includes('subscription} account'),
  )
}

function buildSystemDiagnosticsHeading105(temp) {
  const filename = path.join(temp, 'src/components/Settings/Status.tsx')
  const source = fs.readFileSync(filename, 'utf8')
  fs.writeFileSync(
    filename,
    replaceOnce(
      source,
      '>System Diagnostics</Text>',
      '>System diagnostics</Text>',
      'target105 system diagnostics heading',
    ),
  )
}

function buildModelDeprecationTense105(temp) {
  const filename = path.join(temp, 'src/utils/model/deprecation.ts')
  const source = fs.readFileSync(filename, 'utf8')
  fs.writeFileSync(
    filename,
    replaceOnce(
      source,
      '  return `⚠ ${info.modelName} will be retired on ${info.retirementDate}. Consider switching to a newer model.`\n',
      `  const retirementDate = new Date(info.retirementDate)
  const retirementTense =
    !Number.isNaN(retirementDate.getTime()) && retirementDate < new Date()
      ? 'was retired on'
      : 'will be retired on'

  return \`⚠ \${info.modelName} \${retirementTense} \${info.retirementDate}. Consider switching to a newer model.\`
`,
      'target105 model deprecation retirement tense',
    ),
  )
}

function buildFullscreenSuggestionNoPad105(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/components/FullscreenLayout.tsx',
    hunk => hunk.includes('noPad={true}'),
  )
}

function buildMessageDeferral105(temp) {
  const exactRoot = '/tmp/middle-105-strict.hFOPWy'
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/components/Messages.tsx',
    hunk =>
      /MessagesProps|MemoizedMessages|selectMessagesForRender|deferMessages|placeholderBaseline|placeholderElement/.test(
        hunk,
      ),
  )
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/screens/REPL.tsx',
    hunk =>
      /Messages owns the deferred render selection|usesSyncMessages|placeholderText|deferMessages|placeholderBaseline|placeholderElement/.test(
        hunk,
      ),
  )
}

function preserveCumulativeToolContext105(temp) {
  const filename = path.join(temp, 'src/Tool.ts')
  let source = fs.readFileSync(filename, 'utf8')

  // These target101 fields remain live at target105.  Some narrow target105
  // owner diffs were recovered from an isolated tree whose Tool type lacked
  // those earlier additions; restore their cumulative surface without making
  // them part of the target105 delta.
  if (!source.includes('  addResponseLength: (delta: number) => void\n')) {
    source = replaceOnce(
      source,
      '  setResponseLength: (f: (prev: number) => number) => void\n',
      '  addResponseLength: (delta: number) => void\n  resetResponseLength: () => void\n  setResponseLength: (f: (prev: number) => number) => void\n',
      'cumulative target101 response-length context',
    )
  }
  if (!source.includes('  emitToolProgress?: (event: ToolProgressOverlayEvent) => void\n')) {
    source = replaceOnce(
      source,
      '  sessionState?: SessionStateManager\n',
      '  emitToolProgress?: (event: ToolProgressOverlayEvent) => void\n  sessionState?: SessionStateManager\n',
      'cumulative target101 tool-progress context',
    )
  }

  // Keep the inherited session environment field at its target101 anchor and
  // add the target105 tmux capability beside it.  Field order is type-only;
  // avoiding a move keeps first-introduction ownership honest.
  source = source.replace(
    '  loadedNestedMemoryPaths?: Set<string>\n  sessionEnvVars?: Map<string, string>\n  tmuxSocket?: TmuxSocket\n  dynamicSkillDirTriggers?: Set<string>\n',
    '  loadedNestedMemoryPaths?: Set<string>\n  dynamicSkillDirTriggers?: Set<string>\n',
  )
  if (!source.includes('  sessionEnvVars?: Map<string, string>\n  tmuxSocket?: TmuxSocket\n')) {
    source = replaceOnce(
      source,
      '  setResponseLength: (f: (prev: number) => number) => void\n',
      '  setResponseLength: (f: (prev: number) => number) => void\n  sessionEnvVars?: Map<string, string>\n  tmuxSocket?: TmuxSocket\n',
      'target105 tmux capability beside cumulative session env',
    )
  }
  fs.writeFileSync(filename, source)
}

function preserveCumulativeShellToolContext105(temp) {
  for (const [relative, runnerName] of [
    ['src/tools/BashTool/BashTool.tsx', 'runShellCommand'],
    ['src/tools/PowerShellTool/PowerShellTool.tsx', 'runPowerShellCommand'],
  ]) {
    const filename = path.join(temp, relative)
    let source = fs.readFileSync(filename, 'utf8')

    // The target105 task-registry recovery tree was intentionally narrow and
    // did not contain the target101 progress/session additions. Keep those
    // earlier arguments while layering the registry and tmux capabilities.
    if (!source.includes('      emitToolProgress\n    } = toolUseContext;')) {
      source = replaceOnce(
        source,
        `      setToolJSX\n    } = toolUseContext;`,
        `      setToolJSX,\n      emitToolProgress\n    } = toolUseContext;`,
        `${relative} cumulative progress context capture`,
      )
    }
    if (!source.includes('        emitToolProgress,\n        preventCwdChanges')) {
      source = replaceOnce(
        source,
        `        setToolJSX,\n        preventCwdChanges`,
        `        setToolJSX,\n        emitToolProgress,\n        preventCwdChanges`,
        `${relative} cumulative progress runner call`,
      )
    }
    if (!source.includes('  emitToolProgress,\n  preventCwdChanges')) {
      source = replaceOnce(
        source,
        `  setToolJSX,\n  preventCwdChanges`,
        `  setToolJSX,\n  emitToolProgress,\n  preventCwdChanges`,
        `${runnerName} cumulative progress parameter`,
      )
    }
    if (!source.includes("  emitToolProgress?: ToolUseContext['emitToolProgress'];\n")) {
      source = replaceOnce(
        source,
        '  setToolJSX?: SetToolJSXFn;\n',
        "  setToolJSX?: SetToolJSXFn;\n  emitToolProgress?: ToolUseContext['emitToolProgress'];\n",
        `${runnerName} cumulative progress type`,
      )
    }
    if (!source.includes("emitToolProgress?.({ kind: 'background_hint', toolUseId });")) {
      source = replaceOnce(
        source,
        `        setToolJSX({\n          jsx: <BackgroundHint />,\n          shouldHidePromptInput: false,\n          shouldContinueAnimation: true,\n          showSpinner: true\n        });\n      }`,
        `        setToolJSX({\n          jsx: <BackgroundHint />,\n          shouldHidePromptInput: false,\n          shouldContinueAnimation: true,\n          showSpinner: true\n        });\n        if (toolUseId) {\n          emitToolProgress?.({ kind: 'background_hint', toolUseId });\n        }\n      }`,
        `${runnerName} cumulative background-hint event`,
      )
    }

    if (relative.endsWith('PowerShellTool.tsx')) {
      if (!source.includes('        sessionEnvVars: toolUseContext.sessionEnvVars\n')) {
        source = replaceOnce(
          source,
          `        agentId: toolUseContext.agentId\n      });`,
          `        agentId: toolUseContext.agentId,\n        sessionEnvVars: toolUseContext.sessionEnvVars\n      });`,
          'PowerShell cumulative session environment call',
        )
      }
      if (!source.includes('  agentId,\n  sessionEnvVars\n}: {')) {
        source = replaceOnce(
          source,
          `  toolUseId,\n  agentId\n}: {`,
          `  toolUseId,\n  agentId,\n  sessionEnvVars\n}: {`,
          'PowerShell cumulative session environment parameter',
        )
      }
      if (!source.includes('  sessionEnvVars?: Map<string, string>;\n')) {
        source = replaceOnce(
          source,
          '  agentId?: AgentId;\n',
          '  agentId?: AgentId;\n  sessionEnvVars?: Map<string, string>;\n',
          'PowerShell cumulative session environment type',
        )
      }
    }

    fs.writeFileSync(filename, source)
  }
}

function preserveCumulativeToolProgressRepl105(temp) {
  const filename = path.join(temp, 'src/screens/REPL.tsx')
  let source = fs.readFileSync(filename, 'utf8')

  if (!source.includes("from '../components/ToolProgressOverlay.js'")) {
    source = replaceOnce(
      source,
      "import { SessionBackgroundHint } from '../components/SessionBackgroundHint.js';\n",
      "import { renderToolProgressOverlay, type ToolProgressOverlayEvent, type VisibleToolProgressOverlayEvent } from '../components/ToolProgressOverlay.js';\n",
      'cumulative target101 tool-progress REPL import',
    )
  }
  if (!source.includes('!toolJSX && toolProgressOverlays.size > 0')) {
    source = replaceOnce(
      source,
      `              {toolJSX && !(toolJSX.isLocalJSXCommand && toolJSX.isImmediate) && !toolJsxCentered && <Box flexDirection="column" width="100%">\n                    {toolJSX.jsx}\n                  </Box>}\n              {"external" === 'ant' && <TungstenLiveMonitor />}`,
      `              {toolJSX && !(toolJSX.isLocalJSXCommand && toolJSX.isImmediate) && !toolJsxCentered && <Box flexDirection="column" width="100%">\n                    {toolJSX.jsx}\n                  </Box>}\n              {!toolJSX && toolProgressOverlays.size > 0 && <Box flexDirection="column" width="100%">\n                    {Array.from(toolProgressOverlays.values()).map(event => <React.Fragment key={event.toolUseId}>\n                        {renderToolProgressOverlay(event)}\n                      </React.Fragment>)}\n                  </Box>}\n              {"external" === 'ant' && <TungstenLiveMonitor />}`,
      'cumulative target101 tool-progress REPL render',
    )
  }

  fs.writeFileSync(filename, source)
}

function buildTmuxFocusHint105(temp) {
  const exactRoot = '/tmp/middle-105-strict.hFOPWy'
  const fullscreenOwner = 'src/utils/fullscreen.ts'
  const source = path.join(exactRoot, fullscreenOwner)
  if (!fs.existsSync(source)) {
    throw new Error(`missing exact target105 fullscreen owner ${source}`)
  }
  const destination = path.join(temp, fullscreenOwner)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/screens/REPL.tsx',
    hunk => /maybeGetTmuxFocusHint|tmux-focus-hint/.test(hunk),
  )
}

function buildTmuxSocketPrerequisites105(temp) {
  // MonitorTool and typeahead replacement metadata are introduced at target98;
  // per-session environment propagation and the cache-safe away-summary fork
  // land at target101. Materialize and commit those cumulative prerequisites
  // so the target105 supplement contains only its genuine deltas.
  const monitor = 'src/tools/MonitorTool/MonitorTool.ts'
  const monitorSource = path.join('/tmp/middle98-integrated.koScjU', monitor)
  const monitorDestination = path.join(temp, monitor)
  if (!fs.existsSync(monitorDestination)) {
    if (!fs.existsSync(monitorSource)) {
      throw new Error(`missing target98 MonitorTool prerequisite ${monitorSource}`)
    }
    fs.mkdirSync(path.dirname(monitorDestination), { recursive: true })
    fs.copyFileSync(monitorSource, monitorDestination)
  }

  const subprocessOwner = 'src/utils/subprocessEnv.ts'
  const subprocessSource = path.join(
    '/tmp/middle98-final-generated.8jWjnB/tree',
    subprocessOwner,
  )
  if (!fs.existsSync(subprocessSource)) {
    throw new Error(
      `missing target98 subprocess-isolation prerequisite ${subprocessSource}`,
    )
  }
  fs.copyFileSync(subprocessSource, path.join(temp, subprocessOwner))

  installMessageRating90(temp)
  buildMessageRatingHover101(temp)
  installWorktreeResumeHint101For105(temp)

  buildToolProgressOverlay101(temp)
  buildSessionEnvVars101(temp)
  buildTypeaheadMetadata98(temp)
  applySelectedExactDiff(
    temp,
    '/tmp/middle101-integrated-final.tPpYsf',
    'src/commands/clear/caches.ts',
    hunk =>
      /AppState|clearStoredImagePaths|clearSessionEnvVars|storedImagePaths|runPostCompactCleanup/.test(
        hunk,
      ),
  )
  applySelectedExactDiff(
    temp,
    '/tmp/middle101-integrated-final.tPpYsf',
    monitor,
    hunk => hunk.includes('sessionEnvVars'),
  )

  const awaySummary = 'src/services/awaySummary.ts'
  const awaySummarySource = path.join(
    '/tmp/middle101-stateverify.5NWYWM',
    awaySummary,
  )
  if (!fs.existsSync(awaySummarySource)) {
    throw new Error(
      `missing target101 away-summary prerequisite ${awaySummarySource}`,
    )
  }
  const awaySummaryDestination = path.join(temp, awaySummary)
  fs.mkdirSync(path.dirname(awaySummaryDestination), { recursive: true })
  fs.copyFileSync(awaySummarySource, awaySummaryDestination)
  normalizeTerminalNewline(temp, awaySummary)

  const ultraplanChoice =
    'src/components/ultraplan/UltraplanChoiceDialog.tsx'
  const ultraplanChoiceSource = path.join(
    '/tmp/middle-105-strict.hFOPWy',
    ultraplanChoice,
  )
  if (!fs.existsSync(ultraplanChoiceSource)) {
    throw new Error(
      `missing cumulative target101 Ultraplan choice owner ${ultraplanChoiceSource}`,
    )
  }
  const ultraplanChoiceDestination = path.join(temp, ultraplanChoice)
  fs.mkdirSync(path.dirname(ultraplanChoiceDestination), { recursive: true })
  let ultraplanChoicePrerequisite = fs.readFileSync(
    ultraplanChoiceSource,
    'utf8',
  )
  ultraplanChoicePrerequisite = replaceOnce(
    ultraplanChoicePrerequisite,
    "import { useTaskRegistry } from '../../hooks/useTaskRegistry.js'\n",
    "import { updateTaskState } from '../../utils/task/framework.js'\n",
    'pre-target105 Ultraplan task helper import',
  )
  ultraplanChoicePrerequisite = replaceOnce(
    ultraplanChoicePrerequisite,
    '  const taskRegistry = useTaskRegistry()\n',
    '',
    'pre-target105 Ultraplan registry hook',
  )
  ultraplanChoicePrerequisite = replaceOnce(
    ultraplanChoicePrerequisite,
    '    taskRegistry.update<RemoteAgentTaskState>(taskId, task =>\n',
    '    updateTaskState<RemoteAgentTaskState>(taskId, setAppState, task =>\n',
    'pre-target105 Ultraplan direct task update',
  )
  fs.writeFileSync(ultraplanChoiceDestination, ultraplanChoicePrerequisite)
  normalizeTerminalNewline(temp, ultraplanChoice)

  run(temp, 'git', ['add', '.'])
  run(temp, 'git', [
    'commit',
    '-qm',
    'semantic prerequisites: target98 and target101 runtime owners',
  ])
}

function buildAwaySummaryPrompt105(temp) {
  const filename = path.join(temp, 'src/services/awaySummary.ts')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    'The user stepped away and is coming back. Under 40 words, 1-2 plain sentences — no markdown. Name the task, then the one next action. They remember the session — skip root-cause narrative, fix internals, secondary to-dos, and em-dash tangents.',
    'The user stepped away and is coming back. Recap in under 40 words, 1-2 plain sentences, no markdown. Lead with the overall goal and current task, then the one next action. Skip root-cause narrative, fix internals, secondary to-dos, and em-dash tangents.',
    'target105 away-summary recap prompt',
  )
  fs.writeFileSync(filename, source)
}

function buildTmuxSocket105(temp) {
  const exactRoot = '/tmp/middle-105-strict.hFOPWy'
  const owners = [
    'src/utils/shell/shellProvider.ts',
    'src/utils/shell/bashProvider.ts',
    'src/utils/Shell.ts',
    'src/Tool.ts',
    'src/tools/MonitorTool/MonitorTool.ts',
    'src/tools/BashTool/BashTool.tsx',
    'src/utils/forkedAgent.ts',
    'src/screens/REPL.tsx',
    'src/QueryEngine.ts',
    'src/cli/print.ts',
  ]
  for (const relative of owners) {
    const destination = path.join(temp, relative)
    if (relative === 'src/Tool.ts') {
      let source = fs.readFileSync(destination, 'utf8')
      if (!source.includes("import type { TmuxSocket } from './utils/shell/shellProvider.js'")) {
        source = replaceOnce(
          source,
          "import type { Theme, ThemeName } from './utils/theme.js'\n",
          "import type { Theme, ThemeName } from './utils/theme.js'\nimport type { TmuxSocket } from './utils/shell/shellProvider.js'\n",
          'target105 Tool tmux socket type import',
        )
      }
      if (!source.includes('tmuxSocket?: TmuxSocket')) {
        source = replaceOnce(
          source,
          '  sessionEnvVars?: Map<string, string>\n',
          '  sessionEnvVars?: Map<string, string>\n  tmuxSocket?: TmuxSocket\n',
          'target105 Tool tmux socket capability',
        )
      }
      fs.writeFileSync(destination, source)
      continue
    }
    const before = fs.readFileSync(destination, 'utf8')
    const inlineSourceMap = before.match(/\n\/\/# sourceMappingURL=data:[^\n]*\n?$/)?.[0]
    applySelectedExactDiff(
      temp,
      exactRoot,
      relative,
      hunk =>
        /TmuxSocket|tmuxSocket|getTmuxEnv|getEnvironmentOverrides|ensureSocketInitialized|getClaudeTmuxEnv|hasTmuxToolBeenUsed/.test(
          hunk,
        ),
    )
    if (inlineSourceMap) {
      const after = fs.readFileSync(destination, 'utf8')
      fs.writeFileSync(
        destination,
        after.replace(/\n\/\/# sourceMappingURL=data:[^\n]*\n?$/, inlineSourceMap),
      )
    }
  }
}

function buildSessionState105(temp) {
  const relative = 'src/utils/sessionState.ts'
  const source = path.join('/tmp/middle-105-strict.hFOPWy', relative)
  if (!fs.existsSync(source)) {
    throw new Error(`missing exact target105 session-state owner ${source}`)
  }
  const destination = path.join(temp, relative)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
}

function buildKeybindingSelectionScroll105(temp) {
  const exactRoot = '/tmp/middle-105-strict.hFOPWy'
  for (const relative of [
    'src/keybindings/defaultBindings.ts',
    'src/keybindings/schema.ts',
    'src/components/ScrollKeybindingHandler.tsx',
  ]) {
    const source = path.join(exactRoot, relative)
    if (!fs.existsSync(source)) {
      throw new Error(`missing exact target105 keybinding owner ${source}`)
    }
    const destination = path.join(temp, relative)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
  }
}

function buildFeedbackPayload105(temp) {
  const exactRoot = '/tmp/middle-105-strict.hFOPWy'
  const relative = 'src/components/Feedback.tsx'
  const sourcePath = path.join(exactRoot, relative)
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`missing exact target105 feedback owner ${sourcePath}`)
  }
  const destination = path.join(temp, relative)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  let source = fs.readFileSync(sourcePath, 'utf8')
  source = replaceOnce(
    source,
    "import { asSystemPrompt } from '../utils/systemPromptType.js';\n",
    "import { asSystemPrompt } from '../utils/systemPromptType.js';\nimport { serializeWrappedContent } from '../utils/wrappedContentSerializer.js';\n",
    'target105 transitive wrapped-content serializer import',
  )
  source = replaceBlock(
    source,
    'function serializeFeedbackPayload(data: FeedbackData): Buffer {',
    'type FeedbackSubmissionResult = {',
    `function serializeFeedbackPayload(data: FeedbackData): Buffer {
  return serializeWrappedContent(
    data,
    FEEDBACK_ARRAY_FIELDS,
    FEEDBACK_TRANSCRIPT_MAP_FIELDS,
  );
}

`,
  )
  fs.writeFileSync(destination, source)
}

function buildBackgroundWorkExit105(temp) {
  const exactRoot = '/tmp/middle-105-strict.hFOPWy'
  const dialog = 'src/components/BackgroundWorkExitDialog.tsx'
  const source = path.join(exactRoot, dialog)
  if (!fs.existsSync(source)) {
    throw new Error(`missing exact target105 background-work dialog ${source}`)
  }
  const destination = path.join(temp, dialog)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/components/ExitFlow.tsx',
    hunk => /BackgroundWorkExitDialog|backgroundItems/.test(hunk),
  )
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/commands/exit/exit.tsx',
    hunk => /BackgroundWorkExitItem|getScheduledBackgroundItems|backgroundItems|cronToHuman|scheduled task/.test(hunk),
  )
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/screens/REPL.tsx',
    hunk => /getScheduledBackgroundItems|backgroundItems/.test(hunk),
  )
}

function buildRequestTooLarge105(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/constants/apiLimits.ts',
    hunk => /API_MAX_REQUEST_SIZE/.test(hunk),
  )
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/services/api/errors.ts',
    hunk => /request_too_large|status === 413|PROMPT_TOO_LONG_ERROR_MESSAGE|API_MAX_REQUEST_SIZE/.test(hunk),
  )
}

function buildUltrareviewPreflight105(temp) {
  const exactRoot = '/tmp/middle-105-strict.hFOPWy'
  for (const relative of [
    'src/services/api/ultrareviewQuota.ts',
    'src/commands/review/reviewRemote.ts',
    'src/commands/review/UltrareviewOverageDialog.tsx',
    'src/commands/review/ultrareviewCommand.tsx',
  ]) {
    const source = path.join(exactRoot, relative)
    if (!fs.existsSync(source)) {
      throw new Error(`missing exact target105 ultrareview owner ${source}`)
    }
    const destination = path.join(temp, relative)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
  }
}

function buildHookRegistryValidation105(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/utils/hooks.ts',
    hunk =>
      /HOOK_EVENT_REGISTRY|TOOL_HOOK_EXECUTION_TIMEOUT_MS|SESSION_END_HOOK_TIMEOUT_MS_DEFAULT|configuredSessionEndTimeout|hookSpecificOutput is missing|required field|Hook JSON output validation failed/.test(
        hunk,
      ),
  )
}

function buildUpstreamRelayDrain105(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/upstreamproxy/relay.ts',
    hunk => /endAfterDrain/.test(hunk),
  )
}

function buildAwaySummaryConfig105(temp) {
  const exactRoot = '/tmp/middle-105-strict.hFOPWy'
  for (const relative of [
    'src/utils/awaySummaryEnabled.ts',
    'src/hooks/useAwaySummary.ts',
  ]) {
    const source = path.join(exactRoot, relative)
    if (!fs.existsSync(source)) {
      throw new Error(`missing exact target105 away-summary owner ${source}`)
    }
    const destination = path.join(temp, relative)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
  }
  for (const relative of [
    'src/utils/settings/types.ts',
    'src/state/AppStateStore.ts',
    'src/utils/settings/applySettingsChange.ts',
    'src/components/Settings/Config.tsx',
    'src/main.tsx',
    'src/screens/REPL.tsx',
  ]) {
    applySelectedExactDiff(
      temp,
      exactRoot,
      relative,
      hunk => /awaySummaryEnabled|isAwaySummaryEnabled|useAwaySummary\(/.test(hunk),
    )
  }
}

function buildMemorySurveyJudge105(temp) {
  const relative = 'src/components/FeedbackSurvey/useMemorySurvey.tsx'
  const source = path.join('/tmp/middle-105-strict.hFOPWy', relative)
  if (!fs.existsSync(source)) {
    throw new Error(`missing exact target105 memory-survey owner ${source}`)
  }
  const destination = path.join(temp, relative)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
}

function buildStripPromptXml105(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/utils/messages.ts',
    hunk => /stripPromptXMLTags|replace\(\/\^\\n\+\//.test(hunk),
  )
}

function buildFilesystemPermissions105(temp) {
  const exactRoot = '/tmp/middle-105-strict.hFOPWy'
  for (const relative of [
    'src/utils/permissions/filesystem.ts',
    'src/Tool.ts',
  ]) {
    const source = path.join(exactRoot, relative)
    if (!fs.existsSync(source)) {
      throw new Error(`missing exact target105 filesystem owner ${source}`)
    }
    const destination = path.join(temp, relative)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
  }
}

function buildWorkerRawCommand105(temp) {
  const exactRoot = '/tmp/middle-105-strict.hFOPWy'
  for (const relative of [
    'src/cli/transports/ccrClient.ts',
    'src/cli/structuredIO.ts',
  ]) {
    const source = path.join(exactRoot, relative)
    if (!fs.existsSync(source)) {
      throw new Error(`missing exact target105 worker raw-command owner ${source}`)
    }
    const destination = path.join(temp, relative)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
  }
}

function buildToolSearchMcpTelemetry105(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/tools/ToolSearchTool/ToolSearchTool.ts',
    hunk => /getAppState\(\)\.mcp|mcpServersConfigured|mcpServersConnected|mcpServersPending|mcpToolsInPool/.test(hunk),
  )
}

function buildConfigTrustReason105(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/utils/config.ts',
    hunk => /setPathTrusted|set by env:/.test(hunk),
  )
}

function buildRepoCheckouts105(temp) {
  const exactRoot = '/tmp/middle-105-strict.hFOPWy'
  const relative = 'src/utils/repoCheckouts.ts'
  const source = path.join(exactRoot, relative)
  if (!fs.existsSync(source)) {
    throw new Error(`missing exact target105 repo-checkout owner ${source}`)
  }
  const destination = path.join(temp, relative)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)

  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/utils/gitDiff.ts',
    hunk => /repoCheckouts|getRepoBaseRefs|getRepoKeyForPath|repoKey/.test(hunk),
  )
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/cli/remoteIO.ts',
    hunk => /setupRepoCheckoutBranchReporting|notifySessionMetadataChanged/.test(hunk),
  )
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/utils/sessionStorage.ts',
    hunk => /refreshRepoCheckoutBranches/.test(hunk),
  )
  applySelectedExactDiff(
    temp,
    exactRoot,
    'src/utils/sessionState.ts',
    hunk => /current_branches/.test(hunk),
  )
}

function buildSkillsMenuOverrides105(temp) {
  const exactRoot = '/tmp/middle-105-strict.hFOPWy'
  const relative = 'src/components/skills/SkillsMenu.tsx'
  const source = path.join(exactRoot, relative)
  if (!fs.existsSync(source)) {
    throw new Error(`missing exact target105 SkillsMenu owner ${source}`)
  }
  const destination = path.join(temp, relative)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
}

function buildDatadogAllowlist105(temp) {
  applySelectedExactDiff(
    temp,
    '/tmp/middle-105-strict.hFOPWy',
    'src/services/analytics/datadog.ts',
    hunk => /tengu_mcp_tools_refreshed_mid_turn|tengu_sdk_init_handshake/.test(hunk),
  )
}

function buildFileReadMitigationPolicy105(temp) {
  const filename = path.join(temp, 'src/tools/FileReadTool/FileReadTool.ts')
  let source = fs.readFileSync(filename, 'utf8')

  source = replaceOnce(
    source,
    "import { getCanonicalName, getMainLoopModel } from '../../utils/model/model.js'",
    "import { getMainLoopModel } from '../../utils/model/model.js'",
    'target105 FileRead mitigation model import',
  )
  source = replaceOnce(
    source,
    `// Models where cyber risk mitigation should be skipped
const MITIGATION_EXEMPT_MODELS = new Set(['claude-opus-4-6'])

function shouldIncludeFileReadMitigation(): boolean {
  const shortName = getCanonicalName(getMainLoopModel())
  return !MITIGATION_EXEMPT_MODELS.has(shortName)
}`,
    `const CYBER_RISK_MITIGATION_MODELS = [
  /claude-3-opus/,
  /claude-3-sonnet/,
  /claude-3-haiku/,
  /claude-3-5-sonnet/,
  /claude-3-5-haiku/,
  /claude-3-7-sonnet/,
  /claude-sonnet-4(?:$|[-@]\\d{8}|[^-@\\d])/,
  /claude-sonnet-4-5/,
  /claude-opus-4(?:$|[-@]\\d{8}|[^-@\\d])/,
  /claude-opus-4-1/,
  /claude-opus-4-5/,
  /claude-haiku-4-5/,
]

function shouldIncludeFileReadMitigation(): boolean {
  const model = getMainLoopModel().toLowerCase()
  return CYBER_RISK_MITIGATION_MODELS.some(pattern => pattern.test(model))
}`,
    'target105 FileRead mitigation raw-model allowlist',
  )

  fs.writeFileSync(filename, source)
}

function buildAgentConcurrencyGuidance105(temp) {
  for (const [relative, before, after, label] of [
    [
      'src/tools/AgentTool/prompt.ts',
      '- Launch multiple agents concurrently whenever possible, to maximize performance; to do that, use a single message with multiple tool uses',
      '- When you launch multiple agents for independent work, send them in a single message with multiple tool uses so they run concurrently',
      'target105 Agent prompt concurrency guidance',
    ],
    [
      'src/utils/messages.ts',
      'Launch multiple agents concurrently whenever possible, to maximize performance; to do that, use a single message with multiple tool uses.',
      'When you launch multiple agents for independent work, send them in a single message with multiple tool uses so they run concurrently.',
      'target105 agent-listing concurrency guidance',
    ],
  ]) {
    const filename = path.join(temp, relative)
    const source = fs.readFileSync(filename, 'utf8')
    fs.writeFileSync(filename, replaceOnce(source, before, after, label))
  }
}

function buildPrintResumeTelemetry105(temp) {
  const filename = path.join(temp, 'src/cli/print.ts')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    `  if (options.resume) {
    try {
`,
    `  if (options.resume) {
    let failureReason = 'load_error'
    const resumeStartedAt = performance.now()
    try {
`,
    'target105 print resume telemetry state',
  )
  source = replaceOnce(
    source,
    `          emitLoadError(
            \`Error: --resume "\${resumeValue}" matches \${matches.length} sessions. Pass one of these session IDs to disambiguate:\\n\${candidates}\`,
`,
    `          logEvent('tengu_session_resumed', {
            entrypoint: 'print',
            success: false,
            failure_reason: 'not_found',
          })
          emitLoadError(
            \`Error: --resume "\${resumeValue}" matches \${matches.length} sessions. Pass one of these session IDs to disambiguate:\\n\${candidates}\`,
`,
    'target105 ambiguous print resume telemetry',
  )
  source = replaceOnce(
    source,
    `        emitLoadError(errorMessage, options.outputFormat)
`,
    `        logEvent('tengu_session_resumed', {
          entrypoint: 'print',
          success: false,
          failure_reason: 'not_found',
        })
        emitLoadError(errorMessage, options.outputFormat)
`,
    'target105 invalid print resume telemetry',
  )
  source = replaceOnce(
    source,
    `      const result = await loadConversationForResume(
        parsedSessionId.sessionId,
        parsedSessionId.jsonlFile || undefined,
      )
`,
    `      const result = await loadConversationForResume(
        parsedSessionId.sessionId,
        parsedSessionId.jsonlFile || undefined,
      )
      failureReason = 'processing_error'
`,
    'target105 print resume processing phase',
  )
  source = replaceOnce(
    source,
    `        } else {
          emitLoadError(
            \`No conversation found with session ID: \${parsedSessionId.sessionId}\`,
`,
    `        } else {
          logEvent('tengu_session_resumed', {
            entrypoint: 'print',
            success: false,
            failure_reason: 'not_found',
          })
          emitLoadError(
            \`No conversation found with session ID: \${parsedSessionId.sessionId}\`,
`,
    'target105 missing transcript resume telemetry',
  )
  source = replaceOnce(
    source,
    `        if (index < 0) {
          emitLoadError(
            \`No message found with message.uuid of: \${options.resumeSessionAt}\`,
`,
    `        if (index < 0) {
          logEvent('tengu_session_resumed', {
            entrypoint: 'print',
            success: false,
            failure_reason: 'processing_error',
          })
          emitLoadError(
            \`No message found with message.uuid of: \${options.resumeSessionAt}\`,
`,
    'target105 missing message resume telemetry',
  )
  source = replaceOnce(
    source,
    `      return {
        messages: result.messages,
        turnInterruptionState: result.turnInterruptionState,
        agentSetting: result.agentSetting,
      }
    } catch (error) {
      logError(error)
`,
    `      logEvent('tengu_session_resumed', {
        entrypoint: 'print',
        success: true,
        resume_duration_ms: Math.round(performance.now() - resumeStartedAt),
      })

      return {
        messages: result.messages,
        turnInterruptionState: result.turnInterruptionState,
        agentSetting: result.agentSetting,
      }
    } catch (error) {
      logEvent('tengu_session_resumed', {
        entrypoint: 'print',
        success: false,
        failure_reason: failureReason,
        error_name: toError(error).name,
      })
      logError(error)
`,
    'target105 print resume success and catch telemetry',
  )
  fs.writeFileSync(filename, source)
}

function buildSessionStatePropagation105(temp) {
  const exactRoot = '/tmp/middle-105-strict.hFOPWy'
  const owners = [
    'src/Tool.ts',
    'src/state/onChangeAppState.ts',
    'src/cli/structuredIO.ts',
    'src/cli/remoteIO.ts',
    'src/cli/print.ts',
    'src/QueryEngine.ts',
    'src/main.tsx',
  ]
  for (const relative of owners) {
    applySelectedExactDiff(
      temp,
      exactRoot,
      relative,
      hunk =>
        /SessionStateManager|sessionState|onCommandLifecycle|notifyCommandLifecycle|notifyPermissionModeChanged|notifySessionStateChanged|notifySessionMetadataChanged|setPermissionModeChangedListener|getSessionState/.test(
          hunk,
        ),
    )
  }

  // The opening assignment and closing delimiter land in separate unified
  // diff hunks. The selector above sees the session-state symbol only in the
  // opening hunk, so balance the copied callback explicitly.
  const printPath = path.join(temp, 'src/cli/print.ts')
  const printSource = fs.readFileSync(printPath, 'utf8')
  fs.writeFileSync(
    printPath,
    replaceOnce(
      printSource,
      `    }
  })

  // Prompt suggestion tracking (push model)`,
      `    }
  }

  // Prompt suggestion tracking (push model)`,
      'target105 session-state callback terminator',
    ),
  )
}

function prepareMemorySynthesisOwner105(temp) {
  const relative = 'src/memdir/findRelevantMemories.ts'
  const prerequisitePatch = path.join(
    root,
    'recovery/cases/2.1.92-to-2.1.94/semantic-supplement.patch',
  )

  // Target94 introduced the stateful selector/synthesizer owner. Replay only
  // that owner and commit it as a transitive prerequisite so the own105 patch
  // contains only the authenticated paragraph-to-fact-list evolution.
  run(temp, 'git', [
    'apply',
    `--include=${relative}`,
    prerequisitePatch,
  ])
  run(temp, 'git', ['add', relative])
  run(temp, 'git', [
    'commit',
    '-qm',
    'semantic prerequisite: target94 memory synthesis owner',
  ])
}

function buildMemorySynthesisFactShape105(temp) {
  const filename = path.join(temp, 'src/memdir/findRelevantMemories.ts')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    `const SYNTHESIZE_MEMORIES_SYSTEM_PROMPT = \`You read persistent memory files for an AI coding assistant and write short syntheses to help it answer queries. The first message lists every available memory file with its frontmatter and full body; each subsequent user message contains one query.

For each query, return a JSON object:
- one_paragraph_synthesis: a single paragraph synthesizing only the information that is directly relevant to the query
- cited_memories: array of filenames (matching the manifest exactly) for the memories you drew from

If no memories are relevant, return one_paragraph_synthesis: "No relevant memories." and cited_memories: [].

- Lead with the most directly applicable facts. Drop anything that isn't specifically useful.
- Do not invent facts. Only synthesize what is explicitly written in the memories.
- Do not pad with general principles or restate the query.
- If a prior synthesis in this conversation already covers the relevant memories for this query, return one_paragraph_synthesis: "No relevant memories." and cited_memories: [] rather than restating.
\``,
    `const SYNTHESIZE_MEMORIES_SYSTEM_PROMPT = \`You read persistent memory files for an AI coding assistant and extract facts to help the coding assistant answer queries. The first message lists every available memory file with its frontmatter and full body; each subsequent user message contains one query.

For each query, return a JSON object:
- relevant_facts: an array of facts (max 7) that would be useful for processing the query. Each fact is 1-2 sentences and stands on its own.
- cited_memories: array of filenames (matching the manifest exactly) for the memories you drew from

If no memories are relevant, return relevant_facts: [] and cited_memories: [].

A fact is useful when it lets the assistant do one of these things:
- Avoid re-asking: supply something the user would otherwise have to restate (a path, a name, a config value, a decision already made).
- Apply user preferences: surface conventions, styles, or tooling choices the assistant should follow for this query.
- Maintain continuity: surface the state of an ongoing project, goal, or prior thread that this query is continuing.
- Avoid a known pitfall: surface past corrections or mistakes so the assistant pre-empts repeating them.

Style and length:
- Each fact is 1-2 sentences. State the fact directly, then add the context needed to act on it.
- Name a path, flag, or identifier only when it is the thing the assistant must use or avoid. Drop supporting details like timestamps, byte counts, version numbers, and historical asides.
- Do not invent facts. Only extract what is explicitly written in the memories.
- Do not restate the query.
- If a prior turn in this conversation already returned the relevant facts for this query, return relevant_facts: [] and cited_memories: [] rather than restating.
\``,
    'target105 memory synthesis prompt',
  )
  source = replaceOnce(
    source,
    '  const prompt = `Synthesize memory information relevant to:\\n${query}`',
    '  const prompt = `Extract facts relevant to:\\n${query}`',
    'target105 memory synthesis query',
  )
  source = replaceOnce(
    source,
    `            one_paragraph_synthesis: { type: 'string' },
            cited_memories: { type: 'array', items: { type: 'string' } },
          },
          required: ['one_paragraph_synthesis', 'cited_memories'],`,
    `            relevant_facts: { type: 'array', items: { type: 'string' } },
            cited_memories: { type: 'array', items: { type: 'string' } },
          },
          required: ['relevant_facts', 'cited_memories'],`,
    'target105 memory synthesis schema',
  )
  source = replaceOnce(
    source,
    `    const parsed: {
      one_paragraph_synthesis: string
      cited_memories: string[]
    } = jsonParse(textBlock.text)`,
    `    const parsed: { relevant_facts: string[]; cited_memories: string[] } =
      jsonParse(textBlock.text)`,
    'target105 memory synthesis response type',
  )
  source = replaceOnce(
    source,
    `    const synthesis = parsed.one_paragraph_synthesis.trim()
    if (!synthesis || /^no relevant memor/i.test(synthesis)) return null
    return {
      synthesis,
      citedMemories: parsed.cited_memories.filter(filename =>
        conversation.byFilename.has(filename),
      ),
    }`,
    `    const facts = parsed.relevant_facts
      .map(fact => fact.trim())
      .filter(fact => fact.length > 0)
      .slice(0, 7)
    if (facts.length === 0) return null
    return {
      synthesis: facts.map(fact => \`- \${fact}\`).join('\\n'),
      citedMemories: parsed.cited_memories.filter(filename =>
        conversation.byFilename.has(filename),
      ),
    }`,
    'target105 memory synthesis result shape',
  )
  fs.writeFileSync(filename, source)
}

function build105() {
  const caseName = '2.1.104-to-2.1.105'
  const temp = materialize('00071c6055eb3c06b6014cf5267e0fe28575c13b', caseName)
  const introductionBase = run(temp, 'git', ['rev-parse', 'HEAD']).trim()
  try {
    // The dedicated Ink blockquote owner is introduced at 96→97. Commit it
    // as the cumulative prerequisite so this case owns only the 104→105
    // whitespace evolution and does not duplicate the earlier component.
    buildMarkdownBlockquote97(temp)
    run(temp, 'git', ['add', 'src/components/Markdown.tsx'])
    run(temp, 'git', ['commit', '-qm', 'semantic prerequisite: target97 markdown blockquote'])
    prepareMemorySynthesisOwner105(temp)
    buildTmuxSocketPrerequisites105(temp)
    buildLogFilters98(temp)
    buildLogPreview101(temp)
    buildLogRepoWording105(temp)
    for (const relative of [
      'src/utils/mcpOutputStorage.ts',
      'src/services/mcp/client.ts',
      'src/utils/plugins/schemas.ts',
      'src/types/plugin.ts',
      'src/hooks/useManagePlugins.ts',
      'src/utils/suggestions/skillUsageTracking.ts',
      'src/services/mcp/useManageMCPConnections.ts',
      'src/commands/plugin/PluginErrors.tsx',
      'src/screens/Doctor.tsx',
      'src/utils/doctorContextWarnings.ts',
    ]) applyWorkingDiff(temp, [relative])
    applySelectedWorkingDiff(
      temp,
      'src/utils/plugins/pluginLoader.ts',
      hunk =>
        !hunk.includes('readlink(srcPath)') &&
        /PluginMonitorsSchema|loadPluginMonitors|safeResolvePluginPath|path-traversal|subagentStatusLine|plugin\.monitors/.test(hunk),
    )
    applySelectedWorkingDiff(
      temp,
      'src/screens/REPL.tsx',
      hunk => hunk.includes('usePluginMonitors'),
    )
    applySelectedWorkingDiff(
      temp,
      'src/cli/print.ts',
      hunk =>
        hunk.includes('waitForHeadlessMcp') ||
        hunk.includes('shouldWaitForHeadlessMcp'),
    )
    buildPluginDependencyInstall105(temp)
    buildManagedAgentDocs105(temp)
    buildDoctorKeybindings105(temp)
    buildSubagentStatusLine105(temp)
    buildRecap105(temp)
    buildWorktreeRecovery105(temp)
    buildPromptCacheBreak105(temp)
    buildClientPresence105(temp)
    buildRemoteTriggerSchema105(temp)
    buildTreeConnector105(temp)
    buildTaskRegistry105(temp)
    buildAtomicTeammateReservation105(temp)
    buildSdkMemoryPaths105(temp)
    buildHeadlessMcpPrewait105(temp)
    buildBackendRegistry105(temp)
    buildSkillListingOverrides105(temp)
    buildEventLoopStall105(temp)
    buildMemoryThreshold105(temp)
    buildGitWatchRedaction105(temp)
    buildAutoModeState105(temp)
    buildAtomicTeamFile105(temp)
    buildAnalyticsState105(temp)
    buildTeamMemoryAcl105(temp)
    buildAttachmentMessageTable105(temp)
    buildPluginSettingsDescription105(temp)
    buildTrustedDevicePolicy105(temp)
    buildRecalledMemoryRating105(temp)
    buildApiRetryTelemetry105(temp)
    buildFirstAttemptRequestId105(temp)
    buildAuthRenderRoot105(temp)
    buildEnvHookState105(temp)
    buildSkillDynamicState105(temp)
    buildPluginManifestVersion105(temp)
    buildOfficialMarketplaceGcsRollback105(temp)
    buildMcpElicitationForm105(temp)
    buildReactiveCompaction105(temp)
    buildMalformedToolUseRecovery105(temp)
    buildCompactionCompletion105(temp)
    buildTmuxFocusHint105(temp)
    buildTmuxSocket105(temp)
    buildSessionState105(temp)
    buildKeybindingSelectionScroll105(temp)
    buildFeedbackPayload105(temp)
    buildBackgroundWorkExit105(temp)
    buildRequestTooLarge105(temp)
    buildUltrareviewPreflight105(temp)
    buildHookRegistryValidation105(temp)
    buildUpstreamRelayDrain105(temp)
    buildAwaySummaryPrompt105(temp)
    buildAwaySummaryConfig105(temp)
    buildMemorySurveyJudge105(temp)
    buildStripPromptXml105(temp)
    buildFilesystemPermissions105(temp)
    buildWorkerRawCommand105(temp)
    buildToolSearchMcpTelemetry105(temp)
    buildConfigTrustReason105(temp)
    buildRepoCheckouts105(temp)
    buildSkillsMenuOverrides105(temp)
    buildDatadogAllowlist105(temp)
    buildFileReadMitigationPolicy105(temp)
    buildAgentConcurrencyGuidance105(temp)
    // Target105's compiled print-resume graph retains the custom-title
    // behavior first observed at target101 even though the isolated source
    // commit omits it. Replay that prerequisite before adding the target105
    // telemetry so the cumulative tree matches the authenticated branch.
    buildPrintResumeTitle101(temp)
    buildPrintResumeTelemetry105(temp)
    buildSessionStatePropagation105(temp)
    buildHfiAuthCleanup105(temp)
    buildSessionAppendPolicy105(temp)
    buildMarkdownOrderedList105(temp)
    buildMarkdownWhitespace105(temp)
    buildMetaEnterTab105(temp)
    buildGracefulShutdownPersistence105(temp)
    buildSkillActivatedOtel105(temp)
    buildPluginInstallOtel105(temp)
    buildToolSearchMcpNonblocking105(temp)
    buildSdkAuxiliary105(temp)
    buildTeleportTrustedDevice105(temp)
    buildGitBundleBaseRef105(temp)
    buildMcpOAuthDiscoveryState105(temp)
    buildSubprocessIsolationPaths105(temp)
    buildMessageRatingSurface105(temp)
    buildWorktreeResumeNameFilter105(temp)
    buildAccountLabel105(temp)
    buildSystemDiagnosticsHeading105(temp)
    buildModelDeprecationTense105(temp)
    buildFullscreenSuggestionNoPad105(temp)
    buildMessageDeferral105(temp)
    preserveCumulativeToolContext105(temp)
    preserveCumulativeShellToolContext105(temp)
    preserveCumulativeToolProgressRepl105(temp)
    buildMemorySynthesisFactShape105(temp)
    for (const relative of [
      'src/services/api/promptCacheBreakDetection.ts',
      'src/skills/bundled/claude-api/shared/managed-agents-core.md',
      'src/skills/bundled/claude-api/shared/managed-agents-events.md',
      'src/skills/bundled/claude-api/shared/managed-agents-tools.md',
    ]) {
      normalizeTerminalNewline(temp, relative)
    }
    // This case uses committed local prerequisites while it is assembled so
    // subsequent transforms have stable source owners.  The published
    // supplement must nevertheless be independently applicable to the raw
    // historical target, so diff against the introduction commit rather than
    // the temporary prerequisite tip.
    writePatch(temp, caseName, introductionBase)
    const materializedRoot = process.env.CLAUDE_CODE_MIDDLE_105_MATERIALIZED_ROOT
    if (materializedRoot) {
      fs.cpSync(temp, materializedRoot, { recursive: true })
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
}

function buildAgentMergedContext107(temp) {
  const filename = path.join(temp, 'src/utils/model/agent.ts')
  let source = fs.readFileSync(filename, 'utf8')
  source = replaceOnce(
    source,
    "import type { PermissionMode } from '../permissions/PermissionMode.js'\n",
    "import type { PermissionMode } from '../permissions/PermissionMode.js'\nimport { has1mContext } from '../context.js'\n",
    'target107 agent 1m context import',
  )
  source = replaceOnce(
    source,
    '  getRuntimeMainLoopModel,\n  parseUserSpecifiedModel,',
    '  getRuntimeMainLoopModel,\n  isOpus1mMergeEnabled,\n  parseUserSpecifiedModel,',
    'target107 agent merge gate import',
  )
  source = replaceOnce(
    source,
    `export function getDefaultSubagentModel(): string {
  return 'inherit'
}
`,
    `export function getDefaultSubagentModel(): string {
  return 'inherit'
}

function applyMergedOpus46Context(model: string): string {
  if (
    isOpus1mMergeEnabled() &&
    !has1mContext(model) &&
    getCanonicalName(model).includes('opus-4-6')
  ) {
    return \`${'${model}'}[1m]\`
  }
  return model
}
`,
    'target107 agent merge helper',
  )
  source = source.replaceAll(
    'const model = parseUserSpecifiedModel(',
    'const model = applyMergedOpus46Context(parseUserSpecifiedModel(',
  )
  source = replaceOnce(
    source,
    'applyMergedOpus46Context(parseUserSpecifiedModel(toolSpecifiedModel)\n',
    'applyMergedOpus46Context(parseUserSpecifiedModel(toolSpecifiedModel))\n',
    'target107 tool model helper close',
  )
  source = replaceOnce(
    source,
    'applyMergedOpus46Context(parseUserSpecifiedModel(agentModelWithExp)\n',
    'applyMergedOpus46Context(parseUserSpecifiedModel(agentModelWithExp))\n',
    'target107 agent model helper close',
  )
  fs.writeFileSync(filename, source)
}

function build107() {
  const caseName = '2.1.105-to-2.1.107'
  const temp = materialize('3848dd0b1826c7ccf5a5716541ed5d9b7dc93f08', caseName)
  try {
    buildAgentMergedContext107(temp)
    writePatch(temp, caseName)
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
}

const selectedBuild = process.argv[2]
if (!selectedBuild || selectedBuild === '97') build97()
if (!selectedBuild || selectedBuild === '98') build98()
if (!selectedBuild || selectedBuild === '100') build100()
if (!selectedBuild || selectedBuild === '101') build101()
if (!selectedBuild || selectedBuild === '104') build104()
if (!selectedBuild || selectedBuild === '105') build105()
if (!selectedBuild || selectedBuild === '107') build107()
