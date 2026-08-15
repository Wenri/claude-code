import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const historical = sourceRoot !== path.join(repositoryRoot, 'src')
const baselinePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'authenticated 2.1.104 and 2.1.105 bundles are required'
      : false,
}

const documents = new Map([
  [18697, ['skills/bundled/claude-api/curl/managed-agents.md', '# Managed Agents — cURL / Raw HTTP', 13005361, 13012935, '7ba2ac0d9c015e652a60a1e687863de60c0d6929b02539abf2082bf66e491efc']],
  [18715, ['skills/bundled/claude-api/python/managed-agents/README.md', '# Managed Agents — Python', 13097490, 13107896, 'eba58a35480bb2acd486614e3e2aba80aac8ff0dbeab593123e46c664196d643']],
  [18727, ['skills/bundled/claude-api/shared/managed-agents-api-reference.md', '# Managed Agents — Endpoint Reference', 13171806, 13189064, '8b231af2c48b4a00d96a0311f29e519ec0cab0fa52a5300e7e3c5f3c06ca97b2']],
  [18729, ['skills/bundled/claude-api/shared/managed-agents-client-patterns.md', '# Managed Agents — Common Client Patterns', 13189079, 13198646, '9db82d8e70277905520dd0730454d3672dba80e9e7667098a8cd57825cbc16bf']],
  [18731, ['skills/bundled/claude-api/shared/managed-agents-core.md', '# Managed Agents — Core Concepts', 13198661, 13211181, '7ea0da0895ea2b97a37af3d30fa0c558f03da0f20d56bedea48c1741bf8ce450']],
  [18733, ['skills/bundled/claude-api/shared/managed-agents-environments.md', '# Managed Agents — Environments & Resources', 13211196, 13221920, '798b289a1e91969788dfac7f8d114f82fbb7de3bc723e386232e486abe3bc042']],
  [18735, ['skills/bundled/claude-api/shared/managed-agents-events.md', '# Managed Agents — Events & Steering', 13221935, 13230793, '4a1d707dc9d9f04eff864661faa5379a9a41e7395af971562dbc241bca63f8a4']],
  [18737, ['skills/bundled/claude-api/shared/managed-agents-onboarding.md', '# Managed Agents — Onboarding Flow', 13230808, 13238987, '267738d137b0fe7d66ac2cf086083ec3642644e4b130649e9483eb6d373f2785']],
  [18739, ['skills/bundled/claude-api/shared/managed-agents-overview.md', '# Managed Agents — Overview', 13239002, 13247496, 'f7ae0603789cfa1bccc88eb63ee96c2fb7bd4ac1c8e23ceab8b736b90cda86ed']],
  [18741, ['skills/bundled/claude-api/shared/managed-agents-tools.md', '# Managed Agents — Tools & Skills', 13247511, 13261571, '40f50e563c876079bf75a73ebb9a04f1149bd8eede0a306d40923abd965f780f']],
  [18759, ['skills/bundled/claude-api/typescript/managed-agents/README.md', '# Managed Agents — TypeScript', 13331710, 13341595, 'f01aa5b1b15931c7418c92df5a2dc2b01c1e426f6583bc5eff92c13c5b9fda92']],
])

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

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
}

function initializerValue(region) {
  const ast = parse(region, { ecmaVersion: 'latest', sourceType: 'module' })
  const initializer = ast.body[0]?.declarations?.[0]?.init
  if (initializer?.type === 'Literal') return initializer.value
  if (
    initializer?.type === 'TemplateLiteral' &&
    initializer.expressions.length === 0
  ) {
    return initializer.quasis[0]?.value.cooked
  }
  throw new Error('expected a static string declaration')
}

test(
  'authenticated target105 pins every evolved Managed Agents document declaration',
  bundleOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    )
    assert.equal(
      sha256(targetBytes),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')

    for (const [index, [, heading, start, end, hash]] of documents) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        [start, end, 'VariableDeclaration', hash],
        `${index}: identity`,
      )
      const targetRegion = target.slice(start, end)
      assert.equal(sha256(targetRegion), hash, `${index}: bytes`)
      assert.ok(initializerValue(targetRegion).startsWith(heading), heading)
      assert.equal(baseline.split(heading).length - 1, 1, `${heading}: baseline`)
      assert.equal(target.split(heading).length - 1, 1, `${heading}: target`)
    }
  },
)

test(
  'source root owns each document and the claude-api content map makes it reachable',
  sourceOptions,
  () => {
    const target = targetPath ? fs.readFileSync(targetPath, 'utf8') : null
    for (const [index, [relativePath, heading, start, end]] of documents) {
      const contents = source(relativePath)
      assert.ok(contents.startsWith(heading), relativePath)
      if (historical && target) {
        assert.equal(
          contents,
          initializerValue(target.slice(start, end)).replace(/\n*$/, '\n'),
          `${index}: exact text-loader asset`,
        )
      }
    }

    const contentMap = source('skills/bundled/claudeApiContent.ts')
    for (const [, [relativePath]] of documents) {
      const key = relativePath.replace('skills/bundled/claude-api/', '')
      assert.ok(contentMap.includes(`'${key}'`), key)
    }
    const skill = source('skills/bundled/claudeApi.ts')
    assert.ok(skill.includes('**Managed Agents (server-managed stateful agents):**'))
    assert.ok(skill.includes('shared/managed-agents-overview.md'))
    assert.ok(skill.includes('curl/managed-agents.md'))
  },
)
