import * as fs from 'fs'
import * as fsPromises from 'fs/promises'
import * as path from 'path'
import React from 'react'
import * as readline from 'readline'
import { getOriginalCwd } from '../../bootstrap/state.js'
import {
  Select,
  type OptionWithDescription,
} from '../../components/CustomSelect/index.js'
import { Box, render, Text } from '../../ink.js'
import { KeybindingSetup } from '../../keybindings/KeybindingProviderSetup.js'
import { AppStateProvider } from '../../state/AppState.js'
import { atomicWriteFile } from '../../utils/atomicWrite.js'
import {
  deleteProjectConfig,
  getGlobalConfig,
} from '../../utils/config.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { isENOENT } from '../../utils/errors.js'
import { findCanonicalGitRoot } from '../../utils/git.js'
import { normalizePathForConfigKey } from '../../utils/path.js'
import {
  canonicalizePath,
  findProjectDirs,
  getProjectsDir,
  sanitizePath,
} from '../../utils/sessionStoragePortable.js'
import { jsonParse } from '../../utils/slowOperations.js'
import { getTasksDir } from '../../utils/tasks.js'
import { cliError, cliOk, cliWarn } from '../exit.js'

type HistoryScanMode = 'count' | 'filter'

type PurgeItem = {
  path: string
  kind: 'config-key' | 'dir' | 'file' | 'history-lines'
  reason: string
  matchPaths?: Set<string>
}

type PurgePlan = {
  items: PurgeItem[]
  warnings: string[]
}

type PurgeProjectOptions = {
  all?: boolean
  dryRun?: boolean
  interactive?: boolean
  yes?: boolean
}

const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function printLine(message = ''): void {
  process.stdout.write(`${message}\n`)
}

function confirm(message: string): Promise<boolean> {
  let resolveConfirmation: (confirmed: boolean) => void = () => {}
  const confirmation = new Promise<boolean>(resolve => {
    resolveConfirmation = resolve
  })
  const prompt = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  prompt.question(`${message} [y/N] `, answer => {
    prompt.close()
    const normalized = answer.trim().toLowerCase()
    resolveConfirmation(normalized === 'y' || normalized === 'yes')
  })
  return confirmation
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fsPromises.stat(candidate)
    return true
  } catch {
    return false
  }
}

async function selectValue<T extends string>(
  title: string,
  options: OptionWithDescription<T>[],
  defaultValue?: T,
): Promise<T | null> {
  let resolveSelection: (selection: T | null) => void = () => {}
  const selection = new Promise<T | null>(resolve => {
    resolveSelection = resolve
  })
  const { unmount, waitUntilExit } = await render(
    <AppStateProvider>
      <KeybindingSetup>
        <Box flexDirection="column" gap={1} paddingY={1}>
          <Text bold>{title}</Text>
          <Select
            options={options}
            defaultValue={defaultValue}
            visibleOptionCount={10}
            onChange={value => {
              resolveSelection(value)
              unmount()
            }}
            onCancel={() => {
              resolveSelection(null)
              unmount()
            }}
          />
        </Box>
      </KeybindingSetup>
    </AppStateProvider>,
    { exitOnCtrlC: false },
  )
  await waitUntilExit()
  return selection
}

function getConfiguredProjectPaths(): string[] {
  return Object.keys(getGlobalConfig().projects ?? {})
}

async function selectProjectPath(): Promise<string | null> {
  const currentPath = path.resolve(getOriginalCwd())
  const configuredPaths = getConfiguredProjectPaths()
  const seen = new Set([currentPath])
  const options: OptionWithDescription<string>[] = [
    {
      label: currentPath,
      value: currentPath,
      description: 'current directory',
    },
  ]
  for (const configuredPath of configuredPaths) {
    if (seen.has(configuredPath)) continue
    seen.add(configuredPath)
    options.push({ label: configuredPath, value: configuredPath })
  }
  return selectValue('Select a project to purge:', options, currentPath)
}

function pathMatches(candidate: string, matchPaths: Set<string>): boolean {
  for (const matchPath of matchPaths) {
    if (
      candidate === matchPath ||
      candidate.startsWith(matchPath + path.sep)
    ) {
      return true
    }
  }
  return false
}

function historyLineMatches(line: string, matchPaths: Set<string>): boolean {
  if (!line) return false
  try {
    const entry = jsonParse(line) as { project?: unknown }
    return (
      typeof entry.project === 'string' &&
      pathMatches(entry.project, matchPaths)
    )
  } catch {
    return false
  }
}

async function projectDirectoryMatches(
  projectDirectory: string,
  matchPaths: Set<string>,
): Promise<boolean> {
  let transcriptNames: string[]
  try {
    transcriptNames = (await fsPromises.readdir(projectDirectory))
      .filter(name => name.endsWith('.jsonl'))
      .sort()
  } catch {
    return false
  }

  for (const transcriptName of transcriptNames) {
    const stream = fs.createReadStream(
      path.join(projectDirectory, transcriptName),
      { encoding: 'utf8' },
    )
    const lines = readline.createInterface({
      input: stream,
      crlfDelay: Infinity,
    })
    let lineCount = 0
    try {
      for await (const line of lines) {
        if (++lineCount > 50) break
        try {
          const entry = jsonParse(line) as { cwd?: unknown }
          if (typeof entry.cwd === 'string') {
            return pathMatches(entry.cwd, matchPaths)
          }
        } catch {}
      }
    } catch {
    } finally {
      lines.close()
      stream.close()
    }
  }
  return false
}

export async function scanHistoryFile(
  historyPath: string,
  matchPaths: Set<string>,
  mode: HistoryScanMode,
): Promise<number> {
  const lines = readline.createInterface({
    input: fs.createReadStream(historyPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })
  const remainingLines: string[] = []
  let matchCount = 0
  try {
    for await (const line of lines) {
      if (historyLineMatches(line, matchPaths)) {
        matchCount++
      } else if (mode === 'filter') {
        remainingLines.push(line)
      }
    }
  } catch (error) {
    if (isENOENT(error)) return 0
    throw error
  }

  if (mode === 'filter' && matchCount > 0) {
    await atomicWriteFile(
      historyPath,
      remainingLines.length ? `${remainingLines.join('\n')}\n` : '',
    )
  }
  return matchCount
}

async function getSessionIds(projectDirectory: string): Promise<string[]> {
  let names: string[]
  try {
    names = await fsPromises.readdir(projectDirectory)
  } catch {
    return []
  }
  return names
    .filter(name => name.endsWith('.jsonl'))
    .map(name => name.slice(0, -6))
    .filter(name => SESSION_ID_PATTERN.test(name))
}

async function buildProjectPurgePlan(projectPath: string): Promise<PurgePlan> {
  const configDirectory = getClaudeConfigHomeDir()
  const resolvedPath = path.resolve(projectPath)
  const canonicalPath = await canonicalizePath(resolvedPath)
  const matchPaths = new Set([resolvedPath, canonicalPath])
  const canonicalGitRoots: string[] = []
  try {
    await fsPromises.stat(resolvedPath)
    for (const matchPath of matchPaths) {
      const gitRoot = findCanonicalGitRoot(matchPath)
      if (gitRoot) canonicalGitRoots.push(gitRoot)
    }
  } catch {}

  const items: PurgeItem[] = []
  const warnings: string[] = []
  const projectDirectories = new Set<string>()
  for (const matchPath of matchPaths) {
    for (const projectDirectory of await findProjectDirs(matchPath)) {
      projectDirectories.add(projectDirectory)
    }
  }

  const projectsDirectory = getProjectsDir()
  const projectPrefixes = [...matchPaths].map(
    matchPath => sanitizePath(matchPath) + '-',
  )
  try {
    for (const entry of await fsPromises.readdir(projectsDirectory, {
      withFileTypes: true,
    })) {
      const candidate = path.join(projectsDirectory, entry.name)
      if (
        entry.isDirectory() &&
        !projectDirectories.has(candidate) &&
        projectPrefixes.some(prefix => entry.name.startsWith(prefix)) &&
        (await projectDirectoryMatches(candidate, matchPaths))
      ) {
        projectDirectories.add(candidate)
      }
    }
  } catch {}

  const directories = [...projectDirectories]
  const sessionIds = new Set<string>()
  for (const projectDirectory of directories) {
    for (const sessionId of await getSessionIds(projectDirectory)) {
      sessionIds.add(sessionId)
    }
  }

  for (const sessionId of sessionIds) {
    const tasksDirectory = getTasksDir(sessionId)
    if (await pathExists(tasksDirectory)) {
      items.push({
        path: tasksDirectory,
        kind: 'dir',
        reason: `tasks for session ${sessionId}`,
      })
    }
    const debugLog = path.join(configDirectory, 'debug', `${sessionId}.txt`)
    if (await pathExists(debugLog)) {
      items.push({
        path: debugLog,
        kind: 'file',
        reason: `debug log for session ${sessionId}`,
      })
    }
    const fileHistoryDirectory = path.join(
      configDirectory,
      'file-history',
      sessionId,
    )
    if (await pathExists(fileHistoryDirectory)) {
      items.push({
        path: fileHistoryDirectory,
        kind: 'dir',
        reason: `file edit history for session ${sessionId}`,
      })
    }
  }

  for (const projectDirectory of directories) {
    items.push({
      path: projectDirectory,
      kind: 'dir',
      reason: 'project transcripts (.jsonl) and memory/',
    })
  }

  const normalizeConfigPath = (candidate: string): string =>
    normalizePathForConfigKey(candidate).replace(/\/+$/, '') || '/'
  const globalConfig = getGlobalConfig()
  const configPaths = new Set(
    [...matchPaths, ...canonicalGitRoots].map(normalizeConfigPath),
  )
  for (const configuredPath of Object.keys(globalConfig.projects ?? {})) {
    if (configPaths.has(normalizeConfigPath(configuredPath))) {
      items.push({
        path: configuredPath,
        kind: 'config-key',
        reason:
          'project entry in ~/.claude.json (trust, history, MCP servers)',
      })
    }
  }

  const historyPath = path.join(configDirectory, 'history.jsonl')
  const promptCount = await scanHistoryFile(historyPath, matchPaths, 'count')
  if (promptCount > 0) {
    items.push({
      path: historyPath,
      kind: 'history-lines',
      reason: `${promptCount} prompt(s) typed in this project`,
      matchPaths,
    })
  }

  if (await pathExists(path.join(configDirectory, 'shell-snapshots'))) {
    warnings.push(
      'shell-snapshots/ are not project-scoped and will not be touched',
    )
  }
  const backupsDirectory = path.join(configDirectory, 'backups')
  if (await pathExists(backupsDirectory)) {
    warnings.push(
      `backups/ may still contain this project entry in old .claude.json snapshots (${backupsDirectory}); at most 5 are kept and they rotate out automatically`,
    )
  }

  return { items, warnings }
}

async function buildAllProjectsPurgePlan(): Promise<PurgePlan> {
  const configDirectory = getClaudeConfigHomeDir()
  const items: PurgeItem[] = []
  const warnings: string[] = []
  const directories: Array<[string, string]> = [
    ['projects', 'all project transcripts (.jsonl) and memory/'],
    ['tasks', 'all session task lists'],
    ['debug', 'all session debug logs'],
    ['file-history', 'all session file edit history'],
  ]
  for (const [directoryName, reason] of directories) {
    const directory = path.join(configDirectory, directoryName)
    if (await pathExists(directory)) {
      items.push({ path: directory, kind: 'dir', reason })
    }
  }

  const historyPath = path.join(configDirectory, 'history.jsonl')
  if (await pathExists(historyPath)) {
    items.push({
      path: historyPath,
      kind: 'file',
      reason: 'prompt history across all projects',
    })
  }
  for (const configuredPath of getConfiguredProjectPaths()) {
    items.push({
      path: configuredPath,
      kind: 'config-key',
      reason: 'project entry in ~/.claude.json (trust, history, MCP servers)',
    })
  }

  if (await pathExists(path.join(configDirectory, 'shell-snapshots'))) {
    warnings.push(
      'shell-snapshots/ are not project-scoped and will not be touched',
    )
  }
  const backupsDirectory = path.join(configDirectory, 'backups')
  if (await pathExists(backupsDirectory)) {
    warnings.push(
      `backups/ may still contain project entries in old .claude.json snapshots (${backupsDirectory}); at most 5 are kept and they rotate out automatically`,
    )
  }

  return { items, warnings }
}

async function purgeItem(item: PurgeItem): Promise<void> {
  switch (item.kind) {
    case 'config-key':
      deleteProjectConfig(item.path)
      return
    case 'history-lines':
      await scanHistoryFile(
        item.path,
        item.matchPaths ?? new Set<string>(),
        'filter',
      )
      return
    case 'file':
    case 'dir':
      await fsPromises.rm(item.path, {
        recursive: item.kind === 'dir',
        force: true,
      })
      return
  }
}

function formatPurgeItem(item: PurgeItem): string {
  let location: string
  switch (item.kind) {
    case 'config-key':
      location = `config: projects["${item.path}"]`
      break
    case 'history-lines':
      location = `filter: ${item.path}`
      break
    case 'file':
    case 'dir':
      location = `${item.kind}:    ${item.path}`
      break
  }
  return `${location}\n           ${item.reason}`
}

function printPurgePlan(
  target: string,
  items: PurgeItem[],
  warnings: string[],
): void {
  printLine(`\nPurge plan for ${target}:\n`)
  for (const item of items) {
    printLine(`  ${formatPurgeItem(item)}`)
  }
  if (warnings.length) {
    printLine()
    for (const warning of warnings) cliWarn(warning)
  }
}

export async function purgeProjectHandler(
  projectPath: string | undefined,
  options: PurgeProjectOptions,
): Promise<void> {
  if (options.all) {
    if (projectPath) cliError('Cannot specify both a path and --all.')
    if (options.interactive) {
      cliError('Cannot use -i/--interactive with --all.')
    }
    const { items, warnings } = await buildAllProjectsPurgePlan()
    if (items.length === 0) {
      cliError(
        `No Claude Code project state found under ${getClaudeConfigHomeDir()}.`,
      )
    }
    printPurgePlan('all projects', items, warnings)
    if (options.dryRun) {
      cliOk(`Dry run: ${items.length} item(s) would be deleted.`)
    }
    if (!options.yes) {
      if (
        !(await confirm(
          `Delete ${items.length} item(s) for ALL projects? This cannot be undone.`,
        ))
      ) {
        cliError('Aborted.')
      }
    }
    for (const item of items) await purgeItem(item)
    cliOk(`Purged ${items.length} item(s) across all projects.`)
  }

  let resolvedProjectPath: string
  if (projectPath) {
    resolvedProjectPath = path.resolve(projectPath)
  } else {
    const selectedPath = await selectProjectPath()
    if (selectedPath === null) cliError('Aborted.')
    resolvedProjectPath = selectedPath
  }

  const { items, warnings } = await buildProjectPurgePlan(resolvedProjectPath)
  if (items.length === 0) {
    cliError(
      `No Claude Code project state found for ${resolvedProjectPath} under ${getClaudeConfigHomeDir()}.`,
    )
  }
  printPurgePlan(resolvedProjectPath, items, warnings)
  if (options.dryRun) {
    cliOk(`Dry run: ${items.length} item(s) would be deleted.`)
  }

  if (options.interactive) {
    let deletedCount = 0
    let deleteAllRemaining = false
    for (const [index, item] of items.entries()) {
      let action = 'delete'
      if (!deleteAllRemaining) {
        action =
          (await selectValue(
            `[${index + 1}/${items.length}] ${formatPurgeItem(item)}`,
            [
              { label: 'Delete', value: 'delete' },
              { label: 'Skip', value: 'skip' },
              {
                label: 'Delete this and all remaining',
                value: 'all',
              },
              { label: 'Abort', value: 'abort' },
            ],
          )) ?? 'abort'
      }
      if (action === 'abort') {
        cliError(`Aborted. ${deletedCount} item(s) deleted.`)
      }
      if (action === 'skip') continue
      if (action === 'all') deleteAllRemaining = true
      await purgeItem(item)
      deletedCount++
    }
    cliOk(`Purged ${deletedCount}/${items.length} item(s) for ${resolvedProjectPath}.`)
  }

  if (!options.yes) {
    if (
      !(await confirm(
        `Delete ${items.length} item(s) for ${resolvedProjectPath}? This cannot be undone.`,
      ))
    ) {
      cliError('Aborted.')
    }
  }
  for (const item of items) await purgeItem(item)
  cliOk(`Purged ${items.length} item(s) for ${resolvedProjectPath}.`)
}
