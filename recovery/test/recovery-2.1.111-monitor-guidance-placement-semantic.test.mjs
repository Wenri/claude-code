import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.110-to-2.1.111'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_111_BUNDLE
const targetUnit = {
  index: 12233,
  nodeType: 'FunctionDeclaration',
  start: 9212647,
  end: 9213005,
  sourceHash:
    'ea52039d3b38072c6b522db3b3062ea082b5faba657be7c6e52c7e9493b81163',
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function monitorWindow(bundle) {
  const marker = 'Monitor event: "'
  const index = bundle.indexOf(marker)
  assert.notEqual(index, -1, 'Monitor event marker')
  return bundle.slice(index - 500, index + 600)
}

test(
  'target111 authenticates Monitor guidance moving inside task-notification',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated target110 and target111 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
    )
    assert.equal(
      sha256(targetBytes),
      '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0',
    )
    const target = targetBytes.toString('utf8')
    const region = structural.regions[targetUnit.index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [
        region.target.nodeType,
        region.target.start,
        region.target.end,
        region.target.sourceHash,
      ],
      [
        targetUnit.nodeType,
        targetUnit.start,
        targetUnit.end,
        targetUnit.sourceHash,
      ],
    )
    assert.equal(
      sha256(target.slice(targetUnit.start, targetUnit.end)),
      targetUnit.sourceHash,
    )

    const baselineWindow = monitorWindow(baselineBytes.toString('utf8'))
    const targetWindow = monitorWindow(target)
    assert.match(
      baselineWindow,
      /<event>.*<\/event>\n<\/\$\{[^}]+\}>\$\{[A-Za-z_$][\w$]*\}/s,
    )
    assert.match(
      targetWindow,
      /<event>.*<\/event>\$\{[A-Za-z_$][\w$]*\}\n<\/\$\{[^}]+\}>/s,
    )
  },
)

test(
  'source keeps optional push guidance inside the Monitor XML envelope',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const owner = fs.readFileSync(
      path.join(sourceRoot, 'tools/MonitorTool/MonitorTool.ts'),
      'utf8',
    )
    assert.match(
      owner,
      /!options\?\.isHousekeeping && isLoopPushNotificationEnabled\(\)/,
    )
    assert.match(
      owner,
      /<event>\$\{escapeXml\(event\)\}<\/event>\$\{pushGuidance\}\n<\/task-notification>/,
    )
  },
)
