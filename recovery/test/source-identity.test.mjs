import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalSourcePath, identicalSourcePaths, indexSourceContents } from '../lib/source-identity.mjs'

test('nested package copies and package-local src retain their full identity', () => {
  for (const name of [
    'node_modules/first/node_modules/shared/index.js',
    'node_modules/second/node_modules/shared/index.js',
    'node_modules/@ant/one/src/types.ts',
    'node_modules/@ant/two/src/types.ts',
    'src/types.ts',
  ]) assert.equal(canonicalSourcePath(`../${name}`, ['../']), name)
})

test('only explicit nonoverlapping build roots are accepted', () => {
  assert.equal(canonicalSourcePath('/build/src/a.ts', ['/build/']), 'src/a.ts')
  assert.equal(canonicalSourcePath('/unknown/src/a.ts', ['/build/']), null)
  assert.throws(() => canonicalSourcePath('/build/src/a.ts', ['/', '/build/']), /Ambiguous/)
  for (const name of ['../src/../a.ts', '../src//a.ts', '../src/./a.ts', '../src/a\\b.ts']) {
    assert.throws(() => canonicalSourcePath(name, ['../']), /Unsafe/)
  }
})

test('source-content comparison rejects changed files and path collisions', () => {
  const left = indexSourceContents({ sources: ['../src/a.ts', '../src/b.ts'], sourcesContent: ['same', 'before'] }, ['../'])
  const right = indexSourceContents({ sources: ['/build/src/a.ts', '/build/src/b.ts'], sourcesContent: ['same', 'after'] }, ['/build/'])
  assert.deepEqual([...identicalSourcePaths(left, right)], ['src/a.ts'])
  assert.throws(() => indexSourceContents({ sources: ['../src/a.ts', '/build/src/a.ts'], sourcesContent: ['one', 'two'] }, ['../', '/build/']), /collision/)
  assert.throws(() => indexSourceContents({ sources: ['../src/a.ts'], sourcesContent: [null] }, ['../']), /Missing/)
})
