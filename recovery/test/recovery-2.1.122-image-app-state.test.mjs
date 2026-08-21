import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const releases = [
  ['2.1.121', process.env.CLAUDE_CODE_2_1_121_BUNDLE],
  ['2.1.122', process.env.CLAUDE_CODE_2_1_122_BUNDLE],
]

function occurrences(text, needle) {
  return text.split(needle).length - 1
}

function source(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
    .replace(/\s+/g, ' ')
}

test('authenticates retained image AppState shape and update flow', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')
    assert.equal(occurrences(bundle, 'storedImagePaths'), 12, version)
    assert.equal(occurrences(bundle, 'imageDescriptions'), 5, version)
    assert.equal(
      occurrences(bundle, 'storedImagePaths:new Map,imageDescriptions:new Map'),
      3,
      `${version}: defaults, startup, and clear`,
    )
    assert.match(
      bundle,
      /storedImagePaths\.size===0&&[A-Za-z_$][\w$]*\.imageDescriptions\.size===0[^}]+storedImagePaths:new Map,imageDescriptions:new Map/,
      `${version}: no-op-aware session clearing`,
    )
    assert.match(
      bundle,
      /storedImagePaths\.get\([^)]*\)\?\?null:null\)\?\?null,[A-Za-z_$][\w$]*=[^(]+\([^=]+=>[^.]+\.imageDescriptions\.get\([^)]*\)\?\?null:null\)\?\?null/,
      `${version}: user image renderer selects both maps`,
    )
    assert.match(
      bundle,
      /storedImagePaths;for\(let\[[^\]]+\]of [^)]+\)[A-Za-z_$][\w$]*=[A-Za-z_$][\w$]*\([^,]+,[^,]+,[^)]+\);return [^=]+===[^.]+\.storedImagePaths\?[^:]+:\{\.\.\.[^,]+,storedImagePaths:[^}]+\}/,
      `${version}: batch storage commits one immutable state update`,
    )
  }
})

test('source reconstructs retained image AppState semantics', () => {
  const state = source('src/state/AppStateStore.ts')
  const main = source('src/main.tsx')
  const imageStore = source('src/utils/imageStore.ts')
  const caches = source('src/commands/clear/caches.ts')
  const conversation = source('src/commands/clear/conversation.ts')
  const processInput = source('src/utils/processUserInput/processUserInput.ts')
  const userImage = source('src/components/messages/UserImageMessage.tsx')
  const clickable = source('src/components/ClickableImageRef.tsx')

  for (const text of [state, main]) {
    assert.ok(text.includes('storedImagePaths: new Map()'))
    assert.ok(text.includes('imageDescriptions: new Map()'))
  }
  for (const witness of [
    'updateStoredImagePath(setAppState, content.id, imagePath)',
    'const imagePath = await writeImage(content)',
    'let storedImagePaths = prev.storedImagePaths',
    'storedImagePaths = withStoredImagePath(storedImagePaths, id, imagePath)',
    'if (current.get(imageId) === imagePath) return current',
    'const storedImagePaths = new Map(current)',
    'while (storedImagePaths.size >= MAX_STORED_IMAGE_PATHS)',
  ]) {
    assert.ok(imageStore.includes(witness), `missing image-store witness: ${witness}`)
  }
  assert.ok(
    caches.includes(
      'prev.storedImagePaths.size === 0 && prev.imageDescriptions.size === 0',
    ),
  )
  assert.ok(conversation.includes('clearSessionCaches(preservedAgentIds, setAppState)'))
  assert.ok(processInput.includes('await storeImages(pastedContents, context.setAppState)'))
  assert.ok(userImage.includes('state.storedImagePaths.get(imageId)'))
  assert.ok(userImage.includes('state.imageDescriptions.get(imageId)'))
  assert.ok(clickable.includes('state.storedImagePaths.get(imageId)'))
})
