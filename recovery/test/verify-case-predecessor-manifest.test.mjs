import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  verifyGeneratedRecoveryFiles,
  verifyPredecessorManifest,
} from '../scripts/verify-case.mjs'

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
)

const EDGES = [
  {
    case: '2.1.118-to-2.1.119',
    baseline: '2.1.118',
    target: '2.1.119',
    predecessorCase: '2.1.117-to-2.1.118',
    predecessorBaseline: '2.1.117',
    kind: 'legacy',
  },
  {
    case: '2.1.119-to-2.1.120',
    baseline: '2.1.119',
    target: '2.1.120',
    predecessorCase: '2.1.118-to-2.1.119',
    predecessorBaseline: '2.1.118',
    kind: 'modern',
  },
  {
    case: '2.1.120-to-2.1.121',
    baseline: '2.1.120',
    target: '2.1.121',
    predecessorCase: '2.1.119-to-2.1.120',
    predecessorBaseline: '2.1.119',
    kind: 'modern',
  },
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function writeJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
  fs.writeFileSync(filename, bytes)
  return bytes
}

function generatedRecoveryManifest(relative, value) {
  const bytes = Buffer.from(value)
  return {
    generatedRecovery: {
      fileAssertions: [
        {
          path: relative,
          bytes: bytes.length,
          sha256: sha256(bytes),
        },
      ],
    },
  }
}

function releaseAdjacency(baseline, target) {
  return {
    baseline,
    target,
    targetIsNextPublishedVersion: true,
    skipped: [],
    skippedVersionsAbsent: true,
  }
}

function createFixture(edge) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'verify-case-predecessor-'),
  )
  const predecessorRelative =
    `recovery/cases/${edge.predecessorCase}/manifest.json`
  const predecessorFilename = path.join(root, ...predecessorRelative.split('/'))
  const currentFilename = path.join(
    root,
    'recovery',
    'cases',
    edge.case,
    'manifest.json',
  )
  const predecessorTarget = {
    files: 42,
    bytes: 12_345,
    manifestSha256: 'a'.repeat(64),
  }
  const predecessorLineage = {
    root: 'src',
    patchSet: `${edge.predecessorCase}-incremental`,
    base: {
      files: 40,
      bytes: 12_000,
      manifestSha256: 'b'.repeat(64),
    },
    target: predecessorTarget,
    ...(edge.kind === 'legacy'
      ? {
          testResult: {
            base: { tests: 3, pass: 3, fail: 0 },
            appliedTarget: { tests: 3, pass: 3, fail: 0 },
          },
          verifierResult: {
            status: 'source-lineage-verified',
            byteComparison: 'exact',
          },
        }
      : {}),
  }
  const predecessor = {
    schemaVersion: 4,
    case: edge.predecessorCase,
    releaseAdjacency: releaseAdjacency(
      edge.predecessorBaseline,
      edge.baseline,
    ),
    recoveryScope:
      edge.kind === 'modern'
        ? {
            allSemanticObligationsVerified: true,
            sourceClosurePending: false,
            semanticClosurePending: false,
          }
        : {},
    ...(edge.kind === 'modern'
      ? {
          sourceFreeze: { status: 'immutable-and-self-verifying' },
          finalization: { status: 'complete' },
        }
      : {}),
    sourceOracle: {
      appliedSourceTree: {
        patchSet:
          `cumulative-2.1.89-through-${edge.baseline}-` +
          'source-facing-overlays',
        fileCount: 2,
        files: [
          {
            path: 'src/alpha.ts',
            bytes: 1,
            sha256: 'c'.repeat(64),
          },
          {
            path: 'src/zeta.ts',
            bytes: 2,
            sha256: 'd'.repeat(64),
          },
        ],
      },
    },
    sourceLineage: predecessorLineage,
  }
  if (edge.kind === 'modern') {
    writeJson(
      path.join(
        root,
        'recovery',
        'cases',
        edge.predecessorCase,
        'recovered',
        'source-lineage-core.json',
      ),
      predecessorLineage,
    )
  }
  const predecessorBytes = writeJson(predecessorFilename, predecessor)
  const current = {
    schemaVersion: 4,
    case: edge.case,
    releaseAdjacency: {
      ...releaseAdjacency(edge.baseline, edge.target),
      predecessorManifest: {
        path: predecessorRelative,
        bytes: predecessorBytes.length,
        sha256: sha256(predecessorBytes),
      },
    },
    sourceLineage: {
      base: structuredClone(predecessorTarget),
      target: {
        files: 43,
        bytes: 12_678,
        manifestSha256: 'e'.repeat(64),
      },
    },
  }
  writeJson(currentFilename, current)
  return {
    root,
    current,
    currentFilename,
    predecessor,
    predecessorFilename,
    remove() {
      fs.rmSync(root, { recursive: true, force: true })
    },
  }
}

test('authenticates all protected predecessor release edges', async t => {
  for (const edge of EDGES) {
    await t.test(`${edge.predecessorCase} -> ${edge.case}`, () => {
      const fixture = createFixture(edge)
      try {
        assert.deepEqual(
          verifyPredecessorManifest(
            fixture.current,
            fixture.currentFilename,
            fixture.root,
          ),
          {
            status: 'predecessor-manifest-verified',
            case: edge.predecessorCase,
            releaseTarget: edge.baseline,
            path: `recovery/cases/${edge.predecessorCase}/manifest.json`,
            bytes: fixture.current.releaseAdjacency.predecessorManifest.bytes,
            sha256:
              fixture.current.releaseAdjacency.predecessorManifest.sha256,
          },
        )
      } finally {
        fixture.remove()
      }
    })
  }
})

test('authenticates the live protected predecessor manifest chain', async t => {
  for (const edge of EDGES) {
    await t.test(edge.case, () => {
      const manifestFilename = path.join(
        REPOSITORY_ROOT,
        'recovery',
        'cases',
        edge.case,
        'manifest.json',
      )
      const manifest = JSON.parse(fs.readFileSync(manifestFilename, 'utf8'))
      const result = verifyPredecessorManifest(
        manifest,
        manifestFilename,
        REPOSITORY_ROOT,
      )
      assert.equal(result.status, 'predecessor-manifest-verified')
      assert.equal(result.case, edge.predecessorCase)
      assert.equal(result.releaseTarget, edge.baseline)
      assert.equal(
        result.sha256,
        manifest.releaseAdjacency.predecessorManifest.sha256,
      )
    })
  }
})

test('rejects a missing predecessor descriptor or file', async t => {
  await t.test('missing descriptor', () => {
    const fixture = createFixture(EDGES[0])
    try {
      delete fixture.current.releaseAdjacency.predecessorManifest
      assert.throws(
        () =>
          verifyPredecessorManifest(
            fixture.current,
            fixture.currentFilename,
            fixture.root,
          ),
        /requires releaseAdjacency\.predecessorManifest/,
      )
    } finally {
      fixture.remove()
    }
  })

  await t.test('missing file', () => {
    const fixture = createFixture(EDGES[0])
    try {
      fs.unlinkSync(fixture.predecessorFilename)
      assert.throws(
        () =>
          verifyPredecessorManifest(
            fixture.current,
            fixture.currentFilename,
            fixture.root,
          ),
        /missing path component/,
      )
    } finally {
      fixture.remove()
    }
  })
})

test('rejects traversal and symlinked predecessor paths', async t => {
  await t.test('repository traversal', () => {
    const fixture = createFixture(EDGES[0])
    try {
      fixture.current.releaseAdjacency.predecessorManifest.path =
        '../outside.json'
      assert.throws(
        () =>
          verifyPredecessorManifest(
            fixture.current,
            fixture.currentFilename,
            fixture.root,
          ),
        /unsafe repository-relative path/,
      )
    } finally {
      fixture.remove()
    }
  })

  await t.test('symlinked path component', () => {
    const fixture = createFixture(EDGES[0])
    try {
      const predecessorDirectory = path.dirname(fixture.predecessorFilename)
      const relocatedDirectory = path.join(fixture.root, 'relocated-predecessor')
      fs.renameSync(predecessorDirectory, relocatedDirectory)
      fs.symlinkSync(relocatedDirectory, predecessorDirectory, 'dir')
      assert.throws(
        () =>
          verifyPredecessorManifest(
            fixture.current,
            fixture.currentFilename,
            fixture.root,
          ),
        /symlink path component/,
      )
    } finally {
      fixture.remove()
    }
  })
})

test('reads only regular generated files below the real case directory', async t => {
  await t.test('regular file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-case-file-'))
    const caseRoot = path.join(root, 'case')
    const recovered = path.join(caseRoot, 'recovered')
    const filename = path.join(recovered, 'result.txt')
    fs.mkdirSync(recovered, { recursive: true })
    fs.writeFileSync(filename, 'verified\n')
    try {
      const result = verifyGeneratedRecoveryFiles(
        generatedRecoveryManifest('recovered/result.txt', 'verified\n'),
        path.join(caseRoot, 'manifest.json'),
      )
      assert.deepEqual(result.files, [
        {
          path: 'recovered/result.txt',
          bytes: 9,
          sha256: sha256('verified\n'),
        },
      ])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  await t.test('symlinked directory component', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-case-file-'))
    const caseRoot = path.join(root, 'case')
    const outside = path.join(root, 'outside')
    fs.mkdirSync(caseRoot)
    fs.mkdirSync(outside)
    fs.writeFileSync(path.join(outside, 'result.txt'), 'outside\n')
    fs.symlinkSync(outside, path.join(caseRoot, 'recovered'), 'dir')
    try {
      assert.throws(
        () =>
          verifyGeneratedRecoveryFiles(
            generatedRecoveryManifest('recovered/result.txt', 'outside\n'),
            path.join(caseRoot, 'manifest.json'),
          ),
        /symlink path component/,
      )
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  await t.test('symlinked final file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-case-file-'))
    const caseRoot = path.join(root, 'case')
    const recovered = path.join(caseRoot, 'recovered')
    const outside = path.join(root, 'outside.txt')
    fs.mkdirSync(recovered, { recursive: true })
    fs.writeFileSync(outside, 'outside\n')
    fs.symlinkSync(outside, path.join(recovered, 'result.txt'), 'file')
    try {
      assert.throws(
        () =>
          verifyGeneratedRecoveryFiles(
            generatedRecoveryManifest('recovered/result.txt', 'outside\n'),
            path.join(caseRoot, 'manifest.json'),
          ),
        /symlink path component/,
      )
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  await t.test('non-regular final path', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-case-file-'))
    const caseRoot = path.join(root, 'case')
    const directory = path.join(caseRoot, 'recovered', 'result.txt')
    fs.mkdirSync(directory, { recursive: true })
    try {
      assert.throws(
        () =>
          verifyGeneratedRecoveryFiles(
            generatedRecoveryManifest('recovered/result.txt', ''),
            path.join(caseRoot, 'manifest.json'),
          ),
        /expected a regular file/,
      )
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  await t.test('symlinked case root', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-case-file-'))
    const caseRoot = path.join(root, 'case')
    const outside = path.join(root, 'outside')
    fs.mkdirSync(path.join(outside, 'recovered'), { recursive: true })
    fs.writeFileSync(path.join(outside, 'recovered', 'result.txt'), 'outside\n')
    fs.symlinkSync(outside, caseRoot, 'dir')
    try {
      assert.throws(
        () =>
          verifyGeneratedRecoveryFiles(
            generatedRecoveryManifest('recovered/result.txt', 'outside\n'),
            path.join(caseRoot, 'manifest.json'),
          ),
        /root must be a real directory/,
      )
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  await t.test('case root substitution during realpath', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-case-file-'))
    const caseRoot = path.join(root, 'case')
    const displaced = path.join(root, 'checked-case')
    const outside = path.join(root, 'outside')
    fs.mkdirSync(path.join(caseRoot, 'recovered'), { recursive: true })
    fs.mkdirSync(path.join(outside, 'recovered'), { recursive: true })
    fs.writeFileSync(path.join(caseRoot, 'recovered', 'result.txt'), 'inside\n')
    fs.writeFileSync(path.join(outside, 'recovered', 'result.txt'), 'outside\n')
    const originalRealpathSync = fs.realpathSync
    let substituted = false
    fs.realpathSync = function injectedRootSubstitution(filename, ...arguments_) {
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
          verifyGeneratedRecoveryFiles(
            generatedRecoveryManifest('recovered/result.txt', 'outside\n'),
            path.join(caseRoot, 'manifest.json'),
          ),
        /root changed while resolving/,
      )
    } finally {
      fs.realpathSync = originalRealpathSync
      fs.rmSync(root, { recursive: true, force: true })
    }
    assert.equal(substituted, true)
  })
})

test('rejects predecessor manifest hash drift before parsing', () => {
  const fixture = createFixture(EDGES[0])
  try {
    const original = fs.readFileSync(fixture.predecessorFilename, 'utf8')
    const drifted = original.replace('"schemaVersion": 4', '"schemaVersion": 5')
    assert.equal(Buffer.byteLength(drifted), Buffer.byteLength(original))
    fs.writeFileSync(fixture.predecessorFilename, drifted)
    assert.throws(
      () =>
        verifyPredecessorManifest(
          fixture.current,
          fixture.currentFilename,
          fixture.root,
        ),
      /predecessor manifest sha256/,
    )
  } finally {
    fixture.remove()
  }
})

test('rejects predecessor target/current base lineage drift', () => {
  const fixture = createFixture(EDGES[2])
  try {
    fixture.current.sourceLineage.base.bytes += 1
    assert.throws(
      () =>
        verifyPredecessorManifest(
          fixture.current,
          fixture.currentFilename,
          fixture.root,
        ),
      /predecessor target\/current base lineage/,
    )
  } finally {
    fixture.remove()
  }
})

test('rejects a missing lineage identity instead of accepting vacuous equality', () => {
  const fixture = createFixture(EDGES[0])
  try {
    delete fixture.current.sourceLineage.base
    assert.throws(
      () =>
        verifyPredecessorManifest(
          fixture.current,
          fixture.currentFilename,
          fixture.root,
        ),
      /current base lineage: invalid source-tree identity/,
    )
  } finally {
    fixture.remove()
  }
})

test('rejects drift between a modern manifest and its lineage core', () => {
  const fixture = createFixture(EDGES[1])
  try {
    const lineageFilename = path.join(
      fixture.root,
      'recovery',
      'cases',
      EDGES[1].predecessorCase,
      'recovered',
      'source-lineage-core.json',
    )
    const lineage = JSON.parse(fs.readFileSync(lineageFilename, 'utf8'))
    lineage.target.bytes += 1
    writeJson(lineageFilename, lineage)
    assert.throws(
      () =>
        verifyPredecessorManifest(
          fixture.current,
          fixture.currentFilename,
          fixture.root,
        ),
      /predecessor embedded source lineage/,
    )
  } finally {
    fixture.remove()
  }
})
