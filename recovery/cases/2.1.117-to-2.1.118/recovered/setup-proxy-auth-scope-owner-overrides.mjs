const CASE_NAME = '2.1.117-to-2.1.118'

export const TARGET118_SETUP_PROXY_AUTH_SCOPE_EVIDENCE_IDS = Object.freeze([
  'target118-setup-proxy-auth-scope-authenticated-units',
  'target118-setup-proxy-auth-scope-alpha-equivalence',
  'target118-setup-proxy-auth-scope-source-boundary',
])

export const TARGET118_SETUP_PROXY_AUTH_SCOPE_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:20779`,
    targetIndex: 20779,
    paths: Object.freeze(['src/setup.ts']),
    declarations: Object.freeze(['setup']),
    evidenceIds: TARGET118_SETUP_PROXY_AUTH_SCOPE_EVIDENCE_IDS,
    behavior:
      'The complete Target117 and Target118 setup units are alpha-equivalent and both classify the selected proxyAuthHelper as project-or-local by comparing it against the projectSettings and localSettings scopes before recording trust. The sole strict projectSettings row is therefore a retained whole-unit occurrence shift, not new Target118 behavior. Historical setup.ts authenticates the surrounding startup owner but omits this compiled proxy-helper fragment, so the proof remains static and does not authorize a partial replay.',
  }),
])
