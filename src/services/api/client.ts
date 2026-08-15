import Anthropic, { type ClientOptions } from '@anthropic-ai/sdk'
import { randomUUID } from 'crypto'
import {
  checkAndRefreshOAuthTokenIfNeeded,
  getAnthropicApiKey,
  getApiKeyFromApiKeyHelper,
  getClaudeAIOAuthTokens,
  isClaudeAISubscriber,
  refreshAndGetAwsCredentials,
  refreshGcpCredentialsIfNeeded,
  shouldUseWIFAuth,
} from 'src/utils/auth.js'
import {
  getWIFCredentials,
  getWIFTokenCache,
} from './workloadIdentity.js'
import { getUserAgent } from 'src/utils/http.js'
import {
  getSmallFastModel,
  normalizeModelStringForAPI,
} from 'src/utils/model/model.js'
import {
  getAPIProvider,
  getAPIProviderForModel,
  isFirstPartyAnthropicBaseUrl,
} from 'src/utils/model/providers.js'
import {
  getProxyAuthFromHelper,
  getProxyFetchOptions,
} from 'src/utils/proxy.js'
import { logForDiagnosticsNoPII } from 'src/utils/diagLogs.js'
import { logEvent } from '../analytics/index.js'
import {
  getIsNonInteractiveSession,
  getSessionId,
} from '../../bootstrap/state.js'
import { getOauthConfig, isWIFActive } from '../../constants/oauth.js'
import { isDebugToStdErr, logForDebugging } from '../../utils/debug.js'
import {
  getAWSRegion,
  getVertexRegionForModel,
  isEnvDefinedFalsy,
  isEnvTruthy,
} from '../../utils/envUtils.js'
import {
  getWIFCredentials,
  getWIFTokenCache,
} from '../../utils/workloadIdentity.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../analytics/growthbook.js'
import {
  buildVertexGoogleAuth,
  getVertexApiBaseUrl,
} from './vertexAuth.js'

/**
 * Environment variables for different client types:
 *
 * Direct API:
 * - ANTHROPIC_API_KEY: Required for direct API access
 *
 * AWS Bedrock:
 * - AWS credentials configured via aws-sdk defaults
 * - AWS_REGION or AWS_DEFAULT_REGION: Sets the AWS region for all models (default: us-east-1)
 * - ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION: Optional. Override AWS region specifically for the small fast model (Haiku)
 *
 * Foundry (Azure):
 * - ANTHROPIC_FOUNDRY_RESOURCE: Your Azure resource name (e.g., 'my-resource')
 *   For the full endpoint: https://{resource}.services.ai.azure.com/anthropic/v1/messages
 * - ANTHROPIC_FOUNDRY_BASE_URL: Optional. Alternative to resource - provide full base URL directly
 *   (e.g., 'https://my-resource.services.ai.azure.com')
 *
 * Authentication (one of the following):
 * - ANTHROPIC_FOUNDRY_API_KEY: Your Microsoft Foundry API key (if using API key auth)
 * - Azure AD authentication: If no API key is provided, uses DefaultAzureCredential
 *   which supports multiple auth methods (environment variables, managed identity,
 *   Azure CLI, etc.). See: https://docs.microsoft.com/en-us/javascript/api/@azure/identity
 *
 * Vertex AI:
 * - Model-specific region variables (highest priority):
 *   - VERTEX_REGION_CLAUDE_3_5_HAIKU: Region for Claude 3.5 Haiku model
 *   - VERTEX_REGION_CLAUDE_HAIKU_4_5: Region for Claude Haiku 4.5 model
 *   - VERTEX_REGION_CLAUDE_3_5_SONNET: Region for Claude 3.5 Sonnet model
 *   - VERTEX_REGION_CLAUDE_3_7_SONNET: Region for Claude 3.7 Sonnet model
 * - CLOUD_ML_REGION: Optional. The default GCP region to use for all models
 *   If specific model region not specified above
 * - ANTHROPIC_VERTEX_PROJECT_ID: Required. Your GCP project ID
 * - Standard GCP credentials configured via google-auth-library
 *
 * Priority for determining region:
 * 1. Hardcoded model-specific environment variables
 * 2. Global CLOUD_ML_REGION variable
 * 3. Default region from config
 * 4. Fallback region (us-east5)
 */

function createStderrLogger(): ClientOptions['logger'] {
  return {
    error: (msg, ...args) =>
      // biome-ignore lint/suspicious/noConsole:: intentional console output -- SDK logger must use console
      console.error('[Anthropic SDK ERROR]', msg, ...args),
    // biome-ignore lint/suspicious/noConsole:: intentional console output -- SDK logger must use console
    warn: (msg, ...args) => console.error('[Anthropic SDK WARN]', msg, ...args),
    // biome-ignore lint/suspicious/noConsole:: intentional console output -- SDK logger must use console
    info: (msg, ...args) => console.error('[Anthropic SDK INFO]', msg, ...args),
    debug: (msg, ...args) =>
      // biome-ignore lint/suspicious/noConsole:: intentional console output -- SDK logger must use console
      console.error('[Anthropic SDK DEBUG]', msg, ...args),
  }
}

export async function getAnthropicClient({
  apiKey,
  maxRetries,
  model,
  fetchOverride,
  source,
}: {
  apiKey?: string
  maxRetries: number
  model?: string
  fetchOverride?: ClientOptions['fetch']
  source?: string
}): Promise<Anthropic> {
  const containerId = process.env.CLAUDE_CODE_CONTAINER_ID
  const remoteSessionId = process.env.CLAUDE_CODE_REMOTE_SESSION_ID
  const clientApp = process.env.CLAUDE_AGENT_SDK_CLIENT_APP
  const customHeaders = getCustomHeaders()
  const defaultHeaders: { [key: string]: string } = {
    'x-app': 'cli',
    'User-Agent': getUserAgent(),
    'X-Claude-Code-Session-Id': getSessionId(),
    ...customHeaders,
    ...(containerId ? { 'x-claude-remote-container-id': containerId } : {}),
    ...(remoteSessionId
      ? { 'x-claude-remote-session-id': remoteSessionId }
      : {}),
    // SDK consumers can identify their app/library for backend analytics
    ...(clientApp ? { 'x-client-app': clientApp } : {}),
  }

  // Log API client configuration for HFI debugging
  logForDebugging(
    `[API:request] Creating client, ANTHROPIC_CUSTOM_HEADERS present: ${!!process.env.ANTHROPIC_CUSTOM_HEADERS}, has Authorization header: ${!!customHeaders['Authorization']}`,
  )

  // Add additional protection header if enabled via env var
  const additionalProtectionEnabled = isEnvTruthy(
    process.env.CLAUDE_CODE_ADDITIONAL_PROTECTION,
  )
  if (additionalProtectionEnabled) {
    defaultHeaders['x-anthropic-additional-protection'] = 'true'
  }

  logForDebugging('[API:auth] OAuth token check starting')
  await checkAndRefreshOAuthTokenIfNeeded()
  logForDebugging('[API:auth] OAuth token check complete')

  if (!isClaudeAISubscriber()) {
    await configureApiKeyHeaders(defaultHeaders, getIsNonInteractiveSession())
  }

  await getProxyAuthFromHelper()
  const resolvedFetch = buildFetch(fetchOverride, source)

  const apiProvider = getAPIProviderForModel(model)
  const ARGS = {
    defaultHeaders,
    maxRetries,
    timeout: parseInt(process.env.API_TIMEOUT_MS || String(600 * 1000), 10),
    dangerouslyAllowBrowser: true,
    fetchOptions: getProxyFetchOptions({
      forAnthropicAPI: true,
      url: getApiEndpointForProxy(apiProvider, model),
    }) as ClientOptions['fetchOptions'],
    ...(resolvedFetch && {
      fetch: resolvedFetch,
    }),
  }
  if (apiProvider === 'bedrock') {
    const { AnthropicBedrock } = await import('@anthropic-ai/bedrock-sdk')
    const awsRegion = getAWSRegionForModel(model)

    const skipAuth = isEnvTruthy(
      process.env.CLAUDE_CODE_SKIP_BEDROCK_AUTH,
    )
    const { value: authorizationHeader, rest: headersWithoutAuthorization } =
      extractAuthorizationHeader(ARGS.defaultHeaders)
    const bedrockApiKey = process.env.AWS_BEARER_TOKEN_BEDROCK
      ? `Bearer ${process.env.AWS_BEARER_TOKEN_BEDROCK}`
      : skipAuth
        ? authorizationHeader
        : undefined
    const cachedCredentials =
      !bedrockApiKey && !skipAuth
        ? await refreshAndGetAwsCredentials()
        : null

    const bedrockArgs: ConstructorParameters<typeof AnthropicBedrock>[0] = {
      ...ARGS,
      defaultHeaders: headersWithoutAuthorization,
      awsRegion,
      apiKey: null,
      ...(skipAuth &&
        !bedrockApiKey && {
          skipAuth: true,
        }),
      ...(bedrockApiKey && {
        apiKey:
          bedrockApiKey.match(/^Bearer (.+)$/i)?.[1] ?? bedrockApiKey,
        defaultHeaders: {
          ...headersWithoutAuthorization,
          Authorization: bedrockApiKey,
        },
      }),
      ...(isDebugToStdErr() && { logger: createStderrLogger() }),
    }

    if (cachedCredentials) {
      bedrockArgs.awsAccessKey = cachedCredentials.accessKeyId
      bedrockArgs.awsSecretKey = cachedCredentials.secretAccessKey
      bedrockArgs.awsSessionToken = cachedCredentials.sessionToken
    }
    // we have always been lying about the return type - this doesn't support batching or models
    return new AnthropicBedrock(bedrockArgs) as unknown as Anthropic
  }
  if (apiProvider === 'mantle') {
    const { AnthropicBedrockMantle } = await import(
      '@anthropic-ai/bedrock-sdk'
    )
    const skipAuth = isEnvTruthy(
      process.env.CLAUDE_CODE_SKIP_MANTLE_AUTH,
    )
    const { value: authorizationHeader, rest: headersWithoutAuthorization } =
      extractAuthorizationHeader(ARGS.defaultHeaders)
    const mantleApiKey = skipAuth ? authorizationHeader : undefined
    const cachedCredentials =
      !process.env.AWS_BEARER_TOKEN_BEDROCK && !skipAuth
        ? await refreshAndGetAwsCredentials()
        : null
    return new AnthropicBedrockMantle({
      ...ARGS,
      defaultHeaders: headersWithoutAuthorization,
      awsRegion: getAWSRegionForModel(model),
      ...(skipAuth &&
        !mantleApiKey && {
          skipAuth: true,
        }),
      ...(mantleApiKey && {
        apiKey:
          mantleApiKey.match(/^Bearer (.+)$/i)?.[1] ?? mantleApiKey,
        defaultHeaders: {
          ...headersWithoutAuthorization,
          Authorization: mantleApiKey,
        },
      }),
      ...(cachedCredentials && {
        awsAccessKey: cachedCredentials.accessKeyId,
        awsSecretAccessKey: cachedCredentials.secretAccessKey,
        awsSessionToken: cachedCredentials.sessionToken,
      }),
      ...(isDebugToStdErr() && { logger: createStderrLogger() }),
    }) as unknown as Anthropic
  }
  if (apiProvider === 'foundry') {
    const { AnthropicFoundry } = await import('@anthropic-ai/foundry-sdk')
    // Determine Azure AD token provider based on configuration
    // SDK reads ANTHROPIC_FOUNDRY_API_KEY by default
    let azureADTokenProvider: (() => Promise<string>) | undefined
    if (!process.env.ANTHROPIC_FOUNDRY_API_KEY) {
      if (isEnvTruthy(process.env.CLAUDE_CODE_SKIP_FOUNDRY_AUTH)) {
        // Mock token provider for testing/proxy scenarios (similar to Vertex mock GoogleAuth)
        azureADTokenProvider = () => Promise.resolve('')
      } else {
        // Use real Azure AD authentication with DefaultAzureCredential
        const {
          DefaultAzureCredential: AzureCredential,
          getBearerTokenProvider,
        } = await import('@azure/identity')
        azureADTokenProvider = getBearerTokenProvider(
          new AzureCredential(),
          'https://cognitiveservices.azure.com/.default',
        )
      }
    }

    const foundryArgs: ConstructorParameters<typeof AnthropicFoundry>[0] = {
      ...ARGS,
      ...(azureADTokenProvider && { azureADTokenProvider }),
      ...(isDebugToStdErr() && { logger: createStderrLogger() }),
    }
    // we have always been lying about the return type - this doesn't support batching or models
    return new AnthropicFoundry(foundryArgs) as unknown as Anthropic
  }
  if (apiProvider === 'anthropicAws') {
    const { AnthropicAws } = await import('@anthropic-ai/aws-sdk')
    const skipAuth = isEnvTruthy(
      process.env.CLAUDE_CODE_SKIP_ANTHROPIC_AWS_AUTH,
    )
    const { value: authorizationHeader, rest: headersWithoutAuthorization } =
      extractAuthorizationHeader(ARGS.defaultHeaders)
    const anthropicAwsApiKey = skipAuth ? authorizationHeader : undefined
    const anthropicAwsArgs: ConstructorParameters<typeof AnthropicAws>[0] = {
      ...ARGS,
      defaultHeaders: headersWithoutAuthorization,
      ...(skipAuth &&
        !anthropicAwsApiKey && {
          skipAuth: true,
        }),
      ...(anthropicAwsApiKey && {
        apiKey:
          anthropicAwsApiKey.match(/^Bearer (.+)$/i)?.[1] ??
          anthropicAwsApiKey,
        defaultHeaders: {
          ...headersWithoutAuthorization,
          Authorization: anthropicAwsApiKey,
        },
      }),
      ...(isDebugToStdErr() && { logger: createStderrLogger() }),
    }

    if (
      !process.env.ANTHROPIC_AWS_API_KEY &&
      !skipAuth
    ) {
      const cachedCredentials = await refreshAndGetAwsCredentials()
      if (cachedCredentials) {
        anthropicAwsArgs.awsAccessKey = cachedCredentials.accessKeyId
        anthropicAwsArgs.awsSecretAccessKey = cachedCredentials.secretAccessKey
        anthropicAwsArgs.awsSessionToken = cachedCredentials.sessionToken
      }
    }
    return new AnthropicAws(anthropicAwsArgs) as unknown as Anthropic
  }
  if (apiProvider === 'vertex') {
    // Refresh GCP credentials if gcpAuthRefresh is configured and credentials are expired
    // This is similar to how we handle AWS credential refresh for Bedrock
    if (!isEnvTruthy(process.env.CLAUDE_CODE_SKIP_VERTEX_AUTH)) {
      await refreshGcpCredentialsIfNeeded()
    }

    const { AnthropicVertex } = await import('@anthropic-ai/vertex-sdk')
    // TODO: Cache either GoogleAuth instance or AuthClient to improve performance
    // Currently we create a new GoogleAuth instance for every getAnthropicClient() call
    // This could cause repeated authentication flows and metadata server checks
    // However, caching needs careful handling of:
    // - Credential refresh/expiration
    // - Environment variable changes (GOOGLE_APPLICATION_CREDENTIALS, project vars)
    // - Cross-request auth state management
    // See: https://github.com/googleapis/google-auth-library-nodejs/issues/390 for caching challenges

    // Prevent metadata server timeout by providing projectId as fallback
    // google-auth-library checks project ID in this order:
    // 1. Environment variables (GCLOUD_PROJECT, GOOGLE_CLOUD_PROJECT, etc.)
    // 2. Credential files (service account JSON, ADC file)
    // 3. gcloud config
    // 4. GCE metadata server (causes 12s timeout outside GCP)
    //
    // We only set projectId if user hasn't configured other discovery methods
    // to avoid interfering with their existing auth setup

    // Check project environment variables in same order as google-auth-library
    // See: https://github.com/googleapis/google-auth-library-nodejs/blob/main/src/auth/googleauth.ts
    const hasProjectEnvVar =
      process.env['GCLOUD_PROJECT'] ||
      process.env['GOOGLE_CLOUD_PROJECT'] ||
      process.env['gcloud_project'] ||
      process.env['google_cloud_project']

    // Check for credential file paths (service account or ADC)
    // Note: We're checking both standard and lowercase variants to be safe,
    // though we should verify what google-auth-library actually checks
    const hasKeyFile =
      process.env['GOOGLE_APPLICATION_CREDENTIALS'] ||
      process.env['google_application_credentials']

    const googleAuth = await buildVertexGoogleAuth(
      isEnvTruthy(process.env.CLAUDE_CODE_SKIP_VERTEX_AUTH)
        ? { kind: 'skip' }
        : { kind: 'default' },
      hasProjectEnvVar || hasKeyFile
        ? undefined
        : process.env.ANTHROPIC_VERTEX_PROJECT_ID,
    )

    const vertexArgs: ConstructorParameters<typeof AnthropicVertex>[0] = {
      ...ARGS,
      region: getVertexRegionForModel(model),
      googleAuth,
      ...(isDebugToStdErr() && { logger: createStderrLogger() }),
    }
    // we have always been lying about the return type - this doesn't support batching or models
    return new AnthropicVertex(vertexArgs) as unknown as Anthropic
  }

  const resolvedApiKey = apiKey || getAnthropicApiKey()
  if (!resolvedApiKey && shouldUseWIFAuth()) {
    const tokenCache = await getWIFTokenCache()
    if (tokenCache) {
      const credentials = await getWIFCredentials()
      const { rest: headersWithoutAuthorization } =
        extractAuthorizationHeader(ARGS.defaultHeaders)
      return new Anthropic({
        apiKey: null,
        authToken: await tokenCache.getToken(),
        baseURL:
          process.env.ANTHROPIC_BASE_URL || credentials?.baseURL,
        ...ARGS,
        defaultHeaders: {
          ...headersWithoutAuthorization,
          ...credentials?.extraHeaders,
        },
        ...(isDebugToStdErr() && { logger: createStderrLogger() }),
      })
    }
  }

  // Determine authentication method based on available tokens
  const clientConfig: ConstructorParameters<typeof Anthropic>[0] = {
    apiKey: isClaudeAISubscriber() ? null : resolvedApiKey,
    authToken: isClaudeAISubscriber()
      ? getClaudeAIOAuthTokens()?.accessToken
      : undefined,
    // Set baseURL from OAuth config when using staging OAuth
    ...(process.env.USER_TYPE === 'ant' &&
    isEnvTruthy(process.env.USE_STAGING_OAUTH)
      ? { baseURL: getOauthConfig().BASE_API_URL }
      : {}),
    ...ARGS,
    ...(isDebugToStdErr() && { logger: createStderrLogger() }),
  }

  return new Anthropic(clientConfig)
}

function getAWSRegionForModel(model?: string): string {
  const smallFastModelRegion =
    process.env.ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION
  if (
    model &&
    smallFastModelRegion &&
    normalizeModelStringForAPI(model) ===
      normalizeModelStringForAPI(getSmallFastModel())
  ) {
    return smallFastModelRegion
  }
  return getAWSRegion()
}

/** Resolve the provider endpoint so Bun can apply NO_PROXY before a request. */
function getApiEndpointForProxy(
  provider: ReturnType<typeof getAPIProviderForModel>,
  model?: string,
): string | undefined {
  switch (provider) {
    case 'bedrock':
      return (
        process.env.ANTHROPIC_BEDROCK_BASE_URL ||
        `https://bedrock-runtime.${getAWSRegionForModel(model)}.amazonaws.com`
      )
    case 'mantle':
      return (
        process.env.ANTHROPIC_BEDROCK_MANTLE_BASE_URL ||
        `https://bedrock-mantle.${getAWSRegionForModel(model)}.api.aws`
      )
    case 'anthropicAws':
      return (
        process.env.ANTHROPIC_AWS_BASE_URL ||
        `https://aws-external-anthropic.${getAWSRegion()}.api.aws`
      )
    case 'vertex':
      return (
        process.env.ANTHROPIC_VERTEX_BASE_URL ||
        getVertexApiBaseUrl(getVertexRegionForModel(model))
      )
    case 'foundry': {
      const resource = process.env.ANTHROPIC_FOUNDRY_RESOURCE
      return (
        process.env.ANTHROPIC_FOUNDRY_BASE_URL ||
        (resource
          ? `https://${resource}.services.ai.azure.com`
          : undefined)
      )
    }
    case 'firstParty':
      return process.env.ANTHROPIC_BASE_URL || getOauthConfig().BASE_API_URL
  }
}

async function configureApiKeyHeaders(
  headers: Record<string, string>,
  isNonInteractiveSession: boolean,
): Promise<void> {
  const token =
    process.env.ANTHROPIC_AUTH_TOKEN ||
    (await getApiKeyFromApiKeyHelper(isNonInteractiveSession))
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
}

function extractAuthorizationHeader(headers: Record<string, string>): {
  value: string | undefined
  rest: Record<string, string>
} {
  const rest: Record<string, string> = {}
  let value: string | undefined
  for (const [name, headerValue] of Object.entries(headers)) {
    if (name.toLowerCase() === 'authorization') {
      value = headerValue
    } else {
      rest[name] = headerValue
    }
  }
  return { value, rest }
}

function getCustomHeaders(): Record<string, string> {
  const customHeaders: Record<string, string> = {}
  const customHeadersEnv = process.env.ANTHROPIC_CUSTOM_HEADERS

  if (!customHeadersEnv) return customHeaders

  // Split by newlines to support multiple headers
  const headerStrings = customHeadersEnv.split(/\n|\r\n/)

  for (const headerString of headerStrings) {
    if (!headerString.trim()) continue

    // Parse header in format "Name: Value" (curl style). Split on first `:`
    // then trim — avoids regex backtracking on malformed long header lines.
    const colonIdx = headerString.indexOf(':')
    if (colonIdx === -1) continue
    const name = headerString.slice(0, colonIdx).trim()
    const value = headerString.slice(colonIdx + 1).trim()
    if (name) {
      customHeaders[name] = value
    }
  }

  return customHeaders
}

export const CLIENT_REQUEST_ID_HEADER = 'x-client-request-id'

export class StreamIdleTimeoutError extends Error {
  readonly idleMs: number

  constructor(idleMs: number) {
    super(`stream idle: no bytes for ${idleMs}ms`)
    this.name = 'StreamIdleTimeoutError'
    this.idleMs = idleMs
  }
}

function addStreamIdleTimeout(
  body: ReadableStream<Uint8Array>,
  idleMs: number,
): ReadableStream<Uint8Array> {
  let timeout: ReturnType<typeof setTimeout> | null = null
  let partialIdleTimeout: ReturnType<typeof setTimeout> | null = null
  let partialIdleIndex = 0
  let bytesTotal = 0
  const partialIdleDelays = [15_000, 30_000, 60_000, 120_000]

  const clearPartialIdleTimeout = () => {
    if (partialIdleTimeout !== null) {
      clearTimeout(partialIdleTimeout)
      partialIdleTimeout = null
    }
  }

  const clearIdleTimeout = () => {
    if (timeout !== null) {
      clearTimeout(timeout)
      timeout = null
    }
  }

  const clearTimeouts = () => {
    clearIdleTimeout()
    clearPartialIdleTimeout()
  }

  let lastChunk = 0
  const schedulePartialIdleWatchdog = (
    controller: TransformStreamDefaultController<Uint8Array>,
  ) => {
    clearPartialIdleTimeout()
    if (partialIdleIndex >= partialIdleDelays.length) return
    const partialIdleMs = partialIdleDelays[partialIdleIndex]!
    const lastChunkAgeMs = performance.now() - lastChunk
    partialIdleTimeout = setTimeout(
      () => {
        partialIdleTimeout = null
        if (controller.desiredSize === null) return
        try {
          logForDebugging(
            `[Stall] stream_idle_partial lastChunkAgeMs=${Math.round(performance.now() - lastChunk)} bytesTotal=${bytesTotal} idleDeadlineMs=${idleMs}`,
            { level: 'warn' },
          )
        } catch {}
        partialIdleIndex += 1
        schedulePartialIdleWatchdog(controller)
      },
      Math.max(0, partialIdleMs - lastChunkAgeMs),
    )
    partialIdleTimeout.unref?.()
  }

  const resetIdleTimeout = (
    controller: TransformStreamDefaultController<Uint8Array>,
  ) => {
    clearTimeouts()
    lastChunk = performance.now()
    partialIdleIndex = 0
    schedulePartialIdleWatchdog(controller)
    timeout = setTimeout(() => {
      timeout = null
      const lateMs = Math.round(performance.now() - lastChunk - idleMs)
      const readableErrored = controller.desiredSize === null
      try {
        logForDebugging(
          `[byte-watchdog] firing: idle=${idleMs}ms late=${lateMs}ms errored=${readableErrored}`,
          { level: 'warn' },
        )
        logForDiagnosticsNoPII('warn', 'cli_byte_watchdog_fired', {
          idle_ms: idleMs,
          late_ms: lateMs,
          readable_errored: readableErrored,
        })
        if (lateMs >= 1000) {
          logEvent('tengu_byte_watchdog_fired_late', {
            idle_ms: idleMs,
            late_ms: lateMs,
            readable_errored: readableErrored,
          })
        }
      } catch {
        // Watchdog diagnostics must never prevent the stream from aborting.
      }
      try {
        controller.error(new StreamIdleTimeoutError(idleMs))
      } catch {
        // The stream may already have closed between scheduling and firing.
      }
    }, idleMs)
    timeout.unref?.()
  }

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      start: resetIdleTimeout,
      transform(chunk, controller) {
        bytesTotal += chunk.byteLength
        resetIdleTimeout(controller)
        controller.enqueue(chunk)
      },
      flush: clearTimeouts,
    }),
  )
}

function isByteWatchdogEnabled(): boolean {
  if (isEnvDefinedFalsy(process.env.CLAUDE_ENABLE_BYTE_WATCHDOG)) {
    return false
  }
  if (isEnvTruthy(process.env.CLAUDE_ENABLE_BYTE_WATCHDOG)) {
    return true
  }
  return getFeatureValue_CACHED_MAY_BE_STALE(
    'tengu_stream_watchdog_default_on',
    true,
  )
}

function buildFetch(
  fetchOverride: ClientOptions['fetch'],
  source: string | undefined,
): ClientOptions['fetch'] {
  // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
  const inner = fetchOverride ?? globalThis.fetch
  // Only send to the first-party API — Bedrock/Vertex/Foundry don't log it
  // and unknown headers risk rejection by strict proxies (inc-4029 class).
  const provider = getAPIProvider()
  const isFirstPartyRequest =
    (provider === 'firstParty' && isFirstPartyAnthropicBaseUrl()) ||
    ((provider as string) === 'anthropicAws' &&
      !process.env.ANTHROPIC_AWS_BASE_URL)
  return async (input, init) => {
    // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
    const headers = new Headers(init?.headers)
    // Generate a client-side request ID so timeouts (which return no server
    // request ID) can still be correlated with server logs by the API team.
    // Callers that want to track the ID themselves can pre-set the header.
    if (isFirstPartyRequest && !headers.has(CLIENT_REQUEST_ID_HEADER)) {
      headers.set(CLIENT_REQUEST_ID_HEADER, randomUUID())
    }
    try {
      // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
      const url = input instanceof Request ? input.url : String(input)
      const id = headers.get(CLIENT_REQUEST_ID_HEADER)
      logForDebugging(
        `[API REQUEST] ${new URL(url).pathname}${id ? ` ${CLIENT_REQUEST_ID_HEADER}=${id}` : ''} source=${source ?? 'unknown'}`,
      )
    } catch {
      // never let logging crash the fetch
    }
    const response = await inner(input, { ...init, headers })
    if (
      isFirstPartyRequest &&
      response.body &&
      response.headers.get('content-type')?.includes('text/event-stream') &&
      isByteWatchdogEnabled()
    ) {
      const idleMs = Math.max(
        parseInt(process.env.CLAUDE_STREAM_IDLE_TIMEOUT_MS || '', 10) || 90000,
        300000,
      )
      const wrappedResponse = new Response(
        addStreamIdleTimeout(response.body, idleMs),
        response,
      )
      Object.defineProperty(wrappedResponse, 'url', { value: response.url })
      return wrappedResponse
    }
    return response
  }
}
