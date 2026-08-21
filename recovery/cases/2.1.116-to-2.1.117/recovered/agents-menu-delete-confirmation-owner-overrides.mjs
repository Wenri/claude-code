const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_AGENTS_MENU_DELETE_CONFIRMATION_EVIDENCE_IDS =
  Object.freeze([
    'target117-agents-menu-authenticated-delete-confirmation-unit',
    'target117-agents-menu-delete-confirmation-cache-closure',
    'target117-agents-menu-historical-attribution-and-stale-source-test',
  ])

export const TARGET117_AGENTS_MENU_DELETE_CONFIRMATION_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:17275`,
      targetIndex: 17275,
      paths: Object.freeze(['src/components/agents/AgentsMenu.tsx']),
      declarations: Object.freeze(['AgentsMenu']),
      evidenceIds:
        TARGET117_AGENTS_MENU_DELETE_CONFIRMATION_EVIDENCE_IDS,
      behavior:
        'The complete authenticated Target117 AgentsMenu unit replaces the delete-confirm Select adapter with ConfirmationButtons using the exact labels "Yes, delete" and "No, cancel", a direct onConfirm callback, and one shared cancellation callback. Its three numeric residues are React compiler cache-slot indices in a closed 0..216 allocation after the replacement removes three slots. Historical source-map attribution independently binds the unit to AgentsMenu. The ff0339 source is materially stale (_c(157), legacy Select, and missing retained Target116/117 state), so this is a structural owner proof and deliberately does not claim or perform a partial source replay.',
    }),
  ])
