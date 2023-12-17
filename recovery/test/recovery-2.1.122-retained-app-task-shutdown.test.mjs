import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = {
  baseline: {
    names: ['CLAUDE_CODE_2_1_121_BUNDLE', 'CLAUDE_2_1_121_CLI_INNER'],
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  target: {
    names: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
}

function loadBundle({ names, bytes, sha256 }) {
  const filename = names.map(name => process.env[name]).find(Boolean)
  assert.ok(filename, `${names.join(' or ')} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, bytes)
  assert.equal(crypto.createHash('sha256').update(value).digest('hex'), sha256)
  return value.toString('utf8')
}

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

function compact(value) {
  return value.replaceAll(/\s+/g, ' ').trim()
}

const taskCleanupPattern =
  /function ([\w$]+)\(([\w$]+)\)\{for\(let ([\w$]+) of Object\.values\(\2\)\)\{if\(\3\.status!=="running"\)continue;try\{if\(([\w$]+)\(\3\)\)\3\.shellCommand\?\.kill\(\),\3\.shellCommand\?\.cleanup\(\);else if\("abortController"in \3\)\3\.abortController\?\.abort\(\);([\w$]+)\(\3\.id,"stopped",\{toolUseId:\3\.toolUseId,summary:\3\.description\}\),([\w$]+)\(\3\.id\)\}catch\(([\w$]+)\)\{([\w$]+)\(\7\)\}\}\}/g

const appRegistrationPattern =
  /([\w$]+)=\(\)=>\{let ([\w$]+)=([\w$]+)\([^;]{0,300}\);return ([\w$]+)\(\(\)=>([\w$]+)\(\2\.getState\(\)\.tasks\)\),\2\}/g

test('authenticated adjacent releases retain AppState shutdown task cleanup', () => {
  for (const [name, release] of Object.entries(releases)) {
    const bundle = loadBundle(release)
    const taskCleanupMatches = [...bundle.matchAll(taskCleanupPattern)]
    const appRegistrationMatches = [...bundle.matchAll(appRegistrationPattern)]

    assert.equal(taskCleanupMatches.length, 1, `${name}: exact task cleanup helper`)
    assert.equal(
      appRegistrationMatches.length,
      1,
      `${name}: exact AppState cleanup registration`,
    )
    assert.equal(
      appRegistrationMatches[0][5],
      taskCleanupMatches[0][1],
      `${name}: AppState registers the authenticated task cleanup helper`,
    )
  }
})

test('source restores fail-soft running-task cleanup and AppState registration', () => {
  const cleanup = compact(source('src/tasks/cleanup.ts'))
  const appState = compact(source('src/state/AppState.tsx'))
  const registry = compact(source('src/utils/cleanupRegistry.ts'))

  assert.match(
    cleanup,
    /for \(const task of Object\.values\(tasks\)\) \{ if \(task\.status !== 'running'\) continue try \{ if \(isLocalShellTask\(task\)\) \{ task\.shellCommand\?\.kill\(\) task\.shellCommand\?\.cleanup\(\) \} else if \('abortController' in task\) \{ task\.abortController\?\.abort\(\) \} emitTaskTerminatedSdk\(task\.id, 'stopped', \{ toolUseId: task\.toolUseId, summary: task\.description, \}\) void evictTaskOutput\(task\.id\) \} catch \(error\) \{ logError\(error\) \} \}/,
  )
  assert.ok(
    appState.includes(
      'registerCleanup(() => { killAllRunningTasks(store.getState().tasks); });',
    ),
  )
  assert.ok(registry.includes('type CleanupFunction = () => void | Promise<void>'))
  assert.ok(registry.includes('new Set<CleanupFunction>()'))
})
