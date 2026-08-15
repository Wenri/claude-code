import { open, readFile, stat } from 'fs/promises'
import type { ToolPermissionContext } from '../Tool.js'
import { getPathsForPermissionCheck } from '../utils/fsOperations.js'
import { expandPath } from '../utils/path.js'
import { isPathAllowed } from '../utils/permissions/pathValidation.js'
import type { PermissionUpdate } from '../utils/permissions/PermissionUpdateSchema.js'

const DEFAULT_REMOTE_READ_BYTES = 1_000_000
const MAX_REMOTE_READ_BYTES = 10_000_000

export type RemoteFileReadResult = {
  contents: string
  absPath: string
  truncated?: boolean
}

export async function readFileForRemote(
  path: string,
  maxBytes: number | undefined,
  permissionContext: ToolPermissionContext,
): Promise<RemoteFileReadResult> {
  const absPath = expandPath(path)
  for (const resolvedPath of getPathsForPermissionCheck(absPath)) {
    if (!isPathAllowed(resolvedPath, permissionContext, 'read').allowed) {
      throw new Error(`read denied: ${path}`)
    }
  }

  const byteLimit = Math.min(
    maxBytes && maxBytes > 0 ? maxBytes : DEFAULT_REMOTE_READ_BYTES,
    MAX_REMOTE_READ_BYTES,
  )
  const { size } = await stat(absPath)
  if (size <= byteLimit) {
    return { contents: await readFile(absPath, 'utf-8'), absPath }
  }

  const handle = await open(absPath, 'r')
  try {
    const buffer = Buffer.alloc(byteLimit)
    const { bytesRead } = await handle.read(buffer, 0, byteLimit, 0)
    return {
      contents: buffer.subarray(0, bytesRead).toString('utf-8'),
      absPath,
      truncated: true,
    }
  } finally {
    await handle.close()
  }
}

type BridgePermissionResponse = {
  behavior: 'allow' | 'deny'
  updatedInput?: Record<string, unknown>
  updatedPermissions?: PermissionUpdate[]
  message?: string
}

type BridgePermissionCallbacks = {
  sendRequest(
    requestId: string,
    toolName: string,
    input: Record<string, unknown>,
    toolUseId: string,
    description: string,
    permissionSuggestions?: PermissionUpdate[],
    blockedPath?: string,
  ): void
  sendResponse(requestId: string, response: BridgePermissionResponse): void
  /** Cancel a pending control_request so the web app can dismiss its prompt. */
  cancelRequest(requestId: string): void
  onResponse(
    requestId: string,
    handler: (response: BridgePermissionResponse) => void,
  ): () => void // returns unsubscribe
}

/** Type predicate for validating a parsed control_response payload
 *  as a BridgePermissionResponse. Checks the required `behavior`
 *  discriminant rather than using an unsafe `as` cast. */
function isBridgePermissionResponse(
  value: unknown,
): value is BridgePermissionResponse {
  if (!value || typeof value !== 'object') return false
  return (
    'behavior' in value &&
    (value.behavior === 'allow' || value.behavior === 'deny')
  )
}

export { isBridgePermissionResponse }
export type { BridgePermissionCallbacks, BridgePermissionResponse }
