#!/usr/bin/env node
// Cross-case source-pin sweep: verifies, for every case under recovery/cases,
// that the manifest's pinned git endpoints exist in this clone's object store,
// that they are ancestors of the audited head, and that the cross-case source
// chain is contiguous (case N target == case N+1 base, by framed tree summary
// and by commit/tree identity where both sides pin one). Git-only: needs no
// artifacts and no worktrees, so it runs from a bare checkout in seconds.
//
// The known sanctioned exception is 2.1.118-to-2.1.119: its sourceLineage
// pins a target Git tree that was never carried by any commit (see the legacy
// carve-out in verify-source-lineage.mjs normalizeGitHistory). That tree must
// stay absent and is reported as an expected anomaly, not a failure.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const LEGACY_T119_CASE = '2.1.118-to-2.1.119'
const LEGACY_T119_TARGET_GIT_TREE = 'bceb0af2f6b5261fab23b9d8fee51cf48f1b2dd2'
const LEGACY_T119_TARGET_SRC_GIT_TREE = '9e807992d428e7e23a0ad96e3a53e286d372afd7'

// Duplicated from recovery/lib/private-verifier-carrier.mjs EXPECTED_CARRIER_HEADS
// (unexported there); each is the sealed public-repo head a later-release
// verifier requires, so an archive clone must keep all five reachable.
const EXPECTED_CARRIER_HEADS = Object.freeze({
  '2.1.120-to-2.1.121': '4593ba568ee2e840e1a0e3fdfd3b2a9fa51d2d45',
  '2.1.121-to-2.1.122': 'c30cece4b85c84cd9e92ca708c96d1cd3f8f6b87',
  '2.1.122-to-2.1.123': '338d170737e8294c489481bc2e8fac52d8ce5f85',
  '2.1.123-to-2.1.124': 'ae866640a6d67891fe14aeff5bc41da10784b979',
  '2.1.124-to-2.1.126': '09f32af45bf8e2882404bb5677e697cf99dd733b',
})

function parseArguments(argv) {
  const result = {
    repositoryRoot: path.resolve(fileURLToPath(new URL('../..', import.meta.url))),
    head: 'HEAD',
  }
  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--repo') {
      result.repositoryRoot = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (argument === '--head') {
      result.head = argv[index + 1] ?? ''
      index += 1
    } else {
      throw new Error(`Unknown argument: ${argument} (usage: [--repo DIR] [--head REV])`)
    }
  }
  assert(result.head.length > 0, 'Empty --head revision')
  return result
}

function createGit(repositoryRoot) {
  return function git(...args) {
    return execFileSync('git', args, {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  }
}

function readCaseManifests(repositoryRoot) {
  const casesRoot = path.join(repositoryRoot, 'recovery', 'cases')
  const names = fs
    .readdirSync(casesRoot)
    .filter(name => /^2\.1\.\d+-to-2\.1\.\d+$/.test(name))
    .sort((left, right) => {
      const patch = name => Number(name.split('-to-')[0].split('.')[2])
      return patch(left) - patch(right)
    })
  assert(names.length > 0, `No cases found under ${casesRoot}`)
  return names.map(name => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(casesRoot, name, 'manifest.json'), 'utf8'),
    )
    assert.equal(manifest.case, name, `${name}: manifest case name mismatch`)
    return manifest
  })
}

function verifyEndpoint(git, head, caseName, side, commit, gitTree, srcGitTree) {
  assert.match(commit, /^[a-f0-9]{40}$/, `${caseName}: ${side}Commit is not a full object id`)
  assert.equal(
    git('rev-parse', '--verify', `${commit}^{commit}`),
    commit,
    `${caseName}: ${side}Commit does not resolve to a commit`,
  )
  assert.equal(
    git('rev-parse', '--verify', `${commit}^{tree}`),
    gitTree,
    `${caseName}: ${side}GitTree mismatch`,
  )
  assert.equal(
    git('rev-parse', '--verify', `${commit}:src`),
    srcGitTree,
    `${caseName}: ${side} src tree mismatch`,
  )
  git('merge-base', '--is-ancestor', commit, head)
}

function main() {
  const { repositoryRoot, head } = parseArguments(process.argv)
  const git = createGit(repositoryRoot)
  const resolvedHead = git('rev-parse', '--verify', `${head}^{commit}`)
  const manifests = readCaseManifests(repositoryRoot)

  const cases = []
  const expectedAnomalies = []
  const links = { manifestSha256: 0, semanticTargetToNextBase: 0, srcTreeAdjacency: 0 }

  for (let index = 0; index < manifests.length; index += 1) {
    const manifest = manifests[index]
    const next = manifests[index + 1] ?? null
    const caseName = manifest.case
    const lineage = manifest.sourceLineage ?? null
    const row = { case: caseName, base: null, target: null, semanticTarget: null }

    if (lineage) {
      const baseSrcTree = lineage.baseSrcGitTree ?? lineage.baseSourceGitTree
      assert(baseSrcTree, `${caseName}: sourceLineage pins no base src tree`)
      verifyEndpoint(git, resolvedHead, caseName, 'base', lineage.baseCommit, lineage.baseGitTree, baseSrcTree)
      row.base = 'verified'

      if (caseName === LEGACY_T119_CASE) {
        assert.equal(lineage.targetCommit, undefined, `${caseName}: legacy case must not pin a targetCommit`)
        assert.equal(lineage.targetGitTree, LEGACY_T119_TARGET_GIT_TREE, `${caseName}: unexpected legacy targetGitTree`)
        assert.equal(lineage.targetSrcGitTree, LEGACY_T119_TARGET_SRC_GIT_TREE, `${caseName}: unexpected legacy targetSrcGitTree`)
        let legacyTreeResolves = true
        try {
          git('cat-file', '-e', `${LEGACY_T119_TARGET_GIT_TREE}^{tree}`)
        } catch {
          legacyTreeResolves = false
        }
        if (legacyTreeResolves) {
          row.target = 'legacy-carve-out-tree-unexpectedly-present'
        } else {
          expectedAnomalies.push('legacy-T119-target-tree-absent')
          row.target = 'legacy-carve-out'
        }
        assert.equal(
          git('rev-parse', '--verify', `${LEGACY_T119_TARGET_SRC_GIT_TREE}^{tree}`),
          LEGACY_T119_TARGET_SRC_GIT_TREE,
          `${caseName}: legacy target src tree must resolve`,
        )
      } else if (lineage.targetCommit) {
        verifyEndpoint(
          git,
          resolvedHead,
          caseName,
          'target',
          lineage.targetCommit,
          lineage.targetGitTree,
          lineage.targetSrcGitTree,
        )
        row.target = 'verified'
      }

      if (next?.sourceLineage) {
        assert.equal(
          lineage.target?.manifestSha256,
          next.sourceLineage.base?.manifestSha256,
          `${caseName}: target tree summary does not chain to ${next.case} base`,
        )
        links.manifestSha256 += 1
        const targetSrcTree = lineage.targetSrcGitTree ?? lineage.targetSourceGitTree
        const nextBaseSrcTree = next.sourceLineage.baseSrcGitTree ?? next.sourceLineage.baseSourceGitTree
        if (targetSrcTree && targetSrcTree !== LEGACY_T119_TARGET_GIT_TREE && nextBaseSrcTree) {
          assert.equal(
            targetSrcTree,
            nextBaseSrcTree,
            `${caseName}: target src tree does not equal ${next.case} base src tree`,
          )
          links.srcTreeAdjacency += 1
        }
      }
    }

    const semanticTarget = manifest.semanticSourceLineage?.targetCommit
    if (semanticTarget) {
      assert.equal(
        git('rev-parse', '--verify', `${semanticTarget}^{commit}`),
        semanticTarget,
        `${caseName}: semanticSourceLineage.targetCommit does not resolve`,
      )
      git('merge-base', '--is-ancestor', semanticTarget, resolvedHead)
      if (next?.sourceLineage) {
        assert.equal(
          semanticTarget,
          next.sourceLineage.baseCommit,
          `${caseName}: semantic target commit is not ${next.case} base commit`,
        )
        links.semanticTargetToNextBase += 1
      }
      row.semanticTarget = 'verified'
    }

    cases.push(row)
  }

  const carrierHeads = []
  for (const [caseName, carrierHead] of Object.entries(EXPECTED_CARRIER_HEADS)) {
    assert.equal(
      git('rev-parse', '--verify', `${carrierHead}^{commit}`),
      carrierHead,
      `${caseName}: carrier head does not resolve`,
    )
    git('merge-base', '--is-ancestor', carrierHead, resolvedHead)
    git('rev-parse', '--verify', `${carrierHead}:recovery/cases/${caseName}/manifest.json`)
    carrierHeads.push({ case: caseName, head: carrierHead, status: 'verified' })
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        status: 'all-source-pins-verified',
        repositoryRoot,
        head: resolvedHead,
        cases,
        links,
        carrierHeads: carrierHeads.length,
        expectedAnomalies,
      },
      null,
      2,
    )}\n`,
  )
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error?.stack ?? error}\n`)
  process.exitCode = 1
}
