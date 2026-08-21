#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.117-to-2.1.118'
const SOURCE_PATH = 'src/utils/teleport/api.ts'

export const TARGET118_CODE_SESSION_COMPAT_INPUT_FILE = Object.freeze({
  path: SOURCE_PATH,
  bytes: 14317,
  sha256: '8fa33fa3d473cef5419ac669b1d291a11b6755fbf6ebe99b8864628147fef783',
})

export const TARGET118_CODE_SESSION_COMPAT_OUTPUT_FILE = Object.freeze({
  path: SOURCE_PATH,
  bytes: 15537,
  sha256: '169402ef911b81571d7f6c6d0a2b2b1df6dc14ff427f617151ea1ae0aec618be',
})

const EVIDENCE_IDS = Object.freeze([
  'target118-code-session-compat-target-fragment',
  'target118-code-session-compat-source-replay-test',
  'target118-code-session-compat-source-ast-test',
])

export const TARGET118_CODE_SESSION_COMPAT_OWNER_OVERRIDES = Object.freeze(
  [
    {
      targetIndex: 10809,
      behavior:
        'The authenticated Target118 converter normalizes CCR code-session status, update time, and config into the legacy SessionResource shape.',
    },
    {
      targetIndex: 10811,
      behavior:
        'The authenticated Target118 list request consumes /v1/code/sessions and converts CCR config/worker fields before building CodeSession rows.',
    },
    {
      targetIndex: 10813,
      behavior:
        'The authenticated Target118 single-session request unwraps response_shape or session and converts the CCR payload into SessionResource.',
    },
  ].map(row =>
    Object.freeze({
      key: `${CASE_NAME}:${row.targetIndex}`,
      targetIndex: row.targetIndex,
      paths: Object.freeze([SOURCE_PATH]),
      evidenceIds: EVIDENCE_IDS,
      behavior: row.behavior,
    }),
  ),
)

const TYPES_START = 'export type ListSessionsResponse = {'
const SCHEMA_START = 'export const CodeSessionSchema = lazySchema'
const LIST_START = 'export async function fetchCodeSessionsFromSessionsAPI()'
const HEADERS_COMMENT = '/**\n * Creates OAuth headers for API requests'
const FETCH_START = 'export async function fetchSession('
const BRANCH_COMMENT =
  '/**\n * Extracts the first branch name from a session'

const RECOVERED_TYPES = `export type ListSessionsResponse = {
  data: SessionsApiSession[]
  has_more: boolean
  first_id: string | null
  last_id: string | null
}

type SessionsApiSession = {
  id: string
  title?: string | null
  status?: string
  worker_status?: SessionStatus
  environment_id: string
  created_at: string
  updated_at?: string
  last_event_at: string
  config?: {
    sources?: SessionContextSource[]
    outcomes?: Outcome[] | null
    model?: string | null
  }
}

export function ccrSessionToResource(
  session: SessionsApiSession,
): SessionResource {
  const sessionStatus: SessionStatus =
    session.status === 'archived'
      ? 'archived'
      : (session.worker_status ?? 'idle')
  return {
    type: 'session',
    id: session.id,
    title: session.title ?? null,
    session_status: sessionStatus,
    environment_id: session.environment_id,
    created_at: session.created_at,
    updated_at: session.updated_at ?? session.last_event_at,
    session_context: {
      sources: session.config?.sources ?? [],
      outcomes: session.config?.outcomes ?? null,
      model: session.config?.model ?? null,
      cwd: '',
      custom_system_prompt: null,
      append_system_prompt: null,
    },
  }
}

`

const RECOVERED_LIST = `export async function fetchCodeSessionsFromSessionsAPI(): Promise<
  CodeSession[]
> {
  const { accessToken } = await prepareApiRequest()

  const url = \`${'${getOauthConfig().BASE_API_URL}'}/v1/code/sessions\`

  try {
    const headers = getOAuthHeaders(accessToken)

    const response = await axiosGetWithRetry<ListSessionsResponse>(url, {
      headers,
    })

    if (response.status !== 200) {
      throw new Error(\`Failed to fetch code sessions: ${'${response.statusText}'}\`)
    }

    // Transform SessionResource[] to CodeSession[] format
    const sessions: CodeSession[] = response.data.data.map(rawSession => {
      const session = ccrSessionToResource(rawSession)
      // Extract repository info from git sources
      const gitSource = session.session_context.sources.find(
        (source): source is GitSource => source.type === 'git_repository',
      )

      let repo: CodeSession['repo'] = null
      if (gitSource?.url) {
        // Parse GitHub URL using the existing utility function
        const repoPath = parseGitHubRepository(gitSource.url)
        if (repoPath) {
          const [owner, name] = repoPath.split('/')
          if (owner && name) {
            repo = {
              name,
              owner: {
                login: owner,
              },
              default_branch: gitSource.revision || undefined,
            }
          }
        }
      }

      return {
        id: session.id,
        title: session.title || 'Untitled',
        description: '', // SessionResource doesn't have description field
        status: session.session_status as CodeSession['status'], // Map session_status to status
        repo,
        turns: [], // SessionResource doesn't have turns field
        created_at: session.created_at,
        updated_at: session.updated_at,
      }
    })

    return sessions
  } catch (error) {
    const err = toError(error)
    logError(err)
    throw error
  }
}

`

const RECOVERED_FETCH = `export async function fetchSession(
  sessionId: string,
): Promise<SessionResource> {
  const { accessToken } = await prepareApiRequest()

  const url = \`${'${getOauthConfig().BASE_API_URL}'}/v1/code/sessions/${'${sessionId}'}\`
  const headers = getOAuthHeaders(accessToken)

  const response = await axios.get<SessionResource>(url, {
    headers,
    timeout: 15000,
    validateStatus: status => status < 500,
  })

  if (response.status !== 200) {
    // Extract error message from response if available
    const errorData = response.data as { error?: { message?: string } }
    const apiMessage = errorData?.error?.message

    if (response.status === 404) {
      throw new Error(\`Session not found: ${'${sessionId}'}\`)
    }

    if (response.status === 401) {
      throw new Error('Session expired. Please run /login to sign in again.')
    }

    throw new Error(
      apiMessage ||
        \`Failed to fetch session: ${'${response.status}'} ${'${response.statusText}'}\`,
    )
  }

  const responseData = response.data as unknown as {
    response_shape?: SessionsApiSession
    session?: SessionsApiSession
  }
  const session = responseData.response_shape ?? responseData.session
  if (!session?.id) {
    throw new Error(\`Session not found: ${'${sessionId}'}\`)
  }
  return ccrSessionToResource(session)
}

`

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function replaceBoundedSection(input, startMarker, endMarker, output, label) {
  const start = input.indexOf(startMarker)
  const secondStart = input.indexOf(startMarker, start + 1)
  const end = input.indexOf(endMarker, start)
  if (start < 0 || secondStart >= 0 || end < start) {
    throw new Error(
      `${CASE_NAME}: code-session replay requires one exact ${label} boundary`,
    )
  }
  return input.slice(0, start) + output + input.slice(end)
}

export function buildTarget118CodeSessionCompatOutput(input) {
  let output = replaceBoundedSection(
    input,
    TYPES_START,
    SCHEMA_START,
    RECOVERED_TYPES,
    'session type',
  )
  output = replaceBoundedSection(
    output,
    LIST_START,
    HEADERS_COMMENT,
    RECOVERED_LIST,
    'session list',
  )
  return replaceBoundedSection(
    output,
    FETCH_START,
    BRANCH_COMMENT,
    RECOVERED_FETCH,
    'session fetch',
  )
}

export function applyTarget118CodeSessionCompatSourceRecovery({ sourceRoot }) {
  const filename = path.join(sourceRoot, SOURCE_PATH.replace(/^src\//, ''))
  const input = fs.readFileSync(filename)
  const actual = descriptor(input)
  if (
    actual.bytes === TARGET118_CODE_SESSION_COMPAT_OUTPUT_FILE.bytes &&
    actual.sha256 === TARGET118_CODE_SESSION_COMPAT_OUTPUT_FILE.sha256
  ) {
    return { status: 'already-recovered', files: [] }
  }
  if (
    actual.bytes !== TARGET118_CODE_SESSION_COMPAT_INPUT_FILE.bytes ||
    actual.sha256 !== TARGET118_CODE_SESSION_COMPAT_INPUT_FILE.sha256
  ) {
    throw new Error(
      `${CASE_NAME}: code-session compatibility replay requires its exact raw or recovered source state`,
    )
  }
  const output = Buffer.from(buildTarget118CodeSessionCompatOutput(input.toString()))
  const outputDescriptor = descriptor(output)
  if (
    outputDescriptor.bytes !== TARGET118_CODE_SESSION_COMPAT_OUTPUT_FILE.bytes ||
    outputDescriptor.sha256 !== TARGET118_CODE_SESSION_COMPAT_OUTPUT_FILE.sha256
  ) {
    throw new Error(
      `${CASE_NAME}: code-session compatibility replay output differs from its pinned postimage`,
    )
  }
  fs.writeFileSync(filename, output)
  return { status: 'recovered', files: [SOURCE_PATH] }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceRootIndex = process.argv.indexOf('--source-root')
  const sourceRoot =
    sourceRootIndex >= 0 ? process.argv[sourceRootIndex + 1] : process.argv[2]
  if (!sourceRoot) {
    throw new Error(
      'usage: replay-code-session-compat-source-gap.mjs --source-root DIR',
    )
  }
  console.log(
    JSON.stringify(
      applyTarget118CodeSessionCompatSourceRecovery({ sourceRoot }),
      null,
      2,
    ),
  )
}
