import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(
  new URL('../attribution/inventory-generated-change.mjs', import.meta.url),
)

function readJsonLines(filename) {
  return zlib
    .gunzipSync(fs.readFileSync(filename))
    .toString('utf8')
    .trimEnd()
    .split('\n')
    .map(line => JSON.parse(line))
}

test('deterministically accounts for a mapped baseline and target bundle', () => {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'generated-attribution-test-'),
  )
  try {
    const baseline = [
      'var y=(q,K)=>()=>(q&&(K=q(q=0)),K)',
      'm=(q,K)=>()=>(K||q((K={exports:{}}).exports,K),K.exports)',
      'example=y(()=>{let note="one uniquely stable literal";return note})',
    ].join(';')
    const target = [
      'var E=(q,K)=>()=>(q&&(K=q(q=0)),K)',
      'p=(q,K)=>()=>(K||q((K={exports:{}}).exports,K),K.exports)',
      'example=E(()=>{let note="one uniquely stable literal";return note+"!"})',
    ].join(';')
    const map = {
      version: 3,
      sources: ['../src/example.ts'],
      sourcesContent: [
        'export const note = "one uniquely stable literal";\n',
      ],
      names: [],
      mappings: 'AAAA',
    }
    const baselineFile = path.join(temporary, 'baseline.js')
    const mapFile = path.join(temporary, 'baseline.js.map')
    const targetFile = path.join(temporary, 'target.js')
    fs.writeFileSync(baselineFile, baseline)
    fs.writeFileSync(mapFile, JSON.stringify(map))
    fs.writeFileSync(targetFile, target)

    const outputs = ['report-a', 'report-b'].map(name =>
      path.join(temporary, name),
    )
    for (const output of outputs) {
      execFileSync(process.execPath, [
        script,
        '--baseline',
        baselineFile,
        '--map',
        mapFile,
        '--target',
        targetFile,
        '--output',
        output,
      ])
    }

    const summary = JSON.parse(
      fs.readFileSync(path.join(outputs[0], 'summary.json'), 'utf8'),
    )
    assert.equal(summary.offsetUnit, 'utf16-code-units')
    assert.equal(summary.baselineOwnership.sourceCount, 1)
    assert.equal(summary.baselineOwnership.contiguousRunCount, 1)
    assert.equal(summary.initializerEvidence.baseline.count, 1)
    assert.equal(summary.initializerEvidence.target.count, 1)
    assert.equal(summary.coverage.accountedTargetUtf16, target.length)
    assert.equal(summary.coverage.unaccountedTargetUtf16, 0)
    assert.equal(
      readJsonLines(path.join(outputs[0], 'sources.jsonl.gz')).length,
      1,
    )
    assert.equal(
      readJsonLines(
        path.join(outputs[0], 'target-initializers.jsonl.gz'),
      ).length,
      1,
    )

    for (const filename of [
      'summary.json',
      'sources.jsonl.gz',
      'target-initializers.jsonl.gz',
      'target-partitions.jsonl.gz',
    ]) {
      assert.deepEqual(
        fs.readFileSync(path.join(outputs[0], filename)),
        fs.readFileSync(path.join(outputs[1], filename)),
      )
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
})
