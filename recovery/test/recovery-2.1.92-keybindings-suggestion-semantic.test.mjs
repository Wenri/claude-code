import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.91-to-2.1.92'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
const targetSha256 =
  '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362'
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(repositoryRoot, 'recovery/cases', caseName, 'structural/generated-delta.json.gz'),
    ),
  ),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

const pins = new Map([
  [7707, ['unresolved', 6490905, 6491781, '1a34b8a2ad14184e38cf0aa5df20b7da3c2ff327c48fdc47679832e46955d034']],
  [8017, ['unresolved', 6635662, 6639909, '17a99530759a7da05165660fb3f39c3c458283a04f7129d1fc3b3e44958c404b']],
  [8022, ['unresolved', 6640419, 6642756, '12fb6030fb8b07c8ce43a60efb8d7a22b4220135a6fdd4234eac814170a3fb83']],
])

test('2.1.92 pins suggestion-tag parsing and dynamic message-action keybindings', {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_92_BUNDLE is not set'
      : false,
}, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), targetSha256)
  const bundle = bytes.toString('utf8')
  for (const [index, [classification, start, end, sourceHash]] of pins) {
    const region = structural.regions[index]
    assert.equal(region.classification, classification, `${index}: class`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: identity`,
    )
    assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
  }
  for (const fragment of [
    '^<(suggestion|response|output|answer|result)>',
    'MessageActions:"When the message actions menu is open (fullscreen layout)"',
    'scroll:halfPageDown',
    'selection:copy',
    'Invalid messageActions binding',
    'Move this binding to a block with "context": "MessageActions"',
  ]) {
    assert.ok(bundle.includes(fragment), fragment)
  }
})

test('materialized target92 source owns parser guards and keybinding validation', {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}, () => {
  const suggestion = fs.readFileSync(
    path.join(sourceRoot, 'services/PromptSuggestion/promptSuggestion.ts'),
    'utf8',
  )
  for (const fragment of [
    '/^<(suggestion|response|output|answer|result)>([\\s\\S]*)<\\/\\1>$/i',
    'content.includes(`</${tag.toLowerCase()}>`)',
    'content.includes(`</${tag.toUpperCase()}>`)',
  ]) {
    assert.ok(suggestion.includes(fragment), fragment)
  }
  const schema = fs.readFileSync(path.join(sourceRoot, 'keybindings/schema.ts'), 'utf8')
  for (const fragment of [
    "'Scroll'",
    "'MessageActions'",
    "'scroll:halfPageDown'",
    "'selection:copy'",
    'Message action binding (e.g., "messageActions:copy")',
  ]) {
    assert.ok(schema.includes(fragment), fragment)
  }
  const validate = fs.readFileSync(path.join(sourceRoot, 'keybindings/validate.ts'), 'utf8')
  for (const fragment of [
    "action.startsWith('messageActions:')",
    'Invalid messageActions binding',
    "contextName !== 'MessageActions'",
    'Move this binding to a block with "context": "MessageActions"',
  ]) {
    assert.ok(validate.includes(fragment), fragment)
  }
})
