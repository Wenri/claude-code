import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET118_MAIN_ENTRYPOINT_INHERITED_EVIDENCE_IDS,
  TARGET118_MAIN_ENTRYPOINT_INHERITED_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/main-entrypoint-inherited-owner-overrides.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-main-entrypoint-inherited-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '755ae14e868d04ca4a84c73e5f24c2353c3fcc4a15564f343cf229110e3e71d4'
const targetBundlePath =
  process.env.CLAUDE_CODE_2_1_118_BUNDLE ??
  path.join(
    root,
    '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
  )
const baselineBundlePath =
  process.env.CLAUDE_CODE_2_1_117_BUNDLE ??
  path.join(
    root,
    '.recovery-tmp/authenticated-artifacts/2.1.117-linux-x64/cli.inner.js',
  )
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.118/src'),
)

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })
const digest = value => sha256(Buffer.from(JSON.stringify(value)))
const macroKinds = new Map([
  ...fixture.canonicalTokenProof.macroValues.baseline.map((value, index) => [
    value,
    ['BUILD:VERSION', 'BUILD:TIME', 'BUILD:SHA'][index],
  ]),
  ...fixture.canonicalTokenProof.macroValues.target.map((value, index) => [
    value,
    ['BUILD:VERSION', 'BUILD:TIME', 'BUILD:SHA'][index],
  ]),
])

function readPinned(input, base = root) {
  const value = fs.readFileSync(path.join(base, input.path))
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return value
}

function gitFile(input) {
  const result = spawnSync(
    'git',
    ['show', `${input.commit}:${input.file.path}`],
    { cwd: root, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), {
    bytes: input.file.bytes,
    sha256: input.file.sha256,
  })
  const blob = spawnSync(
    'git',
    ['rev-parse', `${input.commit}:${input.file.path}`],
    { cwd: root, encoding: 'utf8' },
  )
  assert.equal(blob.status, 0, blob.stderr)
  assert.equal(blob.stdout.trim(), input.file.blob)
  return result.stdout
}

function canonicalToken(token) {
  if (token.type.label === 'name') return 'ID'
  if (token.type.label === 'string') {
    return macroKinds.get(token.value) ?? `S:${JSON.stringify(token.value)}`
  }
  if (token.type.label === 'num') return `N:${token.value}`
  if (token.type.label === 'regexp') {
    return `R:${token.value.pattern}/${token.value.flags}`
  }
  return token.type.label
}

function tokens(source, offset) {
  const output = []
  const stream = tokenizer(source, { ecmaVersion: 'latest' })
  while (true) {
    const token = stream.getToken()
    if (token.type.label === 'eof') break
    output.push({
      canonical: canonicalToken(token),
      raw: source.slice(token.start, token.end),
      start: offset + token.start,
      end: offset + token.end,
    })
  }
  return output
}

function structuralUnit(input, targetIndex) {
  const value = JSON.parse(gunzipSync(readPinned(input)))
  let match
  const visit = current => {
    if (match || !current || typeof current !== 'object') return
    if (current.target?.index === targetIndex) {
      match = current.target
      return
    }
    for (const child of Object.values(current)) {
      if (Array.isArray(child)) {
        for (const item of child) visit(item)
      }
    }
  }
  visit(value)
  assert.ok(match, `missing structural unit ${targetIndex}`)
  return match
}

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

async function functionDeclaration(input, bytes) {
  const ts = await loadTypeScript()
  const source = bytes.toString('utf8')
  const sourceFile = ts.createSourceFile(
    input.path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  const matches = []
  const visit = node => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === input.declaration.name
    ) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(matches.length, 1)
  const declaration = matches[0]
  const characterStart = declaration.getStart(sourceFile)
  const characterEnd = declaration.end
  const byteStart = Buffer.byteLength(source.slice(0, characterStart))
  const byteEnd = Buffer.byteLength(source.slice(0, characterEnd))
  const { name: _name, ...expected } = input.declaration
  assert.deepEqual(
    {
      characterStart,
      characterEnd,
      byteStart,
      byteEnd,
      ...descriptor(bytes.subarray(byteStart, byteEnd)),
    },
    expected,
  )
  return source.slice(characterStart, characterEnd)
}

function pluginTagCommand(bytes) {
  const source = bytes.toString('utf8')
  const characterStart = source.indexOf("  pluginCmd.command('tag [path]')")
  const characterEnd = source.indexOf(
    '\n\n  // Plugin list command',
    characterStart,
  )
  assert.ok(characterStart >= 0)
  assert.ok(characterEnd > characterStart)
  const byteStart = Buffer.byteLength(source.slice(0, characterStart))
  const byteEnd = Buffer.byteLength(source.slice(0, characterEnd))
  const value = bytes.subarray(byteStart, byteEnd)
  return {
    characterStart,
    characterEnd,
    byteStart,
    byteEnd,
    value,
  }
}

function countOccurrences(source, needle) {
  return source.split(needle).length - 1
}

test('Target118 main-entrypoint inherited fixture and override are frozen', {
  skip: !selected,
}, () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  readPinned(fixture.inputs.override)
  assert.equal(fixture.case, caseName)
  assert.equal(
    fixture.status,
    'authenticated-static-whole-unit-owner-proof-no-replay',
  )
  assert.deepEqual(
    TARGET118_MAIN_ENTRYPOINT_INHERITED_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  assert.deepEqual(
    TARGET118_MAIN_ENTRYPOINT_INHERITED_OWNER_OVERRIDES.map(row => ({
      key: row.key,
      targetIndex: row.targetIndex,
      paths: [...row.paths],
      declarations: [...row.declarations],
      evidenceIds: [...row.evidenceIds],
      behavior: row.behavior,
    })),
    [
      {
        key: `${caseName}:${fixture.targetUnit.targetIndex}`,
        targetIndex: fixture.targetUnit.targetIndex,
        paths: fixture.ownerOverride.paths,
        declarations: fixture.ownerOverride.declarations,
        evidenceIds: fixture.ownerOverride.evidenceIds,
        behavior: fixture.targetUnit.behavior,
      },
    ],
  )
  assert.equal(
    digest([fixture.targetUnit.targetIndex]),
    fixture.summary.targetIndicesSha256,
  )
  assert.equal(
    digest(
      fixture.targetUnit.residues.map(row => [
        fixture.targetUnit.targetIndex,
        ...row,
      ]),
    ),
    fixture.summary.residueIdentitiesSha256,
  )
})

test('twenty-two rows have unique predecessor contexts with exact macro normalization', {
  skip: !selected,
}, () => {
  const baselineBundle = fs.readFileSync(baselineBundlePath)
  const targetBundle = fs.readFileSync(targetBundlePath)
  assert.deepEqual(descriptor(baselineBundle), {
    bytes: fixture.inputs.baselineBundle.bytes,
    sha256: fixture.inputs.baselineBundle.sha256,
  })
  assert.deepEqual(descriptor(targetBundle), {
    bytes: fixture.inputs.targetBundle.bytes,
    sha256: fixture.inputs.targetBundle.sha256,
  })
  for (const [input, actual] of [
    [
      fixture.baselineUnit,
      structuralUnit(
        fixture.inputs.baselineStructuralLedger,
        fixture.baselineUnit.targetIndex,
      ),
    ],
    [
      fixture.targetUnit,
      structuralUnit(
        fixture.inputs.targetStructuralLedger,
        fixture.targetUnit.targetIndex,
      ),
    ],
  ]) {
    assert.deepEqual(
      {
        index: actual.index,
        nodeType: actual.nodeType,
        start: actual.start,
        end: actual.end,
        tokenCount: actual.tokenCount,
        sourceHash: actual.sourceHash,
        coarseHash: actual.coarseHash,
      },
      {
        index: input.targetIndex,
        nodeType: input.nodeType,
        start: input.start,
        end: input.end,
        tokenCount: input.tokenCount,
        sourceHash: input.sourceHash,
        coarseHash: input.coarseHash,
      },
    )
  }
  const baselineBytes = baselineBundle.subarray(
    fixture.baselineUnit.start,
    fixture.baselineUnit.end,
  )
  const targetBytes = targetBundle.subarray(
    fixture.targetUnit.start,
    fixture.targetUnit.end,
  )
  assert.deepEqual(descriptor(baselineBytes), {
    bytes: fixture.baselineUnit.bytes,
    sha256: fixture.baselineUnit.sourceHash,
  })
  assert.deepEqual(descriptor(targetBytes), {
    bytes: fixture.targetUnit.bytes,
    sha256: fixture.targetUnit.sourceHash,
  })
  const baselineTokens = tokens(
    baselineBytes.toString('utf8'),
    fixture.baselineUnit.start,
  )
  const targetTokens = tokens(
    targetBytes.toString('utf8'),
    fixture.targetUnit.start,
  )
  for (const [actual, expected] of [
    [baselineTokens, fixture.canonicalTokenProof.baseline],
    [targetTokens, fixture.canonicalTokenProof.target],
  ]) {
    assert.equal(actual.length, expected.tokens)
    assert.deepEqual(
      descriptor(Buffer.from(JSON.stringify(actual.map(row => row.canonical)))),
      { bytes: expected.bytes, sha256: expected.sha256 },
    )
  }
  const radius = fixture.canonicalTokenProof.neighborhoodRadius
  const macroRows = new Set(fixture.canonicalTokenProof.macroRows)
  const coveredRows = []
  for (const proof of fixture.canonicalTokenProof.residuePredecessors) {
    const [rowIndex, targetIndex, baselineIndex, start, end, raw, contextHash] =
      proof
    coveredRows.push(rowIndex)
    const row = fixture.targetUnit.residues[rowIndex]
    const targetToken = targetTokens[targetIndex]
    const baselineToken = baselineTokens[baselineIndex]
    assert.deepEqual([targetToken.start, targetToken.end], [row[2], row[3]])
    assert.deepEqual([baselineToken.start, baselineToken.end, baselineToken.raw], [
      start,
      end,
      raw,
    ])
    if (macroRows.has(rowIndex)) {
      assert.equal(targetToken.canonical.startsWith('BUILD:'), true)
      assert.equal(targetToken.canonical, baselineToken.canonical)
    } else {
      assert.equal(targetToken.raw, baselineToken.raw)
    }
    const targetContext = targetTokens
      .slice(targetIndex - radius, targetIndex + radius + 1)
      .map(token => token.canonical)
    const baselineContext = baselineTokens
      .slice(baselineIndex - radius, baselineIndex + radius + 1)
      .map(token => token.canonical)
    assert.deepEqual(targetContext, baselineContext)
    assert.equal(digest(targetContext), contextHash)
    const candidates = []
    for (
      let candidateIndex = radius;
      candidateIndex < baselineTokens.length - radius;
      candidateIndex += 1
    ) {
      const candidate = baselineTokens[candidateIndex]
      const rawMatch =
        macroRows.has(rowIndex) || candidate.raw === targetToken.raw
      if (
        rawMatch &&
        candidate.canonical === targetToken.canonical &&
        digest(
          baselineTokens
            .slice(candidateIndex - radius, candidateIndex + radius + 1)
            .map(token => token.canonical),
        ) === contextHash
      ) {
        candidates.push(candidateIndex)
      }
    }
    assert.deepEqual(candidates, [baselineIndex])
  }
  assert.deepEqual(
    coveredRows,
    fixture.targetUnit.residues
      .map((_, index) => index)
      .filter(index => index !== fixture.canonicalTokenProof.sourceTransitionRow),
  )
})

test('the frozen Target117 proof authenticates the predecessor run boundary', {
  skip: !selected,
}, () => {
  const prior = JSON.parse(readPinned(fixture.inputs.target117WholeUnitProof))
  assert.equal(prior.case, '2.1.116-to-2.1.117')
  assert.equal(prior.targetUnit.targetIndex, fixture.baselineUnit.targetIndex)
  assert.equal(prior.targetUnit.sha256, fixture.baselineUnit.sourceHash)
  assert.equal(prior.targetUnit.tokenCount, fixture.baselineUnit.tokenCount)
  assert.equal(
    prior.sourceReplayBlocker.reason.includes(
      'A partial insertion would therefore overstate whole-unit source recovery.',
    ),
    true,
  )
})

test('exact source transition owns pluginTagHandler and needs no replay', {
  skip: !selected,
}, async () => {
  const baselineBytes = gitFile(fixture.inputs.baselineHistoricalSource)
  const targetBytes = gitFile(fixture.inputs.historicalSource)
  const baselineDeclaration = await functionDeclaration(
    fixture.inputs.baselineHistoricalSource.file,
    baselineBytes,
  )
  const targetDeclaration = await functionDeclaration(
    fixture.inputs.historicalSource.file,
    targetBytes,
  )
  assert.equal(countOccurrences(baselineDeclaration, 'pluginTagHandler'), 0)
  assert.equal(countOccurrences(targetDeclaration, 'pluginTagHandler'), 2)
  const command = pluginTagCommand(targetBytes)
  const expectedCommand = fixture.sourceTransition.pluginTagCommand
  assert.deepEqual(
    {
      characterStart: command.characterStart,
      characterEnd: command.characterEnd,
      byteStart: command.byteStart,
      byteEnd: command.byteEnd,
      ...descriptor(command.value),
    },
    {
      characterStart: expectedCommand.characterStart,
      characterEnd: expectedCommand.characterEnd,
      byteStart: expectedCommand.byteStart,
      byteEnd: expectedCommand.byteEnd,
      bytes: expectedCommand.bytes,
      sha256: expectedCommand.sha256,
    },
  )
  assert.equal(
    countOccurrences(command.value.toString(), 'pluginTagHandler'),
    expectedCommand.pluginTagHandlerOccurrences,
  )
  assert.equal(
    countOccurrences(command.value.toString(), 'createSubcommandRoot'),
    expectedCommand.createSubcommandRootOccurrences,
  )
  const selectedBytes = fs.readFileSync(
    path.join(sourceRoot, path.relative('src', fixture.inputs.historicalSource.file.path)),
  )
  const selectedDescriptor = descriptor(selectedBytes)
  const selectedInput =
    selectedDescriptor.sha256 === fixture.inputs.historicalSource.file.sha256
      ? fixture.inputs.historicalSource.file
      : fixture.inputs.packagedSource.file
  assert.deepEqual(selectedDescriptor, {
    bytes: selectedInput.bytes,
    sha256: selectedInput.sha256,
  })
  const selectedDeclaration = await functionDeclaration(
    selectedInput,
    selectedBytes,
  )
  assert.equal(countOccurrences(selectedDeclaration, 'pluginTagHandler'), 2)
  assert.deepEqual(descriptor(pluginTagCommand(selectedBytes).value), {
    bytes: expectedCommand.bytes,
    sha256: expectedCommand.sha256,
  })
  assert.equal(fixture.sourceTransition.replayHelper, null)
})
