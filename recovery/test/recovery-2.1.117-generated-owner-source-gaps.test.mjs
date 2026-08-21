import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  applyTarget117GeneratedOwnerRecovery,
  TARGET117_GENERATED_OWNER_OVERRIDES,
  TARGET117_RAW_SOURCE_TREE,
  TARGET117_RECOVERED_SOURCE_FILES,
  TARGET117_RECOVERED_SOURCE_TREE,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-generated-owner-source-gaps.mjs'
import { summarizeSourceTree } from '../scripts/verify-source-lineage.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const caseRoot = path.join(repositoryRoot, 'recovery/cases', caseName)
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-generated-owner-source-gap-recipes.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const defaultArtifactRoot = path.join(
  repositoryRoot,
  '.recovery-tmp/authenticated-artifacts',
)
const coveragePath = path.join(caseRoot, 'semantic/source-coverage.json.gz')

const FIXTURE_SHA256 =
  'a202379c7161c8bd284b6ca4da6f77cbee6f315c9a24a4817b236d6109c67f9b'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  let count = 0
  let offset = 0
  while ((offset = contents.indexOf(fragment, offset)) !== -1) {
    count++
    offset += fragment.length
  }
  return count
}

function readExact(filename, expected) {
  const bytes = fs.readFileSync(filename)
  assert.equal(
    bytes.length,
    expected.bytes,
    `${expected.path ?? filename}: bytes`,
  )
  assert.equal(
    sha256(bytes),
    expected.sha256,
    `${expected.path ?? filename}: sha256`,
  )
  return bytes
}

function bundlePath(environmentName, artifact) {
  const explicit = process.env[environmentName]
  if (explicit) return path.resolve(explicit)
  const fallback = path.join(defaultArtifactRoot, artifact)
  assert.ok(
    fs.existsSync(fallback),
    `${environmentName} must be set when ${fallback} is unavailable`,
  )
  return fallback
}

function sourceFilename(sourceRoot, owner) {
  const relative = owner.replace(/^src\//, '')
  const candidates = [
    path.join(sourceRoot, relative),
    path.join(sourceRoot, owner),
  ]
  return candidates.find(filename => fs.existsSync(filename))
}

function materializeRawTargetSource(commit) {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target117-owner-gap-'),
  )
  const archive = path.join(temporaryRoot, 'source.tar')
  execFileSync(
    'git',
    ['archive', '--format=tar', `--output=${archive}`, commit, 'src'],
    { cwd: repositoryRoot, stdio: 'ignore' },
  )
  execFileSync('tar', ['-xf', archive, '-C', temporaryRoot], {
    stdio: 'ignore',
  })
  fs.unlinkSync(archive)
  return {
    temporaryRoot,
    sourceRoot: path.join(temporaryRoot, 'src'),
  }
}

function readRawTargetBlob(commit, owner) {
  return execFileSync('git', ['show', `${commit}:${owner}`], {
    cwd: repositoryRoot,
  })
}

function git(...args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim()
}

function rawTargetPathExists(commit, owner) {
  try {
    execFileSync('git', ['cat-file', '-e', `${commit}:${owner}`], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    })
    return true
  } catch (error) {
    assert.notEqual(error?.status, 0, `${owner}: git cat-file failure status`)
    return false
  }
}

test(
  '2.1.117 bounded owner-gap fixture authenticates generated units',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256, 'fixture sha256')
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.status, 'case-owned-replay-ready')
    assert.deepEqual(fixture.summary, {
      recipes: 6,
      typedOwnerResidueUnits: 5,
      typedOwnerResidues: 16,
      additionalExactOwnerCounterexamples: 1,
      newGeneratedInternalOwners: 1,
      missingFeatureModuleOwners: 1,
      transitiveOwners: 4,
      macroOnlyUnits: 0,
    })
    assert.deepEqual(
      TARGET117_RAW_SOURCE_TREE,
      fixture.recoveryReplay.rawSourceTree,
      'raw target117 source tree',
    )
    assert.deepEqual(
      TARGET117_RECOVERED_SOURCE_TREE,
      fixture.recoveryReplay.recoveredSourceTree,
      'recovered target117 source tree',
    )
    assert.deepEqual(
      TARGET117_RECOVERED_SOURCE_FILES,
      fixture.recoveryReplay.sourceFiles,
      'recovered source file identities',
    )
    assert.deepEqual(
      TARGET117_GENERATED_OWNER_OVERRIDES.map(
        ({ key, targetIndex, paths }) => ({ key, targetIndex, paths }),
      ),
      fixture.recoveryReplay.ownerOverrides,
      'shared-generator owner overrides',
    )
    assert.equal(
      new Set(TARGET117_GENERATED_OWNER_OVERRIDES.map(row => row.key)).size,
      fixture.summary.recipes,
      'unique owner override keys',
    )
    for (const override of TARGET117_GENERATED_OWNER_OVERRIDES) {
      assert.deepEqual(override.evidenceIds, [
        'target117-generated-owner-source-gap-target-fragment',
        'target117-generated-owner-source-gap-replay-test',
      ])
      assert.ok(override.behavior.length > 0, `${override.key}: behavior`)
    }

    readExact(
      path.join(repositoryRoot, fixture.recoveryReplay.helper.path),
      fixture.recoveryReplay.helper,
    )
    for (const input of fixture.recoveryReplay.authenticatedPatchInputs) {
      readExact(path.join(repositoryRoot, input.path), input)
    }

    const baselineBytes = readExact(
      bundlePath(
        'CLAUDE_CODE_2_1_116_BUNDLE',
        fixture.inputs.baselineBundle.artifact,
      ),
      fixture.inputs.baselineBundle,
    )
    const targetBytes = readExact(
      bundlePath(
        'CLAUDE_CODE_2_1_117_BUNDLE',
        fixture.inputs.targetBundle.artifact,
      ),
      fixture.inputs.targetBundle,
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')

    const structuralBytes = readExact(
      path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
      fixture.inputs.structuralLedger,
    )
    const structural = JSON.parse(gunzipSync(structuralBytes))
    const regions = new Map(
      structural.regions.map(region => [region.target.index, region]),
    )
    const temporalBoundary = fixture.recoveryReplay.temporalBoundary
    const nextStructuralBytes = readExact(
      path.join(repositoryRoot, temporalBoundary.nextStructuralLedger.path),
      temporalBoundary.nextStructuralLedger,
    )
    const nextStructural = JSON.parse(gunzipSync(nextStructuralBytes))
    const nextRegionsByBaseline = new Map(
      nextStructural.regions
        .filter(region => region.baselineUnitIndex !== undefined)
        .map(region => [region.baselineUnitIndex, region]),
    )
    for (const witness of temporalBoundary.inheritedNextTransitionUnits) {
      const baselineRegion = regions.get(witness.baselineIndex)
      assert.ok(baselineRegion, `${witness.purpose}: target117 unit`)
      assert.equal(
        baselineRegion.target.nodeType,
        witness.baselineNodeType,
        `${witness.purpose}: target117 node type`,
      )
      assert.equal(
        baselineRegion.target.sourceHash,
        witness.baselineSourceHash,
        `${witness.purpose}: target117 source hash`,
      )
      const nextRegion = nextRegionsByBaseline.get(witness.baselineIndex)
      assert.ok(nextRegion, `${witness.purpose}: next-transition pair`)
      assert.equal(nextRegion.classification, witness.classification)
      assert.equal(nextRegion.pairReason, witness.pairReason)
      assert.equal(nextRegion.target.index, witness.targetIndex)
      assert.equal(nextRegion.target.nodeType, witness.targetNodeType)
      assert.equal(nextRegion.target.sourceHash, witness.targetSourceHash)
    }

    readExact(
      path.join(repositoryRoot, fixture.inputs.caseManifest.path),
      fixture.inputs.caseManifest,
    )

    for (const recipe of fixture.recipes) {
      const region = regions.get(recipe.target.index)
      assert.ok(region, `${recipe.id}: structural region`)
      assert.equal(region.classification, recipe.target.classification)
      for (const field of [
        'index',
        'nodeType',
        'start',
        'end',
        'sourceHash',
      ]) {
        assert.equal(
          region.target[field],
          recipe.target[field],
          `${recipe.id}: ${field}`,
        )
      }

      const unit = target.slice(recipe.target.start, recipe.target.end)
      assert.equal(sha256(unit), recipe.target.sourceHash, `${recipe.id}: unit`)
      assert.ok(
        unit.includes(recipe.generatedEvidence.fragment),
        `${recipe.id}: target unit contains fragment`,
      )
      assert.equal(
        Buffer.byteLength(recipe.generatedEvidence.fragment),
        recipe.generatedEvidence.bytes,
        `${recipe.id}: fragment bytes`,
      )
      assert.equal(
        sha256(recipe.generatedEvidence.fragment),
        recipe.generatedEvidence.sha256,
        `${recipe.id}: fragment sha256`,
      )
      assert.equal(
        occurrences(baseline, recipe.generatedEvidence.fragment),
        recipe.generatedEvidence.baselineCount,
        `${recipe.id}: baseline fragment count`,
      )
      assert.equal(
        occurrences(target, recipe.generatedEvidence.fragment),
        recipe.generatedEvidence.targetCount,
        `${recipe.id}: target fragment count`,
      )
    }
  },
)

test(
  '2.1.117 owner-gap recipes pin raw source absence and reusable evidence',
  { skip: !selected },
  t => {
    const semanticTree = fixture.inputs.targetSemanticTree
    assert.equal(
      git('rev-parse', `${semanticTree.commit}^{tree}`),
      semanticTree.gitTree,
      'target commit tree',
    )
    assert.equal(
      git('rev-parse', `${semanticTree.commit}:src`),
      semanticTree.sourceGitTree,
      'target source tree',
    )
    const materialized = materializeRawTargetSource(semanticTree.commit)
    t.after(() =>
      fs.rmSync(materialized.temporaryRoot, { recursive: true, force: true }),
    )
    const { sourceRoot } = materialized
    assert.ok(
      fs.existsSync(sourceRoot),
      `2.1.117 source root exists: ${sourceRoot}`,
    )
    const sourceTree = summarizeSourceTree(sourceRoot)
    assert.deepEqual(
      {
        files: sourceTree.files,
        bytes: sourceTree.bytes,
        manifestSha256: sourceTree.manifestSha256,
      },
      fixture.recoveryReplay.rawSourceTree,
      'git archive materializes the exact raw target117 source tree',
    )
    const firstReplay = applyTarget117GeneratedOwnerRecovery({ sourceRoot })
    assert.equal(firstReplay.status, 'recovered')
    assert.equal(firstReplay.ownerOverrides, fixture.summary.recipes)
    assert.deepEqual(firstReplay.before, fixture.recoveryReplay.rawSourceTree)
    assert.deepEqual(firstReplay.after, fixture.recoveryReplay.recoveredSourceTree)
    const replay = applyTarget117GeneratedOwnerRecovery({ sourceRoot })
    assert.equal(replay.status, 'already-recovered')
    assert.equal(replay.ownerOverrides, fixture.summary.recipes)
    assert.deepEqual(replay.before, fixture.recoveryReplay.recoveredSourceTree)
    assert.deepEqual(replay.after, fixture.recoveryReplay.recoveredSourceTree)
    assert.deepEqual(
      replay.files.map(({ path: sourcePath, bytes, sha256: digest, action }) => ({
        path: sourcePath,
        bytes,
        sha256: digest,
        action,
      })),
      fixture.recoveryReplay.sourceFiles.map(file => ({
        ...file,
        action: 'unchanged',
      })),
      'second replay is byte-exact and idempotent',
    )
    for (const boundary of
      fixture.recoveryReplay.temporalBoundary.target117OnlySourceAssertions) {
      const filename = sourceFilename(sourceRoot, boundary.path)
      assert.ok(filename, `${boundary.path}: temporal source exists`)
      const contents = fs.readFileSync(filename, 'utf8')
      for (const fragment of boundary.requiredFragments) {
        assert.ok(
          contents.includes(fragment),
          `${boundary.path}: target117 fragment ${JSON.stringify(fragment)}`,
        )
      }
      for (const fragment of boundary.forbiddenLaterFragments) {
        assert.ok(
          !contents.includes(fragment),
          `${boundary.path}: excludes later fragment ${JSON.stringify(fragment)}`,
        )
      }
    }
    const generatedOwner =
      fixture.recoveryReplay.temporalBoundary.boundedGeneratedOwner
    const generatedFilename = sourceFilename(sourceRoot, generatedOwner.path)
    assert.ok(generatedFilename, `${generatedOwner.path}: generated owner exists`)
    const generatedContents = fs.readFileSync(generatedFilename, 'utf8')
    const promptMatch =
      /^  getSystemPrompt: \(\) => (.+),$/m.exec(generatedContents)
    assert.ok(promptMatch, `${generatedOwner.path}: exact prompt expression`)
    const prompt = JSON.parse(promptMatch[1])
    assert.equal(Buffer.byteLength(prompt), generatedOwner.promptBytes)
    assert.equal(sha256(prompt), generatedOwner.promptSha256)
    const generatedRecipe = fixture.recipes.find(
      recipe => recipe.target.index === generatedOwner.targetIndex,
    )
    assert.ok(generatedRecipe, 'bounded generated-owner recipe')
    assert.ok(
      generatedRecipe.typedOwnerResidues.some(
        residue =>
          residue.kind === 'string' &&
          residue.valueSha256 === generatedOwner.promptSha256,
      ),
      'complete generated prompt is an authenticated target117 typed residue',
    )

    const manifest = JSON.parse(
      fs.readFileSync(path.join(caseRoot, 'manifest.json'), 'utf8'),
    )
    const sourceEditLedger = manifest.sourceLineage.sourceEditLedger

    for (const recipe of fixture.recipes) {
      const featureAnchor = recipe.sourceRecipe.sourceAnchors[0]
      for (const rejected of recipe.rejectedOwners) {
        const bytes = readRawTargetBlob(semanticTree.commit, rejected.path)
        assert.equal(
          sha256(bytes),
          rejected.sha256,
          `${recipe.id}: rejected owner sha256`,
        )
        assert.ok(
          !bytes.toString('utf8').includes(featureAnchor),
          `${recipe.id}: rejected owner must not contain ${JSON.stringify(featureAnchor)}`,
        )
      }

      for (const candidate of recipe.sourceRecipe.ownerCandidates) {
        assert.equal(
          rawTargetPathExists(semanticTree.commit, candidate),
          false,
          `${recipe.id}: ${candidate} absent from raw target`,
        )
        const filename = sourceFilename(sourceRoot, candidate)
        if (filename) {
          const contents = fs.readFileSync(filename, 'utf8')
          for (const anchor of recipe.sourceRecipe.sourceAnchors) {
            assert.ok(
              contents.includes(anchor),
              `${recipe.id}: recovered ${candidate} contains ${JSON.stringify(anchor)}`,
            )
          }
        }
      }

      for (const evidence of recipe.sourceRecipe.evidence) {
        const bytes = readExact(
          path.join(repositoryRoot, evidence.path),
          evidence,
        )
        if (evidence.diffHeader) {
          assert.ok(
            bytes.toString('utf8').includes(evidence.diffHeader),
            `${recipe.id}: ${evidence.diffHeader}`,
          )
        }
        if (evidence.ledgerId) {
          assert.ok(
            sourceEditLedger.some(item => item.id === evidence.ledgerId),
            `${recipe.id}: manifest ledger ${evidence.ledgerId}`,
          )
        }
      }
    }
  },
)

test(
  '2.1.117 embeds the selected raw owner-residue provenance',
  { skip: !selected },
  () => {
    const provenance = fixture.inputs.rawOwnerResidueProvenance
    assert.equal(provenance.kind, 'embedded-pre-replay-selected-rows')
    assert.equal(
      provenance.sourceCommit,
      fixture.inputs.targetSemanticTree.commit,
    )
    assert.deepEqual(provenance.sourceTree, fixture.recoveryReplay.rawSourceTree)
    assert.equal(provenance.recipes, fixture.summary.recipes)
    assert.equal(provenance.selectedRows.length, fixture.summary.recipes)
    assert.equal(
      provenance.selectedRows.filter(row => row.residues.length > 0).length,
      provenance.residueUnits,
    )
    assert.equal(
      provenance.selectedRows.reduce(
        (count, row) => count + row.residues.length,
        0,
      ),
      provenance.residues,
    )
    assert.equal(provenance.residueUnits, fixture.summary.typedOwnerResidueUnits)
    assert.equal(provenance.residues, fixture.summary.typedOwnerResidues)

    for (const recipe of fixture.recipes) {
      const row = provenance.selectedRows.find(value => value.id === recipe.id)
      assert.ok(row, `${recipe.id}: embedded raw provenance`)
      assert.equal(row.targetIndex, recipe.target.index)
      assert.deepEqual(
        row.ownerPaths,
        recipe.rejectedOwners.map(owner => owner.path),
        `${recipe.id}: pre-replay rejected owners`,
      )
      assert.deepEqual(
        row.residues,
        recipe.typedOwnerResidues,
        `${recipe.id}: selected typed residues`,
      )
      for (const rejected of recipe.rejectedOwners) {
        const bytes = readRawTargetBlob(provenance.sourceCommit, rejected.path)
        assert.equal(sha256(bytes), rejected.sha256)
        const featureAnchor = recipe.sourceRecipe.sourceAnchors[0]
        assert.ok(
          !bytes.toString('utf8').includes(featureAnchor),
          `${recipe.id}: raw rejected owner excludes ${JSON.stringify(featureAnchor)}`,
        )
      }
    }
  },
)

test(
  '2.1.117 replay overrides replace rejected nearest-source owners',
  { skip: !selected },
  t => {
    const materialized = materializeRawTargetSource(
      fixture.inputs.targetSemanticTree.commit,
    )
    t.after(() =>
      fs.rmSync(materialized.temporaryRoot, { recursive: true, force: true }),
    )
    const { sourceRoot } = materialized
    const replay = applyTarget117GeneratedOwnerRecovery({ sourceRoot })
    assert.equal(replay.status, 'recovered')
    assert.deepEqual(replay.after, fixture.recoveryReplay.recoveredSourceTree)
    assert.ok(fs.existsSync(coveragePath), `coverage exists: ${coveragePath}`)
    const coverage = JSON.parse(gunzipSync(fs.readFileSync(coveragePath)))
    const rows = new Map(coverage.rows.map(row => [row.targetIndex, row]))
    const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
    const overrides = new Map(
      TARGET117_GENERATED_OWNER_OVERRIDES.map(override => [
        override.targetIndex,
        override,
      ]),
    )
    const recoveredFiles = new Map(
      TARGET117_RECOVERED_SOURCE_FILES.map(file => [file.path, file]),
    )

    for (const recipe of fixture.recipes) {
      const row = rows.get(recipe.target.index)
      assert.ok(row, `${recipe.id}: coverage row`)
      assert.equal(row.start, recipe.target.start, `${recipe.id}: start`)
      assert.equal(row.end, recipe.target.end, `${recipe.id}: end`)
      assert.equal(
        row.sourceHash,
        recipe.target.sourceHash,
        `${recipe.id}: sourceHash`,
      )

      assert.equal(
        row.disposition,
        fixture.coverageRule.coveredDisposition,
        `${recipe.id}: covered disposition`,
      )

      const ownerPaths = row.ownerIds.map(ownerId => {
        const owner = owners.get(ownerId)
        assert.ok(owner, `${recipe.id}: owner ${ownerId}`)
        return owner
      })
      const rejected = new Set(recipe.rejectedOwners.map(owner => owner.path))
      const rejectedPaths = ownerPaths.filter(owner => rejected.has(owner))
      const override = overrides.get(recipe.target.index)
      assert.ok(override, `${recipe.id}: replay override`)
      assert.equal(override.key, `${caseName}:${recipe.target.index}`)

      if (
        ownerPaths.length !== override.paths.length ||
        ownerPaths.some((owner, index) => owner !== override.paths[index])
      ) {
        assert.ok(ownerPaths.length > 0, `${recipe.id}: provisional owners`)
        assert.equal(
          rejectedPaths.length,
          ownerPaths.length,
          `${recipe.id}: provisional coverage may contain only pinned rejected owners`,
        )
      }

      for (const owner of override.paths) {
        assert.ok(!rejected.has(owner), `${recipe.id}: override is not rejected`)
        const expectedFile = recoveredFiles.get(owner)
        assert.ok(expectedFile, `${recipe.id}: recovered file identity`)
        const filename = sourceFilename(sourceRoot, owner)
        assert.ok(filename, `${recipe.id}: recovered owner exists`)
        const contents = readExact(filename, expectedFile).toString('utf8')
        for (const anchor of recipe.sourceRecipe.sourceAnchors) {
          assert.ok(
            contents.includes(anchor),
            `${recipe.id}: ${owner} contains ${JSON.stringify(anchor)}`,
          )
        }
      }
    }
  },
)
