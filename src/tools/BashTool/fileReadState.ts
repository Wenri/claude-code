/**
 * Recovery note: the published 2.1.89 bundle erases this module's original
 * filename, function names, local names, types, and comments. Those names are
 * inferred. Control flow, accepted command grammar, filesystem behavior, cache
 * writes, limits, and error handling below are recovered from the bundle.
 *
 * `parseCommandArguments` is also an inferred name for the synchronous
 * argument extractor observed in the target commands module.
 */
import {
  parseCommandArguments,
  splitCommand_DEPRECATED,
} from '../../utils/bash/commands.js'
import type { FileStateCache } from '../../utils/fileStateCache.js'
import { getFsImplementation } from '../../utils/fsOperations.js'
import { expandPath } from '../../utils/path.js'

type BashReadRequest = {
  filePath: string
  startLine: number | undefined
  endLine: number | undefined
}

const SED_RANGE = /^(\d+),(\d+)p$/
const SED_LINE = /^(\d+)p$/
const NEUTRAL_COMPOUND_COMMAND = /^\s*(echo|printf|true|:)\b/
const MAX_TRACKED_FILE_SIZE = 10 * 1024 * 1024

function findBashReadRequests(command: string): BashReadRequest[] {
  if (/[|<>]/.test(command)) return []

  let segments: string[]
  try {
    segments = splitCommand_DEPRECATED(command)
  } catch {
    return []
  }
  if (segments.length === 0) return []

  const requests: BashReadRequest[] = []
  for (const segment of segments) {
    const request = parseSedRead(segment) ?? parseCatRead(segment)
    if (request) {
      requests.push(request)
    } else if (
      segments.length > 1 &&
      !NEUTRAL_COMPOUND_COMMAND.test(segment)
    ) {
      return []
    }
  }
  return requests
}

function parseSedRead(command: string): BashReadRequest | null {
  let args: string[]
  try {
    args = parseCommandArguments(command)
  } catch {
    return null
  }
  if (args[0] !== 'sed') return null

  let quiet = false
  let expression: string | null = null
  let filePath: string | null = null
  for (let index = 1; index < args.length; index++) {
    const argument = args[index]!
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
    return {
      filePath,
      startLine: lineNumber,
      endLine: lineNumber,
    }
  }
  return null
}

function parseCatRead(command: string): BashReadRequest | null {
  let args: string[]
  try {
    args = parseCommandArguments(command)
  } catch {
    return null
  }
  if (args[0] !== 'cat') return null

  let filePath: string | null = null
  for (let index = 1; index < args.length; index++) {
    const argument = args[index]!
    if (argument.startsWith('-')) {
      if (argument !== '-n' && argument !== '--number') return null
      continue
    }
    if (filePath !== null) return null
    filePath = argument
  }
  if (filePath === null || filePath === '-') return null
  return {
    filePath,
    startLine: undefined,
    endLine: undefined,
  }
}

export async function cacheBashReads(
  command: string,
  readFileState: FileStateCache,
  signal: AbortSignal,
): Promise<void> {
  const requests = findBashReadRequests(command)
  if (requests.length === 0) return

  const fs = getFsImplementation()
  await Promise.all(
    requests.map(async request => {
      const absolutePath = expandPath(request.filePath)
      if (readFileState.has(absolutePath)) return

      try {
        const stat = await fs.stat(absolutePath)
        if (stat.size > MAX_TRACKED_FILE_SIZE) return
        if (signal.aborted) return
        const fullContent = await fs.readFile(absolutePath, {
          encoding: 'utf8',
        })

        let content: string
        let offset: number | undefined
        let limit: number | undefined
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
        // The target intentionally swallows per-file stat/read errors.
      }
    }),
  )
}
