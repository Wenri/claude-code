import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url))
const targetBundlePath = process.env.CLAUDE_CODE_2_1_91_BUNDLE

function readSource(relativePath) {
  return fs.readFileSync(`${sourceRoot}${relativePath}`, 'utf8')
}

function targetBundle() {
  assert.ok(
    targetBundlePath,
    'CLAUDE_CODE_2_1_91_BUNDLE environment variable must be set',
  )
  return fs.readFileSync(targetBundlePath, 'utf8')
}

const DEFAULT_MCP_RESULT_SIZE = 100_000
const MAX_MCP_RESULT_SIZE = 500_000
const DEFAULT_PERSISTENCE_CEILING = 50_000

function resolveMcpResultSize(requested) {
  const hasRequestedResultSize =
    typeof requested === 'number' &&
    Number.isFinite(requested) &&
    requested > 0
  return {
    maxResultSizeChars: hasRequestedResultSize
      ? Math.min(requested, MAX_MCP_RESULT_SIZE)
      : DEFAULT_MCP_RESULT_SIZE,
    persistenceThresholdCeiling: hasRequestedResultSize
      ? MAX_MCP_RESULT_SIZE
      : undefined,
  }
}

function getPersistenceThresholdModel(
  declared,
  ceiling = DEFAULT_PERSISTENCE_CEILING,
) {
  if (!Number.isFinite(declared)) return declared
  return Math.min(declared, ceiling)
}

function replaceDisabledShellCommands(text) {
  const placeholder = '[shell command execution disabled by policy]'
  let result = text.replace(/```!\s*\n?[\s\S]*?\n?```/g, placeholder)
  if (result.includes('!`')) {
    result = result.replace(/(?<=^|\s)!`[^`]+`/gm, placeholder)
  }
  return result
}

function shouldDisableSkillShellExecution(loadedFrom, source) {
  if (source === 'policySettings') return false
  return ['skills', 'commands_DEPRECATED', 'plugin'].includes(loadedFrom)
}

function containsControlChars(
  value,
  { allowNewlineAndTab = false } = {},
) {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) {
      if (allowNewlineAndTab && (code === 0x0a || code === 0x09)) continue
      return true
    }
  }
  return false
}

test('recovers the capped MCP max-result metadata override', () => {
  assert.deepEqual(resolveMcpResultSize(undefined), {
    maxResultSizeChars: DEFAULT_MCP_RESULT_SIZE,
    persistenceThresholdCeiling: undefined,
  })
  assert.deepEqual(resolveMcpResultSize(250_000), {
    maxResultSizeChars: 250_000,
    persistenceThresholdCeiling: MAX_MCP_RESULT_SIZE,
  })
  assert.deepEqual(resolveMcpResultSize(750_000), {
    maxResultSizeChars: MAX_MCP_RESULT_SIZE,
    persistenceThresholdCeiling: MAX_MCP_RESULT_SIZE,
  })
  assert.equal(getPersistenceThresholdModel(250_000), 50_000)
  assert.equal(
    getPersistenceThresholdModel(250_000, MAX_MCP_RESULT_SIZE),
    250_000,
  )
  assert.equal(
    getPersistenceThresholdModel(750_000, MAX_MCP_RESULT_SIZE),
    MAX_MCP_RESULT_SIZE,
  )
  assert.equal(getPersistenceThresholdModel(Infinity), Infinity)
  for (const invalid of [0, -1, Infinity, NaN, '250000']) {
    assert.deepEqual(resolveMcpResultSize(invalid), {
      maxResultSizeChars: DEFAULT_MCP_RESULT_SIZE,
      persistenceThresholdCeiling: undefined,
    })
  }

  const client = readSource('services/mcp/client.ts')
  const storage = readSource('utils/toolResultStorage.ts')
  const execution = readSource('services/tools/toolExecution.ts')
  assert.match(client, /tool\._meta\?\.\['anthropic\/maxResultSizeChars'\]/)
  assert.match(client, /Math\.min\([\s\S]*?MAX_MCP_RESULT_SIZE_CHARS/)
  assert.match(
    client,
    /persistenceThresholdCeiling: hasRequestedMaxResultSizeChars/,
  )
  assert.match(
    storage,
    /persistenceThresholdCeiling = DEFAULT_MAX_RESULT_SIZE_CHARS/,
  )
  assert.match(
    storage,
    /tool\.persistenceThresholdCeiling/,
  )
  assert.match(execution, /tool\.persistenceThresholdCeiling/)

  const bundle = targetBundle()
  assert.match(
    bundle,
    /_meta\?\.\["anthropic\/maxResultSizeChars"\]/,
  )
  assert.match(
    bundle,
    /maxResultSizeChars:[^,?]+\?Math\.min\([^,]+,[^)]+\):[^,]+\.maxResultSizeChars,persistenceThresholdCeiling:[^,?]+\?[^:]+:void 0/,
  )
})

test('recovers policy replacement of skill shell forms', () => {
  const placeholder = '[shell command execution disabled by policy]'
  assert.equal(
    replaceDisabledShellCommands(
      'before\n```!\necho block\n```\nmiddle !`echo inline` after',
    ),
    `before\n${placeholder}\nmiddle ${placeholder} after`,
  )
  assert.equal(
    replaceDisabledShellCommands('leave foo!`adjacent` and `!!` alone'),
    'leave foo!`adjacent` and `!!` alone',
  )
  assert.equal(
    shouldDisableSkillShellExecution('skills', 'userSettings'),
    true,
  )
  assert.equal(
    shouldDisableSkillShellExecution('commands_DEPRECATED', 'projectSettings'),
    true,
  )
  assert.equal(
    shouldDisableSkillShellExecution('skills', 'policySettings'),
    false,
  )
  assert.equal(shouldDisableSkillShellExecution('mcp', 'mcp'), false)

  const settings = readSource('utils/settings/types.ts')
  const shell = readSource('utils/promptShellExecution.ts')
  const skills = readSource('skills/loadSkillsDir.ts')
  const plugins = readSource('utils/plugins/loadPluginCommands.ts')
  assert.match(settings, /disableSkillShellExecution: z/)
  assert.match(
    shell,
    /getSettingsForSource\('policySettings'\)\?\.disableSkillShellExecution/,
  )
  assert.match(shell, /getSettings_DEPRECATED\(\)\.disableSkillShellExecution/)
  assert.match(shell, /\[shell command execution disabled by policy\]/)
  assert.match(skills, /if \(source === 'policySettings'\) return false/)
  assert.match(skills, /loadedFrom === 'commands_DEPRECATED'/)
  assert.match(
    skills,
    /replaceSkillShellCommandsWithDisabledMessage\(finalContent\)/,
  )
  assert.match(
    plugins,
    /replaceSkillShellCommandsWithDisabledMessage\(finalContent\)/,
  )

  const bundle = targetBundle()
  assert.match(
    bundle,
    /disableSkillShellExecution:[^.]+\.boolean\(\)\.optional\(\)\.describe\("Disable inline shell execution in skills and custom slash commands from user, project, or plugin sources\./,
  )
  assert.match(
    bundle,
    /if\([^)]*\("policySettings"\)\?\.disableSkillShellExecution===!0\)return!0;return [^(]+?\(\)\.disableSkillShellExecution===!0/,
  )
  assert.match(bundle, /\[shell command execution disabled by policy\]/)
  assert.match(
    bundle,
    /if\([^)]*==="policySettings"\)return!1;return [^;]+==="skills"\|\|[^;]+==="commands_DEPRECATED"\|\|[^;]+==="plugin"/,
  )
})

test('recovers multiline deep-link prompts while keeping cwd strict', () => {
  const normalized = 'first\r\nsecond\rthird\tcolumn'.replace(/\r\n?/g, '\n')
  assert.equal(normalized, 'first\nsecond\nthird\tcolumn')
  assert.equal(
    containsControlChars(normalized, { allowNewlineAndTab: true }),
    false,
  )
  assert.equal(containsControlChars(normalized), true)
  assert.equal(
    containsControlChars('first\u000bsecond', {
      allowNewlineAndTab: true,
    }),
    true,
  )
  assert.equal(
    containsControlChars('first\u007fsecond', {
      allowNewlineAndTab: true,
    }),
    true,
  )

  const source = readSource('utils/deepLink/parseDeepLink.ts')
  assert.match(source, /\{ allowNewlineAndTab = false \}/)
  assert.match(
    source,
    /allowNewlineAndTab && \(code === 0x0a \|\| code === 0x09\)/,
  )
  assert.match(source, /\.replace\(\/\\r\\n\?\/g, '\\n'\)/)
  assert.match(
    source,
    /containsControlChars\(query, \{ allowNewlineAndTab: true \}\)/,
  )
  assert.match(source, /cwd && containsControlChars\(cwd\)/)

  const bundle = targetBundle()
  assert.match(bundle, /\{allowNewlineAndTab:[^=]+=!1\}=\{\}/)
  assert.match(
    bundle,
    /if\([^&]+&&\([^=]+===10\|\|[^=]+===9\)\)continue;return!0/,
  )
  assert.equal(bundle.includes('.replace(/\\r\\n?/g,`\n`)'), true)
  assert.match(
    bundle,
    /\{allowNewlineAndTab:!0\}\).*Deep link query contains disallowed control characters/,
  )
})
