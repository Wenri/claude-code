import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const SCRIPT = fileURLToPath(
  new URL('../scripts/verify-source-lineage.mjs', import.meta.url),
)
const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const T120_FREEZE_BUILDER = fileURLToPath(
  new URL('../scripts/build-2.1.120-source-freeze.mjs', import.meta.url),
)
const T121_FREEZE_BUILDER = fileURLToPath(
  new URL('../scripts/build-2.1.121-source-freeze.mjs', import.meta.url),
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

function createFixture({ asymmetricTestTarget = false, withSandbox = false } = {}) {
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
  git(repository, 'add', 'src')
  git(repository, 'commit', '-qm', 'fixture target')
  const gitTarget = {
    targetCommit: git(repository, 'rev-parse', 'HEAD'),
    targetGitTree: git(repository, 'rev-parse', 'HEAD^{tree}'),
    targetSrcGitTree: git(repository, 'rev-parse', 'HEAD:src'),
  }
  let testGitTarget = { ...gitTarget }
  if (asymmetricTestTarget) {
    write(
      path.join(repository, 'authenticated-test-provenance.txt'),
      'semantic test repository identity\n',
    )
    git(repository, 'add', 'authenticated-test-provenance.txt')
    git(repository, 'commit', '-qm', 'fixture semantic test identity')
    testGitTarget = {
      targetCommit: git(repository, 'rev-parse', 'HEAD'),
      targetGitTree: git(repository, 'rev-parse', 'HEAD^{tree}'),
      targetSrcGitTree: git(repository, 'rev-parse', 'HEAD:src'),
    }
    assert.equal(testGitTarget.targetSrcGitTree, gitTarget.targetSrcGitTree)
    assert.notEqual(testGitTarget.targetGitTree, gitTarget.targetGitTree)
  }

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
  const expandedSandboxValue = 'authenticated expanded sandbox input\n'
  const compressedSandboxValue = gzipSync(expandedSandboxValue, { mtime: 0 })
  const compressedSandboxRelative = 'structural/sandbox-input.txt.gz'
  const toolchainValue = 'authenticated toolchain input\n'
  const toolchainRelative =
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js'
  const executableToolchainValue = [
    '#!/bin/sh',
    'if test -n "${BUN_OPTIONS-}${LD_PRELOAD-}${LD_LIBRARY_PATH-}${DYLD_INSERT_LIBRARIES-}"; then',
    '  exit 65',
    'fi',
    'output=',
    'for argument in "$@"; do',
    '  case "$argument" in',
    '    --outfile=*) output=${argument#--outfile=} ;;',
    '  esac',
    'done',
    'if test -n "$output"; then',
    '  printf \'%s\\n\' \'export {}\' > "$output"',
    'else',
    '  printf \'fixture-bun\\n\'',
    'fi',
    '',
  ].join('\n')
  const executableToolchainRelative = '.pixi/envs/default/bin/bun'
  if (withSandbox) {
    write(path.join(caseRoot, compressedSandboxRelative), compressedSandboxValue)
    write(path.join(repository, toolchainRelative), toolchainValue)
    write(
      path.join(repository, executableToolchainRelative),
      executableToolchainValue,
    )
    fs.chmodSync(path.join(repository, executableToolchainRelative), 0o755)
  }
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
    "import { execFileSync } from 'node:child_process'",
    "import fs from 'node:fs'",
    "import path from 'node:path'",
    "import test from 'node:test'",
    "import { fileURLToPath } from 'node:url'",
    "import { readArtifact } from './semantic-helper.mjs'",
    `const bundleWitness = ${JSON.stringify(
      "await import('../bridge/trustedDevice.js')",
    )}`,
    'const baselineRepositoryRoot =',
    '  process.env.CLAUDE_CODE_1_0_0_REPOSITORY_ROOT',
    'const targetRepositoryRoot =',
    '  process.env.CLAUDE_CODE_1_0_1_REPOSITORY_ROOT',
    'const expectedTargetSourceRoot = targetRepositoryRoot === undefined',
    `  ? ${JSON.stringify(path.join(repository, 'src'))}`,
    "  : path.join(targetRepositoryRoot, 'src')",
    'function git(root, expression) {',
    "  return execFileSync('git', ['rev-parse', '--verify', expression], {",
    '    cwd: root,',
    "    encoding: 'utf8',",
    '  }).trim()',
    '}',
    '',
    "test('receives the verified artifact path', () => {",
    '  assert.match(bundleWitness, /trustedDevice/)',
    '  assert.equal(',
    '    process.env.CLAUDE_CODE_SEMANTIC_CASE,',
    `    ${JSON.stringify('1.0.0-to-1.0.1')},`,
    '  )',
    '  assert.equal(',
    '    process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT,',
    '    expectedTargetSourceRoot,',
    '  )',
    '  assert.equal(',
    '    process.env.CLAUDE_CODE_1_0_1_SOURCE_ROOT,',
    '    expectedTargetSourceRoot,',
    '  )',
    '  assert.equal(',
    '    process.env.CLAUDE_CODE_DIRECT_EVIDENCE_SOURCE_ROOT,',
    '    expectedTargetSourceRoot,',
    '  )',
    '  assert.equal(',
    "    readArtifact(process.env.CLAUDE_CODE_1_0_0_SOURCE_ROOT + '/example.ts'),",
    `    ${JSON.stringify('export const value = "before"\n')},`,
    '  )',
    '  assert.equal(process.env.CLAUDE_CODE_DISABLE_AGENTS_FLEET, undefined)',
    '  assert.equal(process.env.NODE_OPTIONS, undefined)',
    '  assert.equal(process.env.NODE_PATH, undefined)',
    '  assert.equal(process.env.BUN_OPTIONS, undefined)',
    '  if (baselineRepositoryRoot === undefined) {',
    '    assert.equal(targetRepositoryRoot, undefined)',
    '  } else {',
    '    assert.equal(',
    '      process.env.CLAUDE_CODE_1_0_0_SOURCE_ROOT,',
    "      path.join(baselineRepositoryRoot, 'src'),",
    '    )',
    '    assert.equal(',
    "      git(baselineRepositoryRoot, 'HEAD^{commit}'),",
    `      ${JSON.stringify(gitBase.baseCommit)},`,
    '    )',
    '    assert.equal(',
    "      git(baselineRepositoryRoot, 'HEAD^{tree}'),",
    `      ${JSON.stringify(gitBase.baseGitTree)},`,
    '    )',
    '    assert.equal(',
    "      git(baselineRepositoryRoot, 'HEAD:src'),",
    `      ${JSON.stringify(gitBase.baseSourceGitTree)},`,
    '    )',
    '    assert.equal(',
    "      git(targetRepositoryRoot, 'HEAD^{commit}'),",
    `      ${JSON.stringify(testGitTarget.targetCommit)},`,
    '    )',
    '    assert.equal(',
    "      git(targetRepositoryRoot, 'HEAD^{tree}'),",
    `      ${JSON.stringify(testGitTarget.targetGitTree)},`,
    '    )',
    '    assert.equal(',
    "      git(targetRepositoryRoot, 'HEAD:src'),",
    `      ${JSON.stringify(testGitTarget.targetSrcGitTree)},`,
    '    )',
    '  }',
    '  assert.equal(',
    '    readArtifact(process.env.LINEAGE_TEST_ARTIFACT),',
    `    ${JSON.stringify(artifact)},`,
    '  )',
    '  const fileDerivedRepositoryRoot = path.resolve(',
    "    path.dirname(fileURLToPath(import.meta.url)), '..',",
    '  )',
    '  const legacyArtifact = path.join(',
    '    fileDerivedRepositoryRoot,',
    "    '.recovery-tmp/authenticated-artifacts/1.0.1/cli.inner.js',",
    '  )',
    '  if (fs.existsSync(legacyArtifact)) {',
    `    assert.equal(fs.readFileSync(legacyArtifact, 'utf8'), ${JSON.stringify(artifact)})`,
    '    assert.equal(',
    '      fs.readFileSync(',
    "        path.join(fileDerivedRepositoryRoot, '.recovery-tmp/expanded/sandbox-input.txt'),",
    "        'utf8',",
    '      ),',
    `      ${JSON.stringify(expandedSandboxValue)},`,
    '    )',
    '    assert.equal(',
    `      fs.readFileSync(path.join(fileDerivedRepositoryRoot, ${JSON.stringify(toolchainRelative)}), 'utf8'),`,
    `      ${JSON.stringify(toolchainValue)},`,
    '    )',
    '    assert.equal(',
    `      fs.statSync(path.join(fileDerivedRepositoryRoot, ${JSON.stringify(executableToolchainRelative)})).mode & 0o777,`,
    '      0o755,',
    '    )',
    '    assert.equal(',
    `      execFileSync(path.join(fileDerivedRepositoryRoot, ${JSON.stringify(executableToolchainRelative)}), { encoding: 'utf8' }),`,
    "      'fixture-bun\\n',",
    '    )',
    '    assert.equal(',
    "      execFileSync('bun', { encoding: 'utf8' }),",
    "      'fixture-bun\\n',",
    '    )',
    '    assert.equal(',
    "      fs.readFileSync(path.join(fileDerivedRepositoryRoot, 'src/example.ts'), 'utf8'),",
    `      ${JSON.stringify('export const value = "after"\n')},`,
    '    )',
    '    assert.equal(',
    "      fs.lstatSync(path.join(fileDerivedRepositoryRoot, '.recovery-tmp')).isSymbolicLink(),",
    '      false,',
    '    )',
    '  }',
    '})',
    '',
    "test.skip('preserves an intentional semantic skip', () => {})",
    '',
  ].join('\n')
  write(
    path.join(repository, testRelative),
    semanticTest,
  )
  const sourceFreezeIdentityRelative =
    'recovered/source-freeze/identity.json'
  const sourceFreezeIdentity = `${JSON.stringify(
    {
      schemaVersion: 1,
      verification: {
        targetTests: {
          tests: 2,
          passed: 1,
          failed: 0,
          skipped: 1,
          files: 1,
        },
      },
    },
    null,
    2,
  )}\n`
  write(
    path.join(caseRoot, sourceFreezeIdentityRelative),
    sourceFreezeIdentity,
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
      ...(withSandbox
        ? [
            {
              path: compressedSandboxRelative,
              bytes: compressedSandboxValue.length,
              sha256: sha256(compressedSandboxValue),
            },
          ]
        : []),
    ],
    sourceFreeze: {
      identity: sourceFreezeIdentityRelative,
      identitySha256: sha256(sourceFreezeIdentity),
    },
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
      ...(withSandbox
        ? {
            testSandbox: {
              schemaVersion: 1,
              legacyArtifacts: [
                {
                  destination:
                    '.recovery-tmp/authenticated-artifacts/1.0.1/cli.inner.js',
                  artifact: 'targetBundle',
                },
              ],
              expandedFiles: [
                {
                  source: compressedSandboxRelative,
                  bytes: compressedSandboxValue.length,
                  sha256: sha256(compressedSandboxValue),
                  compression: 'gzip',
                  destination: '.recovery-tmp/expanded/sandbox-input.txt',
                  expandedBytes: Buffer.byteLength(expandedSandboxValue),
                  expandedSha256: sha256(expandedSandboxValue),
                },
              ],
              sourceTrees: [
                {
                  destination: '.recovery-tmp/semantic-trees/1.0.0/src',
                  repositoryEnvironment:
                    'CLAUDE_CODE_1_0_0_REPOSITORY_ROOT',
                },
                {
                  destination: '.recovery-tmp/semantic-trees/1.0.1/src',
                  repositoryEnvironment:
                    'CLAUDE_CODE_1_0_1_REPOSITORY_ROOT',
                },
                {
                  destination: 'src',
                  repositoryEnvironment:
                    'CLAUDE_CODE_1_0_1_REPOSITORY_ROOT',
                },
              ],
              toolchainFiles: [
                {
                  source: executableToolchainRelative,
                  destination: executableToolchainRelative,
                  bytes: Buffer.byteLength(executableToolchainValue),
                  sha256: sha256(executableToolchainValue),
                  mode: 0o755,
                },
                {
                  source: toolchainRelative,
                  destination: toolchainRelative,
                  bytes: Buffer.byteLength(toolchainValue),
                  sha256: sha256(toolchainValue),
                  mode: 0o644,
                },
              ],
            },
          }
        : {}),
    },
  }
  write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  return {
    artifacts,
    base,
    gitBase,
    gitTarget,
    manifest,
    manifestPath,
    repository,
    root,
    sourceFreezeIdentityRelative,
    target,
    testGitTarget,
  }
}

function invoke(fixture, environment = {}) {
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
      env: {
        ...process.env,
        CLAUDE_CODE_SEMANTIC_CASE: 'untrusted-inherited-case',
        CLAUDE_CODE_SEMANTIC_SOURCE_ROOT: path.join(
          fixture.root,
          'untrusted-inherited-source',
        ),
        CLAUDE_CODE_1_0_1_SOURCE_ROOT: path.join(
          fixture.root,
          'untrusted-version-source',
        ),
        CLAUDE_CODE_1_0_0_SOURCE_ROOT: path.join(
          fixture.root,
          'untrusted-baseline-source',
        ),
        CLAUDE_CODE_1_0_1_REPOSITORY_ROOT: path.join(
          fixture.root,
          'untrusted-target-repository',
        ),
        CLAUDE_CODE_1_0_0_REPOSITORY_ROOT: path.join(
          fixture.root,
          'untrusted-baseline-repository',
        ),
        CLAUDE_CODE_DIRECT_EVIDENCE_SOURCE_ROOT: path.join(
          fixture.root,
          'untrusted-direct-evidence-source',
        ),
        CLAUDE_CODE_DISABLE_AGENTS_FLEET: '1',
        BUN_OPTIONS: '--smol',
        NODE_OPTIONS: '--no-warnings',
        NODE_PATH: path.join(fixture.root, 'untrusted-node-path'),
        ...environment,
      },
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

function relocateFixtureCase(fixture, caseName) {
  const currentRoot = path.dirname(fixture.manifestPath)
  const nextRoot = path.join(path.dirname(currentRoot), caseName)
  fs.renameSync(currentRoot, nextRoot)
  fixture.manifestPath = path.join(nextRoot, 'manifest.json')
}

function configuredGitLineage(fixture) {
  return {
    baseCommit: fixture.gitBase.baseCommit,
    baseGitTree: fixture.gitBase.baseGitTree,
    baseSrcGitTree: fixture.gitBase.baseSourceGitTree,
    ...fixture.gitTarget,
    testGitRepositories: {
      CLAUDE_CODE_1_0_0_REPOSITORY_ROOT: {
        commit: fixture.gitBase.baseCommit,
        gitTree: fixture.gitBase.baseGitTree,
        srcGitTree: fixture.gitBase.baseSourceGitTree,
      },
      CLAUDE_CODE_1_0_1_REPOSITORY_ROOT: {
        commit: fixture.testGitTarget.targetCommit,
        gitTree: fixture.testGitTarget.targetGitTree,
        srcGitTree: fixture.testGitTarget.targetSrcGitTree,
      },
    },
  }
}

function copyPinnedSyntaxToolchain(repository) {
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(
        REPOSITORY_ROOT,
        'recovery/cases/2.1.120-to-2.1.121/manifest.json',
      ),
      'utf8',
    ),
  )
  const descriptors = manifest.sourceLineage.testSandbox.toolchainFiles
  for (const descriptor of descriptors) {
    const source = path.join(REPOSITORY_ROOT, ...descriptor.source.split('/'))
    const destination = path.join(repository, ...descriptor.source.split('/'))
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
    fs.chmodSync(destination, descriptor.mode)
  }
  return descriptors
}

function copyPinnedRecoveryDependencies(repository) {
  fs.cpSync(
    path.join(REPOSITORY_ROOT, 'recovery/node_modules'),
    path.join(repository, 'recovery/node_modules'),
    {
      recursive: true,
      dereference: false,
      verbatimSymlinks: true,
    },
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
    assert.deepEqual(report.tests.tapSummary, {
      tests: 2,
      passed: 1,
      failed: 0,
      skipped: 1,
    })
    const {
      CLAUDE_CODE_1_0_0_SOURCE_ROOT: verifiedBaselineSourceRoot,
      ...semanticEnvironment
    } = report.tests.semanticEnvironment
    assert.deepEqual(semanticEnvironment, {
      CLAUDE_CODE_SEMANTIC_CASE: '1.0.0-to-1.0.1',
      CLAUDE_CODE_SEMANTIC_SOURCE_ROOT: path.join(
        fixture.repository,
        'src',
      ),
      CLAUDE_CODE_DIRECT_EVIDENCE_SOURCE_ROOT: path.join(
        fixture.repository,
        'src',
      ),
      CLAUDE_CODE_1_0_1_SOURCE_ROOT: path.join(
        fixture.repository,
        'src',
      ),
    })
    assert.match(
      verifiedBaselineSourceRoot,
      /claude-source-lineage-.*verified-base-src$/,
    )
    assert.deepEqual(report.tests.frozenTargetTests, {
      path: fixture.sourceFreezeIdentityRelative,
      sha256: fixture.manifest.sourceFreeze.identitySha256,
      tests: 2,
      passed: 1,
      failed: 0,
      skipped: 1,
      files: 1,
      matched: true,
    })
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

test('injects isolated authenticated Git repositories for semantic tests', () => {
  const fixture = createFixture()
  try {
    rewriteManifest(fixture, manifest => {
      Object.assign(manifest.sourceLineage, configuredGitLineage(fixture))
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
    assert.deepEqual(report.gitTarget, {
      commit: fixture.gitTarget.targetCommit,
      tree: fixture.gitTarget.targetGitTree,
      sourceTree: fixture.gitTarget.targetSrcGitTree,
      sourceComparison: 'exact',
    })
    assert.equal(report.testGitRepositories.explicit, true)
    const environments = report.testGitRepositories.environments
    for (const [name, expected] of [
      [
        'CLAUDE_CODE_1_0_0_REPOSITORY_ROOT',
        {
          commit: fixture.gitBase.baseCommit,
          gitTree: fixture.gitBase.baseGitTree,
          srcGitTree: fixture.gitBase.baseSourceGitTree,
        },
      ],
      [
        'CLAUDE_CODE_1_0_1_REPOSITORY_ROOT',
        {
          commit: fixture.testGitTarget.targetCommit,
          gitTree: fixture.testGitTarget.targetGitTree,
          srcGitTree: fixture.testGitTarget.targetSrcGitTree,
        },
      ],
    ]) {
      const { objects, ...environment } = environments[name]
      assert.ok(Number.isSafeInteger(objects) && objects > 0)
      assert.deepEqual(environment, {
        environment: name,
        ...expected,
        ref: 'refs/heads/authenticated',
        refs: 1,
        sourceComparison: 'exact',
        detachedCommits: [],
        objectClosure: 'exact-primary-and-detached-reachability',
      })
    }
    const semantic = report.tests.semanticEnvironment
    for (const version of ['1_0_0', '1_0_1']) {
      const repositoryRoot =
        semantic[`CLAUDE_CODE_${version}_REPOSITORY_ROOT`]
      assert.match(
        repositoryRoot,
        new RegExp(`claude-source-lineage-.*verified-(?:base|target)-repository$`),
      )
      assert.equal(
        semantic[`CLAUDE_CODE_${version}_SOURCE_ROOT`],
        path.join(repositoryRoot, 'src'),
      )
    }
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('runs semantic tests in an authenticated materialized sandbox', () => {
  const fixture = createFixture({ withSandbox: true })
  try {
    rewriteManifest(fixture, manifest => {
      Object.assign(manifest.sourceLineage, configuredGitLineage(fixture))
    })
    const ambientBin = path.join(fixture.root, 'ambient-bin')
    const ambientBunMarker = path.join(fixture.root, 'ambient-bun-ran')
    const ambientBun = path.join(ambientBin, 'bun')
    write(
      ambientBun,
      [
        '#!/bin/sh',
        'printf ambient > "$AMBIENT_BUN_MARKER"',
        'exit 97',
        '',
      ].join('\n'),
    )
    fs.chmodSync(ambientBun, 0o755)
    const priorUmask = process.umask(0o077)
    let result
    try {
      result = invoke(fixture, {
        AMBIENT_BUN_MARKER: ambientBunMarker,
        PATH: `${ambientBin}${path.delimiter}${process.env.PATH}`,
      })
    } finally {
      process.umask(priorUmask)
    }
    assert.equal(result.status, 0, result.stderr)
    assert.equal(fs.existsSync(ambientBunMarker), false)
    const report = JSON.parse(result.stdout)
    const sandbox = report.tests.sandbox
    assert.equal(sandbox.schemaVersion, 1)
    assert.equal(sandbox.symlinks, 0)
    assert.ok(sandbox.files >= 10)
    assert.ok(sandbox.bytes > 0)
    assert.deepEqual(sandbox.legacyArtifacts, [
      {
        destination:
          '.recovery-tmp/authenticated-artifacts/1.0.1/cli.inner.js',
        artifact: 'targetBundle',
        bytes: Buffer.byteLength('verified target artifact\n'),
        sha256: sha256('verified target artifact\n'),
      },
    ])
    assert.equal(sandbox.expandedFiles[0].verified, true)
    assert.equal(sandbox.toolchainFiles[0].verified, true)
    assert.deepEqual(
      sandbox.sourceTrees.map(item => item.destination),
      [
        '.recovery-tmp/semantic-trees/1.0.0/src',
        '.recovery-tmp/semantic-trees/1.0.1/src',
        'src',
      ],
    )

    rewriteManifest(fixture, manifest => {
      manifest.sourceLineage.testSandbox.expandedFiles[0].expandedSha256 =
        '0'.repeat(64)
    })
    result = invoke(fixture)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /expanded SHA-256/)
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('uses a pinned hermetic syntax toolchain for sealed post-121 cases', () => {
  const fixture = createFixture()
  try {
    const toolchain = copyPinnedSyntaxToolchain(fixture.repository)
    copyPinnedRecoveryDependencies(fixture.repository)
    relocateFixtureCase(fixture, '2.1.122-to-2.1.123')
    rewriteManifest(fixture, manifest => {
      manifest.case = '2.1.122-to-2.1.123'
      Object.assign(manifest.sourceLineage, {
        baseCommit: fixture.gitBase.baseCommit,
        baseGitTree: fixture.gitBase.baseGitTree,
        baseSrcGitTree: fixture.gitBase.baseSourceGitTree,
        ...fixture.gitTarget,
      })
      delete manifest.sourceFreeze
      delete manifest.sourceLineage.testArtifactEnvironment
      delete manifest.sourceLineage.testFileAssertions
      manifest.sourceLineage.testFiles = []
    })
    const ambientBin = path.join(fixture.root, 'ambient-bin')
    const ambientBunMarker = path.join(fixture.root, 'ambient-bun-ran')
    const ambientBun = path.join(ambientBin, 'bun')
    write(
      ambientBun,
      [
        '#!/bin/sh',
        'printf ambient > "$AMBIENT_BUN_MARKER"',
        'exit 97',
        '',
      ].join('\n'),
    )
    fs.chmodSync(ambientBun, 0o755)
    let result = invoke(fixture, {
      AMBIENT_BUN_MARKER: ambientBunMarker,
      BUN_OPTIONS: '--help',
      DYLD_INSERT_LIBRARIES: '/nonexistent/injected.dylib',
      LD_LIBRARY_PATH: '/nonexistent',
      LD_PRELOAD: '/nonexistent/injected.so',
      PATH: `${ambientBin}${path.delimiter}${process.env.PATH}`,
    })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(fs.existsSync(ambientBunMarker), false)
    const report = JSON.parse(result.stdout)
    assert.equal(
      report.syntaxToolchain.kind,
      'authenticated-pinned-toolchain',
    )
    assert.equal(report.syntaxToolchain.environment, 'minimal-hermetic')
    assert.equal(report.syntaxToolchain.files.length, toolchain.length)
    assert.equal(report.syntaxChecks.length, 2)

    rewriteManifest(fixture, manifest => {
      manifest.case = '2.1.123-to-2.1.124'
    })
    result = invoke(fixture)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /does not match case directory/)
    rewriteManifest(fixture, manifest => {
      manifest.case = '2.1.122-to-2.1.123'
    })

    rewriteManifest(fixture, manifest => {
      manifest.sourceLineage.syntaxCheck = []
    })
    result = invoke(fixture)
    assert.notEqual(result.status, 0)
    assert.match(
      result.stderr,
      /syntax scope versus changed non-deleted source paths/,
    )
    rewriteManifest(fixture, manifest => {
      manifest.sourceLineage.syntaxCheck = ['src/example.ts', 'src/new.ts']
      manifest.sourceLineage.testSandbox = {}
    })
    result = invoke(fixture)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /must use the verifier-pinned syntax toolchain/)
    rewriteManifest(fixture, manifest => {
      delete manifest.sourceLineage.testSandbox
    })

    const bun = path.join(
      fixture.repository,
      '.pixi/envs/default/bin/bun',
    )
    fs.writeFileSync(bun, 'tampered syntax runtime\n')
    fs.chmodSync(bun, 0o755)
    result = invoke(fixture)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /pinned syntax toolchain file 1 byte length/)
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('authenticates Acorn before evaluating parser bytes', () => {
  const fixture = createFixture()
  try {
    const verifierRoot = path.join(fixture.root, 'tampered-verifier')
    const verifierScript = path.join(
      verifierRoot,
      'recovery/scripts/verify-source-lineage.mjs',
    )
    const parserPath = path.join(
      verifierRoot,
      'recovery/node_modules/acorn/dist/acorn.mjs',
    )
    const marker = path.join(fixture.root, 'tampered-parser-executed')
    write(verifierScript, fs.readFileSync(SCRIPT))
    const attack = Buffer.from(
      [
        "import fs from 'node:fs'",
        `fs.writeFileSync(${JSON.stringify(marker)}, 'executed')`,
        'export function parse() { return {} }',
        '',
      ].join('\n'),
    )
    const padded = Buffer.alloc(229792, 0x20)
    attack.copy(padded)
    write(parserPath, padded)
    fs.chmodSync(parserPath, 0o644)
    const result = spawnSync(
      process.execPath,
      [
        verifierScript,
        '--case',
        fixture.manifestPath,
        '--repo',
        fixture.repository,
        '--artifacts',
        fixture.artifacts,
      ],
      { encoding: 'utf8' },
    )
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /pinned Acorn parser SHA-256/)
    assert.equal(fs.existsSync(marker), false)
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('executes sealed post-121 tests and artifacts from private authenticated carriers', () => {
  const fixture = createFixture()
  try {
    const testRelative = 'recovery/test/private-carrier.test.mjs'
    const source = [
      "import assert from 'node:assert/strict'",
      "import fs from 'node:fs'",
      "import path from 'node:path'",
      "import test from 'node:test'",
      "import { fileURLToPath } from 'node:url'",
      '',
      `const originalRepository = ${JSON.stringify(fixture.repository)}`,
      `const originalArtifacts = ${JSON.stringify(fixture.artifacts)}`,
      'const currentFile = fileURLToPath(import.meta.url)',
      '',
      "test('uses private authenticated inputs', () => {",
      '  assert.equal(',
      '    currentFile.startsWith(`${originalRepository}${path.sep}`),',
      '    false,',
      '  )',
      '  assert.equal(',
      '    process.env.LINEAGE_TEST_ARTIFACT.startsWith(',
      '      `${originalArtifacts}${path.sep}`,',
      '    ),',
      '    false,',
      '  )',
      '  assert.equal(',
      "    fs.readFileSync(process.env.LINEAGE_TEST_ARTIFACT, 'utf8'),",
      "    'verified target artifact\\n',",
      '  )',
      '})',
      '',
    ].join('\n')
    write(path.join(fixture.repository, testRelative), source)
    git(fixture.repository, 'add', testRelative)
    git(fixture.repository, 'commit', '-qm', 'fixture authenticated test carrier')
    const targetCommit = git(fixture.repository, 'rev-parse', 'HEAD')
    const targetGitTree = git(fixture.repository, 'rev-parse', 'HEAD^{tree}')
    const targetSrcGitTree = git(fixture.repository, 'rev-parse', 'HEAD:src')
    copyPinnedSyntaxToolchain(fixture.repository)
    copyPinnedRecoveryDependencies(fixture.repository)
    relocateFixtureCase(fixture, '2.1.122-to-2.1.123')

    const identityPath = path.join(
      path.dirname(fixture.manifestPath),
      fixture.sourceFreezeIdentityRelative,
    )
    const identity = JSON.parse(fs.readFileSync(identityPath, 'utf8'))
    identity.verification.targetTests = {
      tests: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
      files: 1,
    }
    const identityValue = `${JSON.stringify(identity, null, 2)}\n`
    fs.writeFileSync(identityPath, identityValue)

    rewriteManifest(fixture, manifest => {
      manifest.case = '2.1.122-to-2.1.123'
      manifest.sourceFreeze.identitySha256 = sha256(identityValue)
      Object.assign(manifest.sourceLineage, {
        baseCommit: fixture.gitBase.baseCommit,
        baseGitTree: fixture.gitBase.baseGitTree,
        baseSrcGitTree: fixture.gitBase.baseSourceGitTree,
        targetCommit,
        targetGitTree,
        targetSrcGitTree,
        testFiles: [testRelative],
        testFileAssertions: [
          {
            path: testRelative,
            bytes: Buffer.byteLength(source),
            sha256: sha256(source),
          },
        ],
      })
    })
    let result = invoke(fixture)
    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(result.stdout)
    assert.equal(report.tests.status, 'passed')
    assert.equal(report.tests.sandbox.kind, 'authenticated-git-test-carrier')
    assert.equal(report.tests.sandbox.files.length, 1)
    assert.equal(report.tests.sandbox.dependencies.files, 46)
    assert.equal(report.tests.sandbox.dependencies.verified, true)
    assert.equal(report.tests.sandbox.authenticatedArtifacts.length, 1)
    assert.equal(
      report.tests.artifactEnvironment.LINEAGE_TEST_ARTIFACT.path,
      '1.0.1/cli.js',
    )

    const dependency = path.join(
      fixture.repository,
      'recovery/node_modules/acorn/dist/acorn.mjs',
    )
    const dependencyValue = fs.readFileSync(dependency)
    fs.writeFileSync(dependency, 'tampered recovery dependency\n')
    result = invoke(fixture)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /pinned recovery dependency (?:bytes|manifest SHA-256)/)
    fs.writeFileSync(dependency, dependencyValue)
    fs.chmodSync(dependency, 0o755)
    result = invoke(fixture)
    assert.notEqual(result.status, 0)
    assert.match(
      result.stderr,
      /pinned recovery dependency manifest SHA-256/,
    )
    fs.chmodSync(dependency, 0o644)
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('allows an authenticated test target with a distinct whole-tree commit', () => {
  const fixture = createFixture({ asymmetricTestTarget: true })
  try {
    rewriteManifest(fixture, manifest => {
      Object.assign(manifest.sourceLineage, configuredGitLineage(fixture))
    })
    let result = invoke(fixture)
    assert.equal(result.status, 0, result.stderr)
    let report = JSON.parse(result.stdout)
    assert.equal(report.gitTarget.commit, fixture.gitTarget.targetCommit)
    assert.equal(report.gitTarget.tree, fixture.gitTarget.targetGitTree)
    assert.notEqual(
      fixture.testGitTarget.targetCommit,
      fixture.gitTarget.targetCommit,
    )
    assert.equal(
      report.testGitRepositories.environments[
        'CLAUDE_CODE_1_0_1_REPOSITORY_ROOT'
      ].commit,
      fixture.testGitTarget.targetCommit,
    )
    assert.equal(
      fixture.testGitTarget.targetSrcGitTree,
      fixture.gitTarget.targetSrcGitTree,
    )

    rewriteManifest(fixture, manifest => {
      manifest.sourceLineage.testGitRepositories[
        'CLAUDE_CODE_1_0_1_REPOSITORY_ROOT'
      ].gitTree = fixture.gitTarget.targetGitTree
    })
    result = invoke(fixture)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /verified target repository tree/)
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('rejects conflicting finalized and legacy base source-tree aliases', () => {
  const fixture = createFixture()
  try {
    rewriteManifest(fixture, manifest => {
      Object.assign(manifest.sourceLineage, fixture.gitBase, {
        baseSrcGitTree: '0'.repeat(40),
      })
    })
    const result = invoke(fixture)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /conflicting baseSrcGitTree and baseSourceGitTree/)
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('rejects an incomplete target Git identity', () => {
  const fixture = createFixture()
  try {
    rewriteManifest(fixture, manifest => {
      manifest.sourceLineage.targetCommit = fixture.gitTarget.targetCommit
    })
    const result = invoke(fixture)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /git target must provide/)
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('rejects a test Git baseline that drifts from the lineage base', () => {
  const fixture = createFixture()
  try {
    rewriteManifest(fixture, manifest => {
      Object.assign(manifest.sourceLineage, configuredGitLineage(fixture))
      manifest.sourceLineage.testGitRepositories[
        'CLAUDE_CODE_1_0_0_REPOSITORY_ROOT'
      ].commit = fixture.gitTarget.targetCommit
    })
    const result = invoke(fixture)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /commit versus lineage base commit/)
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('rejects artifact mappings for trusted repository-root environments', () => {
  const fixture = createFixture()
  try {
    rewriteManifest(fixture, manifest => {
      manifest.sourceLineage.testArtifactEnvironment[
        'CLAUDE_CODE_1_0_1_REPOSITORY_ROOT'
      ] = 'targetBundle'
    })
    const result = invoke(fixture)
    assert.notEqual(result.status, 0)
    assert.match(
      result.stderr,
      /Unsafe test environment variable: CLAUDE_CODE_1_0_1_REPOSITORY_ROOT/,
    )
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
    assert.match(result.stderr, /sourceLineage\.baseSrcGitTree/)
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

test('scopes expanded runtime closure to materialized sandboxes', () => {
  for (const withSandbox of [false, true]) {
    const fixture = createFixture({ withSandbox })
    try {
      const runtimeRelative = 'recovery/legacy-runtime-input.json'
      write(path.join(fixture.repository, runtimeRelative), '{}\n')
      const testRelative = 'lineage-fixtures/semantic.test.mjs'
      const testFilename = path.join(fixture.repository, testRelative)
      const semanticTest =
        fs.readFileSync(testFilename, 'utf8') +
        "const sandboxRuntimeInput = 'recovery/legacy-runtime-input.json'\n"
      write(testFilename, semanticTest)
      rewriteManifest(fixture, manifest => {
        const assertion = manifest.sourceLineage.testFileAssertions.find(
          item => item.path === testRelative,
        )
        assertion.bytes = Buffer.byteLength(semanticTest)
        assertion.sha256 = sha256(semanticTest)
        if (withSandbox) {
          Object.assign(
            manifest.sourceLineage,
            configuredGitLineage(fixture),
          )
        }
      })

      const result = invoke(fixture)
      if (withSandbox) {
        assert.notEqual(result.status, 0)
        assert.match(
          result.stderr,
          /Missing sourceLineage test file assertion for repository runtime recovery\/legacy-runtime-input\.json/,
        )
      } else {
        assert.equal(result.status, 0, result.stderr)
      }
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true })
    }
  }
})

test('binds versioned focused-helper runtime fixtures in sandboxes', () => {
  const fixture = createFixture({ withSandbox: true })
  try {
    const helperRelative =
      'recovery/test/recovery-late-focused-residue-proof-helpers.mjs'
    const buildMetadataRelative =
      'recovery/test/recovery-1.0.1-build-metadata-residue-proofs.json'
    const exactOwnerRelative =
      'recovery/test/recovery-1.0.1-exact-owner-correction-proofs.json'
    const helper = 'export const focusedHelperLoaded = true\n'
    const buildMetadata = '{}\n'
    const exactOwner = '{}\n'
    write(path.join(fixture.repository, helperRelative), helper)
    write(path.join(fixture.repository, buildMetadataRelative), buildMetadata)
    write(path.join(fixture.repository, exactOwnerRelative), exactOwner)

    const testRelative = 'lineage-fixtures/semantic.test.mjs'
    const testFilename = path.join(fixture.repository, testRelative)
    const semanticTest =
      "import '../recovery/test/recovery-late-focused-residue-proof-helpers.mjs'\n" +
      fs.readFileSync(testFilename, 'utf8')
    write(testFilename, semanticTest)
    rewriteManifest(fixture, manifest => {
      Object.assign(manifest.sourceLineage, configuredGitLineage(fixture))
      const assertion = manifest.sourceLineage.testFileAssertions.find(
        item => item.path === testRelative,
      )
      assertion.bytes = Buffer.byteLength(semanticTest)
      assertion.sha256 = sha256(semanticTest)
      manifest.sourceLineage.testFileAssertions.push(
        {
          path: helperRelative,
          bytes: Buffer.byteLength(helper),
          sha256: sha256(helper),
        },
        {
          path: buildMetadataRelative,
          bytes: Buffer.byteLength(buildMetadata),
          sha256: sha256(buildMetadata),
        },
      )
    })

    let result = invoke(fixture)
    assert.notEqual(result.status, 0)
    assert.match(
      result.stderr,
      /Missing sourceLineage test file assertion for dynamic runtime recovery\/test\/recovery-1\.0\.1-exact-owner-correction-proofs\.json/,
    )

    rewriteManifest(fixture, manifest => {
      manifest.sourceLineage.testFileAssertions.push({
        path: exactOwnerRelative,
        bytes: Buffer.byteLength(exactOwner),
        sha256: sha256(exactOwner),
      })
    })
    result = invoke(fixture)
    assert.equal(result.status, 0, result.stderr)
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('binds live fixture variants and omits historical-only descriptors', () => {
  const fixture = createFixture({ withSandbox: true })
  try {
    const companionRelative = 'lineage-fixtures/semantic.json'
    const patchRelative =
      'recovery/cases/1.0.0-to-1.0.1/recovered/source.patch'
    const historicalRelative =
      'recovery/cases/1.0.0-to-1.0.1/recovered/historical-only.txt'
    const patchValue = fs.readFileSync(
      path.join(fixture.repository, patchRelative),
    )
    const historicalValue = 'historical-only live path\n'
    write(path.join(fixture.repository, historicalRelative), historicalValue)
    const companion = `${JSON.stringify(
      {
        patchSnapshots: [
          {
            path: patchRelative,
            bytes: 1,
            sha256: '0'.repeat(64),
          },
          {
            path: patchRelative,
            bytes: patchValue.length,
            sha256: sha256(patchValue),
          },
        ],
        historicalOnly: {
          path: historicalRelative,
          bytes: 1,
          sha256: '1'.repeat(64),
        },
      },
      null,
      2,
    )}\n`
    write(path.join(fixture.repository, companionRelative), companion)
    rewriteManifest(fixture, manifest => {
      Object.assign(manifest.sourceLineage, configuredGitLineage(fixture))
      manifest.sourceLineage.testFileAssertions.push(
        {
          path: companionRelative,
          bytes: Buffer.byteLength(companion),
          sha256: sha256(companion),
        },
        {
          path: patchRelative,
          bytes: patchValue.length,
          sha256: sha256(patchValue),
        },
      )
    })

    const result = invoke(fixture)
    assert.equal(result.status, 0, result.stderr)
    const paths = JSON.parse(result.stdout).testFileAssertions.map(
      assertion => assertion.path,
    )
    assert.ok(paths.includes(patchRelative))
    assert.ok(paths.includes(companionRelative))
    assert.equal(paths.includes(historicalRelative), false)
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('rejects a live TAP summary that differs from the frozen result', () => {
  const fixture = createFixture()
  try {
    const identityPath = path.join(
      path.dirname(fixture.manifestPath),
      fixture.sourceFreezeIdentityRelative,
    )
    const identity = JSON.parse(fs.readFileSync(identityPath, 'utf8'))
    identity.verification.targetTests.passed = 0
    identity.verification.targetTests.skipped = 2
    const identityValue = `${JSON.stringify(identity, null, 2)}\n`
    write(identityPath, identityValue)
    rewriteManifest(fixture, manifest => {
      manifest.sourceFreeze.identitySha256 = sha256(identityValue)
    })

    const result = invoke(fixture)
    assert.notEqual(result.status, 0)
    assert.match(
      result.stderr,
      /Live source-lineage TAP summary differs from frozen targetTests: expected \{"tests":2,"passed":0,"failed":0,"skipped":2,"files":1\}, got \{"tests":2,"passed":1,"failed":0,"skipped":1,"files":1\}/,
    )
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('accepts a legacy frozen identity without skip accounting', () => {
  const fixture = createFixture()
  try {
    const identityPath = path.join(
      path.dirname(fixture.manifestPath),
      fixture.sourceFreezeIdentityRelative,
    )
    const identity = JSON.parse(fs.readFileSync(identityPath, 'utf8'))
    delete identity.verification.targetTests.skipped
    const identityValue = `${JSON.stringify(identity, null, 2)}\n`
    write(identityPath, identityValue)
    rewriteManifest(fixture, manifest => {
      manifest.sourceFreeze.identitySha256 = sha256(identityValue)
    })

    const result = invoke(fixture)
    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(result.stdout)
    assert.equal(report.tests.frozenTargetTests, null)
    assert.deepEqual(report.tests.tapSummary, {
      tests: 2,
      passed: 1,
      failed: 0,
      skipped: 1,
    })
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('canonicalizes query-qualified imports to one asserted file', () => {
  const fixture = createFixture()
  try {
    const supportRelative = 'lineage-fixtures/support.mjs'
    const support = "export const support = 'query-qualified support'\n"
    write(path.join(fixture.repository, supportRelative), support)

    const testRelative = 'lineage-fixtures/semantic.test.mjs'
    const semanticTest = [
      "import assert from 'node:assert/strict'",
      "import test from 'node:test'",
      "import { support as first } from './support.mjs?first'",
      "import { support as second } from './support.mjs?second'",
      '',
      "test('loads both query-qualified imports', () => {",
      "  assert.equal(first, 'query-qualified support')",
      '  assert.equal(second, first)',
      '})',
      '',
    ].join('\n')
    write(path.join(fixture.repository, testRelative), semanticTest)
    const identityPath = path.join(
      path.dirname(fixture.manifestPath),
      fixture.sourceFreezeIdentityRelative,
    )
    const identity = JSON.parse(fs.readFileSync(identityPath, 'utf8'))
    identity.verification.targetTests = {
      tests: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
      files: 1,
    }
    const identityValue = `${JSON.stringify(identity, null, 2)}\n`
    write(identityPath, identityValue)
    rewriteManifest(fixture, manifest => {
      manifest.sourceFreeze.identitySha256 = sha256(identityValue)
      manifest.sourceLineage.testFileAssertions = [
        {
          path: supportRelative,
          bytes: Buffer.byteLength(support),
          sha256: sha256(support),
        },
        {
          path: testRelative,
          bytes: Buffer.byteLength(semanticTest),
          sha256: sha256(semanticTest),
        },
      ]
    })

    const result = invoke(fixture)
    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(result.stdout)
    assert.deepEqual(
      report.testFileAssertions.map(assertion => assertion.path),
      [supportRelative, testRelative],
    )
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('rejects an authenticated but unreachable test file assertion', () => {
  const fixture = createFixture({ withSandbox: true })
  try {
    const unreachableRelative = 'lineage-fixtures/unreachable-support.mjs'
    const unreachable = 'export const unreachable = true\n'
    write(path.join(fixture.repository, unreachableRelative), unreachable)
    rewriteManifest(fixture, manifest => {
      Object.assign(manifest.sourceLineage, configuredGitLineage(fixture))
      manifest.sourceLineage.testFileAssertions.push({
        path: unreachableRelative,
        bytes: Buffer.byteLength(unreachable),
        sha256: sha256(unreachable),
      })
    })

    const result = invoke(fixture)
    assert.notEqual(result.status, 0)
    assert.match(
      result.stderr,
      /Unreachable sourceLineage test file assertions: lineage-fixtures\/unreachable-support\.mjs/,
    )
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('source-freeze publication rolls back an interrupted commit', async () => {
  const fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'source-freeze-publication-'),
  )
  try {
    const publisherSource = filename => {
      const source = fs.readFileSync(filename, 'utf8')
      const start = source.indexOf('function assertOutputRelative(relative)')
      const end = source.indexOf('\nfunction metadata(', start)
      assert.notEqual(start, -1)
      assert.notEqual(end, -1)
      return source.slice(start, end)
    }
    const t120Publisher = publisherSource(T120_FREEZE_BUILDER)
    const t121Publisher = publisherSource(T121_FREEZE_BUILDER)
    assert.equal(t120Publisher, t121Publisher)

    const moduleSource = `
      import crypto from 'node:crypto'
      import realFs from 'node:fs'
      import path from 'node:path'
      const fs = { ...realFs }
      let committedRenames = 0
      fs.renameSync = (source, destination) => {
        if (source.endsWith('.tmp')) {
          committedRenames += 1
          if (committedRenames === 3) {
            throw new Error('injected publication failure')
          }
        }
        return realFs.renameSync(source, destination)
      }
      const caseRoot = ${JSON.stringify(fixtureRoot)}
      const recoveredRelative = 'recovered'
      const freezeRelative = recoveredRelative + '/source-freeze'
      const overlayRelative = recoveredRelative + '/source-facing-overlay.patch'
      const lineageRelative = recoveredRelative + '/source-lineage-core.json'
      function assert(condition, message) {
        if (!condition) throw new Error(message)
      }
      function compareText(left, right) {
        if (left === right) return 0
        return left < right ? -1 : 1
      }
      ${t121Publisher}
      export { publishStagedOutputs }
    `
    const moduleUrl =
      'data:text/javascript;base64,' +
      Buffer.from(moduleSource).toString('base64')
    const { publishStagedOutputs } = await import(moduleUrl)

    const oldValue = Buffer.from('reviewed old generation\n')
    const outputs = new Map([
      ['recovered/source-freeze/leaf.txt', Buffer.from('new leaf\n')],
      ['recovered/source-facing-overlay.patch', Buffer.from('new overlay\n')],
      ['recovered/source-lineage-core.json', Buffer.from('new lineage\n')],
      ['recovered/source-freeze/identity.json', Buffer.from('new identity\n')],
      ['recovered/source-freeze/SHA256SUMS', Buffer.from('new sums\n')],
    ])
    for (const relative of outputs.keys()) {
      write(path.join(fixtureRoot, ...relative.split('/')), oldValue)
    }

    assert.throws(
      () => publishStagedOutputs(outputs),
      /injected publication failure/,
    )
    for (const relative of outputs.keys()) {
      assert.deepEqual(
        fs.readFileSync(path.join(fixtureRoot, ...relative.split('/'))),
        oldValue,
      )
    }
    assert.deepEqual(
      fs.readdirSync(path.join(fixtureRoot, 'recovered/source-freeze')).sort(),
      ['SHA256SUMS', 'identity.json', 'leaf.txt'],
    )
    assert.equal(
      fs.existsSync(path.join(fixtureRoot, '.source-freeze-publish.lock')),
      false,
    )
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
})
