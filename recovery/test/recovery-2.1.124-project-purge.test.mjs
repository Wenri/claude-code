import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = [
  {
    version: '2.1.123',
    env: 'CLAUDE_CODE_2_1_123_BUNDLE',
    bytes: 13_949_576,
    sha256:
      '59c8eebc0660d4bbc5c1f82af0ca5e94df5db46084687b979ad21a07fba3d7dd',
  },
  {
    version: '2.1.124',
    env: 'CLAUDE_CODE_2_1_124_BUNDLE',
    bytes: 13_980_928,
    sha256:
      'dc2b68c385a3064737343e51e6d7c690f9e03cc40fa89c4393708ae03094d590',
  },
]

function readBundle(release) {
  const filename = process.env[release.env]
  assert.ok(filename, `${release.env} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(value).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return value.toString('utf8')
}

function occurrences(contents, fragment) {
  let count = 0
  let offset = 0
  while ((offset = contents.indexOf(fragment, offset)) !== -1) {
    count += 1
    offset += fragment.length
  }
  return count
}

function source(relative) {
  return fs
    .readFileSync(path.join(repo, relative), 'utf8')
    .split('\n//# sourceMappingURL=', 1)[0]
}

function compact(value) {
  return value.replaceAll(';', '').replaceAll(/\s+/g, ' ').trim()
}

function assertSourceFragments(relative, fragments) {
  const contents = compact(source(relative))
  for (const fragment of fragments) {
    assert.ok(
      contents.includes(compact(fragment)),
      `${relative}: missing ${compact(fragment)}`,
    )
  }
}

test('authenticates the target-only 2.1.124 project purge cluster', () => {
  const [baseline, target] = releases.map(readBundle)
  const targetOnlyFragments = [
    'w$(Ym4,{scanHistoryFile:()=>Ap6,purgeProjectHandler:()=>mb5})',
    'function Am4(H,$){for(let q of $)if(H===q||H.startsWith(q+wT.sep))return!0;return!1}',
    'async function Ap6(H,$,q){let K=gX8.createInterface({input:_p6.createReadStream(H,{encoding:"utf8"}),crlfDelay:1/0}),_=[],A=0;try{for await(let z of K)if(Rb5(z,$))A++;else if(q==="filter")_.push(z)}catch(z){if(z8(z))return 0;throw z}',
    'async function xb5(H){let $=B8(),q=wT.resolve(H),K=await UJ(q),_=new Set([q,K]),A=[];try{await G4H.stat(q);for(let W of _){let Z=ef(W);if(Z)A.push(Z)}}catch{}let z=[],Y=[],f=new Set;for(let W of _)for(let Z of await t2(W))f.add(Z)',
    'let j=(W)=>cn(W).replace(/\\/+$/,"")||"/",X=h$(),J=new Set([..._,...A].map(j));for(let W of Object.keys(X.projects??{}))if(J.has(j(W)))z.push({path:W,kind:"config-key",reason:"project entry in ~/.claude.json (trust, history, MCP servers)"})',
    'async function ub5(){let H=B8(),$=[],q=[],K=[["projects","all project transcripts (.jsonl) and memory/"],["tasks","all session task lists"],["debug","all session debug logs"],["file-history","all session file edit history"]]',
    'async function Kp6(H){switch(H.kind){case"config-key":Ta8(H.path);return;case"history-lines":await Ap6(H.path,H.matchPaths??new Set,"filter");return;case"file":case"dir":await G4H.rm(H.path,{recursive:H.kind==="dir",force:!0});return}}',
    'async function mb5(H,$){if($.all){if(H)Iq("Cannot specify both a path and --all.");if($.interactive)Iq("Cannot use -i/--interactive with --all.")',
    '.command("project").description("Manage Claude Code project state").configureHelp(H()).command("purge [path]").description("Delete all Claude Code state for a project (transcripts, tasks, file history, config entry)").option("--dry-run","List what would be deleted without deleting anything").option("-y, --yes","Skip confirmation prompt").option("-i, --interactive","Prompt for each item before deleting").option("--all","Purge state for every project (mutually exclusive with [path])")',
    'deleteProjectConfig fallback: re-read config is missing auth that cache has; refusing to write. See GH #3117.',
  ]

  for (const fragment of targetOnlyFragments) {
    assert.equal(occurrences(baseline, fragment), 0, `baseline: ${fragment}`)
    assert.equal(occurrences(target, fragment), 1, `target: ${fragment}`)
  }

  for (const literal of [
    'Select a project to purge:',
    'Purge plan for ',
    'shell-snapshots/ are not project-scoped and will not be touched',
    'Cannot specify both a path and --all.',
    'Cannot use -i/--interactive with --all.',
    'Delete this and all remaining',
  ]) {
    assert.equal(occurrences(baseline, literal), 0, `baseline: ${literal}`)
    assert.ok(occurrences(target, literal) >= 1, `target: ${literal}`)
  }
})

test('source recovers project discovery, plans, filtering, and deletion', () => {
  assertSourceFragments('src/cli/handlers/project.tsx', [
    "export async function scanHistoryFile( historyPath: string, matchPaths: Set<string>, mode: HistoryScanMode, ): Promise<number>",
    "if (historyLineMatches(line, matchPaths)) { matchCount++ } else if (mode === 'filter') { remainingLines.push(line) }",
    "if (isENOENT(error)) return 0 throw error",
    "if (mode === 'filter' && matchCount > 0) { await atomicWriteFile( historyPath, remainingLines.length ? `${remainingLines.join('\\n')}\\n` : '', ) }",
    'candidate === matchPath || candidate.startsWith(matchPath + path.sep)',
    'if (++lineCount > 50) break',
    "if (typeof entry.cwd === 'string') { return pathMatches(entry.cwd, matchPaths) }",
    'const resolvedPath = path.resolve(projectPath) const canonicalPath = await canonicalizePath(resolvedPath) const matchPaths = new Set([resolvedPath, canonicalPath])',
    'const gitRoot = findCanonicalGitRoot(matchPath) if (gitRoot) canonicalGitRoots.push(gitRoot)',
    'for (const projectDirectory of await findProjectDirs(matchPath)) { projectDirectories.add(projectDirectory) }',
    "const projectPrefixes = [...matchPaths].map( matchPath => sanitizePath(matchPath) + '-', )",
    "reason: `tasks for session ${sessionId}`",
    "reason: `debug log for session ${sessionId}`",
    "reason: `file edit history for session ${sessionId}`",
    "reason: 'project transcripts (.jsonl) and memory/'",
    "normalizePathForConfigKey(candidate).replace(/\\/+$/, '') || '/'",
    "const promptCount = await scanHistoryFile(historyPath, matchPaths, 'count')",
    "reason: 'project entry in ~/.claude.json (trust, history, MCP servers)'",
    "['projects', 'all project transcripts (.jsonl) and memory/']",
    "['tasks', 'all session task lists']",
    "['debug', 'all session debug logs']",
    "['file-history', 'all session file edit history']",
    "case 'config-key': deleteProjectConfig(item.path) return case 'history-lines': await scanHistoryFile( item.path, item.matchPaths ?? new Set<string>(), 'filter', )",
    "await fsPromises.rm(item.path, { recursive: item.kind === 'dir', force: true, })",
    "if (options.all) { if (projectPath) cliError('Cannot specify both a path and --all.') if (options.interactive) { cliError('Cannot use -i/--interactive with --all.') }",
    "if (options.dryRun) { cliOk(`Dry run: ${items.length} item(s) would be deleted.`) }",
    "{ label: 'Delete this and all remaining', value: 'all', }",
    "if (action === 'all') deleteAllRemaining = true",
  ])
})

test('source recovers the lock-safe config deletion and shared directory lookup', () => {
  assertSourceFragments('src/utils/config.ts', [
    'export function deleteProjectConfig(projectPath: string): void { let written: GlobalConfig | null = null try { const didWrite = saveConfigWithLock( getGlobalClaudeFile(), createDefaultGlobalConfig, current => { if (!current.projects?.[projectPath]) { return current } const { [projectPath]: _, ...remainingProjects } = current.projects written = migrateConfigFields({ ...current, projects: remainingProjects, }) return written }, ) if (didWrite && written) { writeThroughGlobalConfigCache(written) }',
    'const config = getConfig(getGlobalClaudeFile(), createDefaultGlobalConfig) if (wouldLoseAuthState(config))',
    'deleteProjectConfig fallback: re-read config is missing auth that cache has; refusing to write. See GH #3117.',
    'saveConfig(getGlobalClaudeFile(), written, DEFAULT_GLOBAL_CONFIG) writeThroughGlobalConfigCache(written)',
  ])

  assertSourceFragments('src/utils/sessionStoragePortable.ts', [
    'export async function findProjectDirs(projectPath: string): Promise<string[]>',
    'await readdir(exact) projectDirs.push(exact)',
    "const prefix = sanitized.slice(0, MAX_SANITIZED_LENGTH) + '-'",
    'if (candidate !== exact) { projectDirs.push(candidate) }',
    'return (await findProjectDirs(projectPath))[0]',
  ])

  assertSourceFragments('src/cli/exit.ts', [
    'if (msg) console.error(chalk.red(msg))',
    'export function cliWarn(msg: string): void { process.stderr.write(chalk.yellow(msg) + \'\\n\') }',
  ])
})

test('main registers the exact project purge CLI surface lazily', () => {
  assertSourceFragments('src/main.tsx', [
    "program.command('project').description('Manage Claude Code project state').configureHelp(createSortedHelpConfig()).command('purge [path]').description('Delete all Claude Code state for a project (transcripts, tasks, file history, config entry)').option('--dry-run', 'List what would be deleted without deleting anything').option('-y, --yes', 'Skip confirmation prompt').option('-i, --interactive', 'Prompt for each item before deleting').option('--all', 'Purge state for every project (mutually exclusive with [path])')",
    "const { purgeProjectHandler } = await import('./cli/handlers/project.js') await purgeProjectHandler(projectPath, options)",
  ])
})
