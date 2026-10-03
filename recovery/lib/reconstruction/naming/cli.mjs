#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { emitFrozenNaming } from './backend.mjs'
import { canonical, sha256, readCanonicalJSON, protectedToolFiles, RECOVERY } from './toolchain.mjs'
import { assertDistinctDiagnosticPaths, auditWrittenArtifact } from '../../naming-diagnostic-artifacts.mjs'

const FLAGS = ['--candidate', '--recipe', '--recipe-sha256', '--tool-pins', '--tool-pins-sha256', '--output', '--receipt']
function argumentsFrom(argv) {
  const options = {}
  assert.equal(argv.length, FLAGS.length * 2, `Require exactly ${FLAGS.join(', ')}`)
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index], value = argv[index + 1]
    assert(FLAGS.includes(key) && value && !Object.hasOwn(options, key), `Unknown, duplicate or missing CLI option: ${key}`)
    options[key] = value
  }
  return options
}
function regularInput(filename) {
  assert(fs.statSync(filename).isFile(), `Input is not a regular file: ${filename}`)
  return fs.readFileSync(filename)
}
function physicalPath(filename) {
  const missing = []
  let current = path.resolve(filename)
  while (true) {
    try { return path.join(fs.realpathSync(current), ...missing) }
    catch (error) {
      if (error.code !== 'ENOENT') throw error
      const parent = path.dirname(current)
      if (parent === current) throw error
      missing.unshift(path.basename(current)); current = parent
    }
  }
}
function protectDependencyDirectory(outputs) {
  const root = fs.realpathSync(path.join(RECOVERY, 'node_modules'))
  for (const output of outputs) {
    const relative = path.relative(root, physicalPath(output))
    assert(relative && (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)), 'Output must not alter the dependency directory')
  }
}
// No overwrite mode. Both destinations are reserved with O_EXCL/O_NOFOLLOW
// after validation; failed partial writes remove only files we just created.
function writeNewArtifacts(artifacts) {
  const opened = []
  try {
    for (const [filename, bytes] of artifacts) {
      fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true })
      const fd = fs.openSync(filename, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600)
      const status = fs.fstatSync(fd)
      opened.push({ filename, fd, status, bytes })
    }
    for (const item of opened) { fs.writeFileSync(item.fd, item.bytes); fs.fsyncSync(item.fd) }
    for (const item of opened) { fs.closeSync(item.fd); item.fd = undefined }
    return opened.map(item => auditWrittenArtifact(item.filename, item.bytes))
  } catch (error) {
    for (const item of opened) {
      if (item.fd !== undefined) fs.closeSync(item.fd)
      try {
        const current = fs.lstatSync(item.filename)
        if (current.dev === item.status.dev && current.ino === item.status.ino) fs.unlinkSync(item.filename)
      } catch (cleanup) { if (cleanup.code !== 'ENOENT') error.message += `; cleanup failed: ${cleanup.message}` }
    }
    throw error
  }
}

export function runCLI(argv) {
  const options = argumentsFrom(argv)
  const inputs = ['--candidate', '--recipe', '--tool-pins'].map(key => path.resolve(options[key]))
  const outputs = ['--output', '--receipt'].map(key => path.resolve(options[key]))
  // Includes input/tool/dependency/report/output symlink and inode collisions.
  const protectedFiles = [...inputs, ...protectedToolFiles()]
  assertDistinctDiagnosticPaths(protectedFiles, outputs)
  protectDependencyDirectory(outputs)
  const [candidateBytes, recipeBytes, toolPinsBytes] = inputs.map(regularInput)
  assert.equal(sha256(toolPinsBytes), options['--tool-pins-sha256'], 'Explicit tool pins file digest differs')
  const toolPins = readCanonicalJSON(toolPinsBytes, 'Tool pins')
  const { outputBytes, receipt } = emitFrozenNaming({ candidateBytes, recipeBytes, expectedRecipeSha256: options['--recipe-sha256'], toolPins })
  // Recheck immediately before any directory creation or file write.
  assertDistinctDiagnosticPaths(protectedFiles, outputs)
  protectDependencyDirectory(outputs)
  const artifacts = writeNewArtifacts([[outputs[0], outputBytes], [outputs[1], Buffer.from(canonical(receipt))]])
  return { status: 'emitted-frozen-bound-names', artifacts, editedTokens: receipt.edits.length,
    finalTargetAstEqualityEstablished: false, semanticEquivalenceEstablished: false }
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { console.log(JSON.stringify(runCLI(process.argv.slice(2)))) }
  catch (error) { console.error(`Frozen naming refused: ${error.message}`); process.exitCode = 1 }
}
