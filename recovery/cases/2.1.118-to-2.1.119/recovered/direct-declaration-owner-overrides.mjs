const CASE_NAME = '2.1.118-to-2.1.119'
const TARGET_FRAGMENT_EVIDENCE =
  'target119-direct-declaration-owner-target-fragment'
const SOURCE_AST_EVIDENCE =
  'target119-direct-declaration-owner-source-ast-test'

function override(targetIndex, ownerPath, declarationName, behavior) {
  return Object.freeze({
    key: `${CASE_NAME}:${targetIndex}`,
    targetIndex,
    paths: Object.freeze([ownerPath]),
    evidenceIds: Object.freeze([
      TARGET_FRAGMENT_EVIDENCE,
      SOURCE_AST_EVIDENCE,
    ]),
    declarationName,
    behavior,
  })
}

export const TARGET119_DIRECT_DECLARATION_OWNER_OVERRIDES = Object.freeze([
  override(
    20776,
    'src/cli/bg.ts',
    'openAgentsFromForeground',
    'The complete authenticated Target119 unit is the authored openAgentsFromForeground declaration: its background-session persistence guard, worktree seed, left-arrow spawn, in-process fleet mount, and relaunch fallback uniquely bind src/cli/bg.ts; the generated rm property is the named fs/promises import call lowering.',
  ),
  override(
    20874,
    'src/hooks/useAwaySummary.ts',
    'useAwaySummary',
    'The complete authenticated Target119 unit is the authored useAwaySummary declaration: its cache-age gate, recap generation, terminal-focus timers, return telemetry, and background recap trigger uniquely bind src/hooks/useAwaySummary.ts; the generated join property is the named path import call lowering.',
  ),
  override(
    20880,
    'src/hooks/useJobStateNameSync.ts',
    'useJobStateNameSync',
    'The complete authenticated Target119 unit is the authored useJobStateNameSync declaration: its job-state watcher, state.json filter, synchronization, unref, close, and handler lifecycle uniquely bind src/hooks/useJobStateNameSync.ts; the generated watch property is the named fs import call lowering.',
  ),
])

export const TARGET119_DIRECT_DECLARATION_IMPORT_LOWERINGS = Object.freeze({
  20776: Object.freeze({ importedName: 'rm', module: 'fs/promises' }),
  20874: Object.freeze({ importedName: 'join', module: 'path' }),
  20880: Object.freeze({ importedName: 'watch', module: 'fs' }),
})
