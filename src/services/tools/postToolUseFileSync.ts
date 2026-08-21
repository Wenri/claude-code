import type { ToolUseContext } from '../../Tool.js'
import { FILE_EDIT_TOOL_NAME } from '../../tools/FileEditTool/constants.js'
import { FILE_WRITE_TOOL_NAME } from '../../tools/FileWriteTool/prompt.js'
import type { AttachmentMessage } from '../../types/message.js'
import { createAttachmentMessage } from '../../utils/attachments.js'
import { logForDebugging } from '../../utils/debug.js'
import { getFileModificationTime } from '../../utils/file.js'
import { readFileSyncWithMetadata } from '../../utils/fileRead.js'
import { fileStateMatchesContent } from '../../utils/fileStateCache.js'
import { expandPath } from '../../utils/path.js'

/**
 * PostToolUse hooks commonly run formatters after Edit or Write. Refresh the
 * file-state cache so the next edit does not fail solely because that formatter
 * advanced the file's mtime. If the formatter also changed contents, tell the
 * model that its next old_string may need a fresh Read.
 */
export function resyncReadFileStateAfterPostToolUse(
  toolName: string,
  toolUseID: string,
  input: unknown,
  readFileState: ToolUseContext['readFileState'],
): AttachmentMessage | null {
  if (
    toolName !== FILE_EDIT_TOOL_NAME &&
    toolName !== FILE_WRITE_TOOL_NAME
  ) {
    return null
  }
  if (
    typeof input !== 'object' ||
    input === null ||
    !('file_path' in input) ||
    typeof input.file_path !== 'string'
  ) {
    return null
  }

  try {
    const filePath = expandPath(input.file_path)
    const priorState = readFileState.get(filePath)
    if (
      !priorState ||
      priorState.offset !== undefined ||
      priorState.limit !== undefined
    ) {
      return null
    }

    const timestamp = getFileModificationTime(filePath)
    if (timestamp <= priorState.timestamp) return null

    const current = readFileSyncWithMetadata(filePath)
    readFileState.set(filePath, {
      content: current.content,
      timestamp,
      offset: undefined,
      limit: undefined,
    })
    if (fileStateMatchesContent(priorState, current.content)) return null

    logForDebugging(
      `PostToolUse hook modified ${filePath} after ${toolName} — re-synced readFileState`,
      { level: 'info' },
    )
    return createAttachmentMessage({
      type: 'hook_additional_context',
      content: [
        `PostToolUse hook modified ${filePath} after your edit (likely a formatter). Your next Edit will not fail with a stale-file error, but if its old_string targets a region the hook reformatted, Read the file first.`,
      ],
      hookName: `PostToolUse:${toolName}`,
      toolUseID,
      hookEvent: 'PostToolUse',
    })
  } catch {
    return null
  }
}
