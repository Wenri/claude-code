import type { SandboxRuntimeConfig } from '@anthropic-ai/sandbox-runtime'
import { appendFile, mkdir, open } from 'fs/promises'
import { homedir, tmpdir } from 'os'
import { dirname, join, posix as path } from 'path'
import { getOriginalCwd } from '../bootstrap/state.js'
import { isEnvDefinedFalsy, isEnvTruthy } from './envUtils.js'
import { whichSync } from './which.js'

const ENV_FILES = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.env.test',
  '.env.test.local',
  '.env.production',
  '.env.production.local',
] as const

const ALLOW_WRITE_ROOTS = ['home', 'root', 'tmp', 'var', 'opt', 'run', 'mnt'].map(
  root => `/${root}`,
)

/**
 * Env vars to strip from subprocess environments when running inside GitHub
 * Actions. This prevents prompt-injection attacks from exfiltrating secrets
 * via shell expansion (e.g., ${ANTHROPIC_API_KEY}) in Bash tool commands.
 *
 * The parent claude process keeps these vars (needed for API calls, lazy
 * credential reads). Only child processes (bash, shell snapshot, MCP stdio, LSP, hooks) are scrubbed.
 *
 * GITHUB_TOKEN / GH_TOKEN are intentionally NOT scrubbed — wrapper scripts
 * (gh.sh) need them to call the GitHub API. That token is job-scoped and
 * expires when the workflow ends.
 */
const GHA_SUBPROCESS_SCRUB = [
  // Anthropic auth — claude re-reads these per-request, subprocesses don't need them
  'ANTHROPIC_API_KEY',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_FOUNDRY_API_KEY',
  'ANTHROPIC_AWS_API_KEY',
  'ANTHROPIC_BEDROCK_MANTLE_API_KEY',
  'ANTHROPIC_CUSTOM_HEADERS',

  // OTLP exporter headers — documented to carry Authorization=Bearer tokens
  // for monitoring backends; read in-process by OTEL SDK, subprocesses never need them
  'OTEL_EXPORTER_OTLP_HEADERS',
  'OTEL_EXPORTER_OTLP_LOGS_HEADERS',
  'OTEL_EXPORTER_OTLP_METRICS_HEADERS',
  'OTEL_EXPORTER_OTLP_TRACES_HEADERS',

  // Cloud provider creds — same pattern (lazy SDK reads)
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_BEARER_TOKEN_BEDROCK',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'AZURE_CLIENT_SECRET',
  'AZURE_CLIENT_CERTIFICATE_PATH',

  // GitHub Actions OIDC — consumed by the action's JS before claude spawns;
  // leaking these allows minting an App installation token → repo takeover
  'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
  'ACTIONS_ID_TOKEN_REQUEST_URL',

  // GitHub Actions artifact/cache API — cache poisoning → supply-chain pivot
  'ACTIONS_RUNTIME_TOKEN',
  'ACTIONS_RUNTIME_URL',

  // claude-code-action-specific duplicates — action JS consumes these during
  // prepare, before spawning claude. ALL_INPUTS contains anthropic_api_key as JSON.
  'ALL_INPUTS',
  'OVERRIDE_GITHUB_TOKEN',
  'DEFAULT_WORKFLOW_TOKEN',
  'SSH_SIGNING_KEY',
] as const

type ScrubPaths = {
  home: string
  originalCwd: string
  claudeConfigDir?: string
  runnerFileCommandsDir?: string
  workspace?: string
  pathDirs?: string[]
  GITHUB_ACTION_PATH?: string
  GITHUB_EVENT_PATH?: string
}

let scrubEnabled: boolean | undefined
let scrubSandboxAvailable: boolean | undefined
let scrubPaths: ScrubPaths | undefined
let parsedScriptCaps: Record<string, number> | null | undefined
const scriptCapCounts = new Map<string, number>()

/**
 * Whether the caller explicitly requested subprocess secret scrubbing.
 * The value is latched because changing the isolation boundary during a run
 * would let later commands observe a different environment than earlier ones.
 */
export function isScrubEnabled(): boolean {
  scrubEnabled ??= isEnvTruthy(
    process.env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB,
  )
  return scrubEnabled
}

function shouldScrubSubprocessEnvironment(): boolean {
  if (isScrubEnabled()) return true
  if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB)) {
    return false
  }
  return process.env.CLAUDE_CODE_ENTRYPOINT === 'local-agent'
}

export function isScrubSandboxAvailable(): boolean {
  scrubSandboxAvailable ??= whichSync('bwrap') !== null
  return scrubSandboxAvailable
}

function loadScriptCaps(): void {
  if (parsedScriptCaps !== undefined) return
  const raw = process.env.CLAUDE_CODE_SCRIPT_CAPS
  if (!raw) {
    parsedScriptCaps = null
    return
  }
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      parsedScriptCaps = null
      return
    }
    const valid = Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, number] =>
          entry[0].trim().length > 0 &&
          typeof entry[1] === 'number' &&
          Number.isFinite(entry[1]),
      ),
    )
    parsedScriptCaps = Object.keys(valid).length > 0 ? valid : null
  } catch {
    parsedScriptCaps = null
  }
}

/** Enforce cumulative textual call caps for isolated, untrusted workflows. */
export function enforceScriptCaps(commandText: string): void {
  if (!isScrubEnabled()) return
  loadScriptCaps()
  if (!parsedScriptCaps) return
  for (const [pattern, cap] of Object.entries(parsedScriptCaps)) {
    const occurrences = commandText.split(pattern).length - 1
    if (occurrences === 0) continue
    const count = (scriptCapCounts.get(pattern) ?? 0) + occurrences
    scriptCapCounts.set(pattern, count)
    if (count > cap) {
      throw new Error(
        `Script call limit exceeded: ${pattern} has been called ${count} times (cap: ${cap}). This limit prevents data exfiltration via repeated write operations in untrusted-input workflows.`,
      )
    }
  }
}

export function _resetScriptCapsForTesting(): void {
  scriptCapCounts.clear()
  parsedScriptCaps = undefined
}

export function _resetScrubLatchForTesting(): void {
  scrubEnabled = undefined
  scrubSandboxAvailable = undefined
  scrubPaths = undefined
  _resetScriptCapsForTesting()
}

export function _setScrubPathsLatchedForTesting(paths: ScrubPaths): void {
  scrubPaths = paths
}

/**
 * Validate bubblewrap and create safe mount points before an isolated local
 * agent can execute any user-controlled command.
 */
export async function assertScrubSandboxAvailable(): Promise<void> {
  if (!isScrubEnabled()) return

  const home = homedir()
  const originalCwd = getOriginalCwd()
  const runnerFileCommandsDir = process.env.GITHUB_ENV
    ? dirname(process.env.GITHUB_ENV)
    : undefined
  const workspace = process.env.GITHUB_WORKSPACE
  scrubSandboxAvailable = whichSync('bwrap') !== null
  scrubPaths = {
    home,
    originalCwd,
    claudeConfigDir: process.env.CLAUDE_CONFIG_DIR,
    runnerFileCommandsDir,
    workspace,
    GITHUB_ACTION_PATH: process.env.GITHUB_ACTION_PATH,
    GITHUB_EVENT_PATH: process.env.GITHUB_EVENT_PATH,
  }
  scrubPaths.pathDirs = (process.env.PATH ?? '')
    .split(':')
    .map(directory =>
      directory ? path.normalize(directory).replace(/\/+$/, '') : directory,
    )
    .filter(
      (directory): directory is string =>
        Boolean(directory) &&
        ALLOW_WRITE_ROOTS.some(root => directory.startsWith(`${root}/`)),
    )
  loadScriptCaps()

  if (!whichSync('bwrap')) {
    throw new Error(
      'bubblewrap is required for subprocess env scrubbing and isolation. Install with: sudo apt-get install -y bubblewrap, or set CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=0 to disable (loses subprocess isolation).',
    )
  }

  await mkdir(
    join(process.env.CLAUDE_CODE_TMPDIR || tmpdir(), `claude-${process.getuid?.() ?? 0}`),
    { recursive: true },
  ).catch(() => {})

  const mountPointFiles = [
    `${home}/.gitconfig`,
    `${home}/.bash_profile`,
    `${home}/.bashrc`,
    `${home}/.bash_aliases`,
    `${home}/.profile`,
    `${home}/.zshrc`,
    `${home}/.bunfig.toml`,
    `${home}/.netrc`,
    `${home}/.npmrc`,
    `${home}/.yarnrc`,
    `${home}/.yarnrc.yml`,
    `${originalCwd}/.npmrc`,
    `${originalCwd}/.yarnrc`,
    `${originalCwd}/.yarnrc.yml`,
    `${originalCwd}/bunfig.toml`,
    `${originalCwd}/package.json`,
    `${originalCwd}/.gitmodules`,
    `${originalCwd}/package-lock.json`,
    `${originalCwd}/yarn.lock`,
    `${originalCwd}/pnpm-lock.yaml`,
    '/tmp/inline-comments-buffer.jsonl',
    ...ENV_FILES.map(name => `${originalCwd}/${name}`),
  ]
  for (const filename of mountPointFiles) {
    try {
      await mkdir(dirname(filename), { recursive: true })
      await (await open(filename, 'a')).close()
    } catch {
      // The sandbox can still deny existing paths when a read-only mount point
      // cannot be prepared (for example, on a read-only checkout).
    }
  }

  for (const directory of [
    `${home}/.config/gh`,
    `${home}/.config/git`,
    `${home}/.config/pip`,
    `${home}/.pip`,
    `${originalCwd}/.claude/commands`,
    `${originalCwd}/.claude/agents`,
    `${originalCwd}/node_modules/.bin`,
    ...(runnerFileCommandsDir ? [runnerFileCommandsDir] : []),
    ...(scrubPaths.pathDirs ?? []),
  ]) {
    await mkdir(directory, { recursive: true }).catch(() => {})
  }

  if (workspace && path.resolve(workspace) !== path.resolve(originalCwd)) {
    await mkdir(`${workspace}/.git/hooks`).catch(() => {})
    await mkdir(`${workspace}/.git/modules`).catch(() => {})
    await mkdir(`${workspace}/.git/info`).catch(() => {})
    await mkdir(`${workspace}/.github`, { recursive: true }).catch(() => {})
    for (const filename of [
      `${workspace}/.git/config`,
      `${workspace}/.git/info/exclude`,
      `${workspace}/.gitmodules`,
    ]) {
      try {
        await (await open(filename, 'a')).close()
      } catch {
        // A read-only or non-git workspace does not need a writable stub.
      }
    }
  }

  const projectFiles = [
    'bunfig.toml',
    'package.json',
    '.npmrc',
    '.yarnrc',
    '.yarnrc.yml',
    '.gitmodules',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    ...ENV_FILES,
  ]
  await mkdir(`${originalCwd}/.git/info`).catch(() => {})
  await mkdir(`${originalCwd}/.git/modules`).catch(() => {})
  try {
    await appendFile(
      `${originalCwd}/.git/info/exclude`,
      `\n# claude-code scrub-mode stubs\n${projectFiles
        .map(filename => `/${filename}`)
        .join('\n')}\n`,
    )
  } catch {
    // Non-git and read-only directories do not need an exclude update.
  }
}

export function shouldUseMcpAllowlistEnv(): boolean {
  const value = process.env.CLAUDE_CODE_MCP_ALLOWLIST_ENV
  if (isEnvTruthy(value)) return true
  if (isEnvDefinedFalsy(value)) return false
  return process.env.CLAUDE_CODE_ENTRYPOINT === 'local-agent'
}

/** Extra filesystem restrictions applied to scrubbed subprocesses. */
export function scrubSandboxConfig(): Partial<SandboxRuntimeConfig> {
  const home = scrubPaths?.home ?? homedir()
  const cwd = scrubPaths?.originalCwd ?? getOriginalCwd()
  const actionPath =
    scrubPaths?.GITHUB_ACTION_PATH ?? process.env.GITHUB_ACTION_PATH
  const runnerFileCommandsDir =
    scrubPaths?.runnerFileCommandsDir ??
    (process.env.GITHUB_ENV ? dirname(process.env.GITHUB_ENV) : undefined)
  const workspace = scrubPaths?.workspace ?? process.env.GITHUB_WORKSPACE
  const workspaceDenyPaths =
    workspace && path.resolve(workspace) !== path.resolve(cwd)
      ? [
          `${workspace}/.git/hooks`,
          `${workspace}/.git/config`,
          `${workspace}/.git/modules`,
          `${workspace}/.git/info/exclude`,
          `${workspace}/.gitmodules`,
          `${workspace}/.github`,
        ]
      : []
  return {
    filesystem: {
      allowWrite: ALLOW_WRITE_ROOTS,
      denyRead: [
        '/run/docker.sock',
        '/run/containerd/containerd.sock',
        '/run/podman/podman.sock',
        '/run/buildkit/buildkitd.sock',
        '/run/dbus',
        '/run/user',
      ],
      denyWrite: [
        `${home}/.bash_profile`,
        `${home}/.bashrc`,
        `${home}/.bash_aliases`,
        `${home}/.bash_login`,
        `${home}/.bash_logout`,
        `${home}/.profile`,
        `${home}/.zshrc`,
        `${home}/.zprofile`,
        `${home}/.zshenv`,
        `${home}/.zlogin`,
        `${home}/.zlogout`,
        `${home}/.claude`,
        `${home}/.claude.json`,
        scrubPaths?.claudeConfigDir ?? process.env.CLAUDE_CONFIG_DIR,
        `${home}/.gitconfig`,
        `${home}/.config/git`,
        `${home}/.bunfig.toml`,
        `${cwd}/bunfig.toml`,
        `${cwd}/package.json`,
        ...ENV_FILES.map(name => `${cwd}/${name}`),
        `${home}/.npmrc`,
        `${cwd}/.npmrc`,
        `${home}/.yarnrc`,
        `${home}/.yarnrc.yml`,
        `${cwd}/.yarnrc`,
        `${cwd}/.yarnrc.yml`,
        `${home}/.config/pip`,
        `${home}/.pip`,
        `${cwd}/package-lock.json`,
        `${cwd}/yarn.lock`,
        `${cwd}/pnpm-lock.yaml`,
        `${cwd}/node_modules/.bin`,
        `${cwd}/.git/modules`,
        `${cwd}/scripts`,
        `${cwd}/.claude`,
        `${cwd}/.github`,
        `${home}/.local/bin`,
        `${home}/runners`,
        `${home}/actions-runner`,
        '/tmp/inline-comments-buffer.jsonl',
        ...(scrubPaths?.pathDirs ?? []),
        runnerFileCommandsDir,
        actionPath,
        actionPath?.includes('/_actions/')
          ? actionPath.slice(0, actionPath.indexOf('/_actions/') + 9)
          : undefined,
        scrubPaths?.GITHUB_EVENT_PATH ?? process.env.GITHUB_EVENT_PATH,
        `${home}/.config/gh`,
        `${home}/.netrc`,
        `${home}/.ssh`,
        `${cwd}/.git/hooks`,
        `${cwd}/.git/config`,
        `${cwd}/.gitmodules`,
        `${cwd}/.git/info/exclude`,
        ...workspaceDenyPaths,
      ].filter((path): path is string => !!path),
    },
  }
}

/**
 * Returns a copy of process.env with sensitive secrets stripped, for use when
 * spawning subprocesses (Bash tool, shell snapshot, MCP stdio servers, LSP
 * servers, shell hooks).
 *
 * Gated on CLAUDE_CODE_SUBPROCESS_ENV_SCRUB. claude-code-action sets this
 * automatically when `allowed_non_write_users` is configured — the flag that
 * exposes a workflow to untrusted content (prompt injection surface).
 */
// Registered by init.ts after the upstreamproxy module is dynamically imported
// in CCR sessions. Stays undefined in non-CCR startups so we never pull in the
// upstreamproxy module graph (upstreamproxy.ts + relay.ts) via a static import.
let _getUpstreamProxyEnv: (() => Record<string, string>) | undefined

/**
 * Called from init.ts to wire up the proxy env function after the upstreamproxy
 * module has been lazily loaded. Must be called before any subprocess is spawned.
 */
export function registerUpstreamProxyEnvFn(
  fn: () => Record<string, string>,
): void {
  _getUpstreamProxyEnv = fn
}

export function upstreamProxyEnv(): Record<string, string> {
  return _getUpstreamProxyEnv?.() ?? {}
}

export function subprocessEnv(): NodeJS.ProcessEnv {
  // CCR upstreamproxy: inject HTTPS_PROXY + CA bundle vars so curl/gh/python
  // in agent subprocesses route through the local relay. Returns {} when the
  // proxy is disabled or not registered (non-CCR), so this is a no-op outside
  // CCR containers.
  const proxyEnv = upstreamProxyEnv()

  if (!shouldScrubSubprocessEnvironment()) {
    return Object.keys(proxyEnv).length > 0
      ? { ...process.env, ...proxyEnv }
      : process.env
  }
  const env = { ...process.env, ...proxyEnv }
  for (const k of GHA_SUBPROCESS_SCRUB) {
    delete env[k]
    // GitHub Actions auto-creates INPUT_<NAME> for `with:` inputs, duplicating
    // secrets like INPUT_ANTHROPIC_API_KEY. No-op for vars that aren't action inputs.
    delete env[`INPUT_${k}`]
  }
  return env
}
