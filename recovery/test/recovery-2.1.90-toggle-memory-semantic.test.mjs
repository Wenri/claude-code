import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.89-to-2.1.90'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_90_BUNDLE
const targetSha256 =
  '069185909d50518b8b239acc0f9ae9b062a610595299b35955fc53e6e2c2f5e9'
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

const pins = new Map([
  [358, ['unresolved', 23567, 29857, '20f24e2937a369c278bd2e2bf494013d3f72fd1483a352db9c4ffa744848de60']],
  [361, ['unresolved', 29925, 32392, '44d3dde421f459e00c55314525780d5c867d992a9fde3cb105bce6f0ab1f5327']],
  [468, ['unresolved', 38958, 38999, '5e3f7dd18f3e4e29d57f9e54004a99eabc0e2c5d64090f13122abe71f6643693']],
  [469, ['unresolved', 38999, 39037, 'a0f53658544de9ee4eda0bbe403709308968ffccc45f72e26de836854177b835']],
  [12097, ['unresolved', 9424691, 9425447, '532f84c6c99434ea08edc12c3bb4586521b2e684b2921c2f354b97453ea5966b']],
  [13623, ['unresolved', 10094667, 10095065, 'd1371fc924e9b68dd3e937a57f2d34c7ecd0fdd525ea4a97ba5e795608064238']],
  [15730, ['unresolved', 11423118, 11424147, 'dee2a65f6f80f0231fb6f357fa91bb31d566f156ee5901ccf18390ec5874405d']],
  [15731, ['unresolved', 11424147, 11426132, '824cae6ae17cdd9516d6b8f8ab495971da71bdce98e1011106733d8085206c67']],
])

test('2.1.90 pins the complete reachable toggle-memory state and permission graph', {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_90_BUNDLE is not set'
      : false,
}, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), targetSha256)
  const bundle = bytes.toString('utf8')
  for (const [index, [classification, start, end, sourceHash]] of pins) {
    const region = structural.regions[index]
    assert.equal(region.classification, classification, `${index}: class`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: identity`,
    )
    assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
  }
  for (const fragment of [
    'memoryToggledOff:!1',
    'return G8.memoryToggledOff',
    'G8.memoryToggledOff=q',
    'tengu_memory_toggled',
    'Automemory disabled for this session · this conversation will not write or read new memories',
    'Memory is toggled off. Run /toggle-memory to re-enable automemory.',
    'Cannot write to memory while it is toggled off.',
    'Cannot read memory while it is toggled off.',
    'memory access blocked by /toggle-memory',
  ]) assert.ok(bundle.includes(fragment), fragment)
})

test('materialized target90 source owns state, command, extraction, and filesystem guards', {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}, () => {
  const state = fs.readFileSync(path.join(sourceRoot, 'bootstrap/state.ts'), 'utf8')
  for (const fragment of [
    'memoryToggledOff: boolean',
    'memoryToggledOff: false',
    'return STATE.memoryToggledOff',
    'STATE.memoryToggledOff = value',
  ]) assert.ok(state.includes(fragment), fragment)

  const command = fs.readFileSync(
    path.join(sourceRoot, 'commands/toggle-memory.ts'),
    'utf8',
  )
  for (const fragment of [
    'const toggledOff = !getMemoryToggledOff()',
    "logEvent('tengu_memory_toggled', { toggled_off: toggledOff })",
    'Automemory disabled for this session · this conversation will not write or read new memories',
    "name: 'toggle-memory'",
    'isEnabled: () => false',
  ]) assert.ok(command.includes(fragment), fragment)

  const extract = fs.readFileSync(
    path.join(sourceRoot, 'services/extractMemories/extractMemories.ts'),
    'utf8',
  )
  assert.ok(extract.includes('if (getMemoryToggledOff())'))
  assert.ok(
    extract.includes(
      'Memory is toggled off. Run /toggle-memory to re-enable automemory.',
    ),
  )

  const filesystem = fs.readFileSync(
    path.join(sourceRoot, 'utils/permissions/filesystem.ts'),
    'utf8',
  )
  for (const fragment of [
    'isAutoMemPath(normalizedPath) && getMemoryToggledOff()',
    'Cannot write to memory while it is toggled off.',
    'Cannot read memory while it is toggled off.',
    "reason: 'memory access blocked by /toggle-memory'",
  ]) assert.ok(filesystem.includes(fragment), fragment)

  const commands = fs.readFileSync(path.join(sourceRoot, 'commands.ts'), 'utf8')
  assert.ok(commands.includes("import toggleMemory from './commands/toggle-memory.js'"))
  assert.match(commands, /COMMANDS[\s\S]*toggleMemory/)
})
