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
    fs.readFileSync(
      path.join(root, 'recovery/cases', caseName, 'structural/generated-delta.json.gz'),
    ),
  ),
)
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')

test(
  'target110 pins reasoned agent-worktree lock and removal semantics',
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
      [16881, ['FunctionDeclaration', 11775286, 11776295, 'e3daea73b6b054501d3adac2df914860d073e5e1912aa98c8494685931ac3480']],
      [16883, ['FunctionDeclaration', 11776683, 11777853, 'ac720e4712edf9651318c8314b15b3ba18de57077e442dadf2c52498aa9b7e9e']],
    ]) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved')
      assert.deepEqual(
        [region.target.nodeType, region.target.start, region.target.end, region.target.sourceHash],
        expected,
      )
      assert.equal(sha256(targetText.slice(region.target.start, region.target.end)), expected[3])
    }
    const create = targetText.slice(11775286, 11776295)
    const remove = targetText.slice(11776683, 11777853)
    assert.match(create, /\["rev-parse","HEAD"\]/)
    assert.match(create, /\["worktree","lock","--reason",`claude agent \$\{[^}]+\} \(pid \$\{process\.pid\}\)`/)
    assert.match(create, /\[worktree\] failed to lock/)
    assert.ok(remove.indexOf('"unlock"') < remove.indexOf('"remove","--force"'))
    assert.match(remove, /residual dir cleanup failed/)
    assert.match(remove, /tengu_worktree_removed/)
    assert.match(remove, /\["branch","-D"/)
    if (latestPath) {
      const latest = fs.readFileSync(latestPath, 'utf8')
      assert.match(latest, /\[worktree\] failed to lock/)
      assert.match(latest, /worktree","unlock/)
    }
  },
)

test(
  'source preserves the full lock and cleanup graph',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const source = fs.readFileSync(path.join(sourceRoot, 'utils/worktree.ts'), 'utf8')
    const createStart = source.indexOf('export async function createAgentWorktree')
    const removeStart = source.indexOf('export async function removeAgentWorktree')
    assert.ok(createStart >= 0 && removeStart > createStart)
    const create = source.slice(createStart, removeStart)
    const remove = source.slice(removeStart)
    assert.match(create, /\['rev-parse', 'HEAD'\]/)
    assert.match(create, /'worktree',[\s\S]*?'lock',[\s\S]*?'--reason',[\s\S]*?`claude agent \$\{slug\} \(pid \$\{process\.pid\}\)`/)
    assert.match(create, /\[worktree\] failed to lock/)
    assert.ok(remove.indexOf("'unlock'") < remove.indexOf("'remove'"))
    assert.match(remove, /residual dir cleanup failed/)
    assert.match(remove, /tengu_worktree_removed/)
    assert.match(remove, /\['branch', '-D', worktreeBranch\]/)
  },
)
