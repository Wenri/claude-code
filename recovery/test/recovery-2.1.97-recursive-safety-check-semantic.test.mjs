import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.96-to-2.1.97'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_96_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_96_BUNDLE and CLAUDE_CODE_2_1_97_BUNDLE are required'
      : false,
}

const units = new Map([
  [
    13115,
    [
      9938574,
      9939316,
      '043750b590c8a2ab192597c71bd16deae56dfa89394ae5c1160b7fe4ab3a4d20',
    ],
  ],
  [
    13116,
    [
      9939316,
      9940772,
      '22d95c0b80d637d64963e01367c664a2334183711d879538e2377ebfbbec3d18',
    ],
  ],
  [
    13122,
    [
      9941942,
      9942143,
      '091b3c2562f6625a7aa12416fa6fd3e8b849c8a293f95bd601552e62f3eba34d',
    ],
  ],
  [
    13123,
    [
      9942143,
      9948337,
      '36a66a1d847024246de206a6a30cf9d963af063add4a9da5925bb8d9b534dd56',
    ],
  ],
])

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

async function loadFindSafetyCheck() {
  const ownerPath = path.join(
    sourceRoot,
    'utils/permissions/permissions.ts',
  )
  const owner = fs.readFileSync(ownerPath, 'utf8')
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
  const compilerPath = candidates.find(fs.existsSync)
  assert.ok(compilerPath, 'the pinned TypeScript compiler must be available')
  const module = await import(pathToFileURL(compilerPath).href)
  const ts = module.default ?? module
  const parsed = ts.createSourceFile(
    ownerPath,
    owner,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const declaration = parsed.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'findSafetyCheck',
  )
  assert.ok(declaration, 'permissions.ts declares findSafetyCheck')
  const javascript = ts.transpileModule(
    `${declaration.getText(parsed).replace(/^export\s+/, '')}\nmodule.exports = { findSafetyCheck }`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const loaded = { exports: {} }
  new Function('module', 'exports', javascript)(loaded, loaded.exports)
  return loaded.exports.findSafetyCheck
}

test('2.1.97 is the true recursive safety-check helper boundary', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(
    sha256(baselineBytes),
    '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e',
  )
  assert.equal(
    sha256(targetBytes),
    '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988',
  )
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  const slices = new Map()
  for (const [index, [start, end, sourceHash]] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: structural identity`,
    )
    const slice = target.slice(start, end)
    assert.equal(sha256(slice), sourceHash, `${index}: bytes`)
    slices.set(index, slice)
  }

  const helper = slices.get(13122)
  const helperName = /function\s+([^($]+)\(/.exec(helper)?.[1]
  assert.ok(helperName, 'recursive helper name')
  assert.match(helper, /type==="subcommandResults"/)
  assert.match(helper, /reasons\.values\(\)/)
  assert.match(helper, new RegExp(`${helperName}\\([^,]+\\.decisionReason`))
  assert.ok(slices.get(13115).includes(`${helperName}(`))
  assert.ok(slices.get(13116).includes(`${helperName}(`))
  assert.match(
    slices.get(13123),
    new RegExp(`${helperName}\\([^,]+\\.decisionReason,\\([^)]*\\)=>!`),
  )
  assert.equal(baseline.includes('reasons.values()'), false)
})

test('source recursively finds nested safety checks and honors predicates', sourceOptions, async () => {
  const findSafetyCheck = await loadFindSafetyCheck()
  const approvable = {
    type: 'safetyCheck',
    reason: 'sensitive path',
    classifierApprovable: true,
  }
  const manual = {
    type: 'safetyCheck',
    reason: 'dangerous command',
    classifierApprovable: false,
  }
  const compound = {
    type: 'subcommandResults',
    reasons: new Map([
      [
        'nested',
        {
          behavior: 'ask',
          decisionReason: {
            type: 'subcommandResults',
            reasons: new Map([
              ['safe', { behavior: 'ask', decisionReason: approvable }],
            ]),
          },
        },
      ],
      ['manual', { behavior: 'ask', decisionReason: manual }],
    ]),
  }

  assert.equal(findSafetyCheck(undefined), undefined)
  assert.equal(findSafetyCheck(approvable), approvable)
  assert.equal(findSafetyCheck(compound), approvable)
  assert.equal(
    findSafetyCheck(compound, reason => !reason.classifierApprovable),
    manual,
  )
  assert.equal(
    findSafetyCheck(compound, reason => reason.reason === 'absent'),
    undefined,
  )

  const owner = fs.readFileSync(
    path.join(sourceRoot, 'utils/permissions/permissions.ts'),
    'utf8',
  )
  assert.ok((owner.match(/findSafetyCheck\(/g) ?? []).length >= 5)
})
