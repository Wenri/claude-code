#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_DANGEROUS_MODE_PRE_DIALOG_EVIDENCE_IDS = Object.freeze([
  'target121-dangerous-mode-pre-dialog-authenticated-units',
  'target121-dangerous-mode-pre-dialog-call-callee-graph',
  'target121-dangerous-mode-pre-dialog-source-replay',
  'target121-dangerous-mode-pre-dialog-two-row-partition',
])

export const TARGET121_DANGEROUS_MODE_PRE_DIALOG_SOURCE_STATES = Object.freeze([
  Object.freeze({
    name: 'preViewModeReplay',
    path: 'src/main.tsx',
    input: Object.freeze({
      bytes: 816314,
      sha256: 'c4e91aae36588101d8280ac6375cdae4f7981361480ad53b93a4dfb19b87ed33',
    }),
    output: Object.freeze({
      bytes: 816570,
      sha256: 'da0d35f71b4c91a298bdc121a2b0a2bfd57a60641f2a6c1990541037c81c1ea7',
    }),
  }),
  Object.freeze({
    name: 'postViewModeReplay',
    path: 'src/main.tsx',
    input: Object.freeze({
      bytes: 816530,
      sha256: '13589f838f55a46b5eeaa551acd450ee5bdcd1fcd8e71578039e6a03d77d54c9',
    }),
    output: Object.freeze({
      bytes: 816786,
      sha256: 'ecc8aa7337fb3f4bebaee045db279d1330367d9e2b9449b2f3cccf31b19a88fc',
    }),
  }),
])

// The caller and callee rows are inseparable source evidence. The u22107
// parameter is otherwise unused, and the u22106 property has exactly one
// matching pre-dialog snapshot definition. Replaying either residue alone
// would leave a partial API contract, so this object admits exactly the two
// linked rows and no other u22106 residue.
export const TARGET121_DANGEROUS_MODE_PRE_DIALOG_OWNER_EVIDENCE = Object.freeze({
  key: `${CASE_NAME}:22106-22107:dangerous-mode-pre-dialog`,
  targetIndexes: Object.freeze([22106, 22107]),
  paths: Object.freeze(['src/main.tsx']),
  declarations: Object.freeze(['run', 'logTenguInit']),
  residues: Object.freeze([
    Object.freeze({
      targetIndex: 22106,
      literalKind: 'property',
      value: 'skipDangerousModePromptSetPreDialog',
      start: 13809436,
      end: 13809471,
      targetOccurrenceNumber: 1,
    }),
    Object.freeze({
      targetIndex: 22107,
      literalKind: 'property',
      value: 'skipDangerousModePromptSetPreDialog',
      start: 13842321,
      end: 13842356,
      targetOccurrenceNumber: 2,
    }),
  ]),
  evidenceIds: TARGET121_DANGEROUS_MODE_PRE_DIALOG_EVIDENCE_IDS,
  behavior:
    'Target121 snapshots hasSkipDangerousModePermissionPrompt before showSetupScreens, passes that boolean from run, and destructures it at logTenguInit. This bounded replay restores the exact import, snapshot, call property, and typed callee parameter. It admits only the linked u22106 caller and u22107 callee rows; the u22106 viewMode/focus and first-allowed admissions and every other deferred row remain outside its boundary.',
})

const OLD_SETTINGS_IMPORT =
  `import { getInitialSettings, getManagedSettingsKeysForLogging, getSettingsAfterPluginLoad, getSettingsForSource, getSettingsWithErrors } from './utils/settings/settings.js';`

const NEW_SETTINGS_IMPORT =
  `import { getInitialSettings, getManagedSettingsKeysForLogging, getSettingsAfterPluginLoad, getSettingsForSource, getSettingsWithErrors, hasSkipDangerousModePermissionPrompt } from './utils/settings/settings.js';`

const OLD_PRE_DIALOG_SNAPSHOT = `    let root!: Root;
    let getFpsMetrics!: () => FpsMetrics | undefined;
    let stats!: StatsStore;

    // Show setup screens after commands are loaded`

const NEW_PRE_DIALOG_SNAPSHOT = `    let root!: Root;
    let getFpsMetrics!: () => FpsMetrics | undefined;
    let stats!: StatsStore;
    const skipDangerousModePromptSetPreDialog = hasSkipDangerousModePermissionPrompt();

    // Show setup screens after commands are loaded`

const OLD_CALL_PROPERTY = `      modeIsBypass: permissionMode === 'bypassPermissions',
      allowDangerouslySkipPermissionsPassed: allowDangerouslySkipPermissions,
      systemPromptFlag:`

const NEW_CALL_PROPERTY = `      modeIsBypass: permissionMode === 'bypassPermissions',
      allowDangerouslySkipPermissionsPassed: allowDangerouslySkipPermissions,
      skipDangerousModePromptSetPreDialog,
      systemPromptFlag:`

const OLD_CALLEE_BINDING = `  modeIsBypass,
  allowDangerouslySkipPermissionsPassed,
  systemPromptFlag,`

const NEW_CALLEE_BINDING = `  modeIsBypass,
  allowDangerouslySkipPermissionsPassed,
  skipDangerousModePromptSetPreDialog,
  systemPromptFlag,`

const OLD_CALLEE_TYPE = `  modeIsBypass: boolean;
  allowDangerouslySkipPermissionsPassed: boolean;
  systemPromptFlag:`

const NEW_CALLEE_TYPE = `  modeIsBypass: boolean;
  allowDangerouslySkipPermissionsPassed: boolean;
  skipDangerousModePromptSetPreDialog: boolean;
  systemPromptFlag:`

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function matches(actual, expected) {
  return actual.bytes === expected.bytes && actual.sha256 === expected.sha256
}

function replaceExactly(input, before, after, label) {
  const first = input.indexOf(before)
  const second = input.indexOf(before, first + 1)
  if (first < 0 || second >= 0) {
    throw new Error(`${CASE_NAME}: ${label} replay anchor differs`)
  }
  return input.slice(0, first) + after + input.slice(first + before.length)
}

export function buildTarget121DangerousModePreDialogOutput(mainSource) {
  return [
    [OLD_SETTINGS_IMPORT, NEW_SETTINGS_IMPORT, 'settings import'],
    [OLD_PRE_DIALOG_SNAPSHOT, NEW_PRE_DIALOG_SNAPSHOT, 'pre-dialog snapshot'],
    [OLD_CALL_PROPERTY, NEW_CALL_PROPERTY, 'run call property'],
    [OLD_CALLEE_BINDING, NEW_CALLEE_BINDING, 'logTenguInit binding'],
    [OLD_CALLEE_TYPE, NEW_CALLEE_TYPE, 'logTenguInit parameter type'],
  ].reduce(
    (source, [before, after, label]) =>
      replaceExactly(source, before, after, label),
    mainSource,
  )
}

export function applyTarget121DangerousModePreDialogSourceRecovery({
  sourceRoot,
}) {
  const relativePath = TARGET121_DANGEROUS_MODE_PRE_DIALOG_SOURCE_STATES[0].path
  const filename = path.join(sourceRoot, relativePath.replace(/^src\//, ''))
  const raw = fs.readFileSync(filename)
  const actual = descriptor(raw)
  const recoveredState = TARGET121_DANGEROUS_MODE_PRE_DIALOG_SOURCE_STATES.find(
    state => matches(actual, state.output),
  )
  if (recoveredState) {
    return { status: 'already-recovered', state: recoveredState.name, files: [] }
  }
  const inputState = TARGET121_DANGEROUS_MODE_PRE_DIALOG_SOURCE_STATES.find(
    state => matches(actual, state.input),
  )
  if (!inputState) {
    throw new Error(
      `${CASE_NAME}: dangerous-mode pre-dialog replay requires one exact accepted raw or recovered source state`,
    )
  }
  const recovered = Buffer.from(
    buildTarget121DangerousModePreDialogOutput(raw.toString('utf8')),
    'utf8',
  )
  if (!matches(descriptor(recovered), inputState.output)) {
    throw new Error(
      `${CASE_NAME}: dangerous-mode pre-dialog replay produced unexpected source`,
    )
  }
  fs.writeFileSync(filename, recovered)
  return {
    status: 'recovered',
    state: inputState.name,
    files: [relativePath],
  }
}
