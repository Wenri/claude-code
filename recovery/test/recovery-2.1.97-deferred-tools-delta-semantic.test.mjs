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
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_96_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const sourceOptions = {
  skip:
    !semanticCase || semanticCase === caseName
      ? false
      : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: sourceOptions.skip || !targetBundlePath
    ? sourceOptions.skip || 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
    : false,
}
const adjacentOptions = {
  skip: bundleOptions.skip || !baselineBundlePath
    ? bundleOptions.skip || 'CLAUDE_CODE_2_1_96_BUNDLE is not set'
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

const prefix =
  'The following deferred tools are now available via ToolSearch. Their schemas are NOT loaded — calling them directly will fail with InputValidationError. Use ToolSearch with query "select:<name>[,<name>...]" to load tool schemas before calling them:'
const removed =
  'The following deferred tools are no longer available (their MCP server disconnected). Do not search for them — ToolSearch will return no match:'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test('target97 pins the deferred-tool schema-loading guidance unit', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(bytes),
    '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988',
  )
  const region = structural.regions[13018]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [
      9877378,
      9892032,
      '3269a74ad88c119893a6c71f54d56346e40b9e4c3c6af0bfaa7b36c4be880664',
    ],
  )
  const unit = bytes
    .toString('utf8')
    .slice(region.target.start, region.target.end)
  assert.equal(sha256(unit), region.target.sourceHash)
  for (const fragment of [
    'The following deferred tools are now available via ',
    '. Their schemas are NOT loaded — calling them directly will fail with InputValidationError. Use ',
    ' with query "select:<name>[,<name>...]" to load tool schemas before calling them:',
    'The following deferred tools are no longer available (their MCP server disconnected). Do not search for them — ',
    ' will return no match:',
  ]) {
    assert.ok(unit.includes(fragment), fragment)
  }
})

test('source emits actionable guidance for added and disconnected deferred tools', sourceOptions, () => {
  const messages = source('utils/messages.ts')
  for (const fragment of [
    prefix,
    removed,
    "attachment.addedLines.join('\\n')",
    "attachment.removedNames.join('\\n')",
    "parts.join('\\n\\n')",
  ]) {
    assert.ok(messages.includes(fragment), fragment)
  }
})

test('2.1.96 had only the non-actionable availability notice', adjacentOptions, () => {
  const bytes = fs.readFileSync(baselineBundlePath)
  assert.equal(
    sha256(bytes),
    '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e',
  )
  const baseline = bytes.toString('utf8')
  assert.ok(baseline.includes('The following deferred tools are now available via '))
  assert.equal(baseline.includes('Their schemas are NOT loaded'), false)
})
