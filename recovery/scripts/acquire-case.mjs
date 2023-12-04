#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function parseArguments(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error('Usage: acquire-case.mjs --case manifest.json --output DIR')
    }
    result[key.slice(2)] = value
  }
  return result
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function verifyBuffer(buffer, artifact) {
  if (buffer.length !== artifact.bytes) {
    throw new Error(
      `${artifact.id}: expected ${artifact.bytes} bytes, got ${buffer.length}`,
    )
  }
  const actual = sha256(buffer)
  if (actual !== artifact.sha256) {
    throw new Error(
      `${artifact.id}: expected sha256 ${artifact.sha256}, got ${actual}`,
    )
  }
}

function safeOutputPath(output, artifact) {
  const parts = artifact.localPath.split('/')
  if (
    path.isAbsolute(artifact.localPath) ||
    parts.length === 0 ||
    parts.includes('') ||
    parts.includes('.') ||
    parts.includes('..')
  ) {
    throw new Error(`${artifact.id}: unsafe local path`)
  }
  const destination = path.resolve(output, ...parts)
  if (!destination.startsWith(`${output}${path.sep}`)) {
    throw new Error(`${artifact.id}: local path escaped output directory`)
  }
  return destination
}

function ensureSafeParent(output, destination, label) {
  const outputStatus = fs.lstatSync(output)
  if (!outputStatus.isDirectory() || outputStatus.isSymbolicLink()) {
    throw new Error(`${label}: output root is not a real directory`)
  }
  const relativeParent = path.relative(output, path.dirname(destination))
  let current = output
  for (const part of relativeParent === '' ? [] : relativeParent.split(path.sep)) {
    current = path.join(current, part)
    if (!fs.existsSync(current)) {
      fs.mkdirSync(current)
      continue
    }
    const status = fs.lstatSync(current)
    if (!status.isDirectory() || status.isSymbolicLink()) {
      throw new Error(`${label}: unsafe output path component ${current}`)
    }
  }
  if (fs.existsSync(destination) && fs.lstatSync(destination).isSymbolicLink()) {
    throw new Error(`${label}: destination is a symbolic link`)
  }
}

async function acquireFile(artifact, destination) {
  if (fs.existsSync(destination)) {
    verifyBuffer(fs.readFileSync(destination), artifact)
    return 'verified'
  }

  const response = await fetch(artifact.url, { redirect: 'follow' })
  if (!response.ok) {
    throw new Error(`${artifact.id}: download failed with HTTP ${response.status}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  verifyBuffer(buffer, artifact)
  const temporary = `${destination}.part-${process.pid}`
  fs.writeFileSync(temporary, buffer, { flag: 'wx' })
  fs.renameSync(temporary, destination)
  return 'downloaded'
}

function extractArchive(archivePath, artifacts, output) {
  for (const artifact of artifacts) {
    const memberParts = artifact.archiveMember.split('/')
    if (
      path.isAbsolute(artifact.archiveMember) ||
      artifact.archiveMember.startsWith('-') ||
      memberParts.includes('..') ||
      memberParts.includes('')
    ) {
      throw new Error(`${artifact.id}: unsafe archive member`)
    }

    const result = spawnSync(
      'tar',
      ['-xOf', archivePath, '--', artifact.archiveMember],
      {
        encoding: null,
        maxBuffer: artifact.bytes + 1024 * 1024,
      },
    )
    if (result.status !== 0) {
      throw new Error(
        `${artifact.id}: tar extraction failed: ` +
          Buffer.from(result.stderr ?? '').toString('utf8'),
      )
    }
    verifyBuffer(result.stdout, artifact)

    const destination = safeOutputPath(output, artifact)
    ensureSafeParent(output, destination, artifact.id)
    if (!fs.existsSync(destination)) {
      const temporary = `${destination}.part-${process.pid}`
      fs.writeFileSync(temporary, result.stdout, { flag: 'wx' })
      fs.renameSync(temporary, destination)
    }
  }
}

async function main() {
  const args = parseArguments(process.argv.slice(2))
  if (!args.case || !args.output) {
    throw new Error('Usage: acquire-case.mjs --case manifest.json --output DIR')
  }

  const manifest = JSON.parse(fs.readFileSync(args.case, 'utf8'))
  const output = path.resolve(args.output)
  if (!fs.existsSync(output)) fs.mkdirSync(output, { recursive: true })
  const outputStatus = fs.lstatSync(output)
  if (!outputStatus.isDirectory() || outputStatus.isSymbolicLink()) {
    throw new Error(`Output is not a real directory: ${output}`)
  }
  const statuses = []

  for (const artifact of manifest.artifacts.filter(item => !item.archive)) {
    const destination = safeOutputPath(output, artifact)
    ensureSafeParent(output, destination, artifact.id)
    const status = await acquireFile(artifact, destination)
    statuses.push({ id: artifact.id, status, path: destination })
  }

  const archived = manifest.artifacts.filter(item => item.archive)
  const archiveGroups = new Map()
  for (const artifact of archived) {
    const entries = archiveGroups.get(artifact.archive) ?? []
    entries.push(artifact)
    archiveGroups.set(artifact.archive, entries)
  }

  for (const [archiveId, artifacts] of archiveGroups) {
    const archive = manifest.artifacts.find(item => item.id === archiveId)
    if (!archive) throw new Error(`Unknown archive artifact: ${archiveId}`)
    const missing = artifacts.some(
      artifact => !fs.existsSync(safeOutputPath(output, artifact)),
    )
    if (missing) {
      extractArchive(safeOutputPath(output, archive), artifacts, output)
    }
    for (const artifact of artifacts) {
      const destination = safeOutputPath(output, artifact)
      ensureSafeParent(output, destination, artifact.id)
      verifyBuffer(fs.readFileSync(destination), artifact)
      statuses.push({ id: artifact.id, status: 'verified', path: destination })
    }
  }

  console.log(JSON.stringify({ case: manifest.case, artifacts: statuses }, null, 2))
}

main().catch(error => {
  console.error(error.stack ?? error)
  process.exitCode = 1
})
