const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_MAIN_RUN_BUILD_PROFILE_EVIDENCE_IDS = Object.freeze([
  'target119-main-run-authenticated-complete-units',
  'target119-main-run-canonical-predecessor-windows',
  'target119-main-run-build-macro-normalization',
  'target119-main-run-source-ccr-ccshare-graph',
  'target119-main-run-strict-residue-partition',
])

export const TARGET119_MAIN_RUN_BUILD_PROFILE_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:21878`,
    targetIndex: 21878,
    paths: Object.freeze(['src/main.tsx']),
    declarations: Object.freeze(['run']),
    evidenceIds: TARGET119_MAIN_RUN_BUILD_PROFILE_EVIDENCE_IDS,
    behavior:
      'The complete authenticated Target118 u20972 and Target119 u21878 FunctionDeclaration run units establish one src/main.tsx implementation boundary. Fifty-four of fifty-nine Target119 added-owner rows have a unique 121-token Target118 predecessor window, including six exact VERSION, BUILD_TIME, and GIT_SHA normalizations. The five context exceptions are confined to the authenticated CCR and ccshare/file-resume graph: Target119 source adds handleOAuth401Error to the CCR configuration, while the exact Target118 and Target119 source blocks already share includeHookEvents and the ccshare/file-resume flow that the Target119 build profile materializes. Of twenty-two strict rows, thirteen are raw predecessor occurrences, six are macro-normalized, two are retained not_found_explicit_id/failure_reason graph occurrences, and only parseCcshareId is a newly materialized strict occurrence. Exact historical, raw, and packaged run declarations close the source boundary. This is a complete-unit static proof and authorizes no replay.',
  }),
])
