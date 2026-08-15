import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath || !latestPath
      ? 'authenticated 2.1.104, 2.1.105, and 2.1.116 bundles are required'
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
  [
    12289,
    [
      'unresolved',
      9498774,
      9498901,
      'FunctionDeclaration',
      '69f15cf4d8d0321c239d02979644b22c755d40fab76e6f81c8fa2b16f9a8281c',
    ],
  ],
  [
    12290,
    [
      'unresolved',
      9498901,
      9499036,
      'FunctionDeclaration',
      'ff100977f830fc54e35c37c635d161564789ebe2adcd7d0b0b40cde4a4ff12a6',
    ],
  ],
  [
    12291,
    [
      'unresolved',
      9499036,
      9499057,
      'FunctionDeclaration',
      'cae11220ff43a8e2b421b3d308ac0a9663f6887d7375672c5293de78cc7f8e54',
    ],
  ],
  [
    12292,
    [
      'moved',
      9499057,
      9499125,
      'FunctionDeclaration',
      '55d58a2c02792e94a7108b1b12a275eaa57547dedaa5cdfe41e6f02b7d4786a7',
    ],
  ],
  [
    12293,
    [
      'unresolved',
      9499125,
      9499556,
      'FunctionDeclaration',
      '03e7e115aebc9de022eb83393212ca754306871df61313384c2cb4a2ed7423ad',
    ],
  ],
  [
    12294,
    [
      'unresolved',
      9499556,
      9500297,
      'FunctionDeclaration',
      '045d4303412eba82323b89d6b29f466fe9acc929fc38e5e3114e7d77b7d1ea60',
    ],
  ],
  [
    12295,
    [
      'unresolved',
      9500297,
      9500357,
      'FunctionDeclaration',
      '009c0f487745122fb4266098b6a9e04c4cefe4537c03f3b8b08ecb1217c6685c',
    ],
  ],
  [
    12296,
    [
      'unresolved',
      9500357,
      9501052,
      'FunctionDeclaration',
      'f8b625a717dd164e5a0953b35a28629be8d2766fbc66df7bd22a14b7a6976ccc',
    ],
  ],
  [
    12297,
    [
      'unresolved',
      9501052,
      9501191,
      'FunctionDeclaration',
      '8fbe6748d4c87669c46a995e987c8b6c69568fb366ff9949724e1b69c9cafa99',
    ],
  ],
  [
    12298,
    [
      'moved',
      9501191,
      9501210,
      'VariableDeclaration',
      '42b671c552e56ffc15445a091a8cbe78c62be1bcb73bfdfc8bdf439338953afd',
    ],
  ],
  [
    12299,
    [
      'unresolved',
      9501210,
      9503408,
      'VariableDeclaration',
      '1c26be74ca9ac07d0599572d84e58013561dea37eb44e1f2cee390f8a87e0c68',
    ],
  ],
  [
    18999,
    [
      'unresolved',
      13494766,
      13496692,
      'FunctionDeclaration',
      '8f4fa9e296eb33e1d8e3ec025e09e176ec04375e06f3617e5879cae07c199435',
    ],
  ],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
}

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

async function parseOwner(contents) {
  const ts = await loadTypeScript()
  return {
    ts,
    tree: ts.createSourceFile(
      'loadSkillsDir.ts',
      contents,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    ),
  }
}

async function executeSkillStateOwner(contents) {
  const { ts, tree } = await parseOwner(contents)
  const selectedNames = new Set([
    'SkillState',
    'createSkillState',
    'skillState',
    'setSkillState',
    'getDynamicSkills',
    'getConditionalSkillCount',
    'clearDynamicSkills',
  ])
  const declarations = tree.statements.filter(statement => {
    if (
      (ts.isTypeAliasDeclaration(statement) ||
        ts.isFunctionDeclaration(statement)) &&
      statement.name
    ) {
      return selectedNames.has(statement.name.text)
    }
    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.some(declaration =>
        selectedNames.has(declaration.name.getText(tree)),
      )
    }
    return false
  })
  assert.equal(declarations.length, 7, 'all state declarations are executable')
  const typescript = declarations.map(node => node.getText(tree)).join('\n')
  const javascript = ts.transpileModule(typescript, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const module = { exports: {} }
  new Function('exports', 'module', javascript)(module.exports, module)
  return module.exports
}

function stateFactoryAndSetter(bundle) {
  return bundle.match(
    /function (\w+)\(\)\{return\{dynamicSkillDirs:new Set,dynamicSkills:new Map,conditionalSkills:new Map,activatedConditionalSkillNames:new Set\}\}function (\w+)\((\w+)\)\{(\w+)=\3\}/,
  )
}

test(
  'authenticated target105 pins the complete skill-state migration and MCP reset call',
  bundleOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(baselineBytes),
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    )
    assert.equal(
      sha256(targetBytes),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )

    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const latest = latestBytes.toString('utf8')
    for (const [index, identity] of units) {
      const region = structural.regions[index]
      assert.deepEqual(
        [
          region.classification,
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        identity,
        `${index}: structural identity`,
      )
      assert.equal(
        sha256(target.slice(identity[1], identity[2])),
        identity[4],
        `${index}: exact target bytes`,
      )
    }

    assert.equal(occurrences(baseline, 'dynamicSkillDirs:new Set'), 0)
    assert.equal(occurrences(target, 'dynamicSkillDirs:new Set'), 1)
    assert.equal(occurrences(latest, 'dynamicSkillDirs:new Set'), 1)

    for (const [name, bundle] of [
      ['target105', target],
      ['target116', latest],
    ]) {
      const match = stateFactoryAndSetter(bundle)
      assert.ok(match, `${name}: state factory and setter`)
      const [, factoryName, setterName, , stateName] = match
      assert.equal(
        occurrences(bundle, `${setterName}(${factoryName}())`),
        1,
        `${name}: one MCP state reset`,
      )
      assert.ok(
        bundle.indexOf(`${stateName}.dynamicSkillDirs`, match.index) >
          match.index,
        `${name}: discovery reads the state object`,
      )
      assert.ok(
        bundle.indexOf(`${stateName}.conditionalSkills`, match.index) >
          match.index,
        `${name}: conditional loading reads the state object`,
      )
    }

    const targetMcp = target.slice(13494766, 13496692)
    const targetMatch = stateFactoryAndSetter(target)
    assert.ok(targetMatch)
    assert.match(
      targetMcp,
      new RegExp(
        `^function \\w+\\([^)]*\\)\\{${targetMatch[2]}\\(${targetMatch[1]}\\(\\)\\);let`,
      ),
    )
  },
)

test(
  'source owner uses one replaceable state object for every dynamic and conditional collection',
  sourceOptions,
  async () => {
    const contents = source('skills/loadSkillsDir.ts')
    const { ts, tree } = await parseOwner(contents)
    const topLevelVariables = tree.statements
      .filter(ts.isVariableStatement)
      .flatMap(statement => statement.declarationList.declarations)
      .map(declaration => declaration.name.getText(tree))
    for (const formerGlobal of [
      'dynamicSkillDirs',
      'dynamicSkills',
      'conditionalSkills',
      'activatedConditionalSkillNames',
    ]) {
      assert.equal(topLevelVariables.includes(formerGlobal), false, formerGlobal)
    }
    assert.equal(topLevelVariables.includes('skillState'), true)

    for (const fragment of [
      'export function createSkillState(): SkillState',
      'dynamicSkillDirs: new Set()',
      'dynamicSkills: new Map()',
      'conditionalSkills: new Map()',
      'activatedConditionalSkillNames: new Set()',
      'let skillState = createSkillState()',
      'export function setSkillState(state: SkillState): void',
      'skillState = state',
      'skillState.dynamicSkillDirs.has(skillDir)',
      'skillState.dynamicSkills.set(skill.name, skill)',
      'skillState.conditionalSkills.delete(name)',
      'skillState.activatedConditionalSkillNames.add(name)',
    ]) {
      assert.ok(contents.includes(fragment), fragment)
    }
  },
)

test(
  'replacing the actual source state isolates maps and reset operations',
  sourceOptions,
  async () => {
    const owner = await executeSkillStateOwner(source('skills/loadSkillsDir.ts'))
    const first = owner.createSkillState()
    const second = owner.createSkillState()
    assert.notEqual(first.dynamicSkills, second.dynamicSkills)
    assert.notEqual(first.conditionalSkills, second.conditionalSkills)

    first.dynamicSkills.set('first', { name: 'first' })
    first.conditionalSkills.set('waiting', { name: 'waiting' })
    owner.setSkillState(first)
    assert.deepEqual(
      owner.getDynamicSkills().map(skill => skill.name),
      ['first'],
    )
    assert.equal(owner.getConditionalSkillCount(), 1)

    second.dynamicSkills.set('second', { name: 'second' })
    owner.setSkillState(second)
    assert.deepEqual(
      owner.getDynamicSkills().map(skill => skill.name),
      ['second'],
    )
    assert.equal(owner.getConditionalSkillCount(), 0)
    owner.clearDynamicSkills()
    assert.deepEqual(owner.getDynamicSkills(), [])
    assert.equal(first.dynamicSkills.has('first'), true)
    assert.equal(first.conditionalSkills.has('waiting'), true)
  },
)

const mcpContents = selected ? source('entrypoints/mcp.ts') : ''
const mcpSourceOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !mcpContents.includes('export function createMCPServer')
      ? 'the isolated target105 Git source requires the transitive target101 MCP-factory supplement'
      : false,
}

test(
  'MCP factory resets skill state before constructing its file cache or server',
  mcpSourceOptions,
  async () => {
    const { ts, tree } = await parseOwner(mcpContents)
    const declaration = tree.statements.find(
      node =>
        ts.isFunctionDeclaration(node) &&
        node.name?.text === 'createMCPServer',
    )
    assert.ok(declaration?.body, 'createMCPServer declaration')
    assert.equal(
      declaration.body.statements[0].getText(tree),
      'setSkillState(createSkillState())',
    )
    assert.match(
      mcpContents,
      /import \{ createSkillState, setSkillState \} from ['"]\.\.\/skills\/loadSkillsDir\.js['"]/,
    )
  },
)
