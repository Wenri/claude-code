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
    count: 0,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    count: 2,
  },
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

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

test('authenticates target-only live background resume rejection', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      occurrences(bundle, ' is currently running as a background agent ('),
      release.count,
      `${release.version}: live background copy`,
    )
    assert.equal(
      occurrences(
        bundle,
        'Use \\`claude agents\\` to find and attach to it, or add --fork-session to branch off a copy.',
      ),
      release.count,
      `${release.version}: recovery guidance`,
    )
  }

  const target = readBundle(releases[1])
  assert.match(
    target,
    /async function [A-Za-z_$][\w$]*\(H\)\{let \$=await Promise\.resolve\(\)\.then\(\(\) => \([\s\S]{0,80}listAllLiveSessions\(\)\)\.catch\(\(\)=>\[\]\);for\(let [A-Za-z_$][\w$]* of \$\)if\([A-Za-z_$][\w$]*\.sessionId===H&&[A-Za-z_$][\w$]*\.kind&&[A-Za-z_$][\w$]*\.kind!=="interactive"\)return\{kind:[A-Za-z_$][\w$]*\.kind\};return null\}/,
  )
})

test('source rejects explicit non-fork resume before transcript loading', () => {
  const recovery = compact(
    fs.readFileSync(
      path.join(repo, 'src/utils/conversationRecovery.ts'),
      'utf8',
    ),
  )
  for (const fragment of [
    'export async function findLiveNonInteractiveSession(',
    "const sessions = await import('./udsClient.js') .then(module => module.listAllLiveSessions()) .catch(() => [])",
    "session.sessionId === sessionId && session.kind && session.kind !== 'interactive'",
    'return { kind: session.kind }',
  ]) {
    assert.ok(recovery.includes(compact(fragment)), fragment)
  }

  const exactCopy =
    'is currently running as a background agent (${liveSession.kind}). Use \\`claude agents\\` to find and attach to it, or add --fork-session to branch off a copy.'

  const print = fs.readFileSync(path.join(repo, 'src/cli/print.ts'), 'utf8')
  const printGuard = print.indexOf(
    'const liveSession = await findLiveNonInteractiveSession(',
  )
  const printLoad = print.indexOf(
    '// Load the conversation with the specified session ID',
    printGuard,
  )
  assert.ok(printGuard >= 0 && printGuard < printLoad)
  assert.ok(print.includes(exactCopy))
  assert.ok(
    print
      .slice(Math.max(0, printGuard - 100), printLoad)
      .includes('if (!options.forkSession)'),
  )
  assert.ok(print.slice(printGuard, printLoad).includes('gracefulShutdownSync(1)'))

  const main = fs.readFileSync(path.join(repo, 'src/main.tsx'), 'utf8')
  const mainGuard = main.indexOf(
    'const liveSession = await findLiveNonInteractiveSession(sessionId)',
  )
  const mainLoad = main.indexOf(
    'const result = await loadConversationForResume(matchedLog ?? sessionId',
    mainGuard,
  )
  assert.ok(mainGuard >= 0 && mainGuard < mainLoad)
  assert.ok(main.includes(exactCopy))
  assert.ok(
    main
      .slice(Math.max(0, mainGuard - 100), mainLoad)
      .includes('if (!options.forkSession)'),
  )
})
