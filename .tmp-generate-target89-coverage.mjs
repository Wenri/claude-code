import fs from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

const caseName = '2.1.88-to-2.1.89'
const targetVersion = '2.1.89'
const targetCommit = 'ae5a27f9446042e9df589189889c110703ab351c'
const caseRoot = `recovery/cases/${caseName}`
const repositoryRoot = process.cwd()
const historicalRoot = '/tmp/claude-2.1.89-cumulative-worktree-zJR5v1'
const input = JSON.parse(
  fs.readFileSync('/tmp/recovery-semantic-target89.all-owners.json', 'utf8'),
)

function normalizeSource(source) {
  if (typeof source !== 'string') return null
  const marker = source.lastIndexOf('/src/')
  if (marker >= 0) return source.slice(marker + 1)
  return source.startsWith('src/') ? source : null
}

function ownerId(filename) {
  return `owner-${filename.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')}`
}

function dependencyPackage(source) {
  const marker = '/node_modules/'
  const index = source.lastIndexOf(marker)
  if (index < 0) return '(unknown dependency)'
  const parts = source.slice(index + marker.length).split('/')
  return parts[0]?.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]
}

function exactCounts(rows, field, values) {
  return Object.fromEntries(
    values.map(value => [
      value,
      rows.filter(row => row[field] === value).length,
    ]),
  )
}

function loadFragment(filename) {
  return JSON.parse(fs.readFileSync(path.join(caseRoot, filename), 'utf8'))
}

const fragments = [
  loadFragment('semantic/prompts-skills-ledger-fragment.json'),
  loadFragment('semantic/runtime-misc-ledger-fragment.json'),
  loadFragment('semantic/process-wrappers-ledger-fragment.json'),
]
const overrideRows = new Map(
  fragments.flatMap(fragment => fragment.rows).map(row => [row.targetIndex, row]),
)
const ownersById = new Map()
const evidenceById = new Map()
for (const fragment of fragments) {
  for (const owner of fragment.owners) ownersById.set(owner.id, owner)
  for (const evidence of fragment.evidence) evidenceById.set(evidence.id, evidence)
}

for (const evidence of [
  {
    id: 'structural-pairing',
    kind: 'structural-pairing',
    detail:
      'The structural ledger pairs this moved unit by exact scope-normalized token hash.',
  },
  {
    id: 'alpha-static-ast',
    kind: 'static-ast',
    detail:
      'The complete target unit has an identical identifier-insensitive AST token hash in the authenticated baseline; literals, property names, calls, operators, and control flow remain exact.',
  },
  {
    id: 'alpha-readable-normalization',
    kind: 'readable-normalization',
    detail:
      'Readable normalization and the identifier-insensitive AST hash classify this unit as binding/order-only churn.',
  },
  {
    id: 'source-map-attribution',
    kind: 'source-map-attribution',
    detail:
      'Authenticated target source-map partitions or initializer votes reach the named first-party src owner.',
  },
  {
    id: 'target89-general-semantic-test',
    kind: 'semantic-test',
    path: 'recovery/test/recovery-2.1.89-semantic-source-coverage.test.mjs',
    detail:
      'Fail-closed coverage tests pin the exact structural population, every owner, dependency gaps, the canonical supplement, and cross-cutting recovered call paths.',
  },
  {
    id: 'target89-build-metadata',
    kind: 'generated-metadata',
    detail:
      'The only target-added residues in this unit are the authenticated release version/build timestamp or absolute external-build dependency roots; they are generated build inputs, not authored first-party runtime semantics.',
  },
  {
    id: 'target89-autocompact-target-fragments',
    kind: 'target-fragment',
    path: 'recovery/test/recovery-2.1.89-autocompact-command-semantic.test.mjs',
    detail:
      'The authenticated target bundle, exact coordinates/hashes, command mutations, UI, registration, and resolver-to-compaction control flow are pinned for the complete /autocompact cluster.',
  },
  {
    id: 'target89-autocompact-semantic-test',
    kind: 'semantic-test',
    path: 'recovery/test/recovery-2.1.89-autocompact-command-semantic.test.mjs',
    detail:
      'Historical and current source tests cover the noninteractive mutation order, interactive selection flow, descriptor registration, and downstream compaction-window use.',
  },
  {
    id: 'target89-buddy-target-fragments',
    kind: 'target-fragment',
    path: 'recovery/test/recovery-2.1.89-buddy-runtime-semantic.test.mjs',
    detail:
      'Pins all 35 exact buddy structural units plus their complete aggregate branch/operator graph in the authenticated target bundle.',
  },
  {
    id: 'target89-buddy-semantic-test',
    kind: 'semantic-test',
    path: 'recovery/test/recovery-2.1.89-buddy-runtime-semantic.test.mjs',
    detail:
      'Historical and current source tests cover the buddy API, observer trigger precedence, soul generation/fallback, notification, hatch/pet command, and ambient sprite state graph.',
  },
  {
    id: 'target89-owner-residue-target-fragments',
    kind: 'target-fragment',
    path: 'recovery/test/recovery-2.1.89-owner-residue-semantic.test.mjs',
    detail:
      'Authenticated target89 coordinates and hashes pin every hardened first-party owner residue together with its control/operator signature.',
  },
  {
    id: 'target89-owner-residue-semantic-test',
    kind: 'semantic-test',
    path: 'recovery/test/recovery-2.1.89-owner-residue-semantic.test.mjs',
    detail:
      'Historical and current source tests require every hardened target89 residue to have its exact explicit authored owner rather than generic ledger evidence.',
  },
  {
    id: 'dependency-attribution',
    kind: 'dependency-attribution',
    detail:
      'The highest-weight authenticated source-map attribution is a node_modules source; it is excluded only from the first-party verdict.',
  },
  {
    id: 'dependency-build-input-audit',
    kind: 'dependency-attribution',
    path: `${caseRoot}/semantic/dependency-coverage.json.gz`,
    detail:
      'The dependency audit records every nonmatched third-party unit and the absence of a target-pinned application manifest, lockfile, dependency archive, and build recipe.',
  },
  {
    id: 'message-rating-static-consumer',
    kind: 'static-ast',
    path: 'recovery/test/recovery-2.1.89-prompts-skills-semantic.test.mjs',
    detail:
      'The authenticated target fixes the only rating-affordance consumer false/null; the retained provider has no observable consumer in the published external build.',
  },
  {
    id: 'deferred-target-fragments',
    kind: 'target-fragment',
    path: 'recovery/test/recovery-2.1.89-deferred-tool-semantic.test.mjs',
    detail:
      'Authenticated target fragments and exact target-unit hashes pin the deferred hook, suspension, transcript, replay, SDK, UI, and print-mode cluster.',
  },
  {
    id: 'deferred-semantic-test',
    kind: 'semantic-test',
    path: 'recovery/test/recovery-2.1.89-deferred-tool-semantic.test.mjs',
    detail:
      'Source tests cover defer precedence, solo print-mode suspension, transcript persistence, resumed tool execution, unavailable-tool handling, SDK output, UI, and auto-resume.',
  },
  {
    id: 'inbound-file-attachments89-target-fragments',
    kind: 'target-fragment',
    path: 'recovery/test/recovery-2.1.89-inbound-file-attachments-semantic.test.mjs',
    detail:
      'Authenticated target88/89 bundles pin the zero-to-fourteen fileAttachments introduction and all four exact target unit coordinates and hashes.',
  },
  {
    id: 'inbound-file-attachments89-semantic-test',
    kind: 'semantic-test',
    path: 'recovery/test/recovery-2.1.89-inbound-file-attachments-semantic.test.mjs',
    detail:
      'Historical and current source tests require typed queue storage, transcript attachment materialization, QueryEngine replay propagation, batching, ask propagation, duplicate replay, and fresh inbound extraction.',
  },
]) {
  evidenceById.set(evidence.id, evidence)
}

const deferredIndexes = new Set([
  7730, 9705, 10163, 10466, 11995, 12007, 12086, 12652, 12703, 15687,
  15730, 15732, 15749, 18041, 18052,
])
const promptsSkillsIndexes = new Set([8991, 13172, 13173, 15515])
const generatedMetadataIndexes = new Set([
  4542, 4546, 4548, 4553, 4595, 4601, 4602, 4613, 4855, 4879, 5020,
  6616, 7005, 7118, 7437, 8435, 8480, 8663, 8665, 9337, 9338, 9371,
  9390, 9400, 9401, 9423, 9426, 9477, 9494, 12095, 13058, 13059,
  13229, 13252, 13305, 13592, 14072, 14073, 14140, 14222, 14223,
  14930, 14955, 15276, 15431, 15584, 15832, 15869, 15938, 16023,
  16024, 16160, 16596, 16599, 16603, 16606, 16898, 17261, 17624,
  17625, 17689, 18148,
])
const autocompactOwners = new Map([
  [13205, 'src/commands/autocompact/autocompact-noninteractive.ts'],
  [13206, 'src/commands/autocompact/autocompact-noninteractive.ts'],
  [13207, 'src/commands/autocompact/autocompact-noninteractive.ts'],
  [13208, 'src/commands/autocompact/autocompact-noninteractive.ts'],
  [13212, 'src/commands/autocompact/autocompact.tsx'],
  [13213, 'src/commands/autocompact/autocompact.tsx'],
  [13214, 'src/commands/autocompact/autocompact.tsx'],
  [13215, 'src/commands/autocompact/autocompact.tsx'],
  [13218, 'src/commands/autocompact/index.ts'],
])
const buddyOwners = new Map([
  [15351, 'src/buddy/observer.ts'],
  [15355, 'src/buddy/observer.ts'],
  [15357, 'src/buddy/observer.ts'],
  [15358, 'src/buddy/observer.ts'],
  [15360, 'src/buddy/observer.ts'],
  [15361, 'src/buddy/observer.ts'],
  [15362, 'src/buddy/observer.ts'],
  [15363, 'src/buddy/observer.ts'],
  [15364, 'src/buddy/observer.ts'],
  [15366, 'src/buddy/observer.ts'],
  [15367, 'src/buddy/soul.ts'],
  [15368, 'src/buddy/soul.ts'],
  [15369, 'src/buddy/soul.ts'],
  [15370, 'src/buddy/soul.ts'],
  [15371, 'src/buddy/soul.ts'],
  [15372, 'src/buddy/useBuddyNotification.tsx'],
  [15375, 'src/buddy/useBuddyNotification.tsx'],
  [15376, 'src/buddy/useBuddyNotification.tsx'],
  [15379, 'src/buddy/sprites.ts'],
  [15381, 'src/buddy/sprites.ts'],
  [15383, 'src/buddy/sprites.ts'],
  [15384, 'src/commands/buddy/index.tsx'],
  [15385, 'src/commands/buddy/index.tsx'],
  [15388, 'src/commands/buddy/index.tsx'],
  [15391, 'src/commands/buddy/index.tsx'],
  [15392, 'src/commands/buddy/index.tsx'],
  [15395, 'src/commands/buddy/index.tsx'],
  [15396, 'src/commands/buddy/index.tsx'],
  [15398, 'src/commands/buddy/index.tsx'],
  [16579, 'src/buddy/CompanionSprite.tsx'],
  [16581, 'src/buddy/CompanionSprite.tsx'],
  [16582, 'src/buddy/CompanionSprite.tsx'],
  [16583, 'src/buddy/CompanionSprite.tsx'],
  [16586, 'src/buddy/CompanionSprite.tsx'],
  [16587, 'src/buddy/CompanionSprite.tsx'],
])
const inboundFileAttachmentOwners = new Map([
  [12342, ['src/utils/attachments.ts']],
  [18011, ['src/QueryEngine.ts']],
  [18012, ['src/QueryEngine.ts']],
  [18042, ['src/cli/print.ts', 'src/types/textInputTypes.ts']],
])
const ownerResidueIndexes = new Set([
  358, 399, 573, 862, 863, 2106, 2142, 2143, 2144, 2259, 2307, 2308,
  2309, 2310, 2311, 2313, 2318, 2365, 2366, 2367, 2368, 2369, 2371,
  2482, 2569, 2574,
  2592, 3092, 4592, 4852, 5035, 5537, 5547, 5633, 5922, 6191, 6632,
  6650, 6652, 6806, 6812, 7479, 7481, 7482, 7483, 7484, 7489, 7494,
  7500, 7501, 7504, 7505, 7506, 7507, 7508, 7509, 7512, 7513, 7514,
  7521, 7537, 7538, 7539, 7540, 7542, 7544, 7552, 7554, 7572, 7609,
  7670, 7674, 7676, 7679, 7703, 7712, 8143, 8320, 8500, 8571, 8661,
  8664, 8770, 8860, 8867, 8945, 8946, 8973, 9468, 9469, 9475, 9515,
  9646, 9793, 9954, 10025, 10049, 10204, 10238, 10244, 10246, 10311,
  10536, 10630, 10659, 10661, 10671, 10679, 10735, 10822, 11135,
  11153, 11702, 11705, 11731, 11732, 11737, 11791, 11829, 11833,
  11834, 11835, 11836, 11838, 11919, 11935, 11937, 11992, 11993,
  12072, 12087, 12115, 12210, 12340, 12409, 12435, 12577,
  12768, 12827, 13169, 13179, 13296, 13297, 13302, 13356, 13389,
  13394, 13694, 13926, 14254, 14269, 14282, 14294, 14419, 14420,
  14425, 14434, 14435, 14436, 14437, 14498, 14755, 14759, 14764,
  14794, 15356, 15359, 15365, 15380, 15452, 15454, 15489, 15519,
  15543, 15572, 15576, 15581, 15627, 15649, 15657, 15676, 15677,
  15699, 15720, 15729, 15804, 15815, 15911, 16127, 16128, 16162,
  16164, 16165, 16212, 16224, 16233, 16234, 16252, 16465, 16578,
  16585, 16625, 16640, 16660, 16662, 16974, 16987, 17052, 17158,
  17159, 17571, 17887, 18008, 18032, 18071, 18166, 18168, 18176,
  18179,
])
const ownerResidueOverrides = new Map([
  [862, 'src/utils/fsOperations.ts'],
  [863, 'src/utils/fsOperations.ts'],
  [2259, 'src/utils/execFileNoThrowPortable.ts'],
  [2307, 'src/utils/execa.ts'],
  [2308, 'src/utils/execa.ts'],
  [2309, 'src/utils/execa.ts'],
  [2310, 'src/utils/authPortable.ts'],
  [2311, 'src/utils/execFileNoThrowPortable.ts'],
  [2313, 'src/utils/execFileNoThrowPortable.ts'],
  [2318, 'src/utils/execFileNoThrow.ts'],
  [2365, 'src/utils/which.ts'],
  [2366, 'src/utils/which.ts'],
  [2367, 'src/utils/which.ts'],
  [2368, 'src/utils/which.ts'],
  [2369, 'src/utils/which.ts'],
  [2371, 'src/utils/which.ts'],
  [2592, 'src/utils/settings/mdm/rawRead.ts'],
  [5922, 'src/utils/yaml.ts'],
  [6632, 'src/tools/AgentTool/built-in/verificationAgent.ts'],
  [6806, 'src/utils/tokens.ts'],
  [7670, 'src/state/AppStateStore.ts'],
  [11833, 'src/tools/BashTool/BashTool.tsx'],
  [11834, 'src/tools/BashTool/fileReadState.ts'],
  [11835, 'src/tools/BashTool/fileReadState.ts'],
  [11836, 'src/tools/BashTool/fileReadState.ts'],
  [11838, 'src/tools/BashTool/fileReadState.ts'],
  [11935, 'src/tools/BashTool/bashCommandHelpers.ts'],
  [14254, 'src/hooks/useVirtualScroll.ts'],
  [14755, 'src/components/agents/agentFileUtils.ts'],
  [14759, 'src/components/agents/agentFileUtils.ts'],
  [14764, 'src/components/agents/agentFileUtils.ts'],
  [16127, 'src/components/ResumeReturnDialog.tsx'],
  [16128, 'src/components/ResumeReturnDialog.tsx'],
  [16162, 'src/bridge/clientPresence.ts'],
  [16164, 'src/bridge/clientPresence.ts'],
  [17887, 'src/skills/bundled/index.ts'],
  [18176, 'src/main.tsx'],
])
const dependencyBoundaryIndexes = new Set([2259, 2310, 2311])
const dependencyRows = []
const rows = []

for (const sourceRow of input.rows) {
  const base = {
    targetIndex: sourceRow.targetIndex,
    start: sourceRow.start,
    end: sourceRow.end,
    nodeType: sourceRow.nodeType,
    sourceHash: sourceRow.sourceHash,
    structuralClass: sourceRow.structuralClass,
  }
  const override = overrideRows.get(sourceRow.targetIndex)
  if (override) {
    rows.push(override)
    continue
  }

  if (sourceRow.targetIndex === 8865) {
    rows.push({
      ...base,
      disposition: 'dce-nonruntime',
      ownerIds: [],
      evidenceIds: ['message-rating-static-consumer'],
      category: 'static-false-null-consumer',
      reason:
        'The retained React rating provider has no observable consumer because the published external target fixes its sole rating affordance false/null.',
    })
    continue
  }

  if (generatedMetadataIndexes.has(sourceRow.targetIndex)) {
    rows.push({
      ...base,
      disposition: 'generated-metadata',
      ownerIds: [],
      evidenceIds: ['target89-build-metadata'],
      category: sourceRow.targetIndex === 7005 || sourceRow.targetIndex === 7118
        ? 'absolute-external-build-root'
        : 'release-version-and-build-timestamp',
      reason:
        'The hardened residue inventory finds no target-added observable value other than authenticated build metadata in this complete structural unit.',
    })
    continue
  }

  const autocompactOwner = autocompactOwners.get(sourceRow.targetIndex)
  if (autocompactOwner) {
    const id = ownerId(autocompactOwner)
    ownersById.set(id, { id, path: autocompactOwner })
    rows.push({
      ...base,
      disposition: 'source-runtime-covered',
      ownerIds: [id],
      evidenceIds: [
        'target89-autocompact-target-fragments',
        'target89-autocompact-semantic-test',
      ],
      behavior:
        `The target /autocompact unit is recovered in ${autocompactOwner}; authenticated tests pin its exact target fragment and reachable historical/current source flow.`,
    })
    continue
  }

  const buddyOwner = buddyOwners.get(sourceRow.targetIndex)
  if (buddyOwner) {
    const id = ownerId(buddyOwner)
    ownersById.set(id, { id, path: buddyOwner })
    rows.push({
      ...base,
      disposition: 'source-runtime-covered',
      ownerIds: [id],
      evidenceIds: [
        'target89-buddy-target-fragments',
        'target89-buddy-semantic-test',
      ],
      behavior:
        `The target buddy unit is recovered in ${buddyOwner}; authenticated tests pin its exact target bytes, complete control graph, and reachable historical/current owner flow.`,
    })
    continue
  }

  const inboundOwners = inboundFileAttachmentOwners.get(sourceRow.targetIndex)
  if (inboundOwners) {
    const ownerIds = inboundOwners.map(filename => {
      const id = ownerId(filename)
      ownersById.set(id, { id, path: filename })
      return id
    })
    rows.push({
      ...base,
      disposition: 'source-runtime-covered',
      ownerIds,
      evidenceIds: [
        'inbound-file-attachments89-target-fragments',
        'inbound-file-attachments89-semantic-test',
      ],
      behavior:
        `The target89 inbound attachment unit is recovered in ${inboundOwners.join(', ')}; authenticated target fragments and historical/current source evidence prove queue storage, attachment serialization, QueryEngine replay, batching, ask propagation, and inbound extraction without dropping metadata.`,
    })
    continue
  }

  if (ownerResidueIndexes.has(sourceRow.targetIndex)) {
    let chosenPath = ownerResidueOverrides.get(sourceRow.targetIndex) ?? null
    if (!chosenPath) {
      const attributed = sourceRow.owners.length > 0
        ? sourceRow.owners
        : sourceRow.candidates
      for (const item of attributed) {
        const candidate = normalizeSource(item.source)
        if (
          candidate &&
          fs.existsSync(path.join(repositoryRoot, candidate)) &&
          fs.existsSync(path.join(historicalRoot, candidate))
        ) {
          chosenPath = candidate
          break
        }
      }
    }
    if (!chosenPath) {
      throw new Error(
        `No explicit hardened owner for target unit ${sourceRow.targetIndex}`,
      )
    }
    const id = ownerId(chosenPath)
    ownersById.set(id, { id, path: chosenPath })
    rows.push({
      ...base,
      disposition: 'source-runtime-covered',
      ownerIds: [id],
      evidenceIds: [
        'target89-owner-residue-target-fragments',
        'target89-owner-residue-semantic-test',
      ],
      behavior: dependencyBoundaryIndexes.has(sourceRow.targetIndex)
        ? `The authenticated fragment is compiler-embedded process dependency runtime reached through the exact ${chosenPath} import/call boundary; the focused test pins both sides while the dependency ledger retains the unpinned whole-build-input limitation.`
        : `The hardened target89 residue is explicitly localized to ${chosenPath}; authenticated coordinates and the focused historical/current test pin its complete target and authored-source semantics.`,
    })
    continue
  }

  if (sourceRow.structuralClass === 'moved') {
    rows.push({
      ...base,
      disposition: 'alpha-equivalent',
      ownerIds: [],
      evidenceIds: ['structural-pairing'],
    })
    continue
  }

  const attributed = sourceRow.owners.length > 0
    ? sourceRow.owners
    : sourceRow.candidates
  if (attributed[0]?.source.includes('/node_modules/')) {
    const attribution = attributed[0].source
    const classification = sourceRow.alphaByCoarse
      ? 'identifier-equivalent-but-build-input-unpinned'
      : 'material-or-unresolved-delta-unpinned'
    rows.push({
      ...base,
      disposition: 'dependency-runtime',
      ownerIds: [],
      evidenceIds: ['dependency-attribution', 'dependency-build-input-audit'],
      category: classification,
      reason: sourceRow.alphaByCoarse
        ? `The target unit is identifier-insensitive AST-equivalent to a baseline unit attributed to ${attribution}, but no target-pinned dependency source/build input exists.`
        : `The target unit has a material or unresolved delta attributed to ${attribution}, but no target-pinned dependency source/build input exists.`,
    })
    dependencyRows.push({
      ...base,
      attribution,
      package: dependencyPackage(attribution),
      classification,
      sourceBuildInputPinned: false,
    })
    continue
  }

  if (sourceRow.alphaByCoarse) {
    rows.push({
      ...base,
      disposition: 'alpha-equivalent',
      ownerIds: [],
      evidenceIds: ['alpha-static-ast', 'alpha-readable-normalization'],
      reason:
        'A complete baseline unit has the same identifier-insensitive tokenized AST; only bound/free identifier allocation, placement, or generated grouping differs.',
    })
    continue
  }

  let chosenPath = null
  for (const item of attributed) {
    const candidate = normalizeSource(item.source)
    if (
      candidate &&
      fs.existsSync(path.join(repositoryRoot, candidate)) &&
      fs.existsSync(path.join(historicalRoot, candidate))
    ) {
      chosenPath = candidate
      break
    }
  }
  if (!chosenPath) {
    throw new Error(`No source owner for target unit ${sourceRow.targetIndex}`)
  }
  const id = ownerId(chosenPath)
  ownersById.set(id, { id, path: chosenPath })
  const isDeferred = deferredIndexes.has(sourceRow.targetIndex)
  const isPromptsSkills = promptsSkillsIndexes.has(sourceRow.targetIndex)
  rows.push({
    ...base,
    disposition: 'source-runtime-covered',
    ownerIds: [id],
    evidenceIds: isDeferred
      ? ['source-map-attribution', 'deferred-target-fragments', 'deferred-semantic-test']
      : isPromptsSkills
        ? [
            'source-map-attribution',
            'evidence-prompts-skills-target-fragments',
            'evidence-prompts-skills-source-test',
          ]
        : ['source-map-attribution', 'target89-general-semantic-test'],
    behavior: isDeferred
      ? `The target deferred-tool unit is localized to ${chosenPath}; authenticated fragments and focused tests prove its connected runtime call path.`
      : isPromptsSkills
        ? `The target representation/static-branch unit is localized to ${chosenPath}; authenticated fragments and focused tests pin its exact identity and reachable owner behavior.`
      : `The compiled target unit is localized to ${chosenPath}; the canonical historical supplement and current cumulative src retain its literals, property names, calls, gates, control flow, and observable effects.`,
  })
}

rows.sort((left, right) => left.targetIndex - right.targetIndex)
const dispositions = [
  'alpha-equivalent',
  'dependency-runtime',
  'generated-metadata',
  'dce-nonruntime',
  'source-runtime-covered',
  'source-runtime-gap',
]
const coverage = {
  schemaVersion: 1,
  case: caseName,
  targetVersion,
  targetCommit,
  criterion: 'compiled-ast-function-semantics-v1',
  summary: {
    nonmatchedUnits: rows.length,
    byStructuralClass: exactCounts(rows, 'structuralClass', [
      'changed',
      'moved',
      'unresolved',
    ]),
    byDisposition: exactCounts(rows, 'disposition', dispositions),
    sourceRuntimeGaps: 0,
    dependencyRuntimeGaps: dependencyRows.length,
  },
  owners: [...ownersById.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  ),
  evidence: [...evidenceById.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  ),
  rows,
}

const groups = new Map()
for (const row of dependencyRows) {
  const group = groups.get(row.package) ?? {
    package: row.package,
    attributedSources: new Set(),
    rows: [],
  }
  group.attributedSources.add(row.attribution)
  group.rows.push({
    targetIndex: row.targetIndex,
    sourceHash: row.sourceHash,
    structuralClass: row.structuralClass,
    classification: row.classification,
  })
  groups.set(row.package, group)
}
const identifierEquivalent = dependencyRows.filter(row =>
  row.classification.startsWith('identifier-equivalent'),
).length
const dependency = {
  schemaVersion: 1,
  case: caseName,
  targetVersion,
  targetCommit,
  criterion: 'whole-bundle-dependency-build-input-v1',
  summary: {
    dependencyRows: dependencyRows.length,
    identifierOrMetadataEquivalent: identifierEquivalent,
    materialOrUnresolvedDelta: dependencyRows.length - identifierEquivalent,
    pinnedSourceBuildInputs: 0,
    dependencyRuntimeGaps: dependencyRows.length,
    exactTargetBundleArtifactRecoverable: true,
    wholeBundleSemanticEquivalentFromSrc: false,
  },
  buildInputAudit: {
    applicationManifestOrLockfileInTargetCommit: false,
    dependencySourceArchivePinned: false,
    dependencyBuildRecipePinned: false,
    exactTargetBundleArtifactRecoverable: true,
    conclusion:
      'The exact target bytes remain recoverable from the generated delta, but the application dependency graph and build inputs are not present in the historical source tree.',
  },
  groups: [...groups.values()]
    .sort((left, right) => left.package.localeCompare(right.package))
    .map(group => ({
      package: group.package,
      attributedSources: [...group.attributedSources].sort(),
      summary: {
        dependencyRows: group.rows.length,
        identifierOrMetadataEquivalent: group.rows.filter(row =>
          row.classification.startsWith('identifier-equivalent'),
        ).length,
        materialOrUnresolvedDelta: group.rows.filter(row =>
          row.classification.startsWith('material-or-unresolved'),
        ).length,
        sourceBuildInputPinned: false,
      },
      artifactRecovery: 'exact-target-bundle-bytes-only',
      gap:
        'No target-pinned dependency source/build input can reproduce these embedded runtime units from source.',
      rows: group.rows,
    })),
}

const outputDirectory = path.join(caseRoot, 'semantic')
fs.mkdirSync(outputDirectory, { recursive: true })
fs.writeFileSync(
  path.join(outputDirectory, 'source-coverage.json.gz'),
  gzipSync(`${JSON.stringify(coverage, null, 2)}\n`, { level: 9, mtime: 0 }),
)
fs.writeFileSync(
  path.join(outputDirectory, 'dependency-coverage.json.gz'),
  gzipSync(`${JSON.stringify(dependency, null, 2)}\n`, { level: 9, mtime: 0 }),
)
console.log(JSON.stringify(coverage.summary, null, 2))
