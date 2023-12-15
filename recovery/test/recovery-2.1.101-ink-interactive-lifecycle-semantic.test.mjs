import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const isCurrentSource =
  path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
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
  [
    5606,
    [
      4041767,
      4047232,
      '4f5f9376086dfc8eaa468673f9efffce1a5bd07e4430c9c80516ebeac53b09e3',
    ],
  ],
  [
    5706,
    [
      4094657,
      4113073,
      '20d1cab88983e13056d98cbde1f2c92520556438bdfd4757394a2629df22f943',
    ],
  ],
])

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_100_BUNDLE and CLAUDE_CODE_2_1_101_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test('target101 pins lazy terminal activation across App and Ink', pairOptions, () => {
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  for (const [index, [start, end, hash]] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, hash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(target.slice(start, end)), hash, `${index}: target bytes`)
  }
  assert.match(target.slice(...units.get(5606).slice(0, 2)), /onRawModeEnter/)
  const ink = target.slice(...units.get(5706).slice(0, 2))
  for (const fragment of [
    'ensureInteractive',
    'skipSyncMarkers',
    'hasRendered',
    'isExiting',
    'onRawModeEnter',
  ]) assert.ok(ink.includes(fragment), fragment)
})

test('target101 defers terminal ownership until interactive use', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  for (const property of [
    'onRawModeEnter',
    'ensureInteractive',
    'skipSyncMarkers',
    'hasRendered',
  ]) {
    assert.equal(baseline.includes(property), false, `${property}: baseline`)
    assert.equal(target.includes(property), true, `${property}: target`)
  }
})

test('source owns lazy TTY handlers, guarded rendering, and sync markers', sourceOptions, () => {
  const app = source('ink/components/App.tsx')
  assert.ok(app.includes('readonly onRawModeEnter?: () => void'))
  assert.ok(app.includes('this.props.onRawModeEnter?.()'))
  assert.ok(
    app.indexOf('this.props.onRawModeEnter?.()') < app.indexOf('stdin.ref()'),
  )

  const ink = source('ink/ink.tsx')
  for (const fragment of [
    'private hasRendered = false',
    'private isExiting = false',
    'private ensureInteractive = (): void =>',
    'this.unsubscribeTTYHandlers || !this.options.stdout.isTTY',
    'this.options.stdout.on(\'resize\', this.handleResize)',
    "process.on('SIGCONT', this.handleResume)",
    'if (this.hasRendered && !this.isExiting) this.ensureInteractive()',
    'this.isExiting = true',
    'onRawModeEnter={this.ensureInteractive}',
    'this.skipSyncMarkers()',
  ]) assert.ok(ink.includes(fragment), fragment)
  if (isCurrentSource) {
    assert.ok(ink.includes('if (!SYNC_OUTPUT_SUPPORTED) return true'))
  } else {
    assert.ok(
      ink.includes('if (this.altScreenActive && !SYNC_OUTPUT_SUPPORTED) return true'),
    )
  }
})
