const CASE_NAME = '2.1.120-to-2.1.121'
const EVIDENCE_IDS = Object.freeze([
  'target121-extra-usage-authenticated-target-fragment',
  'target121-extra-usage-source-ast-test',
  'target121-extra-usage-disabled-mock-binding-test',
  'target121-extra-usage-compiler-lineage-test',
])

function override(targetIndex, ownerPath, behavior) {
  return Object.freeze({
    key: `${CASE_NAME}:${targetIndex}`,
    targetIndex,
    paths: Object.freeze([ownerPath]),
    evidenceIds: EVIDENCE_IDS,
    behavior,
  })
}

const API_OWNER = 'src/services/api/extraUsage.ts'
const DIALOG_OWNER = 'src/commands/extra-usage/ExtraUsageDialog.tsx'

export const TARGET121_EXTRA_USAGE_OWNER_OVERRIDES = Object.freeze([
  override(
    12681,
    API_OWNER,
    'The extra-usage API owner updates the monthly spend limit; the authenticated bundle adds only a disabled mock-state fast path ahead of the exact authored request.',
  ),
  override(
    12682,
    API_OWNER,
    'The extra-usage API owner updates auto-reload settings; the authenticated bundle adds only a disabled mock-state fast path ahead of the exact authored request.',
  ),
  override(
    12683,
    API_OWNER,
    'The extra-usage API owner fetches prepaid credit balance and auto-reload state; its target-only mock branch is unreachable because the complete mock getter always returns null.',
  ),
  override(
    12684,
    API_OWNER,
    'The authenticated mock-bundle builder belongs to the extra-usage API module and is consumed only by the disabled mock-state branch; its generated presets cannot reach live runtime.',
  ),
  override(
    12685,
    API_OWNER,
    'The extra-usage API owner fetches prepaid bundles; target-only preset and mock-product values are confined to the statically disabled mock-state branch.',
  ),
  override(
    12687,
    API_OWNER,
    'The extra-usage API owner purchases bundle or custom credit; target-only mock purchase outcomes are unreachable while the authored request body and response path remain exact.',
  ),
  override(
    12688,
    API_OWNER,
    'The extra-usage API owner fetches the tax preview; target-only tax mock fields are unreachable while the authored billing request and normalized response remain exact.',
  ),
  override(
    12689,
    API_OWNER,
    'The extra-usage API owner polls purchase status; target-only mock polling state is unreachable while the authored prepaid-commit request remains exact.',
  ),
  override(
    12691,
    API_OWNER,
    'The extra-usage API initializer owns the authenticated mock preset table, which is referenced only from branches guarded by the always-null mock getter and therefore cannot affect live requests.',
  ),
  override(
    12699,
    DIALOG_OWNER,
    'ExtraUsageDialog owns loading, enablement, purchase, spend-limit, auto-reload, polling, success, and error state transitions emitted by the complete authenticated dialog unit.',
  ),
  override(
    12704,
    DIALOG_OWNER,
    'The BuySelect declaration owns preset labels, discount descriptions, custom purchase selection, payment labeling, and confirmation actions emitted by the authenticated target.',
  ),
  override(
    12708,
    DIALOG_OWNER,
    'The ExtraUsageDialog custom-purchase branch and AmountInput declaration own the initial amount, currency minimum, payment subtitle, confirmation footer, and submit/cancel transitions.',
  ),
  override(
    12712,
    DIALOG_OWNER,
    'The AutoReload declaration owns threshold and reload validation, card labeling, recurring-charge consent, enable/save/disable actions, and responsive input rendering.',
  ),
  override(
    12716,
    DIALOG_OWNER,
    'The AmountInput declaration owns numeric normalization, minimum validation, cursor editing, currency formatting, confirmation, and cancellation emitted by the authenticated target.',
  ),
])

export const TARGET121_EXTRA_USAGE_EVIDENCE_IDS = EVIDENCE_IDS
