import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { summarizeSourceMap } from '../lib/source-map.mjs'
import { verifyBaseline } from '../scripts/verify-case.mjs'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function fixture() {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'verify-source-deletion-'),
  )
  const sourceRoot = path.join(temporary, 'src')
  fs.mkdirSync(sourceRoot)
  fs.writeFileSync(path.join(sourceRoot, 'keep.ts'), 'keep\n')

  const map = {
    version: 3,
    names: [],
    sources: ['../src/keep.ts', '../src/delete.ts'],
    sourcesContent: ['keep\n', 'delete\n'],
    mappings: 'AAAA;ACAA',
  }
  const mapPath = path.join(temporary, 'cli.js.map')
  fs.writeFileSync(mapPath, JSON.stringify(map))

  const applicationHash = crypto.createHash('sha256')
  for (let index = 0; index < map.sources.length; index += 1) {
    applicationHash
      .update(map.sources[index])
      .update('\0')
      .update(sha256(map.sourcesContent[index]))
      .update('\0')
  }
  const oracle = {
    applicationSourceCount: 2,
    applicationSourceBytes: 12,
    applicationManifestSha256: applicationHash.digest('hex'),
    tsxSourceCount: 0,
    nestedOriginalBytes: 0,
    nestedOriginalManifestSha256: sha256(''),
    sourceMap: summarizeSourceMap(map),
  }
  const appliedSourceTree = {
    base: 'fixture',
    patchSet: 'fixture-source-deletion',
    files: [
      {
        path: 'src/commands/../delete.ts'.replace('commands/../', ''),
        target: 'absent',
      },
    ],
  }

  return {
    appliedSourceTree,
    mapPath,
    oracle,
    sourceRoot,
    temporary,
  }
}

test('accepts a source-map-owned file explicitly deleted by the overlay', () => {
  const value = fixture()
  try {
    const result = verifyBaseline(
      value.mapPath,
      value.temporary,
      value.oracle,
      value.appliedSourceTree,
    )
    assert.equal(result.repositoryState.kind, 'verified-recovered-overlay')
    assert.deepEqual(result.repositoryState.appliedFiles, [
      {
        path: 'src/delete.ts',
        baseline: 'source-map',
        target: 'absent',
      },
    ])
  } finally {
    fs.rmSync(value.temporary, { recursive: true, force: true })
  }
})

test('recognizes the same deletion assertion on the untouched baseline', () => {
  const value = fixture()
  try {
    fs.writeFileSync(path.join(value.sourceRoot, 'delete.ts'), 'delete\n')
    const result = verifyBaseline(
      value.mapPath,
      value.temporary,
      value.oracle,
      value.appliedSourceTree,
    )
    assert.deepEqual(result.repositoryState, {
      kind: 'exact-baseline',
      appliedFiles: [],
    })
  } finally {
    fs.rmSync(value.temporary, { recursive: true, force: true })
  }
})
