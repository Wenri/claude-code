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
const targetSha256 =
  '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988'
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

const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
      : false,
}

const pinnedUnits = new Map([
  [
    3236,
    [
      'unresolved',
      2420337,
      2421209,
      '16dd30c58c8daf51d525cd7785c2c978bf210cbae1065dd26e66988bcef9f5a6',
    ],
  ],
  [
    5501,
    [
      'unresolved',
      4011614,
      4012392,
      '6deb48b7b33e01d6edb8e636f8635086ac5038fce1386b4949869b8df2ca3959',
    ],
  ],
  [
    6270,
    [
      'unresolved',
      4423912,
      4424062,
      'ac267037f07e4f47771805c0afb46e47703ed4a03aec6ee9434d9bd4af7483d1',
    ],
  ],
  [
    6868,
    [
      'unresolved',
      5037295,
      5038058,
      'a477a7d44e20752d4cd1b66065016678b62ecd320ec4f7e216ef485689f8b9ff',
    ],
  ],
  [
    7067,
    [
      'unresolved',
      5199993,
      5203016,
      'e0c3ddf6f242344be14ca22f20014855e94b4dfbce2ab82c983860b54922008e',
    ],
  ],
  [
    7811,
    [
      'unresolved',
      6515684,
      6520827,
      '61d8103d7bb2d28dec47adab75e72725b0f536f7049f3a1f0db6e70e4913ad86',
    ],
  ],
  [
    8113,
    [
      'unresolved',
      6656362,
      6656524,
      '94527a5eada4db0a0f61b11358ae3a038b891de68f5d12c0ecec72f8fd29851a',
    ],
  ],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function assertFragments(relative, fragments) {
  const text = source(relative)
  for (const fragment of fragments) {
    assert.ok(text.includes(fragment), `${relative}: ${fragment}`)
  }
  return text
}

test(
  '2.1.97 runtime-utility evidence pins every owning target unit',
  bundleOptions,
  () => {
    const bytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(bytes), targetSha256)
    const bundle = bytes.toString('utf8')
    for (const [index, [classification, start, end, sourceHash]] of pinnedUnits) {
      const region = structural.regions[index]
      assert.equal(region.target.index, index)
      assert.equal(region.classification, classification, `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, sourceHash],
        `${index}: structural identity`,
      )
      assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
    }

    for (const fragment of [
      '/-\\d{8}$/',
      'Set-Clipboard -Value',
      '(opus|sonnet|haiku)-(\\d+)-(\\d+)',
      'tengu_image_resize',
      '--assign',
      '--exec',
      'replaceAll("\\\\/","/")',
    ]) {
      assert.ok(bundle.includes(fragment), fragment)
    }
  },
)

test('source owns model, clipboard, effort, image, and awk behavior', sourceOptions, () => {
  assertFragments('src/utils/model/model.ts', [
    "return name.replace(/-\\d{8}$/, '')",
  ])
  assertFragments('src/ink/termio/osc.ts', [
    'const WINDOWS_CLIPBOARD_BASE64_LIMIT = 30_000',
    "'powershell'",
    "'-NoProfile'",
    "'-Command'",
    'Set-Clipboard -Value ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String',
  ])
  const effort = assertFragments('src/utils/effort.ts', [
    "get3PModelCapabilityOverride(model, 'max_effort')",
  ])
  // The one-release target97 implementation is present only in the historical
  // semantic tree. Later source legitimately replaces it with a canonical-set
  // implementation while retaining the same public owner.
  if (effort.includes('parseModelFamilyVersion')) {
    for (const fragment of [
      '.match(/(opus|sonnet|haiku)-(\\d+)-(\\d+)/)',
      "version.family === 'haiku'",
      'version.major > 4 || (version.major === 4 && version.minor >= 6)',
    ]) {
      assert.ok(effort.includes(fragment), fragment)
    }
  }
  const image = assertFragments('src/utils/imageResizer.ts', [
    "logEvent('tengu_image_resize', {",
    'over_byte_limit: true',
    'over_dimension_limit: false',
    'over_dimension_limit: needsDimensionResize',
    'original_width: originalWidth',
    'original_height: originalHeight',
  ])
  assert.equal(image.match(/logEvent\('tengu_image_resize', \{/g)?.length, 2)
  assertFragments('src/tools/BashTool/pathValidation.ts', [
    "'-v'",
    "'--assign'",
    "'-e'",
    "'--source'",
    "'-f'",
    "'--file'",
    "'-E'",
    "'--exec'",
    "flag === '-e' || flag === '--source'",
  ])
})

test('source-equivalent escaped-space and JSON slash normalizers match target behavior', sourceOptions, () => {
  assertFragments('src/utils/claudemd.ts', [
    'const includeRegex = /(?:^|\\s)@((?:[^\\s\\\\]|\\\\ )+)/g',
    "path = path.replace(/\\\\ /g, ' ')",
  ])
  assertFragments('src/components/shell/OutputLine.tsx', [
    "line.replace(/\\\\\\//g, '/')",
    "stringified.replace(/\\s+/g, '')",
  ])

  const escapedPath = String.raw`docs/My\ File.md`
  assert.equal(escapedPath.replace(/\\ /g, ' '), 'docs/My File.md')
  const escapedJson = String.raw`{"path":"a\/b"}`
  assert.equal(
    escapedJson.replace(/\\\//g, '/').replace(/\s+/g, ''),
    JSON.stringify(JSON.parse(escapedJson)).replace(/\s+/g, ''),
  )
})
