const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_INBOUND_ATTACHMENT_SCHEMA_EVIDENCE_IDS = Object.freeze([
  'target119-inbound-attachment-schema-authenticated-units',
  'target119-inbound-attachment-schema-token-identity',
  'target119-inbound-attachment-schema-source-boundary',
])

export const TARGET119_INBOUND_ATTACHMENT_SCHEMA_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:19768`,
      targetIndex: 19768,
      paths: Object.freeze(['src/bridge/inboundAttachments.ts']),
      declarations: Object.freeze([
        'attachmentSchema',
        'attachmentsArraySchema',
      ]),
      evidenceIds: TARGET119_INBOUND_ATTACHMENT_SCHEMA_EVIDENCE_IDS,
      behavior:
        'The complete Target119 inbound-attachment schema initializer is token-for-token alpha-identical to its authenticated Target118 predecessor, including file_uuid, file_name, and nullable is_image validation. The strict nullish residue is therefore retained runtime syntax. Historical Target118 through Target121 source snapshots share one older schema without is_image, so this Target119 owner proof deliberately does not replay an inherited source gap at the wrong release boundary.',
    }),
  ])
