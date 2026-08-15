import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.96-to-2.1.97'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_96_BUNDLE
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = { skip: selected ? false : `not applicable to ${semanticCase}` }
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
      : false,
}
const adjacentOptions = {
  skip: bundleOptions.skip || !baselineBundlePath
    ? bundleOptions.skip || 'CLAUDE_CODE_2_1_96_BUNDLE is not set'
    : false,
}
const structural = JSON.parse(gunzipSync(fs.readFileSync(path.join(
  repositoryRoot,
  'recovery/cases',
  caseName,
  'structural/generated-delta.json.gz',
))))

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test('target97 pins both the local-JSX alias resolver and its bridge caller', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988')
  const expected = new Map([
    [15801, [11503468, 11503585, '059c5601ab812efe246cdb1975a9ddce4f85125277781a8639c8061fe1d878bf']],
    [17469, [12320694, 12323387, '7a9bd680b5363719e2fbafeb3b7725fe35d0a594c7cec86bb61f975c08ff41a6']],
  ])
  for (const [index, identity] of expected) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
    )
    const owner = bytes.toString('utf8').slice(region.target.start, region.target.end)
    assert.equal(sha256(owner), region.target.sourceHash)
    if (index === 15801) {
      assert.ok(owner.includes('type!=="local-jsx"'))
      assert.ok(owner.includes('.name===q.name&&K.type==="local"'))
    } else {
      assert.ok(owner.includes('replace(/^\\/\\S+/,`/${U.name}`)'))
      assert.ok(owner.includes('commands:[U,...z.options.commands]'))
      assert.ok(owner.includes(" isn't available over Remote Control."))
    }
  }
})

test('source resolves a local-JSX command to its same-name text-only counterpart', sourceOptions, () => {
  const commands = fs.readFileSync(path.join(sourceRoot, 'commands.ts'), 'utf8')
  for (const fragment of [
    'export function getBridgeSafeCommand(cmd: Command)',
    "if (cmd.type !== 'local-jsx') return undefined",
    "safeCommand.name === cmd.name && safeCommand.type === 'local'",
  ]) assert.ok(commands.includes(fragment), fragment)

  const input = fs.readFileSync(
    path.join(sourceRoot, 'utils/processUserInput/processUserInput.ts'),
    'utf8',
  )
  for (const fragment of [
    'const safeCommand = getBridgeSafeCommand(cmd)',
    'effectiveInputString = inputString.replace(',
    String.raw`^\/\S+`,
    '`/${safeCommand.name}`',
    'commands: [safeCommand, ...context.options.commands]',
  ]) assert.ok(input.includes(fragment), fragment)
})

test('2.1.96 predates bridge command alias replacement', adjacentOptions, () => {
  const bytes = fs.readFileSync(baselineBundlePath)
  assert.equal(sha256(bytes), '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e')
  const bundle = bytes.toString('utf8')
  assert.equal(bundle.includes('type!=="local-jsx")return;for'), false)
  assert.equal(bundle.includes('replace(/^\/\S+/,'), false)
})
