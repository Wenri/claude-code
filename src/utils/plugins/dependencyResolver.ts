/**
 * Plugin dependency resolution — pure functions, no I/O.
 *
 * Semantics are `apt`-style: a dependency is a *presence guarantee*, not a
 * module graph. Plugin A depending on Plugin B means "B's namespaced
 * components (MCP servers, commands, agents) must be available when A runs."
 *
 * Two entry points:
 *  - `resolveDependencyClosure` — install-time DFS walk, cycle detection
 *  - `verifyAndDemote` — load-time fixed-point check, demotes plugins with
 *    unsatisfied deps (session-local, does NOT write settings)
 */

import * as semver from 'semver'
import stripAnsi from 'strip-ansi'
import type {
  DependencyConstraint,
  LoadedPlugin,
  PluginError,
} from '../../types/plugin.js'
import { logForDebugging } from '../debug.js'
import type { EditableSettingSource } from '../settings/constants.js'
import { getSettingsForSource } from '../settings/settings.js'
import { plural } from '../stringUtils.js'
import { parsePluginIdentifier } from './pluginIdentifier.js'
import type { PluginId } from './schemas.js'

/**
 * Synthetic marketplace sentinel for `--plugin-dir` plugins (pluginLoader.ts
 * sets `source = "{name}@inline"`). Not a real marketplace — bare deps from
 * these plugins cannot meaningfully inherit it.
 */
const INLINE_MARKETPLACE = 'inline'

/**
 * Capture dependency metadata before PluginManifestSchema normalizes each
 * dependency to a plain string. Older clients deliberately ignore these
 * fields, while 2.1.110 uses them for install- and load-time checks.
 */
export function extractDependencyConstraints(
  rawManifest: unknown,
): Map<string, DependencyConstraint> | undefined {
  if (
    typeof rawManifest !== 'object' ||
    rawManifest === null ||
    !Array.isArray((rawManifest as { dependencies?: unknown }).dependencies)
  ) {
    return undefined
  }

  const constraints = new Map<string, DependencyConstraint>()
  for (const dependency of (rawManifest as { dependencies: unknown[] })
    .dependencies) {
    if (typeof dependency !== 'object' || dependency === null) continue

    const { name, marketplace, version, sha } = dependency as {
      name?: unknown
      marketplace?: unknown
      version?: unknown
      sha?: unknown
    }
    if (typeof name !== 'string' || name.length === 0) continue

    const normalizedVersion =
      typeof version === 'string' ? version : undefined
    const normalizedSha = typeof sha === 'string' ? sha : undefined
    if (normalizedVersion === undefined && normalizedSha === undefined) continue

    const key =
      typeof marketplace === 'string' && marketplace.length > 0
        ? `${name}@${marketplace}`
        : name
    constraints.set(key, {
      version: normalizedVersion,
      sha: normalizedSha,
    })
  }

  return constraints.size > 0 ? constraints : undefined
}

/**
 * Normalize a dependency reference to fully-qualified "name@marketplace" form.
 * Bare names (no @) inherit the marketplace of the plugin declaring them —
 * cross-marketplace deps are blocked anyway, so the @-suffix is boilerplate
 * in the common case.
 *
 * EXCEPTION: if the declaring plugin is @inline (loaded via --plugin-dir),
 * bare deps are returned unchanged. `inline` is a synthetic sentinel, not a
 * real marketplace — fabricating "dep@inline" would never match anything.
 * verifyAndDemote handles bare deps via name-only matching.
 */
export function qualifyDependency(
  dep: string,
  declaringPluginId: string,
): string {
  if (parsePluginIdentifier(dep).marketplace) return dep
  const mkt = parsePluginIdentifier(declaringPluginId).marketplace
  if (!mkt || mkt === INLINE_MARKETPLACE) return dep
  return `${dep}@${mkt}`
}

const MAX_CONSTRAINT_CONJUNCTS = 1024
const MAX_CONSTRAINT_INPUT_CHARS = 4096
const MAX_CONSTRAINT_ERROR_CHARS = 200
const CONTROL_CHARACTERS = /[\x00-\x08\x0b-\x1f\x7f]/g

export type ConstraintIntersection =
  | { ok: true; range: string }
  | {
      ok: false
      reason: 'disjoint' | 'too-complex' | 'invalid'
    }

function constraintTooComplex(reason: string): ConstraintIntersection {
  logForDebugging(
    `intersectConstraints: ${reason} — treating as too complex`,
    { level: 'warn' },
  )
  return { ok: false, reason: 'too-complex' }
}

/**
 * Intersect semver ranges while preserving `||` alternatives. Semver itself
 * has no direct range-intersection primitive, so form a bounded Cartesian
 * product of the alternatives and discard unsatisfiable conjunctions.
 */
export function intersectConstraints(ranges: string[]): ConstraintIntersection {
  if (ranges.length === 0) return { ok: true, range: '*' }

  let inputChars = 0
  for (const range of ranges) inputChars += range.length
  if (inputChars > MAX_CONSTRAINT_INPUT_CHARS) {
    return constraintTooComplex(
      `total input ${inputChars} chars > ${MAX_CONSTRAINT_INPUT_CHARS}`,
    )
  }

  const alternatives: string[][] = []
  for (const range of ranges) {
    const validRange = semver.validRange(range)
    if (validRange === null) return { ok: false, reason: 'invalid' }
    alternatives.push(
      validRange
        .split('||')
        .map(part => part.trim())
        .filter(Boolean),
    )
  }
  let conjuncts = alternatives[0] ?? []
  if (conjuncts.length > MAX_CONSTRAINT_CONJUNCTS) {
    return constraintTooComplex(
      `${conjuncts.length} conjuncts after 1/${ranges.length} inputs > ${MAX_CONSTRAINT_CONJUNCTS}`,
    )
  }

  for (let i = 1; i < alternatives.length; i++) {
    const next = alternatives[i] ?? []
    const productSize = conjuncts.length * next.length
    if (productSize > MAX_CONSTRAINT_CONJUNCTS) {
      return constraintTooComplex(
        `${productSize} conjuncts after ${i + 1}/${ranges.length} inputs > ${MAX_CONSTRAINT_CONJUNCTS}`,
      )
    }
    const combined: string[] = []
    for (const left of conjuncts) {
      for (const right of next) combined.push(`${left} ${right}`)
    }
    conjuncts = combined
  }

  const satisfiable = conjuncts.filter(conjunct => {
    const range = semver.validRange(conjunct)
    return range !== null && semver.minVersion(range) !== null
  })
  if (satisfiable.length === 0) return { ok: false, reason: 'disjoint' }
  const range = semver.validRange(satisfiable.join(' || '))
  return range === null
    ? { ok: false, reason: 'disjoint' }
    : { ok: true, range }
}

function sanitizeConstraintText(value: string): string {
  return stripAnsi(value).replace(CONTROL_CHARACTERS, '')
}

function truncateConstraintText(value: string): string {
  if (value.length <= MAX_CONSTRAINT_ERROR_CHARS) return value
  return `${value.slice(0, MAX_CONSTRAINT_ERROR_CHARS)}… (+${value.length - MAX_CONSTRAINT_ERROR_CHARS} chars)`
}

export function formatConstraintIntersectionError(
  subject: 'Plugin' | 'Dependency',
  dependency: string,
  ranges: string[],
  reason: Extract<ConstraintIntersection, { ok: false }>['reason'],
): string {
  const displayedRanges = truncateConstraintText(
    sanitizeConstraintText(ranges.join(', ')),
  )
  const displayedDependency = sanitizeConstraintText(dependency)
  switch (reason) {
    case 'disjoint':
      return `${subject} "${displayedDependency}" has conflicting version requirements (no version satisfies all of: ${displayedRanges})`
    case 'too-complex':
      return `${subject} "${displayedDependency}" has version requirements too complex to intersect — simplify the ranges: ${displayedRanges}`
    case 'invalid':
      return `${subject} "${displayedDependency}" has an invalid version requirement among: ${displayedRanges}`
  }
}

export function formatNoMatchingTagError(
  subject: 'Plugin' | 'Dependency',
  dependency: string,
  range: string,
): string {
  const displayedRange = truncateConstraintText(sanitizeConstraintText(range))
  return `${subject} "${sanitizeConstraintText(dependency)}" has no git tag satisfying ${displayedRange}`
}

/**
 * Return every loaded plugin that constrains the requested dependency.
 */
export function findDependencyConstraints(
  pluginId: string,
  plugins: readonly LoadedPlugin[],
): Array<{ plugin: LoadedPlugin; constraint: DependencyConstraint }> {
  const matches: Array<{
    plugin: LoadedPlugin
    constraint: DependencyConstraint
  }> = []
  for (const plugin of plugins) {
    if (!plugin.depConstraints) continue
    for (const [rawDependency, constraint] of plugin.depConstraints) {
      if (qualifyDependency(rawDependency, plugin.source) === pluginId) {
        matches.push({ plugin, constraint })
        break
      }
    }
  }
  return matches
}

/**
 * Minimal shape the resolver needs from a marketplace lookup. Keeping this
 * narrow means the resolver stays testable without constructing full
 * PluginMarketplaceEntry objects.
 */
export type DependencyLookupResult = {
  // Entries may be bare names; qualifyDependency normalizes them.
  dependencies?: string[]
}

export type ResolutionResult =
  | { ok: true; closure: PluginId[] }
  | { ok: false; reason: 'cycle'; chain: PluginId[] }
  | { ok: false; reason: 'not-found'; missing: PluginId; requiredBy: PluginId }
  | {
      ok: false
      reason: 'cross-marketplace'
      dependency: PluginId
      requiredBy: PluginId
    }

/**
 * Walk the transitive dependency closure of `rootId` via DFS.
 *
 * The returned `closure` ALWAYS contains `rootId`, plus every transitive
 * dependency that is NOT in `alreadyEnabled`. Already-enabled deps are
 * skipped (not recursed into) — this avoids surprise settings writes when a
 * dep is already installed at a different scope. The root is never skipped,
 * even if already enabled, so re-installing a plugin always re-caches it.
 *
 * Cross-marketplace dependencies are BLOCKED by default: a plugin in
 * marketplace A cannot auto-install a plugin from marketplace B. This is
 * a security boundary — installing from a trusted marketplace shouldn't
 * silently pull from an untrusted one. Two escapes: (1) install the
 * cross-mkt dep yourself first (already-enabled deps are skipped, so the
 * closure won't touch it), or (2) the ROOT marketplace's
 * `allowCrossMarketplaceDependenciesOn` allowlist — only the root's list
 * applies for the whole walk (no transitive trust: if A allows B, B's
 * plugin depending on C is still blocked unless A also allows C).
 *
 * @param rootId Root plugin to resolve from (format: "name@marketplace")
 * @param lookup Async lookup returning `{dependencies}` or `null` if not found
 * @param alreadyEnabled Plugin IDs to skip (deps only, root is never skipped)
 * @param allowedCrossMarketplaces Marketplace names the root trusts for
 *   auto-install (from the root marketplace's manifest)
 * @returns Closure to install, or a cycle/not-found/cross-marketplace error
 */
export async function resolveDependencyClosure(
  rootId: PluginId,
  lookup: (id: PluginId) => Promise<DependencyLookupResult | null>,
  alreadyEnabled: ReadonlySet<PluginId>,
  allowedCrossMarketplaces: ReadonlySet<string> = new Set(),
): Promise<ResolutionResult> {
  const rootMarketplace = parsePluginIdentifier(rootId).marketplace
  const closure: PluginId[] = []
  const visited = new Set<PluginId>()
  const stack: PluginId[] = []

  async function walk(
    id: PluginId,
    requiredBy: PluginId,
  ): Promise<ResolutionResult | null> {
    // Skip already-enabled DEPENDENCIES (avoids surprise settings writes),
    // but NEVER skip the root: installing an already-enabled plugin must
    // still cache/register it. Without this guard, re-installing a plugin
    // that's in settings but missing from disk (e.g., cache cleared,
    // installed_plugins.json stale) would return an empty closure and
    // `cacheAndRegisterPlugin` would never fire — user sees
    // "✔ Successfully installed" but nothing materializes.
    if (id !== rootId && alreadyEnabled.has(id)) return null
    // Security: block auto-install across marketplace boundaries. Runs AFTER
    // the alreadyEnabled check — if the user manually installed a cross-mkt
    // dep, it's in alreadyEnabled and we never reach this.
    const idMarketplace = parsePluginIdentifier(id).marketplace
    if (
      idMarketplace !== rootMarketplace &&
      !(idMarketplace && allowedCrossMarketplaces.has(idMarketplace))
    ) {
      return {
        ok: false,
        reason: 'cross-marketplace',
        dependency: id,
        requiredBy,
      }
    }
    if (stack.includes(id)) {
      return { ok: false, reason: 'cycle', chain: [...stack, id] }
    }
    if (visited.has(id)) return null
    visited.add(id)

    const entry = await lookup(id)
    if (!entry) {
      return { ok: false, reason: 'not-found', missing: id, requiredBy }
    }

    stack.push(id)
    for (const rawDep of entry.dependencies ?? []) {
      const dep = qualifyDependency(rawDep, id)
      const err = await walk(dep, id)
      if (err) return err
    }
    stack.pop()

    closure.push(id)
    return null
  }

  const err = await walk(rootId, rootId)
  if (err) return err
  return { ok: true, closure }
}

/**
 * Load-time safety net: for each enabled plugin, verify all manifest
 * dependencies are also in the enabled set. Demote any that fail.
 *
 * Fixed-point loop: demoting plugin A may break plugin B that depends on A,
 * so we iterate until nothing changes.
 *
 * The `reason` field distinguishes:
 *  - `'not-enabled'` — dep exists in the loaded set but is disabled
 *  - `'not-found'` — dep is entirely absent (not in any marketplace)
 *
 * Does NOT mutate input. Returns the set of plugin IDs (sources) to demote.
 *
 * @param plugins All loaded plugins (enabled + disabled)
 * @returns Set of pluginIds to demote, plus errors for `/doctor`
 */
export function verifyAndDemote(plugins: readonly LoadedPlugin[]): {
  demoted: Set<string>
  errors: PluginError[]
} {
  const known = new Set(plugins.map(p => p.source))
  const enabled = new Set(plugins.filter(p => p.enabled).map(p => p.source))
  const loadedById = new Map(plugins.map(plugin => [plugin.source, plugin]))
  // Name-only indexes for bare deps from --plugin-dir (@inline) plugins:
  // the real marketplace is unknown, so match "B" against any enabled "B@*".
  // enabledByName is a multiset: if B@epic AND B@other are both enabled,
  // demoting one mustn't make "B" disappear from the index.
  const knownByName = new Set(
    plugins.map(p => parsePluginIdentifier(p.source).name),
  )
  const enabledByName = new Map<string, number>()
  for (const id of enabled) {
    const n = parsePluginIdentifier(id).name
    enabledByName.set(n, (enabledByName.get(n) ?? 0) + 1)
  }
  const errors: PluginError[] = []

  let changed = true
  while (changed) {
    changed = false
    for (const p of plugins) {
      if (!enabled.has(p.source)) continue
      for (const rawDep of p.manifest.dependencies ?? []) {
        const dep = qualifyDependency(rawDep, p.source)
        // Bare dep ← @inline plugin: match by name only (see enabledByName)
        const isBare = !parsePluginIdentifier(dep).marketplace
        const satisfied = isBare
          ? (enabledByName.get(dep) ?? 0) > 0
          : enabled.has(dep)
        if (!satisfied) {
          enabled.delete(p.source)
          const count = enabledByName.get(p.name) ?? 0
          if (count <= 1) enabledByName.delete(p.name)
          else enabledByName.set(p.name, count - 1)
          errors.push({
            type: 'dependency-unsatisfied',
            source: p.source,
            plugin: p.name,
            dependency: dep,
            reason: (isBare ? knownByName.has(dep) : known.has(dep))
              ? 'not-enabled'
              : 'not-found',
          })
          changed = true
          break
        }

        // Version constraints only have an unambiguous installed plugin for
        // qualified dependency IDs. Bare @inline dependencies remain
        // presence-only because they can match more than one marketplace.
        const required = p.depConstraints?.get(rawDep)?.version
        if (required !== undefined && !isBare) {
          const installedPlugin = loadedById.get(dep)
          const installed =
            installedPlugin?.resolvedVersion ??
            installedPlugin?.manifest.version
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

  const demoted = new Set(
    plugins.filter(p => p.enabled && !enabled.has(p.source)).map(p => p.source),
  )
  return { demoted, errors }
}

/**
 * Find all enabled plugins that declare `pluginId` as a dependency.
 * Used to warn on uninstall/disable ("required by: X, Y").
 *
 * @param pluginId The plugin being removed/disabled
 * @param plugins All loaded plugins (only enabled ones are checked)
 * @returns Names of plugins that will break if `pluginId` goes away
 */
export function findReverseDependents(
  pluginId: PluginId,
  plugins: readonly LoadedPlugin[],
): string[] {
  const { name: targetName } = parsePluginIdentifier(pluginId)
  return plugins
    .filter(
      p =>
        p.enabled &&
        p.source !== pluginId &&
        (p.manifest.dependencies ?? []).some(d => {
          const qualified = qualifyDependency(d, p.source)
          // Bare dep (from @inline plugin): match by name only
          return parsePluginIdentifier(qualified).marketplace
            ? qualified === pluginId
            : qualified === targetName
        }),
    )
    .map(p => p.name)
}

/**
 * Build the set of plugin IDs currently enabled at a given settings scope.
 * Used by install-time resolution to skip already-enabled deps and avoid
 * surprise settings writes.
 *
 * Matches `true` (plain enable) AND array values (version constraints per
 * settings/types.ts:455-463 — a plugin at `"foo@bar": ["^1.0.0"]` IS enabled).
 * Without the array check, a version-pinned dep would be re-added to the
 * closure and the settings write would clobber the constraint with `true`.
 */
export function getEnabledPluginIdsForScope(
  settingSource: EditableSettingSource,
): Set<PluginId> {
  return new Set(
    Object.entries(getSettingsForSource(settingSource)?.enabledPlugins ?? {})
      .filter(([, v]) => v === true || Array.isArray(v))
      .map(([k]) => k),
  )
}

/**
 * Format the "(+ N dependencies)" suffix for install success messages.
 * Returns empty string when `installedDeps` is empty.
 */
export function formatDependencyCountSuffix(installedDeps: string[]): string {
  if (installedDeps.length === 0) return ''
  const n = installedDeps.length
  const names = installedDeps.map(id => parsePluginIdentifier(id).name)
  const displayedNames =
    names.length <= 5 ? names.join(', ') : `${names.slice(0, 5).join(', ')}, …`
  return ` (+ ${n} ${plural(n, 'dependency', 'dependencies')}: ${displayedNames})`
}

/**
 * Format the "warning: required by X, Y" suffix for uninstall/disable
 * results. Em-dash style for CLI result messages (not the middot style
 * used in the notification UI). Returns empty string when no dependents.
 */
export function formatReverseDependentsSuffix(
  rdeps: string[] | undefined,
): string {
  if (!rdeps || rdeps.length === 0) return ''
  return ` — warning: required by ${rdeps.join(', ')}`
}
