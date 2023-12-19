import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? path.join(root, 'src'))
const baselinePath = process.env.CLAUDE_CODE_2_1_109_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const structural = JSON.parse(gunzipSync(fs.readFileSync(path.join(root, 'recovery/cases', caseName, 'structural/generated-delta.json.gz'))))
const units = new Map([
  [18469, [12579822, 12580763, 'VariableDeclaration', '7047bce78c0538839ffad519dea474b1cac483405a8ef3fb6628953a47236019', 'changed']],
  [18470, [12580763, 12580862, 'FunctionDeclaration', 'f4087ad36ae2060ca0cc4edff1505c6f6824eea0da618549d4fed432f2dd605e', 'unresolved']],
  [18471, [12580862, 12580959, 'FunctionDeclaration', '50983ebba2716d2964a346bab47ad668a78a25eb80eba31e263fd34b6c58296f', 'unresolved']],
  [18473, [12580967, 12581170, 'VariableDeclaration', '64099b41ed1d648f498310b2d00744417336179b3068244bdc27d3fd7ebf2b41', 'unresolved']],
  [18482, [12582454, 12582953, 'FunctionDeclaration', '47fbb30fdea2a780f993563a1e7bcf07e24df8239e3928c0cc38764b449b6152', 'unresolved']],
  [18483, [12582953, 12590916, 'ClassDeclaration', '3d9b9b6bb644504c45892f3fdad160ffa5e441f901da1d2d85de97f966470f1f', 'unresolved']],
])

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')

test(
  'target110 pins safe MCP requires-action previews and their StructuredIO caller',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated target109 and target110 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(sha256(baselineBytes), '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7')
    assert.equal(sha256(targetBytes), 'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861')
    const target = targetBytes.toString('utf8')
    for (const [index, [start, end, nodeType, hash, classification]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, classification, `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.nodeType, region.target.sourceHash],
        [start, end, nodeType, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: target bytes`)
    }
    const previewGraph = target.slice(12580763, 12581170)
    assert.match(previewGraph, /\[REDACTED\]/)
    assert.match(previewGraph, /slice\(0,[^-]+-3\)\+"\.\.\."/)
    assert.match(previewGraph, /api\[_-\]\?key\|secret\|token/)
    const details = target.slice(12582454, 12582953)
    assert.match(details, /getToolUseSummary/)
    assert.match(details, /getActivityDescription/)
    assert.ok(details.indexOf('getToolUseSummary') < details.indexOf('getActivityDescription'))
    assert.match(details, /buildRequiresActionDetails: rawCommand failed:/)
    assert.match(details, /\.isMcp/)
    const baseline = baselineBytes.toString('utf8')
    assert.equal(baseline.includes('api[_-]?key|secret|token|password'), false)
    assert.equal(baseline.includes('JSON.stringify(K);A=O.length>200'), true)
  },
)

test(
  'source redacts and truncates MCP input while preserving Bash and PowerShell raw commands',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const owner = fs.readFileSync(path.join(sourceRoot, 'cli/structuredIO.ts'), 'utf8')
    for (const fragment of [
      'SENSITIVE_MCP_INPUT_KEY',
      'api[_-]?key|secret|token|password|passwd|credential|bearer',
      "? '[REDACTED]' : value",
      'redactSecrets(jsonStringify(redactMcpInputFields(input)))',
      'serialized.slice(0, maxLength - 3)',
      'tool.getToolUseSummary?.(input)',
      'tool.getActivityDescription?.(input)',
      'buildRequiresActionDetails: description failed:',
      'tool.name === BASH_TOOL_NAME || tool.name === POWERSHELL_TOOL_NAME',
      'typeof input.command ===',
      'else if (tool.isMcp)',
      'buildRequiresActionDetails: rawCommand failed:',
      'raw_command: rawCommand',
      'buildRequiresActionDetails(tool, input, toolUseID, requestId)',
    ]) assert.ok(owner.includes(fragment), fragment)
    assert.ok(owner.indexOf('tool.getToolUseSummary') < owner.indexOf('tool.getActivityDescription'))
  },
)
