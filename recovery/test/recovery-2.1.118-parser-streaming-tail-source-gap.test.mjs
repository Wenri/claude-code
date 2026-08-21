import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  applyTarget118ParserStreamingTailSourceRecovery,
  TARGET118_PARSER_STREAMING_TAIL_INPUT_FILE,
  TARGET118_PARSER_STREAMING_TAIL_OUTPUT_FILE,
  TARGET118_PARSER_STREAMING_TAIL_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/replay-parser-streaming-tail-source-gap.mjs'

const root = process.cwd()
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      'recovery/test/recovery-2.1.118-parser-streaming-tail-source-gap.json',
    ),
    'utf8',
  ),
)

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })

let typescriptPromise
function loadTypeScript() {
  typescriptPromise ??= import(
    pathToFileURL(
      path.join(
        root,
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      ),
    ).href
  ).then(imported => imported.default ?? imported)
  return typescriptPromise
}

function materializeRawParser() {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target118-parser-streaming-tail-'),
  )
  const sourceRoot = path.join(temporary, 'src')
  const filename = path.join(sourceRoot, 'ink/termio/parser.ts')
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  const result = spawnSync(
    'git',
    ['show', `${fixture.inputs.sourceCommit}:${fixture.inputs.sourceFile.path}`],
    { cwd: root, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), fixture.inputs.sourceFile.input)
  fs.writeFileSync(filename, result.stdout)
  return { temporary, sourceRoot, filename }
}

function parserDeclaration(ts, text) {
  const parsed = ts.createSourceFile(
    'parser.ts',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(parsed.parseDiagnostics.length, 0)
  const declarations = parsed.statements.filter(
    statement =>
      ts.isClassDeclaration(statement) && statement.name?.text === 'Parser',
  )
  assert.equal(declarations.length, 1)
  return { parsed, declaration: declarations[0] }
}

test('Target118 parser streaming-tail fixture freezes its exact bounded replay', () => {
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.117-to-2.1.118')
  assert.deepEqual(fixture.summary, {
    units: 1,
    residues: 14,
    indicesSha256: sha256(JSON.stringify([fixture.row.targetIndex])),
    residueIdentitiesSha256: sha256(JSON.stringify(fixture.row.residues)),
  })
  assert.deepEqual(TARGET118_PARSER_STREAMING_TAIL_INPUT_FILE, {
    path: fixture.inputs.sourceFile.path,
    ...fixture.inputs.sourceFile.input,
  })
  assert.deepEqual(TARGET118_PARSER_STREAMING_TAIL_OUTPUT_FILE, {
    path: fixture.inputs.sourceFile.path,
    ...fixture.inputs.sourceFile.output,
  })
  assert.deepEqual(
    TARGET118_PARSER_STREAMING_TAIL_OWNER_OVERRIDES.map(row => ({
      targetIndex: row.targetIndex,
      paths: [...row.paths],
      evidenceIds: [...row.evidenceIds],
    })),
    [
      {
        targetIndex: fixture.row.targetIndex,
        paths: [fixture.row.ownerPath],
        evidenceIds: fixture.row.evidenceIds,
      },
    ],
  )
  assert.notEqual(fixture.row.ownerPath, fixture.row.rejectedOwnerPath)
})

test('authenticated bundles pin the new Parser class and its stable forward lineage', () => {
  for (let index = 0; index < fixture.temporalUnits.length; index++) {
    const unit = fixture.temporalUnits[index]
    const bundleInput = fixture.inputs.bundles[index]
    const ledgerInput = fixture.inputs.structuralLedgers[index]
    assert.equal(bundleInput.version, unit.version)
    assert.equal(ledgerInput.version, unit.version)
    const bundle = fs.readFileSync(path.join(root, bundleInput.path))
    const ledgerBytes = fs.readFileSync(path.join(root, ledgerInput.path))
    assert.deepEqual(descriptor(bundle), {
      bytes: bundleInput.bytes,
      sha256: bundleInput.sha256,
    })
    assert.deepEqual(descriptor(ledgerBytes), {
      bytes: ledgerInput.bytes,
      sha256: ledgerInput.sha256,
    })
    const structural = JSON.parse(gunzipSync(ledgerBytes))
    const region = structural.regions.find(
      candidate => candidate.target.index === unit.index,
    )
    assert(region, `${unit.version}:u${unit.index}`)
    assert.deepEqual(
      {
        index: region.target.index,
        nodeType: region.target.nodeType,
        start: region.target.start,
        end: region.target.end,
        bytes: region.target.end - region.target.start,
        sourceHash: region.target.sourceHash,
        coarseHash: region.target.coarseHash,
      },
      {
        index: unit.index,
        nodeType: unit.nodeType,
        start: unit.start,
        end: unit.end,
        bytes: unit.bytes,
        sourceHash: unit.sourceHash,
        coarseHash: unit.coarseHash,
      },
    )
    assert.deepEqual(descriptor(bundle.subarray(unit.start, unit.end)), {
      bytes: unit.bytes,
      sha256: unit.sourceHash,
    })
  }

  const baseline = fixture.temporalUnits[0]
  const target = fixture.temporalUnits[1]
  const next = fixture.temporalUnits[2]
  const baselineText = fs
    .readFileSync(path.join(root, fixture.inputs.bundles[0].path), 'utf8')
    .slice(baseline.start, baseline.end)
  const targetBundle = fs.readFileSync(
    path.join(root, fixture.inputs.bundles[1].path),
    'utf8',
  )
  const targetText = targetBundle.slice(target.start, target.end)
  const nextText = fs
    .readFileSync(path.join(root, fixture.inputs.bundles[2].path), 'utf8')
    .slice(next.start, next.end)
  assert.doesNotMatch(baselineText, /holdTail|forOutput|127462|127487/)
  for (const marker of ['holdTail', 'forOutput', '127462', '127487']) {
    assert.match(targetText, new RegExp(marker))
    assert.match(nextText, new RegExp(marker))
  }
  assert.equal(target.coarseHash, next.coarseHash)
  for (const [kind, value, start, end] of fixture.row.residues) {
    assert(['property', 'number'].includes(kind))
    assert(start >= target.start && end <= target.end)
    assert.equal(targetBundle.slice(start, end), value)
  }
})

test('Parser replay is exact, idempotent, typed, and fail-closed', async t => {
  const ts = await loadTypeScript()
  const { temporary, sourceRoot, filename } = materializeRawParser()
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  assert.deepEqual(
    applyTarget118ParserStreamingTailSourceRecovery({ sourceRoot }),
    { status: 'recovered', files: [fixture.inputs.sourceFile.path] },
  )
  assert.deepEqual(
    applyTarget118ParserStreamingTailSourceRecovery({ sourceRoot }),
    { status: 'already-recovered', files: [] },
  )
  const output = fs.readFileSync(filename)
  assert.deepEqual(descriptor(output), fixture.inputs.sourceFile.output)

  const text = output.toString()
  const { parsed, declaration } = parserDeclaration(ts, text)
  const declarationText = text.slice(declaration.getStart(parsed), declaration.end)
  assert.deepEqual(descriptor(Buffer.from(declarationText)), {
    bytes: fixture.inputs.sourceFile.outputDeclaration.bytes,
    sha256: fixture.inputs.sourceFile.outputDeclaration.sha256,
  })
  const memberNames = declaration.members
    .map(member => member.name?.getText(parsed))
    .filter(Boolean)
  for (const field of fixture.sourceContract.fields) {
    assert(memberNames.includes(field), field)
  }
  for (const method of fixture.sourceContract.methods.filter(
    name => name !== 'constructor',
  )) {
    assert(memberNames.includes(method), method)
  }
  assert.equal(
    declaration.members.filter(member => ts.isConstructorDeclaration(member))
      .length,
    1,
  )
  assert(!memberNames.includes('processToken'))
  assert.match(
    declarationText,
    /createTokenizer\(\{ forOutput: this\.forOutput \}\)/,
  )
  assert.match(
    declarationText,
    /this\.forOutput && index === tokens\.length - 1/,
  )
  assert.match(declarationText, /this\.tail\.length <= 64/)
  assert.match(declarationText, /previousCodePoint === 8205/)
  assert.match(declarationText, /previousCodePoint >= 127462/)
  assert.match(declarationText, /previousCodePoint <= 127487/)

  fs.appendFileSync(filename, '\n// mutation\n')
  assert.throws(
    () => applyTarget118ParserStreamingTailSourceRecovery({ sourceRoot }),
    /requires its exact raw or recovered source state/,
  )
})

test('recovered Parser executes the authenticated streaming-tail contract', async t => {
  const ts = await loadTypeScript()
  const { temporary, sourceRoot, filename } = materializeRawParser()
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  applyTarget118ParserStreamingTailSourceRecovery({ sourceRoot })
  const text = fs.readFileSync(filename, 'utf8')
  const { parsed, declaration } = parserDeclaration(ts, text)
  const declarationText = text
    .slice(declaration.getStart(parsed), declaration.end)
    .replace(/^export\s+/, '')
  const executableSource = `
function createTokenizer() {
  return {
    feed(input) { return [{ type: 'text', value: input }] },
    flush() { return [] },
    reset() {},
  }
}
function defaultStyle() { return { marker: 'default' } }
function* segmentGraphemes(input) {
  for (const { segment } of new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(input)) {
    yield { value: segment, width: 1 }
  }
}
${declarationText}
`
  const javascript = ts.transpileModule(executableSource, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const Parser = new Function(`${javascript}\nreturn Parser`)()

  const ordinary = new Parser()
  assert.deepEqual(
    ordinary.feed('ab')[0].graphemes.map(item => item.value),
    ['a', 'b'],
  )
  assert.deepEqual(ordinary.flush(), [])

  const streaming = new Parser({ forOutput: true })
  assert.equal(
    streaming.feed('ab')[0].graphemes.map(item => item.value).join(''),
    'a',
  )
  assert.equal(
    streaming.feed('c')[0].graphemes.map(item => item.value).join(''),
    'b',
  )
  assert.equal(
    streaming.flush()[0].graphemes.map(item => item.value).join(''),
    'c',
  )

  streaming.reset()
  assert.deepEqual(
    streaming.feed('a\x07b').map(action => action.type),
    ['text', 'bell'],
  )
  assert.equal(
    streaming.flush()[0].graphemes.map(item => item.value).join(''),
    'b',
  )

  const continuation = new Parser({ forOutput: true })
  const zwj = [{ value: 'x' }, { value: '\u200d' }, { value: 'y' }]
  continuation.holdTail(zwj, true)
  assert.deepEqual(zwj.map(item => item.value), ['x'])
  assert.equal(continuation.tail, '\u200dy')
  const regional = [
    { value: 'x' },
    { value: String.fromCodePoint(127462) },
    { value: 'y' },
  ]
  continuation.holdTail(regional, true)
  assert.deepEqual(regional.map(item => item.value), ['x'])
  assert.equal(continuation.tail, `${String.fromCodePoint(127462)}y`)
  const surrogate = [{ value: 'x' }, { value: '\ud83d' }]
  continuation.holdTail(surrogate, true)
  assert.deepEqual(surrogate, [])
  assert.equal(continuation.tail, 'x\ud83d')
  continuation.reset()
  assert.equal(continuation.tail, '')
})
