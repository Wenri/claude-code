import {
  expandPastedTextRefs,
  formatPastedTextRef,
  getPastedTextRefNumLines,
} from '../history.js'
import { spawnSync } from 'child_process'
import instances from '../ink/instances.js'
import type { PastedContent } from './config.js'
import { classifyGuiEditor, getExternalEditor } from './editor.js'
import { getFsImplementation } from './fsOperations.js'
import { toIDEDisplayName } from './ide.js'
import { writeFileSync_DEPRECATED } from './slowOperations.js'
import { generateTempFilePath } from './tempfile.js'

// Map of editor command overrides (e.g., to add wait flags)
const EDITOR_OVERRIDES: Record<string, string> = {
  code: 'code -w', // VS Code: wait for file to be closed
  subl: 'subl --wait', // Sublime Text: wait for file to be closed
}

const EXTERNAL_EDITOR_REPLY_MARKER =
  '# ─── Write your reply below this line ──────────────────────────'
const EXTERNAL_EDITOR_CONTEXT_MAX_LINES = 50

function isGuiEditor(editor: string): boolean {
  return classifyGuiEditor(editor) !== undefined
}

export type EditorResult = {
  content: string | null
  error?: string
}

// sync IO: called from sync context (React components, sync command handlers)
export function editFileInEditor(filePath: string): EditorResult {
  const fs = getFsImplementation()
  const inkInstance = instances.get(process.stdout)
  if (!inkInstance) {
    throw new Error('Ink instance not found - cannot pause rendering')
  }

  const editor = getExternalEditor()
  if (!editor) {
    return { content: null }
  }

  try {
    fs.statSync(filePath)
  } catch {
    return { content: null }
  }

  const useAlternateScreen = !isGuiEditor(editor)

  if (useAlternateScreen) {
    // Terminal editors (vi, nano, etc.) take over the terminal. Delegate to
    // Ink's alt-screen-aware handoff so fullscreen mode (where <AlternateScreen>
    // already entered alt screen) doesn't get knocked back to the main buffer
    // by a hardcoded ?1049l. enterAlternateScreen() internally calls pause()
    // and suspendStdin(); exitAlternateScreen() undoes both and resets frame
    // state so the next render writes from scratch.
    inkInstance.enterAlternateScreen()
  } else {
    // GUI editors (code, subl, etc.) open in a separate window — just pause
    // Ink and release stdin while they're open.
    inkInstance.pause()
    inkInstance.suspendStdin()
  }

  try {
    // Use override command if available, otherwise use the editor as-is
    const editorCommand = EDITOR_OVERRIDES[editor] ?? editor
    const commandParts = editorCommand.split(' ')
    const executable = commandParts[0] ?? editorCommand
    const commandArgs = commandParts.slice(1)
    const result =
      process.platform === 'win32'
        ? spawnSync(`${editorCommand} "${filePath}"`, {
            stdio: 'inherit',
            shell: true,
          })
        : spawnSync(executable, [...commandArgs, filePath], {
            stdio: 'inherit',
          })

    if (result.error || result.signal || (result.status ?? 0) !== 0) {
      const editorName = toIDEDisplayName(editor)
      const detail = result.error
        ? result.error.message
        : result.signal
          ? `terminated by signal ${result.signal}`
          : `exited with code ${result.status}`
      return { content: null, error: `${editorName} ${detail}` }
    }

    // Read the edited content
    const editedContent = fs.readFileSync(filePath, { encoding: 'utf-8' })
    return { content: editedContent }
  } catch (err) {
    if (
      typeof err === 'object' &&
      err !== null &&
      'status' in err &&
      typeof (err as { status: unknown }).status === 'number'
    ) {
      const status = (err as { status: number }).status
      if (status !== 0) {
        const editorName = toIDEDisplayName(editor)
        return {
          content: null,
          error: `${editorName} exited with code ${status}`,
        }
      }
    }
    return { content: null }
  } finally {
    if (useAlternateScreen) {
      inkInstance.exitAlternateScreen()
    } else {
      inkInstance.resumeStdin()
      inkInstance.resume()
    }
  }
}

/**
 * Re-collapse expanded pasted text by finding content that matches
 * pastedContents and replacing it with references.
 */
function recollapsePastedContent(
  editedPrompt: string,
  originalPrompt: string,
  pastedContents: Record<number, PastedContent>,
): string {
  let collapsed = editedPrompt

  // Find pasted content in the edited text and re-collapse it
  for (const [id, content] of Object.entries(pastedContents)) {
    if (content.type === 'text') {
      const pasteId = parseInt(id)
      const contentStr = content.content

      // Check if this exact content exists in the edited prompt
      const contentIndex = collapsed.indexOf(contentStr)
      if (contentIndex !== -1) {
        // Replace with reference
        const numLines = getPastedTextRefNumLines(contentStr)
        const ref = formatPastedTextRef(pasteId, numLines)
        collapsed =
          collapsed.slice(0, contentIndex) +
          ref +
          collapsed.slice(contentIndex + contentStr.length)
      }
    }
  }

  return collapsed
}

export function formatAssistantContextForEditor(context: string): string {
  let lines = context.split('\n')
  if (lines.length > EXTERNAL_EDITOR_CONTEXT_MAX_LINES) {
    lines = lines.slice(-EXTERNAL_EDITOR_CONTEXT_MAX_LINES)
    lines.unshift('… (earlier output truncated)')
  }
  return (
    "# ─── Claude's last response (for reference; removed on save) ───\n" +
    `${lines.map(line => (line ? `# ${line}` : '#')).join('\n')}\n` +
    `${EXTERNAL_EDITOR_REPLY_MARKER}\n\n`
  )
}

export function stripAssistantContextFromEditor(content: string): string {
  const markerIndex = content.indexOf(EXTERNAL_EDITOR_REPLY_MARKER)
  if (markerIndex === -1) return content
  return content
    .slice(markerIndex + EXTERNAL_EDITOR_REPLY_MARKER.length)
    .replace(/^\r?\n\r?\n?/, '')
}

// sync IO: called from sync context (React components, sync command handlers)
export function editPromptInEditor(
  currentPrompt: string,
  pastedContents?: Record<number, PastedContent>,
  assistantContext?: string,
): EditorResult {
  const fs = getFsImplementation()
  const tempFile = generateTempFilePath()

  try {
    // Expand any pasted text references before editing
    const expandedPrompt = pastedContents
      ? expandPastedTextRefs(currentPrompt, pastedContents)
      : currentPrompt
    const editorPrompt = assistantContext
      ? formatAssistantContextForEditor(assistantContext) + expandedPrompt
      : expandedPrompt

    // Write expanded prompt to temp file
    writeFileSync_DEPRECATED(tempFile, editorPrompt, {
      encoding: 'utf-8',
      flush: true,
    })

    // Delegate to editFileInEditor
    const result = editFileInEditor(tempFile)

    if (result.content === null) {
      return result
    }

    // Trim a single trailing newline if present (common editor behavior)
    let finalContent = assistantContext
      ? stripAssistantContextFromEditor(result.content)
      : result.content
    if (finalContent.endsWith('\n') && !finalContent.endsWith('\n\n')) {
      finalContent = finalContent.slice(0, -1)
    }

    // Re-collapse pasted content if it wasn't edited
    if (pastedContents) {
      finalContent = recollapsePastedContent(
        finalContent,
        currentPrompt,
        pastedContents,
      )
    }

    return { content: finalContent }
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(tempFile)
    } catch {
      // Ignore cleanup errors
    }
  }
}
