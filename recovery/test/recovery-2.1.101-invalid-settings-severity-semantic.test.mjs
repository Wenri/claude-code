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
    18396,
    [
      12789049,
      12790238,
      'f0ed4fd0ea7d81d4c38fcc74b1d6dc7d562428b76a2230188c0ff0a06ee8c8ee',
    ],
  ],
  [
    18397,
    [
      12790238,
      12790284,
      'eb9be7732caccb7ab24525732790f50b6e26a7160999950fd366cc433ed178b0',
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

test('target101 pins both severity-aware settings dialog units', pairOptions, () => {
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
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
      `${index}: structural identity`,
    )
    const unit = target.slice(identity[0], identity[1])
    assert.equal(sha256(unit), identity[2], `${index}: target bytes`)
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
      1,
      `${index}: one top-level statement`,
    )
  }
})

test('target101 introduces the reachable warning-only branch', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  for (const fragment of [
    'Settings Warning',
    'The values listed above were skipped; the rest of the file is in effect.',
  ]) {
    assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
    assert.equal(target.includes(fragment), true, `${fragment}: target`)
  }
  assert.ok(target.includes('severity!=="warning"'))
  assert.match(target, /\?"Settings Error":"Settings Warning"/)
})

test('source owns error and warning titles, copy, options, and cancel behavior', sourceOptions, () => {
  const file = fs.readFileSync(
    path.join(sourceRoot, 'components/InvalidSettingsDialog.tsx'),
    'utf8',
  )
  for (const fragment of [
    'const hasErrors = settingsErrors.some(isError)',
    "const title = hasErrors ? 'Settings Error' : 'Settings Warning'",
    'const onCancel = hasErrors ? onExit : onContinue',
    "? 'Files with errors are skipped entirely, not just the invalid settings.'",
    ": 'The values listed above were skipped; the rest of the file is in effect.'",
    "{ label: 'Exit and fix manually', value: 'exit' }",
    "{ label: 'Continue without these settings', value: 'continue' }",
    "{ label: 'Continue', value: 'continue' }",
    '<Dialog title={title} onCancel={onCancel} color="warning">',
    '<Select options={options} onChange={handleSelect} />',
    "return error.severity !== 'warning'",
  ]) {
    assert.ok(file.includes(fragment), fragment)
  }

  const errorOptions = file.indexOf("{ label: 'Exit and fix manually'")
  const errorContinue = file.indexOf(
    "{ label: 'Continue without these settings'",
  )
  const warningContinue = file.indexOf("{ label: 'Continue', value: 'continue' }")
  const warningExit = file.indexOf(
    "{ label: 'Exit and fix manually'",
    errorOptions + 1,
  )
  assert.ok(errorOptions < errorContinue)
  assert.ok(errorContinue < warningContinue && warningContinue < warningExit)
})
