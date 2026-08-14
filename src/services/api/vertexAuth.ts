import type { GoogleAuth } from 'google-auth-library'
import { getProxyUrl, shouldBypassProxy } from '../../utils/proxy.js'

const GOOGLE_CLOUD_PLATFORM_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
]

export type VertexAuthConfig =
  | { kind: 'skip' }
  | { kind: 'default' }
  | { kind: 'keyFile'; path: string }

type VertexAuthAgentOptions = {
  cert?: string | Buffer
  key?: string | Buffer
  ca?: string | string[] | Buffer
}

type VertexAuthRequestInit = RequestInit & {
  agent?: { options?: VertexAuthAgentOptions }
}

/**
 * Build the Google auth client used by Vertex requests.
 *
 * External-account credentials may supply an X.509 certificate through the
 * gaxios agent. google-auth-library's transporter is taught how to carry that
 * certificate through Bun fetch as well as Node/undici fetch.
 */
export async function buildVertexGoogleAuth(
  config: VertexAuthConfig,
  projectId?: string,
): Promise<GoogleAuth> {
  if (config.kind === 'skip') {
    return {
      getClient: () => ({
        getRequestHeaders: async () => new Headers(),
      }),
    } as unknown as GoogleAuth
  }

  const { GoogleAuth: GoogleAuthConstructor } = await import(
    'google-auth-library'
  )
  return new GoogleAuthConstructor({
    scopes: GOOGLE_CLOUD_PLATFORM_SCOPES,
    ...(config.kind === 'keyFile' && { keyFilename: config.path }),
    ...(projectId && { projectId }),
    clientOptions: {
      transporterOptions: {
        fetchImplementation: vertexAuthFetch,
      },
    },
  })
}

/**
 * Fetch implementation used only by google-auth-library's transporter.
 * Certificate-based WIF places cert/key/ca on the gaxios agent options.
 */
export async function vertexAuthFetch(
  input: RequestInfo | URL,
  init?: VertexAuthRequestInit,
): Promise<Response> {
  const agentOptions = init?.agent?.options
  if (!agentOptions?.cert && !agentOptions?.key) {
    return fetch(input, init)
  }

  const tls = {
    cert: agentOptions.cert,
    key: agentOptions.key,
    ...(agentOptions.ca && { ca: agentOptions.ca }),
  }

  if (typeof Bun !== 'undefined') {
    return fetch(input, { ...init, tls } as RequestInit)
  }

  const { Agent, ProxyAgent } = await import('undici')
  const proxyUrl = getProxyUrl()
  const dispatcher =
    proxyUrl && !shouldBypassProxy(String(input))
      ? new ProxyAgent({ uri: proxyUrl, requestTls: tls })
      : new Agent({ connect: tls })
  return fetch(input, { ...init, dispatcher } as RequestInit)
}

/** Vertex SDK endpoint before its /v1 suffix. */
export function getVertexApiBaseUrl(region: string | undefined): string {
  switch (region) {
    case 'global':
      return 'https://aiplatform.googleapis.com'
    case 'us':
    case 'eu':
      return `https://aiplatform.${region}.rep.googleapis.com`
    default:
      return `https://${region}-aiplatform.googleapis.com`
  }
}
