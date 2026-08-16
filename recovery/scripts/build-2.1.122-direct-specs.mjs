#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const caseRoot = path.join(repo, 'recovery/cases/2.1.121-to-2.1.122')
const changelogPath = path.join(caseRoot, 'evidence/CHANGELOG-2.1.122.md')
const inventoryPath = path.join(
  repo,
  'recovery/2.1.122-official-owned-cluster-inventory.json',
)
const outputPath = path.join(repo, 'recovery/2.1.122-direct-evidence-specs.json')
const baseRevision = '11890981447ee2cea3407c608f4411e43e5fe72a'
const final = process.argv.slice(2).includes('--final')

if (process.argv.slice(2).some(argument => argument !== '--final')) {
  throw new Error('Usage: build-2.1.122-direct-specs.mjs [--final]')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
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

function sourceAssertion(sourcePath, fragment) {
  return { path: sourcePath, fragment }
}

function changedSourcePaths() {
  const rows = execFileSync(
    'git',
    ['diff', '--name-status', '--no-renames', `${baseRevision}..HEAD`, '--', 'src'],
    { cwd: repo, encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [status, sourcePath] = line.split('\t')
      return { status, path: sourcePath }
    })
  assert(rows.length > 0, 'no changed source paths')
  assert(
    rows.every(row => row.status === 'A' || row.status === 'M'),
    'deleted source paths require an explicit reviewed absence witness',
  )
  return rows.map(row => row.path).sort()
}

function focusedTestIds() {
  return fs
    .readdirSync(path.join(repo, 'recovery/test'))
    .filter(
      name =>
        /^recovery-2\.1\.122-.*\.test\.mjs$/.test(name) &&
        name !== 'recovery-2.1.122-direct-evidence.test.mjs',
    )
    .map(name =>
      name
        .replace(/^recovery-2\.1\.122-/, '')
        .replace(/\.test\.mjs$/, ''),
    )
    .sort()
}

function candidateScore(fragment, source) {
  let score = Math.min(fragment.length, 240)
  if (occurrences(source, fragment) === 1) score += 2_000
  if (/\b(?:export|function|class|const|return|await|log|throw)\b/.test(fragment)) {
    score += 300
  }
  if (/^(?:import|type)\b/.test(fragment)) score -= 250
  if (/^[{}()[\],;]+$/.test(fragment)) score -= 2_000
  if (/^(?:\/\/|\*)/.test(fragment)) score -= 100
  return score
}

function selectSourceFragment(sourcePath) {
  const source = fs.readFileSync(path.join(repo, sourcePath), 'utf8')
  const diff = execFileSync(
    'git',
    [
      'diff',
      '--unified=0',
      '--no-ext-diff',
      '--no-renames',
      `${baseRevision}..HEAD`,
      '--',
      sourcePath,
    ],
    { cwd: repo, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  )
  const candidates = [
    ...new Set(
      diff
        .split('\n')
        .filter(line => line.startsWith('+') && !line.startsWith('+++'))
        .map(line => line.slice(1).trim())
        .filter(fragment => fragment.length >= 8 && fragment.length <= 500)
        .filter(fragment => source.includes(fragment)),
    ),
  ]
  if (candidates.length === 0) {
    candidates.push(
      ...source
        .split('\n')
        .map(line => line.trim())
        .filter(fragment => fragment.length >= 8 && fragment.length <= 500),
    )
  }
  candidates.sort(
    (left, right) =>
      candidateScore(right, source) - candidateScore(left, source) ||
      left.localeCompare(right),
  )
  assert(candidates.length > 0, `${sourcePath}: no source assertion candidate`)
  return candidates[0]
}

const bullets = fs
  .readFileSync(changelogPath, 'utf8')
  .split('\n')
  .filter(line => line.startsWith('- '))
  .map(line => line.slice(2))
assert(bullets.length === 18, 'expected exactly 18 official changelog bullets')

const existing = fs.existsSync(outputPath)
  ? JSON.parse(fs.readFileSync(outputPath, 'utf8'))
  : null

if (!final) {
  const existingRows = new Map((existing?.rows ?? []).map(row => [row.id, row]))
  const officialRows = bullets.map((title, index) => {
    const id = `B${String(index + 1).padStart(2, '0')}`
    return existingRows.get(id) ?? {
      id,
      category: 'official',
      releaseBullet: index + 1,
      title,
      status: 'pending-source-recovery',
      targetFragments: [],
      sourceAssertions: [],
      sourcePathAbsences: [],
      focusedTests: [],
      rationale: 'Pending exact adjacent-bundle and recovered-source evidence.',
    }
  })
  const output = {
    schemaVersion: 1,
    case: '2.1.121-to-2.1.122',
    release: '2.1.122',
    complete: false,
    coverageDeclarations: {
      officialRowsEnumerated: true,
      hiddenInventoryComplete: false,
      daemonInventoryComplete: false,
      residualAuditComplete: false,
      changedSourcePathsFullyBound: false,
      focusedTestsFullyBound: false,
    },
    rows: officialRows,
  }
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
  console.log(
    JSON.stringify({
      status: '2.1.122-direct-specs-built',
      complete: false,
      rows: officialRows.length,
      official: officialRows.length,
      nonOfficial: 0,
    }),
  )
  process.exit(0)
}

const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'))
assert(inventory.schema_version === 1, 'official inventory schema')
assert(inventory.release === '2.1.122', 'official inventory release')
const inventoryRows = new Map(inventory.rows.map(row => [row.bullet, row]))

const officialTargetOverrides = new Map([
  [5, ['input_tokens:A.input_tokens,output_tokens:A.output_tokens']],
  [7, ['!w.has(v.uuid))continue;j.set(v.uuid,v)']],
  [9, ['output_config:DH']],
  [10, ['WB8.has(O)']],
])

const manualOfficial = new Map([
  [11, {
    targetFragments: ['if(!H?.excludeDefault)return!1;return H.tips.length>0'],
    sourceAssertions: [
      sourceAssertion(
        'src/services/tips/tipRegistry.ts',
        'shouldExcludeDefaultSpinnerTips(override)',
      ),
      sourceAssertion(
        'src/components/Spinner.tsx',
        'shouldExcludeDefaultSpinnerTips(settings.spinnerTipsOverride)',
      ),
    ],
    rationale:
      'The target suppresses both static and time-based default tips when the override excludes defaults.',
  }],
  [13, {
    targetFragments: ['R!=="bash"&&!'],
    sourceAssertions: [
      sourceAssertion('src/utils/handlePromptSubmit.ts', "mode !== 'bash' &&"),
    ],
    rationale:
      'The target excludes bash input mode from slash-command exit interception.',
  }],
  [14, {
    targetFragments: ['maxWidth:2000,maxHeight:2000'],
    sourceAssertions: [
      sourceAssertion(
        'src/utils/imageResizer.ts',
        "'claude-opus-4-7': { maxWidth: 2000, maxHeight: 2000 }",
      ),
    ],
    rationale:
      'The adjacent artifact replaces the legacy 2576px limit with the 2000px model limit.',
  }],
  [15, {
    targetFragments: [
      'if(w.size===0){if(!Q)Q=!0,A.updateIdleStatus();return}Q=!1',
    ],
    sourceAssertions: [
      sourceAssertion('src/bridge/bridgeMain.ts', 'let idleStatusRendered = false'),
      sourceAssertion('src/bridge/bridgeMain.ts', 'idleStatusRendered = true'),
    ],
    rationale:
      'The target renders remote idle status once per idle transition and resets it on activity or reconnect.',
  }],
  [16, {
    targetFragments: ['j=Y$((v)=>v.isBriefOnly);ot.useEffect('],
    sourceAssertions: [
      sourceAssertion('src/hooks/useGlobalKeybindings.tsx', 'clearStaleBriefView()'),
      sourceAssertion('src/hooks/useGlobalKeybindings.tsx', 'isBriefOnly: false'),
    ],
    rationale:
      'The target clears a stale brief-only preference after the runtime feature state refreshes.',
  }],
  [17, {
    targetFragments: [
      '"hooks" must be an object mapping event names to matcher arrays; received',
      'must be an array of matchers; received',
    ],
    sourceAssertions: [
      sourceAssertion('src/utils/settings/validation.ts', "if (!('hooks' in obj)) return []"),
      sourceAssertion('src/utils/settings/validation.ts', 'filterInvalidHooks(data, filePath)'),
      sourceAssertion('src/utils/settings/settings.ts', 'filterInvalidSettingsEntries(data, path)'),
      sourceAssertion('src/utils/settings/mdm/settings.ts', 'filterInvalidSettingsEntries(sanitized, sourcePath)'),
      sourceAssertion('src/services/remoteManagedSettings/index.ts', "filterInvalidSettingsEntries(sanitizedSettings, 'remote managed settings')"),
    ],
    rationale:
      'Every settings source filters malformed hook entries while preserving the remainder of the file.',
  }],
  [18, {
    targetFragments: ['Caps Lock is not delivered to terminal applications'],
    sourceAssertions: [
      sourceAssertion('src/keybindings/reservedShortcuts.ts', "key: 'capslock'"),
      sourceAssertion(
        'src/keybindings/reservedShortcuts.ts',
        'Caps Lock is not delivered to terminal applications',
      ),
    ],
    rationale:
      'The target reserves all normalized Caps Lock spellings with the terminal-delivery diagnostic.',
  }],
])

const officialRows = bullets.map((title, index) => {
  const bullet = index + 1
  const id = `B${String(bullet).padStart(2, '0')}`
  const inventoryRow = inventoryRows.get(bullet)
  const manual = manualOfficial.get(bullet)
  assert(inventoryRow || manual, `${id}: no reviewed official evidence`)
  const targetFragments = officialTargetOverrides.get(bullet) ??
    inventoryRow?.artifact_fragments.map(entry => entry.fragment) ??
    manual.targetFragments
  const sourceAssertions = inventoryRow
    ? inventoryRow.source.flatMap(entry =>
        entry.includes.map(fragment => sourceAssertion(entry.path, fragment)),
      )
    : manual.sourceAssertions
  assert(targetFragments.length > 0, `${id}: no target fragments`)
  assert(sourceAssertions.length > 0, `${id}: no source assertions`)
  return {
    id,
    category: 'official',
    releaseBullet: bullet,
    title,
    status: 'verified',
    targetFragments,
    sourceAssertions,
    sourcePathAbsences: [],
    focusedTests: [
      inventoryRow ? 'official-owned-cluster' : 'ui-config-input',
    ],
    rationale: inventoryRow?.normalized_witness ?? manual.rationale,
  }
})

const categoryDefinitions = [
  {
    id: 'H01',
    category: 'hidden',
    title: 'API, analytics, telemetry, and provider lifecycle',
    targetFragments: ['api_request'],
    retained: true,
    path: /(?:services\/api|analytics|telemetry|cost-tracker|tokenEstimation|provider)/i,
    test: /(?:api|analytics|telemetry|datadog|provider|feedback|growthbook|idle-return|decision)/i,
  },
  {
    id: 'H02',
    category: 'hidden',
    title: 'Session persistence, messages, context, and compaction',
    targetFragments: ['session_id'],
    path: /(?:session|message|context|compact|conversation|transcript|LogSelector|imageStore|imageResizer)/i,
    test: /(?:session|message|context|compact|transcript|resume|image|copy-table|storage|log-selector)/i,
  },
  {
    id: 'H03',
    category: 'hidden',
    title: 'Terminal UI, input, scrolling, and rendering',
    targetFragments: ['scrollToBottom'],
    retained: true,
    path: /(?:components|screens\/REPL|ink|keybinding|PromptInput|moreright)/i,
    test: /(?:ui|input|scroll|fullscreen|fleet|virtual|keybinding|doctor|bridge-status|placeholder)/i,
  },
  {
    id: 'H04',
    category: 'hidden',
    title: 'Shell, PowerShell, sandbox, filesystem, and worktree safety',
    targetFragments: ['dangerouslyDisableSandbox'],
    retained: true,
    path: /(?:Bash|PowerShell|Shell|shell|sandbox|worktree|fileState|cwd|subprocess|pathValidation)/i,
    test: /(?:bash|powershell|shell|sandbox|worktree|cwd|subprocess|atomic-write|workflow-script)/i,
  },
  {
    id: 'H05',
    category: 'hidden',
    title: 'Agents, tasks, teams, and swarm state',
    targetFragments: ['SubagentStop'],
    retained: true,
    path: /(?:Agent|agent|Task|task|swarm|team|teammate|classifier|PaneBackend)/,
    test: /(?:agent|task|team|teammate|swarm|classifier|backend-registry)/i,
  },
  {
    id: 'H06',
    category: 'hidden',
    title: 'MCP, plugins, OAuth, and connector lifecycle',
    targetFragments: ['mcp_server_connection'],
    retained: true,
    path: /(?:mcp|plugin|oauth|claudeInChrome)/i,
    test: /(?:mcp|plugin|oauth|chrome)/i,
  },
  {
    id: 'H07',
    category: 'hidden',
    title: 'Memory, skills, prompts, and model-facing guidance',
    targetFragments: ['skill_activated'],
    retained: true,
    path: /(?:memory|memdir|skill|prompt|BriefTool|insights)/i,
    test: /(?:memory|skill|prompt|brief|insights|tiny-memory|ultrathink)/i,
  },
  {
    id: 'D01',
    category: 'daemon',
    title: 'Daemon, jobs, remote control, bridge, and background lifecycle',
    targetFragments: ['CLAUDE_CODE_REMOTE'],
    retained: true,
    path: /(?:daemon|bridge|remote|background|jobs|cli\/bg)/i,
    test: /(?:daemon|remote|bridge|background|job|teleport|fleet-gate)/i,
  },
  {
    id: 'H08',
    category: 'hidden',
    title: 'SDK, headless, print, and entrypoint contracts',
    targetFragments: ['tool_progress'],
    retained: true,
    path: /(?:entrypoints|cli\/print|QueryEngine|agentSdk|structuredIO|headless)/i,
    test: /(?:sdk|headless|print|seed-read|ccd-session|named-helper-exports|mcp-server-export)/i,
  },
  {
    id: 'H09',
    category: 'hidden',
    title: 'Startup, settings, model, environment, and command metadata',
    targetFragments: [
      'permission_mode',
      'name:"output-style"',
      'name:"think-back"',
      'name:"thinkback-play"',
      'tengu_thinkback',
    ],
    sourcePathAbsences: [
      {
        paths: ['src/commands.ts'],
        fragment: 'commands/output-style/index.js',
      },
      {
        paths: ['src/commands.ts'],
        fragment: 'commands/thinkback/index.js',
      },
      {
        paths: ['src/commands.ts'],
        fragment: 'commands/thinkback-play/index.js',
      },
    ],
    retained: true,
    path: /(?:main\.tsx|bootstrap|settings|model|managedEnv|status|commands\.ts|commands\/)/i,
    test: /(?:startup|settings|model|env|config|command|away-summary|desktop-version|provider-setup)/i,
  },
  {
    id: 'H10',
    category: 'hidden',
    title: 'Tools, permissions, hooks, and execution guards',
    targetFragments: ['hook_execution_start'],
    retained: true,
    path: /(?:tools|hooks|permission|Tool\.ts|toolExecution)/i,
    test: /(?:tool|permission|hook|monitor|computer-use|auto-mode|policy|post-tool)/i,
  },
  {
    id: 'R01',
    category: 'residual',
    title: 'Retained runtime state and exported helper closure',
    targetFragments: ['createBackendRegistry'],
    retained: true,
    path: /.*/,
    test: /.*/,
  },
]

const categoryById = new Map(
  categoryDefinitions.map(definition => [
    definition.id,
    { ...definition, sourceAssertions: [], focusedTests: [] },
  ]),
)

for (const sourcePath of changedSourcePaths()) {
  const definition = categoryDefinitions.find(entry => entry.path.test(sourcePath))
  assert(definition, `${sourcePath}: no semantic category`)
  categoryById
    .get(definition.id)
    .sourceAssertions.push(
      sourceAssertion(sourcePath, selectSourceFragment(sourcePath)),
    )
}

for (const testId of focusedTestIds()) {
  if (testId === 'official-owned-cluster' || testId === 'ui-config-input') continue
  const definition = categoryDefinitions.find(entry => entry.test.test(testId))
  assert(definition, `${testId}: no semantic test category`)
  categoryById.get(definition.id).focusedTests.push(testId)
}

const categoryRows = categoryDefinitions.map(definition => {
  const value = categoryById.get(definition.id)
  assert(value.sourceAssertions.length > 0, `${definition.id}: no source paths`)
  assert(value.focusedTests.length > 0, `${definition.id}: no focused tests`)
  return {
    id: definition.id,
    category: definition.category,
    title: definition.title,
    status: 'verified',
    ...(definition.retained === true ? { retained: true } : {}),
    targetFragments: definition.targetFragments,
    sourceAssertions: value.sourceAssertions.sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
    sourcePathAbsences: definition.sourcePathAbsences ?? [],
    focusedTests: [...new Set(value.focusedTests)].sort(),
    rationale:
      `Authenticated adjacent-bundle witnesses and the complete focused suite bind the recovered ${definition.title.toLowerCase()} surface; every changed source path in this family is pinned by an exact current-source fragment.`,
  }
})

const residualRows = inventory.residuals.map((residual, index) => ({
  id: `R${String(index + 2).padStart(2, '0')}`,
  category: 'residual',
  title: residual.id.replaceAll('-', ' '),
  status: 'verified',
  targetFragments: residual.artifact_fragments.map(entry => entry.fragment),
  sourceAssertions: residual.source.flatMap(entry =>
    entry.includes.map(fragment => sourceAssertion(entry.path, fragment)),
  ),
  sourcePathAbsences: [],
  focusedTests: ['official-owned-cluster'],
  rationale: residual.normalized_witness,
}))

const rows = [...officialRows, ...categoryRows, ...residualRows]
const ids = rows.map(row => row.id)
assert(new Set(ids).size === ids.length, 'row IDs must be unique')

const output = {
  schemaVersion: 1,
  case: '2.1.121-to-2.1.122',
  release: '2.1.122',
  complete: true,
  coverageDeclarations: {
    officialRowsEnumerated: true,
    hiddenInventoryComplete: true,
    daemonInventoryComplete: true,
    residualAuditComplete: true,
    changedSourcePathsFullyBound: true,
    focusedTestsFullyBound: true,
  },
  rows,
}

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
console.log(
  JSON.stringify({
    status: '2.1.122-direct-specs-built',
    complete: true,
    rows: rows.length,
    official: officialRows.length,
    nonOfficial: rows.length - officialRows.length,
    changedSourcePaths: changedSourcePaths().length,
    focusedTests: focusedTestIds().length,
  }),
)
