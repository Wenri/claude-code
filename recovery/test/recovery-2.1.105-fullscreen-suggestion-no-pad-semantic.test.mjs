import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
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

const baselineUnit = {
  index: 14932,
  start: 11076060,
  end: 11076597,
  hash: 'cccf3c50294593ba1dbb7ed557c4940b9720d49a18494d155ba26deb086e71f4',
}
const targetUnit = {
  index: 15050,
  start: 11129261,
  end: 11129806,
  hash: 'cead7631e35add543cb20b87359970b4ef75aecbc1d243470dcfee162aec9e67',
}
const latestUnit = {
  index: 16532,
  start: 10410430,
  end: 10411067,
  hash: '624a7cdd09ad277f254367a82afe289fd5bc4521526edcf953be1d33087fdd87',
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

async function loadTypeScript() {
  const candidates = [
    path.resolve(
      path.dirname(process.execPath),
      '../lib/node_modules/typescript/lib/typescript.js',
    ),
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate, 'the pinned TypeScript compiler must be available')
  const module = await import(pathToFileURL(candidate).href)
  return module.default ?? module
}

test(
  'authenticated target105 removes reserved padding from the fullscreen suggestion overlay',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath || !latestPath
        ? 'authenticated 2.1.104, 2.1.105, and 2.1.116 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(baselineBytes),
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    )
    assert.equal(
      sha256(targetBytes),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )

    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const latest = latestBytes.toString('utf8')
    const region = structural.regions[targetUnit.index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [
        region.target.index,
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.sourceHash,
      ],
      [
        targetUnit.index,
        targetUnit.start,
        targetUnit.end,
        'FunctionDeclaration',
        targetUnit.hash,
      ],
    )

    const baselineOverlay = baseline.slice(
      baselineUnit.start,
      baselineUnit.end,
    )
    const targetOverlay = target.slice(targetUnit.start, targetUnit.end)
    const latestOverlay = latest.slice(latestUnit.start, latestUnit.end)
    assert.equal(sha256(baselineOverlay), baselineUnit.hash)
    assert.equal(sha256(targetOverlay), targetUnit.hash)
    assert.equal(sha256(latestOverlay), latestUnit.hash)
    assert.equal(occurrences(baselineOverlay, 'noPad:!0'), 0)
    assert.equal(occurrences(targetOverlay, 'noPad:!0'), 1)
    assert.equal(occurrences(latestOverlay, 'noPad:!0'), 1)
    for (const overlay of [baselineOverlay, targetOverlay, latestOverlay]) {
      assert.equal(occurrences(overlay, 'overlay:!0'), 1)
      assert.match(overlay, /bottom:"100%"/)
    }
  },
)

test(
  'source fullscreen overlay passes noPad only to its suggestion list',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const ownerPath = path.join(sourceRoot, 'components/FullscreenLayout.tsx')
    const owner = fs.readFileSync(ownerPath, 'utf8')
    const ts = await loadTypeScript()
    const parsed = ts.createSourceFile(
      ownerPath,
      owner,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    const declaration = parsed.statements.find(
      node =>
        ts.isFunctionDeclaration(node) && node.name?.text === 'SuggestionsOverlay',
    )
    assert.ok(declaration, 'SuggestionsOverlay must exist')
    const body = declaration.getText(parsed)
    assert.equal(occurrences(body, '<PromptInputFooterSuggestions'), 1)
    assert.equal(occurrences(body, 'overlay={true}'), 1)
    assert.equal(occurrences(body, 'noPad={true}'), 1)
    assert.match(body, /bottom="100%"/)
  },
)
