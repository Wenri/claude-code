import memoize from 'lodash-es/memoize.js'
import { uniq } from './array.js'
import { logForDebugging } from './debug.js'
import { hasNodeOption } from './envUtils.js'
import { getFsImplementation } from './fsOperations.js'

const DEFAULT_CA_STORES = ['bundled', 'system'] as const
type CAStore = (typeof DEFAULT_CA_STORES)[number]

function getCAStores(): CAStore[] {
  const configuredStores = process.env.CLAUDE_CODE_CERT_STORE
  if (configuredStores) {
    const stores: CAStore[] = []
    for (const value of configuredStores.split(',')) {
      const store = value.trim().toLowerCase()
      if (store === 'bundled' || store === 'system') {
        if (!stores.includes(store)) stores.push(store)
      } else if (store) {
        logForDebugging(
          `CA certs: unrecognized CLAUDE_CODE_CERT_STORE source '${store}', ignoring`,
          { level: 'warn' },
        )
      }
    }
    return stores.length > 0 ? stores : [...DEFAULT_CA_STORES]
  }

  if (
    hasNodeOption('--use-system-ca') ||
    hasNodeOption('--use-openssl-ca')
  ) {
    return ['system']
  }

  return [...DEFAULT_CA_STORES]
}

/**
 * Load CA certificates for TLS connections.
 *
 * Since setting `ca` on an HTTPS agent replaces the default certificate store,
 * we must always include base CAs (either system or bundled Mozilla) when returning.
 *
 * Returns undefined when no custom CA configuration is needed, allowing the
 * runtime's default certificate handling to apply.
 *
 * Behavior:
 * - Bun defaults to bundled Mozilla CAs plus the OS trust store
 * - Node.js with no explicit CA configuration returns undefined (runtime defaults)
 * - CLAUDE_CODE_CERT_STORE selects an ordered comma-separated list of
 *   "bundled" and "system" stores
 * - --use-system-ca or --use-openssl-ca only: system CAs
 * - NODE_EXTRA_CA_CERTS appends the configured certificate file
 *
 * Memoized for performance. Call clearCACertsCache() to invalidate after
 * environment variable changes (e.g., after trust dialog applies settings.json).
 *
 * Reads ONLY `process.env.NODE_EXTRA_CA_CERTS`. `caCertsConfig.ts` populates
 * that env var from settings.json at CLI init; this module stays config-free
 * so `proxy.ts`/`mtls.ts` don't transitively pull in the command registry.
 */
export const getCACertificates = memoize((): string[] | undefined => {
  const stores = getCAStores()
  const extraCertsPath = process.env.NODE_EXTRA_CA_CERTS
  const useBundledCA = stores.includes('bundled')
  const useSystemCA = stores.includes('system')

  logForDebugging(
    `CA certs: stores=${stores.join(',')}, extraCertsPath=${extraCertsPath}`,
  )

  // Node.js already honors its default/flag-selected trust stores at runtime.
  if (
    typeof Bun === 'undefined' &&
    !extraCertsPath &&
    !process.env.CLAUDE_CODE_CERT_STORE
  ) {
    return undefined
  }

  // Deferred load: Bun's node:tls module eagerly materializes ~150 Mozilla
  // root certificates (~750KB heap) on import, even if tls.rootCertificates
  // is never accessed. Most users hit the early return above, so we only
  // pay this cost when custom CA handling is actually needed.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const tls = require('tls') as typeof import('tls') & {
    getCACertificates?: (type: string) => string[]
  }
  /* eslint-enable @typescript-eslint/no-require-imports */

  const getCACerts = tls.getCACertificates
  if (!useBundledCA && useSystemCA && !getCACerts) {
    logForDebugging(
      'CA certs: stores=system but system CA API unavailable, deferring to runtime',
    )
    return undefined
  }

  const certs: string[] = []

  if (useBundledCA) {
    certs.push(...tls.rootCertificates)
    logForDebugging(
      `CA certs: Loaded ${tls.rootCertificates.length} bundled root certificates`,
    )
  }

  if (useSystemCA) {
    try {
      const systemCAs = getCACerts?.('system')
      if (systemCAs && systemCAs.length > 0) {
        certs.push(...systemCAs)
        logForDebugging(
          `CA certs: Loaded ${systemCAs.length} system CA certificates`,
        )
      } else {
        logForDebugging(
          `CA certs: system store ${getCACerts ? 'returned empty' : 'unavailable'}`,
        )
        if (!useBundledCA) certs.push(...tls.rootCertificates)
      }
    } catch (error) {
      logForDebugging(
        `CA certs: Failed to load system CA certificates: ${error}`,
        { level: 'error' },
      )
      if (!useBundledCA) certs.push(...tls.rootCertificates)
    }
  }

  // Append extra certs from file
  if (extraCertsPath) {
    try {
      const extraCert = getFsImplementation().readFileSync(extraCertsPath, {
        encoding: 'utf8',
      })
      certs.push(extraCert)
      logForDebugging(
        `CA certs: Appended extra certificates from NODE_EXTRA_CA_CERTS (${extraCertsPath})`,
      )
    } catch (error) {
      logForDebugging(
        `CA certs: Failed to read NODE_EXTRA_CA_CERTS file (${extraCertsPath}): ${error}`,
        { level: 'error' },
      )
    }
  }

  return certs.length > 0 ? uniq(certs) : undefined
})

/**
 * Clear the CA certificates cache.
 * Call this when environment variables that affect CA certs may have changed
 * (e.g., CLAUDE_CODE_CERT_STORE, NODE_EXTRA_CA_CERTS, NODE_OPTIONS).
 */
export function clearCACertsCache(): void {
  getCACertificates.cache.clear?.()
  logForDebugging('Cleared CA certificates cache')
}
