#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.117-to-2.1.118'
const SOURCE_PATH = 'src/components/StatusLine.tsx'

export const TARGET118_STATUS_LINE_FAST_MODE_INPUT_FILE = Object.freeze({
  path: SOURCE_PATH,
  bytes: 49993,
  sha256: '66c15151918f041373474774b07de5660c893cb3b766a633da57c61573f02078',
})

export const TARGET118_STATUS_LINE_FAST_MODE_OUTPUT_FILE = Object.freeze({
  path: SOURCE_PATH,
  bytes: 50434,
  sha256: '26c4ff027b197d706e454f0e2e159f6eb2d91757074e32b4f11d0656b30bfa7d',
})

const EVIDENCE_IDS = Object.freeze([
  'target118-status-line-fast-mode-target-fragment',
  'target118-status-line-fast-mode-source-replay-test',
  'target118-status-line-fast-mode-source-ast-test',
])

export const TARGET118_STATUS_LINE_FAST_MODE_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:19485`,
    targetIndex: 19485,
    paths: Object.freeze([SOURCE_PATH]),
    declarations: Object.freeze([
      'buildStatusLineCommandInput',
      'StatusLineInner',
    ]),
    evidenceIds: EVIDENCE_IDS,
    behavior:
      'The authenticated Target118 status-line input builder carries the AppState fast-mode boolean into fast_mode and uses one caller-sampled cwd consistently for the top-level hook input, workspace.current_dir, and git-worktree lookup. The bounded replay restores the selector/ref/change-trigger/caller chain and the complete buildStatusLineCommandInput declaration without importing later effort or thinking fields.',
  }),
])

const OPERATIONS = Object.freeze([
  Object.freeze({
    label: 'status-line builder parameters',
    before:
      'function buildStatusLineCommandInput(permissionMode: PermissionMode, exceeds200kTokens: boolean, settings: ReadonlySettings, messages: Message[], addedDirs: string[], mainLoopModel: ModelName, gitWorktree: string | null, vimMode?: VimMode): StatusLineCommandInput {',
    after:
      'function buildStatusLineCommandInput(permissionMode: PermissionMode, exceeds200kTokens: boolean, fastMode: boolean, settings: ReadonlySettings, messages: Message[], addedDirs: string[], mainLoopModel: ModelName, gitWorktree: string | null, vimMode: VimMode | undefined, cwd: string): StatusLineCommandInput {',
  }),
  Object.freeze({
    label: 'single sampled cwd hook input',
    before: [
      '  return {',
      '    ...createBaseHookInput(),',
      '    ...(sessionName && {',
    ].join('\n'),
    after: [
      '  return {',
      '    ...createBaseHookInput(),',
      '    cwd,',
      '    ...(sessionName && {',
    ].join('\n'),
  }),
  Object.freeze({
    label: 'single sampled cwd workspace field',
    before: '      current_dir: getCwd(),\n',
    after: '      current_dir: cwd,\n',
  }),
  Object.freeze({
    label: 'status-line fast-mode field',
    before:
      '    exceeds_200k_tokens: exceeds200kTokens,\n' +
      '    ...((rateLimits.five_hour || rateLimits.seven_day) && {\n',
    after:
      '    exceeds_200k_tokens: exceeds200kTokens,\n' +
      '    fast_mode: fastMode,\n' +
      '    ...((rateLimits.five_hour || rateLimits.seven_day) && {\n',
  }),
  Object.freeze({
    label: 'fast-mode AppState selector',
    before:
      '  const statusLineText = useAppState(s => s.statusLineText);\n' +
      '  const setAppState = useSetAppState();\n',
    after:
      '  const statusLineText = useAppState(s => s.statusLineText);\n' +
      '  const fastMode = useAppState(s => s.fastMode ?? false);\n' +
      '  const setAppState = useSetAppState();\n',
  }),
  Object.freeze({
    label: 'fast-mode stable callback ref',
    before: [
      '  const mainLoopModelRef = useRef(mainLoopModel);',
      '  mainLoopModelRef.current = mainLoopModel;',
      '',
      '  // Track previous state to detect changes and cache expensive calculations',
    ].join('\n'),
    after: [
      '  const mainLoopModelRef = useRef(mainLoopModel);',
      '  mainLoopModelRef.current = mainLoopModel;',
      '  const fastModeRef = useRef(fastMode);',
      '  fastModeRef.current = fastMode;',
      '',
      '  // Track previous state to detect changes and cache expensive calculations',
    ].join('\n'),
  }),
  Object.freeze({
    label: 'fast-mode previous-state type',
    before: [
      '    vimMode: VimMode | undefined;',
      '    mainLoopModel: ModelName;',
      '  }>({',
    ].join('\n'),
    after: [
      '    vimMode: VimMode | undefined;',
      '    mainLoopModel: ModelName;',
      '    fastMode: boolean;',
      '  }>({',
    ].join('\n'),
  }),
  Object.freeze({
    label: 'fast-mode previous-state value',
    before: [
      '    permissionMode,',
      '    vimMode,',
      '    mainLoopModel',
      '  });',
    ].join('\n'),
    after: [
      '    permissionMode,',
      '    vimMode,',
      '    mainLoopModel,',
      '    fastMode',
      '  });',
    ].join('\n'),
  }),
  Object.freeze({
    label: 'fast-mode and cwd status-line caller',
    before:
      '      const statusInput = buildStatusLineCommandInput(permissionModeRef.current, exceeds200kTokens, settingsRef.current, msgs, Array.from(addedDirsRef.current.keys()), mainLoopModelRef.current, await getGitWorktreeName(getCwd()), vimModeRef.current);',
    after: [
      '      const cwd = getCwd();',
      '      const gitWorktree = await getGitWorktreeName(cwd);',
      '      const statusInput = buildStatusLineCommandInput(permissionModeRef.current, exceeds200kTokens, fastModeRef.current, settingsRef.current, msgs, Array.from(addedDirsRef.current.keys()), mainLoopModelRef.current, gitWorktree, vimModeRef.current, cwd);',
    ].join('\n'),
  }),
  Object.freeze({
    label: 'fast-mode update trigger',
    before: [
      '    if (lastAssistantMessageId !== previousStateRef.current.messageId || permissionMode !== previousStateRef.current.permissionMode || vimMode !== previousStateRef.current.vimMode || mainLoopModel !== previousStateRef.current.mainLoopModel) {',
      "      // Don't update messageId here — let doUpdate handle it so",
      '      // exceeds200kTokens is recalculated with the latest messages',
      '      previousStateRef.current.permissionMode = permissionMode;',
      '      previousStateRef.current.vimMode = vimMode;',
      '      previousStateRef.current.mainLoopModel = mainLoopModel;',
      '      scheduleUpdate();',
      '    }',
      '  }, [lastAssistantMessageId, permissionMode, vimMode, mainLoopModel, scheduleUpdate]);',
    ].join('\n'),
    after: [
      '    if (lastAssistantMessageId !== previousStateRef.current.messageId || permissionMode !== previousStateRef.current.permissionMode || vimMode !== previousStateRef.current.vimMode || mainLoopModel !== previousStateRef.current.mainLoopModel || fastMode !== previousStateRef.current.fastMode) {',
      "      // Don't update messageId here — let doUpdate handle it so",
      '      // exceeds200kTokens is recalculated with the latest messages',
      '      previousStateRef.current.permissionMode = permissionMode;',
      '      previousStateRef.current.vimMode = vimMode;',
      '      previousStateRef.current.mainLoopModel = mainLoopModel;',
      '      previousStateRef.current.fastMode = fastMode;',
      '      scheduleUpdate();',
      '    }',
      '  }, [lastAssistantMessageId, permissionMode, vimMode, mainLoopModel, fastMode, scheduleUpdate]);',
    ].join('\n'),
  }),
])

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

export function buildTarget118StatusLineFastModeOutput(input) {
  let output = input
  for (const operation of OPERATIONS) output = replaceExactly(output, operation)
  return Buffer.from(output)
}

function resolveSourcePath(sourceRoot) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, SOURCE_PATH.replace(/^src\//, ''))
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${SOURCE_PATH}: escapes supplied source root`)
  }
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${SOURCE_PATH}: expected a real source file`)
  }
  return filename
}

export function applyTarget118StatusLineFastModeSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const filename = resolveSourcePath(sourceRoot)
  const input = fs.readFileSync(filename)
  const actual = descriptor(input)
  if (sameDescriptor(actual, TARGET118_STATUS_LINE_FAST_MODE_OUTPUT_FILE)) {
    return { status: 'already-recovered', files: [SOURCE_PATH] }
  }
  if (!sameDescriptor(actual, TARGET118_STATUS_LINE_FAST_MODE_INPUT_FILE)) {
    throw new Error(
      `${CASE_NAME}: ${SOURCE_PATH} requires exact raw or recovered state; got ${actual.bytes}/${actual.sha256}`,
    )
  }
  const output = buildTarget118StatusLineFastModeOutput(input.toString())
  const outputDescriptor = descriptor(output)
  if (!sameDescriptor(outputDescriptor, TARGET118_STATUS_LINE_FAST_MODE_OUTPUT_FILE)) {
    throw new Error(
      `${CASE_NAME}: ${SOURCE_PATH} replay output differs ${outputDescriptor.bytes}/${outputDescriptor.sha256}`,
    )
  }
  fs.writeFileSync(filename, output)
  if (
    !sameDescriptor(
      descriptor(fs.readFileSync(filename)),
      TARGET118_STATUS_LINE_FAST_MODE_OUTPUT_FILE,
    )
  ) {
    throw new Error(`${CASE_NAME}: ${SOURCE_PATH} written postimage differs`)
  }
  return { status: 'recovered', files: [SOURCE_PATH] }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceRootIndex = process.argv.indexOf('--source-root')
  const sourceRoot =
    sourceRootIndex >= 0 ? process.argv[sourceRootIndex + 1] : process.argv[2]
  if (!sourceRoot) {
    throw new Error(
      'usage: replay-status-line-fast-mode-source-gap.mjs --source-root DIR',
    )
  }
  process.stdout.write(
    `${JSON.stringify(
      applyTarget118StatusLineFastModeSourceRecovery({
        sourceRoot: path.resolve(sourceRoot),
      }),
    )}\n`,
  )
}
