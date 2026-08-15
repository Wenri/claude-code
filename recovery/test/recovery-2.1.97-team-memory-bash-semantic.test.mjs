import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.96-to-2.1.97'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const targetSha256 =
  '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988'
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function assertFragments(relative, fragments) {
  const text = source(relative)
  for (const fragment of fragments) {
    assert.ok(text.includes(fragment), `${relative}: ${fragment}`)
  }
  return text
}

const pinnedUnits = new Map([
  [
    9738,
    [
      'unresolved',
      7342808,
      7343527,
      'f0ab8db1e5992b8ffd29c2c4c0c98109280a0329a9b9a8132bea3931225cd7ca',
    ],
  ],
  [
    9742,
    [
      'unresolved',
      7343734,
      7343859,
      '65a12070073e7e6b0a4a557a9badb73aa85a1482e7fb1496c0972e183c647e38',
    ],
  ],
  [
    9750,
    [
      'unresolved',
      7346501,
      7347674,
      '57cb73297942ffc9e1909ee9c7965b9d061b095264fac101a82bac95ba8a60ab',
    ],
  ],
  [
    9753,
    [
      'unresolved',
      7348227,
      7349594,
      'b3220f59ef2cf7cffec3ee8278194b764908a97e9694acac05260fd7669f5f3b',
    ],
  ],
  [
    9754,
    [
      'unresolved',
      7349594,
      7350956,
      'f61c8da19c70463140f6298cb20548751c992aa7842981e77c27d4573d576ebd',
    ],
  ],
  [
    9755,
    [
      'moved',
      7350956,
      7351932,
      '4118cb238d0de26b9de33bd14bc79efe892552c78a1bdf359d23247699b8cda1',
    ],
  ],
  [
    9756,
    [
      'unresolved',
      7351932,
      7352256,
      'bde4572859690d951f0ce393a309bd03655701cd4c7cfcd31a49189e99e1e842',
    ],
  ],
  [
    9758,
    [
      'unresolved',
      7352284,
      7354102,
      '5dd561a4e49a6c8b2e586cca980682739c1a72233739495783355e9ca4859a9d',
    ],
  ],
  [
    9759,
    [
      'unresolved',
      7354102,
      7358730,
      '29751e7693e51a9d7db124db4cb4a15232c94c8865da91b60dd72258a2f8454b',
    ],
  ],
  [
    9760,
    [
      'unresolved',
      7358730,
      7359204,
      'a3f6b50a357ddf3f79ea1a373e3169d9291476fbed46bcf1e7339e23ca185eb7',
    ],
  ],
  [
    9761,
    [
      'moved',
      7359204,
      7359971,
      '9540f7effc03d760c4643783ce4e02ea1357b34e032fa0b03e628f45320223d8',
    ],
  ],
  [
    9773,
    [
      'unresolved',
      7362311,
      7363010,
      'cbfdee4d90854c9371da9585ed8d18a12f441605405b402540e51f2c612b3855',
    ],
  ],
  [
    9903,
    [
      'unresolved',
      7425767,
      7426080,
      '6c18f54b9b1b223efc49de0e8cc00f201c41ca415236a944b6b53806bab0e0ce',
    ],
  ],
  [
    9905,
    [
      'unresolved',
      7426356,
      7427347,
      '53b79fae99643771b70ae9b6312c3e27c1dbe293906b5f061b80dac03523cb06',
    ],
  ],
  [
    9914,
    [
      'unresolved',
      7429838,
      7434916,
      '4e1ce55ad42c1c9613d5cee2b9fee9f1ecc0c17a759effdadd37efa51a3de68d',
    ],
  ],
  [
    9919,
    [
      'unresolved',
      7436937,
      7437809,
      'bc95610db8468e92e92305dc2dfaeeb4f0ca790e12000fe9c57b1fdcd3029a01',
    ],
  ],
])

test(
  '2.1.97 team-memory and Bash evidence pins every owning target unit',
  bundleOptions,
  () => {
    const bundleBytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(bundleBytes), targetSha256)
    const bundle = bundleBytes.toString('utf8')

    for (const [index, [classification, start, end, sourceHash]] of pinnedUnits) {
      const region = structural.regions[index]
      assert.equal(region.target.index, index)
      assert.equal(region.classification, classification, `${index}: classification`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, sourceHash],
        `${index}: structural identity`,
      )
      assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
    }

    for (const fragment of [
      'team-memory-sync: failed to reap tombstoned "',
      'team dir inaccessible — suppressing soft-delete',
      'files_soft_deleted',
      'initial_files_reaped',
      '^\\/dev\\/(tcp|udp)\\/',
      'GIT_TERMINAL_PROMPT',
    ]) {
      assert.ok(bundle.includes(fragment), fragment)
    }
  },
)

test(
  'source owns tombstone pull, reaping, and watcher behavior',
  sourceOptions,
  () => {
    assertFragments('src/services/teamMemorySync/types.ts', [
      'deletedEntries: z.record(z.string(), z.number()).optional()',
      'deletedEntries?: Record<string, number>',
      'filesSoftDeleted?: number',
    ])
    const service = assertFragments('src/services/teamMemorySync/index.ts', [
      'pulled: boolean',
      'tombstonedKeys: Set<string>',
      'deletedEntries &&',
      'soft_delete_keys',
      'diskKeys: Set<string>',
      'diskTrusted: boolean',
      "entry.name.startsWith('.')",
      "e.code === 'EACCES' || e.code === 'EPERM'",
      'async function reapRemoteTombstones(',
      'await unlink(validatedPath)',
      'team-memory-sync: failed to reap tombstoned "${relPath}": ${code}',
      'state.tombstonedKeys = new Set(Object.keys(deletedEntries))',
      'for (const key of unwrittenKeys) state.serverChecksums.delete(key)',
      'if (state.tombstonedKeys.has(key)) continue',
      'if (deltaCount === 0 && softDeleteKeys.length === 0)',
      'files_soft_deleted: outcome.filesSoftDeleted',
    ])
    const reap = service.indexOf('await reapRemoteTombstones(deletedEntries)')
    const cache = service.indexOf('clearMemoryFileCaches()', reap)
    assert.ok(reap >= 0 && cache > reap)

    assertFragments('src/services/teamMemorySync/watcher.ts', [
      'pullResult.filesWritten > 0 || pullResult.filesReaped > 0',
      'initialFilesReaped = pullResult.filesReaped',
      'initial_files_reaped: initialFilesReaped',
    ])
  },
)

test(
  'source owns soft-delete and conflict convergence without resurrection',
  sourceOptions,
  () => {
    const service = source('src/services/teamMemorySync/index.ts')
    const softDelete = service.indexOf('const softDeleteKeys: string[] = []')
    const trusted = service.indexOf('if (state.pulled && diskTrusted)', softDelete)
    const tombstoneSkip = service.indexOf(
      'if (state.tombstonedKeys.has(key)) continue',
      trusted,
    )
    const upload = service.indexOf('batchSoftDeleteKeys', tombstoneSkip)
    const conflict = service.indexOf(
      'const previouslyKnownKeys = new Set(state.serverChecksums.keys())',
      upload,
    )
    const learnTombstone = service.indexOf(
      'state.tombstonedKeys.add(key)',
      conflict,
    )
    assert.ok(
      softDelete >= 0 &&
        trusted > softDelete &&
        tombstoneSkip > trusted &&
        upload > tombstoneSkip &&
        conflict > upload &&
        learnTombstone > conflict,
    )
  },
)

test(
  'source owns the target Bash assignment and sandbox safety semantics',
  sourceOptions,
  () => {
    const bash = assertFragments('src/tools/BashTool/bashPermissions.ts', [
      "'COLUMNS'",
      "'LINES'",
      "'CLICOLOR'",
      "'CLICOLOR_FORCE'",
      "'CI'",
      "'DEBIAN_FRONTEND'",
      "'GIT_TERMINAL_PROMPT'",
      'function hasUnsafeEnvironmentVariables(',
      '/^([A-Za-z_][A-Za-z0-9_]*)\\+?=/',
      '/[ \\t]+/g',
      'const normalizedPrefix =',
      '!hasUnsafeEnvironmentVariables(input, astCommand)',
      "!isSafeEnvironmentVariable(assignment[1]!)",
      '/^\\/dev\\/(tcp|udp)\\//.test(redirect.target)',
    ])
    const readOnly = bash.indexOf('BashTool.isReadOnly(input)')
    const unsafe = bash.indexOf(
      '!hasUnsafeEnvironmentVariables(input, astCommand)',
      readOnly,
    )
    assert.ok(readOnly >= 0 && unsafe > readOnly)
  },
)
