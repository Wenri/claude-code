#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { extractBaseline } from './extract-baseline.mjs'

function usage() {
  console.error(
    'Usage: verify-recovered-patches.mjs --case manifest.json ' +
      '--artifacts DIR',
  )
}

function parseArguments(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument.startsWith('--')) {
      throw new Error(`Unexpected argument: ${argument}`)
    }
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}`)
    }
    result[argument.slice(2)] = value
    index += 1
  }
  return result
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function safeRelativePath(root, relative, label) {
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
    throw new Error(`${label}: path escaped its root`)
  }
  return filename
}

function verifiedArtifact(manifest, artifactsRoot, id) {
  const artifact = manifest.artifacts.find(item => item.id === id)
  if (!artifact) throw new Error(`Unknown artifact: ${id}`)
  const filename = safeRelativePath(
    artifactsRoot,
    artifact.localPath,
    artifact.id,
  )
  const value = fs.readFileSync(filename)
  if (value.length !== artifact.bytes) {
    throw new Error(
      `${artifact.id}: expected ${artifact.bytes} bytes, got ${value.length}`,
    )
  }
  const actual = sha256(value)
  if (actual !== artifact.sha256) {
    throw new Error(
      `${artifact.id}: expected sha256 ${artifact.sha256}, got ${actual}`,
    )
  }
  return { artifact, filename, value }
}

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env ?? process.env,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.status !== 0) {
    const invocation = [command, ...arguments_].join(' ')
    throw new Error(
      `${invocation} failed with status ${result.status}\n` +
        `${result.stdout ?? ''}${result.stderr ?? ''}`,
    )
  }
  return result
}

function assertFileEqual(actual, expected, label) {
  const actualValue = fs.readFileSync(actual)
  const expectedValue = fs.readFileSync(expected)
  if (!actualValue.equals(expectedValue)) {
    throw new Error(
      `${label}: ${actual} (${sha256(actualValue)}) differs from ` +
        `${expected} (${sha256(expectedValue)})`,
    )
  }
  return {
    label,
    bytes: actualValue.length,
    sha256: sha256(actualValue),
  }
}

function main() {
  const args = parseArguments(process.argv.slice(2))
  if (!args.case || !args.artifacts) {
    usage()
    process.exitCode = 2
    return
  }

  const manifestPath = path.resolve(args.case)
  const caseRoot = path.dirname(manifestPath)
  const repositoryRoot = path.resolve(caseRoot, '../../..')
  const artifactsRoot = path.resolve(args.artifacts)
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const validation = manifest.recoveryValidation
  if (!validation) throw new Error('Case has no recoveryValidation section')

  const baselineMap = verifiedArtifact(
    manifest,
    artifactsRoot,
    'baselineSourceMap',
  )
  const baselineDeclarations = verifiedArtifact(
    manifest,
    artifactsRoot,
    'baselineDeclarations',
  )
  const baselinePackage = verifiedArtifact(
    manifest,
    artifactsRoot,
    'baselinePackageJson',
  )
  const targetDeclarations = verifiedArtifact(
    manifest,
    artifactsRoot,
    'targetDeclarations',
  )
  const targetPackage = verifiedArtifact(
    manifest,
    artifactsRoot,
    'targetPackageJson',
  )
  const targetBundle = verifiedArtifact(
    manifest,
    artifactsRoot,
    'targetBundle',
  )

  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'claude-recovered-patches-'),
  )
  try {
    const extractionRoot = path.join(temporaryRoot, 'baseline')
    extractBaseline({
      mapPath: baselineMap.filename,
      outputPath: extractionRoot,
      expectedSha256: baselineMap.artifact.sha256,
    })
    const workspace = path.join(extractionRoot, 'pristine')
    fs.copyFileSync(
      baselineDeclarations.filename,
      path.join(workspace, 'sdk-tools.d.ts'),
    )
    fs.copyFileSync(
      baselinePackage.filename,
      path.join(workspace, 'package.json'),
    )

    const patches = []
    for (const relative of validation.patchOrder) {
      const patch = safeRelativePath(caseRoot, relative, 'recovery patch')
      run('git', ['apply', '--check', patch], { cwd: workspace })
      run('git', ['apply', patch], { cwd: workspace })
      const value = fs.readFileSync(patch)
      patches.push({
        path: relative,
        bytes: value.length,
        sha256: sha256(value),
      })
    }

    const exactOutputs = [
      assertFileEqual(
        path.join(workspace, 'sdk-tools.d.ts'),
        targetDeclarations.filename,
        'patched declarations equal target',
      ),
      assertFileEqual(
        path.join(workspace, 'package.json'),
        targetPackage.filename,
        'patched package metadata equal target',
      ),
    ]

    const standaloneCopies = validation.standaloneCopies.map(item =>
      assertFileEqual(
        safeRelativePath(workspace, item.patchedPath, 'patched copy'),
        safeRelativePath(caseRoot, item.recoveredPath, 'recovered copy'),
        `${item.patchedPath} equals standalone recovery`,
      ),
    )

    const syntaxChecks = []
    for (const relative of validation.syntaxCheck) {
      const input = safeRelativePath(workspace, relative, 'syntax input')
      const output = path.join(
        temporaryRoot,
        `syntax-${syntaxChecks.length}.js`,
      )
      run(
        'bun',
        [
          'build',
          input,
          '--target=bun',
          '--external=*',
          `--outfile=${output}`,
        ],
        { cwd: workspace },
      )
      syntaxChecks.push(relative)
    }

    const additionalPatchSets = []
    for (const patchSet of validation.additionalPatchSets ?? []) {
      const patchWorkspace = safeRelativePath(
        extractionRoot,
        patchSet.root,
        `${patchSet.name} patch root`,
      )
      const patchResults = []
      for (const relative of patchSet.patchOrder) {
        const patch = safeRelativePath(
          caseRoot,
          relative,
          `${patchSet.name} recovery patch`,
        )
        run('git', ['apply', '--check', patch], { cwd: patchWorkspace })
        run('git', ['apply', patch], { cwd: patchWorkspace })
        const value = fs.readFileSync(patch)
        patchResults.push({
          path: relative,
          bytes: value.length,
          sha256: sha256(value),
        })
      }
      const copies = patchSet.standaloneCopies.map(item =>
        assertFileEqual(
          safeRelativePath(
            patchWorkspace,
            item.patchedPath,
            `${patchSet.name} patched copy`,
          ),
          safeRelativePath(
            caseRoot,
            item.recoveredPath,
            `${patchSet.name} recovered copy`,
          ),
          `${patchSet.name}: ${item.patchedPath} equals standalone recovery`,
        ),
      )
      const checkedSyntax = []
      for (const relative of patchSet.syntaxCheck) {
        const input = safeRelativePath(
          patchWorkspace,
          relative,
          `${patchSet.name} syntax input`,
        )
        const output = path.join(
          temporaryRoot,
          `${patchSet.name}-syntax-${checkedSyntax.length}.js`,
        )
        run(
          'bun',
          [
            'build',
            input,
            '--target=bun',
            '--external=*',
            `--outfile=${output}`,
          ],
          { cwd: patchWorkspace },
        )
        checkedSyntax.push(relative)
      }
      additionalPatchSets.push({
        name: patchSet.name,
        patches: patchResults,
        standaloneCopies: copies,
        syntaxChecks: checkedSyntax,
      })
    }

    const testFiles = validation.testFiles.map(relative =>
      safeRelativePath(repositoryRoot, relative, 'test file'),
    )
    const testEnvironment = { ...process.env }
    for (const [name, artifactId] of Object.entries(
      validation.testArtifactEnvironment,
    )) {
      testEnvironment[name] = verifiedArtifact(
        manifest,
        artifactsRoot,
        artifactId,
      ).filename
    }
    const tests = run(process.execPath, ['--test', ...testFiles], {
      cwd: repositoryRoot,
      env: testEnvironment,
    })

    console.log(
      JSON.stringify(
        {
          case: manifest.case,
          status: 'patches-verified',
          recoveryScope: manifest.recoveryScope,
          patches,
          exactOutputs,
          standaloneCopies,
          syntaxChecks,
          additionalPatchSets,
          semanticTests: tests.stdout
            .split('\n')
            .find(line => line.startsWith('ℹ tests ')),
          targetBundle: {
            bytes: targetBundle.artifact.bytes,
            sha256: targetBundle.artifact.sha256,
          },
        },
        null,
        2,
      ),
    )
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

try {
  main()
} catch (error) {
  console.error(error.stack ?? error)
  process.exitCode = 1
}
