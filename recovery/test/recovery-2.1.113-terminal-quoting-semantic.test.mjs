import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.112-to-2.1.113'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_112_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_112_BUNDLE and CLAUDE_CODE_2_1_113_BUNDLE are required'
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

const pinnedUnits = new Map([
  [
    20192,
    [
      12737901,
      12738151,
      'c9f3bbc45cdbfbd9b9e411d348d2f3e195b349b5ca2b1c3d358d634639854f71',
      'unresolved',
    ],
  ],
  [
    20193,
    [
      12738151,
      12738250,
      '2b8f91cca90e43783c7b7829b3096a18de655a9caaa7f82e0e9d4206d7046d5d',
      'unresolved',
    ],
  ],
])

test(
  '2.1.113 pins the PowerShell Unicode guard and cmd percent-removal units',
  bundleOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselineBundlePath)
    const targetBytes = fs.readFileSync(targetBundlePath)
    assert.equal(
      sha256(baselineBytes),
      'bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f',
    )
    assert.equal(
      sha256(targetBytes),
      '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')

    for (const [index, [start, end, sourceHash, classification]] of pinnedUnits) {
      const region = structural.regions[index]
      assert.equal(region.classification, classification, `${index}: classification`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, sourceHash],
        `${index}: structural identity`,
      )
      assert.equal(sha256(target.slice(start, end)), sourceHash, `${index}: bytes`)
    }

    assert.equal(
      baseline.includes(
        'Cannot safely quote a Unicode single-quote variant (U+2018-U+201B)',
      ),
      false,
    )
    assert.equal(
      target.includes(
        'Cannot safely quote a Unicode single-quote variant (U+2018-U+201B)',
      ),
      true,
    )
    assert.match(
      baseline,
      /replace\(\/\[\\n\\t\]\/g," "\)\.replaceAll\('"',""\)\.replaceAll\("%","%%"\)/,
    )
    assert.match(
      target.slice(12738151, 12738250),
      /replace\(\/\[\\n\\t\]\/g," "\)\.replace\(\/\["%\]\/g,""\)/,
    )
  },
)

test(
  'source reproduces target 2.1.113 Windows shell-string quoting',
  sourceOptions,
  () => {
    const launcher = source('src/utils/deepLink/terminalLauncher.ts')
    for (const fragment of [
      '/[\\u2018\\u2019\\u201A\\u201B]/.test(s)',
      'Cannot safely quote a Unicode single-quote variant (U+2018-U+201B) in a PowerShell path; install Windows Terminal (wt.exe).',
      `.replaceAll('"', '').replaceAll("'", "''")`,
      `arg.replace(/[\\n\\t]/g, ' ').replace(/["%]/g, '')`,
      `stripped.replace(/(\\\\+)$/, '$1$1')`,
    ]) {
      assert.ok(launcher.includes(fragment), fragment)
    }
    assert.equal(launcher.includes("replace(/%/g, '%%')"), false)
  },
)
