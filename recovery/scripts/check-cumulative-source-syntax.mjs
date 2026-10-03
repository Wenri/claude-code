#!/usr/bin/env bun
// Parses source text only. It never links, imports, or executes application modules.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'

const args = process.argv.slice(2)
if (args.length !== 0 && (args.length !== 2 || args[0] !== '--source-root')) {
  throw new Error('Usage: bun check-cumulative-source-syntax.mjs [--source-root DIR]')
}
const sourceRoot = path.resolve(args[1] ?? fileURLToPath(new URL('../../src', import.meta.url)))
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const failures = []
const files = []
let excludedDeclarations = 0
const relative = filename => path.relative(sourceRoot, filename).split(path.sep).join('/')

function walk(directory) {
  let entries
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true })
  } catch (error) {
    failures.push({ file: relative(directory), stage: 'walk', error: String(error) })
    return
  }
  for (const entry of entries) {
    const filename = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) {
      failures.push({ file: relative(filename), stage: 'walk', error: 'Symlinks are not followed; source coverage is incomplete.' })
    } else if (entry.isDirectory()) {
      walk(filename)
    } else if (entry.isFile() && /\.(?:tsx?|jsx?|mjs|cjs|mts|cts)$/.test(entry.name)) {
      if (/\.d\.[cm]?ts$/.test(entry.name)) excludedDeclarations += 1
      else files.push(filename)
    }
  }
}

walk(sourceRoot)
files.sort()
if (files.length === 0) failures.push({ file: '.', stage: 'walk', error: 'No source modules found.' })
const transpilers = new Map()
const sourceManifest = []
let transformedModules = 0
let parsedModules = 0
for (const filename of files) {
  const file = relative(filename)
  let source
  try {
    const bytes = fs.readFileSync(filename)
    sourceManifest.push({ file, bytes: bytes.length, sha256: sha256(bytes) })
    source = bytes.toString('utf8')
  } catch (error) {
    failures.push({ file, stage: 'read', error: String(error) })
    continue
  }
  const loader = filename.endsWith('.tsx') ? 'tsx'
    : /\.(?:ts|mts|cts)$/.test(filename) ? 'ts'
      : filename.endsWith('.jsx') ? 'jsx' : 'js'
  if (!transpilers.has(loader)) {
    transpilers.set(loader, new Bun.Transpiler({ loader, trimUnusedImports: false, treeShaking: false }))
  }
  let emitted
  try {
    emitted = transpilers.get(loader).transformSync(source)
    transformedModules += 1
  } catch (error) {
    failures.push({ file, stage: 'transpile', error: String(error) })
    continue
  }
  try {
    parse(emitted, { ecmaVersion: 2026, sourceType: 'module', allowHashBang: true, allowReturnOutsideFunction: true })
    parsedModules += 1
  } catch (error) {
    failures.push({ file, stage: 'emitted-javascript-parse', error: String(error) })
  }
}

console.log(JSON.stringify({
  schemaVersion: 1,
  criterion: 'cumulative-unbundled-source-syntax-v1',
  status: failures.length === 0 ? 'syntax-checked' : 'syntax-check-failed',
  tooling: {
    bunVersion: Bun.version,
    bunRevision: Bun.revision,
    acornVersion: JSON.parse(fs.readFileSync(new URL('../node_modules/acorn/package.json', import.meta.url))).version,
    ecmaVersion: 2026,
    scriptSha256: sha256(fs.readFileSync(fileURLToPath(import.meta.url))),
  },
  sourceRoot,
  sourceFileManifestSha256: sha256(JSON.stringify(sourceManifest)),
  sourceModules: files.length,
  transformedModules,
  parsedModules,
  excludedDeclarations,
  failures,
  limitations: [
    'This checks all discovered current source modules sequentially, not frozen historical source trees.',
    'Bun parses original text and transpiles each module without linking or executing it; Acorn parses emitted JavaScript.',
    'Type declarations, type correctness, import resolution, dependency exports, native inputs and build macros are not verified.',
    'Bun may eliminate branches and imports, including feature() defaults; emitted code is not used as a reachability or dependency inventory.',
    'Syntax acceptance does not establish application buildability, behavior, or equivalence with an official artifact.',
  ],
}, null, 2))
process.exitCode = failures.length === 0 ? 0 : 1
