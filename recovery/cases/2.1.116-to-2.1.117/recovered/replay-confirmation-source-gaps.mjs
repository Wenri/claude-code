#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'
const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url))

const CONSOLE_SOURCE_INPUT = Object.freeze({
  commit: '04fa3cc098785e6e8aa9d51e94d8a2065f7b485b',
  blob: '0ad0f6d688b340576b4dd09d2e126f9f535a2ab4',
  path: 'src/components/ConsoleOAuthWizards.tsx',
  bytes: 65788,
  sha256: 'e3b57b9bbb727acae433ea03037bc32bc3a6aa1189d9565989e8aedf6c8d5a42',
})

const IMPORT_SLICE = Object.freeze({
  name: 'imports',
  start: 0,
  end: 1238,
  bytes: 1238,
  sha256: '883be0c6f9101b15623cf5a281ca287cab9f051f1d69ce2a0442f82f7a3fc2ce',
})

export const TARGET117_CONSOLE_CONFIRMATION_DECLARATIONS = Object.freeze(
  [
    ['ModelTier', 1238, 1284, 46, '35226e6f5523101460085ff32cd0f6fcc9db8af4b724824679ebe8c91ae59442'],
    ['AuthMethodResult', 1284, 1421, 137, 'ac4e52bf6234385565854702ad4523b3cfaecabfbefc0defdd16758c6adc31d4'],
    ['MODEL_TIERS', 1468, 1530, 62, '7ed938767b0ad230ff4f764183308d77cd9c56bf8ddefac1d433ebc961f60d45'],
    ['DEFAULT_MODEL_KEYS', 1821, 1963, 142, 'd63e328cd5df83e5ffd65bef07ebfba4070f68955c7db9d41bf9659e2c7e64fb'],
    ['BedrockWizardData', 2398, 2777, 379, '3f4457c5edc0c2e47b97dec06aa4e81ba1efacd52b8e6a3153daf0df8bf0d9d4'],
    ['VertexWizardData', 2777, 3034, 257, '0a527bdc0f3194819015863bf83c0c419cdcf99decd313d01a38a47a35c94bce'],
    ['VerifyResult', 3034, 3212, 178, '4e55c9968d7e52a1822589ab13303d144e9c843b737524e8bbde3ef8b05620db'],
    ['plural', 3212, 3323, 111, '6ec27a1556bbf9328d4a5d0fc8f02ed7869eeb01177578840904956169cca0e5'],
    ['ErrorLine', 3425, 3609, 184, '0894fc16ee32f510e0b9c5f39b6aceacf0b26f1facbd58e7c638f33d4226e717'],
    ['LoadingStep', 3609, 4026, 417, 'f7e43d18db6d36010b7ae602fd3f5159ace3846e898cad67140e79a26cfecf13'],
    ['ConfirmChoice', 4026, 4649, 623, '5d691f30122c4c747e764642ed9973b5955d59906e034e2caca0e10486efe628'],
    ['classifyProbeError', 4649, 5146, 497, '56cd7ac1ecd4561748101096a7579fff0b8468e6975dcec6a752f7658f56f91c'],
    ['getBedrockDefaults', 15332, 15837, 505, '13e5379bcc0550f3621acedca3526def324fdf9be6d8b38994dd961ca5ad8f29'],
    ['getBedrockCredentialsProvider', 16563, 17162, 599, '9e7fd225d339ec8ac4e1f55f2980ab5da2dd0b97fc1f5da164707d0ffcb099a3'],
    ['createBedrockWizardClient', 17162, 18094, 932, 'feb60b2bbd7c99662971bfa6b04efc59bb2bc149964b3d04df00a2a64f5d5662'],
    ['probeBedrockModel', 18094, 18585, 491, 'ded77e81976fe74cb36df48c1ea73b91b47cd6ab297189d64a94c518a2b39931'],
    ['formatBedrockVerificationError', 18585, 20414, 1831, '3a5edfc1f55b73790de39334786db193ecd5a9eba3580e47754f9038992245e1'],
    ['verifyBedrock', 20414, 23213, 2799, '1174a9ab6072bdfe001a37b4ebdadff88c4058adbead742026293ba2797cd009'],
    ['BedrockVerifyStep', 34132, 36767, 2641, 'dd098d398660f8a545654a4614c8333b09f066d49be2514bb34da09946eed79c'],
    ['buildBedrockEnvironment', 38482, 39858, 1376, 'b5b09be2535a7689ed435d5b4f61f9dc6cb45356b5b49560589cbc5eb643f04c'],
    ['BEDROCK_SECRET_KEYS', 39858, 39980, 122, 'cf4fccd4304337a4c95f83ed55ec8ee7a75d1ebd816f807e1da727a73c1e1f1c'],
    ['BedrockConfirmStep', 39980, 42373, 2395, 'f4440f65db70624696c809218f16879074cd63bdf4ca972c8ffdd62d2acfe3df'],
    ['GCLOUD_AUTH_COMMAND', 43252, 43321, 69, '11967be9d194ba42d6d938970c5f81b497cc7f5d5a85aecfb5618492fc115f0a'],
    ['GCP_CREDENTIAL_TIMEOUT_MS', 43321, 43362, 41, 'c844c85551326e8b827fe1736ad33b6e0eabaa85b66304ad1011c041ca5a148b'],
    ['getVertexDefaults', 43362, 43593, 231, '5f25025abcc54de115ec0d56f6581407ad7fb8b3af0d568da1e8df2b0d234aaf'],
    ['getVertexAuthConfig', 43894, 44116, 222, 'bba11bbc6c10c5a45b2b68a44b43d5fb8ea91d95dff537b236e097d69163807c'],
    ['createVertexWizardClient', 44116, 44661, 545, '83db01c12a532a51e5fd34e4bde42fd2e79788c58b49efb878c3f674ea03b752'],
    ['probeVertexModel', 44661, 45149, 488, 'a8e55a06a423f687e03b763bd0122012f2c911246d3babcd592a5858e37b6cb7'],
    ['formatVertexCredentialError', 45149, 47139, 1996, '6be3807b8c64449d1502e62469ff019607b194c3ccc336114fdf436330310b3c'],
    ['verifyVertex', 47139, 49526, 2387, 'e097111cccf3ed84d39316edd7f9a5f5cdbf0baf712da4c25278144c3d398be8'],
    ['VertexVerifyStep', 58546, 60509, 1965, 'c86c5324018afee3d1200a539c9beb0b56417c22d64a11d7910b0c21bafe650b'],
    ['buildVertexEnvironment', 61812, 62807, 995, 'a5167a9b9a0d0ea07fa65e10bd50137ce06155dc3a9b3a4dbc5c1473d91049b1'],
    ['VertexConfirmStep', 62807, 65008, 2203, '71938d87ad8b8c39b28815c0f90d9c5bf8814b4c39b78b4bb0fc0b945432d043'],
  ].map(([name, start, end, bytes, sha256]) =>
    Object.freeze({ name, start, end, bytes, sha256 }),
  ),
)

const CONFIRMATION_BUTTONS_SOURCE = `import React from 'react'
import { Select } from './CustomSelect/select.js'

export type ConfirmationButtonsProps = {
  onConfirm(): void
  onCancel(): void
  confirmLabel?: string
  cancelLabel?: string
  cancelFirst?: boolean
  focus?: 'confirm' | 'cancel'
}

export function ConfirmationButtons({
  onConfirm,
  onCancel,
  confirmLabel = 'Yes',
  cancelLabel = 'No',
  cancelFirst = false,
  focus = 'confirm',
}: ConfirmationButtonsProps): React.ReactNode {
  const confirm = { label: confirmLabel, value: 'confirm' }
  const cancel = { label: cancelLabel, value: 'cancel' }
  const options = cancelFirst ? [cancel, confirm] : [confirm, cancel]
  return (
    <Select
      options={options}
      defaultFocusValue={focus}
      onChange={value => (value === 'confirm' ? onConfirm() : onCancel())}
      onCancel={onCancel}
    />
  )
}
`

export const TARGET117_CONFIRMATION_RECOVERED_FILES = Object.freeze([
  Object.freeze({
    path: 'src/components/ConfirmationButtons.tsx',
    bytes: 843,
    sha256: '44e0c7df811030d27ed88eb313cac012fbdd2ed6a5baab03d9751070806f9960',
  }),
  Object.freeze({
    path: 'src/components/ConsoleOAuthWizards.tsx',
    bytes: 29105,
    sha256: '15723cac0f5755702bda0dda03ff45c4af62c7adeb402afca41e40f38433ae6d',
  }),
])

const TARGET_EVIDENCE = 'target117-confirmation-target-fragment'
const REPLAY_EVIDENCE = 'target117-confirmation-source-replay-test'
const STATIC_EVIDENCE = 'target117-confirmation-legacy-select-equivalence-test'

const OWNER_ROWS = [
  [10792, 'src/components/ConfirmationButtons.tsx', [TARGET_EVIDENCE, REPLAY_EVIDENCE]],
  [10809, 'src/components/ManagedSettingsSecurityDialog/ManagedSettingsSecurityDialog.tsx', [TARGET_EVIDENCE, STATIC_EVIDENCE]],
  [11693, 'src/components/ConsoleOAuthWizards.tsx', [TARGET_EVIDENCE, REPLAY_EVIDENCE]],
  [11818, 'src/components/ConsoleOAuthWizards.tsx', [TARGET_EVIDENCE, REPLAY_EVIDENCE]],
  [11830, 'src/components/ConsoleOAuthWizards.tsx', [TARGET_EVIDENCE, REPLAY_EVIDENCE]],
  [11866, 'src/components/ConsoleOAuthWizards.tsx', [TARGET_EVIDENCE, REPLAY_EVIDENCE]],
  [11887, 'src/components/TeleportStash.tsx', [TARGET_EVIDENCE, STATIC_EVIDENCE]],
  [11890, 'src/components/TeleportError.tsx', [TARGET_EVIDENCE, STATIC_EVIDENCE]],
  [15439, 'src/components/ClaudeMdExternalIncludesDialog.tsx', [TARGET_EVIDENCE, STATIC_EVIDENCE]],
  [15852, 'src/components/IdeAutoConnectDialog.tsx', [TARGET_EVIDENCE, STATIC_EVIDENCE]],
  [16870, 'src/components/tasks/RemoteSessionDetailDialog.tsx', [TARGET_EVIDENCE, STATIC_EVIDENCE]],
  [17541, 'src/commands/model/model.tsx', [TARGET_EVIDENCE, STATIC_EVIDENCE]],
  [17707, 'src/commands/remote-setup/remote-setup.tsx', [TARGET_EVIDENCE, STATIC_EVIDENCE]],
  [18721, 'src/components/permissions/AskUserQuestionPermissionRequest/SubmitQuestionsView.tsx', [TARGET_EVIDENCE, STATIC_EVIDENCE]],
  [18869, 'src/components/permissions/EnterPlanModePermissionRequest/EnterPlanModePermissionRequest.tsx', [TARGET_EVIDENCE, STATIC_EVIDENCE]],
  [20131, 'src/components/ApproveApiKey.tsx', [TARGET_EVIDENCE, STATIC_EVIDENCE]],
  [20149, 'src/components/Onboarding.tsx', [TARGET_EVIDENCE, STATIC_EVIDENCE]],
  [20170, 'src/components/TrustDialog/TrustDialog.tsx', [TARGET_EVIDENCE, STATIC_EVIDENCE]],
  [20187, 'src/components/BypassPermissionsModeDialog.tsx', [TARGET_EVIDENCE, STATIC_EVIDENCE]],
  [20194, 'src/components/DevChannelsDialog.tsx', [TARGET_EVIDENCE, STATIC_EVIDENCE]],
]

export const TARGET117_CONFIRMATION_OWNER_OVERRIDES = Object.freeze(
  OWNER_ROWS.map(([targetIndex, owner, evidenceIds]) =>
    Object.freeze({
      key: `${CASE_NAME}:${targetIndex}`,
      targetIndex,
      paths: Object.freeze([owner]),
      evidenceIds: Object.freeze([...evidenceIds]),
      behavior:
        owner === 'src/components/ConfirmationButtons.tsx'
          ? 'The recovered generic component preserves Target117 defaults, focus, choice order, and confirm/cancel dispatch.'
          : owner === 'src/components/ConsoleOAuthWizards.tsx'
            ? 'The authenticated 04fa3cc declaration closure restores only the Target117 Bedrock/Vertex verification and confirmation flow, excluding later proxy and model-selection changes.'
            : 'The historical owner declaration implements the same two-choice Select behavior directly; the static AST proof binds the Target117 generic-component call back to that declaration.',
    }),
  ),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function readConsoleSourceInput() {
  const actualCommit = execFileSync(
    'git',
    ['rev-parse', `${CONSOLE_SOURCE_INPUT.commit}^{commit}`],
    { cwd: repositoryRoot, encoding: 'utf8' },
  ).trim()
  if (actualCommit !== CONSOLE_SOURCE_INPUT.commit) {
    throw new Error(
      `Console OAuth source commit drift: expected ${CONSOLE_SOURCE_INPUT.commit}, got ${actualCommit}`,
    )
  }
  const actualBlob = execFileSync(
    'git',
    ['rev-parse', `${CONSOLE_SOURCE_INPUT.commit}:${CONSOLE_SOURCE_INPUT.path}`],
    { cwd: repositoryRoot, encoding: 'utf8' },
  ).trim()
  if (actualBlob !== CONSOLE_SOURCE_INPUT.blob) {
    throw new Error(
      `Console OAuth source blob drift: expected ${CONSOLE_SOURCE_INPUT.blob}, got ${actualBlob}`,
    )
  }
  const bytes = execFileSync(
    'git',
    ['show', `${CONSOLE_SOURCE_INPUT.commit}:${CONSOLE_SOURCE_INPUT.path}`],
    { cwd: repositoryRoot },
  )
  const actual = descriptor(bytes)
  if (
    actual.bytes !== CONSOLE_SOURCE_INPUT.bytes ||
    actual.sha256 !== CONSOLE_SOURCE_INPUT.sha256
  ) {
    throw new Error(
      `Console OAuth source identity drift: expected ${CONSOLE_SOURCE_INPUT.bytes}/${CONSOLE_SOURCE_INPUT.sha256}, got ${actual.bytes}/${actual.sha256}`,
    )
  }
  return bytes.toString('utf8')
}

function readSlice(source, slice) {
  const contents = source.slice(slice.start, slice.end)
  const actual = descriptor(Buffer.from(contents))
  if (actual.bytes !== slice.bytes || actual.sha256 !== slice.sha256) {
    throw new Error(
      `${slice.name}: expected ${slice.bytes}/${slice.sha256}, got ${actual.bytes}/${actual.sha256}`,
    )
  }
  return contents
}

function buildConsoleSubset() {
  const source = readConsoleSourceInput()
  const imports = readSlice(source, IMPORT_SLICE)
  const declarations = TARGET117_CONSOLE_CONFIRMATION_DECLARATIONS.map(slice =>
    readSlice(source, slice),
  )
  return `${imports}${declarations.join('')}\n`
}

function sourceFilename(sourceRoot, sourcePath) {
  if (!sourcePath.startsWith('src/')) {
    throw new Error(`${sourcePath}: expected normalized src path`)
  }
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, sourcePath.slice(4))
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${sourcePath}: escapes source root`)
  }
  return filename
}

export function applyTarget117ConfirmationSourceRecovery({ sourceRoot }) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const outputs = [
    Buffer.from(CONFIRMATION_BUTTONS_SOURCE),
    Buffer.from(buildConsoleSubset()),
  ]
  const results = []
  let changed = 0
  for (const [index, expected] of TARGET117_CONFIRMATION_RECOVERED_FILES.entries()) {
    const contents = outputs[index]
    const actual = descriptor(contents)
    if (
      actual.bytes !== expected.bytes ||
      actual.sha256 !== expected.sha256
    ) {
      throw new Error(
        `${expected.path}: replay drift; expected ${expected.bytes}/${expected.sha256}, got ${actual.bytes}/${actual.sha256}`,
      )
    }
    const filename = sourceFilename(sourceRoot, expected.path)
    if (fs.existsSync(filename)) {
      const status = fs.lstatSync(filename)
      if (!status.isFile() || status.isSymbolicLink()) {
        throw new Error(`${expected.path}: expected a real source file`)
      }
      const before = descriptor(fs.readFileSync(filename))
      if (before.bytes !== actual.bytes || before.sha256 !== actual.sha256) {
        throw new Error(
          `${expected.path}: expected absent or recovered ${actual.bytes}/${actual.sha256}, got ${before.bytes}/${before.sha256}`,
        )
      }
      results.push({ path: expected.path, ...actual, action: 'unchanged' })
      continue
    }
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, contents)
    results.push({ path: expected.path, ...actual, action: 'recovered' })
    changed += 1
  }
  return Object.freeze({
    caseName: CASE_NAME,
    status: changed === 0 ? 'already-recovered' : 'recovered',
    files: Object.freeze(results.map(result => Object.freeze(result))),
    ownerOverrides: TARGET117_CONFIRMATION_OWNER_OVERRIDES.length,
    declarationSlices: TARGET117_CONSOLE_CONFIRMATION_DECLARATIONS.length,
  })
}
