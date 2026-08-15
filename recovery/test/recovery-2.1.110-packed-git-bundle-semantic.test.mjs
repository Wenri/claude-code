import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(root, 'src')
const baselinePath = process.env.CLAUDE_CODE_2_1_109_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(path.join(root, 'recovery/cases', caseName, 'structural/generated-delta.json.gz')),
  ),
)
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')

test(
  'target110 pins packed-object-aware Git bundle fallback',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.109 and 2.1.110 bundles are required'
        : false,
  },
  () => {
    const baseline = fs.readFileSync(baselinePath)
    const target = fs.readFileSync(targetPath)
    assert.equal(sha256(baseline), '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7')
    assert.equal(sha256(target), 'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861')
    const targetText = target.toString('utf8')
    for (const [index, expected] of [
      [10628, ['FunctionDeclaration', 8238038, 8238341, '8452489121fe16d5cd11c6dacea104e9ecceebd8fff996ea951294ca26038b45']],
      [10629, ['FunctionDeclaration', 8238341, 8240512, '9a0531eea3a5d3a32b0469b49c4fe0b3e0a85c00995de65419fab17637d932f2']],
    ]) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved')
      assert.deepEqual(
        [region.target.nodeType, region.target.start, region.target.end, region.target.sourceHash],
        expected,
      )
      assert.equal(sha256(targetText.slice(region.target.start, region.target.end)), expected[3])
    }
    const probe = targetText.slice(8238038, 8238341)
    const fallback = targetText.slice(8238341, 8240512)
    assert.match(probe, /\^size-pack:\\s\*\(\\d\+\)/)
    assert.match(probe, /\^in-pack:\\s\*\(\\d\+\)/)
    assert.match(fallback, />100\*[^|]+\|\|[^>]+>5000000/)
    assert.ok(fallback.indexOf('"--all"') < fallback.indexOf('"HEAD"'))
    assert.ok(fallback.indexOf('"HEAD"') < fallback.indexOf('"refs/seed/root"'))
    assert.match(fallback, /\["commit-tree",`\$\{[^}]+\}\^\{tree\}`,"-m","seed-base"\]/)
    assert.equal(targetText.includes('stash_failed'), false)
    assert.equal(targetText.includes("It doesn't look like you have any new commits or changes to review"), false)
    if (latestPath) {
      const latest = fs.readFileSync(latestPath, 'utf8')
      assert.match(latest, /stash_failed/)
      assert.match(latest, /It doesn't look like you have any new commits or changes to review/)
    }
  },
)

test(
  'source preserves the target-specific bundle boundary',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const source = fs.readFileSync(path.join(sourceRoot, 'utils/teleport/gitBundle.ts'), 'utf8')
    assert.match(source, /\^size-pack:\\s\*\(\\d\+\)\/m/)
    assert.match(source, /\^in-pack:\\s\*\(\\d\+\)\/m/)
    assert.match(source, /inPackCount !== null && inPackCount > 5_000_000/)
    assert.match(source, /\['commit-tree', `\$\{baseRef\}\^\{tree\}`, '-m', 'seed-base'\]/)
    assert.match(source, /baseRef\?: string/)
    if (semanticCase === caseName) {
      assert.equal(source.includes("failReason: 'stash_failed'"), false)
      assert.equal(source.includes("failReason: 'no_changes'"), false)
      assert.equal(source.includes('isRepoTooLargeForBundle'), false)
      assert.match(source, /proceeding without WIP/)
    } else {
      assert.match(source, /failReason: 'stash_failed'/)
      assert.match(source, /failReason: 'no_changes'/)
      assert.match(source, /isRepoTooLargeForBundle/)
    }
  },
)
