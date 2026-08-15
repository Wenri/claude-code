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
const historical = semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
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
      ? 'CLAUDE_CODE_2_1_101_BUNDLE is not set'
      : false,
}

test('target101 pins Space/Ctrl+V preview and the complete LogSelector unit', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), 'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb')
  const bundle = bytes.toString('utf8')
  const region = structural.regions.find(row => row.target?.index === 14967)
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [11103743, 11118808, 'b5027bb2ffe237aa6db9e7a9f3bc0b6d3bc284cff4c18bced643af7bc301156c'],
  )
  const unit = bundle.slice(region.target.start, region.target.end)
  assert.equal(sha256(unit), region.target.sourceHash)
  assert.match(unit, /key===" "&&[^|]+\|\|[^&]+ctrl&&[^=]+key==="v"/)
  assert.ok(unit.includes('chord:"space",action:"preview"'))
  assert.equal(unit.includes('chord:"ctrl+v",action:"preview"'), false)
  assert.ok(unit.includes('!S6'))
})

test('source owns target101 preview activation and search boundary', sourceOptions, () => {
  const source = fs.readFileSync(path.join(sourceRoot, 'components/LogSelector.tsx'), 'utf8')
  if (historical) {
    assert.ok(source.includes('(input === " " && keyIsNotCtrlOrMeta)'))
    assert.ok(source.includes('(lowerInput === "v" && key.ctrl)'))
    assert.ok(source.includes('(input.length === 1 || !/^[a-z]+\\d*$/.test(input))'))
  } else {
    assert.ok(source.includes("((event.key === ' ' && unmodified) || (event.ctrl && event.key === 'v'))"))
    assert.ok(source.includes("unmodified && event.key.length === 1 && event.key !== ' '"))
    assert.ok(source.includes('event.preventDefault()'))
    assert.ok(source.includes("setViewMode('preview')"))
  }
  assert.ok(source.includes('focusedLog &&'))
  assert.ok(source.includes('!isAgenticSearchOptionFocused'))
  assert.match(source, /KeyboardShortcutHint (?:chord="space"|shortcut="Space") action="preview"/)
  assert.ok(source.includes('enabled: showAllProjects'))
  if (historical) {
    assert.ok(source.includes('enabled: branchFilterEnabled'))
    assert.ok(source.includes('enabled: showAllWorktrees'))
  } else {
    assert.ok(source.includes('const enabled = !branchFilterEnabled'))
    assert.ok(source.includes('const enabled = !showAllWorktrees'))
    assert.ok(source.includes('enabled: !enabled'))
  }
  if (historical) {
    assert.ok(source.includes('only show current directory'))
    assert.ok(source.includes('show all directories'))
    assert.equal(source.includes('only show current repo'), false)
  } else {
    assert.ok(source.includes('only show current repo'))
    assert.ok(source.includes('show all projects'))
  }
})

test('target100 predates Space preview', {
  skip: bundleOptions.skip || !baselineBundlePath
    ? bundleOptions.skip || 'CLAUDE_CODE_2_1_100_BUNDLE is not set'
    : false,
}, () => {
  const bytes = fs.readFileSync(baselineBundlePath)
  assert.equal(sha256(bytes), 'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be')
  const bundle = bytes.toString('utf8')
  assert.ok(bundle.includes('chord:"ctrl+v",action:"preview"'))
  assert.equal(bundle.includes('chord:"space",action:"preview"'), false)
})
