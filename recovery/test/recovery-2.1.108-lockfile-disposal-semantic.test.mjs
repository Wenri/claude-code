import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.107-to-2.1.108'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_107_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_108_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_107_BUNDLE and CLAUDE_CODE_2_1_108_BUNDLE are required'
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
const units = new Map([
  [4613, [3500933, 3500977, 'FunctionDeclaration', '5d4b1765b671c39105b4eb4305169b8012adef6e91e255d26386a810b816818a']],
  [4614, [3500977, 3501078, 'FunctionDeclaration', 'fb3ac25d4a21b93ece556858606a0336b72a5dc45281b3fac5a31f7962dccf45']],
  [4615, [3501078, 3501167, 'FunctionDeclaration', 'a5c710a3f7b84ea0839263ef521c3ed61663a6eed2ef3372a22e75c3f17bd4f4']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test('target108 pins lazy lock loading and async/sync disposable releases', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(
    sha256(baselineBytes),
    '6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844',
  )
  assert.equal(
    sha256(targetBytes),
    'dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73',
  )
  const target = targetBytes.toString('utf8')
  for (const [index, identity] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.nodeType, region.target.sourceHash],
      identity,
      `${index}: structural identity`,
    )
    assert.equal(
      sha256(target.slice(identity[0], identity[1])),
      identity[3],
      `${index}: bytes`,
    )
  }
  const fragment = target.slice(3500933, 3501167)
  assert.ok(fragment.includes('[Symbol.asyncDispose]'))
  assert.ok(fragment.includes('[Symbol.dispose]'))
  assert.ok(fragment.includes('Object.assign'))
})

test('source returns the same release function as its disposal method', sourceOptions, () => {
  const owner = fs.readFileSync(path.join(sourceRoot, 'utils/lockfile.ts'), 'utf8')
  for (const fragment of [
    "require('proper-lockfile')",
    '.lock(file, options)',
    'Object.assign(release, { [Symbol.asyncDispose]: release })',
    '.lockSync(file, options)',
    'Object.assign(release, { [Symbol.dispose]: release })',
  ]) {
    assert.ok(owner.includes(fragment), fragment)
  }
})
