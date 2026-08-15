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

const filenameGuidance =
  "Use a 3-4 word filename that describes what the memory is about (e.g., `prefers-bun-over-npm.md`, `compliance-driven-rewrite.md`). Don't prefix the filename with the memory type"
const recalledGuidance =
  'Tool results may include additional `<system-reminder>` blocks containing context automatically recalled from your persistent memory system based on the current conversation. Treat these as background information surfaced for you'
const granularityGuidance =
  "Each memory file should contain one paragraph about a single fact that you'd like to remember for future sessions. If you wish to record multiple facts, save these into separate memory files."
const singleIndexGuidance =
  'indexes both private and team memories \\u2014 use a path like'

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

test('authenticated adjacent bundles retain tiny-memory builders and routing', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const gate = bundle.match(
      /function ([\w$]+)\(\)\{return [\w$]+\("tengu_billiard_aviary",!1\)\}/,
    )
    assert.ok(gate, `${release.version}: tiny-memory gate`)
    const gateName = gate[1]
    assert.ok(
      bundle.includes(`if($&&${gateName}()){`),
      `${release.version}: tiny-memory load branch`,
    )
    assert.ok(
      bundle.includes(`if(${gateName}())return!1`),
      `${release.version}: static/dynamic split rejection`,
    )
    for (const fragment of [
      filenameGuidance,
      recalledGuidance,
      granularityGuidance,
      singleIndexGuidance,
      'Memory files should be treated as immutable.',
      'type: {{${',
    ]) {
      assert.ok(bundle.includes(fragment), `${release.version}: ${fragment}`)
    }
    assert.ok(
      /let [\w$]+=[\w$]+\([\w$]+,[\w$]+,[\w$]+,!1,!0\);if\([\w$]+\.trim\(\)\)/.test(
        bundle,
      ),
      `${release.version}: agent memory forces full type taxonomy`,
    )
    assert.ok(
      !bundle.includes('proceed as if MEMORY.md were empty.'),
      `${release.version}: exact ignore-memory copy`,
    )
  }
})

test('source reconstructs tiny-memory prompts and retained normal builder details', () => {
  const memdir = fs.readFileSync(path.join(repo, 'src/memdir/memdir.ts'), 'utf8')
  const prompts = fs.readFileSync(
    path.join(repo, 'src/memdir/tinyMemoryPrompts.ts'),
    'utf8',
  )
  const types = fs.readFileSync(
    path.join(repo, 'src/memdir/memoryTypes.ts'),
    'utf8',
  )
  const team = fs.readFileSync(
    path.join(repo, 'src/memdir/teamMemPrompts.ts'),
    'utf8',
  )

  for (const fragment of [
    filenameGuidance,
    recalledGuidance,
    granularityGuidance,
    'Memory files should be treated as immutable.',
    'TINY_MEMORY_TYPES =',
    'TINY_TYPES_SECTION_INDIVIDUAL',
    'TINY_TYPES_SECTION_COMBINED',
    'superceded by the memory you have saved',
  ]) {
    assert.ok(prompts.includes(fragment), fragment)
  }
  assert.ok(memdir.includes('autoEnabled && isTinyMemoryEnabled()'))
  assert.ok(memdir.includes('buildTinyCombinedMemoryPrompt('))
  assert.ok(memdir.includes('buildTinyMemoryLines('))
  assert.ok(memdir.includes('if (isTinyMemoryEnabled()) return false'))
  assert.match(
    memdir.replaceAll(/\s+/g, ' '),
    /buildMemoryLines\( displayName, memoryDir, extraGuidelines, false, true, \)/,
  )
  assert.ok(team.includes('indexes both private and team memories'))
  assert.ok(team.includes('team/file.md'))
  assert.ok(team.includes('keep the index concise'))
  assert.ok(
    types.includes(
      'If the user says to *ignore* or *not use* memory: Do not apply remembered facts',
    ),
  )
  for (const source of [types, team, prompts]) {
    assert.ok(!source.includes('proceed as if MEMORY.md were empty.'))
  }
})
