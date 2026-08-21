#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'
const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url))

function freezeFile(file) {
  return Object.freeze({ ...file })
}

function freezeOverride(override) {
  return Object.freeze({
    ...override,
    paths: Object.freeze([...override.paths]),
    declarations: Object.freeze([...override.declarations]),
    evidenceIds: Object.freeze([...override.evidenceIds]),
  })
}

export const TARGET117_RETAINED_FULLSCREEN_PATCH_INPUT = freezeFile({
  path: 'recovery/cases/2.1.114-to-2.1.116/semantic-supplement.patch',
  bytes: 2096432,
  sha256:
    '0b7bd7e8753a41047607e498ab64d66c1bd94f8cb190f4fd2a31cf795b143244',
})

export const TARGET117_RETAINED_FULLSCREEN_INPUT_FILES = Object.freeze([
  freezeFile({
    path: 'src/components/CoordinatorAgentStatus.tsx',
    bytes: 36038,
    sha256:
      'da5e786affc810d9b33811213c70aaa3cc31377ea3f8388ab902858a259c6987',
  }),
  freezeFile({
    path: 'src/components/App.tsx',
    bytes: 5204,
    sha256:
      '01bc49b40975f9626baf381b42c1083fa06456bc955b1d7051dac81d77811785',
  }),
  freezeFile({
    path: 'src/components/ScrollKeybindingHandler.tsx',
    bytes: 149202,
    sha256:
      '3f1f851036f7529a9d084867692752fd420260275ca5810d48763a21dec7ed75',
  }),
  freezeFile({
    path: 'src/components/PromptInput/PromptInput.tsx',
    bytes: 356470,
    sha256:
      '3a865cec943842f8fed60bc506ffb6ca7a0a4d57b139bbcd63df1a8817e70211',
  }),
])

export const TARGET117_RETAINED_FULLSCREEN_OUTPUT_FILES = Object.freeze([
  freezeFile({
    path: 'src/components/CoordinatorAgentStatus.tsx',
    bytes: 37877,
    sha256:
      '3a77a016c9115161490f583c227c5dccf6e15ba4509c0d171211c1d31efe1fc1',
  }),
  freezeFile({
    path: 'src/components/App.tsx',
    bytes: 5659,
    sha256:
      '63179cbde10b91a5edaac01474e7c9bc6090c02ce2d2ec6d82bcf814b4f3c437',
  }),
  freezeFile({
    path: 'src/components/ScrollKeybindingHandler.tsx',
    bytes: 154800,
    sha256:
      '3398e6bf65545fc7be4589c6ee098dd2f4e5c58fb046a5df00d19db6a34d3754',
  }),
  freezeFile({
    path: 'src/components/PromptInput/PromptInput.tsx',
    bytes: 361464,
    sha256:
      '7c01c8c4bbe1f87e28de7174d8713ed4be90146b44355028195f6548631c1590',
  }),
  freezeFile({
    path: 'src/context/selectionDelete.tsx',
    bytes: 1429,
    sha256:
      'b5ef0c4da3f51a0242df4f2b23116a2fa5c524b51bed90ff1395fbddaa25f300',
  }),
])

const TARGET_FRAGMENT_EVIDENCE =
  'target117-retained-fullscreen-target-fragments'
const REPLAY_EVIDENCE = 'target117-retained-fullscreen-source-replay-test'

export const TARGET117_RETAINED_FULLSCREEN_OWNER_OVERRIDES = Object.freeze([
  freezeOverride({
    key: `${CASE_NAME}:19181`,
    targetIndex: 19181,
    paths: ['src/components/CoordinatorAgentStatus.tsx'],
    declarations: ['CoordinatorTaskPanel'],
    evidenceIds: [TARGET_FRAGMENT_EVIDENCE, REPLAY_EVIDENCE],
    behavior:
      'The retained Target116 supplement restores the Target117 coordinator panel hint as part of its selected-task, keyboard-action, width, decoration, and MainLine prop graph; the unrelated BridgeDialog source-map owner is rejected.',
  }),
  freezeOverride({
    key: `${CASE_NAME}:19389`,
    targetIndex: 19389,
    paths: ['src/components/PromptInput/PromptInput.tsx'],
    declarations: ['getPromptSelectionOffsets', 'PromptInput'],
    evidenceIds: [TARGET_FRAGMENT_EVIDENCE, REPLAY_EVIDENCE],
    behavior:
      'The retained Target116 supplement restores Target117 fullscreen selection deletion end to end: screen bounds are converted through the input container layout, the selected input span is deleted, and the provider/key-handler bridge consumes only an authenticated editable selection.',
  }),
])

const PATCH_PATHS = Object.freeze(
  TARGET117_RETAINED_FULLSCREEN_OUTPUT_FILES.map(file => file.path),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function assertDescriptor(value, expected, label) {
  const actual = descriptor(value)
  if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
    throw new Error(
      `${label}: expected ${expected.bytes}/${expected.sha256}, got ${actual.bytes}/${actual.sha256}`,
    )
  }
}

function resolveBelow(root, relativePath) {
  if (!relativePath.startsWith('src/')) {
    throw new Error(`Refusing non-source replay path: ${relativePath}`)
  }
  const filename = path.resolve(root, relativePath.slice(4))
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Replay path escapes source root: ${relativePath}`)
  }
  return filename
}

function sourceState(sourceRoot) {
  const root = path.resolve(sourceRoot)
  const inputMatches = TARGET117_RETAINED_FULLSCREEN_INPUT_FILES.every(file => {
    const filename = resolveBelow(root, file.path)
    if (!fs.existsSync(filename)) return false
    const actual = descriptor(fs.readFileSync(filename))
    return actual.bytes === file.bytes && actual.sha256 === file.sha256
  })
  const contextInput = resolveBelow(root, 'src/context/selectionDelete.tsx')
  if (inputMatches && !fs.existsSync(contextInput)) return 'raw'

  const outputMatches = TARGET117_RETAINED_FULLSCREEN_OUTPUT_FILES.every(file => {
    const filename = resolveBelow(root, file.path)
    if (!fs.existsSync(filename)) return false
    const actual = descriptor(fs.readFileSync(filename))
    return actual.bytes === file.bytes && actual.sha256 === file.sha256
  })
  if (outputMatches) return 'recovered'
  return 'unknown'
}

function authenticatePatchInput() {
  const filename = path.join(
    repositoryRoot,
    TARGET117_RETAINED_FULLSCREEN_PATCH_INPUT.path,
  )
  const bytes = fs.readFileSync(filename)
  assertDescriptor(
    bytes,
    TARGET117_RETAINED_FULLSCREEN_PATCH_INPUT,
    'retained Target116 semantic supplement',
  )
  const text = bytes.toString('utf8')
  const anchors = [
    '+  const hint = selectedTask ? (',
    '+export function getPromptSelectionOffsets(',
    '+  const selectionDeleteHandlerRef = useRef<((selection: SelectionState) => boolean) | null>(null);',
    '+export function SelectionDeleteProvider({',
    '+      if (state && selectionDelete.tryDelete(state)) {',
  ]
  for (const anchor of anchors) {
    if (!text.includes(anchor)) {
      throw new Error(`Retained Target116 semantic supplement lost anchor: ${anchor}`)
    }
  }
  return filename
}

function applyFilteredPatch(sourceRoot, patchFilename) {
  const root = path.resolve(sourceRoot)
  if (path.basename(root) !== 'src') {
    throw new Error('sourceRoot must be the historical src directory')
  }
  const result = spawnSync(
    'git',
    [
      'apply',
      '--unsafe-paths',
      ...PATCH_PATHS.flatMap(sourcePath => [`--include=${sourcePath}`]),
      patchFilename,
    ],
    {
      cwd: path.dirname(root),
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    },
  )
  if (result.status !== 0) {
    throw new Error(
      `Filtered retained-source replay failed: ${result.stderr || result.stdout}`,
    )
  }
}

function authenticateOutputs(sourceRoot) {
  const root = path.resolve(sourceRoot)
  for (const file of TARGET117_RETAINED_FULLSCREEN_OUTPUT_FILES) {
    assertDescriptor(
      fs.readFileSync(resolveBelow(root, file.path)),
      file,
      `recovered ${file.path}`,
    )
  }
}

export function applyTarget117RetainedFullscreenInteractionSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const patchFilename = authenticatePatchInput()
  const state = sourceState(sourceRoot)
  if (state === 'recovered') {
    return Object.freeze({
      status: 'already-recovered',
      files: TARGET117_RETAINED_FULLSCREEN_OUTPUT_FILES.length,
      ownerOverrides: TARGET117_RETAINED_FULLSCREEN_OWNER_OVERRIDES.length,
    })
  }
  if (state !== 'raw') {
    throw new Error(
      'Refusing to recover a mixed or non-target fullscreen interaction source state',
    )
  }

  applyFilteredPatch(sourceRoot, patchFilename)
  authenticateOutputs(sourceRoot)
  return Object.freeze({
    status: 'recovered',
    files: TARGET117_RETAINED_FULLSCREEN_OUTPUT_FILES.length,
    ownerOverrides: TARGET117_RETAINED_FULLSCREEN_OWNER_OVERRIDES.length,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceRoot = process.argv[2]
  const result = applyTarget117RetainedFullscreenInteractionSourceRecovery({
    sourceRoot,
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
