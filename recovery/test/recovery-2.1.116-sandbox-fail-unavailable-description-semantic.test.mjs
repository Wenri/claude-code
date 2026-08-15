import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const unit = {
  index: 2473,
  nodeType: 'VariableDeclaration',
  start: 998530,
  end: 1002355,
  sourceHash:
    'c6832fdda3d18ec7dd6c7fb463e85656636e7deeb362ae5644d371dd395668f3',
}
const description =
  'Exit with an error at startup if sandbox.enabled is true but the sandbox cannot start ' +
  '(missing dependencies or unsupported platform). ' +
  'When false (default), a warning is shown and commands run unsandboxed. ' +
  'Intended for managed-settings deployments that require sandboxing as a hard gate.'
const baselineDescription = description.replace(
  'missing dependencies or unsupported platform',
  'missing dependencies, unsupported platform, or platform not in enabledPlatforms',
)
const typedOccurrence = { start: 1000980, end: 1001268 }

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

test(
  'target116 authenticates the narrowed sandbox startup-failure description',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated target114 and target116 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
    )
    assert.equal(
      sha256(targetBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const region = structural.regions[unit.index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [
        region.target.nodeType,
        region.target.start,
        region.target.end,
        region.target.sourceHash,
      ],
      [unit.nodeType, unit.start, unit.end, unit.sourceHash],
    )
    assert.equal(sha256(target.slice(unit.start, unit.end)), unit.sourceHash)
    assert.equal(
      target.slice(typedOccurrence.start, typedOccurrence.end),
      JSON.stringify(description),
    )
    assert.equal(target.split(description).length - 1, 1)
    assert.equal(baseline.split(description).length - 1, 0)
    assert.equal(target.split(baselineDescription).length - 1, 0)
    assert.equal(baseline.split(baselineDescription).length - 1, 1)
  },
)

test(
  'source exposes the exact target116 schema description at runtime',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const owner = path.join(sourceRoot, 'entrypoints/sandboxTypes.ts')
    const source = fs.readFileSync(owner, 'utf8')
    assert.equal(source.includes('(missing dependencies or unsupported platform).'), true)
    assert.equal(source.includes('platform not in enabledPlatforms).'), false)

    const bun = path.join(repositoryRoot, '.pixi/envs/default/bin/bun')
    const expression =
      `import {SandboxSettingsSchema} from ${JSON.stringify(owner)};` +
      'console.log(JSON.stringify(SandboxSettingsSchema().shape.failIfUnavailable.description));'
    const result = spawnSync(bun, ['-e', expression], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(JSON.parse(result.stdout), description)
  },
)
