import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.97-to-2.1.98'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_98_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'authenticated 2.1.97 and 2.1.98 bundles are required'
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

// Full direct and required-adjacent expansion for the target98 image-limit
// propagation. These rows cover the limits value/resolver, validator, resize
// and paste helpers, MCP graph, query/API boundaries, attachment graph,
// permission/prompt UI, processUserInput, and the transitive REPL caller.
const units = new Map([
  [6758, ['unresolved', 4960811, 4960906, 'VariableDeclaration', 'a27cd4d4d496f1c02c1e928f1511d9e6bb9a073b080b9cc9ef8384e6154bfb6e']],
  [7047, ['unresolved', 5081814, 5082078, 'FunctionDeclaration', '6e63c2bf0d8dced566f1cca6bb3d7fa5abaa2f5a540fe05c61fb1e9ad29790a5']],
  [7048, ['unresolved', 5082078, 5082232, 'FunctionDeclaration', 'ce46b4661a86f0df29d7ab3214e43f7c3fe48731a5a4179c0cae98c730d4a125']],
  [7049, ['unresolved', 5082232, 5082386, 'FunctionDeclaration', 'ca2c8abf8cc842254223cb7896797f07dc158d3af60e8245919681327debae6b']],
  [7050, ['unresolved', 5082386, 5082819, 'FunctionDeclaration', '41a2ff7f0ec44524a9d6684d4d92b4c03bed8a539b0422ab2c2debf6ae4e9ce7']],
  [7107, ['unresolved', 5210433, 5213725, 'FunctionDeclaration', 'a86b41168ff3686d5de90dfa01a30cfabd0f8fd1f61dcd1e490692e09654c059']],
  [7108, ['unresolved', 5213725, 5214242, 'FunctionDeclaration', '38fa14b92ac6ad6085055e7af240c7959c850de2cad3cf0d281bef1e6e55c1ac']],
  [7109, ['unresolved', 5214242, 5214381, 'FunctionDeclaration', '5c1402f2b3b99ba7565a4363bc9f5141a7db08ec6bf5abfffa2d86d9c9cfdcf5']],
  [7110, ['unresolved', 5214381, 5215126, 'FunctionDeclaration', '684a5802ce278e059c9150403a4e91229045abb4ad9d345fbb9a6304da51b575']],
  [7112, ['unresolved', 5215217, 5215446, 'FunctionDeclaration', 'cb70c96c64b9f79e35bb40cbe040cc9e88c58ed4dea79c637877d492d50dacab']],
  [7314, ['unresolved', 5300017, 5300260, 'FunctionDeclaration', '22ee2a38bd7ddbabcbb878b28bfae53965cbb245594acf3628825f47f1b3c954']],
  [8605, ['unresolved', 6840291, 6841530, 'FunctionDeclaration', '30d6293765ac69c701be01efe8e59531d8509de8f876a281513e8451598c2c4a']],
  [8638, ['unresolved', 6847239, 6853843, 'FunctionDeclaration', 'c8577a0fe99c7e782760ac7738a5183b784a8ac200a3817b8bafeb2945e58527']],
  [8755, ['unresolved', 6896238, 6896350, 'FunctionDeclaration', '3331f9cdb850663102169c881d2bb13a4619723c86e2051fcccac75436f4306d']],
  [8761, ['unresolved', 6899442, 6900262, 'FunctionDeclaration', 'f66780a07296ed8a0e09e3b9fd10f9c901b2858cf8df8a420d15b52a9248da6c']],
  [8764, ['unresolved', 6900910, 6901484, 'FunctionDeclaration', 'd782fdc803befc1e68edc76e205baadd0299bc5f3c5aef12427b4e242805c481']],
  [8766, ['unresolved', 6901573, 6902722, 'FunctionDeclaration', '2b628e16c542d6b5ed8bbfc119962061598c955072c6cc69113513919cb20893']],
  [8767, ['unresolved', 6902722, 6904789, 'FunctionDeclaration', '24edfb570b886eb8cc770b23ec30921983a6d88d7d53120a52662eca3afcea27']],
  [8768, ['unresolved', 6904789, 6907184, 'FunctionDeclaration', 'fc0fd4ea6a031ace7bde9f2dc7f1f2026eef143cde96e6a475331b0e57c14797']],
  [8773, ['unresolved', 6908742, 6926464, 'VariableDeclaration', 'e4c6566dfc24068f40925f97063d0592a197b00adb0326e78bd8d98129b0f88c']],
  [12508, ['unresolved', 9626275, 9640032, 'FunctionDeclaration', 'c3f0b1215288bf23d5fe0f6fa9ffb44359a55b73b8902d7b243db66f6cb2fd7e']],
  [12762, ['unresolved', 9769427, 9771602, 'FunctionDeclaration', 'a51ec18cd56d374ee5f7e02d7083036f365daa4d247c0b7773e36c5aa86b8026']],
  [12764, ['unresolved', 9772077, 9772509, 'FunctionDeclaration', 'c1843db0431699f9f3eb5a7b3b3ca14244e5655b2ce4f59cf40531d6c1e9a38b']],
  [12766, ['unresolved', 9772704, 9772928, 'FunctionDeclaration', 'ee8ee1a8df34feda8f238e3b30eb52e5bae5878cbcba0a426b97f9c417345c67']],
  [13095, ['unresolved', 9909184, 9911288, 'FunctionDeclaration', 'c34705051069b9b82034a8fef1ac7ad63ed99fe8866bc911a039d73a50d2654b']],
  [13418, ['unresolved', 10062674, 10062705, 'FunctionDeclaration', '5498eb2f9a391e30fe42ca7c41f81ba5223962a1e0c5c5c4496c45c7c4f8a014']],
  [13419, ['unresolved', 10062705, 10064516, 'FunctionDeclaration', '27a1825164907307d653ab2cbc8107c1496e23932f9fec582437420635f421d0']],
  [16420, ['unresolved', 11787252, 11805190, 'FunctionDeclaration', '40c113f0a7a71807e10bddff6046050c2403709c5fedbd75b5bac7fc117ceb82']],
  [16846, ['unresolved', 12043590, 12051573, 'FunctionDeclaration', '363346663606d87a92d3d835aebaee0565504162359c6490d66fa85643dfb35e']],
  [16853, ['unresolved', 12051818, 12051984, 'FunctionDeclaration', '0e235f601a4caf68e5fb207412fa57db5bb7efa0a45ac86cfd4ec408bbe8c2ce']],
  [17002, ['unresolved', 12111032, 12120172, 'FunctionDeclaration', '98e2de90ee65ea172b49370a8bee502896051afbc9f0c7db01ad3df1bbf79272']],
  [17476, ['unresolved', 12320440, 12345747, 'FunctionDeclaration', '791c9ac5b6c933a32c4b619e6a0fb6a0a39c5d37471d8ed192336a6149dfbc8c']],
  [17630, ['unresolved', 12406518, 12409252, 'FunctionDeclaration', 'f7d2d76d8f2b36fa13d615dff9ab581669fdffa1585079ff0e361f15405e2fc0']],
  [18079, ['unresolved', 12586287, 12642423, 'FunctionDeclaration', 'b0e7a87cd8a971450e124c23eeb72bf7a758fc1daae101e1d1e11b423413613e']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
}

function assertFragments(contents, fragments, owner) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${owner}: ${fragment}`)
  }
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function functionBody(contents, name) {
  const declaration = contents.indexOf(`function ${name}(`)
  assert.notEqual(declaration, -1, `${name}: declaration`)
  const bodyStart = contents.indexOf('{', declaration)
  assert.notEqual(bodyStart, -1, `${name}: body start`)
  let depth = 0
  for (let index = bodyStart; index < contents.length; index++) {
    if (contents[index] === '{') depth++
    if (contents[index] !== '}') continue
    depth--
    if (depth === 0) return contents.slice(bodyStart + 1, index)
  }
  assert.fail(`${name}: unterminated body`)
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

async function compileImageValidation(contents) {
  const ts = await loadTypeScript()
  const start = contents.indexOf('export class ImageSizeError')
  assert.notEqual(start, -1, 'ImageSizeError: declaration')
  const declarations = contents.slice(start)
  const javascript = ts.transpileModule(
    `
      const validationEvents = [];
      function logEvent(name, values) { validationEvents.push({ name, values }); }
      function formatFileSize(value) { return value + ' B'; }
      ${declarations}
      export { validationEvents };
    `,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const module = { exports: {} }
  new Function('exports', 'module', javascript)(module.exports, module)
  return module.exports
}

test(
  'authenticated target98 pins dynamic image limits, explicit validation, and the complete propagation graph',
  bundleOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988',
    )
    assert.equal(
      sha256(targetBytes),
      '27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556',
    )

    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const unitSource = new Map()
    for (const [index, [classification, start, end, nodeType, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, classification, `${index}: class`)
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        [start, end, nodeType, hash],
        `${index}: identity`,
      )
      const exactSource = target.slice(start, end)
      unitSource.set(index, exactSource)
      assert.equal(sha256(exactSource), hash, `${index}: exact bytes`)
      assert.equal(
        baseline.includes(exactSource),
        false,
        `${index}: exact target unit absent from baseline97`,
      )
    }

    assert.equal(
      unitSource.get(6758),
      'var Ga=y(()=>{I$6={maxWidth:2000,maxHeight:2000,maxBase64Size:5242880,targetRawSize:3932160}});',
    )
    assertFragments(unitSource.get(7314), [
      'function NO(q)',
      'sf4(q)?.imageLimits??nKz[V_(q)]',
      'if(!K)return I$6',
      'targetRawSize:K.targetRawSize??_*3/4',
    ], 'row7314 image-limit resolver')

    assertFragments(unitSource.get(7050), [
      'function Mt6(q,K)',
      'if(wD4(O)){$D4(O,++z,K,_);continue}',
      'if(a6z(O)){for(let w of O.content)if(wD4(w))$D4(w,++z,K,_)}',
      'throw new EE6(_,K)',
    ], 'row7050 explicit direct/nested validator')
    assertFragments(unitSource.get(7049), [
      'tengu_image_api_validation_failed',
      'base64_size_bytes:Y',
      'max_bytes:_',
    ], 'row7049 validator telemetry')

    const targetNormalize = unitSource.get(13095)
    assert.ok(targetNormalize.startsWith('function x0(q,K=[])'))
    assert.equal(targetNormalize.includes('Mt6('), false)
    assert.ok(baseline.includes('function WD(q,K=[])'))
    assert.ok(
      baseline.includes('return kD4(X),X'),
      'baseline97 validates internally inside two-argument normalization',
    )

    const targetQuery = unitSource.get(12508)
    assert.equal(occurrences(targetQuery, 'Mt6('), 2)
    assertFragments(targetQuery, [
      'Mt6(E6,NO(T.options.mainLoopModel).maxBase64Size)',
      'Mt6(l6,NO(T.options.mainLoopModel).maxBase64Size)',
    ], 'row12508 query tool-result boundaries')
    const targetAPI = unitSource.get(16420)
    assertFragments(targetAPI, [
      'let R=q,E=x0(R,M)',
      'Mt6(E,NO(A.model).maxBase64Size)',
    ], 'row16420 API boundary')

    const propagation = new Map([
      [7107, ['z.targetRawSize', 'z.maxWidth', 'z.maxHeight']],
      [7108, ['limits:_', 'Sa(z,z.length,Y,_)']],
      [7109, ['function xG4(q,K)', 'limits:K']],
      [7110, ['maxBytes:K']],
      [7112, ['function mG4(q,K)', 'uG4(_,K)']],
      [8605, ['q.maxWidth,q.maxHeight', 'q.targetRawSize']],
      [8755, ['imageLimits:I$6']],
      [8761, ['function TB4(q,K,_)', 'limits:_']],
      [8764, ['function mfz(q,K,_,z)', 'TB4(O,_,z)']],
      [8766, ['function Bfz(q,K,_,z,Y=!1)', 'mfz(q,K,_,z)']],
      [8767, ['imageLimits:J', 'imageLimits:J']],
      [8768, ['imageLimits:j', 'Bfz(W,z,K,j,$)']],
      [8773, ['imageLimits:NO(j.options.mainLoopModel)', 'H=NO(O.options.mainLoopModel)']],
      [12762, ['let w=NO(K.options.mainLoopModel)', '$d8(z,w)']],
      [12764, ['function $d8(q,K)', 'I0Y(z.pastedContents,K)']],
      [12766, ['function I0Y(q,K)', 'limits:K']],
      [13418, ['return NO(uK())']],
      [13419, ['$L6(mLK())']],
      [16846, ['g=NO(U)', 'Kj7(S,c)']],
      [16853, ['function Kj7(q,K)', 'limits:K']],
      [17002, ['limits:NO(Z)']],
      [17476, ['$L6(NO(K6))']],
      [17630, ['T=NO(z.options.mainLoopModel)', 'xG4(c,T)', 'limits:T']],
      [18079, ['$d8(Y8,NO(D6))']],
    ])
    for (const [index, fragments] of propagation) {
      assertFragments(unitSource.get(index), fragments, `row${index}`)
    }

    for (const fragment of ['tengu_crimson_vector', 'claude-opus-4-7']) {
      assert.equal(baseline.includes(fragment), false, `${fragment}: baseline97`)
      assert.equal(target.includes(fragment), false, `${fragment}: target98`)
    }

    if (latestPath) {
      const latestBytes = fs.readFileSync(latestPath)
      assert.equal(
        sha256(latestBytes),
        'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
      )
      const latest = latestBytes.toString('utf8')
      assertFragments(latest, [
        'tengu_image_api_validation_failed',
        'type!=="tool_result"',
        'tengu_api_before_normalize',
        '.maxBase64Size',
        'tengu_crimson_vector',
        'claude-opus-4-7',
        'maxWidth:2576,maxHeight:2576',
        '10485760',
      ], 'authenticated target116 evolution')
    }
  },
)

test(
  'source root owns two-argument normalization and explicit model-limit propagation',
  sourceOptions,
  () => {
    const constants = source('constants/apiLimits.ts')
    const limits = source('utils/imageLimits.ts')
    const validation = source('utils/imageValidation.ts')
    const messages = source('utils/messages.ts')
    const query = source('query.ts')
    const api = source('services/api/claude.ts')
    const resizer = source('utils/imageResizer.ts')
    const paste = source('utils/imagePaste.ts')
    const pasteHandler = source('hooks/usePasteHandler.ts')
    const mcp = source('services/mcp/client.ts')
    const attachments = source('utils/attachments.ts')
    const processInput = source('utils/processUserInput/processUserInput.ts')
    const promptInput = source('components/PromptInput/PromptInput.tsx')
    const askPermission = source(
      'components/permissions/AskUserQuestionPermissionRequest/AskUserQuestionPermissionRequest.tsx',
    )
    const exitPermission = source(
      'components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx',
    )
    const repl = source('screens/REPL.tsx')
    const target98Mode = !limits.includes(
      'FIRST_PARTY_EXTENDED_MAX_BASE64_SIZE',
    )

    assertFragments(constants, [
      'export const API_IMAGE_MAX_BASE64_SIZE = 5 * 1024 * 1024',
      'export const IMAGE_TARGET_RAW_SIZE = (API_IMAGE_MAX_BASE64_SIZE * 3) / 4',
      'export const IMAGE_MAX_WIDTH = 2000',
      'export const IMAGE_MAX_HEIGHT = 2000',
    ], 'constants/apiLimits.ts')
    assertFragments(limits, [
      'export const DEFAULT_IMAGE_LIMITS: ImageLimits = {',
      'maxWidth: IMAGE_MAX_WIDTH',
      'maxHeight: IMAGE_MAX_HEIGHT',
      'maxBase64Size: API_IMAGE_MAX_BASE64_SIZE',
      'targetRawSize: IMAGE_TARGET_RAW_SIZE',
      'resolveAntModel(model)?.imageLimits ??',
      'MODEL_IMAGE_LIMIT_OVERRIDES[getCanonicalName(model)]',
      'export function getImageLimits(model: string): ImageLimits',
      'override.targetRawSize ?? (maxBase64Size * 3) / 4',
      'return getImageLimits(getMainLoopModel())',
    ], 'utils/imageLimits.ts')

    assert.ok(messages.includes(
      'export function normalizeMessagesForAPI(\n  messages: Message[],\n  tools: Tools = [],\n)',
    ))
    assert.equal(
      messages.includes('validateImagesForAPI'),
      false,
      'normalization remains a two-argument transform without hidden validation',
    )
    assert.equal(occurrences(query, 'validateImagesForAPI('), 2)
    assert.equal(occurrences(api, 'validateImagesForAPI('), 1)
    assert.match(
      query,
      /const normalizedMessages = normalizeMessagesForAPI\([\s\S]{0,180}?\)\s*validateImagesForAPI\(\s*normalizedMessages,\s*getImageLimits\(toolUseContext\.options\.mainLoopModel\)\s*\.maxBase64Size,/,
    )
    assert.match(
      api,
      /let messagesForAPI = normalizeMessagesForAPI\([\s\S]{0,120}?\)\s*validateImagesForAPI\(\s*messagesForAPI,\s*getImageLimits\(options\.model\)\.maxBase64Size,/,
    )

    assertFragments(validation, [
      'function isToolResultBlock(',
      "return value.type === 'tool_result' && Array.isArray(value.content)",
      'function collectOversizedImage(',
      'max_bytes: maxSize',
      'export function validateImagesForAPI(\n  messages: unknown[],\n  maxSize: number,\n)',
      'collectOversizedImage(block, ++imageIndex, maxSize, oversizedImages)',
      'for (const nestedBlock of block.content)',
      '++imageIndex,',
      'throw new ImageSizeError(oversizedImages, maxSize)',
    ], 'utils/imageValidation.ts')
    assert.equal(
      validation.includes('maxSize: number ='),
      false,
      'the API limit is an explicit validator input',
    )

    assertFragments(resizer, [
      'export async function maybeResizeAndDownsampleImageBuffer(',
      'limits: ImageLimits',
      'limits.targetRawSize',
      'limits.maxWidth',
      'limits.maxHeight',
      'limits.maxBase64Size',
      'export async function maybeResizeAndDownsampleImageBlock(',
    ], 'utils/imageResizer.ts')
    assertFragments(paste, [
      'export async function getImageFromClipboard(',
      'limits: ImageLimits',
      'readClipboard(limits.maxWidth, limits.maxHeight)',
      'buffer.length > limits.targetRawSize',
    ], 'utils/imagePaste.ts')
    assertFragments(pasteHandler, [
      'getImageFromClipboard(getCurrentImageLimits())',
      'const imageLimits = getCurrentImageLimits()',
      'tryReadImageFromPath(',
      'imageLimits)',
    ], 'hooks/usePasteHandler.ts')

    assertFragments(mcp, [
      'imageLimits: getImageLimits(\n                      context.options.mainLoopModel,',
      'export async function transformResultContent(',
      'imageLimits: ImageLimits',
      'limits: imageLimits',
      'export async function transformMCPResult(',
      'transformResultContent(item, name, imageLimits)',
      'export async function processMCPResult(',
      'imageLimits,',
    ], 'services/mcp/client.ts')
    assertFragments(attachments, [
      'const imageLimits = getImageLimits(toolUseContext.options.mainLoopModel)',
      'getQueuedCommandAttachments(queuedCommands, imageLimits)',
      'export async function getQueuedCommandAttachments(',
      'imageLimits: ImageLimits',
      'buildImageContentBlocks(\n        _.pastedContents,\n        imageLimits,',
      'maybeResizeAndDownsampleImageBlock(\n        imageBlock,\n        imageLimits,',
    ], 'utils/attachments.ts')
    assertFragments(processInput, [
      'const imageLimits = getImageLimits(context.options.mainLoopModel)',
      'maybeResizeAndDownsampleImageBlock(',
      'imageLimits,',
    ], 'utils/processUserInput/processUserInput.ts')
    assertFragments(promptInput, [
      'getImageFromClipboard(getImageLimits(mainLoopModel))',
    ], 'components/PromptInput/PromptInput.tsx')
    assertFragments(askPermission, [
      'convertImagesToBlocks(',
      'getCurrentImageLimits()',
      'imageLimits: ImageLimits',
      'maybeResizeAndDownsampleImageBlock(block, imageLimits)',
    ], 'AskUserQuestionPermissionRequest.tsx')
    assertFragments(exitPermission, [
      'const imageLimits = getImageLimits(getMainLoopModel())',
      'maybeResizeAndDownsampleImageBlock(block, imageLimits)',
    ], 'ExitPlanModePermissionRequest.tsx')

    if (target98Mode) {
      assert.ok(limits.includes(
        'const MODEL_IMAGE_LIMIT_OVERRIDES: Record<string, ImageLimitOverrides> = {}',
      ))
      assert.equal(limits.includes('tengu_crimson_vector'), false)
      assert.equal(limits.includes("'claude-opus-4-7'"), false)
      assert.equal(limits.includes('getProviderMaxBase64Size'), false)
      assert.equal(mcp.includes('imageLimits: ImageLimits ='), false)
      assert.ok(paste.includes('limits: ImageLimits,\n)'))
      assert.ok(attachments.includes('imageLimits: ImageLimits,\n)'))
      assertFragments(repl, [
        'getQueuedCommandAttachments(\n        removedNotifications,\n        getImageLimits(mainLoopModel),',
      ], 'target98 screens/REPL.tsx')
    } else {
      assertFragments(limits, [
        'const FIRST_PARTY_EXTENDED_MAX_BASE64_SIZE = 10 * 1024 * 1024',
        "'claude-opus-4-7': { maxWidth: 2576, maxHeight: 2576 }",
        "getAPIProvider() === 'firstParty'",
        'isFirstPartyAnthropicBaseUrl()',
        "getFeatureValue_CACHED_MAY_BE_STALE('tengu_crimson_vector', false)",
        'const providerMaxBase64Size = getProviderMaxBase64Size()',
        'targetRawSize: (providerMaxBase64Size * 3) / 4',
      ], 'target116 utils/imageLimits.ts')
      assert.ok(mcp.includes(
        'imageLimits: ImageLimits = getCurrentImageLimits()',
      ))
      assert.ok(attachments.includes(
        'imageLimits: ImageLimits,\n)',
      ))
      assertFragments(repl, [
        'getQueuedCommandAttachments(removedNotifications, getImageLimits(mainLoopModel))',
      ], 'target116 screens/REPL.tsx')
    }
  },
)

test(
  'source resolver and explicit validator execute provider/model and nested tool-result limits',
  sourceOptions,
  async () => {
    const limits = source('utils/imageLimits.ts')
    const validation = source('utils/imageValidation.ts')
    const target98Mode = !limits.includes(
      'FIRST_PARTY_EXTENDED_MAX_BASE64_SIZE',
    )
    const fiveMiB = 5 * 1024 * 1024
    const defaultLimits = {
      maxWidth: 2000,
      maxHeight: 2000,
      maxBase64Size: fiveMiB,
      targetRawSize: (fiveMiB * 3) / 4,
    }

    const buildResolver = ({
      resolveAntModel = () => undefined,
      overrides = {},
      getProviderMaxBase64Size = () => fiveMiB,
    } = {}) =>
      Function(
        'resolveAntModel',
        'MODEL_IMAGE_LIMIT_OVERRIDES',
        'getCanonicalName',
        'DEFAULT_IMAGE_LIMITS',
        'getProviderMaxBase64Size',
        `"use strict"; return model => {${functionBody(limits, 'getImageLimits')}}`,
      )(
        resolveAntModel,
        overrides,
        model => model.toLowerCase(),
        defaultLimits,
        getProviderMaxBase64Size,
      )

    if (target98Mode) {
      const resolve = buildResolver()
      assert.strictEqual(resolve('unknown-model'), defaultLimits)

      const resolveOverride = buildResolver({
        resolveAntModel: model =>
          model === 'ant-model'
            ? { imageLimits: { maxWidth: 1440, maxBase64Size: 400 } }
            : undefined,
        overrides: {
          'ant-model': { maxWidth: 9999, maxBase64Size: 800 },
          'mapped-model': { maxHeight: 1337, maxBase64Size: 600 },
        },
      })
      assert.deepEqual(resolveOverride('ant-model'), {
        maxWidth: 1440,
        maxHeight: 2000,
        maxBase64Size: 400,
        targetRawSize: 300,
      })
      assert.deepEqual(resolveOverride('MAPPED-MODEL'), {
        maxWidth: 2000,
        maxHeight: 1337,
        maxBase64Size: 600,
        targetRawSize: 450,
      })
    } else {
      const providerBody = functionBody(limits, 'getProviderMaxBase64Size')
      const provider = ({ api = 'firstParty', base = true, gate = true } = {}) => {
        let featureCall
        const resolveProvider = Function(
          'getAPIProvider',
          'isFirstPartyAnthropicBaseUrl',
          'getFeatureValue_CACHED_MAY_BE_STALE',
          'FIRST_PARTY_EXTENDED_MAX_BASE64_SIZE',
          'DEFAULT_IMAGE_LIMITS',
          `"use strict"; return () => {${providerBody}}`,
        )(
          () => api,
          () => base,
          (key, fallback) => {
            featureCall = [key, fallback]
            return gate
          },
          10 * 1024 * 1024,
          defaultLimits,
        )
        const value = resolveProvider()
        if (api === 'firstParty' && base) {
          assert.deepEqual(featureCall, ['tengu_crimson_vector', false])
        }
        return value
      }

      assert.equal(provider(), 10 * 1024 * 1024)
      assert.equal(provider({ api: 'bedrock' }), fiveMiB)
      assert.equal(provider({ base: false }), fiveMiB)
      assert.equal(provider({ gate: false }), fiveMiB)

      const tenMiB = provider()
      const resolve = buildResolver({
        overrides: {
          'claude-opus-4-7': { maxWidth: 2576, maxHeight: 2576 },
        },
        getProviderMaxBase64Size: () => tenMiB,
      })
      assert.deepEqual(resolve('unknown-model'), {
        maxWidth: 2000,
        maxHeight: 2000,
        maxBase64Size: tenMiB,
        targetRawSize: (tenMiB * 3) / 4,
      })
      assert.deepEqual(resolve('CLAUDE-OPUS-4-7'), {
        maxWidth: 2576,
        maxHeight: 2576,
        maxBase64Size: tenMiB,
        targetRawSize: (tenMiB * 3) / 4,
      })
    }

    const {
      ImageSizeError,
      validateImagesForAPI,
      validationEvents,
    } = await compileImageValidation(validation)
    const image = data => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data },
    })
    const user = content => ({
      type: 'user',
      message: { role: 'user', content },
    })

    assert.doesNotThrow(() =>
      validateImagesForAPI([
        user([
          { type: 'tool_result', content: [image('12345')] },
          { type: 'tool_result', content: 'not-an-array' },
        ]),
        {
          type: 'assistant',
          message: { role: 'assistant', content: [image('oversized')] },
        },
      ], 5),
    )
    assert.equal(validationEvents.length, 0)

    let error
    try {
      validateImagesForAPI([
        user([
          image('123456'),
          {
            type: 'tool_result',
            content: [{ type: 'text', text: 'control' }, image('1234567')],
          },
        ]),
      ], 5)
    } catch (caught) {
      error = caught
    }
    assert.ok(error instanceof ImageSizeError)
    assert.equal(error.name, 'ImageSizeError')
    assert.match(error.message, /2 images exceed the API limit \(5 B\)/)
    assert.match(error.message, /Image 1: 6 B/)
    assert.match(error.message, /Image 2: 7 B/)
    assert.deepEqual(validationEvents, [
      {
        name: 'tengu_image_api_validation_failed',
        values: { base64_size_bytes: 6, max_bytes: 5 },
      },
      {
        name: 'tengu_image_api_validation_failed',
        values: { base64_size_bytes: 7, max_bytes: 5 },
      },
    ])

    validationEvents.length = 0
    assert.throws(
      () =>
        validateImagesForAPI([
          user([{ type: 'tool_result', content: [image('123456')] }]),
        ], 5),
      error =>
        error instanceof ImageSizeError &&
        /Image base64 size \(6 B\) exceeds API limit \(5 B\)/.test(
          error.message,
        ),
    )
    assert.deepEqual(validationEvents[0], {
      name: 'tengu_image_api_validation_failed',
      values: { base64_size_bytes: 6, max_bytes: 5 },
    })
  },
)
