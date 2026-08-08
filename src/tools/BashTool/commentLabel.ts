/**
 * If the first line of a bash command is a `# comment` (not a `#!` shebang),
 * return the comment text stripped of the `#` prefix. Otherwise undefined.
 *
 * Under fullscreen mode this is the non-verbose tool-use label AND the
 * collapse-group ⎿ hint — it's what Claude wrote for the human to read.
 */
export function extractBashCommentLabel(command: string): string | undefined {
  const nl = command.indexOf('\n')
  const firstLine = (nl === -1 ? command : command.slice(0, nl)).trim()
  if (!firstLine.startsWith('#') || firstLine.startsWith('#!')) return undefined
  if (nl !== -1 && containsNonCommentLine(command.slice(nl + 1))) {
    return undefined
  }

  const label = firstLine.replace(/^#+\s*/, '')
  if (!label || containsControlCharacter(label)) return undefined
  return label
}

function containsNonCommentLine(command: string): boolean {
  for (const line of command.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    return true
  }
  return false
}

function containsControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 32 || (code >= 127 && code <= 159)) return true
  }
  return false
}
