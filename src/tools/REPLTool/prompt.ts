import { memoize } from 'lodash-es'
import { which } from '../../utils/which.js'
import { isBashToolEnabled } from '../../utils/shell/shellToolUtils.js'
import { BASH_TOOL_NAME } from '../BashTool/toolName.js'
import { FILE_EDIT_TOOL_NAME } from '../FileEditTool/constants.js'
import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '../FileWriteTool/prompt.js'
import { GLOB_TOOL_NAME } from '../GlobTool/prompt.js'
import { POWERSHELL_TOOL_NAME } from '../PowerShellTool/toolName.js'
import { isReplModeEnabled } from './constants.js'

const hasGitHubCLI = memoize(async () => (await which('gh')) !== null)

export async function getREPLToolPrompt(): Promise<string> {
  const denseMode = isReplModeEnabled()
  const isBash = isBashToolEnabled()
  const shellToolName = isBash ? BASH_TOOL_NAME : POWERSHELL_TOOL_NAME
  const hasGh = await hasGitHubCLI()
  const powershellQuoting =
    '`shQuote(s)` is POSIX-only — for PowerShell, double the single quotes: `"\'"+s.replaceAll("\'", "\'\'")+"\'"`. For multi-line input use a here-string `@\'\\n...\\n\'@` (closing `\'@` at column 0).'
  const multilineCommand = hasGh
    ? `gh pr edit N --body-file - <<'EOF'\\n"+body+"\\nEOF`
    : `git commit -F - <<'EOF'\\n"+msg+"\\nEOF`

  if (denseMode) {
    return `
REPL is your **only way** to investigate — shell, file reads, and code search all happen here via the shorthands below. Edit, Write, and Agent are still available as top-level tools for direct use.

**Aim for 1-3 REPL calls per turn** — over-fetch and batch.

## Dense scripts — every char is an output token

\`\`\`javascript
o.git=sh('git status')
for(const f of (await rgf('X','src')).slice(0,5)) o[f]=cat(f,1,300)
o
\`\`\`

\`o\` is pre-declared \`{}\`; assign results directly to \`o.key\` (no \`const x=\` then repack). Thenable \`o.*\` values are auto-awaited **at return only** — \`o.x=sh(c)\` needs no await, but a shorthand result used inline (concat, template, arg to another call) does: \`const c=await cat(f); put(f,c+s)\`, never \`put(f,cat(f)+s)\`. **End the script with bare \`o\`** (or a statement) to return the full object; ending on \`o.x=...\` returns just that one value. Relative paths resolve against cwd. No \`//\` comments — the \`description\` param is your comment. No blank lines, single-char vars.

## API
- \`sh(cmd,ms?)\` → stdout+stderr (merged — never write \`2>&1\` or \`2>/dev/null\`)
- \`cat(path,off?,lim?)\` → file content
- \`rg(pat,path?,{A,B,C,glob,head,type,i}?)\` → match text
- \`rgf(pat,path?,glob?)\` → matching file paths[]
- \`gl(pat,path?)\` → glob file paths[]
- \`put(path,content)\` → write file
${hasGh ? `- \\\`gh(args)\\\` → \\\`sh('gh '+args)\\\` with \\\`-R \\\${REPO}\\\` injected
` : ''}- \`chdir(path)\` — set cwd for this REPL call
- \`haiku(prompt,schema?)\` — one-turn model sampling
- \`registerTool(name,desc,schema,handler)\` / \`unregisterTool\` / \`listTools\` / \`getTool\`
- \`log\` (console.log) · \`str\` (JSON.stringify) · \`shQuote(s)\`${hasGh ? " · \\`REPO\\` ('owner/name')" : ''}
- \`await ${FILE_READ_TOOL_NAME}({…})\` / \`await ${FILE_EDIT_TOOL_NAME}({…})\` / \`await mcp__server__tool({…})\` (MCP tools by full name)

Shorthands never throw — \`sh\`/\`cat\`/\`rg\` return the error text on failure, \`rgf\`/\`gl\` return \`[]\`, never \`undefined\`. Permission-denied is a hard no — don't retry the same call; pivot or stop.

## Rules
- One investigation = one call. Put the next step in the code; grep→read→grep in one script. A failing inner call degrades the result, not the whole script.
- No \`import\`/\`require\`/\`process\`/Node globals — the VM context is sealed. ≥3 ops per call. Over-fetch (3-5 files, 3-4 patterns).
- Variables persist across calls. Last expression (or \`o\`) = return value. No top-level \`return\` — end with \`o\` and branch with \`if/else\` above it.
- Never re-invoke a stateful op (\`sh\`/\`Edit\`/\`put\`) to grab another field — \`git reset\`, \`rm\`, migrations run twice.
- ${isBash ? `Don't \`put()\` to a temp file just to feed a shell command — pipe via heredoc instead: \`sh("${multilineCommand}")\`. Generic temp paths get clobbered by parallel agents.` : powershellQuoting}
`
  }

  return `
REPL is your programming interface to Claude Code's tools. Use it to loop, branch, and compose tool calls with code.

## How to Use

Write JavaScript that calls tools as async functions:
\`\`\`javascript
const { filenames } = await ${GLOB_TOOL_NAME}({ pattern: 'src/**/*.ts' })
for (const f of filenames) {
  const { file } = await ${FILE_READ_TOOL_NAME}({ file_path: f })
  if (file.content.includes('oldName')) {
    await ${FILE_EDIT_TOOL_NAME}({ file_path: f, old_string: 'oldName', new_string: 'newName', replace_all: true })
  }
}
\`\`\`

**IMPORTANT: Batch ALL operations into ONE REPL call.** Don't make multiple separate REPL calls - write a complete script that does everything.

## Available Tools

All tools work as async functions: \`${FILE_READ_TOOL_NAME}\`, \`${FILE_WRITE_TOOL_NAME}\`, \`${FILE_EDIT_TOOL_NAME}\`, \`${GLOB_TOOL_NAME}\`, \`Grep\`, \`${shellToolName}\`, etc. MCP tools are callable by their full name (e.g. \`await mcp__slack__slack_send_message({...})\`).

\`\`\`javascript
const { filenames } = await ${GLOB_TOOL_NAME}({ pattern: '*.ts' })
const { file } = await ${FILE_READ_TOOL_NAME}({ file_path: 'config.json' })
await ${FILE_EDIT_TOOL_NAME}({ file_path: 'foo.ts', old_string: 'old', new_string: 'new' })
const { stdout } = await ${shellToolName}({ command: 'git status' })
\`\`\`

## Tips
- \`import\`/\`require\` don't work here — the vm context is sealed. For filesystem access use \`${FILE_READ_TOOL_NAME}\`/\`${FILE_WRITE_TOOL_NAME}\`/\`${GLOB_TOOL_NAME}\`; for shell use \`${shellToolName}\`.
- Use \`Promise.all()\` for parallel operations
- Variables persist across REPL calls
- Last expression is returned as the result
- \`haiku(prompt, schema?)\` — one-turn model sampling. Without schema returns text; with a JSON schema returns the parsed object.
- \`registerTool(name, desc, schema, handler)\` defines a new tool; \`unregisterTool(name)\`, \`listTools()\`, \`getTool(name)\` manage them
- ${isBash ? `\`shQuote(s)\` quotes a string for Bash — use this instead of \`JSON.stringify\` (double quotes don't protect backticks or \`$\`)
- Don't write a temp file just to feed a shell command — pipe via heredoc: \`await ${shellToolName}({command: "${multilineCommand}"})\`. Generic temp paths get clobbered by parallel agents.` : powershellQuoting}
`
}

export function getREPLToolDescription(): string {
  return isReplModeEnabled()
    ? 'Execute JavaScript to read, write, edit files and run shell commands'
    : 'Execute JavaScript code with access to Claude Code tools'
}
