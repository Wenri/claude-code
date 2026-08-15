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
  [7010, [5102433, 5102548, 'FunctionDeclaration', 'cf820af5e06b3c91cd7d1414450aaa37768f3edeb08c91c4da3197b327076f80']],
  [7011, [5102548, 5102642, 'FunctionDeclaration', '259eeaa465f22c69e1b11853871dead16593a0243f8a2c9c6d73dca6f022e79d']],
  [7012, [5102642, 5103548, 'ClassDeclaration', 'b7f55859463eff65c06c15b6002425cf9537d1ec7942b900c49215432c2751c5']],
  [11415, [8641021, 8646207, 'VariableDeclaration', 'f78ccb2056772bd34a44ce7b00c5610c748ee3b306394ab3aea01d33ff59b977']],
  [11661, [8960601, 8961426, 'FunctionDeclaration', '78dabfde41e24dc4954e87e0aa2860de34939ee018d704d820204e0a1647f56d']],
  [12430, [9348893, 9355093, 'VariableDeclaration', '6fb5b5240f2647f9c2d3bd536c2f28f46acc9444fe65a07a72e08825a6409fc4']],
  [13069, [9696623, 9697258, 'FunctionDeclaration', 'd757aa6f9bd0c42cccc5ba28651b439936cb840ec0990cf87eac9016a10712d7']],
  [13075, [9699907, 9700843, 'FunctionDeclaration', 'd61652c516f608e2a35a00dcdc108e8b68d9137a10fb6391c784c83b1b02d754']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function assertFragments(relative, fragments) {
  const contents = source(relative)
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
  }
}

test('target108 pins the complete hash-backed file-state cache and changed-file call path', bundleOptions, () => {
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
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')
  assert.equal(baseline.includes('keepContent'), false)
  assert.equal(
    baseline.includes('contentHash!==void 0)return'),
    false,
  )
  for (const [index, [start, end, nodeType, expectedHash]] of units) {
    const region = structural.regions[index]
    assert.notEqual(region.classification, 'matched', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.nodeType, region.target.sourceHash],
      [start, end, nodeType, expectedHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(target.slice(start, end)), expectedHash, `${index}: bytes`)
  }
})

test('source owns exact hash fallback, retention, and bounded cache semantics', sourceOptions, () => {
  assertFragments('utils/fileStateCache.ts', [
    "createHash('sha1').update(content).digest('base64url')",
    "Bun.hash(content).toString(36)",
    'MAX_INLINE_FILE_STATE_CONTENT_BYTES = 4096',
    'state.contentHash === hashFileStateContent(content)',
    'value.keepContent ?? previous?.keepContent',
    'value.contentHash ?? hashFileStateContent(value.content)',
    'value.contentLength ?? value.content.length',
    "value.content === ''",
    'contentHash === previous?.contentHash',
    'Buffer.byteLength(contentBeforeLimit)',
  ])
})

test('write/edit, hook resync, nested memory, and changed-file consumers use hashes', sourceOptions, () => {
  assertFragments('tools/FileWriteTool/FileWriteTool.ts', [
    'fileStateMatchesContent(readTimestamp, current)',
    'fileStateMatchesContent(lastRead, meta.content)',
  ])
  assertFragments('tools/FileEditTool/FileEditTool.ts', [
    'fileStateMatchesContent(readTimestamp, fileContent)',
    'fileStateMatchesContent(lastRead, originalFileContents)',
  ])
  assertFragments('utils/toolErrors.ts', [
    'fileStateMatchesContent(previous, current.content)',
  ])
  assertFragments('utils/attachments.ts', [
    'keepContent: true',
    'fileStateMatchesContent(fileState, result.data.file.content)',
  ])
})
