#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_BRIDGE_WORKTREE_CLEANUP_INPUT_FILE = Object.freeze({
  path: 'src/bridge/bridgeMain.ts',
  bytes: 116403,
  sha256: '8ab48ce786f7188a0038992c9c5e3ee2a4ffdc1fc3f18dea8a928cba5cdca5c7',
})

export const TARGET117_BRIDGE_WORKTREE_CLEANUP_OUTPUT_FILE = Object.freeze({
  path: 'src/bridge/bridgeMain.ts',
  bytes: 117653,
  sha256: '8e32cd7a5a570b3fce9635ca1cb499ad6c0d5c094ae537baab64af78929d78ec',
})

const lines = (...values) => values.join('\n')

const PATCHES = Object.freeze([
  Object.freeze({
    label: 'cleanup imports',
    input: lines(
      "import { sleep } from '../utils/sleep.js'",
      "import { createAgentWorktree, removeAgentWorktree } from '../utils/worktree.js'",
    ),
    output: lines(
      "import { sleep } from '../utils/sleep.js'",
      "import { plural } from '../utils/stringUtils.js'",
      "import {",
      "  createAgentWorktree,",
      "  getAgentWorktreeChanges,",
      "  removeAgentWorktree,",
      "} from '../utils/worktree.js'",
    ),
  }),
  Object.freeze({
    label: 'BridgeWorktree cleanup declaration',
    input: lines(
      '    return errMsg',
      '  }',
      '}',
      '',
      'export async function runBridgeLoop(',
    ),
    output: lines(
      '    return errMsg',
      '  }',
      '}',
      '',
      'type BridgeWorktree = {',
      '  worktreePath: string',
      '  worktreeBranch?: string',
      '  gitRoot?: string',
      '  hookBased?: boolean',
      '  headCommit?: string',
      '}',
      '',
      'async function cleanupBridgeWorktree(',
      '  worktree: BridgeWorktree,',
      '  logger: BridgeLogger,',
      '  options?: { force?: boolean },',
      '): Promise<void> {',
      '  const force =',
      '    options?.force || (worktree.hookBased && worktree.headCommit === undefined)',
      '  const { dirty, commitsAhead, gitError } = force',
      '    ? { dirty: false, commitsAhead: 0, gitError: false }',
      '    : await getAgentWorktreeChanges(',
      '        worktree.worktreePath,',
      '        worktree.headCommit,',
      '      )',
      '  if (dirty || commitsAhead > 0) {',
      "    const commits = `${commitsAhead} ${plural(commitsAhead, 'commit')}`",
      '    const reason = gitError',
      "      ? 'git error checking changes'",
      '      : dirty && commitsAhead > 0',
      '        ? `uncommitted changes · ${commits}`',
      '        : dirty',
      "          ? 'uncommitted changes'",
      '          : commits',
      '    logger.logStatus(`kept worktree ${worktree.worktreePath} · ${reason}`)',
      '    logForDebugging(',
      '      `[bridge:worktree] kept ${worktree.worktreePath} dirty=${dirty} commitsAhead=${commitsAhead} gitError=${Boolean(gitError)}`,',
      '    )',
      '    return',
      '  }',
      '  if (',
      '    await removeAgentWorktree(',
      '      worktree.worktreePath,',
      '      worktree.worktreeBranch,',
      '      worktree.gitRoot,',
      '      worktree.hookBased,',
      "      'bridge',",
      '    )',
      '  ) {',
      '    logger.logStatus(`removed worktree ${worktree.worktreePath}`)',
      '  } else {',
      '    logger.logStatus(',
      '      `worktree removal failed, kept: ${worktree.worktreePath}`,',
      '    )',
      '  }',
      '}',
      '',
      'export async function runBridgeLoop(',
    ),
  }),
  Object.freeze({
    label: 'BridgeWorktree state',
    input: lines(
      '  const completedWorkIds = new Set<string>()',
      '  const sessionWorktrees = new Map<',
      '    string,',
      '    {',
      '      worktreePath: string',
      '      worktreeBranch?: string',
      '      gitRoot?: string',
      '      hookBased?: boolean',
      '    }',
      '  >()',
    ),
    output: lines(
      '  const completedWorkIds = new Set<string>()',
      '  const crashedSessionIds = new Set<string>()',
      '  const sessionWorktrees = new Map<string, BridgeWorktree>()',
    ),
  }),
  Object.freeze({
    label: 'completed-session cleanup',
    input: lines(
      '      // Clean up worktree if one was created for this session',
      '      const wt = sessionWorktrees.get(sessionId)',
      '      if (wt) {',
      '        sessionWorktrees.delete(sessionId)',
      '        trackCleanup(',
      '          removeAgentWorktree(',
      '            wt.worktreePath,',
      '            wt.worktreeBranch,',
      '            wt.gitRoot,',
      '            wt.hookBased,',
      '          ).catch((err: unknown) =>',
      '            logger.logVerbose(',
      '              `Failed to remove worktree ${wt.worktreePath}: ${errorMessage(err)}`,',
      '            ),',
      '          ),',
      '        )',
      '      }',
    ),
    output: lines(
      '      const sessionCrashed =',
      "        status === 'failed' &&",
      '        !loopSignal.aborted &&',
      '        !wasTimedOut &&',
      '        !fatalExit',
      '      if (sessionCrashed) crashedSessionIds.add(sessionId)',
      '',
      '      // Clean up worktree if one was created for this session',
      '      const wt = sessionWorktrees.get(sessionId)',
      '      if (wt) {',
      '        sessionWorktrees.delete(sessionId)',
      '        if (sessionCrashed) {',
      '          logger.logStatus(`kept worktree ${wt.worktreePath} · session crashed`)',
      '        } else {',
      '          trackCleanup(cleanupBridgeWorktree(wt, logger))',
      '        }',
      '      }',
    ),
  }),
  Object.freeze({
    label: 'worktree head commit',
    input: lines(
      '                gitRoot: wt.gitRoot,',
      '                hookBased: wt.hookBased,',
      '              })',
    ),
    output: lines(
      '                gitRoot: wt.gitRoot,',
      '                hookBased: wt.hookBased,',
      '                headCommit: wt.headCommit,',
      '              })',
    ),
  }),
  Object.freeze({
    label: 'failed-spawn forced cleanup',
    input: lines(
      '              trackCleanup(',
      '                removeAgentWorktree(',
      '                  wt.worktreePath,',
      '                  wt.worktreeBranch,',
      '                  wt.gitRoot,',
      '                  wt.hookBased,',
      '                ).catch((err: unknown) =>',
      '                  logger.logVerbose(',
      '                    `Failed to remove worktree ${wt.worktreePath}: ${errorMessage(err)}`,',
      '                  ),',
      '                ),',
      '              )',
    ),
    output:
      '              trackCleanup(cleanupBridgeWorktree(wt, logger, { force: true }))',
  }),
  Object.freeze({
    label: 'crashed-session archive exclusion',
    input: lines(
      '  const sessionsToArchive = new Set(activeSessions.keys())',
      '  if (initialSessionId) {',
      '    sessionsToArchive.add(initialSessionId)',
      '  }',
    ),
    output: lines(
      '  const sessionsToArchive = new Set(activeSessions.keys())',
      '  if (',
      '    initialSessionId &&',
      '    ![...crashedSessionIds].some(sessionId =>',
      '      sameSessionId(sessionId, initialSessionId),',
      '    )',
      '  ) {',
      '    sessionsToArchive.add(initialSessionId)',
      '  }',
    ),
  }),
  Object.freeze({
    label: 'shutdown cleanup',
    input: lines(
      '      await Promise.allSettled(',
      '        remainingWorktrees.map(wt =>',
      '          removeAgentWorktree(',
      '            wt.worktreePath,',
      '            wt.worktreeBranch,',
      '            wt.gitRoot,',
      '            wt.hookBased,',
      '          ),',
      '        ),',
      '      )',
    ),
    output: lines(
      '      await Promise.allSettled(',
      '        remainingWorktrees.map(wt => cleanupBridgeWorktree(wt, logger)),',
      '      )',
    ),
  }),
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function descriptorsEqual(left, right) {
  return left.bytes === right.bytes && left.sha256 === right.sha256
}

function sourceFilename(sourceRoot) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, 'bridge/bridgeMain.ts')
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error('bridgeMain path escapes the supplied source root')
  }
  return filename
}

function readRealFile(filename) {
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error('src/bridge/bridgeMain.ts: expected a real source file')
  }
  return fs.readFileSync(filename)
}

function replaceExactlyOnce(source, input, output, label) {
  const first = source.indexOf(input)
  if (first === -1 || source.indexOf(input, first + input.length) !== -1) {
    throw new Error(`${label}: expected exactly one raw input anchor`)
  }
  if (source.includes(output)) {
    throw new Error(`${label}: raw input unexpectedly contains its postimage`)
  }
  return `${source.slice(0, first)}${output}${source.slice(first + input.length)}`
}

export function applyTarget117BridgeWorktreeCleanupSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const filename = sourceFilename(sourceRoot)
  const input = readRealFile(filename)
  const actual = descriptor(input)

  if (descriptorsEqual(actual, TARGET117_BRIDGE_WORKTREE_CLEANUP_OUTPUT_FILE)) {
    return Object.freeze({
      caseName: CASE_NAME,
      status: 'already-recovered',
      file: TARGET117_BRIDGE_WORKTREE_CLEANUP_OUTPUT_FILE,
      patches: PATCHES.length,
      ownerOverrides: 0,
    })
  }
  if (!descriptorsEqual(actual, TARGET117_BRIDGE_WORKTREE_CLEANUP_INPUT_FILE)) {
    throw new Error(
      `src/bridge/bridgeMain.ts: refusing non-target worktree recovery ${actual.bytes}/${actual.sha256}`,
    )
  }

  let output = input.toString('utf8')
  for (const patch of PATCHES) {
    output = replaceExactlyOnce(output, patch.input, patch.output, patch.label)
  }
  const outputBytes = Buffer.from(output)
  const recovered = descriptor(outputBytes)
  if (!descriptorsEqual(recovered, TARGET117_BRIDGE_WORKTREE_CLEANUP_OUTPUT_FILE)) {
    throw new Error(
      `src/bridge/bridgeMain.ts: replay drift; expected ${TARGET117_BRIDGE_WORKTREE_CLEANUP_OUTPUT_FILE.bytes}/${TARGET117_BRIDGE_WORKTREE_CLEANUP_OUTPUT_FILE.sha256}, got ${recovered.bytes}/${recovered.sha256}`,
    )
  }

  fs.writeFileSync(filename, outputBytes)
  const written = descriptor(readRealFile(filename))
  if (!descriptorsEqual(written, TARGET117_BRIDGE_WORKTREE_CLEANUP_OUTPUT_FILE)) {
    throw new Error(
      `src/bridge/bridgeMain.ts: written descriptor mismatch ${written.bytes}/${written.sha256}`,
    )
  }
  return Object.freeze({
    caseName: CASE_NAME,
    status: 'recovered',
    file: TARGET117_BRIDGE_WORKTREE_CLEANUP_OUTPUT_FILE,
    patches: PATCHES.length,
    ownerOverrides: 0,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = applyTarget117BridgeWorktreeCleanupSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
