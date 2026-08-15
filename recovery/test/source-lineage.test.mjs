import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(
  new URL('../scripts/verify-source-lineage.mjs', import.meta.url),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function write(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, value)
}

function sourceTree(root) {
  const sourceRoot = path.join(root, 'src')
  const pending = [sourceRoot]
  const files = []
  while (pending.length > 0) {
    const directory = pending.pop()
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) pending.push(filename)
      else if (entry.isFile()) files.push(filename)
    }
  }
  const records = files
    .map(filename => {
      const value = fs.readFileSync(filename)
      return {
        path:
          'src/' +
          path.relative(sourceRoot, filename).split(path.sep).join('/'),
        bytes: value.length,
        sha256: sha256(value),
      }
    })
    .sort((left, right) =>
      left.path === right.path ? 0 : left.path < right.path ? -1 : 1,
    )
  const hash = crypto.createHash('sha256')
  let bytes = 0
  for (const record of records) {
    bytes += record.bytes
    hash
      .update(record.path)
      .update('\0')
      .update(String(record.bytes))
      .update('\0')
      .update(record.sha256)
      .update('\n')
  }
  return {
    files: records.length,
    bytes,
    manifestSha256: hash.digest('hex'),
  }
}

function git(repository, ...arguments_) {
  return execFileSync('git', arguments_, {
    cwd: repository,
    encoding: 'utf8',
  }).trim()
}

function createFixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'source-lineage-test-'),
  )
  const repository = path.join(root, 'repository')
  const caseRoot = path.join(
    repository,
    'recovery',
    'cases',
    '1.0.0-to-1.0.1',
  )
  const artifacts = path.join(root, 'artifacts')
  const manifestPath = path.join(caseRoot, 'manifest.json')
  const patchPath = path.join(caseRoot, 'recovered', 'source.patch')
  const artifactPath = path.join(artifacts, '1.0.1', 'cli.js')

  write(
    path.join(repository, 'src', 'example.ts'),
    'export const value = "before"\n',
  )
  write(
    path.join(repository, 'src', 'nested', 'stable.ts'),
    'export const stable = true\n',
  )
  const base = sourceTree(repository)
  git(repository, 'init', '-q')
  git(repository, 'config', 'user.name', 'Recovery Test')
  git(repository, 'config', 'user.email', 'recovery-test@example.invalid')
  git(repository, 'add', 'src')
  git(repository, 'commit', '-qm', 'fixture base')
  const gitBase = {
    baseCommit: git(repository, 'rev-parse', 'HEAD'),
    baseGitTree: git(repository, 'rev-parse', 'HEAD^{tree}'),
    baseSourceGitTree: git(repository, 'rev-parse', 'HEAD:src'),
  }

  write(
    path.join(repository, 'src', 'example.ts'),
    'export const value = "after"\n',
  )
  write(
    path.join(repository, 'src', 'new.ts'),
    'export const added = 1\n',
  )
  const target = sourceTree(repository)

  const patch = [
    'diff --git a/src/example.ts b/src/example.ts',
    '--- a/src/example.ts',
    '+++ b/src/example.ts',
    '@@ -1 +1 @@',
    '-export const value = "before"',
    '+export const value = "after"',
    'diff --git a/src/new.ts b/src/new.ts',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/src/new.ts',
    '@@ -0,0 +1 @@',
    '+export const added = 1',
    '',
  ].join('\n')
  write(patchPath, patch)

  const artifact = 'verified target artifact\n'
  write(artifactPath, artifact)
  const helper = [
    "import fs from 'node:fs'",
    '',
    'export function readArtifact(filename) {',
    "  return fs.readFileSync(filename, 'utf8')",
    '}',
    '',
  ].join('\n')
  const helperRelative = 'lineage-fixtures/semantic-helper.mjs'
  write(path.join(repository, helperRelative), helper)
  const testRelative = 'lineage-fixtures/semantic.test.mjs'
  const semanticTest = [
    "import assert from 'node:assert/strict'",
    "import test from 'node:test'",
    "import { readArtifact } from './semantic-helper.mjs'",
    `const bundleWitness = ${JSON.stringify(
      "await import('../bridge/trustedDevice.js')",
    )}`,
    '',
    "test('receives the verified artifact path', () => {",
    '  assert.match(bundleWitness, /trustedDevice/)',
    '  assert.equal(',
    '    readArtifact(process.env.LINEAGE_TEST_ARTIFACT),',
    `    ${JSON.stringify(artifact)},`,
    '  )',
    '})',
    '',
  ].join('\n')
  write(
    path.join(repository, testRelative),
    semanticTest,
  )

  const manifest = {
    case: '1.0.0-to-1.0.1',
    artifacts: [
      {
        id: 'targetBundle',
        localPath: '1.0.1/cli.js',
        bytes: Buffer.byteLength(artifact),
        sha256: sha256(artifact),
      },
    ],
    recoveredFileAssertions: [
      {
        path: 'recovered/source.patch',
        bytes: Buffer.byteLength(patch),
        sha256: sha256(patch),
      },
    ],
    sourceLineage: {
      root: 'src',
      patchOrder: ['recovered/source.patch'],
      base,
      target,
      syntaxCheck: ['src/example.ts', 'src/new.ts'],
      testFiles: [testRelative],
      testFileAssertions: [
        {
          path: helperRelative,
          bytes: Buffer.byteLength(helper),
          sha256: sha256(helper),
        },
        {
          path: testRelative,
          bytes: Buffer.byteLength(semanticTest),
          sha256: sha256(semanticTest),
        },
      ],
      testArtifactEnvironment: {
        LINEAGE_TEST_ARTIFACT: 'targetBundle',
      },
    },
  }
  write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  return {
    artifacts,
    base,
    gitBase,
    manifest,
    manifestPath,
    repository,
    root,
    target,
  }
}

function invoke(fixture) {
  return spawnSync(
    process.execPath,
    [
      SCRIPT,
      '--case',
      fixture.manifestPath,
      '--repo',
      fixture.repository,
      '--artifacts',
      fixture.artifacts,
    ],
    {
      encoding: 'utf8',
      env: process.env,
      maxBuffer: 16 * 1024 * 1024,
    },
  )
}

function rewriteManifest(fixture, update) {
  const manifest = JSON.parse(fs.readFileSync(fixture.manifestPath, 'utf8'))
  update(manifest)
  fs.writeFileSync(
    fixture.manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
}

test('verifies an incremental source lineage in both directions', () => {
  const fixture = createFixture()
  try {
    const result = invoke(fixture)
    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(result.stdout)
    assert.equal(report.status, 'source-lineage-verified')
    assert.equal(report.patchSet, 'incremental')
    assert.deepEqual(report.base, fixture.base)
    assert.deepEqual(report.target, fixture.target)
    assert.equal(report.sourceTree.state, 'verified-incremental-overlay')
    assert.deepEqual(report.sourceTree.base, fixture.base)
    assert.deepEqual(report.sourceTree.target, fixture.target)
    assert.deepEqual(report.sourceTree.repository, fixture.target)
    assert.equal(
      report.sourceTree.byteComparison,
      'reconstructed-overlay-to-repository-src-exact',
    )
    assert.equal(report.sourceTree.targetBundleComparison, 'not-performed')
    assert.equal(
      report.sourceTree.reproducesAuthenticatedTargetBundleExactly,
      false,
    )
    assert.equal(report.gitBase, null)
    assert.deepEqual(report.syntaxChecks, [
      'src/example.ts',
      'src/new.ts',
    ])
    assert.equal(report.patches.length, 1)
    assert.equal(report.patches[0].path, 'recovered/source.patch')
    assert.equal(report.tests.status, 'passed')
    assert.deepEqual(report.tests.files, [
      'lineage-fixtures/semantic.test.mjs',
    ])
    assert.deepEqual(
      report.testFileAssertions.map(assertion => assertion.path),
      [
        'lineage-fixtures/semantic-helper.mjs',
        'lineage-fixtures/semantic.test.mjs',
      ],
    )
    assert.equal(
      report.tests.artifactEnvironment.LINEAGE_TEST_ARTIFACT.artifact,
      'targetBundle',
    )
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('pins the reversible source base to reachable Git objects', () => {
  const fixture = createFixture()
  try {
    rewriteManifest(fixture, manifest => {
      Object.assign(manifest.sourceLineage, fixture.gitBase)
    })
    const result = invoke(fixture)
    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(result.stdout)
    assert.deepEqual(report.gitBase, {
      commit: fixture.gitBase.baseCommit,
      tree: fixture.gitBase.baseGitTree,
      sourceTree: fixture.gitBase.baseSourceGitTree,
      sourceComparison: 'exact',
    })
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('rejects a dangling or mismatched Git base declaration', () => {
  const fixture = createFixture()
  try {
    rewriteManifest(fixture, manifest => {
      Object.assign(manifest.sourceLineage, fixture.gitBase, {
        baseCommit: '0'.repeat(40),
      })
    })
    let result = invoke(fixture)
    assert.notEqual(result.status, 0)
    assert.match(
      result.stderr,
      /rev-parse.*failed|unknown revision|Needed a single revision/,
    )

    rewriteManifest(fixture, manifest => {
      Object.assign(manifest.sourceLineage, fixture.gitBase, {
        baseSourceGitTree: fixture.gitBase.baseGitTree,
      })
    })
    result = invoke(fixture)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /sourceLineage\.baseSourceGitTree/)
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('requires the complete Git base field set', () => {
  const fixture = createFixture()
  try {
    rewriteManifest(fixture, manifest => {
      manifest.sourceLineage.baseCommit = fixture.gitBase.baseCommit
    })
    const result = invoke(fixture)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /git base must provide/)
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('rejects a partially applied or tampered repository source tree', () => {
  const fixture = createFixture()
  try {
    fs.rmSync(path.join(fixture.repository, 'src', 'new.ts'))
    write(
      path.join(fixture.repository, 'src', 'example.ts'),
      'export const value = "before"\n',
    )
    const result = invoke(fixture)
    assert.notEqual(result.status, 0)
    assert.match(
      result.stderr,
      /repository target source tree (file count|byte length|manifest SHA-256)/,
    )
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('rejects a patch chain that does not recover the pinned base tree', () => {
  const fixture = createFixture()
  try {
    rewriteManifest(fixture, manifest => {
      manifest.sourceLineage.base.manifestSha256 = '0'.repeat(64)
    })
    const result = invoke(fixture)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /recovered base source tree manifest SHA-256/)
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('rejects case-relative patch traversal', () => {
  const fixture = createFixture()
  try {
    rewriteManifest(fixture, manifest => {
      manifest.sourceLineage.patchOrder = ['../outside.patch']
    })
    const result = invoke(fixture)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /unsafe relative path/)
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('rejects a tampered semantic test support file', () => {
  const fixture = createFixture()
  try {
    write(
      path.join(
        fixture.repository,
        'lineage-fixtures',
        'semantic-helper.mjs',
      ),
      "export const readArtifact = () => 'forged'\n",
    )
    const result = invoke(fixture)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /semantic-helper\.mjs (byte length|SHA-256)/)
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('requires assertions for relative semantic test dependencies', () => {
  const fixture = createFixture()
  try {
    rewriteManifest(fixture, manifest => {
      manifest.sourceLineage.testFileAssertions =
        manifest.sourceLineage.testFileAssertions.filter(
          assertion => !assertion.path.endsWith('semantic-helper.mjs'),
        )
    })
    const result = invoke(fixture)
    assert.notEqual(result.status, 0)
    assert.match(
      result.stderr,
      /Missing sourceLineage test file assertion for imported .*semantic-helper\.mjs/,
    )
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})
