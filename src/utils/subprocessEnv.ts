import { isEnvDefinedFalsy, isEnvTruthy } from './envUtils.js'

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
let scrubEnabled: boolean | undefined
let scriptCaps: Record<string, number> | null | undefined
const scriptCallCounts = new Map<string, number>()

const MCP_ALLOWED_ENV_VARS =
  process.platform === 'win32'
    ? [
        'APPDATA',
        'HOMEDRIVE',
        'HOMEPATH',
        'LOCALAPPDATA',
        'PATH',
        'PROCESSOR_ARCHITECTURE',
        'SYSTEMDRIVE',
        'SYSTEMROOT',
        'TEMP',
        'USERNAME',
        'USERPROFILE',
        'PROGRAMFILES',
      ]
    : ['HOME', 'LOGNAME', 'PATH', 'SHELL', 'TERM', 'USER']

const JAVA_OPTION_UNSAFE_CHARS = /[ \t\n\v\f\r'"]/u

/**
 * Called from init.ts to wire up the proxy env function after the upstreamproxy
 * module has been lazily loaded. Must be called before any subprocess is spawned.
 */
export function registerUpstreamProxyEnvFn(
  fn: () => Record<string, string>,
): void {
  _getUpstreamProxyEnv = fn
}

function getUpstreamProxyEnv(): Record<string, string> {
  return _getUpstreamProxyEnv?.() ?? {}
}

type ParsedProxy = {
  host: string
  port: string
  user: string
  pass: string
}

function parseProxyUrl(value: string | undefined): ParsedProxy {
  if (!value) return { host: '', port: '', user: '', pass: '' }
  try {
    const parsed = new URL(value)
    if (!parsed.hostname) return { host: '', port: '', user: '', pass: '' }
    return {
      host:
        parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']')
          ? parsed.hostname.slice(1, -1)
          : parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? '443' : '80'),
      user: decodeURIComponent(parsed.username),
      pass: decodeURIComponent(parsed.password),
    }
  } catch {
    return { host: '', port: '', user: '', pass: '' }
  }
}

function toJavaNonProxyHosts(value: string): string {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => (item.startsWith('.') ? `*${item}` : item))
    .join('|')
}

function buildJavaProxyOptions(
  http: ParsedProxy,
  https: ParsedProxy,
  noProxy: string | undefined,
): string {
  const options: string[] = []
  const append = (name: string, value: string | undefined) => {
    if (value && !JAVA_OPTION_UNSAFE_CHARS.test(value)) {
      options.push(`-D${name}=${value}`)
    }
  }
  append('http.proxyHost', http.host)
  append('http.proxyPort', http.port)
  append('https.proxyHost', https.host)
  append('https.proxyPort', https.port)
  append('http.proxyUser', http.user)
  append('http.proxyPassword', http.pass)
  append('https.proxyUser', https.user)
  append('https.proxyPassword', https.pass)
  if (noProxy) append('http.nonProxyHosts', toJavaNonProxyHosts(noProxy))
  options.push('-Djdk.http.auth.tunneling.disabledSchemes=')
  options.push('-Djdk.http.auth.proxying.disabledSchemes=')
  return options.join(' ')
}

function getRemoteProxyEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const httpProxy =
    env.HTTP_PROXY || env.http_proxy || env.CLAUDE_CODE_HTTP_PROXY
  const httpsProxy =
    env.HTTPS_PROXY || env.https_proxy || env.CLAUDE_CODE_HTTPS_PROXY
  const noProxy = env.NO_PROXY || env.no_proxy
  if (!httpProxy && !httpsProxy) return {}

  const http = parseProxyUrl(httpProxy)
  let https = parseProxyUrl(httpsProxy)
  if (!https.host) https = http
  const result: NodeJS.ProcessEnv = {}
  const setIfAbsent = (name: string, value: string | undefined) => {
    if (value && env[name] === undefined) result[name] = value
  }

  setIfAbsent('YARN_HTTP_PROXY', httpProxy)
  setIfAbsent('YARN_HTTPS_PROXY', httpsProxy)
  setIfAbsent('npm_config_proxy', httpProxy)
  setIfAbsent('npm_config_https_proxy', httpsProxy)
  setIfAbsent('npm_config_noproxy', noProxy)
  setIfAbsent('GLOBAL_AGENT_HTTP_PROXY', httpProxy)
  setIfAbsent('GLOBAL_AGENT_HTTPS_PROXY', httpsProxy)
  setIfAbsent('GLOBAL_AGENT_NO_PROXY', noProxy)
  setIfAbsent('ELECTRON_GET_USE_PROXY', '1')
  setIfAbsent('DOCKER_HTTP_PROXY', httpProxy)
  setIfAbsent('DOCKER_HTTPS_PROXY', httpsProxy)
  if (https.host) {
    setIfAbsent('CLOUDSDK_PROXY_TYPE', 'http')
    setIfAbsent('CLOUDSDK_PROXY_ADDRESS', https.host)
    setIfAbsent('CLOUDSDK_PROXY_PORT', https.port)
    setIfAbsent('CLOUDSDK_PROXY_USERNAME', https.user)
    setIfAbsent('CLOUDSDK_PROXY_PASSWORD', https.pass)
  }
  setIfAbsent('FSSPEC_GCS', '{"session_kwargs": {"trust_env": true}}')
  if (https.host && !env.JAVA_TOOL_OPTIONS?.includes('-Dhttps.proxyHost=')) {
    const javaOptions = buildJavaProxyOptions(http, https, noProxy)
    result.JAVA_TOOL_OPTIONS = env.JAVA_TOOL_OPTIONS
      ? `${env.JAVA_TOOL_OPTIONS} ${javaOptions}`
      : javaOptions
  }
  return result
}

export function isSubprocessEnvScrubEnabled(): boolean {
  if (scrubEnabled === undefined) {
    scrubEnabled = isEnvTruthy(process.env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB)
  }
  return scrubEnabled
}

function shouldScrubSubprocessEnv(): boolean {
  if (isSubprocessEnvScrubEnabled()) return true
  if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB)) {
    return false
  }
  return process.env.CLAUDE_CODE_ENTRYPOINT === 'local-agent'
}

export function shouldUseMcpAllowlistEnv(): boolean {
  const setting = process.env.CLAUDE_CODE_MCP_ALLOWLIST_ENV
  if (isEnvTruthy(setting)) return true
  if (isEnvDefinedFalsy(setting)) return false
  return process.env.CLAUDE_CODE_ENTRYPOINT === 'local-agent'
}

function getMcpAllowedProcessEnv(): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {}
  for (const name of MCP_ALLOWED_ENV_VARS) {
    const value = process.env[name]
    if (value === undefined || value.startsWith('()')) continue
    result[name] = value
  }
  return result
}

export function mcpSubprocessEnv(): NodeJS.ProcessEnv {
  if (!shouldUseMcpAllowlistEnv()) return subprocessEnv()
  return { ...getMcpAllowedProcessEnv(), ...getUpstreamProxyEnv() }
}

function getScriptCaps(): Record<string, number> | null {
  if (scriptCaps !== undefined) return scriptCaps
  const raw = process.env.CLAUDE_CODE_SCRIPT_CAPS
  if (!raw) {
    scriptCaps = null
    return scriptCaps
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      scriptCaps = null
      return scriptCaps
    }
    const valid: Record<string, number> = {}
    for (const [script, cap] of Object.entries(parsed)) {
      if (
        typeof cap === 'number' &&
        Number.isFinite(cap) &&
        script.trim().length > 0
      ) {
        valid[script] = cap
      }
    }
    scriptCaps = Object.keys(valid).length > 0 ? valid : null
  } catch {
    scriptCaps = null
  }
  return scriptCaps
}

export function enforceScriptCaps(command: string): void {
  if (!isSubprocessEnvScrubEnabled()) return
  const caps = getScriptCaps()
  if (!caps) return
  for (const [script, cap] of Object.entries(caps)) {
    const occurrences = command.split(script).length - 1
    if (occurrences <= 0) continue
    const total = (scriptCallCounts.get(script) ?? 0) + occurrences
    scriptCallCounts.set(script, total)
    if (total > cap) {
      throw new Error(
        `Script call limit exceeded: ${script} has been called ${total} times (cap: ${cap}). This limit prevents data exfiltration via repeated write operations in untrusted-input workflows.`,
      )
    }
  }
}

export function subprocessEnv(): NodeJS.ProcessEnv {
  // CCR upstreamproxy: inject HTTPS_PROXY + CA bundle vars so curl/gh/python
  // in agent subprocesses route through the local relay. Returns {} when the
  // proxy is disabled or not registered (non-CCR), so this is a no-op outside
  // CCR containers.
  const proxyEnv = getUpstreamProxyEnv()
  const hasProxyEnv = Object.keys(proxyEnv).length > 0
  const remoteProxyEnv = isEnvTruthy(process.env.CLAUDE_CODE_REMOTE)
    ? getRemoteProxyEnv(
        hasProxyEnv ? { ...process.env, ...proxyEnv } : process.env,
      )
    : {}
  const hasRemoteProxyEnv = Object.keys(remoteProxyEnv).length > 0
  const shouldScrub = shouldScrubSubprocessEnv()
  const hasAuthMetadata =
    process.env.CLAUDE_CODE_OAUTH_TOKEN !== undefined ||
    process.env.CLAUDE_CODE_SUBSCRIPTION_TYPE !== undefined ||
    process.env.CLAUDE_CODE_RATE_LIMIT_TIER !== undefined
  const hasSessionMetadata =
    process.env.CLAUDE_CODE_SESSION_KIND !== undefined ||
    process.env.CLAUDE_BG_SOURCE !== undefined ||
    process.env.CLAUDE_BG_ISOLATION !== undefined ||
    process.env.CLAUDE_BG_BACKEND !== undefined ||
    process.env.CLAUDE_CODE_SESSION_NAME !== undefined

  if (
    !hasProxyEnv &&
    !hasRemoteProxyEnv &&
    !shouldScrub &&
    !hasSessionMetadata &&
    !hasAuthMetadata
  ) {
    return process.env
  }

  const env = { ...process.env, ...proxyEnv, ...remoteProxyEnv }
  delete env.CLAUDE_CODE_OAUTH_TOKEN
  delete env.CLAUDE_CODE_SUBSCRIPTION_TYPE
  delete env.CLAUDE_CODE_RATE_LIMIT_TIER
  delete env.CLAUDE_CODE_SESSION_KIND
  delete env.CLAUDE_BG_SOURCE
  delete env.CLAUDE_BG_ISOLATION
  delete env.CLAUDE_BG_BACKEND
  delete env.CLAUDE_CODE_SESSION_NAME
  delete env.CLAUDE_CODE_RESUME_INTERRUPTED_TURN

  if (!shouldScrub) return env
  for (const k of GHA_SUBPROCESS_SCRUB) {
    delete env[k]
    // GitHub Actions auto-creates INPUT_<NAME> for `with:` inputs, duplicating
    // secrets like INPUT_ANTHROPIC_API_KEY. No-op for vars that aren't action inputs.
    delete env[`INPUT_${k}`]
  }
  return env
}
