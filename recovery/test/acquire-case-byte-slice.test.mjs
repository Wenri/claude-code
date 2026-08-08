import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(
  new URL('../scripts/acquire-case.mjs', import.meta.url),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acquire-byte-slice-'))
  const output = path.join(root, 'artifacts')
  fs.mkdirSync(path.join(output, 'source'), { recursive: true })
  const source = Buffer.from('prefix::embedded-code::suffix')
  fs.writeFileSync(path.join(output, 'source/input.bin'), source)
  return { root, output, source }
}

function writeManifest(root, artifacts) {
  const filename = path.join(root, 'manifest.json')
  fs.writeFileSync(
    filename,
    `${JSON.stringify({ case: 'byte-slice-test', artifacts }, null, 2)}\n`,
  )
  return filename
}

test('derives nested authenticated byte slices deterministically', () => {
  const { root, output, source } = fixture()
  try {
    const outer = source.subarray(8, 21)
    const inner = outer.subarray(0, 8)
    const manifest = writeManifest(root, [
      {
        id: 'source',
        localPath: 'source/input.bin',
        url: 'https://invalid.example/input.bin',
        bytes: source.length,
        sha256: sha256(source),
      },
      {
        id: 'inner',
        localPath: 'derived/inner.bin',
        bytes: inner.length,
        sha256: sha256(inner),
        byteSlice: {
          sourceArtifact: 'outer',
          offset: 0,
          bytes: inner.length,
          prefixHex: Buffer.from('embedded').toString('hex'),
        },
      },
      {
        id: 'outer',
        localPath: 'derived/outer.bin',
        bytes: outer.length,
        sha256: sha256(outer),
        byteSlice: {
          sourceArtifact: 'source',
          offset: 8,
          bytes: outer.length,
        },
      },
    ])

    const first = JSON.parse(
      execFileSync(
        process.execPath,
        [script, '--case', manifest, '--output', output],
        { encoding: 'utf8' },
      ),
    )
    assert.equal(
      first.artifacts.find(item => item.id === 'outer').status,
      'derived',
    )
    assert.equal(
      first.artifacts.find(item => item.id === 'inner').status,
      'derived',
    )
    assert.deepEqual(
      fs.readFileSync(path.join(output, 'derived/outer.bin')),
      outer,
    )
    assert.deepEqual(
      fs.readFileSync(path.join(output, 'derived/inner.bin')),
      inner,
    )

    const second = JSON.parse(
      execFileSync(
        process.execPath,
        [script, '--case', manifest, '--output', output],
        { encoding: 'utf8' },
      ),
    )
    assert.equal(
      second.artifacts.find(item => item.id === 'outer').status,
      'verified',
    )
    assert.equal(
      second.artifacts.find(item => item.id === 'inner').status,
      'verified',
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('rejects escaped ranges, prefix mismatches, and dependency cycles', () => {
  for (const scenario of ['range', 'prefix', 'cycle']) {
    const { root, output, source } = fixture()
    try {
      const derived = {
        id: 'derived',
        localPath: 'derived/output.bin',
        bytes: 4,
        sha256: sha256(source.subarray(0, 4)),
        byteSlice: {
          sourceArtifact: scenario === 'cycle' ? 'other' : 'source',
          offset: scenario === 'range' ? source.length - 1 : 0,
          bytes: 4,
          ...(scenario === 'prefix' ? { prefixHex: 'ffff' } : {}),
        },
      }
      const artifacts = [
        {
          id: 'source',
          localPath: 'source/input.bin',
          url: 'https://invalid.example/input.bin',
          bytes: source.length,
          sha256: sha256(source),
        },
        derived,
      ]
      if (scenario === 'cycle') {
        artifacts.push({
          id: 'other',
          localPath: 'derived/other.bin',
          bytes: 4,
          sha256: derived.sha256,
          byteSlice: {
            sourceArtifact: 'derived',
            offset: 0,
            bytes: 4,
          },
        })
      }
      const manifest = writeManifest(root, artifacts)
      const result = spawnSync(
        process.execPath,
        [script, '--case', manifest, '--output', output],
        { encoding: 'utf8' },
      )
      assert.notEqual(result.status, 0)
      assert.match(
        result.stderr,
        scenario === 'range'
          ? /exceeds/
          : scenario === 'prefix'
            ? /prefix mismatch/
            : /Could not resolve byteSlice artifact dependencies/,
      )
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  }
})
