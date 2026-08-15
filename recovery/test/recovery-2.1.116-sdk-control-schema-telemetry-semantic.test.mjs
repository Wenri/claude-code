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
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
      : false,
}

const units = new Map([
  [
    2486,
    [
      1008979,
      1009122,
      '8ebc4aed2cdebf45a5035d5dff9bb14face96f1747e23f77569fe38e228006ba',
    ],
  ],
  [
    2488,
    [
      1009141,
      1009401,
      '625c3367454d96d1d2bbe182023ea9ce62cd44f0813b0f4c7e613e37969922a8',
    ],
  ],
  [
    14851,
    [
      9282611,
      9289016,
      'e3873c4e2fbb094bcbf143086e37507a9b322188a5a8b244a4bcdf6240fb0290',
    ],
  ],
  [
    19762,
    [
      12001052,
      12018785,
      '02ec7e35fe2c4764246e9a3115e32c55e7ae7f59d55cccc9dfaed6cd83a476ef',
    ],
  ],
  [
    19778,
    [
      12022383,
      12030962,
      '9bcb45db09565505b57e14bde947c23190909b492689a75819f8af55214eea55',
    ],
  ],
  [
    20581,
    [
      12915603,
      12954120,
      '66fa02021a22925ae2e3eb6c757c5a9e91a25ecb102ebe0ed8bdd47efeb44ce2',
    ],
  ],
])

const reasonTypes = [
  'rule',
  'mode',
  'subcommandResults',
  'permissionPromptTool',
  'hook',
  'asyncAgent',
  'sandboxOverride',
  'workingDir',
  'safetyCheck',
  'classifier',
  'other',
]

const skillsDescription =
  'When provided, only skills whose names match an entry are loaded into the main session system prompt, using the same rules as AgentDefinition.skills: exact name, plugin-qualified name, or ":name" suffix. Omit to load every discovered skill. Applies to the main session only; subagents use AgentDefinition.skills.'

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

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function targetRegion(index) {
  const direct = structural.regions[index]
  if (direct?.target?.index === index) return direct
  return structural.unresolvedTarget.find(entry => entry.target.index === index)
}

test('target116 authenticates the three SDK control subgraphs', bundleOptions, () => {
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
  const slices = new Map()

  for (const [index, [start, end, sourceHash]] of units) {
    const region = targetRegion(index)
    assert.ok(region, `target structural unit ${index}`)
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

  assert.ok(slices.get(2486).includes('PERMISSION_DECISION_REASON_TYPES'))
  assert.ok(slices.get(2488).includes(JSON.stringify(reasonTypes)))

  const schemas = slices.get(19762)
  assert.ok(schemas.includes(skillsDescription))
  assert.match(schemas, /decision_reason_type:/)
  assert.match(schemas, /classifier_approvable:/)
  assert.match(schemas, /subtype:.*literal\("message_rated"\)/)
  assert.ok(
    schemas.includes(
      '@internal Records a per-message thumbs up/down rating. Logs tengu_message_rated',
    ),
  )
  assert.ok(schemas.includes('@internal Empty response for message_rated.'))

  const permissionRuntime = slices.get(14851)
  assert.match(
    permissionRuntime,
    /classifierApprovable\),[^;]+type==="sandboxOverride"/,
  )
  assert.match(permissionRuntime, /if\([^)]*\|\|[^)]*\)\{if\(/)
  assert.match(permissionRuntime, /;if\([^)]*\)return [^}]+\}/)

  const sender = slices.get(19778)
  assert.match(sender, /decision_reason_type:[^,]+\?\.type/)
  assert.match(
    sender,
    /classifier_approvable:[^?]+\?![^,]+\([^,]+,[^=]+=>![^.]+\.classifierApprovable\):void 0/,
  )

  const handler = slices.get(20581)
  assert.match(handler, /subtype==="message_rated"/)
  assert.match(handler, /surface:[^=]+="tool_use",cleared:[^=]+=!1/)
  assert.match(handler, /"tengu_message_rated",\{message_uuid:/)

  assert.equal(baseline.includes(skillsDescription), false)
  assert.equal(baseline.includes('decision_reason_type'), false)
  assert.equal(baseline.includes('classifier_approvable'), false)
  assert.equal(baseline.includes('subtype:"message_rated"'), false)
})

test('source executes main-session, permission, and rating schemas', sourceOptions, () => {
  const owner = path.join(sourceRoot, 'entrypoints/sdk/controlSchemas.ts')
  const bun = path.join(repositoryRoot, '.pixi/envs/default/bin/bun')
  const expression = `
    import {
      SDKControlInitializeRequestSchema,
      SDKControlMessageRatedRequestSchema,
      SDKControlMessageRatedResponseSchema,
      SDKControlPermissionRequestSchema,
      SDKControlRequestInnerSchema,
    } from ${JSON.stringify(owner)};
    import { PERMISSION_DECISION_REASON_TYPES } from ${JSON.stringify(path.join(sourceRoot, 'types/permissions.ts'))};
    const valid = [
      SDKControlInitializeRequestSchema().parse({subtype:'initialize',skills:['alpha','plugin:beta']}),
      SDKControlPermissionRequestSchema().parse({subtype:'can_use_tool',tool_name:'Bash',input:{},tool_use_id:'t-1',decision_reason_type:'subcommandResults',classifier_approvable:false}),
      SDKControlMessageRatedRequestSchema().parse({subtype:'message_rated',messageUuid:'m-1',sentiment:'positive'}),
      SDKControlRequestInnerSchema().parse({subtype:'message_rated',messageUuid:'m-2',sentiment:'negative',surface:'assistant_text',cleared:true}),
      SDKControlMessageRatedResponseSchema().parse({}),
    ];
    const invalid = [
      SDKControlInitializeRequestSchema().safeParse({subtype:'initialize',skills:'alpha'}).success,
      SDKControlPermissionRequestSchema().safeParse({subtype:'can_use_tool',tool_name:'Bash',input:{},tool_use_id:'t-2',decision_reason_type:'unknown'}).success,
      SDKControlMessageRatedRequestSchema().safeParse({subtype:'message_rated',messageUuid:'m-3',sentiment:'neutral'}).success,
      SDKControlMessageRatedRequestSchema().safeParse({subtype:'message_rated',messageUuid:'m-4',sentiment:'positive',surface:'sidebar'}).success,
    ];
    console.log(JSON.stringify({valid,invalid,reasonTypes:PERMISSION_DECISION_REASON_TYPES,skillsDescription:SDKControlInitializeRequestSchema().shape.skills.description}));
  `
  const result = spawnSync(bun, ['-e', expression], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  const parsed = JSON.parse(result.stdout)
  assert.deepEqual(parsed.invalid, [false, false, false, false])
  assert.deepEqual(parsed.reasonTypes, reasonTypes)
  assert.equal(parsed.skillsDescription, skillsDescription)
  assert.deepEqual(parsed.valid[0].skills, ['alpha', 'plugin:beta'])
  assert.equal(parsed.valid[1].classifier_approvable, false)
  assert.equal(parsed.valid[2].subtype, 'message_rated')
  assert.equal(parsed.valid[3].cleared, true)
  assert.deepEqual(parsed.valid[4], {})
})

test('source sends structured permission metadata with target116 auto semantics', sourceOptions, () => {
  const permissions = source('utils/permissions/permissions.ts')
  const structuredIO = source('cli/structuredIO.ts')
  const types = source('types/permissions.ts')

  assert.match(types, /export const PERMISSION_DECISION_REASON_TYPES = \[/)
  for (const reasonType of reasonTypes) {
    assert.ok(types.includes(`'${reasonType}'`), reasonType)
  }
  assert.match(
    permissions,
    /const safetyCheck = findSafetyCheck\(\s*result\.decisionReason,\s*reason => !reason\.classifierApprovable,\s*\)/,
  )
  assert.match(
    permissions,
    /const sandboxOverride = result\.decisionReason\?\.type === 'sandboxOverride'/,
  )
  assert.match(
    permissions,
    /if \(safetyCheck \|\| sandboxOverride\) \{[\s\S]*?shouldAvoidPermissionPrompts[\s\S]*?if \(safetyCheck\) return result/,
  )
  assert.match(
    structuredIO,
    /const decisionReason = mainPermissionResult\.decisionReason\s+const safetyCheck = findSafetyCheck\(decisionReason\)/,
  )
  assert.match(structuredIO, /decision_reason_type: decisionReason\?\.type/)
  assert.match(
    structuredIO,
    /classifier_approvable: safetyCheck\s+\? !findSafetyCheck\([\s\S]*?check => !check\.classifierApprovable,[\s\S]*?\)\s+: undefined/,
  )
})

test('source handles SDK message ratings with UI-compatible telemetry defaults', sourceOptions, () => {
  const schemas = source('entrypoints/sdk/controlSchemas.ts')
  const print = source('cli/print.ts')

  assert.match(schemas, /SDKControlMessageRatedRequestSchema/)
  assert.match(schemas, /SDKControlMessageRatedRequestSchema\(\)/)
  assert.match(schemas, /SDKControlMessageRatedResponseSchema/)
  assert.match(
    print,
    /message\.request\.subtype === 'message_rated'[\s\S]*?surface = 'tool_use',[\s\S]*?cleared = false/,
  )
  assert.match(
    print,
    /logEvent\('tengu_message_rated', \{[\s\S]*?message_uuid:[\s\S]*?sentiment:[\s\S]*?surface:[\s\S]*?cleared,/,
  )
  assert.match(print, /sendControlResponseSuccess\(message, \{\}\)/)
})
