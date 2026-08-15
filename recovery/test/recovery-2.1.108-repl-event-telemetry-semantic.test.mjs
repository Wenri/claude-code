import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.107-to-2.1.108'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_107_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_108_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_107_BUNDLE and CLAUDE_CODE_2_1_108_BUNDLE are required'
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
const units = new Map([
  [4894, [3683275, 3683765, 'FunctionDeclaration', '027c981eb28a7c27a886942d6f51bb9d049e3d1ab981847fbe6316f445e94a74']],
  [4899, [3684068, 3697038, 'VariableDeclaration', 'b73360bde7a766e6c4ac59ab1b47c07a2c92ff5d69e2202ec9e6b20fcc2d609d']],
  [4961, [3713592, 3721017, 'ClassDeclaration', 'ead466eec50aa6d2b489ff7f2310d6a417c7b2e7c3a35a3c6dccc63c47bd96e9']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test('target108 pins the generated repl_code field and first-party exporter', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(
    sha256(baselineBytes),
    '6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844',
  )
  assert.equal(
    sha256(targetBytes),
    'dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73',
  )
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')
  assert.equal(baseline.includes('_PROTO_code'), false)
  assert.equal(baseline.includes('repl_code'), false)
  for (const [index, identity] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.nodeType, region.target.sourceHash],
      identity,
      `${index}: structural identity`,
    )
    assert.equal(
      sha256(target.slice(identity[0], identity[1])),
      identity[3],
      `${index}: bytes`,
    )
  }
  const generated = target.slice(3683275, 3697038)
  for (const fragment of [
    'repl_code:""',
    'repl_code:',
    '.repl_code!==void 0',
  ]) assert.ok(generated.includes(fragment), fragment)
  const exporter = target.slice(3713592, 3721017)
  assert.ok(exporter.includes('_PROTO_code'))
  assert.ok(exporter.includes('repl_code:'))
})

test('source serializes repl_code and removes its privileged input from metadata', sourceOptions, () => {
  const generated = source(
    'types/generated/events_mono/claude_code/v1/claude_code_internal_event.ts',
  )
  for (const fragment of [
    'repl_code?: string | undefined',
    "repl_code: '',",
    'isSet(object.repl_code)',
    'obj.repl_code = message.repl_code',
    "message.repl_code = object.repl_code ?? ''",
  ]) assert.ok(generated.includes(fragment), fragment)

  const exporter = source(
    'services/analytics/firstPartyEventLoggingExporter.ts',
  )
  for (const fragment of [
    '_PROTO_code,',
    "typeof _PROTO_code === 'string' ? _PROTO_code : undefined",
    'const additionalMetadata = stripProtoFields(rest)',
  ]) assert.ok(exporter.includes(fragment), fragment)
})
