import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolvePinnedInput } from '../checked-roots.mjs'
import { diagnosticDependencyFiles } from '../../naming-diagnostic-artifacts.mjs'

export const ROOT = path.dirname(fileURLToPath(import.meta.url))
export const RECOVERY = path.resolve(ROOT, '../../..')
export const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
export const canonical = value => JSON.stringify(sort(value)) + '\n'
function sort(value) {
  if (Array.isArray(value)) return value.map(sort)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])]))
  return value
}

// Bounded hashing also covers the Node executable without reading it all at once.
function hashFile(filename) {
  const fd = fs.openSync(filename, 'r'), chunk = Buffer.allocUnsafe(1024 * 1024), hash = crypto.createHash('sha256')
  let bytes = 0
  try { while (true) { const n = fs.readSync(fd, chunk, 0, chunk.length, null); if (!n) break; bytes += n; hash.update(chunk.subarray(0, n)) } }
  finally { fs.closeSync(fd) }
  return { bytes, sha256: hash.digest('hex') }
}

// Fixed read closure. Caller-supplied paths never become tool/dependency reads.
export function protectedToolFiles() {
  return [
    ...['backend.mjs', 'toolchain.mjs', 'cli.mjs', 'converter.mjs', 'package.json'].map(name => path.join(ROOT, name)),
    ...['binding-graph.mjs', 'binding-name-constraints.mjs', 'naming-diagnostic-artifacts.mjs'].map(name => path.join(RECOVERY, 'lib', name)),
    ...['package.json', 'package-lock.json'].map(name => path.join(RECOVERY, name)),
    path.join(ROOT, '../checked-roots.mjs'),
    ...diagnosticDependencyFiles(path.join(RECOVERY, 'node_modules')),
    fs.realpathSync(process.execPath),
  ]
}

export function currentToolPins() {
  for (const [name, version] of [['acorn', '8.15.0'], ['eslint-scope', '9.1.2']]) {
    assert.equal(JSON.parse(fs.readFileSync(path.join(RECOVERY, 'node_modules', name, 'package.json'), 'utf8')).version, version,
      `Unsupported installed dependency version: ${name}`)
  }
  const files = protectedToolFiles().map(filename => {
    const runtime = filename === fs.realpathSync(process.execPath);
    const pin = {root:runtime?'nodeRuntime':'recovery',path:runtime?path.basename(filename):path.relative(RECOVERY,filename).split(path.sep).join('/'),...hashFile(filename)};
    resolvePinnedInput({recovery:RECOVERY,nodeRuntime:path.dirname(fs.realpathSync(process.execPath))},pin);
    return pin;
  }).sort((a,b)=>(a.root+':'+a.path).localeCompare(b.root+':'+b.path))
  return { schemaVersion: 1, kind: 'frozen-naming-tool-closure', nodeVersion: process.version,
    parser: { package: 'acorn', version: '8.15.0', ecmaVersion: 2026, sourceType: 'module', allowHashBang: true, ranges: true },
    scope: { package: 'eslint-scope', version: '9.1.2', ecmaVersion: 2024, sourceType: 'module', optimistic: true, ignoreEval: true }, files }
}

export function validateToolPins(expected) {
  assert.equal(canonical(expected), canonical(currentToolPins()), 'Pinned tool/dependency closure or runtime differs')
  return sha256(canonical(expected))
}

export function readCanonicalJSON(bytes, label) {
  assert(Buffer.isBuffer(bytes), `${label} must be exact UTF-8 bytes`)
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes))
  assert(Buffer.from(canonical(value)).equals(bytes), `${label} must be canonical JSON (sorted object keys, compact form, newline; no duplicate keys)`)
  return value
}
