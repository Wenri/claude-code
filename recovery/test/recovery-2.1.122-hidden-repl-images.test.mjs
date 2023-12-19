import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = [
  {
    version: '2.1.121',
    env: 'CLAUDE_CODE_2_1_121_BUNDLE',
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
    imageResults: 0,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    imageResults: 1,
  },
]

function readBundle(release) {
  const filename = process.env[release.env]
  assert.ok(filename, `${release.env} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return bytes.toString('utf8')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

test('authenticates the target-only REPL image-result cluster', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const witness of [
      'rendered as image in REPL result',
      'Images returned by inner Read calls',
      'image-bearing REPL results are capped at',
    ]) {
      assert.equal(
        occurrences(bundle, witness),
        release.imageResults,
        `${release.version}: ${witness}`,
      )
    }
  }
})

test('redacts only the VM-visible image while preserving progress data', () => {
  const source = compact(
    fs.readFileSync(
      path.join(repo, 'src/tools/REPLTool/toolWrappers.ts'),
      'utf8',
    ),
  )
  const progress = source.indexOf("phase: 'complete', result: output")
  const redaction = source.indexOf(
    'base64: `[${base64Length} base64 chars — rendered as image in REPL result]`',
  )
  assert.ok(progress >= 0)
  assert.ok(redaction > progress)
  for (const fragment of [
    "imageResult.type === 'image'",
    "typeof imageResult.file.base64 === 'string'",
    'imageResult.file.base64.length > 0',
    "typeof imageResult.file.type === 'string'",
  ]) {
    assert.ok(source.includes(compact(fragment)), fragment)
  }
})

test('collects at most eight completed images only on successful execution', () => {
  const source = compact(
    fs.readFileSync(path.join(repo, 'src/tools/REPLTool/REPLTool.tsx'), 'utf8'),
  )
  for (const fragment of [
    'const MAX_REPL_IMAGES = 8',
    "if (record.phase !== 'complete') continue",
    "imageResult.type === 'image'",
    'return images.slice(0, MAX_REPL_IMAGES)',
    'const images = collectImages(progress)',
    '...(images.length > 0 ? { images } : {})',
    'Images returned by inner Read calls — surfaced as image content blocks',
  ]) {
    assert.ok(source.includes(compact(fragment)), fragment)
  }
  assert.equal(occurrences(source, 'collectImages(progress)'), 1)
  const successCollection = source.indexOf('const images = collectImages(progress)')
  const catchBranch = source.indexOf('} catch (error) {', successCollection)
  assert.ok(successCollection >= 0)
  assert.ok(catchBranch > successCollection)
  assert.equal(source.slice(catchBranch).includes('collectImages(progress)'), false)
})

test('maps image results to bounded text followed by base64 image blocks', () => {
  const source = compact(
    fs.readFileSync(path.join(repo, 'src/tools/REPLTool/REPLTool.tsx'), 'utf8'),
  )
  for (const fragment of [
    'if (output.images?.length)',
    'text.slice(0, maxResultSizeChars)',
    '[… ${text.length - maxResultSizeChars} more chars truncated — image-bearing REPL results are capped at ${maxResultSizeChars} chars of text]',
    "text || '(no text output)'",
    "{ type: 'text', text: boundedText }",
    "type: 'image' as const",
    "type: 'base64' as const",
    'media_type: image.mediaType',
    'data: image.base64',
  ]) {
    assert.ok(source.includes(compact(fragment)), fragment)
  }
})
