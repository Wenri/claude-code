import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import { indexGeneratedBundle } from '../lib/structural-delta.mjs'
import * as ownerProofModule from '../cases/2.1.118-to-2.1.119/recovered/prompt-input-foreground-agents-owner-overrides.mjs'
import {
  TARGET119_PROMPT_INPUT_FOREGROUND_AGENTS_EVIDENCE_IDS,
  TARGET119_PROMPT_INPUT_FOREGROUND_AGENTS_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/prompt-input-foreground-agents-owner-overrides.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-prompt-input-foreground-agents-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '4a222ea2462219b06ea265bfe1eb6d6386a9ef4525df667b543a6f374a102b8c'
const configuredSourceRoot =
  process.env.CLAUDE_CODE_2_1_119_SOURCE_ROOT ??
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
const sourceRoot = configuredSourceRoot
  ? path.resolve(configuredSourceRoot)
  : path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src')

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  return { bytes: Buffer.byteLength(value), sha256: sha256(value) }
}

function sourceDescriptor(value) {
  return {
    chars: value.length,
    bytes: Buffer.byteLength(value),
    sha256: sha256(value),
  }
}

function readPinned(input) {
  const value = fs.readFileSync(path.join(root, input.path))
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return value
}

function slicePinned(bundle, input) {
  const value = bundle.subarray(input.start, input.end)
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return value
}

function readLedger(input) {
  return JSON.parse(gunzipSync(readPinned(input)))
}

function assertRegion(ledger, expected) {
  const region = ledger.regions.find(
    candidate => candidate.target.index === expected.targetIndex,
  )
  assert(region, `u${expected.targetIndex}`)
  assert.deepEqual(
    {
      classification: region.classification,
      nodeType: region.target.nodeType,
      start: region.target.start,
      end: region.target.end,
      bytes: region.target.end - region.target.start,
      tokenCount: region.target.tokenCount,
      sha256: region.target.sourceHash,
      coarseHash: region.target.coarseHash,
    },
    {
      classification: expected.classification,
      nodeType: expected.nodeType,
      start: expected.start,
      end: expected.end,
      bytes: expected.bytes,
      tokenCount: expected.tokenCount,
      sha256: expected.sha256,
      coarseHash: expected.coarseHash,
    },
  )
  if ('baselineUnitIndex' in expected) {
    assert.equal(region.baselineUnitIndex, expected.baselineUnitIndex)
    assert.equal(region.pairReason, expected.pairReason)
  }
  if ('unknownFreeIdentifierCount' in expected) {
    assert.equal(
      region.unknownFreeIdentifierCount,
      expected.unknownFreeIdentifierCount,
    )
  }
  return region
}

function normalizedTokens(unit) {
  return unit.tokens.map(token => {
    let value = token.raw
    if (token.label === 'name') {
      const identity = unit.identity.identifierAt.get(token.start)
      value = identity ? `@${identity.kind}` : `name:${token.raw}`
    }
    return [token.label, value]
  })
}

function setDescriptor(rows) {
  const serialized = JSON.stringify(rows)
  return {
    rows: rows.length,
    jsonBytes: Buffer.byteLength(serialized),
    sha256: sha256(serialized),
  }
}

function sourceRowIdentity(row) {
  return [
    row.structural.index,
    row.literalKind,
    row.value,
    row.target.start,
    row.target.end,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
    row.targetAdded,
  ]
}

function walk(node, predicate, values = []) {
  if (!node || typeof node !== 'object') return values
  if (predicate(node)) values.push(node)
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc', 'range', 'parent'].includes(key)) continue
    if (Array.isArray(value)) {
      for (const child of value) walk(child, predicate, values)
    } else {
      walk(value, predicate, values)
    }
  }
  return values
}

function countOccurrences(value, needle) {
  let count = 0
  let offset = -1
  while ((offset = value.indexOf(needle, offset + 1)) !== -1) count += 1
  return count
}

function gitShow(commit, filename) {
  const result = spawnSync('git', ['show', `${commit}:${filename}`], {
    cwd: root,
    encoding: null,
  })
  assert.equal(result.status, 0, result.stderr?.toString())
  return result.stdout
}

function gitDiff() {
  const result = spawnSync(
    'git',
    [
      'diff',
      '--no-ext-diff',
      '--no-color',
      '--unified=0',
      fixture.sourceLineage.baselineCommit,
      fixture.sourceLineage.targetCommit,
      '--',
      fixture.sourceLineage.path,
    ],
    { cwd: root, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  return result.stdout
}

function inlineSourceMap(value) {
  const match = value.match(/\/\/# sourceMappingURL=data:[^,]+,([^\n]+)/)
  assert(match)
  return JSON.parse(Buffer.from(match[1], 'base64'))
}

let typescriptPromise
async function loadTypeScript() {
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

function tsSource(ts, filename, value) {
  const sourceFile = ts.createSourceFile(
    filename,
    value,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, filename)
  return sourceFile
}

function tsDeclaration(ts, sourceFile, source, name) {
  const declaration = sourceFile.statements.find(
    statement => statement.name?.text === name,
  )
  assert(declaration, name)
  const start = declaration.getStart(sourceFile)
  const end = declaration.getEnd()
  const value = source.slice(start, end)
  return {
    declaration,
    descriptor: {
      start,
      end,
      chars: value.length,
      bytes: Buffer.byteLength(value),
      sha256: sha256(value),
    },
  }
}

function tsImport(ts, sourceFile, source, moduleName) {
  const declaration = sourceFile.statements.find(
    statement =>
      ts.isImportDeclaration(statement) &&
      statement.moduleSpecifier.text === moduleName,
  )
  assert(declaration, moduleName)
  const start = declaration.getStart(sourceFile)
  const end = declaration.getEnd()
  const value = source.slice(start, end)
  return {
    module: moduleName,
    start,
    end,
    bytes: Buffer.byteLength(value),
    sha256: sha256(value),
  }
}

function sliceSourcePinned(source, expected) {
  const value = source.slice(expected.start, expected.end)
  assert.deepEqual(descriptor(value), {
    bytes: expected.bytes,
    sha256: expected.sha256,
  })
  return value
}

test('Target119 foreground-agents fixture exposes one static ModeIndicator override', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.118-to-2.1.119')
  assert.equal(fixture.summary.sourceReplayHelpers, 0)
  assert.equal(fixture.replayDecision.mode, 'static-only')
  assert.equal(fixture.replayDecision.graphClosed, false)
  assert.deepEqual(
    TARGET119_PROMPT_INPUT_FOREGROUND_AGENTS_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  assert.deepEqual(Object.keys(ownerProofModule).sort(), [
    'TARGET119_PROMPT_INPUT_FOREGROUND_AGENTS_EVIDENCE_IDS',
    'TARGET119_PROMPT_INPUT_FOREGROUND_AGENTS_OWNER_OVERRIDES',
  ])
  assert.deepEqual(
    TARGET119_PROMPT_INPUT_FOREGROUND_AGENTS_OWNER_OVERRIDES.map(row => ({
      key: row.key,
      targetIndex: row.targetIndex,
      paths: [...row.paths],
      declarations: [...row.declarations],
      evidenceIds: [...row.evidenceIds],
      behavior: row.behavior,
    })),
    [
      {
        key: `${fixture.case}:${fixture.targetUnit.targetIndex}`,
        targetIndex: fixture.targetUnit.targetIndex,
        paths: [fixture.sourceLineage.path],
        declarations: ['ModeIndicator'],
        evidenceIds: fixture.evidenceIds,
        behavior: fixture.ownerBehavior,
      },
    ],
  )
})

test('complete Target119 unit is exactly Target118 plus one 60-token branch', () => {
  const baselineBundle = readPinned(fixture.inputs.baselineBundle)
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const baselineLedger = readLedger(fixture.inputs.baselineStructuralLedger)
  const targetLedger = readLedger(fixture.inputs.targetStructuralLedger)
  assertRegion(baselineLedger, fixture.baselineUnit)
  assertRegion(targetLedger, fixture.targetUnit)
  slicePinned(baselineBundle, fixture.baselineUnit)
  const targetUnitBytes = slicePinned(targetBundle, fixture.targetUnit)
  assert.equal(
    slicePinned(targetBundle, fixture.wholeUnitDelta.targetInsertion).toString(),
    fixture.wholeUnitDelta.targetInsertionText,
  )

  const insertionAst = parse(
    `function proof(){${fixture.wholeUnitDelta.targetInsertionText}}`,
    { ecmaVersion: 'latest', sourceType: 'script' },
  ).body[0].body.body[0]
  assert.equal(insertionAst.type, 'IfStatement')
  assert.equal(insertionAst.consequent.type, 'ExpressionStatement')
  assert.equal(countOccurrences(fixture.wholeUnitDelta.targetInsertionText, '&&'), 4)
  assert.equal(countOccurrences(fixture.wholeUnitDelta.targetInsertionText, 'leftArrowOpensAgents'), 1)
  assert.equal(countOccurrences(fixture.wholeUnitDelta.targetInsertionText, 'fg-agents'), 1)

  const baselineIndex = indexGeneratedBundle(
    path.join(root, fixture.inputs.baselineBundle.path),
  )
  const targetIndex = indexGeneratedBundle(
    path.join(root, fixture.inputs.targetBundle.path),
  )
  const baselineUnit = baselineIndex.units[fixture.baselineUnit.targetIndex]
  const targetUnit = targetIndex.units[fixture.targetUnit.targetIndex]
  const baselineTokens = normalizedTokens(baselineUnit)
  const targetTokens = normalizedTokens(targetUnit)
  assert.deepEqual(setDescriptor(baselineTokens), {
    rows: fixture.wholeUnitDelta.baseline.tokens,
    jsonBytes: fixture.wholeUnitDelta.baseline.jsonBytes,
    sha256: fixture.wholeUnitDelta.baseline.sha256,
  })
  assert.deepEqual(setDescriptor(targetTokens), {
    rows: fixture.wholeUnitDelta.target.tokens,
    jsonBytes: fixture.wholeUnitDelta.target.jsonBytes,
    sha256: fixture.wholeUnitDelta.target.sha256,
  })
  const prefix = fixture.wholeUnitDelta.commonPrefixTokens
  const suffix = fixture.wholeUnitDelta.commonSuffixTargetStart
  assert.equal(suffix - prefix, fixture.wholeUnitDelta.insertedTokens)
  assert.deepEqual(baselineTokens.slice(0, prefix), targetTokens.slice(0, prefix))
  assert.deepEqual(baselineTokens.slice(prefix), targetTokens.slice(suffix))
  assert.equal(
    targetTokens.length - baselineTokens.length,
    fixture.wholeUnitDelta.netTokenIncrease,
  )
  const collapsedBaseline = [...baselineTokens]
  const collapsedTarget = [...targetTokens]
  collapsedBaseline.splice(prefix, 0, ['proof', 'FOREGROUND_AGENT_HINT'])
  collapsedTarget.splice(
    prefix,
    fixture.wholeUnitDelta.insertedTokens,
    ['proof', 'FOREGROUND_AGENT_HINT'],
  )
  assert.deepEqual(collapsedTarget, collapsedBaseline)
  assert.deepEqual(setDescriptor(collapsedTarget), {
    rows: fixture.wholeUnitDelta.collapsed.tokens,
    jsonBytes: fixture.wholeUnitDelta.collapsed.jsonBytes,
    sha256: fixture.wholeUnitDelta.collapsed.sha256,
  })

  const report = JSON.parse(
    fs.readFileSync(path.join(root, fixture.inputs.targetReport.path)),
  )
  const addedRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
    row => row.structural.index === fixture.targetUnit.targetIndex,
  )
  for (const row of addedRows) {
    const localStart = row.target.start - fixture.targetUnit.start
    const localEnd = row.target.end - fixture.targetUnit.start
    const tokenIndex = targetUnit.tokens.findIndex(
      token => token.start === localStart && token.end === localEnd,
    )
    assert.notEqual(tokenIndex, -1, `${row.literalKind}:${row.value}`)
    assert.equal(
      tokenIndex < prefix || tokenIndex >= suffix,
      true,
      `${row.literalKind}:${row.value} must be inherited, not inserted`,
    )
    const baselineTokenIndex = tokenIndex < prefix ? tokenIndex : tokenIndex - 60
    assert.deepEqual(
      targetTokens[tokenIndex],
      baselineTokens[baselineTokenIndex],
      `${row.literalKind}:${row.value}`,
    )
  }
  assert.equal(targetUnitBytes.includes(Buffer.from('leftArrowOpensAgents')), true)
})

test('all owner residues, sole owner, and coverage evolution remain atomic', () => {
  const report = JSON.parse(
    fs.readFileSync(path.join(root, fixture.inputs.targetReport.path)),
  )
  const ownerRows = report.sourceRuntimeOwnerResidueRows.filter(
    row => row.structural.index === fixture.targetUnit.targetIndex,
  )
  const addedRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
    row => row.structural.index === fixture.targetUnit.targetIndex,
  )
  const ownerIdentities = ownerRows.map(sourceRowIdentity)
  const addedIdentities = addedRows.map(sourceRowIdentity)
  assert.deepEqual(ownerIdentities, fixture.ownerResidues.all.identities)
  assert.deepEqual(addedIdentities, fixture.ownerResidues.added.identities)
  assert.deepEqual(setDescriptor(ownerIdentities), {
    rows: fixture.ownerResidues.all.rows,
    jsonBytes: fixture.ownerResidues.all.jsonBytes,
    sha256: fixture.ownerResidues.all.sha256,
  })
  assert.deepEqual(setDescriptor(addedIdentities), {
    rows: fixture.ownerResidues.added.rows,
    jsonBytes: fixture.ownerResidues.added.jsonBytes,
    sha256: fixture.ownerResidues.added.sha256,
  })
  assert.equal(
    sha256(JSON.stringify([...new Set(addedRows.map(row => row.structural.index))])),
    fixture.ownerResidues.added.indexSha256,
  )
  for (const row of ownerRows) {
    assert.deepEqual(row.ownerPaths, [
      'components/PromptInput/PromptInputFooterLeftSide.tsx',
    ])
    assert.equal(row.disposition, 'source-runtime-covered')
  }

  const allOwners = JSON.parse(readPinned(fixture.inputs.allOwners))
  const attribution = allOwners.rows.find(
    row => row.targetIndex === fixture.targetUnit.targetIndex,
  )
  assert(attribution)
  assert.deepEqual(
    attribution.owners.map(row => [row.source, row.score]),
    fixture.attribution.owners,
  )
  assert.deepEqual(
    attribution.candidateOwners.map(row => [row.source, row.score]),
    fixture.attribution.candidateOwners,
  )
  assert.equal(attribution.semanticOwnership, fixture.attribution.semanticOwnership)

  const coverage = JSON.parse(
    gunzipSync(
      fs.readFileSync(
        path.join(
          root,
          'recovery/cases/2.1.118-to-2.1.119/semantic/source-coverage.json.gz',
        ),
      ),
    ),
  )
  const row = coverage.rows.find(
    candidate => candidate.targetIndex === fixture.targetUnit.targetIndex,
  )
  assert(row)
  assert.deepEqual(row.ownerIds, fixture.coverageEvolution.ownerIds)
  const provisional = fixture.coverageEvolution.provisionalEvidenceIds
  const corrected = fixture.coverageEvolution.correctedEvidenceIds
  const state = JSON.stringify(row.evidenceIds)
  assert(
    state === JSON.stringify(provisional) || state === JSON.stringify(corrected),
    `unexpected u20456 evidence state ${state}`,
  )
  if (state === JSON.stringify(corrected)) {
    assert.equal(row.behavior, fixture.ownerBehavior)
    assert.deepEqual(
      corrected.map(id => coverage.evidence.find(entry => entry.id === id)),
      fixture.evidenceCatalog,
    )
  } else {
    assert.equal(
      corrected.some(id => coverage.evidence.some(entry => entry.id === id)),
      false,
      'case-specific evidence must never be partially wired',
    )
  }
})

test('historical source delta binds ModeIndicator and its complete dependency boundary', async () => {
  const ts = await loadTypeScript()
  const baseline = gitShow(
    fixture.sourceLineage.baselineCommit,
    fixture.sourceLineage.path,
  ).toString()
  const target = gitShow(
    fixture.sourceLineage.targetCommit,
    fixture.sourceLineage.path,
  ).toString()
  const packaged = fs.readFileSync(
    path.join(sourceRoot, fixture.sourceLineage.path.slice(4)),
    'utf8',
  )
  assert.deepEqual(sourceDescriptor(baseline), fixture.sourceLineage.baselineFile)
  assert.deepEqual(sourceDescriptor(target), fixture.sourceLineage.targetFile)
  assert.equal(packaged, target)
  assert.deepEqual(descriptor(gitDiff()), {
    bytes: fixture.sourceLineage.diff.unifiedZeroBytes,
    sha256: fixture.sourceLineage.diff.unifiedZeroSha256,
  })

  const baselineAst = tsSource(ts, fixture.sourceLineage.path, baseline)
  const targetAst = tsSource(ts, fixture.sourceLineage.path, target)
  for (const name of Object.keys(fixture.sourceLineage.baselineDeclarations)) {
    assert.deepEqual(
      tsDeclaration(ts, baselineAst, baseline, name).descriptor,
      fixture.sourceLineage.baselineDeclarations[name],
      `baseline ${name}`,
    )
    assert.deepEqual(
      tsDeclaration(ts, targetAst, target, name).descriptor,
      fixture.sourceLineage.targetDeclarations[name],
      `target ${name}`,
    )
  }
  assert.deepEqual(
    fixture.sourceLineage.targetImports.map(input =>
      tsImport(ts, targetAst, target, input.module),
    ),
    fixture.sourceLineage.targetImports,
  )
  for (const input of fixture.sourceLineage.targetImports) {
    assert.equal(
      baselineAst.statements.some(
        statement =>
          ts.isImportDeclaration(statement) &&
          statement.moduleSpecifier.text === input.module,
      ),
      false,
    )
  }
  const targetBranch = sliceSourcePinned(
    target,
    fixture.sourceLineage.targetBranch,
  )
  assert.equal(targetBranch.includes('leftArrowOpensAgents !== false'), true)
  assert.equal(targetBranch.includes('key="fg-agents"'), true)
  assert.equal(targetBranch.includes("leftArrowPending ? 'again ' : ''"), true)
  assert.equal(baseline.includes('key="fg-agents"'), false)
  assert.equal(
    target.slice(
      fixture.sourceLineage.targetDeclarations.PromptInputFooterLeftSide.start,
      fixture.sourceLineage.targetDeclarations.PromptInputFooterLeftSide.end,
    ).includes('isInputEmpty={!suppressHint}'),
    true,
  )

  for (const dependency of fixture.sourceDependencies) {
    const value = fs.readFileSync(
      path.join(sourceRoot, dependency.path.slice(4)),
      'utf8',
    )
    assert.deepEqual(sourceDescriptor(value), dependency.file)
    assert.deepEqual(
      gitShow(fixture.sourceLineage.targetCommit, dependency.path),
      Buffer.from(value),
    )
    const sourceFile = tsSource(ts, dependency.path, value)
    for (const expected of [
      ...(dependency.declaration ? [dependency.declaration] : []),
      ...(dependency.declarations ?? []),
    ]) {
      assert.deepEqual(
        tsDeclaration(ts, sourceFile, value, expected.name).descriptor,
        {
          start: expected.start,
          end: expected.end,
          chars: expected.chars,
          bytes: expected.bytes,
          sha256: expected.sha256,
        },
      )
    }
    if (dependency.schemaFragment) {
      assert.equal(
        sliceSourcePinned(value, dependency.schemaFragment),
        'leftArrowOpensAgents?: boolean',
      )
      assert.equal(
        sliceSourcePinned(value, dependency.keyFragment),
        "'leftArrowOpensAgents',",
      )
    }
  }
})

test('authenticated branch behavior is exhaustive and stale shortcut source blocks replay', async () => {
  const executeTargetInsertion = Function(
    'state',
    `const LH=[]
const S9=()=>state.background
const _=state.loading
const K=state.inputEmpty
const bZH=()=>state.fleetAvailable
const y$=()=>({leftArrowOpensAgents:state.configValue})
const Dq={createElement:(_component,props,...children)=>({props,children})}
const V='Text'
const A4H='←'
const A=state.pending
${fixture.wholeUnitDelta.targetInsertionText}
return LH`,
  )
  let visible = 0
  for (const background of [false, true]) {
    for (const loading of [false, true]) {
      for (const inputEmpty of [false, true]) {
        for (const fleetAvailable of [false, true]) {
          for (const configValue of [undefined, false, true]) {
            for (const pending of [false, true]) {
              const result = executeTargetInsertion({
                background,
                loading,
                inputEmpty,
                fleetAvailable,
                configValue,
                pending,
              })
              const shouldShow =
                !background &&
                !loading &&
                inputEmpty &&
                fleetAvailable &&
                configValue !== false
              assert.equal(result.length, shouldShow ? 1 : 0)
              if (shouldShow) {
                visible += 1
                assert.deepEqual(result[0].props, {
                  dimColor: true,
                  key: 'fg-agents',
                })
                assert.equal(
                  result[0].children.join(''),
                  pending
                    ? fixture.semanticContract.pendingLabel
                    : fixture.semanticContract.readyLabel,
                )
              }
            }
          }
        }
      }
    }
  }
  assert.equal(visible, 4)

  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const targetLedger = readLedger(fixture.inputs.targetStructuralLedger)
  assertRegion(targetLedger, fixture.keyboardShortcutGraph.targetUnit)
  const targetKeyboard = slicePinned(
    targetBundle,
    fixture.keyboardShortcutGraph.targetUnit,
  ).toString()
  assert.match(targetKeyboard, /\.c\(12\)/)
  for (const property of fixture.keyboardShortcutGraph.targetProps) {
    assert.equal(countOccurrences(targetKeyboard, property) > 0, true, property)
  }

  const ts = await loadTypeScript()
  const keyboard = fs.readFileSync(
    path.join(sourceRoot, fixture.keyboardShortcutGraph.sourcePath.slice(4)),
    'utf8',
  )
  assert.deepEqual(
    sourceDescriptor(keyboard),
    fixture.keyboardShortcutGraph.sourceFile,
  )
  const keyboardAst = tsSource(
    ts,
    fixture.keyboardShortcutGraph.sourcePath,
    keyboard,
  )
  const props = keyboardAst.statements.find(
    statement =>
      ts.isTypeAliasDeclaration(statement) && statement.name.text === 'Props',
  )
  assert(props)
  assert.deepEqual(
    props.type.members.map(member => member.name.text),
    fixture.keyboardShortcutGraph.sourceProps,
  )
  assert.match(keyboard, /const \$ = _c\(9\);/)

  const baselineSource = gitShow(
    fixture.sourceLineage.baselineCommit,
    fixture.sourceLineage.path,
  ).toString()
  const targetSource = gitShow(
    fixture.sourceLineage.targetCommit,
    fixture.sourceLineage.path,
  ).toString()
  const baselineMap = inlineSourceMap(baselineSource)
  const targetMap = inlineSourceMap(targetSource)
  for (const sourceMap of [baselineMap, targetMap]) {
    assert.deepEqual(sourceMap.sources, fixture.sourceLineage.inlineSourceMap.sources)
    assert.equal(sourceMap.names.length, fixture.sourceLineage.inlineSourceMap.names)
    assert.deepEqual(descriptor(sourceMap.mappings), {
      bytes: fixture.sourceLineage.inlineSourceMap.mappingsBytes,
      sha256: fixture.sourceLineage.inlineSourceMap.mappingsSha256,
    })
    assert.deepEqual(
      sourceDescriptor(sourceMap.sourcesContent[0]),
      fixture.sourceLineage.inlineSourceMap.authoredContent,
    )
    assert.equal(sourceMap.sourcesContent[0].includes('fg-agents'), false)
  }
  assert.deepEqual(targetMap, baselineMap)
  assert.equal(fixture.replayDecision.sourceReplayHelpers.length, 0)
  assert.equal(
    fs.existsSync(
      path.join(
        root,
        'recovery/cases/2.1.118-to-2.1.119/recovered/replay-prompt-input-foreground-agents-source-gap.mjs',
      ),
    ),
    false,
  )
})
