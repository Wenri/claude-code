import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const releases = [
  ['2.1.121', process.env.CLAUDE_CODE_2_1_121_BUNDLE],
  ['2.1.122', process.env.CLAUDE_CODE_2_1_122_BUNDLE],
]

test('authenticates retained agent-name cache and subscription behavior', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')

    assert.equal(
      bundle.split('cacheAgentName').length - 1,
      1,
      `${version}: retained cache export`,
    )
    assert.equal(
      bundle.split('subscribeSessionAgentNameChanged').length - 1,
      1,
      `${version}: retained subscription export`,
    )
    assert.match(
      bundle,
      /function [\w$]+\([\w$]+\)\{[\w$]+\(\)\.currentSessionAgentName=[\w$]+,[\w$]+\.emit\(\)\}/,
      `${version}: cache updates state and emits`,
    )
    assert.match(
      bundle,
      /\.name\?\.trim\(\);if\([\w$]+\)[\w$]+\([\w$]+\),[\w$]+\([\w$]+\)/,
      `${version}: --name populates both title and agent-name caches`,
    )
    assert.match(
      bundle,
      /standaloneAgentContext\?\.name===[\w$]+[\s\S]{0,180}standaloneAgentContext:\{\.\.\.[\w$]+\.standaloneAgentContext,name:[\w$]+\}/,
      `${version}: REPL subscriber updates standalone-agent context`,
    )
  }
})

test('source wires cache, signal emission, startup, and REPL consumer', () => {
  const storage = readFileSync(
    new URL('../../src/utils/sessionStorage.ts', import.meta.url),
    'utf8',
  )
  const main = readFileSync(new URL('../../src/main.tsx', import.meta.url), 'utf8')
  const repl = readFileSync(
    new URL('../../src/screens/REPL.tsx', import.meta.url),
    'utf8',
  )

  assert.match(
    storage,
    /export const subscribeSessionAgentNameChanged =[\s\S]*?sessionAgentNameChanged\.subscribe/,
  )
  assert.match(
    storage,
    /export function cacheAgentName[\s\S]*?currentSessionAgentName = agentName[\s\S]*?sessionAgentNameChanged\.emit\(\)/,
  )
  assert.match(
    storage,
    /export async function saveAgentName[\s\S]*?updateSessionName\(agentName\)[\s\S]*?sessionAgentNameChanged\.emit\(\)/,
  )
  assert.match(
    main,
    /if \(sessionNameArg\) \{\s*cacheSessionTitle\(sessionNameArg\);\s*cacheAgentName\(sessionNameArg\);/,
  )
  assert.match(
    repl,
    /subscribeSessionAgentNameChanged\(\(\) => \{[\s\S]*?getCurrentSessionAgentName\(\)[\s\S]*?standaloneAgentContext:[\s\S]*?name: agentName/,
  )
})
