import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')

const cases = new Map([
  [
    '2.1.89-to-2.1.90',
    {
      baselineVersion: '2.1.89',
      targetVersion: '2.1.90',
      staticSourceProofs: new Map([
        [
          16656,
          [
            'components/mcp/ElicitationDialog.tsx',
            ['key.return', 'key.leftArrow', 'key.backspace'],
          ],
        ],
        [
          16657,
          [
            'components/mcp/ElicitationDialog.tsx',
            ['key.return', 'key.leftArrow', 'key.rightArrow'],
          ],
        ],
        [
          16916,
          [
            'components/teams/TeamsDialog.tsx',
            ['key.leftArrow', 'key.upArrow', 'key.downArrow', 'key.return'],
          ],
        ],
        [4447, ['services/api/client.ts', ['AnthropicAws']]],
      ]),
      compilerPropertyProofs: new Map([
        [17800, new Set(['createElement'])],
      ]),
    },
  ],
  [
    '2.1.90-to-2.1.91',
    {
      baselineVersion: '2.1.90',
      targetVersion: '2.1.91',
      staticSourceProofs: new Map([
        [
          2571,
          [
            'utils/settings/types.ts',
            [
              'Disable inline shell execution in skills and custom slash commands from user, project, or plugin sources.',
              'Commands are replaced with a placeholder instead of being run.',
            ],
          ],
        ],
      ]),
    },
  ],
])

function bundleVariable(version) {
  return `CLAUDE_CODE_${version.replaceAll('.', '_')}_BUNDLE`
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function readCoverage(caseName) {
  return JSON.parse(
    gunzipSync(
      fs.readFileSync(
        path.join(
          repositoryRoot,
          'recovery/cases',
          caseName,
          'semantic/source-coverage.json.gz',
        ),
      ),
    ),
  )
}

function artifact(caseName, id) {
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(repositoryRoot, 'recovery/cases', caseName, 'manifest.json'),
      'utf8',
    ),
  )
  return manifest.artifacts.find(item => item.id === id)
}

function runScanner(caseName, config) {
  const baseline = process.env[bundleVariable(config.baselineVersion)]
  const target = process.env[bundleVariable(config.targetVersion)]
  assert.ok(baseline, `${bundleVariable(config.baselineVersion)} is required`)
  assert.ok(target, `${bundleVariable(config.targetVersion)} is required`)
  assert.equal(sha256(fs.readFileSync(baseline)), artifact(caseName, 'baselineBundle').sha256)
  assert.equal(sha256(fs.readFileSync(target)), artifact(caseName, 'targetBundle').sha256)

  const caseRoot = path.join(repositoryRoot, 'recovery/cases', caseName)
  const result = spawnSync(
    process.execPath,
    [
      path.join(repositoryRoot, 'recovery/scripts/inspect-semantic-literal-gaps.mjs'),
      '--baseline',
      baseline,
      '--target',
      target,
      '--source-root',
      sourceRoot,
      '--structural',
      path.join(caseRoot, 'structural/generated-delta.json.gz'),
      '--partitions',
      path.join(caseRoot, 'attribution/target-partitions.jsonl.gz'),
      '--sources',
      path.join(caseRoot, 'attribution/sources.jsonl.gz'),
      '--coverage',
      path.join(caseRoot, 'semantic/source-coverage.json.gz'),
    ],
    { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  )
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return JSON.parse(result.stdout)
}

test('early typed residues are exact inherited values or focused source assemblies', {
  timeout: 120_000,
  skip:
    !semanticCase || !cases.has(semanticCase)
      ? `not applicable to ${semanticCase ?? 'an unmaterialized source tree'}`
      : false,
}, () => {
  if (!semanticCase || !cases.has(semanticCase)) return
  const config = cases.get(semanticCase)
  const report = runScanner(semanticCase, config)
  const coverage = readCoverage(semanticCase)
  const rows = new Map(coverage.rows.map(row => [row.targetIndex, row]))
  const evidence = new Map(coverage.evidence.map(item => [item.id, item]))
  const residueUnits = new Set()
  const addedUnits = new Set()

  for (const residue of report.sourceRuntimeOwnerResidueRows) {
    const index = residue.structural.index
    residueUnits.add(index)
    const row = rows.get(index)
    assert.equal(row?.disposition, 'source-runtime-covered', `${index}: disposition`)
    assert.ok(
      row.evidenceIds.includes('early-residue-target-fragment'),
      `${index}: transitive target-fragment evidence`,
    )
    assert.ok(
      row.evidenceIds.includes('early-residue-semantic-test'),
      `${index}: executable residue evidence`,
    )
    if (!residue.targetAdded) {
      assert.ok(
        residue.targetOccurrenceNumber <= residue.baselineOccurrenceCount,
        `${index}: inherited occurrence accounting`,
      )
      continue
    }
    addedUnits.add(index)
    const compilerProperties = config.compilerPropertyProofs?.get(index)
    if (compilerProperties) {
      assert.equal(
        residue.literalKind,
        'property',
        `${index}: compiler-only residue kind`,
      )
      assert.ok(
        compilerProperties.has(String(residue.value)),
        `${index}: unexpected compiler property ${JSON.stringify(residue.value)}`,
      )
    }
    const rowEvidence = row.evidenceIds.map(id => evidence.get(id))
    const semanticPaths = new Set(
      rowEvidence
        .filter(item => item?.kind === 'semantic-test')
        .map(item => item.path),
    )
    assert.ok(
      rowEvidence.some(
        item =>
          item?.kind === 'target-fragment' && semanticPaths.has(item.path),
      ),
      `${index}: added residue lacks focused executable target proof`,
    )
  }

  for (const [index, [filename, fragments]] of config.staticSourceProofs) {
    if (!addedUnits.has(index)) continue
    const source = fs.readFileSync(path.join(sourceRoot, filename), 'utf8')
    for (const fragment of fragments) {
      assert.ok(source.includes(fragment), `${index}: ${filename}: ${fragment}`)
    }
  }

  const focusedElsewhere = new Set([
    358,
    3152,
    5033,
    5769,
    6788,
    6790,
    8948,
    11429,
    12104,
    13164,
    13286,
    13388,
    14131,
    15536,
    15633,
    15644,
    16316,
    16325,
    16345,
    17283,
    17318,
    17715,
    4855,
    12452,
    13639,
    14109,
    14115,
    14117,
    14118,
    14125,
    14127,
    14128,
    15631,
    17275,
    17664,
    18105,
    7678,
    9785,
    10295,
    11246,
    12184,
    12404,
    12505,
    14498,
    14609,
    14627,
    15961,
    15997,
    16378,
    16707,
    17373,
    18158,
    18189,
    18190,
  ])
  for (const index of addedUnits) {
    assert.ok(
      config.staticSourceProofs.has(index) ||
        config.compilerPropertyProofs?.has(index) ||
        focusedElsewhere.has(index),
      `${index}: newly added owner residue has no explicit source proof`,
    )
  }

  assert.ok(residueUnits.size > 0)
  assert.equal(report.unclassifiedAddedOccurrences, 0)
})
