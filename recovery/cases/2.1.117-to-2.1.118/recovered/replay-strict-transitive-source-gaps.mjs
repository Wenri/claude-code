#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { summarizeSourceTree } from '../../../scripts/verify-source-lineage.mjs'

const CASE_NAME = '2.1.117-to-2.1.118'

const TARGET_FRAGMENT_EVIDENCE =
  'target118-strict-transitive-owner-target-fragment'
const SOURCE_AST_EVIDENCE =
  'target118-strict-transitive-owner-source-ast-test'

function freezeRecord(record) {
  return Object.freeze({ ...record })
}

function freezeOverride(override) {
  return Object.freeze({
    ...override,
    paths: Object.freeze([...override.paths]),
    evidenceIds: Object.freeze([...override.evidenceIds]),
  })
}

export const TARGET118_STRICT_TRANSITIVE_RAW_SOURCE_TREE = freezeRecord({
  files: 2022,
  bytes: 31570676,
  manifestSha256:
    'c91ebcc114cbe577e4ffe43801e6014ade8e26d27271f57b0af1ce8ce9ff3d59',
})

// Populated from the seven exact, input-pinned transformations below. The
// replay refuses to publish any file unless every constructed output matches
// its descriptor and the resulting whole tree matches this summary.
export const TARGET118_STRICT_TRANSITIVE_RECOVERED_SOURCE_TREE = freezeRecord({
  files: 2022,
  bytes: 31571280,
  manifestSha256:
    'fb782159c72b14d9daea2a872723847be6b024b3b2e53533dbe0b078771f9ab9',
})

export const TARGET118_STRICT_TRANSITIVE_INPUT_FILES = Object.freeze(
  [
    [
      'src/components/design-system/Tabs.tsx',
      41991,
      '725c05d5a6db3525b8dfa59cda8076451e0708ba542e6a854c8acd1c66b7ba10',
    ],
    [
      'src/components/agents/AgentDetail.tsx',
      23566,
      'bc840ea3a8b5164cd0d070b50a63752f6a784cbb7969d88163605c1809a361aa',
    ],
    [
      'src/components/agents/ColorPicker.tsx',
      14204,
      'd9f9445b855fb66e4f53fbf464b4222b429708434486b96af849d917e5c0a536',
    ],
    [
      'src/components/permissions/AskUserQuestionPermissionRequest/QuestionNavigationBar.tsx',
      22963,
      '0e7e9bded9b7e73a802ff8545ff84bf0823e14ee01ce6d05390426051fc1063e',
    ],
    [
      'src/utils/cliArgs.ts',
      2067,
      'e3a7e0f064bd5470f82419837cca0c06ef4513bfbf1145ebf9211a06b0df7b38',
    ],
    [
      'src/components/FeedbackSurvey/FeedbackSurveyView.tsx',
      10660,
      '2307bbad58362eaa0b134b2e3b8d749bb70549f6b51676b38e569f88c011a78e',
    ],
    [
      'src/components/FeedbackSurvey/FeedbackSurvey.tsx',
      19393,
      '6b2856ca8068951559a9cce545f5985cde4392b9c2c3169f2782e5080fba28aa',
    ],
  ].map(([sourcePath, bytes, sha256]) =>
    freezeRecord({ path: sourcePath, bytes, sha256 }),
  ),
)

// These values were generated from constructTarget118StrictTransitiveFiles and
// are pinned so replay drift fails before any file is published.
export const TARGET118_STRICT_TRANSITIVE_RECOVERED_SOURCE_FILES = Object.freeze(
  [
    [
      'src/components/design-system/Tabs.tsx',
      41974,
      'eb32f057657b6e8afcf1408a88da5914c8040b558b60e1bfc6386e1d5ffe6231',
    ],
    [
      'src/components/agents/AgentDetail.tsx',
      23586,
      'f0093eab4ade340cba1b4c99e9e19831bd379ca41d3e28f6e31c4aaddaa08812',
    ],
    [
      'src/components/agents/ColorPicker.tsx',
      14189,
      '150e09237cc073786b6d6993ba4c25e12e77f49b04501ea8286d60a0740184b3',
    ],
    [
      'src/components/permissions/AskUserQuestionPermissionRequest/QuestionNavigationBar.tsx',
      22890,
      '1fb872d11f454cf31728050442b6d0566810d959f1db8295424f687b099a8fb9',
    ],
    [
      'src/utils/cliArgs.ts',
      2301,
      '923faf621186038ecef908f7647f9eedf39e1c1701a4e2a8f00a5c8cf392d7be',
    ],
    [
      'src/components/FeedbackSurvey/FeedbackSurveyView.tsx',
      10969,
      'ca06933f64a53a5d31fa542b18719d6ef774ccc57e85d2b29aea1da033fb055f',
    ],
    [
      'src/components/FeedbackSurvey/FeedbackSurvey.tsx',
      19539,
      '8582313e017a659f7823c5d2f594364d7fe4dc94c4e781e505197e88867f3c14',
    ],
  ].map(([sourcePath, bytes, sha256]) =>
    freezeRecord({ path: sourcePath, bytes, sha256 }),
  ),
)

const GAP_ROWS = [
  [15408, 'src/components/design-system/Tabs.tsx'],
  [17268, 'src/components/agents/AgentDetail.tsx'],
  [17272, 'src/components/agents/ColorPicker.tsx'],
  [
    18865,
    'src/components/permissions/AskUserQuestionPermissionRequest/QuestionNavigationBar.tsx',
  ],
  [19870, 'src/utils/cliArgs.ts'],
  [19938, 'src/components/FeedbackSurvey/FeedbackSurveyView.tsx'],
  [19951, 'src/components/FeedbackSurvey/FeedbackSurvey.tsx'],
]

const OWNER_ROWS = [
  [4025, 'src/services/api/workloadIdentity.ts'],
  [4684, 'src/services/api/workloadIdentity.ts'],
  [4685, 'src/services/api/workloadIdentity.ts'],
  [4690, 'src/services/api/workloadIdentity.ts'],
  [4693, 'src/services/api/workloadIdentity.ts'],
  [6726, 'src/utils/customThemes.ts'],
  [6727, 'src/utils/customThemes.ts'],
  [6728, 'src/utils/customThemes.ts'],
  [7750, 'src/hooks/useTextInput.ts'],
  [7799, 'src/keybindings/keybindingsDom.ts'],
  [8187, 'src/utils/frontmatterShadowValidation.ts'],
  [8189, 'src/utils/frontmatterShadowValidation.ts'],
  [8873, 'src/services/api/promptCacheBreakDetection.ts'],
  [8874, 'src/services/api/promptCacheBreakDetection.ts'],
  [11446, 'src/commands/logout/logout.tsx'],
  [11676, 'src/utils/status.tsx'],
  [12283, 'src/components/design-system/Label.tsx'],
  [13293, 'src/tools/REPLTool/transpile.ts'],
  [13332, 'src/tools/REPLTool/vm.ts'],
  [13767, 'src/utils/swarm/teammatePromptAddendum.ts'],
  [15187, 'src/bridge/sessionSubscriptions.ts'],
  [15194, 'src/commands/autofix-pr/autofix-pr.tsx'],
  [15197, 'src/commands/autofix-pr/autofix-pr.tsx'],
  [15408, 'src/components/design-system/Tabs.tsx'],
  [15795, 'src/daemon/jobs.ts'],
  [15800, 'src/daemon/protocol.ts'],
  [16268, 'src/commands/plugin/TagPlugin.tsx'],
  [16620, 'src/components/WarmResumeHint.tsx'],
  [16629, 'src/components/WarmResumeHint.tsx'],
  [17034, 'src/components/design-system/FuzzyPicker.tsx'],
  [17040, 'src/components/CustomThemeEditor.tsx'],
  [17268, 'src/components/agents/AgentDetail.tsx'],
  [17272, 'src/components/agents/ColorPicker.tsx'],
  [17377, 'src/components/agents/AgentsMenu.tsx'],
  [17588, 'src/tasks/pillLabel.ts'],
  [17606, 'src/commands/update/update.ts'],
  [17680, 'src/commands/pro-trial-expired/pro-trial-expired.tsx'],
  [17689, 'src/commands/pro-trial-expired/index.ts'],
  [17756, 'src/hooks/useRemoteControlIdleUpsell.tsx'],
  [17850, 'src/commands/recap/recap.ts'],
  [18239, 'src/utils/hooks/execMcpToolHook.ts'],
  [18240, 'src/utils/hooks/execMcpToolHook.ts'],
  [18318, 'src/utils/hooks.ts'],
  [18320, 'src/utils/hooks.ts'],
  [
    18865,
    'src/components/permissions/AskUserQuestionPermissionRequest/QuestionNavigationBar.tsx',
  ],
  [19778, 'src/utils/plugins/loadPluginThemes.ts'],
  [19870, 'src/utils/cliArgs.ts'],
  [19938, 'src/components/FeedbackSurvey/FeedbackSurveyView.tsx'],
  [19951, 'src/components/FeedbackSurvey/FeedbackSurvey.tsx'],
  [20018, 'src/hooks/useRemoteControlIdleUpsell.tsx'],
  [20019, 'src/hooks/useRemoteControlIdleUpsell.tsx'],
  [20228, 'src/utils/terminalProbe.ts'],
  [20229, 'src/utils/terminalProbe.ts'],
  [20582, 'src/skills/bundled/claude-api/python/claude-api/batches.md'],
  [20584, 'src/skills/bundled/claude-api/python/claude-api/files-api.md'],
  [20586, 'src/skills/bundled/claude-api/python/claude-api/README.md'],
  [20588, 'src/skills/bundled/claude-api/python/claude-api/streaming.md'],
  [20596, 'src/skills/bundled/claude-api/SKILL.md'],
  [20600, 'src/skills/bundled/claude-api/shared/anthropic-cli.md'],
  [20610, 'src/skills/bundled/claude-api/shared/managed-agents-core.md'],
  [20616, 'src/skills/bundled/claude-api/shared/managed-agents-onboarding.md'],
  [20618, 'src/skills/bundled/claude-api/shared/managed-agents-overview.md'],
  [20841, 'src/cli/print.ts'],
  [20901, 'src/commands/install.tsx'],
  [20984, 'src/entrypoints/cli.tsx'],
]

export const TARGET118_STRICT_TRANSITIVE_OWNER_OVERRIDES = Object.freeze(
  OWNER_ROWS.map(([targetIndex, sourcePath]) =>
    freezeOverride({
      key: `${CASE_NAME}:${targetIndex}`,
      targetIndex,
      paths: [sourcePath],
      evidenceIds: [TARGET_FRAGMENT_EVIDENCE, SOURCE_AST_EVIDENCE],
      behavior:
        `Authenticated target118 u${targetIndex} is tied to the complete ` +
        `named declaration, source module, or resource at ${sourcePath}; ` +
        'unscoped literal coincidences are not accepted as ownership proof.',
    }),
  ),
)

const gapIndices = new Set(GAP_ROWS.map(([targetIndex]) => targetIndex))
export const TARGET118_STRICT_TRANSITIVE_SOURCE_GAP_OVERRIDES = Object.freeze(
  TARGET118_STRICT_TRANSITIVE_OWNER_OVERRIDES.filter(override =>
    gapIndices.has(override.targetIndex),
  ),
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

function sameTreeSummary(actual, expected) {
  return (
    actual.files === expected.files &&
    actual.bytes === expected.bytes &&
    actual.manifestSha256 === expected.manifestSha256
  )
}

function publicTreeSummary(summary) {
  return {
    files: summary.files,
    bytes: summary.bytes,
    manifestSha256: summary.manifestSha256,
  }
}

function countOccurrences(text, needle) {
  let count = 0
  let offset = 0
  while ((offset = text.indexOf(needle, offset)) >= 0) {
    count += 1
    offset += needle.length
  }
  return count
}

function replaceExact(text, before, after, label) {
  const count = countOccurrences(text, before)
  if (count !== 1) {
    throw new Error(`${label}: expected one raw anchor, found ${count}`)
  }
  return text.replace(before, after)
}

function transformTabs(text) {
  text = replaceExact(
    text,
    "import { useKeybindings } from '../../keybindings/useKeybinding.js';\n",
    "import { useKeybindings } from '../../keybindings/useKeybinding.js';\nimport { Label } from './Label.js';\n",
    'Tabs Label import',
  )
  return replaceExact(
    text,
    '  return <Box ref={cursorRef}><Text backgroundColor={hasColorCursor ? color : undefined} color={hasColorCursor ? "inverseText" : undefined} inverse={isCurrent && !hasColorCursor} bold={isCurrent}>{" "}{title}{" "}</Text></Box>;\n',
    '  return <Box ref={cursorRef}>{hasColorCursor ? <Label color={color} bold padded>{title}</Label> : <Text inverse={isCurrent} bold={isCurrent}>{" "}{title}{" "}</Text>}</Box>;\n',
    'Tabs TabHeader target118 branch',
  )
}

function transformAgentDetail(text) {
  text = replaceExact(
    text,
    "import { Markdown } from '../Markdown.js';\n",
    "import { Markdown } from '../Markdown.js';\nimport { Label } from '../design-system/Label.js';\n",
    'AgentDetail Label import',
  )
  return replaceExact(
    text,
    '    t22 = backgroundColor && <Box><Text><Text bold={true}>Color</Text>:{" "}<Text backgroundColor={backgroundColor} color="inverseText">{" "}{agent.agentType}{" "}</Text></Text></Box>;\n',
    '    t22 = backgroundColor && <Box><Text><Text bold={true}>Color</Text>:{" "}<Label color={backgroundColor} padded>{agent.agentType}</Label></Text></Box>;\n',
    'AgentDetail target118 color label',
  )
}

function transformColorPicker(text) {
  text = replaceExact(
    text,
    "import { capitalize } from '../../utils/stringUtils.js';\n",
    "import { capitalize } from '../../utils/stringUtils.js';\nimport { Label } from '../design-system/Label.js';\n",
    'ColorPicker Label import',
  )
  text = replaceExact(
    text,
    '<Text backgroundColor={AGENT_COLOR_TO_THEME_COLOR[option]} color="inverseText">{" "}</Text>',
    '<Label color={AGENT_COLOR_TO_THEME_COLOR[option]}>{" "}</Label>',
    'ColorPicker target118 swatch',
  )
  return replaceExact(
    text,
    '<Text backgroundColor={AGENT_COLOR_TO_THEME_COLOR[selectedValue]} color="inverseText" bold={true}>{" "}@{agentName}{" "}</Text>',
    '<Label color={AGENT_COLOR_TO_THEME_COLOR[selectedValue]} bold padded>@{agentName}</Label>',
    'ColorPicker target118 preview label',
  )
}

function transformQuestionNavigationBar(text) {
  text = replaceExact(
    text,
    "import { Box, Text } from '../../../ink.js';\n",
    "import { Box, Text } from '../../../ink.js';\nimport { Label } from '../../design-system/Label.js';\n",
    'QuestionNavigationBar Label import',
  )
  text = replaceExact(
    text,
    '        return <Box key={q_1?.question || `question-${index_2}`}>{isSelected ? <Text backgroundColor="permission" color="inverseText">{" "}{checkbox} {displayText}{" "}</Text> : <Text>{" "}{checkbox} {displayText}{" "}</Text>}</Box>;\n',
    '        return <Box key={q_1?.question || `question-${index_2}`}><Label color={isSelected ? "permission" : undefined} padded>{checkbox} {displayText}</Label></Box>;\n',
    'QuestionNavigationBar target118 question label',
  )
  return replaceExact(
    text,
    '    t5 = !hideSubmitTab && <Box key="submit">{currentQuestionIndex === questions.length ? <Text backgroundColor="permission" color="inverseText">{" "}{figures.tick} Submit{" "}</Text> : <Text> {figures.tick} Submit </Text>}</Box>;\n',
    '    t5 = !hideSubmitTab && <Box key="submit"><Label color={currentQuestionIndex === questions.length ? "permission" : undefined} padded>{figures.tick} Submit</Label></Box>;\n',
    'QuestionNavigationBar target118 submit label',
  )
}

function transformCliArgs(text) {
  const declaration = `\nconst CLI_FLAGS_WITH_VALUES = new Set([\n  '--prefill',\n  '--prefill-b64',\n  '--deep-link-repo',\n  '--deep-link-last-fetch',\n  '--deep-link-cwd-b64',\n  '--handle-uri',\n  '--settings',\n  '--managed-settings',\n  '--setting-sources',\n])\n`
  if (!text.endsWith('\n')) {
    throw new Error('cliArgs: expected final newline')
  }
  return `${text}${declaration}`
}

function transformFeedbackSurveyView(text) {
  text = replaceExact(
    text,
    "const RESPONSE_INPUTS = ['0', '1', '2', '3'] as const;\n",
    "const RESPONSE_INPUTS = ['0', '1', '2', '3', '4'] as const;\n",
    'FeedbackSurveyView target118 input set',
  )
  text = replaceExact(
    text,
    "  '3': 'good'\n} as const;\n",
    "  '3': 'good',\n  '4': 'not_sure'\n} as const;\n",
    'FeedbackSurveyView target118 response map',
  )
  return replaceExact(
    text,
    "export const isValidResponseInput = (input: string): input is ResponseInput => (RESPONSE_INPUTS as readonly string[]).includes(input);\n",
    `const PRIMARY_RESPONSE_OPTIONS = [\n  { key: '1', label: 'Bad' },\n  { key: '2', label: 'Fine' },\n  { key: '3', label: 'Good' },\n] as const;\nconst NOT_SURE_RESPONSE_OPTION = { key: '4', label: 'Unsure' } as const;\nconst DISMISS_RESPONSE_OPTION = { key: '0', label: 'Dismiss' } as const;\nexport const isValidResponseInput = (input: string): input is ResponseInput => (RESPONSE_INPUTS as readonly string[]).includes(input);\n`,
    'FeedbackSurveyView target118 option declarations',
  )
}

function transformFeedbackSurvey(text) {
  return replaceExact(
    text,
    "const isFollowUpDigit = (char: string): char is '1' => char === '1';\n",
    `const RESPONSE_LABELS: Partial<Record<FeedbackSurveyResponse, string>> = {\n  bad: 'Bad',\n  fine: 'Fine',\n  good: 'Good',\n  not_sure: 'Unsure',\n};\nconst isFollowUpDigit = (char: string): char is '1' => char === '1';\n`,
    'FeedbackSurvey target118 response labels',
  )
}

const TRANSFORMS = Object.freeze({
  'src/components/design-system/Tabs.tsx': transformTabs,
  'src/components/agents/AgentDetail.tsx': transformAgentDetail,
  'src/components/agents/ColorPicker.tsx': transformColorPicker,
  'src/components/permissions/AskUserQuestionPermissionRequest/QuestionNavigationBar.tsx':
    transformQuestionNavigationBar,
  'src/utils/cliArgs.ts': transformCliArgs,
  'src/components/FeedbackSurvey/FeedbackSurveyView.tsx':
    transformFeedbackSurveyView,
  'src/components/FeedbackSurvey/FeedbackSurvey.tsx': transformFeedbackSurvey,
})

function sourceFilename(sourceRoot, sourcePath) {
  if (!sourcePath.startsWith('src/')) {
    throw new Error(`${sourcePath}: expected normalized src path`)
  }
  const relative = sourcePath.slice(4)
  if (
    relative.length === 0 ||
    path.isAbsolute(relative) ||
    relative.split('/').some(part => part === '' || part === '.' || part === '..')
  ) {
    throw new Error(`${sourcePath}: unsafe source path`)
  }
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, ...relative.split('/'))
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${sourcePath}: escapes source root`)
  }
  return filename
}

function readPinnedFile(sourceRoot, expected) {
  const filename = sourceFilename(sourceRoot, expected.path)
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${expected.path}: expected a real source file`)
  }
  const bytes = fs.readFileSync(filename)
  const actual = descriptor(bytes)
  if (!sameDescriptor(actual, expected)) {
    throw new Error(
      `${expected.path}: expected ${expected.bytes}/${expected.sha256}, ` +
        `got ${actual.bytes}/${actual.sha256}`,
    )
  }
  return bytes
}

function verifyRecoveredFiles(sourceRoot) {
  return TARGET118_STRICT_TRANSITIVE_RECOVERED_SOURCE_FILES.map(expected => {
    const bytes = readPinnedFile(sourceRoot, expected)
    return { ...expected, ...descriptor(bytes), action: 'unchanged' }
  })
}

export function constructTarget118StrictTransitiveFiles({ sourceRoot }) {
  if (typeof sourceRoot !== 'string' || sourceRoot.length === 0) {
    throw new Error('sourceRoot must be a non-empty path string')
  }
  const resolvedSourceRoot = path.resolve(sourceRoot)
  return new Map(
    TARGET118_STRICT_TRANSITIVE_INPUT_FILES.map(expected => {
      const input = readPinnedFile(resolvedSourceRoot, expected)
      const transform = TRANSFORMS[expected.path]
      if (!transform) throw new Error(`${expected.path}: transform missing`)
      return [expected.path, Buffer.from(transform(input.toString('utf8')))]
    }),
  )
}

export function applyTarget118StrictTransitiveSourceGapReplay({ sourceRoot }) {
  if (typeof sourceRoot !== 'string' || sourceRoot.length === 0) {
    throw new Error('sourceRoot must be a non-empty path string')
  }
  const resolvedSourceRoot = path.resolve(sourceRoot)
  const before = summarizeSourceTree(resolvedSourceRoot)

  if (
    sameTreeSummary(
      before,
      TARGET118_STRICT_TRANSITIVE_RECOVERED_SOURCE_TREE,
    )
  ) {
    const files = verifyRecoveredFiles(resolvedSourceRoot)
    return {
      case: CASE_NAME,
      status: 'already-recovered',
      sourceRoot: resolvedSourceRoot,
      before: publicTreeSummary(before),
      after: publicTreeSummary(before),
      ownerOverrides:
        TARGET118_STRICT_TRANSITIVE_SOURCE_GAP_OVERRIDES.length,
      files,
    }
  }
  if (!sameTreeSummary(before, TARGET118_STRICT_TRANSITIVE_RAW_SOURCE_TREE)) {
    throw new Error(
      `Refusing to replay against non-target118 source tree: got ` +
        `${before.files}/${before.bytes}/${before.manifestSha256}`,
    )
  }

  const recovered = constructTarget118StrictTransitiveFiles({
    sourceRoot: resolvedSourceRoot,
  })
  for (const expected of TARGET118_STRICT_TRANSITIVE_RECOVERED_SOURCE_FILES) {
    const bytes = recovered.get(expected.path)
    if (!bytes) throw new Error(`${expected.path}: constructed output absent`)
    const actual = descriptor(bytes)
    if (!sameDescriptor(actual, expected)) {
      throw new Error(
        `${expected.path}: replay drift; expected ` +
          `${expected.bytes}/${expected.sha256}, got ` +
          `${actual.bytes}/${actual.sha256}`,
      )
    }
  }

  const files = []
  for (const expected of TARGET118_STRICT_TRANSITIVE_RECOVERED_SOURCE_FILES) {
    const filename = sourceFilename(resolvedSourceRoot, expected.path)
    fs.writeFileSync(filename, recovered.get(expected.path))
    files.push({ ...expected, action: 'recovered' })
  }
  const after = summarizeSourceTree(resolvedSourceRoot)
  if (
    !sameTreeSummary(
      after,
      TARGET118_STRICT_TRANSITIVE_RECOVERED_SOURCE_TREE,
    )
  ) {
    throw new Error(
      `Recovered source tree identity mismatch: got ` +
        `${after.files}/${after.bytes}/${after.manifestSha256}`,
    )
  }
  return {
    case: CASE_NAME,
    status: 'recovered',
    sourceRoot: resolvedSourceRoot,
    before: publicTreeSummary(before),
    after: publicTreeSummary(after),
    ownerOverrides: TARGET118_STRICT_TRANSITIVE_SOURCE_GAP_OVERRIDES.length,
    files,
  }
}

function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== '--source-root') {
    throw new Error(
      'Usage: replay-strict-transitive-source-gaps.mjs --source-root DIR',
    )
  }
  return { sourceRoot: argv[1] }
}

function main() {
  const result = applyTarget118StrictTransitiveSourceGapReplay(
    parseArguments(process.argv.slice(2)),
  )
  console.log(JSON.stringify(result, null, 2))
}

const invokedAsScript =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (invokedAsScript) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error))
    process.exitCode = 1
  }
}
