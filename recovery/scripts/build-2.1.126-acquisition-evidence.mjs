#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const BASELINE = '2.1.124'
const TARGET = '2.1.126'
const SKIPPED = '2.1.125'
const CASE = `${BASELINE}-to-${TARGET}`
const EMBEDDED_BUILD_IDENTITY = {
  version: TARGET,
  buildTime: '2026-04-30T16:01:00Z',
  gitSha: 'e44c1d97bd39dbf2525164f3fd33be6edbf1661e',
  versionOccurrences: 163,
  buildTimeOccurrences: 162,
  gitShaOccurrences: 162,
}

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
      publishedAt: '2026-04-30T01:39:41.460Z',
      tarballUrl:
        'https://registry.npmjs.org/@anthropic-ai/claude-code/-/' +
        'claude-code-2.1.124.tgz',
      bytes: 13_541,
      sha1: 'e1814f6262bc52e6bc2e8fdb4f1697a21484708c',
      sha256:
        'a6dc099f499adcd40f8cc53f93c709feb0c1d0e62ba8c7be2e80bf0c470ade07',
      integrity:
        'sha512-tyEGXAMWshWgGgRAp2x7hf12tM3nraB1T0qPEAO/w06HXfAXQxprPhwtvh4k' +
        'ULjVYbbh3BiJPHeCLXyg8S7U+Q==',
      signature:
        'MEUCIQDjLol13Q/IL8xA2WWrD19fphZ5GhN4g43I0F3Yc+Lb2wIgUJg6odeI' +
        'MwO0XMqcAmmlGFlvYryw9MersA6Rh7hDqms=',
      fileCount: 7,
      unpackedSize: 132_031,
      uncompressedTarBytes: 138_240,
    },
    target: {
      artifactPath: `${TARGET}/package.tgz`,
      version: TARGET,
      publishedAt: '2026-04-30T20:30:34.530Z',
      tarballUrl:
        'https://registry.npmjs.org/@anthropic-ai/claude-code/-/' +
        'claude-code-2.1.126.tgz',
      bytes: 13_541,
      sha1: '49555b048bc0343ba99ac4c97ff305d828062dcc',
      sha256:
        '2b773dc4d2f67cf41f84d3327199cbb9db2c291c1877f1c1835686062ffdd4a0',
      integrity:
        'sha512-eLuqO0iiXjQUipXQQEHBoCXG1CdxG+VBazV5sc8eA6HeRU18ur1UoL6xDrS1' +
        'GA5A3IgIkgIFa9OMrJSVosdi6w==',
      signature:
        'MEUCIB9zq/EPpcw9g39xkBcQ+fAdsH8DodFcKXKMsNqmcA0rAiEA9D5kgk3U' +
        'WV46Ch1FqSPnANIHAtflvu90Hb3yNwBCkcc=',
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
      publishedAt: '2026-04-30T01:38:46.793Z',
      tarballUrl:
        'https://registry.npmjs.org/@anthropic-ai/' +
        'claude-code-linux-x64/-/claude-code-linux-x64-2.1.124.tgz',
      bytes: 77_091_312,
      sha1: '76bb464a26108c4c4284dd715811f139374bbf15',
      sha256:
        '5c0ba323342c57b1a6dee4ac461315b2163f1db151adfad55fd046648c2b6916',
      integrity:
        'sha512-Yw3tWxRMSwzXTBd5THY40v9o5jxhHmWJJE0hxmjeZa54t4NKScZbDp0PUhZ8' +
        'FafFqmuYw819rEVVMJyW+wudvA==',
      signature:
        'MEQCIEol9kh+dsar62khOIIt/xGBQh2j3BgrW1v6spH2r1CBAiB3Zf7biQPqj' +
        'PdIZkqdeJlTkLF0fMRMhCE/NVJnROcWlw==',
      fileCount: 4,
      unpackedSize: 248_110_282,
      uncompressedTarBytes: 248_114_688,
    },
    target: {
      artifactPath: `${TARGET}-linux-x64/package.tgz`,
      version: TARGET,
      publishedAt: '2026-04-30T20:29:31.361Z',
      tarballUrl:
        'https://registry.npmjs.org/@anthropic-ai/' +
        'claude-code-linux-x64/-/claude-code-linux-x64-2.1.126.tgz',
      bytes: 77_086_774,
      sha1: 'acece0bfbf8036a6db433e750859b749b173609c',
      sha256:
        '7e4a55bdc7a02c0f593a3fbf3cbd384420a0635171f9cdb3dacfb0cfe3ca591f',
      integrity:
        'sha512-D2A9TI62aoQcxxbZzsiOWlfqs+7X/K49qSthkPdCg4B24aQWv2rL0PWTvnvM' +
        'TbQUTlg6bBL0PjauANdgHs+WjQ==',
      signature:
        'MEUCIBV7k5rJfXP8J9ajsEquPVVntVbw1dSEtrjiU7/9/1PiAiEA+Z6AiqHmZ' +
        'iV1YAHcMDdli2co//q9SGaSzol03AFmu9Y=',
      fileCount: 4,
      unpackedSize: 248_106_186,
      uncompressedTarBytes: 248_110_592,
    },
  },
}

const DELTAS = [
  {
    path: 'cli.js',
    baselinePath: `${BASELINE}-linux-x64/cli.js`,
    targetPath: `${TARGET}-linux-x64/cli.js`,
    baseline: {
      bytes: 13_981_018,
      sha256:
        '3214b62d9f7e3763a59211ad95a570d03f37e37c6aa87686cd9b6ccf4827eacb',
    },
    target: {
      bytes: 13_980_501,
      sha256:
        '99ea0a1eaab285e1c4fa3602458cdc4ee3f81fc622c3dc90906a7e306dd75a0f',
    },
    payload: {
      path: 'diff/cli.js.zstd-delta',
      bytes: 604_902,
      sha256:
        'b64b1a0af3f8df6613a2ec6621dd097b681bb6420b23ea1e81a9d12806018176',
    },
  },
  {
    path: 'image-processor.js',
    baselinePath: `${BASELINE}-linux-x64/image-processor.js`,
    targetPath: `${TARGET}-linux-x64/image-processor.js`,
    baseline: {
      bytes: 1_976,
      sha256:
        'dc2073caf18c06e7944416e90021929fba17e2fa8e371173917cc379a9d0be2b',
    },
    target: {
      bytes: 1_976,
      sha256:
        'f7961b57b01f68ca5648ef123e5a6c44b5461a2baa0f84e0ce3ad3ac3d4e9d70',
    },
    payload: {
      path: 'diff/image-processor.js.zstd-delta',
      bytes: 26,
      sha256:
        '5aafcbfe31dcc1f8112e1c8591d8d07f578f7e1b495912dcf49a116c86fe7dba',
    },
  },
  {
    path: 'audio-capture.js',
    baselinePath: `${BASELINE}-linux-x64/audio-capture.js`,
    targetPath: `${TARGET}-linux-x64/audio-capture.js`,
    baseline: {
      bytes: 1_974,
      sha256:
        '014fbdebbffb574016538720b02137b88b42c2535c74f0d7e2bbe3d42837920e',
    },
    target: {
      bytes: 1_974,
      sha256:
        'c85673c7958c82a0e9aed0d52d39fa5bb5bb25e226352319b7eeb4ac682bf76f',
    },
    payload: {
      path: 'diff/audio-capture.js.zstd-delta',
      bytes: 26,
      sha256:
        '3696c725f51add396be8bde7ff4219101f3a9550cb30042f2cb7798ad80a5c4a',
    },
  },
  {
    path: 'package.json',
    baselinePath: `${BASELINE}/package/package.json`,
    targetPath: `${TARGET}/package/package.json`,
    baseline: {
      bytes: 1_476,
      sha256:
        'd770813a0e1686ed8696fc543644a16c4269b4ac28df85e40c6ee07f751decd9',
    },
    target: {
      bytes: 1_476,
      sha256:
        '83e82576db90bbaeb072858c55ca709409cb214031d1de0a9401680513ded5e5',
    },
    payload: {
      path: 'diff/package.json.zstd-delta',
      bytes: 55,
      sha256:
        'a1d0cf5d7e565c7641bd0e04a4c186dbf9938fa1b946825a97d24becb4f6e6da',
    },
  },
]

const INVENTORY = {
  executablePath: `${TARGET}-linux-x64/package/claude`,
  outputPath: 'binary-extraction/inventory.json',
  file: {
    bytes: 6_458,
    sha256:
      '410e4247a54298b68d2effe0aea7a9f25b68dc2a634440ee3e4f483028d5408c',
  },
  artifact: {
    package: '@anthropic-ai/claude-code-linux-x64',
    version: TARGET,
    path: 'package/claude',
    bytes: 248_105_600,
    sha256:
      'fce96968d275161ff65a4c19fc6434efc6973d9f6d35dc3992a2ba0553cac18e',
  },
  bunSection: {
    fileOffset: 108_675_072,
    bytes: 139_425_445,
    endFileOffset: 248_100_517,
    sha256:
      'fd9509981bb627b413e8b350379b2413b2522fd111c7d36cea6b7236dc13a1f8',
    footerSha256:
      'e1662a07489c519a6603b2f2cf54ec2477e1136ab6004e2cdc985f1b78c413b9',
    directorySha256:
      '905e7182bb3c6a3d0d7768b75880a9e640d813af7e92b91dfea5295f8c1bc087',
    moduleCount: 5,
  },
  modules: {
    '/$bunfs/root/src/entrypoints/cli.js': {
      kind: 'js+jsc',
      bytes: 13_980_501,
      sha256:
        '99ea0a1eaab285e1c4fa3602458cdc4ee3f81fc622c3dc90906a7e306dd75a0f',
      jscBytes: 123_483_408,
      jscSha256:
        '1ef67ae4df32873c790403c7c6d71eaec39a1a2024040dd346ad34d0b57896f4',
    },
    '/$bunfs/root/image-processor.js': {
      kind: 'js',
      bytes: 1_976,
      sha256:
        'f7961b57b01f68ca5648ef123e5a6c44b5461a2baa0f84e0ce3ad3ac3d4e9d70',
    },
    '/$bunfs/root/audio-capture.js': {
      kind: 'js',
      bytes: 1_974,
      sha256:
        'c85673c7958c82a0e9aed0d52d39fa5bb5bb25e226352319b7eeb4ac682bf76f',
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
    bytes: 13_980_411,
    sha256:
      'e9d40219be0cad9009c115ec637df4976e987c33d4b7a88cc5f047ead9ad828d',
    nodeCheck: true,
  },
}

const GIT = {
  repository: 'https://github.com/anthropics/claude-code.git',
  targetTag: 'v2.1.126',
  targetChangelogHeading: '## 2.1.126',
  missingTags: ['v2.1.124', 'v2.1.125'],
  missingChangelogHeadings: ['## 2.1.124', '## 2.1.125'],
  relevantTags: ['v2.1.123', 'v2.1.124', 'v2.1.125', 'v2.1.126'],
  baseline: {
    tag: 'v2.1.123',
    acceptedLocalTags: ['v2.1.123', 'upstream-v2.1.123'],
    commit: 'e512ec99188d191b07662fc9f69c5764f750a302',
    tree: '500a2770ad88b7374e7f60aa69873b111c8c94d1',
  },
  targetPublicRelease: {
    tag: 'v2.1.126',
    acceptedLocalTags: ['v2.1.126', 'upstream-v2.1.126'],
    commit: 'a243cad11945e791b886091548fd057f3b34f690',
    parent: 'e512ec99188d191b07662fc9f69c5764f750a302',
    tree: '167ac1f385a391d28d1697fb8423c8fa1b6a5d19',
    commitTimestamp: '2026-05-01T02:05:18+00:00',
    subject: 'chore: Update CHANGELOG.md',
  },
  snapshot: {
    changelogBlob: 'be4b8b3c09e4295fde604f1bf6a24134aefbf359',
    changelogBytes: 268_769,
    changelogSha256:
      'efeda64b42e26075ebdc26bc3e7ee71416aa9d02f08e908c0e4f1b78bef4a67e',
    targetSectionBytes: 4_218,
    targetSectionSha256:
      'fe059e6e6e8b301550c6ffe594a3f4dcc79c4529446e7e2909f32c771bea2d05',
    targetSectionBulletCount: 33,
  },
  publicGapDiff: {
    filesChanged: 1,
    insertions: 36,
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
  '2.1.122',
  '2.1.123',
  BASELINE,
  TARGET,
]

const OPTIONAL_PLATFORM_DEPENDENCIES = {
  '@anthropic-ai/claude-code-linux-x64': TARGET,
  '@anthropic-ai/claude-code-win32-x64': TARGET,
  '@anthropic-ai/claude-code-darwin-x64': TARGET,
  '@anthropic-ai/claude-code-linux-arm64': TARGET,
  '@anthropic-ai/claude-code-win32-arm64': TARGET,
  '@anthropic-ai/claude-code-darwin-arm64': TARGET,
  '@anthropic-ai/claude-code-linux-x64-musl': TARGET,
  '@anthropic-ai/claude-code-linux-arm64-musl': TARGET,
}

const REGISTRY_ABSENCE = {
  registry: 'https://registry.npmjs.org',
  outputPath: `evidence/REGISTRY-${SKIPPED}-ABSENCE.json`,
  missingResponse: {
    httpStatus: 404,
    bytes: 28,
    sha256:
      'fefa83edd887f5aa6f5741c230e6a0121e0039db064aa4849a4185f152d6e683',
    json: `version not found: ${SKIPPED}`,
  },
  packages: [
    {
      key: 'wrapper',
      name: '@anthropic-ai/claude-code',
      encodedName: '@anthropic-ai%2fclaude-code',
      targetMetadata: {
        optionalDependencies: OPTIONAL_PLATFORM_DEPENDENCIES,
      },
    },
    {
      key: 'linuxX64',
      name: '@anthropic-ai/claude-code-linux-x64',
      encodedName: '@anthropic-ai%2fclaude-code-linux-x64',
      targetMetadata: { os: ['linux'], cpu: ['x64'] },
    },
  ],
}

function usage() {
  console.error(
    'Usage: build-2.1.126-acquisition-evidence.mjs ' +
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

function countOccurrences(value, needle) {
  return value.split(needle).length - 1
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

function extractChangelogSection(changelog, version) {
  const heading = `## ${version}\n`
  const start = changelog.indexOf(heading)
  assert.notEqual(start, -1, `official changelog ${version} heading`)
  assert.equal(
    start,
    changelog.lastIndexOf(heading),
    `official changelog ${version} heading cardinality`,
  )
  const next = changelog.indexOf('\n## ', start + heading.length)
  assert.notEqual(next, -1, `official changelog following ${version}`)
  return changelog.slice(start, next + 1)
}

function buildGitEvidence(officialRepo, staging) {
  const baseline = GIT.baseline
  const targetRelease = GIT.targetPublicRelease
  assertAcceptedTag(
    officialRepo,
    baseline.commit,
    baseline.acceptedLocalTags,
    'baseline official tag',
  )
  assertAcceptedTag(
    officialRepo,
    targetRelease.commit,
    targetRelease.acceptedLocalTags,
    'target public official tag',
  )
  for (const missingTag of GIT.missingTags) {
    assert.equal(
      git(officialRepo, ['tag', '--list', missingTag], `${missingTag} absence`),
      '',
      `${missingTag} must be absent from official tags`,
    )
  }
  assert.equal(
    oneLine(
      git(
        officialRepo,
        ['cat-file', '-t', targetRelease.commit],
        'target object type',
      ),
      'target object type',
    ),
    'commit',
  )
  assert.equal(
    oneLine(
      git(
        officialRepo,
        ['rev-parse', `${targetRelease.commit}^`],
        'target parent',
      ),
      'target parent',
    ),
    targetRelease.parent,
  )
  assert.equal(
    oneLine(
      git(
        officialRepo,
        ['rev-parse', `${targetRelease.commit}^{tree}`],
        'target tree',
      ),
      'target tree',
    ),
    targetRelease.tree,
  )
  assert.equal(
    oneLine(
      git(
        officialRepo,
        ['rev-parse', `${baseline.commit}^{tree}`],
        'baseline tree',
      ),
      'baseline tree',
    ),
    baseline.tree,
  )
  const metadata = git(
    officialRepo,
    [
      'show',
      '-s',
      '--format=%H%x00%P%x00%T%x00%cI%x00%s',
      targetRelease.commit,
    ],
    'target public commit metadata',
  )
    .trimEnd()
    .split('\0')
  assert.deepEqual(metadata, [
    targetRelease.commit,
    targetRelease.parent,
    targetRelease.tree,
    targetRelease.commitTimestamp,
    targetRelease.subject,
  ])
  assert.equal(
    targetRelease.parent,
    baseline.commit,
    'public release commit adjacency',
  )
  assert.equal(
    oneLine(
      git(
        officialRepo,
        [
          'rev-list',
          '--count',
          `${baseline.commit}..${targetRelease.commit}`,
        ],
        'commit adjacency count',
      ),
      'commit adjacency count',
    ),
    '1',
  )
  const paths = git(
    officialRepo,
    ['diff', '--name-only', baseline.commit, targetRelease.commit],
    'public release gap path diff',
  )
    .trimEnd()
    .split('\n')
    .filter(Boolean)
  assert.deepEqual(paths, GIT.publicGapDiff.paths, 'public gap changed paths')
  const numstat = git(
    officialRepo,
    ['diff', '--numstat', baseline.commit, targetRelease.commit],
    'public release gap numstat',
  )
    .trimEnd()
    .split('\n')
    .filter(Boolean)
  assert.deepEqual(numstat, ['36\t0\tCHANGELOG.md'], 'public gap numstat')

  const reachableCommits = new Set(
    git(officialRepo, ['rev-list', '--all'], 'all public reachable commits')
      .trimEnd()
      .split('\n')
      .filter(Boolean),
  )
  assert.equal(
    reachableCommits.has(EMBEDDED_BUILD_IDENTITY.gitSha),
    false,
    'embedded source revision must not be publicly reachable',
  )

  const blob = oneLine(
    git(
      officialRepo,
      ['rev-parse', `${targetRelease.commit}:CHANGELOG.md`],
      'official changelog blob',
    ),
    'official changelog blob',
  )
  assert.equal(blob, GIT.snapshot.changelogBlob)
  const changelogBytes = git(
    officialRepo,
    ['show', `${targetRelease.commit}:CHANGELOG.md`],
    'official changelog content',
    { encoding: null, maxBuffer: 2 * 1024 * 1024 },
  )
  assert.equal(changelogBytes.length, GIT.snapshot.changelogBytes)
  assert.equal(sha256(changelogBytes), GIT.snapshot.changelogSha256)
  const changelog = changelogBytes.toString('utf8')
  for (const heading of GIT.missingChangelogHeadings) {
    const needle = `${heading}\n`
    assert.equal(changelog.indexOf(needle), -1, `${heading} must be absent`)
  }
  const targetVersion = targetRelease.tag.slice(1)
  assert.equal(targetVersion, TARGET, 'target tag version')
  const targetSection = extractChangelogSection(changelog, targetVersion)
  assert.equal(
    Buffer.byteLength(targetSection),
    GIT.snapshot.targetSectionBytes,
    'target public section bytes',
  )
  assert.equal(
    sha256(targetSection),
    GIT.snapshot.targetSectionSha256,
    'target public section SHA-256',
  )
  assert.equal(
    targetSection.split('\n').filter(line => line.startsWith('- ')).length,
    GIT.snapshot.targetSectionBulletCount,
    'target public section bullet count',
  )

  const fullPath =
    `evidence/claude-code-CHANGELOG-${targetRelease.commit.slice(0, 8)}.md`
  const sectionPath = `evidence/CHANGELOG-${TARGET}.md`
  const tagRefsPath = 'evidence/official-tag-refs.txt'
  const releasePath = `evidence/RELEASE-${TARGET}.json`
  fs.mkdirSync(path.join(staging, 'evidence'), { recursive: true })
  fs.writeFileSync(path.join(staging, fullPath), changelogBytes, { flag: 'wx' })
  const sectionBytes = Buffer.from(targetSection)
  fs.writeFileSync(path.join(staging, sectionPath), sectionBytes, { flag: 'wx' })

  const tagRefLines = git(
    officialRepo,
    ['show-ref', '--tags', '--dereference'],
    'official tag refs',
  )
    .trimEnd()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const match = /^([0-9a-f]{40}) (refs\/tags\/[^\n]+)$/.exec(line)
      assert.ok(match, `invalid official tag ref line: ${line}`)
      return `${match[1]}\t${match[2]}`
    })
    .filter(line => {
      const ref = line.split('\t')[1].replace(/\^\{\}$/, '')
      return GIT.relevantTags.includes(ref.slice('refs/tags/'.length))
    })
    .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
  assert.equal(new Set(tagRefLines).size, tagRefLines.length)
  assert.equal(tagRefLines.length, 2, 'relevant official tag ref count')
  const tagRefsBytes = Buffer.from(`${tagRefLines.join('\n')}\n`)
  assert.ok(
    tagRefLines.includes(`${baseline.commit}\trefs/tags/${baseline.tag}`),
    'baseline tag ref witness',
  )
  assert.ok(
    tagRefLines.includes(
      `${targetRelease.commit}\trefs/tags/${targetRelease.tag}`,
    ),
    'target public tag ref witness',
  )
  for (const missingTag of GIT.missingTags) {
    assert.equal(
      tagRefLines.some(line =>
        line.endsWith(`\trefs/tags/${missingTag}`) ||
        line.endsWith(`\trefs/tags/${missingTag}^{}`),
      ),
      false,
      `${missingTag} direct and peeled refs must be absent`,
    )
  }
  fs.writeFileSync(path.join(staging, tagRefsPath), tagRefsBytes, {
    flag: 'wx',
  })

  const release = {
    schemaVersion: 1,
    kind: 'authenticated-public-release-presence',
    release: TARGET,
    tag: {
      name: GIT.targetTag,
      present: true,
      commit: targetRelease.commit,
      tree: targetRelease.tree,
      refs: {
        path: tagRefsPath,
        bytes: tagRefsBytes.length,
        sha256: sha256(tagRefsBytes),
      },
    },
    changelog: {
      heading: GIT.targetChangelogHeading,
      present: true,
      bulletCount: GIT.snapshot.targetSectionBulletCount,
      section: {
        path: sectionPath,
        bytes: sectionBytes.length,
        sha256: sha256(sectionBytes),
      },
      fullSnapshot: {
        path: fullPath,
        bytes: changelogBytes.length,
        sha256: sha256(changelogBytes),
        gitBlobSha1: blob,
      },
    },
    nearestPublicTagBefore: {
      tag: baseline.tag,
      commit: baseline.commit,
    },
    absentIntermediateTags: GIT.missingTags,
    publicCommitGap: {
      basis: `${baseline.tag}..${targetRelease.tag}`,
      adjacentCommits: true,
      ...GIT.publicGapDiff,
    },
  }
  const releaseBytes = Buffer.from(json(release))
  fs.writeFileSync(path.join(staging, releasePath), releaseBytes, { flag: 'wx' })

  return {
    git: {
      repository: GIT.repository,
      targetTag: GIT.targetTag,
      targetTagPresent: true,
      targetChangelogHeading: GIT.targetChangelogHeading,
      targetChangelogHeadingPresent: true,
      embeddedGitSha: EMBEDDED_BUILD_IDENTITY.gitSha,
      embeddedGitShaPubliclyReachable: false,
      nearestTags: {
        before: {
          tag: baseline.tag,
          commit: baseline.commit,
          tree: baseline.tree,
        },
        target: {
          tag: targetRelease.tag,
          commit: targetRelease.commit,
          parent: targetRelease.parent,
          tree: targetRelease.tree,
          commitTimestamp: targetRelease.commitTimestamp,
          subject: targetRelease.subject,
        },
        adjacentCommits: true,
        missingTags: GIT.missingTags,
      },
      missingChangelogHeadings: GIT.missingChangelogHeadings,
      publicGapDiff: {
        basis: `${baseline.tag}..${targetRelease.tag}`,
        ...GIT.publicGapDiff,
      },
    },
    changelog: {
      fullPath,
      fullGitBlobSha1: blob,
      fullBytes: changelogBytes.length,
      fullSha256: sha256(changelogBytes),
      targetVersion: TARGET,
      targetHeadingPresent: true,
      targetSectionPath: sectionPath,
      targetSectionBytes: Buffer.byteLength(targetSection),
      targetSectionSha256: sha256(targetSection),
      targetBulletCount: GIT.snapshot.targetSectionBulletCount,
    },
    publicReleasePresence: {
      path: releasePath,
      bytes: releaseBytes.length,
      sha256: sha256(releaseBytes),
      tag: release.tag,
      changelog: release.changelog,
    },
    paths: [fullPath, sectionPath, tagRefsPath, releasePath],
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
  const innerSource = fs.readFileSync(path.join(extracted, 'cli.inner.js'), 'utf8')
  assert.ok(
    innerSource
      .slice(0, 1_024)
      .includes(`\n// Version: ${TARGET}\n`),
    'target inner bundle version header',
  )
  assert.equal(
    countOccurrences(innerSource, EMBEDDED_BUILD_IDENTITY.version),
    EMBEDDED_BUILD_IDENTITY.versionOccurrences,
    'embedded version occurrence count',
  )
  assert.equal(
    countOccurrences(innerSource, EMBEDDED_BUILD_IDENTITY.buildTime),
    EMBEDDED_BUILD_IDENTITY.buildTimeOccurrences,
    'embedded build time occurrence count',
  )
  assert.equal(
    countOccurrences(innerSource, EMBEDDED_BUILD_IDENTITY.gitSha),
    EMBEDDED_BUILD_IDENTITY.gitShaOccurrences,
    'embedded source revision occurrence count',
  )
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
  assert.equal(metadata.totalPayloadBytes, 605_009)
  fs.writeFileSync(path.join(staging, 'diff/metadata.json'), json(metadata), {
    flag: 'wx',
  })
  return metadata
}

function registryRequest(url, destination, label) {
  const result = spawnSync(
    'curl',
    [
      '--silent',
      '--show-error',
      '--location',
      '--output',
      destination,
      '--write-out',
      '%{http_code}',
      url,
    ],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 },
  )
  if (result.error) throw result.error
  assert.equal(
    result.status,
    0,
    `${label} failed: ${String(result.stderr || result.stdout)}`,
  )
  assertRegularFile(destination, `${label} response`)
  assert.match(result.stdout, /^\d{3}$/, `${label} HTTP status`)
  return {
    httpStatus: Number(result.stdout),
    body: fs.readFileSync(destination),
  }
}

function versionWindow(packument, label) {
  assert.ok(
    packument && typeof packument === 'object' && !Array.isArray(packument),
    `${label}: invalid packument`,
  )
  assert.ok(
    packument.versions && typeof packument.versions === 'object',
    `${label}: missing versions`,
  )
  return Object.keys(packument.versions)
    .map(version => {
      const match = /^2\.1\.(\d+)$/.exec(version)
      return match ? { version, patch: Number(match[1]) } : null
    })
    .filter(value => value && value.patch >= 114 && value.patch <= 126)
    .sort((left, right) => left.patch - right.patch)
    .map(value => value.version)
}

function assertTargetRegistryMetadata(actual, release, expected, label) {
  assert.equal(actual.name, release.name, `${label} name`)
  assert.equal(actual.version, TARGET, `${label} target version`)
  assert.equal(actual.dist?.shasum, release.target.sha1, `${label} shasum`)
  assert.equal(
    actual.dist?.integrity,
    release.target.integrity,
    `${label} integrity`,
  )
  assert.equal(
    actual.dist?.tarball,
    release.target.tarballUrl,
    `${label} tarball URL`,
  )
  assert.equal(
    actual.dist?.fileCount,
    release.target.fileCount,
    `${label} file count`,
  )
  assert.equal(
    actual.dist?.unpackedSize,
    release.target.unpackedSize,
    `${label} unpacked size`,
  )
  assert.deepEqual(
    actual.dist?.signatures,
    [{ keyid: REGISTRY_KEY.keyid, sig: release.target.signature }],
    `${label} registry signature`,
  )
  for (const [key, value] of Object.entries(expected)) {
    assert.deepEqual(actual[key], value, `${label} ${key}`)
  }
}

function buildRegistryAbsence(staging) {
  const packages = []
  for (const expected of REGISTRY_ABSENCE.packages) {
    const release = PACKAGE_RELEASES[expected.key]
    assert.equal(release.name, expected.name, `${expected.key} package name`)
    const packumentUrl =
      `${REGISTRY_ABSENCE.registry}/${expected.encodedName}`
    const missingUrl = `${packumentUrl}/${SKIPPED}`
    const packumentResponse = registryRequest(
      packumentUrl,
      path.join(staging, `registry-${expected.key}-packument.json`),
      `${expected.name} packument`,
    )
    assert.equal(packumentResponse.httpStatus, 200)
    const packument = JSON.parse(packumentResponse.body.toString('utf8'))
    assert.equal(packument.name, expected.name, `${expected.name} packument name`)
    const publishedVersions = versionWindow(packument, expected.name)
    assert.deepEqual(
      publishedVersions,
      REGISTRY_VERSION_SEQUENCE,
      `${expected.name} pinned version window`,
    )
    assert.equal(
      Object.hasOwn(packument.versions, SKIPPED),
      false,
      `${expected.name} skipped version absence`,
    )
    assert.equal(
      Object.hasOwn(packument.time ?? {}, SKIPPED),
      false,
      `${expected.name} skipped publication time absence`,
    )
    assert.equal(
      packument.time?.[BASELINE],
      release.baseline.publishedAt,
      `${expected.name} baseline publication`,
    )
    assert.equal(
      packument.time?.[TARGET],
      release.target.publishedAt,
      `${expected.name} target publication`,
    )
    assertTargetRegistryMetadata(
      packument.versions[TARGET],
      release,
      expected.targetMetadata,
      expected.name,
    )

    const missingResponse = registryRequest(
      missingUrl,
      path.join(staging, `registry-${expected.key}-${SKIPPED}.json`),
      `${expected.name}@${SKIPPED}`,
    )
    assert.equal(
      missingResponse.httpStatus,
      REGISTRY_ABSENCE.missingResponse.httpStatus,
      `${expected.name}@${SKIPPED} HTTP status`,
    )
    assert.deepEqual(
      {
        bytes: missingResponse.body.length,
        sha256: sha256(missingResponse.body),
        json: JSON.parse(missingResponse.body.toString('utf8')),
      },
      {
        bytes: REGISTRY_ABSENCE.missingResponse.bytes,
        sha256: REGISTRY_ABSENCE.missingResponse.sha256,
        json: REGISTRY_ABSENCE.missingResponse.json,
      },
      `${expected.name}@${SKIPPED} response`,
    )

    packages.push({
      name: expected.name,
      packument: {
        url: packumentUrl,
        httpStatus: packumentResponse.httpStatus,
        versionWindow: publishedVersions,
        skippedVersionPresent: false,
        skippedPublicationTimePresent: false,
        baselinePublishedAt: release.baseline.publishedAt,
        targetPublishedAt: release.target.publishedAt,
      },
      missingVersionEndpoint: {
        url: missingUrl,
        httpStatus: missingResponse.httpStatus,
        body: {
          bytes: missingResponse.body.length,
          sha256: sha256(missingResponse.body),
          json: REGISTRY_ABSENCE.missingResponse.json,
        },
      },
    })
  }

  const evidence = {
    schemaVersion: 1,
    kind: 'authoritative-npm-registry-version-absence',
    registry: REGISTRY_ABSENCE.registry,
    transport: 'HTTPS with the host platform trust store',
    release: SKIPPED,
    semanticVersionGap: {
      baseline: BASELINE,
      skipped: [SKIPPED],
      target: TARGET,
    },
    publishedAdjacency: {
      sequence: [BASELINE, TARGET],
      targetIsNextPublishedVersion: true,
      skippedVersionsAbsent: true,
    },
    packages,
  }
  const bytes = Buffer.from(json(evidence))
  fs.writeFileSync(
    path.join(staging, REGISTRY_ABSENCE.outputPath),
    bytes,
    { flag: 'wx' },
  )
  return {
    path: REGISTRY_ABSENCE.outputPath,
    bytes: bytes.length,
    sha256: sha256(bytes),
    kind: evidence.kind,
    packages: evidence.packages,
  }
}

function publicationAdjacency() {
  const baselineIndex = REGISTRY_VERSION_SEQUENCE.indexOf(BASELINE)
  const targetIndex = REGISTRY_VERSION_SEQUENCE.indexOf(TARGET)
  assert.notEqual(baselineIndex, -1)
  assert.equal(targetIndex, baselineIndex + 1)
  assert.equal(REGISTRY_VERSION_SEQUENCE.includes(SKIPPED), false)
  const skipped = [SKIPPED]
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
    semanticVersionGap: [SKIPPED],
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
    path.join(os.tmpdir(), 'claude-code-2.1.126-acquisition-'),
  )
  try {
    const gitEvidence = buildGitEvidence(officialRepo, staging)
    const registryAbsence = buildRegistryAbsence(staging)
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
        optionalPlatformDependencies: OPTIONAL_PLATFORM_DEPENDENCIES,
        skippedVersionAbsence: registryAbsence,
      },
      embeddedBuildIdentity: EMBEDDED_BUILD_IDENTITY,
      git: gitEvidence.git,
      changelog: gitEvidence.changelog,
      publicReleasePresence: gitEvidence.publicReleasePresence,
    }
    const provenancePath = 'evidence/provenance.json'
    fs.writeFileSync(path.join(staging, provenancePath), json(provenance), {
      flag: 'wx',
    })
    const relativePaths = [
      provenancePath,
      ...gitEvidence.paths,
      registryAbsence.path,
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
        status: '2.1.126-acquisition-evidence-verified',
        case: CASE,
        skippedVersion: SKIPPED,
        officialBulletCount: GIT.snapshot.targetSectionBulletCount,
        officialReleaseEvidenceKind:
          'authenticated-public-release-presence',
        registryAbsenceEvidenceKind: registryAbsence.kind,
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
