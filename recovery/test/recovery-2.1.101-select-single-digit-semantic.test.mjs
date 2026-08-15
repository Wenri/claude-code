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

const units = [
  [8761, 6890823, 6893170, 'd672d96a8fce7c271aec13e05017aeebd98cfec1a8d51035b5222df2f7dd1d28'],
  [10306, 7586040, 7588651, 'bfff51cc7a2134625dc7256483953d39db90962182f92578b02257051a252443'],
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test(
  'target101 pins single-key numeric selection in both select state machines',
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
    const target = targetBytes.toString('utf8')
    for (const [index, start, end, hash] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved')
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, hash],
      )
      assert.equal(sha256(target.slice(start, end)), hash)
      assert.match(target.slice(start, end), /\/\^\[0-9\]\$\//)
    }
    assert.equal((baselineBytes.toString('utf8').match(/\/\^\[0-9\]\$\//g) ?? []).length, 0)
    assert.equal((target.match(/\/\^\[0-9\]\$\//g) ?? []).length, 2)
  },
)

test(
  'source accepts exactly one numeric key rather than a buffered multi-digit token',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    for (const relative of [
      'components/CustomSelect/use-select-input.ts',
      'components/CustomSelect/use-multi-select-state.ts',
    ]) {
      const source = fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
      assert.equal((source.match(/\/\^\[0-9\]\$\//g) ?? []).length, 1, relative)
      assert.equal(source.includes('/^[0-9]+$/'), false, relative)
      assert.match(source, /parseInt\([^)]*\) - 1/)
    }
  },
)

test(
  'target116 retains both single-key numeric selectors',
  { skip: latestPath ? false : 'authenticated 2.1.116 inner bundle is required' },
  () => {
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    assert.equal(
      (latestBytes.toString('utf8').match(/\/\^\[0-9\]\$\//g) ?? []).length,
      2,
    )
  },
)
