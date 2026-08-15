import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.97-to-2.1.98'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_98_BUNDLE
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = { skip: selected ? false : `not applicable to ${semanticCase}` }
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_98_BUNDLE is not set'
      : false,
}
const adjacentOptions = {
  skip: bundleOptions.skip || !baselineBundlePath
    ? bundleOptions.skip || 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
    : false,
}
const structural = JSON.parse(gunzipSync(fs.readFileSync(path.join(
  repositoryRoot,
  'recovery/cases',
  caseName,
  'structural/generated-delta.json.gz',
))))

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test('target98 pins every status-line result telemetry definition', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), '27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556')
  const bundle = bytes.toString('utf8')
  const expected = new Map([
    [17382, [12288084, 12288149, '31ac372653fbcd9b0a3aa59d6777cd807596070eb61e585072d59e48e50907be']],
    [17383, [12288149, 12288216, '66d768c11bdcbba1fddb236dbef0f77950463bc4f35a05f68d3a9795f3f3fe2b']],
    [17384, [12288216, 12288582, '9ec59d24b261c206cb574bfaf452f2c81d07fca1ce71bade736996c4990b9bfb']],
  ])
  const owners = []
  for (const [index, identity] of expected) {
    const region = structural.regions.find(row => row.target?.index === index)
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
    )
    const owner = bundle.slice(region.target.start, region.target.end)
    assert.equal(sha256(owner), identity[2])
    owners.push(owner)
  }
  const cluster = owners.join('\n')
  for (const value of [
    'tengu_status_line_result',
    'char_length',
    'visual_width',
    'line_count',
    'command_length',
  ]) {
    assert.ok(cluster.includes(value), value)
  }
  assert.ok(cluster.includes('.aborted'))
  assert.ok(cluster.indexOf('.aborted') < cluster.indexOf('tengu_status_line_result'))
})

test('source owns abort-safe once-per-command result metrics', sourceOptions, () => {
  const source = fs.readFileSync(path.join(sourceRoot, 'components/StatusLine.tsx'), 'utf8')
  assert.ok(source.includes("'tengu_status_line_result'"))
  assert.ok(source.includes("const lines = result.split('\\n')"))
  assert.ok(source.includes('visualWidth = Math.max(visualWidth, stringWidth(line))'))
  assert.ok(source.includes('char_length: result.length'))
  assert.ok(source.includes('visual_width: visualWidth'))
  assert.ok(source.includes('line_count: lines.length'))
  assert.ok(source.includes('command_length: commandLength'))
  assert.ok(source.indexOf('if (signal.aborted) return') < source.indexOf('onResult(result)'))
  assert.ok(source.indexOf('onResult(result)') < source.indexOf("'tengu_status_line_result'"))
  assert.match(source, /if \(!pendingRef\.current\) return;[\s\S]*?pendingRef\.current = false;[\s\S]*?logFn\(event, metadata\(\)\)/)
  assert.match(source, /logNextResultRef\.current = true;\s+pendingResultTelemetryRef\.current = true;\s+void doUpdate\(\)/)
  assert.match(source, /try \{[\s\S]*?await executeCommand\(\)[\s\S]*?\} catch \{[\s\S]*?Status-line failures never interrupt the UI/)
})

test('2.1.97 predates status-line result telemetry', adjacentOptions, () => {
  const bytes = fs.readFileSync(baselineBundlePath)
  assert.equal(sha256(bytes), '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988')
  assert.equal(bytes.includes(Buffer.from('tengu_status_line_result')), false)
})
