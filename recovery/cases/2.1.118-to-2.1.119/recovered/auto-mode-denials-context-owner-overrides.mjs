const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_AUTO_MODE_DENIALS_CONTEXT_EVIDENCE_IDS = Object.freeze([
  'target119-auto-mode-denials-provider-whole-unit-proof',
  'target119-auto-mode-denials-context-default-proof',
  'target119-auto-mode-denials-module-and-app-boundary-proof',
  'target119-auto-mode-denials-runtime-lineage-proof',
  'target119-auto-mode-denials-source-graph-replay-blocker',
])

const behavior =
  'Target119 atomically extends the AutoModeDenials context API: the provider exposes removeDenial as a ref-backed identity filter and the context default exposes the matching no-op. The exact provider and initializer reduce to their Target118 units after deleting only those properties, while the hook, App provider boundary, and Target120/121 runtime lineage remain authenticated. Recovered Target119 source is the older module-global API with no Provider, hook, or App wrapper; Target121 source only partially restores the context architecture, omits removeDenial from the type/default/provider, and leaves a dangling global removal function. Admission is static and never authorizes a partial source replay.'

export const TARGET119_AUTO_MODE_DENIALS_CONTEXT_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:17435`,
      targetIndex: 17435,
      paths: Object.freeze(['src/utils/autoModeDenials.ts']),
      declarations: Object.freeze(['AutoModeDenialsProvider']),
      evidenceIds: TARGET119_AUTO_MODE_DENIALS_CONTEXT_EVIDENCE_IDS,
      behavior,
    }),
    Object.freeze({
      key: `${CASE_NAME}:17438`,
      targetIndex: 17438,
      paths: Object.freeze(['src/utils/autoModeDenials.ts']),
      declarations: Object.freeze(['AutoModeDenialsContext']),
      evidenceIds: TARGET119_AUTO_MODE_DENIALS_CONTEXT_EVIDENCE_IDS,
      behavior,
    }),
  ])
