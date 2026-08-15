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
const historical = semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_111_BUNDLE
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

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_110_BUNDLE and CLAUDE_CODE_2_1_111_BUNDLE are required'
      : false,
}

const units = new Map([
  [9553, ['FunctionDeclaration', 6993612, 6994136, '8f4f588bdad9495cb918ec108a4d35acfd3a706c05b5207274fe5b79b1c1f9ca']],
  [9557, ['FunctionDeclaration', 6994240, 6994798, '99b55d9774f62e9ed1191f0eee5c3860cfc6ba2532f27aef1bf8d00977682570']],
  [9561, ['FunctionDeclaration', 6995569, 6997026, '821a087765ff9539589fd746e3128d6e80d32a125e23dc73ac4e68d9a6bf85e4']],
  [9566, ['FunctionDeclaration', 6998461, 6999707, 'd73862ce82de1d77b62bdf822238762053f4b2a16d0092aad04549c30874583c']],
  [9567, ['FunctionDeclaration', 6999707, 7000785, '0269b5257bf4733a0b2f39aaf9e0a933133bdab4c523353d4e3200aa2620aeca']],
  [9585, ['FunctionDeclaration', 7011552, 7013271, 'a3d0af5e8a334d3a7a01b6dc9f57ac13a2b1ef6ee2ce3816af5eadbae0d40a8d']],
  [13530, ['FunctionDeclaration', 9889383, 9893814, '3bba5409cde5ecd4eef9b46e472a2397660e6d6c163560ab455145612ebd58bb']],
  [13562, ['FunctionDeclaration', 9915199, 9916582, '4f862181d35752b4797a64d008bacfe5230dda80cbb932596c0213208b3b29b7']],
  [13565, ['FunctionDeclaration', 9916872, 9917392, '0c231707a5547878e93132685f2844bdd8bb3fb341fbd6fc712a8fee6d1145c0']],
  [13597, ['FunctionDeclaration', 9925489, 9930598, '52aac15653e0048a08dd1f9ea64488b891a00e6697038246c2c6fa6bfd7b5403']],
  [13601, ['VariableDeclaration', 9930888, 9932681, '12517555d10ecdb110c81853223fd6bf3c717c195e7ea812d0cc71010beafa6f']],
])

const introducedKinds = new Map([
  ['sed-dangerous', 1],
  ['dangerous-path', 1],
  ['flag-validation', 1],
  ['cd-compound-write', 1],
  ['cd-compound-redirect', 1],
  ['process-substitution', 1],
  ['net-redirect', 1],
  ['shell-expansion', 1],
  ['multi-cd', 2],
  ['cd-git-compound', 2],
  ['shell-operators', 1],
  ['prompt-ask-rule', 1],
  ['no-rule-match', 2],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test('2.1.111 authenticates every Bash miss-kind and relay-gate structural unit', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
  )
  assert.equal(
    sha256(targetBytes),
    '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0',
  )
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  for (const [index, [nodeType, start, end, sourceHash]] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.equal(region.target.nodeType, nodeType, `${index}: node type`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(target.slice(start, end)), sourceHash, `${index}: bytes`)
  }

  for (const [kind, count] of introducedKinds) {
    assert.equal(occurrences(baseline, kind), 0, `baseline: ${kind}`)
    assert.equal(occurrences(target, kind), count, `target: ${kind}`)
  }
  assert.equal(occurrences(baseline, 'tengu_relay_chain_v1'), 0)
  assert.equal(occurrences(target, 'tengu_relay_chain_v1'), 1)
  const readOnlyUnit = target.slice(7011552, 7013271)
  assert.match(readOnlyUnit, /parse\(.*kind:"simple".*too-complex/s)
  assert.match(readOnlyUnit, /Windows UNC path/)
  assert.match(readOnlyUnit, /redirects.*envVars.*argv.*glob/s)
  assert.match(
    target.slice(9889383, 9893814),
    /tengu_relay_chain_v1.*When issuing multiple commands/s,
  )
})

test('source owns the complete target111 Bash diagnostics and AST read-only flow', sourceOptions, () => {
  const owners = new Map([
    ['tools/BashTool/sedValidation.ts', ['sed-dangerous']],
    ['tools/BashTool/pathValidation.ts', [
      'flag-validation',
      'cd-compound-write',
      'cd-compound-redirect',
      'process-substitution',
      'net-redirect',
      'shell-expansion',
    ]],
    ['tools/BashTool/bashCommandHelpers.ts', [
      'multi-cd',
      'cd-git-compound',
      'shell-operators',
    ]],
    ['tools/BashTool/bashPermissions.ts', [
      'too-complex',
      'semantics',
      'prompt-ask-rule',
      'no-rule-match',
    ]],
  ])
  for (const [relative, kinds] of owners) {
    const contents = source(relative)
    for (const kind of kinds) {
      assert.ok(contents.includes(`'${kind}'`), `${relative}: ${kind}`)
    }
  }

  const prompt = source('tools/BashTool/prompt.ts')
  assert.match(
    prompt,
    /getFeatureValue_CACHED_MAY_BE_STALE\(\s*'tengu_relay_chain_v1',\s*false,?\s*\)\s*\? \[\]\s*: \[/s,
  )
  assert.ok(prompt.includes('...multipleCommandsItems'))

  const readOnly = source('tools/BashTool/readOnlyValidation.ts')
  for (const fragment of [
    'getParserModule()?.parse(command)',
    'parseForSecurityFromAst(command, root)',
    "astResult.kind === 'too-complex'",
    'READ_ONLY_REDIRECT_OPERATORS.has(redirect.op)',
    "^\\/dev\\/(tcp|udp)\\//",
    'isSafeEnvironmentVariable(variable.name)',
    'containsVulnerableUncPath(argument)',
    'classifySpecialReadOnlyArgv(parsedCommand.argv)',
  ]) {
    assert.ok(readOnly.includes(fragment), `readOnlyValidation.ts: ${fragment}`)
  }

  const pathOwner = source('tools/BashTool/pathValidation.ts')
  if (historical) {
    assert.ok(pathOwner.includes("bashMissKind: 'dangerous-path'"))
    assert.equal(pathOwner.includes('classifierApprovable: false'), false)
  } else {
    assert.equal(pathOwner.includes("bashMissKind: 'dangerous-path'"), false)
    assert.ok(pathOwner.includes('classifierApprovable: false'))
  }
})
