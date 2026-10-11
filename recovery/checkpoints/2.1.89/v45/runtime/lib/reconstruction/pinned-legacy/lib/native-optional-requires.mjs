import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'acorn'
import { analyze } from 'eslint-scope'
import { BASELINE_MAP_SHA256, inventoryTree, safeRelative, sha256 } from './diagnostic-build-inputs.mjs'

export const NATIVE_OPTIONAL_REQUIRE_MODE = 'pinned-six-v1'
const REVIEW_URL = new URL('../audits/2026-10-03/source-reconstruction/optional-require-review/site-review.json', import.meta.url)
const REVIEW_SHA256 = 'aa880ccd304b7f78640dfcebe549140c55493fdee26cb82688718620ed777f8a'
const PRIOR_SHA256 = '7c102e676865e20d68707fad56145ecefe746a2dc5d78cd97506dadf34feb594'

function review() {
  const bytes = fs.readFileSync(REVIEW_URL)
  assert.equal(sha256(bytes), REVIEW_SHA256, 'Optional-require review changed')
  const result = JSON.parse(bytes)
  assert.equal(result.baselineMapSha256, BASELINE_MAP_SHA256)
  assert.equal(result.priorReport.sha256, PRIOR_SHA256)
  assert.equal(result.rows.length, 6)
  return result
}
export function reviewedOptionalRequireSites() { return review().rows }

// This parser is diagnostic only. Production acceptance also requires every
// owner byte to match its fixed, independently reviewed source pin.
export function inspectOptionalRequireSite(source, specifier) {
  const ast = parse(source, { ecmaVersion: 2026, sourceType: 'script', ranges: true })
  const scopes = analyze(ast, { ecmaVersion: 2024, sourceType: 'script', optimistic: true, ignoreEval: true })
  const hostRequire = new Set(scopes.scopes.flatMap(scope => scope.references)
    .filter(ref => ref.identifier.name === 'require' && !ref.resolved).map(ref => ref.identifier.start))
  const matches = []
  function visit(node, ancestors) {
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require' &&
        node.arguments.length === 1 && node.arguments[0].type === 'Literal' && node.arguments[0].value === specifier) {
      assert(!node.optional && hostRequire.has(node.callee.start), 'Optional require is shadowed or optional-chained')
      const enclosing = ancestors.filter(parent => parent.type === 'TryStatement' && parent.handler &&
        node.start >= parent.block.start && node.end <= parent.block.end).at(-1)
      assert(enclosing, 'Optional require lacks enclosing try/catch')
      matches.push({ range: [node.start, node.end], line: source.slice(0, node.start).split('\n').length,
        text: source.slice(node.start, node.end), requireBinding: 'unresolved-host-require',
        tryRange: [enclosing.start, enclosing.end], tryBlockRange: [enclosing.block.start, enclosing.block.end],
        catchRange: [enclosing.handler.start, enclosing.handler.end], catchText: source.slice(enclosing.handler.start, enclosing.handler.end),
        guards: ancestors.filter(parent => ['IfStatement', 'ConditionalExpression'].includes(parent.type))
          .map(parent => ({ type: parent.type, test: source.slice(parent.test.start, parent.test.end) })) })
    }
    for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value])
      if (child && typeof child.type === 'string') visit(child, [...ancestors, node])
  }
  visit(ast, [])
  assert.equal(matches.length, 1, 'Expected one exact optional require call')
  return matches[0]
}

// The original review scans every mapped input. Authenticated supplemental
// sources were added later and need their own exact static-request check.
export function assertNoAdditionalOptionalRequests(source, filename, specifiers) {
  if (!/\.(?:[cm]?js)$/.test(filename))
    throw new Error('Cannot audit additional non-JavaScript source: ' + filename)
  const ast = parse(source, { ecmaVersion: 2026, sourceType: 'module', allowReturnOutsideFunction: true, allowHashBang: true })
  function text(node) {
    if (node?.type === 'Literal' && typeof node.value === 'string') return node.value
    if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked
    return null
  }
  const stack = [ast]
  while (stack.length) {
    const node = stack.pop()
    let request = null
    if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression'].includes(node.type)) request = text(node.source)
    else if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require') request = text(node.arguments[0])
    assert(!specifiers.includes(request), 'Additional optional module request: ' + filename + ': ' + request)
    for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value])
      if (child && typeof child.type === 'string') stack.push(child)
  }
}

function status(filename) {
  try { return fs.lstatSync(filename) } catch (error) { if (error.code !== 'ENOENT') throw error }
}
function noSymlinkAncestors(filename) {
  let current = path.resolve(filename)
  while (true) {
    const stat = status(current)
    assert(!stat?.isSymbolicLink(), 'Symlink in optional-require search path: ' + current)
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
}
function packageName(specifier) { return specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/') }

// Conservative absence guard, rather than attempting to emulate Bun's resolver.
// A present package directory is rejected even if exports would deny this request.
// Checking all ancestor directories also covers nested node_modules layouts.
export function assertOptionalPackageAbsent({ inputRoot, importer, specifier, environment = process.env }) {
  assert(!environment.NODE_PATH, 'NODE_PATH is unsupported for native optional requires')
  safeRelative(specifier)
  const root = path.resolve(inputRoot), owner = path.resolve(importer)
  assert(owner.startsWith(root + path.sep), 'Optional importer must be inside staged inputs')
  noSymlinkAncestors(owner)
  const pkg = packageName(specifier), checked = new Set()
  function absent(filename) {
    noSymlinkAncestors(filename)
    assert(!status(filename), 'Optional package may resolve: ' + filename)
    checked.add(filename)
  }
  function absentFamily(filename) {
    absent(filename)
    const parent = path.dirname(filename), prefix = path.basename(filename) + '.'
    if (status(parent)) {
      noSymlinkAncestors(parent)
      for (const entry of fs.readdirSync(parent))
        if (entry.startsWith(prefix)) absent(path.join(parent, entry))
    }
  }
  let directory = path.dirname(owner)
  while (true) {
    absentFamily(path.join(directory, 'node_modules', pkg))
    const metadata = path.join(directory, 'package.json')
    if (status(metadata)) {
      noSymlinkAncestors(metadata)
      const value = JSON.parse(fs.readFileSync(metadata, 'utf8'))
      assert.notEqual(value.name, pkg, 'Optional package self-reference may resolve: ' + metadata)
    }
    const parent = path.dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  // The generated tsconfig has baseUrl:".". Guard its bare-file/directory path
  // as well as node_modules. Reject every dotted suffix rather than silently
  // relying on a guessed extension search order. This is intentionally stricter
  // than resolution: an unrelated package-name.backup also blocks the candidate.
  absentFamily(path.join(root, pkg))
  return [...checked].sort()
}

export function assertOptionalResolverConfig({ inputRoot, importer, pathAliases }) {
  const root = path.resolve(inputRoot), filename = path.resolve(importer)
  assert(filename.startsWith(root + path.sep), 'Optional importer must be inside staged inputs')
  const config = path.join(root, 'tsconfig.json')
  noSymlinkAncestors(config)
  assert.deepEqual(JSON.parse(fs.readFileSync(config, 'utf8')), { compilerOptions: { baseUrl: '.', paths: pathAliases } },
    'Optional root resolver config changed')
  let directory = path.dirname(filename)
  while (true) {
    for (const name of ['tsconfig.json', 'jsconfig.json']) {
      const candidate = path.join(directory, name)
      if (candidate !== config) assert(!status(candidate), 'Unreviewed optional resolver config: ' + candidate)
    }
    if (directory === root) break
    directory = path.dirname(directory)
  }
}

function matchesPattern(pattern, specifier) {
  const escaped = pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')
  return new RegExp('^' + escaped + '$').test(specifier)
}
export function assertNoOptionalResolutionOverrides({ specifier, pathAliases, external }) {
  for (const alias of Object.keys(pathAliases))
    assert(!matchesPattern(alias, specifier), 'Optional require has path alias: ' + alias)
  for (const rule of external) {
    assert(typeof rule === 'string', 'Invalid external rule')
    assert(!matchesPattern(rule, specifier) && !specifier.startsWith(rule + '/'), 'Another external rule covers optional require: ' + rule)
  }
}

// The only production entry point. It cannot accept alternate evidence, source
// pins, arbitrary omission lists, or an injected filesystem/resolver.
export function createNativeOptionalRequireRecipe({ mode, inputRoot, manifestFiles, priorBytes, pathAliases, external }) {
  assert.equal(mode, NATIVE_OPTIONAL_REQUIRE_MODE, 'Unknown native optional-require mode')
  assert.equal(sha256(priorBytes), PRIOR_SHA256, 'Prior optional-require resolution report changed')
  const evidence = review(), prior = JSON.parse(priorBytes), root = path.resolve(inputRoot)
  manifestFiles = structuredClone(manifestFiles)
  pathAliases = structuredClone(pathAliases)
  const pins = new Map(manifestFiles.map(row => [row.path, row]))
  assert.equal(pins.size, manifestFiles.length, 'Duplicate input manifest path')
  const specifiers = new Set(evidence.rows.map(row => row.specifier))
  assert.equal(specifiers.size, 6)
  for (const specifier of specifiers) assert.equal(external.filter(rule => rule === specifier).length, 1,
    'Expected exactly one explicit optional external rule: ' + specifier)
  const retained = external.filter(rule => !specifiers.has(rule))
  function verifyInputs() {
    const actual = inventoryTree(root).files
    const expected = manifestFiles.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 }))
      .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
    assert.deepEqual(actual, expected, 'Staged optional-require input inventory changed')
    const original = new Map(prior.inputs.trees.inputs.files.map(pin => [pin.path, pin]))
    for (const file of actual) {
      const mapped = original.get(file.path)
      if (mapped) assert.deepEqual(file, mapped, 'Mapped optional-require scan pin changed')
      else if (/\.(?:[cm]?[jt]sx?)$/.test(file.path))
        assertNoAdditionalOptionalRequests(fs.readFileSync(path.join(root, file.path), 'utf8'), file.path, [...specifiers])
    }
    const records = []
    for (const row of evidence.rows) {
      assert.deepEqual(prior.unresolved.filter(edge => edge.specifier === row.specifier), row.priorUnresolved,
        'Optional unresolved edge changed')
      assert.deepEqual(prior.resolutions.filter(edge => edge.specifier === row.specifier), row.priorResolutions,
        'Optional resolved edge changed')
      const pin = pins.get(row.source.path)
      assert(pin && pin.bytes === row.source.bytes && pin.sha256 === row.source.sha256, 'Optional owner manifest pin changed')
      const filename = path.join(root, safeRelative(row.source.path))
      assertOptionalResolverConfig({ inputRoot: root, importer: filename, pathAliases })
      noSymlinkAncestors(filename)
      assert(fs.lstatSync(filename).isFile(), 'Optional owner must be a regular file')
      const bytes = fs.readFileSync(filename)
      assert.equal(bytes.length, row.source.bytes, 'Optional owner byte length changed')
      assert.equal(sha256(bytes), row.source.sha256, 'Optional owner source hash changed')
      assert.deepEqual(inspectOptionalRequireSite(bytes.toString('utf8'), row.specifier), row.call, 'Optional source call/catch changed')
      assertNoOptionalResolutionOverrides({ specifier: row.specifier, pathAliases, external: retained })
      const absencePaths = assertOptionalPackageAbsent({ inputRoot: root, importer: filename, specifier: row.specifier })
      records.push({ specifier: row.specifier, source: structuredClone(row.source), call: structuredClone(row.call), absencePaths })
    }
    return records
  }
  const records = verifyInputs()
  return { external: retained, verifyInputs, recipe: { kind: 'six-native-unresolved-requires-diagnostic', mode,
    sourceEquivalenceEstablished: false, reviewSha256: REVIEW_SHA256, priorReportSha256: PRIOR_SHA256,
    removedExternalRules: [...specifiers], records,
    limitations: ['Omitting six external rules is a native compiler hypothesis, not a source transform or equivalence proof.',
      'Package absence is checked immediately before and after compilation; concurrent environment mutations are unsupported.',
      'Exact baseline throw-IIFE emission and strict whole-program AST comparison are still required.'] } }
}
