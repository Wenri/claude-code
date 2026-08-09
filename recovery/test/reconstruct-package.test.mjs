import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(
  new URL('../scripts/reconstruct-package.mjs', import.meta.url),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function evidence(value) {
  return {
    bytes: value.length,
    sha256: sha256(value),
  }
}

function writeString(header, offset, length, value) {
  const encoded = Buffer.from(value)
  assert.ok(encoded.length <= length)
  encoded.copy(header, offset)
}

function writeOctal(header, offset, length, value) {
  writeString(
    header,
    offset,
    length,
    `${value.toString(8).padStart(length - 1, '0')}\0`,
  )
}

function tarball(entries) {
  const blocks = []
  for (const entry of entries) {
    const header = Buffer.alloc(512)
    writeString(header, 0, 100, entry.path)
    writeOctal(header, 100, 8, entry.mode)
    writeOctal(header, 108, 8, 0)
    writeOctal(header, 116, 8, 0)
    writeOctal(header, 124, 12, entry.content.length)
    writeOctal(header, 136, 12, 0)
    header.fill(32, 148, 156)
    header[156] = '0'.charCodeAt(0)
    writeString(header, 257, 6, 'ustar\0')
    writeString(header, 263, 2, '00')
    const checksum = header.reduce((sum, byte) => sum + byte, 0)
    writeString(
      header,
      148,
      8,
      `${checksum.toString(8).padStart(6, '0')}\0 `,
    )
    blocks.push(header, entry.content)
    const padding = (512 - (entry.content.length % 512)) % 512
    if (padding > 0) blocks.push(Buffer.alloc(padding))
  }
  blocks.push(Buffer.alloc(1024))
  return zlib.gzipSync(Buffer.concat(blocks), { level: 9, mtime: 0 })
}

function memberEvidence(entry) {
  return {
    type: 'file',
    linkPath: null,
    mode: entry.mode.toString(8).padStart(4, '0'),
    bytes: entry.content.length,
    sha256: sha256(entry.content),
  }
}

function framedTreeSha256(members) {
  const hash = crypto.createHash('sha256')
  for (const member of members) {
    hash
      .update(member.path)
      .update('\0')
      .update(member.target.mode)
      .update('\0')
      .update(member.target.sha256)
      .update('\0')
  }
  return hash.digest('hex')
}

function reconstructFixture({
  baselineVersion,
  targetVersion,
  declarationInsertion,
  declarationEdits = null,
  addedMember = false,
  addedPayloadRecipe = 'valid',
  changedMember = false,
  changedPayloadRecipe = 'valid',
  declarationDictionaryPatch = false,
  packageJsonDictionaryPatch = false,
  packageJsonInsertion = null,
  packageJsonAssertionAnchor,
  packageJsonDuplicateAnchor = false,
  expectedError,
}) {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'reconstruct-package-test-'),
  )
  try {
    const baselineCli = Buffer.from(
      `#!/usr/bin/env node\nconsole.log("${baselineVersion}")\n`,
    )
    const targetCli = Buffer.from(
      `#!/usr/bin/env node\nconsole.log("${targetVersion}: changed")\n`,
    )
    const duplicateFields = packageJsonDuplicateAnchor
      ? ',\n  "firstMarker": "duplicate-anchor",' +
        '\n  "secondMarker": "duplicate-anchor"'
      : ''
    const baselinePackageJsonText =
      `{\n  "name": "@example/package",\n` +
      `  "version": "${baselineVersion}"${duplicateFields}\n}\n`
    const targetVersionAnchor = `  "version": "${targetVersion}"`
    let targetPackageJsonText = baselinePackageJsonText.replace(
      `"version": "${baselineVersion}"`,
      `"version": "${targetVersion}"`,
    )
    if (packageJsonInsertion !== null) {
      targetPackageJsonText = targetPackageJsonText.replace(
        targetVersionAnchor,
        targetVersionAnchor + packageJsonInsertion,
      )
    }
    if (packageJsonDictionaryPatch) {
      targetPackageJsonText = targetPackageJsonText.replace(
        targetVersionAnchor,
        targetVersionAnchor +
          ',\n  "optionalDependencies": {"@example/native": "1.0.0"}',
      )
    }
    const baselinePackageJson = Buffer.from(baselinePackageJsonText)
    const targetPackageJson = Buffer.from(targetPackageJsonText)
    const declarationAnchor = 'export type Stable = string\n'
    const declarationSuffix =
      'export interface EditResult {\n  originalFile: string;\n}\n'
    const baselineDeclarationsText = declarationAnchor + declarationSuffix
    let targetDeclarationsText = baselineDeclarationsText
    if (declarationInsertion) {
      targetDeclarationsText =
        declarationAnchor + declarationInsertion + declarationSuffix
    } else if (declarationEdits) {
      for (const edit of declarationEdits) {
        if (Object.hasOwn(edit, 'from')) {
          targetDeclarationsText = targetDeclarationsText.replace(
            edit.from,
            edit.to,
          )
        } else {
          targetDeclarationsText = targetDeclarationsText.replace(
            edit.anchor,
            edit.anchor + edit.text,
          )
        }
      }
    }
    const baselineDeclarations = Buffer.from(baselineDeclarationsText)
    const targetDeclarations = Buffer.from(targetDeclarationsText)
    const addedEntry = {
      path: 'package/vendor/seccomp/x64/apply-seccomp',
      mode: 0o751,
      content: Buffer.from(
        '\x7fELF exact fixture payload\nwith binary-safe bytes: \0\xff\n',
        'latin1',
      ),
    }
    const changedBaselineEntry = {
      path: 'package/vendor/ripgrep/x64-linux/rg',
      mode: 0o644,
      content: Buffer.from(
        '\x7fELF baseline vendor binary\nwith binary bytes: \0\xff\n',
        'latin1',
      ),
    }
    const changedTargetEntry = {
      path: changedBaselineEntry.path,
      mode: 0o755,
      content: Buffer.from(
        '\x7fELF recovered vendor binary\nwith binary bytes: \0\xfe\n',
        'latin1',
      ),
    }
    const baselineEntries = [
      {
        path: 'package/bin/tool',
        mode: 0o644,
        content: Buffer.from('identical executable bytes\n'),
      },
      { path: 'package/cli.js', mode: 0o755, content: baselineCli },
      {
        path: 'package/package.json',
        mode: 0o644,
        content: baselinePackageJson,
      },
      {
        path: 'package/sdk-tools.d.ts',
        mode: 0o644,
        content: baselineDeclarations,
      },
      {
        path: 'package/stable.txt',
        mode: 0o644,
        content: Buffer.from('unchanged\n'),
      },
      ...(changedMember ? [changedBaselineEntry] : []),
    ]
    const targetEntries = [
      {
        path: 'package/bin/tool',
        mode: 0o755,
        content: Buffer.from('identical executable bytes\n'),
      },
      { path: 'package/cli.js', mode: 0o755, content: targetCli },
      {
        path: 'package/package.json',
        mode: 0o644,
        content: targetPackageJson,
      },
      {
        path: 'package/sdk-tools.d.ts',
        mode: 0o644,
        content: targetDeclarations,
      },
      {
        path: 'package/stable.txt',
        mode: 0o644,
        content: Buffer.from('unchanged\n'),
      },
      ...(changedMember ? [changedTargetEntry] : []),
      ...(addedMember ? [addedEntry] : []),
    ]
    const targetByPath = new Map(
      targetEntries.map(entry => [entry.path, entry]),
    )
    const members = baselineEntries.map(baselineEntry => {
      const targetEntry = targetByPath.get(baselineEntry.path)
      const baseline = memberEvidence(baselineEntry)
      const target = memberEvidence(targetEntry)
      return {
        path: baselineEntry.path,
        status:
          baseline.mode === target.mode &&
          baseline.sha256 === target.sha256
            ? 'unchanged'
            : 'changed',
        baseline,
        target,
      }
    })
    if (addedMember) {
      members.push({
        path: addedEntry.path,
        status: 'added',
        baseline: null,
        target: memberEvidence(addedEntry),
      })
    }

    const baselineArchive = tarball(baselineEntries)
    const targetArchive = tarball(targetEntries)
    const baselineTarball = path.join(temporary, 'baseline.tgz')
    fs.writeFileSync(baselineTarball, baselineArchive)

    const artifactsRoot = path.join(temporary, 'artifacts')
    const targetPackageDirectory = path.join(
      artifactsRoot,
      targetVersion,
      'package',
    )
    fs.mkdirSync(targetPackageDirectory, { recursive: true })
    const targetTarball = path.join(
      artifactsRoot,
      targetVersion,
      'package.tgz',
    )
    fs.writeFileSync(targetTarball, targetArchive)
    fs.writeFileSync(
      path.join(targetPackageDirectory, 'cli.js'),
      targetCli,
    )

    const caseRoot = path.join(temporary, 'case')
    const recovered = path.join(caseRoot, 'recovered')
    fs.mkdirSync(recovered, { recursive: true })
    const baselineCliFile = path.join(temporary, 'baseline-cli.js')
    const targetCliFile = path.join(temporary, 'target-cli.js')
    const deltaFile = path.join(recovered, 'cli.delta.zst')
    fs.writeFileSync(baselineCliFile, baselineCli)
    fs.writeFileSync(targetCliFile, targetCli)
    execFileSync(
      'zstd',
      [
        `--patch-from=${baselineCliFile}`,
        targetCliFile,
        '-o',
        deltaFile,
        '--force',
      ],
      { stdio: 'pipe' },
    )
    const addedPayloadPath = 'recovered/added-member.zst'
    const addedPayloadFile = path.join(caseRoot, addedPayloadPath)
    if (addedMember) {
      const addedMemberFile = path.join(temporary, 'added-member')
      fs.writeFileSync(addedMemberFile, addedEntry.content)
      execFileSync(
        'zstd',
        [addedMemberFile, '-o', addedPayloadFile, '--force'],
        { stdio: 'pipe' },
      )
    }
    const changedPayloadPath = 'recovered/changed-member.delta.zst'
    const changedPayloadFile = path.join(caseRoot, changedPayloadPath)
    if (changedMember) {
      const changedBaselineFile = path.join(
        temporary,
        'changed-member-baseline',
      )
      const changedTargetFile = path.join(
        temporary,
        'changed-member-target',
      )
      const changedPatchTarget =
        changedPayloadRecipe === 'wrong-target'
          ? Buffer.from(changedTargetEntry.content)
          : changedTargetEntry.content
      if (changedPayloadRecipe === 'wrong-target') {
        changedPatchTarget[changedPatchTarget.length - 2] ^= 1
      }
      fs.writeFileSync(changedBaselineFile, changedBaselineEntry.content)
      fs.writeFileSync(changedTargetFile, changedPatchTarget)
      execFileSync(
        'zstd',
        [
          `--patch-from=${changedBaselineFile}`,
          changedTargetFile,
          '-o',
          changedPayloadFile,
          '--force',
        ],
        { stdio: 'pipe' },
      )
    }
    const packageJsonPayloadPath =
      'recovered/package-json.delta.zst'
    const packageJsonPayloadFile = path.join(
      caseRoot,
      packageJsonPayloadPath,
    )
    if (packageJsonDictionaryPatch) {
      const packageJsonBaselineFile = path.join(
        temporary,
        'package-json-baseline',
      )
      const packageJsonTargetFile = path.join(
        temporary,
        'package-json-target',
      )
      fs.writeFileSync(packageJsonBaselineFile, baselinePackageJson)
      fs.writeFileSync(packageJsonTargetFile, targetPackageJson)
      execFileSync(
        'zstd',
        [
          `--patch-from=${packageJsonBaselineFile}`,
          packageJsonTargetFile,
          '-o',
          packageJsonPayloadFile,
          '--force',
        ],
        { stdio: 'pipe' },
      )
    }
    const declarationPayloadPath =
      'recovered/sdk-tools.d.ts.delta.zst'
    const declarationPayloadFile = path.join(
      caseRoot,
      declarationPayloadPath,
    )
    if (declarationDictionaryPatch) {
      const declarationBaselineFile = path.join(
        temporary,
        'declaration-baseline',
      )
      const declarationTargetFile = path.join(
        temporary,
        'declaration-target',
      )
      fs.writeFileSync(declarationBaselineFile, baselineDeclarations)
      fs.writeFileSync(declarationTargetFile, targetDeclarations)
      execFileSync(
        'zstd',
        [
          `--patch-from=${declarationBaselineFile}`,
          declarationTargetFile,
          '-o',
          declarationPayloadFile,
          '--force',
        ],
        { stdio: 'pipe' },
      )
    }

    const report = {
      artifacts: {
        baseline: {
          sha256: sha256(baselineArchive),
        },
        target: {
          sha256: sha256(targetArchive),
          unpackedMemberBytes: targetEntries.reduce(
            (sum, entry) => sum + entry.content.length,
            0,
          ),
        },
      },
      summary: {
        complete: true,
        targetMemberCount: targetEntries.length,
      },
      members,
    }
    const reportFile = path.join(caseRoot, 'package-members.json')
    const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`)
    fs.writeFileSync(reportFile, reportBytes)

    const targetAssertions = {
      packageVersionChange: {
        baseline: baselineVersion,
        target: targetVersion,
      },
    }
    if (declarationInsertion) {
      targetAssertions.declarationExactInsertion = {
        anchor: declarationAnchor,
        text: declarationInsertion,
      }
    } else if (declarationEdits) {
      targetAssertions.declarationExactEdits = declarationEdits
    } else {
      targetAssertions.declarationChange = {
        kind: 'unchanged',
      }
    }
    if (packageJsonInsertion !== null) {
      targetAssertions.packageJsonExactInsertion = {
        anchor: packageJsonAssertionAnchor ?? targetVersionAnchor,
        text: packageJsonInsertion,
      }
    }
    const validAddedPayloadRecipe = {
      member: addedEntry.path,
      path: addedPayloadPath,
      algorithm: 'zstd',
    }
    let addedMemberPayloads = []
    if (addedMember) {
      if (addedPayloadRecipe === 'valid') {
        addedMemberPayloads = [validAddedPayloadRecipe]
      } else if (addedPayloadRecipe === 'unsafe') {
        addedMemberPayloads = [
          {
            ...validAddedPayloadRecipe,
            path: '../outside-case.zst',
          },
        ]
      } else if (addedPayloadRecipe === 'duplicate') {
        addedMemberPayloads = [
          validAddedPayloadRecipe,
          { ...validAddedPayloadRecipe },
        ]
      } else if (addedPayloadRecipe !== 'missing') {
        throw new Error(`Unknown added payload recipe: ${addedPayloadRecipe}`)
      }
    }
    const addedPayloadAssertionPath =
      addedPayloadRecipe === 'unsafe'
        ? '../outside-case.zst'
        : addedPayloadPath
    const addedPayloadAssertion = addedMember
      ? {
          path: addedPayloadAssertionPath,
          ...evidence(fs.readFileSync(addedPayloadFile)),
        }
      : null
    const validChangedPayloadRecipe = {
      member: changedBaselineEntry.path,
      path: changedPayloadPath,
      algorithm: 'zstd-dictionary-patch',
    }
    let changedMemberPayloads = []
    if (changedMember) {
      if (
        changedPayloadRecipe === 'valid' ||
        changedPayloadRecipe === 'wrong-target'
      ) {
        changedMemberPayloads = [validChangedPayloadRecipe]
      } else if (changedPayloadRecipe === 'unsafe') {
        changedMemberPayloads = [
          {
            ...validChangedPayloadRecipe,
            path: '../outside-case.delta.zst',
          },
        ]
      } else if (changedPayloadRecipe === 'duplicate') {
        changedMemberPayloads = [
          validChangedPayloadRecipe,
          { ...validChangedPayloadRecipe },
        ]
      } else if (changedPayloadRecipe === 'extra') {
        changedMemberPayloads = [
          validChangedPayloadRecipe,
          {
            ...validChangedPayloadRecipe,
            member: 'package/stable.txt',
          },
        ]
      } else if (changedPayloadRecipe !== 'missing') {
        throw new Error(
          `Unknown changed payload recipe: ${changedPayloadRecipe}`,
        )
      }
    }
    if (packageJsonDictionaryPatch) {
      changedMemberPayloads.push({
        member: 'package/package.json',
        path: packageJsonPayloadPath,
        algorithm: 'zstd-dictionary-patch',
      })
    }
    if (declarationDictionaryPatch) {
      changedMemberPayloads.push({
        member: 'package/sdk-tools.d.ts',
        path: declarationPayloadPath,
        algorithm: 'zstd-dictionary-patch',
      })
    }
    const changedPayloadAssertionPath =
      changedPayloadRecipe === 'unsafe'
        ? '../outside-case.delta.zst'
        : changedPayloadPath
    const changedPayloadAssertion = changedMember
      ? {
          path: changedPayloadAssertionPath,
          ...evidence(fs.readFileSync(changedPayloadFile)),
        }
      : null
    const packageJsonPayloadAssertion = packageJsonDictionaryPatch
      ? {
          path: packageJsonPayloadPath,
          ...evidence(fs.readFileSync(packageJsonPayloadFile)),
        }
      : null
    const declarationPayloadAssertion = declarationDictionaryPatch
      ? {
          path: declarationPayloadPath,
          ...evidence(fs.readFileSync(declarationPayloadFile)),
        }
      : null
    const manifest = {
      artifacts: [
        {
          id: 'targetTarball',
          localPath: `${targetVersion}/package.tgz`,
          ...evidence(targetArchive),
        },
        {
          id: 'targetBundle',
          localPath: `${targetVersion}/package/cli.js`,
          ...evidence(targetCli),
        },
      ],
      targetAssertions,
      generatedRecovery: {
        packageMembers: {
          baselineTarball: evidence(baselineArchive),
          report: 'package-members.json',
          targetFramedTreeSha256: framedTreeSha256(members),
          addedMemberPayloads,
          changedMemberPayloads,
        },
        exactBundleDelta: {
          path: 'recovered/cli.delta.zst',
        },
        fileAssertions: [
          {
            path: 'package-members.json',
            ...evidence(reportBytes),
          },
          {
            path: 'recovered/cli.delta.zst',
            ...evidence(fs.readFileSync(deltaFile)),
          },
          ...(addedPayloadAssertion ? [addedPayloadAssertion] : []),
          ...(changedPayloadAssertion ? [changedPayloadAssertion] : []),
          ...(packageJsonPayloadAssertion
            ? [packageJsonPayloadAssertion]
            : []),
          ...(declarationPayloadAssertion
            ? [declarationPayloadAssertion]
            : []),
        ],
      },
    }
    const manifestFile = path.join(caseRoot, 'manifest.json')
    fs.writeFileSync(
      manifestFile,
      `${JSON.stringify(manifest, null, 2)}\n`,
    )

    const output = path.join(temporary, 'output', 'package')
    const commandArguments = [
      script,
      '--case',
      manifestFile,
      '--artifacts',
      artifactsRoot,
      '--baseline-tarball',
      baselineTarball,
      '--output',
      output,
    ]
    if (expectedError) {
      const result = spawnSync(process.execPath, commandArguments, {
        encoding: 'utf8',
      })
      assert.notEqual(result.status, 0)
      assert.match(result.stderr, expectedError)
      assert.equal(fs.existsSync(output), false)
      return
    }
    const result = JSON.parse(
      execFileSync(process.execPath, commandArguments, {
        encoding: 'utf8',
      }),
    )
    assert.equal(result.status, 'exact-package-tree-reconstructed')
    assert.equal(result.members, targetEntries.length)

    for (const entry of targetEntries) {
      const relative = entry.path.slice('package/'.length)
      const reconstructed = path.join(output, relative)
      assert.deepEqual(fs.readFileSync(reconstructed), entry.content)
      assert.equal(fs.statSync(reconstructed).mode & 0o777, entry.mode)
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
}

test('reuses baseline bytes for mode-only members and unchanged declarations', () => {
  reconstructFixture({
    baselineVersion: '2.1.89',
    targetVersion: '2.1.90',
    declarationInsertion: null,
  })
})

test('preserves the 2.1.89 declaration insertion recipe', () => {
  reconstructFixture({
    baselineVersion: '2.1.88',
    targetVersion: '2.1.89',
    declarationInsertion: 'export type Added = number\n',
  })
})

test('replays multiple exact declaration insertions and replacements', () => {
  reconstructFixture({
    baselineVersion: '2.1.96',
    targetVersion: '2.1.97',
    declarationInsertion: null,
    declarationEdits: [
      {
        anchor: 'export type Stable = string\n',
        text: 'export type ToolStats = { readCount: number }\n',
      },
      {
        from: '  originalFile: string;\n',
        to: '  originalFile: string | null;\n',
      },
    ],
  })
})

test('replaces the package version and performs one exact insertion', () => {
  reconstructFixture({
    baselineVersion: '2.1.90',
    targetVersion: '2.1.91',
    declarationInsertion: null,
    packageJsonInsertion: ',\n  "files": ["cli.js"]',
  })
})

test('reconstructs an added regular file from its exact zstd payload', () => {
  reconstructFixture({
    baselineVersion: '2.1.91',
    targetVersion: '2.1.92',
    declarationInsertion: null,
    addedMember: true,
  })
})

test('rejects an added member without an exact payload recipe', () => {
  reconstructFixture({
    baselineVersion: '2.1.91',
    targetVersion: '2.1.92',
    declarationInsertion: null,
    addedMember: true,
    addedPayloadRecipe: 'missing',
    expectedError:
      /package\/vendor\/seccomp\/x64\/apply-seccomp: no exact reconstruction recipe for added/,
  })
})

test('rejects an unsafe added-member payload path', () => {
  reconstructFixture({
    baselineVersion: '2.1.91',
    targetVersion: '2.1.92',
    declarationInsertion: null,
    addedMember: true,
    addedPayloadRecipe: 'unsafe',
    expectedError:
      /added-member payload: unsafe relative path \.\.\/outside-case\.zst/,
  })
})

test('rejects duplicate added-member payload recipes', () => {
  reconstructFixture({
    baselineVersion: '2.1.91',
    targetVersion: '2.1.92',
    declarationInsertion: null,
    addedMember: true,
    addedPayloadRecipe: 'duplicate',
    expectedError:
      /Duplicate added-member payload: package\/vendor\/seccomp\/x64\/apply-seccomp/,
  })
})

test('reconstructs a changed regular file from an exact dictionary patch', () => {
  reconstructFixture({
    baselineVersion: '2.1.92',
    targetVersion: '2.1.94',
    declarationInsertion: null,
    changedMember: true,
  })
})

test('prefers an exact package JSON dictionary patch over version-only edits', () => {
  reconstructFixture({
    baselineVersion: '2.1.112',
    targetVersion: '2.1.113',
    declarationInsertion: null,
    packageJsonDictionaryPatch: true,
  })
})

test('prefers an exact declaration dictionary patch over semantic edits', () => {
  reconstructFixture({
    baselineVersion: '2.1.114',
    targetVersion: '2.1.116',
    declarationInsertion: 'export type Added = number\n',
    declarationDictionaryPatch: true,
  })
})

test('rejects a changed member without an exact payload recipe', () => {
  reconstructFixture({
    baselineVersion: '2.1.92',
    targetVersion: '2.1.94',
    declarationInsertion: null,
    changedMember: true,
    changedPayloadRecipe: 'missing',
    expectedError:
      /package\/vendor\/ripgrep\/x64-linux\/rg: no exact reconstruction recipe for changed/,
  })
})

test('rejects an unsafe changed-member payload path', () => {
  reconstructFixture({
    baselineVersion: '2.1.92',
    targetVersion: '2.1.94',
    declarationInsertion: null,
    changedMember: true,
    changedPayloadRecipe: 'unsafe',
    expectedError:
      /changed-member payload: unsafe relative path \.\.\/outside-case\.delta\.zst/,
  })
})

test('rejects duplicate changed-member payload recipes', () => {
  reconstructFixture({
    baselineVersion: '2.1.92',
    targetVersion: '2.1.94',
    declarationInsertion: null,
    changedMember: true,
    changedPayloadRecipe: 'duplicate',
    expectedError:
      /Duplicate changed-member payload: package\/vendor\/ripgrep\/x64-linux\/rg/,
  })
})

test('rejects an unused changed-member payload recipe', () => {
  reconstructFixture({
    baselineVersion: '2.1.92',
    targetVersion: '2.1.94',
    declarationInsertion: null,
    changedMember: true,
    changedPayloadRecipe: 'extra',
    expectedError: /Unused changed-member payload: package\/stable\.txt/,
  })
})

test('rejects a changed-member patch that reconstructs the wrong bytes', () => {
  reconstructFixture({
    baselineVersion: '2.1.92',
    targetVersion: '2.1.94',
    declarationInsertion: null,
    changedMember: true,
    changedPayloadRecipe: 'wrong-target',
    expectedError:
      /reconstructed dictionary patch SHA-256: expected [0-9a-f]+, got [0-9a-f]+/,
  })
})

test('rejects a missing package JSON insertion anchor', () => {
  reconstructFixture({
    baselineVersion: '2.1.90',
    targetVersion: '2.1.91',
    declarationInsertion: null,
    packageJsonInsertion: ',\n  "files": ["cli.js"]',
    packageJsonAssertionAnchor: '"missing-anchor"',
    expectedError: /Package JSON insertion anchor is absent/,
  })
})

test('rejects a duplicate package JSON insertion anchor', () => {
  reconstructFixture({
    baselineVersion: '2.1.90',
    targetVersion: '2.1.91',
    declarationInsertion: null,
    packageJsonInsertion: ',\n  "files": ["cli.js"]',
    packageJsonAssertionAnchor: 'duplicate-anchor',
    packageJsonDuplicateAnchor: true,
    expectedError: /Package JSON insertion anchor is not unique/,
  })
})

test('uses a release-independent temporary-directory prefix', () => {
  const source = fs.readFileSync(script, 'utf8')
  assert.match(source, /\.claude-code-package-recovery-/)
  assert.doesNotMatch(source, /\.claude-code-2\.1\.89-recovery-/)
})
