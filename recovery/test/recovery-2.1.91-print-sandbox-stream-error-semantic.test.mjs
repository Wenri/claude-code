import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.90-to-2.1.91'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_90_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_91_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_90_BUNDLE and CLAUDE_CODE_2_1_91_BUNDLE are required'
      : false,
}

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

const units = new Map([
  [18189, [12930767, 12936655, 'FunctionDeclaration', '16f93e3212770af92218f870e0a8ab75067cc2c568c06bc9edd119eaef92b94e']],
  [18190, [12936655, 12967622, 'FunctionDeclaration', '260e31d9e7ff84cc7ebb3a9052d30fd4b61a9e143421452ff7ec42370699d28a']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test('target91 pins the headless sandbox failure and adjacent init units', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(
    sha256(baselineBytes),
    '069185909d50518b8b239acc0f9ae9b062a610595299b35955fc53e6e2c2f5e9',
  )
  assert.equal(
    sha256(targetBytes),
    'b4bf141f30cf8b40196295816c7a6b9d01a36e906908d73a9f9a865ce4cdf816',
  )
  const target = targetBytes.toString('utf8')
  for (const [index, [start, end, nodeType, expectedHash]] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.nodeType, region.target.sourceHash],
      [start, end, nodeType, expectedHash],
      `${index}: structural identity`,
    )
    const unit = target.slice(start, end)
    assert.equal(sha256(unit), expectedHash, `${index}: bytes`)
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
      1,
      `${index}: one complete AST unit`,
    )
  }
})

test('target91 introduces a structured result before stderr and shutdown', bundleOptions, () => {
  const baseline = fs.readFileSync(baselinePath, 'utf8')
  const target = fs.readFileSync(targetPath, 'utf8')
  const unit = target.slice(12930767, 12936655)
  const error =
    'Sandbox required but unavailable: ${j}. Set sandbox.failIfUnavailable=false to allow unsandboxed execution.'

  assert.equal(baseline.includes('Set sandbox.failIfUnavailable=false'), false)
  assert.ok(unit.includes('if(A.outputFormat==="stream-json")await w.write({'))
  assert.ok(unit.includes('type:"result",subtype:"error_during_execution"'))
  assert.ok(unit.includes('duration_ms:0,duration_api_ms:0,is_error:!0'))
  assert.ok(unit.includes('stop_reason:null'))
  assert.ok(unit.includes('usage:wf,modelUsage:{},permission_denials:[]'))
  assert.ok(unit.includes(error))

  const write = unit.indexOf('if(A.outputFormat==="stream-json")await w.write({')
  const stderr = unit.indexOf('process.stderr.write(`\nError: sandbox required')
  const shutdown = unit.indexOf(',eK(1);return', stderr)
  assert.ok(write >= 0 && write < stderr && stderr < shutdown)
})

test('target91 adjacent peer-origin fragment is statically unreachable', bundleOptions, () => {
  const target = fs
    .readFileSync(targetPath, 'utf8')
    .slice(12936655, 12967622)
  const deadOrigin =
    /,([A-Za-z_$][\w$]*)=void 0;[^;]*\.\.\.\1&&\{origin:\{kind:"peer",from:\1\},isMeta:!0\}\}/
  const match = target.match(deadOrigin)
  assert.ok(match, 'origin source is initialized to undefined')
  const fragment = match[0]
  assert.equal(fragment.includes(`${match[1]}=`), true)
  assert.equal(fragment.includes(`${match[1]}&&{origin:`), true)
  assert.equal(fragment.includes(`${match[1]}=`), true)
  assert.equal((fragment.match(new RegExp(`${match[1]}=`, 'g')) ?? []).length, 1)
})

test('source emits the exact stream-json result before stderr and exit', sourceOptions, () => {
  const contents = source('cli/print.ts')
  const required = contents.indexOf('if (SandboxManager.isSandboxRequired())')
  const stream = contents.indexOf(
    "if (options.outputFormat === 'stream-json')",
    required,
  )
  const write = contents.indexOf('await structuredIO.write({', stream)
  const error = contents.indexOf(
    'Sandbox required but unavailable: ${sandboxUnavailableReason}. Set sandbox.failIfUnavailable=false to allow unsandboxed execution.',
    write,
  )
  const stderr = contents.indexOf(
    '`\\nError: sandbox required but unavailable: ${sandboxUnavailableReason}\\n`',
    error,
  )
  const shutdown = contents.indexOf('gracefulShutdownSync(1)', stderr)
  const returnIndex = contents.indexOf('return', shutdown)
  assert.ok(
    required < stream &&
      stream < write &&
      write < error &&
      error < stderr &&
      stderr < shutdown &&
      shutdown < returnIndex,
  )

  const object = contents.slice(write, error)
  for (const fragment of [
    "type: 'result'",
    "subtype: 'error_during_execution'",
    'duration_ms: 0',
    'duration_api_ms: 0',
    'is_error: true',
    'num_turns: 0',
    'stop_reason: null',
    'session_id: getSessionId()',
    'total_cost_usd: 0',
    'usage: EMPTY_USAGE',
    'modelUsage: {}',
    'permission_denials: []',
    'uuid: randomUUID()',
  ]) {
    assert.ok(object.includes(fragment), fragment)
  }
})
