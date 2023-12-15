import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const historical = sourceRoot !== path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const target110BundlePath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const latestBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE

const target105Structural = readStructural('2.1.104-to-2.1.105')
const target110Structural = readStructural('2.1.109-to-2.1.110')

const target105Units = new Map([
  [14189, [10610478, 10610882, '333bb1070d2c4938bed2dedb92699038d75dfb08799a598423f2d0a2d207bb8b']],
  [14190, [10610882, 10610984, '2b0d8a229a627d0b4cc21a63f75c5aa08394bf34bd062233cd0b21dba9a2e998']],
  [14191, [10610984, 10611112, '4fb7136fa9fad5c16bfe398d377429baee444ddf103f067366fc3217c6ea1698']],
  [14192, [10611112, 10611597, 'fc0aee911d93f7dae0616a2fa50ab1d488312eaac8fb13e84ae0db9be1526ead']],
  [14193, [10611597, 10612488, '610ea6a229320a3c7709e945d0d2cb9e1acfc26cd06ef057faed5954d5fc416f']],
  [14194, [10612488, 10612514, 'a4b5b6dbbd3bd19ed3cc89607eec76a6a902624cc4bef052b4d15287ccc145f8']],
  [14195, [10612514, 10612749, 'd5e5ab8de3e04beef1b1d7b991cba1cc232326f93706b65ffc561d546841e860']],
])

const target110Units = new Map([
  [14400, [10498006, 10498410, 'f20d9aaf17caca7d60fe3cbd4256db4573d9413c3929b772de904a88507fc978']],
  [14401, [10498410, 10498512, 'e7e6aded9ef30502beb90db0be5348e756bf13fab9b11320e4f68702511096ec']],
  [14402, [10498512, 10498640, 'd9de6d574d1945d2175aeb1836d4719b18913c83aa366a3aba830f8f46d70d8f']],
  [14403, [10498640, 10499125, '287fdba21188f3e0816a9291494034016f3a58a038e6afb4a0f918a53bc040b9']],
  [14404, [10499125, 10500016, '9312e5a4801aef6fbef0c50ac7270b2ba499158282d44eccde8cde28ef8b6bc3']],
  [14405, [10500016, 10500041, '0ad245dd7ef56da628ac6e18681b2d7c6e8db9e7effb6d5f8cdf38b7c5406696']],
  [14406, [10500041, 10500275, 'a1749c869e40f131edb63a543477c93b7452a4b37bf22e673eb24345d18e4b53']],
])

function readStructural(name) {
  return JSON.parse(
    gunzipSync(
      fs.readFileSync(
        path.join(
          repositoryRoot,
          'recovery/cases',
          name,
          'structural/generated-delta.json.gz',
        ),
      ),
    ),
  )
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function bundleOptions(envName, bundlePath) {
  return {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !bundlePath
        ? `${envName} is required`
        : false,
  }
}

function assertUnits(structural, units, bundle) {
  for (const [index, identity] of units) {
    const region = structural.regions[index]
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
      `${index}: structural identity`,
    )
    const statement = bundle.slice(identity[0], identity[1])
    assert.equal(sha256(statement), identity[2], `${index}: target bytes`)
    assert.equal(
      parse(statement, { ecmaVersion: 'latest', sourceType: 'module' }).body
        .length,
      1,
      `${index}: one top-level statement`,
    )
  }
}

test(
  'target105 authenticates the complete Tree and Connector introduction',
  bundleOptions('CLAUDE_CODE_2_1_105_BUNDLE', targetBundlePath),
  () => {
    const baselineBytes = fs.readFileSync(baselineBundlePath)
    const targetBytes = fs.readFileSync(targetBundlePath)
    assert.equal(
      sha256(baselineBytes),
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    )
    assert.equal(
      sha256(targetBytes),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )
    assert.equal(
      baselineBytes.includes(Buffer.from('ancestors:[]')),
      false,
      'Tree context is absent from target104',
    )
    assertUnits(target105Structural, target105Units, targetBytes.toString())
  },
)

test(
  'target110 pins the unchanged seven-unit runtime used by Doctor',
  bundleOptions('CLAUDE_CODE_2_1_110_BUNDLE', target110BundlePath),
  () => {
    const bytes = fs.readFileSync(target110BundlePath)
    assert.equal(
      sha256(bytes),
      'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
    )
    assertUnits(target110Structural, target110Units, bytes.toString())
  },
)

test(
  'source owns connector layout, tree ancestry, and nested-node reachability',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const tree = source('components/design-system/Tree.tsx')
    for (const fragment of [
      "export type ConnectorKind = 'branch' | 'last' | 'pipe' | 'space'",
      'export function Connector',
      'connectors.length > 0',
      '<NoSelect',
      'fromLeftEdge',
      'connectors.map((connector, index)',
      '<Box flexGrow={1} flexShrink={1}>',
      "variant = 'outline'",
      'const items = Children.toArray(children)',
      'value={respectLast && index === items.length - 1}',
      "variant === 'outline' ? 'last' : isLast ? 'last' : 'branch'",
      "variant === 'outline' ? 'space' : isLast ? 'space' : 'pipe'",
      'const hasLabel = label != null && label !== false',
      '<Connector connectors={[...ancestors, connector]}',
      'ancestors: [...ancestors, childConnector]',
    ]) {
      if (historical && fragment.includes('respectLast &&')) continue
      assert.ok(tree.includes(fragment), fragment)
    }

    if (historical) {
      assert.ok(tree.includes('export const Tree = Object.assign(TreeRoot, { Node: TreeNode })'))
      assert.equal(tree.includes('TreeGroup'), false, 'target105 predates Tree.Group')
    } else {
      assert.ok(tree.includes('function TreeGroup'))
      assert.ok(tree.includes('return wrapChildren(children, isLast)'))
      assert.ok(tree.includes('Group: TreeGroup'))
    }
  },
)

test(
  'target116 retains Tree and adds last-child-preserving Tree.Group',
  bundleOptions('CLAUDE_CODE_2_1_116_BUNDLE', latestBundlePath),
  () => {
    const bytes = fs.readFileSync(latestBundlePath)
    assert.equal(
      sha256(bytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const latest = bytes.toString()
    const contextAt = latest.indexOf('ancestors:[]')
    assert.ok(contextAt > 0, 'latest Tree context')
    const graph = latest.slice(contextAt - 2600, contextAt + 400)
    assert.match(graph, /fromLeftEdge:!0,flexShrink:0,flexDirection:"row"/)
    assert.match(graph, /\.Children\.toArray\([^)]+\)/)
    assert.match(graph, /value:[^&]+&&[^=]+===\w+\.length-1/)
    assert.match(graph, /==="outline"\?"last":[^?]+\?"last":"branch"/)
    assert.match(graph, /==="outline"\?"space":[^?]+\?"space":"pipe"/)
    assert.match(graph, /Object\.assign\([^,]+,\{Node:[^,]+,Group:[^}]+\}\)/)
  },
)
