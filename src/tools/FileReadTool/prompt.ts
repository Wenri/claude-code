import { isPDFSupported } from '../../utils/pdfUtils.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import { isLeanPromptEnabled } from '../../utils/leanPrompt.js'

// Use a string constant for tool names to avoid circular dependencies
export const FILE_READ_TOOL_NAME = 'Read'

export const NO_REREAD_INSTRUCTION = `
- Do NOT re-read a file you just edited to verify — Edit/Write would have errored if the change failed, and the harness tracks file state for you.`

export const EDIT_SUCCESS_SUFFIX =
  ' (file state is current in your context — no need to Read it back)'

export const FILE_UNCHANGED_STUB =
  'File unchanged since last read. The content from the earlier Read tool_result in this conversation is still current — refer to that instead of re-reading.'

export const FILE_UNCHANGED_WASTED_CALL_STUB =
  'Wasted call — file unchanged since your last Read. Refer to that earlier tool_result instead.'

export const FILE_STATE_CURRENT_HINT =
  ' (file state is current in your context — no need to Read it back)'

export function isNoRereadEnabled(): boolean {
  return getFeatureValue_CACHED_MAY_BE_STALE(
    'tengu_noreread_q7m_velvet',
    false,
  )
}

export function getFileUnchangedStub(): string {
  return isNoRereadEnabled()
    ? FILE_UNCHANGED_WASTED_CALL_STUB
    : FILE_UNCHANGED_STUB
}

export function isFileUnchangedStub(content: string): boolean {
  return (
    content.startsWith(FILE_UNCHANGED_STUB) ||
    content.startsWith(FILE_UNCHANGED_WASTED_CALL_STUB)
  )
}

export const MAX_LINES_TO_READ = 2000

export const DESCRIPTION = 'Read a file from the local filesystem.'

export const LINE_FORMAT_INSTRUCTION =
  '- Results are returned using cat -n format, with line numbers starting at 1'

export const OFFSET_INSTRUCTION_DEFAULT =
  "- You can optionally specify a line offset and limit (especially handy for long files), but it's recommended to read the whole file by not providing these parameters"

export const OFFSET_INSTRUCTION_TARGETED =
  '- When you already know which part of the file you need, only read that part. This can be important for larger files.'

/**
 * Renders the Read tool prompt template.  The caller (FileReadTool) supplies
 * the runtime-computed parts.
 */
export function renderPromptTemplate(
  model: string | undefined,
  lineFormat: string,
  maxSizeInstruction: string,
  offsetInstruction: string,
): string {
  if (isLeanPromptEnabled(model)) {
    return `Reads a file from the local filesystem.

- \`file_path\` must be an absolute path.
- Reads up to ${MAX_LINES_TO_READ} lines by default${maxSizeInstruction}.
${offsetInstruction}
${lineFormat}
- Reads images (PNG, JPG, …) and presents them visually.${isPDFSupported() ? ' Reads PDFs via the `pages` parameter (e.g. "1-5", max 20 pages/request; required for PDFs over 10 pages).' : ''} Reads Jupyter notebooks (.ipynb) as cells with outputs.
- Reading a directory, a missing file, or an empty file returns an error or system reminder rather than content.${isNoRereadEnabled() ? '\n- Do NOT re-read a file you just edited to verify — Edit/Write would have errored if the change failed, and the harness tracks file state for you.' : ''}`
  }
  return `Reads a file from the local filesystem. You can access any file directly by using this tool.
Assume this tool is able to read all files on the machine. If the User provides a path to a file assume that path is valid. It is okay to read a file that does not exist; an error will be returned.

Usage:
- The file_path parameter must be an absolute path, not a relative path
- By default, it reads up to ${MAX_LINES_TO_READ} lines starting from the beginning of the file${maxSizeInstruction}
${offsetInstruction}
${lineFormat}
- This tool allows Claude Code to read images (eg PNG, JPG, etc). When reading an image file the contents are presented visually as Claude Code is a multimodal LLM.${
    isPDFSupported()
      ? '\n- This tool can read PDF files (.pdf). For large PDFs (more than 10 pages), you MUST provide the pages parameter to read specific page ranges (e.g., pages: "1-5"). Reading a large PDF without the pages parameter will fail. Maximum 20 pages per request.'
      : ''
  }
- This tool can read Jupyter notebooks (.ipynb files) and returns all cells with their outputs, combining code, text, and visualizations.
- This tool can only read files, not directories. To list files in a directory, use the registered shell tool.
- You will regularly be asked to read screenshots. If the user provides a path to a screenshot, ALWAYS use this tool to view the file at the path. This tool will work with all temporary file paths.
- If you read a file that exists but has empty contents you will receive a system reminder warning in place of file contents.${
    isNoRereadEnabled()
      ? '\n- Do NOT re-read a file you just edited to verify — Edit/Write would have errored if the change failed, and the harness tracks file state for you.'
      : ''
  }`
}
