import { readFileSync } from 'fs'
import { mkdir, open, readFile, realpath, rename, stat, unlink } from 'fs/promises'
import { dirname, join } from 'path'
import { logEvent } from '../analytics/index.js'
import { logForDebugging } from '../../utils/debug.js'
import { errorMessage } from '../../utils/errors.js'
import * as lockfile from '../../utils/lockfile.js'
import { sleep } from '../../utils/sleep.js'

export const OAUTH_API_BETA_HEADER = 'oauth-2025-04-20'
export const FEDERATION_BETA_HEADER = 'oidc-federation-2026-04-01'

const TOKEN_ENDPOINT = '/v1/oauth/token'
const CREDENTIALS_VERSION = '1.0'
const MAX_LOCK_RETRIES = 5
const PROFILE_NAME = /^[A-Za-z0-9_.-]+$/
const EARLY_REFRESH_SECONDS = 30
const ADVISORY_REFRESH_SECONDS = 120
const ADVISORY_ERROR_BACKOFF_SECONDS = 5

type AuthType = 'oidc_federation' | 'user_oauth'
type IdentityToken = { source: 'file'; path: string }

export type WorkloadIdentityConfig = {
  organization_id?: string
  workspace_id?: string
  base_url?: string
  authentication:
    | {
        type: 'oidc_federation'
        federation_rule_id: string
        service_account_id?: string
        identity_token?: IdentityToken
        scope?: string
        credentials_path?: string
      }
    | {
        type: 'user_oauth'
        client_id?: string
        scope?: string
        credentials_path?: string
      }
}

type StoredCredentials = {
  version?: string
  type?: string
  access_token?: string
  refresh_token?: string
  expires_at?: number | null
  [key: string]: unknown
}

export type Token = { token: string; expiresAt: number | null }
export type TokenProvider = (options?: {
  forceRefresh?: boolean
}) => Promise<Token>

export type ResolvedCredentials = {
  provider: TokenProvider
  extraHeaders: Record<string, string>
  baseURL?: string
}

export type WIFPrecedenceSource =
  | 'profile-explicit'
  | 'env-quad'
  | 'profile-implicit'
  | null

export class WorkloadIdentityError extends Error {
  readonly statusCode: number | null
  readonly body: unknown
  readonly requestId: string | null

  constructor(
    message: string,
    statusCode: number | null = null,
    body: unknown = null,
    requestId: string | null = null,
  ) {
    super(message)
    this.name = 'WorkloadIdentityError'
    this.statusCode = statusCode
    this.body = body
    this.requestId = requestId
  }
}

export class TokenCache {
  private cached: Token | null = null
  private pendingRefresh: Promise<Token> | null = null
  private nextForce = false
  private lastAdvisoryError = 0

  constructor(
    private readonly provider: TokenProvider,
    private readonly onAdvisoryRefreshError?: (error: unknown) => void,
  ) {}

  async getToken(): Promise<string> {
    const force = this.nextForce
    this.nextForce = false
    const cached = this.cached
    if (force || cached === null) return (await this.refresh(force)).token
    if (cached.expiresAt === null) return cached.token
    const expiresIn = cached.expiresAt - nowSeconds()
    if (expiresIn > ADVISORY_REFRESH_SECONDS) return cached.token
    if (expiresIn > EARLY_REFRESH_SECONDS) {
      this.backgroundRefresh()
      return cached.token
    }
    return (await this.refresh()).token
  }

  invalidate(): void {
    this.cached = null
    this.nextForce = true
  }

  private refresh(force = false): Promise<Token> {
    if (this.pendingRefresh && !force) return this.pendingRefresh
    return this.doRefresh(force)
  }

  private backgroundRefresh(): void {
    if (this.pendingRefresh) return
    if (nowSeconds() - this.lastAdvisoryError < ADVISORY_ERROR_BACKOFF_SECONDS)
      return
    this.doRefresh().catch(error => {
      this.lastAdvisoryError = nowSeconds()
      this.onAdvisoryRefreshError?.(error)
    })
  }

  private doRefresh(force = false): Promise<Token> {
    this.pendingRefresh = this.provider(
      force ? { forceRefresh: true } : undefined,
    ).then(
      token => {
        this.cached = token
        this.pendingRefresh = null
        return token
      },
      error => {
        this.pendingRefresh = null
        throw error
      },
    )
    return this.pendingRefresh
  }
}

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function validateProfileName(profile: string): void {
  if (!profile) throw new Error('profile name is empty')
  if (profile === '.' || profile === '..')
    throw new Error(`profile name "${profile}" is not allowed`)
  if (profile.includes('/') || profile.includes('\\'))
    throw new Error(
      `profile name "${profile}" must not contain path separators`,
    )
  if (!PROFILE_NAME.test(profile))
    throw new Error(
      `profile name "${profile}" contains disallowed characters (allowed: letters, digits, '_', '.', '-')`,
    )
}

export function getAnthropicConfigDir(): string | null {
  const configured = env('ANTHROPIC_CONFIG_DIR')
  if (configured) return configured
  if (process.platform === 'win32') {
    const appData = env('APPDATA')
    if (appData) return join(appData, 'Anthropic')
    const userProfile = env('USERPROFILE')
    return userProfile
      ? join(userProfile, 'AppData', 'Roaming', 'Anthropic')
      : null
  }
  const xdg = env('XDG_CONFIG_HOME')
  if (xdg) return join(xdg, 'anthropic')
  const home = env('HOME')
  return home ? join(home, '.config', 'anthropic') : null
}

function readFileSyncOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

function getActiveProfile(configDir: string): string {
  return readFileSyncOrNull(join(configDir, 'active_config'))?.trim() || 'default'
}

function getProfileAuthType(path: string): AuthType | null {
  const raw = readFileSyncOrNull(path)
  if (raw === null) return null
  try {
    const type = (JSON.parse(raw) as { authentication?: { type?: string } })
      .authentication?.type
    return type === 'oidc_federation' || type === 'user_oauth' ? type : null
  } catch {
    return null
  }
}

let precedenceCache: WIFPrecedenceSource | undefined

export function getWIFPrecedenceSource(): WIFPrecedenceSource {
  if (precedenceCache !== undefined) return precedenceCache
  const configDir = getAnthropicConfigDir()
  const explicitProfile = env('ANTHROPIC_PROFILE')
  if (explicitProfile) {
    if (configDir === null) return (precedenceCache = null)
    const authType = getProfileAuthType(
      join(configDir, 'configs', `${explicitProfile}.json`),
    )
    return (precedenceCache =
      authType === 'oidc_federation' || authType === 'user_oauth'
        ? 'profile-explicit'
        : null)
  }
  if (
    env('ANTHROPIC_FEDERATION_RULE_ID') &&
    env('ANTHROPIC_ORGANIZATION_ID')
  ) {
    return (precedenceCache = 'env-quad')
  }
  if (configDir !== null) {
    const profile = getActiveProfile(configDir)
    const authType = getProfileAuthType(
      join(configDir, 'configs', `${profile}.json`),
    )
    if (authType === 'oidc_federation' || authType === 'user_oauth')
      return (precedenceCache = 'profile-implicit')
  }
  return (precedenceCache = null)
}

export function isWIFActive(): boolean {
  return getWIFPrecedenceSource() !== null
}

export function getWIFAuthType(): AuthType | null {
  const source = getWIFPrecedenceSource()
  if (source === null) return null
  if (source === 'env-quad') return 'oidc_federation'
  const configDir = getAnthropicConfigDir()
  if (configDir === null) return null
  const profile =
    source === 'profile-explicit'
      ? env('ANTHROPIC_PROFILE') || 'default'
      : getActiveProfile(configDir)
  return getProfileAuthType(join(configDir, 'configs', `${profile}.json`))
}

function redactIdentifier(value: string): string {
  return value.length <= 6 ? value : `…${value.slice(-6)}`
}

export function getWIFStatusLine(): string {
  const source = getWIFPrecedenceSource()
  if (source === 'env-quad') {
    return `env-quad · org ${redactIdentifier(process.env.ANTHROPIC_ORGANIZATION_ID ?? '')} · rule ${redactIdentifier(process.env.ANTHROPIC_FEDERATION_RULE_ID ?? '')}`
  }
  if (source === 'profile-explicit' || source === 'profile-implicit') {
    const configDir = getAnthropicConfigDir()
    const profile =
      configDir === null
        ? 'default'
        : source === 'profile-explicit'
          ? env('ANTHROPIC_PROFILE') || 'default'
          : getActiveProfile(configDir)
    return `credentials-file · ${getWIFAuthType() ?? 'unknown'} · profile ${profile}`
  }
  return 'inactive'
}

async function getSelectedProfile(): Promise<string | null> {
  const configDir = getAnthropicConfigDir()
  if (!configDir) return null
  return env('ANTHROPIC_PROFILE') || getActiveProfile(configDir)
}

export async function loadConfig(): Promise<WorkloadIdentityConfig | null> {
  const configDir = getAnthropicConfigDir()
  if (configDir === null) return null
  const profile = await getSelectedProfile()
  if (profile === null) return null
  validateProfileName(profile)
  const path = join(configDir, 'configs', `${profile}.json`)
  let raw: string | null
  try {
    raw = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw new Error(`failed to read config file ${path}: ${error}`)
    raw = null
  }
  if (raw === null) return getEnvironmentConfig()
  let config: WorkloadIdentityConfig
  try {
    config = JSON.parse(raw) as WorkloadIdentityConfig
  } catch (error) {
    throw new Error(`failed to parse config file ${path}: ${error}`)
  }
  if (!config.authentication)
    throw new Error(`config file ${path} is missing "authentication"`)
  const type = config.authentication.type
  if (type !== 'oidc_federation' && type !== 'user_oauth')
    throw new Error(
      `authentication.type "${String(type)}" is not a known authentication type`,
    )
  config.organization_id ??= env('ANTHROPIC_ORGANIZATION_ID')
  config.base_url ??= env('ANTHROPIC_BASE_URL')
  config.authentication.scope ??= env('ANTHROPIC_SCOPE')
  if (config.authentication.type === 'oidc_federation') {
    if (!config.authentication.identity_token) {
      const identityPath = env('ANTHROPIC_IDENTITY_TOKEN_FILE')
      if (identityPath)
        config.authentication.identity_token = {
          source: 'file',
          path: identityPath,
        }
    }
    config.authentication.federation_rule_id ||= env(
      'ANTHROPIC_FEDERATION_RULE_ID',
    ) ?? ''
    config.authentication.service_account_id ??= env(
      'ANTHROPIC_SERVICE_ACCOUNT_ID',
    )
  }
  return config
}

function getEnvironmentConfig(): WorkloadIdentityConfig | null {
  const federationRuleId = env('ANTHROPIC_FEDERATION_RULE_ID')
  const organizationId = env('ANTHROPIC_ORGANIZATION_ID')
  if (!federationRuleId || !organizationId) return null
  const identityPath = env('ANTHROPIC_IDENTITY_TOKEN_FILE')
  return {
    organization_id: organizationId,
    base_url: env('ANTHROPIC_BASE_URL'),
    authentication: {
      type: 'oidc_federation',
      federation_rule_id: federationRuleId,
      service_account_id: env('ANTHROPIC_SERVICE_ACCOUNT_ID'),
      identity_token: identityPath
        ? { source: 'file', path: identityPath }
        : undefined,
      scope: env('ANTHROPIC_SCOPE'),
    },
  }
}

export async function getCredentialsPath(
  config?: WorkloadIdentityConfig | null,
): Promise<string | null> {
  if (config?.authentication.credentials_path)
    return config.authentication.credentials_path
  const configDir = getAnthropicConfigDir()
  const profile = await getSelectedProfile()
  return configDir && profile
    ? join(configDir, 'credentials', `${profile}.json`)
    : null
}

export async function loadCredentials(): Promise<StoredCredentials | null> {
  const config = await loadConfig()
  const path = await getCredentialsPath(config)
  if (!path) return null
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new Error(`failed to read credentials file ${path}: ${error}`)
  }
  let credentials: StoredCredentials
  try {
    credentials = JSON.parse(raw) as StoredCredentials
  } catch (error) {
    throw new Error(`failed to parse credentials file ${path}: ${error}`)
  }
  if (credentials.type && credentials.type !== 'oauth_token')
    throw new Error(
      `credentials file ${path} has unsupported type "${credentials.type}" (want "oauth_token")`,
    )
  return credentials
}

function ensureSecureTokenEndpoint(baseURL: string): void {
  let url: URL
  try {
    url = new URL(baseURL)
  } catch (error) {
    throw new WorkloadIdentityError(
      `Invalid token endpoint base URL "${baseURL}": ${error}`,
    )
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' &&
      (host === 'localhost' || host === '127.0.0.1' || host === '::1'))
  ) {
    throw new WorkloadIdentityError(
      `Refusing to send credential over non-https token endpoint "${baseURL}"`,
    )
  }
}

function safeErrorBody(value: unknown): unknown {
  const allowed = new Set(['error', 'error_description', 'error_uri'])
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    try {
      return JSON.stringify(safeErrorBody(JSON.parse(value)))
    } catch {
      return value.length <= 2_000
        ? value
        : `${value.slice(0, 2_000)}... <${value.length - 2_000} more chars>`
    }
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value).filter(([key]) => allowed.has(key)),
    )
  }
  return null
}

const MAX_TOKEN_RESPONSE_BYTES = 1024 * 1024

async function readBoundedResponseText(response: Response): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (total + value.byteLength > MAX_TOKEN_RESPONSE_BYTES) {
      const remaining = MAX_TOKEN_RESPONSE_BYTES - total
      if (remaining > 0) {
        chunks.push(value.subarray(0, remaining))
        total += remaining
      }
      await reader.cancel()
      break
    }
    chunks.push(value)
    total += value.byteLength
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8').decode(bytes)
}

async function parseTokenResponse(
  response: Response,
  requestId: string | null,
): Promise<Record<string, unknown>> {
  const raw = await readBoundedResponseText(response)
  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw) as Record<string, unknown>
  } catch {
    throw new WorkloadIdentityError(
      `Token endpoint returned non-JSON response (status ${response.status})`,
      response.status,
      safeErrorBody(raw),
      requestId,
    )
  }
  if (!body.access_token)
    throw new WorkloadIdentityError(
      `Token endpoint response missing access_token: ${JSON.stringify(safeErrorBody(body))}`,
      response.status,
      safeErrorBody(body),
      requestId,
    )
  if (
    body.token_type &&
    String(body.token_type).toLowerCase() !== 'bearer'
  ) {
    throw new WorkloadIdentityError(
      `Token endpoint response: unsupported token_type "${String(body.token_type)}" (want Bearer)`,
      response.status,
      safeErrorBody(body),
      requestId,
    )
  }
  return body
}

async function verifyCredentialsFile(
  path: string,
  warn: (warning: string) => void = () => {},
): Promise<void> {
  let resolved = path
  let info
  try {
    resolved = await realpath(path)
    info = await stat(resolved)
  } catch {
    return
  }
  const mode = info.mode & 0o777
  if (mode & 0o022)
    throw new WorkloadIdentityError(
      `Credentials file at ${resolved} is group/world-writable (mode 0o${mode.toString(8)}); this allows other local users to plant tokens. Run \`chmod 600 ${resolved}\`.`,
    )
  if (mode & 0o044)
    throw new WorkloadIdentityError(
      `Credentials file at ${resolved} is group/world-readable (mode 0o${mode.toString(8)}); run \`chmod 600 ${resolved}\` before retrying.`,
    )
  if (typeof process.getuid === 'function' && info.uid !== process.getuid())
    warn(
      `credentials file at ${resolved} is owned by uid ${info.uid} (current process uid ${process.getuid()}); verify this is intentional.`,
    )
}

async function atomicWriteCredentials(
  path: string,
  credentials: StoredCredentials,
): Promise<void> {
  const directory = dirname(path)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const temp = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
  try {
    const handle = await open(temp, 'w', 0o600)
    try {
      await handle.writeFile(JSON.stringify(credentials, null, 2))
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temp, path)
  } catch (error) {
    await unlink(temp).catch(() => {})
    throw error
  }
  try {
    const handle = await open(directory, 'r')
    try {
      await handle.sync()
    } finally {
      await handle.close()
    }
  } catch {}
}

function identityTokenProvider(
  authentication: Extract<
    WorkloadIdentityConfig['authentication'],
    { type: 'oidc_federation' }
  >,
): (() => Promise<string>) | null {
  const configured = authentication.identity_token
  if (configured) {
    if (configured.source !== 'file')
      throw new WorkloadIdentityError(
        `identity_token.source "${String(configured.source)}" is not supported by this SDK version (only "file")`,
      )
    if (!configured.path)
      throw new WorkloadIdentityError(
        'identity_token.source "file" requires a non-empty path',
      )
    return async () => {
      let value: string
      try {
        value = await readFile(configured.path, 'utf8')
      } catch (error) {
        throw new WorkloadIdentityError(
          `Failed to read identity token file at ${configured.path}: ${error}`,
        )
      }
      const token = value.trim()
      if (!token)
        throw new WorkloadIdentityError(
          `Identity token file at ${configured.path} is empty`,
        )
      return token
    }
  }
  const path = env('ANTHROPIC_IDENTITY_TOKEN_FILE')
  if (path)
    return identityTokenProvider({ ...authentication, identity_token: { source: 'file', path } })
  const value = env('ANTHROPIC_IDENTITY_TOKEN')
  return value ? async () => value : null
}

type ResolverOptions = {
  baseURL: string
  fetch: typeof fetch
  userAgent?: string
  onSafetyWarning?: (warning: string) => void
  onCacheWriteError?: (error: unknown) => void
}

function createFederationProvider(
  config: WorkloadIdentityConfig,
  options: ResolverOptions,
): TokenProvider {
  if (config.authentication.type !== 'oidc_federation')
    throw new WorkloadIdentityError('expected oidc_federation config')
  const auth = config.authentication
  const getIdentityToken = identityTokenProvider(auth)
  if (!getIdentityToken)
    throw new WorkloadIdentityError(
      'oidc_federation config requires an identity token (set authentication.identity_token, ANTHROPIC_IDENTITY_TOKEN_FILE, or ANTHROPIC_IDENTITY_TOKEN)',
    )
  if (!auth.federation_rule_id)
    throw new WorkloadIdentityError(
      "oidc_federation config requires 'federation_rule_id'. Set it in authentication.federation_rule_id in your profile, or via ANTHROPIC_FEDERATION_RULE_ID (profile takes precedence).",
    )
  if (!config.organization_id)
    throw new WorkloadIdentityError(
      'oidc_federation config requires organization_id (set ANTHROPIC_ORGANIZATION_ID or config.organization_id)',
    )
  return async () => {
    ensureSecureTokenEndpoint(options.baseURL)
    const assertion = await getIdentityToken()
    if (assertion.length > 16_384)
      throw new WorkloadIdentityError(
        `Identity token is ${Math.ceil(assertion.length / 1024)} KiB, exceeds the 16 KiB assertion limit`,
      )
    const body: Record<string, string> = {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
      federation_rule_id: auth.federation_rule_id,
      organization_id: config.organization_id!,
    }
    if (auth.service_account_id)
      body.service_account_id = auth.service_account_id
    const endpoint = `${options.baseURL}${TOKEN_ENDPOINT}`
    let response: Response
    try {
      response = await options.fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-beta': `${OAUTH_API_BETA_HEADER},${FEDERATION_BETA_HEADER}`,
          'User-Agent':
            options.userAgent ||
            'anthropic-sdk-typescript/vendored oidcFederationProvider',
        },
        body: JSON.stringify(body),
      })
    } catch (error) {
      throw new WorkloadIdentityError(
        `Failed to reach token endpoint ${endpoint}: ${error}`,
      )
    }
    const requestId = response.headers.get('Request-Id')
    if (!response.ok) {
      const raw = await response.text().catch(() => '')
      const safe = safeErrorBody(raw)
      throw new WorkloadIdentityError(
        `Token exchange failed with status ${response.status}${requestId ? ` (request-id ${requestId})` : ''}: ${String(safe)}`,
        response.status,
        safe,
        requestId,
      )
    }
    const token = await parseTokenResponse(response, requestId)
    const expiresIn = Number(token.expires_in)
    if (!Number.isFinite(expiresIn))
      throw new WorkloadIdentityError(
        `Token endpoint response missing required fields: ${JSON.stringify(safeErrorBody(token))}`,
        response.status,
        safeErrorBody(token),
        requestId,
      )
    return {
      token: String(token.access_token),
      expiresAt: nowSeconds() + expiresIn,
    }
  }
}

function createUserOAuthProvider(
  config: WorkloadIdentityConfig,
  credentialsPath: string,
  options: ResolverOptions,
): TokenProvider {
  if (config.authentication.type !== 'user_oauth')
    throw new WorkloadIdentityError('expected user_oauth config')
  return async refreshOptions => {
    await verifyCredentialsFile(
      credentialsPath,
      options.onSafetyWarning,
    )
    let raw: string
    try {
      raw = await readFile(credentialsPath, 'utf8')
    } catch (error) {
      throw new WorkloadIdentityError(
        `Credentials file not found at ${credentialsPath}: ${error}`,
      )
    }
    let credentials: StoredCredentials
    try {
      credentials = JSON.parse(raw) as StoredCredentials
    } catch (error) {
      throw new WorkloadIdentityError(
        `Credentials file at ${credentialsPath} is not valid JSON: ${error}`,
      )
    }
    const accessToken = credentials.access_token
    if (!accessToken)
      throw new WorkloadIdentityError(
        `Credentials file at ${credentialsPath} must include 'access_token'`,
      )
    const expiresAt = credentials.expires_at
    if (
      !refreshOptions?.forceRefresh &&
      (expiresAt == null || nowSeconds() < expiresAt - EARLY_REFRESH_SECONDS)
    ) {
      return { token: accessToken, expiresAt: expiresAt ?? null }
    }
    const refreshToken = credentials.refresh_token
    const clientId = config.authentication.client_id
    if (!clientId || !refreshToken)
      throw new WorkloadIdentityError(
        `Access token at ${credentialsPath} has expired and no refresh is available (client_id ${clientId ? 'set' : 'empty'}, refresh_token ${refreshToken ? 'set' : 'empty'})`,
      )
    ensureSecureTokenEndpoint(options.baseURL)
    const endpoint = `${options.baseURL}${TOKEN_ENDPOINT}`
    let response: Response
    try {
      response = await options.fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-beta': OAUTH_API_BETA_HEADER,
          'User-Agent':
            options.userAgent ||
            'anthropic-sdk-typescript/vendored userOAuthProvider',
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: clientId,
        }),
      })
    } catch (error) {
      throw new WorkloadIdentityError(
        `User OAuth refresh failed to reach token endpoint: ${error}`,
      )
    }
    const requestId = response.headers.get('Request-Id')
    if (!response.ok) {
      const rawError = await response.text().catch(() => '')
      throw new WorkloadIdentityError(
        `User OAuth refresh failed (HTTP ${response.status}): ${String(safeErrorBody(rawError))}`,
        response.status,
        safeErrorBody(rawError),
        requestId,
      )
    }
    const token = await parseTokenResponse(response, requestId)
    const expiresIn = Number(token.expires_in)
    if (!Number.isFinite(expiresIn))
      throw new WorkloadIdentityError(
        `User OAuth refresh response missing or invalid expires_in: ${JSON.stringify(safeErrorBody(token))}`,
        response.status,
        safeErrorBody(token),
        requestId,
      )
    const nextExpiresAt = nowSeconds() + expiresIn
    await atomicWriteCredentials(credentialsPath, {
      ...credentials,
      version: CREDENTIALS_VERSION,
      type: 'oauth_token',
      access_token: String(token.access_token),
      expires_at: nextExpiresAt,
      refresh_token: String(token.refresh_token || refreshToken),
    })
    return { token: String(token.access_token), expiresAt: nextExpiresAt }
  }
}

function withCredentialCache(
  provider: TokenProvider,
  path: string,
  onCacheWriteError?: (error: unknown) => void,
  onSafetyWarning?: (warning: string) => void,
): TokenProvider {
  return async options => {
    await verifyCredentialsFile(path, onSafetyWarning)
    let stored: StoredCredentials | undefined
    try {
      stored = JSON.parse(await readFile(path, 'utf8')) as StoredCredentials
      if (stored.access_token && !options?.forceRefresh) {
        const expiresAt = stored.expires_at
        if (
          expiresAt == null ||
          nowSeconds() < expiresAt - EARLY_REFRESH_SECONDS
        ) {
          return {
            token: stored.access_token,
            expiresAt: expiresAt ?? null,
          }
        }
      }
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== 'ENOENT' &&
        !(error instanceof SyntaxError)
      )
        onCacheWriteError?.(error)
    }
    const token = await provider(options)
    try {
      await atomicWriteCredentials(path, {
        ...(stored ?? {}),
        version: CREDENTIALS_VERSION,
        type: 'oauth_token',
        access_token: token.token,
        expires_at: token.expiresAt,
      })
    } catch (error) {
      onCacheWriteError?.(error)
    }
    return token
  }
}

export function resolveCredentialsFromConfig(
  config: WorkloadIdentityConfig,
  options: ResolverOptions,
): ResolvedCredentials {
  const credentialsPath = config.authentication.credentials_path ?? null
  const baseURL = (config.base_url || options.baseURL).replace(/\/+$/, '')
  const resolvedOptions = { ...options, baseURL }
  let provider: TokenProvider
  if (config.authentication.type === 'oidc_federation') {
    provider = createFederationProvider(config, resolvedOptions)
    if (credentialsPath)
      provider = withCredentialCache(
        provider,
        credentialsPath,
        options.onCacheWriteError,
        options.onSafetyWarning,
      )
  } else if (config.authentication.type === 'user_oauth') {
    if (!credentialsPath)
      throw new WorkloadIdentityError(
        'user_oauth config requires authentication.credentials_path (or load via a profile so it defaults to <config_dir>/credentials/<profile>.json)',
      )
    provider = createUserOAuthProvider(config, credentialsPath, resolvedOptions)
  } else {
    const type = (config.authentication as { type: string }).type
    throw new WorkloadIdentityError(
      `authentication.type "${type}" is not a known authentication type`,
    )
  }
  const extraHeaders: Record<string, string> = {}
  if (config.workspace_id && config.authentication.type === 'user_oauth')
    extraHeaders['anthropic-workspace-id'] = config.workspace_id
  return { provider, extraHeaders, baseURL: config.base_url || undefined }
}

export async function defaultCredentials(
  options: ResolverOptions,
): Promise<ResolvedCredentials | null> {
  const config = await loadConfig()
  if (!config) return null
  const credentialsPath = await getCredentialsPath(config)
  const withPath = config.authentication.credentials_path
    ? config
    : {
        ...config,
        authentication: {
          ...config.authentication,
          credentials_path: credentialsPath ?? undefined,
        },
      }
  return resolveCredentialsFromConfig(withPath, options)
}

export function withCredentialsLock(
  provider: TokenProvider,
  credentialsPath: string,
): TokenProvider {
  return async options => {
    const release = await acquireCredentialsLock(dirname(credentialsPath))
    try {
      logEvent('tengu_wif_user_oauth_lock_acquired', {})
      return await provider(options)
    } finally {
      logEvent('tengu_wif_user_oauth_lock_released', {})
      try {
        await release()
      } catch (error) {
        logForDebugging(errorMessage(error), { level: 'error' })
      }
    }
  }
}

async function acquireCredentialsLock(
  directory: string,
): Promise<() => Promise<void>> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await lockfile.lock(directory, {
        onCompromised: error =>
          logForDebugging(errorMessage(error), { level: 'error' }),
      })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ELOCKED') throw error
      if (attempt >= MAX_LOCK_RETRIES) {
        logEvent('tengu_wif_user_oauth_lock_retry_limit', { attempt })
        throw new WorkloadIdentityError(
          `Could not acquire credentials lock at ${directory} after ${MAX_LOCK_RETRIES} retries`,
        )
      }
      logEvent('tengu_wif_user_oauth_lock_retry', { attempt })
      await sleep(1_000 + Math.random() * 1_000)
    }
  }
}

let credentialsPromise: Promise<ResolvedCredentials | null> | undefined
let tokenCachePromise: Promise<TokenCache | null> | undefined

export function getWIFCredentials(): Promise<ResolvedCredentials | null> {
  if (credentialsPromise === undefined) {
    credentialsPromise = (async () => {
      const config =
        getWIFPrecedenceSource() === 'env-quad'
          ? getEnvironmentConfig()
          : await loadConfig()
      if (config === null) return null
      const credentialsPath =
        getWIFPrecedenceSource() === 'env-quad'
          ? null
          : await getCredentialsPath(config)
      const baseURL = process.env.ANTHROPIC_BASE_URL || config.base_url
      const withPath: WorkloadIdentityConfig = {
        ...config,
        base_url: baseURL,
        ...(!config.authentication.credentials_path && credentialsPath !== null
          ? {
              authentication: {
                ...config.authentication,
                credentials_path: credentialsPath,
              },
            }
          : {}),
      }
      const [{ getUserAgent }, { getProxyFetchOptions }] = await Promise.all([
        import('../../utils/http.js'),
        import('../../utils/proxy.js'),
      ])
      const resolved = resolveCredentialsFromConfig(withPath, {
        baseURL: baseURL || 'https://api.anthropic.com',
        fetch: (url, init) =>
          fetch(url, {
            ...init,
            ...getProxyFetchOptions({ forAnthropicAPI: true }),
          }),
        userAgent: getUserAgent(),
        onSafetyWarning: warning =>
          logForDebugging(warning, { level: 'warn' }),
        onCacheWriteError: error =>
          logForDebugging(String(error), { level: 'warn' }),
      })
      if (
        config.authentication.type === 'user_oauth' &&
        credentialsPath
      ) {
        resolved.provider = withCredentialsLock(
          resolved.provider,
          credentialsPath,
        )
      }
      return resolved
    })().catch(error => {
      logForDebugging(errorMessage(error), { level: 'error' })
      throw error instanceof WorkloadIdentityError
        ? error
        : new WorkloadIdentityError(errorMessage(error))
    })
  }
  return credentialsPromise
}

export function getWIFTokenCache(): Promise<TokenCache | null> {
  tokenCachePromise ??= getWIFCredentials().then(credentials => {
    if (credentials === null) return null
    return new TokenCache(
      async options => {
        try {
          return await credentials.provider(options)
        } catch (error) {
          if (error instanceof WorkloadIdentityError) throw error
          throw new WorkloadIdentityError(errorMessage(error))
        }
      },
      error => logForDebugging(String(error), { level: 'warn' }),
    )
  })
  return tokenCachePromise
}

export function resetWIFSingletonsForTesting(): void {
  credentialsPromise = undefined
  tokenCachePromise = undefined
  precedenceCache = undefined
}
