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

type SetAppState = (
  updater: (previous: AppState) => AppState,
) => void

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
  registerStoredImagePath(setAppState, content.id, imagePath)
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
  if (imagePath) {
    registerStoredImagePath(setAppState, content.id, imagePath)
  }
  return imagePath
}

/** Store all images from pastedContents to disk and publish their paths atomically. */
export async function storeImages(
  pastedContents: Record<number, PastedContent>,
  setAppState: SetAppState,
): Promise<Map<number, string>> {
  const pathMap = new Map<number, string>()

  for (const [id, content] of Object.entries(pastedContents)) {
    if (content.type === 'image') {
      const path = await writeImage(content)
      if (path) {
        pathMap.set(Number(id), path)
      }
    }
  }

  if (pathMap.size > 0) {
    setAppState(previous => {
      let storedImagePaths = previous.storedImagePaths
      for (const [id, path] of pathMap) {
        storedImagePaths = updateStoredImagePaths(storedImagePaths, id, path)
      }
      return storedImagePaths === previous.storedImagePaths
        ? previous
        : { ...previous, storedImagePaths }
    })
  }

  return pathMap
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

export function registerStoredImagePath(
  setAppState: SetAppState,
  imageId: number,
  imagePath: string,
): void {
  setAppState(previous => {
    const storedImagePaths = updateStoredImagePaths(
      previous.storedImagePaths,
      imageId,
      imagePath,
    )
    return storedImagePaths === previous.storedImagePaths
      ? previous
      : { ...previous, storedImagePaths }
  })
}

function updateStoredImagePaths(
  paths: Map<number, string>,
  imageId: number,
  imagePath: string,
): Map<number, string> {
  if (paths.get(imageId) === imagePath) return paths

  const next = new Map(paths)
  if (!next.has(imageId)) {
    while (next.size >= MAX_STORED_IMAGE_PATHS) {
      const oldest = next.keys().next().value
      if (oldest === undefined) break
      next.delete(oldest)
    }
  }
  next.set(imageId, imagePath)
  return next
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
