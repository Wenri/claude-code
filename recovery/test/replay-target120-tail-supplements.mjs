#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const TARGET120_MANAGED_AGENTS_REPLAY = {
  targetIndex: 21627,
  ownerPath:
    'src/skills/bundled/claude-api/shared/managed-agents-api-reference.md',
  preimage: {
    bytes: 21629,
    sha256: 'df1ea62ec9985391486d5dbcb9f287c518a30dd59670581fb74f88049a243983',
  },
  postimage: {
    bytes: 21630,
    sha256: '1b4ebbd210a0169e447d9b6a2936c080eac7b899e71d22fafa0d2eaccd34945b',
  },
  before:
    '| Create operations (Agents, Sessions, Vaults) | organization | 60 | — |',
  after:
    '| Create operations (Agents, Sessions, Vaults) | organization | 300 | — |',
}

export const TARGET120_BOOTSTRAP_STATE_REPLAY = {
  targetIndices: [370, 371],
  ownerPath: 'src/bootstrap/state.ts',
  preimage: {
    bytes: 61281,
    sha256: 'd6f74b0ea23ea6c09db27c0e433db91f930f7549bb2c0dcc9282731e9253bcbc',
  },
  postimage: {
    bytes: 61587,
    sha256: '5afb83e9037dbb8b60245540b933a2e19a5d7ee63020e6113da46a241a3db557',
  },
  replacements: [
    {
      before: '  isInteractive: boolean\n  kairosActive: boolean',
      after:
        '  isInteractive: boolean\n' +
        '  kairosActive: boolean\n' +
        '  fridayFundayDisabledForSession: boolean',
    },
    {
      before: '    isInteractive: false,\n    kairosActive: false,',
      after:
        '    isInteractive: false,\n' +
        '    kairosActive: false,\n' +
        '    fridayFundayDisabledForSession: false,',
    },
    {
      before:
        'export function setKairosActive(value: boolean): void {\n' +
        '  STATE.kairosActive = value\n' +
        '}\n\n' +
        'export function getStrictToolResultPairing',
      after:
        'export function setKairosActive(value: boolean): void {\n' +
        '  STATE.kairosActive = value\n' +
        '}\n\n' +
        'export function getFridayFundayDisabledForSession(): boolean {\n' +
        '  return STATE.fridayFundayDisabledForSession\n' +
        '}\n\n' +
        'export function setFridayFundayDisabledForSession(): void {\n' +
        '  STATE.fridayFundayDisabledForSession = true\n' +
        '}\n\n' +
        'export function getStrictToolResultPairing',
    },
  ],
}

export const TARGET120_SAFE_ENV_POWERSHELL_REPLAY = {
  targetIndex: 11081,
  ownerPath: 'src/utils/managedEnvConstants.ts',
  preimage: {
    bytes: 7119,
    sha256: '9816f92deeec80d9b21c915046b83cd1c324ae7a2aaaa6a6db8383492087ef26',
  },
  postimage: {
    bytes: 7156,
    sha256: '50253004f06ab8c42fdb5e25bb0d28a71dd24997bd504957ce5f14f1204ec554',
  },
  before:
    "  'CLAUDE_CODE_USE_FOUNDRY',\n" +
    "  'CLAUDE_CODE_USE_VERTEX',",
  after:
    "  'CLAUDE_CODE_USE_FOUNDRY',\n" +
    "  'CLAUDE_CODE_USE_POWERSHELL_TOOL',\n" +
    "  'CLAUDE_CODE_USE_VERTEX',",
}

export const TARGET120_CLASSIFIER_SURFACE_TELEMETRY_REPLAY = {
  targetIndices: [14042, 14060],
  owners: [
    {
      ownerPath: 'src/jobs/classifier.ts',
      preimage: {
        bytes: 44182,
        sha256: '49dae61b280b926fdac23e2974ad53c1a26268d2f036b23bdf78480b812279b3',
      },
      postimage: {
        bytes: 44681,
        sha256: '56b12fd07152511bd3f7aab6c7beee1e86ef390b9315389eddc5a0ca327dd03f',
      },
      replacements: [
        {
          before:
            'function emitDispatch(state: ClassifierJobState, template: string): void {\n' +
            '  if (!isBgSession() || state.dispatchEmitted) return\n' +
            '  state.dispatchEmitted = true\n' +
            '  if (IS_RESUME) return\n' +
            "  logEvent('tengu_bg_agent_dispatch', {\n" +
            '    agent: template,\n' +
            "    source: process.env.CLAUDE_BG_SOURCE ?? 'shell',\n" +
            '    intentLength: state.capturedIntent.length,\n' +
            '  })\n' +
            '}',
          after:
            'function surfaceFlags(surfaces: Set<string>): Record<string, boolean> {\n' +
            '  const flags: Record<string, boolean> = {}\n' +
            '  for (const surface of surfaces) flags[`surface_${surface}`] = true\n' +
            '  return flags\n' +
            '}\n\n' +
            'function emitDispatch(\n' +
            '  state: ClassifierJobState,\n' +
            '  template: string,\n' +
            '  surfaces: Set<string>,\n' +
            '): void {\n' +
            '  if (!isBgSession() || state.dispatchEmitted) return\n' +
            '  state.dispatchEmitted = true\n' +
            '  if (IS_RESUME) return\n' +
            "  logEvent('tengu_bg_agent_dispatch', {\n" +
            '    agent: template,\n' +
            "    source: process.env.CLAUDE_BG_SOURCE ?? 'shell',\n" +
            '    intentLength: state.capturedIntent.length,\n' +
            '    ...surfaceFlags(surfaces),\n' +
            '  })\n' +
            '}',
        },
        {
          before:
            '  engine: ClassifierEngine,\n' +
            '): Promise<ClassifiedState | null> {',
          after:
            '  engine: ClassifierEngine,\n' +
            '  surfaces: Set<string> = new Set(),\n' +
            '): Promise<ClassifiedState | null> {',
        },
        {
          before: "  logEvent('tengu_bg_classify', {\n    path,\n    branch:",
          after:
            "  logEvent('tengu_bg_classify', {\n" +
            '    path,\n' +
            '    engine,\n' +
            '    ...surfaceFlags(surfaces),\n' +
            '    branch:',
        },
        {
          before:
            '  engine: ClassifierEngine,\n' +
            '  midturn = false,\n' +
            '): Promise<void> {\n' +
            '  emitDispatch(state, template)',
          after:
            '  engine: ClassifierEngine,\n' +
            '  surfaces: Set<string> = new Set(),\n' +
            '  midturn = false,\n' +
            '): Promise<void> {\n' +
            '  emitDispatch(state, template, surfaces)',
        },
        {
          before: '          engine,\n        )',
          after: '          engine,\n          surfaces,\n        )',
        },
        {
          before: '        classifySource: classified.source,\n      })',
          after:
            '        classifySource: classified.source,\n' +
            '        ...surfaceFlags(surfaces),\n' +
            '      })',
        },
        {
          before:
            '  engine: ClassifierEngine,\n' +
            '): void {\n' +
            '  if (!state.kicked) {',
          after:
            '  engine: ClassifierEngine,\n' +
            '  surfaces: Set<string> = new Set(),\n' +
            '): void {\n' +
            '  if (!state.kicked) {',
        },
        {
          before: '    engine,\n    true,\n  ).catch(() => {})',
          after:
            '    engine,\n' +
            '    surfaces,\n' +
            '    true,\n' +
            '  ).catch(() => {})',
        },
      ],
    },

    {
      ownerPath: 'src/query/stopHooks.ts',
      preimage: {
        bytes: 23143,
        sha256: '4a65f1c572d21f3c9422d896334dd6bff4d39b62736f1c087882c25d16fb4e18',
      },
      postimage: {
        bytes: 23257,
        sha256: '8fa7bab10d8b686a846c134f615a1c8a4239752ea8de732c2a6281e4db274589',
      },
      replacements: [
        {
          before:
            '  const classifierSinks = taskSummaryModule\n' +
            '    ? taskSummaryModule.sinksFor(taskSummaryModule.detectSurfaces())\n' +
            '    : null',
          after:
            '  const classifierSurfaces = taskSummaryModule\n' +
            '    ? taskSummaryModule.detectSurfaces()\n' +
            '    : null\n' +
            '  const classifierSinks = classifierSurfaces\n' +
            '    ? taskSummaryModule!.sinksFor(classifierSurfaces)\n' +
            '    : null',
        },
        {
          before: '        classifierEngine,\n      )',
          after:
            '        classifierEngine,\n' +
            '        classifierSurfaces!,\n' +
            '      )',
        },
      ],
    },
  ],
}

export const TARGET120_SKILL_CHANGE_DETECTOR_LIFECYCLE_REPLAY = {
  targetIndex: 20794,
  owners: [
    {
      ownerPath: 'src/utils/plugins/refresh.ts',
      preimage: {
        bytes: 8654,
        sha256: '3d9c7328955121a52d8177189bb1fc392238d387e7cf54ef995474e539a841fa',
      },
      postimage: {
        bytes: 8819,
        sha256: 'cf1085ca4cfd87934328700ea897a50505e7245928b223d7c7d0fb23b748ca81',
      },
      replacements: [
        {
          before: "import { logError } from '../log.js'\n",
          after:
            "import { logError } from '../log.js'\n" +
            "import { createSignal } from '../signal.js'\n",
        },
        {
          before:
            'type SetAppState = (updater: (prev: AppState) => AppState) => void\n',
          after:
            'const pluginsChanged = createSignal()\n' +
            'export const onPluginsChanged = pluginsChanged.subscribe\n\n' +
            'type SetAppState = (updater: (prev: AppState) => AppState) => void\n',
        },
        {
          before:
            '  logForDebugging(\n' +
            '    `refreshActivePlugins: ${enabled.length} enabled, ${pluginCommands.length} commands, ${agentDefinitions.allAgents.length} agents, ${hook_count} hooks, ${mcp_count} MCP, ${lsp_count} LSP`,\n' +
            '  )',
          after:
            '  pluginsChanged.emit()\n\n' +
            '  logForDebugging(\n' +
            '    `refreshActivePlugins: ${enabled.length} enabled, ${pluginCommands.length} commands, ${agentDefinitions.allAgents.length} agents, ${hook_count} hooks, ${mcp_count} MCP, ${lsp_count} LSP`,\n' +
            '  )',
        },
      ],
    },
    {
      ownerPath: 'src/utils/skills/skillChangeDetector.ts',
      preimage: {
        bytes: 10213,
        sha256: 'f5e5ee7bbd4df1826ba1c169387c292610082726747263cda7fb3852db835cbe',
      },
      postimage: {
        bytes: 10251,
        sha256: 'aea576bf30a2a94ecc0220c3624bec020f7290fceef40b7064280128622e7b70',
      },
      replacements: [
        {
          before: "import * as platformPath from 'path'\n",
          after: '',
        },
        {
          before: "import { executeConfigChangeHooks, hasBlockingResult } from '../hooks.js'\n",
          after:
            "import { executeConfigChangeHooks, hasBlockingResult } from '../hooks.js'\n" +
            "import { onPluginsChanged } from '../plugins/refresh.js'\n",
        },
        {
          before:
            'let watcher: FSWatcher | null = null\n' +
            'let reloadTimer: ReturnType<typeof setTimeout> | null = null\n' +
            'const pendingChangedPaths = new Set<string>()\n' +
            'let initialized = false\n' +
            'let disposed = false\n' +
            'let dynamicSkillsCallbackRegistered = false\n' +
            'let unregisterCleanup: (() => void) | null = null\n' +
            'const skillsChanged = createSignal()\n\n' +
            '// Test overrides for timing constants\n' +
            'let testOverrides: {\n' +
            '  stabilityThreshold?: number\n' +
            '  pollInterval?: number\n' +
            '  reloadDebounce?: number\n' +
            '  /** Chokidar fs.stat polling interval when USE_POLLING is active. */\n' +
            '  chokidarInterval?: number\n' +
            '} | null = null\n',
          after:
            'export type SkillChangeDetectorOptions = {\n' +
            '  stabilityThreshold?: number\n' +
            '  pollInterval?: number\n' +
            '  reloadDebounce?: number\n' +
            '  /** Chokidar fs.stat polling interval when USE_POLLING is active. */\n' +
            '  chokidarInterval?: number\n' +
            '}\n\n' +
            'export function createSkillChangeDetector(\n' +
            '  options?: SkillChangeDetectorOptions,\n' +
            ') {\n' +
            '  const stabilityThreshold =\n' +
            '    options?.stabilityThreshold ?? FILE_STABILITY_THRESHOLD_MS\n' +
            '  const pollInterval =\n' +
            '    options?.pollInterval ?? FILE_STABILITY_POLL_INTERVAL_MS\n' +
            '  const reloadDebounce = options?.reloadDebounce ?? RELOAD_DEBOUNCE_MS\n' +
            '  const chokidarInterval = options?.chokidarInterval ?? POLLING_INTERVAL_MS\n' +
            '  const skillsChanged = createSignal()\n' +
            '  const unsubscribePluginChanges = onPluginsChanged(() =>\n' +
            '    skillsChanged.emit(),\n' +
            '  )\n' +
            '  let watcher: FSWatcher | null = null\n' +
            '  let reloadTimer: ReturnType<typeof setTimeout> | null = null\n' +
            '  const pendingChangedPaths = new Set<string>()\n' +
            '  let initialized = false\n' +
            '  let disposed = false\n' +
            '  let unsubscribeDynamicSkills: (() => void) | null = null\n' +
            '  let unregisterCleanup: (() => void) | null = null\n',
        },
        {
          before:
            '  // Register callback for when dynamic skills are loaded (only once)\n' +
            '  if (!dynamicSkillsCallbackRegistered) {\n' +
            '    dynamicSkillsCallbackRegistered = true\n' +
            '    onDynamicSkillsLoaded(() => {\n',
          after:
            '  // Register callback for when dynamic skills are loaded (only once)\n' +
            '  if (!unsubscribeDynamicSkills) {\n' +
            '    unsubscribeDynamicSkills = onDynamicSkillsLoaded(() => {\n',
        },
        {
          before: 'export async function initialize(): Promise<void> {',
          after: 'async function initialize(): Promise<void> {',
        },
        {
          before: 'export function dispose(): Promise<void> {',
          after: 'function dispose(): Promise<void> {',
        },
        {
          before: 'export const subscribe = skillsChanged.subscribe',
          after: 'const subscribe = skillsChanged.subscribe',
        },
        {
          before:
            '      stabilityThreshold:\n' +
            '        testOverrides?.stabilityThreshold ?? FILE_STABILITY_THRESHOLD_MS,\n' +
            '      pollInterval:\n' +
            '        testOverrides?.pollInterval ?? FILE_STABILITY_POLL_INTERVAL_MS,',
          after:
            '      stabilityThreshold,\n' +
            '      pollInterval,',
        },
        {
          before: "      return path.split(platformPath.sep).some(dir => dir === '.git')",
          after: "      return path.split(/[/\\\\]/).some(dir => dir === '.git')",
        },
        {
          before:
            '    interval: testOverrides?.chokidarInterval ?? POLLING_INTERVAL_MS,',
          after: '    interval: chokidarInterval,',
        },
        {
          before:
            '  // Register cleanup to properly dispose of the file watcher during graceful shutdown\n' +
            '  unregisterCleanup = registerCleanup(async () => {\n' +
            '    await dispose()\n' +
            '  })',
          after:
            '  // Do not resolve initialization until chokidar has completed its initial scan.\n' +
            '  const initializedWatcher = watcher\n' +
            '  await new Promise<void>(resolve => {\n' +
            "    initializedWatcher.once('ready', resolve)\n" +
            '  })\n\n' +
            '  // Register cleanup to properly dispose of the file watcher during graceful shutdown\n' +
            '  unregisterCleanup = registerCleanup(dispose)',
        },
        {
          before:
            '  if (unregisterCleanup) {\n' +
            '    unregisterCleanup()\n' +
            '    unregisterCleanup = null\n' +
            '  }\n' +
            '  let closePromise: Promise<void> = Promise.resolve()',
          after:
            '  if (unregisterCleanup) {\n' +
            '    unregisterCleanup()\n' +
            '    unregisterCleanup = null\n' +
            '  }\n' +
            '  if (unsubscribeDynamicSkills) {\n' +
            '    unsubscribeDynamicSkills()\n' +
            '    unsubscribeDynamicSkills = null\n' +
            '  }\n' +
            '  let closePromise: Promise<void> = Promise.resolve()',
        },
        {
          before:
            '  pendingChangedPaths.clear()\n' +
            '  skillsChanged.clear()\n' +
            '  return closePromise',
          after:
            '  pendingChangedPaths.clear()\n' +
            '  unsubscribePluginChanges()\n' +
            '  skillsChanged.clear()\n' +
            '  return closePromise',
        },
        {
          before:
            '  }, testOverrides?.reloadDebounce ?? RELOAD_DEBOUNCE_MS)',
          after: '  }, reloadDebounce)',
        },
        {
          before:
            '/**\n' +
            ' * Reset internal state for testing purposes only.\n' +
            ' */\n' +
            'export async function resetForTesting(overrides?: {\n' +
            '  stabilityThreshold?: number\n' +
            '  pollInterval?: number\n' +
            '  reloadDebounce?: number\n' +
            '  chokidarInterval?: number\n' +
            '}): Promise<void> {\n' +
            '  // Clean up existing watcher if present to avoid resource leaks\n' +
            '  if (watcher) {\n' +
            '    await watcher.close()\n' +
            '    watcher = null\n' +
            '  }\n' +
            '  if (reloadTimer) {\n' +
            '    clearTimeout(reloadTimer)\n' +
            '    reloadTimer = null\n' +
            '  }\n' +
            '  pendingChangedPaths.clear()\n' +
            '  skillsChanged.clear()\n' +
            '  initialized = false\n' +
            '  disposed = false\n' +
            '  testOverrides = overrides ?? null\n' +
            '}\n\n' +
            'export const skillChangeDetector = {\n' +
            '  initialize,\n' +
            '  dispose,\n' +
            '  subscribe,\n' +
            '  resetForTesting,\n' +
            '}\n',
          after:
            '  return {\n' +
            '    initialize,\n' +
            '    dispose,\n' +
            '    [Symbol.asyncDispose]: dispose,\n' +
            '    subscribe,\n' +
            '  }\n' +
            '}\n\n' +
            'export const skillChangeDetector = createSkillChangeDetector()\n',
        },
      ],
    },
  ],
}

export const TARGET120_ORPHAN_PTY_SIDECAR_REPLAY = {
  targetIndex: 19480,
  ownerPath: 'src/daemon/supervisor.ts',
  preimage: {
    bytes: 53198,
    sha256: '2cf2b91d2a7153af5cbb69eeb04c570821f4ec93789e1117dee6eaa74c2132e1',
  },
  postimage: {
    bytes: 53478,
    sha256: 'bdeca3cbaa8cfe41c0d36175210ab11ef8020e833c36670cfe11a5ab6b6b04ce',
  },
  before:
    '  const entries = await readdir(getPtyDir()).catch(() => [])\n' +
    '  let reaped = 0\n' +
    '  for (const entry of entries) {\n' +
    "    if (!entry.endsWith('.sock')) continue",
  after:
    '  const ptyDir = getPtyDir()\n' +
    '  const entries = await readdir(ptyDir).catch(() => [])\n' +
    "  const sockets = new Set(entries.filter(entry => entry.endsWith('.sock')))\n" +
    '  let reaped = 0\n' +
    '  for (const entry of entries) {\n' +
    "    if (!entry.endsWith('.sock')) {\n" +
    '      if (\n' +
    "        entry.endsWith('.sock.err') &&\n" +
    '        !sockets.has(entry.slice(0, -4))\n' +
    '      ) {\n' +
    '        void unlink(join(ptyDir, entry)).catch(() => {})\n' +
    '      }\n' +
    '      continue\n' +
    '    }',
}

export const TARGET120_DAEMON_STATUS_RECOVERY_TELEMETRY_REPLAY = {
  targetIndices: [18593, 19492, 19500, 19509],
  owners: [
    {
      ownerPath: 'src/daemon/main.ts',
      targetIndices: [19492, 19500],
      preimage: {
        bytes: 37394,
        sha256: '1f4d1627b1c62d358e21aa5810f65ec9b413e47e0fe6f8f1761f9be537e0c1fc',
      },
      postimage: {
        bytes: 37637,
        sha256: '6107ec4bc3852768f469873002219340a745d4f1a2d1648b3cd4fa385366ad65',
      },
      replacements: [
        {
          before:
            "      logEvent('tengu_daemon_worker_permanent_exit', {\n" +
            '        exit_code: code ?? undefined,\n' +
            '        worker_kind: this.kind,',
          after:
            "      logEvent('tengu_daemon_worker_permanent_exit', {\n" +
            '        exit_code: code ?? undefined,\n' +
            '        uptime_ms: uptime,\n' +
            '        worker_kind: this.kind,',
        },
        {
          before:
            "      logEvent('tengu_daemon_worker_crash', {\n" +
            '        consecutive: this.crashes,\n' +
            '        exit_code: code ?? undefined,\n' +
            '        worker_kind: this.kind,',
          after:
            "      logEvent('tengu_daemon_worker_crash', {\n" +
            '        consecutive: this.crashes,\n' +
            '        exit_code: code ?? undefined,\n' +
            '        uptime_ms: uptime,\n' +
            '        worker_kind: this.kind,',
        },
        {
          before:
            '  const running = await getRunningDaemon()\n' +
            '  if (running) {\n' +
            '    log(\n' +
            "      'supervisor',\n" +
            '      `another daemon is already running (pid=${running.pid}, version=${running.version}) — exiting`,\n' +
            '    )',
          after:
            '  const running = await getRunningDaemon()\n' +
            '  if (running) {\n' +
            '    const recovery =\n' +
            "      process.platform === 'win32'\n" +
            '        ? `Stop it with \\`taskkill /PID ${running.pid}\\`, then retry.`\n' +
            "        : 'Run `claude daemon stop` to stop it, then retry.'\n" +
            '    log(\n' +
            "      'supervisor',\n" +
            '      `another daemon is already running (pid=${running.pid}, version=${running.version}). ${recovery}`,\n' +
            '    )',
        },
      ],
    },
    {
      ownerPath: 'src/daemon/cli.ts',
      targetIndices: [19509],
      preimage: {
        bytes: 11108,
        sha256: 'a7c4b85c3cf4b98581eda1accc272076ca0979aa0736595c152ed5eb7ed7c8b2',
      },
      postimage: {
        bytes: 11156,
        sha256: 'f4e2578a96aceb721ab7fb04024c6eb30404a544fe5f77de39111c1a235fa1d6',
      },
      replacements: [
        {
          before:
            "    fail('daemon service is not installed — run `claude daemon install` first')",
          after:
            '    fail(\n' +
            "      'daemon service is not installed (service install is disabled in this version; the daemon runs on demand)',\n" +
            '    )',
        },
      ],
    },
    {
      ownerPath: 'src/daemon/hub.tsx',
      targetIndices: [18593],
      preimage: {
        bytes: 34272,
        sha256: '30a522786b42b424a0e8e11d24cc9fb7f97f3fbb02c301845996400598a4e880',
      },
      postimage: {
        bytes: 34305,
        sha256: 'f83910a6f3ac4f497b4b438f126daf097c9a7ee01c56c7eb768b609f879f3299',
      },
      replacements: [
        {
          before:
            "  if (!data.lock) return data.serviceInstalled ? 'installed · not running' : 'not installed'",
          after:
            '  if (!data.lock)\n' +
            '    return data.serviceInstalled\n' +
            "      ? 'installed · not running'\n" +
            "      : 'not installed (runs on demand)'",
        },
      ],
    },
  ],
}

export const TARGET120_ENVIRONMENT_SHELL_ANALYTICS_REPLAY = {
  targetIndex: 2576,
  owners: [
    {
      ownerPath: 'src/utils/env.ts',
      preimage: {
        bytes: 10943,
        sha256: '534a837cd1771d6c74ccadee08c7c01511f8f9630c906cc812326ff6d970e4b0',
      },
      postimage: {
        bytes: 11589,
        sha256: '30cdc4e1bb8febbd708d71b11c2ee72c799e871e5b2c9771c673e855d260f589',
      },
      replacements: [
        {
          before:
            'export function getHostPlatformForAnalytics(): Platform {\n' +
            '  const override = process.env.CLAUDE_CODE_HOST_PLATFORM\n' +
            "  if (override === 'win32' || override === 'darwin' || override === 'linux') {\n" +
            '    return override\n' +
            '  }\n' +
            '  return env.platform\n' +
            '}\n',
          after:
            'export function getHostPlatformForAnalytics(): Platform {\n' +
            '  const override = process.env.CLAUDE_CODE_HOST_PLATFORM\n' +
            "  if (override === 'win32' || override === 'darwin' || override === 'linux') {\n" +
            '    return override\n' +
            '  }\n' +
            '  return env.platform\n' +
            '}\n\n' +
            'const KNOWN_SHELL_EXECUTABLES = new Set([\n' +
            "  'zsh',\n" +
            "  'bash',\n" +
            "  'fish',\n" +
            "  'sh',\n" +
            "  'dash',\n" +
            "  'ash',\n" +
            "  'ksh',\n" +
            "  'tcsh',\n" +
            "  'csh',\n" +
            "  'nu',\n" +
            "  'nushell',\n" +
            "  'pwsh',\n" +
            "  'powershell',\n" +
            "  'cmd',\n" +
            "  'elvish',\n" +
            "  'xonsh',\n" +
            "  'ion',\n" +
            '])\n\n' +
            'export function classifyShellExecutable(shellPath?: string): string {\n' +
            "  if (!shellPath) return 'none'\n" +
            '  const executable = shellPath\n' +
            '    .split(/[/\\\\]/)\n' +
            '    .pop()!\n' +
            '    .toLowerCase()\n' +
            "    .replace(/\\.exe$/, '')\n" +
            "  return KNOWN_SHELL_EXECUTABLES.has(executable) ? executable : 'other'\n" +
            '}\n\n' +
            'export function getShellForAnalytics(): string {\n' +
            '  return classifyShellExecutable(\n' +
            "    process.env.SHELL || process.env.COMSPEC || '',\n" +
            '  )\n' +
            '}\n',
        },
      ],
    },
    {
      ownerPath: 'src/utils/Shell.ts',
      preimage: {
        bytes: 17932,
        sha256: '53dee92d1793e1f19952231cd3e75bf6a4740a83ca33bdd54e665a9e72b55df1',
      },
      postimage: {
        bytes: 17479,
        sha256: '6675c6a34b10d4492460647ba58cef46596c02c23d2a6d41ad587c44f42a1749',
      },
      replacements: [
        {
          before: "import { pwd } from './cwd.js'\n",
          after:
            "import { pwd } from './cwd.js'\n" +
            "import { classifyShellExecutable } from './env.js'\n",
        },
        {
          before:
            'const KNOWN_SHELL_EXECUTABLES = new Set([\n' +
            "  'zsh',\n" +
            "  'bash',\n" +
            "  'fish',\n" +
            "  'sh',\n" +
            "  'dash',\n" +
            "  'ash',\n" +
            "  'ksh',\n" +
            "  'tcsh',\n" +
            "  'csh',\n" +
            "  'nu',\n" +
            "  'nushell',\n" +
            "  'pwsh',\n" +
            "  'powershell',\n" +
            "  'cmd',\n" +
            "  'elvish',\n" +
            "  'xonsh',\n" +
            "  'ion',\n" +
            '])\n\n' +
            'export function classifyShellExecutable(shellPath?: string): string {\n' +
            "  if (!shellPath) return 'none'\n" +
            '  const executable = shellPath\n' +
            '    .split(/[/\\\\]/)\n' +
            '    .pop()!\n' +
            '    .toLowerCase()\n' +
            "    .replace(/\\.exe$/, '')\n" +
            "  return KNOWN_SHELL_EXECUTABLES.has(executable) ? executable : 'other'\n" +
            '}\n\n',
          after: '',
        },
      ],
    },
    {
      ownerPath: 'src/services/analytics/metadata.ts',
      preimage: {
        bytes: 32617,
        sha256: 'd034fde16f98ca6d65d843d30900a1b3374050ae65714caaa200abbf849f6fb4',
      },
      postimage: {
        bytes: 32697,
        sha256: '66e23ced039083d7113f0af6f956c77641d045941b97a94729e35fe5106e633d',
      },
      replacements: [
        {
          before:
            "import { env, getHostPlatformForAnalytics } from '../../utils/env.js'",
          after:
            'import {\n' +
            '  env,\n' +
            '  getHostPlatformForAnalytics,\n' +
            '  getShellForAnalytics,\n' +
            "} from '../../utils/env.js'",
        },
        {
          before: '  terminal: string | null\n  packageManagers:',
          after:
            '  terminal: string | null\n' +
            '  shell: string\n' +
            '  packageManagers:',
        },
        {
          before:
            '    terminal: envDynamic.terminal,\n' +
            '    packageManagers:',
          after:
            '    terminal: envDynamic.terminal,\n' +
            '    shell: getShellForAnalytics(),\n' +
            '    packageManagers:',
        },
      ],
    },
  ],
}

export const TARGET120_INTERNAL_NETWORK_PROBE_STUB_REPLAY = {
  targetIndex: 2578,
  ownerPath: 'src/utils/env.ts',
  preimage: {
    bytes: 11589,
    sha256: '30cdc4e1bb8febbd708d71b11c2ee72c799e871e5b2c9771c673e855d260f589',
  },
  postimage: {
    bytes: 11697,
    sha256: 'dcd3b106471fa9f18439f1bde9bd810d03f36d42a854638ce406c4612de20a5c',
  },
  replacements: [
    {
      before:
        'const hasInternetAccess = memoize(async (): Promise<boolean> => {\n' +
        '  try {\n' +
        "    const { default: axiosClient } = await import('axios')\n" +
        "    await axiosClient.head('http://1.1.1.1', {\n" +
        '      signal: AbortSignal.timeout(1000),\n' +
        '    })\n' +
        '    return true\n' +
        '  } catch {\n' +
        '    return false\n' +
        '  }\n' +
        '})\n',
      after:
        'const hasInternetAccess = memoize(async (): Promise<boolean> => {\n' +
        '  try {\n' +
        "    const { default: axiosClient } = await import('axios')\n" +
        "    await axiosClient.head('http://1.1.1.1', {\n" +
        '      signal: AbortSignal.timeout(1000),\n' +
        '    })\n' +
        '    return true\n' +
        '  } catch {\n' +
        '    return false\n' +
        '  }\n' +
        '})\n\n' +
        'async function probeInternalNetworkAccess(): Promise<null> {\n' +
        '  return null\n' +
        '}\n',
    },
    {
      before: 'export const env = {\n  hasInternetAccess,\n',
      after:
        'export const env = {\n' +
        '  hasInternetAccess,\n' +
        '  probeInternalNetworkAccess,\n',
    },
  ],
}

export const TARGET120_CCR_STATUS_CATEGORY_GUARD_REPLAY = {
  targetIndex: 19809,
  ownerPath: 'src/cli/transports/ccrClient.ts',
  preimage: {
    bytes: 34499,
    sha256: '6b86c6b8e013c62c4598568d226ca26fdca943b60571fd724ccd6f2219703cdc',
  },
  postimage: {
    bytes: 34578,
    sha256: '730e65d77df10ebd40cc2a661431d956ecfd701deabd4fe060ae26aeb8a55bd1',
  },
  replacements: [
    {
      before:
        'function alwaysValidStatus(): boolean {\n' +
        '  return true\n' +
        '}\n',
      after:
        'function alwaysValidStatus(): boolean {\n' +
        '  return true\n' +
        '}\n\n' +
        'function hasStatusCategory(\n' +
        '  value: unknown,\n' +
        '): value is { status_category: string } {\n' +
        '  return (\n' +
        '    value !== null &&\n' +
        "    typeof value === 'object' &&\n" +
        "    'status_category' in value &&\n" +
        "    typeof value.status_category === 'string'\n" +
        '  )\n' +
        '}\n',
    },
    {
      before:
        '    const externalMetadata =\n' +
        '      postTurnSummary !== null &&\n' +
        "      typeof postTurnSummary === 'object' &&\n" +
        '      typeof (postTurnSummary as Record<string, unknown>).status_category ===\n' +
        "        'string' &&\n" +
        "      (postTurnSummary as Record<string, unknown>).status_category === 'blocked'\n",
      after:
        '    const externalMetadata =\n' +
        '      hasStatusCategory(postTurnSummary) &&\n' +
        "      postTurnSummary.status_category === 'blocked'\n",
    },
  ],
}

export const TARGET120_MCP_EFFORT_FALLBACK_REPLAY = {
  targetIndex: 21892,
  ownerPath: 'src/entrypoints/mcp.ts',
  preimage: {
    bytes: 6331,
    sha256: 'f41f8ea5a047f9fa1cfc59e834b0ba2dc09e4f14dacaf3e838ae7abdf91f0399',
  },
  postimage: {
    bytes: 6385,
    sha256: 'aef22e706b586f582c360bfbdf41dc188176f6c4b451ad3c0543bf3c6aab2c43',
  },
  replacements: [
    {
      before: '      const toolUseContext: ToolUseContext = {',
      after: '      const toolUseContext = {',
    },
    {
      before:
        '        setAppState: () => {},\n' +
        '        setReplContext: () => {},',
      after:
        '        setAppState: () => {},\n' +
        '        getEffortValue: () => undefined,\n' +
        '        setReplContext: () => {},',
    },
    {
      before:
        '        updateAttributionState: () => {},\n' +
        '      }',
      after:
        '        updateAttributionState: () => {},\n' +
        '      } as unknown as ToolUseContext',
    },
  ],
}

export const TARGET120_ULTRAREVIEW_NOOP_TASK_REGISTRY_REPLAY = {
  targetIndex: 21966,
  owners: [
    {
      ownerPath: 'src/utils/task/framework.ts',
      preimage: {
        bytes: 11807,
        sha256: '8c7929a94c67c282682097307d9bbcaa2cda19b9b3285916f929dab5afba938b',
      },
      postimage: {
        bytes: 12009,
        sha256: 'b577b57a19d8ed7306361cab71efd5b5a30d5ed8c1032dc413be160027aea5e9',
      },
      replacements: [
        {
          before:
            '/**\n' +
            ' * Register a new task in AppState.\n' +
            ' */',
          after:
            'export const NOOP_TASK_REGISTRY = {\n' +
            '  register() {},\n' +
            '  update() {},\n' +
            '  remove() {},\n' +
            '  evictTerminal() {},\n' +
            '  applyOffsetsAndEvict() {},\n' +
            '  get() {\n' +
            '    return undefined\n' +
            '  },\n' +
            '  all() {\n' +
            '    return {}\n' +
            '  },\n' +
            '}\n\n' +
            '/**\n' +
            ' * Register a new task in AppState.\n' +
            ' */',
        },
      ],
    },
    {
      ownerPath: 'src/cli/handlers/ultrareview.ts',
      preimage: {
        bytes: 8140,
        sha256: 'c43e445e1044b2e35697a00950651a728e59e8c2c8d6fa6f75797ebdba84e77b',
      },
      postimage: {
        bytes: 8241,
        sha256: 'a0860b36f5cc8616664201479ed23548cecd8376f65e26b355f46041b1793dbd',
      },
      replacements: [
        {
          before: "import { sleep } from '../../utils/sleep.js'",
          after:
            "import { sleep } from '../../utils/sleep.js'\n" +
            "import { NOOP_TASK_REGISTRY } from '../../utils/task/framework.js'",
        },
        {
          before: '    context: { abortController },',
          after:
            '    context: { abortController, taskRegistry: NOOP_TASK_REGISTRY },',
        },
      ],
    },
  ],
}

export const TARGET120_FLEETVIEW_LIVE_REPOSITORY_REPLAY = {
  targetIndices: [19627, 19629],
  ownerPath: 'src/components/FleetView.tsx',
  preimage: {
    bytes: 82350,
    sha256: 'dc4b63eb534e2a2923c6667430db1b241873939b9ff10bcf853b772707249314',
  },
  postimage: {
    bytes: 83130,
    sha256: '2818ddba61861f9eb0cb0c6e5eb9b41f66678aa003e35ab7e5ab9b545bcbbf88',
  },
  replacements: [
    {
      before:
        '  const [activeCwd, setActiveCwd] = useState(rootCwd)\n' +
        '  const [showAllSuggestions, setShowAllSuggestions] = useState(false)',
      after:
        '  const [activeCwd, setActiveCwd] = useState(rootCwd)\n' +
        '  const jobOrigins = [...(jobs ?? []), ...pendingJobs]\n' +
        '    .map(job => spawnOrigin(job.state))\n' +
        '    .sort()\n' +
        "    .join('\\x00')\n" +
        '  const availableRepositories = useMemo(() => {\n' +
        '    const next = { ...repositories }\n' +
        "    for (const origin of jobOrigins ? jobOrigins.split('\\x00') : []) {\n" +
        '      const name = basename(origin)\n' +
        '      if (name && !/\\s/.test(name) && next[name] === undefined) {\n' +
        '        next[name] = origin\n' +
        '      }\n' +
        '    }\n' +
        '    return next\n' +
        '  }, [jobOrigins, repositories])\n' +
        '  const [showAllSuggestions, setShowAllSuggestions] = useState(false)',
    },
    {
      before:
        '      prTargetJob ? null : parseDispatch(query, templates, repositories, routines),\n' +
        '    [prTargetJob, query, repositories, routines, templates],',
      after:
        '      prTargetJob\n' +
        '        ? null\n' +
        '        : parseDispatch(query, templates, availableRepositories, routines),\n' +
        '    [prTargetJob, query, availableRepositories, routines, templates],',
    },
    {
      before:
        '        routines,\n' +
        '        repositories,\n' +
        '        skills,',
      after:
        '        routines,\n' +
        '        availableRepositories,\n' +
        '        skills,',
    },
    {
      before:
        '      query,\n' +
        '      repositories,\n' +
        '      routines,',
      after:
        '      query,\n' +
        '      availableRepositories,\n' +
        '      routines,',
    },
    {
      before:
        '  const canPin = Boolean(\n' +
        '    selected && !pendingJobs.some(job => job.id === selected.id),\n' +
        '  )\n' +
        '  useLayoutEffect(() => {',
      after:
        '  const canPin = Boolean(\n' +
        '    selected && !pendingJobs.some(job => job.id === selected.id),\n' +
        '  )\n' +
        '  const footerState = { canPin }\n' +
        '  useLayoutEffect(() => {',
    },
    {
      before:
        '    const tagged = extractRepoCwd(query, repositories, templates)\n' +
        '    const next =',
      after:
        '    const tagged = extractRepoCwd(\n' +
        '      query,\n' +
        '      availableRepositories,\n' +
        '      templates,\n' +
        '    )\n' +
        '    const next =',
    },
    {
      before:
        '  }, [query, repositories, rootCwd, selected, selectedHeader, templates])',
      after:
        '  }, [\n' +
        '    availableRepositories,\n' +
        '    query,\n' +
        '    rootCwd,\n' +
        '    selected,\n' +
        '    selectedHeader,\n' +
        '    templates,\n' +
        '  ])',
    },
    {
      before:
        '            })\n' +
        '            return (\n' +
        '              <Box key={job.id} flexDirection="column">',
      after:
        '            })\n' +
        '            const rowState = { attaching: attachingJobId === job.id }\n' +
        '            return (\n' +
        '              <Box key={job.id} flexDirection="column">',
    },
    {
      before: '                {selectedRow && job.state.detail ? (',
      after:
        '                {selectedRow &&\n' +
        '                !rowState.attaching &&\n' +
        '                job.state.detail ? (',
    },
    {
      before:
        "          enter attach · space peek · l logs · r respawn · x stop/rm{canPin ? ' · ctrl+t pin' : ''} · shift+↑↓ reorder · ctrl+s group",
      after:
        "          enter attach · space peek · l logs · r respawn · x stop/rm{footerState.canPin ? ' · ctrl+t pin' : ''} · shift+↑↓ reorder · ctrl+s group",
    },
    {
      before:
        "                : `↑↓ move · enter attach/dispatch · space peek · tab complete · l logs · r respawn · ctrl+x stop/delete · ctrl+r rename${canPin ? ' · ctrl+t pin' : ''} · shift+↑↓ reorder · esc exit`}",
      after:
        "                : `↑↓ move · enter attach/dispatch · space peek · tab complete · l logs · r respawn · ctrl+x stop/delete · ctrl+r rename${footerState.canPin ? ' · ctrl+t pin' : ''} · shift+↑↓ reorder · esc exit`}",
    },
  ],
}

export const TARGET120_EXIT_WORKTREE_CWD_OVERRIDE_REPLAY = {
  targetIndex: 13763,
  owners: [
    {
      ownerPath: 'src/utils/cwd.ts',
      preimage: {
        bytes: 985,
        sha256: '25d5bbb7fc905447a3f17c4daac6d073c41515263223ec37484badf5792b37ce',
      },
      postimage: {
        bytes: 1170,
        sha256: '9732b2b449e3b452304ab8956e01cc69d0242d996800c8764b92dd78d058414b',
      },
      replacements: [
        {
          before:
            'export function runWithCwdOverride<T>(cwd: string, fn: () => T): T {\n' +
            '  return cwdOverrideStorage.run(cwd, fn)\n' +
            '}\n',
          after:
            'export function runWithCwdOverride<T>(cwd: string, fn: () => T): T {\n' +
            '  return cwdOverrideStorage.run(cwd, fn)\n' +
            '}\n\n' +
            '/** Whether the current async context has an explicit working-directory override. */\n' +
            'export function hasCwdOverride(): boolean {\n' +
            '  return cwdOverrideStorage.getStore() !== undefined\n' +
            '}\n',
        },
      ],
    },
    {
      ownerPath: 'src/tools/ExitWorktreeTool/ExitWorktreeTool.ts',
      preimage: {
        bytes: 12105,
        sha256: 'a33f0c808dd1d1a871bf0adc5c77d0264f4707d5ad7e4131bed821abcc18ddde',
      },
      postimage: {
        bytes: 12625,
        sha256: '5034db17e15d842e011d5cd10f9710d6f56bb855d4e6476e6dbfe77c2240c92c',
      },
      replacements: [
        {
          before: "import { count } from '../../utils/array.js'\n",
          after:
            "import { count } from '../../utils/array.js'\n" +
            "import { hasCwdOverride } from '../../utils/cwd.js'\n",
        },
        {
          before:
            '  userFacingName() {\n' +
            "    return 'Exiting worktree'\n" +
            '  },',
          after:
            '  userFacingName(input) {\n' +
            "    return input?.action === 'remove'\n" +
            "      ? 'Cleaning up worktree'\n" +
            "      : 'Exiting worktree'\n" +
            '  },',
        },
        {
          before:
            '  async validateInput(input) {\n' +
            '    // Scope guard:',
          after:
            '  async validateInput(input) {\n' +
            '    if (hasCwdOverride()) {\n' +
            '      return {\n' +
            '        result: false,\n' +
            '        message:\n' +
            "          'ExitWorktree cannot be called from a subagent with a cwd override (isolation: \"worktree\" or explicit cwd) — it would mutate the parent session\\'s process-wide working directory. This agent is already isolated; use Bash with `cd` for directory changes within it.',\n" +
            '        errorCode: 5,\n' +
            '      }\n' +
            '    }\n\n' +
            '    // Scope guard:',
        },
      ],
    },
  ],
}

export const TARGET120_FEEDBACK_SURVEY_OPTIONS_REPLAY = {
  targetIndices: [20931, 20935, 20951, 20952],
  owners: [
    {
      ownerPath: 'src/components/FeedbackSurvey/SurveyOptions.tsx',
      targetIndices: [20931],
      preimage: { absent: true },
      postimage: {
        bytes: 964,
        sha256: '4f79f3a9637801b5aa7964e5ae7f5afb4142981829d9c0bbbc8987204b64d759',
      },
      postimageText: `import React from 'react'
import { Box, Button, Text } from '../../ink.js'

export type SurveyOption<TKey extends string> = {
  key: TKey
  label: string
}

export function SurveyOptions<TKey extends string>({
  options,
  optionWidth,
  onSelect,
  marginTop,
}: {
  options: ReadonlyArray<SurveyOption<TKey>>
  optionWidth?: number
  onSelect: (key: TKey) => void
  marginTop?: number
}): React.ReactNode {
  return (
    <Box marginLeft={2} marginTop={marginTop}>
      {options.map(({ key, label }) => (
        <Box key={key} width={optionWidth}>
          <Button tabIndex={-1} onAction={() => onSelect(key)}>
            {({ hovered }) => (
              <Box
                backgroundColor={
                  hovered ? 'userMessageBackgroundHover' : undefined
                }
              >
                <Text color="ansi:cyan">{key}</Text>: {label}
              </Box>
            )}
          </Button>
        </Box>
      ))}
    </Box>
  )
}
`,
    },
    {
      ownerPath: 'src/components/FeedbackSurvey/FeedbackSurveyView.tsx',
      targetIndices: [20935],
      preimage: {
        bytes: 10660,
        sha256: '2307bbad58362eaa0b134b2e3b8d749bb70549f6b51676b38e569f88c011a78e',
      },
      postimage: {
        bytes: 2409,
        sha256: 'ab8f4e2c5fb900894526596a781c7076445697ffc90a62c46ed36851f4f878ca',
      },
      postimageText: `import React from 'react'
import { Box, Text } from '../../ink.js'
import {
  SurveyOptions,
  type SurveyOption,
} from './SurveyOptions.js'
import { useDebouncedDigitInput } from './useDebouncedDigitInput.js'
import type { FeedbackSurveyResponse } from './utils.js'

type Props = {
  onSelect: (option: FeedbackSurveyResponse) => void
  inputValue: string
  setInputValue: (value: string) => void
  message?: React.ReactNode
  messageBold?: boolean
  mountDelayMs?: number
  showNotSure?: boolean
}

type ResponseInput = '0' | '1' | '2' | '3' | '4'

const INPUT_TO_RESPONSE: Record<ResponseInput, FeedbackSurveyResponse> = {
  '0': 'dismissed',
  '1': 'bad',
  '2': 'fine',
  '3': 'good',
  '4': 'not_sure',
}

const RESPONSE_OPTIONS: ReadonlyArray<SurveyOption<ResponseInput>> = [
  { key: '1', label: 'Bad' },
  { key: '2', label: 'Fine' },
  { key: '3', label: 'Good' },
]
const NOT_SURE_OPTION: SurveyOption<ResponseInput> = {
  key: '4',
  label: 'Unsure',
}
const DISMISS_OPTION: SurveyOption<ResponseInput> = {
  key: '0',
  label: 'Dismiss',
}
const OPTION_WIDTH = 10
const DEFAULT_MESSAGE = 'How is Claude doing this session? (optional)'

export function isValidResponseInput(
  input: string,
  showNotSure = false,
): input is ResponseInput {
  if (input === '4') return showNotSure
  return input === '0' || input === '1' || input === '2' || input === '3'
}

export function FeedbackSurveyView({
  onSelect,
  inputValue,
  setInputValue,
  message = DEFAULT_MESSAGE,
  messageBold = true,
  mountDelayMs,
  showNotSure = false,
}: Props): React.ReactNode {
  const options = showNotSure
    ? [...RESPONSE_OPTIONS, NOT_SURE_OPTION, DISMISS_OPTION]
    : [...RESPONSE_OPTIONS, DISMISS_OPTION]

  useDebouncedDigitInput<ResponseInput>({
    inputValue,
    setInputValue,
    isValidDigit: digit => isValidResponseInput(digit, showNotSure),
    onDigit: digit => onSelect(INPUT_TO_RESPONSE[digit]),
    mountDelayMs,
  })

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Box minWidth={2}>
          <Text color="ansi:cyan">●</Text>
        </Box>
        <Text bold={messageBold} wrap="wrap">
          {message}
        </Text>
      </Box>
      <SurveyOptions
        options={options}
        optionWidth={OPTION_WIDTH}
        onSelect={digit => {
          setInputValue('')
          onSelect(INPUT_TO_RESPONSE[digit])
        }}
      />
    </Box>
  )
}
`,
    },
    {
      ownerPath: 'src/components/FeedbackSurvey/MemoryWriteSurvey.tsx',
      targetIndices: [20951, 20952],
      preimage: {
        bytes: 5377,
        sha256: '8415c8e6986e54aef5c54ecd566c28a5c530ec2f8f995465db6130662ab62003',
      },
      postimage: {
        bytes: 4893,
        sha256: '790d298553e450b8e3fc00dba9957f6a623714d5ae0cf0f7df0689866c162c6c',
      },
      replacements: [
        {
          before: "import { Box, Button, Text } from '../../ink.js'",
          after: "import { Box, Text } from '../../ink.js'",
        },
        {
          before:
            "import { useDebouncedDigitInput } from './useDebouncedDigitInput.js'",
          after:
            'import {\n' +
            '  SurveyOptions,\n' +
            '  type SurveyOption,\n' +
            "} from './SurveyOptions.js'\n" +
            "import { useDebouncedDigitInput } from './useDebouncedDigitInput.js'",
        },
        {
          before:
            'const INPUT_TO_OUTCOME: Record<ResponseInput, MemoryWriteSurveyOutcome> = {\n' +
            "  '1': 'approve',\n" +
            "  '2': 'reject',\n" +
            '}\n',
          after:
            'const INPUT_TO_OUTCOME: Record<ResponseInput, MemoryWriteSurveyOutcome> = {\n' +
            "  '1': 'approve',\n" +
            "  '2': 'reject',\n" +
            '}\n' +
            'const SURVEY_OPTIONS: ReadonlyArray<SurveyOption<ResponseInput>> = [\n' +
            "  { key: '1', label: 'Keep' },\n" +
            "  { key: '2', label: 'Undo' },\n" +
            ']\n' +
            'const OPTION_WIDTH = 10\n',
        },
        {
          before:
            '      <SurveyOptions\n' +
            '        onSelect={digit => {',
          after:
            '      <SurveyOptions\n' +
            '        options={SURVEY_OPTIONS}\n' +
            '        optionWidth={OPTION_WIDTH}\n' +
            '        onSelect={digit => {',
        },
        {
          before:
            'function SurveyOptions({\n' +
            '  onSelect,\n' +
            '}: {\n' +
            '  onSelect: (digit: ResponseInput) => void\n' +
            '}): React.ReactNode {\n' +
            '  const options: ReadonlyArray<{ key: ResponseInput; label: string }> = [\n' +
            "    { key: '1', label: 'Keep' },\n" +
            "    { key: '2', label: 'Undo' },\n" +
            '  ]\n' +
            '  return (\n' +
            '    <Box marginLeft={2}>\n' +
            '      {options.map(({ key, label }) => (\n' +
            '        <Box key={key} width={10}>\n' +
            '          <Button tabIndex={-1} onAction={() => onSelect(key)}>\n' +
            '            {({ hovered }) => (\n' +
            '              <Box\n' +
            '                backgroundColor={\n' +
            "                  hovered ? 'userMessageBackgroundHover' : undefined\n" +
            '                }\n' +
            '              >\n' +
            '                <Text color="ansi:cyan">{key}</Text>: {label}\n' +
            '              </Box>\n' +
            '            )}\n' +
            '          </Button>\n' +
            '        </Box>\n' +
            '      ))}\n' +
            '    </Box>\n' +
            '  )\n' +
            '}\n\n',
          after: '',
        },
      ],
    },
  ],
}

export const TARGET120_MORERIGHT_SESSION_RESTORATION_REPLAY = {
  targetIndex: 21277,
  owners: [
    {
      ownerPath: 'src/moreright/useMoreRight.tsx',
      preimage: {
        bytes: 3535,
        sha256: 'ba5701874d69a339a9b1263f60dae7ced46060a3e6366a16cb0155f5ddef4544',
      },
      postimage: {
        bytes: 3692,
        sha256: '0995b594943f038f5700448bee971079a4323cdb01e372fdd81a81ccfb3c6dde',
      },
      replacements: [
        {
          before: '  setToolJSX: (args: M) => void;\n',
          after:
            '  setToolJSX: (args: M) => void;\n' +
            '  resultDedupState?: M;\n',
        },
        {
          before:
            '  onTurnComplete: (all: M[], aborted: boolean) => Promise<void>;\n' +
            '  render: () => null;\n',
          after:
            '  onTurnComplete: (all: M[], aborted: boolean) => Promise<void>;\n' +
            '  onSessionRestored: (all: M[]) => Promise<void>;\n' +
            '  render: () => null;\n' +
            '  ownsInput: boolean;\n',
        },
        {
          before:
            '    onTurnComplete: async () => {},\n' +
            '    render: () => null\n',
          after:
            '    onTurnComplete: async () => {},\n' +
            '    onSessionRestored: async () => {},\n' +
            '    render: () => null,\n' +
            '    ownsInput: false\n',
        },
      ],
    },
    {
      ownerPath: 'src/screens/REPL.tsx',
      preimage: {
        bytes: 908792,
        sha256: '1176ad42f394d78c59aa2146f42342d3be9d9d49fcbef32ce4dc26b9bbbd0677',
      },
      postimage: {
        bytes: 909074,
        sha256: 'ab432ff327216889e7bb157b794c6efc5aca79dcfbb5af57bfdd1122cf41d34c',
      },
      replacements: [
        {
          before:
            '    onBeforeQuery: mrOnBeforeQuery,\n' +
            '    onTurnComplete: mrOnTurnComplete,\n' +
            '    render: mrRender\n',
          after:
            '    onBeforeQuery: mrOnBeforeQuery,\n' +
            '    onTurnComplete: mrOnTurnComplete,\n' +
            '    onSessionRestored: mrOnSessionRestored,\n' +
            '    render: mrRender,\n' +
            '    ownsInput: mrOwnsInput\n',
        },
        {
          before: '    setInputValue,\n    setToolJSX\n',
          after:
            '    setInputValue,\n' +
            '    setToolJSX,\n' +
            '    resultDedupState: resultDedupStateRef.current\n',
        },
        {
          before: '      restoreSessionCronTasks(initialMessages);\n',
          after:
            '      restoreSessionCronTasks(initialMessages);\n' +
            '      void mrOnSessionRestored(initialMessages);\n',
        },
        {
          before: '    setMessages(prev.slice(0, messageIndex));\n',
          after:
            '    setMessages(prev.slice(0, messageIndex));\n' +
            '    void mrOnSessionRestored(prev.slice(0, messageIndex));\n',
        },
        {
          before: '  }, [setMessages, setAppState]);\n',
          after:
            '  }, [setMessages, setAppState, mrOnSessionRestored]);\n',
        },
        {
          before:
            '  useQueueProcessor({\n' +
            '    executeQueuedInput,\n' +
            '    hasActiveLocalJsxUI: isShowingLocalJSXCommand,\n' +
            '    queryGuard\n' +
            '  });\n',
          after:
            '  useQueueProcessor({\n' +
            '    executeQueuedInput,\n' +
            '    hasActiveLocalJsxUI: isShowingLocalJSXCommand || mrOwnsInput,\n' +
            '    queryGuard\n' +
            '  });\n',
        },
        {
          before:
            '    onOpenBackgroundTasks: isShowingLocalJSXCommand ? undefined : () => setShowBashesDialog(true)\n',
          after:
            '    onOpenBackgroundTasks: isShowingLocalJSXCommand || mrOwnsInput ? undefined : () => setShowBashesDialog(true)\n',
        },
      ],
    },
  ],
}

export const TARGET120_REPL_SURVEY_STACK_REPLAY = {
  targetIndices: [20957, 20958],
  owners: [
    {
      ownerPath: 'src/components/FeedbackSurvey/FeedbackSurvey.tsx',
      preimage: {
        bytes: 19393,
        sha256: '6b2856ca8068951559a9cce545f5985cde4392b9c2c3169f2782e5080fba28aa',
      },
      postimage: {
        bytes: 21765,
        sha256: '8645d13b93f523d3514a52d6ab427f9f46e666908a217a5dabd3b328ddaec6ff',
      },
      replacements: [
        {
          before: String.raw`import { Box, Text } from '../../ink.js';
import { FeedbackSurveyView, isValidResponseInput } from './FeedbackSurveyView.js';
`,
          after: String.raw`import { Box, Text } from '../../ink.js';
import { useAppState } from '../../state/AppState.js';
import { useKeybindingPreDispatch } from '../../keybindings/useKeybinding.js';
import { truncateToLines } from '../../utils/stringUtils.js';
import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js';
import { FeedbackSurveyView, isValidResponseInput } from './FeedbackSurveyView.js';
`,
        },
        {
          before: String.raw`type Props = {
  state: 'closed' | 'open' | 'thanks' | 'transcript_prompt' | 'submitting' | 'submitted';
  lastResponse: FeedbackSurveyResponse | null;
  handleSelect: (selected: FeedbackSurveyResponse) => void;
  handleTranscriptSelect?: (selected: TranscriptShareResponse) => void;
`,
          after: String.raw`type Props = {
  state: 'closed' | 'open' | 'pending' | 'thanks' | 'transcript_prompt' | 'submitting' | 'submitted';
  lastResponse: FeedbackSurveyResponse | null;
  handleSelect: (selected: FeedbackSurveyResponse) => void;
  handleUndo: () => void;
  handleTranscriptSelect?: (selected: TranscriptShareResponse) => void;
`,
        },
        {
          before: String.raw`  message?: string;
};
export function FeedbackSurvey(t0) {
  const $ = _c(16);
  const {
`,
          after: String.raw`  message?: string;
  memoryEvaluation?: MemorySurveyEvaluation;
  showNotSure?: boolean;
};
type MemorySurveyEvaluation = {
  memory_impact_summary?: string | null;
};
export function FeedbackSurvey(t0) {
  const $ = _c(17);
  const {
`,
        },
        {
          before: String.raw`    handleSelect,
    handleTranscriptSelect,
`,
          after: String.raw`    handleSelect,
    handleUndo,
    handleTranscriptSelect,
`,
        },
        {
          before: String.raw`    onRequestFeedback,
    message
  } = t0;
`,
          after: String.raw`    onRequestFeedback,
    message,
    memoryEvaluation,
    showNotSure = false
  } = t0;
`,
        },
        {
          before: String.raw`  }
  if (state === "thanks") {
`,
          after: String.raw`  }
  if (state === 'pending') {
    return <FeedbackSurveyPending lastResponse={lastResponse} onUndo={handleUndo} />;
  }
  if (state === "thanks") {
`,
        },
        {
          before: String.raw`    }
    if (inputValue && !["1", "2", "3"].includes(inputValue)) {
      return null;
`,
          after: String.raw`    }
    if (inputValue && !['y', 'n', 'd'].includes(inputValue.toLowerCase())) {
      return null;
`,
        },
        {
          before: String.raw`  }
  if (inputValue && !isValidResponseInput(inputValue)) {
    return null;
  }
  let t1;
  if ($[11] !== handleSelect || $[12] !== inputValue || $[13] !== message || $[14] !== setInputValue) {
    t1 = <FeedbackSurveyView onSelect={handleSelect} inputValue={inputValue} setInputValue={setInputValue} message={message} />;
    $[11] = handleSelect;
`,
          after: String.raw`  }
  if (inputValue && !isValidResponseInput(inputValue, showNotSure)) {
    return null;
  }
  if (memoryEvaluation) {
    return <MemorySurveyView evaluation={memoryEvaluation} onSelect={handleSelect} inputValue={inputValue} setInputValue={setInputValue} />;
  }
  let t1;
  if ($[11] !== handleSelect || $[12] !== inputValue || $[13] !== message || $[14] !== setInputValue || $[15] !== showNotSure) {
    t1 = <FeedbackSurveyView onSelect={handleSelect} inputValue={inputValue} setInputValue={setInputValue} message={message} showNotSure={showNotSure} />;
    $[11] = handleSelect;
`,
        },
        {
          before: String.raw`    $[14] = setInputValue;
    $[15] = t1;
  } else {
    t1 = $[15];
  }
`,
          after: String.raw`    $[14] = setInputValue;
    $[15] = showNotSure;
    $[16] = t1;
  } else {
    t1 = $[16];
  }
`,
        },
        {
          before: String.raw`}
type ThanksProps = {
`,
          after: String.raw`}
const RESPONSE_LABELS: Partial<Record<FeedbackSurveyResponse, string>> = {
  bad: 'Bad',
  fine: 'Fine',
  good: 'Good',
  not_sure: 'Unsure'
};
function FeedbackSurveyPending({
  lastResponse,
  onUndo
}: {
  lastResponse: FeedbackSurveyResponse | null;
  onUndo: () => void;
}) {
  useKeybindingPreDispatch((_input, key) => {
    if (key.escape) {
      onUndo();
      return true;
    }
  });
  const responseLabel = lastResponse && lastResponse !== 'dismissed' ? RESPONSE_LABELS[lastResponse] ?? '' : '';
  return <Box marginTop={1}><Text dimColor>Feedback: <Text color="text">{responseLabel}</Text> {' ${'·'} ' }<KeyboardShortcutHint chord="escape" action="undo" /></Text></Box>;
}
function MemorySurveyView({
  evaluation,
  onSelect,
  inputValue,
  setInputValue
}: {
  evaluation: MemorySurveyEvaluation;
  onSelect: (selected: FeedbackSurveyResponse) => void;
  inputValue: string;
  setInputValue: (value: string) => void;
}) {
  const verbose = useAppState(state_0 => state_0.verbose);
  const rawSummary = evaluation.memory_impact_summary?.trim();
  const summary = rawSummary && !verbose ? truncateToLines(rawSummary, 4) : rawSummary;
  const prompt = summary ? <>{summary} <Text dimColor>Did this help? (optional)</Text></> : 'Did this help? (optional)';
  return <FeedbackSurveyView onSelect={onSelect} inputValue={inputValue} setInputValue={setInputValue} message={prompt} messageBold={false} showNotSure={true} />;
}
type ThanksProps = {
`,
        },
        {
          before: String.raw`      once: true,
      onDigit: t2
`,
          after: String.raw`      once: true,
      mountDelayMs: 0,
      onDigit: t2
`,
        },
      ],
    },
    {
      ownerPath: 'src/components/FeedbackSurvey/useSurveyState.tsx',
      preimage: {
        bytes: 15007,
        sha256: 'a50493ca59a0407017eed482846fb3203e992c4bed77f3b20c392fb711e6c05f',
      },
      postimage: {
        bytes: 15816,
        sha256: 'f45676f844ce1e323f7612ff0392a406aa1901a44b64e138c905dabf8fa178a3',
      },
      replacements: [
        {
          before: String.raw`import type { FeedbackSurveyResponse } from './utils.js';
type SurveyState = 'closed' | 'open' | 'thanks' | 'transcript_prompt' | 'submitting' | 'submitted';
type UseSurveyStateOptions = {
`,
          after: String.raw`import type { FeedbackSurveyResponse } from './utils.js';
type SurveyState = 'closed' | 'open' | 'pending' | 'thanks' | 'transcript_prompt' | 'submitting' | 'submitted';
const SUBMIT_DELAY_MS = 3000;
type UseSurveyStateOptions = {
`,
        },
        {
          before: String.raw`  open: () => void;
  handleSelect: (selected: FeedbackSurveyResponse) => boolean;
  handleTranscriptSelect: (selected: TranscriptShareResponse) => void;
`,
          after: String.raw`  open: () => void;
  handleSelect: (selected: FeedbackSurveyResponse) => void;
  handleUndo: () => void;
  handleTranscriptSelect: (selected: TranscriptShareResponse) => void;
`,
        },
        {
          before: String.raw`  const lastResponseRef = useRef<FeedbackSurveyResponse | null>(null);
  const showThanksThenClose = useCallback(() => {
`,
          after: String.raw`  const lastResponseRef = useRef<FeedbackSurveyResponse | null>(null);
  const pendingSubmitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (pendingSubmitTimer.current) {
      clearTimeout(pendingSubmitTimer.current);
    }
  }, []);
  const showThanksThenClose = useCallback(() => {
`,
        },
        {
          before: String.raw`  }, [otherSurveyActive, state]);
  const handleSelect = useCallback((selected: FeedbackSurveyResponse): boolean => {
    setLastResponse(selected);
    lastResponseRef.current = selected;
    // Always fire the survey response event first
    void onSelect(appearanceId.current, selected);
`,
          after: String.raw`  }, [otherSurveyActive, state]);
  const processSelection = useCallback((selected: FeedbackSurveyResponse) => {
    pendingSubmitTimer.current = null;
    void onSelect(appearanceId.current, selected);
`,
        },
        {
          before: String.raw`      onTranscriptPromptShown?.(appearanceId.current, selected);
      return true;
    } else {
`,
          after: String.raw`      onTranscriptPromptShown?.(appearanceId.current, selected);
    } else {
`,
        },
        {
          before: String.raw`    }
    return false;
  }, [showThanksThenClose, onSelect, shouldShowTranscriptPrompt, onTranscriptPromptShown]);
  const handleTranscriptSelect = useCallback((selected_0: TranscriptShareResponse) => {
`,
          after: String.raw`    }
  }, [showThanksThenClose, onSelect, shouldShowTranscriptPrompt, onTranscriptPromptShown]);
  const handleSelect = useCallback((selected: FeedbackSurveyResponse) => {
    setLastResponse(selected);
    lastResponseRef.current = selected;
    if (selected === 'dismissed') {
      processSelection(selected);
      return;
    }
    setState('pending');
    pendingSubmitTimer.current = setTimeout(processSelection, SUBMIT_DELAY_MS, selected);
  }, [processSelection]);
  const handleUndo = useCallback(() => {
    if (pendingSubmitTimer.current) {
      clearTimeout(pendingSubmitTimer.current);
    }
    pendingSubmitTimer.current = null;
    setLastResponse(null);
    lastResponseRef.current = null;
    setState('open');
  }, []);
  const handleTranscriptSelect = useCallback((selected_0: TranscriptShareResponse) => {
`,
        },
        {
          before: String.raw`    handleSelect,
    handleTranscriptSelect
`,
          after: String.raw`    handleSelect,
    handleUndo,
    handleTranscriptSelect
`,
        },
      ],
    },
    {
      ownerPath: 'src/components/FeedbackSurvey/useFeedbackSurvey.tsx',
      preimage: {
        bytes: 48321,
        sha256: '325e54de705cd608c220d5fe913cf76f1ca6005db0f5c1f8518573b0c560314d',
      },
      postimage: {
        bytes: 48388,
        sha256: 'f8e34039adb4760ba57a66bf97f43d23bd930660902c0b97ead775fc86278465',
      },
      replacements: [
        {
          before: String.raw`};
export function useFeedbackSurvey(messages: Message[], isLoading: boolean, submitCount: number, surveyType: FeedbackSurveyType = 'session', hasActivePrompt: boolean = false, otherSurveyActive: boolean = false): {
  state: 'closed' | 'open' | 'thanks' | 'transcript_prompt' | 'submitting' | 'submitted';
  lastResponse: FeedbackSurveyResponse | null;
  handleSelect: (selected: FeedbackSurveyResponse) => boolean;
  handleTranscriptSelect: (selected: TranscriptShareResponse) => void;
} {
`,
          after: String.raw`};
export function useFeedbackSurvey(messages: Message[], isLoading: boolean, submitCount: number, surveyType: FeedbackSurveyType = 'session', hasActivePrompt: boolean = false, otherSurveyActive: boolean = false): {
  state: 'closed' | 'open' | 'pending' | 'thanks' | 'transcript_prompt' | 'submitting' | 'submitted';
  lastResponse: FeedbackSurveyResponse | null;
  handleSelect: (selected: FeedbackSurveyResponse) => void;
  handleUndo: () => void;
  handleTranscriptSelect: (selected: TranscriptShareResponse) => void;
} {
`,
        },
        {
          before: String.raw`    open,
    handleSelect,
    handleTranscriptSelect
  } = useSurveyState({
`,
          after: String.raw`    open,
    handleSelect,
    handleUndo,
    handleTranscriptSelect
  } = useSurveyState({
`,
        },
        {
          before: String.raw`    lastResponse,
    handleSelect,
    handleTranscriptSelect
  };
`,
          after: String.raw`    lastResponse,
    handleSelect,
    handleUndo,
    handleTranscriptSelect
  };
`,
        },
      ],
    },
    {
      "ownerPath": "src/components/FeedbackSurvey/useMemorySurvey.tsx",
      "preimage": {
        "bytes": 30570,
        "sha256": "06e677346fe2e448f393ceafd9df9927f3912d31a95ca9632fcf98f34074fac7"
      },
      "postimage": {
        "bytes": 33569,
        "sha256": "c72a36374ded081b661dcca93e332ab6a3877e53a7334c0e5c2210cf302320fc"
      },
      "replacements": [
        {
          "before": "import { useCallback, useEffect, useMemo, useRef } from 'react';\nimport { isFeedbackSurveyDisabled } from 'src/services/analytics/config.js';\nimport { getFeatureValue_CACHED_MAY_BE_STALE } from 'src/services/analytics/growthbook.js';\n",
          "after": "import { useCallback, useEffect, useMemo, useRef, useState } from 'react';\nimport { isFeedbackSurveyDisabled } from 'src/services/analytics/config.js';\nimport { getFeatureValue_CACHED_MAY_BE_STALE } from 'src/services/analytics/growthbook.js';\n"
        },
        {
          "before": "import { useSurveyState } from './useSurveyState.js';\nimport type { FeedbackSurveyResponse } from './utils.js';\nconst HIDE_THANKS_AFTER_MS = 3000;\nconst MEMORY_SURVEY_GATE = 'tengu_dunwich_bell';\nconst MEMORY_SURVEY_EVENT = 'tengu_memory_survey_event';\nconst SURVEY_PROBABILITY = 0.2;\nconst TRANSCRIPT_SHARE_TRIGGER = 'memory_survey';\nconst MEMORY_WORD_RE = /\\bmemor(?:y|ies)\\b/i;\n",
          "after": "import { useSurveyState } from './useSurveyState.js';\nimport type { FeedbackSurveyResponse } from './utils.js';\nimport { useAppState } from '../../state/AppState.js';\ntype MemorySurveyEvaluation = {\n  classification: string;\n  evidence_type?: string;\n  memory_impact_summary?: string | null;\n};\ntype LastMemoryEvaluation = {\n  assistantUuid: string;\n  evaluation: MemorySurveyEvaluation;\n};\nconst HIDE_THANKS_AFTER_MS = 3000;\nconst MEMORY_SURVEY_GATE = 'tengu_dunwich_bell';\nconst MEMORY_SURVEY_EVENT = 'tengu_memory_survey_event';\nconst MEMORY_SURVEY_PROBABILITY_GATE = 'tengu_velvet_moth';\nconst TRANSCRIPT_SHARE_TRIGGER = 'memory_survey';\nconst MEMORY_WORD_RE = /\\bmemor(?:y|ies)\\b/i;\n"
        },
        {
          "before": "  return false;\n}\nexport function useMemorySurvey(messages: Message[], isLoading: boolean, hasActivePrompt = false, {\n  enabled = true,\n",
          "after": "  return false;\n}\nfunction getMemorySurveyProbability(): number {\n  return getFeatureValue_CACHED_MAY_BE_STALE(MEMORY_SURVEY_PROBABILITY_GATE, DEFAULT_SURVEY_PROBABILITY);\n}\nfunction isValidMemorySurveyClassification(classification: string): boolean {\n  return classification === 'helped' || classification === 'harmed' || classification === 'neutral';\n}\nfunction isMemorySurveyEligible(): boolean {\n  return getFeatureValue_CACHED_MAY_BE_STALE(MEMORY_SURVEY_GATE, false) && isAutoMemoryEnabled() && !isFeedbackSurveyDisabled() && isPolicyAllowed('allow_product_feedback') && !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY);\n}\nexport function useMemorySurvey(messages: Message[], isLoading: boolean, hasActivePrompt = false, {\n  enabled = true,\n"
        },
        {
          "before": "  otherSurveyActive?: boolean;\n} = {}): {\n  state: 'closed' | 'open' | 'thanks' | 'transcript_prompt' | 'submitting' | 'submitted';\n  lastResponse: FeedbackSurveyResponse | null;\n  handleSelect: (selected: FeedbackSurveyResponse) => void;\n  handleTranscriptSelect: (selected: TranscriptShareResponse) => void;\n} {\n",
          "after": "  otherSurveyActive?: boolean;\n} = {}): {\n  state: 'closed' | 'open' | 'pending' | 'thanks' | 'transcript_prompt' | 'submitting' | 'submitted';\n  lastResponse: FeedbackSurveyResponse | null;\n  evaluation: MemorySurveyEvaluation | null;\n  handleSelect: (selected: FeedbackSurveyResponse) => void;\n  handleUndo: () => void;\n  handleTranscriptSelect: (selected: TranscriptShareResponse) => void;\n} {\n"
        },
        {
          "before": "  const messagesRef = useRef(messages);\n  messagesRef.current = messages;\n  const onOpen = useCallback((appearanceId: string) => {\n    logEvent(MEMORY_SURVEY_EVENT, {\n      event_type: 'appeared' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,\n      appearance_id: appearanceId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS\n    });\n    void logOTelEvent('feedback_survey', {\n",
          "after": "  const messagesRef = useRef(messages);\n  messagesRef.current = messages;\n  const lastMemoryEvaluation = useAppState(state_0 => (state_0 as unknown as {\n    lastMemoryEvaluation?: LastMemoryEvaluation;\n  }).lastMemoryEvaluation);\n  const [evaluation, setEvaluation] = useState<MemorySurveyEvaluation | null>(null);\n  const evaluationRef = useRef<MemorySurveyEvaluation | null>(null);\n  const onOpen = useCallback((appearanceId: string) => {\n    const currentEvaluation = evaluationRef.current;\n    logEvent(MEMORY_SURVEY_EVENT, {\n      event_type: 'appeared' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,\n      appearance_id: appearanceId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,\n      judge_classification: currentEvaluation?.classification as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,\n      judge_evidence_type: currentEvaluation?.evidence_type as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS\n    });\n    void logOTelEvent('feedback_survey', {\n"
        },
        {
          "before": "  }, []);\n  const onSelect = useCallback((appearanceId_0: string, selected: FeedbackSurveyResponse) => {\n    logEvent(MEMORY_SURVEY_EVENT, {\n      event_type: 'responded' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,\n      appearance_id: appearanceId_0 as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,\n      response: selected as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS\n    });\n    void logOTelEvent('feedback_survey', {\n",
          "after": "  }, []);\n  const onSelect = useCallback((appearanceId_0: string, selected: FeedbackSurveyResponse) => {\n    const currentEvaluation = evaluationRef.current;\n    logEvent(MEMORY_SURVEY_EVENT, {\n      event_type: 'responded' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,\n      appearance_id: appearanceId_0 as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,\n      response: selected as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,\n      judge_classification: currentEvaluation?.classification as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,\n      judge_evidence_type: currentEvaluation?.evidence_type as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS\n    });\n    void logOTelEvent('feedback_survey', {\n"
        },
        {
          "before": "    open,\n    handleSelect,\n    handleTranscriptSelect\n  } = useSurveyState({\n",
          "after": "    open,\n    handleSelect,\n    handleUndo,\n    handleTranscriptSelect\n  } = useSurveyState({\n"
        },
        {
          "before": "  const lastAssistant = useMemo(() => getLastAssistantMessage(messages), [messages]);\n  useEffect(() => {\n    if (!enabled) return;\n\n    // /clear resets messages but REPL stays mounted — reset refs so a memory\n    // read from the previous conversation doesn't leak into the new one.\n    if (messages.length === 0) {\n      memoryReadSeen.current = false;\n      seenAssistantUuids.current.clear();\n      return;\n    }\n    if (state !== 'closed' || isLoading || hasActivePrompt) {\n      return;\n    }\n    if (otherSurveyActive) {\n      return;\n    }\n\n    // 3P default: survey off (no GrowthBook on Bedrock/Vertex/Foundry).\n    if (!getFeatureValue_CACHED_MAY_BE_STALE(MEMORY_SURVEY_GATE, false)) {\n      return;\n    }\n    if (!isAutoMemoryEnabled()) {\n      return;\n    }\n    if (isFeedbackSurveyDisabled()) {\n      return;\n    }\n    if (!isPolicyAllowed('allow_product_feedback')) {\n      return;\n    }\n    if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY)) {\n      return;\n    }\n",
          "after": "  const lastAssistant = useMemo(() => getLastAssistantMessage(messages), [messages]);\n  useEffect(() => {\n    if (messages.length === 0) {\n      evaluationRef.current = null;\n      setEvaluation(null);\n      return;\n    }\n    if (state !== 'closed' || isLoading || hasActivePrompt || otherSurveyActive) {\n      return;\n    }\n    if (!enabled || !MEMORY_SURVEY_JUDGE_ENABLED || !isMemorySurveyEligible()) {\n      return;\n    }\n    if (!lastAssistant || !lastMemoryEvaluation) {\n      return;\n    }\n    if (lastMemoryEvaluation.assistantUuid !== lastAssistant.uuid) {\n      return;\n    }\n    if (seenAssistantUuids.current.has(lastAssistant.uuid)) {\n      return;\n    }\n    seenAssistantUuids.current.add(lastAssistant.uuid);\n    const nextEvaluation = lastMemoryEvaluation.evaluation;\n    if (!isValidMemorySurveyClassification(nextEvaluation.classification)) {\n      return;\n    }\n    if (!memoryReadSeen.current) {\n      memoryReadSeen.current = hasMemoryFileRead(messagesRef.current);\n    }\n    if (!memoryReadSeen.current) {\n      return;\n    }\n    if (nextEvaluation.classification !== 'harmed' && !MEMORY_SURVEY_FORCE_SHOW && Math.random() >= getMemorySurveyProbability()) {\n      return;\n    }\n    evaluationRef.current = nextEvaluation;\n    setEvaluation(nextEvaluation);\n    open();\n  }, [enabled, otherSurveyActive, state, isLoading, hasActivePrompt, lastAssistant, lastMemoryEvaluation, messages.length, open]);\n  useEffect(() => {\n    // /clear resets messages but REPL stays mounted — reset refs so a memory\n    // read from the previous conversation doesn't leak into the new one.\n    if (messages.length === 0) {\n      memoryReadSeen.current = false;\n      seenAssistantUuids.current.clear();\n      return;\n    }\n    if (state !== 'closed' || isLoading || hasActivePrompt) {\n      return;\n    }\n    if (otherSurveyActive) {\n      return;\n    }\n    if (!enabled || MEMORY_SURVEY_JUDGE_ENABLED || !isMemorySurveyEligible()) {\n      return;\n    }\n"
        },
        {
          "before": "      return;\n    }\n    if (Math.random() < SURVEY_PROBABILITY) {\n      open();\n    }\n",
          "after": "      return;\n    }\n    if (Math.random() < getFeatureValue_CACHED_MAY_BE_STALE(MEMORY_SURVEY_PROBABILITY_GATE, 0.2)) {\n      open();\n    }\n"
        },
        {
          "before": "    state,\n    lastResponse,\n    handleSelect,\n    handleTranscriptSelect\n  };\n",
          "after": "    state,\n    lastResponse,\n    evaluation,\n    handleSelect,\n    handleUndo,\n    handleTranscriptSelect\n  };\n"
        }
      ]
    },
    {
      "ownerPath": "src/components/FeedbackSurvey/usePostCompactSurvey.tsx",
      "preimage": {
        "bytes": 24071,
        "sha256": "76959ead7363b162a9115117277cdf7a42d19b1829d237c9316d59a2aaa1df50"
      },
      "postimage": {
        "bytes": 24153,
        "sha256": "38a928e74d308092738b057105e39faffefd03020dc8560dd14f33c9e72ae5e6"
      },
      "replacements": [
        {
          "before": "export function usePostCompactSurvey(messages, isLoading, t0, t1) {\n  const $ = _c(23);\n  const hasActivePrompt = t0 === undefined ? false : t0;\n",
          "after": "export function usePostCompactSurvey(messages, isLoading, t0, t1) {\n  const $ = _c(24);\n  const hasActivePrompt = t0 === undefined ? false : t0;\n"
        },
        {
          "before": "    open,\n    handleSelect\n  } = useSurveyState(t5);\n",
          "after": "    open,\n    handleSelect,\n    handleUndo\n  } = useSurveyState(t5);\n"
        },
        {
          "before": "  let t11;\n  if ($[19] !== handleSelect || $[20] !== lastResponse || $[21] !== state) {\n    t11 = {\n",
          "after": "  let t11;\n  if ($[19] !== handleSelect || $[20] !== handleUndo || $[21] !== lastResponse || $[22] !== state) {\n    t11 = {\n"
        },
        {
          "before": "      lastResponse,\n      handleSelect\n    };\n    $[19] = handleSelect;\n    $[20] = lastResponse;\n    $[21] = state;\n    $[22] = t11;\n  } else {\n    t11 = $[22];\n  }\n",
          "after": "      lastResponse,\n      handleSelect,\n      handleUndo\n    };\n    $[19] = handleSelect;\n    $[20] = handleUndo;\n    $[21] = lastResponse;\n    $[22] = state;\n    $[23] = t11;\n  } else {\n    t11 = $[23];\n  }\n"
        }
      ]
    },
    {
      "ownerPath": "src/screens/REPL.tsx",
      "preimage": {
        "bytes": 909074,
        "sha256": "ab432ff327216889e7bb157b794c6efc5aca79dcfbb5af57bfdd1122cf41d34c"
      },
      "postimage": {
        "bytes": 910264,
        "sha256": "dff31837d79c693ebeace993675b67f4bf36241858e8d005d418617a201f7bc9"
      },
      "replacements": [
        {
          "before": "\n// Stable stub for useAssistantHistory's non-KAIROS branch — avoids a new\n",
          "after": "\nfunction getActiveSurvey(states) {\n  if (states.memoryWrite !== 'closed') return 'memoryWrite';\n  if (states.postCompact !== 'closed') return 'postCompact';\n  if (states.memory !== 'closed') return 'memory';\n  if (states.feedback !== 'closed') return 'feedback';\n  if (states.frustration !== 'closed') return 'frustration';\n  return null;\n}\n\nfunction ActiveSurvey(t0) {\n  const {\n    memoryWriteSurvey,\n    postCompactSurvey,\n    memorySurvey,\n    feedbackSurvey,\n    frustrationDetection,\n    inputValue,\n    setInputValue,\n    handleSurveyRequestFeedback,\n    feedbackOnRequestFeedback\n  } = t0;\n  const activeSurvey = getActiveSurvey({\n    memoryWrite: memoryWriteSurvey.state,\n    postCompact: postCompactSurvey.state,\n    memory: memorySurvey.state,\n    feedback: feedbackSurvey.state,\n    frustration: frustrationDetection.state\n  });\n  switch (activeSurvey) {\n    case 'memoryWrite':\n      if (!memoryWriteSurvey.record) return null;\n      return <MemoryWriteSurvey record={memoryWriteSurvey.record} summary={memoryWriteSurvey.summary} lineCount={memoryWriteSurvey.lineCount} summaryLineThreshold={memoryWriteSurvey.summaryLineThreshold} countdownSec={memoryWriteSurvey.countdownSec} onOutcome={memoryWriteSurvey.handleOutcome} inputValue={inputValue} setInputValue={setInputValue} />;\n    case 'postCompact':\n      return <FeedbackSurvey state={postCompactSurvey.state} lastResponse={postCompactSurvey.lastResponse} handleSelect={postCompactSurvey.handleSelect} handleUndo={postCompactSurvey.handleUndo} inputValue={inputValue} setInputValue={setInputValue} onRequestFeedback={handleSurveyRequestFeedback} />;\n    case 'memory':\n      return <FeedbackSurvey state={memorySurvey.state} lastResponse={memorySurvey.lastResponse} handleSelect={memorySurvey.handleSelect} handleUndo={memorySurvey.handleUndo} handleTranscriptSelect={memorySurvey.handleTranscriptSelect} inputValue={inputValue} setInputValue={setInputValue} onRequestFeedback={handleSurveyRequestFeedback} message=\"How well did Claude use its memory? (optional)\" memoryEvaluation={memorySurvey.evaluation ?? undefined} showNotSure={true} />;\n    case 'feedback':\n      return <FeedbackSurvey state={feedbackSurvey.state} lastResponse={feedbackSurvey.lastResponse} handleSelect={feedbackSurvey.handleSelect} handleUndo={feedbackSurvey.handleUndo} handleTranscriptSelect={feedbackSurvey.handleTranscriptSelect} inputValue={inputValue} setInputValue={setInputValue} onRequestFeedback={feedbackOnRequestFeedback} />;\n    case 'frustration':\n      return <FeedbackSurvey state={frustrationDetection.state} lastResponse={null} handleSelect={() => {}} handleUndo={() => {}} handleTranscriptSelect={frustrationDetection.handleTranscriptSelect} inputValue={inputValue} setInputValue={setInputValue} />;\n    default:\n      return null;\n  }\n}\n\n// Stable stub for useAssistantHistory's non-KAIROS branch — avoids a new\n"
        },
        {
          "before": "      didAutoRunIssueRef.current = false;\n      const showedTranscriptPrompt = feedbackSurveyOriginal.handleSelect(selected);\n      // Auto-run /issue for \"bad\" if transcript prompt wasn't shown\n      if (selected === 'bad' && !showedTranscriptPrompt && shouldAutoRunIssue('feedback_survey_bad')) {\n        setAutoRunIssueReason('feedback_survey_bad');\n",
          "after": "      didAutoRunIssueRef.current = false;\n      feedbackSurveyOriginal.handleSelect(selected);\n      // Auto-run /issue for \"bad\" responses.\n      if (selected === 'bad' && shouldAutoRunIssue('feedback_survey_bad')) {\n        setAutoRunIssueReason('feedback_survey_bad');\n"
        },
        {
          "before": "                      {autoRunIssueReason && <AutoRunIssueNotification onRun={handleAutoRunIssue} onCancel={handleCancelAutoRunIssue} reason={getAutoRunIssueReasonText(autoRunIssueReason)} />}\n                      {memoryWriteSurvey.state !== 'closed' && memoryWriteSurvey.record ? <MemoryWriteSurvey record={memoryWriteSurvey.record} summary={memoryWriteSurvey.summary} lineCount={memoryWriteSurvey.lineCount} summaryLineThreshold={memoryWriteSurvey.summaryLineThreshold} countdownSec={memoryWriteSurvey.countdownSec} onOutcome={memoryWriteSurvey.handleOutcome} inputValue={inputValue} setInputValue={setInputValue} /> : postCompactSurvey.state !== 'closed' ? <FeedbackSurvey state={postCompactSurvey.state} lastResponse={postCompactSurvey.lastResponse} handleSelect={postCompactSurvey.handleSelect} inputValue={inputValue} setInputValue={setInputValue} onRequestFeedback={handleSurveyRequestFeedback} /> : memorySurvey.state !== 'closed' ? <FeedbackSurvey state={memorySurvey.state} lastResponse={memorySurvey.lastResponse} handleSelect={memorySurvey.handleSelect} handleTranscriptSelect={memorySurvey.handleTranscriptSelect} inputValue={inputValue} setInputValue={setInputValue} onRequestFeedback={handleSurveyRequestFeedback} message=\"How well did Claude use its memory? (optional)\" /> : <FeedbackSurvey state={feedbackSurvey.state} lastResponse={feedbackSurvey.lastResponse} handleSelect={feedbackSurvey.handleSelect} handleTranscriptSelect={feedbackSurvey.handleTranscriptSelect} inputValue={inputValue} setInputValue={setInputValue} onRequestFeedback={didAutoRunIssueRef.current ? undefined : handleSurveyRequestFeedback} />}\n                      {/* Frustration-triggered transcript sharing prompt */}\n                      {memoryWriteSurvey.state === 'closed' && postCompactSurvey.state === 'closed' && memorySurvey.state === 'closed' && feedbackSurvey.state === 'closed' && frustrationDetection.state !== 'closed' && <FeedbackSurvey state={frustrationDetection.state} lastResponse={null} handleSelect={() => {}} handleTranscriptSelect={frustrationDetection.handleTranscriptSelect} inputValue={inputValue} setInputValue={setInputValue} />}\n                      {/* Skill improvement survey - appears when improvements detected (ant-only) */}\n",
          "after": "                      {autoRunIssueReason && <AutoRunIssueNotification onRun={handleAutoRunIssue} onCancel={handleCancelAutoRunIssue} reason={getAutoRunIssueReasonText(autoRunIssueReason)} />}\n                      <ActiveSurvey memoryWriteSurvey={memoryWriteSurvey} postCompactSurvey={postCompactSurvey} memorySurvey={memorySurvey} feedbackSurvey={feedbackSurvey} frustrationDetection={frustrationDetection} inputValue={inputValue} setInputValue={setInputValue} handleSurveyRequestFeedback={handleSurveyRequestFeedback} feedbackOnRequestFeedback={didAutoRunIssueRef.current ? undefined : handleSurveyRequestFeedback} />\n                      {/* Skill improvement survey - appears when improvements detected (ant-only) */}\n"
        }
      ]
    },
  ],
}

export const TARGET120_CLI_PRINT_CONTROL_TELEMETRY_REPLAY = {
  "targetIndices": [
    21858
  ],
  "ownerPath": "src/cli/print.ts",
  "preimage": {
    "bytes": 231398,
    "sha256": "85fa5a224dc8c255478d080c03ee132784b94e02c6959c6129723530023c6ed3"
  },
  "postimage": {
    "bytes": 242285,
    "sha256": "92507d3615817d94611fdf9fb10e29c31f2196de2419467b1a4d2de1033855e9"
  },
  "targetRegion": {
    "bytes": 41048,
    "sha256": "66c0c0eed98595dcf0f370c6d4be62791dc72ee69b1695783b0c48748abd2921"
  },
  "residueDisposition": [
    {
      "targetStart": 13596692,
      "kind": "property",
      "value": "max",
      "category": "source-supplement-replay"
    },
    {
      "targetStart": 13601435,
      "kind": "number",
      "value": "30000",
      "category": "source-supplement-replay"
    },
    {
      "targetStart": 13604768,
      "kind": "string",
      "value": "2.1.120",
      "category": "compiler-build-metadata"
    },
    {
      "targetStart": 13604857,
      "kind": "string",
      "value": "2026-04-24T19:00:49Z",
      "category": "compiler-build-metadata"
    },
    {
      "targetStart": 13604888,
      "kind": "string",
      "value": "080f07fb4224786b965b9ea0a35f0cff594f2eb6",
      "category": "compiler-build-metadata"
    },
    {
      "targetStart": 13605150,
      "kind": "string",
      "value": "2.1.120",
      "category": "compiler-build-metadata"
    },
    {
      "targetStart": 13605239,
      "kind": "string",
      "value": "2026-04-24T19:00:49Z",
      "category": "compiler-build-metadata"
    },
    {
      "targetStart": 13605270,
      "kind": "string",
      "value": "080f07fb4224786b965b9ea0a35f0cff594f2eb6",
      "category": "compiler-build-metadata"
    },
    {
      "targetStart": 13606736,
      "kind": "property",
      "value": "readFile",
      "category": "compiler-import-binding"
    },
    {
      "targetStart": 13610210,
      "kind": "property",
      "value": "_meta",
      "category": "source-supplement-replay"
    },
    {
      "targetStart": 13610494,
      "kind": "property",
      "value": "code",
      "category": "source-supplement-replay"
    },
    {
      "targetStart": 13619825,
      "kind": "string",
      "value": "peer",
      "category": "compiler-dead-branch"
    },
    {
      "targetStart": 13622396,
      "kind": "number",
      "value": "30000",
      "category": "source-supplement-replay"
    }
  ],
  "replacements": [
    {
      "before": "// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered\nimport { feature } from 'bun:bundle'\nimport { readFile, stat } from 'fs/promises'\nimport { dirname } from 'path'\nimport {\n  downloadUserSettings,\n  redownloadUserSettings,\n",
      "after": "// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered\nimport { feature } from 'bun:bundle'\nimport { APIError } from '@anthropic-ai/sdk'\nimport { readFile, stat } from 'fs/promises'\nimport { dirname } from 'path'\nimport {\n  downloadUserSettings,\n  redownloadUserSettings,\n"
    },
    {
      "before": "  registerHookCallbacks,\n  setInitJsonSchema,\n  getInitJsonSchema,\n  setSdkAgentProgressSummariesEnabled,\n  setSessionSkillAllowlist,\n} from 'src/bootstrap/state.js'\nimport { createSyntheticOutputTool } from 'src/tools/SyntheticOutputTool/SyntheticOutputTool.js'\nimport { formatTotalCost } from 'src/cost-tracker.js'\nimport stripAnsi from 'strip-ansi'\nimport { parseSessionIdentifier } from 'src/utils/sessionUrl.js'\n",
      "after": "  registerHookCallbacks,\n  setInitJsonSchema,\n  getInitJsonSchema,\n  setSdkAgentProgressSummariesEnabled,\n  setSessionSkillAllowlist,\n  getTotalAPIDuration,\n} from 'src/bootstrap/state.js'\nimport { createSyntheticOutputTool } from 'src/tools/SyntheticOutputTool/SyntheticOutputTool.js'\nimport { formatTotalCost } from 'src/cost-tracker.js'\nimport stripAnsi from 'strip-ansi'\nimport { parseSessionIdentifier } from 'src/utils/sessionUrl.js'\n"
    },
    {
      "before": "  getMcpServerConnectionBatchSize,\n  getRemoteMcpServerConnectionBatchSize,\n  isLocalMcpServer,\n  areMcpConfigsEqual,\n  reconnectMcpServerImpl,\n} from 'src/services/mcp/client.js'\nimport {\n  filterMcpServersByPolicy,\n  getMcpConfigByName,\n  isMcpServerDisabled,\n",
      "after": "  getMcpServerConnectionBatchSize,\n  getRemoteMcpServerConnectionBatchSize,\n  isLocalMcpServer,\n  areMcpConfigsEqual,\n  reconnectMcpServerImpl,\n  callMCPToolWithUrlElicitationRetry,\n  McpAuthError,\n} from 'src/services/mcp/client.js'\nimport {\n  filterMcpServersByPolicy,\n  getMcpConfigByName,\n  isMcpServerDisabled,\n"
    },
    {
      "before": "} from 'src/services/mcp/elicitationHandler.js'\nimport { executeNotificationHooks } from 'src/utils/hooks.js'\nimport {\n  ElicitRequestSchema,\n  ElicitationCompleteNotificationSchema,\n} from '@modelcontextprotocol/sdk/types.js'\nimport {\n  buildMcpToolName,\n  getMcpPrefix,\n} from 'src/services/mcp/mcpStringUtils.js'\nimport {\n  commandBelongsToServer,\n  filterToolsByServer,\n} from 'src/services/mcp/utils.js'\nimport { setupVscodeSdkMcp } from 'src/services/mcp/vscodeSdkMcp.js'\n",
      "after": "} from 'src/services/mcp/elicitationHandler.js'\nimport { executeNotificationHooks } from 'src/utils/hooks.js'\nimport {\n  ElicitRequestSchema,\n  ElicitationCompleteNotificationSchema,\n  ErrorCode,\n  McpError,\n} from '@modelcontextprotocol/sdk/types.js'\nimport {\n  buildMcpToolName,\n  getMcpPrefix,\n  mcpInfoFromString,\n} from 'src/services/mcp/mcpStringUtils.js'\nimport { normalizeNameForMCP } from 'src/services/mcp/normalization.js'\nimport {\n  commandBelongsToServer,\n  filterToolsByServer,\n} from 'src/services/mcp/utils.js'\nimport { setupVscodeSdkMcp } from 'src/services/mcp/vscodeSdkMcp.js'\n"
    },
    {
      "before": "import { isBackgroundTask } from '../tasks/types.js'\nimport { stopTask } from '../tasks/stopTask.js'\nimport { drainSdkEvents } from '../utils/sdkEventQueue.js'\nimport { initializeGrowthBook } from '../services/analytics/growthbook.js'\nimport { errorMessage, toError } from '../utils/errors.js'\nimport { sleep } from '../utils/sleep.js'\nimport { isExtractModeActive } from '../memdir/paths.js'\n\n// Dead code elimination: conditional imports\n/* eslint-disable @typescript-eslint/no-require-imports */\n",
      "after": "import { isBackgroundTask } from '../tasks/types.js'\nimport { stopTask } from '../tasks/stopTask.js'\nimport { drainSdkEvents } from '../utils/sdkEventQueue.js'\nimport { initializeGrowthBook } from '../services/analytics/growthbook.js'\nimport { errorMessage, toError } from '../utils/errors.js'\nimport { classifyAPIError } from '../services/api/errors.js'\nimport { classifyToolError } from '../services/tools/toolExecution.js'\nimport { sleep } from '../utils/sleep.js'\nimport { isExtractModeActive } from '../memdir/paths.js'\n\n// Dead code elimination: conditional imports\n/* eslint-disable @typescript-eslint/no-require-imports */\n"
    },
    {
      "before": "    next !== undefined &&\n    next.mode === 'prompt' &&\n    next.workload === head.workload &&\n    next.isMeta === head.isMeta\n  )\n}\n\nfunction isSyntheticSessionTitleInput(text: string): boolean {\n  return (\n    text.startsWith(`<${LOCAL_COMMAND_STDOUT_TAG}>`) ||\n",
      "after": "    next !== undefined &&\n    next.mode === 'prompt' &&\n    next.workload === head.workload &&\n    next.isMeta === head.isMeta\n  )\n}\n\nfunction getSdkCrashMetadata(error: unknown): {\n  error_name: AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS\n  api_error_status?: number\n  cause_name?: AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS\n} {\n  const isApiError = error instanceof APIError\n  const errorName = isApiError\n    ? classifyAPIError(error)\n    : classifyToolError(error)\n  const apiErrorStatus =\n    isApiError && typeof error.status === 'number' ? error.status : undefined\n  const causeName =\n    error instanceof Error && error.cause !== undefined\n      ? classifyToolError(error.cause)\n      : undefined\n  return {\n    error_name:\n      errorName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,\n    api_error_status: apiErrorStatus,\n    cause_name:\n      causeName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,\n  }\n}\n\nfunction getUrlElicitationUrls(error: McpError): string[] {\n  const data = error.data\n  if (data === null || typeof data !== 'object') return []\n  const elicitations = (data as Record<string, unknown>).elicitations\n  if (!Array.isArray(elicitations)) return []\n  return elicitations.flatMap(value => {\n    if (value === null || typeof value !== 'object') return []\n    const elicitation = value as Record<string, unknown>\n    return elicitation.mode === 'url' &&\n      typeof elicitation.url === 'string' &&\n      typeof elicitation.elicitationId === 'string' &&\n      typeof elicitation.message === 'string'\n      ? [elicitation.url]\n      : []\n  })\n}\n\nfunction markMcpServerNeedsAuth(\n  serverName: string,\n  setAppState: (f: (prev: AppState) => AppState) => void,\n): void {\n  setAppState(prevState => {\n    const existingClientIndex = prevState.mcp.clients.findIndex(\n      client => client.name === serverName,\n    )\n    if (existingClientIndex === -1) return prevState\n    const existingClient = prevState.mcp.clients[existingClientIndex]\n    if (!existingClient || existingClient.type !== 'connected') return prevState\n    const clients = [...prevState.mcp.clients]\n    clients[existingClientIndex] = {\n      name: serverName,\n      type: 'needs-auth',\n      config: existingClient.config,\n    }\n    return { ...prevState, mcp: { ...prevState.mcp, clients } }\n  })\n}\n\nfunction isSyntheticSessionTitleInput(text: string): boolean {\n  return (\n    text.startsWith(`<${LOCAL_COMMAND_STDOUT_TAG}>`) ||\n"
    },
    {
      "before": "    workload?: string | undefined\n  },\n  turnInterruptionState?: TurnInterruptionState,\n): AsyncIterable<StdoutMessage> {\n  let running = false\n  let runPhase:\n    | 'draining_commands'\n    | 'waiting_for_agents'\n    | 'finally_flush'\n    | 'finally_post_flush'\n    | undefined\n  let inputClosed = false\n  let shutdownPromptInjected = false\n  let heldBackResult: StdoutMessage | null = null\n  let abortController: AbortController | undefined\n  // Same queue sendRequest() enqueues to — one FIFO for everything.\n  const output = structuredIO.outbound\n\n  if (options.outputFormat === 'stream-json' && options.sessionMirror) {\n    registerSessionMirror((filePath, entries) =>\n",
      "after": "    workload?: string | undefined\n  },\n  turnInterruptionState?: TurnInterruptionState,\n): AsyncIterable<StdoutMessage> {\n  let running = false\n  let sdkResultStartedAt: number | undefined\n  let sdkResultTerminalLogged = false\n  let runPhase:\n    | 'draining_commands'\n    | 'waiting_for_agents'\n    | 'finally_flush'\n    | 'finally_post_flush'\n    | undefined\n  let inputClosed = false\n  let shutdownPromptInjected = false\n  let heldBackResult: StdoutMessage | null = null\n  let abortController: AbortController | undefined\n  const controlRequestAbortController = createAbortController(500)\n  // Same queue sendRequest() enqueues to — one FIFO for everything.\n  const output = structuredIO.outbound\n\n  if (options.outputFormat === 'stream-json' && options.sessionMirror) {\n    registerSessionMirror((filePath, entries) =>\n"
    },
    {
      "before": "  const sigintHandler = () => {\n    logForDiagnosticsNoPII('info', 'shutdown_signal', { signal: 'SIGINT' })\n    if (abortController && !abortController.signal.aborted) {\n      abortController.abort()\n    }\n    void gracefulShutdown(0)\n  }\n  process.on('SIGINT', sigintHandler)\n\n  // Dump run()'s state at SIGTERM so a stuck session's healthsweep can name\n  // the do/while(waitingForAgents) poll without reading the transcript.\n  registerCleanup(async () => {\n    const bg: Record<string, number> = {}\n    for (const t of getRunningTasks(getAppState())) {\n      if (isBackgroundTask(t)) bg[t.type] = (bg[t.type] ?? 0) + 1\n    }\n    logForDiagnosticsNoPII('info', 'run_state_at_shutdown', {\n",
      "after": "  const sigintHandler = () => {\n    logForDiagnosticsNoPII('info', 'shutdown_signal', { signal: 'SIGINT' })\n    if (abortController && !abortController.signal.aborted) {\n      abortController.abort()\n    }\n    controlRequestAbortController.abort()\n    void gracefulShutdown(0)\n  }\n  process.on('SIGINT', sigintHandler)\n\n  // Dump run()'s state at SIGTERM so a stuck session's healthsweep can name\n  // the do/while(waitingForAgents) poll without reading the transcript.\n  registerCleanup(async () => {\n    if (\n      sdkResultStartedAt &&\n      !abortController?.signal.aborted &&\n      !sdkResultTerminalLogged\n    ) {\n      logEvent('tengu_sdk_result', {\n        subtype:\n          'terminated' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,\n        is_error: true,\n        duration_ms: Date.now() - sdkResultStartedAt,\n        run_phase:\n          runPhase ??\n          ('init' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS),\n        exit_code: process.exitCode,\n      })\n      sdkResultTerminalLogged = true\n      sdkResultStartedAt = undefined\n    }\n    const bg: Record<string, number> = {}\n    for (const t of getRunningTasks(getAppState())) {\n      if (isBackgroundTask(t)) bg[t.type] = (bg[t.type] ?? 0) + 1\n    }\n    logForDiagnosticsNoPII('info', 'run_state_at_shutdown', {\n"
    },
    {
      "before": "          // stamps cmd.workload; the SDK --workload flag is options.workload.\n          // const-capture: TS loses `while ((command = dequeue()))` narrowing\n          // inside the closure.\n          const cmd = command\n          await runWithWorkload(cmd.workload ?? options.workload, async () => {\n            for await (const message of ask({\n              commands: uniqBy(\n                [...currentCommands, ...appState.mcp.commands],\n                'name',\n              ),\n",
      "after": "          // stamps cmd.workload; the SDK --workload flag is options.workload.\n          // const-capture: TS loses `while ((command = dequeue()))` narrowing\n          // inside the closure.\n          const cmd = command\n          await runWithWorkload(cmd.workload ?? options.workload, async () => {\n            let sawSdkRetry = false\n            let sawSdkCompact = false\n            let sdkRetryStatus = 0\n            const sdkApiDurationStart = getTotalAPIDuration()\n            sdkResultStartedAt = Date.now()\n            for await (const message of ask({\n              commands: uniqBy(\n                [...currentCommands, ...appState.mcp.commands],\n                'name',\n              ),\n"
    },
    {
      "before": "              // Forward messages to bridge incrementally (mid-turn) so\n              // claude.ai sees progress and the connection stays alive\n              // while blocked on permission requests.\n              forwardMessagesToBridge()\n\n              if (message.type === 'result') {\n                // Flush pending SDK events so they appear before result on the stream.\n                for (const event of drainSdkEvents()) {\n                  output.enqueue(event)\n                }\n\n",
      "after": "              // Forward messages to bridge incrementally (mid-turn) so\n              // claude.ai sees progress and the connection stays alive\n              // while blocked on permission requests.\n              forwardMessagesToBridge()\n\n              if (message.type === 'system') {\n                if (message.subtype === 'api_retry') {\n                  sawSdkRetry = true\n                  sdkRetryStatus = Math.max(\n                    sdkRetryStatus,\n                    message.error_status ?? 0,\n                  )\n                }\n                if (message.subtype === 'compact_boundary') {\n                  sawSdkCompact = true\n                }\n              }\n\n              if (message.type === 'result') {\n                if (sdkResultStartedAt !== undefined) {\n                  logEvent('tengu_sdk_result', {\n                    subtype:\n                      message.subtype as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,\n                    is_error: message.is_error,\n                    num_turns: message.num_turns,\n                    duration_ms: message.duration_ms,\n                    duration_api_ms:\n                      getTotalAPIDuration() - sdkApiDurationStart,\n                    saw_retry: sawSdkRetry,\n                    saw_compact: sawSdkCompact,\n                    retry_status: sawSdkRetry ? sdkRetryStatus : undefined,\n                    api_error_status:\n                      message.subtype === 'success'\n                        ? (message as { api_error_status?: number })\n                            .api_error_status\n                        : undefined,\n                  })\n                  sdkResultStartedAt = undefined\n                }\n                // Flush pending SDK events so they appear before result on the stream.\n                for (const event of drainSdkEvents()) {\n                  output.enqueue(event)\n                }\n\n"
    },
    {
      "before": "          }\n          suggestionState.pendingSuggestion = null\n        }\n      }\n    } catch (error) {\n      // Emit error result message before shutting down\n      // Write directly to structuredIO to ensure immediate delivery\n      try {\n        if (options.sessionMirror) {\n          await flushSessionStorage()\n",
      "after": "          }\n          suggestionState.pendingSuggestion = null\n        }\n      }\n    } catch (error) {\n      logEvent('tengu_sdk_session_crash', getSdkCrashMetadata(error))\n      if (!sdkResultTerminalLogged) {\n        logEvent('tengu_sdk_result', {\n          subtype:\n            'error_during_execution' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,\n          is_error: true,\n          num_turns: 0,\n          duration_ms: 0,\n          duration_api_ms: 0,\n          saw_retry: false,\n          saw_compact: false,\n        })\n        sdkResultTerminalLogged = true\n      }\n      // Emit error result message before shutting down\n      // Write directly to structuredIO to ensure immediate delivery\n      try {\n        if (options.sessionMirror) {\n          await flushSessionStorage()\n"
    },
    {
      "before": "        })\n        void run()\n      } else {\n        // Wait for any in-flight push suggestion before closing the output stream.\n        if (suggestionState.inflightPromise) {\n          await Promise.race([suggestionState.inflightPromise, sleep(5000)])\n        }\n        suggestionState.abortController?.abort()\n        suggestionState.abortController = null\n        await finalizePendingAsyncHooks()\n        unsubscribeSkillChanges()\n",
      "after": "        })\n        void run()\n      } else {\n        // Wait for any in-flight push suggestion before closing the output stream.\n        if (suggestionState.inflightPromise) {\n          const suggestionAbortTimer = setTimeout(\n            controller => controller?.abort(),\n            30_000,\n            suggestionState.abortController,\n          )\n          try {\n            await suggestionState.inflightPromise\n          } finally {\n            clearTimeout(suggestionAbortTimer)\n          }\n        }\n        suggestionState.abortController?.abort()\n        suggestionState.abortController = null\n        await finalizePendingAsyncHooks()\n        unsubscribeSkillChanges()\n"
    },
    {
      "before": "            `[print.ts] end_session received, reason=${message.request.reason ?? 'unspecified'}`,\n          )\n          if (abortController) {\n            abortController.abort()\n          }\n          suggestionState.abortController?.abort()\n          suggestionState.abortController = null\n          suggestionState.lastEmitted = null\n          suggestionState.pendingSuggestion = null\n          sendControlResponseSuccess(message)\n",
      "after": "            `[print.ts] end_session received, reason=${message.request.reason ?? 'unspecified'}`,\n          )\n          if (abortController) {\n            abortController.abort()\n          }\n          controlRequestAbortController.abort()\n          suggestionState.abortController?.abort()\n          suggestionState.abortController = null\n          suggestionState.lastEmitted = null\n          suggestionState.pendingSuggestion = null\n          sendControlResponseSuccess(message)\n"
    },
    {
      "before": "        } else if (message.request.subtype === 'get_binary_version') {\n          sendControlResponseSuccess(message, {\n            version: MACRO.VERSION,\n            buildTime: MACRO.BUILD_TIME,\n          })\n        } else if (message.request.subtype === 'get_context_usage') {\n          try {\n            const appState = getAppState()\n            const data = await collectContextData({\n              messages: mutableMessages,\n",
      "after": "        } else if (message.request.subtype === 'get_binary_version') {\n          sendControlResponseSuccess(message, {\n            version: MACRO.VERSION,\n            buildTime: MACRO.BUILD_TIME,\n          })\n        } else if (message.request.subtype === 'mcp_call') {\n          const { tool, arguments: args } = message.request\n          const mcpInfo = mcpInfoFromString(tool)\n          if (!mcpInfo || !mcpInfo.toolName) {\n            sendControlResponseError(\n              message,\n              `Not a fully-qualified MCP tool name: ${tool}`,\n            )\n          } else {\n            const connectedClient = [\n              ...getAppState().mcp.clients,\n              ...sdkClients,\n              ...dynamicMcpState.clients,\n            ].find(\n              client =>\n                client.type === 'connected' &&\n                normalizeNameForMCP(client.name) === mcpInfo.serverName,\n            )\n            if (!connectedClient || connectedClient.type !== 'connected') {\n              sendControlResponseError(\n                message,\n                `MCP server not connected: ${mcpInfo.serverName}`,\n              )\n            } else if (connectedClient.config.type === 'sdk') {\n              sendControlResponseError(\n                message,\n                'mcp_call does not support SDK MCP servers. ' +\n                  `SDK servers are caller-provided — invoke ${mcpInfo.serverName} directly.`,\n              )\n            } else {\n              const actualToolName =\n                [\n                  ...getAppState().mcp.tools,\n                  ...dynamicMcpState.tools,\n                ].find(candidate => toolMatchesName(candidate, tool))?.mcpInfo\n                  ?.toolName ?? mcpInfo.toolName\n\n              void (async () => {\n                if (controlRequestAbortController.signal.aborted) return\n                const callAbortController = createAbortController()\n                const onParentAbort = () =>\n                  callAbortController.abort(\n                    controlRequestAbortController.signal.reason,\n                  )\n                controlRequestAbortController.signal.addEventListener(\n                  'abort',\n                  onParentAbort,\n                  { once: true },\n                )\n                try {\n                  const result = await callMCPToolWithUrlElicitationRetry({\n                    client: connectedClient,\n                    clientConnection: connectedClient,\n                    tool: actualToolName,\n                    args: args ?? {},\n                    signal: callAbortController.signal,\n                    setAppState,\n                    handleElicitation: async () => ({ action: 'cancel' }),\n                  })\n                  if (controlRequestAbortController.signal.aborted) return\n                  if (result.urlElicitationDeclined) {\n                    sendControlResponseError(\n                      message,\n                      `URL elicitation required (open URL, then retry mcp_call): ${result.urlElicitationDeclined.url}` +\n                        (typeof result.content === 'string'\n                          ? ` — ${result.content}`\n                          : ''),\n                    )\n                  } else {\n                    sendControlResponseSuccess(message, {\n                      content: result.content,\n                      structuredContent: result.structuredContent,\n                      _meta: result._meta,\n                    })\n                  }\n                } catch (error) {\n                  if (controlRequestAbortController.signal.aborted) return\n                  if (error instanceof McpAuthError) {\n                    markMcpServerNeedsAuth(error.serverName, setAppState)\n                  }\n                  let messageText =\n                    error instanceof Error ? error.message : String(error)\n                  if (\n                    error instanceof Error &&\n                    error.name === 'McpSessionExpiredError'\n                  ) {\n                    messageText = `MCP session expired for ${mcpInfo.serverName} — send mcp_reconnect and retry mcp_call: ${messageText}`\n                  } else if (\n                    error instanceof McpError &&\n                    error.code === ErrorCode.UrlElicitationRequired\n                  ) {\n                    const urls = getUrlElicitationUrls(error)\n                    messageText =\n                      urls.length > 0\n                        ? `URL elicitation required (open URL, then retry mcp_call): ${urls.join(', ')} — ${messageText}`\n                        : `URL elicitation required (no URL in error data): ${messageText}`\n                  }\n                  sendControlResponseError(message, messageText)\n                } finally {\n                  controlRequestAbortController.signal.removeEventListener(\n                    'abort',\n                    onParentAbort,\n                  )\n                }\n              })()\n            }\n          }\n        } else if (message.request.subtype === 'get_context_usage') {\n          try {\n            const appState = getAppState()\n            const data = await collectContextData({\n              messages: mutableMessages,\n"
    },
    {
      "before": "        }))\n      }\n      void run()\n    }\n    inputClosed = true\n    cronScheduler?.stop()\n    if (!running) {\n      // If a push-suggestion is in-flight, wait for it to emit before closing\n      // the output stream (5 s safety timeout to prevent hanging).\n      if (suggestionState.inflightPromise) {\n        await Promise.race([suggestionState.inflightPromise, sleep(5000)])\n      }\n      suggestionState.abortController?.abort()\n      suggestionState.abortController = null\n      await finalizePendingAsyncHooks()\n      unsubscribeSkillChanges()\n",
      "after": "        }))\n      }\n      void run()\n    }\n    inputClosed = true\n    controlRequestAbortController.abort()\n    cronScheduler?.stop()\n    if (!running) {\n      // If a push-suggestion is in-flight, wait for it to emit before closing\n      // the output stream (30 s safety timeout to prevent hanging).\n      if (suggestionState.inflightPromise) {\n        const suggestionAbortTimer = setTimeout(\n          controller => controller?.abort(),\n          30_000,\n          suggestionState.abortController,\n        )\n        try {\n          await suggestionState.inflightPromise\n        } finally {\n          clearTimeout(suggestionAbortTimer)\n        }\n      }\n      suggestionState.abortController?.abort()\n      suggestionState.abortController = null\n      await finalizePendingAsyncHooks()\n      unsubscribeSkillChanges()\n"
    }
  ]
}


export const TARGET120_TAIL_SUPPLEMENT_OWNER_OVERRIDES = {
  370: ['src/bootstrap/state.ts'],
  371: ['src/bootstrap/state.ts'],
  2576: ['src/utils/env.ts'],
  2578: ['src/utils/env.ts'],
  11081: ['src/utils/managedEnvConstants.ts'],
  13763: ['src/tools/ExitWorktreeTool/ExitWorktreeTool.ts'],
  14042: ['src/jobs/classifier.ts'],
  14060: ['src/jobs/classifier.ts'],
  18593: ['src/daemon/hub.tsx'],
  19480: ['src/daemon/supervisor.ts'],
  19492: ['src/daemon/main.ts'],
  19500: ['src/daemon/main.ts'],
  19509: ['src/daemon/cli.ts'],
  19627: ['src/components/FleetView.tsx'],
  19629: ['src/components/FleetView.tsx'],
  19809: ['src/cli/transports/ccrClient.ts'],
  20794: ['src/utils/skills/skillChangeDetector.ts'],
  20931: ['src/components/FeedbackSurvey/SurveyOptions.tsx'],
  20935: ['src/components/FeedbackSurvey/FeedbackSurveyView.tsx'],
  20951: ['src/components/FeedbackSurvey/MemoryWriteSurvey.tsx'],
  20952: ['src/components/FeedbackSurvey/MemoryWriteSurvey.tsx'],
  20957: ['src/screens/REPL.tsx'],
  20958: ['src/screens/REPL.tsx'],
  21277: ['src/screens/REPL.tsx'],
  21627: [
    'src/skills/bundled/claude-api/shared/managed-agents-api-reference.md',
  ],
  21858: ['src/cli/print.ts'],
  21892: ['src/entrypoints/mcp.ts'],
  21966: ['src/cli/handlers/ultrareview.ts'],
}

export const TARGET120_TAIL_SUPPLEMENT_REPLAY_ORDER = [
  'bootstrap-state',
  'managed-agents-api-reference',
  'safe-env-powershell',
  'classifier-surface-telemetry',
  'skill-change-detector-lifecycle',
  'orphan-pty-sidecar-cleanup',
  'daemon-status-recovery-telemetry',
  'environment-shell-analytics',
  'internal-network-probe-stub',
  'exit-worktree-cwd-override-guard',
  'ccr-status-category-guard',
  'mcp-effort-fallback',
  'ultrareview-noop-task-registry',
  'fleetview-live-repositories-and-attachment',
  'feedback-survey-options',
  'moreright-session-restoration',
  'repl-survey-stack-and-undo',
  'cli-print-control-and-telemetry',
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function occurrenceCount(source, value) {
  return source.split(value).length - 1
}

export function replayTarget120BootstrapStateSupplement({ sourceRoot }) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(
    root,
    TARGET120_BOOTSTRAP_STATE_REPLAY.ownerPath.slice(4),
  )
  assert.ok(
    filename.startsWith(root + path.sep),
    'bootstrap-state replay remains under the selected source root',
  )
  assert.ok(fs.existsSync(filename), 'bootstrap-state historical owner exists')
  const beforeBytes = fs.readFileSync(filename)
  const beforeDescriptor = descriptor(beforeBytes)
  if (
    beforeDescriptor.bytes === TARGET120_BOOTSTRAP_STATE_REPLAY.postimage.bytes &&
    beforeDescriptor.sha256 === TARGET120_BOOTSTRAP_STATE_REPLAY.postimage.sha256
  ) {
    return { changes: [], state: 'already-replayed' }
  }
  assert.deepEqual(
    beforeDescriptor,
    TARGET120_BOOTSTRAP_STATE_REPLAY.preimage,
    'bootstrap-state replay accepts only the pinned historical preimage',
  )
  let output = beforeBytes.toString('utf8')
  for (const replacement of TARGET120_BOOTSTRAP_STATE_REPLAY.replacements) {
    assert.equal(
      occurrenceCount(output, replacement.before),
      1,
      'bootstrap-state replay anchor appears exactly once',
    )
    assert.equal(
      occurrenceCount(output, replacement.after),
      0,
      'bootstrap-state replay postimage is initially absent',
    )
    output = output.replace(replacement.before, replacement.after)
  }
  const outputBytes = Buffer.from(output)
  assert.deepEqual(
    descriptor(outputBytes),
    TARGET120_BOOTSTRAP_STATE_REPLAY.postimage,
    'bootstrap-state replay produces the pinned postimage',
  )
  fs.writeFileSync(filename, outputBytes)
  return {
    changes: [
      {
        ownerPath: TARGET120_BOOTSTRAP_STATE_REPLAY.ownerPath,
        targetIndices: TARGET120_BOOTSTRAP_STATE_REPLAY.targetIndices,
      },
    ],
    state: 'replayed',
  }
}

export function replayTarget120ManagedAgentsSupplement({ sourceRoot }) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(
    root,
    TARGET120_MANAGED_AGENTS_REPLAY.ownerPath.slice(4),
  )
  assert.ok(
    filename.startsWith(root + path.sep),
    'managed-agents replay remains under the selected source root',
  )
  assert.ok(fs.existsSync(filename), 'managed-agents historical owner exists')
  const beforeBytes = fs.readFileSync(filename)
  const beforeDescriptor = descriptor(beforeBytes)
  if (
    beforeDescriptor.bytes === TARGET120_MANAGED_AGENTS_REPLAY.postimage.bytes &&
    beforeDescriptor.sha256 ===
      TARGET120_MANAGED_AGENTS_REPLAY.postimage.sha256
  ) {
    return { changes: [], state: 'already-replayed' }
  }
  assert.deepEqual(
    beforeDescriptor,
    TARGET120_MANAGED_AGENTS_REPLAY.preimage,
    'managed-agents replay accepts only the pinned historical preimage',
  )
  const source = beforeBytes.toString('utf8')
  assert.equal(
    occurrenceCount(source, TARGET120_MANAGED_AGENTS_REPLAY.before),
    1,
    'the obsolete create-operation rate appears exactly once',
  )
  assert.equal(
    occurrenceCount(source, TARGET120_MANAGED_AGENTS_REPLAY.after),
    0,
    'the corrected create-operation rate is initially absent',
  )
  const output = source.replace(
    TARGET120_MANAGED_AGENTS_REPLAY.before,
    TARGET120_MANAGED_AGENTS_REPLAY.after,
  )
  const outputBytes = Buffer.from(output)
  assert.deepEqual(
    descriptor(outputBytes),
    TARGET120_MANAGED_AGENTS_REPLAY.postimage,
    'the replay produces the authenticated target literal byte-for-byte',
  )
  fs.writeFileSync(filename, outputBytes)
  return {
    changes: [
      {
        ownerPath: TARGET120_MANAGED_AGENTS_REPLAY.ownerPath,
        targetIndex: TARGET120_MANAGED_AGENTS_REPLAY.targetIndex,
      },
    ],
    state: 'replayed',
  }
}

export function replayTarget120SafeEnvPowershellSupplement({ sourceRoot }) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(
    root,
    TARGET120_SAFE_ENV_POWERSHELL_REPLAY.ownerPath.slice(4),
  )
  assert.ok(
    filename.startsWith(root + path.sep),
    'safe-env replay remains under the selected source root',
  )
  assert.ok(fs.existsSync(filename), 'safe-env historical owner exists')
  const beforeBytes = fs.readFileSync(filename)
  const beforeDescriptor = descriptor(beforeBytes)
  if (
    beforeDescriptor.bytes === TARGET120_SAFE_ENV_POWERSHELL_REPLAY.postimage.bytes &&
    beforeDescriptor.sha256 === TARGET120_SAFE_ENV_POWERSHELL_REPLAY.postimage.sha256
  ) {
    return { changes: [], state: 'already-replayed' }
  }
  assert.deepEqual(
    beforeDescriptor,
    TARGET120_SAFE_ENV_POWERSHELL_REPLAY.preimage,
    'safe-env replay accepts only the pinned historical preimage',
  )
  const source = beforeBytes.toString('utf8')
  assert.equal(
    occurrenceCount(source, TARGET120_SAFE_ENV_POWERSHELL_REPLAY.before),
    1,
    'safe-env replay anchor appears exactly once',
  )
  assert.equal(
    occurrenceCount(source, TARGET120_SAFE_ENV_POWERSHELL_REPLAY.after),
    0,
    'safe-env replay postimage is initially absent',
  )
  const outputBytes = Buffer.from(
    source.replace(
      TARGET120_SAFE_ENV_POWERSHELL_REPLAY.before,
      TARGET120_SAFE_ENV_POWERSHELL_REPLAY.after,
    ),
  )
  assert.deepEqual(
    descriptor(outputBytes),
    TARGET120_SAFE_ENV_POWERSHELL_REPLAY.postimage,
    'safe-env replay produces the pinned postimage',
  )
  fs.writeFileSync(filename, outputBytes)
  return {
    changes: [
      {
        ownerPath: TARGET120_SAFE_ENV_POWERSHELL_REPLAY.ownerPath,
        targetIndex: TARGET120_SAFE_ENV_POWERSHELL_REPLAY.targetIndex,
      },
    ],
    state: 'replayed',
  }
}

export function replayTarget120ClassifierSurfaceTelemetrySupplement({
  sourceRoot,
}) {
  const root = path.resolve(sourceRoot)
  const planned = []
  for (const owner of TARGET120_CLASSIFIER_SURFACE_TELEMETRY_REPLAY.owners) {
    const filename = path.resolve(root, owner.ownerPath.slice(4))
    assert.ok(
      filename.startsWith(root + path.sep),
      'classifier-surface replay remains under the selected source root',
    )
    assert.ok(fs.existsSync(filename), 'classifier-surface historical owner exists')
    const beforeBytes = fs.readFileSync(filename)
    const beforeDescriptor = descriptor(beforeBytes)
    if (
      beforeDescriptor.bytes === owner.postimage.bytes &&
      beforeDescriptor.sha256 === owner.postimage.sha256
    ) {
      continue
    }
    assert.deepEqual(
      beforeDescriptor,
      owner.preimage,
      owner.ownerPath + ': classifier-surface replay accepts only the pinned historical preimage',
    )
    let output = beforeBytes.toString('utf8')
    for (const replacement of owner.replacements) {
      assert.equal(
        occurrenceCount(output, replacement.before),
        1,
        owner.ownerPath + ': classifier-surface replay anchor appears exactly once',
      )
      assert.equal(
        occurrenceCount(output, replacement.after),
        0,
        owner.ownerPath + ': classifier-surface replay postimage is initially absent',
      )
      output = output.replace(replacement.before, replacement.after)
    }
    const outputBytes = Buffer.from(output)
    assert.deepEqual(
      descriptor(outputBytes),
      owner.postimage,
      owner.ownerPath + ': classifier-surface replay produces the pinned postimage',
    )
    planned.push({ filename, outputBytes, ownerPath: owner.ownerPath })
  }
  for (const change of planned) fs.writeFileSync(change.filename, change.outputBytes)
  return {
    changes: planned.map(change => ({
      ownerPath: change.ownerPath,
      targetIndices: TARGET120_CLASSIFIER_SURFACE_TELEMETRY_REPLAY.targetIndices,
    })),
    state: planned.length > 0 ? 'replayed' : 'already-replayed',
  }
}

export function replayTarget120SkillChangeDetectorLifecycleSupplement({
  sourceRoot,
}) {
  const root = path.resolve(sourceRoot)
  const planned = []
  for (const owner of TARGET120_SKILL_CHANGE_DETECTOR_LIFECYCLE_REPLAY.owners) {
    const filename = path.resolve(root, owner.ownerPath.slice(4))
    assert.ok(
      filename.startsWith(root + path.sep),
      'skill-change-detector replay remains under the selected source root',
    )
    assert.ok(
      fs.existsSync(filename),
      'skill-change-detector historical owner exists',
    )
    const beforeBytes = fs.readFileSync(filename)
    const beforeDescriptor = descriptor(beforeBytes)
    if (
      beforeDescriptor.bytes === owner.postimage.bytes &&
      beforeDescriptor.sha256 === owner.postimage.sha256
    ) {
      continue
    }
    assert.deepEqual(
      beforeDescriptor,
      owner.preimage,
      owner.ownerPath +
        ': skill-change-detector replay accepts only the pinned historical preimage',
    )
    let output = beforeBytes.toString('utf8')
    for (const replacement of owner.replacements) {
      assert.equal(
        occurrenceCount(output, replacement.before),
        1,
        owner.ownerPath +
          ': skill-change-detector replay anchor appears exactly once',
      )
      if (
        replacement.after &&
        !replacement.before.includes(replacement.after)
      ) {
        assert.equal(
          occurrenceCount(output, replacement.after),
          0,
          owner.ownerPath +
            ': skill-change-detector replay postimage is initially absent',
        )
      }
      output = output.replace(replacement.before, replacement.after)
    }
    const outputBytes = Buffer.from(output)
    assert.deepEqual(
      descriptor(outputBytes),
      owner.postimage,
      owner.ownerPath +
        ': skill-change-detector replay produces the pinned postimage',
    )
    planned.push({ filename, outputBytes, ownerPath: owner.ownerPath })
  }
  for (const change of planned) fs.writeFileSync(change.filename, change.outputBytes)
  return {
    changes: planned.map(change => ({
      ownerPath: change.ownerPath,
      targetIndex:
        TARGET120_SKILL_CHANGE_DETECTOR_LIFECYCLE_REPLAY.targetIndex,
    })),
    state: planned.length > 0 ? 'replayed' : 'already-replayed',
  }
}

export function replayTarget120OrphanPtySidecarSupplement({ sourceRoot }) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(
    root,
    TARGET120_ORPHAN_PTY_SIDECAR_REPLAY.ownerPath.slice(4),
  )
  assert.ok(
    filename.startsWith(root + path.sep),
    'orphan-pty-sidecar replay remains under the selected source root',
  )
  assert.ok(
    fs.existsSync(filename),
    'orphan-pty-sidecar historical owner exists',
  )
  const beforeBytes = fs.readFileSync(filename)
  const beforeDescriptor = descriptor(beforeBytes)
  if (
    beforeDescriptor.bytes === TARGET120_ORPHAN_PTY_SIDECAR_REPLAY.postimage.bytes &&
    beforeDescriptor.sha256 === TARGET120_ORPHAN_PTY_SIDECAR_REPLAY.postimage.sha256
  ) {
    return { changes: [], state: 'already-replayed' }
  }
  assert.deepEqual(
    beforeDescriptor,
    TARGET120_ORPHAN_PTY_SIDECAR_REPLAY.preimage,
    'orphan-pty-sidecar replay accepts only the pinned historical preimage',
  )
  const source = beforeBytes.toString('utf8')
  assert.equal(
    occurrenceCount(source, TARGET120_ORPHAN_PTY_SIDECAR_REPLAY.before),
    1,
    'orphan-pty-sidecar replay anchor appears exactly once',
  )
  assert.equal(
    occurrenceCount(source, TARGET120_ORPHAN_PTY_SIDECAR_REPLAY.after),
    0,
    'orphan-pty-sidecar replay postimage is initially absent',
  )
  const outputBytes = Buffer.from(
    source.replace(
      TARGET120_ORPHAN_PTY_SIDECAR_REPLAY.before,
      TARGET120_ORPHAN_PTY_SIDECAR_REPLAY.after,
    ),
  )
  assert.deepEqual(
    descriptor(outputBytes),
    TARGET120_ORPHAN_PTY_SIDECAR_REPLAY.postimage,
    'orphan-pty-sidecar replay produces the pinned postimage',
  )
  fs.writeFileSync(filename, outputBytes)
  return {
    changes: [
      {
        ownerPath: TARGET120_ORPHAN_PTY_SIDECAR_REPLAY.ownerPath,
        targetIndex: TARGET120_ORPHAN_PTY_SIDECAR_REPLAY.targetIndex,
      },
    ],
    state: 'replayed',
  }
}

export function replayTarget120DaemonStatusRecoveryTelemetrySupplement({
  sourceRoot,
}) {
  const root = path.resolve(sourceRoot)
  const planned = []
  for (const owner of TARGET120_DAEMON_STATUS_RECOVERY_TELEMETRY_REPLAY.owners) {
    const filename = path.resolve(root, owner.ownerPath.slice(4))
    assert.ok(
      filename.startsWith(root + path.sep),
      'daemon-status replay remains under the selected source root',
    )
    assert.ok(fs.existsSync(filename), 'daemon-status historical owner exists')
    const beforeBytes = fs.readFileSync(filename)
    const beforeDescriptor = descriptor(beforeBytes)
    if (
      beforeDescriptor.bytes === owner.postimage.bytes &&
      beforeDescriptor.sha256 === owner.postimage.sha256
    ) {
      continue
    }
    assert.deepEqual(
      beforeDescriptor,
      owner.preimage,
      owner.ownerPath +
        ': daemon-status replay accepts only the pinned historical preimage',
    )
    let output = beforeBytes.toString('utf8')
    for (const replacement of owner.replacements) {
      assert.equal(
        occurrenceCount(output, replacement.before),
        1,
        owner.ownerPath + ': daemon-status replay anchor appears exactly once',
      )
      assert.equal(
        occurrenceCount(output, replacement.after),
        0,
        owner.ownerPath + ': daemon-status replay postimage is initially absent',
      )
      output = output.replace(replacement.before, replacement.after)
    }
    const outputBytes = Buffer.from(output)
    assert.deepEqual(
      descriptor(outputBytes),
      owner.postimage,
      owner.ownerPath + ': daemon-status replay produces the pinned postimage',
    )
    planned.push({
      filename,
      outputBytes,
      ownerPath: owner.ownerPath,
      targetIndices: owner.targetIndices,
    })
  }
  for (const change of planned) fs.writeFileSync(change.filename, change.outputBytes)
  return {
    changes: planned.map(change => ({
      ownerPath: change.ownerPath,
      targetIndices: change.targetIndices,
    })),
    state: planned.length > 0 ? 'replayed' : 'already-replayed',
  }
}

export function replayTarget120EnvironmentShellAnalyticsSupplement({
  sourceRoot,
}) {
  const root = path.resolve(sourceRoot)
  const planned = []
  for (const owner of TARGET120_ENVIRONMENT_SHELL_ANALYTICS_REPLAY.owners) {
    const filename = path.resolve(root, owner.ownerPath.slice(4))
    assert.ok(
      filename.startsWith(root + path.sep),
      'environment-shell replay remains under the selected source root',
    )
    assert.ok(
      fs.existsSync(filename),
      'environment-shell historical owner exists',
    )
    const beforeBytes = fs.readFileSync(filename)
    const beforeDescriptor = descriptor(beforeBytes)
    if (
      owner.ownerPath === TARGET120_INTERNAL_NETWORK_PROBE_STUB_REPLAY.ownerPath &&
      beforeDescriptor.bytes ===
        TARGET120_INTERNAL_NETWORK_PROBE_STUB_REPLAY.postimage.bytes &&
      beforeDescriptor.sha256 ===
        TARGET120_INTERNAL_NETWORK_PROBE_STUB_REPLAY.postimage.sha256
    ) {
      continue
    }
    if (
      beforeDescriptor.bytes === owner.postimage.bytes &&
      beforeDescriptor.sha256 === owner.postimage.sha256
    ) {
      continue
    }
    assert.deepEqual(
      beforeDescriptor,
      owner.preimage,
      owner.ownerPath +
        ': environment-shell replay accepts only the pinned historical preimage',
    )
    let output = beforeBytes.toString('utf8')
    for (const replacement of owner.replacements) {
      assert.equal(
        occurrenceCount(output, replacement.before),
        1,
        owner.ownerPath + ': environment-shell replay anchor appears exactly once',
      )
      if (replacement.after) {
        assert.equal(
          occurrenceCount(output, replacement.after),
          0,
          owner.ownerPath +
            ': environment-shell replay postimage is initially absent',
        )
      }
      output = output.replace(replacement.before, replacement.after)
    }
    const outputBytes = Buffer.from(output)
    assert.deepEqual(
      descriptor(outputBytes),
      owner.postimage,
      owner.ownerPath + ': environment-shell replay produces the pinned postimage',
    )
    planned.push({ filename, outputBytes, ownerPath: owner.ownerPath })
  }
  for (const change of planned) fs.writeFileSync(change.filename, change.outputBytes)
  return {
    changes: planned.map(change => ({
      ownerPath: change.ownerPath,
      targetIndex: TARGET120_ENVIRONMENT_SHELL_ANALYTICS_REPLAY.targetIndex,
    })),
    state: planned.length > 0 ? 'replayed' : 'already-replayed',
  }
}

export function replayTarget120InternalNetworkProbeStubSupplement({
  sourceRoot,
}) {
  const root = path.resolve(sourceRoot)
  const replay = TARGET120_INTERNAL_NETWORK_PROBE_STUB_REPLAY
  const filename = path.resolve(root, replay.ownerPath.slice(4))
  assert.ok(
    filename.startsWith(root + path.sep),
    'internal-network-probe replay remains under the selected source root',
  )
  assert.ok(
    fs.existsSync(filename),
    'internal-network-probe historical owner exists',
  )
  const beforeBytes = fs.readFileSync(filename)
  const beforeDescriptor = descriptor(beforeBytes)
  if (
    beforeDescriptor.bytes === replay.postimage.bytes &&
    beforeDescriptor.sha256 === replay.postimage.sha256
  ) {
    return { changes: [], state: 'already-replayed' }
  }
  assert.deepEqual(
    beforeDescriptor,
    replay.preimage,
    'internal-network-probe replay accepts only the pinned historical preimage',
  )
  let output = beforeBytes.toString('utf8')
  for (const replacement of replay.replacements) {
    assert.equal(
      occurrenceCount(output, replacement.before),
      1,
      'internal-network-probe replay anchor appears exactly once',
    )
    assert.equal(
      occurrenceCount(output, replacement.after),
      0,
      'internal-network-probe replay postimage is initially absent',
    )
    output = output.replace(replacement.before, replacement.after)
  }
  const outputBytes = Buffer.from(output)
  assert.deepEqual(
    descriptor(outputBytes),
    replay.postimage,
    'internal-network-probe replay produces the pinned postimage',
  )
  fs.writeFileSync(filename, outputBytes)
  return {
    changes: [
      {
        ownerPath: replay.ownerPath,
        targetIndex: replay.targetIndex,
      },
    ],
    state: 'replayed',
  }
}

export function replayTarget120ExitWorktreeCwdOverrideSupplement({
  sourceRoot,
}) {
  const root = path.resolve(sourceRoot)
  const planned = []
  for (const owner of TARGET120_EXIT_WORKTREE_CWD_OVERRIDE_REPLAY.owners) {
    const filename = path.resolve(root, owner.ownerPath.slice(4))
    assert.ok(
      filename.startsWith(root + path.sep),
      'exit-worktree replay remains under the selected source root',
    )
    assert.ok(
      fs.existsSync(filename),
      'exit-worktree historical owner exists',
    )
    const beforeBytes = fs.readFileSync(filename)
    const beforeDescriptor = descriptor(beforeBytes)
    if (
      beforeDescriptor.bytes === owner.postimage.bytes &&
      beforeDescriptor.sha256 === owner.postimage.sha256
    ) {
      continue
    }
    assert.deepEqual(
      beforeDescriptor,
      owner.preimage,
      owner.ownerPath +
        ': exit-worktree replay accepts only the pinned historical preimage',
    )
    let output = beforeBytes.toString('utf8')
    for (const replacement of owner.replacements) {
      assert.equal(
        occurrenceCount(output, replacement.before),
        1,
        owner.ownerPath + ': exit-worktree replay anchor appears exactly once',
      )
      assert.equal(
        occurrenceCount(output, replacement.after),
        0,
        owner.ownerPath + ': exit-worktree replay postimage is initially absent',
      )
      output = output.replace(replacement.before, replacement.after)
    }
    const outputBytes = Buffer.from(output)
    assert.deepEqual(
      descriptor(outputBytes),
      owner.postimage,
      owner.ownerPath + ': exit-worktree replay produces the pinned postimage',
    )
    planned.push({ filename, outputBytes, ownerPath: owner.ownerPath })
  }
  for (const change of planned) fs.writeFileSync(change.filename, change.outputBytes)
  return {
    changes: planned.map(change => ({
      ownerPath: change.ownerPath,
      targetIndex: TARGET120_EXIT_WORKTREE_CWD_OVERRIDE_REPLAY.targetIndex,
    })),
    state: planned.length > 0 ? 'replayed' : 'already-replayed',
  }
}

export function replayTarget120CcrStatusCategoryGuardSupplement({
  sourceRoot,
}) {
  const root = path.resolve(sourceRoot)
  const replay = TARGET120_CCR_STATUS_CATEGORY_GUARD_REPLAY
  const filename = path.resolve(root, replay.ownerPath.slice(4))
  assert.ok(
    filename.startsWith(root + path.sep),
    'CCR status-category replay remains under the selected source root',
  )
  assert.ok(
    fs.existsSync(filename),
    'CCR status-category historical owner exists',
  )
  const beforeBytes = fs.readFileSync(filename)
  const beforeDescriptor = descriptor(beforeBytes)
  if (
    beforeDescriptor.bytes === replay.postimage.bytes &&
    beforeDescriptor.sha256 === replay.postimage.sha256
  ) {
    return { changes: [], state: 'already-replayed' }
  }
  assert.deepEqual(
    beforeDescriptor,
    replay.preimage,
    'CCR status-category replay accepts only the pinned historical preimage',
  )
  let output = beforeBytes.toString('utf8')
  for (const replacement of replay.replacements) {
    assert.equal(
      occurrenceCount(output, replacement.before),
      1,
      'CCR status-category replay anchor appears exactly once',
    )
    assert.equal(
      occurrenceCount(output, replacement.after),
      0,
      'CCR status-category replay postimage is initially absent',
    )
    output = output.replace(replacement.before, replacement.after)
  }
  const outputBytes = Buffer.from(output)
  assert.deepEqual(
    descriptor(outputBytes),
    replay.postimage,
    'CCR status-category replay produces the pinned postimage',
  )
  fs.writeFileSync(filename, outputBytes)
  return {
    changes: [
      {
        ownerPath: replay.ownerPath,
        targetIndex: replay.targetIndex,
      },
    ],
    state: 'replayed',
  }
}

export function replayTarget120McpEffortFallbackSupplement({ sourceRoot }) {
  const root = path.resolve(sourceRoot)
  const replay = TARGET120_MCP_EFFORT_FALLBACK_REPLAY
  const filename = path.resolve(root, replay.ownerPath.slice(4))
  assert.ok(
    filename.startsWith(root + path.sep),
    'MCP effort-fallback replay remains under the selected source root',
  )
  assert.ok(fs.existsSync(filename), 'MCP effort-fallback historical owner exists')
  const beforeBytes = fs.readFileSync(filename)
  const beforeDescriptor = descriptor(beforeBytes)
  if (
    beforeDescriptor.bytes === replay.postimage.bytes &&
    beforeDescriptor.sha256 === replay.postimage.sha256
  ) {
    return { changes: [], state: 'already-replayed' }
  }
  assert.deepEqual(
    beforeDescriptor,
    replay.preimage,
    'MCP effort-fallback replay accepts only the pinned historical preimage',
  )
  let output = beforeBytes.toString('utf8')
  for (const replacement of replay.replacements) {
    assert.equal(
      occurrenceCount(output, replacement.before),
      1,
      'MCP effort-fallback replay anchor appears exactly once',
    )
    assert.equal(
      occurrenceCount(output, replacement.after),
      0,
      'MCP effort-fallback replay postimage is initially absent',
    )
    output = output.replace(replacement.before, replacement.after)
  }
  const outputBytes = Buffer.from(output)
  assert.deepEqual(
    descriptor(outputBytes),
    replay.postimage,
    'MCP effort-fallback replay produces the pinned postimage',
  )
  fs.writeFileSync(filename, outputBytes)
  return {
    changes: [
      {
        ownerPath: replay.ownerPath,
        targetIndex: replay.targetIndex,
      },
    ],
    state: 'replayed',
  }
}

export function replayTarget120UltrareviewNoopTaskRegistrySupplement({
  sourceRoot,
}) {
  const root = path.resolve(sourceRoot)
  const replay = TARGET120_ULTRAREVIEW_NOOP_TASK_REGISTRY_REPLAY
  const planned = []
  for (const owner of replay.owners) {
    const filename = path.resolve(root, owner.ownerPath.slice(4))
    assert.ok(
      filename.startsWith(root + path.sep),
      'ultrareview task-registry replay remains under the selected source root',
    )
    assert.ok(
      fs.existsSync(filename),
      'ultrareview task-registry historical owner exists',
    )
    const beforeBytes = fs.readFileSync(filename)
    const beforeDescriptor = descriptor(beforeBytes)
    if (
      beforeDescriptor.bytes === owner.postimage.bytes &&
      beforeDescriptor.sha256 === owner.postimage.sha256
    ) {
      continue
    }
    assert.deepEqual(
      beforeDescriptor,
      owner.preimage,
      owner.ownerPath +
        ': ultrareview task-registry replay accepts only the pinned historical preimage',
    )
    let output = beforeBytes.toString('utf8')
    for (const replacement of owner.replacements) {
      assert.equal(
        occurrenceCount(output, replacement.before),
        1,
        owner.ownerPath +
          ': ultrareview task-registry replay anchor appears exactly once',
      )
      if (!replacement.before.includes(replacement.after)) {
        assert.equal(
          occurrenceCount(output, replacement.after),
          0,
          owner.ownerPath +
            ': ultrareview task-registry replay postimage is initially absent',
        )
      }
      output = output.replace(replacement.before, replacement.after)
    }
    const outputBytes = Buffer.from(output)
    assert.deepEqual(
      descriptor(outputBytes),
      owner.postimage,
      owner.ownerPath +
        ': ultrareview task-registry replay produces the pinned postimage',
    )
    planned.push({ filename, outputBytes, ownerPath: owner.ownerPath })
  }
  for (const change of planned) fs.writeFileSync(change.filename, change.outputBytes)
  return {
    changes: planned.map(change => ({
      ownerPath: change.ownerPath,
      targetIndex: replay.targetIndex,
    })),
    state: planned.length > 0 ? 'replayed' : 'already-replayed',
  }
}

export function replayTarget120FleetViewLiveRepositorySupplement({ sourceRoot }) {
  const root = path.resolve(sourceRoot)
  const replay = TARGET120_FLEETVIEW_LIVE_REPOSITORY_REPLAY
  const filename = path.resolve(root, replay.ownerPath.slice(4))
  assert.ok(
    filename.startsWith(root + path.sep),
    'FleetView live-repository replay remains under the selected source root',
  )
  assert.ok(
    fs.existsSync(filename),
    'FleetView live-repository historical owner exists',
  )
  const beforeBytes = fs.readFileSync(filename)
  const beforeDescriptor = descriptor(beforeBytes)
  if (
    beforeDescriptor.bytes === replay.postimage.bytes &&
    beforeDescriptor.sha256 === replay.postimage.sha256
  ) {
    return { changes: [], state: 'already-replayed' }
  }
  assert.deepEqual(
    beforeDescriptor,
    replay.preimage,
    'FleetView live-repository replay accepts only the pinned historical preimage',
  )
  let output = beforeBytes.toString('utf8')
  for (const replacement of replay.replacements) {
    assert.equal(
      occurrenceCount(output, replacement.before),
      1,
      'FleetView live-repository replay anchor appears exactly once',
    )
    assert.equal(
      occurrenceCount(output, replacement.after),
      0,
      'FleetView live-repository replay postimage is initially absent',
    )
    output = output.replace(replacement.before, replacement.after)
  }
  const outputBytes = Buffer.from(output)
  assert.deepEqual(
    descriptor(outputBytes),
    replay.postimage,
    'FleetView live-repository replay produces the pinned postimage',
  )
  fs.writeFileSync(filename, outputBytes)
  return {
    changes: [
      {
        ownerPath: replay.ownerPath,
        targetIndices: replay.targetIndices,
      },
    ],
    state: 'replayed',
  }
}

export function replayTarget120FeedbackSurveyOptionsSupplement({ sourceRoot }) {
  const root = path.resolve(sourceRoot)
  const planned = []
  for (const owner of TARGET120_FEEDBACK_SURVEY_OPTIONS_REPLAY.owners) {
    const filename = path.resolve(root, owner.ownerPath.slice(4))
    assert.ok(
      filename.startsWith(root + path.sep),
      'feedback-survey replay remains under the selected source root',
    )
    const exists = fs.existsSync(filename)
    const beforeBytes = exists ? fs.readFileSync(filename) : null
    const beforeDescriptor = beforeBytes
      ? descriptor(beforeBytes)
      : { absent: true }
    if (
      beforeBytes &&
      beforeDescriptor.bytes === owner.postimage.bytes &&
      beforeDescriptor.sha256 === owner.postimage.sha256
    ) {
      continue
    }
    assert.deepEqual(
      beforeDescriptor,
      owner.preimage,
      owner.ownerPath +
        ': feedback-survey replay accepts only the pinned historical preimage',
    )
    let output
    if (owner.postimageText !== undefined) {
      output = owner.postimageText
    } else {
      assert.ok(beforeBytes, owner.ownerPath + ': historical owner exists')
      output = beforeBytes.toString('utf8')
      for (const replacement of owner.replacements) {
        assert.equal(
          occurrenceCount(output, replacement.before),
          1,
          owner.ownerPath +
            ': feedback-survey replay anchor appears exactly once',
        )
        if (replacement.after) {
          assert.equal(
            occurrenceCount(output, replacement.after),
            0,
            owner.ownerPath +
              ': feedback-survey replay postimage is initially absent',
          )
        }
        output = output.replace(replacement.before, replacement.after)
      }
    }
    const outputBytes = Buffer.from(output)
    assert.deepEqual(
      descriptor(outputBytes),
      owner.postimage,
      owner.ownerPath + ': feedback-survey replay produces the pinned postimage',
    )
    planned.push({
      filename,
      outputBytes,
      ownerPath: owner.ownerPath,
      targetIndices: owner.targetIndices,
    })
  }
  for (const change of planned) {
    fs.mkdirSync(path.dirname(change.filename), { recursive: true })
    fs.writeFileSync(change.filename, change.outputBytes)
  }
  return {
    changes: planned.map(change => ({
      ownerPath: change.ownerPath,
      targetIndices: change.targetIndices,
    })),
    state: planned.length > 0 ? 'replayed' : 'already-replayed',
  }
}

export function replayTarget120MoreRightSessionRestorationSupplement({
  sourceRoot,
}) {
  const root = path.resolve(sourceRoot)
  const planned = []
  for (const owner of TARGET120_MORERIGHT_SESSION_RESTORATION_REPLAY.owners) {
    const filename = path.resolve(root, owner.ownerPath.slice(4))
    assert.ok(
      filename.startsWith(root + path.sep),
      'moreright-session replay remains under the selected source root',
    )
    assert.ok(
      fs.existsSync(filename),
      'moreright-session historical owner exists',
    )
    const beforeBytes = fs.readFileSync(filename)
    const beforeDescriptor = descriptor(beforeBytes)
    const downstreamReplOwner = TARGET120_REPL_SURVEY_STACK_REPLAY.owners.find(
      candidate => candidate.ownerPath === owner.ownerPath,
    )
    if (
      beforeDescriptor.bytes === owner.postimage.bytes &&
      beforeDescriptor.sha256 === owner.postimage.sha256
    ) {
      continue
    }
    if (
      downstreamReplOwner &&
      beforeDescriptor.bytes === downstreamReplOwner.postimage.bytes &&
      beforeDescriptor.sha256 === downstreamReplOwner.postimage.sha256
    ) {
      continue
    }
    assert.deepEqual(
      beforeDescriptor,
      owner.preimage,
      owner.ownerPath +
        ': moreright-session replay accepts only the pinned historical preimage',
    )
    let output = beforeBytes.toString('utf8')
    for (const replacement of owner.replacements) {
      assert.equal(
        occurrenceCount(output, replacement.before),
        1,
        owner.ownerPath +
          ': moreright-session replay anchor appears exactly once',
      )
      assert.equal(
        occurrenceCount(output, replacement.after),
        0,
        owner.ownerPath +
          ': moreright-session replay postimage is initially absent',
      )
      output = output.replace(replacement.before, replacement.after)
    }
    const outputBytes = Buffer.from(output)
    assert.deepEqual(
      descriptor(outputBytes),
      owner.postimage,
      owner.ownerPath +
        ': moreright-session replay produces the pinned postimage',
    )
    planned.push({ filename, outputBytes, ownerPath: owner.ownerPath })
  }
  for (const change of planned) fs.writeFileSync(change.filename, change.outputBytes)
  return {
    changes: planned.map(change => ({
      ownerPath: change.ownerPath,
      targetIndex: TARGET120_MORERIGHT_SESSION_RESTORATION_REPLAY.targetIndex,
    })),
    state: planned.length > 0 ? 'replayed' : 'already-replayed',
  }
}

export function replayTarget120ReplSurveyStackSupplement({ sourceRoot }) {
  const root = path.resolve(sourceRoot)
  const replay = TARGET120_REPL_SURVEY_STACK_REPLAY
  const planned = []
  for (const owner of replay.owners) {
    const filename = path.resolve(root, owner.ownerPath.slice(4))
    assert.ok(
      filename.startsWith(root + path.sep),
      'REPL survey-stack replay remains under the selected source root',
    )
    assert.ok(
      fs.existsSync(filename),
      owner.ownerPath + ': REPL survey-stack historical owner exists',
    )
    const beforeBytes = fs.readFileSync(filename)
    const beforeDescriptor = descriptor(beforeBytes)
    if (
      beforeDescriptor.bytes === owner.postimage.bytes &&
      beforeDescriptor.sha256 === owner.postimage.sha256
    ) {
      continue
    }
    assert.deepEqual(
      beforeDescriptor,
      owner.preimage,
      owner.ownerPath +
        ': REPL survey-stack replay accepts only the pinned historical preimage',
    )
    let output = beforeBytes.toString('utf8')
    for (const replacement of owner.replacements) {
      assert.equal(
        occurrenceCount(output, replacement.before),
        1,
        owner.ownerPath +
          ': REPL survey-stack replay anchor appears exactly once',
      )
      assert.equal(
        occurrenceCount(output, replacement.after),
        0,
        owner.ownerPath +
          ': REPL survey-stack replay postimage is initially absent',
      )
      output = output.replace(replacement.before, replacement.after)
    }
    const outputBytes = Buffer.from(output)
    assert.deepEqual(
      descriptor(outputBytes),
      owner.postimage,
      owner.ownerPath + ': REPL survey-stack replay produces the pinned postimage',
    )
    planned.push({ filename, outputBytes, ownerPath: owner.ownerPath })
  }
  for (const change of planned) fs.writeFileSync(change.filename, change.outputBytes)
  return {
    changes: planned.map(change => ({
      ownerPath: change.ownerPath,
      targetIndices: replay.targetIndices,
    })),
    state: planned.length > 0 ? 'replayed' : 'already-replayed',
  }
}

export function replayTarget120CliPrintControlTelemetrySupplement({
  sourceRoot,
}) {
  const root = path.resolve(sourceRoot)
  const replay = TARGET120_CLI_PRINT_CONTROL_TELEMETRY_REPLAY
  const filename = path.resolve(root, replay.ownerPath.slice(4))
  assert.ok(
    filename.startsWith(root + path.sep),
    'cli-print replay remains under the selected source root',
  )
  assert.ok(fs.existsSync(filename), 'cli-print historical owner exists')
  const beforeBytes = fs.readFileSync(filename)
  const beforeDescriptor = descriptor(beforeBytes)
  if (
    beforeDescriptor.bytes === replay.postimage.bytes &&
    beforeDescriptor.sha256 === replay.postimage.sha256
  ) {
    return { changes: [], state: 'already-replayed' }
  }
  assert.deepEqual(
    beforeDescriptor,
    replay.preimage,
    'cli-print replay accepts only the pinned historical preimage',
  )
  let output = beforeBytes.toString('utf8')
  for (const replacement of replay.replacements) {
    assert.equal(
      occurrenceCount(output, replacement.before),
      1,
      'cli-print replay anchor appears exactly once',
    )
    assert.equal(
      occurrenceCount(output, replacement.after),
      0,
      'cli-print replay postimage is initially absent',
    )
    output = output.replace(replacement.before, replacement.after)
  }
  const outputBytes = Buffer.from(output)
  assert.deepEqual(
    descriptor(outputBytes),
    replay.postimage,
    'cli-print replay produces the pinned postimage',
  )
  fs.writeFileSync(filename, outputBytes)
  return {
    changes: [
      {
        ownerPath: replay.ownerPath,
        targetIndices: replay.targetIndices,
      },
    ],
    state: 'replayed',
  }
}

export function replayTarget120TailSupplements({ sourceRoot }) {
  const results = [
    replayTarget120BootstrapStateSupplement({ sourceRoot }),
    replayTarget120ManagedAgentsSupplement({ sourceRoot }),
    replayTarget120SafeEnvPowershellSupplement({ sourceRoot }),
    replayTarget120ClassifierSurfaceTelemetrySupplement({ sourceRoot }),
    replayTarget120SkillChangeDetectorLifecycleSupplement({ sourceRoot }),
    replayTarget120OrphanPtySidecarSupplement({ sourceRoot }),
    replayTarget120DaemonStatusRecoveryTelemetrySupplement({ sourceRoot }),
    replayTarget120EnvironmentShellAnalyticsSupplement({ sourceRoot }),
    replayTarget120InternalNetworkProbeStubSupplement({ sourceRoot }),
    replayTarget120ExitWorktreeCwdOverrideSupplement({ sourceRoot }),
    replayTarget120CcrStatusCategoryGuardSupplement({ sourceRoot }),
    replayTarget120McpEffortFallbackSupplement({ sourceRoot }),
    replayTarget120UltrareviewNoopTaskRegistrySupplement({ sourceRoot }),
    replayTarget120FleetViewLiveRepositorySupplement({ sourceRoot }),
    replayTarget120FeedbackSurveyOptionsSupplement({ sourceRoot }),
    replayTarget120MoreRightSessionRestorationSupplement({ sourceRoot }),
    replayTarget120ReplSurveyStackSupplement({ sourceRoot }),
    replayTarget120CliPrintControlTelemetrySupplement({ sourceRoot }),
  ]
  const changes = results.flatMap(result => result.changes)
  return {
    changes,
    state: changes.length > 0 ? 'replayed' : 'already-replayed',
  }
}

function parseArguments(argv) {
  let sourceRoot
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--source-root') {
      sourceRoot = argv[++index]
      continue
    }
    throw new Error('Unknown argument: ' + argv[index])
  }
  assert.ok(sourceRoot, '--source-root is required')
  return { sourceRoot }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = replayTarget120TailSupplements(
    parseArguments(process.argv.slice(2)),
  )
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
}
