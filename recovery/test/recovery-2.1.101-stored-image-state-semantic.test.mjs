import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const historical = semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
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
  [8740, [6880279, 6881003, '98270b58e2fc9a45586ae6f0ec2cd6f9eb4e6a8650a1fa7e6d2f97c4d71995b9', 'FunctionDeclaration']],
  [8761, [6890823, 6893170, 'd672d96a8fce7c271aec13e05017aeebd98cfec1a8d51035b5222df2f7dd1d28', 'VariableDeclaration']],
  [8773, [6898796, 6910968, 'a1b9bbdf9e4717b03b4e4fea17ccdbe7e34f5136d6435dbc3925aa84562b05af', 'FunctionDeclaration']],
  [11593, [8894491, 8894988, 'a2d64e191b846dac29836ad8155dd97775266363fd28bdd60eb65365fccaa0bc', 'FunctionDeclaration']],
  [13661, [10170333, 10171015, '728a9fe8a1277ceb71e88cc145eb9d5d97bf06e4ffda9d2f160c063d0cb93af8', 'FunctionDeclaration']],
  [16938, [12083074, 12083353, '21718aa24ec7c7ee8bcab062c0a0a5244a976b188ca177cbafa3bef667e7438c', 'FunctionDeclaration']],
  [16940, [12083681, 12083803, '2d19e7845b410e7f784d5fac9ede8ed4219825a999b2063194cf9cd96f010697', 'FunctionDeclaration']],
])

const pairSkip = !selected
  ? `not applicable to ${semanticCase}`
  : !baselineBundlePath || !targetBundlePath
    ? 'CLAUDE_CODE_2_1_100_BUNDLE and CLAUDE_CODE_2_1_101_BUNDLE are required'
    : false
const sourceSkip = selected ? false : `not applicable to ${semanticCase}`

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function assertFragments(contents, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${label}: ${fragment}`)
  }
}

test('target101 authenticates the stored-image state boundary and exact rows', { skip: pairSkip }, () => {
  if (pairSkip) return
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be',
  )
  assert.equal(
    sha256(targetBytes),
    'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
  )
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')
  assert.equal(baseline.includes('storedImagePaths'), false)
  assert.equal(target.split('storedImagePaths').length - 1, 12)

  for (const [index, [start, end, hash, nodeType]] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: class`)
    assert.deepEqual(
      [
        region.target.start,
        region.target.end,
        region.target.sourceHash,
        region.target.nodeType,
      ],
      [start, end, hash, nodeType],
      `${index}: identity`,
    )
    assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
  }
})

test('target101 rows expose selection, display, clearing, and immutable publication', { skip: pairSkip }, () => {
  if (pairSkip) return
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  const region = index => {
    const [start, end] = units.get(index)
    return target.slice(start, end)
  }
  assertFragments(region(8740), ['storedImagePaths.get', '.href'], 'clickable image')
  assertFragments(
    region(8761),
    ['imagesSelected', 'onEnterImageSelection', 'onExitImageSelection'],
    'select key handling',
  )
  assertFragments(
    region(8773),
    ['selectedImageIndex', 'onSelectedImageIndexChange', 'pastedContents'],
    'select state and rendering',
  )
  assertFragments(region(11593), ['storedImagePaths.get', '[Image #'], 'user image')
  assertFragments(region(13661), ['storedImagePaths.size===0', 'storedImagePaths:new Map'], 'cache clearing')
  assertFragments(
    region(16938),
    ['storedImagePaths', 'new Map', 'Object.entries'],
    'bulk image publication',
  )
  assertFragments(
    region(16940),
    ['storedImagePaths', 'storedImagePaths:Y'],
    'single image publication',
  )
})

test('source owns the complete AppState-backed image path graph', { skip: sourceSkip }, () => {
  if (sourceSkip) return
  const state = source('state/AppStateStore.ts')
  const main = source('main.tsx')
  const store = source('utils/imageStore.ts')
  const clear = source('commands/clear/caches.ts')

  assertFragments(
    state,
    ['storedImagePaths: Map<number, string>', 'storedImagePaths: new Map()'],
    'AppState',
  )
  assertFragments(main, ['storedImagePaths: new Map<number, string>()'], 'initial state')
  assert.equal(store.includes('const storedImagePaths = new Map<number, string>()'), false)
  assert.equal(store.includes('getStoredImagePath'), false)
  assert.equal(store.includes('clearStoredImagePaths'), false)
  assertFragments(
    store,
    [
      'registerStoredImagePath(setAppState, content.id, imagePath)',
      'let storedImagePaths = previous.storedImagePaths',
      'storedImagePaths = updateStoredImagePaths(storedImagePaths, id, path)',
      'if (paths.get(imageId) === imagePath) return paths',
      'while (next.size >= MAX_STORED_IMAGE_PATHS)',
      'return storedImagePaths === previous.storedImagePaths',
    ],
    'image store',
  )
  assertFragments(
    clear,
    ['previous.storedImagePaths.size === 0', 'storedImagePaths: new Map()'],
    'cache reset',
  )
  assertFragments(
    source('components/ClickableImageRef.tsx'),
    ['useAppState', 'state.storedImagePaths.get(imageId) ?? null'],
    'clickable image selector',
  )
  assertFragments(
    source('components/messages/UserImageMessage.tsx'),
    ['useAppState', 'state.storedImagePaths.get(imageId) ?? null'],
    'message image selector',
  )
  assertFragments(
    source('utils/processUserInput/processUserInput.ts'),
    ['storeImages(pastedContents, context.setAppState)'],
    'input storage',
  )
  for (const relative of [
    'components/PromptInput/PromptInput.tsx',
    'components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx',
    'components/permissions/AskUserQuestionPermissionRequest/AskUserQuestionPermissionRequest.tsx',
  ]) {
    assertFragments(
      source(relative),
      ['cacheImagePath(newContent, setAppState)', 'storeImage(newContent, setAppState)'],
      relative,
    )
  }
  assertFragments(
    source('components/CustomSelect/select.tsx'),
    ['imagesSelected', 'selectedImageIndex', 'onSelectedImageIndexChange'],
    'CustomSelect',
  )

  if (historical) {
    assert.equal(state.includes('imageDescriptions'), false)
    assert.equal(main.includes('imageDescriptions'), false)
    assert.equal(clear.includes('imageDescriptions'), false)
  } else {
    assertFragments(
      state,
      ['imageDescriptions: Map<number, string>', 'imageDescriptions: new Map()'],
      'latest image descriptions',
    )
    assertFragments(main, ['imageDescriptions: new Map<number, string>()'], 'latest initial state')
    assertFragments(
      clear,
      ['previous.imageDescriptions.size === 0', 'imageDescriptions: new Map()'],
      'latest cache reset',
    )
    assertFragments(
      source('components/messages/UserImageMessage.tsx'),
      ['state.imageDescriptions.get(imageId) ?? null', 'dimColor={true}'],
      'latest image description rendering',
    )
  }
})
