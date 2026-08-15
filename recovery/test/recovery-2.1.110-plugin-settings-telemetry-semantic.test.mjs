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
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(root, 'src')
const baselinePath = process.env.CLAUDE_CODE_2_1_109_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        root,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)
const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

test(
  'target110 pins settings-aware enabled-plugin telemetry',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.109 and 2.1.110 bundles are required'
        : false,
  },
  () => {
    const baseline = fs.readFileSync(baselinePath)
    const target = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baseline),
      '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7',
    )
    assert.equal(
      sha256(target),
      'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
    )
    const region = structural.regions[7708]
    assert.equal(region.classification, 'unresolved')
    assert.equal(region.target.nodeType, 'FunctionDeclaration')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [
        5092519,
        5093178,
        '3ed6f261143140a7766b1cfa71c0e872b505e74338f44e4d7faeeaeccbb2bf0d',
      ],
    )
    const baselineText = baseline.toString('utf8')
    const targetText = target.toString('utf8')
    const fragment = targetText.slice(region.target.start, region.target.end)
    assert.equal(sha256(fragment), region.target.sourceHash)
    assert.equal(baselineText.includes('has_settings'), false)
    assert.equal(baselineText.includes('settings_keys'), false)
    assert.match(fragment, /has_settings:[^,]+\.settings!==void 0/)
    assert.match(
      fragment,
      /\.settings&&\{settings_keys:Object\.keys\([^)]*\.settings\)\.sort\(\)\.join\(","\)\}/,
    )
    assert.ok(fragment.indexOf('has_mcp:') < fragment.indexOf('has_lsp:'))
    assert.ok(fragment.indexOf('has_lsp:') < fragment.indexOf('has_hooks:'))
    assert.ok(fragment.indexOf('has_hooks:') < fragment.indexOf('has_settings:'))
    assert.ok(fragment.indexOf('settings_keys:') < fragment.indexOf('version:'))
  },
)

test(
  'source emits the target plugin settings telemetry fields',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const source = fs.readFileSync(
      path.join(sourceRoot, 'utils/telemetry/pluginTelemetry.ts'),
      'utf8',
    )
    const owner = source.match(
      /export function logPluginsEnabledForSession[\s\S]*?\n\}/,
    )?.[0]
    assert.ok(owner)
    assert.match(owner, /has_settings:\s*plugin\.settings !== undefined/)
    assert.match(
      owner,
      /plugin\.settings\s*&&[\s\S]*?settings_keys:[\s\S]*?Object\.keys\(plugin\.settings\)[\s\S]*?\.sort\(\)[\s\S]*?\.join\([\s\S]*?','/,
    )
    assert.ok(owner.indexOf('has_mcp:') < owner.indexOf('has_lsp:'))
    assert.ok(owner.indexOf('has_lsp:') < owner.indexOf('has_hooks:'))
    assert.ok(owner.indexOf('has_hooks:') < owner.indexOf('has_settings:'))
    assert.ok(owner.indexOf('settings_keys:') < owner.indexOf('version:'))
  },
)
