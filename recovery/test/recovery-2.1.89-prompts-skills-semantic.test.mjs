import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.88-to-2.1.89'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const historicalSource = semanticCase === caseName
const semanticSourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const caseRoot = path.join(
  repositoryRoot,
  'recovery/cases/2.1.88-to-2.1.89',
)
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(path.join(caseRoot, 'structural/generated-delta.json.gz')),
  ),
)
const ledgerPath = path.join(
  caseRoot,
  'semantic/prompts-skills-ledger-fragment.json',
)
const targetBundlePath = process.env.CLAUDE_CODE_2_1_89_BUNDLE
const latestBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const TARGET_SHA256 =
  'a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(semanticSourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function requiredTargetBundle() {
  assert.ok(
    targetBundlePath,
    'CLAUDE_CODE_2_1_89_BUNDLE environment variable must be set',
  )
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), TARGET_SHA256)
  return bytes.toString('utf8')
}

function targetUnit(bundle, index) {
  const { start, end } = structural.regions[index].target
  return bundle.slice(start, end)
}

function walk(value, visit) {
  if (value === null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const child of value) walk(child, visit)
    return
  }
  if (typeof value.type === 'string') visit(value)
  for (const [key, child] of Object.entries(value)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
      walk(child, visit)
    }
  }
}

function cookedTemplates(javascript) {
  const ast = parse(javascript, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const values = []
  walk(ast, node => {
    if (node.type === 'TemplateElement') values.push(node.value.cooked)
  })
  return values
}

function sourceTemplate(relative, name) {
  const text = source(relative)
  const marker = `const ${name} = \``
  const markerStart = text.indexOf(marker)
  assert.ok(markerStart >= 0, `${relative}: ${name}`)
  const start = markerStart + marker.length
  let escaped = false
  for (let end = start; end < text.length; end++) {
    const char = text[end]
    if (char === '\\' && !escaped) {
      escaped = true
      continue
    }
    if (char === '`' && !escaped) {
      const literal = text.slice(start - 1, end + 1)
      const [value] = cookedTemplates(`const recovered = ${literal};`)
      assert.equal(typeof value, 'string')
      return value
    }
    escaped = false
  }
  assert.fail(`${relative}: unterminated ${name}`)
}

function sourceString(relative, name) {
  const text = source(relative)
  const markerStart = text.indexOf(`const ${name}`)
  assert.ok(markerStart >= 0, `${relative}: ${name}`)
  const equals = text.indexOf('=', markerStart)
  const quote = text.indexOf("'", equals)
  assert.ok(quote >= 0, `${relative}: ${name} initializer`)
  let escaped = false
  for (let end = quote + 1; end < text.length; end++) {
    const char = text[end]
    if (char === '\\' && !escaped) {
      escaped = true
      continue
    }
    if (char === "'" && !escaped) {
      const ast = parse(
        `const recovered = ${text.slice(quote, end + 1)};`,
        { ecmaVersion: 'latest' },
      )
      return ast.body[0].declarations[0].init.value
    }
    escaped = false
  }
  assert.fail(`${relative}: unterminated ${name}`)
}

function loadedTextAsset(relative) {
  const text = source(relative)
  return text.endsWith('\n') ? text.slice(0, -1) : text
}

const pinned = new Map([
  [
    8727,
    [
      6926389,
      6940343,
      'VariableDeclaration',
      '78bfec3dd67c540fc757fa331b88af529a014780ef05e891cdeead58931bc6cb',
    ],
  ],
  [
    8765,
    [
      6953835,
      6954382,
      'VariableDeclaration',
      '259ecbfd94b3544e43f854a9619d0a59596df5fd3c110cea4abd982d27868442',
    ],
  ],
  [
    12314,
    [
      9552764,
      9557650,
      'VariableDeclaration',
      'c6d35b1ce4552297fd672703dfd6617b08dfac09530430e94c20b4516a56da55',
    ],
  ],
  [
    8991,
    [
      7023461,
      7024463,
      'FunctionDeclaration',
      '7f5c89bfbc3dbda92c317d44e656fa0043f6a2c232e3cc179d82cee9556c6fb0',
    ],
  ],
  [
    13172,
    [
      9920055,
      9920557,
      'FunctionDeclaration',
      'afc8ef272482fde2ce370b5d5ab85b945e14cfabcab14c6006aecfc1126f74a2',
    ],
  ],
  [
    13173,
    [
      9920557,
      9920580,
      'VariableDeclaration',
      'b553653d0a5975218412e11e35c183c511328fd2b0be0c8b8d0ea29ee96f56ca',
    ],
  ],
  [
    15515,
    [
      11333533,
      11334749,
      'FunctionDeclaration',
      '27a559874e00b378ce4b81f3569a034ac607516dc152a2fd86e22b52e1b8fff6',
    ],
  ],
  [
    17789,
    [
      12492630,
      12503472,
      'VariableDeclaration',
      'bec547b3d3fc3644482e2ac9c3b52ea94064d91a940018c050ebdf4521499786',
    ],
  ],
  [
    17854,
    [
      12711729,
      12721546,
      'VariableDeclaration',
      '308e313f079beb3f69a91801aaee98a1e7f6e6c0cc08808b926268c8c1801ddb',
    ],
  ],
])

test('prompt/skill evidence pins all nine owned unresolved 2.1.89 units', () => {
  const bundle = requiredTargetBundle()
  for (const [index, [start, end, nodeType, sourceHash]] of pinned) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.sourceHash,
      ],
      [start, end, nodeType, sourceHash],
    )
    assert.equal(sha256(bundle.slice(start, end)), sourceHash)
  }
})

test('permission assets and all classifier suffixes reproduce cooked target values', () => {
  if (!historicalSource) return
  const bundle = requiredTargetBundle()
  const baseRegion = structural.regions[8726]
  assert.equal(baseRegion.classification, 'matched')
  assert.equal(
    baseRegion.target.sourceHash,
    '87aefad9639f01c8ea4de494928ad9dc944f352c523c117ec34608546893a707',
  )

  const [basePrompt] = cookedTemplates(targetUnit(bundle, 8726))
  const [externalPermissions] = cookedTemplates(targetUnit(bundle, 8727))
  const suffixes = cookedTemplates(targetUnit(bundle, 8765))
  assert.equal(
    basePrompt,
    loadedTextAsset(
      'src/utils/permissions/yolo-classifier-prompts/auto_mode_system_prompt.txt',
    ),
  )
  assert.equal(
    externalPermissions,
    loadedTextAsset(
      'src/utils/permissions/yolo-classifier-prompts/permissions_external.txt',
    ),
  )
  assert.deepEqual(
    suffixes.map(sha256),
    [
      '85dae75f569b2408e751794c73718cc09ae245113bdca0ea7d4909776e92583e',
      'edec38c278f625d492b2dc6abf0b39e2680eaa86b244ccfdc43bde6b25bbaca0',
      '5ea989ec20d31e6ff05b6284dbea864c2dafc56bc573ea6c20128b89cf47be60',
    ],
  )
  assert.deepEqual(suffixes, [
    sourceString('src/utils/permissions/yoloClassifier.ts', 'XML_S1_SUFFIX'),
    sourceString(
      'src/utils/permissions/yoloClassifier.ts',
      'XML_S1_TWO_STAGE_SUFFIX',
    ),
    sourceString('src/utils/permissions/yoloClassifier.ts', 'XML_S2_SUFFIX'),
  ])
  assert.equal(
    sha256(
      source(
        'src/utils/permissions/yolo-classifier-prompts/auto_mode_system_prompt.txt',
      ),
    ),
    '55668582a2b929d2c0952a2d226cda1115dc70af4c0210627056a56cf26f503d',
  )
  assert.equal(
    sha256(
      source(
        'src/utils/permissions/yolo-classifier-prompts/permissions_external.txt',
      ),
    ),
    '59e2abc207d85d38da84c62482813913f2338c2d8c5909b1363759262b05b79f',
  )
})

test('external classifier build proves the unavailable Anthropic prompt branch is DCE', () => {
  if (!historicalSource) return
  const bundle = requiredTargetBundle()
  const classifier = source('src/utils/permissions/yoloClassifier.ts')
  assert.ok(bundle.includes('function $Xz(){return!0}'))
  assert.ok(bundle.includes('YXz=""'))
  assert.ok(bundle.includes('Vx4=kx4(Px4()),lF1=kx4(Wx4())'))
  assert.ok(bundle.includes('text:w==="both"?MXz:JXz'))
  assert.match(
    classifier,
    /text: mode === 'both' \? XML_S1_TWO_STAGE_SUFFIX : XML_S1_SUFFIX/,
  )
  assert.ok(classifier.includes("process.env.USER_TYPE === 'ant'"))
  assert.ok(classifier.includes("permissions_anthropic.txt"))
  assert.equal(
    fs.existsSync(
      path.join(
        repositoryRoot,
        'src/utils/permissions/yolo-classifier-prompts/permissions_anthropic.txt',
      ),
    ),
    false,
  )
})

test('canonical literal residue static-null branches are pinned in the target', () => {
  const bundle = requiredTargetBundle()
  assert.ok(bundle.includes('tengu_message_rated'))
  assert.ok(bundle.includes('message-rated'))
  assert.ok(bundle.includes('thanks for improving claude!'))
  assert.ok(bundle.includes('u=x==="auto"||x==="plan"&&B,C=!1,g;'))
  assert.ok(
    bundle.includes(
      'let h;if(K[36]!==G||K[37]!==D||K[38]!==k||K[39]!==P||K[40]!==f)h=null',
    ),
  )
  assert.ok(bundle.includes('function le(){return}'))
  assert.ok(
    bundle.includes(
      'let q=le();if(q)return N(`Remote settings: Using override file ${q} (CLAUDE_CODE_REMOTE_SETTINGS_PATH), skipping API fetch`),QB()',
    ),
  )
})

test('desktop-version and empty JSON transcript residue call paths are covered', () => {
  const bundle = requiredTargetBundle()
  assert.ok(
    bundle.includes(
      'let q=N8(),K=await f47();if(K.status==="not-installed")return{success:!1,error:"Claude Desktop is not installed. Install it from https://claude.ai/download"};if(K.status==="version-too-old")return{success:!1,error:`Claude Desktop ${K.version} is too old to resume this session. Please update to ${jF8} or later.`}',
    ),
  )
  assert.ok(
    bundle.includes(
      'if(z.length===0)throw Error("No messages found in JSON file");return k_7(z,0,void 0,void 0,void 0,void 0,q)',
    ),
  )

  const desktop = source('src/utils/desktopDeepLink.ts')
  const status = desktop.indexOf(
    'const installStatus = await getDesktopInstallStatus()',
  )
  const notInstalled = desktop.indexOf(
    "if (installStatus.status === 'not-installed')",
    status,
  )
  const tooOld = desktop.indexOf(
    "if (installStatus.status === 'version-too-old')",
    notInstalled,
  )
  const open = desktop.indexOf('const deepLinkUrl = buildDesktopDeepLink(', tooOld)
  assert.ok(status >= 0 && notInstalled > status && tooOld > notInstalled)
  assert.ok(open > tooOld)
  assert.ok(
    desktop.includes(
      'error: `Claude Desktop ${installStatus.version} is too old to resume this session. Please update to ${MIN_DESKTOP_VERSION} or later.`',
    ),
  )

  const sessions = source('src/utils/sessionStorage.ts')
  const jsonBranch = sessions.indexOf('// json log files')
  const empty = sessions.indexOf('if (messages.length === 0)', jsonBranch)
  const convert = sessions.indexOf('return convertToLogOption(', empty)
  assert.ok(jsonBranch >= 0 && empty > jsonBranch && convert > empty)
  assert.ok(
    sessions.includes("throw new Error('No messages found in JSON file')"),
  )
})

test('computer-use guidance and its connected-server call gate are recovered', () => {
  const bundle = requiredTargetBundle()
  const [targetPrompt] = cookedTemplates(targetUnit(bundle, 12314))
  const sourcePrompt = sourceTemplate(
    'src/utils/computerUse/prompt.ts',
    'COMPUTER_USE_MCP_INSTRUCTIONS',
  )
  assert.equal(targetPrompt, sourcePrompt)
  assert.equal(
    sha256(targetPrompt),
    'b69e81f2929147e1958f46b9bd8c13bff96aed74e1b9164167377d4248c4acca',
  )
  assert.ok(bundle.includes('var wN="computer-use"'))
  assert.ok(
    bundle.includes(
      'Y.push({serverName:wN,block:nfK});let $=dfK(q,z??[],Y)',
    ),
  )

  const attachments = source('src/utils/attachments.ts')
  const push = attachments.indexOf(
    'serverName: COMPUTER_USE_MCP_SERVER_NAME',
  )
  const diff = attachments.indexOf('getMcpInstructionsDelta(', push)
  assert.ok(push >= 0)
  assert.ok(diff > push)
  assert.ok(
    attachments.includes(
      "import { COMPUTER_USE_MCP_INSTRUCTIONS } from './computerUse/prompt.js'",
    ),
  )
  assert.ok(
    source('src/utils/computerUse/common.ts').includes(
      "COMPUTER_USE_MCP_SERVER_NAME = 'computer-use'",
    ),
  )
})

test('update-config source matches every cooked unit literal and registration gate', () => {
  if (!historicalSource) return
  const bundle = requiredTargetBundle()
  const targetValues = cookedTemplates(targetUnit(bundle, 17789))
  const sourceValues = [
    'SETTINGS_EXAMPLES_DOCS',
    'HOOKS_DOCS',
    'HOOK_VERIFICATION_FLOW',
  ].map(name => sourceTemplate('src/skills/bundled/updateConfig.ts', name))
  assert.deepEqual(targetValues, sourceValues)
  assert.deepEqual(targetValues.map(sha256), [
    '6f99d84493b623f5be25020483033360b035df1a1b93af724b41077fc8c69f2f',
    '6d307f560cee946756b17ff048cba80280cc7d07e50fce983cf3bc8ec4a571d1',
    '1d830f6a4eea25903ade11192679913822e95318c5954a27ad953c20daf0cec6',
  ])
  assert.ok(bundle.includes('name:"update-config"'))
  assert.ok(bundle.includes('q.startsWith("[hooks-only]")'))
  assert.ok(bundle.includes('allowedTools:["Read"],userInvocable:!0'))
  const updateConfig = source('src/skills/bundled/updateConfig.ts')
  assert.ok(updateConfig.includes("name: 'update-config'"))
  assert.ok(updateConfig.includes("args.startsWith('[hooks-only]')"))
  assert.ok(updateConfig.includes("allowedTools: ['Read']"))
})

test('prompt-caching source asset and claude-api file map match target', () => {
  if (!historicalSource) return
  const bundle = requiredTargetBundle()
  const [targetPrompt] = cookedTemplates(targetUnit(bundle, 17854))
  const promptCaching = source(
    'src/skills/bundled/claude-api/shared/prompt-caching.md',
  )
  assert.equal(targetPrompt, promptCaching)
  assert.equal(
    sha256(promptCaching),
    'e71e24994f603385f307e10f7dd6e83897419f00b25b7cfb3dc94ec764c7ca67',
  )
  assert.ok(bundle.includes('"shared/prompt-caching.md":G75'))
  const contentMap = source('src/skills/bundled/claudeApiContent.ts')
  assert.ok(
    contentMap.includes(
      "import sharedPromptCaching from './claude-api/shared/prompt-caching.md'",
    ),
  )
  assert.ok(
    contentMap.includes("'shared/prompt-caching.md': sharedPromptCaching"),
  )
})

test('current classifier, update-config, and prompt-caching assets match target116', {
  skip: semanticCase
    ? 'current-tree assertion'
    : !latestBundlePath
      ? 'CLAUDE_CODE_2_1_116_BUNDLE is unavailable'
      : false,
  timeout: 30_000,
}, () => {
  if (semanticCase) return
  if (!latestBundlePath) return
  const values = []
  const ast = parse(fs.readFileSync(latestBundlePath, 'utf8'), {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  walk(ast, node => {
    if (node.type === 'Literal' && typeof node.value === 'string') {
      values.push(node.value)
    } else if (node.type === 'TemplateElement') {
      values.push(node.value.cooked)
    }
  })
  for (const relative of [
    'src/utils/permissions/yolo-classifier-prompts/auto_mode_system_prompt.txt',
    'src/utils/permissions/yolo-classifier-prompts/permissions_external.txt',
  ]) {
    assert.ok(values.includes(loadedTextAsset(relative)), relative)
  }
  assert.ok(
    values.includes(
      source('src/skills/bundled/claude-api/shared/prompt-caching.md'),
    ),
    'src/skills/bundled/claude-api/shared/prompt-caching.md',
  )
  for (const name of [
    'SETTINGS_EXAMPLES_DOCS',
    'HOOKS_DOCS',
    'HOOK_VERIFICATION_FLOW',
  ]) {
    assert.ok(
      values.includes(sourceTemplate('src/skills/bundled/updateConfig.ts', name)),
      `src/skills/bundled/updateConfig.ts: ${name}`,
    )
  }
})

test('prompt/skill ledger closes exactly the five requested unresolved units', () => {
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'))
  const fragmentIndexes = [8727, 8765, 12314, 17789, 17854]
  assert.equal(ledger.rows.length, fragmentIndexes.length)
  assert.deepEqual(
    ledger.rows.map(row => row.targetIndex),
    fragmentIndexes,
  )
  const owners = new Map(ledger.owners.map(owner => [owner.id, owner]))
  const evidence = new Map(ledger.evidence.map(item => [item.id, item]))
  for (const row of ledger.rows) {
    const target = structural.regions[row.targetIndex].target
    assert.equal(row.disposition, 'source-runtime-covered')
    assert.equal(row.structuralClass, 'unresolved')
    for (const field of ['start', 'end', 'nodeType', 'sourceHash']) {
      assert.equal(row[field], target[field], `${row.targetIndex}: ${field}`)
    }
    for (const ownerId of row.ownerIds) {
      const owner = owners.get(ownerId)
      assert.ok(owner, ownerId)
      assert.ok(source(owner.path).includes(owner.anchor), ownerId)
    }
    for (const evidenceId of row.evidenceIds) {
      assert.ok(evidence.has(evidenceId), evidenceId)
    }
  }
  assert.equal(ledger.staticNullBranches.length, 1)
  assert.equal(
    ledger.staticNullBranches[0].id,
    'permissions-anthropic-external-build-dce',
  )

  const residue = ledger.literalResidueAudit
  assert.equal(residue.totalRows, 212)
  assert.equal(residue.totalUnits, 93)
  assert.deepEqual(
    residue.classifications.map(item => [item.id, item.rows, item.units]),
    [
      ['build-timestamp-metadata', 126, 67],
      ['absolute-dependency-build-paths', 4, 4],
      ['source-representation-matches', 73, 17],
      ['proven-static-null-subbranches', 5, 2],
      ['recovered-current-runtime', 1, 1],
      ['supplement-runtime-covered', 3, 2],
    ],
  )
  assert.equal(
    residue.classifications.reduce((sum, item) => sum + item.rows, 0),
    residue.totalRows,
  )
})
