const CASE_NAME = '2.1.120-to-2.1.121'

const EVIDENCE_IDS = Object.freeze([
  'target121-usage-contributors-authenticated-target-fragment',
  'target121-usage-contributors-exact-source-owner-test',
  'target121-usage-contributors-compiler-normalization-test',
])

function override(targetIndex, behavior) {
  return Object.freeze({
    key: `${CASE_NAME}:${targetIndex}`,
    targetIndex,
    paths: Object.freeze([
      'src/components/Settings/UsageContributors.tsx',
    ]),
    evidenceIds: EVIDENCE_IDS,
    behavior,
  })
}

export const TARGET121_USAGE_CONTRIBUTORS_OWNER_OVERRIDES = Object.freeze([
  override(
    16054,
    'The authenticated unit creates the usage-contributor accumulator with cost, request, cache-miss, long-context, session, time-bucket, agent, skill, and plugin state. The target abbreviates longContextCost/longContextCount as longCtxCost/longCtxCount; it is not OverageCreditUpsell UI.',
  ),
  override(
    16056,
    'The authenticated unit adds one usage record to the contributor accumulator, attributing cost to agents, skills, and plugins while counting cache misses, long-context input, sessions, subagents, hourly activity, and five-minute concurrency buckets.',
  ),
  override(
    16057,
    'The authenticated unit finalizes usage-contributor statistics: it derives cache-miss, long-context, subagent-heavy, high-parallel, and cron behavior totals and summarizes agent, skill, and plugin attribution.',
  ),
])

export const TARGET121_USAGE_CONTRIBUTORS_EVIDENCE_IDS = EVIDENCE_IDS
