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
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
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

const unit = [
  17325,
  12286076,
  12286762,
  '87a729d69d861292bdea5c032e6099dd94d84542dab17c24b7dbf30263321e82',
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test(
  'target101 pins raw and user-facing command names in the Fuse index',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.100 and 2.1.101 bundles are required'
        : false,
  },
  () => {
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
    const [index, start, end, hash] = unit
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, hash],
    )
    const fragment = targetBytes.toString('utf8').slice(start, end)
    assert.equal(sha256(fragment), hash)
    assert.equal(baselineBytes.includes(Buffer.from('displayPartKey')), false)
    assert.match(fragment, /\.name,[^;]+\([^)]*\),[^;]+!==[^?]+\?[^:]+:\[\]/)
    assert.match(fragment, /displayPartKey:/)
    assert.match(fragment, /commandName:/)
    assert.match(fragment, /displayName:/)
    assert.match(
      fragment,
      /name:"commandName",weight:3.*name:"displayName",weight:2.*name:"partKey",weight:2.*name:"aliasKey",weight:2.*name:"displayPartKey",weight:1.*name:"descriptionKey",weight:0\.5/,
    )
  },
)

test(
  'source indexes both canonical and user-facing command names with target weights',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const source = fs.readFileSync(
      path.join(sourceRoot, 'utils/suggestions/commandSuggestions.ts'),
      'utf8',
    )
    for (const fragment of [
      'const commandName = cmd.name',
      'const displayName = getCommandName(cmd)',
      'displayName !== commandName',
      'displayName.split(SEPARATORS).filter(Boolean)',
      'displayPartKey:',
      "name: 'displayName'",
      "name: 'displayPartKey'",
    ]) {
      assert.ok(source.includes(fragment), fragment)
    }
    const weights = [
      ["name: 'commandName'", 'weight: 3'],
      ["name: 'displayName'", 'weight: 2'],
      ["name: 'partKey'", 'weight: 2'],
      ["name: 'aliasKey'", 'weight: 2'],
      ["name: 'displayPartKey'", 'weight: 1'],
      ["name: 'descriptionKey'", 'weight: 0.5'],
    ]
    let previous = -1
    for (const [name, weight] of weights) {
      const index = source.indexOf(name, previous + 1)
      assert.ok(index > previous, name)
      assert.ok(source.slice(index, index + 180).includes(weight), `${name} ${weight}`)
      previous = index
    }
  },
)

test(
  'target116 retains dual command-name indexing',
  {
    skip: semanticCase || !latestPath
      ? 'current target116 evidence unavailable'
      : false,
  },
  () => {
    const latest = fs.readFileSync(latestPath)
    assert.equal(
      sha256(latest),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const text = latest.toString('utf8')
    const position = text.indexOf('displayPartKey')
    assert.ok(position > 0)
    const fragment = text.slice(position - 800, position + 800)
    assert.match(fragment, /\.name,[^;]+\([^)]*\),[^;]+!==[^?]+\?[^:]+:\[\]/)
    assert.match(fragment, /name:"displayName",weight:2/)
    assert.match(fragment, /name:"displayPartKey",weight:1/)
  },
)
