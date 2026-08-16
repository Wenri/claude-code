import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import {
  getRuntimeCapabilities,
  isReplBridgeActive,
} from '../bootstrap/state.js'
import {
  isBgSession,
  isFleetViewWatching,
} from './concurrentSessions.js'
import { logForDebugging } from './debug.js'
import type { ClassifiedState, ClassifierEngine } from '../jobs/classifier.js'

export type ClassifierSurface =
  | 'bg'
  | 'watched'
  | 'ccr'
  | 'bridge'
  | 'desktop'
  | 'cli'
export type ClassifierSink = 'state' | 'summary'

export interface PostTurnSummary {
  status_category: 'blocked' | 'review_ready'
  status_detail: string
  needs_action: string
}

const sinksBySurface: Record<ClassifierSurface, ClassifierSink[]> = {
  bg: ['state'],
  watched: ['state'],
  ccr: ['summary'],
  bridge: ['summary'],
  desktop: ['summary'],
  cli: ['summary'],
}

const REMOTE_CCR_ENTRYPOINTS = new Set([
  'remote',
  'remote_desktop',
  'remote_mobile',
])

function envBoolean(value: string | undefined): boolean {
  if (value === undefined) return false
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

export function isPostTurnSummaryVisibleInCli(): boolean {
  return false
}

export function detectSurfaces(options?: {
  isBackground?: boolean
  isWatched?: boolean
  isCcr?: boolean
  isBridge?: boolean
}): Set<ClassifierSurface> {
  if (
    options?.isBackground ??
    isBgSession()
  ) {
    return new Set(['bg'])
  }
  const surfaces = new Set<ClassifierSurface>()
  if (options?.isWatched ?? isFleetViewWatching()) surfaces.add('watched')
  let isCcr = options?.isCcr
  if (isCcr === undefined) {
    if (getRuntimeCapabilities().workspace === 'remote') {
      isCcr = true
    } else if (
      envBoolean(process.env.CLAUDE_CODE_REMOTE) &&
      !process.env.BUGHUNTER_FLEET_SIZE
    ) {
      isCcr = REMOTE_CCR_ENTRYPOINTS.has(
        process.env.CLAUDE_CODE_ENTRYPOINT ?? 'remote',
      )
    }
  }
  if (isCcr) {
    surfaces.add('ccr')
  }
  if (
    options?.isBridge ??
    (process.env.CLAUDE_CODE_ENVIRONMENT_KIND === 'bridge' ||
      isReplBridgeActive())
  ) {
    surfaces.add('bridge')
  }
  if (process.env.CLAUDE_CODE_ENTRYPOINT === 'claude-desktop') {
    surfaces.add('desktop')
  }
  if (isPostTurnSummaryVisibleInCli()) surfaces.add('cli')
  return surfaces
}

let loggedUnknownSurface = false

function disabledSurfaces(value: string): Set<ClassifierSurface> {
  const result = new Set<ClassifierSurface>()
  for (const part of value.split(',')) {
    const surface = part.trim()
    if (!surface) continue
    if (surface in sinksBySurface) result.add(surface as ClassifierSurface)
    else if (!loggedUnknownSurface) {
      loggedUnknownSurface = true
      logForDebugging(
        `[classifier] tengu_classifier_disabled_surfaces: unknown surface '${surface}' ignored`,
      )
    }
  }
  return result
}

export function sinksFor(
  surfaces: ReadonlySet<ClassifierSurface>,
): Set<ClassifierSink> {
  const sinks = new Set<ClassifierSink>()
  const disabled = disabledSurfaces(
    getFeatureValue_CACHED_MAY_BE_STALE(
      'tengu_classifier_disabled_surfaces',
      '',
    ),
  )
  for (const surface of surfaces) {
    if (disabled.has(surface)) continue
    for (const sink of sinksBySurface[surface]) sinks.add(sink)
  }
  if (surfaces.has('bg')) sinks.delete('summary')
  if (
    getFeatureValue_CACHED_MAY_BE_STALE(
      'tengu_classifier_summary_kill',
      false,
    )
  ) {
    sinks.delete('summary')
  }
  return sinks
}

function emittedEngine(): ClassifierEngine | null {
  if (
    getFeatureValue_CACHED_MAY_BE_STALE(
      'tengu_classifier_summary_llm_emit',
      false,
    )
  ) {
    return 'llm'
  }
  if (
    getFeatureValue_CACHED_MAY_BE_STALE(
      'tengu_classifier_summary_heuristic_emit',
      false,
    )
  ) {
    return 'heuristic'
  }
  return null
}

export function engineFor(
  sinks: ReadonlySet<ClassifierSink>,
): ClassifierEngine | null {
  if (sinks.size === 0) return null
  let engine: ClassifierEngine | null
  if (sinks.has('state')) engine = 'llm'
  else if (process.env.CLAUDE_CODE_CLASSIFIER_SUMMARY !== undefined) {
    engine = envBoolean(process.env.CLAUDE_CODE_CLASSIFIER_SUMMARY)
      ? 'llm'
      : 'heuristic'
  } else engine = emittedEngine()
  if (
    engine === 'llm' &&
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_cobalt_wren', false)
  ) {
    return 'heuristic'
  }
  return engine
}

export function classifiedToPostTurnSummary(
  classified: Pick<ClassifiedState, 'state' | 'detail' | 'needs'>,
): PostTurnSummary {
  return {
    status_category:
      classified.state === 'blocked' ? 'blocked' : 'review_ready',
    status_detail: classified.detail,
    needs_action:
      classified.state === 'blocked' ? (classified.needs ?? '') : '',
  }
}

export function runClassifierSummaryForBlocked(
  permissionRequest: { tool_name: string },
  transport?: {
    notifyMetadataChanged(metadata: {
      post_turn_summary: PostTurnSummary
    }): void
  },
): void {
  const sinks = sinksFor(detectSurfaces())
  if (!sinks.has('summary') || engineFor(sinks) === null) return
  transport?.notifyMetadataChanged({
    post_turn_summary: {
      status_category: 'blocked',
      status_detail: `Waiting on permission: ${permissionRequest.tool_name}`,
      needs_action: `Approve or deny ${permissionRequest.tool_name}`,
    },
  })
}
