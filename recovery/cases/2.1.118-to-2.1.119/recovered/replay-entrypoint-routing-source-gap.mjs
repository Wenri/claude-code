#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_ENTRYPOINT_ROUTING_INPUT_FILES = Object.freeze([
  Object.freeze({
    path: 'src/constants/keys.ts',
    bytes: 444,
    sha256: 'c2318953c036cc7468e0ec6b1e2229b5925e4100b68804114c52e7d81856f116',
  }),
  Object.freeze({
    path: 'src/bootstrap/state.ts',
    bytes: 60769,
    sha256: '2d12eca86ad8112d58987cd3ae7173cf1fa8538fec50c8b904b6752c2efe333a',
  }),
  Object.freeze({
    path: 'src/main.tsx',
    bytes: 810059,
    sha256: '27f42341f13a7a3708d02105d813f42ec9d95487d9dda26a70a553dc3874d0cc',
  }),
  Object.freeze({
    path: 'src/services/analytics/growthbook.ts',
    bytes: 40526,
    sha256: '42541e6311ebed2d2865332eb7d9b2b99ac46f16d47674e702d7b035c1b96cf4',
  }),
])

export const TARGET119_ENTRYPOINT_ROUTING_OUTPUT_FILES = Object.freeze([
  Object.freeze({
    path: 'src/constants/keys.ts',
    bytes: 2264,
    sha256: 'e4d3c9611d32117e5e1804c096936d3ca30a69cb22067353eedac8c1a3992b3d',
  }),
  Object.freeze({
    path: 'src/bootstrap/state.ts',
    bytes: 61083,
    sha256: 'b40aeeb3eb03e072fac8453ebcd6b0d7a39765fea0fafda1d1ebcf7ed5a68bcb',
  }),
  Object.freeze({
    path: 'src/main.tsx',
    bytes: 809321,
    sha256: '1700d785a42f5383f7167e71c6eb937c3d1342df5b82fbbc841a55ef5a97cb0c',
  }),
  Object.freeze({
    path: 'src/services/analytics/growthbook.ts',
    bytes: 40843,
    sha256: 'cf0c2141d833c6dd2fb63146cb142d574719c7da6dd1162a1c6cdb9d3951381f',
  }),
])

export const TARGET119_ENTRYPOINT_ROUTING_EVIDENCE_IDS = Object.freeze([
  'target119-entrypoint-routing-complete-target-unit-proof',
  'target119-entrypoint-routing-source-replay-test',
  'target119-entrypoint-routing-source-ast-test',
])

export const TARGET119_ENTRYPOINT_ROUTING_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:2076`,
    targetIndex: 2076,
    paths: Object.freeze(['src/constants/keys.ts']),
    declarations: Object.freeze([
      'VALID_ENTRYPOINTS',
      'getEntrypoint',
      'initializeEntrypoint',
      'getSessionStartType',
    ]),
    evidenceIds: TARGET119_ENTRYPOINT_ROUTING_EVIDENCE_IDS,
    behavior:
      'Target119 validates CLAUDE_CODE_ENTRYPOINT against the complete authenticated entrypoint catalog, including bench and ssh-remote, before adding it to GrowthBook attributes. Startup upgrades a pre-set cli entrypoint to sdk-cli for non-interactive execution and records fresh, resume, or continue from arguments before the -- separator.',
  }),
  Object.freeze({
    key: `${CASE_NAME}:6644`,
    targetIndex: 6644,
    paths: Object.freeze(['src/services/analytics/growthbook.ts']),
    declarations: Object.freeze(['getUserAttributes']),
    evidenceIds: TARGET119_ENTRYPOINT_ROUTING_EVIDENCE_IDS,
    behavior:
      'Target119 GrowthBook attributes consume only the validated entrypoint. The authenticated external build also preserves the auto-update-channel read but folds its releaseChannel value to undefined, so the guarded releaseChannel spread is provably non-runtime while the entrypoint spread remains live.',
  }),
])

function sha256(source) {
  return crypto.createHash('sha256').update(source).digest('hex')
}

function replaceExact(source, before, after, label) {
  const first = source.indexOf(before)
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${label}: expected exactly one source anchor`)
  }
  return source.slice(0, first) + after + source.slice(first + before.length)
}

const ENTRYPOINT_DECLARATIONS = `

export const VALID_ENTRYPOINTS = new Set([
  'cli',
  'mcp',
  'sdk-cli',
  'sdk-ts',
  'sdk-py',
  'bench',
  'claude-vscode',
  'claude-code-github-action',
  'local-agent',
  'claude-desktop',
  'remote',
  'remote_desktop',
  'remote_mobile',
  'claude_in_slack',
  'claude-desktop-3p',
  'ssh-remote',
]);

export function getEntrypoint(): string | undefined {
  const entrypoint = process.env.CLAUDE_CODE_ENTRYPOINT;
  return entrypoint && VALID_ENTRYPOINTS.has(entrypoint) ? entrypoint : undefined;
}

export function initializeEntrypoint(isNonInteractive: boolean): void {
  if (process.env.CLAUDE_CODE_ENTRYPOINT) {
    if (process.env.CLAUDE_CODE_ENTRYPOINT === 'cli' && isNonInteractive) {
      process.env.CLAUDE_CODE_ENTRYPOINT = 'sdk-cli';
    }
    return;
  }
  const cliArgs = process.argv.slice(2);
  const mcpIndex = cliArgs.indexOf('mcp');
  if (mcpIndex !== -1 && cliArgs[mcpIndex + 1] === 'serve') {
    process.env.CLAUDE_CODE_ENTRYPOINT = 'mcp';
    return;
  }
  if (isEnvTruthy(process.env.CLAUDE_CODE_ACTION)) {
    process.env.CLAUDE_CODE_ENTRYPOINT = 'claude-code-github-action';
    return;
  }
  process.env.CLAUDE_CODE_ENTRYPOINT = isNonInteractive ? 'sdk-cli' : 'cli';
}

export function getSessionStartType(
  cliArgs: string[],
): 'fresh' | 'resume' | 'continue' {
  const separatorIndex = cliArgs.indexOf('--');
  const commandArgs =
    separatorIndex === -1 ? cliArgs : cliArgs.slice(0, separatorIndex);
  if (
    commandArgs.includes('-r') ||
    commandArgs.includes('--resume') ||
    commandArgs.includes('--from-pr') ||
    commandArgs.some(
      arg => arg.startsWith('--resume=') || arg.startsWith('--from-pr='),
    )
  ) {
    return 'resume';
  }
  if (commandArgs.includes('-c') || commandArgs.includes('--continue')) {
    return 'continue';
  }
  return 'fresh';
}`

const RAW_INITIALIZE_ENTRYPOINT = `function initializeEntrypoint(isNonInteractive: boolean): void {
  // Skip if already set (e.g., by SDK or other entrypoints)
  if (process.env.CLAUDE_CODE_ENTRYPOINT) {
    return;
  }
  const cliArgs = process.argv.slice(2);

  // Check for MCP serve command (handle flags before mcp serve, e.g., --debug mcp serve)
  const mcpIndex = cliArgs.indexOf('mcp');
  if (mcpIndex !== -1 && cliArgs[mcpIndex + 1] === 'serve') {
    process.env.CLAUDE_CODE_ENTRYPOINT = 'mcp';
    return;
  }
  if (isEnvTruthy(process.env.CLAUDE_CODE_ACTION)) {
    process.env.CLAUDE_CODE_ENTRYPOINT = 'claude-code-github-action';
    return;
  }

  // Note: 'local-agent' entrypoint is set by the local agent mode launcher
  // via CLAUDE_CODE_ENTRYPOINT env var (handled by early return above)

  // Set based on interactive status
  process.env.CLAUDE_CODE_ENTRYPOINT = isNonInteractive ? 'sdk-cli' : 'cli';
}

`

export function buildTarget119EntrypointRoutingOutputs(inputs) {
  const byPath = new Map(inputs.map(item => [item.path, item.source]))

  let keys = byPath.get('src/constants/keys.ts')
  keys = keys.replace(/\n$/, '') + ENTRYPOINT_DECLARATIONS + '\n'

  let state = byPath.get('src/bootstrap/state.ts')
  state = replaceExact(
    state,
    '  sessionSource: string | undefined\n  questionPreviewFormat:',
    "  sessionSource: string | undefined\n  sessionStartType: 'fresh' | 'resume' | 'continue'\n  questionPreviewFormat:",
    'bootstrap state type',
  )
  state = replaceExact(
    state,
    "    sessionSource: undefined,\n    questionPreviewFormat:",
    "    sessionSource: undefined,\n    sessionStartType: 'fresh',\n    questionPreviewFormat:",
    'bootstrap state default',
  )
  state = replaceExact(
    state,
    `export function setSessionSource(source: string): void {
  STATE.sessionSource = source
}

export function getQuestionPreviewFormat`,
    `export function setSessionSource(source: string): void {
  STATE.sessionSource = source
}

export function getSessionStartType(): 'fresh' | 'resume' | 'continue' {
  return STATE.sessionStartType
}

export function setSessionStartType(
  type: 'fresh' | 'resume' | 'continue',
): void {
  STATE.sessionStartType = type
}

export function getQuestionPreviewFormat`,
    'bootstrap state accessors',
  )

  let main = byPath.get('src/main.tsx')
  main = replaceExact(
    main,
    "import { getOauthConfig } from './constants/oauth.js';",
    "import { getSessionStartType, initializeEntrypoint } from './constants/keys.js';\nimport { getOauthConfig } from './constants/oauth.js';",
    'main entrypoint import',
  )
  main = replaceExact(
    main,
    'setSdkBetas, setSessionBypassPermissionsMode, setSessionPersistenceDisabled, setSessionSource, setUserMsgOptIn, switchSession',
    'setSdkBetas, setSessionBypassPermissionsMode, setSessionPersistenceDisabled, setSessionSource, setSessionStartType, setUserMsgOptIn, switchSession',
    'main bootstrap setter import',
  )
  main = replaceExact(main, RAW_INITIALIZE_ENTRYPOINT, '', 'main local initializer')
  main = replaceExact(
    main,
    `  initializeEntrypoint(isNonInteractive);

  // Determine client type`,
    `  initializeEntrypoint(isNonInteractive);
  setSessionStartType(getSessionStartType(cliArgs));

  // Determine client type`,
    'main startup state call',
  )

  let growthbook = byPath.get('src/services/analytics/growthbook.ts')
  growthbook = replaceExact(
    growthbook,
    "import { getGrowthBookClientKey } from '../../constants/keys.js'",
    "import { getEntrypoint, getGrowthBookClientKey } from '../../constants/keys.js'",
    'GrowthBook entrypoint import',
  )
  growthbook = replaceExact(
    growthbook,
    '  github?: GitHubActionsMetadata\n}',
    '  github?: GitHubActionsMetadata\n  releaseChannel?: string\n  entrypoint?: string\n}',
    'GrowthBook attribute type',
  )
  growthbook = replaceExact(
    growthbook,
    `  const apiBaseUrlHost = getApiBaseUrlHost()

  const attributes = {`,
    `  const apiBaseUrlHost = getApiBaseUrlHost()
  const autoUpdatesChannel = getGlobalConfig()?.autoUpdatesChannel
  const releaseChannel = false ? autoUpdatesChannel : undefined
  const entrypoint = getEntrypoint()

  const attributes = {`,
    'GrowthBook validated entrypoint',
  )
  growthbook = replaceExact(
    growthbook,
    `    ...(user.githubActionsMetadata && {
      githubActionsMetadata: user.githubActionsMetadata,
    }),
  }`,
    `    ...(user.githubActionsMetadata && {
      githubActionsMetadata: user.githubActionsMetadata,
    }),
    ...(releaseChannel && { releaseChannel }),
    ...(entrypoint && { entrypoint }),
  }`,
    'GrowthBook entrypoint attribute',
  )

  return [
    { path: 'src/constants/keys.ts', source: keys },
    { path: 'src/bootstrap/state.ts', source: state },
    { path: 'src/main.tsx', source: main },
    { path: 'src/services/analytics/growthbook.ts', source: growthbook },
  ]
}

function readExact(sourceRoot, descriptor, label) {
  const filename = path.join(sourceRoot, descriptor.path.replace(/^src\//, ''))
  const source = fs.readFileSync(filename, 'utf8')
  if (Buffer.byteLength(source) !== descriptor.bytes || sha256(source) !== descriptor.sha256) {
    throw new Error(`${label}: unexpected ${descriptor.path} identity`)
  }
  return { ...descriptor, filename, source }
}

export function applyTarget119EntrypointRoutingSourceRecovery({ sourceRoot } = {}) {
  if (typeof sourceRoot !== 'string' || sourceRoot.length === 0) {
    throw new Error('Target119 entrypoint routing replay requires sourceRoot')
  }
  const states = TARGET119_ENTRYPOINT_ROUTING_INPUT_FILES.map((input, index) => {
    const output = TARGET119_ENTRYPOINT_ROUTING_OUTPUT_FILES[index]
    const filename = path.join(sourceRoot, input.path.replace(/^src\//, ''))
    const source = fs.readFileSync(filename, 'utf8')
    const identity = { bytes: Buffer.byteLength(source), sha256: sha256(source) }
    if (identity.bytes === output.bytes && identity.sha256 === output.sha256) {
      return { kind: 'output', filename, source }
    }
    if (identity.bytes === input.bytes && identity.sha256 === input.sha256) {
      return { kind: 'input', filename, source }
    }
    throw new Error(`Target119 entrypoint routing replay: unexpected ${input.path} identity`)
  })
  const kinds = new Set(states.map(state => state.kind))
  if (kinds.size !== 1) {
    throw new Error('Target119 entrypoint routing replay rejects mixed source states')
  }
  if (states[0].kind === 'output') return 'already-recovered'

  const outputs = buildTarget119EntrypointRoutingOutputs(
    states.map((state, index) => ({
      path: TARGET119_ENTRYPOINT_ROUTING_INPUT_FILES[index].path,
      source: state.source,
    })),
  )
  for (const [index, output] of outputs.entries()) {
    const descriptor = TARGET119_ENTRYPOINT_ROUTING_OUTPUT_FILES[index]
    if (
      output.path !== descriptor.path ||
      Buffer.byteLength(output.source) !== descriptor.bytes ||
      sha256(output.source) !== descriptor.sha256
    ) {
      throw new Error(`Target119 entrypoint routing replay produced unexpected ${output.path}`)
    }
  }
  for (const [index, output] of outputs.entries()) {
    fs.writeFileSync(states[index].filename, output.source)
  }
  return 'recovered'
}
