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
  TARGET117_BACKGROUND_EXIT_DIALOG_EVIDENCE_IDS,
  TARGET117_BACKGROUND_EXIT_DIALOG_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/background-exit-dialog-owner-overrides.mjs'

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-background-exit-dialog-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '6dee62607f298bee02cbde961e430e05b865a4d699090d0eef9ae77ac06ccb83'

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

function exactSlice(bundle, expected, label) {
  const bytes = bundle.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected), label)
  return bytes.toString('utf8')
}

function parseUnit(bundle, expected, label) {
  const source = exactSlice(bundle, expected, label)
  const program = parse(source, { ecmaVersion: 'latest' })
  assert.equal(program.body.length, 1, `${label}: one top-level unit`)
  assert.equal(program.body[0].type, expected.nodeType)
  return { source, node: program.body[0] }
}

function walk(node, visit, parent = undefined, key = undefined) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (let index = 0; index < node.length; index += 1) {
      walk(node[index], visit, node, index)
    }
    return
  }
  if (typeof node.type === 'string') visit(node, parent, key)
  for (const [childKey, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start'].includes(childKey)) {
      walk(child, visit, node, childKey)
    }
  }
}

function memoFacts(node, expected, label) {
  const allocations = []
  walk(node, candidate => {
    if (
      candidate.type === 'VariableDeclarator' &&
      candidate.id?.name === '$' &&
      candidate.init?.type === 'CallExpression' &&
      candidate.init.arguments?.length === 1 &&
      candidate.init.arguments[0]?.type === 'Literal'
    ) {
      allocations.push(candidate)
    }
  })
  assert.equal(allocations.length, 1, `${label}: one memo cache allocation`)
  assert.equal(allocations[0].init.arguments[0].value, expected.arity)
  assert.equal(allocations[0].init.callee.type, 'MemberExpression')
  assert.equal(allocations[0].init.callee.property.name, 'c')

  const accesses = []
  walk(node, candidate => {
    if (
      candidate.type === 'MemberExpression' &&
      candidate.computed &&
      candidate.object?.type === 'Identifier' &&
      candidate.object.name === '$' &&
      candidate.property?.type === 'Literal' &&
      Number.isInteger(candidate.property.value)
    ) {
      accesses.push(candidate.property.value)
    }
  })
  assert.equal(accesses.length, expected.memberAccesses)
  assert.equal(
    sha256(JSON.stringify(accesses)),
    expected.accessSequenceSha256,
  )
  const slots = [...new Set(accesses)].sort((left, right) => left - right)
  assert.deepEqual(
    {
      uniqueSlots: slots.length,
      minimumSlot: slots[0],
      maximumSlot: slots.at(-1),
    },
    {
      uniqueSlots: expected.uniqueSlots,
      minimumSlot: expected.minimumSlot,
      maximumSlot: expected.maximumSlot,
    },
  )
  assert.deepEqual(
    slots,
    Array.from({ length: expected.arity }, (_, index) => index),
  )
}

function replaceRegions(unitSource, unitStart, side) {
  let result = unitSource
  const regions = fixture.semanticSubstitutions
    .map(row => ({ ...row[side], sentinel: row.sentinel, name: row.name }))
    .sort((left, right) => right.start - left.start)
  for (const region of regions) {
    const start = region.start - unitStart
    const end = region.end - unitStart
    const value = Buffer.from(result.slice(start, end))
    assert.deepEqual(
      descriptor(value),
      expectedDescriptor(region),
      `${side} ${region.name} region`,
    )
    result = result.slice(0, start) + region.sentinel + result.slice(end)
  }
  return result
}

function normalizeOutsideSubstitutions(node, baseline) {
  if (baseline) {
    const allocations = []
    walk(node, candidate => {
      if (
        candidate.type === 'CallExpression' &&
        candidate.arguments?.length === 1 &&
        candidate.arguments[0]?.type === 'Literal' &&
        candidate.arguments[0].value === 43 &&
        candidate.callee?.type === 'MemberExpression' &&
        candidate.callee.property?.name === 'c'
      ) {
        allocations.push(candidate)
      }
      if (
        candidate.type === 'MemberExpression' &&
        candidate.computed &&
        candidate.object?.type === 'Identifier' &&
        candidate.object.name === '$' &&
        candidate.property?.type === 'Literal' &&
        Number.isInteger(candidate.property.value)
      ) {
        const slot = candidate.property.value
        if (slot >= 36) candidate.property.value -= 3
        else if (slot >= 26) candidate.property.value -= 2
        else if (slot >= 9) candidate.property.value -= 1
      }
    })
    assert.equal(allocations.length, 1, 'baseline memo allocation')
    allocations[0].arguments[0].value = 40
  }

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

  const normalized = JSON.stringify(canonicalize(node))
  return {
    normalized,
    chars: normalized.length,
    bytes: Buffer.byteLength(normalized),
    sha256: sha256(normalized),
  }
}

function extractNewFile(patchBytes, sourcePath) {
  const patch = patchBytes.toString('utf8')
  const marker = `diff --git a/${sourcePath} b/${sourcePath}\n`
  const start = patch.indexOf(marker)
  assert.ok(start >= 0, `${sourcePath}: donor diff exists`)
  assert.equal(patch.indexOf(marker, start + marker.length), -1)
  const next = patch.indexOf('\ndiff --git ', start + marker.length)
  assert.ok(next > start, `${sourcePath}: bounded donor diff`)
  const lines = patch.slice(start, next).split('\n')
  const hunk = lines.findIndex(line => line.startsWith('@@ '))
  assert.ok(hunk >= 0, `${sourcePath}: source hunk`)
  const sourceLines = lines
    .slice(hunk + 1)
    .filter(line => line.startsWith('+') && !line.startsWith('+++'))
    .map(line => line.slice(1))
  return Buffer.from(`${sourceLines.join('\n')}\n`)
}

function gitBlobSha1(bytes) {
  return crypto
    .createHash('sha1')
    .update(Buffer.from(`blob ${bytes.length}\0`))
    .update(bytes)
    .digest('hex')
}

function replaceExactlyOnce(input, before, after, label) {
  const first = input.indexOf(before)
  const second = input.indexOf(before, first + 1)
  assert.ok(first >= 0, `${label}: anchor exists`)
  assert.equal(second, -1, `${label}: anchor is unique`)
  return input.slice(0, first) + after + input.slice(first + before.length)
}

function deriveSemanticCandidate(donor) {
  let output = donor
  output = replaceExactlyOnce(
    output,
    [
      "import { plural } from '../utils/stringUtils.js'",
      "import { Select } from './CustomSelect/index.js'",
    ].join('\n'),
    [
      "import { ConfirmationButtons } from './ConfirmationButtons.js'",
      "import { TruncatedCount } from './TruncatedCount.js'",
    ].join('\n'),
    'dependency imports',
  )
  output = replaceExactlyOnce(
    output,
    'const hidden = items.length - visible.length',
    'const hidden = items.length - limit',
    'hidden-count basis',
  )
  output = replaceExactlyOnce(
    output,
    [
      '        {hidden > 0 ? (',
      '          <Text dimColor>',
      "            … +{hidden} {plural(hidden, 'item')}",
      '          </Text>',
      '        ) : null}',
    ].join('\n'),
    '        <TruncatedCount count={hidden} unit="item" />',
    'TruncatedCount rendering',
  )
  output = replaceExactlyOnce(
    output,
    [
      '      <Select',
      '        options={[',
      "          { label: 'Exit anyway', value: 'confirm' },",
      "          { label: 'Stay', value: 'cancel' },",
      '        ]}',
      '        defaultFocusValue="confirm"',
      '        visibleOptionCount={2}',
      "        onChange={value => (value === 'confirm' ? confirm() : cancel())}",
      '        onCancel={cancel}',
      '      />',
    ].join('\n'),
    [
      '      <ConfirmationButtons',
      '        confirmLabel="Exit anyway"',
      '        cancelLabel="Stay"',
      '        onConfirm={confirm}',
      '        onCancel={cancel}',
      '      />',
    ].join('\n'),
    'ConfirmationButtons rendering',
  )
  return output
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

test(
  'Target117 BackgroundExitDialog fixture and static override wiring are exact',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.status, 'case-owned-static-owner-proof-source-replay-blocked')
    assert.deepEqual(
      TARGET117_BACKGROUND_EXIT_DIALOG_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.equal(TARGET117_BACKGROUND_EXIT_DIALOG_OWNER_OVERRIDES.length, 1)
    assert.deepEqual(TARGET117_BACKGROUND_EXIT_DIALOG_OWNER_OVERRIDES[0], {
      key: `${caseName}:17463`,
      targetIndex: 17463,
      paths: ['src/components/BackgroundExitDialog.tsx'],
      declarations: ['BackgroundExitDialog'],
      evidenceIds: fixture.evidenceIds,
      behavior: TARGET117_BACKGROUND_EXIT_DIALOG_OWNER_OVERRIDES[0].behavior,
    })
    assert.match(
      TARGET117_BACKGROUND_EXIT_DIALOG_OWNER_OVERRIDES[0].behavior,
      /TruncatedCount.*ConfirmationButtons.*missing Target117 caller\/type graph.*blocks source replay/,
    )
    assert.equal(fixture.generatorWiring.replayHelper, null)
    assert.equal(
      fixture.generatorWiring.ownerOverrideExport,
      'TARGET117_BACKGROUND_EXIT_DIALOG_OWNER_OVERRIDES',
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
    const target = ledger.unresolvedTarget.find(
      row => row.target.index === fixture.targetUnit.targetIndex,
    )
    const baseline = ledger.unmatchedBaseline.find(
      row => row.index === fixture.baselineUnit.baselineIndex,
    )
    assert.equal(target.classification, fixture.targetUnit.classification)
    assert.equal(target.target.sourceHash, fixture.targetUnit.sha256)
    assert.equal(target.target.coarseHash, fixture.targetUnit.coarseHash)
    assert.equal(baseline.sourceHash, fixture.baselineUnit.sha256)
    assert.equal(baseline.coarseHash, fixture.baselineUnit.coarseHash)

    const target118Ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.target118StructuralLedger.path),
          fixture.target118StructuralLedger,
          'Target118 structural ledger',
        ),
      ),
    )
    const lineage = target118Ledger.regions.find(
      row => row.target.index === fixture.target118LineageUnit.targetIndex,
    )
    assert.deepEqual(
      {
        classification: lineage.classification,
        baselineUnitIndex: lineage.baselineUnitIndex,
        pairReason: lineage.pairReason,
        sourceHash: lineage.target.sourceHash,
        coarseHash: lineage.target.coarseHash,
      },
      {
        classification: 'matched',
        baselineUnitIndex: fixture.target118LineageUnit.baselineUnitIndex,
        pairReason: fixture.target118LineageUnit.pairReason,
        sourceHash: fixture.target118LineageUnit.sha256,
        coarseHash: fixture.target118LineageUnit.coarseHash,
      },
    )
  },
)

test(
  'authenticated whole units isolate exactly callbacks, TruncatedCount, and ConfirmationButtons',
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
    const target118Bundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_118_INNER_BUNDLE', fixture.target118Bundle),
      fixture.target118Bundle,
      'Target118 inner bundle',
    )
    const baseline = parseUnit(baselineBundle, fixture.baselineUnit, 'baseline dialog')
    const target = parseUnit(targetBundle, fixture.targetUnit, 'Target117 dialog')
    parseUnit(
      target118Bundle,
      fixture.target118LineageUnit,
      'Target118 lineage dialog',
    )
    memoFacts(baseline.node, fixture.baselineUnit.memoCache, 'baseline dialog')
    memoFacts(target.node, fixture.targetUnit.memoCache, 'Target117 dialog')

    for (const residue of fixture.targetResidues) {
      assert.equal(
        targetBundle.subarray(residue.start, residue.end).toString('utf8'),
        residue.value,
      )
      assert.ok(
        residue.start >= fixture.targetUnit.start &&
          residue.end <= fixture.targetUnit.end,
      )
    }
    for (const substitution of fixture.semanticSubstitutions) {
      exactSlice(
        targetBundle,
        substitution.target,
        `target ${substitution.name}`,
      )
      exactSlice(
        baselineBundle,
        substitution.baseline,
        `baseline ${substitution.name}`,
      )
    }

    const normalizedBaseline = normalizeOutsideSubstitutions(
      parse(
        replaceRegions(
          baseline.source,
          fixture.baselineUnit.start,
          'baseline',
        ),
        { ecmaVersion: 'latest' },
      ).body[0],
      true,
    )
    const normalizedTarget = normalizeOutsideSubstitutions(
      parse(
        replaceRegions(target.source, fixture.targetUnit.start, 'target'),
        { ecmaVersion: 'latest' },
      ).body[0],
      false,
    )
    assert.equal(normalizedBaseline.normalized, normalizedTarget.normalized)
    assert.deepEqual(
      {
        chars: normalizedTarget.chars,
        bytes: normalizedTarget.bytes,
        sha256: normalizedTarget.sha256,
      },
      {
        chars: fixture.outsideSubstitutionEquivalence.normalizedChars,
        bytes: fixture.outsideSubstitutionEquivalence.normalizedBytes,
        sha256: fixture.outsideSubstitutionEquivalence.normalizedSha256,
      },
    )

    const truncated = exactSlice(
      targetBundle,
      fixture.exactCalls.targetTruncatedCount,
      'Target117 TruncatedCount call',
    )
    const confirmation = exactSlice(
      targetBundle,
      fixture.exactCalls.targetConfirmationButtons,
      'Target117 ConfirmationButtons call',
    )
    const manual = exactSlice(
      baselineBundle,
      fixture.exactCalls.baselineManualOverflowText,
      'baseline manual overflow call',
    )
    const select = exactSlice(
      baselineBundle,
      fixture.exactCalls.baselineSelect,
      'baseline Select call',
    )
    assert.match(truncated, /createElement\([^,]+,\{count:[^,]+,unit:"item"\}\)/)
    assert.match(
      confirmation,
      /confirmLabel:"Exit anyway",cancelLabel:"Stay",onConfirm:[^,]+,onCancel:/,
    )
    assert.match(manual, /dimColor:!0.*more/)
    assert.match(select, /createElement\([^,]+,\{options:[^,]+,onChange:/)

    const targetInitializer = exactSlice(
      targetBundle,
      fixture.moduleInitializers.target,
      'Target117 BackgroundExitDialog initializer',
    )
    const baselineInitializer = exactSlice(
      baselineBundle,
      fixture.moduleInitializers.baseline,
      'baseline BackgroundExitDialog initializer',
    )
    for (const binding of fixture.moduleInitializers.targetAddedInitializers) {
      assert.match(targetInitializer, new RegExp(`(?:^|;)${binding}\\(\\)`))
      assert.equal(baselineInitializer.includes(`${binding}()`), false)
    }
    assert.equal(
      baselineInitializer.includes(`${fixture.moduleInitializers.baselineRemovedInitializer}()`),
      true,
    )

    for (const dependency of Object.values(fixture.dependencies)) {
      exactSlice(
        targetBundle,
        dependency.targetUnit,
        `${dependency.path}: runtime declaration`,
      )
      exactSlice(
        targetBundle,
        dependency.initializer,
        `${dependency.path}: runtime initializer`,
      )
      if (dependency.formatUnit) {
        exactSlice(
          targetBundle,
          dependency.formatUnit,
          `${dependency.path}: format helper`,
        )
      }
    }

    const callerLedger = JSON.parse(
      gunzipSync(
        fs.readFileSync(path.join(repositoryRoot, fixture.structuralLedger.path)),
      ),
    ).regions.find(row => row.target.index === fixture.retainedCaller.targetIndex)
    assert.equal(callerLedger.baselineUnitIndex, fixture.retainedCaller.baselineIndex)
    assert.equal(callerLedger.pairReason, fixture.retainedCaller.pairReason)
    exactSlice(targetBundle, fixture.retainedCaller.targetUnit, 'retained ExitFlow')
    exactSlice(targetBundle, fixture.retainedCaller.targetCall, 'Target117 caller')
    exactSlice(baselineBundle, fixture.retainedCaller.baselineCall, 'baseline caller')
  },
)

test(
  'Target118 source authenticates the owner boundary while the bounded candidate remains evidence only',
  { skip: !selected },
  () => {
    const patchBytes = readExact(
      path.join(repositoryRoot, fixture.target118SourceLineage.patch.path),
      fixture.target118SourceLineage.patch,
      'stable Target118 source-facing patch',
    )
    const donor = extractNewFile(
      patchBytes,
      fixture.target118SourceLineage.path,
    )
    assert.deepEqual(
      descriptor(donor),
      expectedDescriptor(fixture.target118SourceLineage),
    )
    assert.equal(
      donor.toString('utf8').length,
      fixture.target118SourceLineage.chars,
    )
    assert.equal(
      gitBlobSha1(donor),
      fixture.target118SourceLineage.patchBlobSha1,
    )

    const ts = typescript()
    const donorSource = donor.toString('utf8')
    const donorFile = ts.createSourceFile(
      fixture.target118SourceLineage.path,
      donorSource,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    assert.equal(donorFile.parseDiagnostics.length, 0)
    const props = donorSource.slice(
      fixture.target118SourceLineage.props.start,
      fixture.target118SourceLineage.props.end,
    )
    const declaration = donorSource.slice(
      fixture.target118SourceLineage.declaration.start,
      fixture.target118SourceLineage.declaration.end,
    )
    assert.deepEqual(
      descriptor(props),
      expectedDescriptor(fixture.target118SourceLineage.props),
    )
    assert.deepEqual(
      descriptor(declaration),
      expectedDescriptor(fixture.target118SourceLineage.declaration),
    )
    assert.match(declaration, /^export function BackgroundExitDialog\(/)
    assert.match(props, /items: SessionBackgroundExitItem\[\]/)

    const candidate = deriveSemanticCandidate(donorSource)
    const expectedCandidate =
      fixture.target118SourceLineage.boundedTarget117SemanticCandidate
    assert.deepEqual(descriptor(candidate), expectedDescriptor(expectedCandidate))
    assert.equal(candidate.length, expectedCandidate.chars)
    const candidateFile = ts.createSourceFile(
      fixture.target118SourceLineage.path,
      candidate,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    assert.equal(candidateFile.parseDiagnostics.length, 0)
    const functions = candidateFile.statements.filter(ts.isFunctionDeclaration)
    assert.equal(functions.length, 1)
    assert.equal(functions[0].name.text, 'BackgroundExitDialog')
    const candidateDeclaration = candidate.slice(
      functions[0].getStart(candidateFile),
      functions[0].end,
    )
    assert.deepEqual(
      descriptor(candidateDeclaration),
      expectedDescriptor(expectedCandidate.declaration),
    )
    assert.equal(functions[0].getStart(candidateFile), expectedCandidate.declaration.start)
    assert.equal(functions[0].end, expectedCandidate.declaration.end)
    assert.equal(candidate.includes('plural('), false)
    assert.equal(candidate.includes('<Select'), false)
    assert.equal((candidate.match(/<TruncatedCount /g) ?? []).length, 1)
    assert.equal((candidate.match(/<ConfirmationButtons/g) ?? []).length, 1)
    assert.match(candidate, /const hidden = items\.length - limit/)
    assert.match(candidate, /count=\{hidden\} unit="item"/)
    assert.match(candidate, /onConfirm=\{confirm\}/)
  },
)

test(
  'raw and packaged Target117 source keep the owner absent and expose the caller/type blocker without mutation',
  { skip: !selected },
  () => {
    const root = selectedSourceRoot()
    const owner = sourceFilename(root, fixture.sourceReplayBlocker.ownerPath)
    assert.equal(fs.existsSync(owner), false, 'BackgroundExitDialog remains absent')
    for (const stale of fixture.sourceReplayBlocker.staleFiles) {
      const source = readExact(
        sourceFilename(root, stale.path),
        stale,
        `${stale.path}: pinned stale Target117 source`,
      ).toString('utf8')
      for (const missing of stale.missing) {
        assert.equal(source.includes(missing), false, `${stale.path}: lacks ${missing}`)
      }
    }

    let materializedDependencies = 0
    for (const dependency of Object.values(fixture.dependencies)) {
      const filename = sourceFilename(root, dependency.path)
      if (!fs.existsSync(filename)) continue
      readExact(filename, dependency, `${dependency.path}: recovered dependency`)
      materializedDependencies += 1
    }
    assert.ok(
      materializedDependencies === 0 || materializedDependencies === 2,
      'dependency state is raw or fully materialized',
    )
    assert.equal(fixture.sourceReplayBlocker.decision.includes('no helper'), true)
    assert.equal(fixture.generatorWiring.replayHelper, null)
    assert.equal(fs.existsSync(owner), false, 'proof performs no source write')
  },
)
