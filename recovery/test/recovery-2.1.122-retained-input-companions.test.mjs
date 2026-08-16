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

function count(value, fragment) {
  return value.split(fragment).length - 1
}

test('authenticated adjacent releases retain input lifecycle companions', () => {
  for (const [name, release] of Object.entries(releases)) {
    const bundle = loadBundle(release)
    assert.equal(
      count(
        bundle,
        'key:"kill-paste-hint",text:"Ctrl+Y to paste deleted text",priority:"immediate",timeoutMs:5000',
      ),
      1,
      `${name}: long Ctrl+U kill hint`,
    )
    assert.equal(count(bundle, 'killRing'), 2, `${name}: two override consumers`)
    assert.match(
      bundle,
      /TemporaryItems[\s\S]{0,3000}Promise\.all\([\s\S]{0,1000}\.then\(\([^)]*\)=>\{if\(![\w$]+\.current\)return/,
      `${name}: image-path paste abandons work after unmount`,
    )
    assert.match(
      bundle,
      /if\([\w$]+\)[\w$]+=!1,[\w$]+=[\w$]+\.fromText\("",[\w$]+,0\)/,
      `${name}: successful submit clears the local cursor snapshot`,
    )
    assert.equal(
      count(
        bundle,
        'insert","clear","enter","center","undefined","mouse","f1',
      ),
      2,
      `${name}: text and lazy-space ignored-key sets`,
    )
  }
})

test('source restores per-app kill state and exact input lifecycle handling', () => {
  const app = source('src/components/App.tsx')
  const killRing = source('src/context/killRing.tsx')
  const textInput = source('src/hooks/useTextInput.ts')
  const searchInput = source('src/hooks/useSearchInput.ts')
  const paste = source('src/hooks/usePasteHandler.ts')
  const promptUtils = source('src/components/PromptInput/utils.ts')

  assert.match(
    app,
    /<KillRingProvider><SelectionDeleteProvider>\{children\}<\/SelectionDeleteProvider><\/KillRingProvider>/,
  )
  for (const witness of [
    "case 'kill'",
    "case 'yank'",
    "case 'yankPop'",
    "case 'updateYankLength'",
    "case 'interrupt'",
    'export function createKillRingStore()',
    'export function KillRingProvider',
    'export function useKillRing()',
  ]) {
    assert.ok(killRing.includes(witness), witness)
  }

  assert.match(
    textInput,
    /killed\.length >= 3[\s\S]*key: 'kill-paste-hint'[\s\S]*text: 'Ctrl\+Y to paste deleted text'[\s\S]*timeoutMs: 5000/,
  )
  assert.ok(textInput.includes('const killRing = killRingOverride ?? defaultKillRing'))
  assert.ok(searchInput.includes('const killRing = killRingOverride ?? defaultKillRing'))
  assert.ok(textInput.includes("killRing.dispatch({ type: 'interrupt' })"))
  assert.ok(searchInput.includes("killRing.dispatch({ type: 'interrupt' })"))
  assert.match(
    textInput,
    /if \(submitted\) \{[\s\S]*submitted = false[\s\S]*cursor = Cursor\.fromText\('', columns, 0\)/,
  )

  assert.match(
    paste,
    /Promise\.all\([\s\S]*\.then\(results => \{\s*if \(!isMountedRef\.current\) return/,
  )
  assert.ok(promptUtils.includes('NON_PRINTABLE_INPUT_KEYS.has(input)'))
  assert.doesNotMatch(promptUtils, /input\.startsWith\('\\x1b'\)/)
})
