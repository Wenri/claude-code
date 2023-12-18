import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET117_RESUGGEST_SLASH_TEMPLATE_EVIDENCE_IDS,
  TARGET117_RESUGGEST_SLASH_TEMPLATE_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/resuggest-slash-template-owner-overrides.mjs'

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-resuggest-slash-template-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'b2f3c9d9a1cceaa00383bf995a1fd148688f731ed3d49d387b7772027ac7827d'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function expectedDescriptor(expected) {
  return { bytes: expected.bytes, sha256: expected.sha256 }
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected), label)
  return bytes
}

function artifactPath(environmentName, expected) {
  return path.resolve(
    process.env[environmentName] ?? path.join(repositoryRoot, expected.path),
  )
}

function exactSlice(bytes, expected, label) {
  const value = bytes.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(value), expectedDescriptor(expected), label)
  return value.toString('utf8')
}

function exactStringSlice(source, expected, label) {
  const value = source.slice(expected.start, expected.end)
  assert.equal(value.length, expected.chars ?? expected.end - expected.start)
  assert.deepEqual(descriptor(value), expectedDescriptor(expected), label)
  return value
}

function parseUnit(bundle, expected, label) {
  const source = exactSlice(bundle, expected, label)
  const program = parse(source, { ecmaVersion: 'latest' })
  assert.equal(program.body.length, 1, `${label}: one top-level unit`)
  assert.equal(program.body[0].type, expected.nodeType)
  return { source, node: program.body[0] }
}

function canonicalAst(source) {
  const program = parse(source, { ecmaVersion: 'latest' })

  function canonicalize(value, parent = undefined, key = undefined) {
    if (Array.isArray(value)) {
      return value.map((child, index) => canonicalize(child, value, index))
    }
    if (value === null || typeof value !== 'object') return value
    const result = {}
    for (const [childKey, child] of Object.entries(value)) {
      if (['end', 'loc', 'range', 'raw', 'start'].includes(childKey)) continue
      if (value.type === 'Identifier' && childKey === 'name') {
        const retain =
          (parent?.type === 'Property' && key === 'key' && !parent.computed) ||
          (parent?.type === 'MemberExpression' &&
            key === 'property' &&
            !parent.computed)
        result[childKey] = retain ? child : '@id'
      } else {
        result[childKey] = canonicalize(child, value, childKey)
      }
    }
    return result
  }

  const normalized = JSON.stringify(canonicalize(program))
  return { normalized, chars: normalized.length, ...descriptor(normalized) }
}

function countOccurrences(source, needle) {
  let count = 0
  let offset = 0
  while (true) {
    const next = source.indexOf(needle, offset)
    if (next < 0) return count
    count += 1
    offset = next + needle.length
  }
}

function propertyKeys(pattern) {
  assert.equal(pattern.type, 'ObjectPattern')
  return pattern.properties.map(property => {
    assert.equal(property.type, 'Property')
    assert.equal(property.computed, false)
    return property.key.name ?? property.key.value
  })
}

function stripTargetHelperChanges(source) {
  const target = fixture.units.applyCommandSuggestion.target
  const regions = [
    {
      ...fixture.units.applyCommandSuggestion.semanticRegions.targetPartialTemplateBranch,
      replacement: '',
    },
    {
      ...fixture.units.applyCommandSuggestion.semanticRegions.targetInvalidMetadataReturn,
      replacement: 'return',
    },
    {
      ...fixture.units.applyCommandSuggestion.semanticRegions.targetFinalResult,
      replacement: '',
    },
  ].sort((left, right) => right.start - left.start)
  let result = source
  for (const region of regions) {
    const start = region.start - target.start
    const end = region.end - target.start
    assert.deepEqual(
      descriptor(result.slice(start, end)),
      expectedDescriptor(region),
      `target helper semantic region ${region.start}`,
    )
    result = result.slice(0, start) + region.replacement + result.slice(end)
  }
  return result
}

function typescript() {
  return require(
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  )
}

function selectedSourceRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_117_SOURCE_ROOT ??
      path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.117/src'),
  )
}

function sourceFilename(root, sourcePath) {
  assert.ok(sourcePath.startsWith('src/'))
  return path.join(root, sourcePath.slice(4))
}

function assertRealFile(filename, label) {
  const stat = fs.lstatSync(filename)
  assert.equal(stat.isSymbolicLink(), false, `${label}: no symlink`)
  assert.equal(stat.isFile(), true, `${label}: regular file`)
}

function sourceFile(ts, filename, source) {
  const kind = filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const parsed = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    kind,
  )
  assert.equal(parsed.parseDiagnostics.length, 0, `${filename}: parse clean`)
  return parsed
}

function namedDeclaration(ts, parsed, name) {
  return parsed.statements.find(
    node =>
      (ts.isFunctionDeclaration(node) || ts.isTypeAliasDeclaration(node)) &&
      node.name?.text === name,
  )
}

test(
  'Target117 reSuggest fixture and static override wiring are exact',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.status, 'case-owned-static-owner-proof-source-replay-blocked')
    assert.deepEqual(
      TARGET117_RESUGGEST_SLASH_TEMPLATE_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.equal(TARGET117_RESUGGEST_SLASH_TEMPLATE_OWNER_OVERRIDES.length, 2)
    for (const expected of [
      {
        targetIndex: 19089,
        path: 'src/utils/suggestions/commandSuggestions.ts',
        declaration: 'applyCommandSuggestion',
      },
      {
        targetIndex: 19131,
        path: 'src/hooks/useTypeahead.tsx',
        declaration: 'useTypeahead',
      },
    ]) {
      const actual = TARGET117_RESUGGEST_SLASH_TEMPLATE_OWNER_OVERRIDES.find(
        row => row.targetIndex === expected.targetIndex,
      )
      assert.deepEqual(actual, {
        key: `${caseName}:${expected.targetIndex}`,
        targetIndex: expected.targetIndex,
        paths: [expected.path],
        declarations: [expected.declaration],
        evidenceIds: fixture.evidenceIds,
        behavior: actual.behavior,
      })
      assert.match(actual.behavior, /static whole-unit owner proof.*never a partial source replay/)
    }
    assert.equal(fixture.generatorWiring.replayHelper, null)
    assert.equal(
      fixture.generatorWiring.ownerOverrideExport,
      'TARGET117_RESUGGEST_SLASH_TEMPLATE_OWNER_OVERRIDES',
    )

    const ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.structuralLedger.path),
          fixture.structuralLedger,
          'Target117 structural ledger',
        ),
      ),
    )
    for (const unit of Object.values(fixture.units)) {
      const target = ledger.unresolvedTarget.find(
        row => row.target.index === unit.target.targetIndex,
      )
      const baseline = ledger.unmatchedBaseline.find(
        row => row.index === unit.baseline.baselineIndex,
      )
      assert.ok(target, `${unit.declaration}: target structural unit`)
      assert.ok(baseline, `${unit.declaration}: baseline structural unit`)
      assert.equal(target.target.sourceHash, unit.target.sha256)
      assert.equal(target.target.coarseHash, unit.target.coarseHash)
      assert.equal(target.target.tokenCount, unit.target.tokenCount)
      assert.equal(
        target.unknownFreeIdentifierCount,
        unit.target.unknownFreeIdentifierCount,
      )
      assert.equal(baseline.sourceHash, unit.baseline.sha256)
      assert.equal(baseline.coarseHash, unit.baseline.coarseHash)
      assert.equal(baseline.tokenCount, unit.baseline.tokenCount)
    }
    const metadataHelper = ledger.unresolvedTarget.find(
      row => row.target.index === fixture.completionMetadataRuntimeHelper.targetIndex,
    )
    assert.equal(metadataHelper.target.sourceHash, fixture.completionMetadataRuntimeHelper.sha256)
    assert.equal(fixture.ownerResidues.rows.length, fixture.ownerResidues.totalRows)
    assert.equal(
      fixture.ownerResidues.rows.filter(row => row.strict).length,
      fixture.ownerResidues.strictRows,
    )
  },
)

test(
  'authenticated Target117 units bind partial-template results and both reSuggest consumers',
  { skip: !selected },
  () => {
    const baselineBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_116_INNER_BUNDLE', fixture.baselineBundle),
      fixture.baselineBundle,
      'Target116 inner bundle',
    )
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_117_INNER_BUNDLE', fixture.targetBundle),
      fixture.targetBundle,
      'Target117 inner bundle',
    )
    const apply = fixture.units.applyCommandSuggestion
    const typeahead = fixture.units.useTypeahead
    const baselineApply = parseUnit(baselineBundle, apply.baseline, 'baseline apply command')
    const targetApply = parseUnit(targetBundle, apply.target, 'Target117 apply command')
    const baselineTypeahead = parseUnit(
      baselineBundle,
      typeahead.baseline,
      'baseline useTypeahead',
    )
    const targetTypeahead = parseUnit(
      targetBundle,
      typeahead.target,
      'Target117 useTypeahead',
    )

    assert.deepEqual(
      propertyKeys(baselineTypeahead.node.params[0]),
      typeahead.semanticParameterKeys,
    )
    assert.deepEqual(
      propertyKeys(targetTypeahead.node.params[0]),
      typeahead.semanticParameterKeys,
    )
    const baselineSuggestionsState = baselineTypeahead.node.params[0].properties.find(
      property => property.key.name === 'suggestionsState',
    ).value
    const targetSuggestionsState = targetTypeahead.node.params[0].properties.find(
      property => property.key.name === 'suggestionsState',
    ).value
    assert.deepEqual(
      propertyKeys(baselineSuggestionsState),
      typeahead.suggestionsStateKeys,
    )
    assert.deepEqual(
      propertyKeys(targetSuggestionsState),
      typeahead.suggestionsStateKeys,
    )
    exactSlice(baselineBundle, typeahead.baseline.parameter, 'baseline typeahead parameter')
    exactSlice(targetBundle, typeahead.target.parameter, 'Target117 typeahead parameter')

    for (const residue of fixture.ownerResidues.rows) {
      const literal = targetBundle
        .subarray(residue.start, residue.end)
        .toString('utf8')
      assert.ok(
        residue.start >=
          fixture.units[
            residue.targetIndex === apply.target.targetIndex
              ? 'applyCommandSuggestion'
              : 'useTypeahead'
          ].target.start,
      )
      if (residue.literalKind === 'string') assert.equal(JSON.parse(literal), residue.value)
      else assert.equal(literal, residue.value)
    }

    const applyRegions = apply.semanticRegions
    const partial = exactSlice(
      targetBundle,
      applyRegions.targetPartialTemplateBranch,
      'Target117 partial-template branch',
    )
    const baselineInvalid = exactSlice(
      baselineBundle,
      applyRegions.baselineInvalidMetadataReturn,
      'baseline invalid-metadata return',
    )
    const targetInvalid = exactSlice(
      targetBundle,
      applyRegions.targetInvalidMetadataReturn,
      'Target117 invalid-metadata return',
    )
    const finalResult = exactSlice(
      targetBundle,
      applyRegions.targetFinalResult,
      'Target117 final result',
    )
    assert.match(partial, /replacement.*partial.*newInput.*reSuggest/s)
    assert.equal(baselineInvalid, 'return;')
    assert.equal(targetInvalid, 'return null')
    assert.equal(finalResult, 'return{newInput:Y,reSuggest:!1}')
    const strippedTarget = stripTargetHelperChanges(targetApply.source)
    assert.deepEqual(
      descriptor(strippedTarget),
      {
        bytes: apply.preservedBaselineCore.strippedTargetBytes,
        sha256: apply.preservedBaselineCore.strippedTargetSha256,
      },
    )
    const normalizedBaseline = canonicalAst(baselineApply.source)
    const normalizedTarget = canonicalAst(strippedTarget)
    assert.equal(normalizedBaseline.normalized, normalizedTarget.normalized)
    assert.deepEqual(
      {
        chars: normalizedTarget.chars,
        bytes: normalizedTarget.bytes,
        sha256: normalizedTarget.sha256,
      },
      {
        chars: apply.preservedBaselineCore.normalizedChars,
        bytes: apply.preservedBaselineCore.normalizedBytes,
        sha256: apply.preservedBaselineCore.normalizedSha256,
      },
    )

    for (const [name, expected] of Object.entries(typeahead.semanticRegions)) {
      const bundle = name.startsWith('baseline') ? baselineBundle : targetBundle
      const value = exactSlice(bundle, expected, name)
      if (name === 'targetIndexCompletion') {
        assert.match(value, /==="slash-template"/)
        assert.match(value, /==="at"/)
      } else if (name.startsWith('target')) {
        assert.match(value, /reSuggest/)
        assert.match(value, /newInput/)
      } else {
        assert.equal(value.includes('reSuggest'), false)
      }
    }
    assert.equal(countOccurrences(targetApply.source, 'reSuggest'), 2)
    assert.equal(countOccurrences(targetTypeahead.source, 'reSuggest'), 2)
    assert.equal(countOccurrences(baselineApply.source, 'reSuggest'), 0)
    assert.equal(countOccurrences(baselineTypeahead.source, 'reSuggest'), 0)

    const metadata = parseUnit(
      targetBundle,
      fixture.completionMetadataRuntimeHelper,
      'Target117 completion metadata helper',
    )
    assert.match(metadata.source, /"replacement"in/)
    assert.match(metadata.source, /"partial"in/)
    assert.match(metadata.source, /typeof [^.]+\.partial==="boolean"/)
    assert.match(metadata.source, /return null/)
  },
)

test(
  'Target118 independently retains the metadata helper and both reSuggest behaviors',
  { skip: !selected },
  () => {
    const target118Bundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_118_INNER_BUNDLE', fixture.target118Bundle),
      fixture.target118Bundle,
      'Target118 inner bundle',
    )
    const ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.target118StructuralLedger.path),
          fixture.target118StructuralLedger,
          'Target118 structural ledger',
        ),
      ),
    )
    const helperExpected = fixture.completionMetadataRuntimeHelper.target118Lineage
    const helperRow = ledger.regions.find(
      row => row.target.index === helperExpected.targetIndex,
    )
    assert.deepEqual(
      {
        classification: helperRow.classification,
        baselineUnitIndex: helperRow.baselineUnitIndex,
        pairReason: helperRow.pairReason,
        sha256: helperRow.target.sourceHash,
      },
      {
        classification: 'matched',
        baselineUnitIndex: helperExpected.baselineUnitIndex,
        pairReason: helperExpected.pairReason,
        sha256: helperExpected.sha256,
      },
    )
    parseUnit(target118Bundle, helperExpected, 'Target118 metadata helper')

    for (const [role, expected] of Object.entries(
      fixture.target118TemporalLineage,
    )) {
      const row = ledger.unresolvedTarget.find(
        candidate => candidate.target.index === expected.targetIndex,
      )
      assert.equal(row.target.sourceHash, expected.sha256, `${role}: ledger hash`)
      const unit = parseUnit(target118Bundle, expected, `Target118 ${role}`)
      assert.equal(
        countOccurrences(unit.source, 'reSuggest'),
        expected.reSuggestOccurrenceCount,
      )
      if (expected.slashTemplateOccurrenceCount !== undefined) {
        assert.equal(
          countOccurrences(unit.source, 'slash-template'),
          expected.slashTemplateOccurrenceCount,
        )
      }
    }
    for (const unit of Object.values(fixture.units)) {
      const baseline = ledger.unmatchedBaseline.find(
        row => row.index === unit.target.targetIndex,
      )
      assert.equal(baseline.sourceHash, unit.target.sha256)
    }
  },
)

test(
  'raw and packaged Target117 source preserve the exact four-file no-replay blocker',
  { skip: !selected },
  () => {
    const root = selectedSourceRoot()
    const ts = typescript()
    const files = fixture.sourceReplayBlocker.files
    const sources = {}
    for (const [role, expected] of Object.entries(files)) {
      const filename = sourceFilename(root, expected.path)
      assertRealFile(filename, role)
      if (role === 'unifiedSuggestions') {
        const bytes = fs.readFileSync(filename)
        const actual = descriptor(bytes)
        const state = [expected.raw, expected.packaged].find(
          candidate =>
            candidate.bytes === actual.bytes && candidate.sha256 === actual.sha256,
        )
        assert.ok(state, 'unified suggestions is exact raw or packaged state')
        sources[role] = {
          filename,
          source: bytes.toString('utf8'),
          expected,
          state,
        }
      } else {
        const bytes = readExact(filename, expected, `${role}: pinned stale source`)
        sources[role] = {
          filename,
          source: bytes.toString('utf8'),
          expected,
        }
      }
    }

    const command = sources.commandSuggestions
    assert.equal(command.source.length, command.expected.chars)
    const commandFile = sourceFile(ts, command.filename, command.source)
    const commandNode = namedDeclaration(
      ts,
      commandFile,
      command.expected.declaration.name,
    )
    assert.equal(commandNode.getStart(commandFile), command.expected.declaration.start)
    assert.equal(commandNode.end, command.expected.declaration.end)
    const commandDeclaration = exactStringSlice(
      command.source,
      command.expected.declaration,
      'stale applyCommandSuggestion',
    )
    assert.equal(commandNode.type.kind, ts.SyntaxKind.VoidKeyword)
    assert.equal(commandDeclaration.includes('reSuggest'), false)
    assert.equal(commandDeclaration.includes("'replacement' in"), false)
    assert.equal(commandDeclaration.includes("'partial' in"), false)

    const typeahead = sources.useTypeahead
    assert.equal(typeahead.source.length, typeahead.expected.chars)
    const typeaheadFile = sourceFile(ts, typeahead.filename, typeahead.source)
    const typeaheadNode = namedDeclaration(
      ts,
      typeaheadFile,
      typeahead.expected.declaration.name,
    )
    assert.equal(typeaheadNode.getStart(typeaheadFile), typeahead.expected.declaration.start)
    assert.equal(typeaheadNode.end, typeahead.expected.declaration.end)
    const typeaheadDeclaration = exactStringSlice(
      typeahead.source,
      typeahead.expected.declaration,
      'stale useTypeahead',
    )
    assert.equal(typeaheadDeclaration.includes('reSuggest'), false)
    assert.equal(typeaheadDeclaration.includes('slash-template'), false)

    const unified = sources.unifiedSuggestions
    assert.equal(unified.source.length, unified.state.chars)
    const unifiedFile = sourceFile(ts, unified.filename, unified.source)
    const unifiedNode = namedDeclaration(
      ts,
      unifiedFile,
      unified.expected.sharedDeclaration.name,
    )
    assert.equal(unifiedNode.getStart(unifiedFile), unified.state.declarationStart)
    const unifiedDeclaration = unified.source.slice(
      unifiedNode.getStart(unifiedFile),
      unifiedNode.end,
    )
    assert.deepEqual(
      descriptor(unifiedDeclaration),
      expectedDescriptor(unified.expected.sharedDeclaration),
    )
    assert.match(unifiedDeclaration, /metadata: \{ partial, replacement \}/)
    assert.equal(/["']replacement["']\s+in\s+/.test(unified.source), false)
    assert.equal(/["']partial["']\s+in\s+/.test(unified.source), false)

    const suggestionType = sources.suggestionType
    assert.equal(suggestionType.source.length, suggestionType.expected.chars)
    const suggestionTypeFile = sourceFile(
      ts,
      suggestionType.filename,
      suggestionType.source,
    )
    const suggestionTypeNode = namedDeclaration(
      ts,
      suggestionTypeFile,
      suggestionType.expected.declaration.name,
    )
    assert.equal(
      suggestionTypeNode.getStart(suggestionTypeFile),
      suggestionType.expected.declaration.start,
    )
    assert.equal(suggestionTypeNode.end, suggestionType.expected.declaration.end)
    const typeDeclaration = exactStringSlice(
      suggestionType.source,
      suggestionType.expected.declaration,
      'stale SuggestionType',
    )
    assert.equal(typeDeclaration.includes('slash-template'), false)

    assert.match(fixture.sourceReplayBlocker.decision, /no helper.*no source writes/)
    assert.equal(fixture.generatorWiring.replayHelper, null)
  },
)
