#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.117-to-2.1.118'
const API_PATH = 'src/bridge/codeSessionApi.ts'
const CONTEXT_PATH = 'src/utils/gitSessionContext.ts'

export const TARGET118_CODE_SESSION_GIT_CONTEXT_INPUT_FILES = Object.freeze([
  Object.freeze({
    path: API_PATH,
    bytes: 6037,
    sha256: 'c058b8ab08341f14cccdc06700cf7237dcb7c79d1827b1c069e136ec554d73ea',
  }),
  Object.freeze({ path: CONTEXT_PATH, state: 'absent' }),
])

export const TARGET118_CODE_SESSION_GIT_CONTEXT_OUTPUT_FILES = Object.freeze([
  Object.freeze({
    path: API_PATH,
    bytes: 6818,
    sha256: 'df2b7759f74f3d7bb04f99be419ec19a16f857ea60aacf91d7da5d98f630bbd5',
  }),
  Object.freeze({
    path: CONTEXT_PATH,
    bytes: 1574,
    sha256: 'cccbbe4a791ec1e01f732add778ab0650d7b815b248cdefaf08e8d7d5f949d91',
  }),
])

export const TARGET118_CODE_SESSION_GIT_CONTEXT_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:18786`,
      targetIndex: 18786,
      paths: Object.freeze([API_PATH]),
      declarations: Object.freeze(['createCodeSession']),
      evidenceIds: Object.freeze([
        'target118-code-session-git-context-target-fragment',
        'target118-code-session-git-context-source-replay-test',
        'target118-code-session-git-context-source-ast-test',
      ]),
      behavior:
        'The authenticated Target118 createCodeSession unit retains the Target117 git-context request contract: it builds source and outcome descriptors from the repository and branch, adds cwd/model config, enables outcome-branch reuse only for non-empty context, and posts the complete config with the session request. The bounded replay restores the exact historical Target118 codeSessionApi declaration plus its gitSessionContext dependency.',
    }),
  ])

const API_OPERATIONS = Object.freeze([
  Object.freeze({
    label: 'bootstrap cwd import',
    before: "import axios from 'axios'\n",
    after:
      "import axios from 'axios'\n" +
      "import { getOriginalCwd } from '../bootstrap/state.js'\n",
  }),
  Object.freeze({
    label: 'git-context parameters and request config',
    before: [
      '  tags?: string[],',
      '): Promise<string | null> {',
      '  const url = `${baseUrl}/v1/code/sessions`',
      '  let response',
    ].join('\n'),
    after: [
      '  tags?: string[],',
      '  gitContext?: {',
      '    gitRepoUrl: string',
      '    branch: string',
      '    defaultBranch?: string',
      '  },',
      '  cwd?: string,',
      '  model?: string,',
      '): Promise<string | null> {',
      '  const url = `${baseUrl}/v1/code/sessions`',
      '  const config: Record<string, unknown> = {',
      '    cwd: cwd ?? getOriginalCwd(),',
      '    ...(model && { model }),',
      '  }',
      '  if (gitContext) {',
      '    const { buildGitSessionContext } = await import(',
      "      '../utils/gitSessionContext.js'",
      '    )',
      '    const { sources, outcomes } = await buildGitSessionContext(',
      '      gitContext.gitRepoUrl,',
      '      gitContext.branch,',
      '      gitContext.defaultBranch,',
      '    )',
      '    if (sources.length > 0 || outcomes.length > 0) {',
      '      config.sources = sources',
      '      config.outcomes = outcomes',
      '      config.reuse_outcome_branches = true',
      '    }',
      '  }',
      '  let response',
    ].join('\n'),
  }),
  Object.freeze({
    label: 'session request config payload',
    before:
      '      { title, bridge: {}, ...(tags?.length ? { tags } : {}) },\n',
    after: [
      '      {',
      '        title,',
      '        bridge: {},',
      '        ...(tags?.length ? { tags } : {}),',
      '        config,',
      '      },',
      '',
    ].join('\n'),
  }),
])

const CONTEXT_POSTIMAGE = Buffer.from(
  [
    'import type {',
    '  GitRepositoryOutcome,',
    '  GitSource,',
    "} from './teleport/api.js'",
    '',
    'export async function buildGitSessionContext(',
    '  gitRepoUrl: string | null,',
    '  branch?: string,',
    '  defaultBranch?: string,',
    '): Promise<{',
    '  sources: GitSource[]',
    '  outcomes: GitRepositoryOutcome[]',
    '}> {',
    '  if (!gitRepoUrl) return { sources: [], outcomes: [] }',
    '',
    '  const { parseGitRemote, parseGitHubRepository } = await import(',
    "    './detectRepository.js'",
    '  )',
    "  const { getDefaultBranch } = await import('./git.js')",
    '  const resolvedDefaultBranch =',
    "    defaultBranch || (await getDefaultBranch()) || ''",
    '  const revision = branch || resolvedDefaultBranch || undefined',
    '  const outcomeBranches =',
    '    revision && revision !== resolvedDefaultBranch ? [revision] : []',
    '',
    '  const build = (',
    '    host: string,',
    '    owner: string,',
    '    repo: string,',
    '  ): {',
    '    sources: GitSource[]',
    '    outcomes: GitRepositoryOutcome[]',
    '  } => ({',
    '    sources: [',
    '      {',
    "        type: 'git_repository',",
    '        url: `https://${host}/${owner}/${repo}`,',
    '        revision,',
    '      },',
    '    ],',
    '    outcomes: [',
    '      {',
    "        type: 'git_repository',",
    '        git_info: {',
    "          type: 'github',",
    '          repo: `${owner}/${repo}`,',
    '          branches: outcomeBranches,',
    '        },',
    '      },',
    '    ],',
    '  })',
    '',
    '  const parsed = parseGitRemote(gitRepoUrl)',
    '  if (parsed) return build(parsed.host, parsed.owner, parsed.name)',
    '',
    '  const githubRepo = parseGitHubRepository(gitRepoUrl)',
    '  if (githubRepo) {',
    "    const [owner, repo] = githubRepo.split('/')",
    "    if (owner && repo) return build('github.com', owner, repo)",
    '  }',
    '',
    '  return { sources: [], outcomes: [] }',
    '}',
    '',
  ].join('\n'),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function sameDescriptor(actual, expected) {
  return actual.bytes === expected.bytes && actual.sha256 === expected.sha256
}

function replaceExactly(source, operation) {
  const count = source.split(operation.before).length - 1
  if (count !== 1) {
    throw new Error(
      `${CASE_NAME}: ${operation.label} anchor count ${count}, expected 1`,
    )
  }
  return source.replace(operation.before, operation.after)
}

export function buildTarget118CodeSessionGitContextApiOutput(input) {
  let output = input
  for (const operation of API_OPERATIONS) {
    output = replaceExactly(output, operation)
  }
  const bytes = Buffer.from(output)
  const expected = TARGET118_CODE_SESSION_GIT_CONTEXT_OUTPUT_FILES[0]
  const actual = descriptor(bytes)
  if (!sameDescriptor(actual, expected)) {
    throw new Error(
      `${CASE_NAME}: ${API_PATH} replay output differs ${actual.bytes}/${actual.sha256}`,
    )
  }
  return bytes
}

function resolveSourcePath(sourceRoot, relative) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, relative.replace(/^src\//, ''))
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${relative}: escapes supplied source root`)
  }
  return filename
}

function existingFileDescriptor(filename, relative) {
  if (!fs.existsSync(filename)) return { state: 'absent' }
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${relative}: expected a real source file or absence`)
  }
  const value = fs.readFileSync(filename)
  return { state: 'file', value, descriptor: descriptor(value) }
}

export function applyTarget118CodeSessionGitContextSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const apiFilename = resolveSourcePath(sourceRoot, API_PATH)
  const contextFilename = resolveSourcePath(sourceRoot, CONTEXT_PATH)
  const api = existingFileDescriptor(apiFilename, API_PATH)
  const context = existingFileDescriptor(contextFilename, CONTEXT_PATH)
  const inputApi = TARGET118_CODE_SESSION_GIT_CONTEXT_INPUT_FILES[0]
  const [outputApi, outputContext] =
    TARGET118_CODE_SESSION_GIT_CONTEXT_OUTPUT_FILES
  const apiState =
    api.state === 'file' && sameDescriptor(api.descriptor, inputApi)
      ? 'raw'
      : api.state === 'file' && sameDescriptor(api.descriptor, outputApi)
        ? 'recovered'
        : 'unknown'
  const contextState =
    context.state === 'absent'
      ? 'raw'
      : context.state === 'file' &&
          sameDescriptor(context.descriptor, outputContext)
        ? 'recovered'
        : 'unknown'

  if (apiState === 'recovered' && contextState === 'recovered') {
    return {
      status: 'already-recovered',
      files: TARGET118_CODE_SESSION_GIT_CONTEXT_OUTPUT_FILES.map(
        file => file.path,
      ),
    }
  }
  if (apiState !== 'raw' || contextState !== 'raw') {
    throw new Error(
      `${CASE_NAME}: code-session git-context replay requires one exact all-raw or all-recovered state; got ${API_PATH}:${apiState}, ${CONTEXT_PATH}:${contextState}`,
    )
  }

  const apiOutput = buildTarget118CodeSessionGitContextApiOutput(
    api.value.toString('utf8'),
  )
  const contextActual = descriptor(CONTEXT_POSTIMAGE)
  if (!sameDescriptor(contextActual, outputContext)) {
    throw new Error(
      `${CASE_NAME}: ${CONTEXT_PATH} embedded postimage differs ${contextActual.bytes}/${contextActual.sha256}`,
    )
  }
  fs.writeFileSync(contextFilename, CONTEXT_POSTIMAGE)
  fs.writeFileSync(apiFilename, apiOutput)
  for (const expected of TARGET118_CODE_SESSION_GIT_CONTEXT_OUTPUT_FILES) {
    const filename = resolveSourcePath(sourceRoot, expected.path)
    const written = descriptor(fs.readFileSync(filename))
    if (!sameDescriptor(written, expected)) {
      throw new Error(`${CASE_NAME}: ${expected.path} written postimage differs`)
    }
  }
  return {
    status: 'recovered',
    files: TARGET118_CODE_SESSION_GIT_CONTEXT_OUTPUT_FILES.map(
      file => file.path,
    ),
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceRootIndex = process.argv.indexOf('--source-root')
  const sourceRoot =
    sourceRootIndex >= 0 ? process.argv[sourceRootIndex + 1] : process.argv[2]
  if (!sourceRoot) {
    throw new Error(
      'usage: replay-code-session-git-context-source-gap.mjs --source-root DIR',
    )
  }
  process.stdout.write(
    `${JSON.stringify(
      applyTarget118CodeSessionGitContextSourceRecovery({
        sourceRoot: path.resolve(sourceRoot),
      }),
    )}\n`,
  )
}
