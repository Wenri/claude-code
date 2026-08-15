import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_109_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
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
  [11484, [8671843, 8677480, 'VariableDeclaration', 'cb877e351af6363fb6b794d793ca333533238da28cd8016aa55bbb3f435e6263', 'unresolved']],
  [13283, [9771883, 9790311, 'VariableDeclaration', 'b06b080f01e6aa9ec1cfa2c9b3cfef160ffb5103669e37cf706c29269e92bc4a', 'unresolved']],
  [13307, [9799684, 9805885, 'VariableDeclaration', 'c6bc661bee75bfaf4ac313e6b71dac37c617ada8380d06d3b94047b941dde269', 'changed']],
  [14748, [10694908, 10698237, 'FunctionDeclaration', '5871ae659b424255d898a9bd22d3d597912ff8c668c5085f6c2538bf04812414', 'unresolved']],
  [15245, [10998702, 11007397, 'FunctionDeclaration', '4690b6699da52907ba67897f8f752d0913b2524a28e350e9c000a00f4d7f55b7', 'unresolved']],
  [16213, [11461080, 11461154, 'FunctionDeclaration', 'bcc660c11400b9e4ba9002fdee3eeba75ad136a060733c48284de96b8aef41af', 'unresolved']],
  [16216, [11461197, 11461502, 'VariableDeclaration', '39ed8c28625b9aa1710f944633f12cb280e9210b7a316ae03b5c9e02ab3496cb', 'unresolved']],
  [17267, [11991689, 11991959, 'FunctionDeclaration', '2cd7543b8b76d478b870e98cde7678b81790d22d266f3931b8367bdc7d615ac9', 'unresolved']],
  [17303, [12019081, 12021272, 'FunctionDeclaration', 'fa2cbdd3995f4aa0c46c3b34301df83712f0be108695d3f5b9212472c7b3498b', 'unresolved']],
  [18075, [12377726, 12403876, 'FunctionDeclaration', 'e2baf5f26fa58c1d362f382437699f9d55879126d701e336ddc84418cd6db886', 'unresolved']],
  [18460, [12554132, 12565535, 'VariableDeclaration', 'e32edeb2265a98f230074348afb9067014f8f23c06c7b94fb2da325e4dad7195', 'unresolved']],
  [19132, [13288752, 13288875, 'VariableDeclaration', '1be5367d82c77c3a0c625d41dae73e64886a653e6cbdd9287b9279c9212edd93', 'changed']],
  [19223, [13310682, 13312141, 'VariableDeclaration', '0da8b6fa18fec978e5a64d5c61714030f9fc64fab89015a802e3a579ca0a5959', 'changed']],
  [19240, [13328308, 13330829, 'VariableDeclaration', 'bb665752ad7207c2979966897fd3cdeb556ae4ae44b13c982d1a10d569ef1c19', 'changed']],
  [19247, [13331446, 13334471, 'VariableDeclaration', 'a227a6cad9c5600dad7b53749d31bbe0a77aa83d821a4e238a0d95070c2ca538', 'changed']],
  [19253, [13335773, 13337417, 'FunctionDeclaration', '8eec37129f19f9d324e0cc2c5c90682889ff6e6cd2c56c00524437a206d14304', 'unresolved']],
  [19262, [13355330, 13356702, 'FunctionDeclaration', '1f23a8bcfc45fe4eedb10ebc0b456df7556b1113c7facc84154cbde7f5c37c60', 'unresolved']],
  [19383, [13444854, 13448091, 'FunctionDeclaration', 'cae9b10d341f5e9353f0205a7df40b0d511933af1eff8645bfdf5a31aad88fc8', 'changed']],
])

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const source = relative =>
  fs.readFileSync(path.join(sourceRoot, relative), 'utf8')

function assertFragments(relative, fragments) {
  const contents = source(relative)
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
  }
}

test(
  'target110 pins every added owner-residue structural unit exactly',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated target109 and target110 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7',
    )
    assert.equal(
      sha256(targetBytes),
      'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
    )
    const target = targetBytes.toString('utf8')
    for (const [index, identity] of units) {
      const region = structural.regions[index]
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
          region.classification,
        ],
        identity,
        `${index}: identity`,
      )
      assert.equal(
        sha256(target.slice(identity[0], identity[1])),
        identity[3],
        `${index}: target bytes`,
      )
    }
    assert.deepEqual(
      [...units.keys()],
      [
        11484, 13283, 13307, 14748, 15245, 16213, 16216, 17267,
        17303, 18075, 18460, 19132, 19223, 19240, 19247, 19253,
        19262, 19383,
      ],
    )
  },
)

test(
  'authored target110 owners preserve the complete added-residue behavior',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    assertFragments('tools/FileWriteTool/FileWriteTool.ts', [
      'True when the user edited the proposed content in the permission dialog before accepting',
      'toAutoClassifierInput(input)',
      "input1.content.replace(/\\n+$/, '')",
      'The user modified your proposed content before accepting it.',
    ])
    assertFragments('tools/FileEditTool/FileEditTool.ts', [
      'toAutoClassifierInput(input)',
      'userModified: userModified ?? false',
      'The user modified your proposed changes before accepting them.',
    ])
    assertFragments('services/mcp/client.ts', [
      "version: MACRO.VERSION ?? 'unknown'",
      'setRequestHandler',
    ])
    assertFragments('components/LogoV2/LogoV2.tsx', [
      'lastReleaseNotesSeen === MACRO.VERSION',
    ])
    assertFragments('components/mcp/MCPToolDetailView.tsx', [
      'tool.inputJSONSchema?.required',
      'isRequired && <Text dimColor={true}> (required)</Text>',
    ])
    assertFragments('commands/exit/exit-noninteractive.ts', [
      "gracefulShutdown(0, 'prompt_input_exit')",
    ])
    assertFragments('commands/exit/index.ts', ["description: 'Exit the REPL'"])
    assertFragments('bridge/persistenceSync.ts', [
      'mtimeMs: file.mtimeMs',
      'b.mtimeMs - a.mtimeMs',
    ])
    assertFragments('bridge/bridgeMessaging.ts', [
      'onRenameSession',
      "case 'rename_session'",
    ])
    assertFragments('components/PromptInput/PromptInput.tsx', [
      'initialMode={vimMode}',
      'onModeChange={setVimMode}',
    ])
    assertFragments('hooks/useVimInput.ts', ["'INSERT'", "'NORMAL'"])
    assertFragments('services/tips/tipRegistry.ts', [
      'const { eligible } = checkCachedPassesEligibility()',
      'return eligible',
    ])
    if (!semanticCase) {
      assertFragments('services/mcp/headlessConnectionManager.ts', [
        'const MCP_REMOTE_RETRY_DELAYS_MS = [500, 1_500, 4_000]',
      ])
    }
    assertFragments('services/SessionMemory/sessionMemory.ts', [
      'messages[messages.length - 1]',
      "logEvent('tengu_session_memory_extraction'",
    ])
    assertFragments('cli/transports/HybridTransport.ts', [
      "logForDiagnosticsNoPII('warn', 'cli_hybrid_post_no_token')",
      'timeout: POST_TIMEOUT_MS',
    ])
    assertFragments('cli/remoteIO.ts', [
      "headers['Authorization'] = `Bearer ${sessionToken}`",
    ])
    if (!semanticCase) {
      assertFragments('cli/remoteIO.ts', ["message.type === 'transcript_mirror'"])
    }
    assertFragments('utils/queryContext.ts', [
      'setClassifierApprovals: createClassifierApprovalsSetter(setAppState)',
      'setWebBrowserSlice: createWebBrowserSliceSetter(setAppState)',
      'teammateColors: createTeammateColors(getAppState, setAppState)',
    ])
    assertFragments('QueryEngine.ts', [
      'export async function* ask({',
      'shouldQuery,',
      "querySource: 'sdk'",
      'yield* engine.submitMessage(prompt, {',
    ])
    assertFragments('cli/handlers/plugins.ts', [
      "logEvent('tengu_plugin_list_command'",
      'React.createElement',
      'options.available',
    ])
  },
)
