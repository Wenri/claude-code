import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'

const pinnedUnits = [
  {
    index: 7650,
    nodeType: 'FunctionDeclaration',
    start: 3670629,
    end: 3670910,
    sourceHash:
      '348f4c0b20f64f796be77828b4eca4b464fd3ff274d599162bafc7acda41243d',
  },
  {
    index: 19275,
    nodeType: 'FunctionDeclaration',
    start: 11785279,
    end: 11787125,
    sourceHash:
      '1bb5bf81295ce4e5a0cac9b2bf8ca68028c7e99bbf44b4ec2642ea8a73dd1fd6',
  },
  {
    index: 19276,
    nodeType: 'FunctionDeclaration',
    start: 11787125,
    end: 11791850,
    sourceHash:
      '9a118a0a46a1704e2ed57cc28e5c883973930f44770c8c594941667bdb6c9ca0',
  },
  {
    index: 19281,
    nodeType: 'FunctionDeclaration',
    start: 11792811,
    end: 11795036,
    sourceHash:
      'b0e1d2867e401e65c235dcf043694a8fc4ac65a85e6e771505327c22067282a5',
  },
  {
    index: 19329,
    nodeType: 'FunctionDeclaration',
    start: 11803951,
    end: 11831855,
    sourceHash:
      '997c52d29b50bc489a62979e07f11275e0da97d2e5cd7ce05c534b8f8148f609',
  },
  {
    index: 19333,
    nodeType: 'VariableDeclaration',
    start: 11832298,
    end: 11832972,
    sourceHash:
      '53a89a029a7c1346a808a688fbc31edd5cd58fa4ce3c0c24ce7abc940e77cea2',
  },
]

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function parseReferences(input) {
  const pattern =
    /\[(Pasted text|Image|\.\.\.Truncated text) #(\d+)(?: \+\d+ lines)?(\.)*\]/g
  return [...input.matchAll(pattern)]
    .map(match => ({
      id: Number.parseInt(match[2] ?? '0'),
      match: match[0],
      index: match.index,
    }))
    .filter(reference => reference.id > 0)
}

function assertExpansionContract(expand) {
  const input =
    'lead [Image #20] [Pasted text #9 +2 lines] tail [Pasted text #4]'
  const latestContent = 'highest\ntext'
  const latestIndex = input.indexOf('[Pasted text #9 +2 lines]')
  assert.deepEqual(
    expand(input, {
      4: { id: 4, type: 'text', content: 'rightmost' },
      9: { id: 9, type: 'text', content: latestContent },
      20: { id: 20, type: 'image', content: 'not inline text' },
    }),
    {
      expanded: input.replace('[Pasted text #9 +2 lines]', latestContent),
      id: 9,
      cursorOffset: latestIndex + latestContent.length,
    },
  )

  assert.equal(
    expand('[Image #31]', {
      31: { id: 31, type: 'image', content: 'image bytes' },
    }),
    null,
  )
  assert.equal(
    expand('[Pasted text #32]', {
      32: { id: 32, type: 'text', content: 'x'.repeat(100_001) },
    }),
    null,
  )

  const boundary = expand('a[Pasted text #33]z', {
    33: { id: 33, type: 'text', content: 'x'.repeat(100_000) },
  })
  assert.equal(boundary?.id, 33)
  assert.equal(boundary?.cursorOffset, 100_001)
  assert.equal(boundary?.expanded.length, 100_002)
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
  const module = await import(pathToFileURL(candidate).href)
  return module.default ?? module
}

async function instantiateHistorySource() {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(source('src/history.ts'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const module = { exports: {} }
  new Function('exports', 'module', 'require', javascript)(
    module.exports,
    module,
    () => ({}),
  )
  return module.exports
}

test(
  'target 2.1.116 authenticates repeat-paste expansion and its UI owners',
  pairOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselineBundlePath)
    const targetBytes = fs.readFileSync(targetBundlePath)
    assert.equal(baselineBytes.length, 12_986_755)
    assert.equal(targetBytes.length, 13_102_272)
    assert.equal(sha256(baselineBytes), baselineSha256)
    assert.equal(sha256(targetBytes), targetSha256)
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')

    for (const unit of pinnedUnits) {
      const region = structural.regions.find(
        candidate => candidate.target?.index === unit.index,
      )
      assert.ok(region, `target structural unit ${unit.index}`)
      assert.equal(region.classification, 'unresolved')
      assert.deepEqual(
        [
          region.target.index,
          region.target.nodeType,
          region.target.start,
          region.target.end,
          region.target.sourceHash,
        ],
        [
          unit.index,
          unit.nodeType,
          unit.start,
          unit.end,
          unit.sourceHash,
        ],
        `${unit.index}: structural identity`,
      )
      assert.equal(
        sha256(target.slice(unit.start, unit.end)),
        unit.sourceHash,
        `${unit.index}: bytes`,
      )
    }

    for (const fragment of [
      'paste again to expand',
      'showExpandPasteHint',
      'leftArrowPending',
    ]) {
      assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
      assert.equal(target.includes(fragment), true, `${fragment}: target`)
    }

    const helperUnit = target.slice(pinnedUnits[0].start, pinnedUnits[0].end)
    const targetExpand = new Function(
      'CB',
      'lg8',
      `return (${helperUnit})`,
    )(parseReferences, 100_000)
    assertExpansionContract(targetExpand)

    assert.ok(
      target
        .slice(pinnedUnits[1].start, pinnedUnits[1].end)
        .includes('paste again to expand'),
    )
    assert.ok(
      target
        .slice(pinnedUnits[3].start, pinnedUnits[3].end)
        .includes('showExpandPasteHint'),
    )
    const promptInputUnit = target.slice(
      pinnedUnits[4].start,
      pinnedUnits[4].end,
    )
    assert.match(
      promptInputUnit,
      /\.type==="text"&&[^&]+\.content===[^&]+&&[^)]+\([^)]+\)/,
    )
    assert.match(promptInputUnit, /setTimeout\([\s\S]+,8000,/)
  },
)

test('source keeps the exact repeat-paste owner graph', sourceOptions, () => {
  const owners = new Map([
    ['src/history.ts', source('src/history.ts')],
    [
      'src/components/PromptInput/PromptInput.tsx',
      source('src/components/PromptInput/PromptInput.tsx'),
    ],
    [
      'src/components/PromptInput/PromptInputFooter.tsx',
      source('src/components/PromptInput/PromptInputFooter.tsx'),
    ],
    [
      'src/components/PromptInput/PromptInputFooterLeftSide.tsx',
      source('src/components/PromptInput/PromptInputFooterLeftSide.tsx'),
    ],
  ])
  const ownersOf = fragment =>
    [...owners]
      .filter(([, contents]) => contents.includes(fragment))
      .map(([relative]) => relative)

  assert.deepEqual(ownersOf('expandHighestPastedTextRef'), [
    'src/history.ts',
    'src/components/PromptInput/PromptInput.tsx',
  ])
  assert.deepEqual(ownersOf('showExpandPasteHint'), [
    'src/components/PromptInput/PromptInput.tsx',
    'src/components/PromptInput/PromptInputFooter.tsx',
    'src/components/PromptInput/PromptInputFooterLeftSide.tsx',
  ])
  assert.deepEqual(ownersOf('leftArrowPending'), [
    'src/components/PromptInput/PromptInput.tsx',
    'src/components/PromptInput/PromptInputFooter.tsx',
    'src/components/PromptInput/PromptInputFooterLeftSide.tsx',
  ])
  assert.deepEqual(ownersOf('paste again to expand'), [
    'src/components/PromptInput/PromptInputFooterLeftSide.tsx',
  ])

  const history = owners.get('src/history.ts')
  const promptInput = owners.get(
    'src/components/PromptInput/PromptInput.tsx',
  )
  const footer = owners.get(
    'src/components/PromptInput/PromptInputFooter.tsx',
  )
  const leftSide = owners.get(
    'src/components/PromptInput/PromptInputFooterLeftSide.tsx',
  )
  assert.ok(
    history.includes('export function expandHighestPastedTextRef('),
  )
  assert.ok(
    promptInput.includes(
      'const result = expandHighestPastedTextRef(input, pastedContents)',
    ),
  )
  assert.match(
    promptInput,
    /\.content === text && expandPaste\(latestPasteId\)/,
  )
  assert.match(promptInput, /setTimeout\([\s\S]*?8_?000/)
  assert.ok(footer.includes('showExpandPasteHint={showExpandPasteHint}'))
  assert.ok(footer.includes('leftArrowPending={leftArrowPending}'))
  assert.ok(
    leftSide.indexOf('if (isPasting)') <
      leftSide.indexOf('if (showExpandPasteHint'),
  )
})

test(
  'source helper expands only the highest eligible text reference',
  sourceOptions,
  async () => {
    const history = await instantiateHistorySource()
    assert.equal(typeof history.expandHighestPastedTextRef, 'function')
    assertExpansionContract(history.expandHighestPastedTextRef)
  },
)
