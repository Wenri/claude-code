const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_SUBAGENT_STATUS_LINE_SCHEMA_EVIDENCE_IDS =
  Object.freeze([
    'target119-subagent-status-line-schema-whole-initializer-proof',
    'target119-subagent-status-line-retained-residue-proof',
    'target119-subagent-status-line-runtime-caller-proof',
    'target119-subagent-status-line-later-source-owner-proof',
    'target119-subagent-status-line-temporal-boundary-proof',
    'target119-subagent-status-line-static-replay-blocker',
  ])

export const TARGET119_SUBAGENT_STATUS_LINE_SCHEMA_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20274`,
      targetIndex: 20274,
      paths: Object.freeze(['src/utils/subagentStatusLine.ts']),
      declarations: Object.freeze([
        'SubagentStatusLineOutputSchema',
        'executeSubagentStatusLine',
      ]),
      evidenceIds: TARGET119_SUBAGENT_STATUS_LINE_SCHEMA_EVIDENCE_IDS,
      behavior:
        'The complete authenticated Target119 subagent-status-line schema initializer is alpha-canonically identical to Target118, and all five owner properties occur at identical relative offsets with identical bytes. The apparent Target119-added id property is therefore global occurrence-order drift. Its adjacent executeSubagentStatusLine runtime caller and constants are also exact Target118 lineages and bind the lazy {id:string,content:string} schema to safeParse and the returned decoration map. The authored owner path and declaration are first recoverable in Target120, but that later source compiles to an expanded execution function and initializer and depends on CoordinatorAgentStatus integration absent from the Target119 source snapshot. This is a static whole-unit owner proof and never authorizes replay of the later source.',
    }),
  ])
