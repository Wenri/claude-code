#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_DATADOG_EVENT_CATALOG_INPUT_FILES = Object.freeze([
  Object.freeze({
    path: 'src/services/analytics/datadog.ts',
    bytes: 9101,
    sha256: '10d740d70976636ee082b820cc1b8dc4341fb1c21fc89eb61d72212e1d64675d',
  }),
])

export const TARGET121_DATADOG_EVENT_CATALOG_OUTPUT_FILES = Object.freeze([
  Object.freeze({
    path: 'src/services/analytics/datadog.ts',
    bytes: 11308,
    sha256: '4faf8d5d88dbe58775b886ec50a4ebbda7d948b2751f5cb879d7cef70a26574f',
  }),
])

const EVIDENCE_IDS = Object.freeze([
  'target121-datadog-event-catalog-target-fragment',
  'target121-datadog-event-catalog-source-replay-test',
  'target121-datadog-event-catalog-source-ast-test',
])

export const TARGET121_DATADOG_EVENT_CATALOG_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:6786`,
    targetIndex: 6786,
    paths: Object.freeze(['src/services/analytics/datadog.ts']),
    evidenceIds: EVIDENCE_IDS,
    behavior:
      'The authenticated Datadog initializer owns the complete Target121 event allowlist and tag-field catalog. The bounded replay restores the exact 110-event catalog, including the added background/daemon lifecycle telemetry, removes three retired daemon events, and restores the 23 exact searchable tag fields without attributing producer-local event strings to their callers.',
  }),
])

export const TARGET121_DATADOG_EVENT_CATALOG_EVIDENCE_IDS = EVIDENCE_IDS

const RAW_ALLOWED_EVENTS = Object.freeze([
  'chrome_bridge_connection_succeeded',
  'chrome_bridge_connection_failed',
  'chrome_bridge_disconnected',
  'chrome_bridge_tool_call_completed',
  'chrome_bridge_tool_call_error',
  'chrome_bridge_tool_call_started',
  'chrome_bridge_tool_call_timeout',
  'tengu_api_error',
  'tengu_api_success',
  'tengu_brief_mode_enabled',
  'tengu_brief_mode_toggled',
  'tengu_brief_send',
  'tengu_cancel',
  'tengu_compact_failed',
  'tengu_exit',
  'tengu_flicker',
  'tengu_init',
  'tengu_model_fallback_triggered',
  'tengu_oauth_error',
  'tengu_oauth_success',
  'tengu_oauth_token_refresh_failure',
  'tengu_oauth_token_refresh_success',
  'tengu_oauth_token_refresh_lock_acquiring',
  'tengu_oauth_token_refresh_lock_acquired',
  'tengu_oauth_token_refresh_starting',
  'tengu_oauth_token_refresh_completed',
  'tengu_oauth_token_refresh_lock_releasing',
  'tengu_oauth_token_refresh_lock_released',
  'tengu_query_error',
  'tengu_session_file_read',
  'tengu_started',
  'tengu_tool_use_error',
  'tengu_tool_use_granted_in_prompt_permanent',
  'tengu_tool_use_granted_in_prompt_temporary',
  'tengu_tool_use_rejected_in_prompt',
  'tengu_tool_use_success',
  'tengu_uncaught_exception',
  'tengu_unhandled_rejection',
  'tengu_voice_recording_started',
  'tengu_voice_toggled',
  'tengu_team_mem_sync_pull',
  'tengu_team_mem_sync_push',
  'tengu_team_mem_sync_started',
  'tengu_team_mem_entries_capped',
])

const RAW_TAG_FIELDS = Object.freeze([
  'arch',
  'clientType',
  'errorType',
  'http_status_range',
  'http_status',
  'kairosActive',
  'model',
  'platform',
  'provider',
  'skillMode',
  'subscriptionType',
  'toolName',
  'userBucket',
  'userType',
  'version',
  'versionBase',
])

export const TARGET121_DATADOG_ALLOWED_EVENTS = Object.freeze([
  'chrome_bridge_connection_succeeded',
  'chrome_bridge_connection_failed',
  'chrome_bridge_disconnected',
  'chrome_bridge_tool_call_completed',
  'chrome_bridge_tool_call_error',
  'chrome_bridge_tool_call_started',
  'chrome_bridge_tool_call_timeout',
  'tengu_api_error',
  'tengu_api_success',
  'tengu_auto_mode_decision',
  'tengu_auto_mode_denial_limit_exceeded',
  'tengu_auto_mode_malformed_tool_input',
  'tengu_auto_mode_opt_in_dialog_accept',
  'tengu_auto_mode_opt_in_dialog_accept_default',
  'tengu_auto_mode_opt_in_dialog_decline',
  'tengu_auto_mode_opt_in_dialog_decline_dont_ask',
  'tengu_auto_mode_opt_in_dialog_shown',
  'tengu_auto_mode_outcome',
  'tengu_auto_mode_subsequent_approval',
  'tengu_brief_mode_enabled',
  'tengu_brief_mode_toggled',
  'tengu_brief_send',
  'tengu_cancel',
  'tengu_compact_failed',
  'tengu_copper_lantern',
  'tengu_exit',
  'tengu_flicker',
  'tengu_headless_mcp_prewait',
  'tengu_init',
  'tengu_mcp_tools_refreshed_mid_turn',
  'tengu_model_fallback_triggered',
  'tengu_oauth_error',
  'tengu_oauth_success',
  'tengu_oauth_token_refresh_failure',
  'tengu_oauth_token_refresh_success',
  'tengu_oauth_token_refresh_lock_acquiring',
  'tengu_oauth_token_refresh_lock_acquired',
  'tengu_oauth_token_refresh_starting',
  'tengu_oauth_token_refresh_completed',
  'tengu_oauth_token_refresh_lock_releasing',
  'tengu_oauth_token_refresh_lock_released',
  'tengu_query_error',
  'tengu_sdk_control_roundtrip',
  'tengu_sdk_init_handshake',
  'tengu_sdk_result',
  'tengu_sdk_schema_violation',
  'tengu_sdk_session_crash',
  'tengu_sdk_stall',
  'tengu_sdk_ttft',
  'tengu_session_file_read',
  'tengu_started',
  'tengu_tool_use_error',
  'tengu_tool_use_granted_in_prompt_permanent',
  'tengu_tool_use_granted_in_prompt_temporary',
  'tengu_tool_use_rejected_in_prompt',
  'tengu_tool_use_success',
  'tengu_uncaught_exception',
  'tengu_unhandled_rejection',
  'tengu_voice_recording_started',
  'tengu_voice_toggled',
  'tengu_vscode_sdk_stream_ended_no_result',
  'tengu_team_mem_sync_pull',
  'tengu_team_mem_sync_push',
  'tengu_team_mem_sync_started',
  'tengu_team_mem_entries_capped',
  'tengu_timer',
  'tengu_bg_adopt',
  'tengu_bg_agent_action',
  'tengu_bg_agent_dispatch',
  'tengu_bg_agent_terminal',
  'tengu_bg_attach',
  'tengu_bg_attach_first_frame',
  'tengu_bg_attach_legacy_autorespawn',
  'tengu_bg_classify',
  'tengu_bg_daemon_cold_start_ask',
  'tengu_bg_daemon_cold_start_ask_answer',
  'tengu_bg_daemon_install',
  'tengu_bg_daemon_spawn_failed',
  'tengu_bg_daemon_zombie_restart',
  'tengu_bg_dispatch',
  'tengu_bg_dispatch_fallback',
  'tengu_bg_dispatch_sigkill_escalate',
  'tengu_bg_killjob_ctrl_fallback',
  'tengu_bg_orphan_reap',
  'tengu_bg_proto_mismatch',
  'tengu_bg_pty_unavailable',
  'tengu_bg_respawn_exhausted',
  'tengu_bg_respawn_stale',
  'tengu_bg_respawn_unconfirmed_bail',
  'tengu_bg_retired',
  'tengu_bg_roster_parse_failed',
  'tengu_bg_skew_nudge',
  'tengu_bg_spare_claim',
  'tengu_bg_spare_claim_fail',
  'tengu_bg_spare_spawn',
  'tengu_bg_worker_exit',
  'tengu_bg_worker_spawn',
  'tengu_daemon_cold_start_prompt',
  'tengu_daemon_config_reload',
  'tengu_daemon_idle_exit',
  'tengu_daemon_install_prompt_answer',
  'tengu_daemon_lease',
  'tengu_daemon_peer_uid_reject',
  'tengu_daemon_self_restart_on_upgrade',
  'tengu_daemon_start',
  'tengu_daemon_startup_crash',
  'tengu_daemon_worker_crash',
  'tengu_daemon_worker_permanent_exit',
  'tengu_daemon_yield',
  'tengu_daemon_yield_takeover',
])

export const TARGET121_DATADOG_TAG_FIELDS = Object.freeze([
  'arch',
  'clientType',
  'decision',
  'entrypoint',
  'errorType',
  'sessionKind',
  'http_status_range',
  'http_status',
  'kairosActive',
  'model',
  'op',
  'outcome',
  'platform',
  'provider',
  'skillMode',
  'coachMode',
  'source',
  'subscriptionType',
  'toolName',
  'userBucket',
  'userType',
  'version',
  'versionBase',
])

function renderValues(values) {
  return values.map(value => `  '${value}',`).join('\n')
}

function renderAllowedEvents(values) {
  return `const DATADOG_ALLOWED_EVENTS = new Set([\n${renderValues(values)}\n])`
}

function renderTagFields(values) {
  return `const TAG_FIELDS = [\n${renderValues(values)}\n]`
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function matches(actual, expected) {
  return actual.bytes === expected.bytes && actual.sha256 === expected.sha256
}

function replaceExactly(input, before, after, label) {
  const first = input.indexOf(before)
  const second = input.indexOf(before, first + 1)
  if (first < 0 || second >= 0) {
    throw new Error(`${CASE_NAME}: ${label} replay anchor differs`)
  }
  return input.slice(0, first) + after + input.slice(first + before.length)
}

export function buildTarget121DatadogEventCatalogOutput(datadog) {
  return replaceExactly(
    replaceExactly(
      datadog,
      renderAllowedEvents(RAW_ALLOWED_EVENTS),
      renderAllowedEvents(TARGET121_DATADOG_ALLOWED_EVENTS),
      'Datadog event allowlist',
    ),
    renderTagFields(RAW_TAG_FIELDS),
    renderTagFields(TARGET121_DATADOG_TAG_FIELDS),
    'Datadog tag fields',
  )
}

export function applyTarget121DatadogEventCatalogSourceRecovery({ sourceRoot }) {
  const input = TARGET121_DATADOG_EVENT_CATALOG_INPUT_FILES[0]
  const output = TARGET121_DATADOG_EVENT_CATALOG_OUTPUT_FILES[0]
  const filename = path.join(sourceRoot, input.path.replace(/^src\//, ''))
  const raw = fs.readFileSync(filename)
  const actual = descriptor(raw)
  if (matches(actual, output)) {
    return { status: 'already-recovered', files: [] }
  }
  if (!matches(actual, input)) {
    throw new Error(
      `${CASE_NAME}: Datadog event-catalog replay requires its exact raw or recovered source state`,
    )
  }
  const recovered = Buffer.from(
    buildTarget121DatadogEventCatalogOutput(raw.toString('utf8')),
    'utf8',
  )
  if (!matches(descriptor(recovered), output)) {
    throw new Error(
      `${CASE_NAME}: Datadog event-catalog replay produced unexpected source`,
    )
  }
  fs.writeFileSync(filename, recovered)
  return { status: 'recovered', files: [output.path] }
}
