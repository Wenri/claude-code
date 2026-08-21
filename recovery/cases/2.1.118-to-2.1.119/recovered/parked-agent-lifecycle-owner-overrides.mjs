const CASE_NAME = '2.1.118-to-2.1.119'
const OWNER_PATH = 'src/tasks/LocalAgentTask/LocalAgentTask.tsx'

export const TARGET119_PARKED_AGENT_LIFECYCLE_EVIDENCE_IDS = Object.freeze([
  'target119-parked-agent-lifecycle-target-fragments',
  'target119-parked-agent-lifecycle-forward-lineage',
  'target119-parked-agent-lifecycle-source-semantic-equivalence',
])

export const TARGET119_PARKED_AGENT_LIFECYCLE_OWNER_OVERRIDES = Object.freeze(
  [14966, 14967].map(targetIndex =>
    Object.freeze({
      key: `${CASE_NAME}:${targetIndex}`,
      targetIndex,
      paths: Object.freeze([OWNER_PATH]),
      declarations: Object.freeze([
        'getAgentKeepaliveReasons',
        'computeEvictAfter',
        'selectWakeDispatches',
      ]),
      evidenceIds: TARGET119_PARKED_AGENT_LIFECYCLE_EVIDENCE_IDS,
      behavior:
        'The authenticated lifecycle classifier and parked predicate are adjacent to LocalAgentTask keepalive/eviction helpers and feed the wake-router task-notification selector. The recovered source expresses the same parked condition inline, while the two target units persist exactly through Target121; this is a static semantic owner proof and does not invent private authored helper names.',
    }),
  ),
)
