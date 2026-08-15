import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.110-to-2.1.111'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_111_BUNDLE
const caseRoot = path.join(repositoryRoot, 'recovery/cases', caseName)
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(path.join(caseRoot, 'structural/generated-delta.json.gz')),
  ),
)

const CANDIDATE_EVIDENCE = [
  'case111-residue-matrix-target-fragment',
  'case111-residue-matrix-semantic-test',
]
const STATIC_EVIDENCE = [
  'case111-residue-matrix-static-ast',
  'case111-residue-matrix-semantic-test',
]

const rows = [
  {
    index: 5186,
    category: 'candidate-owner',
    owner: 'src/utils/systemTheme.ts',
    classification: 'unresolved',
    target: [3783977, 3784274, 'FunctionDeclaration', 'b429854be05763e29d54089da3195c4ef67bea2b27f268c7708814b720638ea8'],
    residues: {
      'regexp:"^rgba?:([0-9a-f]{1,4})\\\\/([0-9a-f]{1,4})\\\\/([0-9a-f]{1,4})"/i': [0, [1]],
      'regexp:"^#([0-9a-f]+)$"/i': [0, [1]],
    },
  },
  {
    index: 5997,
    category: 'candidate-owner',
    owner: 'src/keybindings/schema.ts',
    classification: 'unresolved',
    target: [4232259, 4236845, 'VariableDeclaration', 'a09d1e0fda81eb3cc3a1af6ad272c2ad63dadc344a5039060b15d0c11bc87130'],
    residues: { 'string:"settings:sortByTokens"': [0, [2]] },
  },
  {
    index: 8834,
    category: 'candidate-owner',
    owner: 'src/utils/telemetry/apiBodyLogging.ts',
    classification: 'unresolved',
    target: [5899635, 5899802, 'FunctionDeclaration', 'c16621e216327720ec52494bb8407c41f03e29ee33329134efa9b7fbab13ea71'],
    residues: { 'string:"<REDACTED>"': [2, [3]] },
  },
  {
    index: 13841,
    category: 'candidate-owner',
    owner: 'src/services/api/withRetry.ts',
    classification: 'unresolved',
    target: [10047800, 10051033, 'FunctionDeclaration', '436a08bcab711e4fa92a63ab2ec030e9e6b9c71ae62530ddd80179d023f0f8f8'],
    residues: {
      'number:407': [6, [7]],
      'property:"query_source"': [2, [4]],
    },
  },
  {
    index: 14037,
    category: 'candidate-owner',
    owner: 'src/commands/clear/index.ts',
    classification: 'unresolved',
    target: [10115082, 10115350, 'VariableDeclaration', 'bbeef17480d5a0b6b8c3aff0698bd3f829758abf7f40fc4d0a40c4836b086b10'],
    residues: {
      'string:"Start a new session with empty context; previous session stays on disk (resumable with /resume)"': [0, [1]],
    },
  },
  {
    index: 15455,
    category: 'candidate-owner',
    owner: 'src/commands/review/ultrareviewEnabled.ts',
    classification: 'unresolved',
    target: [11109821, 11109910, 'FunctionDeclaration', '525ed0df540b35075aabb26e764df66cacabfdd3680488e4eb4b6bec04cdc84f'],
    residues: {
      'property:"cost_note"': [0, [1]],
      'string:"$10-$20"': [0, [1]],
    },
  },
  {
    index: 15456,
    category: 'candidate-owner',
    owner: 'src/commands/review/ultrareviewEnabled.ts',
    classification: 'unresolved',
    target: [11109910, 11110006, 'FunctionDeclaration', 'af557d95053464021c57f46e1020e8f7b7767a46e13e3e024c1a510e0bcbb522'],
    residues: { 'property:"duration_note"': [0, [1]] },
  },
  {
    index: 18424,
    category: 'candidate-owner',
    owner: 'src/components/FeedbackSurvey/useFeedbackSurvey.tsx',
    classification: 'unresolved',
    target: [12535980, 12537333, 'FunctionDeclaration', 'd26de81e4ec181a19ff51e244db323f4b09f67b1747820277cdf64bf28ed82e0'],
    residues: { 'property:"otherSurveyActive"': [0, [1]] },
  },
  {
    index: 5354,
    category: 'paired-local',
    owner: 'src/ink/colorize.ts',
    classification: 'changed',
    target: [3827328, 3829470, 'FunctionDeclaration', 'b38a4a062daa1afcddf21d01d74d95bc9e376590ea54dc1eaab1a61ffed0e5f7'],
    baseline: [5289, 3814451, 3816593, 'FunctionDeclaration', 'efc7d8adb61aef241ea4b0379bff88dcd05865a468d3460a01bbeeaaffdec1b9'],
    residues: { 'string:"dcs"': [2, [3]] },
  },
  {
    index: 12606,
    category: 'paired-local',
    owner: 'src/utils/attachments.ts',
    classification: 'changed',
    target: [9423231, 9424080, 'VariableDeclaration', '7d0c4a4ab64245873a86823bf78582f12a8c67ac96f32b335b5363ffb8b1daab'],
    baseline: [12554, 9406558, 9407407, 'VariableDeclaration', '69832130dcf0346509394fcb5b3fe3df4a50f2dca089d6fc856bdc92ec2fd841'],
    residues: { 'number:61440': [2, [3]] },
  },
  {
    index: 15082,
    category: 'paired-local',
    owner: 'src/commands/mobile/index.ts',
    classification: 'changed',
    target: [10941147, 10951153, 'VariableDeclaration', '0d0661164db19e91ee33931c201084b767ad4f64d11054639fe90827bb8da70b'],
    baseline: [15036, 10923510, 10933516, 'VariableDeclaration', 'e819574bfd4144f6ab2e25c4cded13042abf82701d23dd19563f10887bdd52f6'],
    residues: { 'string:"&"': [111, [112]] },
  },
  {
    index: 15254,
    category: 'paired-local',
    owner: 'src/components/LogoV2/feedConfigs.tsx',
    classification: 'changed',
    target: [11006061, 11006167, 'VariableDeclaration', '667d63ec0ff07677f7dfa19f2db731c1dbfd666135d96dc5373b4bad038d8105'],
    baseline: [15208, 10988424, 10988530, 'VariableDeclaration', '2b8890a18e63c4b4e22d46ba60a58b387cfb5b11de95a47dcef0765d7e2711b4'],
    residues: { 'property:"g"': [84, [85]] },
  },
  {
    index: 19305,
    category: 'paired-local',
    owner: 'src/cli/transports/WebSocketTransport.ts',
    classification: 'changed',
    target: [13426788, 13429309, 'VariableDeclaration', 'd72ddf12303e051a1c993451837c581028d61a5278ad327ce73b8ed59b7199e5'],
    baseline: [19240, 13328308, 13330829, 'VariableDeclaration', 'bb665752ad7207c2979966897fd3cdeb556ae4ae44b13c982d1a10d569ef1c19'],
    residues: {
      'number:100000': [61, [62]],
      'property:"flush"': [118, [119, 120, 121]],
      'number:200': [300, [301]],
    },
  },
  {
    index: 19470,
    category: 'paired-local',
    owner: 'src/cli/handlers/agents.ts',
    classification: 'changed',
    target: [13557061, 13557509, 'FunctionDeclaration', 'ee5d4c21c8d95cbb4af313f54d90d7ce5027bd25a76bcdfaf2097555ffa822bf'],
    baseline: [19404, 13456761, 13457209, 'FunctionDeclaration', '67e61623b0e66a960135ffeabfb6c1e6a936cb23553d168dc9ec5dd2da551106'],
    residues: {
      'property:"label"': [731, [732, 733]],
      'property:"map"': [2149, [2155]],
      'property:"createElement"': [8079, [8115, 8116]],
    },
  },
  {
    index: 8455,
    category: 'named-import-lowering',
    owner: 'src/utils/gracefulShutdown.ts',
    classification: 'unresolved',
    target: [5719355, 5720286, 'FunctionDeclaration', '88f97f88abf0dcd3e36577772f008b9c54796df12c0a9445ff4acefdbf999349'],
    residues: {
      'property:"shutdown1PEventLogging"': [1, [2]],
      'property:"shutdownDatadog"': [0, [2]],
    },
  },
  {
    index: 19430,
    category: 'named-import-lowering',
    owner: 'src/commands/install.tsx',
    classification: 'unresolved',
    target: [13536673, 13540835, 'FunctionDeclaration', '60e351d2132243dd5713555e18dfb39dcb67b19a43664083a71b1e9c8c998a02'],
    residues: { 'property:"useState"': [740, [742]] },
  },
  ...[
    [10096, 'src/utils/autoUpdater.ts', 7881425, 7882138, 'dc13e55267df99d4bb5df124bc75e3b58fc306d715bc6ebcf204ab0ad83af4cd', [30]],
    [14148, 'src/components/Settings/Status.tsx', 10154802, 10155348, 'a0528f1eff7011cb9e4ed2f854796919fc145872fa9f0a5459dd018faeccabdb', [58]],
    [15299, 'src/components/LogoV2/LogoV2.tsx', 11017995, 11026903, '5a9836b757f8e377eabbec2a2a2bd3513c56d900cc6fc1069596810ead3ad65b', [65]],
    [16971, 'src/constants/prompts.ts', 11814643, 11818557, '612c2d09c710f74fcde4fba7d252c64f7d0073b34b6ff4514fb85223d624b08c', [79]],
    [17771, 'src/components/AutoUpdater.tsx', 12263947, 12267577, '63c7519bcefdcd00a5ba1d54cca763dc2f0174b7c7b2e3493604649d0f1d6fc3', [87, 88, 89]],
    [17775, 'src/components/NativeAutoUpdater.tsx', 12268161, 12270920, 'ead1ebbaa92c0597b07f49702a04832c22274d485aba51cc914436b2745eb7ec', [90, 91]],
    [17778, 'src/components/PackageManagerAutoUpdater.tsx', 12271034, 12274092, '39cbffe9b0a3caa0e5d8e79746a8dd9bf115b6b44bdde1e1ee56e4b847cb5048', [92, 93, 94, 95, 96]],
    [18420, 'src/components/FeedbackSurvey/submitTranscriptShare.ts', 12534379, 12535791, '2d284bf7167f02ccb4c7264ad12a4dd4a79e04dae599ac15435c52383739d2d3', [98]],
  ].map(([index, owner, start, end, hash, ordinals]) => ({
    index,
    category: 'build-macro',
    owner,
    classification: 'unresolved',
    target: [start, end, 'FunctionDeclaration', hash],
    residues: {
      'string:"2.1.111"': [0, ordinals],
      'string:"2026-04-16T14:23:56Z"': [0, ordinals],
    },
  })),
]

rows.push(
  {
    index: 10179,
    category: 'candidate-owner',
    owners: ['src/utils/nativeInstaller/installer.ts', 'src/utils/nativeInstaller/download.ts'],
    classification: 'unresolved',
    target: [7911216, 7913883, 'FunctionDeclaration', '081ba19a7260c47f48748f506c5a793722802066b2129176a8e4e6fe11bc76d9'],
    residues: {
      'regexp:"^v?\\\\d+\\\\.\\\\d+\\\\.\\\\d+(-\\\\S+)?$"/': [1, [2]],
      'string:"2.1.111"': [0, [44, 45, 46]],
      'string:"2026-04-16T14:23:56Z"': [0, [44, 45, 46]],
    },
  },
  {
    index: 14017,
    category: 'candidate-owner',
    owner: 'src/hooks/fileSuggestions.ts',
    classification: 'unresolved',
    target: [10110401, 10111065, 'FunctionDeclaration', 'eea46a138edeccaa802a1ad3de3824812e7d8f4a975821f905dc1575cf925305'],
    residues: { 'property:"lastRefreshMs"': [4, [5]] },
  },
  {
    index: 14217,
    category: 'candidate-owner',
    owner: 'src/hooks/useSearchInput.ts',
    classification: 'unresolved',
    target: [10181118, 10184772, 'FunctionDeclaration', '507ef51d33cf6b08ee4f4bbcbfcecd8744b202646cfb687f76c29c115fc721ce'],
    residues: {
      'string:"prepend"': [6, [7]],
      'property:"dispatch"': [84, [85]],
    },
  },
  {
    index: 14529,
    category: 'candidate-owner',
    owner: 'src/screens/Doctor.tsx',
    classification: 'unresolved',
    target: [10535308, 10542841, 'FunctionDeclaration', '0727df691711bce8bdf4e4792d7191d2ead0e12a0b22dac2c916e83e4af5d51c'],
    residues: {
      'property:"Node"': [46, [47, 48, 49, 50]],
      'string:"Still having issues? Run /feedback to report details."': [0, [1]],
    },
  },
  {
    index: 14931,
    category: 'candidate-owner',
    owner: 'src/commands/plugin/ManagePlugins.tsx',
    classification: 'unresolved',
    target: [10810860, 10841437, 'FunctionDeclaration', 'b3b15ad52efe13ac663be3782ab96507f350260b9154deac8516a679f9cf48e9'],
    residues: {
      'string:"spacer"': [0, [1, 2, 3, 4]],
      'string:"section-header"': [0, [1, 2]],
      'string:"scope-header"': [0, [1, 2]],
      'string:"spacer:"': [0, [1]],
      'string:"section:"': [0, [1]],
      'string:"scope:"': [0, [1]],
    },
  },
  {
    index: 17325,
    category: 'candidate-owner',
    owner: 'src/utils/messages/systemInit.ts',
    classification: 'unresolved',
    target: [12009864, 12011013, 'FunctionDeclaration', '701823a477d08ad496274f326e70178e29f8c901ef70e9cd55b812a6645cb983'],
    residues: {
      'string:"2.1.111"': [0, [85]],
      'string:"2026-04-16T14:23:56Z"': [0, [85]],
      'property:"pluginErrors"': [0, [1, 2]],
      'property:"plugin_errors"': [0, [2]],
    },
  },
  {
    index: 17383,
    category: 'candidate-owner',
    owner: 'src/bridge/remoteBridgeCore.ts',
    classification: 'unresolved',
    target: [12045893, 12055857, 'FunctionDeclaration', 'e693531344129aa0465cceba3c8b813e8b07b76c83c81c86e03b35f8573783f8'],
    residues: {
      'property:"tags"': [80, [85]],
      'property:"reportMetadata"': [7, [8]],
    },
  },
  {
    index: 18093,
    category: 'candidate-owner',
    owner: 'src/components/PromptInput/PromptInputFooter.tsx',
    classification: 'unresolved',
    target: [12387979, 12389987, 'FunctionDeclaration', 'aafde135f3b6d126d960f3bba6e4e4f6c30dc954f34764e3e85aafcfab25513c'],
    residues: { 'property:"columnGap"': [4, [5]] },
  },
  {
    index: 18437,
    category: 'candidate-owner',
    owner: 'src/components/FeedbackSurvey/useMemorySurvey.tsx',
    classification: 'unresolved',
    target: [12544803, 12544924, 'VariableDeclaration', '56c143bf596fc721a6d209cb80688a0fedb3d1c335cb9f3669c55aec8c685d77'],
    residues: { 'string:"tengu_velvet_moth"': [0, [1]] },
  },
  {
    index: 18543,
    category: 'candidate-owner',
    owner: 'src/cli/structuredIO.ts',
    classification: 'unresolved',
    target: [12601970, 12609877, 'ClassDeclaration', '81fd2b021a368edb91fcd5b35e1d16d730450d3a2f9a225ae4f4d06260e2bf16'],
    residues: {
      'property:"session_state"': [0, [1]],
      'property:"last_message_type"': [0, [1]],
      'property:"pending_control_requests"': [0, [1]],
    },
  },
  {
    index: 18769,
    category: 'candidate-owner',
    owner: 'src/screens/REPL.tsx',
    classification: 'unresolved',
    target: [12677937, 12734443, 'FunctionDeclaration', '955252b3b81dcac909cf723179fe71a41eb9701f3b8e224952a232149b3724a3'],
    residues: {
      'property:"useMemo"': [170, [171, 172, 173, 174, 175, 176]],
      'property:"cancel"': [97, [98]],
      'property:"useLayoutEffect"': [23, [24]],
      'property:"internal_eventEmitter"': [11, [12]],
    },
  },
  {
    index: 19026,
    category: 'candidate-owner',
    owner: 'src/skills/bundled/skillify.ts',
    classification: 'unresolved',
    target: [12861491, 12868807, 'VariableDeclaration', 'dfe8569b1cb4579502fd33ce6d7e032f91e7dce8895f20dedbb4d6808dec2415'],
    residues: {},
    largeResidues: [{
      identity: 'string:skillify-prompt',
      start: 12861500,
      end: 12868805,
      rawSha256: 'ffe1d8b4dd68e8b63fa240ec5b821772acf5f0b361a837d8cc87eb913ab36440',
      cookedSha256: 'f604e4613f221306f78e91d1c7ac5245f4a65dca8ed12c0050625c1027cbaad1',
      baselineCount: 0,
      targetOrdinal: 1,
    }],
  },
  {
    index: 19147,
    category: 'candidate-owner',
    owner: 'src/skills/bundled/claude-api/shared/model-migration.md',
    classification: 'unresolved',
    target: [13299057, 13365431, 'VariableDeclaration', 'edfdc5cfc6766f34a5e3201e9bf1c1fed4788796708652ee1e87dd232eafff40'],
    residues: { 'property:"exports"': [959, [960]] },
  },
  {
    index: 19161,
    category: 'candidate-owner',
    owner: 'src/skills/bundled/claudeApi.ts',
    classification: 'unresolved',
    target: [13368143, 13369026, 'FunctionDeclaration', 'a42e8668fec969d64043d15a00d57209dcae3dc1e9025a65a0d31dd27f203301'],
    residues: {
      'string:"\\n**Migrating to a newer model or replacing a retired model:**\\n→ Refer to `shared/model-migration.md`\\n"': [0, [1, 2]],
    },
  },
  {
    index: 19162,
    category: 'candidate-owner',
    owner: 'src/skills/bundled/claudeApi.ts',
    classification: 'unresolved',
    target: [13369026, 13369245, 'FunctionDeclaration', '21d1d55b7cf13072f5333dc2095af7227faacc044670f7eecf86b6bc589ece6c'],
    residues: { 'property:"files"': [69, [73]] },
  },
  {
    index: 19492,
    category: 'candidate-owner',
    owner: 'src/cli/update.ts',
    classification: 'unresolved',
    target: [13561603, 13576227, 'FunctionDeclaration', '7530f544a14cd245be0380534bf465d1ca3b72b9ef84e02d1459e60193df0174'],
    residues: {
      'string:"2.1.111"': [0, [105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127]],
      'string:"2026-04-16T14:23:56Z"': [0, [105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127]],
      'string:"."': [717, [718]],
    },
  },
  {
    index: 19517,
    category: 'candidate-owner',
    owner: 'src/main.tsx',
    classification: 'unresolved',
    target: [13640026, 13640668, 'FunctionDeclaration', '2f79ef1309012ae3a1b8ed151568784ef62f9b6ed54af694cb38e30cb7c829ac'],
    residues: {
      'property:"last"': [20, [21]],
      'string:"  "': [135, [136]],
    },
  },
)

const sourceFragments = new Map([
  [5186, ['rgba?:([0-9a-f]{1,4})', '^#([0-9a-f]+)$']],
  [5997, ["'settings:sortByTokens'"]],
  [8834, ["thinking: '<REDACTED>'", "data: '<REDACTED>'"]],
  [13841, ['error.status === 407', 'query_source:']],
  [14037, ['Start a new session with empty context; previous session stays on disk (resumable with /resume)']],
  [15455, ['cost_note', "'$10-$20'"]],
  [15456, ['duration_note', "'~10–20 min'"]],
  [18424, ['otherSurveyActive', 'if (otherSurveyActive)']],
  [8455, ['import { shutdownDatadog }', 'import { shutdown1PEventLogging }', 'shutdown1PEventLogging(), shutdownDatadog()']],
  [19430, ['useEffect, useState', 'useState<InstallState>']],
  [10179, ['Checking for native installer update', '/^v?\\d+\\.\\d+\\.\\d+(-\\S+)?$/']],
  [14017, ['lastRefreshMs > 0', 'lastRefreshMs = Date.now()']],
  [14217, ['killed', "'prepend'"]],
  [14529, ['Still having issues? Run /feedback to report details.']],
  [14931, ['InstalledSection', 'unifiedItems']],
  [17325, ['pluginErrors', 'plugin_errors: inputs.pluginErrors.map']],
  [17383, ['tags?: string[]', 'createCodeSession(']],
  [18093, ['PromptInputFooter', "gap={isNarrow ? 0 : 1}"]],
  [18437, ["'tengu_velvet_moth'"]],
  [18543, ['session_state:', 'last_message_type:', 'pending_control_requests:']],
  [18769, ['useLayoutEffect', 'internal_eventEmitter', 'useMemo']],
  [19026, ['# Skillify {{userDescriptionBlock}}', 'SKILLIFY_PROMPT']],
  [19147, ['# Model Migration Guide']],
  [19161, ['Migrating to a newer model or replacing a retired model:', 'shared/model-migration.md']],
  [19162, ['SKILL_FILES', 'registerClaudeApiSkill']],
  [19492, ['MACRO.VERSION', 'Update available:']],
  [19517, ['unknown command', 'Did you mean']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function walk(value, visit) {
  if (value === null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const child of value) walk(child, visit)
    return
  }
  if (typeof value.type === 'string') visit(value)
  for (const [key, child] of Object.entries(value)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
      walk(child, visit)
    }
  }
}

function literalOccurrences(source) {
  const occurrences = []
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  walk(ast, node => {
    if (node.type === 'Literal') {
      let identity
      if (node.regex) {
        identity = `regexp:${JSON.stringify(node.regex.pattern)}/${[...node.regex.flags].sort().join('')}`
      } else if (typeof node.value === 'string') {
        identity = `string:${JSON.stringify(node.value)}`
      } else if (typeof node.value === 'number') {
        identity = `number:${node.value}`
      }
      if (identity) occurrences.push({ identity, start: node.start })
    } else if (node.type === 'TemplateElement') {
      const value = node.value?.cooked ?? node.value?.raw
      if (typeof value === 'string') {
        occurrences.push({ identity: `string:${JSON.stringify(value)}`, start: node.start })
      }
    }

    const isProperty =
      (['Property', 'MethodDefinition', 'PropertyDefinition'].includes(node.type) &&
        node.computed === false &&
        node.key?.type === 'Identifier') ||
      (node.type === 'MemberExpression' &&
        node.computed === false &&
        node.property?.type === 'Identifier')
    if (isProperty) {
      const name = node.key?.name ?? node.property.name
      const start = node.key?.start ?? node.property.start
      occurrences.push({ identity: `property:${JSON.stringify(name)}`, start })
    }
  })
  return { ast, occurrences }
}

function grouped(occurrences) {
  const result = new Map()
  for (const occurrence of occurrences) {
    const values = result.get(occurrence.identity) ?? []
    values.push(occurrence.start)
    result.set(occurrence.identity, values)
  }
  return result
}

test(
  'pins every admitted target111 residue occurrence and category oracle',
  { skip: !selected || !baselinePath || !targetPath },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(sha256(baselineBytes), 'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861')
    assert.equal(sha256(targetBytes), '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0')
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const baselineOccurrences = grouped(literalOccurrences(baseline).occurrences)
    const targetOccurrences = grouped(literalOccurrences(target).occurrences)

    for (const row of rows) {
      const [start, end, nodeType, sourceHash] = row.target
      const region = structural.regions[row.index]
      assert.equal(region.classification, row.classification, `${row.index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.nodeType, region.target.sourceHash],
        row.target,
        `${row.index}: target identity`,
      )
      const targetUnit = target.slice(start, end)
      assert.equal(sha256(targetUnit), sourceHash, `${row.index}: target bytes`)
      assert.equal(literalOccurrences(targetUnit).ast.body.length, 1, `${row.index}: one ${nodeType}`)

      for (const [identity, [baselineCount, targetAddedOrdinals]] of Object.entries(row.residues)) {
        const baselinePositions = baselineOccurrences.get(identity) ?? []
        const targetPositions = targetOccurrences.get(identity) ?? []
        assert.equal(baselinePositions.length, baselineCount, `${row.index}: ${identity} baseline count`)
        const localOrdinals = targetPositions
          .map((position, ordinal) => [position, ordinal + 1])
          .filter(([position]) => position >= start && position < end)
          .map(([, ordinal]) => ordinal)
        assert.deepEqual(
          localOrdinals.filter(ordinal => ordinal > baselineCount),
          targetAddedOrdinals,
          `${row.index}: ${identity} exact target-added occurrences`,
        )
      }

      for (const residue of row.largeResidues ?? []) {
        const value = target.slice(residue.start, residue.end)
        assert.equal(sha256(value), residue.rawSha256, `${row.index}: ${residue.identity} raw hash`)
        assert.ok(residue.start >= start && residue.end <= end, `${row.index}: large residue range`)
        assert.equal(baseline.split(value).length - 1, residue.baselineCount)
        assert.equal(target.split(value).length - 1, residue.targetOrdinal)
        const declaration = literalOccurrences(targetUnit).ast.body[0]
        assert.equal(declaration.type, 'VariableDeclaration')
        assert.equal(declaration.declarations[0].init.type, 'TemplateLiteral')
        assert.equal(
          sha256(declaration.declarations[0].init.quasis[0].value.cooked),
          residue.cookedSha256,
        )
      }

      if (row.category === 'paired-local') {
        const [baselineIndex, baselineStart, baselineEnd, baselineNodeType, baselineHash] = row.baseline
        assert.equal(region.baselineUnitIndex, baselineIndex, `${row.index}: baseline pair`)
        assert.equal(region.pairReason, 'unique-coarse-structural-hash', `${row.index}: pair reason`)
        const baselineUnit = baseline.slice(baselineStart, baselineEnd)
        assert.equal(sha256(baselineUnit), baselineHash, `${row.index}: baseline bytes`)
        assert.equal(literalOccurrences(baselineUnit).ast.body[0].type, baselineNodeType)
        const baselineLocal = grouped(literalOccurrences(baselineUnit).occurrences)
        const targetLocal = grouped(literalOccurrences(targetUnit).occurrences)
        for (const identity of Object.keys(row.residues)) {
          assert.ok((baselineLocal.get(identity) ?? []).length > 0, `${row.index}: ${identity} is local`)
          assert.equal(
            (targetLocal.get(identity) ?? []).length,
            (baselineLocal.get(identity) ?? []).length,
            `${row.index}: ${identity} paired-local invariant`,
          )
        }
      }

      if (row.category === 'build-macro') {
        let macroObjects = 0
        walk(literalOccurrences(targetUnit).ast, node => {
          if (node.type !== 'ObjectExpression') return
          const fields = new Map(
            node.properties
              .filter(property => property.type === 'Property' && !property.computed)
              .map(property => [property.key.name ?? property.key.value, property.value.value]),
          )
          if (
            fields.get('VERSION') === '2.1.111' &&
            fields.get('BUILD_TIME') === '2026-04-16T14:23:56Z'
          ) {
            macroObjects += 1
          }
        })
        assert.equal(macroObjects, row.residues['string:"2.1.111"'][1].length, `${row.index}: macro objects`)
      }
    }
  },
)

test(
  'pins candidate owners, named imports, and build-macro source boundaries',
  { skip: !selected },
  () => {
    for (const row of rows) {
      const owners = row.owners ?? [row.owner]
      const contents = owners
        .map(owner =>
          fs.readFileSync(
            path.join(sourceRoot, owner.replace(/^src\//, '')),
            'utf8',
          ),
        )
        .join('\n')
      for (const fragment of sourceFragments.get(row.index) ?? []) {
        assert.ok(contents.includes(fragment), `${row.index}: ${owners.join(',')}: ${fragment}`)
      }
      if (row.category === 'build-macro') {
        assert.ok(contents.includes('MACRO.'), `${row.index}: authored macro reference`)
      }
    }
  },
)

test('coverage uses matrix evidence for exactly the pinned rows', () => {
  const coverage = JSON.parse(
    gunzipSync(
      fs.readFileSync(path.join(caseRoot, 'semantic/source-coverage.json.gz')),
    ),
  )
  const matrixEvidence = new Set([...CANDIDATE_EVIDENCE, ...STATIC_EVIDENCE])
  const expected = new Set(rows.map(row => row.index))
  const covered = new Set()

  for (const coverageRow of coverage.rows) {
    const used = coverageRow.evidenceIds.filter(id => matrixEvidence.has(id))
    if (used.length === 0) continue
    assert.ok(expected.has(coverageRow.targetIndex), `${coverageRow.targetIndex}: unlisted evidence reuse`)
    const row = rows.find(candidate => candidate.index === coverageRow.targetIndex)
    assert.deepEqual(
      used,
      row.category === 'candidate-owner' ? CANDIDATE_EVIDENCE : STATIC_EVIDENCE,
      `${row.index}: category evidence`,
    )
    const owners = row.owners ?? [row.owner]
    assert.deepEqual(
      coverageRow.ownerIds,
      owners.map(owner =>
        `owner-${owner.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
      ),
      `${row.index}: exact owner`,
    )
    covered.add(row.index)
  }
  assert.deepEqual(covered, expected)

  const catalog = new Map(coverage.evidence.map(item => [item.id, item]))
  assert.equal(catalog.get(CANDIDATE_EVIDENCE[0]).kind, 'target-fragment')
  assert.equal(catalog.get(STATIC_EVIDENCE[0]).kind, 'static-ast')
  assert.equal(catalog.get(CANDIDATE_EVIDENCE[1]).kind, 'semantic-test')
  for (const id of matrixEvidence) {
    assert.equal(
      catalog.get(id).path,
      'recovery/test/recovery-2.1.111-target-added-residue-matrix.test.mjs',
      `${id}: exact proof path`,
    )
  }
})
