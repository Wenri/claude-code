import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = [
  {
    version: '2.1.121',
    env: 'CLAUDE_CODE_2_1_121_BUNDLE',
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
]

const names = [
  'PERMISSION_DECISION_REASON_TYPES',
  'logEventTo1PAsync',
  'getUserAttributes',
  'ChordInterceptor',
  'collectReplIds',
  'parseElicitationHookOutput',
  'getPluginHookCounts',
  'executeHooksOutsideREPL',
  'executeHooks',
  'SESSION_END_HOOK_TIMEOUT_MS_DEFAULT',
  'parsePrIdentifier',
  'loadInitialMessages',
  'tailLog',
]

function readBundle(release) {
  const filename = process.env[release.env]
  assert.ok(filename, `${release.env} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return bytes.toString('utf8')
}

function readSource(filename) {
  return fs.readFileSync(path.join(repo, filename), 'utf8')
}

test('authenticated adjacent bundles retain every live named export', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const name of names) {
      const matches = [
        ...bundle.matchAll(
          new RegExp(`${name}:\\(\\)=>([A-Za-z_$][\\w$]*)`, 'g'),
        ),
      ]
      assert.equal(matches.length, 1, `${release.version}: ${name} export`)
    }
  }
})

test('source exposes the retained definitions without changing live callers', () => {
  const controlSchemas = readSource('src/entrypoints/sdk/controlSchemas.ts')
  assert.match(
    controlSchemas,
    /export const PERMISSION_DECISION_REASON_TYPES = \[/,
  )
  assert.match(controlSchemas, /\.enum\(PERMISSION_DECISION_REASON_TYPES\)/)

  const firstParty = readSource(
    'src/services/analytics/firstPartyEventLogger.ts',
  )
  assert.match(firstParty, /export async function logEventTo1PAsync\(/)
  assert.equal((firstParty.match(/logEventTo1PAsync\(/g) ?? []).length, 3)

  const growthbook = readSource('src/services/analytics/growthbook.ts')
  assert.match(growthbook, /export function getUserAttributes\(/)
  assert.equal((growthbook.match(/getUserAttributes\(/g) ?? []).length, 3)

  const keybindings = readSource('src/keybindings/KeybindingProviderSetup.tsx')
  assert.match(keybindings, /export function ChordInterceptor\(/)
  assert.match(keybindings, /<ChordInterceptor[\s\S]*?<\/ChordInterceptor>/)

  const sessionStorage = readSource('src/utils/sessionStorage.ts')
  assert.match(sessionStorage, /export function collectReplIds\(/)
  assert.equal((sessionStorage.match(/collectReplIds\(/g) ?? []).length, 2)

  const hooks = readSource('src/utils/hooks.ts')
  assert.match(
    hooks,
    /export const SESSION_END_HOOK_TIMEOUT_MS_DEFAULT = 1500/,
  )
  assert.match(hooks, /export function getPluginHookCounts\(/)
  assert.match(hooks, /export async function\* executeHooks\(/)
  assert.match(hooks, /export async function executeHooksOutsideREPL\(/)
  assert.match(hooks, /export function parseElicitationHookOutput\(/)

  const resume = readSource('src/screens/ResumeConversation.tsx')
  assert.match(resume, /export function parsePrIdentifier\(/)
  assert.equal((resume.match(/parsePrIdentifier\(/g) ?? []).length, 2)

  const print = readSource('src/cli/print.ts')
  assert.match(print, /export async function loadInitialMessages\(/)
  assert.match(print, /await loadInitialMessages\(/)

  const daemon = readSource('src/daemon/main.ts')
  assert.match(daemon, /export async function tailLog\(/)
  assert.match(daemon, /await tailLog\(parsed\.logPath\)/)
})
