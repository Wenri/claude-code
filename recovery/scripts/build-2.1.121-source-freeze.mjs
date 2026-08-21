#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const caseRoot = path.join(repo, 'recovery/cases/2.1.120-to-2.1.121')
const recoveredRelative = 'recovered'
const freezeRelative = `${recoveredRelative}/source-freeze`
const overlayRelative = `${recoveredRelative}/source-facing-overlay.patch`
const freezeOverlayRelative = `${freezeRelative}/source-facing-overlay.patch`
const lineageRelative = `${recoveredRelative}/source-lineage-core.json`
const directEvidencePath = path.join(caseRoot, 'semantic/direct-evidence.json')
const baseRevision = '6801ead984ba2c3df02bd092ad8b93df096ed8c1'
const targetTestRevision = '11890981447ee2cea3407c608f4411e43e5fe72a'
const targetDetachedTestRevisions = [
  '9f034bb03d575603a850e3c75ce003406094f9cc',
]
const retainedManifestIdentity = Object.freeze({
  bytes: 275_998,
  sha256: '5c378bdbedaad3b8a39c2b69038ef7f2857b025290f68d6437d5309b7bc8bf61',
})

// Freeze and execute every release-scoped suite in the current finalized
// recovery tree. This 103-root regression set is intentionally discovered
// rather than hand-maintained. Membership in the separate 33-entry
// semantic-core catalog is governed by the semantic-obligations builder and
// verifier.
const targetTests = fs
  .readdirSync(path.join(repo, 'recovery/test'))
  .filter(name => /^recovery-2\.1\.121-.*\.test\.mjs$/.test(name))
  .map(name => `recovery/test/${name}`)
  .sort()
assert(
  targetTests.includes(
    'recovery/test/recovery-2.1.121-direct-evidence.test.mjs',
  ),
  'direct-evidence suite is part of the frozen test set',
)
const reviewedTargetTestExecution = Object.freeze({
  tests: 480,
  passed: 466,
  failed: 0,
  skipped: 14,
  files: 103,
})
const reviewedBunRuntimeLibraries = Object.freeze(
  [
    ['libarchive.so.13.8.8', 'libarchive.so.13', 981_496, '3155c374bef7babb4c6c8ffa2fc10d47fef89385c4f000d263551ec8b7f5d367', 0o755],
    ['libbrotlicommon.so.1.2.0', 'libbrotlicommon.so.1', 143_408, 'd5bba266a5752ababb4a56a79aec3071f9eac8984a3c818493ad006b4b74beb4', 0o755],
    ['libbrotlidec.so.1.2.0', 'libbrotlidec.so.1', 59_768, 'ad80d23baef2449aa9163b77217eca29e8370f0f6c62caa06dfcaf51d15c34d4', 0o755],
    ['libbrotlienc.so.1.2.0', 'libbrotlienc.so.1', 776_496, '486fafa6ed14344798e408763f5a716aca427bcb71fe0febc916afd33dce8f91', 0o755],
    ['libbz2.so.1.0.8', 'libbz2.so.1.0', 241_888, 'cc570bce44ed3ab1b0f480bdb95c04e8224432811bfb5a55b533135a6001a03b', 0o755],
    ['libcares.so.2.19.5', 'libcares.so.2', 323_632, '0ab5892532c3befe905456ead7bebe2e36699b2a7307177be666ed0602514772', 0o755],
    ['libcrypto.so.3', 'libcrypto.so.3', 7_207_344, 'a81fb38c65e3fab72af5e31179fc8d76090b921a149c71c727e2fbe5e83a62df', 0o755],
    ['libdeflate.so.0', 'libdeflate.so.0', 101_872, '9f915c3467f59a215e969f24fa341425fe7bd6972a340079529d2cf21f818a28', 0o755],
    ['libgcc_s.so.1', 'libgcc_s.so.1', 902_640, 'e1e904051f77f9569c2ea53c83bb4083c26575e0fbd4010e46f1cb8b21037ad1', 0o644],
    ['libhdr_histogram.so.6.2.3', 'libhdr_histogram.so.6', 54_264, '4ec2dedb2a09391ee0304549a6fc4fa2c228d94a315764e1689428fc7409efc0', 0o755],
    ['libhwy.so.1.4.0', 'libhwy.so.1', 80_216, 'e25dfbe9e006cc6a1d7f2b01814a0668dafa807cfad6b6bd7478d7d7affb6326', 0o755],
    ['libiconv.so.2.7.0', 'libiconv.so.2', 1_178_544, 'ec9f94edf6d531397d6a53e5fd0a93747d683d64eafcb12e7a75546824152a3d', 0o755],
    ['libicudata.so.75.1', 'libicudata.so.75', 30_741_448, 'e065d9cbce8450291e1e8f9125f9a115a07b0181728217b7bf4e3db65c60a322', 0o755],
    ['libicui18n.so.75.1', 'libicui18n.so.75', 4_817_400, '8332a1c6b589195ceac95fa127a256258f26e636616cf3d4f64fb9e5d182336d', 0o755],
    ['libicuuc.so.75.1', 'libicuuc.so.75', 2_585_632, 'c9a25b3248c0b20fe3e2bf10042fba72009eed6d72422dca53c8ac169ca65d1b', 0o755],
    ['liblolhtml.so.1.4.0', 'liblolhtml.so.1', 882_416, 'c1dfb8c77a818b1c4ab7783b9e7b2b0a1c7b72af5abed065eb1e23640fb57c25', 0o755],
    ['libls-hpack.so', 'libls-hpack.so', 836_272, '6e4ec871aeb52ecfda01242dc904f07232d5f6c6c89af3ade278eb216288f861', 0o644],
    ['liblz4.so.1.10.0', 'liblz4.so.1', 190_600, '34f4953d4e73474636347458db1f1048ba4b1ba967f36ef3da53051d0d1bc4da', 0o755],
    ['liblzma.so.5', 'liblzma.so.5', 222_712, '07dceced575343c83860aedde6e7e2ac5deb7a0fa31b0f195c44388544817abc', 0o755],
    ['liblzo2.so.2.0.0', 'liblzo2.so.2', 229_264, '7fb098ccaf6ce5c1c925dff401bfcd9d70e46ca878cc63051da80489b7392038', 0o755],
    ['libstdc++.so.6.0.34', 'libstdc++.so.6', 21_295_144, '9581ad615b7c073423f57b69a3b148a89f8ea76fc909124211f9007909b807a6', 0o755],
    ['libxml2.so.16.1.1', 'libxml2.so.16', 1_444_464, 'f43ab2fc9a6a52de1a580b34db5b24470d58050c262452a8db12423ccb6c247d', 0o755],
    ['libz.so.1.3.2', 'libz.so.1', 117_128, '22f1601237b86f0f48ed5b83071d1505167ae2e16365b33b4eed6e96dbf71ab0', 0o755],
    ['libzstd.so.1.5.7', 'libzstd.so.1', 1_198_840, 'e32f1e98942e91193d137ae9d460adf8e8cfbf504c8a8aedfb5825576d53a801', 0o755],
  ].map(([source, destination, bytes, sha256, mode]) =>
    Object.freeze({
      source: `.pixi/envs/default/lib/${source}`,
      destination: `.pixi/envs/default/lib/${destination}`,
      bytes,
      sha256,
      mode,
    }),
  ),
)
const reviewedTestSandbox = Object.freeze({
  schemaVersion: 1,
  legacyArtifacts: [
    {
      destination:
        '.recovery-tmp/authenticated-artifacts/2.1.120-linux-x64/cli.inner.js',
      artifact: 'baselineAnalyzableBundle',
    },
    {
      destination:
        '.recovery-tmp/authenticated-artifacts/2.1.121-linux-x64/cli.inner.js',
      artifact: 'targetAnalyzableBundle',
    },
  ],
  expandedFiles: [
    {
      source: 'structural/all-owners.json.gz',
      bytes: 1_035_816,
      sha256:
        'b42a301c879554afd738a5afd3fd03c131fa6361dd62c37694ae68cd2961866d',
      compression: 'gzip',
      destination:
        '.recovery-tmp/generator-inputs/2.1.120-to-2.1.121.all-owners.json',
      expandedBytes: 9_491_480,
      expandedSha256:
        'a22f33e74ad03338d787b31eab6227af8aa8bad3ab4882f53dbdfb5813d63709',
    },
    {
      source: 'structural/typed-audit.json.gz',
      bytes: 963_461,
      sha256:
        'e9174bc686d74bc181550e54e8a05db1cc9e90cd4d964dac2c54bb525b291978',
      compression: 'gzip',
      destination:
        '.recovery-tmp/residue-audits/2.1.120-to-2.1.121.typed-audit.json',
      expandedBytes: 25_369_097,
      expandedSha256:
        '2126a6898cf52b4ad639c18d51dddd24d9adfd8df73470cf2ab4298700a66bf3',
    },
  ],
  sourceTrees: [
    {
      destination: '.recovery-tmp/semantic-trees/2.1.120/src',
      repositoryEnvironment: 'CLAUDE_CODE_2_1_120_REPOSITORY_ROOT',
    },
    {
      destination: '.recovery-tmp/semantic-trees/2.1.121/src',
      repositoryEnvironment: 'CLAUDE_CODE_2_1_121_REPOSITORY_ROOT',
    },
    {
      destination: 'src',
      repositoryEnvironment: 'CLAUDE_CODE_2_1_121_REPOSITORY_ROOT',
    },
  ],
  toolchainFiles: [
    {
      source: '.pixi/envs/default/bin/bun',
      destination: '.pixi/envs/default/bin/bun',
      bytes: 59_446_272,
      sha256:
        '6b4c3ee486bf5866a4d3830c5c5786b92717c2205619c2f144c17fa77017c425',
      mode: 0o755,
    },
    ...reviewedBunRuntimeLibraries,
    {
      source:
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      destination:
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      bytes: 9_143_423,
      sha256:
        '630f808ac32d968a49a392c42cc06fd72abd939aaa7edfe3302810c067934653',
      mode: 0o644,
    },
  ],
})
const SYSTEM_TEST_ENVIRONMENT_NAMES = new Set([
  'ComSpec',
  'HOME',
  'LANG',
  'LANGUAGE',
  'PATH',
  'PATHEXT',
  'SystemRoot',
  'TEMP',
  'TMP',
  'TMPDIR',
  'TZ',
  'USERPROFILE',
])

function usage() {
  console.error(
    'Usage: build-2.1.121-source-freeze.mjs ' +
      '--target-commit COMMIT --baseline-inner FILE --target-inner FILE ' +
      '--baseline-wrapper FILE --target-wrapper FILE ' +
      '[--allow-diff-check-sha256 HEX]',
  )
}

function parseArguments(argv) {
  const allowed = new Set([
    'allow-diff-check-sha256',
    'baseline-inner',
    'baseline-wrapper',
    'target-commit',
    'target-inner',
    'target-wrapper',
  ])
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const argument = argv[index]
    const value = argv[index + 1]
    if (!argument?.startsWith('--') || !allowed.has(argument.slice(2))) {
      throw new Error(`unknown argument: ${argument}`)
    }
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`missing value for ${argument}`)
    }
    const key = argument.slice(2)
    if (values[key] !== undefined) throw new Error(`duplicate ${argument}`)
    values[key] = value
  }
  return values
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function systemTestEnvironment(source) {
  return Object.fromEntries(
    Object.entries(source).filter(
      ([name]) =>
        SYSTEM_TEST_ENVIRONMENT_NAMES.has(name) || name.startsWith('LC_'),
    ),
  )
}

function compareText(left, right) {
  if (left === right) return 0
  return left < right ? -1 : 1
}

function relativeModuleSpecifiers(source) {
  const result = new Set()

  const moduleSpecifier = node => {
    if (node?.type === 'Literal' && typeof node.value === 'string') {
      return node.value
    }
    if (
      node?.type === 'TemplateLiteral' &&
      node.expressions.length === 0 &&
      node.quasis.length === 1
    ) {
      return node.quasis[0].value.cooked
    }
    return undefined
  }

  const add = node => {
    const specifier = moduleSpecifier(node)
    if (specifier?.startsWith('.')) result.add(specifier)
  }

  const visit = node => {
    if (!node || typeof node !== 'object') return
    switch (node.type) {
      case 'ImportDeclaration':
      case 'ExportAllDeclaration':
      case 'ExportNamedDeclaration':
      case 'ImportExpression':
        add(node.source)
        break
      case 'CallExpression':
        if (
          node.callee?.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments.length === 1
        ) {
          add(node.arguments[0])
        }
        break
      default:
        break
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === 'type' || key === 'start' || key === 'end') continue
      if (Array.isArray(child)) {
        for (const item of child) visit(item)
      } else {
        visit(child)
      }
    }
  }

  visit(
    parse(source, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    }),
  )
  return [...result].sort(compareText)
}

function relativeRuntimeFileSpecifiers(source) {
  const result = new Set()

  const literal = node => {
    if (node?.type === 'Literal' && typeof node.value === 'string') {
      return node.value
    }
    if (
      node?.type === 'TemplateLiteral' &&
      node.expressions.length === 0 &&
      node.quasis.length === 1
    ) {
      return node.quasis[0].value.cooked
    }
    return undefined
  }
  const isImportMetaUrl = node =>
    node?.type === 'MemberExpression' &&
    node.computed === false &&
    node.property?.type === 'Identifier' &&
    node.property.name === 'url' &&
    node.object?.type === 'MetaProperty' &&
    node.object.meta?.name === 'import' &&
    node.object.property?.name === 'meta'

  const visit = node => {
    if (!node || typeof node !== 'object') return
    if (
      node.type === 'NewExpression' &&
      node.callee?.type === 'Identifier' &&
      node.callee.name === 'URL' &&
      node.arguments.length === 2 &&
      isImportMetaUrl(node.arguments[1])
    ) {
      const specifier = literal(node.arguments[0])
      if (specifier?.startsWith('.')) result.add(specifier)
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === 'type' || key === 'start' || key === 'end') continue
      if (Array.isArray(child)) {
        for (const item of child) visit(item)
      } else {
        visit(child)
      }
    }
  }

  visit(
    parse(source, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    }),
  )
  return [...result].sort(compareText)
}

function repositoryRuntimeFilePaths(source) {
  const result = new Set()
  const visit = node => {
    if (!node || typeof node !== 'object') return
    const value =
      node.type === 'Literal' && typeof node.value === 'string'
        ? node.value
        : node.type === 'TemplateLiteral' &&
            node.expressions.length === 0 &&
            node.quasis.length === 1
          ? node.quasis[0].value.cooked
          : undefined
    if (
      value?.startsWith('recovery/') &&
      path.posix.normalize(value) === value &&
      !value.split('/').includes('..')
    ) {
      const filename = path.join(repo, ...value.split('/'))
      const status = lstatIfExists(filename, 'repository runtime literal')
      if (status?.isFile() && !status.isSymbolicLink()) result.add(value)
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === 'type' || key === 'start' || key === 'end') continue
      if (Array.isArray(child)) {
        for (const item of child) visit(item)
      } else {
        visit(child)
      }
    }
  }
  visit(
    parse(source, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    }),
  )
  return [...result].sort(compareText)
}

function dynamicRuntimeFilePaths(relative) {
  let files
  if (relative === 'recovery/test/late-semantic-source-coverage.test.mjs') {
    const lateCases = [
      '2.1.107-to-2.1.108',
      '2.1.108-to-2.1.109',
      '2.1.109-to-2.1.110',
      '2.1.110-to-2.1.111',
      '2.1.111-to-2.1.112',
      '2.1.112-to-2.1.113',
      '2.1.113-to-2.1.114',
      '2.1.114-to-2.1.116',
    ]
    files = lateCases.flatMap(caseName => [
      `recovery/cases/${caseName}/manifest.json`,
      `recovery/cases/${caseName}/semantic-supplement.patch`,
      `recovery/cases/${caseName}/semantic/claude-api-content.json`,
      `recovery/cases/${caseName}/semantic/dependency-coverage.json.gz`,
      `recovery/cases/${caseName}/semantic/source-coverage.json.gz`,
    ])
    files.push(
      'recovery/test/recovery-2.1.116-workload-identity-semantic.test.mjs',
    )
  } else if (
    relative ===
    'recovery/test/recovery-late-focused-residue-proof-helpers.mjs'
  ) {
    files = [
      'recovery/test/recovery-2.1.121-build-metadata-residue-proofs.json',
      'recovery/test/recovery-2.1.121-exact-owner-correction-proofs.json',
    ]
  } else {
    return []
  }
  const existing = []
  for (const candidate of files) {
    const filename = path.join(repo, ...candidate.split('/'))
    const status = lstatIfExists(filename, 'dynamic runtime dependency')
    if (status === null && candidate.endsWith('/semantic-supplement.patch')) {
      continue
    }
    assert(
      status?.isFile() && !status.isSymbolicLink(),
      `dynamic runtime dependency is not a real file: ${candidate}`,
    )
    existing.push(candidate)
  }
  return existing.sort(compareText)
}

function resolveRelativeModule(importer, specifier, label) {
  const dependencyUrl = new URL(specifier, pathToFileURL(importer))
  dependencyUrl.search = ''
  dependencyUrl.hash = ''
  const unresolved = fileURLToPath(dependencyUrl)
  const repository = path.resolve(repo)
  if (
    unresolved !== repository &&
    !unresolved.startsWith(`${repository}${path.sep}`)
  ) {
    throw new Error(`${label}: relative import escaped repository: ${specifier}`)
  }
  const candidates = [
    unresolved,
    `${unresolved}.js`,
    `${unresolved}.mjs`,
    `${unresolved}.cjs`,
    `${unresolved}.ts`,
    `${unresolved}.tsx`,
    path.join(unresolved, 'index.js'),
    path.join(unresolved, 'index.mjs'),
    path.join(unresolved, 'index.cjs'),
    path.join(unresolved, 'index.ts'),
    path.join(unresolved, 'index.tsx'),
  ]
  const matches = candidates.filter(candidate => {
    try {
      const status = fs.lstatSync(candidate)
      return status.isFile() && !status.isSymbolicLink()
    } catch {
      return false
    }
  })
  if (matches.length !== 1) {
    throw new Error(
      `${label}: relative import ${specifier} resolved to ${matches.length} files`,
    )
  }
  return matches[0]
}

function resolveRelativeRuntimeFile(importer, specifier, label) {
  const dependencyUrl = new URL(specifier, pathToFileURL(importer))
  dependencyUrl.search = ''
  dependencyUrl.hash = ''
  const filename = fileURLToPath(dependencyUrl)
  const relative = path.relative(repo, filename).split(path.sep).join('/')
  if (
    relative === '' ||
    relative.startsWith('../') ||
    !relative.startsWith('recovery/')
  ) {
    return null
  }
  const status = fs.lstatSync(filename)
  assert(
    status.isFile() && !status.isSymbolicLink(),
    `${label}: runtime file is not a real file: ${specifier}`,
  )
  return relative
}

function assertedRecoveryPaths(value) {
  const candidates = new Map()
  const visit = item => {
    if (!item || typeof item !== 'object') return
    if (
      !Array.isArray(item) &&
      typeof item.path === 'string' &&
      item.path.startsWith('recovery/') &&
      Number.isSafeInteger(item.bytes) &&
      item.bytes >= 0 &&
      typeof item.sha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(item.sha256)
    ) {
      const descriptors = candidates.get(item.path) ?? []
      descriptors.push({ bytes: item.bytes, sha256: item.sha256 })
      candidates.set(item.path, descriptors)
    }
    for (const child of Object.values(item)) visit(child)
  }
  visit(value)
  const result = []
  for (const [relative, descriptors] of candidates) {
    const filename = path.join(repo, ...relative.split('/'))
    const status = fs.lstatSync(filename)
    assert(
      status.isFile() && !status.isSymbolicLink(),
      `fixture recovery assertion is not a real file: ${relative}`,
    )
    const bytes = fs.readFileSync(filename)
    if (
      descriptors.some(
        descriptor =>
          descriptor.bytes === bytes.length &&
          descriptor.sha256 === sha256(bytes),
      )
    ) {
      result.push(relative)
    }
  }
  return result.sort(compareText)
}

function isJavaScriptRuntimeFile(relative) {
  return /\.(?:cjs|js|mjs)$/.test(relative)
}

function transitiveTestFiles(files) {
  const pending = [...files]
  const visited = new Set()
  while (pending.length > 0) {
    const relative = pending.pop()
    if (visited.has(relative)) continue
    visited.add(relative)
    const filename = path.join(repo, relative)
    if (relative.endsWith('.json')) {
      const fixture = JSON.parse(fs.readFileSync(filename, 'utf8'))
      pending.push(...assertedRecoveryPaths(fixture))
      continue
    }
    if (!isJavaScriptRuntimeFile(relative)) continue
    const source = fs.readFileSync(filename, 'utf8')
    for (const specifier of relativeModuleSpecifiers(source)) {
      const dependency = resolveRelativeModule(
        filename,
        specifier,
        `target test dependency ${relative}`,
      )
      pending.push(path.relative(repo, dependency).split(path.sep).join('/'))
    }
    for (const specifier of relativeRuntimeFileSpecifiers(source)) {
      const dependency = resolveRelativeRuntimeFile(
        filename,
        specifier,
        `target test runtime dependency ${relative}`,
      )
      if (dependency !== null) pending.push(dependency)
    }
    pending.push(...repositoryRuntimeFilePaths(source))
    pending.push(...dynamicRuntimeFilePaths(relative))
    if (relative.endsWith('.test.mjs')) {
      const companion = relative.replace(/\.test\.mjs$/, '.json')
      const companionFilename = path.join(repo, companion)
      if (fs.existsSync(companionFilename)) {
        const status = fs.lstatSync(companionFilename)
        assert(
          status.isFile() && !status.isSymbolicLink(),
          `target test companion is not a real file: ${companion}`,
        )
        pending.push(companion)
      }
    }
  }
  return [...visited].sort(compareText)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repo,
    encoding: options.encoding ?? 'utf8',
    env: options.env ?? process.env,
    maxBuffer: 128 * 1024 * 1024,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (${result.status})\n` +
        `${result.stdout ?? ''}${result.stderr ?? ''}`,
    )
  }
  return options.includeStderr
    ? `${result.stdout ?? ''}${result.stderr ?? ''}`
    : result.stdout
}

function git(args, options = {}) {
  return run('git', args, options)
}

function assertOutputRelative(relative) {
  assert(
    typeof relative === 'string' &&
      relative.startsWith(`${recoveredRelative}/`) &&
      path.posix.normalize(relative) === relative &&
      !relative.split('/').includes('..'),
    `unsafe staged output path: ${String(relative)}`,
  )
}

function stageOutput(outputs, relative, value) {
  assertOutputRelative(relative)
  assert(!outputs.has(relative), `duplicate staged output: ${relative}`)
  outputs.set(
    relative,
    Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(String(value)),
  )
}

function stageFreezeOutput(outputs, relative, value) {
  stageOutput(outputs, `${freezeRelative}/${relative}`, value)
}

function stagedMetadata(outputs, relative, rootRelative = '') {
  const value = outputs.get(relative)
  assert(value !== undefined, `missing staged output: ${relative}`)
  return {
    path: path.posix.relative(rootRelative, relative),
    bytes: value.length,
    sha256: sha256(value),
  }
}

function lstatIfExists(filename, label) {
  try {
    return fs.lstatSync(filename)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw new Error(`${label} is not accessible: ${filename}`, {
      cause: error,
    })
  }
}

function assertRealDirectory(directory, label) {
  const status = lstatIfExists(directory, label)
  assert(
    status !== null && status.isDirectory() && !status.isSymbolicLink(),
    `${label} is not a real directory: ${directory}`,
  )
}

function ensureRealChildDirectory(parent, name, label, createdDirectories) {
  assert(!name.includes(path.sep), `${label} has an unsafe name`)
  assertRealDirectory(parent, `${label} parent`)
  const directory = path.join(parent, name)
  let status = lstatIfExists(directory, label)
  if (status === null) {
    fs.mkdirSync(directory)
    createdDirectories.push(directory)
    status = fs.lstatSync(directory)
  }
  assert(
    status.isDirectory() && !status.isSymbolicLink(),
    `${label} is not a real directory: ${directory}`,
  )
  return directory
}

function publicationOrder(outputs) {
  const identityRelative = `${freezeRelative}/identity.json`
  const sumsRelative = `${freezeRelative}/SHA256SUMS`
  const freezeLeaves = [...outputs.keys()]
    .filter(
      relative =>
        relative.startsWith(`${freezeRelative}/`) &&
        relative !== identityRelative &&
        relative !== sumsRelative,
    )
    .sort(compareText)
  const expected = new Set([
    ...freezeLeaves,
    overlayRelative,
    lineageRelative,
    identityRelative,
    sumsRelative,
  ])
  assert(
    expected.size === outputs.size &&
      [...outputs.keys()].every(relative => expected.has(relative)),
    'invalid staged publication set',
  )

  // Publish the outer overlay before the lineage that authenticates it. The
  // identity and its checksum ledger are the final two commit markers.
  return [
    ...freezeLeaves,
    overlayRelative,
    lineageRelative,
    identityRelative,
    sumsRelative,
  ]
}

function publishStagedOutputs(outputs) {
  const transaction = crypto.randomBytes(12).toString('hex')
  const lockPath = path.join(caseRoot, '.source-freeze-publish.lock')
  const createdDirectories = []
  const prepared = []
  const published = []
  const cleanupErrors = []
  const preservedBackups = new Set()
  let lockDescriptor
  let failure = null
  let completed = false

  const captureCleanup = action => {
    try {
      action()
    } catch (error) {
      cleanupErrors.push(error)
    }
  }

  try {
    assertRealDirectory(caseRoot, 'source-freeze case root')
    lockDescriptor = fs.openSync(lockPath, 'wx', 0o600)
    fs.writeFileSync(lockDescriptor, `${process.pid}\n`)
    const recoveredDirectory = ensureRealChildDirectory(
      caseRoot,
      recoveredRelative,
      'source-freeze recovered root',
      createdDirectories,
    )
    const freezeDirectory = ensureRealChildDirectory(
      recoveredDirectory,
      'source-freeze',
      'source-freeze output root',
      createdDirectories,
    )
    const allowedFreezeEntries = new Set(
      [...outputs.keys()]
        .filter(relative => relative.startsWith(`${freezeRelative}/`))
        .map(relative => relative.slice(freezeRelative.length + 1)),
    )
    const unexpectedFreezeEntries = fs
      .readdirSync(freezeDirectory)
      .filter(name => !allowedFreezeEntries.has(name))
      .sort(compareText)
    assert(
      unexpectedFreezeEntries.length === 0,
      `unexpected existing source-freeze entries: ${unexpectedFreezeEntries.join(', ')}`,
    )

    for (const relative of publicationOrder(outputs)) {
      assertOutputRelative(relative)
      const value = outputs.get(relative)
      const filename = relative.startsWith(`${freezeRelative}/`)
        ? path.join(
            freezeDirectory,
            relative.slice(freezeRelative.length + 1),
          )
        : path.join(recoveredDirectory, path.posix.basename(relative))
      const parent = path.dirname(filename)
      assertRealDirectory(parent, `publication parent for ${relative}`)
      const existing = lstatIfExists(filename, `publication target ${relative}`)
      assert(
        existing === null ||
          (existing.isFile() && !existing.isSymbolicLink()),
        `publication target is not a real file: ${relative}`,
      )
      const temporary = path.join(
        parent,
        `.${path.basename(filename)}.${transaction}.tmp`,
      )
      const backup = path.join(
        parent,
        `.${path.basename(filename)}.${transaction}.bak`,
      )
      const record = {
        backup,
        existed: existing !== null,
        filename,
        relative,
        temporary,
      }
      prepared.push(record)
      fs.writeFileSync(temporary, value, { flag: 'wx' })
      if (existing !== null) {
        fs.copyFileSync(filename, backup, fs.constants.COPYFILE_EXCL)
      }
    }
    for (const record of prepared) {
      const { filename, relative, temporary } = record
      assertRealDirectory(
        path.dirname(filename),
        `publication commit parent for ${relative}`,
      )
      fs.renameSync(temporary, filename)
      published.push(record)
    }
    completed = true
  } catch (error) {
    failure = error
    for (const record of [...published].reverse()) {
      try {
        if (record.existed) {
          fs.renameSync(record.backup, record.filename)
        } else {
          fs.rmSync(record.filename, { force: true })
        }
      } catch (rollbackError) {
        if (record.existed) preservedBackups.add(record.backup)
        cleanupErrors.push(rollbackError)
      }
    }
  }

  for (const { backup, temporary } of prepared) {
    captureCleanup(() => fs.rmSync(temporary, { force: true }))
    if (!preservedBackups.has(backup)) {
      captureCleanup(() => fs.rmSync(backup, { force: true }))
    }
  }
  if (!completed) {
    for (const directory of [...createdDirectories].reverse()) {
      captureCleanup(() => fs.rmdirSync(directory))
    }
  }
  if (lockDescriptor !== undefined) {
    captureCleanup(() => fs.closeSync(lockDescriptor))
    captureCleanup(() => fs.rmSync(lockPath, { force: true }))
  }

  if (failure !== null) {
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [failure, ...cleanupErrors],
        'source-freeze publication failed and rollback was incomplete',
      )
    }
    throw failure
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      'source-freeze publication cleanup failed',
    )
  }
}

function metadata(filename, root = caseRoot) {
  const value = fs.readFileSync(filename)
  return {
    path: path.relative(root, filename).replaceAll('\\', '/'),
    bytes: value.length,
    sha256: sha256(value),
  }
}

function safeExistingFile(root, relative, label) {
  assertRealDirectory(root, `${label} root`)
  assert(
    typeof relative === 'string' &&
      relative.length > 0 &&
      !path.isAbsolute(relative) &&
      !relative.includes('\\'),
    `${label} has an unsafe relative path: ${String(relative)}`,
  )
  const parts = relative.split('/')
  assert(
    !parts.includes('') &&
      !parts.includes('.') &&
      !parts.includes('..'),
    `${label} has an unsafe relative path: ${relative}`,
  )
  let filename = path.resolve(root)
  for (const [index, part] of parts.entries()) {
    filename = path.join(filename, part)
    const status = lstatIfExists(filename, label)
    assert(status !== null, `${label} is not accessible: ${relative}`)
    assert(!status.isSymbolicLink(), `${label} traverses a symlink: ${relative}`)
    const final = index === parts.length - 1
    assert(
      final ? status.isFile() : status.isDirectory(),
      `${label} has an unexpected path component: ${relative}`,
    )
  }
  return filename
}

function walkFiles(root) {
  const pending = [root]
  const files = []
  while (pending.length > 0) {
    const directory = pending.pop()
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const filename = path.join(directory, entry.name)
      const status = fs.lstatSync(filename)
      assert(!status.isSymbolicLink(), `source symlink: ${filename}`)
      if (status.isDirectory()) pending.push(filename)
      else if (status.isFile()) files.push(filename)
      else throw new Error(`non-regular source entry: ${filename}`)
    }
  }
  return files.sort((left, right) => {
    const leftRelative = path.relative(root, left)
    const rightRelative = path.relative(root, right)
    if (leftRelative === rightRelative) return 0
    return leftRelative < rightRelative ? -1 : 1
  })
}

function summarizeSourceTree(sourceRoot) {
  const records = walkFiles(sourceRoot).map(filename => {
    const value = fs.readFileSync(filename)
    return {
      path: `src/${path.relative(sourceRoot, filename).replaceAll('\\', '/')}`,
      filename,
      bytes: value.length,
      sha256: sha256(value),
    }
  })
  const framed = crypto.createHash('sha256')
  let bytes = 0
  for (const record of records) {
    bytes += record.bytes
    framed
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
    manifestSha256: framed.digest('hex'),
    records,
  }
}

function publicSummary(summary) {
  return {
    files: summary.files,
    bytes: summary.bytes,
    manifestSha256: summary.manifestSha256,
  }
}

function assertTreesEqual(left, right, label) {
  assert(left.records.length === right.records.length, `${label}: file count`)
  for (let index = 0; index < left.records.length; index += 1) {
    const a = left.records[index]
    const b = right.records[index]
    assert(a.path === b.path, `${label}: path ${index}`)
    assert(a.bytes === b.bytes, `${label}: ${a.path} bytes`)
    assert(a.sha256 === b.sha256, `${label}: ${a.path} SHA-256`)
  }
}

function assertTreesByteEqual(left, right, label) {
  assertTreesEqual(left, right, label)
  for (let index = 0; index < left.records.length; index += 1) {
    const a = left.records[index]
    const b = right.records[index]
    assert(
      fs.readFileSync(a.filename).equals(fs.readFileSync(b.filename)),
      `${label}: ${a.path} differs byte-for-byte`,
    )
  }
}

function gitEndpoint(revision, label) {
  const commit = git(['rev-parse', `${revision}^{commit}`]).trim()
  const gitTree = git(['rev-parse', `${commit}^{tree}`]).trim()
  const srcGitTree = git(['rev-parse', `${commit}:src`]).trim()
  for (const [field, value] of Object.entries({ commit, gitTree, srcGitTree })) {
    assert(/^[a-f0-9]{40}$/.test(value), `${label} ${field}`)
  }
  return { commit, gitTree, srcGitTree }
}

function createVerifiedTestRepositories(
  temporaryRoot,
  declarations,
  baselineSource,
  targetSource,
) {
  const create = (name, endpoint, expectedSource) => {
    const gitDirectory = path.join(
      temporaryRoot,
      `verified-${name}-history.git`,
    )
    git(['init', '--bare', '--quiet', gitDirectory], { cwd: temporaryRoot })
    git(
      [
        `--git-dir=${gitDirectory}`,
        'fetch',
        '--quiet',
        '--no-tags',
        '--force',
        '--',
        repo,
        `${endpoint.commit}:refs/heads/authenticated`,
      ],
      { cwd: temporaryRoot },
    )
    for (const detached of endpoint.detachedCommits ?? []) {
      git(
        [
          `--git-dir=${gitDirectory}`,
          'fetch',
          '--quiet',
          '--no-tags',
          '--no-write-fetch-head',
          '--force',
          '--',
          repo,
          detached.commit,
        ],
        { cwd: temporaryRoot },
      )
    }
    const refs = git(
      [
        `--git-dir=${gitDirectory}`,
        'for-each-ref',
        '--format=%(refname) %(objectname)',
        'refs/',
      ],
      { cwd: temporaryRoot },
    ).trim()
    assert(
      refs === `refs/heads/authenticated ${endpoint.commit}`,
      `${name} test repository has unexpected refs: ${refs}`,
    )
    assert(
      !fs.existsSync(path.join(gitDirectory, 'objects/info/alternates')),
      `${name} test repository uses object alternates`,
    )
    const destination = path.join(
      temporaryRoot,
      `verified-${name}-repository`,
    )
    git(
      [
        `--git-dir=${gitDirectory}`,
        'worktree',
        'add',
        '--quiet',
        '--detach',
        destination,
        'refs/heads/authenticated',
      ],
      { cwd: temporaryRoot },
    )
    const actual = {
      commit: git(['rev-parse', '--verify', 'HEAD^{commit}'], {
        cwd: destination,
      }).trim(),
      gitTree: git(['rev-parse', '--verify', 'HEAD^{tree}'], {
        cwd: destination,
      }).trim(),
      srcGitTree: git(['rev-parse', '--verify', 'HEAD:src'], {
        cwd: destination,
      }).trim(),
    }
    assert(actual.commit === endpoint.commit, `${name} test repository commit`)
    assert(
      actual.gitTree === endpoint.gitTree,
      `${name} test repository tree`,
    )
    assert(
      actual.srcGitTree === endpoint.srcGitTree,
      `${name} test repository source tree`,
    )
    for (const [index, detached] of (
      endpoint.detachedCommits ?? []
    ).entries()) {
      const actualDetached = {
        commit: git(
          ['rev-parse', '--verify', `${detached.commit}^{commit}`],
          { cwd: destination },
        ).trim(),
        gitTree: git(
          ['rev-parse', '--verify', `${detached.commit}^{tree}`],
          { cwd: destination },
        ).trim(),
        srcGitTree: git(
          ['rev-parse', '--verify', `${detached.commit}:src`],
          { cwd: destination },
        ).trim(),
      }
      assert(
        JSON.stringify(actualDetached) === JSON.stringify(detached),
        `${name} detached test repository identity ${index + 1}`,
      )
    }
    const reachableObjects = git(
      [
        'rev-list',
        '--objects',
        '--no-object-names',
        endpoint.commit,
        ...(endpoint.detachedCommits ?? []).map(item => item.commit),
      ],
      { cwd: destination },
    )
      .trim()
      .split('\n')
      .filter(Boolean)
      .sort(compareText)
    const storedObjects = git(
      [
        'cat-file',
        '--batch-all-objects',
        '--batch-check=%(objectname)',
      ],
      { cwd: destination },
    )
      .trim()
      .split('\n')
      .filter(Boolean)
      .sort(compareText)
    assert(
      storedObjects.join('\n') === reachableObjects.join('\n'),
      `${name} test repository has objects outside authenticated reachability`,
    )
    assertTreesByteEqual(
      expectedSource,
      summarizeSourceTree(path.join(destination, 'src')),
      `${name} test repository source`,
    )
    assert(
      git(['status', '--porcelain=v1', '--untracked-files=all'], {
        cwd: destination,
      }) === '',
      `${name} test repository is not clean`,
    )
    return destination
  }

  const baseline = create('baseline', declarations.baseline, baselineSource)
  const target = create('target', declarations.target, targetSource)
  git([
    'merge-base',
    '--is-ancestor',
    declarations.baseline.commit,
    declarations.target.commit,
  ])
  return { baseline, target }
}

function createBuilderTestSandbox(
  temporaryRoot,
  testFileAssertions,
  verifiedRepositories,
  authenticatedArtifacts,
) {
  const sandboxRoot = verifiedRepositories.target
  const temporaryPrefix = `${path.resolve(temporaryRoot)}${path.sep}`
  assert(
    path.resolve(sandboxRoot).startsWith(temporaryPrefix),
    'test sandbox carrier escaped temporary root',
  )
  const gitMarker = lstatIfExists(
    path.join(sandboxRoot, '.git'),
    'test sandbox Git marker',
  )
  assert(
    gitMarker?.isFile() && !gitMarker.isSymbolicLink(),
    'test sandbox Git marker is not a real file',
  )
  assertRealDirectory(path.join(sandboxRoot, 'src'), 'test sandbox source root')
  for (const entry of fs.readdirSync(sandboxRoot).sort(compareText)) {
    if (entry === '.git' || entry === 'src') continue
    fs.rmSync(path.join(sandboxRoot, entry), { recursive: true, force: true })
  }
  assert(
    fs.readdirSync(sandboxRoot).sort(compareText).join(',') === '.git,src',
    'test sandbox pruned carrier entries',
  )
  const staged = new Map()
  const stage = (relative, value, label, mode = null) => {
    const parts = relative.split('/')
    assert(
      typeof relative === 'string' &&
        relative.length > 0 &&
        !path.isAbsolute(relative) &&
        !relative.includes('\\') &&
        !parts.includes('') &&
        !parts.includes('.') &&
        !parts.includes('..'),
      `${label} has an unsafe destination: ${String(relative)}`,
    )
    const digest = sha256(value)
    const prior = staged.get(relative)
    if (prior !== undefined) {
      assert(
        prior.bytes === value.length &&
          prior.sha256 === digest &&
          (mode === null || prior.mode === mode),
        `${label} conflicts with staged ${relative}`,
      )
      return
    }
    let parent = sandboxRoot
    for (const part of parts.slice(0, -1)) {
      const child = path.join(parent, part)
      const status = lstatIfExists(child, `${label} destination directory`)
      if (status === null) fs.mkdirSync(child)
      else {
        assert(
          status.isDirectory() && !status.isSymbolicLink(),
          `${label} destination directory is not real: ${relative}`,
        )
      }
      parent = child
    }
    const filename = path.join(parent, parts.at(-1))
    const existing = lstatIfExists(filename, label)
    if (existing !== null) {
      assert(
        existing.isFile() && !existing.isSymbolicLink(),
        `${label} existing destination is not regular: ${relative}`,
      )
      assert(
        fs.readFileSync(filename).equals(value),
        `${label} destination conflicts: ${relative}`,
      )
      const existingMode = fs.statSync(filename).mode & 0o777
      assert(
        mode === null || existingMode === mode,
        `${label} destination mode conflicts: ${relative}`,
      )
      staged.set(relative, {
        bytes: value.length,
        sha256: digest,
        mode: existingMode,
      })
      return
    }
    fs.writeFileSync(
      filename,
      value,
      mode === null ? { flag: 'wx' } : { flag: 'wx', mode },
    )
    const status = fs.lstatSync(filename)
    assert(
      status.isFile() && !status.isSymbolicLink(),
      `${label} staged file is not regular: ${relative}`,
    )
    if (mode !== null) fs.chmodSync(filename, mode)
    const stagedMode = fs.statSync(filename).mode & 0o777
    assert(
      mode === null || stagedMode === mode,
      `${label} staged mode differs: ${relative}`,
    )
    staged.set(relative, {
      bytes: value.length,
      sha256: digest,
      mode: stagedMode,
    })
  }

  for (const [index, assertion] of testFileAssertions.entries()) {
    const filename = safeExistingFile(
      repo,
      assertion.path,
      `test sandbox assertion ${index + 1}`,
    )
    const value = fs.readFileSync(filename)
    assert(value.length === assertion.bytes, `${assertion.path}: byte length`)
    assert(sha256(value) === assertion.sha256, `${assertion.path}: SHA-256`)
    stage(assertion.path, value, `test sandbox assertion ${index + 1}`)
  }

  const repositoriesByEnvironment = new Map([
    ['CLAUDE_CODE_2_1_120_REPOSITORY_ROOT', verifiedRepositories.baseline],
    ['CLAUDE_CODE_2_1_121_REPOSITORY_ROOT', verifiedRepositories.target],
  ])
  const sourceTrees = []
  for (const [index, descriptor] of reviewedTestSandbox.sourceTrees.entries()) {
    const repository = repositoriesByEnvironment.get(
      descriptor.repositoryEnvironment,
    )
    assert(
      repository !== undefined,
      `test sandbox source tree ${index + 1} repository environment`,
    )
    const summary = summarizeSourceTree(path.join(repository, 'src'))
    for (const record of summary.records) {
      stage(
        `${descriptor.destination}/${record.path.slice('src/'.length)}`,
        fs.readFileSync(record.filename),
        `test sandbox source tree ${index + 1}`,
      )
    }
    sourceTrees.push({ ...descriptor, ...publicSummary(summary) })
  }

  const legacyArtifacts = []
  for (const [index, descriptor] of reviewedTestSandbox.legacyArtifacts.entries()) {
    const filename = authenticatedArtifacts[descriptor.artifact]
    assert(filename !== undefined, `test sandbox artifact ${descriptor.artifact}`)
    const value = fs.readFileSync(filename)
    stage(
      descriptor.destination,
      value,
      `test sandbox legacy artifact ${index + 1}`,
    )
    legacyArtifacts.push({
      ...descriptor,
      bytes: value.length,
      sha256: sha256(value),
    })
  }

  const expandedFiles = []
  for (const [index, descriptor] of reviewedTestSandbox.expandedFiles.entries()) {
    const filename = safeExistingFile(
      caseRoot,
      descriptor.source,
      `test sandbox compressed input ${index + 1}`,
    )
    const compressed = fs.readFileSync(filename)
    assert(compressed.length === descriptor.bytes, `${descriptor.source}: byte length`)
    assert(sha256(compressed) === descriptor.sha256, `${descriptor.source}: SHA-256`)
    const expanded = gunzipSync(compressed)
    assert(
      expanded.length === descriptor.expandedBytes,
      `${descriptor.source}: expanded byte length`,
    )
    assert(
      sha256(expanded) === descriptor.expandedSha256,
      `${descriptor.source}: expanded SHA-256`,
    )
    stage(
      descriptor.destination,
      expanded,
      `test sandbox expanded input ${index + 1}`,
    )
    expandedFiles.push({ ...descriptor, verified: true })
  }

  const toolchainFiles = []
  for (const [index, descriptor] of reviewedTestSandbox.toolchainFiles.entries()) {
    const filename = safeExistingFile(
      repo,
      descriptor.source,
      `test sandbox toolchain input ${index + 1}`,
    )
    const value = fs.readFileSync(filename)
    assert(value.length === descriptor.bytes, `${descriptor.source}: byte length`)
    assert(sha256(value) === descriptor.sha256, `${descriptor.source}: SHA-256`)
    assert(
      (fs.statSync(filename).mode & 0o777) === descriptor.mode,
      `${descriptor.source}: mode`,
    )
    stage(
      descriptor.destination,
      value,
      `test sandbox toolchain input ${index + 1}`,
      descriptor.mode,
    )
    toolchainFiles.push({ ...descriptor, verified: true })
  }

  let bytes = 0
  for (const record of staged.values()) bytes += record.bytes
  return {
    repositoryRoot: sandboxRoot,
    report: {
      schemaVersion: reviewedTestSandbox.schemaVersion,
      files: staged.size,
      bytes,
      legacyArtifacts,
      expandedFiles,
      sourceTrees,
      toolchainFiles,
      symlinks: 0,
    },
  }
}

function extractRevision(revision, destination, archivePath) {
  fs.mkdirSync(destination)
  git(['archive', '--format=tar', `--output=${archivePath}`, revision, 'src'])
  run('tar', ['-xf', archivePath, '-C', destination])
  fs.rmSync(archivePath)
}

function testManifest(files) {
  return `${files
    .map(relative => `${sha256(fs.readFileSync(path.join(repo, relative)))}  ${relative}`)
    .join('\n')}\n`
}

function bundle(filename, bytes, digest, label) {
  const value = fs.readFileSync(filename)
  assert(value.length === bytes, `${label}: byte length`)
  assert(sha256(value) === digest, `${label}: SHA-256`)
  return path.resolve(filename)
}

function authenticatedRetainedTests() {
  const retainedCaseRoot = path.join(
    repo,
    'recovery/cases/2.1.119-to-2.1.120',
  )
  const retainedManifestValue = fs.readFileSync(
    path.join(retainedCaseRoot, 'manifest.json'),
  )
  assert(
    retainedManifestValue.length === retainedManifestIdentity.bytes,
    'retained T120 manifest byte length',
  )
  assert(
    sha256(retainedManifestValue) === retainedManifestIdentity.sha256,
    'retained T120 manifest SHA-256',
  )
  const retainedManifest = JSON.parse(retainedManifestValue)
  assert(
    retainedManifest.case === '2.1.119-to-2.1.120',
    'retained T120 manifest case',
  )
  assert(
    retainedManifest.finalization?.status === 'complete',
    'retained T120 manifest finalization',
  )
  const recoveredLineage = JSON.parse(
    fs.readFileSync(
      path.join(retainedCaseRoot, 'recovered/source-lineage-core.json'),
      'utf8',
    ),
  )
  assert(
    isDeepStrictEqual(retainedManifest.sourceLineage, recoveredLineage),
    'retained T120 embedded and recovered source lineage',
  )
  assert(
    Array.isArray(recoveredLineage.testFiles) &&
      recoveredLineage.testFiles.length > 0,
    'retained T120 test files',
  )
  return recoveredLineage.testFiles
}

function testSummary(stdout) {
  const read = label => {
    const matches = [
      ...stdout.matchAll(
        new RegExp(`^[ \\t]*(?:ℹ|#) ${label} (\\d+)\\r?$`, 'gm'),
      ),
    ]
    assert(matches.length > 0, `test output has no ${label} summary`)
    return Number(matches.at(-1)[1])
  }
  const summary = {
    tests: read('tests'),
    passed: read('pass'),
    failed: read('fail'),
    skipped: read('skipped'),
  }
  assert(
    summary.passed + summary.failed + summary.skipped === summary.tests,
    'test output summary arithmetic',
  )
  return summary
}

function main() {
  const args = parseArguments(process.argv.slice(2))
  for (const required of [
    'target-commit',
    'baseline-inner',
    'target-inner',
    'baseline-wrapper',
    'target-wrapper',
  ]) {
    if (args[required] === undefined) {
      usage()
      process.exitCode = 2
      return
    }
  }

  const baseCommit = git(['rev-parse', `${baseRevision}^{commit}`]).trim()
  const targetCommit = git([
    'rev-parse',
    `${args['target-commit']}^{commit}`,
  ]).trim()
  assert(/^[a-f0-9]{40}$/.test(targetCommit), 'target commit identity')
  const baseGitIdentity = gitEndpoint(baseCommit, 'lineage base')
  const targetGitIdentity = gitEndpoint(targetCommit, 'lineage target')
  const targetTestGitIdentity = gitEndpoint(
    targetTestRevision,
    'target semantic-test repository',
  )
  const targetDetachedTestIdentities = targetDetachedTestRevisions.map(
    (revision, index) =>
      gitEndpoint(revision, `target detached semantic-test commit ${index + 1}`),
  )
  assert(
    baseGitIdentity.commit === baseCommit,
    'lineage base commit resolution',
  )
  assert(
    targetGitIdentity.commit === targetCommit,
    'lineage target commit resolution',
  )
  assert(
    targetTestGitIdentity.commit === targetTestRevision,
    'target semantic-test commit resolution',
  )
  assert(
    targetTestGitIdentity.srcGitTree === targetGitIdentity.srcGitTree,
    'target semantic-test source tree versus lineage target',
  )
  git(['merge-base', '--is-ancestor', baseCommit, targetTestRevision])
  const testGitRepositories = {
    CLAUDE_CODE_2_1_120_REPOSITORY_ROOT: { ...baseGitIdentity },
    CLAUDE_CODE_2_1_121_REPOSITORY_ROOT: {
      ...targetTestGitIdentity,
      detachedCommits: targetDetachedTestIdentities,
    },
  }
  run('git', ['diff', '--quiet', targetCommit, '--', 'src'])
  const untrackedSource = git(['ls-files', '--others', '--', 'src']).trim()
  assert(
    untrackedSource.length === 0,
    `repository has untracked source paths:\n${untrackedSource}`,
  )

  const baselineInner = bundle(
    args['baseline-inner'],
    13_784_743,
    'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f',
    '2.1.120 inner bundle',
  )
  const targetInner = bundle(
    args['target-inner'],
    13_908_188,
    '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
    '2.1.121 inner bundle',
  )
  const baselineWrapper = bundle(
    args['baseline-wrapper'],
    13_784_833,
    '280754b3db23901e986711f11dc74536da9669c43f61999b4a84e2cf76cf1e83',
    '2.1.120 wrapper bundle',
  )
  const targetWrapper = bundle(
    args['target-wrapper'],
    13_908_278,
    '885f3342ff45bb4258517a4dc0f8405bbe2817f237d6b8b2fe4429694ecbe9c2',
    '2.1.121 wrapper bundle',
  )

  const overlay = git(
    [
      'diff',
      '--binary',
      '--full-index',
      '--no-ext-diff',
      '--no-renames',
      baseCommit,
      targetCommit,
      '--',
      'src',
    ],
    { encoding: 'buffer' },
  )
  assert(overlay.length > 0, 'source overlay is empty')
  const stagedOutputs = new Map()
  stageOutput(stagedOutputs, overlayRelative, overlay)
  stageOutput(stagedOutputs, freezeOverlayRelative, overlay)

  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'claude-2.1.121-source-freeze-'),
  )
  let baseSummary
  let targetSummary
  try {
    const validationOverlayPath = path.join(
      temporaryRoot,
      'source-facing-overlay.patch',
    )
    fs.writeFileSync(validationOverlayPath, overlay)
    const baseWorkspace = path.join(temporaryRoot, 'base')
    const targetWorkspace = path.join(temporaryRoot, 'target')
    const reverseWorkspace = path.join(temporaryRoot, 'reverse')
    extractRevision(
      baseCommit,
      baseWorkspace,
      path.join(temporaryRoot, 'base.tar'),
    )
    extractRevision(
      targetCommit,
      targetWorkspace,
      path.join(temporaryRoot, 'target.tar'),
    )
    baseSummary = summarizeSourceTree(path.join(baseWorkspace, 'src'))
    targetSummary = summarizeSourceTree(path.join(targetWorkspace, 'src'))
    assertTreesEqual(
      targetSummary,
      summarizeSourceTree(path.join(repo, 'src')),
      'target commit versus repository',
    )

    git(['apply', '--check', validationOverlayPath], { cwd: baseWorkspace })
    git(['apply', validationOverlayPath], { cwd: baseWorkspace })
    assertTreesEqual(
      targetSummary,
      summarizeSourceTree(path.join(baseWorkspace, 'src')),
      'forward-applied overlay versus target',
    )
    fs.cpSync(targetWorkspace, reverseWorkspace, { recursive: true })
    git(['apply', '--reverse', '--check', validationOverlayPath], {
      cwd: reverseWorkspace,
    })
    git(['apply', '--reverse', validationOverlayPath], {
      cwd: reverseWorkspace,
    })
    assertTreesEqual(
      baseSummary,
      summarizeSourceTree(path.join(reverseWorkspace, 'src')),
      'reverse-applied overlay versus base',
    )
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }

  const nameStatus = git([
    'diff',
    '--name-status',
    '--no-renames',
    baseCommit,
    targetCommit,
    '--',
    'src',
  ])
  const changed = nameStatus
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [status, sourcePath] = line.split('\t')
      assert(['A', 'M', 'D'].includes(status), `unsupported status: ${line}`)
      return { status, path: sourcePath }
    })
  assert(changed.length > 0, 'no changed source paths')
  const baseByPath = new Map(baseSummary.records.map(row => [row.path, row]))
  const targetByPath = new Map(targetSummary.records.map(row => [row.path, row]))
  const changedFiles = changed.map(entry => ({
    ...entry,
    base: baseByPath.has(entry.path)
      ? {
          bytes: baseByPath.get(entry.path).bytes,
          sha256: baseByPath.get(entry.path).sha256,
        }
      : null,
    target: targetByPath.has(entry.path)
      ? {
          bytes: targetByPath.get(entry.path).bytes,
          sha256: targetByPath.get(entry.path).sha256,
        }
      : null,
  }))

  const numstat = git([
    'diff',
    '--numstat',
    '--no-renames',
    baseCommit,
    targetCommit,
    '--',
    'src',
  ])
  const numberRows = numstat
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [insertions, deletions, sourcePath] = line.split('\t')
      assert(/^\d+$/.test(insertions) && /^\d+$/.test(deletions), line)
      return {
        path: sourcePath,
        insertions: Number(insertions),
        deletions: Number(deletions),
      }
    })
  assert(numberRows.length === changed.length, 'numstat path count')

  const sourceDiffCheck = spawnSync(
    'git',
    ['diff', '--check', baseCommit, targetCommit, '--', 'src'],
    { cwd: repo, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
  )
  assert(sourceDiffCheck.status === 0, 'source git diff --check status')
  const sourceDiffCheckRaw =
    `${sourceDiffCheck.stdout ?? ''}${sourceDiffCheck.stderr ?? ''}`
  assert(sourceDiffCheckRaw.length === 0, 'source git diff --check diagnostics')

  const diffCheck = spawnSync(
    'git',
    ['diff', '--check', baseCommit, targetCommit],
    { cwd: repo, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
  )
  assert([0, 2].includes(diffCheck.status), 'git diff --check status')
  const diffCheckRaw = `${diffCheck.stdout ?? ''}${diffCheck.stderr ?? ''}`
  const diagnosticLines = diffCheckRaw.split('\n').filter(Boolean).length
  const diffCheckSha256 = sha256(Buffer.from(diffCheckRaw))
  if (diagnosticLines > 0) {
    assert(
      args['allow-diff-check-sha256'] === diffCheckSha256,
      `git diff --check produced ${diagnosticLines} lines; review and rerun ` +
        `with --allow-diff-check-sha256 ${diffCheckSha256}`,
    )
  } else {
    assert(
      args['allow-diff-check-sha256'] === undefined,
      'diff-check allowlist supplied but output is empty',
    )
  }

  const testFileAssertions = transitiveTestFiles(targetTests).map(relative =>
    metadata(path.join(repo, relative), repo),
  )

  const testRepositoryTemporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'claude-2.1.121-test-repositories-'),
  )
  let tests
  let testSandboxReport
  try {
    const testBaselineWorkspace = path.join(
      testRepositoryTemporaryRoot,
      'authenticated-baseline-source',
    )
    extractRevision(
      baseCommit,
      testBaselineWorkspace,
      path.join(testRepositoryTemporaryRoot, 'baseline.tar'),
    )
    const testBaselineSource = summarizeSourceTree(
      path.join(testBaselineWorkspace, 'src'),
    )
    assertTreesEqual(
      baseSummary,
      testBaselineSource,
      'test baseline versus authenticated base',
    )
    const testTargetSource = summarizeSourceTree(path.join(repo, 'src'))
    assertTreesEqual(
      targetSummary,
      testTargetSource,
      'test target versus authenticated target',
    )
    const verifiedTestRepositories = createVerifiedTestRepositories(
      testRepositoryTemporaryRoot,
      {
        baseline:
          testGitRepositories.CLAUDE_CODE_2_1_120_REPOSITORY_ROOT,
        target: testGitRepositories.CLAUDE_CODE_2_1_121_REPOSITORY_ROOT,
      },
      testBaselineSource,
      testTargetSource,
    )
    const testBaselineSourceRoot = path.join(
      verifiedTestRepositories.baseline,
      'src',
    )
    const testTargetSourceRoot = path.join(
      verifiedTestRepositories.target,
      'src',
    )
    const testSandbox = createBuilderTestSandbox(
      testRepositoryTemporaryRoot,
      testFileAssertions,
      verifiedTestRepositories,
      {
        baselineAnalyzableBundle: baselineInner,
        targetAnalyzableBundle: targetInner,
      },
    )
    testSandboxReport = testSandbox.report
    const testEnvironment = {
      ...systemTestEnvironment(process.env),
      CLAUDE_CODE_2_1_120_BUNDLE: baselineInner,
      CLAUDE_CODE_2_1_121_BUNDLE: targetInner,
      CLAUDE_CODE_2_1_120_INNER_BUNDLE: baselineInner,
      CLAUDE_CODE_2_1_121_INNER_BUNDLE: targetInner,
      CLAUDE_2_1_120_CLI_INNER: baselineInner,
      CLAUDE_2_1_121_CLI_INNER: targetInner,
      CLAUDE_CODE_2_1_120_WRAPPER: baselineWrapper,
      CLAUDE_CODE_2_1_121_WRAPPER: targetWrapper,
      CLAUDE_CODE_SEMANTIC_CASE: '2.1.120-to-2.1.121',
      CLAUDE_CODE_SEMANTIC_SOURCE_ROOT: testTargetSourceRoot,
      CLAUDE_CODE_2_1_120_SOURCE_ROOT: testBaselineSourceRoot,
      CLAUDE_CODE_2_1_121_SOURCE_ROOT: testTargetSourceRoot,
      CLAUDE_CODE_DIRECT_EVIDENCE_SOURCE_ROOT: testTargetSourceRoot,
      CLAUDE_CODE_2_1_120_REPOSITORY_ROOT:
        verifiedTestRepositories.baseline,
      CLAUDE_CODE_2_1_121_REPOSITORY_ROOT: verifiedTestRepositories.target,
    }
    tests = run(process.execPath, ['--test', ...targetTests], {
      cwd: testSandbox.repositoryRoot,
      env: testEnvironment,
      includeStderr: true,
    })
  } finally {
    fs.rmSync(testRepositoryTemporaryRoot, { recursive: true, force: true })
  }
  const testsVerified = testSummary(tests)
  const observedTargetTestExecution = {
    ...testsVerified,
    files: targetTests.length,
  }
  assert(
    JSON.stringify(observedTargetTestExecution) ===
      JSON.stringify(reviewedTargetTestExecution),
    'target test execution differs from reviewed 480/466/0/14 across 103 roots',
  )

  const syntaxCheck = changed
    .map(entry => entry.path)
    .filter(sourcePath =>
      targetByPath.has(sourcePath) && /\.(?:ts|tsx)$/.test(sourcePath),
    )
  const syntaxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-2.1.121-syntax-'))
  try {
    for (const [index, sourcePath] of syntaxCheck.entries()) {
      run(
        'bun',
        [
          'build',
          path.join(repo, sourcePath),
          '--target=bun',
          '--external=*',
          `--outfile=${path.join(syntaxRoot, `${index}.js`)}`,
        ],
      )
    }
  } finally {
    fs.rmSync(syntaxRoot, { recursive: true, force: true })
  }

  const retainedTests = authenticatedRetainedTests()
  const directMetadata = metadata(directEvidencePath, repo)
  const directTestMetadata = metadata(
    path.join(repo, 'recovery/test/recovery-2.1.121-direct-evidence.test.mjs'),
    repo,
  )
  stageFreezeOutput(stagedOutputs, 'source-paths.txt', nameStatus)
  stageFreezeOutput(stagedOutputs, 'source-numstat.tsv', numstat)
  stageFreezeOutput(
    stagedOutputs,
    'source-stat.txt',
    git([
      'diff',
      '--stat',
      '--no-renames',
      baseCommit,
      targetCommit,
      '--',
      'src',
    ]),
  )
  stageFreezeOutput(
    stagedOutputs,
    'source-files.sha256',
    `${targetSummary.records
      .map(record => `${record.sha256}  ${record.path}`)
      .join('\n')}\n`,
  )
  stageFreezeOutput(stagedOutputs, 'source-symlinks.txt', '')
  stageFreezeOutput(
    stagedOutputs,
    'target-test-files.sha256',
    testManifest(targetTests),
  )
  stageFreezeOutput(
    stagedOutputs,
    'retained-test-files.sha256',
    testManifest(retainedTests),
  )
  stageFreezeOutput(
    stagedOutputs,
    'adjacent-direct-evidence.sha256',
    `${directMetadata.sha256}  ${directMetadata.path}\n`,
  )
  stageFreezeOutput(stagedOutputs, 'diff-check.raw.txt', diffCheckRaw)
  stageFreezeOutput(
    stagedOutputs,
    'diff-check-allowlist.txt',
    diagnosticLines === 0
      ? 'unexpected diagnostics: 0\n'
      : `reviewed exact git diff --check output: ${diagnosticLines} line(s)\n` +
          `sha256: ${diffCheckSha256}\n`,
  )
  stageFreezeOutput(
    stagedOutputs,
    'applied-src-byte-compare.txt',
    'identical\n',
  )
  stageFreezeOutput(
    stagedOutputs,
    'forward-src-byte-compare.txt',
    'identical\n',
  )

  const patchStats = {
    files: changed.length,
    modified: changed.filter(entry => entry.status === 'M').length,
    added: changed.filter(entry => entry.status === 'A').length,
    deleted: changed.filter(entry => entry.status === 'D').length,
    insertions: numberRows.reduce((sum, entry) => sum + entry.insertions, 0),
    deletions: numberRows.reduce((sum, entry) => sum + entry.deletions, 0),
  }
  const overlayMetadata = stagedMetadata(stagedOutputs, overlayRelative)
  const targetTestManifest = stagedMetadata(
    stagedOutputs,
    `${freezeRelative}/target-test-files.sha256`,
    freezeRelative,
  )
  const retainedTestManifest = stagedMetadata(
    stagedOutputs,
    `${freezeRelative}/retained-test-files.sha256`,
    freezeRelative,
  )
  const directManifest = stagedMetadata(
    stagedOutputs,
    `${freezeRelative}/adjacent-direct-evidence.sha256`,
    freezeRelative,
  )
  const identity = {
    schemaVersion: 1,
    case: '2.1.120-to-2.1.121',
    kind: 'authenticated-source-overlay-freeze',
    base: {
      commit: baseCommit,
      tree: baseGitIdentity.gitTree,
      srcTree: baseGitIdentity.srcGitTree,
      bundleSha256:
        'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f',
    },
    target: {
      commit: targetCommit,
      tree: targetGitIdentity.gitTree,
      srcTree: targetGitIdentity.srcGitTree,
      bundleSha256:
        '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
    },
    overlay: {
      path: 'source-facing-overlay.patch',
      bytes: overlayMetadata.bytes,
      sha256: overlayMetadata.sha256,
      lines: overlay.toString('utf8').split('\n').length - 1,
      changedPaths: changed.length,
      insertions: patchStats.insertions,
      deletions: patchStats.deletions,
    },
    source: {
      files: targetSummary.files,
      bytes: targetSummary.bytes,
      symlinks: 0,
    },
    verification: {
      applyToBaseTree: true,
      completeSrcByteCompare: true,
      reverseToBaseTree: true,
      forwardToTargetTree: true,
      diffCheck: {
        scope: 'full-target-tree',
        sourceDiagnosticLines: 0,
        diagnosticLines,
        sha256: diffCheckSha256,
        reviewed: true,
      },
      targetTests: {
        ...testsVerified,
        files: targetTests.length,
        manifest: targetTestManifest.path,
        manifestSha256: targetTestManifest.sha256,
      },
      retainedTests: {
        files: retainedTests.length,
        manifest: retainedTestManifest.path,
        manifestSha256: retainedTestManifest.sha256,
      },
      syntaxBuilds: { passed: syntaxCheck.length, failed: 0 },
      adjacentDirectEvidence: {
        catalog: directMetadata,
        test: directTestMetadata,
        manifest: directManifest.path,
        manifestSha256: directManifest.sha256,
      },
    },
  }
  stageFreezeOutput(
    stagedOutputs,
    'identity.json',
    `${JSON.stringify(identity, null, 2)}\n`,
  )

  const sumPaths = [
    'source-facing-overlay.patch',
    'source-paths.txt',
    'source-stat.txt',
    'source-numstat.tsv',
    'source-files.sha256',
    'source-symlinks.txt',
    'target-test-files.sha256',
    'retained-test-files.sha256',
    'adjacent-direct-evidence.sha256',
    'diff-check.raw.txt',
    'diff-check-allowlist.txt',
    'applied-src-byte-compare.txt',
    'forward-src-byte-compare.txt',
    'identity.json',
  ]
  stageFreezeOutput(
    stagedOutputs,
    'SHA256SUMS',
    `${sumPaths
      .map(relative =>
        `${stagedMetadata(
          stagedOutputs,
          `${freezeRelative}/${relative}`,
          freezeRelative,
        ).sha256}  ${relative}`,
      )
      .join('\n')}\n`,
  )

  const sourceLineage = {
    root: 'src',
    baseCommit,
    baseGitTree: identity.base.tree,
    baseSrcGitTree: identity.base.srcTree,
    targetCommit,
    targetGitTree: identity.target.tree,
    targetSrcGitTree: identity.target.srcTree,
    testGitRepositories,
    testSandbox: reviewedTestSandbox,
    patchSet: '2.1.120-to-2.1.121-incremental',
    patchOrder: ['recovered/source-facing-overlay.patch'],
    patchStats,
    patch: overlayMetadata,
    base: publicSummary(baseSummary),
    target: publicSummary(targetSummary),
    changedFiles,
    syntaxCheck,
    testFiles: targetTests,
    testArtifactEnvironment: {
      CLAUDE_CODE_2_1_120_BUNDLE: 'baselineAnalyzableBundle',
      CLAUDE_CODE_2_1_121_BUNDLE: 'targetAnalyzableBundle',
      CLAUDE_CODE_2_1_120_INNER_BUNDLE: 'baselineAnalyzableBundle',
      CLAUDE_CODE_2_1_121_INNER_BUNDLE: 'targetAnalyzableBundle',
      CLAUDE_2_1_120_CLI_INNER: 'baselineAnalyzableBundle',
      CLAUDE_2_1_121_CLI_INNER: 'targetAnalyzableBundle',
      CLAUDE_CODE_2_1_120_WRAPPER: 'baselineBundle',
      CLAUDE_CODE_2_1_121_WRAPPER: 'targetBundle',
    },
    testFileAssertions,
  }
  stageOutput(
    stagedOutputs,
    lineageRelative,
    `${JSON.stringify(sourceLineage, null, 2)}\n`,
  )

  const expectedStagedOutputs = [
    overlayRelative,
    lineageRelative,
    ...[...sumPaths, 'SHA256SUMS'].map(
      relative => `${freezeRelative}/${relative}`,
    ),
  ].sort(compareText)
  assert(
    JSON.stringify([...stagedOutputs.keys()].sort(compareText)) ===
      JSON.stringify(expectedStagedOutputs),
    'staged source-freeze output set',
  )
  const identityMetadata = stagedMetadata(
    stagedOutputs,
    `${freezeRelative}/identity.json`,
  )
  const sourceLineageMetadata = stagedMetadata(
    stagedOutputs,
    lineageRelative,
  )
  publishStagedOutputs(stagedOutputs)

  console.log(
    JSON.stringify({
      status: '2.1.121-source-freeze-built',
      targetCommit,
      overlay: overlayMetadata,
      patchStats,
      source: publicSummary(targetSummary),
      tests: testsVerified,
      syntaxBuilds: syntaxCheck.length,
      diffCheck: identity.verification.diffCheck,
      identity: identityMetadata,
      sourceLineage: sourceLineageMetadata,
      testSandbox: testSandboxReport,
    }),
  )
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
}
