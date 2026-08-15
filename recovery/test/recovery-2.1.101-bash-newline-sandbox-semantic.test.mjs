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
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
const latestBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
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

const units = new Map([
  [
    7829,
    [
      6509485,
      6514670,
      '5d8fda10b70f63be29978f6789a27acca336fde0ea2110bf9cb681de5f62d543',
    ],
  ],
  [
    10051,
    [
      7483303,
      7483727,
      '2dc873b07938747b3ba78951ee4ef79c8ff6100b5224930e6a620d3e16806410',
    ],
  ],
  [
    10058,
    [
      7485625,
      7490408,
      '0a372f30d5189e59a71c2c2005030e6801aaccd0784548b91a7570b0f54c7eef',
    ],
  ],
])

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_100_BUNDLE and CLAUDE_CODE_2_1_101_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test('target101 pins the newline-hash semantic check and sandbox call path', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be',
  )
  assert.equal(
    sha256(targetBytes),
    'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
  )
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')
  assert.equal(baseline.includes('newline-hash'), false)
  assert.equal((target.match(/newline-hash/g) ?? []).length, 4)

  for (const [index, [start, end, hash]] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, hash],
      `${index}: identity`,
    )
    assert.equal(sha256(target.slice(start, end)), hash, `${index}: target bytes`)
  }

  const semanticCheck = target.slice(...units.get(7829).slice(0, 2))
  assert.equal((semanticCheck.match(/kind:"newline-hash"/g) ?? []).length, 3)
  assert.match(semanticCheck, /if\([^)]*\)return [^;]+;return\{ok:!0\}/)

  const sandboxHelper = target.slice(...units.get(10051).slice(0, 2))
  assert.ok(sandboxHelper.includes('/^\\/dev\\/(tcp|udp)\\//'))
  assert.match(sandboxHelper, /envVars\.some/)

  const permissionFlow = target.slice(...units.get(10058).slice(0, 2))
  assert.match(permissionFlow, /kind==="newline-hash"/)
})

test('source owns the deferred failure and both AST sandbox-autoallow branches', sourceOptions, () => {
  const ast = source('utils/bash/ast.ts')
  assert.ok(ast.includes("kind?: 'newline-hash'"))
  assert.ok(ast.includes('let newlineHashFailure: SemanticCheckResult | null = null'))
  assert.equal((ast.match(/kind: 'newline-hash'/g) ?? []).length, 3)
  assert.ok(ast.includes('if (newlineHashFailure) return newlineHashFailure'))

  const permissions = source('tools/BashTool/bashPermissions.ts')
  assert.ok(permissions.includes('function checkAstSandboxAutoAllow('))
  assert.ok(permissions.includes("if (sem.kind === 'newline-hash')"))
  assert.ok(permissions.includes('astCommands ?? []'))
  assert.ok(permissions.includes('!isSafeEnvironmentVariable(env.name)'))
  assert.ok(permissions.includes('/^\\/dev\\/(tcp|udp)\\//'))

  if (!semanticCase) {
    assert.ok(permissions.includes("name !== 'rm' && name !== 'rmdir'"))
    assert.ok(permissions.includes('if (hasCd && hasRemoval) return null'))
    assert.ok(permissions.includes('checkDangerousRemovalPaths(name, args, getCwd())'))
  } else {
    assert.equal(permissions.includes('if (hasCd && hasRemoval) return null'), false)
  }
})

test(
  'target116 retains the newline-hash discriminator',
  {
    skip:
      semanticCase || !latestBundlePath
        ? 'current-source target116 bundle evidence is not available in this run'
        : false,
  },
  () => {
    const latest = fs.readFileSync(latestBundlePath, 'utf8')
    assert.equal((latest.match(/newline-hash/g) ?? []).length, 4)
    assert.ok(
      latest.includes(
        'Newline followed by # inside a quoted argument can hide arguments from path validation',
      ),
    )
  },
)
