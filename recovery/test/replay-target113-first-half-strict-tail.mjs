#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const require = createRequire(import.meta.url)
const TARGET_REASON =
  'This command changes directory before running git, which can execute untrusted hooks from the target directory. Approve only if you trust it.'

// These hashes make the repository sources exact templates, not an open-ended
// "copy whatever is current" recipe. Files whose owners did not exist in the
// raw target tree are installed only from these authenticated/reviewed bytes.
const TEMPLATE_HASHES = {
  'src/services/teamMemorySync/index.ts': 'b2399391e4e6c2ee837cf5f9de20f1ffa20706ddc636c478cfd357a30f9032ee',
  'src/tools/BashTool/bashCommandHelpers.ts': 'a69066bb894d19f903a0ba5fd8a3d6d631c1344d0a057498d712c86d5635dadf',
  'src/tools/BashTool/bashPermissions.ts': '481ecf08f97b5308bef940f2af34d2efa6e8cccf7ac3a730797cf45e81ab91f5',
  'src/components/design-system/Table.tsx': '6ed22e106b243b0034b79fb3515953ede4a5e6f0bd713fdd2bb61f0b5a36edc0',
  'src/components/SearchBox.tsx': '0cd393ba0638c25c2794ec3cccce31447e19819d45dfdc60584f41d2598be335',
  'src/components/Settings/UsageContributors.tsx': 'ae6722934a5cdba2a7244247aca2156b68b568a29d867c91bbf7e70ede0f7b09',
  'src/screens/Doctor.tsx': 'af98e67482542129b132c00edfee717b5499902f2a8fa24d0704136cc6c9cd22',
  'src/components/LogoV2/AnimatedClawd.tsx': '7a40c7b01c7756d111cacd331dc5c86d8465c39b57ec81e229e45754e5da822f',
  'src/components/agents/agentFileUtils.ts': '7cd94fc7a46acbe435f8309eb94ecf1a7518a563503f9fa08771343a4d47cd4b',
  'src/utils/agenticSessionSearch.ts': '372faf6f287864965b59910fc3304a457cb9c0e9c41adb734ff7d15f6c119c0b',
  'src/commands/ultraplan.tsx': 'b6a9b95cec6569d8455b01bdf4637cc081a8496b978cb7ae2a2d6e31c5117f4f',
  'src/components/ExportDialog.tsx': 'f3be4cecc435a012d1292fc9f25aff5a3f805e23d4a731f65fc9928a76962165',
  'src/commands/export/export.tsx': '4db2db0e1f72ba99b20c4ebeae980599c4ce1c2716cc774834b29344c900746e',
  'src/commands/team-onboarding.ts': 'fcb075ca50fca9dd3b6629504ade9bebf59ef767b203e97d129a94b46557cab0',
}

const MISSING_OWNER_FILES = {
  'src/components/design-system/Table.tsx': [
    'function Border',
    'function horizontalSegment',
    'function minimalSegment',
  ],
  'src/components/Settings/UsageContributors.tsx': [
    'function scanRecentUsageRecords',
    'function findTranscriptFiles',
    'function readUsageRecords',
    'function UsageContributorsResult',
    'function BehaviorRow',
  ],
  'src/commands/team-onboarding.ts': [
    'function scanSessionUsage',
    'function readMcpServers',
    'function generateUsageData',
  ],
}

const TARGET113_RELAUNCH = `export async function relaunch(
  options: RelaunchOptions = {},
): Promise<never> {
  const { cmd, prefixArgs } = options.launcher ?? getRelaunchLauncher()
  const sessionId = getSessionId()
  let relaunchArgs: string[]

  if (options.args) {
    relaunchArgs = options.args
  } else if (
    options.freshIfNoTranscript &&
    !(await stat(getTranscriptPath()).then(
      result => result.size > 0,
      () => false,
    ))
  ) {
    relaunchArgs = []
  } else {
    relaunchArgs = ['--resume', sessionId]
  }

  stopCapturingEarlyInput()
  markShuttingDownForRelaunch()
  setInterval(() => {}, 1_073_741_824)

  await withTimeout(flushSessionStorage(), 2_000, 'flush timeout').catch(
    () => {},
  )
  cleanupTerminalForRelaunch()
  await withTimeout(runCleanupFunctions(), 2_000, 'cleanup timeout').catch(
    () => {},
  )
  options.preSpawn?.()

  const childEnv = { ...process.env }
  delete childEnv.CLAUDE_CODE_TUI_JUST_SWITCHED
  Object.assign(childEnv, options.env)
  for (const key of options.dropEnv ?? []) delete childEnv[key]

  const child = spawn(cmd, [...prefixArgs, ...relaunchArgs], {
    stdio: 'inherit',
    env: childEnv,
  })
  child.ref()
  severTtyInputForRelaunch()

  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.removeAllListeners(signal)
    process.on(signal, () => {})
  }

  return await new Promise<never>(() => {
    child.on('close', (code, signal) => {
      const signalCode = signal
        ? 128 + (constants.signals[signal] ?? 0)
        : 0
      process.exit(code ?? signalCode)
    })
    child.on('error', error => {
      process.stderr.write(\`Failed to relaunch Claude Code: \${error.message}\\n\`)
      process.exit(1)
    })
  })
}`

// Exact source spelling for the target113 leading-cd hardening closure.  This
// is deliberately embedded: historical packaging must not read a later
// checkout or a persisted comparison tree at replay time.
const TARGET113_BASH_LEADING_CD = `function canUseLeadingCdAsWorkingDirectory(command: string): boolean {
  if (command.includes('||') || command.includes(';')) return false
  if (command.includes('\\n')) return false
  if (command.replaceAll('&&', '').includes('&')) return false
  return true
}

function isExplicitCdPath(value: string): boolean {
  return (
    isAbsolute(value) ||
    value.startsWith('./') ||
    value.startsWith('../') ||
    value === '.' ||
    value === '..'
  )
}

function resolveLeadingCdWorkingDirectory(
  command: SimpleCommand | undefined,
  cwd: string,
  toolPermissionContext: ToolPermissionContext,
): string | null {
  if (!command) return null
  if (command.envVars.length > 0 || command.redirects.length > 0) return null
  if (command.argv.length !== 2 || command.argv[0] !== 'cd') return null

  const target = command.argv[1]!
  if (target.startsWith('-') || !isExplicitCdPath(target)) return null
  if (/[*?[\\]]/.test(target)) return null

  const { allowed, resolvedPath } = validatePath(
    target,
    cwd,
    toolPermissionContext,
    'read',
  )
  if (!allowed) return null
  if (
    !pathInAllowedWorkingPath(resolvedPath, toolPermissionContext, [
      resolvedPath,
    ])
  ) {
    return null
  }
  return resolvedPath
}

function parseSimpleCdPath(command: string): string | null {
  const trimmed = command.trim()
  if (!trimmed.startsWith('cd ')) return null
  const argument = trimmed.slice(3).trim()
  if (!argument) return null
  const quote = argument[0]
  if (quote === '"' || quote === "'") {
    if (argument.length < 2 || argument.at(-1) !== quote) return null
    const unquoted = argument.slice(1, -1)
    if (unquoted.includes(quote)) return null
    return unquoted
  }
  return /\\s/.test(argument) ? null : argument
}

async function normalizedRealpath(value: string): Promise<string | null> {
  const result = await realpath(value).catch(() => null)
  if (result === null) return null
  return getPlatform() === 'windows' ? result.toLowerCase() : result
}

async function cdPathResolvesToCwd(
  target: string,
  cwd: string,
  normalizedCwd: string,
): Promise<boolean> {
  if (target.startsWith('-') || !isExplicitCdPath(target)) return false
  if (
    target.includes('$') ||
    /[*?[]/.test(target) ||
    (getPlatform() === 'windows' && target.includes('%'))
  ) {
    return false
  }
  const absoluteTarget = isAbsolute(target) ? target : resolve(cwd, target)
  const normalizedTarget = await normalizedRealpath(absoluteTarget)
  return normalizedTarget !== null && normalizedTarget === normalizedCwd
}

async function astCdCommandsKeepCurrentDirectory(
  astCommands: (SimpleCommand | undefined)[],
  subcommands: string[],
  cwd: string,
): Promise<boolean> {
  const normalizedCwd = await normalizedRealpath(cwd)
  if (normalizedCwd === null) return false
  let foundCd = false
  for (let index = 0; index < subcommands.length; index++) {
    if (!isNormalizedCdCommand(subcommands[index]!)) continue
    foundCd = true
    const command = astCommands[index]
    if (!command) return false
    if (command.envVars.length > 0 || command.redirects.length > 0) return false
    if (command.argv.length !== 2 || command.argv[0] !== 'cd') return false
    const target = parseSimpleCdPath(subcommands[index]!)
    if (target === null) return false
    if (!(await cdPathResolvesToCwd(target, cwd, normalizedCwd))) return false
  }
  return foundCd
}

async function textualCdCommandsKeepCurrentDirectory(
  subcommands: string[],
  cwd: string,
): Promise<boolean> {
  const normalizedCwd = await normalizedRealpath(cwd)
  if (normalizedCwd === null) return false
  let foundCd = false
  for (const subcommand of subcommands) {
    if (!isNormalizedCdCommand(subcommand.trim())) continue
    foundCd = true
    const target = parseSimpleCdPath(subcommand)
    if (target === null) return false
    if (!(await cdPathResolvesToCwd(target, cwd, normalizedCwd))) return false
  }
  return foundCd
}`

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function loadTypeScript() {
  const candidates = [
    path.resolve(path.dirname(process.execPath), '../lib/node_modules/typescript/lib/typescript.js'),
    path.join(repositoryRoot, '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js'),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate, 'the pinned TypeScript compiler is required by the replay helper')
  const module = require(candidate)
  return module.default ?? module
}

function normalizeTreeRoot(root) {
  const absolute = path.resolve(root)
  if (path.basename(absolute) === 'src') return path.dirname(absolute)
  if (fs.existsSync(path.join(absolute, 'src'))) return absolute
  throw new Error(`${absolute}: expected a repository root or src root`)
}

function parse(ts, filename, source) {
  const parsed = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    /\.tsx(?::template)?$/.test(filename) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(
    parsed.parseDiagnostics.length,
    0,
    `${filename}: ${parsed.parseDiagnostics.map(item => item.messageText).join('; ')}`,
  )
  return parsed
}

function namedStatement(ts, parsed, name) {
  for (const statement of parsed.statements) {
    if (statement.name && ts.isIdentifier(statement.name) && statement.name.text === name) {
      return statement
    }
    if (
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        declaration => ts.isIdentifier(declaration.name) && declaration.name.text === name,
      )
    ) {
      return statement
    }
  }
}

function insertBeforeSourceMap(source, text) {
  const marker = source.indexOf('//# sourceMappingURL=')
  const offset = marker === -1 ? source.length : marker
  const prefix = source.slice(0, offset).replace(/\s*$/, '\n\n')
  const suffix = source.slice(offset)
  return `${prefix}${text.trim()}\n${suffix}`
}

function upsertTextStatement(ts, filename, source, name, statementText) {
  const parsed = parse(ts, filename, source)
  const existing = namedStatement(ts, parsed, name)
  if (!existing) return insertBeforeSourceMap(source, statementText)
  const current = existing.getText(parsed)
  if (current === statementText.trim()) return source
  return source.slice(0, existing.getStart(parsed)) + statementText.trim() + source.slice(existing.end)
}

function upsertTemplateStatements(ts, destination, template, names) {
  const templateParsed = parse(ts, `${destination.filename}:template`, template)
  let result = destination.source
  for (const name of names) {
    const statement = namedStatement(ts, templateParsed, name)
    assert.ok(statement, `${destination.relative}: exact template declaration ${name}`)
    result = upsertTextStatement(
      ts,
      destination.filename,
      result,
      name,
      statement.getText(templateParsed),
    )
  }
  return result
}

function ensureImport(ts, filename, source, importedName, importText) {
  const parsed = parse(ts, filename, source)
  const imports = parsed.statements.filter(statement => ts.isImportDeclaration(statement))
  const binding = new RegExp(`\\b${importedName.replaceAll('$', '\\$')}\\b`)
  if (imports.some(statement => binding.test(statement.getText(parsed)))) return source
  const offset = imports.length > 0 ? imports.at(-1).end : 0
  return `${source.slice(0, offset)}\n${importText}${source.slice(offset)}`
}

function exactTemplate(relative) {
  const filename = path.join(repositoryRoot, relative)
  const bytes = fs.readFileSync(filename)
  assert.equal(sha256(bytes), TEMPLATE_HASHES[relative], `${relative}: exact replay template hash`)
  return bytes.toString('utf8')
}

function destination(treeRoot, relative) {
  const filename = path.join(treeRoot, relative)
  return {
    filename,
    relative,
    source: fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8') : '',
  }
}

function writeChanged(state, next, changes) {
  if (state.source === next) return
  fs.mkdirSync(path.dirname(state.filename), { recursive: true })
  fs.writeFileSync(state.filename, next)
  changes.push(state.relative)
}

function installMissingOwner(treeRoot, relative, evidence, changes) {
  const state = destination(treeRoot, relative)
  if (state.source && evidence.every(fragment => state.source.includes(fragment))) return
  assert.equal(state.source, '', `${relative}: an incomplete existing missing-owner file is fail-closed`)
  writeChanged(state, exactTemplate(relative), changes)
}

function replaceCdGitReason(state) {
  if (state.source.includes(TARGET_REASON)) return state.source
  const oldReason =
    'Compound commands with cd and git require approval to prevent bare repository attacks'
  assert.equal(
    state.source.split(oldReason).length - 1,
    1,
    `${state.relative}: unique exact old cd+git reason anchor`,
  )
  return state.source.replace(oldReason, TARGET_REASON)
}

function replaceExactOnce(source, before, after, label) {
  if (source.includes(after)) return source
  assert.equal(
    source.split(before).length - 1,
    1,
    `${label}: unique exact before anchor`,
  )
  return source.replace(before, after)
}

function patchBashCommandHelpers(ts, treeRoot, changes) {
  const state = destination(treeRoot, 'src/tools/BashTool/bashCommandHelpers.ts')
  let next = upsertTemplateStatements(
    ts,
    state,
    exactTemplate(state.relative),
    ['segmentedCommandPermissionResult'],
  )
  next = replaceExactOnce(
    next,
    `  checkers: CommandIdentityCheckers,
  astRoot: Node | null | typeof PARSE_ABORTED,
): Promise<PermissionResult> {`,
    `  checkers: CommandIdentityCheckers,
  astRoot: Node | null | typeof PARSE_ABORTED,
  cdCommandsKeepCurrentDirectory?: (
    subcommands: string[],
  ) => Promise<boolean>,
): Promise<PermissionResult> {`,
    `${state.relative}: exported operator callback`,
  )
  next = replaceExactOnce(
    next,
    `    checkers,
    parsed,
  )`,
    `    checkers,
    parsed,
    cdCommandsKeepCurrentDirectory,
  )`,
    `${state.relative}: exported operator callback forwarding`,
  )
  next = replaceExactOnce(
    next,
    `  checkers: CommandIdentityCheckers,
  parsed: IParsedCommand,
): Promise<PermissionResult> {`,
    `  checkers: CommandIdentityCheckers,
  parsed: IParsedCommand,
  cdCommandsKeepCurrentDirectory?: (
    subcommands: string[],
  ) => Promise<boolean>,
): Promise<PermissionResult> {`,
    `${state.relative}: internal operator callback`,
  )
  next = replaceExactOnce(
    next,
    `    segments,
    bashToolHasPermissionFn,
    checkers,
  )`,
    `    segments,
    bashToolHasPermissionFn,
    checkers,
    cdCommandsKeepCurrentDirectory,
  )`,
    `${state.relative}: segmented callback forwarding`,
  )
  writeChanged(state, next, changes)
}

function patchTarget113BashCaller(source, relative) {
  const completeMarkers = [
    'subcommands => textualCdCommandsKeepCurrentDirectory(subcommands, getCwd())',
    'let permissionCwd = cwd',
    'pathCommandHasCd = false',
    'await astCdCommandsKeepCurrentDirectory(',
    'adjustedForLeadingCd && i === 0 ? cwd : permissionCwd',
    '.slice(adjustedForLeadingCd ? 1 : 0)',
    'astCommandsByIdx[subcommandIndex]',
  ]
  if (completeMarkers.every(marker => source.includes(marker))) return source
  let next = source
  next = replaceExactOnce(
    next,
    `  compoundCommandHasCd?: boolean,
  astCommand?: SimpleCommand,
): PermissionResult => {`,
    `  compoundCommandHasCd?: boolean,
  astCommand?: SimpleCommand,
  cwd = getCwd(),
): PermissionResult => {`,
    `${relative}: bashToolCheckPermission cwd parameter`,
  )
  next = replaceExactOnce(
    next,
    `  const pathResult = checkPathConstraints(
    input,
    getCwd(),
    toolPermissionContext,
    compoundCommandHasCd,
    astCommand?.redirects,`,
    `  const pathResult = checkPathConstraints(
    input,
    cwd,
    toolPermissionContext,
    compoundCommandHasCd,
    astCommand?.redirects,`,
    `${relative}: per-command path cwd`,
  )
  next = replaceExactOnce(
    next,
    `  compoundCommandHasCd?: boolean,
  astParseSucceeded?: boolean,
): Promise<PermissionResult> {`,
    `  compoundCommandHasCd?: boolean,
  astCommand?: SimpleCommand,
  cwd = getCwd(),
): Promise<PermissionResult> {`,
    `${relative}: suggestion helper cwd parameters`,
  )
  next = replaceExactOnce(
    next,
    `    toolPermissionContext,
    compoundCommandHasCd,
  )
  // 2a. Deny/ask if command was explictly denied/asked`,
    `    toolPermissionContext,
    compoundCommandHasCd,
    astCommand,
    cwd,
  )
  // 2a. Deny/ask if command was explictly denied/asked`,
    `${relative}: suggestion helper cwd forwarding`,
  )
  next = replaceExactOnce(
    next,
    `    !astParseSucceeded &&
    !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_COMMAND_INJECTION_CHECK)`,
    `    !astCommand &&
    !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_COMMAND_INJECTION_CHECK)`,
    `${relative}: suggestion helper AST guard`,
  )
  next = replaceExactOnce(
    next,
    `    { isNormalizedCdCommand, isNormalizedGitCommand },
    astRoot,
  )`,
    `    { isNormalizedCdCommand, isNormalizedGitCommand },
    astRoot,
    subcommands => textualCdCommandsKeepCurrentDirectory(subcommands, getCwd()),
  )`,
    `${relative}: operator current-directory callback`,
  )
  next = replaceExactOnce(
    next,
    `  const compoundCommandHasCd = cdCommands.length > 0

  // SECURITY: Block compound commands that have both cd AND git`,
    `  const compoundCommandHasCd = cdCommands.length > 0
  let permissionCwd = cwd
  let pathCommandHasCd = compoundCommandHasCd
  let adjustedForLeadingCd = false

  // When an AST-vetted \`cd\` is the first command in a straight \`&&\` chain,
  // validate later paths relative to the directory Bash will actually use.
  if (
    compoundCommandHasCd &&
    subcommands.length > 1 &&
    subcommands.length === rawSubcommands.length &&
    isNormalizedCdCommand(subcommands[0]!) &&
    canUseLeadingCdAsWorkingDirectory(input.command)
  ) {
    const resolvedCwd = resolveLeadingCdWorkingDirectory(
      astCommandsByIdx[0],
      cwd,
      appState.toolPermissionContext,
    )
    if (resolvedCwd !== null) {
      permissionCwd = resolvedCwd
      pathCommandHasCd = false
      adjustedForLeadingCd = true
    }
  }

  // SECURITY: Block compound commands that have both cd AND git`,
    `${relative}: leading-cd state`,
  )
  next = replaceExactOnce(
    next,
    `    if (hasGitCommand) {
      const decisionReason = {`,
    `    if (
      hasGitCommand &&
      !(await astCdCommandsKeepCurrentDirectory(
        astCommandsByIdx,
        subcommands,
        cwd,
      ))
    ) {
      const decisionReason = {`,
    `${relative}: same-directory git guard`,
  )
  next = replaceExactOnce(
    next,
    `      appState.toolPermissionContext,
      compoundCommandHasCd,
      astCommandsByIdx[i],
    ),`,
    `      appState.toolPermissionContext,
      pathCommandHasCd,
      astCommandsByIdx[i],
      adjustedForLeadingCd && i === 0 ? cwd : permissionCwd,
    ),`,
    `${relative}: initial subcommand cwd propagation`,
  )
  next = replaceExactOnce(
    next,
    `  const pathResult = checkPathConstraints(
    input,
    getCwd(),
    appState.toolPermissionContext,
    compoundCommandHasCd,
    astRedirects,
    astCommands,
  )`,
    `  const pathResult = checkPathConstraints(
    input,
    permissionCwd,
    appState.toolPermissionContext,
    pathCommandHasCd,
    astRedirects,
    astCommandsByIdx
      .slice(adjustedForLeadingCd ? 1 : 0)
      .filter((command): command is SimpleCommand => command !== undefined),
  )`,
    `${relative}: full-command cwd propagation`,
  )
  next = replaceExactOnce(
    next,
    `      commandSubcommandPrefix,
      compoundCommandHasCd,
      astSubcommands !== null,
    )`,
    `      commandSubcommandPrefix,
      pathCommandHasCd,
      astCommandsByIdx[0],
      permissionCwd,
    )`,
    `${relative}: single-command cwd propagation`,
  )
  next = replaceExactOnce(
    next,
    `  for (const subcommand of subcommands) {
    subcommandResults.set(
      subcommand,`,
    `  for (let subcommandIndex = 0; subcommandIndex < subcommands.length; subcommandIndex++) {
    const subcommand = subcommands[subcommandIndex]!
    subcommandResults.set(
      subcommand,`,
    `${relative}: indexed subcommand loop`,
  )
  next = replaceExactOnce(
    next,
    `        commandSubcommandPrefix?.subcommandPrefixes.get(subcommand),
        compoundCommandHasCd,
        astSubcommands !== null,
      ),`,
    `        commandSubcommandPrefix?.subcommandPrefixes.get(subcommand),
        pathCommandHasCd,
        astCommandsByIdx[subcommandIndex],
        adjustedForLeadingCd && subcommandIndex === 0
          ? cwd
          : permissionCwd,
      ),`,
    `${relative}: compound-command cwd propagation`,
  )
  return next
}

function patchBashPermissions(ts, treeRoot, changes) {
  const state = destination(treeRoot, 'src/tools/BashTool/bashPermissions.ts')
  let next = replaceCdGitReason(state)
  next = upsertTemplateStatements(
    ts,
    { ...state, source: next },
    TARGET113_BASH_LEADING_CD,
    [
      'canUseLeadingCdAsWorkingDirectory',
      'isExplicitCdPath',
      'resolveLeadingCdWorkingDirectory',
      'parseSimpleCdPath',
      'normalizedRealpath',
      'cdPathResolvesToCwd',
      'astCdCommandsKeepCurrentDirectory',
      'textualCdCommandsKeepCurrentDirectory',
    ],
  )
  next = ensureImport(ts, state.filename, next, 'realpath', "import { realpath } from 'node:fs/promises'")
  next = ensureImport(ts, state.filename, next, 'isAbsolute', "import { isAbsolute, resolve } from 'node:path'")
  next = ensureImport(ts, state.filename, next, 'pathInAllowedWorkingPath', "import { pathInAllowedWorkingPath } from '../../utils/permissions/filesystem.js'")
  next = ensureImport(ts, state.filename, next, 'validatePath', "import { validatePath } from '../../utils/permissions/pathValidation.js'")
  next = patchTarget113BashCaller(next, state.relative)
  writeChanged(state, next, changes)
}

function patchAgentFileUtils(ts, treeRoot, changes) {
  const state = destination(treeRoot, 'src/components/agents/agentFileUtils.ts')
  let next = upsertTemplateStatements(
    ts,
    state,
    exactTemplate(state.relative),
    ['updateAgentFile'],
  )
  next = ensureImport(ts, state.filename, next, 'readFile', "import { readFile } from 'fs/promises'")
  next = ensureImport(ts, state.filename, next, 'parseFrontmatter', "import { parseFrontmatter } from '../../utils/frontmatterParser.js'")
  next = ensureImport(ts, state.filename, next, 'stringifyYaml', "import { stringifyYaml } from '../../utils/yaml.js'")
  writeChanged(state, next, changes)
}

function selectedFeatureModule(ts, relative, names) {
  const template = exactTemplate(relative)
  const parsed = parse(ts, `${relative}:template`, template)
  const imports = parsed.statements
    .filter(statement => ts.isImportDeclaration(statement))
    .map(statement => statement.getText(parsed))
  const declarations = names.map(name => {
    const statement = namedStatement(ts, parsed, name)
    assert.ok(statement, `${relative}: selected declaration ${name}`)
    return statement.getText(parsed)
  })
  return `${imports.join('\n')}\n\n${declarations.join('\n\n')}\n`
}

function patchDoctor(ts, treeRoot, changes) {
  const state = destination(treeRoot, 'src/screens/Doctor.tsx')
  const cumulativeTemplate = exactTemplate(state.relative)
  const target116SandboxGuard = `SandboxManager.isSandboxEnabledInSettings() &&
    SandboxManager.isPlatformInEnabledList()`
  assert.equal(
    cumulativeTemplate.split(target116SandboxGuard).length - 1,
    1,
    `${state.relative}: unique target116 sandbox-enabled-list evolution`,
  )
  const template = cumulativeTemplate.replace(
    target116SandboxGuard,
    'SandboxManager.isSandboxEnabledInSettings()',
  )
  let next = upsertTemplateStatements(ts, state, template, [
    'DistTagsResult',
    'DistTagsDisplay',
    'buildDoctorFixPrompt',
  ])
  next = ensureImport(ts, state.filename, next, 'Tree', "import { Tree } from '../components/design-system/Tree.js'")
  next = ensureImport(ts, state.filename, next, 'getCachedKeybindingWarnings', "import { getCachedKeybindingWarnings, getKeybindingsPath } from '../keybindings/loadUserBindings.js'")
  next = ensureImport(ts, state.filename, next, 'PluginError', "import type { PluginError } from '../types/plugin.js'")
  next = ensureImport(ts, state.filename, next, 'isEssentialTrafficOnly', "import { isEssentialTrafficOnly } from '../utils/privacyLevel.js'")
  next = ensureImport(ts, state.filename, next, 'SandboxManager', "import { SandboxManager } from '../utils/sandbox/sandbox-adapter.js'")
  next = ensureImport(ts, state.filename, next, 'ValidationError', "import type { ValidationError } from '../utils/settings/validation.js'")
  if (!next.includes('shouldQuery?: boolean')) {
    next = next.replace(
      'display?: CommandResultDisplay;',
      'display?: CommandResultDisplay;\n    shouldQuery?: boolean;',
    )
  }
  if (/^function _temp6\(diag\)/m.test(next)) {
    next = next.replace(
      /function _temp6\(diag\) \{[\s\S]*?\n\}\nfunction _temp5\(\)/,
      `async function _temp6(diag) {
  const isNative = diag.installationType === "native";
  const fetchDistTags = isNative ? getGcsDistTags : getNpmDistTags;
  return { tags: await fetchDistTags().catch(_temp5), isNative };
}
function _temp5()`,
    )
  }
  if (
    !next.includes('const fixPrompt = buildDoctorFixPrompt(') &&
    !next.includes('const doctorFixPrompt = useMemo(')
  ) {
    const anchor = '  const handleDismiss = t7;'
    assert.ok(next.includes(anchor), `${state.relative}: Doctor fix-prompt insertion anchor`)
    next = next.replace(
      anchor,
      `${anchor}
  const fixPrompt = buildDoctorFixPrompt(
    diagnostic,
    agentInfo,
    errorsExcludingMcp,
    pluginsErrors,
    contextWarnings,
    envValidationErrors,
  );
  useKeybindings({
    "doctor:fix": () => {
      if (fixPrompt) onDone(fixPrompt, { display: "user", shouldQuery: true });
    }
  }, { context: "Doctor", isActive: fixPrompt !== null });`,
    )
  }
  if (!next.includes('Checking for updates…')) {
    const anchor = '<Suspense fallback={null}>'
    assert.ok(next.includes(anchor), `${state.relative}: target113 update fallback anchor`)
    next = next.replace(
      anchor,
      '<Suspense fallback={<Tree.Node dimColor>Checking for updates…</Tree.Node>}>',
    )
  }
  const parsed = parse(ts, state.filename, next)
  const prompt = namedStatement(ts, parsed, 'buildDoctorFixPrompt')?.getText(parsed) ?? ''
  assert.ok(prompt.includes('SandboxManager.isSupportedPlatform()'))
  assert.ok(prompt.includes('SandboxManager.isSandboxEnabledInSettings()'))
  assert.ok(!prompt.includes('isPlatformInEnabledList'), 'Doctor prompt must remain exact target113')
  writeChanged(state, next, changes)
}

function patchRelaunch(ts, treeRoot, changes) {
  const state = destination(treeRoot, 'src/utils/relaunch.ts')
  let next = state.source
  if (!/\bargs\?: string\[\]/.test(next)) {
    const anchor = '  launcher?: RelaunchLauncher\n'
    assert.ok(next.includes(anchor), `${state.relative}: RelaunchOptions anchor`)
    next = next.replace(anchor, `${anchor}  args?: string[]\n`)
  }
  next = upsertTextStatement(ts, state.filename, next, 'relaunch', TARGET113_RELAUNCH)
  writeChanged(state, next, changes)
}

function validateTree(ts, treeRoot) {
  const evidence = {
    'src/services/teamMemorySync/index.ts': ['reapRemoteTombstones', 'await unlink'],
    'src/tools/BashTool/bashCommandHelpers.ts': [
      TARGET_REASON,
      'cdCommandsKeepCurrentDirectory',
      'compoundSubcommands',
    ],
    'src/tools/BashTool/bashPermissions.ts': [
      TARGET_REASON,
      'function resolveLeadingCdWorkingDirectory',
      'async function cdPathResolvesToCwd',
      'permissionCwd = resolvedCwd',
      'adjustedForLeadingCd && i === 0 ? cwd : permissionCwd',
    ],
    'src/components/design-system/Table.tsx': ['function Border', 'horizontalSegment', 'minimalSegment'],
    'src/components/SearchBox.tsx': ['renderSearchBoxQuery', 'Cursor.fromText', 'onCursorOffsetChange'],
    'src/components/Settings/UsageContributors.tsx': ['scanRecentUsageRecords', 'findTranscriptFiles', 'readUsageRecords', 'UsageContributorsResult', 'BehaviorRow'],
    'src/screens/Doctor.tsx': ['Tree.Group', 'function Doctor', 'buildDoctorFixPrompt', 'Suggested fix:', 'issues.join'],
    'src/components/LogoV2/AnimatedClawd.tsx': ['AnimatedClawdProps', 'sequence', 'onComplete'],
    'src/components/agents/agentFileUtils.ts': ['function updateAgentFile', 'readFile', 'stringifyYaml'],
    'src/utils/agenticSessionSearch.ts': ['createSessionSearchCanUseTool', 'session_search_out_of_scope', 'agenticSessionSearch'],
    'src/commands/ultraplan.tsx': ["source: 'slash'", 'sourcePromise'],
    'src/utils/relaunch.ts': ['args?: string[]', 'options.args', 'relaunchArgs'],
    'src/components/ExportDialog.tsx': ['normalizeExportPath', 'writeExportFile', 'await mkdir'],
    'src/commands/export/export.tsx': ['writeExportFile', 'await writeExportFile(filename, content)'],
    'src/commands/team-onboarding.ts': ['scanSessionUsage', 'readMcpServers', 'generateUsageData'],
  }
  const hashes = {}
  for (const [relative, fragments] of Object.entries(evidence)) {
    const filename = path.join(treeRoot, relative)
    assert.ok(fs.existsSync(filename), `${relative}: replay owner exists`)
    const source = fs.readFileSync(filename, 'utf8')
    parse(ts, filename, source)
    for (const fragment of fragments) assert.ok(source.includes(fragment), `${relative}: ${fragment}`)
    hashes[relative] = sha256(source)
  }
  return hashes
}

export function replayTarget113FirstHalfStrictTail(root, options = {}) {
  const treeRoot = normalizeTreeRoot(root)
  const ts = loadTypeScript()
  const changes = []

  for (const [relative, evidence] of Object.entries(MISSING_OWNER_FILES)) {
    installMissingOwner(treeRoot, relative, evidence, changes)
  }

  {
    const state = destination(treeRoot, 'src/services/teamMemorySync/index.ts')
    let next = upsertTemplateStatements(ts, state, exactTemplate(state.relative), ['reapRemoteTombstones'])
    if (!/import\s*\{[^}]*\bunlink\b[^}]*\}\s*from\s*['"]fs\/promises['"]/.test(next)) {
      const anchor = /import\s*\{([^}]*)\}\s*from\s*['"]fs\/promises['"]/
      assert.match(next, anchor, `${state.relative}: fs/promises import anchor`)
      next = next.replace(anchor, (_match, names) => `import {${names.trimEnd()}, unlink } from 'fs/promises'`)
    }
    writeChanged(state, next, changes)
  }

  patchBashCommandHelpers(ts, treeRoot, changes)
  patchBashPermissions(ts, treeRoot, changes)

  {
    const state = destination(treeRoot, 'src/components/SearchBox.tsx')
    let next = upsertTemplateStatements(ts, state, exactTemplate(state.relative), [
      'Highlight', 'Props', 'renderSearchBoxQuery', 'SearchBox',
    ])
    next = ensureImport(ts, state.filename, next, 'stringWidth', "import { stringWidth } from '../ink/stringWidth.js'")
    next = ensureImport(ts, state.filename, next, 'ClickEvent', "import type { ClickEvent } from '../ink.js'")
    next = ensureImport(ts, state.filename, next, 'Cursor', "import { Cursor } from '../utils/Cursor.js'")
    writeChanged(state, next, changes)
  }

  patchAgentFileUtils(ts, treeRoot, changes)

  patchDoctor(ts, treeRoot, changes)

  {
    const state = destination(treeRoot, 'src/components/LogoV2/AnimatedClawd.tsx')
    const next = upsertTemplateStatements(ts, state, exactTemplate(state.relative), [
      'AUTOPLAY', 'CELEBRATE', 'ANIMATION_SEQUENCES', 'AnimatedClawdProps',
      'AnimatedClawd', 'useClawdAnimation',
    ])
    writeChanged(state, next, changes)
  }

  {
    const relative = 'src/utils/agenticSessionSearch.ts'
    const state = destination(treeRoot, relative)
    const next = selectedFeatureModule(ts, relative, [
      'MAX_TURNS', 'MAX_SESSION_SUMMARIES', 'SESSION_SEARCH_TOOLS',
      'SESSION_SEARCH_SYSTEM_PROMPT', 'unique', 'formatRecentSessions',
      'createSessionSearchContext', 'createSessionSearchCanUseTool',
      'getLastAssistantText', 'agenticSessionSearch',
    ])
    writeChanged(state, next, changes)
  }

  {
    const state = destination(treeRoot, 'src/commands/ultraplan.tsx')
    let next = upsertTemplateStatements(ts, state, exactTemplate(state.relative), ['call'])
    next = ensureImport(ts, state.filename, next, 'isPolicyAllowed', "import { isPolicyAllowed } from '../services/policyLimits/index.js'")
    next = ensureImport(ts, state.filename, next, 'getRemoteSourceViability', "import { getRemoteSourceViability } from '../utils/background/remote/remoteSession.js'")
    next = ensureImport(ts, state.filename, next, 'getGlobalConfig', "import { getGlobalConfig } from '../utils/config.js'")
    next = ensureImport(ts, state.filename, next, 'replaceUltraplanKeyword', "import { replaceUltraplanKeyword } from '../utils/ultraplan/keyword.js'")
    writeChanged(state, next, changes)
  }

  patchRelaunch(ts, treeRoot, changes)

  {
    const state = destination(treeRoot, 'src/components/ExportDialog.tsx')
    let next = upsertTemplateStatements(ts, state, exactTemplate(state.relative), [
      'normalizeExportPath', 'writeExportFile', 'ExportDialog',
    ])
    next = ensureImport(ts, state.filename, next, 'mkdir', "import { mkdir } from 'fs/promises'")
    next = ensureImport(ts, state.filename, next, 'dirname', "import { dirname, extname } from 'path'")
    next = ensureImport(ts, state.filename, next, 'expandPath', "import { expandPath } from '../utils/path.js'")
    writeChanged(state, next, changes)
  }

  {
    const state = destination(treeRoot, 'src/commands/export/export.tsx')
    let next = upsertTemplateStatements(ts, state, exactTemplate(state.relative), ['call'])
    next = ensureImport(ts, state.filename, next, 'writeExportFile', "import { writeExportFile } from '../../components/ExportDialog.js'")
    writeChanged(state, next, changes)
  }

  const hashes = validateTree(ts, treeRoot)
  if (options.verifyIdempotence !== false) {
    const second = replayTarget113FirstHalfStrictTail(treeRoot, {
      verifyIdempotence: false,
    })
    assert.deepEqual(second.changes, [], 'target113 first-half replay is idempotent')
    assert.deepEqual(second.hashes, hashes, 'target113 first-half replay hashes are stable')
  }
  return { changes, hashes, treeRoot }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2]
  if (!root) throw new Error('usage: replay-target113-first-half-strict-tail.mjs <tree-or-src-root>')
  const result = replayTarget113FirstHalfStrictTail(root)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
