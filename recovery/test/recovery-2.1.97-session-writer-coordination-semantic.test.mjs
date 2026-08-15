import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.96-to-2.1.97'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_96_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const target109Path = process.env.CLAUDE_CODE_2_1_109_BUNDLE
const target110Path = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const target116Path = process.env.CLAUDE_CODE_2_1_116_BUNDLE

const structural97 = readGzipJson(
  'recovery/cases/2.1.96-to-2.1.97/structural/generated-delta.json.gz',
)
const structural110 = readGzipJson(
  'recovery/cases/2.1.109-to-2.1.110/structural/generated-delta.json.gz',
)
const structural116 = readGzipJson(
  'recovery/cases/2.1.114-to-2.1.116/structural/generated-delta.json.gz',
)

const target97Units = new Map([
  [
    7_867,
    [
      6_556_023,
      6_557_029,
      '2c4600aabc4195aa031fe7cd0b5ff7d70092794ce08ce1499e511b72ce251915',
    ],
  ],
  [
    15_811,
    [
      11_507_454,
      11_510_421,
      '9ad192fa37d8fa9bf8c70f665e659388bc48001a900b708fc2d46e0cd43f7e7a',
    ],
  ],
  [
    15_817,
    [
      11_510_850,
      11_511_010,
      '7f2b05b4c4fa52f90fa5011104b7e8f6b35602796f2cf0789e97c8ad28dbc125',
    ],
  ],
  [
    15_846,
    [
      11_513_221,
      11_513_255,
      '096b9755f9b7d264b431b4b48e443709e4fee22cc971976b0703456dbbca2884',
    ],
  ],
  [
    15_847,
    [
      11_513_255,
      11_513_294,
      '85b45424da335cef0abaa64f17b5829dd98ffdffa553f3ba223d33effbb99dd3',
    ],
  ],
  [
    15_848,
    [
      11_513_294,
      11_513_344,
      '7a8044457e78b350283770ea30ff9bf9fecdd5134919f9fcbc7d4898b33bea19',
    ],
  ],
  [
    15_851,
    [
      11_513_476,
      11_523_891,
      'e0ade99f50b6231a7c7d21b92ac7962b43a4520c0d06962f5204d46758d772b5',
    ],
  ],
  [
    16_538,
    [
      11_867_649,
      11_868_477,
      '11f6d09bf6ec473408ed7f80a3af0153880d5abd2bb1b19ca3d7305b4980a9b3',
    ],
  ],
  [
    17_912,
    [
      12_497_777,
      12_554_545,
      '22ab8c7e7e0c98d3801202dd3635f726b32dce2beb34c81b30f7fdd59f889114',
    ],
  ],
  [
    18_396,
    [
      13_119_826,
      13_134_608,
      '0d6bb17433cf8bb73eb2e5ed73a0dd44d83416b2bf76416660b6e666c45f8a9d',
    ],
  ],
])

const baseline96Units = new Map([
  [
    7_855,
    [
      6_553_311,
      6_554_282,
      '72d6c8aece0135de1403790de178141b40b873740b3c4832655e4ea926ae08e1',
    ],
  ],
  [
    15_782,
    [
      11_495_867,
      11_498_729,
      '6116382266dd7bd9b2779f2a1d190bc6534015412bee8515e5a8029232c3ca32',
    ],
  ],
  [
    15_818,
    [
      11_501_501,
      11_511_493,
      'e5b7bb2e4e11146003758629010cf8722a651604e613be737be3f638683090e8',
    ],
  ],
  [
    16_493,
    [
      11_852_644,
      11_853_372,
      '25f8eb511f6e5a88154a85374511f493d94bf3eba0311cb0e37eb5982dc243b1',
    ],
  ],
  [
    17_935,
    [
      12_537_269,
      12_594_077,
      'f88fd7aabe6fb7393d0a3252d1370d695b031d30d74e13a0c32dfb2496eee0c7',
    ],
  ],
  [
    18_391,
    [
      13_054_963,
      13_069_336,
      '0c02eef8a0b01cee2be430f86ec23b7df9b29e7bf74610b26ccdcd4684d3d338',
    ],
  ],
])

const baseline109Units = new Map([
  [
    16_342,
    [
      11_555_099,
      11_558_166,
      'a50b2c53ac317825014e8a4a24f1463af7cb202ca57a06da94a0a4f1cc17a63f',
    ],
  ],
  [
    16_378,
    [
      11_561_327,
      11_561_361,
      '49f1f9fb7dfcc6803bc287c6284d19ce4875c9fd36212a0a553de35154a0feea',
    ],
  ],
  [
    19_124,
    [
      13_304_901,
      13_338_450,
      '19769ab98fde5f3f5f8070a19b02ed42b8d8aef1d3c7b70ad2f475279a4cde5c',
    ],
  ],
])

const target110Units = new Map([
  [
    16_473,
    [
      11_605_756,
      11_608_853,
      '7bae0710b598c40d788028ae527ba0036b7bb03414b9e060f98851e4c4314e89',
      'unresolved',
    ],
  ],
  [
    16_510,
    [
      11_612_053,
      11_612_087,
      '60e6a6c56cb9d18013b4892f2ef8c2d6cc755a5facbf34a7990f51619bd46be7',
      'unresolved',
    ],
  ],
  [
    19_296,
    [
      13_368_081,
      13_402_368,
      '889a05a71cca319bc7b451082e93ebf2c353811a58e2fa6fa2fe5cd48dfe3aca',
      'unresolved',
    ],
  ],
])

const target116Units = new Map([
  [
    10_893,
    [
      6_353_021,
      6_354_037,
      '1f15ad2b046e0704816ba66c89b548d84c3943cd774832c175875c9556b3ccbc',
      'matched',
    ],
  ],
  [
    17_741,
    [
      11_010_110,
      11_013_357,
      'a9d2a77686f90b7365cdcfbda36a58951c92acb41a30dfa016b878b5e4627ddf',
    ],
  ],
  [
    17_744,
    [
      11_013_502,
      11_013_662,
      '54bb02cdc894f1096b8c9e81bf7c2aec351154ba42468c1ab37f4e66f72f1101',
      'matched',
    ],
  ],
  [
    17_776,
    [
      11_016_400,
      11_016_434,
      'ee54d05ce722373c97c9ce610e1750a2250d5e1f082cba77cc5404ab47d52759',
      'matched',
    ],
  ],
  [
    17_777,
    [
      11_016_434,
      11_016_473,
      '7b3316cbd45376bacd01e91be3f114f4312c2e02026f8030cfadee6086d94f86',
      'matched',
    ],
  ],
  [
    17_778,
    [
      11_016_473,
      11_016_523,
      '5509144cfb0ed8018756c78082d295e856ba39093db1ee2872ae3b45a213a64c',
      'matched',
    ],
  ],
  [
    17_781,
    [
      11_016_655,
      11_027_221,
      '64ab353182ac629b6ef5c5d8cf879c0c02a0fdcb59ff6a5c406c4077d7200407',
    ],
  ],
  [
    18_491,
    [
      11_396_131,
      11_397_004,
      '1723f9af8100e15804ae850ce72af17daa665e7e5c9aec06bd657af91101429f',
      'matched',
    ],
  ],
  [
    20_550,
    [
      12_884_238,
      12_902_574,
      '66c82ff554ca98afc25ad653983a1e8d357060b2390ce8bfd5203dfc0a34299f',
    ],
  ],
  [
    20_581,
    [
      12_915_603,
      12_954_120,
      '66fa02021a22925ae2e3eb6c757c5a9e91a25ecb102ebe0ed8bdd47efeb44ce2',
    ],
  ],
])

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const boundaryOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_96_BUNDLE and CLAUDE_CODE_2_1_97_BUNDLE are required'
      : false,
}
const persistenceOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !target109Path || !target110Path || !target116Path
      ? 'CLAUDE_CODE_2_1_109_BUNDLE, CLAUDE_CODE_2_1_110_BUNDLE, and CLAUDE_CODE_2_1_116_BUNDLE are required'
      : false,
}

function readGzipJson(relative) {
  return JSON.parse(
    gunzipSync(fs.readFileSync(path.join(repositoryRoot, relative))),
  )
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(value, fragment) {
  return value.split(fragment).length - 1
}

function assertTargetUnit(structural, target, index, expected) {
  const [start, end, sourceHash, classification = 'unresolved'] = expected
  const region = structural.regions[index]
  assert.equal(region.classification, classification, `${index}: class`)
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [start, end, sourceHash],
    `${index}: identity`,
  )
  const slice = target.slice(start, end)
  assert.equal(sha256(slice), sourceHash, `${index}: bytes`)
  return slice
}

function assertBaselineUnit(structural, baseline, index, expected) {
  const [start, end, sourceHash] = expected
  const unit = structural.unmatchedBaseline.find(candidate => candidate.index === index)
  assert.ok(unit, `${index}: unmatched baseline unit`)
  assert.deepEqual(
    [unit.start, unit.end, unit.sourceHash],
    [start, end, sourceHash],
    `${index}: baseline identity`,
  )
  const slice = baseline.slice(start, end)
  assert.equal(sha256(slice), sourceHash, `${index}: baseline bytes`)
  return slice
}

function exportedSymbol(source, name) {
  const match = new RegExp(
    `${name}:\\(\\)=>((?:[A-Za-z_$][\\w$]*))`,
  ).exec(source)
  assert.ok(match, `${name}: exported symbol`)
  return match[1]
}

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function loadTypeScript() {
  const candidates = [
    path.resolve(
      path.dirname(process.execPath),
      '../lib/node_modules/typescript/lib/typescript.js',
    ),
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate, 'the pinned TypeScript compiler must be available')
  const loaded = await import(pathToFileURL(candidate).href)
  return loaded.default ?? loaded
}

test('2.1.97 introduces the complete coordinated session-writer graph', boundaryOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(
    sha256(baselineBytes),
    '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e',
  )
  assert.equal(
    sha256(targetBytes),
    '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988',
  )
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  for (const name of [
    'transcriptCursorEnd',
    'trackSessionWrite',
    'setSessionMirror',
    'fireSessionMirror',
    'trackExternalWrite',
  ]) {
    assert.equal(occurrences(baseline, name), 0, `${name}: baseline`)
  }
  assert.equal(occurrences(target, 'transcriptCursorEnd'), 1)
  assert.equal(occurrences(target, 'trackSessionWrite'), 1)
  assert.equal(occurrences(target, 'setSessionMirror'), 1)
  assert.equal(occurrences(target, 'fireSessionMirror'), 1)
  assert.equal(occurrences(target, 'trackExternalWrite'), 2)

  const baselineSlices = new Map()
  for (const [index, expected] of baseline96Units) {
    baselineSlices.set(
      index,
      assertBaselineUnit(structural97, baseline, index, expected),
    )
  }
  const targetSlices = new Map()
  for (const [index, expected] of target97Units) {
    targetSlices.set(
      index,
      assertTargetUnit(structural97, target, index, expected),
    )
  }

  const cursor = exportedSymbol(target, 'transcriptCursorEnd')
  const track = exportedSymbol(target, 'trackSessionWrite')
  const setMirror = exportedSymbol(target, 'setSessionMirror')
  const fireMirror = exportedSymbol(target, 'fireSessionMirror')
  assert.match(targetSlices.get(15_817), new RegExp(`function ${escaped(cursor)}\\(`))
  assert.match(targetSlices.get(15_848), new RegExp(`function ${escaped(track)}\\(`))
  assert.match(targetSlices.get(15_846), new RegExp(`function ${escaped(setMirror)}\\(`))
  assert.match(targetSlices.get(15_847), new RegExp(`function ${escaped(fireMirror)}\\(`))
  assert.match(targetSlices.get(7_867), new RegExp(`${escaped(track)}\\(\\(\\)=>`))
  assert.match(targetSlices.get(7_867), new RegExp(`${escaped(fireMirror)}\\(`))
  assert.match(targetSlices.get(16_538), new RegExp(`${escaped(cursor)}\\(`))
  assert.match(targetSlices.get(18_396), new RegExp(`${escaped(cursor)}\\(`))
  assert.match(targetSlices.get(15_851), /trackExternalWrite\([^)]*\)\{return this\.trackWrite/)
  assert.match(targetSlices.get(17_912), /VoK\([^,]+,[^,]+,[^)]+\)/)

  assert.doesNotMatch(baselineSlices.get(7_855), /trackExternalWrite|fireMirror/)
  assert.doesNotMatch(baselineSlices.get(16_493), /stop_reason===null/)
  assert.doesNotMatch(baselineSlices.get(18_391), /Math\.max\([^,]+,[^)]+\)/)
})

test('2.1.110 evolves the singleton setter to additive mirrors while retaining coordination through 2.1.116', persistenceOptions, () => {
  const bytes109 = fs.readFileSync(target109Path)
  const bytes110 = fs.readFileSync(target110Path)
  const bytes116 = fs.readFileSync(target116Path)
  assert.equal(
    sha256(bytes109),
    '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7',
  )
  assert.equal(
    sha256(bytes110),
    'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
  )
  assert.equal(
    sha256(bytes116),
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
  )
  const target109 = bytes109.toString('utf8')
  const target110 = bytes110.toString('utf8')
  const target116 = bytes116.toString('utf8')

  assert.equal(occurrences(target109, 'setSessionMirror'), 1)
  assert.equal(occurrences(target109, 'addSessionMirror'), 0)
  assert.equal(occurrences(target110, 'setSessionMirror'), 0)
  assert.equal(occurrences(target110, 'addSessionMirror'), 1)
  assert.equal(occurrences(target116, 'setSessionMirror'), 0)
  assert.equal(occurrences(target116, 'addSessionMirror'), 1)
  for (const name of [
    'transcriptCursorEnd',
    'trackSessionWrite',
    'fireSessionMirror',
  ]) {
    assert.equal(occurrences(target109, name), 1, `${name}: 109`)
    assert.equal(occurrences(target110, name), 1, `${name}: 110`)
    assert.equal(occurrences(target116, name), 1, `${name}: 116`)
  }
  assert.equal(occurrences(target109, 'trackExternalWrite'), 2)
  assert.equal(occurrences(target110, 'trackExternalWrite'), 2)
  assert.equal(occurrences(target116, 'trackExternalWrite'), 2)

  const baselineSlices = new Map()
  for (const [index, expected] of baseline109Units) {
    baselineSlices.set(
      index,
      assertBaselineUnit(structural110, target109, index, expected),
    )
  }
  const target110Slices = new Map()
  for (const [index, expected] of target110Units) {
    target110Slices.set(
      index,
      assertTargetUnit(structural110, target110, index, expected),
    )
  }
  const target116Slices = new Map()
  for (const [index, expected] of target116Units) {
    target116Slices.set(
      index,
      assertTargetUnit(structural116, target116, index, expected),
    )
  }

  const setter109 = exportedSymbol(target109, 'setSessionMirror')
  const adder110 = exportedSymbol(target110, 'addSessionMirror')
  assert.match(baselineSlices.get(16_378), new RegExp(`function ${escaped(setter109)}\\(`))
  assert.match(baselineSlices.get(19_124), new RegExp(`${escaped(setter109)}\\(`))
  assert.match(target110Slices.get(16_510), new RegExp(`function ${escaped(adder110)}\\(`))
  assert.match(target110Slices.get(19_296), new RegExp(`${escaped(adder110)}\\(`))

  const cursor116 = exportedSymbol(target116, 'transcriptCursorEnd')
  const track116 = exportedSymbol(target116, 'trackSessionWrite')
  const fire116 = exportedSymbol(target116, 'fireSessionMirror')
  const add116 = exportedSymbol(target116, 'addSessionMirror')
  assert.match(target116Slices.get(10_893), new RegExp(`${escaped(track116)}\\(\\(\\)=>`))
  assert.match(target116Slices.get(10_893), new RegExp(`${escaped(fire116)}\\(`))
  assert.match(target116Slices.get(17_744), new RegExp(`function ${escaped(cursor116)}\\(`))
  assert.match(target116Slices.get(18_491), new RegExp(`${escaped(cursor116)}\\(`))
  assert.match(target116Slices.get(20_550), new RegExp(`${escaped(cursor116)}\\(`))
  assert.match(target116Slices.get(20_581), new RegExp(`${escaped(add116)}\\(`))
  assert.match(target116Slices.get(17_781), /trackExternalWrite\([^)]*\)\{return this\.trackWrite/)
})

test('source owns the retained cursor, tracked external write, and era-appropriate mirror callers', sourceOptions, () => {
  const session = fs.readFileSync(
    path.join(sourceRoot, 'utils/sessionStorage.ts'),
    'utf8',
  )
  const hook = fs.readFileSync(path.join(sourceRoot, 'hooks/useLogMessages.ts'), 'utf8')
  const repl = fs.readFileSync(path.join(sourceRoot, 'screens/REPL.tsx'), 'utf8')
  const query = fs.readFileSync(path.join(sourceRoot, 'QueryEngine.ts'), 'utf8')
  const speculation = fs.readFileSync(
    path.join(sourceRoot, 'services/PromptSuggestion/speculation.ts'),
    'utf8',
  )
  const print = fs.readFileSync(path.join(sourceRoot, 'cli/print.ts'), 'utf8')

  for (const fragment of [
    'export function transcriptCursorEnd(',
    'message.message.stop_reason === null',
    'export function trackSessionWrite<T>(',
    'return getProject().trackExternalWrite(fn)',
    'trackExternalWrite<T>(fn: () => Promise<T>): Promise<T>',
    'return this.trackWrite(fn)',
    'export function fireSessionMirror(',
  ]) {
    assert.ok(session.includes(fragment), fragment)
    assert.equal(occurrences(session, fragment), 1, fragment)
  }
  const usesAdditiveMirrors = session.includes(
    'export function addSessionMirror(',
  )
  if (usesAdditiveMirrors) {
    assert.equal(session.includes('setSessionMirror'), false)
    assert.match(print, /addSessionMirror\(\(filePath, entries\) =>/)
  } else {
    assert.ok(session.includes('export function setSessionMirror('))
    assert.equal(session.includes('addSessionMirror'), false)
    assert.match(print, /setSessionMirror\(\(filePath, entries\) =>/)
  }

  for (const fragment of [
    'transcriptCursorEnd,',
    'isLoading: boolean = false',
    'const lastSeenLengthRef = useRef(0)',
    'const endIndex = transcriptCursorEnd(',
    'lastRecordedLengthRef.current = endIndex',
  ]) {
    assert.ok(hook.includes(fragment), fragment)
  }
  assert.match(
    repl,
    /useLogMessages\(messages, messages\.length === initialMessages\?\.length, isLoading\)/,
  )
  for (const fragment of [
    'const initialTranscriptLength = messages.length',
    'const end = transcriptCursorEnd(',
    'Math.max(start, initialTranscriptLength)',
    'if (persistSession) void recordNewMessages()',
    'await recordNewMessages(true)',
  ]) {
    assert.ok(query.includes(fragment), fragment)
  }
  assert.ok(occurrences(query, 'await recordNewMessages(true)') >= 4)

  const trackAt = speculation.indexOf('trackSessionWrite(() =>')
  const appendAt = speculation.indexOf('appendFile(getTranscriptPath()', trackAt)
  const mirrorAt = speculation.indexOf('fireSessionMirror(getTranscriptPath()', appendAt)
  const catchAt = speculation.indexOf('.catch(() =>', mirrorAt)
  assert.ok(trackAt >= 0 && trackAt < appendAt)
  assert.ok(appendAt < mirrorAt && mirrorAt < catchAt)
})

test('the actual cursor and Project adapter enforce the runtime write barrier', sourceOptions, async () => {
  const ts = await loadTypeScript()
  const sessionPath = path.join(sourceRoot, 'utils/sessionStorage.ts')
  const session = fs.readFileSync(sessionPath, 'utf8')
  const ast = ts.createSourceFile(
    sessionPath,
    session,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const cursor = ast.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'transcriptCursorEnd',
  )
  const project = ast.statements.find(
    statement => ts.isClassDeclaration(statement) && statement.name?.text === 'Project',
  )
  assert.ok(cursor?.body, 'transcriptCursorEnd declaration')
  assert.ok(project, 'Project declaration')
  const methodNames = new Set([
    'incrementPendingWrites',
    'decrementPendingWrites',
    'trackWrite',
    'trackExternalWrite',
    'flush',
  ])
  const methods = project.members.filter(
    member =>
      ts.isMethodDeclaration(member) &&
      member.name &&
      methodNames.has(member.name.getText(ast)),
  )
  assert.equal(methods.length, methodNames.size)

  const harness = `
${cursor.getText(ast).replace(/^export\s+/, '')}
class Harness {
  pendingWriteCount = 0
  flushResolvers = []
  flushTimer = null
  activeDrain = null
  writeQueues = new Map()
  async drainWriteQueue() {}
  ${methods.map(method => method.getText(ast).replace(/^private\s+/, '')).join('\n')}
}
module.exports = { transcriptCursorEnd, Harness }
`
  const compiled = ts.transpileModule(harness, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const loaded = { exports: {} }
  new Function('module', 'exports', compiled)(loaded, loaded.exports)
  const { transcriptCursorEnd, Harness } = loaded.exports

  const user = { type: 'user' }
  const open = { type: 'assistant', message: { stop_reason: null } }
  const done = { type: 'assistant', message: { stop_reason: 'end_turn' } }
  assert.equal(transcriptCursorEnd([user, open, done], 0, false), 3)
  assert.equal(transcriptCursorEnd([user, open, done], 0, true), 1)
  assert.equal(transcriptCursorEnd([open, user, done], 1, true), 3)
  assert.equal(transcriptCursorEnd([user, done], 0, true), 2)

  const instance = new Harness()
  let release
  const externalWrite = instance.trackExternalWrite(
    () => new Promise(resolve => (release = resolve)),
  )
  assert.equal(instance.pendingWriteCount, 1)
  let flushed = false
  const flush = instance.flush().then(() => (flushed = true))
  await Promise.resolve()
  assert.equal(flushed, false)
  release('written')
  assert.equal(await externalWrite, 'written')
  await flush
  assert.equal(instance.pendingWriteCount, 0)
  assert.equal(flushed, true)

  await assert.rejects(
    instance.trackExternalWrite(async () => {
      throw new Error('write failed')
    }),
    /write failed/,
  )
  assert.equal(instance.pendingWriteCount, 0)
})
