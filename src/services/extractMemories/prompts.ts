/**
 * Prompt template for the background memory extraction agent.
 *
 * The extraction agent runs as a perfect fork of the main conversation — same
 * system prompt, same message prefix. The main agent's system prompt already
 * contains the memory taxonomy, save criteria, and frontmatter format, so this
 * prompt only supplies the extraction task and its constrained tool surface.
 */

import { BASH_TOOL_NAME } from '../../tools/BashTool/toolName.js'
import { FILE_EDIT_TOOL_NAME } from '../../tools/FileEditTool/constants.js'
import { FILE_READ_TOOL_NAME } from '../../tools/FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '../../tools/FileWriteTool/prompt.js'
import { GLOB_TOOL_NAME } from '../../tools/GlobTool/prompt.js'
import { GREP_TOOL_NAME } from '../../tools/GrepTool/prompt.js'
import { POWERSHELL_TOOL_NAME } from '../../tools/PowerShellTool/toolName.js'
import { isTinyMemoryEnabled } from '../../memdir/paths.js'
import { isBashToolEnabled } from '../../utils/shell/shellToolUtils.js'

export function buildExtractPrompt(
  newMessageCount: number,
  existingMemories: string,
  teamMemoryEnabled: boolean,
): string {
  const useBash = isBashToolEnabled()
  const shellToolName = useBash ? BASH_TOOL_NAME : POWERSHELL_TOOL_NAME
  const readOnlyExamples = useBash
    ? 'ls/find/cat/stat/wc/head/tail and similar'
    : 'Get-ChildItem/Get-Content/Select-Object -First/-Last and similar'
  const deleteCommand = useBash ? 'rm' : 'Remove-Item'
  const tinyMemoryEnabled = isTinyMemoryEnabled()
  const duplicateGuidance = tinyMemoryEnabled
    ? `Check this list before writing — if the fact is already covered, skip it; if a memory has gone stale, ${deleteCommand} it and write a fresh single-fact memory in its place. Never edit memories in-place.`
    : 'Check this list before writing — update an existing file rather than creating a duplicate.'
  const manifest =
    existingMemories.length > 0
      ? `\n\n## Existing memory files\n\n${existingMemories}\n\n${duplicateGuidance}`
      : ''
  const scopeGuidance = teamMemoryEnabled ? 'scope guidance, ' : ''
  const availableTools = tinyMemoryEnabled
    ? `Available tools: ${FILE_READ_TOOL_NAME}, ${GREP_TOOL_NAME}, ${GLOB_TOOL_NAME}, read-only ${shellToolName} (${readOnlyExamples}), ${FILE_WRITE_TOOL_NAME} for paths inside the memory directory only, and ${shellToolName} ${deleteCommand} with paths inside the memory directory only. ${FILE_EDIT_TOOL_NAME} is not permitted — memories are immutable, so delete-and-recreate replaces in-place edits. All other tools — MCP, Agent, write-capable ${shellToolName}, etc — will be denied.`
    : `Available tools: ${FILE_READ_TOOL_NAME}, ${GREP_TOOL_NAME}, ${GLOB_TOOL_NAME}, read-only ${shellToolName} (${readOnlyExamples}), and ${FILE_EDIT_TOOL_NAME}/${FILE_WRITE_TOOL_NAME} for paths inside the memory directory only, and ${shellToolName} ${deleteCommand} with paths inside the memory directory only. All other tools — MCP, Agent, write-capable ${shellToolName}, etc — will be denied.`
  const turnBudget = tinyMemoryEnabled
    ? `You have a limited turn budget. Issue all ${FILE_WRITE_TOOL_NAME} and ${deleteCommand} calls in parallel in a single turn — there is no read-then-edit dance, since memories are immutable.`
    : `You have a limited turn budget. ${FILE_EDIT_TOOL_NAME} requires a prior ${FILE_READ_TOOL_NAME} of the same file, so the efficient strategy is: turn 1 — issue all ${FILE_READ_TOOL_NAME} calls in parallel for every file you might update; turn 2 — issue all ${FILE_WRITE_TOOL_NAME}/${FILE_EDIT_TOOL_NAME} calls in parallel. Do not interleave reads and writes across multiple turns.`

  return [
    `You are now acting as the memory extraction subagent. Analyze the most recent ~${newMessageCount} messages above and use them to update your persistent memory systems.`,
    '',
    availableTools,
    '',
    turnBudget,
    '',
    `You MUST only use content from the last ~${newMessageCount} messages to update your persistent memories. Do not waste any turns attempting to investigate or verify that content further — no grepping source files, no reading code to confirm a pattern exists, no git commands.` +
      manifest,
    '',
    "If nothing is worth saving, output only 'Nothing to save.' Do not explain why.",
    '',
    'If the user explicitly asks you to remember something, save it immediately as whichever type fits best. If they ask you to forget something, find and remove the relevant entry.',
    '',
    `Apply the memory types, ${scopeGuidance}what-not-to-save criteria, and frontmatter format from the Memory section of your system prompt — it is already in your context above.`,
  ].join('\n')
}
