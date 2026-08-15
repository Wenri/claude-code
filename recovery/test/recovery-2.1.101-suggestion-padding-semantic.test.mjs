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
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselinePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
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

const unit = [
  13533,
  10118541,
  10119680,
  'fd8777edbb4f611a588e4c046ba29748ca005f7d0bd4e1031cef62131e13f3e7',
]
const paddingHelper = [
  13534,
  10119680,
  10119746,
  'ee96793cb43f12abe2af9bca13bc7f0f6748d57110af1f5b4cdf3f56360b6777',
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test(
  'target101 pins optional suggestion-row padding suppression',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.100 and 2.1.101 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be',
    )
    assert.equal(
      sha256(targetBytes),
      'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
    )
    const [index, start, end, hash] = unit
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, hash],
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    assert.equal(sha256(target.slice(start, end)), hash)
    assert.equal(baseline.includes('noPad'), false)
    assert.equal((target.match(/noPad/g) ?? []).length, 1)
    const fragment = target.slice(start, end)
    assert.match(fragment, /noPad:[^}=]+/)
    assert.match(fragment, /\?0:Math\.max\(0,[^)]+\.length\)/)
    assert.match(fragment, /Array\.from\(\{length:[^}]+\}/)
    const [helperIndex, helperStart, helperEnd, helperHash] = paddingHelper
    const helperRegion = structural.regions[helperIndex]
    assert.equal(helperRegion.classification, 'matched')
    assert.deepEqual(
      [
        helperRegion.target.start,
        helperRegion.target.end,
        helperRegion.target.sourceHash,
      ],
      [helperStart, helperEnd, helperHash],
    )
    const helper = target.slice(helperStart, helperEnd)
    assert.equal(sha256(helper), helperHash)
    assert.match(helper, /key:`pad-\$\{[^}]+\}`/)
  },
)

test(
  'source renders exact filler rows and lets anchored overlays suppress them',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const footer = fs.readFileSync(
      path.join(
        sourceRoot,
        'components/PromptInput/PromptInputFooterSuggestions.tsx',
      ),
      'utf8',
    )
    for (const fragment of [
      'noPad?: boolean;',
      'const paddingRows = noPad ? 0 : Math.max(0, maxVisibleItems - visibleItems.length);',
      'Array.from({',
      'length: paddingRows',
      'key={`pad-${index}`}',
    ]) {
      assert.ok(footer.includes(fragment), fragment)
    }
    if (!semanticCase) {
      const layout = fs.readFileSync(
        path.join(sourceRoot, 'components/FullscreenLayout.tsx'),
        'utf8',
      )
      assert.match(layout, /overlay=\{true\} noPad=\{true\}/)
      assert.match(
        footer,
        /const paddingRows = noPad \? 0 : Math\.max\(0, maxVisibleItems - 1\)/,
      )
    }
  },
)

test(
  'target116 retains the anchored-overlay no-padding caller',
  {
    skip: semanticCase || !latestPath
      ? 'current target116 evidence unavailable'
      : false,
  },
  () => {
    const latest = fs.readFileSync(latestPath, 'utf8')
    assert.equal((latest.match(/noPad/g) ?? []).length, 2)
    assert.match(latest, /overlay:!0,noPad:!0/)
  },
)
