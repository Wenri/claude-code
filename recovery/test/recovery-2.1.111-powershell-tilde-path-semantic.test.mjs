import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.110-to-2.1.111'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? path.join(root, 'src'))
const baselinePath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_111_BUNDLE
const structural = JSON.parse(gunzipSync(fs.readFileSync(path.join(root, 'recovery/cases', caseName, 'structural/generated-delta.json.gz'))))

const sourceOptions = { skip: selected ? false : `not applicable to ${semanticCase}` }
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'authenticated target110 and target111 bundles are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test('target111 pins the PowerShell ~user rejection branch', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(sha256(baselineBytes), 'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861')
  assert.equal(sha256(targetBytes), '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0')
  const region = structural.regions[12806]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.nodeType, region.target.start, region.target.end, region.target.sourceHash],
    ['FunctionDeclaration', 9519785, 9522238, '82bc7ede0eaddc04f1121ceb5ff66729f0d350fb4428806e74714dba1f555da0'],
  )
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')
  assert.equal(baseline.includes('Paths beginning with ~user cannot be statically validated and require manual approval'), false)
  assert.equal(target.split('Paths beginning with ~user cannot be statically validated and require manual approval').length - 1, 1)
  const unit = target.slice(9519785, 9522238)
  assert.equal(sha256(unit), region.target.sourceHash)
  assert.match(unit, /\^~\[\^\/\].*allowed:!1.*resolvedPath:.*Paths beginning with ~user/s)
})

test('source rejects ~user before path resolution and retains later path guards', sourceOptions, () => {
  const owner = fs.readFileSync(path.join(sourceRoot, 'tools/PowerShellTool/pathValidation.ts'), 'utf8')
  assert.match(
    owner,
    /if \(\/\^~\[\^\/\]\/\.test\(normalizedPath\)\)[\s\S]*allowed: false[\s\S]*resolvedPath: normalizedPath[\s\S]*Paths beginning with ~user cannot be statically validated/,
  )
  assert.ok(owner.indexOf('if (/^~[^/]/.test(normalizedPath))') < owner.indexOf("if (normalizedPath.includes('`'))"))
})
