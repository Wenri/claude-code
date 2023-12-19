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
    onReplyError: 0,
    replyError: 0,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    onReplyError: 2,
    replyError: 2,
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

test('authenticates the target-only FleetView reply-error surface', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const identifier of ['onReplyError', 'replyError']) {
      assert.equal(
        occurrences(bundle, identifier),
        release[identifier],
        `${release.version}: ${identifier}`,
      )
    }
  }
})

test('guards reply submission and restores both returned and thrown failures', () => {
  const fleet = compact(source('src/components/FleetView.tsx'))
  for (const fragment of [
    'const inFlight = useRef(false)',
    'if (inFlight.current) return',
    "if (!body && modeRef.current === 'prompt') { inFlight.current = true onAttach() return }",
    "if (event.name === 'right' && !event.shift && !queryRef.current) { event.preventDefault() if (!inFlight.current) { inFlight.current = true onAttach() } return }",
    "const restore = (): void => { if (queryRef.current === '') { replyDrafts.set(job.id, outgoing) setQuery(body) } if (modeRef.current === 'prompt') setMode(previousMode) }",
    'result => { if (result) { restore() onReplyError(result) } }',
    'caught => { restore() onReplyError(errorMessage(caught)) }',
    '.finally(() => { inFlight.current = false',
  ]) {
    assert.ok(fleet.includes(compact(fragment)), fragment)
  }
  assert.equal(occurrences(fleet, 'restore()'), 2)
})

test('tracks live reply text and mode so restoration never overwrites edits', () => {
  const fleet = compact(source('src/components/FleetView.tsx'))
  for (const fragment of [
    'const modeRef = useRef(mode)',
    "const setMode = (next: 'prompt' | 'bash'): void => { modeRef.current = next setModeState(next) }",
    'queryRef, setQuery, cursorOffset, setCursorOffset, handleKeyDown: handleReplyKeyDown, handlePaste, } = useSearchInput({',
    "const value = mode === 'bash' ? `!${query}` : query",
    "if (queryRef.current === '') { replyDrafts.set(job.id, outgoing) setQuery(body) }",
  ]) {
    assert.ok(fleet.includes(compact(fragment)), fragment)
  }
})
