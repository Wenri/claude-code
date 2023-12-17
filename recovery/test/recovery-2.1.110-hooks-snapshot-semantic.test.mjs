import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_109_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
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

const identities = new Map([
  [8764, [5881970, 5882017, 'FunctionDeclaration', '188ec1e46b964f831b18624ffff9a0c495a3aff3f56110ec057c6873cd275d6e']],
  [8765, [5882017, 5882258, 'FunctionDeclaration', 'a43712e9ca5ce7ae6a3426a6654630340018e6a1343ba9fcee9fa4ae580458a9']],
  [8768, [5882477, 5882521, 'FunctionDeclaration', '6ffbeb0e79277582bebb564d246ace387fd9113bfb9656fd9ecb2948b9029f5f']],
  [8769, [5882521, 5882570, 'FunctionDeclaration', '275690a711599e2a7ba9a4cd447e25d5b829a1efac53650fa5acf07ae0f76ef1']],
  [8770, [5882570, 5882653, 'FunctionDeclaration', '5c5452b29438995ad9828fc13199c6ba8cffc3c819407fb90ad4281159aa6179']],
  [8772, [5882661, 5882703, 'VariableDeclaration', '75d9ffe6cf5d8491cf517807b6b8ef50a715951df82c84391815aa78039b92f9']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test(
  'target110 pins the hooks-config singleton snapshot and refresh path',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.109 and 2.1.110 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7',
    )
    assert.equal(
      sha256(targetBytes),
      'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
    )
    const target = targetBytes.toString('utf8')
    const units = new Map()
    for (const [index, identity] of identities) {
      const region = structural.regions[index]
      assert.equal(
        region.classification,
        index === 8765 ? 'matched' : 'unresolved',
        `${index}: class`,
      )
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        identity,
        `${index}: identity`,
      )
      const unit = target.slice(region.target.start, region.target.end)
      assert.equal(sha256(unit), region.target.sourceHash, `${index}: bytes`)
      units.set(index, unit)
    }
    assert.match(units.get(8764), /initialHooksConfig:null/)
    assert.match(units.get(8765), /disableAllHooks===!0\)return\{\}/)
    assert.match(units.get(8765), /allowManagedHooksOnly===!0/)
    assert.match(units.get(8768), /initialHooksConfig=/)
    assert.match(units.get(8769), /\(\),[^.]+\.initialHooksConfig=/)
    assert.match(
      units.get(8770),
      /initialHooksConfig===null\)[^(]+\(\);return [^.]+\.initialHooksConfig/,
    )
    assert.match(units.get(8772), /=yPz\(\)/)
    assert.equal(
      baselineBytes.toString('utf8').includes('initialHooksConfig'),
      false,
    )
  },
)

test(
  'source module binding preserves capture, cache reset, lazy read, and policy precedence',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const owner = fs.readFileSync(
      path.join(sourceRoot, 'utils/hooks/hooksConfigSnapshot.ts'),
      'utf8',
    )
    const fragments = [
      'let initialHooksConfig: HooksSettings | null = null',
      "getSettingsForSource('policySettings')",
      'policySettings?.disableAllHooks === true',
      'policySettings?.allowManagedHooksOnly === true',
      "isRestrictedToPluginOnly('hooks')",
      'mergedSettings.disableAllHooks === true',
      'export function captureHooksConfigSnapshot(): void',
      'initialHooksConfig = getHooksFromAllowedSources()',
      'export function updateHooksConfigSnapshot(): void',
      'resetSettingsCache()',
      'if (initialHooksConfig === null) {',
      'captureHooksConfigSnapshot()',
      'return initialHooksConfig',
    ]
    for (const fragment of fragments) {
      assert.ok(owner.includes(fragment), fragment)
    }
    const reset = owner.indexOf('resetSettingsCache()')
    const refresh = owner.indexOf(
      'initialHooksConfig = getHooksFromAllowedSources()',
      reset,
    )
    assert.ok(reset >= 0 && refresh > reset)
  },
)
