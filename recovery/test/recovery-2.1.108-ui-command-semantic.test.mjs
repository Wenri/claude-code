import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.107-to-2.1.108'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_107_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_108_BUNDLE
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_107_BUNDLE and CLAUDE_CODE_2_1_108_BUNDLE are required'
      : false,
}
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

const units = new Map([
  [13895, [10063005, 10063235, 'd38881fa11f05b09732fadc2c8df882f17c925bc71c495965714fbf116e236e8']],
  [13985, [10097158, 10097371, '2fbb608e9b421cbdb98e4931097d3797eb8319907aa9c0ceee877821f20ad7ca']],
  [13986, [10097371, 10097493, '699157e1544f3e55d9654cff1d93c802f8b3e8ed342eb51143a9bf062d303e57']],
  [13987, [10097493, 10097626, '58ce4fdcb7e9e509621188f9f47e1d839b558c624cb5b56ca85239c20dbedd3b']],
  [13988, [10097626, 10097739, '9a717675d62578f36f0d0198114f4c749be7c44365cc365bf2f51f2f782c27a0']],
  [13989, [10097739, 10097773, '08a7fc3687810f6d57901edd30605e86de132b402b8cd42b430d5ea2f0079220']],
  [13990, [10097773, 10098330, 'ec5ac3a1e298c5e86ca14456554acae6aabd3293a7d6c9488a867db77155ce7b']],
  [13991, [10098330, 10098669, '68ba5a749fb80d62518fa8d2fbffaa7e6918c43f56aac19708ff3bbce9e9e4ea']],
  [13992, [10098669, 10099002, '6133eeb3465b94446efbbe61eafd9f0d013989d0421b6b6ead0d0ccc7d506976']],
  [13993, [10099002, 10099893, '95553f0f6a1a3f90d38bf324bc098ec014d74e30b658dbac68133b057fc21db5']],
  [13994, [10099893, 10099931, '9e36f3cc74add9295c90f1ce20f5d53f2fa37f7f2b9bcd834a7fa3afcebb64dc']],
  [13995, [10099931, 10100124, '5388e71e6ea33d2b515488f69a6783c53d2765e3fac0a020d33a05850c224d7f']],
  [13996, [10100124, 10100982, '48571ee4022f506719d2321496f8037039da56eea5bbc2dffaeaf2f42ef21c0f']],
  [13997, [10100982, 10101128, 'bed7aaf035e3986efb21ae0a55c46535ce4c9340becbcb7f315d09df80db19d7']],
  [13998, [10101128, 10102273, '4d351cd47fbaf5ba90383d85dbae304d18214e58b8e6813ab600b1cd62f6a328']],
  [13999, [10102273, 10102305, '4737c968598d418c2a8cc8d253fdd243b1cd10269d356dfe5ec782b9d3cfc1fe']],
  [14000, [10102305, 10102346, 'a126856e0ec329e44629a5b5f762f39b41cca3fb3baad1474934a3db999a753e']],
  [14001, [10102346, 10102407, '5658077287f6b616c7d4b4f687aebf7e9d8c2128f8686a7bd62f1db099fa4208']],
  [14002, [10102407, 10102427, 'c0db957f54b4905a40be27a168cca506206fc74bedb6c52d1b60ce2029f2dc31']],
  [14003, [10102427, 10102578, 'eecaabc33cbb93d8cfaa88147bad85d1176269c10f6d1b6771ad15b2686b750b']],
  [14004, [10102578, 10103118, '8aa53c62cac9281ea62ac971e672d0183d824426416f723c3a99b55db06b968d']],
  [14527, [10557461, 10562659, 'c40e1fe7e5925a0de9bf3f40e757867139eee2649b676fab06c45d2eb241a782']],
  [14560, [10585923, 10588270, '270080bbab69b202305c8cbda89dc5311fdaa378ade65b9946d0fcb642d3fbfd']],
  [14648, [10651628, 10655328, '7f2c84ac7a0923561b9aa0162a1c8fbd04d327f3d8c1d2d8e38f9c4c23f09988']],
  [15137, [10962946, 10963931, '4c8174f0b9ef8f3768cb5a03335cf8c67843b24269ab4fa4d51504458904edaf']],
  [15287, [11043665, 11044540, 'cccecd59b4df9559c50d634bdf3c5b156e4bad45c465057d18e38f9e0f0d5c56']],
  [15289, [11044548, 11044942, '63c0eb2ba4b3cc0dd69d5b94132f9d5ade7351c3b61b5d7c9af72a860e6773f9']],
  [15291, [11044964, 11045571, 'b41044ffd1fd408e5c1135c8c053c5f4847ead9f356ee35eb250646dfec0f66f']],
  [15292, [11045571, 11048220, 'ad0c0b8193f76fdc1756618d1a98df7ec9c17b95abb0945dd8c332bca29074d8']],
  [15346, [11072239, 11072337, '4d8fb8fe1401ba55ab58244dacb2d2db16c445c99cd0f93731024cc379b27f4c']],
  [15347, [11072337, 11073570, '19e4c0ebb0714b750404b79f3e98df48eba0fd33dee0134f98fd0050c2ccf694']],
  [15348, [11073570, 11073655, 'aa0122f79f6c91f7d2714c6bc274087385a5a80d03195f6c12be0dff8bbcb06b']],
  [15350, [11073682, 11073733, '827bf337937a37931c172c5559c16769dd31eabe21624524c24a81ad4f508681']],
  [15351, [11073733, 11075179, '768d9d69e2a1c6df837fd0ebdb4913b42bcb487bfb79816404c7b0da70136355']],
  [15353, [11075186, 11075265, '4308bf81ac04febc8864ec9d365d6bf7abadcda9b9292521703970d8d4f6af3a']],
  [15355, [11075276, 11075299, '8f7d593b3038b86cd18ee57117f361bbf5103b645d44a0d43fda11178ff96ace']],
  [15357, [11075386, 11075828, 'b944ed1360cf8d9edb3ad3dc0e6641b29af85a31f542ce9a0733ed302c8ee6f2']],
  [15358, [11075828, 11076459, '1259f6cfb21fc07ba42f43fdb42c522fbdff3fa569d426cf862a910c9182d7d8']],
  [15359, [11076459, 11076514, '43bb74cd5aaad52abbee13f8036d02dba4c8d6b4af964fb7fa78cfcfe7ce12be']],
  [19236, [13392658, 13394057, '746bb9f61025e1b5e9611c771a627f58f1afc1d96b258b33a5050d191f116315']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function assertFragments(relative, fragments) {
  const contents = source(relative)
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
  }
  return contents
}

test('target 2.1.108 pins the complete recovered UI and command graph', bundleOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baseline),
    '6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844',
  )
  assert.equal(
    sha256(targetBytes),
    'dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73',
  )
  const target = targetBytes.toString('utf8')
  for (const [index, [start, end, sourceHash]] of units) {
    const region = structural.regions[index]
    assert.ok(
      ['unresolved', 'changed'].includes(region.classification),
      `${index}: classification`,
    )
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(target.slice(start, end)), sourceHash, `${index}: bytes`)
  }
})

test('source owns the full reusable table algorithm and MCP reachability', sourceOptions, () => {
  const table = assertFragments('src/components/design-system/Table.tsx', [
    "export type TableBoxStyle = 'grid' | 'simple' | 'minimal' | 'plain'",
    'return 3 * columnCount + 1',
    'return 3 * columnCount - 1',
    'node.map(getTextContent).join',
    'stringWidth(getTextContent(node))',
    'const ratioColumns: number[] = []',
    'Math.floor((remainingWidth * (width.ratio ?? 0)) / totalRatio)',
    "type: 'top' | 'header' | 'bottom'",
    "['┌', '┬', '┐']",
    "['└', '┴', '┘']",
    "['├', '┼', '┤']",
    "justifyContent={ALIGNMENT[column.align ?? 'start']}",
    "box: boxProp = 'plain'",
    'React.Children.toArray(children)',
    'export const Table = Object.assign(TableComponent, { Row })',
  ])
  assert.ok(table.indexOf('calculateWidths(') < table.indexOf('function RenderRow('))

  assertFragments('src/components/mcp/MCPStdioServerMenu.tsx', [
    "import { Table } from '../design-system/Table.js'",
    '<Table box="plain"',
    "columns={[{ bold: true }, {}]}",
    '<Table.Row>',
    '<>Command:</>',
    '<>Args:</>',
    '<>Config location:</>',
  ])
})

test('source owns GitHub workflow/success and prompt-cache warning output', sourceOptions, () => {
  const clearCommand = source('src/commands/clear/index.ts')
  if (semanticCase === caseName) {
    assert.ok(
      clearCommand.includes(
        "description: 'Start fresh: discard the current conversation and context'",
      ),
    )
  } else {
    assert.ok(
      clearCommand.includes('Start fresh: discard the current conversation and context') ||
        clearCommand.includes('Start a new session with empty context'),
    )
  }
  assertFragments('src/constants/github-app.ts', [
    'Add Claude Code GitHub Workflow',
    'uses: anthropics/claude-code-action@v1',
    "plugins: 'code-review@claude-code-plugins'",
    "prompt: '/code-review:code-review \\${{ github.repository }}/pull/\\${{ github.event.pull_request.number }}'",
  ])
  assertFragments('src/commands/install-github-app/SuccessStep.tsx', [
    "import { StatusIcon } from '../../components/design-system/StatusIcon.js'",
    '<StatusIcon status="success" withSpace />',
    'GitHub Actions workflow created!',
    'Using existing ANTHROPIC_API_KEY secret',
    'API key saved as {secretName} secret',
  ])
  assertFragments('src/components/LogoV2/LogoV2.tsx', [
    'DISABLE_PROMPT_CACHING_HAIKU',
    'DISABLE_PROMPT_CACHING_OPUS',
    'DISABLE_PROMPT_CACHING_SONNET',
    'Prompt caching disabled via',
    'This will impact latency and token costs.',
    'We highly recommend disabling',
  ])
})

test('auto-mode handlers render through an Ink root and main supplies that root', sourceOptions, () => {
  assertFragments('src/cli/handlers/autoMode.ts', [
    'function RenderOnceAndExit',
    'const timer = setTimeout(exit, 0)',
    'async function renderAndExit(root: Root',
    'await root.waitUntilExit()',
    'autoModeDefaultsHandler(root: Root)',
    'autoModeConfigHandler(root: Root)',
    'autoModeCritiqueHandler(',
    "'Analyzing your auto mode rules…'",
    "cliError(chalk.red('Failed to analyze rules: ' + errorMessage(error)))",
    'await renderAndExit(root, output)',
  ])
  const main = assertFragments('src/main.tsx', [
    "program.command('auto-mode')",
    "import('./cli/handlers/autoMode.js')",
    "import('./cli/handlers/util.js')",
    'autoModeDefaultsHandler(await createSubcommandRoot())',
    'autoModeConfigHandler(await createSubcommandRoot())',
    'autoModeCritiqueHandler(await createSubcommandRoot(), options)',
  ])
  assert.ok(
    main.indexOf("program.command('auto-mode')") <
      main.indexOf('autoModeCritiqueHandler(await createSubcommandRoot(), options)'),
  )
})

test('source owns preflight, launch, billing, and one-time terms control flow', sourceOptions, () => {
  assertFragments('src/services/api/ultrareviewQuota.ts', [
    'CLAUDE_CODE_ULTRAREVIEW_PREFLIGHT_FIXTURE',
    "action: z.enum(['proceed', 'confirm', 'blocked'])",
    'isEssentialTrafficOnly()',
    "reason: 'zdr'",
    "reason: 'no_oauth_token'",
    '/v1/ultrareview/preflight',
    'timeout: 5000',
    'fetchUltrareviewPreflight schema mismatch:',
  ])
  const remote = assertFragments('src/commands/review/reviewRemote.ts', [
    "case 'blocked':",
    "case 'confirm':",
    "kind: 'needs-confirm'",
    'checkRemoteAgentEligibility()',
    'Ultrareview cannot launch:',
    'BUGHUNTER_FLEET_SIZE',
    'BUGHUNTER_TOTAL_WALLCLOCK',
    "source: 'ultrareview'",
    "branchName: `refs/pull/${",
    'useBundle: true',
    "remoteTaskType: 'ultrareview'",
    'tengu_review_remote_launched',
  ])
  assert.ok(remote.includes('prepareRemoteReviewScope(') || remote.includes('args.trim()'))

  const dialog = assertFragments('src/commands/review/UltrareviewOverageDialog.tsx', [
    'hasSeenUltrareviewTerms',
    'This will try to clone your git remote and fall back to uploading this repository.',
    'Finds and verifies bugs',
    'https://code.claude.com/docs/en/claude-code-on-the-web',
    'Run ultrareview in the cloud?',
    "description: 'launch in Claude Code on the web'",
    'abortControllerRef.current.abort()',
  ])
  assert.ok(
    dialog.includes("checkGate_CACHED_OR_BLOCKING('tengu_ccr_bundle_seed_enabled')") ||
      dialog.includes('getRemoteSourceViability'),
    'Ultrareview source viability remains reachable through the local target108 helper or the shared target116 helper',
  )
  assertFragments('src/commands/review/ultrareviewCommand.tsx', [
    "gate.actionUrl?.includes('/admin-settings/')",
    'extraUsage.isEnabled()',
    '!hasClaudeAiBillingAccess()',
    'Run /extra-usage to request this from your admin.',
    'Findings will arrive via task-notification.',
    "onDone('Ultrareview cancelled.'",
  ])
})
