const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_AGENTS_HANDLER_GROUPS_EVIDENCE_IDS = Object.freeze([
  'target121-agents-handler-authenticated-whole-function',
  'target121-agents-handler-exact-alpha-pair',
  'target121-agents-handler-groups-local-invariant',
  'target121-agents-handler-source-semantic-owner',
])

export const TARGET121_AGENTS_HANDLER_GROUPS_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:22062`,
    targetIndex: 22062,
    paths: Object.freeze(['src/cli/handlers/agents.ts']),
    declarations: Object.freeze(['agentsHandler']),
    evidenceIds: TARGET121_AGENTS_HANDLER_GROUPS_EVIDENCE_IDS,
    behavior:
      'The authenticated Target121 agent-list renderer is a complete identifier-renamed counterpart of paired Target120 u21961: byte length, token count, identifier-normalized tokens, canonical AST, statement shape, and every retained property span are identical. In particular, groups occupies the same local AST property path and byte offset in both units; its targetAdded flag and lone strict residue are bundle-global occurrence drift, not a Target121 behavior addition. Target120 and Target121 agents.ts are byte-identical and independently preserve the allAgents/source/override/totalActive grouping semantics under the agentsHandler declaration. This is a static complete-function inherited-owner proof; no source replay or source write is warranted.',
  }),
])
