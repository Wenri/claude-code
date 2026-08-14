import { open } from 'fs/promises'
import type { ToolPermissionContext } from '../Tool.js'
import { getPathsForPermissionCheck } from '../utils/fsOperations.js'
import { expandPath } from '../utils/path.js'
import { isPathAllowed } from '../utils/permissions/pathValidation.js'

const DEFAULT_MAX_BYTES = 1_000_000
const ABSOLUTE_MAX_BYTES = 10_000_000

export type RemoteFileContents = {
  contents: string
  absPath: string
  truncated?: boolean
  encoding?: 'base64'
}

/** Read a bounded prefix for SDK/Remote Control file viewers. */
export async function readFileForRemote(
  path: string,
  maxBytes: number | undefined,
  permissionContext: ToolPermissionContext,
  encoding: 'utf-8' | 'base64' = 'utf-8',
): Promise<RemoteFileContents> {
  const absPath = expandPath(path)
  for (const candidate of getPathsForPermissionCheck(absPath)) {
    if (!isPathAllowed(candidate, permissionContext, 'read').allowed) {
      throw new Error(`read denied: ${path}`)
    }
  }

  const limit = Math.min(
    maxBytes && maxBytes > 0 ? maxBytes : DEFAULT_MAX_BYTES,
    ABSOLUTE_MAX_BYTES,
  )
  const handle = await open(absPath, 'r')
  try {
    // Read one sentinel byte beyond the requested cap. This avoids a stat/read
    // race when a file grows after its size was checked.
    const buffer = Buffer.alloc(limit + 1)
    const { bytesRead } = await handle.read(buffer, 0, limit + 1, 0)
    const truncated = bytesRead > limit
    return {
      contents: buffer
        .subarray(0, Math.min(bytesRead, limit))
        .toString(encoding === 'base64' ? 'base64' : 'utf-8'),
      absPath,
      ...(truncated && { truncated }),
      ...(encoding === 'base64' && { encoding }),
    }
  } finally {
    await handle.close()
  }
}
