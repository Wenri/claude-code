const CASE_NAME = '2.1.117-to-2.1.118'
const OWNER_PATH = 'src/bridge/clientPresence.ts'

export const TARGET118_BRIDGE_CLIENT_PRESENCE_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:18737`,
    targetIndex: 18737,
    paths: Object.freeze([OWNER_PATH]),
    declarations: Object.freeze([
      'setupBridgeClientPresence',
      'cleanupBridgeClientPresence',
      'pulseBridgeClientPresence',
    ]),
    evidenceIds: Object.freeze([
      'target118-bridge-client-presence-target-fragment',
      'target118-bridge-client-presence-source-ast-test',
    ]),
    behavior:
      'The authenticated Target118 presence-pulse unit is the exact compiled form of src/bridge/clientPresence.ts#pulseBridgeClientPresence: it throttles pulses, preserves connected_at, posts client_id to the session presence endpoint with authenticated Anthropic headers, logs HTTP failures, and swallows transport rejection. The adjacent setup, cleanup, state, and random client ID form one pinned owner cluster; bridgePermissionCallbacks is unrelated.',
  }),
])
