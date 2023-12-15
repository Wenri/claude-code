import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
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

const units = [
  [6825, 4975543, 4975694, 'fb73f48457ff74ad64c73b3bcd9544624cf7484708fc9732536f6c60053f8f4d'],
  [6826, 4975694, 4975789, '70cb30efa28e6b5aad258dfbeee9f721b1fa47a75b429b95ceed9f7b857bb766'],
  [6827, 4975789, 4978302, '76d1221177a4a844d1da5c11f048395bc9058216894c250dd0d6250d3c2a7d35'],
  [6850, 4983502, 4983782, '31037a627eaf651f7a8f391092fcd58bb31ae6756e0729aa891a66baf24cbbbb'],
  [6854, 4984110, 4984385, 'b8f3db3bfe63fdd41a1ebf0bd44fdac148bb4cbe973a5bdc4c05266e4e5e4043'],
  [6859, 4984586, 4985070, 'c5e810c5b71731d0e01a9584cf618a776f59fae91992be3708d28466b9888564'],
  [6861, 4985081, 4985233, '4ba45626aa2f1457f93c2767c9e8914ac1f754796246048d59dc74b9ee80a925'],
  [6862, 4985233, 4985290, '6e254b693329437ef99bc316f67a586529d75a72665947ed6ad4de34d384b138'],
  [6863, 4985290, 4986062, '856c36105e6370e6b5063f35d199fb1451085bd4a14bd00c59be9945ce77670d'],
  [6864, 4986062, 4986461, '687f6df792f785f52daf714c27b55ab50671c085a4adf45c24608bbd1aeb7585'],
  [6873, 4987177, 4987400, '19822307911a91e6302bc9f4fe4d770d8a9a753c669e11151a57501b04b4e6ca'],
  [6877, 4988385, 4988496, 'dcfa4c76a3385a4210ae7b3cb758a57df8cc436fc5150d5fd09d37b96fedce0b'],
  [12366, 9509174, 9509211, '55d16c926b06c9b719cda6d98536103383076cc2702f6ef61e5c25707b8194a1'],
  [12368, 9509235, 9511890, '5b4908f9ad1f0bd9f8002b061df167e79ac688e6e97ee31b765a6ebee0b92fb8'],
  [12443, 9548054, 9548538, 'ff0ffed69ae299176e136da2b854da9c96fed3bcfff931dfd54b6e34ddb8cb13'],
  [12654, 9719718, 9724703, '7196fc75a0dd1113677adbe85ad49b718ca08a87d649ba446f1ff71040bbc6ee'],
  [12657, 9724729, 9725110, 'c1cf679c116e72bf3c6c0be2a6ab54b2a309b6f601958d8538d473a25969b35e'],
  [12660, 9725176, 9725232, '7069cfec791ae644cdfd3647fee49acae8e512d07b4701f27abf9b2c339cccb4'],
  [12661, 9725232, 9725271, 'ed6e2b85508e0ea9d6a4b5e47538f61570ae29b9faa9570c1e73549839ae9c9c'],
  [12662, 9725271, 9725415, 'aaae03e3fd85aee91eb634b163a3d41f26cbe5c3d619e24fdc0ce12b8615f527'],
  [12663, 9725415, 9725597, '500008548ca04f0082684ee085d3b0d59b8ecceee36940af7a95c032c05ad3af'],
  [12664, 9725597, 9725848, 'ce7c7554b9cc1318d00159ea4ce4e28fd6b3ff8ff0daf111cae96bd725506c26'],
  [12665, 9725848, 9725888, '27384a7a5b14bf320963136364dac1aa3122dc41c77a9646839156b22987f368'],
  [12666, 9725888, 9726399, '68549b8d3da0e449e181620a358fa555e472ae16eebe332b18fd601a0c494fd5'],
  [12667, 9726399, 9726437, '0a7547cdbb9360b638252538eb6dcca2db431b8573e240ff00656d67fd586efc'],
  [12668, 9726437, 9726478, '497404b173c6b5ab0d1bc5f11c9e4ef44771957905f260317808a80dd4df98eb'],
  [12669, 9726478, 9726509, '75de28510318b0c20a006f1975ea32a866d9d71ecee72a5a7a58bda0d9617463'],
  [12670, 9726509, 9726611, '41c917b29e9c3caa33a887545d05b2a461927aab54ecc50fa7973298b45a6d34'],
  [12671, 9726611, 9728867, '99154c4fdd0b268d074b83c3b46ec3455e39fc6172f2df94b0248d9446092e3a'],
  [12672, 9728867, 9729060, '7e447d2a74625e4f12db43e9e2dfa098d13658f1f6b21b0794f5563e4463afad'],
  [12674, 9729068, 9729142, '772945c22092926b3abab1f0aa4e4991bfc5a52e6f5534c64ee9e9f36a347f1a'],
  [18202, 12651832, 12655324, 'b2471b6629d89dd54cc99efc526fb62d04bcaf71dac0257f258fbc088a4d047c'],
  [18208, 12656116, 12657307, '47c8b895b0838a359b06e0a7f8f4f2a912cc17b842630074755c74c893c59d9f'],
  [18497, 12871844, 12874846, '8c1c28ffe5dd9cd6e72098c05306c5d69ab2f744ff8446b2866d0101f5d27d71'],
  [18498, 12874846, 12875396, '2970a29322e080fa2fecb43941743f1c49fb72f0cfb90c10954af7918b1cc799'],
  [18499, 12875396, 12878907, 'bb1e52a85669606f7c033c400011de0fcbdc5b754bd6503541c49a3fa3d49afb'],
  [18500, 12878907, 12884761, '0dd451d1a28821261b9dbd42b66459bdbcab2473679b6ec9d97d5e863ed06e4a'],
  [18501, 12884761, 12885667, '1200b0629a21728847fcd5c28edc9e292eb522f31a05fda9a27ff4498763585d'],
  [18768, 13337686, 13370073, 'eb9ce1904c883b5e01e624ff995e38bc8d28aac9acb24bc6048cacc0f9073cb1'],
]

const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_100_BUNDLE and CLAUDE_CODE_2_1_101_BUNDLE are required'
      : false,
}
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function assertOrdered(contents, fragments, label) {
  let previous = -1
  for (const fragment of fragments) {
    const index = contents.indexOf(fragment, previous + 1)
    assert.notEqual(index, -1, `${label}: ${fragment}`)
    assert.ok(index > previous, `${label}: ordering ${fragment}`)
    previous = index
  }
}

test('target101 pins every autonomous-loop structural owner', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath)
  const target = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(baseline), 'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be')
  assert.equal(sha256(target), 'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb')
  const targetText = target.toString('utf8')
  for (const [index, start, end, sourceHash] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: class`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: identity`,
    )
    assert.equal(sha256(targetText.slice(start, end)), sourceHash, `${index}: hash`)
  }
})

test('autonomous defaults are introduced at the authenticated 100-to-101 boundary', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  for (const fragment of [
    '<<autonomous-loop>>',
    '<<autonomous-loop-dynamic>>',
    '<<loop.md>>',
    'tengu_kairos_loop_prompt',
    '# Autonomous loop check',
    'resolveLoopDefaultFire',
    '## Offer cloud first',
    'If the next run is gated on an event',
  ]) {
    assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
    assert.equal(target.includes(fragment), true, `${fragment}: target`)
  }
})

test('source owns exact preamble, sentinels, file refresh, and delivery state', sourceOptions, () => {
  const owner = source('utils/loopSentinels.ts')
  const marker = 'export const AUTONOMOUS_LOOP_PREAMBLE = `'
  const start = owner.indexOf(marker)
  assert.notEqual(start, -1)
  const contentStart = start + marker.length
  const end = owner.indexOf('\n`', contentStart)
  assert.notEqual(end, -1)
  const preamble = Function(`return \`${owner.slice(contentStart, end + 1)}\``)()
  assert.equal(preamble.length, 4972)
  assert.equal(sha256(preamble), '91c5cbb317382010347b845d696790ff0c9f481a6262755039391ce9e1fa6ee3')

  for (const fragment of [
    "AUTONOMOUS_LOOP_SENTINEL = '<<autonomous-loop>>'",
    "AUTONOMOUS_LOOP_DYNAMIC_SENTINEL =\n  '<<autonomous-loop-dynamic>>'",
    "LOOP_FILE_SENTINEL = '<<loop.md>>'",
    "LOOP_FILE_DYNAMIC_SENTINEL = '<<loop.md-dynamic>>'",
    'MAX_LOOP_FILE_BYTES = 25_000',
    "join(getProjectRoot(), '.claude', 'loop.md')",
    "join(getCwd(), 'loop.md')",
    "code === 'ENOENT' || code === 'EISDIR'",
    'lastLoopFileContent === loopFile.content',
  ]) assert.ok(owner.includes(fragment), fragment)
  assertOrdered(owner, [
    'export function resolveLoopDefaultFire',
    'resolveAutonomousLoopFire(prompt)',
    'resolveLoopFileFire(prompt)',
    '?? prompt',
  ], 'resolver precedence')
  assertOrdered(owner, [
    'export function resetAutonomousLoopDelivered',
    'autonomousLoopDelivered = false',
    'lastLoopFileContent = null',
  ], 'reset')
})

test('source wires defaults through skill, scheduler, REPL, print, and compact', sourceOptions, () => {
  const loop = source('skills/bundled/loop.ts')
  const cron = source('utils/cronScheduler.ts')
  const scheduled = source('hooks/useScheduledTasks.ts')
  const print = source('cli/print.ts')
  const compact = source('services/compact/postCompactCleanup.ts')
  const wakeup = source('tools/ScheduleWakeupTool/prompt.ts')
  const wakeupTool = source('tools/ScheduleWakeupTool/ScheduleWakeupTool.ts')
  const toolRegistry = source('tools.ts')
  const loopWakeup = source('utils/loopWakeup.ts')
  const bootstrapState = source('bootstrap/state.ts')
  const cronTasks = source('utils/cronTasks.ts')
  const cronConfig = source('utils/cronJitterConfig.ts')

  for (const fragment of [
    "get argumentHint()",
    "'[interval | until <condition>] [prompt]'",
    'INTERVAL_ONLY_RE.test(trimmed)',
    'normalizeEveryInterval(everyInterval)',
    'readLoopFile()',
    'noPrompt && isLoopDynamicEnabled()',
    'LOOP_FILE_DYNAMIC_SENTINEL',
    'AUTONOMOUS_LOOP_SENTINEL',
    '## Offer cloud first',
    'If the next run is gated on an event',
  ]) assert.ok(loop.includes(fragment), fragment)
  assert.ok(cron.includes('autonomousLoopDefault: isLoopDefaultSentinel(t.prompt)'))
  assert.ok(scheduled.includes('value: resolveLoopDefaultFire(prompt)'))
  assert.ok(print.includes('loopDefaultsModule?.resolveLoopDefaultFire(prompt) ?? prompt'))
  assertOrdered(compact, [
    'if (isMainThreadCompact)',
    "resetGetMemoryFilesCache('compact')",
    'resetAutonomousLoopDelivered()',
  ], 'post-compact reset')
  for (const fragment of [
    '<<autonomous-loop-dynamic>>',
    '<<autonomous-loop>>',
    'always uses the \\`-dynamic\\` variant',
    "**Don't pick 300s.**",
    'sleep ~270s twice instead',
    'One short sentence on what you chose and why.',
    'make it specific.',
  ]) assert.ok(wakeup.includes(fragment), fragment)
  assert.ok(wakeupTool.includes('export const ScheduleWakeupTool = buildTool({'))
  assert.ok(wakeupTool.includes('SCHEDULE_WAKEUP_TOOL_NAME'))
  assert.ok(toolRegistry.includes('ScheduleWakeupTool'))
  for (const fragment of [
    "'tengu_kairos_loop_dynamic'",
    "'tengu_loop_dynamic_wakeup_aged_out'",
    "'tengu_loop_dynamic_wakeup_scheduled'",
    'const cacheLeadMs = getCronJitterConfig().cacheLeadMs',
    'scheduleLoopWakeup(',
    'chosen_delay_seconds:',
    'clamped_delay_seconds:',
    'was_clamped:',
  ]) assert.ok(loopWakeup.includes(fragment), fragment)
  for (const fragment of [
    'getLoopChainStartedAt(prompt)',
    'setLoopChainStartedAt(prompt, {',
    'deleteLoopChainStartedAt(task.prompt)',
  ]) assert.ok(loopWakeup.includes(fragment), fragment)
  assert.equal(loopWakeup.includes('const loopScheduleState = new Map'), false)
  for (const fragment of [
    'loopChainStartedAt: Object.create(null)',
    'export function getLoopChainStartedAt(',
    'export function setLoopChainStartedAt(',
    'export function deleteLoopChainStartedAt(',
  ]) assert.ok(bootstrapState.includes(fragment), fragment)
  assert.ok(cronTasks.includes('recurringFrac: 0.5'))
  assert.ok(cronTasks.includes('cacheLeadMs: 15 * 1000'))
  assert.ok(
    cronConfig.includes('.default(DEFAULT_CRON_JITTER_CONFIG.cacheLeadMs)'),
  )
})
