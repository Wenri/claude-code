#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const BASELINE = '2.1.122'
const TARGET = '2.1.123'
const CASE = `${BASELINE}-to-${TARGET}`
const OFFICIAL_BULLET =
  'Fixed OAuth authentication failing with a 401 retry loop when ' +
  '`CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` is set'
const CHANGELOG_SECTION = `## ${TARGET}\n\n- ${OFFICIAL_BULLET}\n\n`

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url))
const compareTarballsScript = path.join(
  scriptsRoot,
  'compare-npm-tarballs.mjs',
)
const exactDeltaScript = path.join(scriptsRoot, 'build-exact-delta.mjs')
const inspectBunContainerScript = path.join(
  scriptsRoot,
  'inspect-bun-container.mjs',
)

const REGISTRY_KEY = {
  registryUrl: 'https://registry.npmjs.org/-/npm/v1/keys',
  keyid: 'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U',
  keytype: 'ecdsa-sha2-nistp256',
  scheme: 'ecdsa-sha2-nistp256',
  expires: null,
  publicKeyDerBase64:
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+' +
    'HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g==',
  publicKeySpkiSha256:
    'fb190a462123443500cbcdb6519623e7179e9f38d84ad4e9362b72d2b68b62c1',
}

const PACKAGE_RELEASES = {
  wrapper: {
    name: '@anthropic-ai/claude-code',
    reportPath: 'package-members.json',
    expectedSummary: {
      unionMemberCount: 7,
      baselineMemberCount: 7,
      targetMemberCount: 7,
      unchanged: 6,
      changed: 1,
      added: 0,
      removed: 0,
      complete: true,
    },
    expectedMemberStatuses: {
      'package/LICENSE.md': 'unchanged',
      'package/README.md': 'unchanged',
      'package/bin/claude.exe': 'unchanged',
      'package/cli-wrapper.cjs': 'unchanged',
      'package/install.cjs': 'unchanged',
      'package/package.json': 'changed',
      'package/sdk-tools.d.ts': 'unchanged',
    },
    baseline: {
      artifactPath: `${BASELINE}/package.tgz`,
      version: BASELINE,
      publishedAt: '2026-04-28T17:35:53.730Z',
      tarballUrl:
        'https://registry.npmjs.org/@anthropic-ai/claude-code/-/' +
        'claude-code-2.1.122.tgz',
      bytes: 13_541,
      sha1: 'c7817b9efda1a2a2fa8f6c2b1389a77e336ffc69',
      sha256:
        '08101efaa62e0d1c6de744bf57a1eba7359b34565667edf3bf1cd85b26cb32c7',
      integrity:
        'sha512-AQhsnIM1QioglrgK1im57U9Akc8n8ryH1lt/P+xafl1gjkLza2iSVFNik' +
        'JvZTP8h+9dFxTS4Re+Z7aP5sxcteA==',
      signature:
        'MEUCIQDHux7aKVWi+IKZzV5YxfqemOuRZXB77Gff7rDbLXT4GQIgbE59fYmX' +
        'c+LfOxLUT1GDNAuxL26bMLOZuUbVpEqKbOI=',
      fileCount: 7,
      unpackedSize: 132_031,
      uncompressedTarBytes: 138_240,
    },
    target: {
      artifactPath: `${TARGET}/package.tgz`,
      version: TARGET,
      publishedAt: '2026-04-29T01:52:47.690Z',
      tarballUrl:
        'https://registry.npmjs.org/@anthropic-ai/claude-code/-/' +
        'claude-code-2.1.123.tgz',
      bytes: 13_541,
      sha1: 'bb3eec9d140de6dbe2ac2f5d561c5ecce53b28f5',
      sha256:
        '97abf96840af5728b70b8eae58ab0904b364f273e604f28f171bee2263d36a2d',
      integrity:
        'sha512-31P5v1NOrJF8Cud5P5nuqYSP3XjJdR/PfCQgDM7fCIHbh+34Ds/DWaLjhdqc' +
        'yUnZ0PINnEpvk/+MM8DhbXOUlw==',
      signature:
        'MEQCIDNwWWVtIiJijoj4rNx2ElhlOOLLm0xMcr7WvE3YG4VMAiByadSQdcrCZ' +
        'qmRHLlQO20iDtoRDbm3qZXRIiPxZ4q8Sg==',
      fileCount: 7,
      unpackedSize: 132_031,
      uncompressedTarBytes: 138_240,
    },
  },
  linuxX64: {
    name: '@anthropic-ai/claude-code-linux-x64',
    reportPath: 'binary-extraction/native-package-members.json',
    os: ['linux'],
    cpu: ['x64'],
    expectedSummary: {
      unionMemberCount: 4,
      baselineMemberCount: 4,
      targetMemberCount: 4,
      unchanged: 2,
      changed: 2,
      added: 0,
      removed: 0,
      complete: true,
    },
    expectedMemberStatuses: {
      'package/LICENSE.md': 'unchanged',
      'package/README.md': 'unchanged',
      'package/claude': 'changed',
      'package/package.json': 'changed',
    },
    baseline: {
      artifactPath: `${BASELINE}-linux-x64/package.tgz`,
      version: BASELINE,
      publishedAt: '2026-04-28T17:34:57.239Z',
      tarballUrl:
        'https://registry.npmjs.org/@anthropic-ai/' +
        'claude-code-linux-x64/-/claude-code-linux-x64-2.1.122.tgz',
      bytes: 77_000_059,
      sha1: '59fceeed7ba494c7ecffaf5fc55e828860a59b9c',
      sha256:
        'de837184869ce3c0719972f0eb853e81c53df88a43a033b35246f47c2599dc21',
      integrity:
        'sha512-TckCblnmiLsSgzVkLhPnJrPpZwpbNMNZxW+eaTPJAqGNFmZMWTkiVZbbcKCAX' +
        '7J7k7128lLqYCUnX+sucYmnQQ==',
      signature:
        'MEQCIBCuTNpWoDj02QGkU5MDduv6O0St8Cd6RwsSsIbvVWQqAiB4lIE7cdhab' +
        '4NxUyFYkioi+nAnxjgXW/LGrgwsVUEHHw==',
      fileCount: 4,
      unpackedSize: 247_733_450,
      uncompressedTarBytes: 247_737_856,
    },
    target: {
      artifactPath: `${TARGET}-linux-x64/package.tgz`,
      version: TARGET,
      publishedAt: '2026-04-29T01:51:55.496Z',
      tarballUrl:
        'https://registry.npmjs.org/@anthropic-ai/' +
        'claude-code-linux-x64/-/claude-code-linux-x64-2.1.123.tgz',
      bytes: 76_994_598,
      sha1: 'df731a8d4e0fea7cf5d9112851fade44e37eddfa',
      sha256:
        '42030c97505ab818d31b10bf92a4587a670cd9f1290724a805e395f6d963692c',
      integrity:
        'sha512-cDi/khmvtvgtzypy1xvd9nIqWDRPaEwh3qJVewIhr847wSrCC/S9HBNsUcdaR' +
        '+myHiXH/ew6prpA4xR9qeEwhA==',
      signature:
        'MEYCIQCg0XQzcbhE875U3WqVLSLXyPkQ1xgUH8vm/lhJZXoYggIhAOeaGoXOs' +
        'fAXnmGGeTla1WD3a41kwtTe8xnKDdw2YGna',
      fileCount: 4,
      unpackedSize: 247_733_450,
      uncompressedTarBytes: 247_737_856,
    },
  },
}

const DELTAS = [
  {
    path: 'cli.js',
    baselinePath: `${BASELINE}-linux-x64/cli.js`,
    targetPath: `${TARGET}-linux-x64/cli.js`,
    baseline: {
      bytes: 13_949_634,
      sha256:
        '92303473496442aa210604027d9d509e0bc861c1c9ba472c539dfa56c27cc183',
    },
    target: {
      bytes: 13_949_666,
      sha256:
        '6992e5f0bf7410ce9dc5eee1a26b132f3257bbed0f3a7f9433ff01c656ac91fc',
    },
    payload: {
      path: 'diff/cli.js.zstd-delta',
      bytes: 899_024,
      sha256:
        '54320c4814c80318ef53cd3a662fd645365566bdf566fbf70576294916538a97',
    },
  },
  {
    path: 'image-processor.js',
    baselinePath: `${BASELINE}-linux-x64/image-processor.js`,
    targetPath: `${TARGET}-linux-x64/image-processor.js`,
    baseline: {
      bytes: 1_976,
      sha256:
        '26584cf602260fd9e9df3ea2c375c72c1dd0cfa5fb94de00f45f68879fbc868f',
    },
    target: {
      bytes: 1_976,
      sha256:
        '18b29219472b2363465733d26210e6d8f3300fa3efd34eeb097bb9578936f8d2',
    },
    payload: {
      path: 'diff/image-processor.js.zstd-delta',
      bytes: 26,
      sha256:
        '61d3e42e4da3764183e9d0831519152e4a5a7cc45001f1a00051f49c32d04ad4',
    },
  },
  {
    path: 'audio-capture.js',
    baselinePath: `${BASELINE}-linux-x64/audio-capture.js`,
    targetPath: `${TARGET}-linux-x64/audio-capture.js`,
    baseline: {
      bytes: 1_974,
      sha256:
        'ef30d180ad609c0fd7342ad3f4402525cfc92c5084896c4098eac926da89162e',
    },
    target: {
      bytes: 1_974,
      sha256:
        '7f5df148bebbae5d3df474e1eccce35fd47aa0ebfdcdf036cf22489b3d80d442',
    },
    payload: {
      path: 'diff/audio-capture.js.zstd-delta',
      bytes: 26,
      sha256:
        'acfde30bee2e30cf42a631ee77455ac6f7cc3d80ee70a0ac9fedbbc2c2603200',
    },
  },
  {
    path: 'package.json',
    baselinePath: `${BASELINE}/package/package.json`,
    targetPath: `${TARGET}/package/package.json`,
    baseline: {
      bytes: 1_476,
      sha256:
        '7c9d9463e7b1b24acd61ccb2c0e5694de00fb64a68135d63d9b8ab4f70e850ad',
    },
    target: {
      bytes: 1_476,
      sha256:
        '97431d0dcfd036c18bc7a660ad3e1dad704c89f21c3aaaa00c6d4c4af9dc1278',
    },
    payload: {
      path: 'diff/package.json.zstd-delta',
      bytes: 55,
      sha256:
        'dce1825f4923a37538e33be99096f68acecbb51a0d79e60877310f5f45b317be',
    },
  },
]

const INVENTORY = {
  executablePath: `${TARGET}-linux-x64/package/claude`,
  outputPath: 'binary-extraction/inventory.json',
  file: {
    bytes: 6_458,
    sha256:
      '02059bc99f70b4dbf0c0e17509e27eaebdf353447e9f1f26618172f200d856e7',
  },
  artifact: {
    package: '@anthropic-ai/claude-code-linux-x64',
    version: TARGET,
    path: 'package/claude',
    bytes: 247_732_864,
    sha256:
      '5a78139b679a86a88a0ac5476c706a64c3105bf6a6d435ba10f3aa3fb635bdb2',
  },
  bunSection: {
    fileOffset: 108_675_072,
    bytes: 139_054_050,
    endFileOffset: 247_729_122,
    sha256:
      'dfa9fa9b1ff7e1b9b5c4beb11406b7ddc7d325b7badebdbea63690fcbbaaf01e',
    footerSha256:
      '33c37e9b92bb647ab568dcb76e97bcedce6709289aec5ad0bafdbd336580307e',
    directorySha256:
      '8f1426f70c438b07db16ea7c0b4db6f3c27c8d785766c24e4163be12cfbae211',
    moduleCount: 5,
  },
  modules: {
    '/$bunfs/root/src/entrypoints/cli.js': {
      kind: 'js+jsc',
      bytes: 13_949_666,
      sha256:
        '6992e5f0bf7410ce9dc5eee1a26b132f3257bbed0f3a7f9433ff01c656ac91fc',
      jscBytes: 123_142_848,
      jscSha256:
        '282de14f4f8d117b821f8114c61ed40827cac9a8858b1a6c5eb5962b374250a2',
    },
    '/$bunfs/root/image-processor.js': {
      kind: 'js',
      bytes: 1_976,
      sha256:
        '18b29219472b2363465733d26210e6d8f3300fa3efd34eeb097bb9578936f8d2',
    },
    '/$bunfs/root/audio-capture.js': {
      kind: 'js',
      bytes: 1_974,
      sha256:
        '7f5df148bebbae5d3df474e1eccce35fd47aa0ebfdcdf036cf22489b3d80d442',
    },
    '/$bunfs/root/image-processor.node': {
      kind: 'elf',
      bytes: 1_464_760,
      sha256:
        '37bec7de530676e3dfe963d34a824b49191595809a8072348a2ef4571f1e5f4d',
    },
    '/$bunfs/root/audio-capture.node': {
      kind: 'elf',
      bytes: 492_184,
      sha256:
        '7e89edf4dde9b69b6c55a310788ad999e2d0dd469d8a31c529cf28f3ea5e929c',
    },
  },
  inner: {
    bytes: 13_949_576,
    sha256:
      '59c8eebc0660d4bbc5c1f82af0ca5e94df5db46084687b979ad21a07fba3d7dd',
    nodeCheck: true,
  },
}

const GIT = {
  repository: 'https://github.com/anthropics/claude-code.git',
  tag: 'v2.1.123',
  acceptedLocalTags: ['v2.1.123', 'upstream-v2.1.123'],
  commit: 'e512ec99188d191b07662fc9f69c5764f750a302',
  parent: 'a609cfbee3c5e0066a25f62f7b4109420c58b940',
  parentTag: 'v2.1.122',
  acceptedLocalParentTags: ['v2.1.122', 'upstream-v2.1.122'],
  tree: '500a2770ad88b7374e7f60aa69873b111c8c94d1',
  parentTree: 'ca627d3837fc2614acd2a336ba2c5766ae12bed9',
  commitTimestamp: '2026-04-29T03:29:06+00:00',
  subject: 'chore: Update CHANGELOG.md',
  changelogBlob: '6cf89e753f00f976e42355bc6a4e2bc3286a94f5',
  changelogBytes: 264_551,
  changelogSha256:
    '10565504230aa417ecd21163e559d8d17e45e4c016a950d16fdfba4a5be9d531',
  sectionBytes: 127,
  sectionSha256:
    '7268a65de1722072c17c0241e5b74e6f02ca1d3335a4d8a7bd9497daef17ab4c',
  publicDiff: {
    filesChanged: 1,
    insertions: 4,
    deletions: 0,
    paths: ['CHANGELOG.md'],
  },
}

const REGISTRY_VERSION_SEQUENCE = [
  '2.1.114',
  '2.1.116',
  '2.1.117',
  '2.1.118',
  '2.1.119',
  '2.1.120',
  '2.1.121',
  BASELINE,
  TARGET,
  '2.1.124',
]

function usage() {
  console.error(
    'Usage: build-2.1.123-acquisition-evidence.mjs ' +
      '--artifacts-root DIR --case-root DIR --official-repo DIR',
  )
}

function parseArguments(argv) {
  const allowed = new Set(['artifacts-root', 'case-root', 'official-repo'])
  const result = {}
  for (let index = 0; index < argv.length; index += 2) {
    const argument = argv[index]
    const value = argv[index + 1]
    if (!argument?.startsWith('--') || value === undefined) {
      usage()
      throw new Error('Every option must have a value')
    }
    const key = argument.slice(2)
    if (!allowed.has(key)) throw new Error(`Unknown option: ${argument}`)
    if (result[key] !== undefined) {
      throw new Error(`Duplicate option: ${argument}`)
    }
    result[key] = value
  }
  for (const key of allowed) {
    if (!result[key]) throw new Error(`Missing required option: --${key}`)
  }
  return result
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function assertRealDirectory(directory, label) {
  const status = fs.lstatSync(directory)
  assert.ok(status.isDirectory(), `${label} must be a directory`)
  assert.ok(!status.isSymbolicLink(), `${label} must not be a symlink`)
}

function assertRegularFile(filename, label) {
  const status = fs.lstatSync(filename)
  assert.ok(status.isFile(), `${label} must be a regular file`)
  assert.ok(!status.isSymbolicLink(), `${label} must not be a symlink`)
}

function fileEvidence(filename, expected, label) {
  assertRegularFile(filename, label)
  const value = fs.readFileSync(filename)
  const evidence = { bytes: value.length, sha256: sha256(value) }
  assert.deepEqual(evidence, expected, `${label} identity`)
  return evidence
}

function run(command, arguments_, label, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: options.cwd,
    encoding: Object.hasOwn(options, 'encoding') ? options.encoding : 'utf8',
    maxBuffer: options.maxBuffer ?? 16 * 1024 * 1024,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `${label} failed (${result.status}): ${String(result.stderr || result.stdout)}`,
    )
  }
  return result.stdout
}

function runJsonScript(script, arguments_, label) {
  const stdout = run(process.execPath, [script, ...arguments_], label)
  try {
    return JSON.parse(stdout)
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error.message}`)
  }
}

function git(repo, arguments_, label, options = {}) {
  return run('git', ['-C', repo, ...arguments_], label, options)
}

function oneLine(value, label) {
  const lines = value.trimEnd().split('\n')
  assert.equal(lines.length, 1, `${label} must have exactly one line`)
  return lines[0]
}

function tagsAt(repo, commit) {
  const output = git(repo, ['tag', '--points-at', commit], `tags at ${commit}`)
  return output.trim() === '' ? [] : output.trimEnd().split('\n')
}

function assertAcceptedTag(repo, commit, accepted, label) {
  const tags = tagsAt(repo, commit)
  const matched = accepted.find(tag => tags.includes(tag))
  assert.ok(
    matched,
    `${label}: expected one of ${accepted.join(', ')}, found ${tags.join(', ')}`,
  )
  assert.equal(
    oneLine(
      git(repo, ['cat-file', '-t', `refs/tags/${matched}`], `${label} type`),
      `${label} type`,
    ),
    'commit',
  )
  assert.equal(
    oneLine(
      git(repo, ['rev-parse', `refs/tags/${matched}`], `${label} commit`),
      `${label} commit`,
    ),
    commit,
  )
}

function extractChangelogSection(changelog) {
  const heading = `## ${TARGET}\n`
  const start = changelog.indexOf(heading)
  assert.notEqual(start, -1, 'official changelog target heading')
  assert.equal(
    start,
    changelog.lastIndexOf(heading),
    'official changelog target heading cardinality',
  )
  const next = changelog.indexOf('\n## ', start + heading.length)
  assert.notEqual(next, -1, 'official changelog following heading')
  return changelog.slice(start, next + 1)
}

function buildGitEvidence(officialRepo, staging) {
  assertAcceptedTag(
    officialRepo,
    GIT.commit,
    GIT.acceptedLocalTags,
    'target official tag',
  )
  assertAcceptedTag(
    officialRepo,
    GIT.parent,
    GIT.acceptedLocalParentTags,
    'baseline official tag',
  )
  assert.equal(
    oneLine(
      git(officialRepo, ['cat-file', '-t', GIT.commit], 'target object type'),
      'target object type',
    ),
    'commit',
  )
  assert.equal(
    oneLine(
      git(officialRepo, ['rev-parse', `${GIT.commit}^`], 'target parent'),
      'target parent',
    ),
    GIT.parent,
  )
  assert.equal(
    oneLine(
      git(officialRepo, ['rev-parse', `${GIT.commit}^{tree}`], 'target tree'),
      'target tree',
    ),
    GIT.tree,
  )
  assert.equal(
    oneLine(
      git(officialRepo, ['rev-parse', `${GIT.parent}^{tree}`], 'parent tree'),
      'parent tree',
    ),
    GIT.parentTree,
  )
  const metadata = git(
    officialRepo,
    ['show', '-s', '--format=%H%x00%P%x00%T%x00%cI%x00%s', GIT.commit],
    'target commit metadata',
  )
    .trimEnd()
    .split('\0')
  assert.deepEqual(metadata, [
    GIT.commit,
    GIT.parent,
    GIT.tree,
    GIT.commitTimestamp,
    GIT.subject,
  ])
  assert.equal(
    oneLine(
      git(
        officialRepo,
        ['rev-list', '--count', `${GIT.parent}..${GIT.commit}`],
        'commit adjacency count',
      ),
      'commit adjacency count',
    ),
    '1',
  )
  const paths = git(
    officialRepo,
    ['diff', '--name-only', GIT.parent, GIT.commit],
    'official tag path diff',
  )
    .trimEnd()
    .split('\n')
    .filter(Boolean)
  assert.deepEqual(paths, GIT.publicDiff.paths, 'official tag changed paths')
  const numstat = git(
    officialRepo,
    ['diff', '--numstat', GIT.parent, GIT.commit],
    'official tag numstat',
  )
    .trimEnd()
    .split('\n')
    .filter(Boolean)
  assert.deepEqual(numstat, ['4\t0\tCHANGELOG.md'], 'official tag numstat')

  const blob = oneLine(
    git(
      officialRepo,
      ['rev-parse', `${GIT.commit}:CHANGELOG.md`],
      'official changelog blob',
    ),
    'official changelog blob',
  )
  assert.equal(blob, GIT.changelogBlob)
  const changelogBytes = git(
    officialRepo,
    ['show', `${GIT.commit}:CHANGELOG.md`],
    'official changelog content',
    { encoding: null, maxBuffer: 2 * 1024 * 1024 },
  )
  assert.equal(changelogBytes.length, GIT.changelogBytes)
  assert.equal(sha256(changelogBytes), GIT.changelogSha256)
  const changelog = changelogBytes.toString('utf8')
  const section = extractChangelogSection(changelog)
  assert.equal(section, CHANGELOG_SECTION, 'exact official changelog section')
  assert.equal(Buffer.byteLength(section), GIT.sectionBytes)
  assert.equal(sha256(section), GIT.sectionSha256)
  assert.equal(
    section.split('\n').filter(line => line.startsWith('- ')).length,
    1,
    'official changelog bullet count',
  )

  const fullPath = `evidence/claude-code-CHANGELOG-${GIT.commit.slice(0, 8)}.md`
  const sectionPath = `evidence/CHANGELOG-${TARGET}.md`
  fs.mkdirSync(path.join(staging, 'evidence'), { recursive: true })
  fs.writeFileSync(path.join(staging, fullPath), changelogBytes, { flag: 'wx' })
  fs.writeFileSync(path.join(staging, sectionPath), section, { flag: 'wx' })

  return {
    git: {
      repository: GIT.repository,
      tag: GIT.tag,
      tagObjectType: 'commit',
      commit: GIT.commit,
      parent: GIT.parent,
      parentTag: GIT.parentTag,
      tree: GIT.tree,
      parentTree: GIT.parentTree,
      commitTimestamp: GIT.commitTimestamp,
      subject: GIT.subject,
      immediateParentTagged: true,
      previousReleaseTag: GIT.parentTag,
      previousReleaseCommit: GIT.parent,
      previousReleaseTree: GIT.parentTree,
      commitsSincePreviousReleaseTag: 1,
      commitChainFromPreviousRelease: [
        {
          commit: GIT.commit,
          parent: GIT.parent,
          tree: GIT.tree,
          commitTimestamp: GIT.commitTimestamp,
          subject: GIT.subject,
        },
      ],
      publicDiff: {
        basis: `${GIT.parentTag}..${GIT.tag}`,
        ...GIT.publicDiff,
      },
      tagCommitDiff: {
        basis: `${GIT.parentTag}..${GIT.tag}`,
        ...GIT.publicDiff,
      },
    },
    changelog: {
      fullPath,
      fullGitBlobSha1: GIT.changelogBlob,
      fullBytes: changelogBytes.length,
      fullSha256: sha256(changelogBytes),
      sectionPath,
      sectionBytes: Buffer.byteLength(section),
      sectionSha256: sha256(section),
      bulletCount: 1,
    },
    paths: [fullPath, sectionPath],
  }
}

function tarballArguments(release, artifactsRoot, output) {
  const baseline = release.baseline
  const target = release.target
  return [
    '--baseline',
    path.join(artifactsRoot, baseline.artifactPath),
    '--target',
    path.join(artifactsRoot, target.artifactPath),
    '--output',
    output,
    '--package-name',
    release.name,
    '--baseline-version',
    baseline.version,
    '--target-version',
    target.version,
    '--baseline-shasum',
    baseline.sha1,
    '--target-shasum',
    target.sha1,
    '--baseline-integrity',
    baseline.integrity,
    '--target-integrity',
    target.integrity,
    '--baseline-signature',
    baseline.signature,
    '--target-signature',
    target.signature,
    '--registry-key-id',
    REGISTRY_KEY.keyid,
    '--registry-public-key',
    REGISTRY_KEY.publicKeyDerBase64,
    '--baseline-registry-url',
    baseline.tarballUrl,
    '--target-registry-url',
    target.tarballUrl,
  ]
}

function assertTarballSide(actual, expected, label) {
  assert.equal(actual.version, expected.version, `${label} version`)
  assert.equal(
    actual.registryTarballUrl,
    expected.tarballUrl,
    `${label} registry URL`,
  )
  assert.equal(actual.compressedBytes, expected.bytes, `${label} bytes`)
  assert.equal(actual.sha1, expected.sha1, `${label} SHA-1`)
  assert.equal(actual.sha256, expected.sha256, `${label} SHA-256`)
  assert.equal(actual.integrity, expected.integrity, `${label} integrity`)
  assert.equal(
    actual.uncompressedTarBytes,
    expected.uncompressedTarBytes,
    `${label} uncompressed tar bytes`,
  )
  assert.equal(actual.memberCount, expected.fileCount, `${label} member count`)
  assert.equal(actual.metadataHeaderCount, 0, `${label} metadata headers`)
  assert.equal(
    actual.unpackedMemberBytes,
    expected.unpackedSize,
    `${label} unpacked bytes`,
  )
  assert.equal(actual.authentication.expectedShasum, expected.sha1)
  assert.equal(actual.authentication.expectedIntegrity, expected.integrity)
  assert.equal(actual.authentication.shasumVerified, true)
  assert.equal(actual.authentication.integrityVerified, true)
  assert.deepEqual(actual.authentication.registrySignature, {
    keyId: REGISTRY_KEY.keyid,
    publicKeySpkiSha256: REGISTRY_KEY.publicKeySpkiSha256,
    signature: expected.signature,
    verified: true,
  })
}

function buildTarballReport(release, artifactsRoot, staging) {
  const output = path.join(staging, release.reportPath)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  runJsonScript(
    compareTarballsScript,
    tarballArguments(release, artifactsRoot, output),
    `${release.name} tarball comparison`,
  )
  const report = JSON.parse(fs.readFileSync(output, 'utf8'))
  assert.equal(report.schemaVersion, 1)
  assert.equal(report.kind, 'npm-tarball-member-byte-comparison')
  assert.equal(report.packageName, release.name)
  assert.deepEqual(report.summary, release.expectedSummary)
  assertTarballSide(report.artifacts.baseline, release.baseline, 'baseline')
  assertTarballSide(report.artifacts.target, release.target, 'target')
  assert.deepEqual(
    Object.fromEntries(report.members.map(member => [member.path, member.status])),
    release.expectedMemberStatuses,
  )
  return report
}

function packageProvenance(release, report) {
  const target = release.target
  const artifact = report.artifacts.target
  const signatureMessage =
    `${release.name}@${target.version}:` + target.integrity
  return {
    name: release.name,
    version: target.version,
    publishedAt: target.publishedAt,
    tarballUrl: target.tarballUrl,
    tarballBytes: artifact.compressedBytes,
    tarballSha256: artifact.sha256,
    registryShasum: target.sha1,
    registryIntegrity: target.integrity,
    registrySignature: target.signature,
    signatureKeyid: REGISTRY_KEY.keyid,
    signatureMessageSha256: sha256(signatureMessage),
    signatureVerification:
      'ECDSA/SHA-256 verified OK with the pinned npm registry key',
    fileCount: artifact.memberCount,
    unpackedSize: artifact.unpackedMemberBytes,
    ...(release.os ? { os: release.os, cpu: release.cpu } : {}),
  }
}

function buildInventory(artifactsRoot, staging) {
  const executable = path.join(artifactsRoot, INVENTORY.executablePath)
  fileEvidence(
    executable,
    {
      bytes: INVENTORY.artifact.bytes,
      sha256: INVENTORY.artifact.sha256,
    },
    'target native executable',
  )
  const output = path.join(staging, INVENTORY.outputPath)
  const extracted = path.join(staging, 'binary-extraction/derived-modules')
  const inventory = runJsonScript(
    inspectBunContainerScript,
    [
      '--executable',
      executable,
      '--output',
      extracted,
      '--inventory',
      output,
      '--artifact-path',
      INVENTORY.artifact.path,
      '--package',
      INVENTORY.artifact.package,
      '--version',
      INVENTORY.artifact.version,
    ],
    'target Bun container inventory',
  )
  assert.equal(inventory.schemaVersion, 1)
  assert.equal(inventory.kind, 'bun-compiled-elf-embedded-graph')
  assert.deepEqual(inventory.artifact, INVENTORY.artifact)
  for (const [key, value] of Object.entries(INVENTORY.bunSection)) {
    assert.deepEqual(inventory.bunSection[key], value, `Bun section ${key}`)
  }
  assert.equal(inventory.modules.length, INVENTORY.bunSection.moduleCount)
  for (const module of inventory.modules) {
    const expected = INVENTORY.modules[module.path]
    assert.ok(expected, `unexpected Bun module: ${module.path}`)
    assert.equal(module.kind, expected.kind, `${module.path} kind`)
    assert.equal(module.content.bytes, expected.bytes, `${module.path} bytes`)
    assert.equal(
      module.content.sha256,
      expected.sha256,
      `${module.path} SHA-256`,
    )
    if (expected.jscBytes !== undefined) {
      assert.equal(
        module.jsc.bytes,
        expected.jscBytes,
        `${module.path} JSC bytes`,
      )
      assert.equal(
        module.jsc.sha256,
        expected.jscSha256,
        `${module.path} JSC SHA-256`,
      )
    } else {
      assert.equal(module.jsc, undefined, `${module.path} unexpected JSC`)
    }
  }
  assert.equal(
    new Set(inventory.modules.map(module => module.path)).size,
    Object.keys(INVENTORY.modules).length,
    'Bun module path coverage',
  )
  assert.deepEqual(inventory.derivedAnalyzableCli.canonicalWrapped, {
    bytes: DELTAS[0].target.bytes,
    sha256: DELTAS[0].target.sha256,
  })
  assert.deepEqual(inventory.derivedAnalyzableCli.inner, INVENTORY.inner)
  fileEvidence(output, INVENTORY.file, 'target Bun inventory')
  return inventory
}

function buildDeltas(artifactsRoot, staging) {
  const reports = []
  fs.mkdirSync(path.join(staging, 'diff'), { recursive: true })
  for (const delta of DELTAS) {
    const baseline = path.join(artifactsRoot, delta.baselinePath)
    const target = path.join(artifactsRoot, delta.targetPath)
    fileEvidence(baseline, delta.baseline, `${delta.path} baseline`)
    fileEvidence(target, delta.target, `${delta.path} target`)
    const output = path.join(staging, delta.payload.path)
    const report = runJsonScript(
      exactDeltaScript,
      [
        '--baseline',
        baseline,
        '--target',
        target,
        '--output',
        output,
        '--expected-baseline-sha256',
        delta.baseline.sha256,
        '--expected-target-sha256',
        delta.target.sha256,
      ],
      `${delta.path} exact delta`,
    )
    assert.equal(report.status, 'exact-delta-verified')
    assert.equal(report.algorithm, 'zstd-dictionary-patch')
    assert.equal(
      report.tool,
      '*** Zstandard CLI (64-bit) v1.5.7, by Yann Collet ***',
      'pinned Zstandard CLI version',
    )
    assert.deepEqual(report.baseline, delta.baseline)
    assert.deepEqual(report.target, delta.target)
    assert.deepEqual(report.delta, {
      bytes: delta.payload.bytes,
      sha256: delta.payload.sha256,
    })
    assert.equal(report.reconstructionSha256, delta.target.sha256)
    fileEvidence(
      output,
      { bytes: delta.payload.bytes, sha256: delta.payload.sha256 },
      `${delta.path} payload`,
    )
    reports.push({
      path: delta.path,
      baseline: delta.baseline,
      target: delta.target,
      payload: delta.payload,
    })
  }
  const metadata = {
    schemaVersion: 1,
    case: CASE,
    algorithm: 'zstd-dictionary-patch',
    tool: 'Zstandard CLI 1.5.7',
    files: reports,
    totalPayloadBytes: reports.reduce(
      (total, report) => total + report.payload.bytes,
      0,
    ),
  }
  assert.equal(metadata.totalPayloadBytes, 899_131)
  fs.writeFileSync(path.join(staging, 'diff/metadata.json'), json(metadata), {
    flag: 'wx',
  })
  return metadata
}

function publicationAdjacency() {
  const baselineIndex = REGISTRY_VERSION_SEQUENCE.indexOf(BASELINE)
  const targetIndex = REGISTRY_VERSION_SEQUENCE.indexOf(TARGET)
  assert.notEqual(baselineIndex, -1)
  assert.equal(targetIndex, baselineIndex + 1)
  const skipped = REGISTRY_VERSION_SEQUENCE.slice(
    baselineIndex + 1,
    targetIndex,
  )
  assert.deepEqual(skipped, [])
  assert.ok(
    Date.parse(PACKAGE_RELEASES.wrapper.target.publishedAt) >
      Date.parse(PACKAGE_RELEASES.wrapper.baseline.publishedAt),
    'wrapper publication ordering',
  )
  assert.ok(
    Date.parse(PACKAGE_RELEASES.linuxX64.target.publishedAt) >
      Date.parse(PACKAGE_RELEASES.linuxX64.baseline.publishedAt),
    'native publication ordering',
  )
  return {
    baseline: BASELINE,
    skipped,
    registryVersionSequence: REGISTRY_VERSION_SEQUENCE,
    targetIsNextPublishedVersion: true,
    skippedVersionsAbsent: true,
  }
}

function ensureOutputParent(caseRoot, relativePath) {
  const parent = path.dirname(path.join(caseRoot, relativePath))
  const relative = path.relative(caseRoot, parent)
  assert.ok(
    relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)),
    `Output escapes case root: ${relativePath}`,
  )
  let current = caseRoot
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component)
    if (!fs.existsSync(current)) fs.mkdirSync(current)
    assertRealDirectory(current, `output directory ${current}`)
  }
}

function publish(staging, caseRoot, relativePaths) {
  for (const relativePath of relativePaths) {
    const staged = path.join(staging, relativePath)
    const output = path.join(caseRoot, relativePath)
    assertRegularFile(staged, `staged ${relativePath}`)
    if (!fs.existsSync(output)) continue
    assertRegularFile(output, `existing ${relativePath}`)
    assert.ok(
      fs.readFileSync(output).equals(fs.readFileSync(staged)),
      `Refusing non-identical existing output: ${output}`,
    )
  }
  for (const relativePath of relativePaths) {
    const staged = path.join(staging, relativePath)
    const output = path.join(caseRoot, relativePath)
    if (fs.existsSync(output)) continue
    ensureOutputParent(caseRoot, relativePath)
    fs.copyFileSync(staged, output, fs.constants.COPYFILE_EXCL)
  }
}

function main() {
  const args = parseArguments(process.argv.slice(2))
  const artifactsRoot = path.resolve(args['artifacts-root'])
  const caseRoot = path.resolve(args['case-root'])
  const officialRepo = path.resolve(args['official-repo'])
  assertRealDirectory(artifactsRoot, 'artifacts root')
  assertRealDirectory(caseRoot, 'case root')
  assertRealDirectory(officialRepo, 'official repository')

  for (const release of Object.values(PACKAGE_RELEASES)) {
    for (const side of ['baseline', 'target']) {
      const expected = release[side]
      fileEvidence(
        path.join(artifactsRoot, expected.artifactPath),
        { bytes: expected.bytes, sha256: expected.sha256 },
        `${release.name} ${side} tarball`,
      )
    }
  }

  const staging = fs.mkdtempSync(
    path.join(os.tmpdir(), 'claude-code-2.1.123-acquisition-'),
  )
  try {
    const gitEvidence = buildGitEvidence(officialRepo, staging)
    const wrapperReport = buildTarballReport(
      PACKAGE_RELEASES.wrapper,
      artifactsRoot,
      staging,
    )
    const nativeReport = buildTarballReport(
      PACKAGE_RELEASES.linuxX64,
      artifactsRoot,
      staging,
    )
    const inventory = buildInventory(artifactsRoot, staging)
    const diff = buildDeltas(artifactsRoot, staging)
    const provenance = {
      schemaVersion: 1,
      release: TARGET,
      publicationAdjacency: publicationAdjacency(),
      npm: {
        registryKey: {
          registryUrl: REGISTRY_KEY.registryUrl,
          keyid: REGISTRY_KEY.keyid,
          keytype: REGISTRY_KEY.keytype,
          scheme: REGISTRY_KEY.scheme,
          expires: REGISTRY_KEY.expires,
          publicKeyDerBase64: REGISTRY_KEY.publicKeyDerBase64,
        },
        wrapper: packageProvenance(PACKAGE_RELEASES.wrapper, wrapperReport),
        linuxX64: packageProvenance(
          PACKAGE_RELEASES.linuxX64,
          nativeReport,
        ),
      },
      git: gitEvidence.git,
      changelog: gitEvidence.changelog,
    }
    const provenancePath = 'evidence/provenance.json'
    fs.writeFileSync(path.join(staging, provenancePath), json(provenance), {
      flag: 'wx',
    })
    const relativePaths = [
      provenancePath,
      ...gitEvidence.paths,
      PACKAGE_RELEASES.wrapper.reportPath,
      PACKAGE_RELEASES.linuxX64.reportPath,
      INVENTORY.outputPath,
      ...DELTAS.map(delta => delta.payload.path),
      'diff/metadata.json',
    ]
    assert.equal(new Set(relativePaths).size, relativePaths.length)
    publish(staging, caseRoot, relativePaths)
    const outputs = Object.fromEntries(
      relativePaths.map(relativePath => [
        relativePath,
        fileEvidence(
          path.join(caseRoot, relativePath),
          {
            bytes: fs.statSync(path.join(staging, relativePath)).size,
            sha256: sha256(fs.readFileSync(path.join(staging, relativePath))),
          },
          `published ${relativePath}`,
        ),
      ]),
    )
    process.stdout.write(
      json({
        status: '2.1.123-acquisition-evidence-verified',
        case: CASE,
        officialBullet: OFFICIAL_BULLET,
        packageMembers: wrapperReport.summary,
        nativePackageMembers: nativeReport.summary,
        embeddedModuleCount: inventory.modules.length,
        diffPayloadBytes: diff.totalPayloadBytes,
        outputs,
      }),
    )
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
}
