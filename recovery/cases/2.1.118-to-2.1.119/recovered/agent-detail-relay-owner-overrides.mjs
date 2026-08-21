const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_AGENT_DETAIL_RELAY_EVIDENCE_IDS = Object.freeze([
  'target119-agent-detail-relay-authenticated-target-fragment',
  'target119-agent-detail-relay-source-ast-test',
  'target119-agent-detail-relay-compiler-normalization-test',
])

export const TARGET119_AGENT_DETAIL_RELAY_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:17642`,
    targetIndex: 17642,
    paths: Object.freeze(['src/components/agents/AgentDetail.tsx']),
    declarations: Object.freeze(['AgentDetail', 'renderToolsList']),
    evidenceIds: TARGET119_AGENT_DETAIL_RELAY_EVIDENCE_IDS,
    behavior:
      'The AgentDetail tool renderer distinguishes wildcard, empty, valid, unavailable, and unrecognized tool sets; unavailable tools retain their warning glyph and subagent-specific label.',
  }),
  Object.freeze({
    key: `${CASE_NAME}:19600`,
    targetIndex: 19600,
    paths: Object.freeze(['src/upstreamproxy/relay.ts']),
    declarations: Object.freeze([
      'node:net import',
      'startUpstreamProxyRelay',
    ]),
    evidenceIds: TARGET119_AGENT_DETAIL_RELAY_EVIDENCE_IDS,
    behavior:
      'The upstream proxy relay owns the Node TCP createServer import; Bun lowers the authored node:net specifier to the authenticated runtime require("net") module initializer.',
  }),
])
