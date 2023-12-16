import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.110-to-2.1.111'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const historical = semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_111_BUNDLE
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
  'target111 pins the concise Skill invocation guidance',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated target110 and target111 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(sha256(baselineBytes), 'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861')
    assert.equal(sha256(targetBytes), '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0')
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const region = structural.regions[16976]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.nodeType, region.target.start, region.target.end, region.target.sourceHash],
      ['FunctionDeclaration', 11823583, 11824474, '897d96e78d3ebe1bbd191f2eb5ef349eb98a56e5c9826c92253a32eedbb5251b'],
    )
    const unit = target.slice(region.target.start, region.target.end)
    assert.equal(sha256(unit), region.target.sourceHash)
    assert.equal(baseline.split('When the user types \\`/<skill-name>\\`').length - 1, 1)
    assert.equal(target.split('When the user types \\`/<skill-name>\\`').length - 1, 1)
    assert.equal(baseline.split('is shorthand for users to invoke').length - 1, 1)
    assert.equal(target.includes('is shorthand for users to invoke'), false)
    assert.match(
      unit,
      /When the user types \\\`\/<skill-name>\\\`.*Only use skills listed in the user-invocable skills section .* don't guess/s,
    )
  },
)

test(
  'source emits the target guidance only when Skill is actually available',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const owner = fs.readFileSync(
      path.join(sourceRoot, 'constants/prompts.ts'),
      'utf8',
    )
    assert.match(
      owner,
      /When the user types \\`\/<skill-name>\\`, invoke it via \$\{SKILL_TOOL_NAME\}\. Only use skills listed in the user-invocable skills section — don't guess\./,
    )
    if (historical) {
      assert.match(
        owner,
        /const hasSkills =[\s\S]*skillToolCommands\.length > 0 && enabledTools\.has\(SKILL_TOOL_NAME\)[\s\S]*hasSkills\s*\? `When the user types/,
      )
    } else {
      assert.match(
        owner,
        /const sessionSkillAllowlist = getSessionSkillAllowlist\(\)[\s\S]*const hasSkills =[\s\S]*sessionSkillAllowlist === undefined[\s\S]*skillToolCommands\.length > 0[\s\S]*sessionSkillAllowlist\.length > 0[\s\S]*enabledTools\.has\(SKILL_TOOL_NAME\)[\s\S]*hasSkills\s*\? `When the user types/,
      )
    }
    assert.equal(owner.includes('is shorthand for users to invoke a user-invocable skill'), false)
  },
)
