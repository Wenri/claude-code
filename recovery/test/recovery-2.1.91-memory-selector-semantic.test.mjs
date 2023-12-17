import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.90-to-2.1.91'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_91_BUNDLE
const targetSha256 =
  'b4bf141f30cf8b40196295816c7a6b9d01a36e906908d73a9f9a865ce4cdf816'
const isCurrentSource =
  path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')
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

const pinnedUnits = new Map([
  [6921, ['unresolved', 5053535, 5053592, '795cd683879d2a8fd994a2995a01d376e03fc3cd2a3a3271c0f2f8c42d74bcac']],
  [6922, ['unresolved', 5053592, 5053659, 'b70cd3c3b693199f3166f12191ee5850298a9e3785e2c399efaad0f941f0cc96']],
  [6924, ['unresolved', 5053704, 5053930, '8d7c35321ff4b2a8c51b393bbd497ee4d88316084553fe89fce6844a3b81edf9']],
  [6925, ['unresolved', 5053930, 5054138, '3861d42f55fa7ababb41463b713b48e3da546e89d9ed316b086a9076aa2e6a10']],
  [9873, ['unresolved', 8129722, 8135656, 'f4f97ccb513211a75d724c98e24803269db1f4888b758087cb127663a971292a']],
  [12213, ['unresolved', 9475412, 9477081, 'f8786d4856f4380a458d1d0663daadba8e1743e5878ff0e35bcdaddf29183fa6']],
  [12238, ['unresolved', 9495085, 9499030, '1afa4c69f063f84b859029aec8039e1c7304bb03b45d3335512e242ef89b2eac']],
  [12239, ['unresolved', 9499030, 9502783, '3c4a821ebba4357cd8192c25f017b8b03483f5639fce2f99588f6fcb8c23b005']],
  [12430, ['unresolved', 9587980, 9588380, '63ee78a6b94170d000f64d65408f746ecd52d331bbfcf72985e205fbe3c0b66d']],
  [12431, ['unresolved', 9588380, 9589303, '04f63b4a1b277df61f5e26c82941fe49d26ed26c4c77a9219d2f24a4d5619d92']],
  [12432, ['unresolved', 9589303, 9590548, '07c9e560f128eda41172e70ffdc7f3bf734be2aafff8b3e610896857b3c02068']],
  [12468, ['changed', 9603497, 9603892, '9d00f5e8b98b03d3348e5cf8d811455a8d437d407d90e2432edb8b46888e9bc7']],
  [12472, ['unresolved', 9604669, 9605586, '7061b7c62a6d3dc0f1c8914bdaef4a7ae76655dde0811450815f3437032e59be']],
  [13213, ['unresolved', 9928506, 9929945, '8241c1db8dec53aaeba733d35744cdc1f0e9869f80c8f21af6da05baf494ad2d']],
  [17373, ['unresolved', 12260304, 12263795, '67f70586addbce8a799d1fb05ccabc12d6ef62c1619d17eb38eec3d2ac4d32fe']],
  [17715, ['unresolved', 12393394, 12449603, 'fe461079d2a096f6617194bf0e0398162f85277cf5f21882522be679f3760d1d']],
  [18158, ['unresolved', 12910934, 12925352, '788f94cb6ad391114b51d8f946285202a20356e9fd49bcda0f29cf1dc6f591b7']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function assertFragments(relative, fragments) {
  const text = source(relative)
  for (const fragment of fragments) {
    assert.ok(text.includes(fragment), `${relative}: ${fragment}`)
  }
  return text
}

test('2.1.91 pins the complete persistent memory-selector call graph', {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_91_BUNDLE is not set'
      : false,
}, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), targetSha256)
  const bundle = bytes.toString('utf8')
  for (const [index, [classification, start, end, sourceHash]] of pinnedUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, classification, `${index}: class`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: identity`,
    )
    assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
  }
  for (const fragment of [
    'stateByDir:new Map,lastUsage:null',
    'Available memories:\n',
    'Select memories relevant to:\n',
    'cacheReadInputTokens',
    'cacheCreationInputTokens',
    'selector_turn_count',
    'memorySelector',
  ]) assert.ok(bundle.includes(fragment), fragment)
})

test('source owns exact manifest caching, history, de-duplication, and usage semantics', {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}, () => {
  const selector = assertFragments('memdir/findRelevantMemories.ts', [
    'stateByDir: new Map(), lastUsage: null',
    'state.stateByDir.clear()',
    'text: `Available memories:\\n${formatMemoryManifest(memories)}`',
    'const prompt = `Select memories relevant to:\\n${query}`',
    '...conversation.messages',
    "role: 'assistant',",
    'cacheReadInputTokens: result.usage.cache_read_input_tokens ?? 0',
    'turnCount: (messages.length + 1) / 2',
    '!alreadySurfaced.has(m.filePath)',
  ])
  if (!isCurrentSource) {
    assert.ok(selector.includes('The first message lists the available memory files'))
    assert.ok(selector.includes('Do not re-select memories you already returned'))
  }
})

test('source provisions and clears one selector per conversation context', {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}, () => {
  assertFragments('Tool.ts', ['memorySelector?: MemorySelectorState'])
  assertFragments('utils/attachments.ts', [
    '!toolUseContext.memorySelector',
    'toolUseContext.memorySelector,',
    'selector_turn_count: usage?.turnCount',
    "'extract_memories',",
    "'auto_dream',",
    "'prompt_suggestion',",
    "'speculation',",
    "'compact',",
    'MEMORY_SELECTOR_EXCLUDED_QUERY_SOURCES.has(querySource)',
  ])
  assertFragments('services/compact/compact.ts', [
    'clearMemorySelectorState(context.memorySelector)',
  ])
  assertFragments('commands/clear/conversation.ts', [
    'clearMemorySelectorState(memorySelector)',
  ])
  assertFragments('utils/forkedAgent.ts', [
    'memorySelector: createMemorySelectorState()',
  ])
  assertFragments('utils/swarm/inProcessRunner.ts', [
    'memorySelector: createMemorySelectorState()',
  ])
  assertFragments('QueryEngine.ts', [
    'private memorySelector = createMemorySelectorState()',
    'memorySelector: this.memorySelector',
  ])
  assertFragments('screens/REPL.tsx', [
    'const memorySelectorRef = useRef(createMemorySelectorState())',
    'memorySelector: memorySelectorRef.current',
    'memorySelector={memorySelectorRef.current}',
  ])
  assertFragments('components/ultraplan/UltraplanChoiceDialog.tsx', [
    'memorySelector,',
  ])
})
