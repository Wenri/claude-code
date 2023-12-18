#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function usage() {
  console.error(
    'Usage: reconstruct-embedded-code.mjs --case manifest.json ' +
      '--artifacts DIR --output DIR',
  )
}

function parseArguments(argv) {
  const result = {}
  const allowed = new Set(['artifacts', 'case', 'output'])
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`)
  }
}

function safeRelative(root, relative, label) {
  if (typeof relative !== 'string') {
    throw new Error(`${label}: path must be a string`)
  }
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

function artifact(manifest, id) {
  const result = manifest.artifacts.find(item => item.id === id)
  if (!result) throw new Error(`Unknown artifact: ${id}`)
  return result
}

function assertion(manifest, relative) {
  const result = manifest.generatedRecovery.fileAssertions.find(
    item => item.path === relative,
  )
  if (!result) throw new Error(`No generated assertion for ${relative}`)
  return result
}

function verifiedFile(filename, evidence, label) {
  const value = fs.readFileSync(filename)
  assertEqual(value.length, evidence.bytes, `${label} byte length`)
  assertEqual(sha256(value), evidence.sha256, `${label} SHA-256`)
  return value
}

function runZstd(arguments_, label) {
  const result = spawnSync('zstd', arguments_, {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${label}: Zstandard failed: ${result.stderr || result.stdout}`)
  }
}

function main() {
  const args = parseArguments(process.argv.slice(2))
  if (!args.case || !args.artifacts || !args.output) {
    usage()
    process.exitCode = 2
    return
  }
  const manifestPath = path.resolve(args.case)
  const caseRoot = path.dirname(manifestPath)
  const artifactsRoot = path.resolve(args.artifacts)
  const output = path.resolve(args.output)
  if (fs.existsSync(output)) throw new Error(`Refusing existing output: ${output}`)
  fs.mkdirSync(output, { recursive: true })
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const recovery = manifest.generatedRecovery?.embeddedCode
  if (!recovery || !Array.isArray(recovery.files) || recovery.files.length === 0) {
    throw new Error('Manifest has no embeddedCode recovery files')
  }
  const seen = new Set()
  const treeHash = crypto.createHash('sha256')
  const files = []
  let totalBytes = 0

  try {
    for (const recipe of recovery.files) {
      if (seen.has(recipe.path)) {
        throw new Error(`Duplicate embedded code path: ${recipe.path}`)
      }
      seen.add(recipe.path)
      const targetEvidence = artifact(manifest, recipe.targetArtifact)
      const targetFilename = safeRelative(
        artifactsRoot,
        targetEvidence.localPath,
        recipe.targetArtifact,
      )
      const target = verifiedFile(
        targetFilename,
        targetEvidence,
        recipe.targetArtifact,
      )
      const payloadEvidence = assertion(manifest, recipe.payload)
      const payload = safeRelative(caseRoot, recipe.payload, recipe.path)
      verifiedFile(payload, payloadEvidence, `${recipe.path} payload`)
      const destination = safeRelative(output, recipe.path, recipe.path)
      fs.mkdirSync(path.dirname(destination), { recursive: true })

      if (recipe.algorithm === 'zstd') {
        runZstd(['-d', payload, '-o', destination, '--force'], recipe.path)
      } else if (recipe.algorithm === 'zstd-dictionary-patch') {
        const baselineEvidence = artifact(manifest, recipe.baselineArtifact)
        const baseline = safeRelative(
          artifactsRoot,
          baselineEvidence.localPath,
          recipe.baselineArtifact,
        )
        verifiedFile(baseline, baselineEvidence, recipe.baselineArtifact)
        runZstd(
          [
            '-d',
            `--patch-from=${baseline}`,
            payload,
            '-o',
            destination,
            '--force',
          ],
          recipe.path,
        )
      } else {
        throw new Error(
          `${recipe.path}: unsupported recovery algorithm ${recipe.algorithm}`,
        )
      }

      const reconstructed = verifiedFile(
        destination,
        targetEvidence,
        `reconstructed ${recipe.path}`,
      )
      if (!reconstructed.equals(target)) {
        throw new Error(`${recipe.path}: reconstruction differs from target`)
      }
      treeHash
        .update(recipe.path)
        .update('\0')
        .update(String(reconstructed.length))
        .update('\0')
        .update(targetEvidence.sha256)
        .update('\n')
      totalBytes += reconstructed.length
      files.push({
        path: recipe.path,
        bytes: reconstructed.length,
        sha256: targetEvidence.sha256,
        algorithm: recipe.algorithm,
      })
    }
    const framedTreeSha256 = treeHash.digest('hex')
    assertEqual(files.length, recovery.targetFiles, 'embedded code file count')
    assertEqual(totalBytes, recovery.targetBytes, 'embedded code byte length')
    assertEqual(
      framedTreeSha256,
      recovery.targetFramedTreeSha256,
      'embedded code framed tree SHA-256',
    )
    console.log(
      JSON.stringify(
        {
          status: 'embedded-code-reconstructed',
          output,
          files,
          targetFiles: files.length,
          targetBytes: totalBytes,
          targetFramedTreeSha256: framedTreeSha256,
        },
        null,
        2,
      ),
    )
  } catch (error) {
    fs.rmSync(output, { recursive: true, force: true })
    throw error
  }
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
}
