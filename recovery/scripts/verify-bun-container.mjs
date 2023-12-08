#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function usage() {
  console.error(
    'Usage: verify-bun-container.mjs --case manifest.json --artifacts DIR',
  )
}

function parseArguments(argv) {
  const result = {}
  const allowed = new Set(['artifacts', 'case'])
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

function verifiedFile(filename, evidence, label) {
  const value = fs.readFileSync(filename)
  assertEqual(value.length, evidence.bytes, `${label} byte length`)
  assertEqual(sha256(value), evidence.sha256, `${label} SHA-256`)
  return value
}

function verifiedArtifact(manifest, artifactsRoot, id) {
  const evidence = artifact(manifest, id)
  const filename = safeRelative(artifactsRoot, evidence.localPath, id)
  return {
    evidence,
    filename,
    value: verifiedFile(filename, evidence, id),
  }
}

function verifiedCaseFile(manifest, caseRoot, relative, label) {
  const assertion = manifest.generatedRecovery.fileAssertions.find(
    item => item.path === relative,
  )
  if (!assertion) throw new Error(`${label}: no generated file assertion`)
  const filename = safeRelative(caseRoot, relative, label)
  return {
    filename,
    value: verifiedFile(filename, assertion, label),
  }
}

function safeRange(buffer, offset, bytes, label) {
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(bytes) ||
    bytes < 0 ||
    !Number.isSafeInteger(offset + bytes) ||
    offset + bytes > buffer.length
  ) {
    throw new Error(
      `${label}: range ${offset}..${offset + bytes} exceeds ${buffer.length}`,
    )
  }
  return buffer.subarray(offset, offset + bytes)
}

function verifyPointer(section, sectionFileOffset, pointer, bias, label) {
  const value = safeRange(
    section,
    pointer.displayedOffset + bias,
    pointer.bytes,
    label,
  )
  if (pointer.actualFileOffset !== undefined) {
    assertEqual(
      sectionFileOffset + pointer.displayedOffset + bias,
      pointer.actualFileOffset,
      `${label} actual file offset`,
    )
  }
  if (pointer.sha256 !== undefined) {
    assertEqual(sha256(value), pointer.sha256, `${label} SHA-256`)
  }
  return value
}

function verifyModuleRecord(
  record,
  module,
  section,
  sectionFileOffset,
  bias,
) {
  const label = `module ${module.index}`
  assertEqual(record.readUInt32LE(0), module.name.displayedOffset, `${label} name offset`)
  assertEqual(record.readUInt32LE(4), module.name.bytes, `${label} name bytes`)
  assertEqual(record.readUInt32LE(8), module.content.displayedOffset, `${label} content offset`)
  assertEqual(record.readUInt32LE(12), module.content.bytes, `${label} content bytes`)
  const name = verifyPointer(
    section,
    sectionFileOffset,
    module.name,
    bias,
    `${label} name`,
  ).toString('utf8')
  assertEqual(name, module.path, `${label} path`)
  const content = verifyPointer(
    section,
    sectionFileOffset,
    module.content,
    bias,
    `${label} content`,
  )

  const jscOffset = record.readUInt32LE(24)
  const jscBytes = record.readUInt32LE(28)
  const originOffset = record.readUInt32LE(40)
  const originBytes = record.readUInt32LE(44)
  let jsc = null
  if (module.jsc) {
    assertEqual(jscOffset, module.jsc.displayedOffset, `${label} JSC offset`)
    assertEqual(jscBytes, module.jsc.bytes, `${label} JSC bytes`)
    jsc = verifyPointer(
      section,
      sectionFileOffset,
      module.jsc,
      bias,
      `${label} JSC`,
    )
    const origin = verifyPointer(
      section,
      sectionFileOffset,
      { displayedOffset: originOffset, bytes: originBytes },
      bias,
      `${label} bytecode origin path`,
    ).toString('utf8')
    assertEqual(origin, module.bytecodeOriginPath, `${label} bytecode origin path`)
  } else {
    assertEqual(jscOffset, 0, `${label} absent JSC offset`)
    assertEqual(jscBytes, 0, `${label} absent JSC bytes`)
    assertEqual(originOffset, 0, `${label} absent origin offset`)
    assertEqual(originBytes, 0, `${label} absent origin bytes`)
  }
  assertEqual(record[48], module.encoding, `${label} encoding`)
  assertEqual(record[49], module.loader, `${label} loader`)
  assertEqual(record[50], module.moduleFormat, `${label} module format`)
  assertEqual(record[51], module.side, `${label} side`)
  return { content, jsc }
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
  const artifactsRoot = path.resolve(args.artifacts)
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const extraction = manifest.generatedRecovery?.bunExtraction
  if (!extraction) throw new Error('Manifest has no bunExtraction ledger')
  const inventoryFile = verifiedCaseFile(
    manifest,
    caseRoot,
    extraction.inventory,
    'Bun inventory',
  )
  const inventory = JSON.parse(inventoryFile.value.toString('utf8'))
  const executable = verifiedArtifact(
    manifest,
    artifactsRoot,
    extraction.executableArtifact,
  )
  assertEqual(executable.value.length, inventory.artifact.bytes, 'inventory executable bytes')
  assertEqual(executable.evidence.sha256, inventory.artifact.sha256, 'inventory executable SHA-256')

  const sectionInfo = inventory.bunSection
  const section = safeRange(
    executable.value,
    sectionInfo.fileOffset,
    sectionInfo.bytes,
    '.bun section',
  )
  assertEqual(sha256(section), sectionInfo.sha256, '.bun section SHA-256')
  assertEqual(
    sectionInfo.fileOffset + sectionInfo.bytes,
    sectionInfo.endFileOffset,
    '.bun section end',
  )
  const footer = safeRange(
    section,
    section.length - sectionInfo.footerBytes,
    sectionInfo.footerBytes,
    '.bun footer',
  )
  assertEqual(sha256(footer), sectionInfo.footerSha256, '.bun footer SHA-256')
  assertEqual(
    footer.subarray(0, 8).toString('hex'),
    sectionInfo.footerPrefixHex,
    '.bun footer prefix',
  )
  assertEqual(
    Number(footer.readBigUInt64LE(8)),
    sectionInfo.footer.byteCount,
    '.bun footer byte count',
  )
  assertEqual(footer.readUInt32LE(16), sectionInfo.footer.modulesPointer.displayedOffset, '.bun module pointer')
  assertEqual(footer.readUInt32LE(20), sectionInfo.footer.modulesPointer.bytes, '.bun module directory bytes')
  assertEqual(footer.readUInt32LE(24), sectionInfo.footer.entryPointId, '.bun entry point')
  assertEqual(footer.readUInt32LE(28), sectionInfo.footer.execArgv.displayedOffset, '.bun exec argv offset')
  assertEqual(footer.readUInt32LE(32), sectionInfo.footer.execArgv.bytes, '.bun exec argv bytes')
  assertEqual(footer.readUInt32LE(36), sectionInfo.footer.flags, '.bun flags')
  assertEqual(footer.subarray(40).toString('utf8'), sectionInfo.trailerMagic, '.bun trailer magic')

  const recordBytes = sectionInfo.directoryRecordBytes
  if (sectionInfo.footer.modulesPointer.bytes % recordBytes !== 0) {
    throw new Error('.bun module directory has a partial record')
  }
  const moduleCount = sectionInfo.footer.modulesPointer.bytes / recordBytes
  assertEqual(moduleCount, sectionInfo.moduleCount, '.bun module count')
  assertEqual(inventory.modules.length, moduleCount, 'inventory module count')
  if (sectionInfo.footer.entryPointId >= moduleCount) {
    throw new Error('.bun entry point is outside the module directory')
  }
  const bias = sectionInfo.displayedPointerBiasBytes
  const directory = verifyPointer(
    section,
    sectionInfo.fileOffset,
    sectionInfo.footer.modulesPointer,
    bias,
    '.bun module directory',
  )
  assertEqual(sha256(directory), sectionInfo.directorySha256, '.bun directory SHA-256')

  if (!Array.isArray(extraction.moduleArtifacts)) {
    throw new Error('bunExtraction.moduleArtifacts must be an array')
  }
  assertEqual(
    extraction.moduleArtifacts.length,
    moduleCount,
    'Bun module artifact recipe count',
  )
  const moduleRecipes = new Map()
  for (const recipe of extraction.moduleArtifacts) {
    if (
      !recipe ||
      typeof recipe !== 'object' ||
      Array.isArray(recipe) ||
      !Number.isSafeInteger(recipe.index) ||
      typeof recipe.contentArtifact !== 'string' ||
      recipe.contentArtifact.length === 0
    ) {
      throw new Error('Invalid Bun module artifact recipe')
    }
    if (moduleRecipes.has(recipe.index)) {
      throw new Error(`Duplicate Bun module artifact index: ${recipe.index}`)
    }
    moduleRecipes.set(recipe.index, recipe)
  }
  for (let index = 0; index < moduleCount; index += 1) {
    const module = inventory.modules[index]
    const recipe = moduleRecipes.get(index)
    if (!recipe) throw new Error(`Missing Bun module artifact index: ${index}`)
    if (module.jsc && typeof recipe.jscArtifact !== 'string') {
      throw new Error(`Bun module ${index}: missing JSC artifact`)
    }
    if (!module.jsc && recipe.jscArtifact !== undefined) {
      throw new Error(`Bun module ${index}: unexpected JSC artifact`)
    }
  }

  const extracted = new Map()
  for (let index = 0; index < moduleCount; index += 1) {
    const module = inventory.modules[index]
    assertEqual(module.index, index, `module ${index} inventory index`)
    const record = directory.subarray(index * recordBytes, (index + 1) * recordBytes)
    extracted.set(
      index,
      verifyModuleRecord(record, module, section, sectionInfo.fileOffset, bias),
    )
  }

  for (const recipe of extraction.moduleArtifacts) {
    const module = inventory.modules[recipe.index]
    if (!module) throw new Error(`Unknown Bun module index: ${recipe.index}`)
    const values = extracted.get(recipe.index)
    const contentArtifact = verifiedArtifact(
      manifest,
      artifactsRoot,
      recipe.contentArtifact,
    )
    if (!contentArtifact.value.equals(values.content)) {
      throw new Error(`${recipe.contentArtifact}: differs from raw Bun content`)
    }
    if (recipe.jscArtifact) {
      const jscArtifact = verifiedArtifact(
        manifest,
        artifactsRoot,
        recipe.jscArtifact,
      )
      if (!jscArtifact.value.equals(values.jsc)) {
        throw new Error(`${recipe.jscArtifact}: differs from raw Bun JSC`)
      }
    }
  }

  const embeddedCode = manifest.generatedRecovery?.embeddedCode
  if (!embeddedCode || !Array.isArray(embeddedCode.files)) {
    throw new Error('Bun extraction requires an embeddedCode recovery ledger')
  }
  const bunRootPrefix = '/$bunfs/root/'
  const expectedJavaScriptArtifacts = new Map()
  for (const module of inventory.modules.filter(
    item => item.kind === 'js' || item.kind === 'js+jsc',
  )) {
    if (!module.path.startsWith(bunRootPrefix)) {
      throw new Error(`Bun JavaScript module is outside root: ${module.path}`)
    }
    const artifactId = moduleRecipes.get(module.index).contentArtifact
    if (expectedJavaScriptArtifacts.has(artifactId)) {
      throw new Error(`Duplicate Bun JavaScript artifact: ${artifactId}`)
    }
    expectedJavaScriptArtifacts.set(
      artifactId,
      module.path.slice(bunRootPrefix.length),
    )
  }
  const recoveredJavaScriptArtifacts = new Set()
  for (const recipe of embeddedCode.files) {
    if (
      !recipe ||
      typeof recipe !== 'object' ||
      Array.isArray(recipe) ||
      typeof recipe.targetArtifact !== 'string' ||
      recipe.targetArtifact.length === 0
    ) {
      throw new Error('Invalid embedded-code recovery recipe')
    }
    if (recoveredJavaScriptArtifacts.has(recipe.targetArtifact)) {
      throw new Error(
        `Duplicate embedded-code target artifact: ${recipe.targetArtifact}`,
      )
    }
    const expectedPath = expectedJavaScriptArtifacts.get(
      recipe.targetArtifact,
    )
    if (expectedPath !== undefined) {
      assertEqual(
        recipe.path,
        expectedPath,
        `${recipe.targetArtifact} embedded-code path`,
      )
    }
    recoveredJavaScriptArtifacts.add(recipe.targetArtifact)
  }
  assertEqual(
    recoveredJavaScriptArtifacts.size,
    expectedJavaScriptArtifacts.size,
    'embedded JavaScript artifact count',
  )
  for (const artifactId of expectedJavaScriptArtifacts.keys()) {
    if (!recoveredJavaScriptArtifacts.has(artifactId)) {
      throw new Error(
        `Embedded-code recovery omits Bun JavaScript artifact: ${artifactId}`,
      )
    }
  }

  const entry = inventory.modules[sectionInfo.footer.entryPointId]
  const wrapped = extracted.get(entry.index).content
  const analyzableInfo = inventory.derivedAnalyzableCli
  assertEqual(wrapped.length, analyzableInfo.canonicalWrapped.bytes, 'wrapped CLI bytes')
  assertEqual(sha256(wrapped), analyzableInfo.canonicalWrapped.sha256, 'wrapped CLI SHA-256')
  const prefix = Buffer.from(analyzableInfo.wrapperPrefix)
  const suffix = Buffer.from(analyzableInfo.wrapperSuffix)
  assertEqual(prefix.length, analyzableInfo.wrapperPrefixBytes, 'CLI wrapper prefix bytes')
  assertEqual(suffix.length, analyzableInfo.wrapperSuffixBytes, 'CLI wrapper suffix bytes')
  if (!wrapped.subarray(0, prefix.length).equals(prefix)) {
    throw new Error('CLI wrapper prefix differs')
  }
  if (!wrapped.subarray(wrapped.length - suffix.length).equals(suffix)) {
    throw new Error('CLI wrapper suffix differs')
  }
  const inner = wrapped.subarray(prefix.length, wrapped.length - suffix.length)
  assertEqual(inner.length, analyzableInfo.inner.bytes, 'analyzable CLI bytes')
  assertEqual(sha256(inner), analyzableInfo.inner.sha256, 'analyzable CLI SHA-256')
  const analyzableArtifact = verifiedArtifact(
    manifest,
    artifactsRoot,
    extraction.analyzableArtifact,
  )
  if (!analyzableArtifact.value.equals(inner)) {
    throw new Error('Analyzable CLI artifact differs from wrapper interior')
  }
  if (analyzableInfo.inner.nodeCheck) {
    const checked = spawnSync(process.execPath, ['--check', analyzableArtifact.filename], {
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    })
    if (checked.error) throw checked.error
    if (checked.status !== 0) {
      throw new Error(`Analyzable CLI syntax check failed:\n${checked.stderr || checked.stdout}`)
    }
  }

  console.log(
    JSON.stringify(
      {
        status: 'bun-container-verified',
        executable: {
          bytes: executable.value.length,
          sha256: executable.evidence.sha256,
        },
        bunSection: {
          fileOffset: sectionInfo.fileOffset,
          bytes: section.length,
          sha256: sectionInfo.sha256,
        },
        modules: inventory.modules.map(module => ({
          index: module.index,
          path: module.path,
          kind: module.kind,
          bytes: module.content.bytes,
          sha256: module.content.sha256,
          jscBytes: module.jsc?.bytes ?? 0,
          jscSha256: module.jsc?.sha256 ?? null,
        })),
        entryPointId: sectionInfo.footer.entryPointId,
        targetBundle: analyzableInfo.canonicalWrapped,
        analyzableBundle: analyzableInfo.inner,
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
