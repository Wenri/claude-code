#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const TRAILER_MAGIC = Buffer.from('\n---- Bun! ----\n')
const FOOTER_BYTES = 56
const POINTER_BIAS_BYTES = 8
const DIRECTORY_RECORD_BYTES = 52

function usage() {
  console.error(
    'Usage: inspect-bun-container.mjs --executable FILE --output DIR ' +
      '--inventory FILE [--artifact-path PATH] [--package NAME] ' +
      '[--version VERSION]',
  )
}

function parseArguments(argv) {
  const result = {}
  const allowed = new Set([
    'executable',
    'output',
    'inventory',
    'artifact-path',
    'package',
    'version',
  ])
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

function evidence(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function pointer(section, sectionFileOffset, displayedOffset, bytes, label) {
  const start = displayedOffset + POINTER_BIAS_BYTES
  const end = start + bytes
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end > section.length
  ) {
    throw new Error(`${label}: invalid pointer ${displayedOffset}+${bytes}`)
  }
  return {
    value: section.subarray(start, end),
    displayedOffset,
    displayedOffsetHex: `0x${displayedOffset.toString(16).padStart(8, '0')}`,
    actualFileOffset: sectionFileOffset + start,
    actualFileOffsetHex:
      `0x${(sectionFileOffset + start).toString(16).padStart(8, '0')}`,
    bytes,
  }
}

function cleanPointer(result) {
  const { value, ...metadata } = result
  return { ...metadata, sha256: sha256(value) }
}

function safeModuleDestination(output, modulePath) {
  const prefix = '/$bunfs/root/'
  if (!modulePath.startsWith(prefix)) {
    throw new Error(`Bun module is outside /$bunfs/root: ${modulePath}`)
  }
  const relative = modulePath.slice(prefix.length)
  const parts = relative.split('/')
  if (parts.some(part => part === '' || part === '.' || part === '..')) {
    throw new Error(`Unsafe Bun module path: ${modulePath}`)
  }
  const destination = path.resolve(output, ...parts)
  if (!destination.startsWith(`${path.resolve(output)}${path.sep}`)) {
    throw new Error(`Bun module escaped output root: ${modulePath}`)
  }
  return destination
}

function classify(modulePath, jscBytes) {
  if (modulePath.endsWith('.node')) return 'elf'
  if (jscBytes > 0) return 'js+jsc'
  return 'js'
}

function parseModule(record, index, section, sectionFileOffset) {
  const name = pointer(
    section,
    sectionFileOffset,
    record.readUInt32LE(0),
    record.readUInt32LE(4),
    `module ${index} name`,
  )
  const content = pointer(
    section,
    sectionFileOffset,
    record.readUInt32LE(8),
    record.readUInt32LE(12),
    `module ${index} content`,
  )
  const jscBytes = record.readUInt32LE(28)
  const module = {
    index,
    path: name.value.toString('utf8'),
    name: cleanPointer(name),
    content: cleanPointer(content),
  }
  let jsc = null
  if (jscBytes > 0) {
    jsc = pointer(
      section,
      sectionFileOffset,
      record.readUInt32LE(24),
      jscBytes,
      `module ${index} JSC`,
    )
    const origin = pointer(
      section,
      sectionFileOffset,
      record.readUInt32LE(40),
      record.readUInt32LE(44),
      `module ${index} bytecode origin`,
    )
    module.jsc = cleanPointer(jsc)
    module.bytecodeOriginPath = origin.value.toString('utf8')
  }
  module.encoding = record[48]
  module.loader = record[49]
  module.moduleFormat = record[50]
  module.side = record[51]
  module.kind = classify(module.path, jscBytes)
  return { module, content: content.value, jsc: jsc?.value ?? null }
}

function main() {
  const args = parseArguments(process.argv.slice(2))
  if (!args.executable || !args.output || !args.inventory) {
    usage()
    process.exitCode = 2
    return
  }
  const executablePath = path.resolve(args.executable)
  const output = path.resolve(args.output)
  const inventoryPath = path.resolve(args.inventory)
  const executable = fs.readFileSync(executablePath)
  const magicOffset = executable.lastIndexOf(TRAILER_MAGIC)
  if (magicOffset < 0) throw new Error('Bun trailer magic not found')
  const footerStart = magicOffset + TRAILER_MAGIC.length - FOOTER_BYTES
  const footer = executable.subarray(footerStart, footerStart + FOOTER_BYTES)
  if (!footer.subarray(40).equals(TRAILER_MAGIC)) {
    throw new Error('Bun trailer magic is not at the expected footer offset')
  }
  const byteCount = Number(footer.readBigUInt64LE(8))
  const sectionFileOffset = footerStart - byteCount
  if (!Number.isSafeInteger(sectionFileOffset) || sectionFileOffset < 0) {
    throw new Error('Invalid Bun section byte count')
  }
  const sectionEnd = footerStart + FOOTER_BYTES
  const section = executable.subarray(sectionFileOffset, sectionEnd)
  const directoryOffset = footer.readUInt32LE(16)
  const directoryBytes = footer.readUInt32LE(20)
  if (directoryBytes % DIRECTORY_RECORD_BYTES !== 0) {
    throw new Error('Bun module directory has a partial record')
  }
  const directory = pointer(
    section,
    sectionFileOffset,
    directoryOffset,
    directoryBytes,
    'Bun module directory',
  )
  const modules = []
  fs.mkdirSync(output, { recursive: true })
  for (
    let offset = 0, index = 0;
    offset < directory.value.length;
    offset += DIRECTORY_RECORD_BYTES, index += 1
  ) {
    const parsed = parseModule(
      directory.value.subarray(offset, offset + DIRECTORY_RECORD_BYTES),
      index,
      section,
      sectionFileOffset,
    )
    const destination = safeModuleDestination(output, parsed.module.path)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.writeFileSync(destination, parsed.content)
    if (parsed.jsc) fs.writeFileSync(`${destination}.jsc`, parsed.jsc)
    modules.push(parsed.module)
  }
  const entryPointId = footer.readUInt32LE(24)
  const entryPoint = modules[entryPointId]
  if (!entryPoint || !entryPoint.path.endsWith('/src/entrypoints/cli.js')) {
    throw new Error(`Unexpected Bun entry point: ${entryPoint?.path}`)
  }
  const wrappedCli = fs.readFileSync(
    safeModuleDestination(output, entryPoint.path),
  )
  const prefix = Buffer.from(
    '// @bun @bytecode @bun-cjs\n' +
      '(function(exports, require, module, __filename, __dirname) {',
  )
  const suffix = Buffer.from('})\n')
  if (
    !wrappedCli.subarray(0, prefix.length).equals(prefix) ||
    !wrappedCli.subarray(wrappedCli.length - suffix.length).equals(suffix)
  ) {
    throw new Error('Unexpected Bun CLI wrapper')
  }
  const inner = wrappedCli.subarray(prefix.length, wrappedCli.length - suffix.length)
  fs.writeFileSync(path.join(output, 'cli.js'), wrappedCli)
  const innerPath = path.join(output, 'cli.inner.js')
  fs.writeFileSync(innerPath, inner)
  const syntaxCheck = spawnSync(process.execPath, ['--check', innerPath], {
    encoding: 'utf8',
  })
  if (syntaxCheck.status !== 0) {
    throw new Error(
      `Extracted CLI syntax check failed: ${syntaxCheck.stderr || syntaxCheck.stdout}`,
    )
  }
  const inventory = {
    schemaVersion: 1,
    kind: 'bun-compiled-elf-embedded-graph',
    artifact: {
      package: args.package ?? null,
      version: args.version ?? null,
      path: args['artifact-path'] ?? path.basename(executablePath),
      ...evidence(executable),
    },
    bunSection: {
      fileOffset: sectionFileOffset,
      fileOffsetHex: `0x${sectionFileOffset.toString(16).padStart(8, '0')}`,
      bytes: section.length,
      bytesHex: `0x${section.length.toString(16).padStart(8, '0')}`,
      endFileOffset: sectionEnd,
      endFileOffsetHex: `0x${sectionEnd.toString(16).padStart(8, '0')}`,
      sha256: sha256(section),
      trailerMagic: TRAILER_MAGIC.toString('utf8'),
      footerBytes: FOOTER_BYTES,
      footerSha256: sha256(footer),
      footerPrefixHex: footer.subarray(0, 8).toString('hex'),
      footer: {
        byteCount,
        byteCountHex: `0x${byteCount.toString(16).padStart(8, '0')}`,
        modulesPointer: {
          displayedOffset: directoryOffset,
          displayedOffsetHex:
            `0x${directoryOffset.toString(16).padStart(8, '0')}`,
          bytes: directoryBytes,
        },
        entryPointId,
        execArgv: {
          displayedOffset: footer.readUInt32LE(28),
          displayedOffsetHex:
            `0x${footer.readUInt32LE(28).toString(16).padStart(8, '0')}`,
          bytes: footer.readUInt32LE(32),
        },
        flags: footer.readUInt32LE(36),
      },
      directoryRecordBytes: DIRECTORY_RECORD_BYTES,
      directorySha256: sha256(directory.value),
      moduleCount: directoryBytes / DIRECTORY_RECORD_BYTES,
      displayedPointerBiasBytes: POINTER_BIAS_BYTES,
    },
    extractionSemantics: {
      actualFileOffset:
        'bunSection.fileOffset + displayedOffset + displayedPointerBiasBytes',
      read: 'exactly the displayed length in bytes',
      canonicalization: 'Direct raw executable slices are canonical.',
    },
    modules,
    derivedAnalyzableCli: {
      canonicalWrapped: evidence(wrappedCli),
      wrapperPrefixBytes: prefix.length,
      wrapperPrefix: prefix.toString('utf8'),
      wrapperSuffixBytes: suffix.length,
      wrapperSuffix: suffix.toString('utf8'),
      inner: { ...evidence(inner), nodeCheck: true },
    },
  }
  fs.mkdirSync(path.dirname(inventoryPath), { recursive: true })
  fs.writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`)
  console.log(JSON.stringify(inventory, null, 2))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
}
