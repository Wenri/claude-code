import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BASELINE_MAP_SHA256 = '7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657'
const VIRTUAL_ROOT = '/home/runner/code/tmp/claude-cli-external-build-2201'
const KNOWN = [
  {
    specifier: '@ant/computer-use-swift',
    importerRelative: 'src/utils/computerUse/swiftLoader.ts',
    sourceRelative: 'node_modules/@ant/computer-use-swift/js/index.js',
    importerBytes: 925, importerSha256: 'befc8c66944ccad352e245518ff9ccfae3697768be89b8c2f5915b5f231d802a',
    sourceBytes: 1084, sourceSha256: '462ef9dfef40f27851082bcf16846c07026657005f5cfdc6707200a55cc4512c',
  },
  {
    specifier: '@ant/computer-use-input',
    importerRelative: 'src/utils/computerUse/inputLoader.ts',
    sourceRelative: 'node_modules/@ant/computer-use-input/js/index.js',
    importerBytes: 1190, importerSha256: 'a48e836cd9652fc786e8ad0ddc7b3d9d910a64ed9de001ba964ad11f3d2f57ce',
    sourceBytes: 1313, sourceSha256: 'cdaa3d9958c9ad71cb2729fec25eed35d5cfaaa5de15933bf84ca5ac426e5e15',
  },
].map(rule => Object.freeze({ ...rule, virtualAbsolutePath: `${VIRTUAL_ROOT}/${rule.sourceRelative}` }))
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// These are input choices, not a claim that the original build recipe is known.
export function baselineVirtualNativeWrapperRules() {
  return KNOWN.map(({ specifier, importerRelative, sourceRelative, virtualAbsolutePath }) =>
    ({ specifier, importerRelative, sourceRelative, virtualAbsolutePath }))
}

export function createVirtualNativeWrapperRecipe({ inputRoot, manifestFiles, rules }) {
  assert.equal(typeof inputRoot, 'string')
  const root = path.resolve(inputRoot), rootStatus = fs.lstatSync(root)
  assert(rootStatus.isDirectory() && !rootStatus.isSymbolicLink(), 'Virtual-wrapper input root must be a real directory')
  assert(Array.isArray(manifestFiles), 'Staged file manifest is required')
  const manifest = new Map(manifestFiles.map(file => [file.path, file]))
  assert.equal(manifest.size, manifestFiles.length, 'Duplicate staged manifest path')
  assert(Array.isArray(rules) && rules.length === KNOWN.length, 'Exactly the two pinned virtual-wrapper rules are required')
  const selected = new Map()
  for (const rule of rules) {
    assert(rule && typeof rule === 'object' && !Array.isArray(rule), 'Invalid virtual-wrapper rule')
    assert.deepEqual(Object.keys(rule).sort(), ['importerRelative', 'sourceRelative', 'specifier', 'virtualAbsolutePath'], 'Unexpected virtual-wrapper rule fields')
    const expected = KNOWN.find(candidate => candidate.specifier === rule.specifier)
    assert(expected && !selected.has(rule.specifier), 'Unknown or duplicate virtual-wrapper specifier')
    for (const key of ['specifier', 'importerRelative', 'sourceRelative', 'virtualAbsolutePath']) {
      assert.equal(rule[key], expected[key], `Virtual-wrapper rule differs from pinned recipe: ${key}`)
    }
    selected.set(rule.specifier, expected)
  }
  function readPinned(relative, bytes, digest) {
    const pin = manifest.get(relative)
    assert(pin && pin.bytes === bytes && pin.sha256 === digest, `Virtual-wrapper manifest pin differs: ${relative}`)
    let filename = root
    const segments = relative.split('/')
    for (let i = 0; i < segments.length; i++) {
      filename = path.join(filename, segments[i])
      const status = fs.lstatSync(filename)
      assert(!status.isSymbolicLink(), `Symlink virtual-wrapper input is not accepted: ${relative}`)
      assert(i === segments.length - 1 ? status.isFile() : status.isDirectory(), `Nonregular virtual-wrapper input: ${relative}`)
    }
    const content = fs.readFileSync(filename)
    assert.equal(content.length, bytes, `Virtual-wrapper source length differs: ${relative}`)
    assert.equal(sha256(content), digest, `Virtual-wrapper source hash differs: ${relative}`)
    return content
  }
  const active = [...selected.values()].map(rule => {
    readPinned(rule.importerRelative, rule.importerBytes, rule.importerSha256)
    const content = readPinned(rule.sourceRelative, rule.sourceBytes, rule.sourceSha256)
    const contents = content.toString('utf8')
    assert(content.equals(Buffer.from(contents, 'utf8')), 'Virtual-wrapper UTF-8 decoding changed source bytes')
    return { ...rule, importerAbsolute: path.join(root, rule.importerRelative), contents }
  })
  const bySpecifier = new Map(active.map(rule => [rule.specifier, rule]))
  const byVirtualPath = new Map(active.map(rule => [rule.virtualAbsolutePath, rule]))
  const resolveFilter = new RegExp(`^(?:${active.map(rule => escapeRegex(rule.specifier)).join('|')})$`)
  const loadFilter = new RegExp(`^(?:${active.map(rule => escapeRegex(rule.virtualAbsolutePath)).join('|')})$`)
  const records = []
  const plugin = {
    name: 'pinned-virtual-native-wrappers',
    setup(build) {
      build.onResolve({ filter: resolveFilter, namespace: 'file' }, args => {
        const event = { hook: 'onResolve', specifier: args.path, importer: args.importer,
          namespace: args.namespace, kind: args.kind, accepted: false }
        records.push(event)
        const rule = bySpecifier.get(args.path)
        assert(rule, 'Unexpected virtual-wrapper resolver invocation')
        assert.equal(args.importer, rule.importerAbsolute, 'Unexpected importer for pinned virtual-wrapper specifier')
        readPinned(rule.importerRelative, rule.importerBytes, rule.importerSha256)
        readPinned(rule.sourceRelative, rule.sourceBytes, rule.sourceSha256)
        Object.assign(event, { accepted: true, virtualAbsolutePath: rule.virtualAbsolutePath,
          sourceRelative: rule.sourceRelative, sourceSha256: rule.sourceSha256 })
        return { path: rule.virtualAbsolutePath }
      })
      build.onLoad({ filter: loadFilter, namespace: 'file' }, args => {
        const event = { hook: 'onLoad', path: args.path, namespace: args.namespace, accepted: false }
        records.push(event)
        const rule = byVirtualPath.get(args.path)
        assert(rule, 'Unexpected virtual-wrapper loader invocation')
        const bytes = readPinned(rule.sourceRelative, rule.sourceBytes, rule.sourceSha256)
        assert(bytes.equals(Buffer.from(rule.contents, 'utf8')), 'Virtual-wrapper content changed after setup')
        Object.assign(event, { accepted: true, sourceRelative: rule.sourceRelative,
          sourceBytes: bytes.length, sourceSha256: rule.sourceSha256, loader: 'js' })
        return { contents: rule.contents, loader: 'js' }
      })
    },
  }
  const filename = fileURLToPath(import.meta.url)
  return {
    plugin, files: Object.fromEntries(active.map(rule => [rule.virtualAbsolutePath, rule.contents])), records,
    recipe: {
      kind: 'two-pinned-virtual-native-wrapper-inputs', sourceEquivalenceEstablished: false,
      baselineSourceMapSha256: BASELINE_MAP_SHA256, inputRoot: root,
      rules: active.map(({ contents, ...rule }) => rule),
      filters: { resolve: resolveFilter.source, load: loadFilter.source, namespace: 'file' },
      tool: { path: filename, sha256: sha256(fs.readFileSync(filename)) },
      limitations: ['Only two exact package specifiers from two exact pinned importers are intercepted; other imports use the existing compiler resolver.',
        'Virtual files preserve every wrapper source byte and provide compiler-visible paths; this helper writes no files, including at the virtual root.',
        'The path recipe is an explicit candidate for emitted __dirname values, not an original-profile or native-runtime equivalence claim. Full emitted AST comparison remains required.'],
    },
  }
}
