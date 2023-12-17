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
    currentSessionAiTitle: 0,
    aiTitles: 0,
    getCurrentSessionAiTitle: 0,
    cacheAiTitle: 0,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    currentSessionAiTitle: 9,
    aiTitles: 5,
    getCurrentSessionAiTitle: 1,
    cacheAiTitle: 1,
  },
]

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

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

test('authenticates every target-only AI-title cache identifier count', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const identifier of [
      'currentSessionAiTitle',
      'aiTitles',
      'getCurrentSessionAiTitle',
      'cacheAiTitle',
    ]) {
      assert.equal(
        occurrences(bundle, identifier),
        release[identifier],
        `${release.version}: ${identifier}`,
      )
    }
  }
})

test('caches, refreshes, re-appends, restores, and clears AI titles', () => {
  const storage = compact(source('src/utils/sessionStorage.ts'))
  assert.equal(occurrences(storage, 'currentSessionAiTitle'), 9)
  assert.equal(occurrences(storage, 'sessionTitleChanged.emit()'), 4)
  for (const fragment of [
    'const sessionTitleChanged = createSignal()',
    'export const subscribeSessionTitleChanged = sessionTitleChanged.subscribe',
    'currentSessionAiTitle: string | undefined',
    `const aiTitleLine = tailLines.findLast(l => l.startsWith('{"type":"ai-title"')`,
    "this.currentSessionAiTitle = tailAiTitle || undefined",
    "type: 'ai-title', aiTitle: this.currentSessionAiTitle, sessionId",
    'getProject().currentSessionAiTitle = aiTitle sessionTitleChanged.emit()',
    'export function getCurrentSessionAiTitle(',
    'if (meta.aiTitle) project.currentSessionAiTitle ??= meta.aiTitle',
    'project.currentSessionAiTitle = undefined',
    'export function cacheAiTitle(aiTitle: string): void',
    'getProject().currentSessionTitle = customTitle sessionTitleChanged.emit()',
  ]) {
    assert.ok(storage.includes(compact(fragment)), fragment)
  }
})

test('keeps persisted AI titles distinct through full, lite, and resume loads', () => {
  const logs = source('src/types/logs.ts')
  assert.ok(logs.includes('aiTitle?: string'))

  const storage = compact(source('src/utils/sessionStorage.ts'))
  assert.equal(occurrences(storage, 'aiTitles,'), 5)
  for (const fragment of [
    'const aiTitles = new Map<UUID, string>()',
    "entry.type === 'ai-title' && entry.sessionId",
    'aiTitles.set(entry.sessionId, entry.aiTitle)',
    'aiTitle: aiTitles.get(sessionId)',
    'aiTitle: sessionId ? aiTitles.get(sessionId) : log.aiTitle',
    "const aiTitle = extractLastJsonStringField(tail, 'aiTitle') ?? extractLastJsonStringField(head, 'aiTitle')",
    'aiTitle: meta.aiTitle',
    '!enriched.firstPrompt && !enriched.customTitle && !enriched.aiTitle',
    '(log.customTitle ?? log.aiTitle)?.toLowerCase().trim()',
  ]) {
    assert.ok(storage.includes(compact(fragment)), fragment)
  }

  const recovery = compact(source('src/utils/conversationRecovery.ts'))
  assert.ok(recovery.includes('aiTitle?: string'))
  assert.ok(recovery.includes('aiTitle: log?.aiTitle'))
  assert.ok(source('src/utils/sessionRestore.ts').includes('aiTitle?: string'))
})

test('uses custom-title precedence at every direct cache consumer', () => {
  const expected = {
    'src/components/Settings/Status.tsx':
      'customTitle ?? getCurrentSessionAiTitle(sessionId)',
    'src/components/StatusLine.tsx':
      'getCurrentSessionTitle(sessionId) ?? getCurrentSessionAiTitle(sessionId)',
    'src/cli/bg.ts': "name: customTitle ?? aiTitle, nameSource: customTitle ? 'user' : aiTitle ? 'auto' : undefined",
    'src/bridge/initReplBridge.ts':
      'if (customTitle) { title = customTitle hasTitle = true hasExplicitTitle = true } else if (aiTitle) { title = aiTitle hasTitle = true }',
    'src/screens/REPL.tsx':
      "const terminalTitle = sessionTitle ?? aiTitle ?? agentTitle ?? haikuTitle ?? 'Claude Code'",
    'src/jobs/classifier.ts': 'cacheAiTitle(candidate)',
    'src/utils/log.ts': 'log.customTitle || log.aiTitle || log.summary',
    'src/components/LogSelector.tsx':
      '[log.customTitle, log.aiTitle, log.summary',
    'src/hooks/useTypeahead.tsx':
      'displayText: (log.customTitle ?? log.aiTitle)!',
  }
  for (const [filename, fragment] of Object.entries(expected)) {
    assert.ok(compact(source(filename)).includes(compact(fragment)), filename)
  }

  const repl = compact(source('src/screens/REPL.tsx'))
  assert.equal(occurrences(repl, 'React.useSyncExternalStore(subscribeSessionTitleChanged'), 2)
})
