const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_PARSE_PR_IDENTIFIER_STRICT_PROPERTY_EVIDENCE_IDS =
  Object.freeze([
    'target119-parse-pr-identifier-export-binding-proof',
    'target119-parse-pr-identifier-adjacent-implementation-proof',
    'target119-parse-pr-identifier-exact-source-ast-proof',
    'target119-parse-pr-identifier-multi-host-semantic-test',
    'target119-parse-pr-identifier-static-no-replay-proof',
  ])

export const TARGET119_PARSE_PR_IDENTIFIER_DEPENDENCY_TARGET_INDICES =
  Object.freeze([21368])

export const TARGET119_PARSE_PR_IDENTIFIER_STRICT_PROPERTY_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:21367`,
      targetIndex: 21367,
      paths: Object.freeze(['src/screens/ResumeConversation.tsx']),
      declarations: Object.freeze(['parsePrIdentifier']),
      dependencyTargetIndices:
        TARGET119_PARSE_PR_IDENTIFIER_DEPENDENCY_TARGET_INDICES,
      evidenceIds:
        TARGET119_PARSE_PR_IDENTIFIER_STRICT_PROPERTY_EVIDENCE_IDS,
      behavior:
        'The complete authenticated Target119 u21367 module export table adds parsePrIdentifier beside ResumeConversation, and its arrow binding points directly to adjacent u21368. That complete function is alpha-canonically identical to the exact Target119 src/screens/ResumeConversation.tsx parsePrIdentifier declaration, including the byte-identical multi-host pull, pull-requests, and merge_requests regex. Target118 u20462 exports only ResumeConversation while adjacent u20463 contains the older GitHub-only implementation. The sole strict parsePrIdentifier property is therefore generated module-binding residue owned by ResumeConversation.tsx; this static exact-source owner correction pins u21368 as its dependency and authorizes no source replay.',
    }),
  ])
