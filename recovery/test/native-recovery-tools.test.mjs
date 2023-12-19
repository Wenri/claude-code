import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const verifyBunContainer = fileURLToPath(
  new URL('../scripts/verify-bun-container.mjs', import.meta.url),
)
const reconstructEmbeddedCode = fileURLToPath(
  new URL('../scripts/reconstruct-embedded-code.mjs', import.meta.url),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function evidence(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function writeJson(filename, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, bytes)
  return bytes
}

function framedTreeSha256(files) {
  const hash = crypto.createHash('sha256')
  for (const file of files) {
    hash
      .update(file.path)
      .update('\0')
      .update(String(file.value.length))
      .update('\0')
      .update(sha256(file.value))
      .update('\n')
  }
  return hash.digest('hex')
}

function bunFixture({ moduleRecipes = 'complete', embedded = 'complete' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bun-container-test-'))
  const caseRoot = path.join(root, 'case')
  const artifactsRoot = path.join(root, 'artifacts')
  fs.mkdirSync(caseRoot, { recursive: true })
  fs.mkdirSync(artifactsRoot, { recursive: true })

  const wrapperPrefix = '// synthetic Bun wrapper\n'
  const wrapperSuffix = '\n// wrapper end\n'
  const inner = Buffer.from('console.log("fixture")\n')
  const modules = [
    {
      path: '/$bunfs/root/src/entrypoints/cli.js',
      content: Buffer.concat([
        Buffer.from(wrapperPrefix),
        inner,
        Buffer.from(wrapperSuffix),
      ]),
      artifact: 'targetBundle',
    },
    {
      path: '/$bunfs/root/image-processor.js',
      content: Buffer.from('export default "image fixture"\n'),
      artifact: 'targetImageProcessorJs',
    },
  ]
  const directoryRecordBytes = 52
  const footerBytes = 56
  const data = []
  let cursor = 0
  for (const module of modules) {
    const name = Buffer.from(module.path)
    module.name = { displayedOffset: cursor, bytes: name.length }
    data.push({ offset: cursor, value: name })
    cursor += name.length
    module.contentPointer = {
      displayedOffset: cursor,
      bytes: module.content.length,
      sha256: sha256(module.content),
    }
    data.push({ offset: cursor, value: module.content })
    cursor += module.content.length
  }
  const directoryOffset = cursor
  const directory = Buffer.alloc(modules.length * directoryRecordBytes)
  for (const [index, module] of modules.entries()) {
    const offset = index * directoryRecordBytes
    directory.writeUInt32LE(module.name.displayedOffset, offset)
    directory.writeUInt32LE(module.name.bytes, offset + 4)
    directory.writeUInt32LE(module.contentPointer.displayedOffset, offset + 8)
    directory.writeUInt32LE(module.contentPointer.bytes, offset + 12)
    directory[offset + 48] = 1
    directory[offset + 49] = 1
    directory[offset + 50] = 2
    directory[offset + 51] = 0
  }
  cursor += directory.length
  const footer = Buffer.alloc(footerBytes)
  const footerPrefix = Buffer.from([0, 0, 0, 0, 10, 0, 1, 0])
  const trailerMagic = '\n---- Bun! ----\n'
  footerPrefix.copy(footer)
  footer.writeBigUInt64LE(BigInt(cursor), 8)
  footer.writeUInt32LE(directoryOffset, 16)
  footer.writeUInt32LE(directory.length, 20)
  footer.writeUInt32LE(0, 24)
  footer.writeUInt32LE(cursor, 28)
  footer.writeUInt32LE(0, 32)
  footer.writeUInt32LE(15, 36)
  Buffer.from(trailerMagic).copy(footer, 40)

  const section = Buffer.alloc(cursor + footer.length)
  for (const item of data) item.value.copy(section, item.offset)
  directory.copy(section, directoryOffset)
  footer.copy(section, cursor)
  const executablePrefix = Buffer.from('\x7fELF synthetic executable\n')
  const executable = Buffer.concat([executablePrefix, section])
  const sectionOffset = executablePrefix.length

  const inventory = {
    schemaVersion: 1,
    kind: 'bun-compiled-elf-embedded-graph',
    artifact: evidence(executable),
    bunSection: {
      fileOffset: sectionOffset,
      bytes: section.length,
      endFileOffset: executable.length,
      sha256: sha256(section),
      trailerMagic,
      footerBytes,
      footerSha256: sha256(footer),
      footerPrefixHex: footerPrefix.toString('hex'),
      footer: {
        byteCount: cursor,
        modulesPointer: {
          displayedOffset: directoryOffset,
          bytes: directory.length,
        },
        entryPointId: 0,
        execArgv: { displayedOffset: cursor, bytes: 0 },
        flags: 15,
      },
      directoryRecordBytes,
      directorySha256: sha256(directory),
      moduleCount: modules.length,
      displayedPointerBiasBytes: 0,
    },
    modules: modules.map((module, index) => ({
      index,
      path: module.path,
      name: module.name,
      content: module.contentPointer,
      encoding: 1,
      loader: 1,
      moduleFormat: 2,
      side: 0,
      kind: 'js',
    })),
    derivedAnalyzableCli: {
      canonicalWrapped: evidence(modules[0].content),
      wrapperPrefixBytes: Buffer.byteLength(wrapperPrefix),
      wrapperPrefix,
      wrapperSuffixBytes: Buffer.byteLength(wrapperSuffix),
      wrapperSuffix,
      inner: { ...evidence(inner), nodeCheck: false },
    },
  }
  const inventoryPath = path.join(caseRoot, 'inventory.json')
  const inventoryBytes = writeJson(inventoryPath, inventory)
  fs.writeFileSync(path.join(artifactsRoot, 'claude'), executable)
  fs.writeFileSync(path.join(artifactsRoot, 'cli.wrapped.js'), modules[0].content)
  fs.writeFileSync(path.join(artifactsRoot, 'cli.inner.js'), inner)
  fs.writeFileSync(path.join(artifactsRoot, 'image.js'), modules[1].content)

  const completeRecipes = modules.map((module, index) => ({
    index,
    contentArtifact: module.artifact,
  }))
  const selectedModuleRecipes =
    moduleRecipes === 'omitted'
      ? completeRecipes.slice(0, -1)
      : moduleRecipes === 'duplicate'
        ? [completeRecipes[0], { ...completeRecipes[0] }]
        : completeRecipes
  const embeddedFiles = modules.map((module, index) => ({
    path: index === 0 ? 'src/entrypoints/cli.js' : 'image-processor.js',
    targetArtifact: module.artifact,
  }))
  const selectedEmbeddedFiles =
    embedded === 'omitted'
      ? embeddedFiles.slice(0, -1)
      : embedded === 'swapped'
        ? [
            { ...embeddedFiles[0], path: embeddedFiles[1].path },
            { ...embeddedFiles[1], path: embeddedFiles[0].path },
          ]
        : embeddedFiles
  const manifest = {
    artifacts: [
      { id: 'targetExecutable', localPath: 'claude', ...evidence(executable) },
      {
        id: 'targetBundle',
        localPath: 'cli.wrapped.js',
        ...evidence(modules[0].content),
      },
      {
        id: 'targetAnalyzableBundle',
        localPath: 'cli.inner.js',
        ...evidence(inner),
      },
      {
        id: 'targetImageProcessorJs',
        localPath: 'image.js',
        ...evidence(modules[1].content),
      },
    ],
    generatedRecovery: {
      bunExtraction: {
        inventory: 'inventory.json',
        executableArtifact: 'targetExecutable',
        analyzableArtifact: 'targetAnalyzableBundle',
        moduleArtifacts: selectedModuleRecipes,
      },
      embeddedCode: { files: selectedEmbeddedFiles },
      fileAssertions: [
        { path: 'inventory.json', ...evidence(inventoryBytes) },
      ],
    },
  }
  const manifestPath = path.join(caseRoot, 'manifest.json')
  writeJson(manifestPath, manifest)
  return { root, manifestPath, artifactsRoot }
}

function verifyFixture(options) {
  const fixture = bunFixture(options)
  const result = spawnSync(
    process.execPath,
    [
      verifyBunContainer,
      '--case',
      fixture.manifestPath,
      '--artifacts',
      fixture.artifactsRoot,
    ],
    { encoding: 'utf8' },
  )
  return { ...fixture, result }
}

test('verifies a complete synthetic Bun module graph', () => {
  const fixture = verifyFixture()
  try {
    assert.equal(fixture.result.status, 0, fixture.result.stderr)
    const report = JSON.parse(fixture.result.stdout)
    assert.equal(report.status, 'bun-container-verified')
    assert.equal(report.modules.length, 2)
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('rejects omitted and duplicate Bun module artifact recipes', () => {
  for (const scenario of ['omitted', 'duplicate']) {
    const fixture = verifyFixture({ moduleRecipes: scenario })
    try {
      assert.notEqual(fixture.result.status, 0)
      assert.match(
        fixture.result.stderr,
        scenario === 'omitted'
          ? /Bun module artifact recipe count: expected 2, got 1/
          : /Duplicate Bun module artifact index: 0/,
      )
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true })
    }
  }
})

test('rejects embedded-code ledgers that omit a Bun JavaScript module', () => {
  const fixture = verifyFixture({ embedded: 'omitted' })
  try {
    assert.notEqual(fixture.result.status, 0)
    assert.match(
      fixture.result.stderr,
      /embedded JavaScript artifact count: expected 2, got 1/,
    )
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('rejects embedded-code ledgers that swap Bun JavaScript paths', () => {
  const fixture = verifyFixture({ embedded: 'swapped' })
  try {
    assert.notEqual(fixture.result.status, 0)
    assert.match(
      fixture.result.stderr,
      /targetBundle embedded-code path: expected src\/entrypoints\/cli\.js, got image-processor\.js/,
    )
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('reconstructs every embedded JavaScript file byte-for-byte', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'embedded-code-test-'))
  try {
    const caseRoot = path.join(root, 'case')
    const artifactsRoot = path.join(root, 'artifacts')
    const payloadRoot = path.join(caseRoot, 'diff')
    fs.mkdirSync(payloadRoot, { recursive: true })
    fs.mkdirSync(artifactsRoot, { recursive: true })
    const baselineCli = Buffer.from('console.log("baseline")\n')
    const targetCli = Buffer.from('console.log("target exact bytes")\n')
    const helper = Buffer.from('export default "helper exact bytes"\n')
    const baselinePath = path.join(artifactsRoot, 'baseline.js')
    const targetPath = path.join(artifactsRoot, 'target.js')
    const helperPath = path.join(artifactsRoot, 'helper.js')
    fs.writeFileSync(baselinePath, baselineCli)
    fs.writeFileSync(targetPath, targetCli)
    fs.writeFileSync(helperPath, helper)
    const cliPayload = path.join(payloadRoot, 'cli.delta.zst')
    const helperPayload = path.join(payloadRoot, 'helper.zst')
    execFileSync(
      'zstd',
      [
        `--patch-from=${baselinePath}`,
        targetPath,
        '-o',
        cliPayload,
        '--force',
      ],
      { stdio: 'pipe' },
    )
    execFileSync(
      'zstd',
      [helperPath, '-o', helperPayload, '--force'],
      { stdio: 'pipe' },
    )
    const files = [
      { path: 'src/entrypoints/cli.js', value: targetCli },
      { path: 'image-processor.js', value: helper },
    ]
    const manifest = {
      artifacts: [
        {
          id: 'baselineBundle',
          localPath: 'baseline.js',
          ...evidence(baselineCli),
        },
        {
          id: 'targetBundle',
          localPath: 'target.js',
          ...evidence(targetCli),
        },
        {
          id: 'targetHelper',
          localPath: 'helper.js',
          ...evidence(helper),
        },
      ],
      generatedRecovery: {
        embeddedCode: {
          files: [
            {
              path: files[0].path,
              algorithm: 'zstd-dictionary-patch',
              baselineArtifact: 'baselineBundle',
              targetArtifact: 'targetBundle',
              payload: 'diff/cli.delta.zst',
            },
            {
              path: files[1].path,
              algorithm: 'zstd',
              targetArtifact: 'targetHelper',
              payload: 'diff/helper.zst',
            },
          ],
          targetFiles: files.length,
          targetBytes: files.reduce(
            (total, file) => total + file.value.length,
            0,
          ),
          targetFramedTreeSha256: framedTreeSha256(files),
        },
        fileAssertions: [
          {
            path: 'diff/cli.delta.zst',
            ...evidence(fs.readFileSync(cliPayload)),
          },
          {
            path: 'diff/helper.zst',
            ...evidence(fs.readFileSync(helperPayload)),
          },
        ],
      },
    }
    const manifestPath = path.join(caseRoot, 'manifest.json')
    writeJson(manifestPath, manifest)
    const output = path.join(root, 'output')
    const report = JSON.parse(
      execFileSync(
        process.execPath,
        [
          reconstructEmbeddedCode,
          '--case',
          manifestPath,
          '--artifacts',
          artifactsRoot,
          '--output',
          output,
        ],
        { encoding: 'utf8' },
      ),
    )
    assert.equal(report.status, 'embedded-code-reconstructed')
    assert.equal(report.targetFiles, 2)
    for (const file of files) {
      assert.deepEqual(fs.readFileSync(path.join(output, file.path)), file.value)
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
