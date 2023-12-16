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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test(
  '2.1.97 virtual-message key evidence pins the complete owning function',
  bundleOptions,
  () => {
    const bytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(bytes), targetSha256)
    const bundle = bytes.toString('utf8')
    const region = structural.regions[14740]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [
        10979473,
        10979847,
        '0e83892ba3bf11c0a3f182087e7bfc94cecc55791f7d6cba4d3a85ce1d910657',
      ],
    )
    assert.equal(
      sha256(bundle.slice(region.target.start, region.target.end)),
      region.target.sourceHash,
    )
    for (const fragment of [
      'VirtualMessageList: duplicate sibling keys (leaks DOM nodes via mapRemainingChildren overwrite): ',
      '.slice(0,3)',
      ' ×',
    ]) {
      assert.ok(bundle.slice(region.target.start, region.target.end).includes(fragment))
    }
  },
)

test(
  'source uniquifies later sibling keys and reports bounded duplicate counts',
  sourceOptions,
  () => {
    const source = fs.readFileSync(
      path.join(sourceRoot, 'components/VirtualMessageList.tsx'),
      'utf8',
    )
    for (const fragment of [
      'function makeSiblingKeysUnique(keys: string[]): string[]',
      'const uniqueKeys = keys.slice()',
      'uniqueKeys[index] = `${key}#${count}`',
      '.filter(([, count]) => count > 1)',
      '.slice(0, 3)',
      'VirtualMessageList: duplicate sibling keys (leaks DOM nodes via mapRemainingChildren overwrite): ',
      '`${key} ×${count}`',
      'makeSiblingKeysUnique(messages.map(itemKey))',
    ]) {
      assert.ok(source.includes(fragment), fragment)
    }

    const makeUnique = keys => {
      const result = keys.slice()
      const counts = new Map()
      for (let index = 0; index < result.length; index++) {
        const key = result[index]
        const count = counts.get(key)
        if (count === undefined) counts.set(key, 1)
        else {
          counts.set(key, count + 1)
          result[index] = `${key}#${count}`
        }
      }
      return result
    }
    assert.deepEqual(makeUnique(['a', 'b', 'a', 'a', 'b']), [
      'a',
      'b',
      'a#1',
      'a#2',
      'b#1',
    ])
  },
)
