import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'
import { isLeanPromptEnabled } from '../../utils/leanPrompt.js'

export const FILE_WRITE_TOOL_NAME = 'Write'
export const DESCRIPTION = 'Write a file to the local filesystem.'

function getPreReadInstruction(): string {
  return `\n- If this is an existing file, you MUST use the ${FILE_READ_TOOL_NAME} tool first to read the file's contents. This tool will fail if you did not read the file first.`
}

export function getWriteToolDescription(model?: string): string {
  if (isLeanPromptEnabled(model)) {
    return `Writes a file to the local filesystem. Overwrites if the file exists.

- If the file already exists, you must ${FILE_READ_TOOL_NAME} it first in this conversation or the call will fail.
- Prefer Edit for modifying existing files — it only sends the diff.`
  }
  return `Writes a file to the local filesystem.

Usage:
- This tool will overwrite the existing file if there is one at the provided path.${getPreReadInstruction()}
- Prefer the Edit tool for modifying existing files \u2014 it only sends the diff. Only use this tool to create new files or for complete rewrites.
- NEVER create documentation files (*.md) or README files unless explicitly requested by the User.
- Only use emojis if the user explicitly requests it. Avoid writing emojis to files unless asked.`
}
