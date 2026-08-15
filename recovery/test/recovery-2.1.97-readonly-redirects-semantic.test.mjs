import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.96-to-2.1.97'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_96_BUNDLE
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
      : false,
}
const adjacentOptions = {
  skip:
    bundleOptions.skip || !baselineBundlePath
      ? bundleOptions.skip || 'CLAUDE_CODE_2_1_96_BUNDLE is not set'
      : false,
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

test('target97 pins the parsed-command redirect and environment delta', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(bytes),
    '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988',
  )
  const expected = new Map([
    [7822, [6523878, 6525475, 'b7e4a2dfbcc7f72eb3e1edc6193a48c7ec22d5eb89667dd3f3ad7c74f3cadbe9']],
    [7823, [6525475, 6525535, '206966b5785e394f85d968d8993388bf06edab787fa5fcad42b775aa3c38b413']],
    [7824, [6525535, 6540956, '47cedb57bce473293db6ad68d9e12362fc1439099b17afa73d714cf020f2688b']],
  ])
  const bundle = bytes.toString('utf8')
  for (const [index, identity] of expected) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
    )
    assert.equal(
      sha256(bundle.slice(region.target.start, region.target.end)),
      region.target.sourceHash,
    )
  }
  const decision = bundle.slice(
    structural.regions[7822].target.start,
    structural.regions[7822].target.end,
  )
  for (const fragment of [
    '.redirects.some(',
    '.target!=="/dev/null"',
    '.op===">&"&&/^\\d+$/.test(',
    '/^\\/dev\\/(tcp|udp)\\//',
    '.envVars.some(',
    '.argv.some(',
  ]) {
    assert.ok(decision.includes(fragment), fragment)
  }
  const initializer = bundle.slice(
    structural.regions[7824].target.start,
    structural.regions[7824].target.end,
  )
  assert.ok(initializer.includes('new Set(["<","<<","<&","<<<"])'))
})

test('source validates parsed redirects, network devices, and environment names', sourceOptions, () => {
  const source = fs.readFileSync(
    path.join(sourceRoot, 'tools/BashTool/readOnlyValidation.ts'),
    'utf8',
  )
  for (const fragment of [
    "import { parseForSecurityFromAst } from '../../utils/bash/ast.js'",
    "import { getParserModule } from '../../utils/bash/bashParser.js'",
    "const READ_ONLY_REDIRECT_OPERATORS = new Set(['<', '<<', '<&', '<<<'])",
    'parseForSecurityFromAst(command, root)',
    "redirect.target !== '/dev/null'",
    "redirect.op === '>&' && /^\\d+$/.test(redirect.target)",
    '/^\\/dev\\/(tcp|udp)\\//.test(redirect.target)',
    'variable => !isSafeEnvironmentVariable(variable.name)',
    'classifySpecialReadOnlyArgv(parsedCommand.argv)',
  ]) {
    assert.ok(source.includes(fragment), fragment)
  }
  if (semanticCase === caseName) {
    assert.ok(
      source.includes('Command contains unquoted glob or variable expansion'),
    )
    assert.ok(
      source.includes(
        'return !argv.some(argument => FIND_DANGEROUS_PREDICATES.has(argument))',
      ),
    )
  } else {
    assert.ok(source.includes('FIND_DANGEROUS_PREDICATES.has(arg)'))
  }
})

test('2.1.96 has the AST base but not the target97 redirect set', adjacentOptions, () => {
  const bytes = fs.readFileSync(baselineBundlePath)
  assert.equal(
    sha256(bytes),
    '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e',
  )
  const bundle = bytes.toString('utf8')
  assert.ok(bundle.includes('Not a simple read-only command:'))
  assert.ok(bundle.includes('Command contains unquoted glob or variable expansion'))
  assert.equal(bundle.includes('new Set(["<","<<","<&","<<<"])'), false)
})
