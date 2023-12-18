const CASE_NAME = '2.1.116-to-2.1.117'

const TARGET_FRAGMENT_EVIDENCE =
  'target117-tail-extracted-owner-target-fragment'
const DECLARATION_CLOSURE_EVIDENCE =
  'target117-tail-extracted-owner-declaration-closure-test'

function freezeOverride(targetIndex, path, declarations, behavior) {
  return Object.freeze({
    key: `${CASE_NAME}:${targetIndex}`,
    targetIndex,
    paths: Object.freeze([path]),
    declarations: Object.freeze([...declarations]),
    evidenceIds: Object.freeze([
      TARGET_FRAGMENT_EVIDENCE,
      DECLARATION_CLOSURE_EVIDENCE,
    ]),
    behavior,
  })
}

// These owners are absent from the raw Target117 source snapshot but are restored
// by the already-authenticated Target117 generated/historical source-gap replays.
// Keep the list case-owned: the shared coverage generator must opt in explicitly.
export const TARGET117_TAIL_EXTRACTED_OWNER_OVERRIDES = Object.freeze([
  freezeOverride(
    12585,
    'src/utils/teamArtifacts.ts',
    ['getUnseenTeamArtifacts'],
    'The recovered unseen-artifact selector owns the target unit that filters artifacts against seenTeamArtifactPaths.',
  ),
  freezeOverride(
    12586,
    'src/utils/teamArtifacts.ts',
    ['markTeamArtifactsSeen'],
    'The recovered seen-artifact updater owns both target occurrences of seenTeamArtifactPaths and preserves the bounded rolling-path update.',
  ),
  freezeOverride(
    12587,
    'src/utils/teamArtifacts.ts',
    ['logTeamArtifactTipShown'],
    'The recovered team-artifact telemetry declaration owns the event and overflow-count target residues.',
  ),
  freezeOverride(
    12588,
    'src/utils/teamArtifacts.ts',
    ['getTeamArtifactAnalyticsMetadata'],
    'The recovered analytics-metadata declaration owns the target via_team_tip lookup over seenTeamArtifactPaths.',
  ),
  freezeOverride(
    12589,
    'src/utils/teamArtifacts.ts',
    ['formatTeamArtifactTip'],
    'The recovered formatter owns the complete target team-tip message construction, including author and overflow branches.',
  ),
  freezeOverride(
    12591,
    'src/utils/teamArtifacts.ts',
    ['TEAM_ARTIFACT_DIRECTORIES', 'getTeamArtifacts'],
    'The recovered directory constant and memoized git scanner jointly own the complete target initialization unit and its seven command/path residues.',
  ),
  freezeOverride(
    17727,
    'src/commands/fork/fork.ts',
    ['getForkName'],
    'The recovered fork-name declaration owns the target normalization pipeline and its exact non-name-character regular expression.',
  ),
  freezeOverride(
    17736,
    'src/commands/fork/index.ts',
    ['fork'],
    'The recovered fork command descriptor owns the target description and directive argument hint.',
  ),
  freezeOverride(
    18282,
    'src/services/compact/contextHint.ts',
    ['persistHintToolResult'],
    'The recovered context-hint persistence declaration owns the target persisted-result filepath message unit.',
  ),
  freezeOverride(
    18283,
    'src/services/compact/contextHint.ts',
    ['applyHintEdits'],
    'The recovered context-hint edit declaration owns the target persistence callback and compacted cleared-content/token accounting unit.',
  ),
  freezeOverride(
    18284,
    'src/services/compact/contextHint.ts',
    ['handleHintReject'],
    'The recovered context-hint rejection declaration owns the target telemetry and cleared-content projection unit.',
  ),
  freezeOverride(
    18285,
    'src/services/compact/contextHint.ts',
    ['createContextHintController'],
    'The recovered context-hint controller owns the target fallback closure that returns the rejection result and its cleared-content/token contract.',
  ),
])
