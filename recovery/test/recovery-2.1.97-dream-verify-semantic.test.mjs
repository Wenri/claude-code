import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.96-to-2.1.97'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const targetSha256 =
  '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988'
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
      : false,
}
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

const pinnedUnits = new Map([
  [18148, [12682278, 12692137, 'a215fbedcf731bb2f4ddac9794908b057718cc81253b5bcee9a4d62e31f9d9c9']],
  [18157, [12692536, 12692602, 'fce952715a946e86c9184fe3fcdec0f8ead12c8aed1540ccc5ed78414005e666']],
  [18158, [12692602, 12692695, '1c54829577ef771954299568848bfac878a1c2b258d48e81ff704d28b66d303d']],
  [18159, [12692695, 12694121, 'c6a14b7f4e46be09e194a228a0990aef9af30eb942989b169e289e886b21415e']],
  [18160, [12694121, 12695353, 'b094a491017bc7a7fdd1cb69a61c5e0038c0ad8576642be8fe2ed3f1261ad424']],
  [18161, [12695353, 12695390, '9bbe471bda938ec05af4ef4d7b45349b307a12cf313558dbc4654fa92b438963']],
  [18162, [12695390, 12695493, '51f35cc1eba038958a35f60d0f088256dbe0b8522d90bc522ccbce8bff867888']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function findCookedValue(node, predicate) {
  const stack = [node]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || typeof current !== 'object') continue
    const value =
      current.type === 'TemplateElement'
        ? current.value.cooked
        : current.type === 'Literal' && typeof current.value === 'string'
          ? current.value
          : undefined
    if (typeof value === 'string' && predicate(value)) return value
    for (const [key, child] of Object.entries(current)) {
      if (['end', 'raw', 'start'].includes(key)) continue
      if (Array.isArray(child)) stack.push(...child)
      else if (child && typeof child === 'object') stack.push(child)
    }
  }
  return undefined
}

test('2.1.97 /dream and legacy /verify evidence pins every target unit', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), targetSha256)
  const bundle = bytes.toString('utf8')
  for (const [index, [start, end, sourceHash]] of pinnedUnits) {
    const region = structural.regions[index]
    assert.equal(region.target.index, index)
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
    )
    assert.equal(sha256(bundle.slice(start, end)), sourceHash)
  }

  const ast = parse(bundle, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const verifyPayload = findCookedValue(
    ast.body[18148],
    value => value.startsWith('---\nname: verify\n'),
  )
  assert.equal(sha256(verifyPayload), '9d4049f20c3a1ab399b381d4af745e794865589068c14805c420b38917b111a9')
})

test('target97 source owns the complete gated /dream behavior', sourceOptions, () => {
  const dream = source('src/skills/bundled/dream.ts')
  for (const fragment of [
    "getFeatureValue_CACHED_WITH_REFRESH(",
    "'tengu_kairos_dream'",
    '!getKairosActive()',
    'Math.floor(Math.random() * 360)',
    '/^(nightly|schedule|overnight)\\b/i',
    'Scheduling is not available in this environment.',
    "mode: 'schedule'",
    "mode: 'consolidate'",
    'void recordConsolidation()',
    'buildConsolidationPrompt(',
  ]) {
    assert.ok(dream.includes(fragment), fragment)
  }

  // The historical target97 owner predates the target98 team-memory branch.
  const historicalOwner = !fs.existsSync(
    path.join(sourceRoot, 'skills/bundled/verify/legacy-SKILL.md'),
  )
  if (historicalOwner) {
    assert.ok(!dream.includes('team_memory_enabled'))
    assert.ok(!dream.includes('teamMemPaths'))
  }
})

test('target97 source owns the exact legacy /verify payload', sourceOptions, () => {
  const legacyPath = fs.existsSync(
    path.join(sourceRoot, 'skills/bundled/verify/legacy-SKILL.md'),
  )
    ? 'src/skills/bundled/verify/legacy-SKILL.md'
    : 'src/skills/bundled/verify/SKILL.md'
  const payload = source(legacyPath)
  assert.equal(payload.length, 9792)
  assert.equal(sha256(payload), '9d4049f20c3a1ab399b381d4af745e794865589068c14805c420b38917b111a9')
  assert.ok(payload.startsWith('---\nname: verify\n'))
})
