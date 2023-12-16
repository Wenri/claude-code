import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  applyTarget119SdkRateLimitReplay,
  TARGET119_CHECK_1M_RATE_LIMIT_BLOCK_AFTER,
  TARGET119_CHECK_1M_RATE_LIMIT_BLOCK_BEFORE,
  TARGET119_CHECK_1M_RATE_LIMIT_INPUT,
  TARGET119_CHECK_1M_RATE_LIMIT_OUTPUT,
  TARGET119_SDK_RATE_LIMIT_BLOCK_AFTER,
  TARGET119_SDK_RATE_LIMIT_BLOCK_BEFORE,
  TARGET119_SDK_RATE_LIMIT_INPUT,
  TARGET119_SDK_RATE_LIMIT_OUTPUT,
  TARGET119_SDK_RATE_LIMIT_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/replay-sdk-rate-limit-fetch-error-source-gap.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-sdk-rate-limit-fetch-error-source-gap.json',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/replay-sdk-rate-limit-fetch-error-source-gap.mjs',
)
const builderPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/build-sdk-rate-limit-fetch-error-source-gap-fixture.mjs',
)
const historicalSourceRoot = path.join(
  root,
  '.recovery-tmp/semantic-trees/2.1.119/src',
)
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? historicalSourceRoot,
)
const artifactRoot = path.join(root, '.recovery-tmp/authenticated-artifacts')
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const FIXTURE_SHA256 =
  'd8cef29f92fef05f01c580d3db721f6caeac7cff5bde9e47712a6e3f3564e51d'
const HELPER_SHA256 =
  'aa1b56c28b14ec58b43f7c4951aa42a6ad76d58ec457a210650187359c5ecf43'
const BUILDER_SHA256 =
  'e70c1d3a71b56a06fbe699c540958685fe807c8170c3a1be359b0775cd7e406c'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function partitionDescriptor(rows) {
  const bytes = Buffer.from(JSON.stringify(rows))
  return { rows: rows.length, jsonBytes: bytes.length, sha256: sha256(bytes) }
}

function sourceManifestDescriptor(files) {
  const bytes = Buffer.from(JSON.stringify(files))
  return { files: files.length, jsonBytes: bytes.length, sha256: sha256(bytes) }
}

function selectSourceProfile(manifest) {
  const matches = fixture.inputs.sourceUniverse.acceptedProfiles.filter(
    profile =>
      profile.files === manifest.files &&
      profile.jsonBytes === manifest.jsonBytes &&
      profile.sha256 === manifest.sha256,
  )
  assert.equal(matches.length, 1, 'unknown source-universe profile')
  return matches[0].profile
}

function selectArtifactPhase(typedAudit, sourceCoverage, sourceCoverageRaw) {
  const matches = fixture.artifactPhasePolicy.acceptedPairs.filter(
    pair =>
      pair.typedAudit.bytes === typedAudit.bytes &&
      pair.typedAudit.sha256 === typedAudit.sha256 &&
      pair.sourceCoverage.bytes === sourceCoverage.bytes &&
      pair.sourceCoverage.sha256 === sourceCoverage.sha256 &&
      pair.sourceCoverageRaw.bytes === sourceCoverageRaw.bytes &&
      pair.sourceCoverageRaw.sha256 === sourceCoverageRaw.sha256,
  )
  assert.equal(matches.length, 1, 'unknown or hybrid report/coverage pair')
  return matches[0]
}

function coverageTuple(row) {
  return [
    row.targetIndex,
    row.start,
    row.end,
    row.nodeType,
    row.sourceHash,
    row.structuralClass,
    row.disposition,
    row.ownerIds,
    row.evidenceIds,
    row.behavior,
  ]
}

function artifactPath(environmentName, input) {
  return process.env[environmentName]
    ? path.resolve(process.env[environmentName])
    : path.join(artifactRoot, input.artifact)
}

function readExact(filename, expected, label = filename) {
  const value = fs.readFileSync(filename)
  assert.deepEqual(
    descriptor(value),
    { bytes: expected.bytes, sha256: expected.sha256 },
    label,
  )
  return value
}

function canonicalFlags(value) {
  return [...value].sort().join('')
}

function identity(kind, value) {
  return JSON.stringify([
    kind,
    kind === 'regexp'
      ? { pattern: value.pattern, flags: canonicalFlags(value.flags) }
      : value,
  ])
}

function bundleOccurrences(source) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const occurrences = new Map()
  function add(kind, value, start, end) {
    const key = identity(kind, value)
    const rows = occurrences.get(key) ?? []
    rows.push({ start, end })
    occurrences.set(key, rows)
  }
  function visit(node) {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (node.type === 'Literal') {
      if (node.regex) add('regexp', node.regex, node.start, node.end)
      else if (typeof node.value === 'string') {
        add('string', node.value, node.start, node.end)
      } else if (typeof node.value === 'number') {
        add('number', String(node.value), node.start, node.end)
      }
    } else if (node.type === 'TemplateElement') {
      add(
        'string',
        node.value?.cooked ?? node.value?.raw,
        node.start,
        node.end,
      )
    }
    const property =
      ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(
        node.type,
      ) &&
      node.computed === false &&
      node.key?.type === 'Identifier'
        ? node.key
        : node.type === 'MemberExpression' &&
            node.computed === false &&
            node.property?.type === 'Identifier'
          ? node.property
          : null
    if (property) add('property', property.name, property.start, property.end)
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
        visit(child)
      }
    }
  }
  visit(ast)
  for (const rows of occurrences.values()) {
    rows.sort((left, right) => left.start - right.start)
  }
  return occurrences
}

function sourceFiles(directory, prefix = '') {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...sourceFiles(filename, relative))
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(relative)
  }
  return files.sort()
}

async function loadTypeScript() {
  const filename = path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

function sourceValues(ts, sourceFile) {
  const values = new Set()
  function add(kind, value) {
    values.add(identity(kind, value))
  }
  function visit(node) {
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) {
      add('string', node.text)
    } else if (ts.isJsxText(node)) {
      const value = node.getText(sourceFile)
      if (value) add('string', value)
    } else if (ts.isNumericLiteral(node)) {
      add('number', String(Number(node.text.replaceAll('_', ''))))
    }
    const namedProperty =
      (ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isPropertyDeclaration(node) ||
        ts.isPropertySignature(node) ||
        ts.isMethodSignature(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node) ||
        ts.isBindingElement(node) ||
        ts.isJsxAttribute(node) ||
        ts.isImportSpecifier(node) ||
        ts.isExportSpecifier(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    const property = namedProperty
      ? node.name.text
      : ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name)
        ? node.name.text
        : undefined
    if (property !== undefined) add('property', property)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return values
}

test(
  'Target119 SDK rate-limit source-gap fixture and replay helper remain frozen',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.equal(sha256(fs.readFileSync(builderPath)), BUILDER_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(fixture.summary, {
      units: 2,
      residues: 22,
      targetIndicesSha256:
        'a9e5b0e79679b8b0141e526169349c7248cc4832ca03def146c47f66f230a288',
      residueIdentitiesSha256:
        '76c912dfc14cdb4864a13bdd74226dd861e2ccd2f5be52e7e3d478d1b5f26fbf',
      representationCounts: {
        'source-file-ast': 20,
        'source-gap-replay': 2,
      },
    })
    assert.deepEqual(
      fixture.inputs.sourceFiles.map(item => ({
        path: item.path,
        before: item.before,
        after: item.after,
      })),
      [
        {
          path: TARGET119_SDK_RATE_LIMIT_INPUT.path,
          before: TARGET119_SDK_RATE_LIMIT_INPUT,
          after: TARGET119_SDK_RATE_LIMIT_OUTPUT,
        },
        {
          path: TARGET119_CHECK_1M_RATE_LIMIT_INPUT.path,
          before: TARGET119_CHECK_1M_RATE_LIMIT_INPUT,
          after: TARGET119_CHECK_1M_RATE_LIMIT_OUTPUT,
        },
      ],
    )
    assert.deepEqual(
      fixture.sourceReplay,
      [
        {
          path: TARGET119_SDK_RATE_LIMIT_INPUT.path,
          before: TARGET119_SDK_RATE_LIMIT_BLOCK_BEFORE,
          after: TARGET119_SDK_RATE_LIMIT_BLOCK_AFTER,
        },
        {
          path: TARGET119_CHECK_1M_RATE_LIMIT_INPUT.path,
          before: TARGET119_CHECK_1M_RATE_LIMIT_BLOCK_BEFORE,
          after: TARGET119_CHECK_1M_RATE_LIMIT_BLOCK_AFTER,
        },
      ],
    )
    assert.deepEqual(
      TARGET119_SDK_RATE_LIMIT_OWNER_OVERRIDES,
      fixture.rows.map(row => ({
        key: `${caseName}:${row.targetIndex}`,
        targetIndex: row.targetIndex,
        paths: [row.sourceOwner],
        evidenceIds: row.evidenceIds,
        behavior: row.behavior,
      })),
    )
  },
)

test(
  'Target119 SDK rate-limit report and coverage phases are exact and fail closed',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const accepted = fixture.artifactPhasePolicy.acceptedPairs[0]
    const reportPath = path.resolve(
      process.env.CLAUDE_CODE_TYPED_AUDIT_PATH ??
        path.join(root, accepted.typedAudit.path),
    )
    const coveragePath = path.resolve(
      process.env.CLAUDE_CODE_SOURCE_COVERAGE_PATH ??
        path.join(root, accepted.sourceCoverage.path),
    )
    const reportBytes = fs.readFileSync(reportPath)
    const coverageBytes = fs.readFileSync(coveragePath)
    const coverageRaw = gunzipSync(coverageBytes)
    const artifactPair = selectArtifactPhase(
      descriptor(reportBytes),
      descriptor(coverageBytes),
      descriptor(coverageRaw),
    )
    assert.ok(
      ['post-rate-owner', 'post-streaming', 'post-u21759', 'post-u21878'].includes(
        artifactPair.phase,
      ),
    )
    for (const pair of fixture.artifactPhasePolicy.acceptedPairs) {
      assert.equal(
        selectArtifactPhase(
          pair.typedAudit,
          pair.sourceCoverage,
          pair.sourceCoverageRaw,
        ).phase,
        pair.phase,
      )
    }
    const [postRateOwner, , postU21759, postU21878] =
      fixture.artifactPhasePolicy.acceptedPairs
    assert.throws(
      () =>
        selectArtifactPhase(
          postRateOwner.typedAudit,
          postU21878.sourceCoverage,
          postRateOwner.sourceCoverageRaw,
        ),
      /unknown or hybrid/,
    )
    assert.throws(
      () =>
        selectArtifactPhase(
          postU21878.typedAudit,
          postU21878.sourceCoverage,
          postU21759.sourceCoverageRaw,
        ),
      /unknown or hybrid/,
    )
    assert.throws(
      () =>
        selectArtifactPhase(
          descriptor(reportBytes),
          { ...descriptor(coverageBytes), bytes: coverageBytes.length + 1 },
          descriptor(coverageRaw),
        ),
      /unknown or hybrid/,
    )

    const report = JSON.parse(reportBytes)
    const projection = fixture.artifactProjections[artifactPair.projection]
    for (const targetIndex of [10175, 12489]) {
      const expected = projection.reportUnits[targetIndex]
      for (const [key, reportKey] of [
        ['owner', 'sourceRuntimeOwnerResidueRows'],
        ['added', 'sourceRuntimeAddedOwnerResidueRows'],
        ['strict', 'rows'],
      ]) {
        assert.deepEqual(
          partitionDescriptor(
            report[reportKey].filter(
              row => row.structural?.index === targetIndex,
            ),
          ),
          expected[key],
          `${artifactPair.phase}:${key}:u${targetIndex}`,
        )
      }
    }

    const coverage = JSON.parse(coverageRaw)
    const coverageRows = coverage.rows.filter(row =>
      [10175, 12489].includes(row.targetIndex),
    )
    assert.deepEqual(
      partitionDescriptor(coverageRows),
      fixture.artifactProjections.coverageRows,
    )
    assert.deepEqual(
      partitionDescriptor(coverageRows.map(coverageTuple)),
      fixture.artifactProjections.coverageTuples,
    )
    for (const [index, row] of coverageRows.entries()) {
      const expected = fixture.rows[index]
      assert.equal(row.targetIndex, expected.targetIndex)
      assert.equal(row.start, expected.target.start)
      assert.equal(row.end, expected.target.end)
      assert.equal(row.nodeType, expected.target.nodeType)
      assert.equal(row.sourceHash, expected.target.sourceHash)
      assert.equal(row.structuralClass, expected.target.classification)
      assert.equal(row.disposition, 'source-runtime-covered')
      assert.deepEqual(row.evidenceIds, expected.evidenceIds)
      assert.equal(row.behavior, expected.behavior)
    }
  },
)

test(
  'Target119 SDK rate-limit proof authenticates the complete target unit and exact source partition',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  async () => {
    const baselineBytes = readExact(
      artifactPath('CLAUDE_CODE_2_1_118_BUNDLE', fixture.inputs.baselineBundle),
      fixture.inputs.baselineBundle,
      'Target118 baseline bundle',
    )
    const targetBytes = readExact(
      artifactPath('CLAUDE_CODE_2_1_119_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'Target119 target bundle',
    )
    const structuralBytes = readExact(
      path.join(root, fixture.inputs.structural.path),
      fixture.inputs.structural,
      'Target119 structural delta',
    )
    const structural = JSON.parse(gunzipSync(structuralBytes))
    const baselineOccurrences = bundleOccurrences(baselineBytes.toString('utf8'))
    const targetOccurrences = bundleOccurrences(targetBytes.toString('utf8'))
    const ts = await loadTypeScript()
    const counts = { 'source-file-ast': 0, 'source-gap-replay': 0 }
    const universe = sourceFiles(sourceRoot)
    assert.ok(
      ['historical-raw', 'post-background-agent-replay'].includes(
        selectSourceProfile(sourceManifestDescriptor(universe)),
      ),
    )
    for (const profile of fixture.inputs.sourceUniverse.acceptedProfiles) {
      assert.equal(
        selectSourceProfile(profile),
        profile.profile,
      )
    }
    assert.throws(
      () =>
        selectSourceProfile({
          ...sourceManifestDescriptor(universe),
          files: universe.length + 1,
        }),
      /unknown source-universe profile/,
    )
    const sourceDescriptors = new Map(
      fixture.inputs.sourceFiles.map(item => [item.path, item]),
    )
    const replayDescriptors = new Map(
      fixture.sourceReplay.map(item => [item.path, item]),
    )
    const selectedStates = new Set()
    for (const row of fixture.rows) {
      const region = structural.regions.find(
        item => item.target.index === row.targetIndex,
      )
      assert.ok(region)
      assert.deepEqual(
        {
          classification: region.classification,
          nodeType: region.target.nodeType,
          start: region.target.start,
          end: region.target.end,
          bytes: region.target.end - region.target.start,
          sourceHash: region.target.sourceHash,
        },
        row.target,
      )
      const targetText = targetBytes
        .toString('utf8')
        .slice(row.target.start, row.target.end)
      assert.equal(sha256(targetText), row.target.sourceHash)
      parse(targetText, { ecmaVersion: 'latest', sourceType: 'module' })
      for (const marker of row.targetMarkers) {
        assert.ok(targetText.includes(marker))
      }
      for (const residue of row.residues) {
        const key = identity(residue.kind, residue.value)
        assert.equal(
          (baselineOccurrences.get(key) ?? []).length,
          residue.baselineCount,
        )
        assert.deepEqual(
          (targetOccurrences.get(key) ?? [])[residue.targetOrdinal - 1],
          { start: residue.start, end: residue.end },
        )
        assert.ok(
          residue.start >= row.target.start && residue.end <= row.target.end,
        )
      }

      const sourceDescriptor = sourceDescriptors.get(row.sourceOwner)
      const replay = replayDescriptors.get(row.sourceOwner)
      assert.ok(sourceDescriptor)
      assert.ok(replay)
      const selectedBytes = fs.readFileSync(
        path.join(sourceRoot, row.sourceOwner.replace(/^src\//, '')),
      )
      const selectedState =
        selectedBytes.length === sourceDescriptor.before.bytes &&
        sha256(selectedBytes) === sourceDescriptor.before.sha256
          ? 'raw'
          : selectedBytes.length === sourceDescriptor.after.bytes &&
              sha256(selectedBytes) === sourceDescriptor.after.sha256
            ? 'recovered'
            : null
      assert.ok(selectedState, `${row.sourceOwner}: exact raw or recovered state`)
      selectedStates.add(selectedState)
      const rawBytes = readExact(
        path.join(
          historicalSourceRoot,
          row.sourceOwner.replace(/^src\//, ''),
        ),
        sourceDescriptor.before,
        `${row.sourceOwner}: raw historical source`,
      )
      const recoveredBytes = Buffer.from(
        rawBytes.toString('utf8').replace(replay.before, replay.after),
      )
      assert.deepEqual(descriptor(recoveredBytes), {
        bytes: sourceDescriptor.after.bytes,
        sha256: sourceDescriptor.after.sha256,
      })
      const rawSourceFile = ts.createSourceFile(
        row.sourceOwner,
        rawBytes.toString('utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      )
      const recoveredSourceFile = ts.createSourceFile(
        row.sourceOwner,
        recoveredBytes.toString('utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      )
      assert.equal(rawSourceFile.parseDiagnostics.length, 0)
      assert.equal(recoveredSourceFile.parseDiagnostics.length, 0)
      const rawValues = sourceValues(ts, rawSourceFile)
      const recoveredValues = sourceValues(ts, recoveredSourceFile)
      for (const residue of row.residues) {
        const key = identity(residue.kind, residue.value)
        const representation = rawValues.has(key)
          ? 'source-file-ast'
          : recoveredValues.has(key)
            ? 'source-gap-replay'
            : null
        assert.equal(representation, residue.representation)
        counts[representation] += 1
      }
      const markerCandidates = universe
        .filter(relative => {
          const text = fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
          return row.sourceMarkers.every(marker => text.includes(marker))
        })
        .map(relative => `src/${relative}`)
      assert.deepEqual(markerCandidates, sourceDescriptor.markerCandidates)
    }
    assert.equal(selectedStates.size, 1, 'paired selected sources are atomic')
    assert.deepEqual(counts, fixture.summary.representationCounts)
  },
)

test(
  'Target119 SDK rate-limit replay is exact, atomic, and idempotent',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const files = [
      {
        input: TARGET119_SDK_RATE_LIMIT_INPUT,
        output: TARGET119_SDK_RATE_LIMIT_OUTPUT,
      },
      {
        input: TARGET119_CHECK_1M_RATE_LIMIT_INPUT,
        output: TARGET119_CHECK_1M_RATE_LIMIT_OUTPUT,
      },
    ].map(item => {
      const selectedFilename = path.join(
        sourceRoot,
        item.input.path.replace(/^src\//, ''),
      )
      const selectedDescriptor = descriptor(fs.readFileSync(selectedFilename))
      const state =
        selectedDescriptor.bytes === item.input.bytes &&
        selectedDescriptor.sha256 === item.input.sha256
          ? 'raw'
          : selectedDescriptor.bytes === item.output.bytes &&
              selectedDescriptor.sha256 === item.output.sha256
            ? 'recovered'
            : null
      assert.ok(state, `${item.input.path}: exact selected state`)
      return { ...item, selectedFilename, state }
    })
    assert.equal(new Set(files.map(item => item.state)).size, 1)
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target119-sdk-rate-limit-'),
    )
    try {
      for (const item of files) {
        const tempFilename = path.join(
          tempRoot,
          item.input.path.replace(/^src\//, ''),
        )
        fs.mkdirSync(path.dirname(tempFilename), { recursive: true })
        fs.copyFileSync(item.selectedFilename, tempFilename)
      }
      assert.deepEqual(
        applyTarget119SdkRateLimitReplay({ sourceRoot: tempRoot }),
        files[0].state === 'raw'
          ? { status: 'recovered', changed: true }
          : { status: 'already-recovered', changed: false },
      )
      for (const item of files) {
        assert.deepEqual(
          descriptor(
            fs.readFileSync(
              path.join(
                tempRoot,
                item.input.path.replace(/^src\//, ''),
              ),
            ),
          ),
          { bytes: item.output.bytes, sha256: item.output.sha256 },
        )
      }
      assert.deepEqual(
        applyTarget119SdkRateLimitReplay({ sourceRoot: tempRoot }),
        { status: 'already-recovered', changed: false },
      )
    } finally {
      fs.rmSync(tempRoot, { recursive: true })
    }
  },
)

test(
  'Target119 SDK rate-limit proof builder reproduces the fixture byte-for-byte',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const result = spawnSync(process.execPath, [builderPath], {
      cwd: root,
      encoding: 'utf8',
      env: process.env,
      maxBuffer: 64 * 1024 * 1024,
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.deepEqual(fs.readFileSync(fixturePath), fixtureBytes)
  },
)
