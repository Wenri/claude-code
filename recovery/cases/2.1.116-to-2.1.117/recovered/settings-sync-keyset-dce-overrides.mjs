const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_SETTINGS_SYNC_KEYSET_DCE_EVIDENCE_IDS = Object.freeze([
  'target117-settings-sync-keyset-dce-target-fragment',
  'target117-settings-sync-keyset-dce-static-binding-test',
])

export const TARGET117_SETTINGS_SYNC_KEYSET_DCE_CORRECTIONS = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:17306`,
    targetIndex: 17306,
    category: 'unconsumed-settings-sync-keyset-allocation',
    evidenceIds: TARGET117_SETTINGS_SYNC_KEYSET_DCE_EVIDENCE_IDS,
    reason:
      'The authenticated Target117 initializer allocates the exact enabledPlugins/extraKnownMarketplaces array and a Set from it, but its complete bundle binding graph has no read, call, pass, return, export, mutation, or state escape for the Set and no array read beyond that constructor argument. The parent module calls the initializer once, so these allocation-only bindings cannot affect observable runtime behavior and require no invented source owner.',
  }),
])
