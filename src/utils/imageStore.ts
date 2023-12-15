import { mkdir, open } from 'fs/promises'
import { join } from 'path'
import { getSessionId } from '../bootstrap/state.js'
import type { AppState } from '../state/AppStateStore.js'
import type { PastedContent } from './config.js'
import { logForDebugging } from './debug.js'
import { getClaudeConfigHomeDir } from './envUtils.js'
import { getFsImplementation } from './fsOperations.js'

const IMAGE_STORE_DIR = 'image-cache'
const MAX_STORED_IMAGE_PATHS = 200

type SetAppState = (updater: (prev: AppState) => AppState) => void

/**
 * Get the image store directory for the current session.
 */
function getImageStoreDir(): string {
  return join(getClaudeConfigHomeDir(), IMAGE_STORE_DIR, getSessionId())
}

/**
 * Ensure the image store directory exists.
 */
async function ensureImageStoreDir(): Promise<void> {
  const dir = getImageStoreDir()
  await mkdir(dir, { recursive: true })
}

/**
 * Get the file path for an image by ID.
 */
function getImagePath(imageId: number, mediaType: string): string {
  const extension = mediaType.split('/')[1] || 'png'
  return join(getImageStoreDir(), `${imageId}.${extension}`)
}

/**
 * Cache the image path immediately (fast, no file I/O).
 */
export function cacheImagePath(
  content: PastedContent,
  setAppState: SetAppState,
): string | null {
  if (content.type !== 'image') {
    return null
  }
  const imagePath = getImagePath(content.id, content.mediaType || 'image/png')
  updateStoredImagePath(setAppState, content.id, imagePath)
  return imagePath
}

/**
 * Store an image from pastedContents to disk.
 */
export async function storeImage(
  content: PastedContent,
  setAppState: SetAppState,
): Promise<string | null> {
  const imagePath = await writeImage(content)
  if (imagePath) updateStoredImagePath(setAppState, content.id, imagePath)
  return imagePath
}

async function writeImage(content: PastedContent): Promise<string | null> {
  if (content.type !== 'image') {
    return null
  }

  try {
    await ensureImageStoreDir()
    const imagePath = getImagePath(content.id, content.mediaType || 'image/png')
    const fh = await open(imagePath, 'w', 0o600)
    try {
      await fh.writeFile(content.content, { encoding: 'base64' })
      await fh.datasync()
    } finally {
      await fh.close()
    }
    logForDebugging(`Stored image ${content.id} to ${imagePath}`)
    return imagePath
  } catch (error) {
    logForDebugging(`Failed to store image: ${error}`)
    return null
  }
}

/**
 * Store all images from pastedContents to disk.
 */
export async function storeImages(
  pastedContents: Record<number, PastedContent>,
  setAppState: SetAppState,
): Promise<Map<number, string>> {
  const pathMap = new Map<number, string>()

  for (const [id, content] of Object.entries(pastedContents)) {
    if (content.type === 'image') {
      const imagePath = await writeImage(content)
      if (imagePath) {
        pathMap.set(Number(id), imagePath)
      }
    }
  }

  if (pathMap.size > 0) {
    setAppState(prev => {
      let storedImagePaths = prev.storedImagePaths
      for (const [id, imagePath] of pathMap) {
        storedImagePaths = withStoredImagePath(storedImagePaths, id, imagePath)
      }
      return storedImagePaths === prev.storedImagePaths
        ? prev
        : { ...prev, storedImagePaths }
    })
  }

  return pathMap
}

function updateStoredImagePath(
  setAppState: SetAppState,
  imageId: number,
  imagePath: string,
): void {
  setAppState(prev => {
    const storedImagePaths = withStoredImagePath(
      prev.storedImagePaths,
      imageId,
      imagePath,
    )
    return storedImagePaths === prev.storedImagePaths
      ? prev
      : { ...prev, storedImagePaths }
  })
}

function withStoredImagePath(
  current: Map<number, string>,
  imageId: number,
  imagePath: string,
): Map<number, string> {
  if (current.get(imageId) === imagePath) return current
  const storedImagePaths = new Map(current)
  if (!storedImagePaths.has(imageId)) {
    while (storedImagePaths.size >= MAX_STORED_IMAGE_PATHS) {
      const oldest = storedImagePaths.keys().next().value
      if (oldest === undefined) break
      storedImagePaths.delete(oldest)
    }
  }
  storedImagePaths.set(imageId, imagePath)
  return storedImagePaths
}

/**
 * Clean up old image cache directories from previous sessions.
 */
export async function cleanupOldImageCaches(): Promise<void> {
  const fsImpl = getFsImplementation()
  const baseDir = join(getClaudeConfigHomeDir(), IMAGE_STORE_DIR)
  const currentSessionId = getSessionId()

  try {
    let sessionDirs
    try {
      sessionDirs = await fsImpl.readdir(baseDir)
    } catch {
      return
    }

    for (const sessionDir of sessionDirs) {
      if (sessionDir.name === currentSessionId) {
        continue
      }

      const sessionPath = join(baseDir, sessionDir.name)
      try {
        await fsImpl.rm(sessionPath, { recursive: true, force: true })
        logForDebugging(`Cleaned up old image cache: ${sessionPath}`)
      } catch {
        // Ignore errors for individual directories
      }
    }

    try {
      const remaining = await fsImpl.readdir(baseDir)
      if (remaining.length === 0) {
        await fsImpl.rmdir(baseDir)
      }
    } catch {
      // Ignore
    }
  } catch {
    // Ignore errors reading base directory
  }
}
