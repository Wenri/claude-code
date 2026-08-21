import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const releases = [
  ['2.1.121', process.env.CLAUDE_CODE_2_1_121_BUNDLE],
  ['2.1.122', process.env.CLAUDE_CODE_2_1_122_BUNDLE],
]

function occurrences(text, needle) {
  return text.split(needle).length - 1
}

function source(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8').replace(
    /\s+/g,
    ' ',
  )
}

test('authenticates retained session environment and tmux facade callgraph', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')

    assert.equal(occurrences(bundle, 'sessionEnvVars'), 34, version)
    assert.equal(occurrences(bundle, 'tmuxSocket'), 20, version)
    assert.equal(occurrences(bundle, 'getTmuxEnv'), 1, version)
    assert.match(
      bundle,
      /getEnvironmentOverrides\([^)]*\)\{[\s\S]{0,240}?\?\.getTmuxEnv\(\)\?\?null[\s\S]{0,160}?\.TMUX=/,
      `${version}: bash provider consumes the injected tmux facade`,
    )
    assert.match(
      bundle,
      /sessionEnvVars:[A-Za-z_$][\w$]*\.sessionEnvVars,tmuxSocket:[A-Za-z_$][\w$]*\.tmuxSocket/,
      `${version}: subagent context inherits both shell surfaces`,
    )
    assert.match(
      bundle,
      /sessionEnvVars:[A-Za-z_$][\w$]*\.sessionEnvVars,tmuxSocket:[A-Za-z_$][\w$]*\.tmuxSocket[\s\S]{0,80}?\}\)/,
      `${version}: Bash threads both surfaces into Shell exec`,
    )
    assert.match(
      bundle,
      /sessionEnvVars:[A-Za-z_$][\w$]*\.sessionEnvVars\}\)/,
      `${version}: PowerShell threads the session environment`,
    )
  }
})

test('source reconstructs root, subagent, tool, and provider propagation', () => {
  const tool = source('src/Tool.ts')
  const queryEngine = source('src/QueryEngine.ts')
  const repl = source('src/screens/REPL.tsx')
  const forked = source('src/utils/forkedAgent.ts')
  const shell = source('src/utils/Shell.ts')
  const bashProvider = source('src/utils/shell/bashProvider.ts')
  const powershellProvider = source('src/utils/shell/powershellProvider.ts')
  const bash = source('src/tools/BashTool/BashTool.tsx')
  const powershell = source('src/tools/PowerShellTool/PowerShellTool.tsx')
  const monitor = source('src/tools/MonitorTool/MonitorTool.tsx')
  const completion = source('src/utils/bash/shellCompletion.ts')

  assert.ok(tool.includes('sessionEnvVars?: ReadonlyMap<string, string>'))
  assert.ok(tool.includes('tmuxSocket?: { getTmuxEnv(): string | null }'))
  for (const root of [queryEngine, repl]) {
    assert.ok(root.includes('sessionEnvVars:'))
    assert.ok(root.includes('tmuxSocket:'))
  }
  assert.ok(queryEngine.includes('config.sessionEnvVars ?? getSessionEnvVars()'))
  assert.ok(queryEngine.includes('config.tmuxSocket ?? DEFAULT_TMUX_SOCKET'))
  assert.ok(forked.includes('sessionEnvVars: parentContext.sessionEnvVars'))
  assert.ok(forked.includes('tmuxSocket: parentContext.tmuxSocket'))
  assert.ok(
    shell.includes(
      'provider.getEnvironmentOverrides( command, sessionEnvVars, tmuxSocket, )',
    ),
  )
  assert.ok(bashProvider.includes('tmuxSocket?.getTmuxEnv() ?? null'))
  assert.ok(bashProvider.includes('for (const [key, value] of sessionEnvVars ?? [])'))
  assert.ok(powershellProvider.includes('for (const [key, value] of sessionEnvVars ?? [])'))
  for (const consumer of [bash, monitor]) {
    assert.ok(consumer.includes('sessionEnvVars:'))
    assert.ok(consumer.includes('tmuxSocket:'))
  }
  assert.ok(powershell.includes('sessionEnvVars: toolUseContext.sessionEnvVars'))
  assert.ok(completion.includes('sessionEnvVars,'))
})
