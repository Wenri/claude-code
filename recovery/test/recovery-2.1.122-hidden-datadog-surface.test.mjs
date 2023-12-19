import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = [
  {
    version: '2.1.121',
    env: 'CLAUDE_CODE_2_1_121_BUNDLE',
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
]

const EXPECTED_EVENTS = `
chrome_bridge_connection_succeeded
chrome_bridge_connection_failed
chrome_bridge_disconnected
chrome_bridge_tool_call_completed
chrome_bridge_tool_call_error
chrome_bridge_tool_call_started
chrome_bridge_tool_call_timeout
tengu_api_error
tengu_api_success
tengu_auto_mode_decision
tengu_auto_mode_denial_limit_exceeded
tengu_auto_mode_malformed_tool_input
tengu_auto_mode_opt_in_dialog_accept
tengu_auto_mode_opt_in_dialog_accept_default
tengu_auto_mode_opt_in_dialog_decline
tengu_auto_mode_opt_in_dialog_decline_dont_ask
tengu_auto_mode_opt_in_dialog_shown
tengu_auto_mode_outcome
tengu_auto_mode_subsequent_approval
tengu_brief_mode_enabled
tengu_brief_mode_toggled
tengu_brief_send
tengu_cancel
tengu_compact_failed
tengu_copper_lantern
tengu_exit
tengu_flicker
tengu_headless_mcp_prewait
tengu_init
tengu_mcp_tools_refreshed_mid_turn
tengu_model_fallback_triggered
tengu_oauth_error
tengu_oauth_success
tengu_oauth_token_refresh_failure
tengu_oauth_token_refresh_success
tengu_oauth_token_refresh_lock_acquiring
tengu_oauth_token_refresh_lock_acquired
tengu_oauth_token_refresh_starting
tengu_oauth_token_refresh_completed
tengu_oauth_token_refresh_lock_releasing
tengu_oauth_token_refresh_lock_released
tengu_query_error
tengu_sdk_control_roundtrip
tengu_sdk_init_handshake
tengu_sdk_result
tengu_sdk_schema_violation
tengu_sdk_session_crash
tengu_sdk_stall
tengu_sdk_ttft
tengu_session_file_read
tengu_started
tengu_tool_use_error
tengu_tool_use_granted_in_prompt_permanent
tengu_tool_use_granted_in_prompt_temporary
tengu_tool_use_rejected_in_prompt
tengu_tool_use_success
tengu_uncaught_exception
tengu_unhandled_rejection
tengu_voice_recording_started
tengu_voice_toggled
tengu_vscode_sdk_stream_ended_no_result
tengu_team_mem_sync_pull
tengu_team_mem_sync_push
tengu_team_mem_sync_started
tengu_team_mem_entries_capped
tengu_timer
tengu_bg_adopt
tengu_bg_agent_action
tengu_bg_agent_dispatch
tengu_bg_agent_terminal
tengu_bg_attach
tengu_bg_attach_first_frame
tengu_bg_attach_legacy_autorespawn
tengu_bg_classify
tengu_bg_daemon_cold_start_ask
tengu_bg_daemon_cold_start_ask_answer
tengu_bg_daemon_install
tengu_bg_daemon_spawn_failed
tengu_bg_daemon_zombie_restart
tengu_bg_dispatch
tengu_bg_dispatch_fallback
tengu_bg_dispatch_sigkill_escalate
tengu_bg_killjob_ctrl_fallback
tengu_bg_orphan_reap
tengu_bg_proto_mismatch
tengu_bg_pty_unavailable
tengu_bg_respawn_exhausted
tengu_bg_respawn_stale
tengu_bg_respawn_unconfirmed_bail
tengu_bg_retired
tengu_bg_roster_parse_failed
tengu_bg_skew_nudge
tengu_bg_spare_claim
tengu_bg_spare_claim_fail
tengu_bg_spare_spawn
tengu_bg_worker_exit
tengu_bg_worker_spawn
tengu_daemon_cold_start_prompt
tengu_daemon_config_reload
tengu_daemon_idle_exit
tengu_daemon_install_prompt_answer
tengu_daemon_lease
tengu_daemon_peer_uid_reject
tengu_daemon_self_restart_on_upgrade
tengu_daemon_start
tengu_daemon_startup_crash
tengu_daemon_worker_crash
tengu_daemon_worker_permanent_exit
tengu_daemon_yield
tengu_daemon_yield_takeover
`.trim().split('\n')

const EXPECTED_TAG_FIELDS = [
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
]

function readBundle(release) {
  const filename = process.env[release.env]
  assert.ok(filename, `${release.env} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return bytes.toString('utf8')
}

function quotedStrings(contents) {
  return [...contents.matchAll(/["']([^"']+)["']/g)].map(match => match[1])
}

function bundleSurface(contents) {
  const anchor = contents.lastIndexOf('"chrome_bridge_connection_succeeded"')
  assert.ok(anchor >= 0, 'Datadog allowlist anchor')
  const eventStart = contents.lastIndexOf('new Set([', anchor)
  const eventEnd = contents.indexOf('])', anchor)
  assert.ok(eventStart >= 0 && eventEnd > eventStart, 'Datadog allowlist bounds')
  const tagStart = contents.indexOf('[', eventEnd + 2)
  const tagEnd = contents.indexOf(']', tagStart)
  assert.ok(tagStart > eventEnd && tagEnd > tagStart, 'Datadog tag bounds')
  return {
    events: quotedStrings(contents.slice(eventStart, eventEnd + 2)),
    tags: quotedStrings(contents.slice(tagStart, tagEnd + 1)),
  }
}

function sourceSurface(contents) {
  const events = contents.match(
    /const DATADOG_ALLOWED_EVENTS = new Set\(\[([\s\S]*?)\]\)/,
  )
  const tags = contents.match(/const TAG_FIELDS = \[([\s\S]*?)\]/)
  assert.ok(events, 'source Datadog allowlist')
  assert.ok(tags, 'source Datadog tags')
  return {
    events: quotedStrings(events[1]),
    tags: quotedStrings(tags[1]),
  }
}

test('authenticates the retained Datadog event and tag surfaces exactly', () => {
  for (const release of releases) {
    const surface = bundleSurface(readBundle(release))
    assert.deepEqual(surface.events, EXPECTED_EVENTS, `${release.version}: events`)
    assert.deepEqual(surface.tags, EXPECTED_TAG_FIELDS, `${release.version}: tags`)
  }
})

test('source reproduces the authenticated Datadog surfaces exactly', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/services/analytics/datadog.ts'),
    'utf8',
  )
  const surface = sourceSurface(source)
  assert.deepEqual(surface.events, EXPECTED_EVENTS)
  assert.deepEqual(surface.tags, EXPECTED_TAG_FIELDS)
})
