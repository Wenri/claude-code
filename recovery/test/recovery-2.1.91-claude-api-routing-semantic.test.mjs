import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { parseExpressionAt } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.90-to-2.1.91'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const bundles = [
  [
    '2.1.89',
    process.env.CLAUDE_CODE_2_1_89_BUNDLE,
    'a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01',
    1435,
    1457,
    '2d68fc416de2c15efa3fb997439477a0f148156a1facc2cc754a97b86057f391',
  ],
  [
    '2.1.90',
    process.env.CLAUDE_CODE_2_1_90_BUNDLE,
    '069185909d50518b8b239acc0f9ae9b062a610595299b35955fc53e6e2c2f5e9',
    1435,
    1457,
    '2d68fc416de2c15efa3fb997439477a0f148156a1facc2cc754a97b86057f391',
  ],
  [
    '2.1.91',
    process.env.CLAUDE_CODE_2_1_91_BUNDLE,
    'b4bf141f30cf8b40196295816c7a6b9d01a36e906908d73a9f9a865ce4cdf816',
    1543,
    1567,
    '1c7ea919e9d353439902fb14c725d08ccad481eb04c64d12dfa04744bbc84d96',
  ],
  [
    '2.1.92',
    process.env.CLAUDE_CODE_2_1_92_BUNDLE,
    '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362',
    1543,
    1567,
    '1c7ea919e9d353439902fb14c725d08ccad481eb04c64d12dfa04744bbc84d96',
  ],
  [
    '2.1.94',
    process.env.CLAUDE_CODE_2_1_94_BUNDLE,
    '11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564',
    1543,
    1567,
    '1c7ea919e9d353439902fb14c725d08ccad481eb04c64d12dfa04744bbc84d96',
  ],
  [
    '2.1.96',
    process.env.CLAUDE_CODE_2_1_96_BUNDLE,
    '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e',
    1543,
    1567,
    '1c7ea919e9d353439902fb14c725d08ccad481eb04c64d12dfa04744bbc84d96',
  ],
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function authenticatedBundle(version, filename, expectedSha256) {
  assert.ok(filename, `CLAUDE_CODE_${version.replaceAll('.', '_')}_BUNDLE is required`)
  const value = fs.readFileSync(filename)
  assert.equal(sha256(value), expectedSha256, version)
  return value.toString('utf8')
}

function inlineReadingGuide(bundle) {
  const marker =
    '## Reference Documentation\\n\\nThe relevant documentation for your detected language'
  const markerOffset = bundle.indexOf(marker)
  assert.notEqual(markerOffset, -1, 'INLINE_READING_GUIDE marker missing')
  const quoteOffset = Math.max(
    bundle.lastIndexOf("'", markerOffset),
    bundle.lastIndexOf('"', markerOffset),
    bundle.lastIndexOf('`', markerOffset),
  )
  const expression = parseExpressionAt(bundle, quoteOffset, {
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  if (expression.type === 'Literal') return expression.value
  assert.equal(expression.type, 'TemplateLiteral')
  assert.equal(expression.expressions.length, 0)
  return expression.quasis[0].value.cooked
}

test('INLINE_READING_GUIDE changes first at 2.1.91 and stays exact through 2.1.96', {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !process.env.CLAUDE_CODE_2_1_90_BUNDLE ||
        !process.env.CLAUDE_CODE_2_1_91_BUNDLE
      ? 'the authenticated 2.1.90 and 2.1.91 bundles are not set'
      : false,
}, () => {
  const guides = new Map()
  for (const [
    version,
    filename,
    bundleSha256,
    codeUnits,
    utf8Bytes,
    guideSha256,
  ] of bundles) {
    if (!filename) continue
    const guide = inlineReadingGuide(
      authenticatedBundle(version, filename, bundleSha256),
    )
    guides.set(version, guide)
    assert.equal(guide.length, codeUnits, `${version} cooked UTF-16 code units`)
    assert.equal(Buffer.byteLength(guide), utf8Bytes, `${version} cooked UTF-8 bytes`)
    assert.equal(sha256(guide), guideSha256, `${version} cooked SHA-256`)
  }

  assert.notEqual(guides.get('2.1.90'), guides.get('2.1.91'))
  if (guides.has('2.1.89')) {
    assert.equal(guides.get('2.1.89'), guides.get('2.1.90'))
  }
  for (const version of ['2.1.92', '2.1.94', '2.1.96']) {
    if (guides.has(version)) {
      assert.equal(guides.get('2.1.91'), guides.get(version), version)
    }
  }
  assert.equal(
    guides.get('2.1.91').includes(
      '**Agent design (tool surface, context management, caching strategy):**\n→ Refer to `shared/agent-design.md`',
    ),
    true,
  )
})

test('2.1.91 materialized source owns the exact routing behavior', {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}, () => {
  const current = fs.readFileSync(
    path.join(sourceRoot, 'skills/bundled/claudeApi.ts'),
    'utf8',
  )
  assert.match(
    current,
    /\*\*Agent design \(tool surface, context management, caching strategy\):\*\*/,
  )
  assert.match(current, /shared\/agent-design\.md/)
})
