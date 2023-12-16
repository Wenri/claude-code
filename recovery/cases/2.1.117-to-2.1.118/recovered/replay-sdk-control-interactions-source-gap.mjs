import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const CASE_NAME = '2.1.117-to-2.1.118'
const SOURCE_PATH = 'src/entrypoints/sdk/controlSchemas.ts'

const MCP_CALL_SCHEMAS = `export const SDKControlMcpCallRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('mcp_call'),
      tool: z
        .string()
        .describe('Fully-qualified MCP tool name, e.g. mcp__server__tool_name.'),
      arguments: z.record(z.string(), z.unknown()).optional(),
    })
    .describe(
      'Invokes an MCP tool via the subprocess MCP client without a model turn. No permission check (control channel is trusted, same as other ' +
        'subtypes). SDK-type MCP servers (config.type === "sdk") are rejected — ' +
        'they are caller-provided, so the caller can invoke them directly without the subprocess round-trip. Result content passes through the same processing as model-turn MCP calls. Session expiry is not retried automatically; callers can mcp_reconnect and retry. UrlElicitationRequired (-32042) tries Elicitation hooks; if no hook ' +
        'resolves, the call errors with the URL in the message — open it ' +
        'out-of-band, then retry mcp_call.',
    ),
)

export const SDKControlMcpCallResponseSchema = lazySchema(() =>
  z
    .object({
      content: z.unknown(),
      structuredContent: z.record(z.string(), z.unknown()).optional(),
      _meta: z.record(z.string(), z.unknown()).optional(),
    })
    .describe(
      'MCP tool result — the content array, structuredContent, and _meta ' +
        'from CallToolResult. Content passes through the same processing as model-turn MCP calls (large results may be truncated or redirected to a file). Caller interprets.',
    ),
)
`

const USER_DIALOG_SCHEMAS = `export const SDKControlRequestUserDialogRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('request_user_dialog'),
      dialog_kind: z
        .string()
        .describe(
          'Identifier for the dialog the host should render. Open string union — known kinds include "it2_setup" and "computer_use_approval"; new kinds may be added without bumping the protocol.',
        ),
      payload: z
        .record(z.string(), z.unknown())
        .describe(
          'Dialog-specific data passed to the host renderer. Shape is defined per dialog_kind; the protocol transports it opaquely.',
        ),
      tool_use_id: z.string().optional(),
    })
    .describe(
      'Requests the SDK consumer to render a tool-driven blocking dialog and return the user choice. Used by tools that previously rendered Ink JSX via setToolJSX with an onDone callback.',
    ),
)

export const SDKControlRequestUserDialogResponseSchema = lazySchema(() =>
  z
    .object({
      behavior: z.enum(['completed', 'cancelled']),
      result: z
        .unknown()
        .optional()
        .describe(
          'Dialog-specific result payload. Opaque to the protocol; the caller and dialog renderer agree on the shape per dialog_kind.',
        ),
    })
    .describe(
      'Response from the SDK consumer for a request_user_dialog request.',
    ),
)
`

const MESSAGE_RATED_SCHEMAS = `export const SDKControlMessageRatedRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('message_rated'),
      messageUuid: z.string().describe('UUID of the assistant message being rated.'),
      sentiment: z
        .enum(['positive', 'negative'])
        .describe('User rating: positive (thumbs up) or negative (thumbs down).'),
      surface: z
        .enum(['tool_use', 'assistant_text'])
        .optional()
        .describe('Which in-conversation surface the rating came from. If omitted, logged as tool_use.'),
      cleared: z
        .boolean()
        .optional()
        .describe('True when the caller is un-rating a message (clicking the same control a second time).'),
    })
    .describe(
      '@internal Records a per-message thumbs up/down rating. Logs tengu_message_rated with the same shape as the in-conversation rating controls so Desktop / IDE callers can surface their own native thumbs UI.',
    ),
)

export const SDKControlMessageRatedResponseSchema = lazySchema(() =>
  z.object({}).describe('@internal Empty response for message_rated.'),
)
`

export const TARGET118_SDK_CONTROL_INTERACTIONS_INPUT_FILE = Object.freeze({
  path: SOURCE_PATH,
  bytes: 25038,
  sha256:
    '63f570cbd1a1b6bb2d179ec2e4a38229666c65d24ce8ffc0ca920b6bdedf0675',
})

export const TARGET118_SDK_CONTROL_INTERACTIONS_OUTPUT_FILE = Object.freeze({
  path: SOURCE_PATH,
  bytes: 29182,
  sha256:
    '70d63798fc510a4b908a01631945c0401d32bc2a16ede78250e8e0ce6a770fd6',
})

export const TARGET118_SDK_CONTROL_INTERACTIONS_EVIDENCE_IDS = Object.freeze([
  'target118-sdk-control-interactions-target-fragment',
  'target118-sdk-control-interactions-source-replay-test',
  'target118-sdk-control-interactions-source-ast-test',
])

export const TARGET118_SDK_CONTROL_INTERACTIONS_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:20022`,
    targetIndex: 20022,
    paths: Object.freeze([SOURCE_PATH]),
    declarations: Object.freeze([
      'SDKControlMcpCallRequestSchema',
      'SDKControlMcpCallResponseSchema',
      'SDKControlRequestUserDialogRequestSchema',
      'SDKControlRequestUserDialogResponseSchema',
      'SDKControlMessageRatedRequestSchema',
      'SDKControlMessageRatedResponseSchema',
      'SDKControlRequestInnerSchema',
    ]),
    evidenceIds: TARGET118_SDK_CONTROL_INTERACTIONS_EVIDENCE_IDS,
    behavior:
      'The authenticated Target118 SDK control initializer owns three complete host-interaction contracts: direct MCP calls and results, tool-driven user dialogs with completed/cancelled responses, and per-message ratings with tool_use/assistant_text surfaces. The bounded replay restores all six schemas and their three request-union branches atomically in controlSchemas.ts; it never admits incidental occurrences from unrelated tool or payload sources.',
  }),
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function replaceExactOnce(source, before, after, label) {
  const start = source.indexOf(before)
  if (start < 0 || source.indexOf(before, start + 1) >= 0) {
    throw new Error(`${SOURCE_PATH}: expected exactly one ${label} anchor`)
  }
  return `${source.slice(0, start)}${after}${source.slice(start + before.length)}`
}

function buildPostimage(input) {
  let source = input.toString('utf8')
  source = replaceExactOnce(
    source,
    '\nconst ContextCategorySchema = lazySchema(() =>',
    `\n${MCP_CALL_SCHEMAS}\nconst ContextCategorySchema = lazySchema(() =>`,
    'context-category',
  )
  source = replaceExactOnce(
    source,
    '\nexport const SDKControlElicitationResponseSchema = lazySchema(() =>',
    `\n${USER_DIALOG_SCHEMAS}\nexport const SDKControlElicitationResponseSchema = lazySchema(() =>`,
    'elicitation-response',
  )
  source = replaceExactOnce(
    source,
    '\n\n// ============================================================================\n// Control Request/Response Wrappers',
    `\n\n${MESSAGE_RATED_SCHEMAS}\n// ============================================================================\n// Control Request/Response Wrappers`,
    'control-wrapper',
  )
  source = replaceExactOnce(
    source,
    '    SDKControlGetSessionCostRequestSchema(),\n    SDKHookCallbackRequestSchema(),',
    '    SDKControlGetSessionCostRequestSchema(),\n    SDKControlMcpCallRequestSchema(),\n    SDKHookCallbackRequestSchema(),',
    'MCP request-union',
  )
  source = replaceExactOnce(
    source,
    '    SDKControlElicitationRequestSchema(),\n    SDKControlOAuthTokenRefreshRequestSchema(),',
    '    SDKControlElicitationRequestSchema(),\n    SDKControlRequestUserDialogRequestSchema(),\n    SDKControlMessageRatedRequestSchema(),\n    SDKControlOAuthTokenRefreshRequestSchema(),',
    'host-interaction request-union',
  )
  return Buffer.from(source)
}

function resolveSourceFile(sourceRoot) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, SOURCE_PATH.slice(4))
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${SOURCE_PATH}: escapes source root`)
  }
  return filename
}

export function applyTarget118SdkControlInteractionsSourceRecovery({
  sourceRoot,
}) {
  const filename = resolveSourceFile(sourceRoot)
  const stat = fs.lstatSync(filename)
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${SOURCE_PATH}: expected a real source file`)
  }
  const input = fs.readFileSync(filename)
  const actual = descriptor(input)
  if (
    actual.bytes === TARGET118_SDK_CONTROL_INTERACTIONS_OUTPUT_FILE.bytes &&
    actual.sha256 === TARGET118_SDK_CONTROL_INTERACTIONS_OUTPUT_FILE.sha256
  ) {
    return Object.freeze({ changed: false, path: SOURCE_PATH })
  }
  if (
    actual.bytes !== TARGET118_SDK_CONTROL_INTERACTIONS_INPUT_FILE.bytes ||
    actual.sha256 !== TARGET118_SDK_CONTROL_INTERACTIONS_INPUT_FILE.sha256
  ) {
    throw new Error(
      `${SOURCE_PATH}: unsupported preimage ${actual.bytes}/${actual.sha256}`,
    )
  }
  const output = buildPostimage(input)
  const outputDescriptor = descriptor(output)
  if (
    outputDescriptor.bytes !==
      TARGET118_SDK_CONTROL_INTERACTIONS_OUTPUT_FILE.bytes ||
    outputDescriptor.sha256 !==
      TARGET118_SDK_CONTROL_INTERACTIONS_OUTPUT_FILE.sha256
  ) {
    throw new Error(
      `${SOURCE_PATH}: constructed output differs from postimage pin ` +
        `${outputDescriptor.bytes}/${outputDescriptor.sha256}`,
    )
  }
  fs.writeFileSync(filename, output)
  return Object.freeze({ changed: true, path: SOURCE_PATH })
}
