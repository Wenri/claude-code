import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = [
  {
    version: '2.1.121',
    env: 'CLAUDE_CODE_2_1_121_BUNDLE',
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
    count: 0,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    count: 1,
  },
]

function readBundle(release) {
  const filename = process.env[release.env]
  assert.ok(filename, `${release.env} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return bytes.toString('utf8')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

test('authenticates target-only Bash arithmetic and find guards', () => {
  const witnesses = [
    'operand contains array subscript or runtime-determined value',
    'zsh arith-evals identifiers (may run',
    'bash arithmetically evaluates identifiers/subscripts (may run',
    'find argument is runtime-determined',
    '-files0-from',
    '-xattrname',
  ]
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const witness of witnesses) {
      assert.equal(
        occurrences(bundle, witness),
        release.count,
        `${release.version}: ${witness}`,
      )
    }
  }
})

test('source fails closed for dynamic arithmetic and find arguments', () => {
  const ast = compact(
    fs.readFileSync(path.join(repo, 'src/utils/bash/ast.ts'), 'utf8'),
  )
  for (const fragment of [
    "test: new Set(['-v', '-R', '-t'])",
    "'[': new Set(['-v', '-R', '-t'])",
    "'[[': new Set(['-v', '-R', '-t'])",
    'const TEST_ARITH_LITERAL_RE = /^-?(0[xX][0-9a-fA-F]+|[0-9]+#[0-9a-zA-Z]+|[0-9]+)$/',
    "const isTestLike = name === 'test' || name === '[' || name === '[['",
    'nextArg.includes(\'[\') || containsAnyPlaceholder(nextArg)',
    'zsh arith-evals identifiers (may run $(cmd))',
    '!TEST_ARITH_LITERAL_RE.test(operand)',
    'bash arithmetically evaluates identifiers/subscripts (may run $(cmd))',
    "if (name === 'find')",
    'FIND_ARGUMENT_PREDICATES.has(arg)',
    'if (containsAnyPlaceholder(arg))',
    'find argument is runtime-determined',
    "'-files0-from'",
    "'-xattrname'",
  ]) {
    assert.ok(ast.includes(compact(fragment)), `src/utils/bash/ast.ts: ${fragment}`)
  }

  const readOnly = fs.readFileSync(
    path.join(repo, 'src/tools/BashTool/readOnlyValidation.ts'),
    'utf8',
  )
  assert.ok(readOnly.includes("'-files0-from'"))
  assert.ok(readOnly.includes("'-xattrname'"))
})
