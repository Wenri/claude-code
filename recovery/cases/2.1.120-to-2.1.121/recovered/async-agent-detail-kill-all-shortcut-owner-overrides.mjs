const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_ASYNC_AGENT_KILL_ALL_SHORTCUT_EVIDENCE_IDS =
  Object.freeze([
    'target121-async-agent-detail-kill-all-whole-unit-proof',
    'target121-async-agent-detail-kill-all-source-owner-proof',
    'target121-async-agent-detail-kill-all-caller-boundary-proof',
  ])

export const TARGET121_ASYNC_AGENT_KILL_ALL_SHORTCUT_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:17497`,
      targetIndex: 17497,
      paths: Object.freeze([
        'src/components/tasks/AsyncAgentDetailDialog.tsx',
      ]),
      declarations: Object.freeze(['Props', 'AsyncAgentDetailDialog']),
      evidenceIds:
        TARGET121_ASYNC_AGENT_KILL_ALL_SHORTCUT_EVIDENCE_IDS,
      behavior:
        'AsyncAgentDetailDialog accepts an optional killAllAgentsShortcut display string and, while the agent is running, appends a lower-case formatted “stop all agents” KeyboardShortcutHint to its input guide. The complete Target121 unit reduces exactly to its Target120 predecessor after removing that prop, hint cache pair, and guide child while normalizing compiler cache indices. Available mapped source omits the prop and also predates a retained Target120 ctrl/meta keyguard; moreover the still-unrecovered BackgroundTasksDialog u17548 caller computes and supplies this prop only when more than one local agent is running. This is therefore a static complete-unit owner proof, and isolated source replay is explicitly blocked until the caller/source graph is recovered atomically.',
    }),
  ])
