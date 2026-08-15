import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
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
const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'

const baselineUnits = [
  {
    index: 11536,
    nodeType: 'FunctionDeclaration',
    start: 7_386_442,
    end: 7_387_825,
    sourceHash:
      'd256eb1069745b0a7f808f32425e13d5603de869f09a0613993c1c6ee7e136da',
  },
  {
    index: 11540,
    nodeType: 'VariableDeclaration',
    start: 7_387_927,
    end: 7_388_068,
    sourceHash:
      '2ec32a3acef08dfce81cbb8e50cd4ca1b5f81ae1beb64cccdbccb71056147cc3',
  },
  {
    index: 11671,
    nodeType: 'FunctionDeclaration',
    start: 7_449_749,
    end: 7_451_132,
    sourceHash:
      '9f2ccd9289dab151a8ff1fe11020431480601054ab532ae23e45d57db3ae31fd',
  },
  {
    index: 11674,
    nodeType: 'FunctionDeclaration',
    start: 7_451_227,
    end: 7_452_522,
    sourceHash:
      '0a8f827dfe1a79a4b449b8e875c727ca1e216242c006529e85fc8dfed35acf63',
  },
  {
    index: 11680,
    nodeType: 'FunctionDeclaration',
    start: 7_454_642,
    end: 7_454_989,
    sourceHash:
      '5e89d12a156abedcda97919d9077a1e15a44aa8d9bbb728fc7cb73ec00d2cbd7',
  },
  {
    index: 11682,
    nodeType: 'VariableDeclaration',
    start: 7_454_997,
    end: 7_455_093,
    sourceHash:
      'e63b01682a5e6a5620892b2071f180e710ddbf7289fc8785fde5f6844db42060',
  },
]

const targetUnits = [
  {
    index: 11650,
    nodeType: 'FunctionDeclaration',
    start: 7_429_649,
    end: 7_430_684,
    sourceHash:
      '6089e2f3c856a6ce9c6637ce9c9d5ac8c506cd48afe43291eccead15bdab41e1',
  },
  {
    index: 11652,
    nodeType: 'VariableDeclaration',
    start: 7_430_700,
    end: 7_431_092,
    sourceHash:
      'e81cb18fc8aa3e41a17854a30f01734fa760fb42bc1a2f79903c2752179d5cc0',
  },
  {
    index: 11654,
    nodeType: 'VariableDeclaration',
    start: 7_431_099,
    end: 7_431_211,
    sourceHash:
      'cbe8f01be7fdc8b5c0c0337eaa603ac03389e8fe99a61a933b7174e7334c66bd',
  },
  {
    index: 11788,
    nodeType: 'FunctionDeclaration',
    start: 7_495_067,
    end: 7_495_398,
    sourceHash:
      'e91498baf5222e7f82c455420d2575c25661641259bd98229b62bbf2186e41c2',
  },
  {
    index: 11790,
    nodeType: 'VariableDeclaration',
    start: 7_495_406,
    end: 7_495_490,
    sourceHash:
      '9b352eba420f2eb7ad3a91d547b939212e1941032bbde8995db2cd731c967916',
  },
]

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
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function requiredBundle(filename, label, expectedSha256) {
  assert.ok(filename, `${label} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(sha256(bytes), expectedSha256, `${label} hash drifted`)
  return bytes
}

function assertUnit(bundle, unit, label) {
  const slice = bundle.subarray(unit.start, unit.end)
  assert.equal(
    sha256(slice),
    unit.sourceHash,
    `${label} u${unit.index} hash drifted`,
  )
  return slice.toString('utf8')
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

async function instantiateAccessKeyStep() {
  const ts = await loadTypeScript()
  const owner = source('components/BedrockSetupWizard.tsx')
  const ast = ts.createSourceFile(
    'BedrockSetupWizard.tsx',
    owner,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const fields = ast.statements.find(
    statement =>
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        declaration =>
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === 'ACCESS_KEY_FIELDS',
      ),
  )
  const component = ast.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'AccessKeyStep',
  )
  assert.ok(fields, 'ACCESS_KEY_FIELDS declaration must be reachable')
  assert.ok(component, 'AccessKeyStep declaration must be reachable')

  const isolated = `
    type FormField = any
    type BedrockWizardData = {
      accessKeyId?: string
      secretAccessKey?: string
      sessionToken?: string
    }
    const Form = Symbol('Form')
    let hookState: any
    let initialized = false
    function useState<T>(initial: T): [T, (next: T | ((value: T) => T)) => void] {
      if (!initialized) {
        hookState = initial
        initialized = true
      }
      return [hookState, next => {
        hookState = typeof next === 'function' ? next(hookState) : next
      }]
    }
    const React = {
      createElement(type: unknown, props: object | null, ...children: unknown[]) {
        return { type, props: { ...(props ?? {}), children } }
      },
    }
    ${fields.getText(ast)}
    ${component.getText(ast)}
    module.exports = { ACCESS_KEY_FIELDS, AccessKeyStep, Form }
  `
  const result = ts.transpileModule(isolated, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: 'BedrockAccessKeyStep.tsx',
    reportDiagnostics: true,
  })
  const errors = (result.diagnostics ?? []).filter(
    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
  )
  assert.deepEqual(errors, [], 'isolated access-key owner must transpile')
  const module = { exports: {} }
  new Function('exports', 'module', result.outputText)(module.exports, module)
  return module.exports
}

test(
  'authenticates the removed sequential screens and complete target Form graph',
  bundleOptions,
  () => {
    if (!selected || !baselinePath || !targetPath) return
    const baseline = requiredBundle(
      baselinePath,
      'CLAUDE_CODE_2_1_114_BUNDLE',
      baselineSha256,
    )
    const target = requiredBundle(
      targetPath,
      'CLAUDE_CODE_2_1_116_BUNDLE',
      targetSha256,
    )
    const old = new Map(
      baselineUnits.map(unit => [
        unit.index,
        assertUnit(baseline, unit, 'baseline'),
      ]),
    )
    const next = new Map(
      targetUnits.map(unit => [
        unit.index,
        assertUnit(target, unit, 'target'),
      ]),
    )

    for (const unit of baselineUnits) {
      const row = structural.unmatchedBaseline.find(
        candidate => candidate.index === unit.index,
      )
      assert.ok(row, `baseline u${unit.index} must be unmatched`)
      assert.equal(row.nodeType, unit.nodeType)
      assert.equal(row.start, unit.start)
      assert.equal(row.end, unit.end)
      assert.equal(row.sourceHash, unit.sourceHash)
    }
    for (const unit of targetUnits) {
      const row = structural.regions.find(
        candidate => candidate.target.index === unit.index,
      )
      assert.ok(row, `target u${unit.index} must have a structural row`)
      assert.equal(row.target.nodeType, unit.nodeType)
      assert.equal(row.target.start, unit.start)
      assert.equal(row.target.end, unit.end)
      assert.equal(row.target.sourceHash, unit.sourceHash)
    }

    assert.match(old.get(11536), /AWS access key ID/)
    assert.match(old.get(11671), /AWS secret access key/)
    assert.match(old.get(11674), /AWS session token \(optional\)/)
    assert.match(
      old.get(11540),
      /ACCESS_KEY_ID:3,SECRET_KEY:4,SESSION_TOKEN:5,REGION:6/,
    )
    assert.match(old.get(11680), /KaK,OsK,DsK/)
    assert.match(old.get(11682), /_aK\(\)[\s\S]*MsK\(\)[\s\S]*jsK\(\)/)

    assert.match(next.get(11650), /title:J,subtitle:"AWS access keys"/)
    assert.match(next.get(11650), /submitLabel:"Continue"/)
    assert.match(
      next.get(11650),
      /accessKeyId:M\.accessKeyId\.trim\(\),secretAccessKey:M\.secretAccessKey\.trim\(\),sessionToken:M\.sessionToken\.trim\(\)\|\|void 0/,
    )
    assert.match(
      next.get(11652),
      /key:"accessKeyId",label:"Access key ID",placeholder:"AKIA\\u2026",required:!0/,
    )
    assert.match(
      next.get(11652),
      /key:"secretAccessKey",label:"Secret access key",mask:"\*",required:!0/,
    )
    assert.match(
      next.get(11652),
      /key:"sessionToken",label:"Session token",mask:"\*",hint:/,
    )
    assert.match(
      next.get(11654),
      /ACCESS_KEY_ID:3,REGION:4,VERIFY:5,PIN_MODELS:6,CONFIRM:7/,
    )
    assert.doesNotMatch(next.get(11654), /SECRET_KEY|SESSION_TOKEN/)
    assert.match(next.get(11788), /IH7,VH7,E\$7/)
    assert.match(next.get(11790), /NH7\(\)/)
  },
)

test(
  'Bedrock wizard source owns the target Form and preserves provider behavior',
  sourceOptions,
  () => {
    if (!selected) return
    const owner = source('components/BedrockSetupWizard.tsx')
    assert.match(owner, /import \{ Form, type FormField \} from '\.\/Form\.js'/)
    assert.match(
      owner,
      /const ACCESS_KEY_FIELDS: FormField\[\] = \[[\s\S]*key: 'accessKeyId'[\s\S]*required: true[\s\S]*key: 'secretAccessKey'[\s\S]*mask: '\*'[\s\S]*required: true[\s\S]*key: 'sessionToken'[\s\S]*mask: '\*'/,
    )
    assert.match(
      owner,
      /function AccessKeyStep\([\s\S]*title="Set up AWS Bedrock"[\s\S]*subtitle="AWS access keys"[\s\S]*submitLabel="Continue"/,
    )
    assert.match(
      owner,
      /accessKeyId: values\.accessKeyId\.trim\(\)[\s\S]*secretAccessKey: values\.secretAccessKey\.trim\(\)[\s\S]*sessionToken: values\.sessionToken\.trim\(\) \|\| undefined/,
    )
    assert.match(
      owner,
      /case 'accessKey':[\s\S]*<AccessKeyStep[\s\S]*onSubmit=\{credentials => goTo\('region', credentials\)\}/,
    )
    assert.doesNotMatch(owner, /case 'secret':|case 'session':/)
    assert.match(
      owner,
      /case 'accessKey':[\s\S]*accessKeyId: data\.accessKeyId![\s\S]*secretAccessKey: data\.secretAccessKey![\s\S]*data\.sessionToken/,
    )
    assert.match(
      owner,
      /AWS_ACCESS_KEY_ID = data\.accessKeyId[\s\S]*AWS_SECRET_ACCESS_KEY = data\.secretAccessKey[\s\S]*AWS_SESSION_TOKEN = data\.sessionToken/,
    )
    assert.match(
      owner,
      /STSClient[\s\S]*GetCallerIdentityCommand[\s\S]*ListInferenceProfilesCommand/,
    )
  },
)

test(
  'AccessKeyStep renders target props and submits normalized credentials',
  sourceOptions,
  async () => {
    if (!selected) return
    const { ACCESS_KEY_FIELDS, AccessKeyStep, Form } =
      await instantiateAccessKeyStep()
    let submitted
    let backed = 0
    const props = {
      data: {
        accessKeyId: 'old-id',
        secretAccessKey: 'old-secret',
        sessionToken: 'old-token',
      },
      onBack: () => {
        backed += 1
      },
      onSubmit: value => {
        submitted = value
      },
    }
    let element = AccessKeyStep(props)
    assert.equal(element.type, Form)
    assert.equal(element.props.title, 'Set up AWS Bedrock')
    assert.equal(element.props.subtitle, 'AWS access keys')
    assert.equal(element.props.submitLabel, 'Continue')
    assert.equal(element.props.fields, ACCESS_KEY_FIELDS)
    assert.deepEqual(element.props.values, {
      accessKeyId: 'old-id',
      secretAccessKey: 'old-secret',
      sessionToken: 'old-token',
    })
    assert.deepEqual(ACCESS_KEY_FIELDS, [
      {
        type: 'text',
        key: 'accessKeyId',
        label: 'Access key ID',
        placeholder: 'AKIA…',
        required: true,
      },
      {
        type: 'text',
        key: 'secretAccessKey',
        label: 'Secret access key',
        mask: '*',
        required: true,
      },
      {
        type: 'text',
        key: 'sessionToken',
        label: 'Session token',
        mask: '*',
        hint: ACCESS_KEY_FIELDS[2].hint,
      },
    ])
    assert.equal(
      ACCESS_KEY_FIELDS[2].hint('', {}),
      'Only needed for temporary credentials from STS. Leave empty for long-lived keys.',
    )

    element.props.onChange('accessKeyId', '  AKIA123  ')
    element.props.onChange('secretAccessKey', '  secret  ')
    element.props.onChange('sessionToken', '   ')
    element = AccessKeyStep(props)
    assert.deepEqual(element.props.values, {
      accessKeyId: '  AKIA123  ',
      secretAccessKey: '  secret  ',
      sessionToken: '   ',
    })
    element.props.onSubmit()
    assert.deepEqual(submitted, {
      accessKeyId: 'AKIA123',
      secretAccessKey: 'secret',
      sessionToken: undefined,
    })
    element.props.onCancel()
    assert.equal(backed, 1)
  },
)
