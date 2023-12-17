const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_SSE_TRANSPORT_RETAINED_CLASS_EVIDENCE_IDS =
  Object.freeze([
    'target119-sse-transport-authenticated-whole-class-proof',
    'target119-sse-transport-cross-release-alpha-equivalence-proof',
    'target119-sse-transport-residue-occurrence-order-proof',
    'target119-sse-transport-runtime-caller-boundary-proof',
    'target119-sse-transport-source-lineage-proof',
    'target119-sse-transport-static-replay-blocker',
  ])

export const TARGET119_SSE_TRANSPORT_RETAINED_CLASS_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:19732`,
      targetIndex: 19732,
      paths: Object.freeze(['src/cli/transports/SSETransport.ts']),
      declarations: Object.freeze([
        'SSETransport',
        'constructor',
        'readStream',
        'close',
      ]),
      evidenceIds: TARGET119_SSE_TRANSPORT_RETAINED_CLASS_EVIDENCE_IDS,
      behavior:
        'The complete authenticated Target119 SSETransport class unit, its prebinding, createV2ReplTransport caller, and module initializer are alpha-canonically identical to Target118. The apparent Target119-added constructor, done, and dispose properties occur at identical relative offsets with identical bytes in the Target118 unit, so they are global occurrence-order drift rather than Target119 behavior. The stable Target118-Target121 authored SSETransport source independently owns the class, constructor, readStream done/value binding, and close semantics, but it lacks the runtime Symbol.dispose method and imports a Transport module absent from every packaged source graph. This is therefore a static whole-unit owner proof and never authorizes a source replay.',
    }),
  ])
