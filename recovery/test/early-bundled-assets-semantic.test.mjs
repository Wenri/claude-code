import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const semanticSourceRoot =
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
  path.join(repositoryRoot, 'src')

function appliesTo(caseName) {
  return selectedCase === caseName
}

function source(relative) {
  return fs.readFileSync(path.join(semanticSourceRoot, relative), 'utf8')
}

function bundleValues(filename) {
  const text = fs.readFileSync(filename, 'utf8')
  const ast = parse(text, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const values = []
  function walk(node) {
    if (node === null || typeof node !== 'object') return
    if (node.type === 'Literal' && typeof node.value === 'string') {
      values.push(node.value)
    } else if (node.type === 'TemplateElement') {
      values.push(node.value?.cooked ?? node.value?.raw)
    }
    for (const [key, value] of Object.entries(node)) {
      if (['end', 'loc', 'raw', 'start'].includes(key)) continue
      if (Array.isArray(value)) value.forEach(walk)
      else if (value && typeof value === 'object') walk(value)
    }
  }
  walk(ast)
  return values
}

function uniqueValue(values, marker) {
  const matches = values.filter(value => value.includes(marker))
  assert.equal(matches.length, 1, marker)
  return matches[0]
}

function txtRequireValue(relative) {
  const value = source(relative)
  return value.endsWith('\n') ? value.slice(0, -1) : value
}

const verifySkillMarker = '**Verification is runtime observation.**'
const verifyCliMarker = '# Verifying a CLI change'
const verifyServerMarker = '# Verifying a server/API change'
const classifierMarker =
  'You are a security monitor for autonomous AI coding agents.'
const permissionsMarker =
  '<user_environment_to_replace>- **Trusted repo**:'
const claudeApiSkillMarker = '# Building LLM-Powered Applications with Claude'
const agentDesignMarker = '# Agent Design Patterns'
const liveSourcesMarker = '# Live Documentation Sources'
const toolUseConceptsMarker = '# Tool Use Concepts'

test(
  '2.1.89 owns exact inherited verify and auto-mode text assets',
  {
    timeout: 30_000,
    skip:
      !appliesTo('2.1.88-to-2.1.89') ||
      !process.env.CLAUDE_CODE_2_1_89_BUNDLE,
  },
  () => {
    if (selectedCase !== '2.1.88-to-2.1.89') return
    const values = bundleValues(process.env.CLAUDE_CODE_2_1_89_BUNDLE)
    assert.equal(
      source('skills/bundled/verify/SKILL.md'),
      uniqueValue(values, verifySkillMarker),
    )
    assert.equal(
      source('skills/bundled/verify/examples/cli.md'),
      uniqueValue(values, verifyCliMarker),
    )
    assert.equal(
      source('skills/bundled/verify/examples/server.md'),
      uniqueValue(values, verifyServerMarker),
    )
    assert.equal(
      txtRequireValue(
        'utils/permissions/yolo-classifier-prompts/auto_mode_system_prompt.txt',
      ),
      uniqueValue(values, classifierMarker),
    )
    assert.equal(
      txtRequireValue(
        'utils/permissions/yolo-classifier-prompts/permissions_external.txt',
      ),
      uniqueValue(values, permissionsMarker),
    )
  },
)

test(
  '2.1.90 owns the exact verify-skill and auto-mode prompt evolution',
  {
    timeout: 30_000,
    skip:
      !appliesTo('2.1.89-to-2.1.90') ||
      !process.env.CLAUDE_CODE_2_1_90_BUNDLE,
  },
  () => {
    if (selectedCase !== '2.1.89-to-2.1.90') return
    const values = bundleValues(process.env.CLAUDE_CODE_2_1_90_BUNDLE)
    assert.equal(
      source('skills/bundled/verify/SKILL.md'),
      uniqueValue(values, verifySkillMarker),
    )
    assert.equal(
      txtRequireValue(
        'utils/permissions/yolo-classifier-prompts/auto_mode_system_prompt.txt',
      ),
      uniqueValue(values, classifierMarker),
    )
    assert.equal(
      txtRequireValue(
        'utils/permissions/yolo-classifier-prompts/permissions_external.txt',
      ),
      uniqueValue(values, permissionsMarker),
    )
  },
)

test(
  '2.1.91 owns the exact verify and Claude API skill asset evolution',
  {
    timeout: 30_000,
    skip:
      !appliesTo('2.1.90-to-2.1.91') ||
      !process.env.CLAUDE_CODE_2_1_91_BUNDLE,
  },
  () => {
    if (selectedCase !== '2.1.90-to-2.1.91') return
    const values = bundleValues(process.env.CLAUDE_CODE_2_1_91_BUNDLE)
    assert.equal(
      source('skills/bundled/verify/SKILL.md'),
      uniqueValue(values, verifySkillMarker),
    )
    assert.equal(
      source('skills/bundled/claude-api/SKILL.md'),
      uniqueValue(values, claudeApiSkillMarker),
    )
    assert.equal(
      source('skills/bundled/claude-api/shared/agent-design.md'),
      uniqueValue(values, agentDesignMarker),
    )
    assert.equal(
      source('skills/bundled/claude-api/shared/live-sources.md'),
      uniqueValue(values, liveSourcesMarker),
    )
    assert.equal(
      source('skills/bundled/claude-api/shared/tool-use-concepts.md'),
      uniqueValue(values, toolUseConceptsMarker),
    )
    assert.equal(
      `${txtRequireValue(
        'utils/permissions/yolo-classifier-prompts/permissions_external.txt',
      )}\n`,
      uniqueValue(values, permissionsMarker),
      'target91 external-permissions cooked value retains one terminal newline',
    )
    assert.match(
      source('utils/permissions/yoloClassifier.ts'),
      /permissions_external\.txt'[\s\S]*?\+\s*'\\n'/,
      'target91 source restores the terminal newline after text-loader normalization',
    )
    const bundle = fs.readFileSync(
      process.env.CLAUDE_CODE_2_1_91_BUNDLE,
      'utf8',
    )
    assert.ok(
      bundle.includes('SKILL_PROMPT.replace("<!-- __S3__ -->"'),
      'optional skill overlay branch is present',
    )
    assert.ok(
      bundle.includes('text:P6$(z,q,K,null)'),
      'the only shipped Claude API command call passes a static null overlay',
    )
  },
)

test(
  'current assets retain exact latest target semantics',
  {
    timeout: 30_000,
    skip:
      selectedCase !== undefined ||
      !process.env.CLAUDE_CODE_2_1_116_BUNDLE,
  },
  () => {
    if (selectedCase !== undefined) return
    const values = bundleValues(process.env.CLAUDE_CODE_2_1_116_BUNDLE)
    assert.ok(
      values.includes(source('skills/bundled/verify/SKILL.md')),
      'latest runtime-verification asset is present alongside the legacy /verify asset',
    )
    assert.ok(
      values.includes(source('skills/bundled/verify/examples/cli.md')),
      'latest CLI verification example is present',
    )
    assert.ok(
      values.includes(source('skills/bundled/verify/examples/server.md')),
      'latest server verification example is present',
    )
    assert.ok(
      values.includes(
        txtRequireValue(
          'utils/permissions/yolo-classifier-prompts/auto_mode_system_prompt.txt',
        ),
      ),
      'latest auto-mode classifier prompt is present',
    )
    assert.ok(
      values.includes(
        txtRequireValue(
          'utils/permissions/yolo-classifier-prompts/permissions_external.txt',
        ),
      ),
      'latest external-permissions prompt is present',
    )
    assert.ok(
      values.includes(source('skills/bundled/claude-api/SKILL.md')),
      'latest Claude API skill prompt is present',
    )
    assert.ok(
      values.includes(
        source('skills/bundled/claude-api/shared/agent-design.md'),
      ),
      'latest agent-design reference is present',
    )
    assert.ok(
      values.includes(
        source('skills/bundled/claude-api/shared/live-sources.md'),
      ),
      'latest live-sources reference is present',
    )
    assert.ok(
      values.includes(
        source('skills/bundled/claude-api/shared/tool-use-concepts.md'),
      ),
      'latest tool-use reference is present',
    )
  },
)
