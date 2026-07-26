#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const BLOCK_SIZE = 512
const ZERO_BLOCK = Buffer.alloc(BLOCK_SIZE)

function usage() {
  console.error(
    'Usage: compare-npm-tarballs.mjs ' +
      '--baseline TARBALL --target TARBALL --output REPORT.json ' +
      '[--package-name NAME] [--baseline-version VERSION] ' +
      '[--target-version VERSION] [--baseline-shasum SHA1] ' +
      '[--target-shasum SHA1] [--baseline-integrity sha512-BASE64] ' +
      '[--target-integrity sha512-BASE64] ' +
      '[--baseline-signature BASE64] [--target-signature BASE64] ' +
      '[--registry-key-id ID] [--registry-public-key BASE64] ' +
      '[--baseline-registry-url URL] [--target-registry-url URL]',
  )
}

function parseArguments(argv) {
  const allowed = new Set([
    'baseline',
    'target',
    'output',
    'package-name',
    'baseline-version',
    'target-version',
    'baseline-shasum',
    'target-shasum',
    'baseline-integrity',
    'target-integrity',
    'baseline-signature',
    'target-signature',
    'registry-key-id',
    'registry-public-key',
    'baseline-registry-url',
    'target-registry-url',
  ])
  const result = {}
  for (let index = 0; index < argv.length; index += 2) {
    const argument = argv[index]
    const value = argv[index + 1]
    if (!argument?.startsWith('--') || value === undefined) {
      usage()
      throw new Error('Every option must have a value')
    }
    const key = argument.slice(2)
    if (!allowed.has(key)) throw new Error(`Unknown option: ${argument}`)
    if (result[key] !== undefined) {
      throw new Error(`Duplicate option: ${argument}`)
    }
    result[key] = value
  }
  return result
}

function digest(algorithm, value, encoding = 'hex') {
  return crypto.createHash(algorithm).update(value).digest(encoding)
}

function decodeNullTerminated(value) {
  const end = value.indexOf(0)
  return value.subarray(0, end === -1 ? value.length : end).toString('utf8')
}

function parseTarNumber(value, label) {
  if ((value[0] & 0x80) !== 0) {
    const copy = Buffer.from(value)
    const negative = (copy[0] & 0x40) !== 0
    copy[0] &= 0x7f
    let number = 0n
    for (const byte of copy) number = number * 256n + BigInt(byte)
    if (negative) {
      number -= 1n << BigInt(copy.length * 8 - 1)
    }
    if (
      number < 0n ||
      number > BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      throw new Error(`${label}: unsupported tar number ${number}`)
    }
    return Number(number)
  }
  const text = decodeNullTerminated(value).trim()
  if (text === '') return 0
  if (!/^[0-7]+$/.test(text)) {
    throw new Error(`${label}: invalid octal tar number ${JSON.stringify(text)}`)
  }
  const number = Number.parseInt(text, 8)
  if (!Number.isSafeInteger(number)) {
    throw new Error(`${label}: tar number exceeds safe integer range`)
  }
  return number
}

function verifyHeaderChecksum(header, offset) {
  const expected = parseTarNumber(
    header.subarray(148, 156),
    `tar header at ${offset}`,
  )
  let actual = 0
  for (let index = 0; index < header.length; index += 1) {
    actual += index >= 148 && index < 156 ? 32 : header[index]
  }
  if (actual !== expected) {
    throw new Error(
      `Tar header checksum mismatch at ${offset}: ${actual} != ${expected}`,
    )
  }
}

function parsePax(content, label) {
  const fields = new Map()
  let offset = 0
  while (offset < content.length) {
    const space = content.indexOf(32, offset)
    if (space === -1) throw new Error(`${label}: invalid PAX record length`)
    const lengthText = content.subarray(offset, space).toString('ascii')
    if (!/^[1-9][0-9]*$/.test(lengthText)) {
      throw new Error(`${label}: invalid PAX record length`)
    }
    const length = Number.parseInt(lengthText, 10)
    const end = offset + length
    if (end > content.length || content[end - 1] !== 10) {
      throw new Error(`${label}: truncated PAX record`)
    }
    const record = content.subarray(space + 1, end - 1).toString('utf8')
    const equals = record.indexOf('=')
    if (equals === -1) throw new Error(`${label}: invalid PAX record`)
    fields.set(record.slice(0, equals), record.slice(equals + 1))
    offset = end
  }
  return fields
}

function memberType(typeFlag) {
  switch (typeFlag) {
    case '':
    case '0':
      return 'file'
    case '1':
      return 'hardlink'
    case '2':
      return 'symlink'
    case '3':
      return 'character-device'
    case '4':
      return 'block-device'
    case '5':
      return 'directory'
    case '6':
      return 'fifo'
    case '7':
      return 'contiguous-file'
    default:
      return `type-${typeFlag.charCodeAt(0)}`
  }
}

function parseTarball(filename) {
  const compressed = fs.readFileSync(filename)
  let archive
  try {
    archive = zlib.gunzipSync(compressed)
  } catch (error) {
    throw new Error(`${filename}: invalid gzip stream: ${error.message}`)
  }

  const members = []
  const byPath = new Map()
  let offset = 0
  let metadataHeaderCount = 0
  let pendingLongName = null
  let pendingLongLink = null
  let pendingPax = new Map()
  let globalPax = new Map()
  let foundEndMarker = false

  while (offset + BLOCK_SIZE <= archive.length) {
    const header = archive.subarray(offset, offset + BLOCK_SIZE)
    if (header.equals(ZERO_BLOCK)) {
      foundEndMarker = true
      for (const byte of archive.subarray(offset)) {
        if (byte !== 0) {
          throw new Error(`${filename}: non-zero bytes after tar end marker`)
        }
      }
      break
    }
    verifyHeaderChecksum(header, offset)

    const headerName = decodeNullTerminated(header.subarray(0, 100))
    const prefix = decodeNullTerminated(header.subarray(345, 500))
    const joinedName = prefix ? `${prefix}/${headerName}` : headerName
    const size = parseTarNumber(
      header.subarray(124, 136),
      `${filename}:${joinedName}`,
    )
    const mode = parseTarNumber(
      header.subarray(100, 108),
      `${filename}:${joinedName}:mode`,
    )
    const typeFlag =
      header[156] === 0 ? '' : String.fromCharCode(header[156])
    const contentStart = offset + BLOCK_SIZE
    const contentEnd = contentStart + size
    if (contentEnd > archive.length) {
      throw new Error(`${filename}:${joinedName}: truncated member content`)
    }
    const content = archive.subarray(contentStart, contentEnd)
    offset = contentStart + Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE

    if (typeFlag === 'L') {
      metadataHeaderCount += 1
      pendingLongName = decodeNullTerminated(content)
      continue
    }
    if (typeFlag === 'K') {
      metadataHeaderCount += 1
      pendingLongLink = decodeNullTerminated(content)
      continue
    }
    if (typeFlag === 'x') {
      metadataHeaderCount += 1
      pendingPax = parsePax(content, `${filename}:${joinedName}`)
      continue
    }
    if (typeFlag === 'g') {
      metadataHeaderCount += 1
      globalPax = new Map([
        ...globalPax,
        ...parsePax(content, `${filename}:${joinedName}`),
      ])
      continue
    }

    const effectivePax = new Map([...globalPax, ...pendingPax])
    const memberPath =
      effectivePax.get('path') ?? pendingLongName ?? joinedName
    const linkPath =
      effectivePax.get('linkpath') ??
      pendingLongLink ??
      decodeNullTerminated(header.subarray(157, 257))
    pendingLongName = null
    pendingLongLink = null
    pendingPax = new Map()

    if (!memberPath) throw new Error(`${filename}: empty member path`)
    if (byPath.has(memberPath)) {
      throw new Error(`${filename}: duplicate member path ${memberPath}`)
    }
    const type = memberType(typeFlag)
    const member = {
      path: memberPath,
      type,
      linkPath: linkPath || null,
      mode,
      content,
      bytes: content.length,
      sha256: digest('sha256', content),
    }
    members.push(member)
    byPath.set(memberPath, member)
  }

  if (!foundEndMarker) throw new Error(`${filename}: missing tar end marker`)
  if (pendingLongName || pendingLongLink || pendingPax.size > 0) {
    throw new Error(`${filename}: dangling tar metadata header`)
  }

  return {
    compressed,
    archive,
    members,
    byPath,
    metadataHeaderCount,
  }
}

function verifyExpectedHash(value, expected, algorithm, label) {
  if (expected === undefined) return null
  const normalized = expected.toLowerCase()
  if (!new RegExp(`^[0-9a-f]{${algorithm === 'sha1' ? 40 : 128}}$`).test(
    normalized,
  )) {
    throw new Error(`${label}: invalid expected ${algorithm}`)
  }
  const actual = digest(algorithm, value)
  if (actual !== normalized) {
    throw new Error(`${label}: expected ${normalized}, got ${actual}`)
  }
  return normalized
}

function verifyIntegrity(value, expected, label) {
  const actual = `sha512-${digest('sha512', value, 'base64')}`
  if (expected !== undefined && actual !== expected) {
    throw new Error(`${label}: expected integrity ${expected}, got ${actual}`)
  }
  return { actual, verified: expected === undefined ? null : true }
}

function registryAuthentication(archive, side, args) {
  const shasum = verifyExpectedHash(
    archive.compressed,
    args[`${side}-shasum`],
    'sha1',
    side,
  )
  const integrity = verifyIntegrity(
    archive.compressed,
    args[`${side}-integrity`],
    side,
  )
  const signature = args[`${side}-signature`]
  let signatureEvidence = null
  if (signature !== undefined) {
    const required = [
      'package-name',
      `${side}-version`,
      `${side}-integrity`,
      'registry-key-id',
      'registry-public-key',
    ]
    for (const key of required) {
      if (!args[key]) {
        throw new Error(`${side} signature verification requires --${key}`)
      }
    }
    const publicKey = Buffer.from(args['registry-public-key'], 'base64')
    const message =
      `${args['package-name']}@${args[`${side}-version`]}:` +
      args[`${side}-integrity`]
    let verified
    try {
      verified = crypto.verify(
        'sha256',
        Buffer.from(message),
        { key: publicKey, format: 'der', type: 'spki' },
        Buffer.from(signature, 'base64'),
      )
    } catch (error) {
      throw new Error(`${side}: invalid registry signature inputs: ${error.message}`)
    }
    if (!verified) throw new Error(`${side}: registry signature did not verify`)
    signatureEvidence = {
      keyId: args['registry-key-id'],
      publicKeySpkiSha256: digest('sha256', publicKey),
      signature,
      verified: true,
    }
  }
  return {
    expectedShasum: shasum,
    expectedIntegrity: args[`${side}-integrity`] ?? null,
    shasumVerified: shasum === null ? null : true,
    integrityVerified: integrity.verified,
    registrySignature: signatureEvidence,
  }
}

function artifactEvidence(archive, side, args) {
  return {
    version: args[`${side}-version`] ?? null,
    registryTarballUrl: args[`${side}-registry-url`] ?? null,
    compressedBytes: archive.compressed.length,
    sha1: digest('sha1', archive.compressed),
    sha256: digest('sha256', archive.compressed),
    sha512: digest('sha512', archive.compressed),
    integrity: `sha512-${digest('sha512', archive.compressed, 'base64')}`,
    uncompressedTarBytes: archive.archive.length,
    memberCount: archive.members.length,
    metadataHeaderCount: archive.metadataHeaderCount,
    unpackedMemberBytes: archive.members.reduce(
      (total, member) => total + member.bytes,
      0,
    ),
    authentication: registryAuthentication(archive, side, args),
  }
}

function publicMember(member) {
  if (!member) return null
  return {
    type: member.type,
    linkPath: member.linkPath,
    mode: member.mode.toString(8).padStart(4, '0'),
    bytes: member.bytes,
    sha256: member.sha256,
  }
}

function sameMember(left, right) {
  return (
    left.type === right.type &&
    left.linkPath === right.linkPath &&
    left.mode === right.mode &&
    left.content.equals(right.content)
  )
}

function ensureOutput(output) {
  const resolved = path.resolve(output)
  if (fs.existsSync(resolved)) {
    throw new Error(`Refusing existing output: ${resolved}`)
  }
  const parent = path.dirname(resolved)
  fs.mkdirSync(parent, { recursive: true })
  const status = fs.lstatSync(parent)
  if (!status.isDirectory() || status.isSymbolicLink()) {
    throw new Error(`Output parent is not a real directory: ${parent}`)
  }
  return resolved
}

function main() {
  const args = parseArguments(process.argv.slice(2))
  if (!args.baseline || !args.target || !args.output) {
    usage()
    process.exitCode = 2
    return
  }
  const output = ensureOutput(args.output)
  const baseline = parseTarball(path.resolve(args.baseline))
  const target = parseTarball(path.resolve(args.target))
  const paths = [...new Set([
    ...baseline.byPath.keys(),
    ...target.byPath.keys(),
  ])].sort()
  const counts = { unchanged: 0, changed: 0, added: 0, removed: 0 }
  const members = paths.map(memberPath => {
    const left = baseline.byPath.get(memberPath)
    const right = target.byPath.get(memberPath)
    let status
    if (!left) status = 'added'
    else if (!right) status = 'removed'
    else if (sameMember(left, right)) status = 'unchanged'
    else status = 'changed'
    counts[status] += 1
    return {
      path: memberPath,
      status,
      baseline: publicMember(left),
      target: publicMember(right),
    }
  })
  const report = {
    schemaVersion: 1,
    kind: 'npm-tarball-member-byte-comparison',
    comparisonBasis:
      'Exact member paths, types, modes, link targets, and uncompressed member bytes',
    packageName: args['package-name'] ?? null,
    artifacts: {
      baseline: artifactEvidence(baseline, 'baseline', args),
      target: artifactEvidence(target, 'target', args),
    },
    summary: {
      unionMemberCount: paths.length,
      baselineMemberCount: baseline.members.length,
      targetMemberCount: target.members.length,
      ...counts,
      complete:
        Object.values(counts).reduce((total, count) => total + count, 0) ===
        paths.length,
    },
    members,
  }
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, {
    flag: 'wx',
  })
  console.log(JSON.stringify(report.summary, null, 2))
}

try {
  main()
} catch (error) {
  console.error(error.stack ?? error)
  process.exitCode = 1
}
