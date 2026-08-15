import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import { indexGeneratedBundle } from '../lib/structural-delta.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.107-to-2.1.108'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? path.join(root, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_107_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_108_BUNDLE
const caseRoot = path.join(root, 'recovery/cases', caseName)
const readGzip = relative =>
  JSON.parse(gunzipSync(fs.readFileSync(path.join(caseRoot, relative))))
const structural = readGzip('structural/generated-delta.json.gz')
const coverage = readGzip('semantic/source-coverage.json.gz')
const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')

const units = new Map([
  [13011, [9655122, 9663989, 'VariableDeclaration', 'eb3d62a8e3ff9c648aff216fa25678f4b5c2bce296b825bc4776ed14b416bfdb', 'changed']],
  [13426, [9859015, 9868994, 'FunctionDeclaration', '781ef87b8582df01e63a78ab2ff32d3d99427489b0cfcf464b5ba8cb5c56df9f', 'unresolved']],
  [13453, [9873979, 9874107, 'FunctionDeclaration', 'a48ed4ac8c0f9bce0240283bef9fd37f181ed99127eaa1c7d4ac5c4b55a4becf', 'unresolved']],
  [13790, [10022854, 10022884, 'FunctionDeclaration', 'b9b456680bb055330573308f3cce90538c0382971457d05e817a1a8f3a784937', 'unresolved']],
  [13792, [10022914, 10024912, 'FunctionDeclaration', 'cfbc76fc0792f4f0fef80affd4bbb8876a7390a51308b0eadb302384b12f4e6a', 'unresolved']],
  [13953, [10082739, 10084365, 'FunctionDeclaration', '4a839d1839fe92bccaae32c428bd476909d47a9aa754fbcae4a28bce68c70945', 'unresolved']],
  [14009, [10104923, 10105035, 'FunctionDeclaration', 'e428361a3506bd5e65cc9a774f344ffa427a401d19288c6022a82e832e320c18', 'unresolved']],
  [14010, [10105035, 10105205, 'FunctionDeclaration', 'c6f165f32adcfe6f28ff9bf04f352e1a18adf5474fd45dd39495a2afd9d99fc6', 'unresolved']],
  [14459, [10502366, 10502636, 'VariableDeclaration', 'e4a1cf9c8162ff6ae6a8a617ddbb76f98ef0741ca96248ad42f4f8e3a7cce6ac', 'unresolved']],
  [14719, [10684069, 10696329, 'FunctionDeclaration', '5abafb7df510359d0f5408fa42729df9e5e7de011aef125737bca143ccbf141b', 'unresolved']],
  [14722, [10696503, 10706302, 'FunctionDeclaration', 'de5e8e73f2bde9a316d65fe7259d7a32efcd7087274548752fcd1590e06d1cc5', 'unresolved']],
  [17811, [12277208, 12280910, 'FunctionDeclaration', '34f3ef79e449b0d17cee7e78a18ba98e4dde5d770cc381cd727ac111f5fc778a', 'unresolved']],
  [17920, [12317732, 12343915, 'FunctionDeclaration', 'e8667a32b8073bef43bc4cd9c3dcb32239cc425b4af90ba2aa1be83635e614a4', 'unresolved']],
  [17939, [12354085, 12354187, 'FunctionDeclaration', '640905aed9d487da41239ecc05a13860389c5d46404f522e9554b573f52763e6', 'unresolved']],
  [17945, [12355251, 12356821, 'FunctionDeclaration', 'b6d5d5a225e575f05b433df7fcdc748c72ae941ddca0d1be8d452fa768c0b134', 'unresolved']],
  [18029, [12385549, 12387578, 'FunctionDeclaration', '669920646b690b9162c87c247604b0f4de69aecccc5828b73e8773f7d23909d2', 'unresolved']],
  [18238, [12470459, 12470569, 'VariableDeclaration', '6338e1409961704490955306c8059a620e6c8b8acc0ee5e2aa1aa32648575ed7', 'changed']],
  [18273, [12485802, 12485973, 'VariableDeclaration', '326204052cd2fd6f1aec630dc8cbef1766992e5726f18210b36c9278689574e9', 'changed']],
  [18299, [12490875, 12502108, 'VariableDeclaration', 'bdbdc65646c65131fd437c49737697d0fada30e3d5d8e9a41aa2e27b2c89dd60', 'changed']],
  [18546, [12656478, 12657265, 'VariableDeclaration', 'cbb1a6ce20aff81aa5eeb6187231cb277e3d063fc5c202b54d6b6dbd4eaca6d4', 'changed']],
  [18608, [12686837, 12686939, 'VariableDeclaration', 'b21bcb85496868e92859a3f05d48a900aac388af9272c94241f1ef47e90e84b5', 'changed']],
  [18705, [12719200, 12719537, 'FunctionDeclaration', '75ba34959bff834d6b2d9ffb56feca3c73bc6e71e87d1976239d33b318339165', 'changed']],
  [18707, [12720282, 12721754, 'FunctionDeclaration', '62ff0634855241bba4a4d7c20a4e6defe3225865774bbb5f98482462b449c0b0', 'changed']],
  [18708, [12721754, 12722494, 'FunctionDeclaration', '28b92cbb1cc36910a3668004a5ff626438f962270cf1f1c55d2786aa37874b39', 'changed']],
  [18711, [12723160, 12723391, 'VariableDeclaration', 'e78e6936f704b06566391d118e2205565ec1cb1a8dc3257812072f7b3e24edbd', 'changed']],
  [19050, [13247820, 13249279, 'VariableDeclaration', 'ec9db348e77eda53a7e688e97e5e32dc75c12176499353d6bc379bcd46c7f622', 'changed']],
  [19064, [13254608, 13265201, 'VariableDeclaration', 'dd1e4847c327a46cf3a9ab6b69688a1cca41122143f35e645449eec3270ba199', 'unresolved']],
  [19088, [13275083, 13291881, 'ClassDeclaration', '7cf5ac6f613ecb6de413e01f2b9870f016766d2aff26294960e64a83c6cc1cca', 'unresolved']],
  [19121, [13304177, 13337726, 'FunctionDeclaration', '4fd5392c9230e1851caaa9108bf5c247701c08abc954d05de8c71b6eaea63f97', 'unresolved']],
  [19132, [13345795, 13350230, 'FunctionDeclaration', 'c1a44d825f6fa751c6903a830062de458cca11cd2d9abcd2d2438217652a7ade', 'unresolved']],
  [19190, [13375422, 13375793, 'VariableDeclaration', '5dc3795d27937f7814d479491d729912c6f73b5171ce2a231c14d25f9e6c6739', 'changed']],
])

const expectedOwners = new Map([
  [13011, ['src/tools/FileReadTool/FileReadTool.ts']], [13426, ['src/utils/messages.ts']], [13453, ['src/utils/messages.ts']],
  [13790, ['src/utils/sideQuestion.ts']], [13792, ['src/utils/sideQuestion.ts']], [13953, ['src/commands/compact/compact.ts', 'src/commands/commit-push-pr.ts']],
  [14009, ['src/components/Settings/Status.tsx']], [14010, ['src/components/Settings/Status.tsx']], [14459, ['src/components/PromptInput/utils.ts']],
  [14719, ['src/commands/plugin/BrowseMarketplace.tsx']], [14722, ['src/commands/plugin/DiscoverPlugins.tsx']], [17811, ['src/hooks/useVimInput.ts', 'src/vim/types.ts']],
  [17920, ['src/components/PromptInput/PromptInput.tsx']], [17939, ['src/remote/sdkMessageAdapter.ts']], [17945, ['src/remote/sdkMessageAdapter.ts']],
  [18029, ['src/hooks/useCancelRequest.ts']], [18238, ['src/components/FeedbackSurvey/TranscriptSharePrompt.tsx']], [18273, ['src/utils/plugins/officialMarketplaceStartupCheck.ts']],
  [18299, ['src/services/tips/tipRegistry.ts']], [18546, ['src/services/api/bootstrap.ts']], [18608, ['src/components/ui/OrderedList.tsx', 'src/components/LogoV2/WelcomeV2.tsx']],
  [18705, ['src/interactiveHelpers.tsx']], [18707, ['src/interactiveHelpers.tsx']], [18708, ['src/interactiveHelpers.tsx']], [18711, ['src/interactiveHelpers.tsx']],
  [19050, ['src/services/SessionMemory/sessionMemory.ts']], [19064, ['src/cli/transports/WebSocketTransport.ts']], [19088, ['src/QueryEngine.ts']],
  [19121, ['src/cli/print.ts']], [19132, ['src/cli/print.ts']], [19190, ['src/commands/install.tsx']],
])

function walk(value, visit) {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) return void value.forEach(child => walk(child, visit))
  if (typeof value.type === 'string') visit(value)
  for (const [key, child] of Object.entries(value)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) walk(child, visit)
  }
}

function countIdentity(source, kind, value) {
  const ast = parse(source, { allowHashBang: true, ecmaVersion: 'latest', sourceType: 'module' })
  let count = 0
  walk(ast, node => {
    if (kind === 'string' && node.type === 'Literal' && node.value === value) count += 1
    if (kind === 'number' && node.type === 'Literal' && String(node.value) === value) count += 1
    if (kind === 'property') {
      if (['Property', 'MethodDefinition', 'PropertyDefinition'].includes(node.type) && !node.computed && node.key?.type === 'Identifier' && node.key.name === value) count += 1
      if (node.type === 'MemberExpression' && !node.computed && node.property?.type === 'Identifier' && node.property.name === value) count += 1
    }
  })
  return count
}

const paired = new Map([
  [13011, [12924, [['property', 'fileReadingLimits', 1]]]],
  [18238, [18091, [['property', 'y', 1], ['property', 'd', 1]]]],
  [18273, [18126, [['number', '3600000', 1]]]],
  [18299, [18152, [['number', '86400000', 2]]]],
  [18546, [18398, [['property', 'number', 5]]]],
  [18608, [18460, [['property', 'createContext', 1]]]],
  [18705, [18557, [['property', 'dimColor', 1]]]],
  [18707, [18559, [['string', 'haiku', 1]]]],
  [18708, [18560, [['string', 'haiku', 1]]]],
  [18711, [18563, [['property', 'sonnet', 1], ['property', 'opus', 1], ['property', 'haiku', 1]]]],
  [19050, [18898, [['property', 'at', 1]]]],
  [19190, [19039, [['property', 'createElement', 1]]]],
])

test('target108 pins every target-added owner-residue unit and owner exactly', {
  skip: !selected ? `not applicable to ${semanticCase}` : !targetPath ? 'authenticated target108 bundle is required' : false,
}, () => {
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(sha256(targetBytes), 'dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73')
  const target = targetBytes.toString('utf8')
  assert.equal(units.size, 31)
  for (const [index, identity] of units) {
    const region = structural.regions.find(item => item.target?.index === index)
    assert.deepEqual([region.target.start, region.target.end, region.target.nodeType, region.target.sourceHash, region.classification], identity, `${index}: identity`)
    const fragment = target.slice(identity[0], identity[1])
    assert.equal(sha256(fragment), identity[3], `${index}: bytes`)
    assert.equal(parse(fragment, { ecmaVersion: 'latest', sourceType: 'module' }).body.length, 1, `${index}: AST`)
    const row = coverage.rows.find(item => item.targetIndex === index)
    assert.deepEqual(row.ownerIds.map(id => owners.get(id)), expectedOwners.get(index), `${index}: owners`)
    assert.ok(row.evidenceIds.includes('target108-target-added-residue-target-fragment'))
    assert.ok(row.evidenceIds.includes('target108-target-added-residue-semantic-test'))
    for (const owner of expectedOwners.get(index)) assert.ok(fs.statSync(path.join(sourceRoot, owner.slice(4))).isFile(), owner)
  }
})

test('paired target-added ordinals are locally invariant under scanner AST semantics', {
  skip: !selected ? `not applicable to ${semanticCase}` : !baselinePath || !targetPath ? 'authenticated target107 and target108 bundles are required' : false,
}, () => {
  const baseline = indexGeneratedBundle(baselinePath)
  const target = indexGeneratedBundle(targetPath)
  assert.equal(baseline.evidence.sha256, '6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844')
  for (const [targetIndex, [baselineIndex, identities]] of paired) {
    const region = structural.regions.find(item => item.target?.index === targetIndex)
    assert.equal(region.baselineUnitIndex, baselineIndex)
    assert.equal(region.pairReason, 'unique-coarse-structural-hash')
    const before = baseline.source.slice(baseline.units[baselineIndex].start, baseline.units[baselineIndex].end)
    const after = target.source.slice(target.units[targetIndex].start, target.units[targetIndex].end)
    for (const [kind, value, expected] of identities) {
      assert.equal(countIdentity(before, kind, value), expected, `${targetIndex}: baseline ${kind}:${value}`)
      assert.equal(countIdentity(after, kind, value), expected, `${targetIndex}: target ${kind}:${value}`)
    }
  }
})

test('authenticated fragments expose the target-added runtime behavior', {
  skip: !selected ? `not applicable to ${semanticCase}` : !targetPath ? 'authenticated target108 bundle is required' : false,
}, () => {
  const target = fs.readFileSync(targetPath, 'utf8')
  const fragment = index => { const x = units.get(index); return target.slice(x[0], x[1]) }
  const required = new Map([
    [13426, ['"pen_mode_enter","pen_mode_exit"', '.includes(q.type))return[]']],
    [13790, ['.history=[]']], [13792, ['.history.flatMap', 'if(Y&&j&&!H)', '.slice(-yTY)']],
    [13953, ['setStreamMode?.("requesting")', 'finally{K.setStreamMode?.("requesting")']],
    [14009, ['box:"plain"', 'columns:[{bold:!0},{}]']], [14010, ['Ce.Row']],
    [14459, ['"pageup","pagedown","home","end"', '"mouse","f1","f2"', '"f10","f11","f12"']],
    [14719, ['status:"warning",withSpace:!0', 'status:"error",withSpace:!0']],
    [14722, ['status:"warning",withSpace:!0', 'status:"error",withSpace:!0']],
    [17811, ['insertedText:Z.insertedText+D', 'P.key==="left")T="h"', 'P.key==="right")T="l"']],
    [17920, ['Z8.key==="backspace"||Z8.key==="delete"', 'K6&&i===""']],
    [17945, ['q.status==="requesting"', 'type:"stream_request_start"']],
    [18029, ['isInputEmpty:J']], [19064, ['[Symbol.dispose](){this.close()}']],
    [19088, ['onPermissionDenial', 'typeof y6==="function"', 'ttft_ms:y6.ttftMs', 'status:"requesting"', 'stop_reason:"tool_deferred_unavailable"']],
    [19121, ['p6.params._meta', 'subtype==="api_retry"', 'Math.max(_1,V1.error_status??0)']],
    [19132, ['success:!1,entrypoint:"print"']],
  ])
  for (const [index, needles] of required) for (const needle of needles) assert.ok(fragment(index).includes(needle), `${index}: ${needle}`)

  const signedThinking = vm.runInNewContext(`(${fragment(13453)})`)
  assert.equal(signedThinking({ type: 'redacted_thinking' }), true)
  assert.equal(signedThinking({ type: 'thinking', signature: 'sig' }), true)
  assert.equal(signedThinking({ type: 'thinking', signature: '' }), false)
  assert.equal(signedThinking({ type: 'text', signature: 'sig' }), false)

  const adapt = vm.runInNewContext(`(${fragment(17939)})`)
  assert.deepEqual({ ...adapt({ event: { type: 'x' }, ttft_ms: 17 }) }, { type: 'stream_event', event: { type: 'x' }, ttftMs: 17 })
  assert.equal(Object.hasOwn(adapt({ event: {} }), 'ttftMs'), false)
})

test('authored owners retain source forms for compiler-lowered and recovered behavior', {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}, () => {
  const source = relative => fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
  assert.match(source('commands/compact/compact.ts'), /setStreamMode\?\.\(['"]requesting['"]\)/)
  assert.match(source('hooks/useCancelRequest.ts'), /isInputEmpty/)
  assert.match(source('components/ui/OrderedList.tsx'), /createContext/)
  assert.match(source('hooks/useVimInput.ts'), /insertedText/)
  // Exact target fragments above authenticate release-only recovery where the
  // cumulative source has intentionally evolved past the historical spelling.
  assert.match(source('remote/sdkMessageAdapter.ts'), /convertStreamEvent/)
  assert.match(source('cli/transports/WebSocketTransport.ts'), /class WebSocketTransport/)
  assert.match(source('QueryEngine.ts'), /stream_request_start/)
  assert.match(source('cli/print.ts'), /export|function/)
})
