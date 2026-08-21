#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.118-to-2.1.119'
const SOURCE_PATH = 'src/components/StatusLine.tsx'

export const TARGET119_STATUS_LINE_CWD_FAST_MODE_INPUT_FILE = Object.freeze({
  path: SOURCE_PATH,
  bytes: 51111,
  sha256: 'ff74e7b0a8dcab4f5ad6ef187fd0cf1c79ca0b402c2f329841573081d0defd18',
})

export const TARGET119_STATUS_LINE_CWD_FAST_MODE_OUTPUT_FILE = Object.freeze({
  path: SOURCE_PATH,
  bytes: 51552,
  sha256: '69b224cbd42ebabc2036ab8294af7488d8adc00293d58867a656961acbd17dff',
})

const EVIDENCE_IDS = Object.freeze([
  'target119-status-line-cwd-fast-mode-target-fragment',
  'target119-status-line-cwd-fast-mode-source-replay-test',
  'target119-status-line-cwd-fast-mode-source-ast-test',
])

export const TARGET119_STATUS_LINE_CWD_FAST_MODE_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20416`,
      targetIndex: 20416,
      paths: Object.freeze([SOURCE_PATH]),
      declarations: Object.freeze([
        'buildStatusLineCommandInput',
        'StatusLineInner',
      ]),
      evidenceIds: EVIDENCE_IDS,
      behavior:
        'The Target119 status-line hook retains the Target118 fast-mode and single-sampled-cwd contract while adding effort, thinking, and rate-limit fields. The bounded replay samples cwd once, uses it for both top-level and workspace hook fields and the worktree lookup, forwards AppState fastMode into fast_mode, and includes fast-mode changes in the stable callback trigger without altering the Target119-only fields.',
    }),
  ])

const OPERATIONS = Object.freeze([
  Object.freeze({
    label: 'status-line builder parameters',
    before:
      'function buildStatusLineCommandInput(permissionMode: PermissionMode, exceeds200kTokens: boolean, settings: ReadonlySettings, messages: Message[], addedDirs: string[], mainLoopModel: ModelName, gitWorktree: string | null, vimMode?: VimMode, effortValue?: EffortValue, thinkingEnabled?: boolean): StatusLineCommandInput {',
    after:
      'function buildStatusLineCommandInput(permissionMode: PermissionMode, exceeds200kTokens: boolean, fastMode: boolean, settings: ReadonlySettings, messages: Message[], addedDirs: string[], mainLoopModel: ModelName, gitWorktree: string | null, vimMode: VimMode | undefined, cwd: string, effortValue?: EffortValue, thinkingEnabled?: boolean): StatusLineCommandInput {',
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
      '    ...(modelSupportsEffort(runtimeModel) && {\n',
    after:
      '    exceeds_200k_tokens: exceeds200kTokens,\n' +
      '    fast_mode: fastMode,\n' +
      '    ...(modelSupportsEffort(runtimeModel) && {\n',
  }),
  Object.freeze({
    label: 'fast-mode AppState selector',
    before:
      '  const statusLineText = useAppState(s => s.statusLineText);\n' +
      '  const effortValue = useAppState(s => s.effortValue);\n',
    after:
      '  const statusLineText = useAppState(s => s.statusLineText);\n' +
      '  const fastMode = useAppState(s => s.fastMode ?? false);\n' +
      '  const effortValue = useAppState(s => s.effortValue);\n',
  }),
  Object.freeze({
    label: 'fast-mode stable callback ref',
    before: [
      '  const mainLoopModelRef = useRef(mainLoopModel);',
      '  mainLoopModelRef.current = mainLoopModel;',
      '  const effortValueRef = useRef(effortValue);',
    ].join('\n'),
    after: [
      '  const mainLoopModelRef = useRef(mainLoopModel);',
      '  mainLoopModelRef.current = mainLoopModel;',
      '  const fastModeRef = useRef(fastMode);',
      '  fastModeRef.current = fastMode;',
      '  const effortValueRef = useRef(effortValue);',
    ].join('\n'),
  }),
  Object.freeze({
    label: 'fast-mode previous-state type',
    before: [
      '    mainLoopModel: ModelName;',
      '    effortValue: EffortValue | undefined;',
    ].join('\n'),
    after: [
      '    mainLoopModel: ModelName;',
      '    fastMode: boolean;',
      '    effortValue: EffortValue | undefined;',
    ].join('\n'),
  }),
  Object.freeze({
    label: 'fast-mode previous-state value',
    before: [
      '    mainLoopModel,',
      '    effortValue,',
    ].join('\n'),
    after: [
      '    mainLoopModel,',
      '    fastMode,',
      '    effortValue,',
    ].join('\n'),
  }),
  Object.freeze({
    label: 'fast-mode and cwd status-line caller',
    before:
      '      const statusInput = buildStatusLineCommandInput(permissionModeRef.current, exceeds200kTokens, settingsRef.current, msgs, Array.from(addedDirsRef.current.keys()), mainLoopModelRef.current, await getGitWorktreeName(getCwd()), vimModeRef.current, effortValueRef.current, thinkingEnabledRef.current);',
    after: [
      '      const cwd = getCwd();',
      '      const gitWorktree = await getGitWorktreeName(cwd);',
      '      const statusInput = buildStatusLineCommandInput(permissionModeRef.current, exceeds200kTokens, fastModeRef.current, settingsRef.current, msgs, Array.from(addedDirsRef.current.keys()), mainLoopModelRef.current, gitWorktree, vimModeRef.current, cwd, effortValueRef.current, thinkingEnabledRef.current);',
    ].join('\n'),
  }),
  Object.freeze({
    label: 'fast-mode update comparison',
    before:
      'mainLoopModel !== previousStateRef.current.mainLoopModel || effortValue !== previousStateRef.current.effortValue',
    after:
      'mainLoopModel !== previousStateRef.current.mainLoopModel || fastMode !== previousStateRef.current.fastMode || effortValue !== previousStateRef.current.effortValue',
  }),
  Object.freeze({
    label: 'fast-mode previous-state assignment',
    before:
      '      previousStateRef.current.mainLoopModel = mainLoopModel;\n' +
      '      previousStateRef.current.effortValue = effortValue;\n',
    after:
      '      previousStateRef.current.mainLoopModel = mainLoopModel;\n' +
      '      previousStateRef.current.fastMode = fastMode;\n' +
      '      previousStateRef.current.effortValue = effortValue;\n',
  }),
  Object.freeze({
    label: 'fast-mode update dependency',
    before:
      '  }, [lastAssistantMessageId, permissionMode, vimMode, mainLoopModel, effortValue, thinkingEnabled, scheduleUpdate]);',
    after:
      '  }, [lastAssistantMessageId, permissionMode, vimMode, mainLoopModel, fastMode, effortValue, thinkingEnabled, scheduleUpdate]);',
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
  const first = source.indexOf(operation.before)
  const second = source.indexOf(operation.before, first + 1)
  if (first < 0 || second >= 0) {
    throw new Error(
      `${CASE_NAME}: ${operation.label} replay anchor count differs`,
    )
  }
  return (
    source.slice(0, first) +
    operation.after +
    source.slice(first + operation.before.length)
  )
}

export function buildTarget119StatusLineCwdFastModeOutput(input) {
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

export function applyTarget119StatusLineCwdFastModeSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const filename = resolveSourcePath(sourceRoot)
  const input = fs.readFileSync(filename)
  const actual = descriptor(input)
  if (sameDescriptor(actual, TARGET119_STATUS_LINE_CWD_FAST_MODE_OUTPUT_FILE)) {
    return { status: 'already-recovered', files: [SOURCE_PATH] }
  }
  if (!sameDescriptor(actual, TARGET119_STATUS_LINE_CWD_FAST_MODE_INPUT_FILE)) {
    throw new Error(
      `${CASE_NAME}: ${SOURCE_PATH} requires exact raw or recovered state; got ${actual.bytes}/${actual.sha256}`,
    )
  }
  const output = buildTarget119StatusLineCwdFastModeOutput(input.toString())
  const outputDescriptor = descriptor(output)
  if (
    !sameDescriptor(
      outputDescriptor,
      TARGET119_STATUS_LINE_CWD_FAST_MODE_OUTPUT_FILE,
    )
  ) {
    throw new Error(
      `${CASE_NAME}: ${SOURCE_PATH} replay output differs ${outputDescriptor.bytes}/${outputDescriptor.sha256}`,
    )
  }
  fs.writeFileSync(filename, output)
  return { status: 'recovered', files: [SOURCE_PATH] }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceRootIndex = process.argv.indexOf('--source-root')
  const sourceRoot =
    sourceRootIndex >= 0 ? process.argv[sourceRootIndex + 1] : process.argv[2]
  if (!sourceRoot) throw new Error('usage: replay helper --source-root DIR')
  process.stdout.write(
    `${JSON.stringify(
      applyTarget119StatusLineCwdFastModeSourceRecovery({
        sourceRoot: path.resolve(sourceRoot),
      }),
    )}\n`,
  )
}
