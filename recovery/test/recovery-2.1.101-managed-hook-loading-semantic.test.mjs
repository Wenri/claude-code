import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
const latestBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
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

const targetUnits = new Map([
  [
    11805,
    [
      9002322,
      9004107,
      '51ecc0f3dbee69334182b650a72a37331e2f53db54daf3b15406a2529c66e3bd',
    ],
  ],
  [
    11806,
    [
      9004107,
      9004781,
      'fdfc270e7088413700b2634e0dc2e75729f7346f6607c8d852b680117ffb823a',
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

test('target101 pins both managed-hook loading functions', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be',
  )
  assert.equal(
    sha256(targetBytes),
    'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
  )
  const target = targetBytes.toString('utf8')
  for (const [index, identity] of targetUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: class`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
      `${index}: identity`,
    )
    const unit = target.slice(identity[0], identity[1])
    assert.equal(sha256(unit), identity[2], `${index}: bytes`)
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
      1,
      `${index}: one top-level statement`,
    )
  }
})

test('managed-plugin exception enters at target101 and persists', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  const message =
    'Skipping plugin hooks - allowManagedHooksOnly is enabled and no managed plugins'
  assert.equal(baseline.includes(message), false)
  assert.equal(target.split(message).length - 1, 2)
  assert.equal(
    baseline.split(
      'Skipping plugin hooks - allowManagedHooksOnly is enabled',
    ).length - 1,
    2,
  )
  for (const index of targetUnits.keys()) {
    const [start, end] = targetUnits.get(index)
    const unit = target.slice(start, end)
    assert.ok(unit.includes('&&'))
    assert.ok(unit.includes('()===null)'))
    assert.ok(unit.includes(message))
  }
  if (latestBundlePath) {
    const latest = fs.readFileSync(latestBundlePath, 'utf8')
    assert.equal(latest.split(message).length - 1, 2)
  }
})

test('source skips plugin loading only when policy has no managed plugins', sourceOptions, () => {
  const source = fs.readFileSync(
    path.join(sourceRoot, 'utils/sessionStart.ts'),
    'utf8',
  )
  assert.ok(
    source.includes(
      "import { getManagedPluginNames } from './plugins/managedPlugins.js'",
    ),
  )
  const condition =
    'if (shouldAllowManagedHooksOnly() && getManagedPluginNames() === null) {'
  const message =
    'Skipping plugin hooks - allowManagedHooksOnly is enabled and no managed plugins'
  assert.equal(source.split(condition).length - 1, 2)
  assert.equal(source.split(message).length - 1, 2)
  assert.equal(
    source.includes(
      "if (shouldAllowManagedHooksOnly()) {\n    logForDebugging('Skipping plugin hooks",
    ),
    false,
  )
})
