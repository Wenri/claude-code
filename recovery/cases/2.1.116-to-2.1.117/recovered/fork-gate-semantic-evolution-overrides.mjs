const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_FORK_GATE_SEMANTIC_EVOLUTION_EVIDENCE_IDS =
  Object.freeze([
    'target117-fork-gate-authenticated-resolver-whole-unit',
    'target117-fork-gate-exact-through-target120-lineage',
    'target117-fork-gate-target121-priority-evolution-blocker',
  ])

export const TARGET117_FORK_GATE_SEMANTIC_EVOLUTION_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:8727`,
      targetIndex: 8727,
      paths: Object.freeze(['src/tools/AgentTool/forkSubagent.ts']),
      declarations: Object.freeze(['resolveForkSubagentSource']),
      evidenceIds: TARGET117_FORK_GATE_SEMANTIC_EVOLUTION_EVIDENCE_IDS,
      behavior:
        'Authenticated Target117 resolves the fork source in historical priority order: coordinator-disabled, noninteractive-disabled, environment override, GrowthBook rollout, then disabled. The exact unit persists through Target120; Target121 deliberately moves the environment override ahead of noninteractive mode, so this is a static semantic-evolution proof and never a later-source replay.',
    }),
  ])
