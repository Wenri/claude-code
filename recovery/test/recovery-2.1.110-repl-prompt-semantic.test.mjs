import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_109_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test(
  'target110 authenticates the complete async REPL prompt function',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.109 and 2.1.110 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7',
    )
    assert.equal(
      sha256(targetBytes),
      'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
    )
    const target = targetBytes.toString('utf8')
    const region = structural.regions[11792]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.sourceHash,
      ],
      [
        9011018,
        9015824,
        'FunctionDeclaration',
        'ee4e2d61a11ece4d3553f67ca361b3a626e8d12832e5a6ecd252dcba1b2db146',
      ],
    )
    const unit = target.slice(region.target.start, region.target.end)
    assert.equal(sha256(unit), region.target.sourceHash)
    for (const fragment of [
      "gh pr edit N --body-file - <<'EOF'\\\\n\"+body+\"\\\\nEOF",
      "git commit -F - <<'EOF'\\\\n\"+msg+\"\\\\nEOF",
      'Generic temp paths get clobbered by parallel agents.',
      'REPL is your **only way** to investigate',
      "REPL is your programming interface to Claude Code's tools",
    ]) {
      assert.ok(unit.includes(fragment), fragment)
    }
    assert.equal(
      baselineBytes
        .toString('utf8')
        .includes('Generic temp paths get clobbered by parallel agents.'),
      false,
    )
  },
)

test(
  'source owns gh-sensitive prompt selection and both exact safety branches',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const prompt = fs.readFileSync(
      path.join(sourceRoot, 'tools/REPLTool/prompt.ts'),
      'utf8',
    )
    for (const fragment of [
      "import memoize from 'lodash-es/memoize.js'",
      "import { which } from '../../utils/which.js'",
      "async (): Promise<boolean> => (await which('gh')) !== null",
      'export async function getReplPrompt(): Promise<string>',
      'const githubCliAvailable = await isGitHubCliAvailable()',
      "? `gh pr edit N --body-file - <<'EOF'\\\\n\"+body+\"\\\\nEOF`",
      ": `git commit -F - <<'EOF'\\\\n\"+msg+\"\\\\nEOF`",
      "githubCliAvailable ? `- \\`gh(args)\\`",
      'Generic temp paths get clobbered by parallel agents.',
      'sh("${heredocExample}")',
      'await Bash({command: "${heredocExample}"})',
    ]) {
      assert.ok(prompt.includes(fragment), fragment)
    }
  },
)
