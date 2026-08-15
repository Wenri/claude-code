import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const scanner = path.join(
  repositoryRoot,
  'recovery/scripts/inspect-semantic-literal-gaps.mjs',
)

test('semantic literal scanner compares typed cooked values across JS and TS ASTs', () => {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'semantic-literal-scanner-'),
  )
  try {
    const baseline = [
      'const value = "old literal";',
      'const count = 999;',
      'const huge = 122n;',
      'const matcher = /old/g;',
      'const mode = "off";',
      'const holder = {oldKey: 1}; holder.oldKey;',
      '',
    ].join('\n')
    const target = [
      'const value = "first line\\nsecond line";',
      'const count = 1_000;',
      'const huge = 123n;',
      'const matcher = /a\\/b[\\]]/ig;',
      'const mode = "on";',
      'const holder = {newKey: 1}; holder.newKey;',
      '',
    ].join('\n')
    const sourceRoot = path.join(temporary, 'src')
    fs.mkdirSync(sourceRoot)
    fs.writeFileSync(
      path.join(sourceRoot, 'owner.ts'),
      [
        "const value: string = 'first line\\nsecond line'",
        'const count = 0x3e8',
        'const huge = 0x7bn',
        'const matcher: RegExp = /a\\/b[\\]]/gi',
        'const holder = {newKey: 1}; holder.newKey',
        '',
      ].join('\n'),
    )
    fs.writeFileSync(
      path.join(sourceRoot, 'unrelated.ts'),
      "type CoincidentalValue = 'on'\n",
    )
    fs.writeFileSync(path.join(temporary, 'baseline.js'), baseline)
    fs.writeFileSync(path.join(temporary, 'target.js'), target)
    fs.writeFileSync(
      path.join(temporary, 'structural.json.gz'),
      gzipSync(
        JSON.stringify({
          regions: [
            {
              classification: 'changed',
              target: {
                end: target.length,
                index: 0,
                sourceHash: 'test-source-hash',
                start: 0,
              },
            },
          ],
        }),
      ),
    )
    for (const filename of ['partitions.jsonl.gz', 'sources.jsonl.gz']) {
      fs.writeFileSync(path.join(temporary, filename), gzipSync(''))
    }
    fs.writeFileSync(
      path.join(temporary, 'coverage.json.gz'),
      gzipSync(
        JSON.stringify({
          owners: [{ id: 'owner', path: 'src/owner.ts' }],
          rows: [
            {
              disposition: 'source-runtime-covered',
              ownerIds: ['owner'],
              targetIndex: 0,
            },
          ],
        }),
      ),
    )

    const result = spawnSync(
      process.execPath,
      [
        scanner,
        '--baseline',
        path.join(temporary, 'baseline.js'),
        '--target',
        path.join(temporary, 'target.js'),
        '--source-root',
        sourceRoot,
        '--structural',
        path.join(temporary, 'structural.json.gz'),
        '--partitions',
        path.join(temporary, 'partitions.jsonl.gz'),
        '--sources',
        path.join(temporary, 'sources.jsonl.gz'),
        '--coverage',
        path.join(temporary, 'coverage.json.gz'),
      ],
      { cwd: repositoryRoot, encoding: 'utf8' },
    )
    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(result.stdout)
    assert.equal(report.targetAddedOccurrences, 7)
    assert.equal(report.absentFromSource, 1)
    assert.equal(report.sourceRuntimeAddedOccurrences, 7)
    assert.equal(report.sourceRuntimeOwnerResidues, 1)
    assert.equal(report.sourceRuntimeOwnerResidueRows[0].value, 'on')
    assert.deepEqual(report.targetAddedByKind, {
      bigint: 1,
      number: 1,
      property: 2,
      regexp: 1,
      string: 2,
    })
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
})
