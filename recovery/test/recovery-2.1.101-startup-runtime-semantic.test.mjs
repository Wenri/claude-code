import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselinePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(repositoryRoot, 'recovery/cases', caseName, 'structural/generated-delta.json.gz'),
    ),
  ),
)

const units = [
  [18235, 12723634, 12724120, '24d20bd02199b410df1ed7c7332954d41392d1fe57dac5efb1eff5a96da3cc9f'],
  [18238, 12724266, 12724726, 'f81aee99f2b27a395685192880f5127226598a0db924685b02756bdeef9e6168'],
  [18242, 12725500, 12725748, '9c10855b62f82608e6de2cdb3d81577e236ecd4e564576c44f31192d88fe429f'],
  [18600, 13256161, 13256373, 'cf5e28a152816395dff175e23c8668639fe6ac6f118dee58fe8764c9784577e1'],
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test(
  'target101 pins warning, permission, and startup-hook runtime helpers',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.100 and 2.1.101 bundles are required'
        : false,
  },
  () => {
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(fs.readFileSync(baselinePath)),
      'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be',
    )
    assert.equal(
      sha256(targetBytes),
      'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
    )
    const target = targetBytes.toString('utf8')
    const fragments = new Map()
    for (const [index, start, end, hash] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved')
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, hash],
      )
      const fragment = target.slice(start, end)
      assert.equal(sha256(fragment), hash)
      fragments.set(index, fragment)
    }
    assert.match(fragments.get(18235), /tengu_node_warning/)
    assert.match(fragments.get(18235), /occurrence_count/)
    assert.match(fragments.get(18238), /baseTools/)
    assert.match(fragments.get(18238), /overlyBroadBashPermissions/)
    assert.match(fragments.get(18242), /session-start/)
    assert.match(fragments.get(18242), /forceSyncExecution/)
    assert.match(fragments.get(18600), /effectiveModel/)
    assert.match(fragments.get(18600), /resolvedInitialModel/)
  },
)

test(
  'source owns equivalent reachable startup behavior without compiler wrappers',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const warnings = fs.readFileSync(
      path.join(sourceRoot, 'utils/warningHandler.ts'),
      'utf8',
    )
    const main = fs.readFileSync(path.join(sourceRoot, 'main.tsx'), 'utf8')
    for (const fragment of [
      'export const MAX_WARNING_KEYS = 1000',
      'process.removeAllListeners(\'warning\')',
      "logEvent('tengu_node_warning'",
      'occurrence_count: count + 1',
      "process.on('warning', warningHandler)",
      'return {',
      'uninstall() {',
      "process.removeListener('warning', warningHandler)",
    ]) assert.ok(warnings.includes(fragment), fragment)
    assert.equal(warnings.includes("process.env.NODE_ENV === 'development'"), false)
    assert.equal(warnings.includes("process.env.USER_TYPE === 'ant'"), false)
    for (const fragment of [
      'const initResult = await initializeToolPermissionContext({',
      'baseToolsCli: baseTools',
      'overlyBroadBashPermissions',
      "await processSetupHooks('init', {",
      "await processSessionStartHooks('startup', {",
      'forceSyncExecution: true',
      'let effectiveModel = userSpecifiedModel',
      'setMainLoopModelOverride(effectiveModel)',
      'const initialMainLoopModel = getInitialMainLoopModel()',
      'const resolvedInitialModel = parseUserSpecifiedModel(',
    ]) assert.ok(main.includes(fragment), fragment)
    assert.ok(main.indexOf('initializeWarningHandler()') < main.indexOf('initializeToolPermissionContext({'))
  },
)
