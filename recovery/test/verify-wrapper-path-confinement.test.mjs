import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { readConfinedCaseFile } from '../scripts/verify-2.1.121-recovery.mjs'

function caseFixture(t) {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'recovery-wrapper-confinement-'),
  )
  t.after(() => fs.rmSync(temporaryRoot, { force: true, recursive: true }))
  const caseRoot = path.join(temporaryRoot, 'case')
  fs.mkdirSync(caseRoot)
  return { caseRoot, temporaryRoot }
}

test('confined case reader reads a regular nested file', t => {
  const { caseRoot } = caseFixture(t)
  fs.mkdirSync(path.join(caseRoot, 'semantic'))
  fs.writeFileSync(path.join(caseRoot, 'semantic', 'evidence.json'), '{"ok":true}\n')

  assert.deepEqual(
    readConfinedCaseFile(
      caseRoot,
      'semantic/evidence.json',
      'valid evidence',
    ),
    Buffer.from('{"ok":true}\n'),
  )
})

test('confined case reader rejects lexical traversal', t => {
  const { caseRoot, temporaryRoot } = caseFixture(t)
  fs.writeFileSync(path.join(temporaryRoot, 'outside.txt'), 'outside')

  assert.throws(
    () => readConfinedCaseFile(caseRoot, '../outside.txt', 'traversal'),
    /unsafe relative path/,
  )
  assert.throws(
    () => readConfinedCaseFile(caseRoot, 'nested/../../outside.txt', 'traversal'),
    /unsafe relative path/,
  )
})

test('confined case reader rejects an intermediate symbolic link', t => {
  const { caseRoot, temporaryRoot } = caseFixture(t)
  const outside = path.join(temporaryRoot, 'outside')
  fs.mkdirSync(outside)
  fs.writeFileSync(path.join(outside, 'evidence.json'), '{}\n')
  fs.symlinkSync(outside, path.join(caseRoot, 'semantic'))

  assert.throws(
    () =>
      readConfinedCaseFile(
        caseRoot,
        'semantic/evidence.json',
        'intermediate link',
      ),
    /symbolic-link path component/,
  )
})

test('confined case reader rejects a final symbolic link', t => {
  const { caseRoot, temporaryRoot } = caseFixture(t)
  fs.mkdirSync(path.join(caseRoot, 'semantic'))
  const outside = path.join(temporaryRoot, 'outside.json')
  fs.writeFileSync(outside, '{}\n')
  fs.symlinkSync(outside, path.join(caseRoot, 'semantic', 'evidence.json'))

  assert.throws(
    () =>
      readConfinedCaseFile(
        caseRoot,
        'semantic/evidence.json',
        'final link',
      ),
    /symbolic-link path component/,
  )
})

test('confined case reader rejects a non-regular final target', t => {
  const { caseRoot } = caseFixture(t)
  fs.mkdirSync(path.join(caseRoot, 'semantic'))
  fs.mkdirSync(path.join(caseRoot, 'semantic', 'evidence.json'))

  assert.throws(
    () =>
      readConfinedCaseFile(
        caseRoot,
        'semantic/evidence.json',
        'directory target',
      ),
    /expected a regular file/,
  )
})

test('confined case reader rejects a non-directory intermediate target', t => {
  const { caseRoot } = caseFixture(t)
  fs.writeFileSync(path.join(caseRoot, 'semantic'), 'not a directory')

  assert.throws(
    () =>
      readConfinedCaseFile(
        caseRoot,
        'semantic/evidence.json',
        'file component',
      ),
    /non-directory path component/,
  )
})

test('confined case reader rejects a symbolic-link case root', t => {
  const { caseRoot, temporaryRoot } = caseFixture(t)
  const outside = path.join(temporaryRoot, 'outside')
  fs.mkdirSync(outside)
  fs.writeFileSync(path.join(outside, 'value.txt'), 'outside')
  fs.rmSync(caseRoot, { recursive: true })
  fs.symlinkSync(outside, caseRoot, 'dir')

  assert.throws(
    () => readConfinedCaseFile(caseRoot, 'value.txt', 'linked root'),
    /case root must be a real directory/,
  )
})

test('confined case reader binds the checked root across realpath resolution', t => {
  const { caseRoot, temporaryRoot } = caseFixture(t)
  const displaced = path.join(temporaryRoot, 'checked-case')
  const outside = path.join(temporaryRoot, 'outside')
  fs.mkdirSync(outside)
  fs.writeFileSync(path.join(caseRoot, 'value.txt'), 'inside')
  fs.writeFileSync(path.join(outside, 'value.txt'), 'outside')

  const originalRealpathSync = fs.realpathSync
  let substituted = false
  fs.realpathSync = function injectedRootSubstitution(filename, ...arguments_) {
    if (!substituted && path.resolve(filename) === path.resolve(caseRoot)) {
      substituted = true
      fs.renameSync(caseRoot, displaced)
      fs.symlinkSync(outside, caseRoot, 'dir')
    }
    return originalRealpathSync.call(this, filename, ...arguments_)
  }
  try {
    assert.throws(
      () => readConfinedCaseFile(caseRoot, 'value.txt', 'substituted root'),
      /case root changed while resolving/,
    )
  } finally {
    fs.realpathSync = originalRealpathSync
  }
  assert.equal(substituted, true)
})
