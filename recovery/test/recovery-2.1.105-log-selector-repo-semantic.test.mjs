import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const historical = sourceRoot !== path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const structural = JSON.parse(gunzipSync(fs.readFileSync(path.join(
  repositoryRoot,
  'recovery/cases',
  caseName,
  'structural/generated-delta.json.gz',
))))

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

const sourceOptions = { skip: selected ? false : `not applicable to ${semanticCase}` }
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_105_BUNDLE is not set'
      : false,
}

test('target105 pins repository wording in the complete LogSelector unit', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75')
  const bundle = bytes.toString('utf8')
  const region = structural.regions.find(row => row.target?.index === 15088)
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [11158067, 11173121, '3818af86e6f0bd809e035645f65e01aa7288615a5f296a1a258d9c2b12a9292e'],
  )
  const unit = bundle.slice(region.target.start, region.target.end)
  assert.equal(sha256(unit), region.target.sourceHash)
  assert.ok(unit.includes('only show current repo'))
  assert.ok(unit.includes('show all projects'))
  assert.ok(unit.includes('chord:"space",action:"preview"'))
  assert.equal(unit.includes('only show current directory'), false)
  assert.equal(unit.includes('show all directories'), false)
})

test('source owns target105 repository wording without regressing preview behavior', sourceOptions, () => {
  const source = fs.readFileSync(path.join(sourceRoot, 'components/LogSelector.tsx'), 'utf8')
  assert.ok(source.includes('showAllProjects ? "only show current repo" : "show all projects"'))
  assert.match(source, /KeyboardShortcutHint (?:chord="space"|shortcut="Space") action="preview"/)
  if (historical) {
    assert.ok(source.includes('(input === " " && keyIsNotCtrlOrMeta)'))
    assert.ok(source.includes('(lowerInput === "v" && key.ctrl)'))
  } else {
    assert.ok(source.includes("(event.key === ' ' && unmodified)"))
    assert.ok(source.includes("(event.ctrl && event.key === 'v')"))
    assert.ok(source.includes('event.preventDefault()'))
  }
  assert.match(source, /focusedLog\s*&&\s*!isAgenticSearchOptionFocused/)
})

test('target104 retains directory wording', {
  skip: bundleOptions.skip || !baselineBundlePath
    ? bundleOptions.skip || 'CLAUDE_CODE_2_1_104_BUNDLE is not set'
    : false,
}, () => {
  const bytes = fs.readFileSync(baselineBundlePath)
  assert.equal(sha256(bytes), 'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39')
  const bundle = bytes.toString('utf8')
  assert.ok(bundle.includes('only show current directory'))
  assert.ok(bundle.includes('show all directories'))
  assert.equal(bundle.includes('only show current repo'), false)
})
