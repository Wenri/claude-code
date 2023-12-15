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

const targetUnits = new Map([
  [16244, [11704318, 11704369, 'e9c8c18d778e0667ff81b05df05ae2801649adaf7fc59d5068ff4eb81ca9be4a']],
  [16245, [11704369, 11704424, '845cd58a4545baf059737ab4ab2b3751cdd5efb0e2a5ce8b53d2697350a5f560']],
  [16272, [11713268, 11714602, 'e5f589fa1f759d1b63e3d55eff5c2bb5b6b822ce1ebad6aca53841c66be1cdef']],
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

test('target101 pins the frame HTML permission graph', pairOptions, () => {
  if (!baselineBundlePath || !targetBundlePath) return
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

test('frame HTML write access is introduced only at this boundary', pairOptions, () => {
  if (!baselineBundlePath || !targetBundlePath) return
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  for (const fragment of [
    'frame.html',
    'Frame HTML files for current session are allowed for writing',
  ]) {
    assert.equal(baseline.includes(fragment), false, `${fragment}: target100`)
    assert.equal(target.includes(fragment), true, `${fragment}: target101`)
  }
  const helper = target.slice(...targetUnits.get(16245).slice(0, 2))
  assert.ok(helper.includes('===') && helper.includes('frame.html'))
  const permission = target.slice(...targetUnits.get(16272).slice(0, 2))
  assert.ok(permission.includes('Frame HTML files for current session'))
  assert.ok(permission.indexOf('Frame HTML') < permission.indexOf('Scratchpad'))
})

test('historical source owns frame HTML and current source owns its frame-source evolution', sourceOptions, () => {
  const filename = path.join(sourceRoot, 'utils/permissions/filesystem.ts')
  const source = fs.readFileSync(filename, 'utf8')
  if (isCurrentSource) {
    for (const fragment of [
      'function getSessionFrameDir(): string',
      'function isSessionFrameFile(absolutePath: string): boolean',
      "join(frameDir, 'frame.html')",
      "join(frameDir, 'frame.md')",
      'if (isSessionFrameFile(normalizedPath))',
      "reason: 'Frame source files for current session are allowed for writing'",
    ]) {
      assert.ok(source.includes(fragment), fragment)
    }
    return
  }
  for (const fragment of [
    'function getFrameDirectory(): string',
    "getSessionId(), 'frame'",
    'function isFrameHtmlPath(absolutePath: string): boolean',
    "normalize(absolutePath) === join(getFrameDirectory(), 'frame.html')",
    'if (isFrameHtmlPath(normalizedPath))',
    "reason: 'Frame HTML files for current session are allowed for writing'",
  ]) {
    assert.ok(source.includes(fragment), fragment)
  }
  assert.ok(
    source.indexOf('if (isFrameHtmlPath(normalizedPath))') <
      source.indexOf('// Scratchpad directory for current session'),
  )
})
