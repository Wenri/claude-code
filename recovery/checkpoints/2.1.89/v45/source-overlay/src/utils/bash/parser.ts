import { logEvent } from '../../services/analytics/index.js'
import {
  getParserModule,
  type TsNode,
} from './bashParser.js'

export type Node = TsNode

export interface ParsedCommandData {
  rootNode: Node
  envVars: string[]
  commandNode: Node | null
  originalCommand: string
}

const MAX_COMMAND_LENGTH = 10000
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
const COMMAND_TYPES = new Set(['command', 'declaration_command'])

/**
 * Awaits WASM init (Parser.init + Language.load). Must be called before
 * parseCommand/parseCommandRaw for the parser to be available. Idempotent.
 */
export async function parseCommand(
  command: string,
): Promise<ParsedCommandData | null> {
  if (!command || command.length > MAX_COMMAND_LENGTH) return null

  try {
    const rootNode = getParserModule()!.parse(command)
    if (!rootNode) return null

    const commandNode = findCommandNode(rootNode, null)
    const envVars = extractEnvVars(commandNode)

    return { rootNode, envVars, commandNode, originalCommand: command }
  } catch {
    return null
  }
}

/**
 * SECURITY: Sentinel for "parser was loaded and attempted, but aborted"
 * (timeout / node budget / Rust panic). Distinct from `null` (module not
 * loaded). Adversarial input can trigger abort under MAX_COMMAND_LENGTH:
 * `(( a[0][0]... ))` with ~2800 subscripts hits PARSE_TIMEOUT_MICROS.
 * Callers MUST treat this as fail-closed (too-complex), NOT route to legacy.
 */
export const PARSE_ABORTED = Symbol('parse-aborted')

/**
 * Raw parse — skips findCommandNode/extractEnvVars which the security
 * walker in ast.ts doesn't use. Saves one tree walk per bash command.
 *
 * Returns:
 *   - Node: parse succeeded
 *   - null: module not loaded / feature off / empty / over-length
 *   - PARSE_ABORTED: module loaded but parse failed (timeout/panic)
 */
export async function parseCommandRaw(
  command: string,
): Promise<Node | null | typeof PARSE_ABORTED> {
  if (!command) return null
  if (command.length > MAX_COMMAND_LENGTH) {
    logEvent('tengu_tree_sitter_parse_abort', {
      cmdLength: command.length,
      panic: false,
    })
    return PARSE_ABORTED
  }
  try {
    const result = getParserModule()!.parse(command)
    if (result === null) {
      logEvent('tengu_tree_sitter_parse_abort', {
        cmdLength: command.length,
        panic: false,
      })
      return PARSE_ABORTED
    }
    return result
  } catch {
    logEvent('tengu_tree_sitter_parse_abort', {
      cmdLength: command.length,
      panic: true,
    })
    return PARSE_ABORTED
  }
}

export function findCommandNode(
  node: Node,
  parent: Node | null,
): Node | null {
  const { type, children } = node

  if (COMMAND_TYPES.has(type)) return node

  // Variable assignment followed by command
  if (type === 'variable_assignment' && parent) {
    return (
      parent.children.find(
        c => COMMAND_TYPES.has(c.type) && c.startIndex > node.startIndex,
      ) ?? null
    )
  }

  // Pipeline: recurse into first child (which may be a redirected_statement)
  if (type === 'pipeline') {
    for (const child of children) {
      const result = findCommandNode(child, node)
      if (result) return result
    }
    return null
  }

  // Redirected statement: find the command inside
  if (type === 'redirected_statement') {
    return children.find(c => COMMAND_TYPES.has(c.type)) ?? null
  }

  // Recursive search
  for (const child of children) {
    const result = findCommandNode(child, node)
    if (result) return result
  }

  return null
}

function extractEnvVars(commandNode: Node | null): string[] {
  if (!commandNode || commandNode.type !== 'command') return []

  const envVars: string[] = []
  for (const child of commandNode.children) {
    if (child.type === 'variable_assignment') {
      envVars.push(child.text)
    } else if (child.type === 'command_name' || child.type === 'word') {
      break
    }
  }
  return envVars
}

export function extractCommandArguments(commandNode: Node): string[] {
  // Declaration commands
  if (commandNode.type === 'declaration_command') {
    const firstChild = commandNode.children[0]
    return firstChild && DECLARATION_COMMANDS.has(firstChild.text)
      ? [firstChild.text]
      : []
  }

  const args: string[] = []
  let foundCommandName = false

  for (const child of commandNode.children) {
    if (child.type === 'variable_assignment') continue

    // Command name
    if (
      child.type === 'command_name' ||
      (!foundCommandName && child.type === 'word')
    ) {
      foundCommandName = true
      const value = child.children[0] ?? child
      args.push(stripQuotes(value.text))
      continue
    }

    // Arguments
    if (ARGUMENT_TYPES.has(child.type)) {
      args.push(stripQuotes(child.text))
    } else if (child.type === 'concatenation') {
      if (
        child.children.some(part => SUBSTITUTION_TYPES.has(part.type))
      ) {
        break
      }
      args.push(
        child.children.map(part => stripQuotes(part.text)).join(''),
      )
    } else if (SUBSTITUTION_TYPES.has(child.type)) {
      break
    }
  }
  return args
}

function stripQuotes(text: string): string {
  return text.length >= 2 &&
    ((text[0] === '"' && text.at(-1) === '"') ||
      (text[0] === "'" && text.at(-1) === "'"))
    ? text.slice(1, -1)
    : text
}
