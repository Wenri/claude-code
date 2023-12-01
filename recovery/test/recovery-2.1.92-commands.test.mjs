import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url))
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_91_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_92_BUNDLE

function readSource(relativePath) {
  const source = fs.readFileSync(`${sourceRoot}${relativePath}`, 'utf8')
  const sourceMap = source.indexOf('//# sourceMappingURL=')
  return sourceMap === -1 ? source : source.slice(0, sourceMap)
}

function requiredBundle(filename, label) {
  assert.ok(filename, `${label} environment variable must be set`)
  return fs.readFileSync(filename, 'utf8')
}

test('removes tag and vim from the built-in command registry', () => {
  const commands = readSource('commands.ts')
  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_91_BUNDLE',
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_92_BUNDLE',
  )

  assert.doesNotMatch(commands, /commands\/tag\/index/)
  assert.doesNotMatch(commands, /commands\/vim\/index/)
  assert.doesNotMatch(commands, /^\s+(tag|vim),/m)
  assert.equal(baseline.includes('name:"tag"'), true)
  assert.equal(baseline.includes('name:"vim"'), true)
  assert.equal(target.includes('name:"tag"'), false)
  assert.equal(target.includes('name:"vim"'), false)

  // The source directories remain as historical recovery evidence; only their
  // command registrations disappeared from the published target bundle.
  assert.equal(fs.existsSync(`${sourceRoot}commands/tag/index.ts`), true)
  assert.equal(fs.existsSync(`${sourceRoot}commands/vim/index.ts`), true)
})

test('turns release notes into an interactive version picker', () => {
  const index = readSource('commands/release-notes/index.ts')
  const implementation = readSource(
    'commands/release-notes/release-notes.tsx',
  )
  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_91_BUNDLE',
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_92_BUNDLE',
  )

  assert.match(index, /type: 'local-jsx'/)
  assert.doesNotMatch(index, /supportsNonInteractive/)
  assert.match(implementation, /const SHOW_ALL_VALUE = '__show_all__'/)
  assert.match(implementation, /label: 'Show all'/)
  assert.match(
    implementation,
    /description: `\$\{notes\.length\} versions`/,
  )
  assert.match(implementation, /Select a version to view its notes\./)
  assert.match(implementation, /visibleOptionCount=\{10\}/)
  assert.match(
    implementation,
    /notes\.length === 1 \? 'item' : 'items'/,
  )
  assert.match(
    implementation,
    /onDone\(formatAllReleaseNotes\(notes\), \{ display: 'system' \}\)/,
  )
  assert.match(
    implementation,
    /onDone\(undefined, \{ display: 'skip' \}\)/,
  )

  assert.equal(baseline.includes('Select a version to view its notes.'), false)
  assert.equal(target.includes('Select a version to view its notes.'), true)
  assert.equal(target.includes('label:"Show all"'), true)
  assert.equal(target.includes('visibleOptionCount:10'), true)
  assert.match(
    target,
    /description:"View release notes",name:"release-notes",type:"local-jsx"/,
  )
})
