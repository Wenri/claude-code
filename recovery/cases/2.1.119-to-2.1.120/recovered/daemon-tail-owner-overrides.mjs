export const TARGET120_DAEMON_TAIL_OWNER_OVERRIDES = {
  18695: ['src/daemon/client.ts'],
  18705: ['src/cli/bg.ts'],
  19467: ['src/daemon/supervisor.ts'],
  19531: ['src/daemon/main.ts'],
}

export const TARGET120_DAEMON_TAIL_OWNER_BEHAVIORS = {
  18695:
    'Interactive daemon startup owns the persistent-service prompt, telemetry, fallback, and dismissal branches emitted by the authenticated target unit.',
  18705:
    'The background attach loop owns the terminal reconnect banner and transient-daemon retry emitted by the authenticated target unit.',
  19467:
    'The supervisor owns retiring-job rejection, DEC-mode snapshots, attacher tracking, and settled cleanup emitted by the authenticated target unit.',
  19531:
    'The daemon command dispatcher owns service policy, detached-process status, stop behavior, and daemon-control telemetry emitted by the authenticated target unit.',
}
