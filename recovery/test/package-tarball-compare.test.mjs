import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(
  new URL('../scripts/compare-npm-tarballs.mjs', import.meta.url),
)

function writeString(header, offset, length, value) {
  const encoded = Buffer.from(value)
  assert.ok(encoded.length <= length)
  encoded.copy(header, offset)
}

function writeOctal(header, offset, length, value) {
  const encoded = `${value.toString(8).padStart(length - 1, '0')}\0`
  writeString(header, offset, length, encoded)
}

function tarball(entries) {
  const blocks = []
  for (const entry of entries) {
    const content = Buffer.from(entry.content)
    const header = Buffer.alloc(512)
    writeString(header, 0, 100, entry.path)
    writeOctal(header, 100, 8, entry.mode)
    writeOctal(header, 108, 8, 0)
    writeOctal(header, 116, 8, 0)
    writeOctal(header, 124, 12, content.length)
    writeOctal(header, 136, 12, 0)
    header.fill(32, 148, 156)
    header[156] = '0'.charCodeAt(0)
    writeString(header, 257, 6, 'ustar\0')
    writeString(header, 263, 2, '00')
    const checksum = header.reduce((sum, byte) => sum + byte, 0)
    writeString(
      header,
      148,
      8,
      `${checksum.toString(8).padStart(6, '0')}\0 `,
    )
    blocks.push(header, content)
    const padding = (512 - (content.length % 512)) % 512
    if (padding > 0) blocks.push(Buffer.alloc(padding))
  }
  blocks.push(Buffer.alloc(1024))
  return zlib.gzipSync(Buffer.concat(blocks), { level: 9, mtime: 0 })
}

function hash(algorithm, value, encoding = 'hex') {
  return crypto.createHash(algorithm).update(value).digest(encoding)
}

test('reports every member and verifies deterministic authenticated inputs', () => {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'package-tarball-compare-test-'),
  )
  try {
    const baseline = tarball([
      {
        path: 'package/removed.txt',
        mode: 0o644,
        content: 'removed',
      },
      { path: 'package/same.txt', mode: 0o644, content: 'same' },
      { path: 'package/changed.txt', mode: 0o644, content: 'before' },
      { path: 'package/mode.txt', mode: 0o644, content: 'same bytes' },
    ])
    const target = tarball([
      { path: 'package/added.txt', mode: 0o644, content: 'added' },
      { path: 'package/mode.txt', mode: 0o755, content: 'same bytes' },
      { path: 'package/changed.txt', mode: 0o644, content: 'after' },
      { path: 'package/same.txt', mode: 0o644, content: 'same' },
    ])
    const baselineFile = path.join(temporary, 'baseline.tgz')
    const targetFile = path.join(temporary, 'target.tgz')
    fs.writeFileSync(baselineFile, baseline)
    fs.writeFileSync(targetFile, target)

    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'P-256',
    })
    const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' })
    const common = [
      '--baseline',
      baselineFile,
      '--target',
      targetFile,
      '--package-name',
      '@example/package',
      '--baseline-version',
      '1.0.0',
      '--target-version',
      '1.0.1',
      '--baseline-shasum',
      hash('sha1', baseline),
      '--target-shasum',
      hash('sha1', target),
      '--baseline-integrity',
      `sha512-${hash('sha512', baseline, 'base64')}`,
      '--target-integrity',
      `sha512-${hash('sha512', target, 'base64')}`,
      '--registry-key-id',
      'test-key',
      '--registry-public-key',
      publicKeyDer.toString('base64'),
    ]
    for (const [side, version, archive] of [
      ['baseline', '1.0.0', baseline],
      ['target', '1.0.1', target],
    ]) {
      const integrity = `sha512-${hash('sha512', archive, 'base64')}`
      const message = `@example/package@${version}:${integrity}`
      common.push(
        `--${side}-signature`,
        crypto.sign('sha256', Buffer.from(message), privateKey).toString(
          'base64',
        ),
      )
    }

    const reports = ['report-a.json', 'report-b.json'].map(filename =>
      path.join(temporary, filename),
    )
    for (const report of reports) {
      execFileSync(process.execPath, [script, ...common, '--output', report])
    }
    assert.deepEqual(
      fs.readFileSync(reports[0]),
      fs.readFileSync(reports[1]),
    )

    const report = JSON.parse(fs.readFileSync(reports[0], 'utf8'))
    assert.deepEqual(report.summary, {
      unionMemberCount: 5,
      baselineMemberCount: 4,
      targetMemberCount: 4,
      unchanged: 1,
      changed: 2,
      added: 1,
      removed: 1,
      complete: true,
    })
    assert.deepEqual(
      report.members.map(member => [member.path, member.status]),
      [
        ['package/added.txt', 'added'],
        ['package/changed.txt', 'changed'],
        ['package/mode.txt', 'changed'],
        ['package/removed.txt', 'removed'],
        ['package/same.txt', 'unchanged'],
      ],
    )
    const mode = report.members.find(
      member => member.path === 'package/mode.txt',
    )
    assert.equal(mode.baseline.mode, '0644')
    assert.equal(mode.target.mode, '0755')
    assert.equal(
      report.artifacts.baseline.authentication.registrySignature.verified,
      true,
    )
    assert.equal(
      report.artifacts.target.authentication.registrySignature.verified,
      true,
    )
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
})
