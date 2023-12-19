import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  listConfinedRepositoryFiles as list122,
  readConfinedCaseFile as read122,
  readConfinedRepositoryFile as readRepo122,
} from '../scripts/verify-2.1.122-recovery.mjs'
import {
  authenticateArtifact as authenticate123Artifact,
  listConfinedRepositoryFiles as list123,
  readConfinedCaseFile as read123,
  readConfinedRepositoryFile as readRepo123,
} from '../scripts/verify-2.1.123-recovery.mjs'
import {
  authenticateArtifact as authenticate124Artifact,
  listConfinedRepositoryFiles as list124,
  readConfinedCaseFile as read124,
  readConfinedRepositoryFile as readRepo124,
} from '../scripts/verify-2.1.124-recovery.mjs'
import {
  authenticateArtifact as authenticate126Artifact,
  listConfinedRepositoryFiles as list126,
  readConfinedCaseFile as read126,
  readConfinedRepositoryFile as readRepo126,
} from '../scripts/verify-2.1.126-recovery.mjs'
import {
  assertCompleteRecoveryResult,
  createPrivateVerifierCarrier,
} from '../lib/private-verifier-carrier.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))

const readers = [
  ['2.1.122', read122],
  ['2.1.123', read123],
  ['2.1.124', read124],
  ['2.1.126', read126],
]

const artifactAuthenticators = [
  ['2.1.123', authenticate123Artifact],
  ['2.1.124', authenticate124Artifact],
  ['2.1.126', authenticate126Artifact],
]

const repositoryReaders = [
  ['2.1.122', readRepo122, list122],
  ['2.1.123', readRepo123, list123],
  ['2.1.124', readRepo124, list124],
  ['2.1.126', readRepo126, list126],
]

const parserBootstrapWrappers = [
  [
    '2.1.124',
    new URL('../scripts/verify-2.1.124-recovery.mjs', import.meta.url),
    new URL('../lib/release-2.1.124-input-contract.mjs', import.meta.url),
    'release-2.1.124-input-contract.mjs',
  ],
  [
    '2.1.126',
    new URL('../scripts/verify-2.1.126-recovery.mjs', import.meta.url),
    new URL('../lib/release-2.1.126-input-contract.mjs', import.meta.url),
    'release-2.1.126-input-contract.mjs',
  ],
]
const privateCarrierSource = new URL(
  '../lib/private-verifier-carrier.mjs',
  import.meta.url,
)

const directEntrypoints = [
  [
    '2.1.122 wrapper',
    new URL('../scripts/verify-2.1.122-recovery.mjs', import.meta.url),
  ],
  [
    '2.1.123 wrapper',
    new URL('../scripts/verify-2.1.123-recovery.mjs', import.meta.url),
  ],
  [
    '2.1.124 wrapper',
    new URL('../scripts/verify-2.1.124-recovery.mjs', import.meta.url),
  ],
  [
    '2.1.126 wrapper',
    new URL('../scripts/verify-2.1.126-recovery.mjs', import.meta.url),
  ],
  [
    'source-lineage verifier',
    new URL('../scripts/verify-source-lineage.mjs', import.meta.url),
  ],
]

for (const [label, entrypoint] of directEntrypoints) {
  test(`${label} executes through a symbolic-link entrypoint`, t => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'later-wrapper-symlink-entrypoint-'),
    )
    t.after(() =>
      fs.rmSync(temporaryRoot, { force: true, recursive: true }),
    )
    const linkedEntrypoint = path.join(temporaryRoot, 'verifier.mjs')
    fs.symlinkSync(fileURLToPath(entrypoint), linkedEntrypoint)
    const result = spawnSync(process.execPath, [linkedEntrypoint], {
      encoding: 'utf8',
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Usage:/)
  })
}

for (const [release, wrapperSource, contractSource, contractName] of
  parserBootstrapWrappers) {
  test(`${release} wrapper authenticates Acorn before evaluation`, t => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'later-wrapper-parser-bootstrap-'),
    )
    t.after(() =>
      fs.rmSync(temporaryRoot, { force: true, recursive: true }),
    )
    const scriptsRoot = path.join(temporaryRoot, 'recovery', 'scripts')
    const libraryRoot = path.join(temporaryRoot, 'recovery', 'lib')
    const parserRoot = path.join(
      temporaryRoot,
      'recovery',
      'node_modules',
      'acorn',
      'dist',
    )
    fs.mkdirSync(scriptsRoot, { recursive: true })
    fs.mkdirSync(libraryRoot, { recursive: true })
    fs.mkdirSync(parserRoot, { recursive: true })
    const wrapper = path.join(scriptsRoot, `verify-${release}-recovery.mjs`)
    fs.copyFileSync(wrapperSource, wrapper)
    fs.copyFileSync(contractSource, path.join(libraryRoot, contractName))
    fs.copyFileSync(
      privateCarrierSource,
      path.join(libraryRoot, 'private-verifier-carrier.mjs'),
    )

    const marker = path.join(temporaryRoot, 'poisoned-parser-executed')
    const attackPrefix = Buffer.from(
      [
        "import fs from 'node:fs'",
        `fs.writeFileSync(${JSON.stringify(marker)}, 'executed')`,
        'process.exit(0)',
        'export function parse() {}',
        '',
      ].join('\n'),
    )
    const expectedBytes = 229_792
    assert(attackPrefix.length < expectedBytes)
    fs.writeFileSync(
      path.join(parserRoot, 'acorn.mjs'),
      Buffer.concat([
        attackPrefix,
        Buffer.alloc(expectedBytes - attackPrefix.length, 0x20),
      ]),
      { mode: 0o644 },
    )

    const result = spawnSync(
      process.execPath,
      [
        wrapper,
        '--artifacts',
        path.join(temporaryRoot, 'artifacts'),
        '--baseline-tarball',
        path.join(temporaryRoot, 'baseline.tgz'),
        '--repo',
        temporaryRoot,
      ],
      { encoding: 'utf8' },
    )
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /pinned Acorn parser SHA-256/)
    assert.equal(fs.existsSync(marker), false)
  })
}

function completeResultFixture() {
  const caseRoot = fileURLToPath(
    new URL('../cases/2.1.124-to-2.1.126/', import.meta.url),
  )
  const manifest = JSON.parse(
    fs.readFileSync(path.join(caseRoot, 'manifest.json'), 'utf8'),
  )
  const sourceIdentity = JSON.parse(
    fs.readFileSync(
      path.join(caseRoot, 'recovered/source-freeze/identity.json'),
      'utf8',
    ),
  )
  const artifact = id => manifest.artifacts.find(item => item.id === id)
  const target = artifact('targetBundle')
  const analyzed = artifact(
    manifest.generatedRecovery.structural.targetArtifact,
  )
  const packageMembers = manifest.generatedRecovery.packageMembers
  const embedded = manifest.generatedRecovery.embeddedCode
  const frozenTests = sourceIdentity.verification.targetTests
  const targetTokens = manifest.generatedRecovery.structural.targetTokens
  return {
    manifest,
    sourceIdentity,
    result: {
      case: manifest.case,
      status: 'complete-recovery-verified',
      scope: manifest.recoveryScope,
      checks: {
        evidence: 'evidence-verified',
        bunExtraction: 'bun-container-verified',
        sourcePatches: 'source-lineage-verified',
        sourceReproduction: null,
        exactBundleDelta: 'exact-delta-verified',
        attribution: 'attribution-report-verified',
        structural: 'structural-ledger-verified',
        semanticCorrespondence:
          'whole-bundle-source-correspondence-verified',
        sourceSemanticReproduction:
          'whole-bundle-source-semantics-verified',
        readableDiff: 'readable-diff-verified',
        embeddedCode: 'embedded-code-reconstructed',
        packageTree: 'exact-package-tree-reconstructed',
      },
      bundle: { bytes: target.bytes, sha256: target.sha256 },
      analyzedBundle: { bytes: analyzed.bytes, sha256: analyzed.sha256 },
      packageTree: {
        members: packageMembers.targetMembers,
        bytes: packageMembers.targetMemberBytes,
        framedTreeSha256: packageMembers.targetFramedTreeSha256,
      },
      embeddedCode: {
        files: embedded.targetFiles,
        bytes: embedded.targetBytes,
        framedTreeSha256: embedded.targetFramedTreeSha256,
      },
      sourceTree: {
        files: sourceIdentity.source.files,
        gitTarget: {
          commit: sourceIdentity.target.commit,
          tree: sourceIdentity.target.tree,
          sourceTree: sourceIdentity.target.srcTree,
        },
      },
      tests: {
        status: 'passed',
        files: manifest.sourceLineage.testFiles,
        tapSummary: {
          tests: frozenTests.tests,
          passed: frozenTests.passed,
          failed: frozenTests.failed,
          skipped: frozenTests.skipped ?? 0,
        },
      },
      accounting: {
        targetUtf16: 1,
        unaccountedTargetUtf16: 0,
        targetTokens,
        classifiedTargetTokens: targetTokens,
        sourceSemanticTokens: targetTokens,
        unclassifiedSourceSemanticTokens: 0,
      },
    },
  }
}

test('complete-result binding accepts the exact release identity', () => {
  const fixture = completeResultFixture()
  assert.equal(assertCompleteRecoveryResult(fixture), fixture.result)
})

test('complete-result binding rejects generic-success substitutions', async t => {
  const mutations = [
    ['case', result => { result.case = '2.1.0-to-2.1.1' }],
    ['child status', result => { result.checks.embeddedCode = null }],
    ['bundle', result => { result.bundle.sha256 = '0'.repeat(64) }],
    ['package tree', result => { result.packageTree.bytes += 1 }],
    ['embedded code', result => { result.embeddedCode.files -= 1 }],
    ['source tree', result => { result.sourceTree.files -= 1 }],
    ['test files', result => { result.tests.files = [...result.tests.files].reverse() }],
    ['test counts', result => { result.tests.tapSummary.passed -= 1 }],
    ['accounting', result => { result.accounting.unaccountedTargetUtf16 = 1 }],
  ]
  for (const [label, mutate] of mutations) {
    await t.test(label, () => {
      const fixture = completeResultFixture()
      fixture.result = structuredClone(fixture.result)
      mutate(fixture.result)
      assert.throws(() => assertCompleteRecoveryResult(fixture))
    })
  }
})

test('private carrier rejects a modified canonical manifest before use', async () => {
  const fixture = completeResultFixture()
  const manifestBytes = fs.readFileSync(
    path.join(
      repositoryRoot,
      'recovery/cases/2.1.124-to-2.1.126/manifest.json',
    ),
  )
  manifestBytes[0] ^= 1
  await assert.rejects(
    createPrivateVerifierCarrier({
      artifactsRoot: repositoryRoot,
      baselineTarball: import.meta.filename,
      caseRoot: repositoryRoot,
      manifest: fixture.manifest,
      manifestBytes,
      repositoryRoot,
    }),
    /manifest identity/,
  )
})

test('private carrier rejects a noncanonical case directory', async t => {
  const fixture = completeResultFixture()
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'private-carrier-noncanonical-case-'),
  )
  t.after(() => fs.rmSync(temporaryRoot, { force: true, recursive: true }))
  const manifestBytes = fs.readFileSync(
    path.join(
      repositoryRoot,
      'recovery/cases/2.1.124-to-2.1.126/manifest.json',
    ),
  )
  fs.writeFileSync(path.join(temporaryRoot, 'manifest.json'), manifestBytes)
  await assert.rejects(
    createPrivateVerifierCarrier({
      artifactsRoot: repositoryRoot,
      baselineTarball: import.meta.filename,
      caseRoot: temporaryRoot,
      manifest: fixture.manifest,
      manifestBytes,
      repositoryRoot,
    }),
    /supplied verifier case is not canonical/,
  )
})

test('private carrier rejects the wrong proof-carrier HEAD', async () => {
  const fixture = completeResultFixture()
  const caseRoot = path.join(
    repositoryRoot,
    'recovery/cases/2.1.124-to-2.1.126',
  )
  const manifestBytes = fs.readFileSync(path.join(caseRoot, 'manifest.json'))
  await assert.rejects(
    createPrivateVerifierCarrier({
      artifactsRoot: repositoryRoot,
      baselineTarball: import.meta.filename,
      caseRoot,
      manifest: fixture.manifest,
      manifestBytes,
      repositoryRoot,
    }),
    /not the sealed case carrier/,
  )
})

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

for (const [
  release,
  readRepositoryFile,
  listRepositoryFiles,
] of repositoryReaders) {
  test(`${release} wrapper confines repository reads and discovery`, async t => {
    await t.test('reads and enumerates only bound regular files', () => {
      const { caseRoot: repo } = caseFixture(t, 'later-wrapper-repo-')
      fs.mkdirSync(path.join(repo, 'recovery'))
      fs.mkdirSync(path.join(repo, 'recovery', 'test'))
      fs.writeFileSync(
        path.join(repo, 'recovery', 'test', 'one.test.mjs'),
        'one',
      )
      fs.writeFileSync(
        path.join(repo, 'recovery', 'test', 'two.test.mjs'),
        'two',
      )

      assert.deepEqual(
        listRepositoryFiles(repo, 'recovery/test', 'test discovery'),
        ['one.test.mjs', 'two.test.mjs'],
      )
      assert.deepEqual(
        readRepositoryFile(
          repo,
          'recovery/test/one.test.mjs',
          'test contents',
        ),
        Buffer.from('one'),
      )
    })

    await t.test('rejects symbolic-link files during discovery', () => {
      const { caseRoot: repo, temporaryRoot } = caseFixture(
        t,
        'later-wrapper-repo-',
      )
      fs.mkdirSync(path.join(repo, 'recovery'))
      fs.mkdirSync(path.join(repo, 'recovery', 'test'))
      const outside = path.join(temporaryRoot, 'outside.test.mjs')
      fs.writeFileSync(outside, 'outside')
      fs.symlinkSync(
        outside,
        path.join(repo, 'recovery', 'test', 'linked.test.mjs'),
      )

      assert.throws(
        () => listRepositoryFiles(repo, 'recovery/test', 'test discovery'),
        /directory entry must be a regular file/,
      )
    })

    await t.test('binds the discovered directory across enumeration', () => {
      const { caseRoot: repo } = caseFixture(t, 'later-wrapper-repo-')
      const recoveryRoot = path.join(repo, 'recovery')
      const testRoot = path.join(recoveryRoot, 'test')
      const displaced = path.join(recoveryRoot, 'checked-test')
      fs.mkdirSync(recoveryRoot)
      fs.mkdirSync(testRoot)
      fs.writeFileSync(path.join(testRoot, 'one.test.mjs'), 'inside')

      const originalReaddirSync = fs.readdirSync
      let substituted = false
      fs.readdirSync = function injectedDirectorySubstitution(
        filename,
        ...arguments_
      ) {
        const entries = originalReaddirSync.call(this, filename, ...arguments_)
        if (!substituted && path.resolve(filename) === path.resolve(testRoot)) {
          substituted = true
          fs.renameSync(testRoot, displaced)
          fs.mkdirSync(testRoot)
          fs.writeFileSync(path.join(testRoot, 'one.test.mjs'), 'outside')
        }
        return entries
      }
      try {
        assert.throws(
          () => listRepositoryFiles(repo, 'recovery/test', 'test discovery'),
          /directory changed while enumerating/,
        )
      } finally {
        fs.readdirSync = originalReaddirSync
      }
      assert.equal(substituted, true)
    })
  })
}

function caseFixture(t, prefix = 'later-wrapper-confinement-') {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  t.after(() => fs.rmSync(temporaryRoot, { force: true, recursive: true }))
  const caseRoot = path.join(temporaryRoot, 'case')
  fs.mkdirSync(caseRoot)
  return { caseRoot, temporaryRoot }
}

for (const [release, readConfinedCaseFile] of readers) {
  test(`${release} wrapper confines case-local reads`, async t => {
    await t.test('reads a regular nested file', () => {
      const { caseRoot } = caseFixture(t)
      fs.mkdirSync(path.join(caseRoot, 'semantic'))
      fs.writeFileSync(
        path.join(caseRoot, 'semantic', 'evidence.json'),
        '{"ok":true}\n',
      )

      assert.deepEqual(
        readConfinedCaseFile(
          caseRoot,
          'semantic/evidence.json',
          'valid evidence',
        ),
        Buffer.from('{"ok":true}\n'),
      )
    })

    await t.test('rejects lexical traversal', () => {
      const { caseRoot, temporaryRoot } = caseFixture(t)
      fs.writeFileSync(path.join(temporaryRoot, 'outside.txt'), 'outside')

      assert.throws(
        () => readConfinedCaseFile(caseRoot, '../outside.txt', 'traversal'),
        /unsafe relative path/,
      )
      assert.throws(
        () =>
          readConfinedCaseFile(
            caseRoot,
            'semantic/../../outside.txt',
            'traversal',
          ),
        /unsafe relative path/,
      )
    })

    await t.test('rejects intermediate and final symbolic links', () => {
      const intermediate = caseFixture(t)
      const outsideDirectory = path.join(intermediate.temporaryRoot, 'outside')
      fs.mkdirSync(outsideDirectory)
      fs.writeFileSync(path.join(outsideDirectory, 'evidence.json'), '{}\n')
      fs.symlinkSync(outsideDirectory, path.join(intermediate.caseRoot, 'semantic'))
      assert.throws(
        () =>
          readConfinedCaseFile(
            intermediate.caseRoot,
            'semantic/evidence.json',
            'intermediate link',
          ),
        /symbolic-link path component/,
      )

      const final = caseFixture(t)
      fs.mkdirSync(path.join(final.caseRoot, 'semantic'))
      const outsideFile = path.join(final.temporaryRoot, 'outside.json')
      fs.writeFileSync(outsideFile, '{}\n')
      fs.symlinkSync(
        outsideFile,
        path.join(final.caseRoot, 'semantic', 'evidence.json'),
      )
      assert.throws(
        () =>
          readConfinedCaseFile(
            final.caseRoot,
            'semantic/evidence.json',
            'final link',
          ),
        /symbolic-link path component/,
      )
    })

    await t.test('rejects a symbolic-link case root', () => {
      const { caseRoot, temporaryRoot } = caseFixture(t)
      const outside = path.join(temporaryRoot, 'outside')
      fs.mkdirSync(outside)
      fs.writeFileSync(path.join(outside, 'value.txt'), 'outside')
      fs.rmSync(caseRoot, { recursive: true })
      fs.symlinkSync(outside, caseRoot, 'dir')

      assert.throws(
        () => readConfinedCaseFile(caseRoot, 'value.txt', 'linked root'),
        /case root must be a real directory/,
      )
    })

    await t.test('binds the checked root across realpath resolution', () => {
      const { caseRoot, temporaryRoot } = caseFixture(t)
      const displaced = path.join(temporaryRoot, 'checked-case')
      const outside = path.join(temporaryRoot, 'outside')
      fs.mkdirSync(outside)
      fs.writeFileSync(path.join(caseRoot, 'value.txt'), 'inside')
      fs.writeFileSync(path.join(outside, 'value.txt'), 'outside')

      const originalRealpathSync = fs.realpathSync
      let substituted = false
      fs.realpathSync = function injectedRootSubstitution(
        filename,
        ...arguments_
      ) {
        if (!substituted && path.resolve(filename) === path.resolve(caseRoot)) {
          substituted = true
          fs.renameSync(caseRoot, displaced)
          fs.symlinkSync(outside, caseRoot, 'dir')
        }
        return originalRealpathSync.call(this, filename, ...arguments_)
      }
      try {
        assert.throws(
          () => readConfinedCaseFile(caseRoot, 'value.txt', 'substituted root'),
          /case root changed while resolving/,
        )
      } finally {
        fs.realpathSync = originalRealpathSync
      }
      assert.equal(substituted, true)
    })

    await t.test('binds the checked target across open', () => {
      const { caseRoot } = caseFixture(t)
      const target = path.join(caseRoot, 'value.txt')
      const displaced = path.join(caseRoot, 'checked-value.txt')
      fs.writeFileSync(target, 'inside')

      const originalOpenSync = fs.openSync
      let substituted = false
      fs.openSync = function injectedTargetSubstitution(
        filename,
        ...arguments_
      ) {
        if (!substituted && path.resolve(filename) === path.resolve(target)) {
          substituted = true
          fs.renameSync(target, displaced)
          fs.writeFileSync(target, 'outside')
        }
        return originalOpenSync.call(this, filename, ...arguments_)
      }
      try {
        assert.throws(
          () => readConfinedCaseFile(caseRoot, 'value.txt', 'substituted target'),
          /target changed before open/,
        )
      } finally {
        fs.openSync = originalOpenSync
      }
      assert.equal(substituted, true)
    })
  })
}

for (const [release, authenticateArtifact] of artifactAuthenticators) {
  test(`${release} wrapper confines authenticated artifact reads`, async t => {
    await t.test('authenticates a regular file and rejects a final link', () => {
      const { caseRoot } = caseFixture(t, 'later-wrapper-artifact-')
      fs.mkdirSync(path.join(caseRoot, 'packages'))
      const value = Buffer.from('authenticated artifact\n')
      const filename = path.join(caseRoot, 'packages', 'package.tgz')
      fs.writeFileSync(filename, value)
      const artifact = {
        localPath: 'packages/package.tgz',
        bytes: value.length,
        sha256: sha256(value),
      }

      assert.equal(
        authenticateArtifact(caseRoot, artifact, 'target package'),
        fs.realpathSync(filename),
      )
      fs.renameSync(filename, path.join(caseRoot, 'packages', 'real-package.tgz'))
      fs.symlinkSync(
        path.join(caseRoot, 'packages', 'real-package.tgz'),
        filename,
      )
      assert.throws(
        () => authenticateArtifact(caseRoot, artifact, 'target package'),
        /symbolic-link path component/,
      )
    })

    await t.test('rejects a symbolic-link artifact root', () => {
      const { caseRoot, temporaryRoot } = caseFixture(
        t,
        'later-wrapper-artifact-',
      )
      const outside = path.join(temporaryRoot, 'outside')
      fs.mkdirSync(outside)
      const value = Buffer.from('outside\n')
      fs.writeFileSync(path.join(outside, 'package.tgz'), value)
      fs.rmSync(caseRoot, { recursive: true })
      fs.symlinkSync(outside, caseRoot, 'dir')

      assert.throws(
        () =>
          authenticateArtifact(
            caseRoot,
            {
              localPath: 'package.tgz',
              bytes: value.length,
              sha256: sha256(value),
            },
            'target package',
          ),
        /case root must be a real directory/,
      )
    })

    await t.test('binds the artifact root across realpath resolution', () => {
      const { caseRoot, temporaryRoot } = caseFixture(
        t,
        'later-wrapper-artifact-',
      )
      const displaced = path.join(temporaryRoot, 'checked-artifacts')
      const outside = path.join(temporaryRoot, 'outside')
      fs.mkdirSync(outside)
      const insideValue = Buffer.from('inside\n')
      const outsideValue = Buffer.from('outside\n')
      fs.writeFileSync(path.join(caseRoot, 'package.tgz'), insideValue)
      fs.writeFileSync(path.join(outside, 'package.tgz'), outsideValue)

      const originalRealpathSync = fs.realpathSync
      let substituted = false
      fs.realpathSync = function injectedArtifactRootSubstitution(
        filename,
        ...arguments_
      ) {
        if (!substituted && path.resolve(filename) === path.resolve(caseRoot)) {
          substituted = true
          fs.renameSync(caseRoot, displaced)
          fs.symlinkSync(outside, caseRoot, 'dir')
        }
        return originalRealpathSync.call(this, filename, ...arguments_)
      }
      try {
        assert.throws(
          () =>
            authenticateArtifact(
              caseRoot,
              {
                localPath: 'package.tgz',
                bytes: insideValue.length,
                sha256: sha256(insideValue),
              },
              'target package',
            ),
          /case root changed while resolving/,
        )
      } finally {
        fs.realpathSync = originalRealpathSync
      }
      assert.equal(substituted, true)
    })

    await t.test('rejects artifact substitution between check and open', () => {
      const { caseRoot } = caseFixture(t, 'later-wrapper-artifact-')
      const target = path.join(caseRoot, 'package.tgz')
      const displaced = path.join(caseRoot, 'checked-package.tgz')
      const insideValue = Buffer.from('inside artifact\n')
      fs.writeFileSync(target, insideValue)
      const artifact = {
        localPath: 'package.tgz',
        bytes: insideValue.length,
        sha256: sha256(insideValue),
      }

      const originalOpenSync = fs.openSync
      let substituted = false
      fs.openSync = function injectedArtifactSubstitution(
        filename,
        ...arguments_
      ) {
        if (!substituted && path.resolve(filename) === path.resolve(target)) {
          substituted = true
          fs.renameSync(target, displaced)
          fs.writeFileSync(target, 'outside artifact\n')
        }
        return originalOpenSync.call(this, filename, ...arguments_)
      }
      try {
        assert.throws(
          () => authenticateArtifact(caseRoot, artifact, 'target package'),
          /target changed before open/,
        )
      } finally {
        fs.openSync = originalOpenSync
      }
      assert.equal(substituted, true)
    })
  })
}
