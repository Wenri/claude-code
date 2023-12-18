const CASE_NAME = '2.1.117-to-2.1.118'

export const TARGET118_MAIN_ENTRYPOINT_INHERITED_EVIDENCE_IDS = Object.freeze([
  'target118-main-entrypoint-inherited-authenticated-units',
  'target118-main-entrypoint-inherited-token-predecessors',
  'target118-main-entrypoint-build-macro-normalization',
  'target118-main-entrypoint-plugin-tag-source-transition',
])

export const TARGET118_MAIN_ENTRYPOINT_INHERITED_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20972`,
      targetIndex: 20972,
      paths: Object.freeze(['src/main.tsx']),
      declarations: Object.freeze(['run']),
      evidenceIds: TARGET118_MAIN_ENTRYPOINT_INHERITED_EVIDENCE_IDS,
      behavior:
        'The complete authenticated Target117 and Target118 run entrypoint units establish the same implementation boundary. Sixteen Target118 added-owner rows map to unique raw-equal Target117 predecessor tokens in identical sixty-one-token canonical neighborhoods, and six more map identically after normalizing the two exact VERSION, BUILD_TIME, and GIT_SHA macro objects. The sole remaining pluginTagHandler row belongs to the exact authenticated Target118 plugin-tag command source transition, which dynamically imports pluginTagHandler and createSubcommandRoot and invokes them together. Exact historical and packaged run declarations pin the source boundary. This is a complete-unit static/source proof and authorizes no replay.',
    }),
  ])
