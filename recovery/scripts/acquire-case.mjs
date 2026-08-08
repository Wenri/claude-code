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

function isByteSliceArtifact(artifact) {
  return Object.hasOwn(artifact, 'byteSlice')
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

function validateArtifacts(manifest, output) {
  if (!Array.isArray(manifest.artifacts)) {
    throw new Error('Manifest artifacts must be an array')
  }

  const byId = new Map()
  const byDestination = new Map()
  for (const artifact of manifest.artifacts) {
    if (
      !artifact ||
      typeof artifact !== 'object' ||
      Array.isArray(artifact) ||
      typeof artifact.id !== 'string' ||
      artifact.id.length === 0 ||
      byId.has(artifact.id)
    ) {
      throw new Error(`Invalid or duplicate artifact id: ${artifact?.id}`)
    }
    if (
      !Number.isSafeInteger(artifact.bytes) ||
      artifact.bytes < 0 ||
      typeof artifact.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(artifact.sha256)
    ) {
      throw new Error(`${artifact.id}: invalid byte/hash evidence`)
    }
    if (
      typeof artifact.localPath !== 'string' ||
      artifact.localPath.includes('\\')
    ) {
      throw new Error(`${artifact.id}: unsafe local path`)
    }
    const destination = safeOutputPath(output, artifact)
    const duplicate = byDestination.get(destination)
    if (duplicate) {
      throw new Error(
        `${artifact.id}: local path duplicates artifact ${duplicate}`,
      )
    }
    byId.set(artifact.id, artifact)
    byDestination.set(destination, artifact.id)
  }

  for (const artifact of manifest.artifacts) {
    if (!isByteSliceArtifact(artifact)) continue
    const recipe = artifact.byteSlice
    if (
      !recipe ||
      typeof recipe !== 'object' ||
      Array.isArray(recipe)
    ) {
      throw new Error(`${artifact.id}: byteSlice must be an object`)
    }
    if (
      artifact.archive !== undefined ||
      artifact.archiveMember !== undefined ||
      artifact.url !== undefined
    ) {
      throw new Error(
        `${artifact.id}: byteSlice cannot be combined with URL/archive inputs`,
      )
    }
    if (
      typeof recipe.sourceArtifact !== 'string' ||
      recipe.sourceArtifact.length === 0
    ) {
      throw new Error(`${artifact.id}: byteSlice sourceArtifact is required`)
    }
    if (!byId.has(recipe.sourceArtifact)) {
      throw new Error(
        `${artifact.id}: unknown byteSlice source artifact ` +
          `${recipe.sourceArtifact}`,
      )
    }
    if (recipe.sourceArtifact === artifact.id) {
      throw new Error(`${artifact.id}: byteSlice cannot reference itself`)
    }
    if (
      !Number.isSafeInteger(recipe.offset) ||
      recipe.offset < 0 ||
      !Number.isSafeInteger(recipe.bytes) ||
      recipe.bytes < 0 ||
      !Number.isSafeInteger(recipe.offset + recipe.bytes)
    ) {
      throw new Error(`${artifact.id}: invalid byteSlice range`)
    }
    if (recipe.bytes !== artifact.bytes) {
      throw new Error(
        `${artifact.id}: byteSlice bytes must equal artifact bytes`,
      )
    }

    if (recipe.prefixHex === undefined) {
      if (recipe.prefixOffset !== undefined) {
        throw new Error(
          `${artifact.id}: byteSlice prefixOffset requires prefixHex`,
        )
      }
      continue
    }
    if (
      typeof recipe.prefixHex !== 'string' ||
      !/^(?:[a-fA-F0-9]{2})+$/.test(recipe.prefixHex)
    ) {
      throw new Error(`${artifact.id}: invalid byteSlice prefixHex`)
    }
    const prefixOffset = recipe.prefixOffset ?? 0
    const prefixBytes = recipe.prefixHex.length / 2
    if (
      !Number.isSafeInteger(prefixOffset) ||
      prefixOffset < 0 ||
      prefixOffset + prefixBytes > recipe.bytes
    ) {
      throw new Error(`${artifact.id}: byteSlice prefix is outside the slice`)
    }
  }

  return byId
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

function verifiedArtifactBuffer(output, artifact) {
  const filename = safeOutputPath(output, artifact)
  ensureSafeParent(output, filename, artifact.id)
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${artifact.id}: artifact is not a real file`)
  }
  const value = fs.readFileSync(filename)
  verifyBuffer(value, artifact)
  return { filename, value }
}

function deriveByteSlice(output, artifact, sourceArtifact) {
  const source = verifiedArtifactBuffer(output, sourceArtifact)
  const recipe = artifact.byteSlice
  const end = recipe.offset + recipe.bytes
  if (end > source.value.length) {
    throw new Error(
      `${artifact.id}: byteSlice range ${recipe.offset}..${end} exceeds ` +
        `${sourceArtifact.id} (${source.value.length} bytes)`,
    )
  }
  const value = Buffer.from(source.value.subarray(recipe.offset, end))
  if (recipe.prefixHex !== undefined) {
    const prefix = Buffer.from(recipe.prefixHex, 'hex')
    const prefixOffset = recipe.prefixOffset ?? 0
    if (
      !value
        .subarray(prefixOffset, prefixOffset + prefix.length)
        .equals(prefix)
    ) {
      throw new Error(
        `${artifact.id}: byteSlice prefix mismatch at offset ${prefixOffset}`,
      )
    }
  }
  verifyBuffer(value, artifact)

  const destination = safeOutputPath(output, artifact)
  ensureSafeParent(output, destination, artifact.id)
  if (fs.existsSync(destination)) {
    const existing = fs.readFileSync(destination)
    verifyBuffer(existing, artifact)
    if (!existing.equals(value)) {
      throw new Error(`${artifact.id}: existing derived artifact differs`)
    }
    return { status: 'verified', path: destination }
  }

  const temporary = `${destination}.part-${process.pid}`
  fs.writeFileSync(temporary, value, { flag: 'wx' })
  fs.renameSync(temporary, destination)
  return { status: 'derived', path: destination }
}

function deriveByteSlices(manifest, artifactsById, completed, output, statuses) {
  const pending = new Map(
    manifest.artifacts
      .filter(isByteSliceArtifact)
      .map(artifact => [artifact.id, artifact]),
  )

  while (pending.size > 0) {
    let progress = false
    for (const [id, artifact] of pending) {
      const sourceId = artifact.byteSlice.sourceArtifact
      if (!completed.has(sourceId)) continue
      const sourceArtifact = artifactsById.get(sourceId)
      const result = deriveByteSlice(output, artifact, sourceArtifact)
      statuses.push({ id, ...result })
      completed.add(id)
      pending.delete(id)
      progress = true
    }
    if (!progress) {
      const unresolved = [...pending.values()]
        .map(
          artifact =>
            `${artifact.id}->${artifact.byteSlice.sourceArtifact}`,
        )
        .join(', ')
      throw new Error(
        `Could not resolve byteSlice artifact dependencies: ${unresolved}`,
      )
    }
  }
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
  const artifactsById = validateArtifacts(manifest, output)
  const statuses = []
  const completed = new Set()

  for (const artifact of manifest.artifacts.filter(
    item => !item.archive && !isByteSliceArtifact(item),
  )) {
    const destination = safeOutputPath(output, artifact)
    ensureSafeParent(output, destination, artifact.id)
    const status = await acquireFile(artifact, destination)
    statuses.push({ id: artifact.id, status, path: destination })
    completed.add(artifact.id)
  }

  const archived = manifest.artifacts.filter(
    item => item.archive && !isByteSliceArtifact(item),
  )
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
      completed.add(artifact.id)
    }
  }

  deriveByteSlices(
    manifest,
    artifactsById,
    completed,
    output,
    statuses,
  )

  console.log(JSON.stringify({ case: manifest.case, artifacts: statuses }, null, 2))
}

main().catch(error => {
  console.error(error.stack ?? error)
  process.exitCode = 1
})
