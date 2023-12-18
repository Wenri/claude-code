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
const target101Path = process.env.CLAUDE_CODE_2_1_101_BUNDLE
const target116Path = process.env.CLAUDE_CODE_2_1_116_BUNDLE

const structural97 = readGzipJson(
  'recovery/cases/2.1.96-to-2.1.97/structural/generated-delta.json.gz',
)
const structural101 = readGzipJson(
  'recovery/cases/2.1.100-to-2.1.101/structural/generated-delta.json.gz',
)
const structural116 = readGzipJson(
  'recovery/cases/2.1.114-to-2.1.116/structural/generated-delta.json.gz',
)

const target97Units = new Map([
  [
    361,
    [
      30_071,
      32_598,
      '59d65c5f7cc525f63e2d9a46f2ce6f0fe6fd6d2b474996043f2693c1ab90293e',
    ],
  ],
  [
    513,
    [
      41_142,
      41_190,
      '233c14fb983e6f7de47d9e82e6e52428aae860dfd55eeb8a7be9beb7cc543597',
    ],
  ],
  [
    514,
    [
      41_190,
      41_235,
      'c4c540eafd565712ab4fe599dd687f4d81d178f975774e84f1bd720233496497',
    ],
  ],
  [
    515,
    [
      41_235,
      41_283,
      'a2f51a48ff565a0734c1fde126fb9fa1d48a49d0e411682b81c2f6794bbca0cb',
    ],
  ],
])

const target116Units = new Map([
  [
    366,
    [
      31_685,
      34_332,
      'e3f56ca8df4ad707dcb9f4bb46f35e0ad78078d64c6ba65cc298fa4fe9b5c5fc',
      'unresolved',
    ],
  ],
  [
    518,
    [
      42_755,
      42_803,
      '03c7a132a5ffa2230f9a69e9124d7adae7447ea2d9b8aa8e8ab10f6532dffd74',
      'matched',
    ],
  ],
  [
    519,
    [
      42_803,
      42_848,
      '8fbf81d9a337a69e903d7304fbc4254ccd1759183de72363885f1bc88c0e1b53',
      'matched',
    ],
  ],
  [
    520,
    [
      42_848,
      42_896,
      '2363f1c5d8209433166270c6596563d50a3f30386b727e4ace9251a4e588460b',
      'matched',
    ],
  ],
  [
    8_672,
    [
      4_108_241,
      4_109_012,
      '8c58fe50eed0cb1cbd371136973489bfa2b706363f9588a7835dbf39754ad1b5',
      'matched',
    ],
  ],
  [
    8_677,
    [
      4_109_758,
      4_109_983,
      '4d5edfb89144c74fda0dbbc21d230a64d9d1a7f0734b19cdfeebd10db373b2f5',
      'matched',
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
    : !target101Path || !target116Path
      ? 'CLAUDE_CODE_2_1_101_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
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

function assertUnit(structural, target, index, expected) {
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

test('2.1.97 introduces the null-prototype loop-chain registry and three accessors', boundaryOptions, () => {
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
  assert.equal(occurrences(baseline, 'loopChainStartedAt'), 0)
  assert.equal(occurrences(target, 'loopChainStartedAt'), 4)

  const baselineInitializer = structural97.unmatchedBaseline.find(
    unit => unit.index === 361,
  )
  assert.deepEqual(
    [
      baselineInitializer.start,
      baselineInitializer.end,
      baselineInitializer.sourceHash,
    ],
    [
      29_942,
      32_409,
      '2af6a2d1719df649486ba9cac44d2433d956f7f75b88dcb2d9d0af8e620196d1',
    ],
  )
  assert.equal(
    target
      .slice(...target97Units.get(361).slice(0, 2))
      .includes('loopChainStartedAt:Object.create(null)'),
    true,
  )
  for (const [index, expected] of target97Units) {
    assertUnit(structural97, target, index, expected)
  }
})

test('target101 activates the registry and target116 retains the full runtime graph', persistenceOptions, () => {
  const target101Bytes = fs.readFileSync(target101Path)
  const target116Bytes = fs.readFileSync(target116Path)
  assert.equal(
    sha256(target101Bytes),
    'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
  )
  assert.equal(
    sha256(target116Bytes),
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
  )
  const target101 = target101Bytes.toString('utf8')
  const target116 = target116Bytes.toString('utf8')

  const scheduler101 = assertUnit(
    structural101,
    target101,
    6_863,
    [
      4_985_290,
      4_986_062,
      '856c36105e6370e6b5063f35d199fb1451085bd4a14bd00c59be9945ce77670d',
    ],
  )
  assert.match(scheduler101, /loop_dynamic_wakeup_aged_out/)
  assert.match(scheduler101, /loop_dynamic_wakeup_scheduled/)

  const latestSlices = new Map()
  for (const [index, expected] of target116Units) {
    latestSlices.set(
      index,
      assertUnit(structural116, target116, index, expected),
    )
  }
  assert.equal(occurrences(target116, 'loopChainStartedAt'), 4)
  assert.ok(latestSlices.get(366).includes('loopChainStartedAt:Object.create(null)'))
  assert.match(latestSlices.get(8_672), /loop_dynamic_wakeup_aged_out/)
  assert.match(latestSlices.get(8_672), /loop_dynamic_wakeup_scheduled/)
  const deleteAccessorName = /^function\s+([^($]+)\(/.exec(
    latestSlices.get(520),
  )?.[1]
  assert.ok(deleteAccessorName, 'latest delete accessor name')
  assert.match(
    latestSlices.get(8_677),
    new RegExp(
      `${deleteAccessorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\([^)]*\\.prompt\\)`,
    ),
  )
})

test('source owns isolated prompt-keyed get, set, and delete semantics', sourceOptions, async () => {
  const ownerPath = path.join(sourceRoot, 'bootstrap/state.ts')
  const owner = fs.readFileSync(ownerPath, 'utf8')
  for (const fragment of [
    'loopChainStartedAt: Record<string, LoopChainState>',
    'loopChainStartedAt: Object.create(null) as Record<string, LoopChainState>',
    'export function getLoopChainStartedAt(',
    'return STATE.loopChainStartedAt[prompt]',
    'export function setLoopChainStartedAt(',
    'STATE.loopChainStartedAt[prompt] = state',
    'export function deleteLoopChainStartedAt(prompt: string): void',
    'delete STATE.loopChainStartedAt[prompt]',
  ]) {
    assert.ok(owner.includes(fragment), fragment)
    assert.equal(occurrences(owner, fragment), 1, fragment)
  }

  const ts = await loadTypeScript()
  const ast = ts.createSourceFile(
    ownerPath,
    owner,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const names = new Set([
    'getLoopChainStartedAt',
    'setLoopChainStartedAt',
    'deleteLoopChainStartedAt',
  ])
  const declarations = ast.statements.filter(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      names.has(statement.name.text),
  )
  assert.equal(declarations.length, 3)
  const harness = `
const STATE = { loopChainStartedAt: Object.create(null) }
${declarations.map(declaration => declaration.getText(ast).replace(/^export\s+/, '')).join('\n')}
module.exports = { STATE, getLoopChainStartedAt, setLoopChainStartedAt, deleteLoopChainStartedAt }
`
  const compiled = ts.transpileModule(harness, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const loaded = { exports: {} }
  new Function('module', 'exports', compiled)(loaded, loaded.exports)
  const api = loaded.exports

  assert.equal(Object.getPrototypeOf(api.STATE.loopChainStartedAt), null)
  assert.equal(api.getLoopChainStartedAt('same prompt'), undefined)
  api.setLoopChainStartedAt('same prompt', {
    startedAt: 10,
    lastScheduledFor: 20,
  })
  assert.deepEqual(api.getLoopChainStartedAt('same prompt'), {
    startedAt: 10,
    lastScheduledFor: 20,
  })
  api.setLoopChainStartedAt('__proto__', {
    startedAt: 30,
    lastScheduledFor: 40,
    agedOut: true,
  })
  assert.equal(api.getLoopChainStartedAt('__proto__').agedOut, true)
  api.deleteLoopChainStartedAt('same prompt')
  assert.equal(api.getLoopChainStartedAt('same prompt'), undefined)
})
