const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_BACKGROUND_TASKS_KILL_ALL_SHORTCUT_EVIDENCE_IDS =
  Object.freeze([
    'target121-background-tasks-kill-all-whole-unit-proof',
    'target121-background-tasks-kill-all-source-owner-proof',
    'target121-background-tasks-kill-all-caller-graph-proof',
    'target121-background-tasks-kill-all-u17497-contract-proof',
  ])

export const TARGET121_BACKGROUND_TASKS_KILL_ALL_SHORTCUT_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:17548`,
      targetIndex: 17548,
      paths: Object.freeze([
        'src/components/tasks/BackgroundTasksDialog.tsx',
      ]),
      declarations: Object.freeze(['BackgroundTasksDialog']),
      evidenceIds:
        TARGET121_BACKGROUND_TASKS_KILL_ALL_SHORTCUT_EVIDENCE_IDS,
      behavior:
        'BackgroundTasksDialog counts running background local-agent tasks and changes the kill-all shortcut from a list-wide any-running hint to a greater-than-one guard. In list mode the hint is nested beside stop only for a selected running local agent; in local-agent detail mode the same guard conditionally supplies killAllAgentsShortcut to AsyncAgentDetailDialog. The complete Target121 u17548 unit reduces exactly to Target120 u17428 after reversing those three changes under identifier-relation-preserving canonicalization. This runtime contract is cohesive with the separately proved u17497 consumer, but source replay remains blocked: recovered BackgroundTasksDialog source omits the new guard/call/action shape plus retained onBack, ctrl/meta, and lower-case-format semantics, recovered AgentsMenu omits a retained onBack caller, and recovered AsyncAgentDetailDialog omits the consuming prop and other retained behavior. The evidence therefore supports a static complete-unit owner correction only, not an isolated or guessed source replay.',
    }),
  ])
