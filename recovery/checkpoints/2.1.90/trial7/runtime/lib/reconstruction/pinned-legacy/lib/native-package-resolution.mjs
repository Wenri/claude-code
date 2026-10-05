import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { inventoryTree, safeRelative, sha256, within } from './diagnostic-build-inputs.mjs'
import { validateRuntimePackageCandidate } from './runtime-package-candidates.mjs'

const REPORT = 'recovery/audits/2026-10-03/source-reconstruction/diff-8.0.3-candidate.json'
const REPORT_SHA256 = '3eb257fbea67b18edf1b96d278c10cd8e532ef182ab7b3c3a7c636e6f535d3b5'
const PRIOR_SHA256 = '7c102e676865e20d68707fad56145ecefe746a2dc5d78cd97506dadf34feb594'
const PACKAGE_ROOT = 'node_modules/diff'
const ENTRY = PACKAGE_ROOT + '/libesm/index.js'
const pin = ({ path, bytes, sha256 }) => ({ path, bytes, sha256 })
const ordered = rows => rows.map(pin).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
const bare = s => !s.startsWith('.') && !s.startsWith('/') && !s.startsWith('node:') && !s.startsWith('bun:')

// This pure helper is not an authentication boundary. The factory below checks
// mappings against the fixed prior report before using it.
export function omitNativeDiffAlias({ packages, mappings, pathAliases }) {
  assert.deepEqual(packages, ['diff'], 'Native package resolution supports exactly one diff request')
  assert(mappings instanceof Map, 'Expected prior resolution mapping Map')
  const expected = { 'src/*': ['./src/*'] }
  for (const [specifier, targets] of mappings) {
    assert(typeof specifier === 'string' && targets instanceof Set && targets.size > 0, 'Invalid prior mapping')
    for (const target of targets) safeRelative(target)
    if (specifier === 'zod' || specifier.startsWith('zod/')) continue
    if (targets.size === 1) expected[specifier] = ['./' + [...targets][0]]
  }
  assert.deepEqual(mappings.get('diff'), new Set([ENTRY]), 'diff must have exactly the authenticated ESM target')
  assert.deepEqual(pathAliases, expected, 'Existing alias identities differ from prior resolution mappings')
  const retained = structuredClone(pathAliases)
  delete retained.diff
  for (const alias of Object.keys(retained)) {
    const pattern = alias.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')
    assert(!new RegExp('^' + pattern + '$').test('diff'), 'Competing diff path alias: ' + alias)
  }
  return retained
}

function status(filename) {
  try { return fs.lstatSync(filename) } catch (error) { if (error.code !== 'ENOENT') throw error }
}
function noSymlinks(filename) {
  for (let current = path.resolve(filename);;) {
    assert(!status(current)?.isSymbolicLink(), 'Symlink in native diff inputs: ' + current)
    const parent = path.dirname(current)
    if (parent === current) return
    current = parent
  }
}
function readPin(root, file) {
  const filename = path.join(root, safeRelative(file.path))
  noSymlinks(filename)
  const stat = fs.lstatSync(filename)
  assert(stat.isFile() && stat.size === file.bytes, 'Native diff input size/type changed: ' + file.path)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, file.bytes, 'Native diff input changed while reading: ' + file.path)
  assert.equal(sha256(bytes), file.sha256, 'Native diff input hash changed: ' + file.path)
  return bytes
}

// Synthetic pins are useful for testing this byte guard. Production pins are
// always read from the fixed authenticated report, never supplied by a caller.
export function verifyNativeDiffFiles(inputRoot, files) {
  const root = path.resolve(inputRoot), packageRoot = path.join(root, PACKAGE_ROOT)
  assert(files.length && new Set(files.map(file => file.path)).size === files.length, 'Duplicate or empty diff inventory')
  for (const file of files) {
    safeRelative(file.path)
    assert(file.path.startsWith(PACKAGE_ROOT + '/'), 'Foreign diff input pin')
    readPin(root, file)
  }
  noSymlinks(packageRoot)
  const actual = inventoryTree(packageRoot).files.map(file => ({ ...file, path: PACKAGE_ROOT + '/' + file.path }))
  assert.deepEqual(ordered(actual), ordered(files), 'Native diff package inventory changed')
}

// Conservative search-path guards, not an implementation of Bun resolution.
// Stop at the authenticated root package; nearer package directories, files,
// self references, baseUrl files, and competing configs all fail closed.
export function assertNativeDiffSearchPath({ inputRoot, importer, pathAliases, requireConfig = true, environment = process.env }) {
  assert(!environment.NODE_PATH, 'NODE_PATH is unsupported for native diff resolution')
  const root = path.resolve(inputRoot), owner = path.resolve(importer), config = path.join(root, 'tsconfig.json')
  assert(owner !== root && within(root, owner), 'Native diff importer must be inside staged inputs')
  noSymlinks(owner)
  const checked = []
  function absentFamily(filename, allowDirectory = false) {
    noSymlinks(filename)
    if (allowDirectory) assert(status(filename)?.isDirectory(), 'Authenticated diff package directory missing')
    else assert(!status(filename), 'Alternate diff resolution input: ' + filename)
    checked.push(filename)
    const parent = path.dirname(filename)
    if (status(parent)) for (const name of fs.readdirSync(parent))
      assert(!name.startsWith(path.basename(filename) + '.'), 'Alternate diff resolution input: ' + path.join(parent, name))
  }
  absentFamily(path.join(root, 'diff'))
  for (let directory = path.dirname(owner);; directory = path.dirname(directory)) {
    absentFamily(path.join(directory, 'node_modules/diff'), directory === root)
    for (const name of ['tsconfig.json', 'jsconfig.json']) {
      const filename = path.join(directory, name)
      if (filename === config) {
        if (requireConfig || status(filename)) {
          noSymlinks(filename)
          assert(status(filename)?.isFile(), 'Native diff root tsconfig must be a regular file')
          assert.deepEqual(JSON.parse(fs.readFileSync(filename, 'utf8')), { compilerOptions: { baseUrl: '.', paths: pathAliases } },
            'Native diff root resolver config changed')
        }
      } else assert(!status(filename), 'Competing native diff resolver config: ' + filename)
    }
    const metadata = path.join(directory, 'package.json')
    if (status(metadata)) {
      noSymlinks(metadata)
      assert(status(metadata).isFile(), 'Native diff ancestor metadata must be a regular file')
      assert.notEqual(JSON.parse(fs.readFileSync(metadata, 'utf8')).name, 'diff', 'Alternate diff package self-reference: ' + metadata)
    }
    if (directory === root) break
  }
  // The staged root need not itself have package.json. A surrounding package
  // scope can take precedence through a named self-reference before ordinary
  // node_modules lookup, even though the desired diff package exists below it.
  // Conservatively reject any enclosing self-named package, not just the scope
  // between importer and inputRoot.
  for (let directory = path.dirname(root);; directory = path.dirname(directory)) {
    const metadata = path.join(directory, 'package.json')
    if (status(metadata)) {
      noSymlinks(metadata)
      assert(status(metadata).isFile(), 'Native diff ancestor metadata must be a regular file')
      assert.notEqual(JSON.parse(fs.readFileSync(metadata, 'utf8')).name, 'diff', 'Alternate diff package self-reference: ' + metadata)
    }
    if (path.dirname(directory) === directory) break
  }
  return checked
}

function priorLocation(prior, filename) {
  const match = Object.entries(prior.inputs.trees).sort((a, b) => b[1].root.length - a[1].root.length)
    .find(([, tree]) => within(tree.root, filename))
  assert(match, 'Prior resolution is outside known input trees')
  return (match[0] === 'dependency-candidate' ? 'node_modules/zod-to-json-schema/' : '') +
    safeRelative(path.relative(match[1].root, filename).split(path.sep).join('/'))
}

// The sole production entry point. There are no configurable reports, source
// pins, metadata patches, omission patterns, or injectable resolution hooks.
export function createNativePackageResolutionRecipe({ packages, inputRoot, manifestFiles, runtimeCandidates, mappings, priorBytes, pathAliases }) {
  assert.deepEqual(packages, ['diff'], 'Native package resolution supports exactly one diff request')
  assert.equal(sha256(priorBytes), PRIOR_SHA256, 'Prior native package resolution report changed')
  const prior = JSON.parse(priorBytes), root = path.resolve(inputRoot)
  const reportBytes = fs.readFileSync(new URL('../audits/2026-10-03/source-reconstruction/diff-8.0.3-candidate.json', import.meta.url))
  assert.equal(sha256(reportBytes), REPORT_SHA256, 'Authenticated diff candidate report changed')
  const evidence = JSON.parse(reportBytes)
  const candidates = structuredClone(runtimeCandidates).filter(row => row.package === 'diff')
  assert.equal(candidates.length, 1, 'Exactly one validated diff runtime candidate is required')
  const candidate = candidates[0]
  assert.equal(candidate.report, REPORT, 'Unexpected diff candidate report')
  assert.equal(candidate.reportSha256, REPORT_SHA256, 'Unexpected diff candidate report hash')
  const validated = validateRuntimePackageCandidate(evidence, { files: candidate.files }, prior.inputs.trees.inputs.files)
  for (const [key, value] of Object.entries(validated)) assert.deepEqual(candidate[key], value, 'Validated diff candidate identity changed: ' + key)
  assert.equal(evidence.stage, 'complete')
  assert.deepEqual(evidence.counts, { byteEqual: 7, extraFilesExtracted: 41, mappedInputs: 7, mismatched: 0 })
  assert.equal(evidence.packageMetadata.value.exports['.'].import.default, './libesm/index.js')
  const files = ordered([
    ...evidence.mappedComparisons.map(row => ({ path: row.mappedPath, bytes: row.baselineBytes, sha256: row.baselineSha256 })),
    ...evidence.files,
  ])
  assert.equal(files.length, 48)
  const manifest = structuredClone(manifestFiles), byPath = new Map(manifest.map(file => [safeRelative(file.path), file]))
  assert.equal(byPath.size, manifest.length, 'Duplicate native package input manifest path')
  assert.deepEqual(ordered(manifest.filter(file => file.path.startsWith(PACKAGE_ROOT + '/'))), files, 'Staged diff manifest differs from authenticated candidate')
  const expectedMappings = new Map()
  for (const row of prior.resolutions) if (row.path && bare(row.specifier)) {
    const targets = expectedMappings.get(row.specifier) ?? new Set()
    targets.add(priorLocation(prior, row.path)); expectedMappings.set(row.specifier, targets)
  }
  assert.deepEqual(mappings, expectedMappings, 'Prior resolution mapping identities changed')
  const retained = omitNativeDiffAlias({ packages, mappings: expectedMappings, pathAliases })
  const aliases = structuredClone(retained)
  const original = new Map(prior.inputs.trees.inputs.files.map(file => [file.path, file]))
  const edges = prior.resolutions.filter(row => row.specifier === 'diff')
  assert.equal(edges.length, 7, 'Expected seven recorded diff importers')
  assert(!prior.unresolved.some(row => row.specifier === 'diff'), 'Prior diff request unresolved')
  const importers = edges.map(row => {
    assert.equal(priorLocation(prior, row.path), ENTRY, 'Prior diff target changed')
    const relative = priorLocation(prior, row.importer), source = original.get(relative)
    assert(source && byPath.has(relative), 'Recorded diff importer absent')
    assert.deepEqual(pin(byPath.get(relative)), source, 'Recorded diff importer manifest changed')
    return structuredClone(source)
  })
  assert.equal(new Set(importers.map(file => file.path)).size, 7, 'Duplicate recorded diff importer')
  function verify(requireConfig) {
    verifyNativeDiffFiles(root, files)
    const metadata = files.find(file => file.path === PACKAGE_ROOT + '/package.json')
    assert.equal(metadata.sha256, evidence.packageMetadata.sha256)
    assert.equal(metadata.bytes, evidence.packageMetadata.bytes)
    assert.deepEqual(JSON.parse(readPin(root, metadata)), evidence.packageMetadata.value, 'Authenticated diff root metadata changed')
    const nested = files.find(file => file.path === PACKAGE_ROOT + '/libesm/package.json')
    assert.deepEqual(JSON.parse(readPin(root, nested)), { type: 'module', sideEffects: false }, 'Authenticated diff ESM metadata changed')
    return importers.map(source => {
      readPin(root, source)
      return { source: structuredClone(source), expectedTarget: ENTRY,
        checkedPackagePaths: assertNativeDiffSearchPath({ inputRoot: root, importer: path.join(root, source.path), pathAliases: aliases, requireConfig }) }
    })
  }
  const records = verify(false)
  return { pathAliases: retained, verifyInputs: () => verify(true), recipe: {
    kind: 'authenticated-diff-native-package-resolution-diagnostic', sourceEquivalenceEstablished: false,
    packages: ['diff'], candidateReport: { path: REPORT, sha256: REPORT_SHA256 }, priorReportSha256: PRIOR_SHA256,
    removedPathAliases: { diff: ['./' + ENTRY] }, packageFiles: structuredClone(files), records,
    limitations: ['Only the diff path alias is omitted; all source bytes, authenticated metadata, and other alias identities remain unchanged.',
      'Native resolution is a diagnostic hypothesis; original package version and source equivalence are not established.',
      'Competing resolution inputs are checked immediately before and after compilation; concurrent mutations are unsupported.',
      'Strict whole-program AST equality is still required.'],
  } }
}
