#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function usage() {
  console.error(
    'Usage: reconstruct-package.mjs --case manifest.json ' +
      '--artifacts DIR --baseline-tarball FILE --output NEW_DIR',
  )
}

function parseArguments(argv) {
  const result = {}
  const allowed = new Set([
    'case',
    'artifacts',
    'baseline-tarball',
    'output',
  ])
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument.startsWith('--')) {
      throw new Error(`Unexpected argument: ${argument}`)
    }
    const key = argument.slice(2)
    if (!allowed.has(key)) throw new Error(`Unknown argument: ${argument}`)
    if (result[key] !== undefined) {
      throw new Error(`Duplicate argument: ${argument}`)
    }
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}`)
    }
    result[key] = value
    index += 1
  }
  return result
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`)
  }
}

function safeRelative(root, relative, label) {
  const parts = relative.split('/')
  if (
    path.isAbsolute(relative) ||
    relative.includes('\\') ||
    parts.length === 0 ||
    parts.includes('') ||
    parts.includes('.') ||
    parts.includes('..')
  ) {
    throw new Error(`${label}: unsafe relative path ${relative}`)
  }
  const filename = path.resolve(root, ...parts)
  if (!filename.startsWith(`${path.resolve(root)}${path.sep}`)) {
    throw new Error(`${label}: path escaped root`)
  }
  return filename
}

function verifiedFile(filename, evidence, label) {
  const value = fs.readFileSync(filename)
  assertEqual(value.length, evidence.bytes, `${label} byte length`)
  assertEqual(sha256(value), evidence.sha256, `${label} SHA-256`)
  return value
}

function artifact(manifest, id) {
  const result = manifest.artifacts.find(item => item.id === id)
  if (!result) throw new Error(`Unknown artifact: ${id}`)
  return result
}

function verifiedArtifact(manifest, artifactsRoot, id) {
  const evidence = artifact(manifest, id)
  const filename = safeRelative(
    artifactsRoot,
    evidence.localPath,
    `artifact ${id}`,
  )
  verifiedFile(filename, evidence, id)
  return { evidence, filename }
}

function tarMember(archive, member, expectedBytes, label) {
  if (
    !member.startsWith('package/') ||
    member.startsWith('-') ||
    member.split('/').includes('..')
  ) {
    throw new Error(`${label}: unsafe tar member ${member}`)
  }
  const result = spawnSync('tar', ['-xOf', archive, '--', member], {
    encoding: null,
    maxBuffer: expectedBytes + 1024 * 1024,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `${label}: tar extraction failed: ` +
        Buffer.from(result.stderr ?? '').toString('utf8'),
    )
  }
  assertEqual(result.stdout.length, expectedBytes, `${label} byte length`)
  return result.stdout
}

function exactPackageJson(baseline, assertion) {
  const text = baseline.toString('utf8')
  const from = `"version": "${assertion.baseline}"`
  const to = `"version": "${assertion.target}"`
  const first = text.indexOf(from)
  if (first < 0 || text.indexOf(from, first + from.length) >= 0) {
    throw new Error('Baseline package version marker is not unique')
  }
  return Buffer.from(text.slice(0, first) + to + text.slice(first + from.length))
}

function exactDeclarations(baseline, assertion) {
  const text = baseline.toString('utf8')
  const first = text.indexOf(assertion.anchor)
  if (
    first < 0 ||
    text.indexOf(assertion.anchor, first + assertion.anchor.length) >= 0
  ) {
    throw new Error('Declaration insertion anchor is not unique')
  }
  const offset = first + assertion.anchor.length
  return Buffer.from(text.slice(0, offset) + assertion.text + text.slice(offset))
}

function reconstructBundle(baseline, delta, output, expected) {
  const baselineFile = `${output}.baseline`
  fs.writeFileSync(baselineFile, baseline, { flag: 'wx' })
  try {
    const result = spawnSync(
      'zstd',
      [
        '-d',
        `--patch-from=${baselineFile}`,
        delta,
        '-o',
        output,
        '--force',
      ],
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
    )
    if (result.error) throw result.error
    if (result.status !== 0) {
      throw new Error(
        `Zstandard reconstruction failed: ${result.stderr || result.stdout}`,
      )
    }
    return verifiedFile(output, expected, 'reconstructed cli.js')
  } finally {
    fs.rmSync(baselineFile, { force: true })
  }
}

function targetPath(temporary, memberPath) {
  const prefix = 'package/'
  if (!memberPath.startsWith(prefix)) {
    throw new Error(`Unexpected npm member path: ${memberPath}`)
  }
  return safeRelative(
    temporary,
    memberPath.slice(prefix.length),
    `target member ${memberPath}`,
  )
}

function main() {
  const args = parseArguments(process.argv.slice(2))
  if (
    !args.case ||
    !args.artifacts ||
    !args['baseline-tarball'] ||
    !args.output
  ) {
    usage()
    process.exitCode = 2
    return
  }

  const manifestPath = path.resolve(args.case)
  const caseRoot = path.dirname(manifestPath)
  const artifactsRoot = path.resolve(args.artifacts)
  const output = path.resolve(args.output)
  if (fs.existsSync(output)) {
    throw new Error(`Refusing existing output: ${output}`)
  }
  const parent = path.dirname(output)
  fs.mkdirSync(parent, { recursive: true })
  const parentStatus = fs.lstatSync(parent)
  if (!parentStatus.isDirectory() || parentStatus.isSymbolicLink()) {
    throw new Error(`Output parent is not a real directory: ${parent}`)
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const targetTarball = verifiedArtifact(
    manifest,
    artifactsRoot,
    'targetTarball',
  )
  const generated = manifest.generatedRecovery
  if (!generated) throw new Error('Manifest has no generatedRecovery section')
  const baselineTarballEvidence =
    generated.packageMembers?.baselineTarball
  if (!baselineTarballEvidence) {
    throw new Error('Manifest has no baseline tarball evidence')
  }
  const baselineTarball = {
    evidence: baselineTarballEvidence,
    filename: path.resolve(args['baseline-tarball']),
  }
  verifiedFile(
    baselineTarball.filename,
    baselineTarball.evidence,
    'baseline tarball',
  )
  const reportAssertion = generated.fileAssertions.find(
    item => item.path === generated.packageMembers.report,
  )
  if (!reportAssertion) throw new Error('Package report has no file assertion')
  const reportFile = safeRelative(
    caseRoot,
    generated.packageMembers.report,
    'package report',
  )
  const report = JSON.parse(
    verifiedFile(reportFile, reportAssertion, 'package report'),
  )
  assertEqual(
    report.artifacts.baseline.sha256,
    baselineTarball.evidence.sha256,
    'package report baseline SHA-256',
  )
  assertEqual(
    report.artifacts.target.sha256,
    targetTarball.evidence.sha256,
    'package report target SHA-256',
  )
  assertEqual(report.summary.complete, true, 'package report completeness')
  assertEqual(
    report.summary.targetMemberCount,
    report.members.filter(member => member.target !== null).length,
    'package report target member count',
  )

  const delta = generated.exactBundleDelta
  const deltaAssertion = generated.fileAssertions.find(
    item => item.path === delta.path,
  )
  if (!deltaAssertion) throw new Error('Bundle delta has no file assertion')
  const deltaFile = safeRelative(caseRoot, delta.path, 'bundle delta')
  verifiedFile(deltaFile, deltaAssertion, 'bundle delta')

  const temporary = fs.mkdtempSync(
    path.join(parent, '.claude-code-2.1.89-recovery-'),
  )
  const treeHash = crypto.createHash('sha256')
  let targetBytes = 0
  let targetMembers = 0
  let framedTreeSha256
  try {
    for (const member of report.members) {
      if (!member.target) continue
      if (
        member.target.type !== 'file' ||
        member.target.linkPath !== null
      ) {
        throw new Error(
          `${member.path}: reconstruction supports regular files only`,
        )
      }
      const filename = targetPath(temporary, member.path)
      fs.mkdirSync(path.dirname(filename), { recursive: true })
      let value
      const baseline = member.baseline
        ? tarMember(
            baselineTarball.filename,
            member.path,
            member.baseline.bytes,
            `${member.path} baseline`,
          )
        : null
      if (member.status === 'unchanged') {
        value = baseline
      } else if (member.path === 'package/cli.js') {
        value = reconstructBundle(
          baseline,
          deltaFile,
          filename,
          member.target,
        )
      } else if (member.path === 'package/package.json') {
        value = exactPackageJson(
          baseline,
          manifest.targetAssertions.packageVersionChange,
        )
      } else if (member.path === 'package/sdk-tools.d.ts') {
        value = exactDeclarations(
          baseline,
          manifest.targetAssertions.declarationExactInsertion,
        )
      } else {
        throw new Error(
          `${member.path}: no exact reconstruction recipe for ${member.status}`,
        )
      }

      assertEqual(value.length, member.target.bytes, `${member.path} bytes`)
      assertEqual(
        sha256(value),
        member.target.sha256,
        `${member.path} SHA-256`,
      )
      const published = tarMember(
        targetTarball.filename,
        member.path,
        member.target.bytes,
        `${member.path} published target`,
      )
      if (!value.equals(published)) {
        throw new Error(`${member.path}: reconstruction differs from target`)
      }
      if (!fs.existsSync(filename)) {
        fs.writeFileSync(filename, value, { flag: 'wx' })
      }
      const mode = Number.parseInt(member.target.mode, 8)
      fs.chmodSync(filename, mode)
      treeHash
        .update(member.path)
        .update('\0')
        .update(member.target.mode)
        .update('\0')
        .update(member.target.sha256)
        .update('\0')
      targetBytes += value.length
      targetMembers += 1
    }
    assertEqual(
      targetMembers,
      report.summary.targetMemberCount,
      'reconstructed member count',
    )
    assertEqual(
      targetBytes,
      report.artifacts.target.unpackedMemberBytes,
      'reconstructed member bytes',
    )
    framedTreeSha256 = treeHash.digest('hex')
    assertEqual(
      framedTreeSha256,
      generated.packageMembers.targetFramedTreeSha256,
      'reconstructed framed tree SHA-256',
    )
    fs.renameSync(temporary, output)
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true })
    throw error
  }

  console.log(
    JSON.stringify(
      {
        status: 'exact-package-tree-reconstructed',
        output,
        members: targetMembers,
        bytes: targetBytes,
        framedTreeSha256,
        targetTarballSha256: targetTarball.evidence.sha256,
        targetBundleSha256: artifact(manifest, 'targetBundle').sha256,
      },
      null,
      2,
    ),
  )
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
}
