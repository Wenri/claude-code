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
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE

const baselineUnits = {
  login: [12117, 7677390, 7677782, '0c588b84b5ca55fac37b22374d520aced4935ae9d2f9e93b3a4cd7aef2942807'],
  teleport: [16698, 10526751, 10527288, '5f677ad8e722610a8b0fc47445a2dafabcbae0b3e4a96e11aeb92fbf60aa42bf'],
  permissions: [16776, 10571068, 10571191, '6b23c4adebfce520e25afddc463bd1cf21e1dd37b333045bcc6bb5541d3758dc'],
  repl: [19732, 12004186, 12061111, '46d11ca5b4e7deeefb5dc8cc9228de8564cc548e070a1a4bf73d0179e9e5b831'],
  queryEngine: [20264, 12776117, 12793799, 'd55b1e39728edb12a5480c3ead4fc554c8f81a7d02dd3ee17f2d38853f21b7fc'],
}
const targetUnits = {
  login: [12237, 7720961, 7721393, 'fde67a3e17ce868cd639e7c01167b99dd93d1ccc8a8d7209175bbad556342f95'],
  uuidHelper: [15022, 9369094, 9369217, 'e54a43c6bb71a6d3645dc0e0bf57fdc802eb2779382242dc432279568588908d'],
  teleport: [16848, 10585452, 10586018, 'a69d63c77c8f5fd9c0d0124ac3fd89835d2c3a14d554f6a2af283a962996ac7b'],
  permissions: [16928, 10629625, 10629766, '0ee30cf75d637baf4b8193363536238e2c6912691cb50153426cdb958fa28742'],
  reducer: [19501, 11902591, 11902879, '077bcc94fb9d62e256ed8b1eb46057732734b9464daecee28d1872e6dbd785c8'],
  repl: [19998, 12102133, 12160049, '3b17ff0bd496c0d7f39baa8f2542135ed7dd3f220d3f6a628ae7f7040c9492c5'],
  queryEngine: [20550, 12884238, 12902574, '66c82ff554ca98afc25ad653983a1e8d357060b2390ce8bfd5203dfc0a34299f'],
}

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
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

function occurrences(value, fragment) {
  return value.split(fragment).length - 1
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function assertFragments(contents, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${label}: ${fragment}`)
  }
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

async function loadReducer() {
  const ts = await loadTypeScript()
  const result = ts.transpileModule(source('utils/messageOperations.ts'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  })
  const errors = (result.diagnostics ?? []).filter(
    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
  )
  assert.deepEqual(errors, [])
  const module = { exports: {} }
  new Function('exports', 'module', 'require', result.outputText)(
    module.exports,
    module,
    () => ({}),
  )
  return module.exports.applyMessageOperation
}

test('target116 authenticates the operation reducer and every live caller', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(baselineBytes.length, 12_986_755)
  assert.equal(targetBytes.length, 13_102_272)
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

  assert.equal(occurrences(baseline, 'applyMessageOp'), 0)
  assert.equal(occurrences(target, 'applyMessageOp'), 6)
  assert.equal(occurrences(baseline, 'remove-by-uuid'), 0)
  assert.equal(occurrences(target, 'remove-by-uuid'), 2)
  assert.equal(occurrences(baseline, 'replace-all'), 0)
  assert.equal(occurrences(target, 'replace-all'), 3)

  for (const [name, [index, start, end, hash]] of Object.entries(
    baselineUnits,
  )) {
    const unit = structural.unmatchedBaseline.find(item => item.index === index)
    assert.ok(unit, `${name}: unmatched baseline unit`)
    assert.deepEqual([unit.start, unit.end, unit.sourceHash], [start, end, hash])
    assert.equal(sha256(baseline.slice(start, end)), hash)
  }

  for (const [name, [index, start, end, hash]] of Object.entries(targetUnits)) {
    const region = structural.regions[index]
    assert.ok(region, `${name}: structural region`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, hash],
    )
    assert.equal(
      region.classification,
      name === 'uuidHelper' ? 'matched' : 'unresolved',
    )
    assert.equal(sha256(target.slice(start, end)), hash)
  }

  const reducer = target.slice(targetUnits.reducer[1], targetUnits.reducer[2])
  for (const fragment of ['case"append"', 'case"replace-all"', 'case"remove-by-uuid"', 'case"update"']) {
    assert.ok(reducer.includes(fragment), `reducer: ${fragment}`)
  }
  assert.equal(structural.regions[targetUnits.uuidHelper[0]].baselineUnitIndex, 14882)
  assert.equal(
    structural.regions[targetUnits.uuidHelper[0]].pairReason,
    'exact-scope-normalized-token-hash',
  )

  const login = target.slice(targetUnits.login[1], targetUnits.login[2])
  assert.ok(login.includes('applyMessageOp({type:"update"'))
  const teleport = target.slice(targetUnits.teleport[1], targetUnits.teleport[2])
  assert.ok(teleport.includes('applyMessageOp({type:"replace-all"'))
  const permissions = target.slice(
    targetUnits.permissions[1],
    targetUnits.permissions[2],
  )
  assert.ok(permissions.includes('applyMessageOp({type:"append"'))

  const repl = target.slice(targetUnits.repl[1], targetUnits.repl[2])
  for (const fragment of [
    'applyMessageOp:uY',
    'type:"remove-by-uuid"',
    'type:"replace-all"',
    'type:"update",updater:',
    'type:"append",messages:',
  ]) {
    assert.ok(repl.includes(fragment), `REPL: ${fragment}`)
  }
  const queryEngine = target.slice(
    targetUnits.queryEngine[1],
    targetUnits.queryEngine[2],
  )
  assert.ok(queryEngine.includes('this.mutableMessages=v78(this.mutableMessages,NH)'))
  assert.ok(queryEngine.includes('applyMessageOp:()=>{}'))
})

test('source exposes one typed operation boundary across commands, REPL, and print mode', sourceOptions, () => {
  assertFragments(
    source('utils/messageOperations.ts'),
    [
      "| { type: 'append'; messages: Message[] }",
      "| { type: 'replace-all'; messages: Message[] }",
      "| { type: 'remove-by-uuid'; uuid: string }",
      "| { type: 'update'; updater: (messages: Message[]) => Message[] }",
      'export function applyMessageOperation(',
      'const index = messages.findIndex(message => message.uuid === operation.uuid)',
      'next.splice(index, 1)',
      'return operation.updater(messages)',
    ],
    'operation reducer',
  )
  assert.ok(
    source('types/command.ts').includes(
      'applyMessageOp: (operation: MessageOperation) => void',
    ),
  )
  assert.ok(
    source('commands/login/login.tsx').includes(
      "context.applyMessageOp({ type: 'update', updater: stripSignatureBlocks })",
    ),
  )
  assert.ok(
    source('commands/teleport/teleport.tsx').includes(
      "context.applyMessageOp({ type: 'replace-all', messages: result.log })",
    ),
  )
  assert.ok(
    source('commands/permissions/permissions.tsx').includes(
      "type: 'append'",
    ),
  )

  const repl = source('screens/REPL.tsx')
  assertFragments(
    repl,
    [
      'const applyMessageOp = useCallback((operation: MessageOperation)',
      'setMessages(previous => applyMessageOperation(previous, operation))',
      'applyMessageOp,',
      "type: 'remove-by-uuid'",
      "type: 'replace-all'",
      'updater: oldMessages => appendOrReplaceMessageByUuid(oldMessages, newMessage)',
      "applyMessageOp({ type: 'append', messages: newMessages })",
      'updater: currentMessages => stripToolUseResultsForStorage(',
    ],
    'REPL operation routing',
  )
  const queryEngine = source('QueryEngine.ts')
  assertFragments(
    queryEngine,
    [
      'applyMessageOp: operation => {',
      'this.mutableMessages = applyMessageOperation(',
      'applyMessageOp: () => {},',
    ],
    'print operation routing',
  )
})

test('operation reducer preserves identity and exact append/remove/update semantics', sourceOptions, async () => {
  const apply = await loadReducer()
  const first = { uuid: 'same', value: 1 }
  const duplicate = { uuid: 'same', value: 2 }
  const other = { uuid: 'other' }
  const messages = [first, duplicate, other]

  assert.equal(apply(messages, { type: 'append', messages: [] }), messages)
  assert.deepEqual(apply(messages, { type: 'append', messages: [first] }), [
    first,
    duplicate,
    other,
    first,
  ])
  const replacement = [other]
  assert.equal(
    apply(messages, { type: 'replace-all', messages: replacement }),
    replacement,
  )
  assert.equal(
    apply(messages, { type: 'remove-by-uuid', uuid: 'missing' }),
    messages,
  )
  assert.deepEqual(
    apply(messages, { type: 'remove-by-uuid', uuid: 'same' }),
    [duplicate, other],
  )
  assert.deepEqual(messages, [first, duplicate, other])
  assert.deepEqual(
    apply(messages, {
      type: 'update',
      updater: previous => previous.slice(1),
    }),
    [duplicate, other],
  )
})
