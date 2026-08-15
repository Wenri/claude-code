import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const introCase = '2.1.110-to-2.1.111'
const renameCase = '2.1.112-to-2.1.113'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected =
  !semanticCase || semanticCase === introCase || semanticCase === renameCase
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)

const artifacts = {
  target110: process.env.CLAUDE_CODE_2_1_110_BUNDLE,
  target111: process.env.CLAUDE_CODE_2_1_111_BUNDLE,
  target112: process.env.CLAUDE_CODE_2_1_112_BUNDLE,
  target113: process.env.CLAUDE_CODE_2_1_113_BUNDLE,
  target116: process.env.CLAUDE_CODE_2_1_116_BUNDLE,
}
const artifactHashes = {
  target110:
    'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
  target111:
    '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0',
  target112:
    'bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f',
  target113:
    '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba',
  target116:
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
}
const introUnits = [
  {
    index: 19002,
    nodeType: 'FunctionDeclaration',
    start: 12833575,
    end: 12833950,
    sourceHash:
      '2ede25ccdccb0dfac07e1e45c1872636f57e74cb9596aaae07bce58c37712c97',
  },
  {
    index: 19003,
    nodeType: 'VariableDeclaration',
    start: 12833950,
    end: 12841441,
    sourceHash:
      '06f47dbdfed9920eb41fa38c44e8b9182447ba2eb3c3d537e5ca6f1e399f302e',
  },
]
const renameUnits = [
  {
    index: 19952,
    nodeType: 'FunctionDeclaration',
    start: 12158672,
    end: 12159048,
    sourceHash:
      '28803254605fc42471f33e888542fa21c602db8e548dcc0af980b7e541edd88b',
  },
  {
    index: 19953,
    nodeType: 'VariableDeclaration',
    start: 12159048,
    end: 12166585,
    sourceHash:
      '17f89b3a5a58087fa709fbc2dc143df2873c326829c1a65069abe544a6d8dd3e',
  },
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function structural(caseName) {
  return JSON.parse(
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
}

function pinUnits(bundle, ledger, units) {
  for (const unit of units) {
    const region = ledger.regions[unit.index]
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
    assert.equal(
      sha256(bundle.slice(unit.start, unit.end)),
      unit.sourceHash,
      `target structural unit ${unit.index}`,
    )
  }
}

test(
  'target111 authenticates the initial less-permission-prompts skill',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !artifacts.target110 || !artifacts.target111
        ? 'authenticated target110 and target111 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(artifacts.target110)
    const targetBytes = fs.readFileSync(artifacts.target111)
    assert.equal(sha256(baselineBytes), artifactHashes.target110)
    assert.equal(sha256(targetBytes), artifactHashes.target111)
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    pinUnits(target, structural(introCase), introUnits)
    assert.equal(baseline.includes('less-permission-prompts'), false)
    assert.equal(baseline.includes('# Less Permission Prompts'), false)
    assert.equal(target.split('less-permission-prompts').length - 1, 1)
    assert.equal(target.split('# Less Permission Prompts').length - 1, 1)
  },
)

test(
  'target113 authenticates the fewer-permission-prompts rename retained by target116',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !artifacts.target112 || !artifacts.target113 || !artifacts.target116
        ? 'authenticated target112, target113, and target116 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(artifacts.target112)
    const targetBytes = fs.readFileSync(artifacts.target113)
    const latestBytes = fs.readFileSync(artifacts.target116)
    assert.equal(sha256(baselineBytes), artifactHashes.target112)
    assert.equal(sha256(targetBytes), artifactHashes.target113)
    assert.equal(sha256(latestBytes), artifactHashes.target116)
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const latest = latestBytes.toString('utf8')
    pinUnits(target, structural(renameCase), renameUnits)
    assert.equal(baseline.split('less-permission-prompts').length - 1, 1)
    assert.equal(baseline.includes('fewer-permission-prompts'), false)
    for (const value of ['fewer-permission-prompts', '# Fewer Permission Prompts']) {
      assert.equal(target.split(value).length - 1, 1)
      assert.equal(latest.split(value).length - 1, 1)
    }
    assert.equal(target.includes('less-permission-prompts'), false)
    assert.equal(latest.includes('less-permission-prompts'), false)
  },
)

async function loadTypeScript() {
  const candidates = [
    path.resolve(
      path.dirname(process.execPath),
      '../lib/node_modules/typescript/lib/typescript.js',
    ),
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate, 'the pinned TypeScript compiler must be available')
  const module = await import(pathToFileURL(candidate).href)
  return module.default ?? module
}

test(
  'source registers the boundary-correct skill and appends user instructions',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const expectedOld = semanticCase === introCase
    const expectedName = expectedOld
      ? 'less-permission-prompts'
      : 'fewer-permission-prompts'
    const expectedHeader = expectedOld
      ? '# Less Permission Prompts'
      : '# Fewer Permission Prompts'
    const owner = fs.readFileSync(
      path.join(sourceRoot, 'skills/bundled/lessPermissionPrompts.ts'),
      'utf8',
    )
    const registry = fs.readFileSync(
      path.join(sourceRoot, 'skills/bundled/index.ts'),
      'utf8',
    )
    assert.equal(owner.split(`name: '${expectedName}'`).length - 1, 1)
    assert.equal(owner.split(`"${expectedHeader}"`).length - 1, 1)
    assert.match(registry, /registerLessPermissionPromptsSkill\(\)/)

    const ts = await loadTypeScript()
    const javascript = ts.transpileModule(owner, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText
    let descriptor
    const module = { exports: {} }
    new Function('exports', 'module', 'require', javascript)(
      module.exports,
      module,
      request => {
        assert.equal(request, '../bundledSkills.js')
        return { registerBundledSkill: value => (descriptor = value) }
      },
    )
    module.exports.registerLessPermissionPromptsSkill()
    assert.equal(descriptor.name, expectedName)
    assert.equal(descriptor.userInvocable, true)
    const [prompt] = await descriptor.getPromptForCommand('Prefer narrow rules')
    assert.ok(prompt.text.startsWith(expectedHeader))
    assert.ok(
      prompt.text.endsWith(
        '## Additional instructions from the user\n\nPrefer narrow rules',
      ),
    )
  },
)
