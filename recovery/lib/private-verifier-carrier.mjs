import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SHA256_PATTERN = /^[a-f0-9]{64}$/
const GIT_OBJECT_PATTERN = /^[a-f0-9]{40}$/
const CASE_PATTERN = /^2\.1\.\d+-to-2\.1\.\d+$/
const VERIFIER_REPOSITORY_ROOT = fileURLToPath(
  new URL('../..', import.meta.url),
)
const TRUSTED_RUNTIME_FILES = Object.freeze([
  Object.freeze({
    path: 'recovery/scripts/verify-complete-recovery.mjs',
    bytes: 22_469,
    sha256: '8f2cc461b2dd68bb34268b9eb74fbe6f212cfce2bfbfa1ad345aa49bff1ab06f',
    mode: 0o644,
  }),
  Object.freeze({
    path: 'recovery/scripts/verify-source-lineage.mjs',
    bytes: 108_209,
    sha256: '866c1be0686e7bd2c331cba2cd5e8849411af589a30b84890507d81e10ead9b4',
    mode: 0o644,
  }),
  Object.freeze({
    path: 'recovery/scripts/verify-case.mjs',
    bytes: 40_707,
    sha256: 'b2c1be53f9f5ccba717e2101701861cd17d1a33b8eacdb8b0b81fccefbed23f4',
    mode: 0o644,
  }),
  Object.freeze({
    path: 'recovery/scripts/verify-attribution-report.mjs',
    bytes: 15_948,
    sha256: '70adab935568a9c88d50e3e26a557fc6022ddf914c8c63a5438711ccae154b5a',
    mode: 0o644,
  }),
])
const EXPECTED_CARRIER_HEADS = Object.freeze({
  '2.1.120-to-2.1.121': '4593ba568ee2e840e1a0e3fdfd3b2a9fa51d2d45',
  '2.1.121-to-2.1.122': 'c30cece4b85c84cd9e92ca708c96d1cd3f8f6b87',
  '2.1.122-to-2.1.123': '338d170737e8294c489481bc2e8fac52d8ce5f85',
  '2.1.123-to-2.1.124': 'ae866640a6d67891fe14aeff5bc41da10784b979',
  '2.1.124-to-2.1.126': '09f32af45bf8e2882404bb5677e697cf99dd733b',
})
const EXPECTED_MANIFESTS = Object.freeze({
  '2.1.120-to-2.1.121': Object.freeze({
    bytes: 451_216,
    sha256: 'c347471faf99548a5c0976c965266c3cf9bb21622af017ef62d0b6851ebc4b3d',
    mode: 0o644,
    committed: true,
  }),
  '2.1.121-to-2.1.122': Object.freeze({
    bytes: 494_698,
    sha256: '1813c147fc72d9787c921d85022f85ad547a606241f9c836b8d425a660d33a87',
    mode: 0o644,
    committed: true,
  }),
  '2.1.122-to-2.1.123': Object.freeze({
    bytes: 256_897,
    sha256: '962200462ce002c8994f1d54fa701e0e60dafba6f39b4a065485ba2bdca8580c',
    mode: 0o644,
    committed: true,
  }),
  '2.1.123-to-2.1.124': Object.freeze({
    bytes: 322_936,
    sha256: '4e230d92582275f83d347736f926037ef8c8bbd66c6acafd35826cd3ccab15a5',
    mode: 0o644,
    committed: true,
  }),
  '2.1.124-to-2.1.126': Object.freeze({
    bytes: 272_256,
    sha256: '742cf66991173f61109ceba479ae7d5320e335e301a51ff8d9331e18467e44d7',
    mode: 0o644,
    committed: true,
  }),
})
const PINNED_ZSTD_RUNTIME = Object.freeze({
  path: '.pixi/envs/default/bin/zstd',
  bytes: 220_168,
  sha256: '08a60ba61031bb1f38070099e77df196b24293de7a2c6517e5f29b183b2299ef',
  mode: 0o755,
})
const PINNED_ZSTD_LIBRARY_ALIASES = Object.freeze([
  Object.freeze({
    path: '.pixi/envs/default/lib/libz.so.1',
    target: 'libz.so.1.3.2',
  }),
  Object.freeze({
    path: '.pixi/envs/default/lib/libzstd.so.1',
    target: 'libzstd.so.1.5.7',
  }),
])

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function relativeParts(relative, label) {
  if (typeof relative !== 'string') {
    throw new Error(`${label}: path must be a string`)
  }
  const parts = relative.split('/')
  if (
    relative.length === 0 ||
    relative.includes('\0') ||
    relative.includes('\\') ||
    path.isAbsolute(relative) ||
    path.posix.normalize(relative) !== relative ||
    parts.includes('') ||
    parts.includes('.') ||
    parts.includes('..')
  ) {
    throw new Error(`${label}: unsafe relative path ${relative}`)
  }
  return parts
}

function inspectRoot(root, label) {
  const unresolved = path.resolve(root)
  const before = fs.lstatSync(unresolved)
  if (before.isSymbolicLink() || !before.isDirectory()) {
    throw new Error(`${label}: root must be a real directory`)
  }
  const real = fs.realpathSync(unresolved)
  const resolved = fs.lstatSync(real)
  const after = fs.lstatSync(unresolved)
  if (
    resolved.isSymbolicLink() ||
    !resolved.isDirectory() ||
    after.isSymbolicLink() ||
    !after.isDirectory() ||
    resolved.dev !== before.dev ||
    resolved.ino !== before.ino ||
    after.dev !== before.dev ||
    after.ino !== before.ino
  ) {
    throw new Error(`${label}: root changed while resolving`)
  }
  return {
    device: before.dev,
    inode: before.ino,
    real,
    unresolved,
  }
}

function createPrivateTemporaryRoot() {
  const base = inspectRoot('/tmp', 'private verifier temporary base')
  const baseStatus = fs.lstatSync(base.real)
  assert(
    baseStatus.uid === 0 && (baseStatus.mode & 0o1777) === 0o1777,
    'private verifier temporary base must be root-owned and sticky',
  )
  const temporaryRoot = fs.mkdtempSync(
    path.join(base.real, 'private-recovery-verifier-'),
  )
  fs.chmodSync(temporaryRoot, 0o700)
  const temporary = inspectRoot(
    temporaryRoot,
    'private verifier temporary root',
  )
  const baseAfter = inspectRoot('/tmp', 'private verifier temporary base')
  assert(
    baseAfter.real === base.real &&
      baseAfter.device === base.device &&
      baseAfter.inode === base.inode,
    'private verifier temporary base changed while creating carrier',
  )
  assert(
    temporary.real === temporaryRoot &&
      (fs.lstatSync(temporaryRoot).mode & 0o777) === 0o700,
    'private verifier temporary root identity',
  )
  return {
    device: temporary.device,
    inode: temporary.inode,
    real: temporary.real,
  }
}

function removePrivateTemporaryRoot(identity, label) {
  const root = inspectRoot(identity.real, label)
  if (
    root.real !== identity.real ||
    root.device !== identity.device ||
    root.inode !== identity.inode
  ) {
    throw new Error(`${label}: refusing to remove a substituted carrier`)
  }
  fs.rmSync(identity.real, { force: true, recursive: true })
}

function inspectFile(rootRecord, relative, label) {
  const parts = relativeParts(relative, label)
  let filename = rootRecord.real
  let finalStatus
  for (const [index, part] of parts.entries()) {
    filename = path.join(filename, part)
    const status = fs.lstatSync(filename)
    if (status.isSymbolicLink()) {
      throw new Error(`${label}: symbolic-link path component: ${relative}`)
    }
    const final = index === parts.length - 1
    if (!final && !status.isDirectory()) {
      throw new Error(`${label}: non-directory path component: ${relative}`)
    }
    if (final && !status.isFile()) {
      throw new Error(`${label}: target must be a regular file: ${relative}`)
    }
    if (final) finalStatus = status
  }
  const realFilename = fs.realpathSync(filename)
  const confined = path.relative(rootRecord.real, realFilename)
  if (
    confined.length === 0 ||
    path.isAbsolute(confined) ||
    confined === '..' ||
    confined.startsWith(`..${path.sep}`)
  ) {
    throw new Error(`${label}: path escaped its root: ${relative}`)
  }
  const rootAfter = fs.lstatSync(rootRecord.unresolved)
  if (
    rootAfter.isSymbolicLink() ||
    !rootAfter.isDirectory() ||
    rootAfter.dev !== rootRecord.device ||
    rootAfter.ino !== rootRecord.inode ||
    fs.realpathSync(rootRecord.unresolved) !== rootRecord.real
  ) {
    throw new Error(`${label}: root changed while reading`)
  }
  return {
    device: finalStatus.dev,
    filename,
    inode: finalStatus.ino,
    mode: finalStatus.mode & 0o777,
    realFilename,
  }
}

function readStableFile(root, relative, expected, label) {
  const rootRecord = inspectRoot(root, label)
  const before = inspectFile(rootRecord, relative, label)
  let descriptor
  try {
    const noFollow = fs.constants.O_NOFOLLOW
    const flags = Number.isInteger(noFollow)
      ? fs.constants.O_RDONLY | noFollow
      : fs.constants.O_RDONLY
    descriptor = fs.openSync(before.filename, flags)
    const opened = fs.fstatSync(descriptor)
    assert(opened.isFile(), `${label}: opened target must be a regular file`)
    assert(
      opened.dev === before.device && opened.ino === before.inode,
      `${label}: target changed before open`,
    )
    const value = fs.readFileSync(descriptor)
    const digest = sha256(value)
    const openedAfter = fs.fstatSync(descriptor)
    assert(
      openedAfter.dev === opened.dev && openedAfter.ino === opened.ino,
      `${label}: opened target changed while reading`,
    )
    const after = inspectFile(rootRecord, relative, label)
    assert(
      after.realFilename === before.realFilename &&
        after.device === opened.dev &&
        after.inode === opened.ino,
      `${label}: target changed after read`,
    )
    if (expected?.bytes !== undefined) {
      assert(value.length === expected.bytes, `${label}: byte length`)
    }
    if (expected?.sha256 !== undefined) {
      assert(digest === expected.sha256, `${label}: SHA-256`)
    }
    if (expected?.mode !== undefined) {
      assert((opened.mode & 0o777) === expected.mode, `${label}: mode`)
    }
    return {
      bytes: value.length,
      mode: opened.mode & 0o777,
      realFilename: after.realFilename,
      sha256: digest,
      value,
    }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor)
  }
}

function ensurePrivateParent(root, relative, label) {
  const parts = relativeParts(relative, label)
  let parent = fs.realpathSync(root)
  for (const part of parts.slice(0, -1)) {
    const child = path.join(parent, part)
    if (!fs.existsSync(child)) {
      fs.mkdirSync(child, { mode: 0o700 })
    } else {
      const status = fs.lstatSync(child)
      if (status.isSymbolicLink() || !status.isDirectory()) {
        throw new Error(`${label}: unsafe destination directory`)
      }
    }
    parent = child
  }
  return { filename: path.join(parent, parts.at(-1)), parts }
}

function writePrivateFile(root, relative, value, mode, label, replace = false) {
  const { filename } = ensurePrivateParent(root, relative, label)
  if (fs.existsSync(filename)) {
    const status = fs.lstatSync(filename)
    if (!replace || status.isSymbolicLink() || !status.isFile()) {
      throw new Error(`${label}: destination already exists`)
    }
    fs.unlinkSync(filename)
  }
  fs.writeFileSync(filename, value, { flag: 'wx', mode })
  fs.chmodSync(filename, mode)
  const written = readStableFile(
    root,
    relative,
    { bytes: value.length, sha256: sha256(value), mode },
    `${label} destination`,
  )
  return written.realFilename
}

function privateEnvironment(temporaryRoot) {
  return {
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    HOME: temporaryRoot,
    LANG: 'C',
    LC_ALL: 'C',
    PATH: '/usr/bin:/bin',
    TEMP: temporaryRoot,
    TMP: temporaryRoot,
    TMPDIR: temporaryRoot,
    TZ: 'UTC',
  }
}

function runGit(cwd, arguments_, environment, label) {
  const result = spawnSync('git', arguments_, {
    cwd,
    encoding: 'utf8',
    env: environment,
    maxBuffer: 128 * 1024 * 1024,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `${label} failed (${result.status})\n` +
        `${result.stdout ?? ''}${result.stderr ?? ''}`,
    )
  }
  return result.stdout.trim()
}

function validateDescriptor(descriptor, label) {
  if (
    !descriptor ||
    typeof descriptor !== 'object' ||
    Array.isArray(descriptor) ||
    !Number.isSafeInteger(descriptor.bytes) ||
    descriptor.bytes < 0 ||
    typeof descriptor.sha256 !== 'string' ||
    !SHA256_PATTERN.test(descriptor.sha256)
  ) {
    throw new Error(`${label}: invalid byte identity`)
  }
}

function declaredGitEndpoints(manifest) {
  const endpoints = new Map()
  const add = (commit, tree, sourceTree, label) => {
    if (
      typeof commit !== 'string' ||
      !GIT_OBJECT_PATTERN.test(commit) ||
      typeof tree !== 'string' ||
      !GIT_OBJECT_PATTERN.test(tree) ||
      typeof sourceTree !== 'string' ||
      !GIT_OBJECT_PATTERN.test(sourceTree)
    ) {
      throw new Error(`${label}: invalid Git endpoint`)
    }
    const prior = endpoints.get(commit)
    if (prior !== undefined) {
      assert(
        prior.tree === tree && prior.sourceTree === sourceTree,
        `${label}: conflicting Git endpoint`,
      )
      return
    }
    endpoints.set(commit, { commit, label, sourceTree, tree })
  }

  const lineage = manifest.sourceLineage
  if (!lineage || typeof lineage !== 'object' || Array.isArray(lineage)) {
    throw new Error('private verifier carrier requires sourceLineage')
  }
  for (const name of ['base', 'target']) {
    add(
      lineage[`${name}Commit`],
      lineage[`${name}GitTree`],
      lineage[`${name}SrcGitTree`] ?? lineage[`${name}SourceGitTree`],
      `sourceLineage ${name}`,
    )
  }
  const repositories = lineage.testGitRepositories
  if (repositories !== undefined) {
    if (
      !repositories ||
      typeof repositories !== 'object' ||
      Array.isArray(repositories)
    ) {
      throw new Error('sourceLineage.testGitRepositories must be an object')
    }
    for (const [environment, endpoint] of Object.entries(repositories)) {
      add(
        endpoint?.commit,
        endpoint?.gitTree,
        endpoint?.srcGitTree,
        `sourceLineage test Git repository ${environment}`,
      )
      for (const [index, detached] of (
        endpoint?.detachedCommits ?? []
      ).entries()) {
        add(
          detached?.commit,
          detached?.gitTree,
          detached?.srcGitTree,
          `sourceLineage ${environment} detached commit ${index + 1}`,
        )
      }
    }
  }
  return [...endpoints.values()]
}

function fetchAndVerifyGitEndpoints({
  environment,
  manifest,
  privateRepository,
  publicRepository,
}) {
  const endpoints = declaredGitEndpoints(manifest)
  for (const endpoint of endpoints) {
    assert(
      runGit(
        publicRepository,
        ['rev-parse', '--verify', `${endpoint.commit}^{commit}`],
        environment,
        `${endpoint.label} public commit`,
      ) === endpoint.commit,
      `${endpoint.label}: public commit identity`,
    )
    assert(
      runGit(
        publicRepository,
        ['rev-parse', '--verify', `${endpoint.commit}^{tree}`],
        environment,
        `${endpoint.label} public tree`,
      ) === endpoint.tree,
      `${endpoint.label}: public tree identity`,
    )
    assert(
      runGit(
        publicRepository,
        ['rev-parse', '--verify', `${endpoint.commit}:src`],
        environment,
        `${endpoint.label} public source tree`,
      ) === endpoint.sourceTree,
      `${endpoint.label}: public source tree identity`,
    )
    runGit(
      privateRepository,
      [
        'fetch',
        '--quiet',
        '--no-tags',
        '--no-write-fetch-head',
        '--force',
        '--',
        publicRepository,
        endpoint.commit,
      ],
      environment,
      `${endpoint.label} private fetch`,
    )
    assert(
      runGit(
        privateRepository,
        ['rev-parse', '--verify', `${endpoint.commit}^{commit}`],
        environment,
        `${endpoint.label} private commit`,
      ) === endpoint.commit,
      `${endpoint.label}: private commit identity`,
    )
    assert(
      runGit(
        privateRepository,
        ['rev-parse', '--verify', `${endpoint.commit}^{tree}`],
        environment,
        `${endpoint.label} private tree`,
      ) === endpoint.tree,
      `${endpoint.label}: private tree identity`,
    )
    assert(
      runGit(
        privateRepository,
        ['rev-parse', '--verify', `${endpoint.commit}:src`],
        environment,
        `${endpoint.label} private source tree`,
      ) === endpoint.sourceTree,
      `${endpoint.label}: private source tree identity`,
    )
  }
  return endpoints
}

function materializeTargetSource({
  environment,
  manifest,
  privateRepository,
  temporaryRoot,
}) {
  const targetCommit = manifest.sourceLineage.targetCommit
  const targetSourceTree = manifest.sourceLineage.targetSrcGitTree
  assert(
    runGit(
      privateRepository,
      ['rev-parse', '--verify', `${targetCommit}:src`],
      environment,
      'private target source tree',
    ) === targetSourceTree,
    'private target source tree identity',
  )
  const privateSourceRoot = path.join(privateRepository, 'src')
  const relativeSource = path.relative(privateRepository, privateSourceRoot)
  assert(relativeSource === 'src', 'private target source destination')
  fs.rmSync(privateSourceRoot, { force: true, recursive: true })
  const archive = path.join(temporaryRoot, 'target-source.tar')
  runGit(
    privateRepository,
    [
      'archive',
      '--format=tar',
      `--output=${archive}`,
      targetCommit,
      '--',
      'src',
    ],
    environment,
    'private target source archive',
  )
  const extraction = spawnSync(
    '/usr/bin/tar',
    ['-xf', archive, '-C', privateRepository],
    {
      cwd: temporaryRoot,
      encoding: 'utf8',
      env: environment,
      maxBuffer: 128 * 1024 * 1024,
    },
  )
  if (extraction.error) throw extraction.error
  if (extraction.status !== 0) {
    throw new Error(
      `private target source extraction failed (${extraction.status})\n` +
        `${extraction.stdout ?? ''}${extraction.stderr ?? ''}`,
    )
  }
  fs.unlinkSync(archive)
  const sourceStatus = fs.lstatSync(privateSourceRoot)
  assert(
    sourceStatus.isDirectory() && !sourceStatus.isSymbolicLink(),
    'private target source must be a real directory',
  )
  return { commit: targetCommit, sourceTree: targetSourceTree }
}

function stagePinnedZstdRuntime({
  environment,
  privateRepository,
  trustedRepository,
}) {
  const source = readStableFile(
    trustedRepository,
    PINNED_ZSTD_RUNTIME.path,
    PINNED_ZSTD_RUNTIME,
    'pinned zstd runtime',
  )
  const runtime = writePrivateFile(
    privateRepository,
    PINNED_ZSTD_RUNTIME.path,
    source.value,
    PINNED_ZSTD_RUNTIME.mode,
    'pinned zstd runtime',
  )
  for (const [index, alias] of PINNED_ZSTD_LIBRARY_ALIASES.entries()) {
    const { filename } = ensurePrivateParent(
      privateRepository,
      alias.path,
      `pinned zstd library alias ${index + 1}`,
    )
    if (fs.existsSync(filename)) {
      throw new Error(`pinned zstd library alias already exists: ${alias.path}`)
    }
    const target = path.join(path.dirname(filename), alias.target)
    const targetRelative = path.relative(privateRepository, target)
    const targetRecord = readStableFile(
      privateRepository,
      targetRelative.split(path.sep).join('/'),
      undefined,
      `pinned zstd library target ${index + 1}`,
    )
    assert(targetRecord.mode === 0o755, 'pinned zstd library target mode')
    fs.symlinkSync(alias.target, filename)
    const status = fs.lstatSync(filename)
    assert(
      status.isSymbolicLink() && fs.readlinkSync(filename) === alias.target,
      `pinned zstd library alias ${index + 1}`,
    )
  }
  const bin = path.dirname(runtime)
  environment.PATH = `${bin}:/usr/bin:/bin`
  const smoke = spawnSync('zstd', ['--version'], {
    cwd: privateRepository,
    encoding: 'utf8',
    env: environment,
    maxBuffer: 1024 * 1024,
  })
  if (smoke.error) throw smoke.error
  assert(
    smoke.status === 0 && /^\*\*\* Zstandard CLI \(64-bit\) v1\.5\.7,/.test(smoke.stdout),
    'pinned zstd runtime smoke test',
  )
  return {
    ...PINNED_ZSTD_RUNTIME,
    aliases: PINNED_ZSTD_LIBRARY_ALIASES.map(item => ({ ...item })),
    verified: true,
  }
}

export async function createPrivateVerifierCarrier({
  artifactsRoot,
  baselineTarball,
  caseRoot,
  manifest,
  manifestBytes,
  repositoryRoot,
}) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('private verifier carrier requires a manifest')
  }
  if (typeof manifest.case !== 'string' || !CASE_PATTERN.test(manifest.case)) {
    throw new Error('private verifier carrier has an invalid case identity')
  }
  if (!Buffer.isBuffer(manifestBytes)) {
    throw new Error('private verifier carrier requires captured manifest bytes')
  }
  const manifestIdentity = EXPECTED_MANIFESTS[manifest.case]
  if (manifestIdentity === undefined) {
    throw new Error('private verifier carrier has no pinned manifest identity')
  }
  assert(
    manifestBytes.length === manifestIdentity.bytes &&
      sha256(manifestBytes) === manifestIdentity.sha256,
    'private verifier carrier manifest identity',
  )
  const targetSourceTree = manifest.sourceLineage?.targetSrcGitTree
  if (
    typeof targetSourceTree !== 'string' ||
    !GIT_OBJECT_PATTERN.test(targetSourceTree)
  ) {
    throw new Error('private verifier carrier requires a target source Git tree')
  }

  const temporaryIdentity = createPrivateTemporaryRoot()
  const temporaryRoot = temporaryIdentity.real
  const environment = privateEnvironment(temporaryRoot)
  try {
    const trustedRoot = inspectRoot(
      VERIFIER_REPOSITORY_ROOT,
      'trusted verifier repository',
    )
    const publicRoot = inspectRoot(repositoryRoot, 'verifier repository')
    const canonicalCaseRoot = inspectRoot(
      path.join(publicRoot.real, 'recovery', 'cases', manifest.case),
      'canonical verifier case',
    )
    const suppliedCaseRoot = inspectRoot(caseRoot, 'supplied verifier case')
    assert(
      suppliedCaseRoot.real === canonicalCaseRoot.real &&
        suppliedCaseRoot.device === canonicalCaseRoot.device &&
        suppliedCaseRoot.inode === canonicalCaseRoot.inode,
      'supplied verifier case is not canonical',
    )
    const publicManifest = readStableFile(
      canonicalCaseRoot.real,
      'manifest.json',
      manifestIdentity,
      'canonical verifier manifest',
    )
    assert(
      publicManifest.value.equals(manifestBytes),
      'captured manifest differs from the canonical verifier manifest',
    )
    const publicHead = runGit(
      publicRoot.real,
      ['rev-parse', '--verify', 'HEAD^{commit}'],
      environment,
      'public repository identity',
    )
    assert(
      publicHead === EXPECTED_CARRIER_HEADS[manifest.case],
      'verifier repository is not the sealed case carrier',
    )
    const privateRepository = path.join(temporaryRoot, 'repository')
    runGit(
      temporaryRoot,
      [
        'clone',
        '--no-hardlinks',
        '--no-local',
        '--no-tags',
        '--quiet',
        '--',
        publicRoot.real,
        privateRepository,
      ],
      environment,
      'private verifier repository clone',
    )
    const publicHeadAfter = runGit(
      publicRoot.real,
      ['rev-parse', '--verify', 'HEAD^{commit}'],
      environment,
      'public repository identity after clone',
    )
    assert(publicHeadAfter === publicHead, 'public repository changed while cloning')
    const rootAfterClone = inspectRoot(repositoryRoot, 'verifier repository')
    assert(
      rootAfterClone.real === publicRoot.real &&
        rootAfterClone.device === publicRoot.device &&
        rootAfterClone.inode === publicRoot.inode,
      'verifier repository root changed while cloning',
    )
    assert(
      runGit(
        privateRepository,
        ['rev-parse', '--verify', 'HEAD^{commit}'],
        environment,
        'private verifier repository identity',
      ) === publicHead,
      'private verifier repository commit identity',
    )
    assert(
      runGit(
        privateRepository,
        ['status', '--porcelain=v1', '--untracked-files=all'],
        environment,
        'private verifier repository cleanliness',
      ) === '',
      'private verifier repository clone is not clean',
    )
    assert(
      !fs.existsSync(
        path.join(privateRepository, '.git', 'objects', 'info', 'alternates'),
      ),
      'private verifier repository unexpectedly uses alternates',
    )

    const privateCaseRelative = `recovery/cases/${manifest.case}`
    const privateCaseRoot = path.join(
      privateRepository,
      ...relativeParts(privateCaseRelative, 'private case destination'),
    )
    const committedManifest = readStableFile(
      privateCaseRoot,
      'manifest.json',
      manifestIdentity,
      'committed private verifier manifest',
    )
    assert(
      manifestIdentity.committed === true &&
        committedManifest.value.equals(manifestBytes),
      'captured manifest differs from the sealed carrier commit',
    )

    const gitEndpoints = fetchAndVerifyGitEndpoints({
      environment,
      manifest,
      privateRepository,
      publicRepository: publicRoot.real,
    })
    const targetSource = materializeTargetSource({
      environment,
      manifest,
      privateRepository,
      temporaryRoot,
    })
    runGit(
      privateRepository,
      ['remote', 'remove', 'origin'],
      environment,
      'private verifier remote removal',
    )
    assert(
      runGit(
        privateRepository,
        ['remote'],
        environment,
        'private verifier remote closure',
      ) === '',
      'private verifier repository retains a remote',
    )

    const runtimePaths = new Map()
    for (const descriptor of TRUSTED_RUNTIME_FILES) {
      const source = readStableFile(
        trustedRoot.real,
        descriptor.path,
        descriptor,
        `trusted runtime ${descriptor.path}`,
      )
      writePrivateFile(
        privateRepository,
        descriptor.path,
        source.value,
        source.mode,
        `trusted runtime ${descriptor.path}`,
        true,
      )
      runtimePaths.set(
        descriptor.path,
        path.join(
          privateRepository,
          ...relativeParts(descriptor.path, 'trusted runtime destination'),
        ),
      )
    }
    const sourceLineageDescriptor = TRUSTED_RUNTIME_FILES.find(
      item => item.path === 'recovery/scripts/verify-source-lineage.mjs',
    )
    assert(sourceLineageDescriptor !== undefined, 'trusted source-lineage runtime')
    const sourceLineageUrl = pathToFileURL(
      runtimePaths.get(sourceLineageDescriptor.path),
    )
    sourceLineageUrl.searchParams.set(
      'sha256',
      sourceLineageDescriptor.sha256,
    )
    const stagingRuntime = await import(sourceLineageUrl.href)
    assert(
      typeof stagingRuntime.stagePinnedRecoveryDependencies === 'function' &&
        typeof stagingRuntime.stagePinnedSyntaxToolchainIntoRepository ===
          'function',
      'trusted source-lineage staging API',
    )
    const dependencies = stagingRuntime.stagePinnedRecoveryDependencies(
      trustedRoot.real,
      privateRepository,
      { stageSymlinks: true },
    )
    const syntaxToolchain =
      stagingRuntime.stagePinnedSyntaxToolchainIntoRepository(
        trustedRoot.real,
        privateRepository,
      )
    const zstd = stagePinnedZstdRuntime({
      environment,
      privateRepository,
      trustedRepository: trustedRoot.real,
    })
    assert(
      dependencies.verified === true &&
        dependencies.symlinks.every(item => item.staged === true) &&
        syntaxToolchain.report?.files?.length === 26 &&
        zstd.verified === true,
      'private verifier dependency and syntax-toolchain closure',
    )

    if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
      throw new Error('private verifier carrier requires artifacts')
    }
    const privateArtifactsRoot = path.join(temporaryRoot, 'artifacts')
    fs.mkdirSync(privateArtifactsRoot, { mode: 0o700 })
    const artifactIds = new Set()
    const artifactPaths = new Map()
    let baselineSource
    for (const [index, artifact] of manifest.artifacts.entries()) {
      const label = `manifest artifact ${index + 1}`
      validateDescriptor(artifact, label)
      assert(
        typeof artifact.id === 'string' && artifact.id.length > 0,
        `${label}: invalid id`,
      )
      relativeParts(artifact.localPath, `${label} localPath`)
      assert(!artifactIds.has(artifact.id), `${label}: duplicate id`)
      artifactIds.add(artifact.id)
      const prior = artifactPaths.get(artifact.localPath)
      if (prior !== undefined) {
        assert(
          prior.bytes === artifact.bytes && prior.sha256 === artifact.sha256,
          `${label}: conflicting shared path`,
        )
        if (artifact.id === 'baselineTarball') baselineSource = prior
        continue
      }
      const source = readStableFile(
        artifactsRoot,
        artifact.localPath,
        artifact,
        label,
      )
      writePrivateFile(
        privateArtifactsRoot,
        artifact.localPath,
        source.value,
        0o600,
        `${label} private copy`,
      )
      const record = {
        ...artifact,
        mode: source.mode,
        realFilename: source.realFilename,
      }
      artifactPaths.set(artifact.localPath, record)
      if (artifact.id === 'baselineTarball') baselineSource = record
    }
    assert(baselineSource !== undefined, 'manifest has no baselineTarball')
    const suppliedBaseline = fs.realpathSync(path.resolve(baselineTarball))
    const suppliedStatus = fs.lstatSync(path.resolve(baselineTarball))
    assert(
      suppliedStatus.isFile() && !suppliedStatus.isSymbolicLink(),
      'baseline tarball must be a regular non-symbolic-link file',
    )
    assert(
      suppliedBaseline === baselineSource.realFilename,
      'baseline tarball must be the authenticated baselineTarball artifact',
    )
    const privateBaselineTarball = path.join(
      privateArtifactsRoot,
      ...relativeParts(baselineSource.localPath, 'private baseline tarball'),
    )

    return {
      artifactsRoot: privateArtifactsRoot,
      baselineTarball: privateBaselineTarball,
      caseRoot: privateCaseRoot,
      dependencies,
      environment,
      gitEndpoints,
      head: publicHead,
      manifestPath: path.join(privateCaseRoot, 'manifest.json'),
      repositoryRoot: privateRepository,
      syntaxToolchain: syntaxToolchain.report,
      targetSource,
      temporaryDevice: temporaryIdentity.device,
      temporaryInode: temporaryIdentity.inode,
      temporaryRoot,
      zstd,
    }
  } catch (error) {
    try {
      removePrivateTemporaryRoot(
        temporaryIdentity,
        'failed private verifier cleanup',
      )
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'private verifier carrier failed and cleanup was unsafe',
      )
    }
    throw error
  }
}

export function cleanupPrivateVerifierCarrier(carrier) {
  if (
    !carrier ||
    typeof carrier.temporaryRoot !== 'string' ||
    !Number.isSafeInteger(carrier.temporaryDevice) ||
    !Number.isSafeInteger(carrier.temporaryInode) ||
    !path.basename(carrier.temporaryRoot).startsWith(
      'private-recovery-verifier-',
    )
  ) {
    throw new Error('refusing to clean an invalid private verifier carrier')
  }
  removePrivateTemporaryRoot(
    {
      device: carrier.temporaryDevice,
      inode: carrier.temporaryInode,
      real: carrier.temporaryRoot,
    },
    'private verifier cleanup',
  )
}

export function assertCompleteRecoveryResult({
  manifest,
  result,
  sourceIdentity,
}) {
  assert(result?.case === manifest.case, 'complete result case identity')
  assert(
    result.status === 'complete-recovery-verified',
    'complete result status',
  )
  assert(
    JSON.stringify(result.scope) === JSON.stringify(manifest.recoveryScope),
    'complete result recovery scope',
  )
  const expectedChecks = {
    evidence: 'evidence-verified',
    bunExtraction: manifest.generatedRecovery?.bunExtraction
      ? 'bun-container-verified'
      : null,
    sourcePatches: 'source-lineage-verified',
    sourceReproduction: null,
    exactBundleDelta: 'exact-delta-verified',
    attribution: 'attribution-report-verified',
    structural: 'structural-ledger-verified',
    semanticCorrespondence: manifest.generatedRecovery?.semanticCorrespondence
      ? 'whole-bundle-source-correspondence-verified'
      : null,
    sourceSemanticReproduction: manifest.generatedRecovery?.semanticCorrespondence
      ? 'whole-bundle-source-semantics-verified'
      : null,
    readableDiff: 'readable-diff-verified',
    embeddedCode: manifest.generatedRecovery?.embeddedCode
      ? 'embedded-code-reconstructed'
      : null,
    packageTree: 'exact-package-tree-reconstructed',
  }
  assert(
    JSON.stringify(result.checks) === JSON.stringify(expectedChecks),
    'complete result child status closure',
  )
  const artifact = id => {
    const matches = manifest.artifacts.filter(item => item.id === id)
    assert(matches.length === 1, `complete result artifact ${id}`)
    return matches[0]
  }
  const targetBundle = artifact('targetBundle')
  const analyzedBundle = artifact(
    manifest.generatedRecovery.structural.targetArtifact ?? 'targetBundle',
  )
  assert(
    result.bundle?.bytes === targetBundle.bytes &&
      result.bundle?.sha256 === targetBundle.sha256,
    'complete result target bundle identity',
  )
  assert(
    result.analyzedBundle?.bytes === analyzedBundle.bytes &&
      result.analyzedBundle?.sha256 === analyzedBundle.sha256,
    'complete result analyzed bundle identity',
  )
  const packageMembers = manifest.generatedRecovery.packageMembers
  assert(
    result.packageTree?.members === packageMembers.targetMembers &&
      result.packageTree?.bytes === packageMembers.targetMemberBytes &&
      result.packageTree?.framedTreeSha256 ===
        packageMembers.targetFramedTreeSha256,
    'complete result package-tree identity',
  )
  const embeddedCode = manifest.generatedRecovery.embeddedCode
  assert(
    result.embeddedCode?.files === embeddedCode.targetFiles &&
      result.embeddedCode?.bytes === embeddedCode.targetBytes &&
      result.embeddedCode?.framedTreeSha256 ===
        embeddedCode.targetFramedTreeSha256,
    'complete result embedded-code identity',
  )
  assert(
    result.sourceTree?.files === sourceIdentity.source.files &&
      result.sourceTree?.gitTarget?.commit === sourceIdentity.target.commit &&
      result.sourceTree?.gitTarget?.tree === sourceIdentity.target.tree &&
      result.sourceTree?.gitTarget?.sourceTree === sourceIdentity.target.srcTree,
    'complete result source identity',
  )
  const expectedTests = sourceIdentity.verification.targetTests
  const liveTests = result.tests?.tapSummary
  assert(
    result.tests?.status === 'passed' &&
      Array.isArray(result.tests?.files) &&
      JSON.stringify(result.tests.files) ===
        JSON.stringify(manifest.sourceLineage.testFiles) &&
      result.tests.files.length === expectedTests.files &&
      liveTests?.tests === expectedTests.tests &&
      liveTests?.passed === expectedTests.passed &&
      liveTests?.failed === expectedTests.failed &&
      liveTests?.skipped === (expectedTests.skipped ?? 0),
    'complete result live test identity',
  )
  assert(
    result.accounting?.targetUtf16 > 0 &&
      result.accounting?.unaccountedTargetUtf16 === 0 &&
      result.accounting?.targetTokens ===
        manifest.generatedRecovery.structural.targetTokens &&
      result.accounting?.classifiedTargetTokens ===
        manifest.generatedRecovery.structural.targetTokens &&
      result.accounting?.sourceSemanticTokens ===
        manifest.generatedRecovery.structural.targetTokens &&
      result.accounting?.unclassifiedSourceSemanticTokens === 0,
    'complete result accounting identity',
  )
  return result
}
