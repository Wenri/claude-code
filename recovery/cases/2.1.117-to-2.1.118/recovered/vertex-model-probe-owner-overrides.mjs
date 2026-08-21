const CASE_NAME = '2.1.117-to-2.1.118'

export const TARGET118_VERTEX_MODEL_PROBE_EVIDENCE_IDS = Object.freeze([
  'target118-vertex-model-probe-authenticated-unit',
  'target118-vertex-model-probe-source-ast-test',
])

export const TARGET118_VERTEX_MODEL_PROBE_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:20428`,
    targetIndex: 20428,
    paths: Object.freeze(['src/utils/model/vertexUpgrade.ts']),
    declarations: Object.freeze(['probeVertexModel']),
    evidenceIds: TARGET118_VERTEX_MODEL_PROBE_EVIDENCE_IDS,
    behavior:
      'The authenticated Target118 function is the exact compiled probeVertexModel contract: it resolves Vertex and proxy modules, refreshes or skips GCP authentication, derives project credentials, constructs an AnthropicVertex client with the model region, zero retries and an eight-second timeout, then treats a successful one-token probe or HTTP 429 as model availability. The Target117 predecessor is alpha-equivalent and the exact Target118 source declaration contains the complete contract. The positional ClaudeInChromeOnboarding attribution contains neither this client construction nor the probe flow.',
  }),
])
