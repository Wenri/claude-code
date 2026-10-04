import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { inventoryTree, safeRelative, sha256, within } from './diagnostic-build-inputs.mjs'
import { assertNoAdditionalOptionalRequests } from './native-optional-requires.mjs'

export const NATIVE_COMPUTER_USE_RESOLUTION_MODE = 'private-computer-use-2x2-v1'
const PRIOR_SHA256 = '7c102e676865e20d68707fad56145ecefe746a2dc5d78cd97506dadf34feb594'
const PACKAGE = '@ant/computer-use-mcp'
const PACKAGE_ROOT = 'node_modules/' + PACKAGE
const ENTRY = PACKAGE_ROOT + '/src/index.ts'
const METADATA = PACKAGE_ROOT + '/package.json'
const SUBPATHS = { [PACKAGE + '/sentinelApps']: PACKAGE_ROOT + '/src/sentinelApps.ts',
  [PACKAGE + '/types']: PACKAGE_ROOT + '/src/types.ts' }
const ROOT_IMPORTERS = ['src/utils/computerUse/executor.ts', 'src/utils/computerUse/mcpServer.ts',
  'src/utils/computerUse/setup.ts', 'src/utils/computerUse/wrapper.tsx']
const pin = ({ path, bytes, sha256 }) => ({ path, bytes, sha256 })
const ordered = rows => rows.map(pin).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
const bare = s => !s.startsWith('.') && !s.startsWith('/') && !s.startsWith('node:') && !s.startsWith('bun:')
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n')
const matches = (pattern, value) => new RegExp('^' + pattern.split('*')
  .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(value)
function frozen(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value) }
  return value
}
function metadataValue(metadata) {
  assert(['main-only', 'side-effects-false'].includes(metadata), 'Unknown computer-use metadata mode')
  return metadata === 'main-only' ? { main: 'src/index.ts' } : { main: 'src/index.ts', sideEffects: false }
}
function status(filename) {
  try { return fs.lstatSync(filename) } catch (error) { if (error.code !== 'ENOENT') throw error }
}
function noSymlinks(filename) {
  for (let current = path.resolve(filename);;) {
    assert(!status(current)?.isSymbolicLink(), 'Symlink in computer-use resolution inputs: ' + current)
    const parent = path.dirname(current)
    if (parent === current) return
    current = parent
  }
}
function checkedPin(file) {
  safeRelative(file.path)
  assert(!file.path.includes('\0') && Number.isSafeInteger(file.bytes) && file.bytes >= 0 && /^[a-f0-9]{64}$/.test(file.sha256),
    'Invalid computer-use input pin')
  return pin(file)
}
function readPin(root, file) {
  checkedPin(file)
  const filename = path.join(root, file.path)
  noSymlinks(filename)
  const stat = fs.lstatSync(filename)
  assert(stat.isFile() && stat.size === file.bytes, 'Computer-use input size/type changed: ' + file.path)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, file.bytes, 'Computer-use input changed while reading: ' + file.path)
  assert.equal(sha256(bytes), file.sha256, 'Computer-use input hash changed: ' + file.path)
  return bytes
}

// Pure alias guard for synthetic tests. Only the production factory below
// authenticates these mappings against the fixed prior report.
export function selectComputerUseRootAlias({ rootAlias, mappings, pathAliases }) {
  assert(['retained', 'native'].includes(rootAlias), 'Unknown computer-use root-alias mode')
  assert(mappings instanceof Map, 'Expected prior resolution mapping Map')
  const expected = { 'src/*': ['./src/*'] }
  for (const [specifier, targets] of mappings) {
    assert(typeof specifier === 'string' && targets instanceof Set && targets.size > 0, 'Invalid prior mapping')
    for (const target of targets) safeRelative(target)
    if (specifier === 'zod' || specifier.startsWith('zod/') || specifier === 'diff') continue
    if (targets.size === 1) expected[specifier] = ['./' + [...targets][0]]
  }
  assert.deepEqual(mappings.get('diff'), new Set(['node_modules/diff/libesm/index.js']), 'Existing native diff target changed')
  assert.deepEqual(mappings.get(PACKAGE), new Set([ENTRY]), 'Private computer-use entry changed')
  for (const [specifier, target] of Object.entries(SUBPATHS))
    assert.deepEqual(mappings.get(specifier), new Set([target]), 'Private computer-use subpath target changed')
  assert.deepEqual(pathAliases, expected, 'Complete aliases differ from prior mappings with existing diff omission')
  const retained = structuredClone(pathAliases)
  if (rootAlias === 'native') delete retained[PACKAGE]
  for (const alias of Object.keys(retained)) if (alias !== PACKAGE)
    assert(!matches(alias, PACKAGE), 'Competing computer-use root alias: ' + alias)
  return retained
}

// Synthetic byte inventories are accepted only here, never as production pins.
// Even unlisted empty directories are rejected, including a subGates directory.
export function verifyComputerUseFiles(inputRoot, files, metadata) {
  const root = path.resolve(inputRoot), packageRoot = path.join(root, PACKAGE_ROOT)
  assert(files.length && new Set(files.map(file => file.path)).size === files.length, 'Duplicate or empty private package inventory')
  for (const file of files) {
    checkedPin(file)
    assert(file.path.startsWith(PACKAGE_ROOT + '/'), 'Foreign computer-use input pin')
    readPin(root, file)
  }
  noSymlinks(packageRoot)
  const actual = inventoryTree(packageRoot).files.map(file => ({ ...file, path: PACKAGE_ROOT + '/' + file.path }))
  assert.deepEqual(ordered(actual), ordered(files), 'Private computer-use package inventory changed')
  const expectedDirectories = new Set([PACKAGE_ROOT])
  for (const file of files) for (let dir = path.posix.dirname(file.path); dir !== PACKAGE_ROOT; dir = path.posix.dirname(dir))
    expectedDirectories.add(dir)
  function visit(directory) {
    assert(expectedDirectories.has(path.relative(root, directory).split(path.sep).join('/')), 'Unlisted private package directory: ' + directory)
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) if (entry.isDirectory()) visit(path.join(directory, entry.name))
  }
  visit(packageRoot)
  const file = files.find(file => file.path === METADATA)
  assert(file, 'Generated computer-use metadata missing')
  assert(readPin(root, file).equals(jsonBytes(metadataValue(metadata))), 'Generated computer-use metadata is not the exact selected form')
}

// Conservative search guards; these are not a reimplementation of Bun.
export function assertComputerUseSearchPath({ inputRoot, importer, pathAliases, requireConfig = true, environment = process.env }) {
  assert(!environment.NODE_PATH, 'NODE_PATH is unsupported for computer-use resolution')
  const root = path.resolve(inputRoot), owner = path.resolve(importer), config = path.join(root, 'tsconfig.json')
  assert(owner !== root && within(root, owner), 'Computer-use importer must be inside staged inputs')
  noSymlinks(owner)
  assert(status(owner)?.isFile(), 'Computer-use importer must be a regular file')
  const checked = []
  function absentFamily(filename, allowDirectory = false) {
    noSymlinks(filename)
    if (allowDirectory) assert(status(filename)?.isDirectory(), 'Pinned computer-use package directory missing')
    else assert(!status(filename), 'Alternate computer-use resolution input: ' + filename)
    checked.push(filename)
    const parent = path.dirname(filename)
    if (status(parent)) for (const name of fs.readdirSync(parent))
      assert(!name.startsWith(path.basename(filename) + '.'), 'Alternate computer-use resolution input: ' + path.join(parent, name))
  }
  function noSelfReference(directory) {
    const filename = path.join(directory, 'package.json')
    if (!status(filename)) return
    noSymlinks(filename)
    assert(status(filename).isFile(), 'Computer-use ancestor metadata must be a regular file')
    assert.notEqual(JSON.parse(fs.readFileSync(filename, 'utf8')).name, PACKAGE, 'Alternate computer-use package self-reference: ' + filename)
  }
  absentFamily(path.join(root, PACKAGE))
  for (let directory = path.dirname(owner);; directory = path.dirname(directory)) {
    absentFamily(path.join(directory, PACKAGE_ROOT), directory === root)
    for (const name of ['tsconfig.json', 'jsconfig.json']) {
      const filename = path.join(directory, name)
      noSymlinks(filename)
      if (filename === config) {
        if (requireConfig || status(filename)) {
          assert(status(filename)?.isFile(), 'Computer-use root tsconfig must be a regular file')
          assert.deepEqual(JSON.parse(fs.readFileSync(filename, 'utf8')), { compilerOptions: { baseUrl: '.', paths: pathAliases } },
            'Computer-use root resolver config changed')
        }
      } else assert(!status(filename), 'Competing computer-use resolver config: ' + filename)
    }
    noSelfReference(directory)
    if (directory === root) break
  }
  for (let directory = path.dirname(root);; directory = path.dirname(directory)) {
    noSelfReference(directory)
    if (path.dirname(directory) === directory) break
  }
  return checked
}

function priorLocation(prior, filename) {
  const match = Object.entries(prior.inputs.trees).sort((a, b) => b[1].root.length - a[1].root.length)
    .find(([, tree]) => within(tree.root, filename))
  assert(match, 'Prior computer-use resolution is outside known input trees')
  return (match[0] === 'dependency-candidate' ? 'node_modules/zod-to-json-schema/' : '') +
    safeRelative(path.relative(match[1].root, filename).split(path.sep).join('/'))
}
function assertOptions(options, root) {
  assert(options && typeof options === 'object' && !Array.isArray(options), 'Expected unchanged build options')
  for (const key of ['alias', 'tsconfig', 'plugins', 'files'])
    assert(!Object.hasOwn(options, key), 'Unreviewed computer-use resolver option: ' + key)
  assert.equal(options.packages, 'bundle', 'Computer-use package bundling is required')
  assert(Array.isArray(options.external) && options.external.every(rule => typeof rule === 'string'), 'Expected explicit external rules')
  const missing = path.join(root, PACKAGE_ROOT, 'src/subGates.js')
  assert.equal(options.external.filter(rule => rule === missing).length, 1, 'Missing exact unchanged subGates external edge')
  for (const rule of options.external) for (const request of [PACKAGE, ...Object.keys(SUBPATHS), path.join(root, ENTRY)])
    assert(!matches(rule, request) && !request.startsWith(rule + '/'), 'External rule covers computer-use request: ' + rule)
}

// Production entry point, read-only. Stage one of the two canonical metadata
// forms first. Supply complete existing aliases with diff already omitted.
// Write the returned tsconfig bytes before verifyInputs(); then call that
// verifier immediately before and after compilation using the returned options.
// Existing builder/profiles are deliberately not wired to this experiment.
export function createNativeComputerUseResolutionRecipe(args) {
  assert(args && Object.keys(args).every(key => ['mode', 'rootAlias', 'metadata', 'inputRoot', 'manifestFiles',
    'mappings', 'priorBytes', 'pathAliases', 'options'].includes(key)), 'Unsupported computer-use recipe argument')
  const { mode, rootAlias, metadata, inputRoot, manifestFiles, mappings, priorBytes, pathAliases, options } = args
  assert.equal(mode, NATIVE_COMPUTER_USE_RESOLUTION_MODE, 'Unknown private computer-use experiment mode')
  metadataValue(metadata)
  assert.equal(sha256(priorBytes), PRIOR_SHA256, 'Prior computer-use resolution report changed')
  const prior = JSON.parse(priorBytes), root = path.resolve(inputRoot)
  const expectedMappings = new Map()
  for (const row of prior.resolutions) if (row.path && bare(row.specifier)) {
    const targets = expectedMappings.get(row.specifier) ?? new Set()
    targets.add(priorLocation(prior, row.path)); expectedMappings.set(row.specifier, targets)
  }
  assert.deepEqual(mappings, expectedMappings, 'Prior resolution mapping identities changed')
  const aliases = selectComputerUseRootAlias({ rootAlias, mappings: expectedMappings, pathAliases })
  const configBytes = jsonBytes({ compilerOptions: { baseUrl: '.', paths: aliases } })
  const configPin = { path: 'tsconfig.json', bytes: configBytes.length, sha256: sha256(configBytes) }
  const manifest = structuredClone(manifestFiles)
  const pins = new Map(manifest.map(file => [checkedPin(file).path, file]))
  assert.equal(pins.size, manifest.length, 'Duplicate computer-use input manifest path')
  if (pins.has(configPin.path)) assert.deepEqual(pin(pins.get(configPin.path)), configPin, 'Selected tsconfig manifest changed')
  else { manifest.push(configPin); pins.set(configPin.path, configPin) }
  const original = new Map(prior.inputs.trees.inputs.files.map(file => [file.path, file]))
  assert.equal(original.size, 4756, 'Expected complete exact mapped-source inventory')
  for (const source of original.values()) {
    assert(pins.has(source.path), 'Mapped computer-use scan source missing: ' + source.path)
    assert.deepEqual(pin(pins.get(source.path)), source, 'Mapped computer-use scan pin changed: ' + source.path)
  }
  const sources = [...original.values()].filter(file => file.path.startsWith(PACKAGE_ROOT + '/'))
  assert.equal(sources.length, 10, 'Expected ten exact private source files')
  assert(!original.has(METADATA), 'Private metadata unexpectedly mapped')
  const metaBytes = jsonBytes(metadataValue(metadata))
  const packageFiles = ordered([...sources, { path: METADATA, bytes: metaBytes.length, sha256: sha256(metaBytes) }])
  assert.deepEqual(ordered(manifest.filter(file => file.path.startsWith(PACKAGE_ROOT + '/'))), packageFiles,
    'Private package manifest differs from fixed sources and selected generated metadata')
  const edges = prior.resolutions.filter(row => row.specifier === PACKAGE)
  assert.equal(edges.length, 4, 'Expected four recorded computer-use root importers')
  assert(!prior.unresolved.some(row => row.specifier === PACKAGE), 'Prior computer-use root request unresolved')
  const importers = edges.map(row => {
    assert.equal(priorLocation(prior, row.path), ENTRY, 'Prior computer-use root target changed')
    const source = original.get(priorLocation(prior, row.importer))
    assert(source, 'Computer-use root importer lacks exact mapped-source pin')
    return structuredClone(source)
  })
  assert.deepEqual(importers.map(file => file.path).sort(), ROOT_IMPORTERS, 'Complete computer-use root importer set changed')
  const unresolved = prior.unresolved.filter(row => priorLocation(prior, row.importer).startsWith(PACKAGE_ROOT + '/'))
  assert.equal(unresolved.length, 1, 'Expected sole private unresolved edge')
  assert.equal(unresolved[0].specifier, './subGates.js')
  assert.equal(priorLocation(prior, unresolved[0].importer), ENTRY)
  const immutableManifest = frozen(structuredClone(manifest)), expectedOptions = structuredClone(options)
  assertOptions(expectedOptions, root)
  const outputOptions = structuredClone(expectedOptions)
  function verify(requireConfig) {
    assert.deepEqual(options, expectedOptions, 'Original computer-use build options changed')
    assert.deepEqual(outputOptions, expectedOptions, 'Returned computer-use build options changed')
    assertOptions(outputOptions, root)
    noSymlinks(root)
    const presentConfig = status(path.join(root, configPin.path))
    if (requireConfig) assert(presentConfig, 'Selected computer-use tsconfig missing')
    const expected = ordered(immutableManifest.filter(file => file.path !== configPin.path || presentConfig))
    assert.deepEqual(inventoryTree(root).files, expected, 'Complete immutable computer-use input manifest changed')
    verifyComputerUseFiles(root, packageFiles, metadata)
    for (const file of immutableManifest) if (!original.has(file.path) && /\.(?:[cm]?[jt]sx?)$/.test(file.path))
      assertNoAdditionalOptionalRequests(readPin(root, file).toString('utf8'), file.path, [PACKAGE, ...Object.keys(SUBPATHS)])
    return importers.map(source => ({ source: structuredClone(source), expectedTarget: ENTRY,
      checkedPackagePaths: assertComputerUseSearchPath({ inputRoot: root, importer: path.join(root, source.path), pathAliases: aliases, requireConfig }) }))
  }
  const records = verify(false)
  return { pathAliases: structuredClone(aliases), tsconfigBytes: Buffer.from(configBytes), tsconfigFile: frozen({ ...configPin }), options: outputOptions,
    manifestFiles: frozen(structuredClone(immutableManifest)), verifyInputs: () => verify(true), recipe: {
      kind: 'private-computer-use-root-resolution-diagnostic', mode, rootAlias, metadata,
      sourceEquivalenceEstablished: false, originalPackageMetadataEstablished: false, originalPurityEstablished: false,
      priorReportSha256: PRIOR_SHA256, package: PACKAGE, packageFiles: structuredClone(packageFiles),
      generatedPackageMetadata: { path: METADATA, value: metadataValue(metadata), sha256: sha256(metaBytes) },
      removedPathAliases: rootAlias === 'native' ? { [PACKAGE]: ['./' + ENTRY] } : {},
      retainedSubpathAliases: Object.fromEntries(Object.keys(SUBPATHS).map(specifier => [specifier, structuredClone(aliases[specifier])])),
      unchangedBuildOptions: structuredClone(expectedOptions), inputManifestSha256: sha256(JSON.stringify(ordered(immutableManifest))), records,
      limitations: ['Only root-alias retention and the selected generated metadata form are experimental variables.',
        'The generated main and sideEffects values are hypotheses; original metadata, purity, and source equivalence are not established.',
        'All mapped source bytes, both existing subpath aliases, the diff omission, external rules, and other build options remain fixed.',
        'Supplementary JavaScript uses the existing static literal-request audit; unexpected supplementary TypeScript fails closed.',
        'Complete input inventory and search environment must be checked before and after compilation; concurrent mutations are unsupported.',
        'Strict whole-program AST equality remains required.'],
    } }
}
