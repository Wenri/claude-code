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
const explicitSourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
const sourceRoot = explicitSourceRoot
  ? path.resolve(explicitSourceRoot)
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

const documents = [
  ['skills/bundled/claude-api/curl/managed-agents.md', '# Managed Agents — cURL / Raw HTTP'],
  ['skills/bundled/claude-api/python/managed-agents/README.md', '# Managed Agents — Python'],
  ['skills/bundled/claude-api/SKILL.md', '# Building LLM-Powered Applications with Claude'],
  ['skills/bundled/claude-api/shared/live-sources.md', '# Live Documentation Sources'],
  ['skills/bundled/claude-api/shared/managed-agents-api-reference.md', '# Managed Agents — Endpoint Reference'],
  ['skills/bundled/claude-api/shared/managed-agents-client-patterns.md', '# Managed Agents — Common Client Patterns'],
  ['skills/bundled/claude-api/shared/managed-agents-core.md', '# Managed Agents — Core Concepts'],
  ['skills/bundled/claude-api/shared/managed-agents-environments.md', '# Managed Agents — Environments & Resources'],
  ['skills/bundled/claude-api/shared/managed-agents-events.md', '# Managed Agents — Events & Steering'],
  ['skills/bundled/claude-api/shared/managed-agents-onboarding.md', '# Managed Agents — Onboarding Flow'],
  ['skills/bundled/claude-api/shared/managed-agents-overview.md', '# Managed Agents — Overview'],
  ['skills/bundled/claude-api/shared/managed-agents-tools.md', '# Managed Agents — Tools & Skills'],
  ['skills/bundled/claude-api/typescript/managed-agents/README.md', '# Managed Agents — TypeScript'],
]

const pinnedUnits = new Map([
  [18186, [12733287, 12740596, '9575be524ed55a5ece80e755379109c41ba21944a20b84e4019b349261eb86cc']],
  [18204, [12825151, 12835513, '39eebd5abe44504fb56db2915d2552b5163182f396f909bd89cbbfa0f45f1c75']],
  [18208, [12838524, 12867345, '85dee0fc756222bb8c4615309e9fdeb1542dbdb29cdde3f61dbeb7dbb4d0e080']],
  [18214, [12883090, 12899408, 'e75ca79cc4df7236a2ec7fe1611baae4936245adf659c96e63226da62d47e699']],
  [18216, [12899423, 12916203, 'e2a1228cbcb8b339cb1ccf2b212bf966a6c70fdb34f34c6aff0dfed4083c05ad']],
  [18218, [12916218, 12924819, 'dbf411b36075c97d13bf166ca1620a38327cf829d169a066bab170dfecd5d1c5']],
  [18220, [12924834, 12937027, 'dc53573fc03eef5627504c3b5980f31579f5caf66abc0ac16b708820e4f154df']],
  [18222, [12937042, 12945760, '5579e66267df87eb99ab1b1d6ce2058a0550b5784af4851599ef454e306f3dd7']],
  [18224, [12945775, 12954307, '3e8a884776afb54b9cb895925139dacc868eb66d703b383485843c0b01abf32c']],
  [18226, [12954322, 12962460, 'b778f320d520a106f2d4c69d41732de0daef31e0ce6de9c262e1dae794337057']],
  [18228, [12962475, 12970050, '6aecc798e62de131edbd2d232ba487e755f69eec9e2d96b6885245dda7a99368']],
  [18230, [12970065, 12982505, 'e93fa41a3369fb529ff4c60efe887bd68cc57c8e83dfdc595ec99e633cae8fbc']],
  [18248, [13052644, 13062447, '6d34d8fcf30e5cec460cc6e73c07ef45c0b5e878d9392e688ddfcd64420a2045']],
  [18253, [13062565, 13064152, '3496bb8ef672c534bf6a4cc7329d1a6d25304f657ed948d18f03d34a5c2a43ee']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function targetStrings(bundle) {
  const ast = parse(bundle, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    allowHashBang: true,
  })
  const values = []
  for (const statement of ast.body) {
    if (statement.type !== 'VariableDeclaration') continue
    for (const declaration of statement.declarations) {
      const initializer = declaration.init
      if (initializer?.type === 'Literal' && typeof initializer.value === 'string') {
        values.push(initializer.value)
      } else if (
        initializer?.type === 'TemplateLiteral' &&
        initializer.expressions.length === 0
      ) {
        values.push(initializer.quasis[0]?.value.cooked)
      }
    }
  }
  return values.filter(value => typeof value === 'string')
}

test('2.1.97 managed-agent target units are pinned exactly', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), targetSha256)
  const bundle = bytes.toString('utf8')
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
  for (const [index, [start, end, sourceHash]] of pinnedUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
  }
})

test('historical source owns every exact managed-agent document', sourceOptions, () => {
  const bundle = targetBundlePath
    ? fs.readFileSync(targetBundlePath, 'utf8')
    : undefined
  const values = bundle ? targetStrings(bundle) : []
  for (const [relative, prefix] of documents) {
    const content = fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
    assert.ok(content.startsWith(prefix), `${relative}: ${prefix}`)
    if (semanticCase === caseName && bundle) {
      assert.equal(
        values.filter(value => value === content).length,
        1,
        `${relative}: exact target string`,
      )
    }
  }
})

test('Claude API content map exposes every managed-agent document', sourceOptions, () => {
  const content = fs.readFileSync(
    path.join(sourceRoot, 'skills/bundled/claudeApiContent.ts'),
    'utf8',
  )
  for (const [relative] of documents) {
    if (relative.endsWith('/SKILL.md') || relative.endsWith('/shared/live-sources.md')) {
      continue
    }
    const key = relative.replace('skills/bundled/claude-api/', '')
    assert.ok(content.includes(`'${key}'`), key)
  }
})
