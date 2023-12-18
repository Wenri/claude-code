import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.107-to-2.1.108'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const historical = semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_107_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_108_BUNDLE
const caseRoot = path.join(repositoryRoot, 'recovery/cases', caseName)

const compressedJson = relative =>
  JSON.parse(gunzipSync(fs.readFileSync(path.join(caseRoot, relative))))
const compressedLines = relative =>
  gunzipSync(fs.readFileSync(path.join(caseRoot, relative)))
    .toString('utf8')
    .trimEnd()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line))
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')

const structural = compressedJson('structural/generated-delta.json.gz')
const coverage = compressedJson('semantic/source-coverage.json.gz')
const coverageOwners = new Map(
  coverage.owners.map(owner => [owner.id, owner.path]),
)
const sources = new Map(
  compressedLines('attribution/sources.jsonl.gz').map(row => [
    row.sourceIndex,
    row.source,
  ]),
)
const partitions = compressedLines('attribution/target-partitions.jsonl.gz')
const initializers = compressedLines('attribution/target-initializers.jsonl.gz')

const units = new Map([
  [2073, ['src/utils/log.ts', 875073, 875208, 'VariableDeclaration', '88d1c6da7a4ac685db98fd3058ba2bd8ac6af0ad292ee5ceacccbd459b2c82e5', 'changed']],
  [2590, ['src/utils/permissions/permissionRuleParser.ts', 1044922, 1045063, 'VariableDeclaration', 'c626f7bd6ea0e2665fa940a1155ca28faa4d546ab9b0e2a43660f05de541136f', 'changed']],
  [2609, ['src/utils/settings/schemaOutput.ts', 1072063, 1072151, 'FunctionDeclaration', 'afb6a576940a2deeb647d1da93fdeeeb8c9b6a562a6dea1427524feafeaf3875', 'unresolved']],
  [3098, ['src/utils/model/modelStrings.ts', 2314677, 2314838, 'VariableDeclaration', 'a14b383392d5d230ec7898813af18c8203d9f1fc40943408946fc570910b865a', 'changed']],
  [3110, ['src/services/mockRateLimits.ts', 2315736, 2315788, 'VariableDeclaration', 'ef84fcc918cd3c73cf7406f7a321059c60c18568b504385306debb76c23e138e', 'unresolved']],
  [4644, ['src/utils/auth.ts', 3506047, 3506074, 'FunctionDeclaration', '94150e4755aed25c7c8f59701fe21a35e2be80dcb54ddd8fa4cde7b1000cbcc0', 'changed']],
  [5017, ['src/memdir/paths.ts', 3730403, 3731405, 'VariableDeclaration', 'c1cfec7035a264eca286d74acbde29ec29ff81d6062a92d1835654c5239a542f', 'unresolved']],
  [5116, ['src/utils/pdfUtils.ts', 3759230, 3759273, 'VariableDeclaration', '9743dbd573aa5ac7ba78a08f23844ea5ffaf408aa3563a232064fe06bf07ff05', 'changed']],
  [5129, ['src/tools/REPLTool/constants.ts', 3762684, 3762713, 'VariableDeclaration', '2dcfe5c18df88d8a36b0a016cc56a8a74f617fbba0d12fd2e14baf542d6f1f75', 'unresolved']],
  [5251, ['src/utils/earlyInput.ts', 3810753, 3811425, 'FunctionDeclaration', 'b2174dbd56b106c072173fe0b4c137e3e11f17f6bc1d90caa94c6e8d8c9a4e05', 'unresolved']],
  [5864, ['src/components/MessageResponse.tsx', 4189029, 4189115, 'VariableDeclaration', 'e4a213c10a7faa0bc02d0be040340464782950570500c82265e3ccfdf49e0125', 'changed']],
  [6090, ['src/utils/plugins/addDirPluginSettings.ts', 4361116, 4361187, 'VariableDeclaration', '4df0d92e68249ce78260d5cbc303dcbb1ef60df0201e3eb1634744b42372a066', 'changed']],
  [6768, ['src/tools/AgentTool/built-in/exploreAgent.ts', 4964380, 4964587, 'VariableDeclaration', '2a6bf28cd14f9bd727ce19a6fbb45355ef0f7ad7de34b4b82822366106cbd4c8', 'changed']],
  [6951, ['src/services/api/promptCacheBreakDetection.ts', 5028274, 5028462, 'FunctionDeclaration', 'ecde0e7d1b3b9abd1bcac0a81270b436480e49ffa2eefcfdd2ff04a247442ca8', 'unresolved']],
  [6964, ['src/services/api/promptCacheBreakDetection.ts', 5037199, 5037346, 'VariableDeclaration', '526544d20e8727b60d95cb30aafb9b77fede89a299fd05fe5b85e65bdb5e213e', 'unresolved']],
  [7218, ['src/services/api/withRetry.ts', 5153622, 5153775, 'VariableDeclaration', 'b0c83e11c794f5e2a7bbbee321187d86b002175ff5d8bd3a9ca3157a0291959b', 'changed']],
  [8635, ['src/context/overlayContext.tsx', 6638746, 6638822, 'VariableDeclaration', 'ec2da25b18777677437ee922dc6568e8d1646ce129cd84011696ec99c19ad3a2', 'changed']],
  [8681, ['src/utils/computerUse/computerUseLock.ts', 6667657, 6667766, 'VariableDeclaration', '67cedf4324374e419737edbe459f8bc6c500f6167b3ee97cde7214897cfabc35', 'changed']],
  [8805, ['src/services/diagnosticTracking.ts', 6723689, 6723789, 'VariableDeclaration', 'a23e796f261c3d9e22286db330afec39df689484dffc0be1123826138bb1a975', 'changed']],
  [9129, ['src/utils/commitAttribution.ts', 6880570, 6880806, 'VariableDeclaration', '253a75cf70e6d46519ec32359b5d4ab3a781c2961a1a99eeb2a7706a3718c89b', 'unresolved']],
  [9490, ['src/components/CustomSelect/use-multi-select-state.ts', 7032552, 7033517, 'VariableDeclaration', 'f5ebd7a5a2b8893c73c967f017b4444fc565f676ded2d21803b25fd6697040c6', 'changed']],
  [9506, ['src/utils/managedEnvConstants.ts', 7041588, 7041676, 'FunctionDeclaration', '90466d0393221c1f0a1c6a9d67fd001f7344f06c2673a48461172448ae988796', 'changed']],
  [10172, ['src/utils/activityManager.ts', 8084429, 8084471, 'VariableDeclaration', '4f7359823fd741b37c67ce91a75c93caf92fe5ecd255eed5a745ab5fb7d52405', 'changed']],
  [10209, ['src/utils/tasks.ts', 8092929, 8093399, 'VariableDeclaration', 'ad5f75c105f380cfaf7c8efaca3e295148b5ba88d2850a07697bbe576cc743e4', 'unresolved']],
  [10219, ['src/hooks/useTasksV2.ts', 8098471, 8099859, 'ClassDeclaration', 'e851d4072a7e83d5ec25fb1b84b0d835de958242def86b47dd11d91f38e916d5', 'unresolved']],
  [10235, ['src/components/Spinner/GlimmerMessage.tsx', 8104576, 8104659, 'VariableDeclaration', 'd891b98f1fe7ab38c4f2a2f998aeb85de8cd057274ed59f193be3bb1d1ea9b0a', 'changed']],
  [10241, ['src/components/Spinner/SpinnerGlyph.tsx', 8105866, 8105984, 'VariableDeclaration', 'e59e88138aa3573b04df0b5592d04c888626e6eb8db91389d6f0d11da5a4ba95', 'changed']],
  [10338, ['src/utils/teammateMailbox.ts', 8162443, 8163472, 'VariableDeclaration', '24399a55d2bbd565fe7c632603fe61d42d63a42eaa7b82808abd9e2ecfed22c6', 'changed']],
  [10342, ['src/utils/permissions/PermissionUpdateSchema.ts', 8163643, 8164376, 'VariableDeclaration', 'e15db9b97821991da6bb20e37036520b7212552f02b1be0ccc439584e7725d1c', 'changed']],
  [11231, ['src/tasks/RemoteAgentTask/RemoteAgentTask.tsx', 8540453, 8540670, 'VariableDeclaration', '94b370ad7ebbe47908d0bd83e89bfd5ed815f602f52587b324cfa3e09f645e6e', 'changed']],
  [11365, ['src/components/HighlightedCode/Fallback.tsx', 8625473, 8626817, 'VariableDeclaration', 'f9d810393c3c096caec291a24ddee0373671abdbff2c2889074cdb593801ac5d', 'changed']],
  [11422, ['src/utils/plugins/orphanedPluginFilter.ts', 8647036, 8647063, 'VariableDeclaration', '6f70c509f83d7fafe03aab572411b43bba96146996f745d2b2d47cfe7508c537', 'unresolved']],
  [11850, ['src/tools/EnterPlanModeTool/EnterPlanModeTool.ts', 9060337, 9063013, 'VariableDeclaration', 'cd7cf26fc51a22f37bf536ed1b9e4403c4b58389e801e0ae14d86994c4b7ccf1', 'unresolved']],
  [11986, ['src/tools/ScheduleCronTool/UI.tsx', 9117302, 9119924, 'VariableDeclaration', 'e8b867de8d17506f1b19cc3b7b595637a12b0f0f7600b05ca33f375585a1dfc1', 'changed']],
  [12082, ['src/tools.ts', 9166236, 9166807, 'FunctionDeclaration', '82749334a2679fafce708f6429e4c9ac30c2049f09323eef387bf69e57d58c6c', 'unresolved']],
  [12086, ['src/tools.ts', 9167701, 9168191, 'VariableDeclaration', '9cbe251c9ca5caffff74477f4708256193921eb5158a1a3925f795341257a669', 'unresolved']],
  [12367, ['src/tools/SendMessageTool/SendMessageTool.ts', 9328798, 9329855, 'FunctionDeclaration', '897a1bb9dabbd7b686f1738e088d83932aacb7b38024a8354f93f8a6fe23a386', 'unresolved']],
  [13596, ['src/context/notifications.tsx', 9950869, 9950986, 'VariableDeclaration', '23df5d59de5240c2305c07912942a1c4008abf07f91ff2c45dc18d2d38fcd05a', 'changed']],
  [13738, ['src/utils/suggestions/directoryCompletion.ts', 10003087, 10003190, 'VariableDeclaration', '6e63b943ce885e77d2b754fc1f03ee9deb3c65c1f2ff7c7d3ca14c0fbc1ad1ef', 'changed']],
  [13769, ['src/bridge/debugUtils.ts', 10014938, 10015118, 'VariableDeclaration', '129a82b8b62bce958b575765ed9a108b22839d0cd4afba0d05d3d0f57412c443', 'changed']],
  [15121, ['src/components/LogoV2/ChannelsNotice.tsx', 10949429, 10949516, 'VariableDeclaration', '6e6e403dfe82b40b3c9dfacadcf430f9fa47a8cd9b374d4671fcb337ed5450a4', 'changed']],
  [15156, ['src/components/MessageRow.tsx', 10969980, 10970082, 'VariableDeclaration', '39ddff408381746a3ad8da3c04be40e28b02ebea73b33327b804f259d4329227', 'changed']],
  [16182, ['src/bridge/envLessBridgeConfig.ts', 11431143, 11432221, 'VariableDeclaration', 'd5f7f743db5e9b97bc8bc0e8950da84adfdd7e05f91b257191ec5652f3c07718', 'changed']],
  [17138, ['src/cli/transports/SSETransport.ts', 11949912, 11949992, 'VariableDeclaration', '007b28d6b88ca2be0a3f9bd0514622f3ceb8f05f5b20f601bb41b37fb24ed613', 'unresolved']],
  [17194, ['src/components/MessageSelector.tsx', 11993529, 11993649, 'VariableDeclaration', 'f6660240df544c7eb95f972916ee9dbc7c88ece9cf56d0cb0b81c4d1d90c4e14', 'changed']],
  [17214, ['src/components/permissions/AskUserQuestionPermissionRequest/PreviewBox.tsx', 12006865, 12007043, 'VariableDeclaration', '20e3d7ac88837d8112c915717827688af2c990fbd4d578955f76c6225cd082ca', 'changed']],
  [17388, ['src/components/permissions/FilePermissionDialog/usePermissionHandler.ts', 12079504, 12079603, 'VariableDeclaration', '6606876a2cbfb15a5b5f487fd025460a2e5e12a9c1133f36282111f6ec65ac8f', 'changed']],
  [17444, ['src/components/permissions/FileEditPermissionRequest/FileEditPermissionRequest.tsx', 12122811, 12123088, 'VariableDeclaration', '389d0fa27451e7d101a79193a50ff26b6d92297580b0c41b676d131e61c847fd', 'changed']],
  [17864, ['src/hooks/usePrStatus.ts', 12299759, 12299860, 'VariableDeclaration', '5c7b2e94fd3898bf45feb5f637908137da48e6b0e6ed39c787396a84a108fadc', 'changed']],
  [17879, ['src/components/PromptInput/PromptInputQueuedCommands.tsx', 12309814, 12309972, 'VariableDeclaration', 'c46fb2ba7f31e3c3d94ca36abaebae56db450ebdc979b5ab0a8525073c98c3e0', 'changed']],
  [18219, ['src/components/FeedbackSurvey/usePostCompactSurvey.tsx', 12464021, 12464152, 'VariableDeclaration', 'b42198a5a8f645f0675ebd8e0013376c08dee6364c3cbee323f62dd68a689912', 'changed']],
  [18525, ['src/screens/REPL.tsx', 12590708, 12590828, 'VariableDeclaration', '20225c7147e5de585d01dd8253d3bdb1783b6860cfeda013b667f265da743b21', 'changed']],
  [18627, ['src/components/TrustDialog/utils.ts', 12692535, 12692634, 'FunctionDeclaration', 'faf309f8c287db24b65445ef683beaf7f618dc2e406aa107cd632885beffd333', 'changed']],
  [18946, ['src/cli/exit.ts', 13213757, 13213975, 'FunctionDeclaration', '3f63b07f2a6eee3f1b129e0767fbadcdf87600ca8ff56b729c4886ad1bb86bd0', 'unresolved']],
  [19107, ['src/cli/print.ts', 13295257, 13296693, 'FunctionDeclaration', '6262bbc6fad637188ca10d16741578bc485417a905a9a0609589c7c4b3234820', 'unresolved']],
])

function normalizeSource(source) {
  if (typeof source !== 'string') return null
  const marker = source.lastIndexOf('/src/')
  if (marker >= 0) return source.slice(marker + 1)
  return source.startsWith('src/') ? source : null
}

function candidatePaths(region) {
  const indexes = new Set()
  for (const partition of partitions) {
    if (
      partition.target.offsetStart >= region.target.end ||
      partition.target.offsetEnd <= region.target.start
    ) continue
    for (const index of [
      partition.attributedSourceIndex,
      ...(partition.sourceCandidates ?? []),
      ...(partition.relocatedSourceCandidates ?? []),
    ]) {
      if (Number.isInteger(index)) indexes.add(index)
    }
  }
  const initializer = initializers.find(
    item =>
      item.regionStart <= region.target.start &&
      region.target.start < item.regionEnd,
  )
  for (const vote of initializer?.sourceVotes ?? []) indexes.add(vote.value)
  return new Set(
    [...indexes]
      .map(index => normalizeSource(sources.get(index)))
      .filter(Boolean),
  )
}

test(
  'target108 pins every corrected owner unit and its source-map candidacy exactly',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetPath
        ? 'authenticated target108 bundle is required'
        : false,
  },
  () => {
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(targetBytes),
      'dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73',
    )
    const target = targetBytes.toString('utf8')
    assert.equal(units.size, 55)
    for (const [index, identity] of units) {
      const [ownerPath, start, end, nodeType, sourceHash, classification] =
        identity
      const region = structural.regions.find(item => item.target?.index === index)
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
          region.classification,
        ],
        [start, end, nodeType, sourceHash, classification],
        `${index}: structural identity`,
      )
      assert.equal(sha256(target.slice(start, end)), sourceHash, `${index}: bytes`)
      assert.ok(candidatePaths(region).has(ownerPath), `${index}: ${ownerPath}`)
      const row = coverage.rows.find(item => item.targetIndex === index)
      assert.equal(
        row?.ownerIds[0],
        `owner-${ownerPath.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
      )
      assert.equal(row?.ownerIds.length, 2)
      assert.deepEqual(row?.evidenceIds, [
        'target108-owner-corrections-target-fragment',
        'target108-owner-corrections-semantic-test',
      ])
      for (const ownerId of row.ownerIds) {
        const relative = coverageOwners.get(ownerId)
        assert.ok(relative, `${index}: ${ownerId}`)
        assert.equal(
          fs.statSync(path.join(sourceRoot, relative.slice(4))).isFile(),
          true,
        )
      }
    }
  },
)

test(
  'corrected target108 owners contain every prior owner-local cooked residue',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !historical
        ? false
        : !baselinePath || !targetPath
          ? 'authenticated target107 and target108 bundles are required'
          : false,
  },
  () => {
    if (!historical) {
      for (const [, [ownerPath]] of units) {
        assert.equal(fs.statSync(path.join(sourceRoot, ownerPath.slice(4))).isFile(), true)
      }
      return
    }
    const scanner = path.join(
      repositoryRoot,
      'recovery/scripts/inspect-semantic-literal-gaps.mjs',
    )
    const result = spawnSync(
      process.execPath,
      [
        scanner,
        '--baseline',
        baselinePath,
        '--target',
        targetPath,
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
      { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    )
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const report = JSON.parse(result.stdout)
    const residueIndexes = new Set(
      report.sourceRuntimeOwnerResidueRows.map(row => row.structural.index),
    )
    assert.deepEqual(
      [...units.keys()].filter(index => residueIndexes.has(index)),
      [],
    )
  },
)
