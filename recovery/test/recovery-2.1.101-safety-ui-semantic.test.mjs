import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const historical = semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? path.join(root, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        root,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

const targetUnits = new Map([
  [14121, [10571535, 10571584, '151d6326583aa71834cae2b9592c5a70d774ec8c50af9dcf8eaaf85729ad5f39']],
  [14123, [10571614, 10572315, 'ed361322de3eefe353e2597e7cbf41784c131d8dee258e3d19e7ebc36a6a3fbd']],
  [14139, [10582834, 10582950, '73c5b5651c74e8d98ed7276e2a2995ca6865b71d25683bfc13c3d2b218d37aca']],
  [14146, [10583168, 10583347, 'e8d46b9e60cd63487066352934be0d828970cb6f95bbbb6e8ac228c3ef4657a3']],
  [14263, [10647596, 10648096, '1f6b6331b06ece0ec7e601e69a88da1a64a6c0be88bc5fbdaa0e38cde71abee1']],
  [14388, [10728918, 10729432, '5a9d70ecc85bd74f97416cac2c0ab62c09e85c42fd84abf5c22a8577f6c9bdc8']],
  [14390, [10729536, 10743335, '3ac781947866a9082f979f0f5e5e624e596926f4f79207ecb5f8967ad50aa12d']],
  [18038, [12602058, 12602485, '2fa65f19dfbbacc251913706e0d504055c7f87e215da73e70acf237c86bb6948']],
  [18040, [12602497, 12602636, '7dddc8b94e7a979c719265d1fff8a9b3172f04b77c202a6b60d4040ccbc05439']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

const pairOptions = {
  skip:
    !selected || !baselinePath || !targetPath
      ? 'selected authenticated 100/101 artifacts are required'
      : false,
}
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}

test('target101 pins every safety and recovery UI unit', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(
    sha256(baselineBytes),
    'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be',
  )
  assert.equal(
    sha256(targetBytes),
    'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
  )
  const target = targetBytes.toString('utf8')
  for (const [index, identity] of targetUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
      `${index}: structural identity`,
    )
    const unit = target.slice(identity[0], identity[1])
    assert.equal(sha256(unit), identity[2], `${index}: target bytes`)
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
      1,
      `${index}: one top-level statement`,
    )
  }
})

test('the safety messages and gates are introduced at target101', pairOptions, () => {
  const baseline = fs.readFileSync(baselinePath, 'utf8')
  const target = fs.readFileSync(targetPath, 'utf8')
  for (const fragment of [
    'Version check skipped (essential-traffic-only mode)',
    'Keybinding customization is disabled in this environment.',
    'headersHelper script returns valid credentials',
    '[binaryCheck] Rejected command with unsafe characters:',
  ]) {
    assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
    assert.equal(target.includes(fragment), true, `${fragment}: target`)
  }
})

test('source owns the Doctor and keybinding branches', sourceOptions, () => {
  const doctor = source('screens/Doctor.tsx')
  const doctorFragments = [
    "import { isEssentialTrafficOnly } from '../utils/privacyLevel.js'",
    'isNative && isEssentialTrafficOnly()',
    'isNative',
    ...(historical
      ? [
          'tags: distTags',
          '└ Version check skipped (essential-traffic-only mode)',
          'fetchDistTags().catch(_temp5).then(tags => ({',
        ]
      : [
          'const { tags: distTags, isNative } = use(promise)',
          'Version check skipped (essential-traffic-only mode)',
          'tags: await fetchDistTags().catch(() => ({ latest: null, stable: null }))',
        ]),
  ]
  for (const fragment of doctorFragments) assert.ok(doctor.includes(fragment), fragment)

  const keybindings = source('commands/keybindings/keybindings.ts')
  assert.ok(
    keybindings.includes(
      'Keybinding customization is disabled in this environment.',
    ),
  )
})

test('source owns headers-helper reconnect and binary-name safety', sourceOptions, () => {
  const reconnect = source('components/mcp/utils/reconnectHelpers.tsx')
  const menu = source('components/mcp/MCPRemoteServerMenu.tsx')
  for (const fragment of [
    'options?: { hasHeadersHelper?: boolean }',
    'options?.hasHeadersHelper',
    'headersHelper script returns valid credentials',
  ]) assert.ok(reconnect.includes(fragment), fragment)
  for (const fragment of [
    "server.config.type !== 'claudeai-proxy' && !!server.config.headersHelper",
    "server.client.type !== 'needs-auth' || hasHeadersHelper",
    'handleReconnectResult(result_1, server.name, {',
  ]) assert.ok(menu.includes(fragment), fragment)

  const binary = source('utils/binaryCheck.ts')
  for (const fragment of [
    "getPlatform() === 'windows'",
    '/^[A-Za-z0-9/\\\\][A-Za-z0-9_.+:\\\\?/-]*$/',
    '/^[A-Za-z0-9/][A-Za-z0-9_.+/-]*$/',
    'SAFE_BINARY_NAME_PATTERN.test(trimmedCommand)',
    '[binaryCheck] Rejected command with unsafe characters:',
  ]) assert.ok(binary.includes(fragment), fragment)
  assert.ok(
    binary.indexOf('SAFE_BINARY_NAME_PATTERN.test(trimmedCommand)') <
      binary.indexOf('binaryCache.get(trimmedCommand)'),
    'unsafe names are rejected before the cache or process lookup',
  )
})
