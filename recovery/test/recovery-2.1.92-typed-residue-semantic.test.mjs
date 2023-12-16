import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.91-to-2.1.92'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')

const expectedAddedResidueUnits = new Set([
  3206, 4504, 8081, 8102, 8459, 8477, 9421, 9672, 9679, 9683,
  9684, 9687, 9694, 10084, 10086, 10087, 10089, 10093, 10096,
  10107, 10108, 10113, 10116, 10119, 10122, 10130, 10246, 10440,
  10447, 10928, 11108, 11178, 11531, 12131,
  12228, 13240, 13340, 13368, 13415, 13465, 13473, 13944, 13975,
  14006, 14011, 14063, 14066, 14074, 14101, 14173, 14351,
  14352, 14607, 14620, 14767, 14785, 14790, 14807, 14808, 14812,
  14819, 14837, 14848, 14992, 14993, 15053, 15167, 15173, 15182,
  15191, 15194, 15197, 15200, 15203, 15206, 15209, 15371, 15391,
  15434, 15462, 15573, 15679, 15703, 16040, 16276, 16379, 16828,
  16829, 17081, 17168, 17202, 17203, 17449, 17491, 17498, 17550,
  17687, 17694, 17768, 17809, 17851, 17873, 17975, 18279, 18335,
])

const focusedRuntimeUnits = new Set([
  2038, 3206, 3235, 4504, 8013, 8081, 8102, 9694, 9695, 10087, 10093,
  10108, 10113, 10116, 10119, 10131, 10928, 11538, 12131, 12228,
  12528, 13415, 13602, 14620, 15182, 15203, 15209, 15391, 15573,
  15679, 16276, 17202, 18279,
])

const normalizedPresentationValues = new Set([
  'enter',
  'space',
  'escape',
  'backspace',
  'left',
  'right',
  'up',
  'down',
  'lower',
  'shift+down',
  'super',
  'win',
  'y',
  'NFKC',
  'Type to enter text',
  ' files',
])

const reactCompilerMetadataUnits = new Set([17498, 17687, 17694])

const presentationPropertyUnits = new Map([
  ['chord', new Set([
    8102, 8459, 8477, 9672, 9679, 9687, 10108, 10113, 10116,
    10119, 10130, 10246, 10440, 10447, 10928, 11108, 13240, 13368,
    13465, 13473, 13944, 13975, 14006, 14011, 14063, 14066, 14074,
    14101, 14173, 14351, 14352, 14607, 14620, 14767, 14785, 14790,
    14807, 14808, 14812, 14819, 14837, 14992, 14993, 15167, 15173,
    15182, 15191, 15194, 15197, 15200, 15203, 15206, 15209, 15434,
    15462, 16828, 16829, 17081, 17168, 17202, 17203, 17449, 17491,
    17768, 17873, 18335,
  ])],
  ['arrowSep', new Set([
    9672, 13944, 14006, 14011, 14063, 14066, 14074, 14351, 15167,
    15191, 15194, 15197, 15200, 15206, 16828,
  ])],
  ['format', new Set([
    13944, 14006, 14011, 14063, 14066, 14074, 14351, 14620, 14819,
    15167, 15191, 15194, 15197, 15200, 15206, 17202, 17203, 17449,
    17491,
  ])],
  ['keyCase', new Set([13368, 14819, 17203, 17449, 17491])],
])

const compilerPropertyUnits = new Map([
  [17975, new Set(['createElement', 'default'])],
  [18335, new Set(['useState', 'useEffect', 'createElement', 'default'])],
])

const bedrockPropertyUnits = new Map([
  [9683, new Set(['AUTH_METHOD', 'PROFILE', 'BEARER', 'ACCESS_KEY_ID', 'SECRET_KEY', 'SESSION_TOKEN', 'REGION', 'VERIFY', 'PIN_MODELS', 'CONFIRM'])],
  [9684, new Set(['PROFILE', 'BEARER', 'ACCESS_KEY_ID', 'REGION'])],
  [9687, new Set(['REGION'])],
  [10084, new Set(['STSClient', 'GetCallerIdentityCommand', 'BedrockClient', 'ListInferenceProfilesCommand'])],
  [10086, new Set(['AnthropicBedrock', 'getProxyFetchOptions'])],
  [10089, new Set(['fromNodeProviderChain'])],
  [10093, new Set(['picking'])],
  [10096, new Set(['modelId'])],
  [10107, new Set(['goToStep'])],
  [10108, new Set(['goToStep', 'REGION'])],
  [10116, new Set(['wizardData'])],
  [10119, new Set(['goBack', 'wizardData'])],
  [10122, new Set(['goBack', 'updateWizardData', 'wizardData', 'withSpace'])],
])

const runtimePropertyProofs = new Map([
  [3206, { owner: 'utils/model/model.ts', values: new Set(['DEFAULT_3P_SONNET_KEY', 'DEFAULT_3P_OPUS_KEY', 'DEFAULT_3P_HAIKU_KEY']) }],
  [9421, { owner: 'utils/telemetry/instrumentation.ts', values: new Set(['parseOtelHeadersEnvVar', 'getOtlpLogExporters', 'getOTLPExporterConfig']) }],
  [11178, { owner: 'utils/diff.ts', values: new Set(['convertTabs']) }],
  [11531, { owner: 'bridge/bridgeConfig.ts', values: new Set(['sanitizeSessionNamePrefix', 'getBridgeSessionNamePrefix']) }],
  [11537, { owner: 'bridge/bridgeConfig.ts', values: new Set(['CLAUDE_REMOTE_CONTROL_SESSION_NAME_PREFIX']) }],
  [12107, { owner: 'tools/BashTool/rerunAliases.ts', values: new Set(['nextId']) }],
  [12109, { owner: 'tools/BashTool/rerunAliases.ts', values: new Set(['nextId']) }],
  [14348, { owner: 'commands/powerup/powerup.tsx', values: new Set(['symbol']) }],
  [14848, { owner: 'commands/teleport/teleport.tsx', values: new Set(['Teleport']) }],
  [15167, { owner: 'components/agents/new-agent-creation/wizard-steps/ColorStep.tsx', values: new Set(['goBack', 'updateWizardData', 'wizardData']) }],
  [15173, { owner: 'components/agents/new-agent-creation/wizard-steps/ConfirmStep.tsx', values: new Set(['goBack', 'wizardData']) }],
  [15182, { owner: 'components/agents/new-agent-creation/wizard-steps/TypeStep.tsx', values: new Set(['goBack', 'updateWizardData', 'wizardData']) }],
  [15191, { owner: 'components/agents/new-agent-creation/wizard-steps/LocationStep.tsx', values: new Set(['updateWizardData']) }],
  [15194, { owner: 'components/agents/new-agent-creation/wizard-steps/MemoryStep.tsx', values: new Set(['goNext', 'goBack', 'updateWizardData', 'wizardData']) }],
  [15197, { owner: 'components/agents/new-agent-creation/wizard-steps/MethodStep.tsx', values: new Set(['goNext', 'goBack', 'updateWizardData', 'goToStep']) }],
  [15200, { owner: 'components/agents/new-agent-creation/wizard-steps/ModelStep.tsx', values: new Set(['goNext', 'goBack', 'updateWizardData', 'wizardData']) }],
  [15203, { owner: 'components/agents/new-agent-creation/wizard-steps/TypeStep.tsx', values: new Set(['goNext', 'goBack', 'updateWizardData', 'wizardData']) }],
  [15206, { owner: 'components/agents/new-agent-creation/wizard-steps/ToolsStep.tsx', values: new Set(['goNext', 'goBack', 'updateWizardData', 'wizardData']) }],
  [15209, { owner: 'components/agents/new-agent-creation/wizard-steps/TypeStep.tsx', values: new Set(['goNext', 'goBack', 'updateWizardData', 'wizardData']) }],
  [15371, { owner: 'commands/model/model.tsx', values: new Set(['renderModelLabel']) }],
  [15703, { owner: 'utils/sessionStorage.ts', values: new Set(['subscribeSessionAgentNameChanged', 'getCurrentSessionAgentName']) }],
  [16040, { owner: 'utils/worktree.ts', values: new Set(['getAgentWorktreeChanges']) }],
  [16379, { owner: 'components/IdleReturnDialog.tsx', values: new Set(['contextTokens']) }],
  [17202, { owner: 'components/PromptInput/PromptInputFooterLeftSide.tsx', values: new Set(['columns']) }],
  [17498, { owner: 'components/ultraplan/UltraplanChoiceDialog.tsx', values: new Set(['resultDedupState', 'columns', 'subtitle', 'isCancelActive']) }],
  [17550, { owner: 'components/FeedbackSurvey/useDebouncedDigitInput.ts', values: new Set(['mountDelayMs']) }],
  [17809, { owner: 'hooks/useVoiceIntegration.tsx', values: new Set(['voiceCancelRecording']) }],
  [18279, { owner: 'QueryEngine.ts', values: new Set(['context', 'setMessages', 'at', 'maxRetries', 'lastIndexOf', 'bashRerunAliases', 'reason']) }],
])

const transitiveDeferredProperties = new Map([
  [18279, new Set(['toolName'])],
])

const splitRuntimePropertyProofs = new Map([
  [13340, new Map([
    ['resultDedupState', 'commands/clear/conversation.ts'],
    ['seen', 'utils/toolErrors.ts'],
    ['counter', 'utils/toolErrors.ts'],
  ])],
  [17851, new Map([
    ['bashRerunAliases', 'Tool.ts'],
    ['enter', 'screens/REPL.tsx'],
  ])],
])

const targetOnlyNoOpProperties = new Map([
  [17851, new Set(['postTurnSummary', 'status_detail'])],
])

const bedrockEvidenceUnits = new Set([
  9683, 9684, 9687, 9694, 10084, 10086, 10087, 10089, 10093, 10096,
  10107, 10108, 10113, 10116, 10119, 10122,
])

const exactEvidenceUnits = new Map([
  [15053, 'stop-hook-semantic-test'],
])

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function readCoverage() {
  return JSON.parse(
    gunzipSync(
      fs.readFileSync(
        path.join(
          repositoryRoot,
          'recovery/cases',
          caseName,
          'semantic/source-coverage.json.gz',
        ),
      ),
    ),
  )
}

function runScanner() {
  const baseline = process.env.CLAUDE_CODE_2_1_91_BUNDLE
  const target = process.env.CLAUDE_CODE_2_1_92_BUNDLE
  assert.ok(baseline, 'CLAUDE_CODE_2_1_91_BUNDLE is required')
  assert.ok(target, 'CLAUDE_CODE_2_1_92_BUNDLE is required')
  assert.equal(
    sha256(fs.readFileSync(target)),
    '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362',
  )
  const caseRoot = path.join(repositoryRoot, 'recovery/cases', caseName)
  const result = spawnSync(
    process.execPath,
    [
      path.join(
        repositoryRoot,
        'recovery/scripts/inspect-semantic-literal-gaps.mjs',
      ),
      '--baseline',
      baseline,
      '--target',
      target,
      '--source-root',
      sourceRoot,
      '--structural',
      path.join(caseRoot, 'structural/generated-delta.json.gz'),
      '--partitions',
      path.join(caseRoot, 'attribution/target-partitions.jsonl.gz'),
      '--sources',
      path.join(caseRoot, 'attribution/sources.jsonl.gz'),
      '--coverage',
      path.join(caseRoot, 'semantic/source-coverage.json.gz'),
    ],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    },
  )
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return JSON.parse(result.stdout)
}

test(
  'target92 typed residues are inherited, focused, composed, or compiler metadata',
  {
    skip: selected
      ? false
      : `not applicable to ${semanticCase ?? 'an unmaterialized source tree'}`,
    timeout: 120_000,
  },
  () => {
    if (!selected) return
    const report = runScanner()
    const coverage = readCoverage()
    const rows = new Map(coverage.rows.map(row => [row.targetIndex, row]))
    const addedUnits = new Set()

    assert.equal(report.unclassifiedAddedOccurrences, 0)
    for (const residue of report.sourceRuntimeOwnerResidueRows) {
      const index = residue.structural.index
      const row = rows.get(index)
      assert.equal(row?.disposition, 'source-runtime-covered', `${index}: disposition`)
      assert.ok(
        row.evidenceIds.includes('target92-residue-target-fragment'),
        `${index}: target-fragment evidence`,
      )
      assert.ok(
        row.evidenceIds.includes('target92-residue-semantic-test'),
        `${index}: executable residue evidence`,
      )
      if (!residue.targetAdded) {
        assert.ok(
          residue.targetOccurrenceNumber <= residue.baselineOccurrenceCount,
          `${index}: inherited occurrence accounting`,
        )
        continue
      }
      addedUnits.add(index)

      const value =
        residue.literalKind === 'regexp'
          ? `/${residue.value.pattern}/${residue.value.flags}`
          : String(residue.value)

      if (residue.literalKind === 'property') {
        const presentationUnits = presentationPropertyUnits.get(value)
        if (presentationUnits?.has(index)) continue

        const compilerValues = compilerPropertyUnits.get(index)
        if (compilerValues?.has(value)) continue

        const bedrockValues = bedrockPropertyUnits.get(index)
        if (bedrockValues?.has(value)) {
          assert.ok(
            row.evidenceIds.includes('bedrock-wizard-semantic-test'),
            `${index}: Bedrock property evidence`,
          )
          const owner = source('components/BedrockSetupWizard.tsx')
          for (const anchor of [
            'createBedrockProbeClient',
            'credentialProvider',
            'MODEL_TIERS',
          ]) {
            assert.ok(owner.includes(anchor), `${index}: ${anchor}`)
          }
          continue
        }

        const runtimeProof = runtimePropertyProofs.get(index)
        if (runtimeProof?.values.has(value)) {
          const owner = source(runtimeProof.owner)
          assert.ok(
            owner.includes(value),
            `${index}: ${runtimeProof.owner} does not own ${value}`,
          )
          continue
        }

        const deferredValues = transitiveDeferredProperties.get(index)
        if (deferredValues?.has(value)) {
          assert.ok(
            row.evidenceIds.includes('advisor-rerun-semantic-test'),
            `${index}: exact QueryEngine/deferred lineage evidence`,
          )
          const target = fs.readFileSync(
            process.env.CLAUDE_CODE_2_1_92_BUNDLE,
            'utf8',
          )
          const region = target.slice(12_969_405, 12_983_924)
          for (const anchor of [
            'Deferred tool resume: tool',
            'tool_deferred_unavailable',
            'deferred_tool_use:',
          ]) {
            assert.ok(region.includes(anchor), `${index}: ${anchor}`)
          }
          continue
        }

        const splitProof = splitRuntimePropertyProofs.get(index)
        const splitOwner = splitProof?.get(value)
        if (splitOwner) {
          assert.ok(
            source(splitOwner).includes(value),
            `${index}: ${splitOwner} does not own ${value}`,
          )
          continue
        }

        const noOpValues = targetOnlyNoOpProperties.get(index)
        if (noOpValues?.has(value)) {
          const target = fs.readFileSync(
            process.env.CLAUDE_CODE_2_1_92_BUNDLE,
            'utf8',
          )
          assert.equal(target.split('postTurnSummary').length - 1, 1)
          const occurrence = target.indexOf('postTurnSummary')
          assert.match(
            target.slice(occurrence - 80, occurrence + 100),
            /postTurnSummary\?\.status_detail/,
          )
          continue
        }

        assert.fail(
          `${index}: unexplained added property residue ${JSON.stringify(value)}`,
        )
      }

      if (bedrockEvidenceUnits.has(index)) {
        assert.ok(
          row.evidenceIds.includes('bedrock-wizard-semantic-test'),
          `${index}: Bedrock runtime evidence`,
        )
        continue
      }

      const exactEvidenceId = exactEvidenceUnits.get(index)
      if (exactEvidenceId) {
        assert.ok(
          row.evidenceIds.includes(exactEvidenceId),
          `${index}: ${exactEvidenceId}`,
        )
        continue
      }

      if (focusedRuntimeUnits.has(index)) continue
      if (normalizedPresentationValues.has(value)) continue

      if (residue.literalKind === 'number') {
        assert.ok(
          reactCompilerMetadataUnits.has(index),
          `${index}: numeric residue is not a pinned React compiler cache slot`,
        )
        continue
      }
      assert.fail(`${index}: unexplained added ${residue.literalKind} residue ${JSON.stringify(value)}`)
    }

    assert.deepEqual([...addedUnits].sort((a, b) => a - b), [...expectedAddedResidueUnits].sort((a, b) => a - b))
  },
)
