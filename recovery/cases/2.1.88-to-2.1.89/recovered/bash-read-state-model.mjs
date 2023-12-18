// Executable semantic model for the two 2.1.89 Bash readFileState features.
// The published bundle erases the original module, function, and local names;
// those names are intentionally not presented as exact recovery.

export const WRITE_COMMAND_MARKER_SOURCES = [
  '--write',
  '--fix',
  '--in-place',
  '--auto-correct',
  '\\brun\\s+format\\b',
  '\\brun\\s+fix\\b',
  '\\b(yarn|pnpm)\\s+format\\b',
  '\\blint:file\\b',
  '\\blint:fix\\b',
  '\\bblack\\b',
  '\\bisort\\b',
  '\\bruff\\s+format\\b',
  '\\bcargo\\s+(fmt|fix)\\b',
  '\\brustfmt\\b',
  '\\bgo\\s+fmt\\b',
  '\\bterraform\\s+fmt\\b',
  '\\bdprint\\s+fmt\\b',
  '\\bswiftformat\\b',
  '\\bphpcbf\\b',
]

export const WRITE_COMMAND_MARKERS = new RegExp(
  WRITE_COMMAND_MARKER_SOURCES.join('|'),
)

export const MAX_COMMAND_LENGTH = 10_000
const COMMAND_TYPES = new Set(['command', 'declaration_command'])
const DECLARATION_COMMANDS = new Set([
  'export',
  'declare',
  'typeset',
  'readonly',
  'local',
  'unset',
  'unsetenv',
])
const ARGUMENT_TYPES = new Set(['word', 'string', 'raw_string', 'number'])
const SUBSTITUTION_TYPES = new Set([
  'command_substitution',
  'process_substitution',
])
const COMPOUND_COMMAND_NODE_TYPES = new Set([
  'program',
  'list',
  'pipeline',
])
const CONTROL_OPERATOR_NODE_TYPES = new Set([
  '&&',
  '||',
  '|',
  ';',
  '&',
  '|&',
  '\n',
])
const SED_RANGE = /^(\d+),(\d+)p$/
const SED_LINE = /^(\d+)p$/
const NEUTRAL_COMPOUND_COMMAND = /^\s*(echo|printf|true|:)\b/
const MAX_TRACKED_FILE_SIZE = 10 * 1024 * 1024

export function findCommandNode(node, parent) {
  if (COMMAND_TYPES.has(node.type)) return node
  if (node.type === 'variable_assignment' && parent) {
    return (
      parent.children.find(
        child =>
          COMMAND_TYPES.has(child.type) &&
          child.startIndex > node.startIndex,
      ) ?? null
    )
  }
  if (node.type === 'pipeline') {
    for (const child of node.children) {
      const result = findCommandNode(child, node)
      if (result) return result
    }
    return null
  }
  if (node.type === 'redirected_statement') {
    return (
      node.children.find(child => COMMAND_TYPES.has(child.type)) ?? null
    )
  }
  for (const child of node.children) {
    const result = findCommandNode(child, node)
    if (result) return result
  }
  return null
}

function stripQuotes(text) {
  return text.length >= 2 &&
    ((text[0] === '"' && text.at(-1) === '"') ||
      (text[0] === "'" && text.at(-1) === "'"))
    ? text.slice(1, -1)
    : text
}

export function extractCommandArguments(commandNode) {
  if (commandNode.type === 'declaration_command') {
    const first = commandNode.children[0]
    return first && DECLARATION_COMMANDS.has(first.text) ? [first.text] : []
  }

  const args = []
  let foundCommandName = false
  for (const child of commandNode.children) {
    if (child.type === 'variable_assignment') continue
    if (
      child.type === 'command_name' ||
      (!foundCommandName && child.type === 'word')
    ) {
      foundCommandName = true
      const value = child.children[0] ?? child
      args.push(stripQuotes(value.text))
      continue
    }
    if (ARGUMENT_TYPES.has(child.type)) {
      args.push(stripQuotes(child.text))
    } else if (child.type === 'concatenation') {
      if (
        child.children.some(part => SUBSTITUTION_TYPES.has(part.type))
      ) {
        break
      }
      args.push(child.children.map(part => stripQuotes(part.text)).join(''))
    } else if (SUBSTITUTION_TYPES.has(child.type)) {
      break
    }
  }
  return args
}

export function parseCommandArguments(command, getParserModule) {
  if (!command || command.length > MAX_COMMAND_LENGTH) return []
  const root = getParserModule().parse(command)
  if (!root) return []
  const commandNode = findCommandNode(root, null)
  if (!commandNode) return []
  return extractCommandArguments(commandNode)
}

export function splitParsedCommands(command, getParserModule) {
  if (!command) return []
  if (command.length > MAX_COMMAND_LENGTH) return [command]
  const root = getParserModule().parse(command)
  if (!root) return [command]

  const commands = []
  const visit = node => {
    if (
      CONTROL_OPERATOR_NODE_TYPES.has(node.type) ||
      node.type === 'comment'
    ) {
      return
    }
    if (node.type === 'redirected_statement') {
      for (const child of node.children) {
        if (!child.type.endsWith('_redirect')) visit(child)
      }
      return
    }
    if (COMPOUND_COMMAND_NODE_TYPES.has(node.type)) {
      for (const child of node.children) visit(child)
      return
    }
    commands.push(node.text)
  }
  visit(root)
  return commands
}

export function isHelpCommand(command, getParserModule) {
  const trimmed = command.trim()
  if (!trimmed.endsWith('--help')) return false
  if (trimmed.includes('"') || trimmed.includes("'")) return false
  const tokens = parseCommandArguments(trimmed, getParserModule)
  if (tokens.length === 0) return false
  let foundHelp = false
  const alphanumeric = /^[a-zA-Z0-9]+$/
  for (const token of tokens) {
    if (token.startsWith('-')) {
      if (token === '--help') foundHelp = true
      else return false
    } else if (!alphanumeric.test(token)) {
      return false
    }
  }
  return foundHelp
}

export function parseSedRead(command, parseArguments) {
  let args
  try {
    args = parseArguments(command)
  } catch {
    return null
  }
  if (args[0] !== 'sed') return null

  let quiet = false
  let expression = null
  let filePath = null
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index]
    if (argument.startsWith('-')) {
      if (argument.startsWith('--')) {
        if (
          argument === '--in-place' ||
          argument.startsWith('--in-place=')
        ) {
          return null
        }
        if (argument === '--expression') return null
        if (argument === '--quiet' || argument === '--silent') quiet = true
      } else {
        if (argument.includes('i')) return null
        if (argument === '-e') return null
        if (argument.includes('n')) quiet = true
      }
      continue
    }
    if (expression === null) expression = argument
    else if (filePath === null) filePath = argument
    else return null
  }

  if (!quiet || expression === null || filePath === null) return null
  const range = SED_RANGE.exec(expression)
  if (range) {
    return {
      filePath,
      startLine: Number(range[1]),
      endLine: Number(range[2]),
    }
  }
  const line = SED_LINE.exec(expression)
  if (line) {
    const lineNumber = Number(line[1])
    return { filePath, startLine: lineNumber, endLine: lineNumber }
  }
  return null
}

export function parseCatRead(command, parseArguments) {
  let args
  try {
    args = parseArguments(command)
  } catch {
    return null
  }
  if (args[0] !== 'cat') return null

  let filePath = null
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index]
    if (argument.startsWith('-')) {
      if (argument !== '-n' && argument !== '--number') return null
      continue
    }
    if (filePath !== null) return null
    filePath = argument
  }
  if (filePath === null || filePath === '-') return null
  return { filePath, startLine: undefined, endLine: undefined }
}

export function findBashReadRequests(
  command,
  { splitCommand, parseArguments },
) {
  if (/[|<>]/.test(command)) return []
  let segments
  try {
    segments = splitCommand(command)
  } catch {
    return []
  }
  if (segments.length === 0) return []

  const requests = []
  for (const segment of segments) {
    const request =
      parseSedRead(segment, parseArguments) ??
      parseCatRead(segment, parseArguments)
    if (request) requests.push(request)
    else if (
      segments.length > 1 &&
      !NEUTRAL_COMPOUND_COMMAND.test(segment)
    ) {
      return []
    }
  }
  return requests
}

export async function cacheBashReads(
  command,
  readFileState,
  signal,
  dependencies,
) {
  const requests = findBashReadRequests(command, dependencies)
  if (requests.length === 0) return
  const fs = dependencies.getFsImplementation()

  await Promise.all(
    requests.map(async request => {
      const absolutePath = dependencies.expandPath(request.filePath)
      if (readFileState.has(absolutePath)) return
      try {
        const stat = await fs.stat(absolutePath)
        if (stat.size > MAX_TRACKED_FILE_SIZE) return
        if (signal.aborted) return
        const fullContent = await fs.readFile(absolutePath, {
          encoding: 'utf8',
        })

        let content
        let offset
        let limit
        if (request.startLine === undefined) {
          content = fullContent
        } else {
          const lines = fullContent.split('\n')
          const start = Math.max(1, request.startLine)
          const end = Math.max(start, request.endLine ?? start)
          if (start > lines.length) return
          content = lines.slice(start - 1, end).join('\n')
          offset = start
          limit = end - start + 1
        }
        readFileState.set(absolutePath, {
          content,
          timestamp: Math.floor(stat.mtimeMs),
          offset,
          limit,
        })
      } catch {
        // The target swallows per-file stat/read errors.
      }
    }),
  )
}

export async function findStaleReadFileStateEntries(
  command,
  readFileState,
  commandStartTime,
  getFileModificationTimeAsync,
) {
  if (!WRITE_COMMAND_MARKERS.test(command)) return []
  const changed = []
  await Promise.all(
    Array.from(readFileState.entries(), ([filePath, state]) =>
      getFileModificationTimeAsync(filePath)
        .then(mtime => {
          if (mtime > commandStartTime && mtime > state.timestamp) {
            changed.push(filePath)
          }
        })
        .catch(() => {}),
    ),
  )
  return changed
}

export function buildStaleReadFileStateHint(
  changed,
  { cwd, relative, plural },
) {
  if (changed.length === 0) return undefined
  const maxPaths = 5
  const shown = changed
    .slice(0, maxPaths)
    .map(filePath => relative(cwd, filePath) || filePath)
    .join(', ')
  const more =
    changed.length > maxPaths
      ? ` and ${changed.length - maxPaths} more`
      : ''
  return `[This command modified ${changed.length} ${plural(changed.length, 'file')} you've previously read: ${shown}${more}. Call Read before editing.]`
}
