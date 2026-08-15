import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.112-to-2.1.113'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_112_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE

const BASELINE_LENGTH = 13_711_684
const BASELINE_SHA256 =
  'bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f'
const TARGET_INNER_LENGTH = 12_986_752
const TARGET_INNER_SHA256 =
  '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba'
const TARGET_WRAPPER_LENGTH = 12_986_842
const TARGET_WRAPPER_SHA256 =
  'dda4d89e787fa455706e4f41beffc8e58d42b9094c4d155fcbf62e3f19036681'
const TARGET_WRAPPER_PREFIX_LENGTH = 87
const TARGET_WRAPPER_SUFFIX_LENGTH = 3

const targetUnits = [
  {
    index: 7205,
    nodeType: 'ClassDeclaration',
    start: 3371038,
    end: 3390827,
    sourceHash:
      '46e69fbacde9f1928676ec46317d3ecb2d4be0139b40a54c9980201495f43036',
    owner: 'src/ink/ink.tsx',
  },
  {
    index: 16363,
    nodeType: 'ClassDeclaration',
    start: 10337996,
    end: 10344265,
    sourceHash:
      '95047e4894b46ad4e779dc116f909ad830a1b85baac982787ed3353251632c29',
    owner: 'src/components/FullscreenLayout.tsx',
  },
  {
    index: 16364,
    nodeType: 'VariableDeclaration',
    start: 10344265,
    end: 10344318,
    sourceHash:
      'af117ab87db20321cbfee262095595669cd889878b058a7b97bec3e0b9d717ab',
    owner: 'src/components/FullscreenLayout.tsx',
  },
  {
    index: 16366,
    nodeType: 'FunctionDeclaration',
    start: 10344350,
    end: 10344847,
    sourceHash:
      '162e0b4a2228ba44db4b7bac4b9df5d5b4f4bab9be1415272dc9ae0275a1e9dc',
    owner: 'src/components/FullscreenLayout.tsx',
  },
  {
    index: 16367,
    nodeType: 'VariableDeclaration',
    start: 10344847,
    end: 10344865,
    sourceHash:
      '58a45e8cc69739b9b48a017563d44e08de9c2a5f7401905ea8ab6705a52b03b6',
    owner: 'src/components/FullscreenLayout.tsx',
  },
  {
    index: 16372,
    nodeType: 'FunctionDeclaration',
    start: 10345162,
    end: 10346999,
    sourceHash:
      '81755b28f8cf12617e83a1bab7e0ab0d90fd6a2d47c13306d72571a99bd4a44f',
    owner: 'src/components/FullscreenLayout.tsx',
  },
  {
    index: 16373,
    nodeType: 'FunctionDeclaration',
    start: 10346999,
    end: 10347136,
    sourceHash:
      'b7ce5787be8a2e02d6347f281ce91fa4b97bc5dde19c4d031faf1c5e101eba9b',
    owner: 'src/components/FullscreenLayout.tsx',
  },
  {
    index: 16374,
    nodeType: 'FunctionDeclaration',
    start: 10347136,
    end: 10347604,
    sourceHash:
      '714844e6bb58b8f9284abbfa1cc5a75ff1814218ca453b85d503411932afd73c',
    owner: 'src/components/FullscreenLayout.tsx',
  },
  {
    index: 16378,
    nodeType: 'FunctionDeclaration',
    start: 10347901,
    end: 10348147,
    sourceHash:
      'fe0b8b37a20023a7dd708192e8651878d5053474a72f2cfd2f68223e80798f58',
    owner: 'src/components/FullscreenLayout.tsx',
  },
  {
    index: 16385,
    nodeType: 'FunctionDeclaration',
    start: 10349426,
    end: 10353559,
    sourceHash:
      '0476686f23ae6c976ab8ffd09332a1f7a2cf41321c8411ef5fc6b82a196adf05',
    owner: 'src/components/FullscreenLayout.tsx',
  },
]

const markerCounts = new Map([
  ['nativeHistory', [0, 17]],
  ['tengu_marlin_porch', [0, 1]],
  ['consumeBackfillNeeded', [0, 2]],
  ['restoreUnderContentOverlay', [0, 3]],
])

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

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_112_BUNDLE and CLAUDE_CODE_2_1_113_BUNDLE are required'
      : false,
}

const HIDE_CURSOR = '\x1b[?25l'
const SHOW_CURSOR = '\x1b[?25h'
const RESET_SCROLL_REGION = '\x1b[r'
const CURSOR_HOME = '\x1b[H'
const ERASE_LINE = '\x1b[2K'
const ERASE_SCREEN = '\x1b[2J'
const ERASE_SCROLLBACK = '\x1b[3J'
const BSU = '\x1b[?2026h'
const ESU = '\x1b[?2026l'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(value, fragment) {
  return value.split(fragment).length - 1
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function assertFragments(contents, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${label}: ${fragment}`)
  }
}

function loadBaselineBundle(filename) {
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, BASELINE_LENGTH, 'baseline inner length')
  assert.equal(sha256(bytes), BASELINE_SHA256, 'baseline inner SHA-256')
  return bytes.toString('utf8')
}

function loadTargetInnerBundle(filename) {
  const bytes = fs.readFileSync(filename)
  const hash = sha256(bytes)
  let inner
  if (bytes.length === TARGET_INNER_LENGTH) {
    assert.equal(hash, TARGET_INNER_SHA256, 'target inner SHA-256')
    inner = bytes
  } else {
    assert.equal(bytes.length, TARGET_WRAPPER_LENGTH, 'target wrapper length')
    assert.equal(hash, TARGET_WRAPPER_SHA256, 'target wrapper SHA-256')
    inner = bytes.subarray(
      TARGET_WRAPPER_PREFIX_LENGTH,
      bytes.length - TARGET_WRAPPER_SUFFIX_LENGTH,
    )
    assert.equal(inner.length, TARGET_INNER_LENGTH, 'stripped target length')
    assert.equal(sha256(inner), TARGET_INNER_SHA256, 'stripped target SHA-256')
  }
  return inner.toString('utf8')
}

function targetStructuralRow(index) {
  return [...structural.regions, ...structural.unresolvedTarget].find(
    row => row.target?.index === index,
  )
}

function setScrollRegion(top, bottom) {
  return `\x1b[${top};${bottom}r`
}

function cursorPosition(row, column) {
  return `\x1b[${row};${column}H`
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

async function loadWriterHarness() {
  const owner = source('src/components/FullscreenLayout.tsx')
  const beginMarker = '// BEGIN TARGET113_SYNCHRONIZED_OUTPUT_WRITER'
  const endMarker = '// END TARGET113_SYNCHRONIZED_OUTPUT_WRITER'
  assert.equal(occurrences(owner, beginMarker), 1, 'writer BEGIN marker')
  assert.equal(occurrences(owner, endMarker), 1, 'writer END marker')
  const start = owner.indexOf(beginMarker)
  const end = owner.indexOf(endMarker, start)
  assert.ok(start >= 0 && end > start, 'writer marker ordering')
  const isolated = `${owner.slice(start, end + endMarker.length)}\nmodule.exports = { SynchronizedOutputWriter }`
  const ts = await loadTypeScript()
  const result = ts.transpileModule(isolated, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  })
  const errors = (result.diagnostics ?? []).filter(
    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
  )
  assert.deepEqual(errors, [], 'writer source transpiles without syntax errors')

  const dependencies = {
    HIDE_CURSOR,
    SHOW_CURSOR,
    RESET_SCROLL_REGION,
    CURSOR_HOME,
    ERASE_LINE,
    ERASE_SCREEN,
    ERASE_SCROLLBACK,
    setScrollRegion,
    cursorPosition,
    BSU,
    ESU,
    isSynchronizedOutputSupported: () => true,
  }
  const module = { exports: {} }
  new Function(
    'exports',
    'module',
    ...Object.keys(dependencies),
    result.outputText,
  )(
    module.exports,
    module,
    ...Object.values(dependencies),
  )
  assert.equal(typeof module.exports.SynchronizedOutputWriter, 'function')
  return module.exports.SynchronizedOutputWriter
}

test(
  'target113 authenticates the synchronized Ink and DECSTBM structural lane',
  bundleOptions,
  () => {
    const baseline = loadBaselineBundle(baselinePath)
    const target = loadTargetInnerBundle(targetPath)

    for (const expected of targetUnits) {
      const row = targetStructuralRow(expected.index)
      assert.ok(row, `target unit ${expected.index}: structural row`)
      assert.equal(row.classification, 'unresolved')
      assert.deepEqual(
        [
          row.target.index,
          row.target.nodeType,
          row.target.start,
          row.target.end,
          row.target.sourceHash,
        ],
        [
          expected.index,
          expected.nodeType,
          expected.start,
          expected.end,
          expected.sourceHash,
        ],
        `target unit ${expected.index}: ${expected.owner}`,
      )
      assert.equal(
        sha256(target.slice(expected.start, expected.end)),
        expected.sourceHash,
        `target unit ${expected.index}: bundle bytes`,
      )
    }

    for (const [marker, [baselineCount, targetCount]] of markerCounts) {
      assert.equal(occurrences(baseline, marker), baselineCount, marker)
      assert.equal(occurrences(target, marker), targetCount, marker)
    }

    const ink = target.slice(targetUnits[0].start, targetUnits[0].end)
    assertFragments(
      ink,
      [
        'frameSink=null',
        'if(this.frameSink)',
        'this.frameSink(O,this.stylePool)',
        'getStylePool(){return this.stylePool}',
        'getCharPool(){return this.charPool}',
        'getHyperlinkPool(){return this.hyperlinkPool}',
        '"\\x1B7"+',
        '+"\\x1B8"+',
      ],
      'unit 7205 Ink sink',
    )

    const writer = target.slice(targetUnits[1].start, targetUnits[1].end)
    assertFragments(
      writer,
      [
        'nativeHistory=[]',
        'setup(){',
        'suspend(){',
        'resume(H,$){',
        'restore(){',
        'syncViewport(H,$){',
        'draw(H){',
        'computeLayout(H,$){',
        'handleResize(H,$){',
        'tickPump(){',
        'consumeBackfillNeeded(){',
        'consumeGapRange(){',
        'primeBackfill(H){',
        'switchTranscript(){',
        'restoreUnderContentOverlay(){',
      ],
      'unit 16363 synchronized writer',
    )
    assert.equal(
      target.slice(targetUnits[2].start, targetUnits[2].end),
      'var p1$="\\x1B[0m",o36="\\x1B[K",p01=100,Ve$=1e4,BuH=4;',
    )

    const serializer = target.slice(targetUnits[3].start, targetUnits[3].end)
    assertFragments(
      serializer,
      [
        'M.width===2',
        'M.width===3',
        'M.hyperlink',
        '$.transition(z,M.styleId)',
      ],
      'unit 16366 row serializer',
    )

    const layout = target.slice(targetUnits[5].start, targetUnits[5].end)
    assertFragments(
      layout,
      [
        'new a36(process.stdout,A,z)',
        'X.frameSink=',
        'X.isAltScreenActive',
        'Z.suspend()',
        'Z.resume(',
        'Z.tickPump()',
        'getDomElement()',
        'Z.syncViewport(',
        'Z.consumeGapRange()',
        'Z.consumeBackfillNeeded()',
        'X.getStylePool()',
        'Z.primeBackfill(',
        'X.frameSink=null',
        'P.restore()',
      ],
      'unit 16372 synchronized layout',
    )

    const backfill = target.slice(targetUnits[7].start, targetUnits[7].end)
    assertFragments(
      backfill,
      ['getCharPool()', 'getHyperlinkPool()', 'f.dirty=!0'],
      'unit 16374 native-history backfill',
    )

    const gate = target.slice(targetUnits[8].start, targetUnits[8].end)
    assertFragments(
      gate,
      [
        'process.stdout.isTTY',
        'process.env.CLAUDE_CODE_DECSTBM',
        'tengu_marlin_porch',
      ],
      'unit 16378 synchronized lane gate',
    )
    const fullscreen = target.slice(targetUnits[9].start, targetUnits[9].end)
    assert.ok(fullscreen.includes('if(Ee$())'))
    assert.ok(fullscreen.includes('createElement(DR7,'))

    const authStatus = target.indexOf('c$.createElement(I8_,null)')
    const transcriptEnd = target.indexOf('c$.createElement(MR7,null)')
    assert.ok(authStatus >= 0, 'AwsAuthStatusBox bundle call')
    assert.ok(transcriptEnd > authStatus, 'transcript marker follows auth status')
    assert.ok(
      transcriptEnd - authStatus < 100,
      'transcript marker is adjacent to AwsAuthStatusBox',
    )
  },
)

test(
  'recovered owners wire the Ink sink, writer, gate, layout, and transcript marker',
  sourceOptions,
  () => {
    const ink = source('src/ink/ink.tsx')
    assertFragments(
      ink,
      [
        "frameSink: ((frame: Frame, stylePool: StylePool) => boolean | 'tick') | null = null",
        'const sinkResult = this.frameSink(frame, this.stylePool)',
        'getStylePool(): StylePool',
        'getCharPool(): CharPool',
        'getHyperlinkPool(): HyperlinkPool',
        "'\\x1b7' + RESET_SCROLL_REGION + '\\x1b8' + SHOW_CURSOR",
      ],
      'src/ink/ink.tsx',
    )

    const fullscreen = source('src/components/FullscreenLayout.tsx')
    assertFragments(
      fullscreen,
      [
        '// BEGIN TARGET113_SYNCHRONIZED_OUTPUT_WRITER',
        '// END TARGET113_SYNCHRONIZED_OUTPUT_WRITER',
        'class SynchronizedOutputWriter',
        'nativeHistory',
        'setup()',
        'suspend()',
        'resume(',
        'restore()',
        'syncViewport(',
        'draw(',
        'computeLayout(',
        'handleResize(',
        'tickPump()',
        'consumeBackfillNeeded()',
        'consumeGapRange()',
        'primeBackfill(',
        'switchTranscript()',
        'restoreUnderContentOverlay()',
        'setScrollRegion(1, Math.max(2, this.contentHeight))',
        'BSU',
        'ESU',
        'function serializeSynchronizedRow',
        'function SynchronizedOutputLayout',
        'function isSynchronizedInlineOutputEnabled',
        'if (!process.stdout.isTTY)',
        'if (isTmuxControlMode())',
        'if (!isSynchronizedOutputSupported() || process.env.ZELLIJ != null)',
        'if (isFullscreenEnvEnabled())',
        'isEnvTruthy(process.env.CLAUDE_CODE_DECSTBM)',
        "getFeatureValue_CACHED_MAY_BE_STALE('tengu_marlin_porch', false)",
        'instances.get(process.stdout)',
        '.frameSink =',
        'getDomElement()',
        'activeWriter.consumeBackfillNeeded()',
        'writer.restore()',
        'function SynchronizedOutputTranscriptEnd',
      ],
      'src/components/FullscreenLayout.tsx',
    )
    const begin = fullscreen.indexOf(
      '// BEGIN TARGET113_SYNCHRONIZED_OUTPUT_WRITER',
    )
    const end = fullscreen.indexOf(
      '// END TARGET113_SYNCHRONIZED_OUTPUT_WRITER',
    )
    const serializer = fullscreen.indexOf(
      'function serializeSynchronizedRow',
    )
    assert.ok(begin < end && end < serializer, 'writer marker region boundary')

    const scrollBox = source('src/ink/components/ScrollBox.tsx')
    assertFragments(
      scrollBox,
      ['getDomElement: () => DOMElement | null', 'getDomElement()'],
      'src/ink/components/ScrollBox.tsx',
    )

    const repl = source('src/screens/REPL.tsx')
    assert.ok(
      repl.includes(
        'scrollRef={isFullscreenEnvEnabled() || isSynchronizedInlineOutputEnabled() ? scrollRef : undefined}',
      ),
      'REPL gives Messages the synchronized lane scroll handle',
    )
    assert.equal(
      occurrences(repl, '<SynchronizedOutputTranscriptEnd />'),
      1,
      'one REPL transcript marker',
    )
    const authStatus = repl.indexOf('<AwsAuthStatusBox />')
    const transcriptEnd = repl.indexOf('<SynchronizedOutputTranscriptEnd />')
    assert.ok(authStatus >= 0, 'REPL AwsAuthStatusBox')
    assert.ok(transcriptEnd > authStatus, 'REPL transcript marker ordering')
  },
)

test(
  'synchronized writer executes setup, viewport, draw, resize, suspend, resume, and restore',
  sourceOptions,
  async () => {
    const SynchronizedOutputWriter = await loadWriterHarness()
    const writes = []
    const stream = {
      write(chunk) {
        writes.push(String(chunk))
        return true
      },
    }
    const writer = new SynchronizedOutputWriter(stream, 20, 10)

    writer.setup()
    assert.equal(writes.length, 1)
    assert.ok(writes[0].startsWith(HIDE_CURSOR + '\n'.repeat(4)))
    assert.ok(writes[0].includes(setScrollRegion(1, 6)))
    assert.ok(writes[0].includes(cursorPosition(7, 1) + ERASE_LINE))

    const layout = writer.computeLayout(['prompt'], [])
    assert.deepEqual(layout, {
      contentHeight: 6,
      bottomTop: 6,
      bottomLines: ['prompt'],
      overlayLines: [],
    })
    const viewport = {
      lines: ['alpha', 'beta'],
      scrollTop: 0,
      scrollHeight: 2,
      transcriptEnd: 2,
    }
    writer.syncViewport(viewport, layout.contentHeight)
    assert.equal(writes.length, 1, 'viewport changes buffer until draw')
    writer.draw(layout)
    assert.equal(writes.length, 2)
    assert.ok(writes[1].startsWith(BSU))
    assert.ok(writes[1].includes(cursorPosition(1, 1) + 'alpha'))
    assert.ok(writes[1].includes(cursorPosition(2, 1) + 'beta'))
    assert.ok(writes[1].includes(cursorPosition(7, 1) + 'prompt'))
    assert.ok(writes[1].endsWith(ESU))

    const afterFirstFrame = writes.length
    writer.draw(layout)
    assert.equal(
      writes.length,
      afterFirstFrame,
      'an unchanged draw is suppressed before it reaches the stream',
    )

    writer.syncViewport(
      {
        lines: ['beta', 'gamma'],
        scrollTop: 1,
        scrollHeight: 3,
        transcriptEnd: 3,
      },
      layout.contentHeight,
    )
    writer.draw(layout)
    assert.equal(writes.length, afterFirstFrame + 1)
    assert.ok(writes.at(-1).includes('gamma'))

    assert.equal(writer.handleResize(20, 11), 'adjust')
    assert.ok(writes.at(-1).includes(setScrollRegion(1, 7)))
    assert.equal(writer.handleResize(21, 10), 'replay')
    assertFragments(
      writes.at(-1),
      [
        RESET_SCROLL_REGION,
        ERASE_SCREEN,
        ERASE_SCROLLBACK,
        CURSOR_HOME,
        setScrollRegion(1, 6),
      ],
      'resize replay output',
    )

    writer.suspend()
    assert.equal(writes.at(-1), RESET_SCROLL_REGION)
    const suspendedWrites = writes.length
    writer.syncViewport(viewport, 6)
    writer.draw(layout)
    assert.equal(writes.length, suspendedWrites, 'suspended writer is inert')

    writer.resume(22, 12)
    assertFragments(
      writes.at(-1),
      [
        HIDE_CURSOR,
        setScrollRegion(1, 8),
        ERASE_SCREEN,
        ERASE_SCROLLBACK,
        CURSOR_HOME,
      ],
      'resume output',
    )

    writer.restore()
    const restoredWrites = writes.length
    assertFragments(
      writes.at(-1),
      ['\x1b[0m', RESET_SCROLL_REGION, cursorPosition(9, 1), SHOW_CURSOR],
      'restore output',
    )
    writer.restore()
    assert.equal(writes.length, restoredWrites, 'restore is idempotent')
  },
)
