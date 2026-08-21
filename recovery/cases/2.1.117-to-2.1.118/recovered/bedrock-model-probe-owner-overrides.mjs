const CASE_NAME = '2.1.117-to-2.1.118'

export const TARGET118_BEDROCK_MODEL_PROBE_EVIDENCE_IDS = Object.freeze([
  'target118-bedrock-model-probe-authenticated-unit',
  'target118-bedrock-model-probe-source-ast-test',
])

export const TARGET118_BEDROCK_MODEL_PROBE_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:20412`,
    targetIndex: 20412,
    paths: Object.freeze(['src/utils/model/bedrockUpgrade.ts']),
    declarations: Object.freeze(['probeBedrockModel']),
    evidenceIds: TARGET118_BEDROCK_MODEL_PROBE_EVIDENCE_IDS,
    behavior:
      'The authenticated Target118 function is the exact compiled probeBedrockModel contract: it constructs an AnthropicBedrock client with the tier-specific region, zero retries, an eight-second timeout, proxy fetch options, bearer-token or refreshed AWS credentials, then treats a successful one-token probe or HTTP 429 as model availability. The Target117 predecessor is alpha-equivalent and the exact Target118 source declaration contains the complete contract. The positional ClaudeInChromeOnboarding attribution contains neither this client construction nor the probe flow.',
  }),
])
