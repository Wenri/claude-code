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
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_96_BUNDLE
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = { skip: selected ? false : `not applicable to ${semanticCase}` }
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
      : false,
}
const adjacentOptions = {
  skip: bundleOptions.skip || !baselineBundlePath
    ? bundleOptions.skip || 'CLAUDE_CODE_2_1_96_BUNDLE is not set'
    : false,
}
const isCurrentSource =
  path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test('target97 pins SendMessage Unicode escape decoding', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(bytes),
    '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988',
  )
  const region = structural.regions[16241]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [
      11702749,
      11704249,
      'cfaff2065162391f37dbfadf5b71c1cd639649ff81f7a2996621de42f6e43386',
    ],
  )
  const unit = bytes
    .toString('utf8')
    .slice(region.target.start, region.target.end)
  assert.equal(sha256(unit), region.target.sourceHash)
  for (const fragment of [
    'message:',
    '/\\\\u([0-9a-fA-F]{4})/g',
    'String.fromCharCode(parseInt(',
  ]) {
    assert.ok(unit.includes(fragment), fragment)
  }
})

test('source owns the target97 decoder and the later recursive hardening', sourceOptions, () => {
  const api = source('utils/api.ts')
  if (isCurrentSource) {
    const messages = source('utils/messages.ts')
    for (const fragment of [
      'export function decodeUnicodeEscapesInToolInput(value: unknown)',
      '/\\\\u([dD][89aAbB][0-9a-fA-F]{2})\\\\u([dD][c-fC-F][0-9a-fA-F]{2})|\\\\u([0-9a-fA-F]{4})/g',
      "value[backslashStart - 1] === '\\\\'",
      'if ((offset - backslashStart) & 1) return match',
      'if (codeUnit >= 0xd800 && codeUnit <= 0xdfff) return match',
      'value.map(decodeUnicodeEscapesInToolInput)',
    ]) {
      assert.ok(api.includes(fragment), fragment)
    }
    assert.ok(
      messages.includes(
        'const correctedInput = decodeUnicodeEscapesInToolInput(',
      ),
    )
  } else {
    for (const fragment of [
      'case SEND_MESSAGE_TOOL_NAME:',
      "if (typeof message !== 'string') return input",
      '/\\\\u([0-9a-fA-F]{4})/g',
      'String.fromCharCode(parseInt(codeUnit, 16))',
    ]) {
      assert.ok(api.includes(fragment), fragment)
    }
    assert.equal(api.includes('decodeUnicodeEscapesInToolInput'), false)
  }
})

test('2.1.96 lacks the SendMessage Unicode decoder', adjacentOptions, () => {
  const bytes = fs.readFileSync(baselineBundlePath)
  assert.equal(
    sha256(bytes),
    '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e',
  )
  assert.equal(
    bytes.toString('utf8').includes('\\u([0-9a-fA-F]{4})'),
    false,
  )
})
