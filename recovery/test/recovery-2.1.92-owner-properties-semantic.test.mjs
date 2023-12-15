import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.91-to-2.1.92'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const historicalSource =
  path.resolve(sourceRoot) !== path.resolve(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
const targetSha256 =
  '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362'
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
  [3206, ['unresolved', 2413746, 2414661, '954869ec1afce927ddf68bc4fcdfb185570a1d0264d9a609016630990eb576a6']],
  [9421, ['unresolved', 7848415, 7848646, '06b66c34d6c8eb3d44520a6faed04ddbf15a6f3d485e7132284d2ac605cd9a8e']],
  [9975, ['unresolved', 8168282, 8174777, 'ceb7ca4dd3fd8342b9a52e8b0f6d4ea0a86829bbeb2c23965e0f0161651f3f72']],
  [11531, ['unresolved', 9105837, 9106033, 'f8e419106cfb23d0c40e8754e18e99309fa1ceb0a97f271cc70ca3627f6b4f61']],
  [11757, ['unresolved', 9201747, 9205687, 'd61c020f721e72a8209be78573e554c025a8caed3fd8f1f849fae321b119a467']],
  [14848, ['unresolved', 11030345, 11030385, '087e1c5070934a6374ef58d09ece93b7c331accf35899a52c75d6b9c51d954f0']],
  [15371, ['unresolved', 11256725, 11256772, 'be0e91572a39b49f38bd35d7f255825e8108817d98915ec9743378d404b5dd18']],
  [15703, ['unresolved', 11424594, 11427456, '5e9556aea492267ab86b87e85c9089c22533fe60687cc311bfef1d216427b537']],
  [16040, ['unresolved', 11573966, 11574563, 'e6553c67e5238811359359be6ba15820190f28eb1886be342672ccc4acb26baf']],
  [17251, ['unresolved', 12200515, 12225593, 'f67b07148c2891f18ba78e47c84daff55d9c5ce3f1f784826ab2a85731718d9e']],
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

test('2.1.92 owner-property evidence pins every exact target unit', {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_92_BUNDLE is not set'
      : false,
}, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), targetSha256)
  const bundle = bytes.toString('utf8')
  for (const [index, [classification, start, end, sourceHash]] of pinnedUnits) {
    const region = structural.regions.find(item => item.target.index === index)
    assert.equal(region.classification, classification, `${index}: class`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: identity`,
    )
    assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
  }
})

test('source owns exported model, telemetry, bridge, session, and worktree APIs', {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}, () => {
  assertFragments('utils/model/model.ts', [
    "export const DEFAULT_3P_OPUS_KEY = 'opus46'",
    "export const DEFAULT_3P_SONNET_KEY = 'sonnet45'",
    "export const DEFAULT_3P_HAIKU_KEY = 'haiku45'",
  ])
  assertFragments('utils/telemetry/instrumentation.ts', [
    'export async function getOtlpLogExporters()',
    'export function parseOtelHeadersEnvVar()',
  ])
  assertFragments('bridge/bridgeConfig.ts', [
    'export function getBridgeSessionNamePrefix()',
    'export function sanitizeSessionNamePrefix',
  ])
  assertFragments('utils/sessionStorage.ts', [
    'export const subscribeSessionAgentNameChanged',
    'export function getCurrentSessionAgentName()',
  ])
  assertFragments('utils/worktree.ts', [
    'export async function getAgentWorktreeChanges(',
  ])
})

test('source preserves per-instance tmux and unconditional target voice routing', {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}, () => {
  const tmux = assertFragments('utils/swarm/backends/TmuxBackend.ts', [
    'private firstPaneUsedForExternal = false',
    '!this.firstPaneUsedForExternal && paneCount === 1',
    'this.firstPaneUsedForExternal = true',
  ])
  assert.doesNotMatch(tmux, /\nlet firstPaneUsedForExternal = false/)

  const voice = assertFragments('services/voiceStreamSTT.ts', [
    "use_conversation_engine: 'true'",
    "stt_provider: 'deepgram-nova3'",
  ])
  assert.doesNotMatch(voice, /tengu_cobalt_frost/)
})

test('source exposes Teleport and voice-submit through their reachable callbacks', {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}, () => {
  const teleport = assertFragments('commands/teleport/teleport.tsx', [
    'export function Teleport({ onExit, context }',
    'export const call: LocalJSXCommandCall = async (onExit, context)',
    '<Teleport onExit={onExit} context={context} />',
    "onExit('Session resumed successfully', { display: 'system' })",
  ])
  if (historicalSource) {
    assert.ok(teleport.includes('context.setMessages(() => result.log)'))
    assertFragments('commands/model/model.tsx', [
      'export function renderModelLabel(',
    ])
  } else {
    assert.ok(
      teleport.includes(
        "context.applyMessageOp({ type: 'replace-all', messages: result.log })",
      ),
    )
    assertFragments('commands/model/modelCommand.ts', [
      'export function renderModelLabel(',
    ])
  }

  const prompt = assertFragments('components/PromptInput/PromptInput.tsx', [
    'voiceSubmitRef = React.useRef',
    'submit: (value: string, fromKeybinding?: boolean)',
    'void voiceSubmitRef.current?.(value, fromKeybinding)',
    'voiceSubmitRef.current = onSubmit',
  ])
  const expose = prompt.indexOf('submit: (value: string')
  const assign = prompt.indexOf('voiceSubmitRef.current = onSubmit')
  assert.ok(expose >= 0 && assign > expose)
})
