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
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_96_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const sourceOptions = { skip: selected ? false : `not applicable to ${semanticCase}` }
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'authenticated 2.1.96 and 2.1.97 bundles are required'
      : false,
}
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(repositoryRoot, 'recovery/cases', caseName, 'structural/generated-delta.json.gz'),
    ),
  ),
)
const units = new Map([
  [10109, [7519680, 7520378, '06e7f231902f099c26c7ff03f9853249133f7859c3c2e8b27067e191e23e031f']],
  [10110, [7520378, 7520920, 'ce2d9456a7345d5a74118635831b7175a55d608359ae2485e252556110213320']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test('authenticated target97 introduces the dedicated Ink blockquote graph', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(sha256(baselineBytes), '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e')
  assert.equal(sha256(targetBytes), '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988')
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')
  for (const [index, identity] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual([region.target.start, region.target.end, region.target.sourceHash], identity)
    assert.equal(sha256(target.slice(region.target.start, region.target.end)), identity[2])
  }
  assert.equal(baseline.includes('borderStyle:"quote"'), false)
  assert.ok(target.includes('borderStyle:"quote",borderTop:!1,borderBottom:!1,borderRight:!1,borderDimColor:!0,paddingLeft:1'))
  assert.ok(target.includes('.tokens.map('))
  assert.ok(target.includes('.join("").trim()'))
})

test('source routes top-level blockquotes through the dedicated quote component', sourceOptions, () => {
  const owner = fs.readFileSync(path.join(sourceRoot, 'components/Markdown.tsx'), 'utf8')
  for (const fragment of [
    'token.type === "blockquote"',
    '<MarkdownBlockquote',
    'function MarkdownBlockquote(',
    'borderStyle="quote"',
    'borderTop={false}',
    'borderBottom={false}',
    'borderRight={false}',
    'borderDimColor',
    'paddingLeft={1}',
    'chalk.italic(',
  ]) assert.ok(owner.includes(fragment), fragment)
  if (sourceRoot === path.resolve(repositoryRoot, 'src')) {
    assert.ok(owner.includes(".join('').replace(/^\\n+/, '').trimEnd()"))
  } else {
    assert.ok(owner.includes(".join('').trim()"))
  }
})
