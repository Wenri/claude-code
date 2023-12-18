import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.97-to-2.1.98'
const latestCaseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected =
  !semanticCase || semanticCase === caseName || semanticCase === latestCaseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselinePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_98_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_PUBLISHED_BUNDLE
const pairOptions = {
  skip: semanticCase && semanticCase !== caseName
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_97_BUNDLE and CLAUDE_CODE_2_1_98_BUNDLE are required'
      : false,
}
const sourceOptions = { skip: selected ? false : `not applicable to ${semanticCase}` }
const latestOptions = {
  skip: semanticCase && semanticCase !== latestCaseName
    ? `not applicable to ${semanticCase}`
    : !latestPath
      ? 'CLAUDE_CODE_2_1_116_PUBLISHED_BUNDLE is not set'
      : false,
}

const structural98 = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(repositoryRoot, 'recovery/cases/2.1.97-to-2.1.98/structural/generated-delta.json.gz'),
    ),
  ),
)
const structural116 = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(repositoryRoot, 'recovery/cases/2.1.114-to-2.1.116/structural/generated-delta.json.gz'),
    ),
  ),
)

const units98 = [
  [17728, 12446095, 12448208, '650a83e6c0638fe0983ac81c10dfb24eabc8c05974bde12feace93a7063b324f'],
  [18079, 12586287, 12642423, 'b0e7a87cd8a971450e124c23eeb72bf7a758fc1daae101e1d1e11b423413613e'],
]
const units116 = [
  [16643, 10475307, 10475607, 'b798e7346a9cb7894b8c8a47c50346ec29d2d20b341bd3518dd550924633d5e7'],
  [16644, 10475607, 10475655, '35c4392b3765ee0a388e6581aada6da2cd5e086972bd535337b04bfa0add5eec'],
  [16646, 10477091, 10478716, 'dfae7bd09224bbf64bcc9cce7081a55d225ab4ee902549429ab4cf5c1935d602'],
  [16651, 10479354, 10479560, 'e1c316ad715351f580d310274d5a3f626e7dee564265e6221428bcdb75a08536'],
  [16652, 10479560, 10479636, 'b9b57d9bff1acd6b9d42b85c41d7a3cce713d444739223b0c7a5e7952bc6ed6b'],
  [16653, 10479636, 10479663, '0b42ce51834989b33afffa75f5dcb2ed7f4b406f12fa45292ced7cd75774c3a3'],
  [16671, 10487849, 10490177, '132479de5d5738ca44d942b53120fff0df582e6c19220be4dcbcd2601e696a0e'],
  [16681, 10495171, 10496583, 'beb2e1b996887064ccf084cd9b67b34eb9233b543f262919764017d671d11147'],
  [16692, 10500115, 10500220, 'a20996a46c28ad85ef210877c83d6e2d778ad64a32c62b27a6a51b43c41dd895'],
  [18809, 11570823, 11580773, '12124919d3f3e396548d68b20308c9421b7e084655f6f243c08203ed79e0dc90'],
  [18813, 11582149, 11582378, 'ed16c68b36f848bdee8fe81dd4d1ed1b47e815e22d8821144a665fb62ef9d62a'],
  [19329, 11803951, 11831855, '997c52d29b50bc489a62979e07f11275e0da97d2e5cd7ce05c534b8f8148f609'],
  [19333, 11832298, 11832972, '53a89a029a7c1346a808a688fbc31edd5cd58fa4ce3c0c24ce7abc940e77cea2'],
  [19998, 12102133, 12160049, '3b17ff0bd496c0d7f39baa8f2542135ed7dd3f220d3f6a628ae7f7040c9492c5'],
  [20000, 12160289, 12161924, '0047e95b6e31826c1460b90c81f75d5b80ef1f9cafb512f291271a3d325edb0a'],
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative.replace(/^src\//, '')), 'utf8')
}

function cookedStrings(bundle) {
  const values = new Set()
  const ast = parse(bundle, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    allowHashBang: true,
  })
  function walk(node) {
    if (!node || typeof node !== 'object') return
    if (node.type === 'Literal' && typeof node.value === 'string') {
      values.add(node.value)
    } else if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
      values.add(node.quasis.map(quasi => quasi.value.cooked).join(''))
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'start' || key === 'end') continue
      if (Array.isArray(value)) value.forEach(walk)
      else if (value && typeof value === 'object' && value.type) walk(value)
    }
  }
  walk(ast)
  return values
}

function assertUnit(structural, bundle, expected) {
  const [index, start, end, hash] = expected
  const row = structural.regions.find(region => region.target?.index === index)
  assert.ok(row, `structural row ${index}`)
  assert.deepEqual(
    [row.target.start, row.target.end, row.target.sourceHash],
    [start, end, hash],
  )
  assert.equal(sha256(bundle.slice(start, end)), hash)
  return bundle.slice(start, end)
}

test('2.1.98 pins the launch dialog and complete REPL choice graph', pairOptions, () => {
  const baseline = fs.readFileSync(baselinePath, 'utf8')
  const targetBytes = fs.readFileSync(targetPath)
  const target = targetBytes.toString('utf8')
  assert.equal(sha256(Buffer.from(baseline)), '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988')
  assert.equal(sha256(targetBytes), '27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556')

  const dialog = assertUnit(structural98, target, units98[0])
  const repl = assertUnit(structural98, target, units98[1])
  assert.equal(baseline.includes('tengu_ultraplan_first_launch'), false)
  for (const fragment of [
    'ultraplan-launch',
    'tengu_ultraplan_first_launch',
    'Run ultraplan in the cloud?',
    'This will disable Remote Control for this session.',
    'For more information on Claude Code on the web:',
    'Run ultraplan',
    'Not now',
  ]) assert.ok(dialog.includes(fragment), fragment)
  assert.ok(repl.includes('ultraplan-launch'))
})

test('2.1.98 owns all three prompt variants and dynamic display selection', pairOptions, () => {
  const target = fs.readFileSync(targetPath, 'utf8')
  for (const fragment of [
    'tengu_ultraplan_prompt_identifier',
    'simple_plan',
    'visual_plan',
    'three_subagents_with_critique',
    'Run a lightweight planning process',
    'ascii block diagrams',
    'Produce an exceptionally thorough implementation plan using multi-agent exploration.',
    'Scope → Critique → Edit → Execute',
  ]) assert.ok(target.includes(fragment), fragment)
})

test('the latest bundle preserves the poll graph and adds source-aware launch semantics', latestOptions, () => {
  const latestBytes = fs.readFileSync(latestPath)
  const latest = latestBytes.toString('utf8')
  assert.equal(sha256(latestBytes), '06cb80193f3af8bb468d1536b230b0e2f854a398b1e88af3c79048ce821bf193')
  const analyzableStart = latest.indexOf('// Claude Code is a Beta product')
  assert.equal(analyzableStart, 87)
  const inner = latest.slice(analyzableStart)
  const slices = new Map(
    units116.map(unit => [unit[0], assertUnit(structural116, inner, unit)]),
  )
  const poll = slices.get(16671)
  for (const fragment of [
    'tengu_ultraplan_plan_ready',
    'tengu_ultraplan_approved',
    'execution_target',
    'Ultraplan approved \\u2014 executing in Claude Code on the web.',
    'ultraplan meta delete failed',
  ]) assert.ok(poll.includes(fragment), fragment)
  for (const [targetIndex, fragment] of [
    [16643, 'tengu_ccr_bundle_seed_enabled'],
    [16646, 'eventsReceived'],
    [16646, 'Lost connection to the remote session after repeated retries'],
    [16651, 'UltraplanPollError'],
    [16652, 'tengu_ultraplan_config'],
    [16681, 'three_subagents_with_critique'],
    [18809, 'exit_plan_mode'],
    [19329, 'This prompt will launch an ultraplan session in Claude Code on the web'],
    [19998, 'sourcePromise'],
  ]) assert.ok(slices.get(targetIndex).includes(fragment), `${targetIndex}: ${fragment}`)
  for (const fragment of [
    'allow_remote_sessions',
    'tengu_ultraplan_dialog_choice',
    'create_api_fail',
    'exit_plan_mode',
    'sourcePromise',
  ]) assert.ok(latest.includes(fragment), fragment)
})

test('source reconstructs the target98 graph and its target116 evolution', sourceOptions, () => {
  const command = source('src/commands/ultraplan.tsx')
  const component = source('src/components/ultraplan/UltraplanLaunchDialog.tsx')
  const state = source('src/state/AppStateStore.ts')
  const repl = source('src/screens/REPL.tsx')

  for (const fragment of [
    'tengu_ultraplan_prompt_identifier',
    'three_subagents_with_critique',
    'getUltraplanDisplayConfig',
    'replaceUltraplanKeyword(args).trim()',
    'promptIdentifier',
    'create_api_fail',
    'registerCleanup',
    'error_name',
  ]) assert.ok(command.includes(fragment), `command: ${fragment}`)
  for (const fragment of [
    "useRegisterOverlay('ultraplan-launch')",
    'tengu_ultraplan_first_launch',
    'replBridgeExplicit: false',
    'replBridgeOutboundOnly: false',
  ]) assert.ok(component.includes(fragment), `dialog: ${fragment}`)
  assert.ok(state.includes('ultraplanArg: string'))
  assert.ok(repl.includes('setInputValue(ultraplanArg)'))
  assert.ok(repl.includes('statusMessageId'))
  assert.ok(repl.includes("formatCommandInputTags('ultraplan', ultraplanArg)"))

  const target98PromptOwner = path.join(sourceRoot, 'utils/ultraplan/target98Prompts.ts')
  if (fs.existsSync(target98PromptOwner)) {
    const prompts = fs.readFileSync(target98PromptOwner, 'utf8')
    assert.ok(prompts.includes('Run a lightweight planning process'))
    assert.ok(prompts.includes('Use a ```mermaid block or ascii block diagrams'))
    assert.ok(prompts.includes('Produce an exceptionally thorough implementation plan'))
    assert.equal(component.includes('tengu_ultraplan_dialog_choice'), false)
    assert.ok(component.includes('For more information on Claude Code on the web:'))
    const targetValues = cookedStrings(fs.readFileSync(targetPath, 'utf8'))
    for (const name of [
      'TARGET98_SIMPLE_PLAN_PROMPT',
      'TARGET98_VISUAL_PLAN_PROMPT',
      'TARGET98_THREE_SUBAGENTS_PROMPT',
    ]) {
      const match = prompts.match(
        new RegExp(`export const ${name} = ("(?:\\\\.|[^"\\\\])*")`),
      )
      assert.ok(match, name)
      assert.ok(targetValues.has(JSON.parse(match[1])), `${name}: cooked target payload`)
    }
  } else {
    const processInput = source('src/utils/processUserInput/processUserInput.ts')
    const exitPlan = source('src/components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx')
    const poll = source('src/commands/ultraplan.tsx')
    const ccrSession = source('src/utils/ultraplan/ccrSession.ts')
    const remoteSession = source('src/utils/background/remote/remoteSession.ts')
    const teleport = source('src/utils/teleport.tsx')
    assert.ok(state.includes("source: 'slash' | 'keyword'"))
    assert.ok(state.includes('sourcePromise?: Promise'))
    assert.ok(processInput.includes("source: 'keyword'"))
    assert.ok(exitPlan.includes("source: 'exit_plan_mode'"))
    assert.ok(component.includes('tengu_ultraplan_dialog_choice'))
    assert.ok(component.includes('More information:'))
    assert.ok(command.includes("isPolicyAllowed('allow_remote_sessions')"))
    assert.ok(poll.includes('deleteRemoteAgentMetadata(taskId)'))
    assert.ok(ccrSession.includes('eventsReceived: number'))
    assert.ok(ccrSession.includes('firstEventAt: number | undefined'))
    assert.ok(ccrSession.includes('lastEventAt: number | undefined'))
    assert.ok(ccrSession.includes('eventStats.eventsReceived += newEvents.length'))
    assert.ok(remoteSession.includes('getRemoteSourceViability'))
    assert.ok(remoteSession.includes("checkGate_CACHED_OR_BLOCKING('tengu_ccr_bundle_seed_enabled')"))
    assert.ok(teleport.includes('onCreateFail?: (message: string) => void'))
    assert.ok(teleport.includes('timeoutMs = 10000'))
  }
})
