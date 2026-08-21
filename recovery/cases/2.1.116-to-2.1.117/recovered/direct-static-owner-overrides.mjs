const CASE_NAME = '2.1.116-to-2.1.117'
const TARGET_FRAGMENT_EVIDENCE = 'target117-direct-static-owner-target-fragment'
const SOURCE_DECLARATION_EVIDENCE =
  'target117-direct-static-owner-source-declaration-test'

function freezeOverride(targetIndex, sourcePath, declarations, behavior) {
  return Object.freeze({
    key: `${CASE_NAME}:${targetIndex}`,
    targetIndex,
    paths: Object.freeze([sourcePath]),
    declarations: Object.freeze([...declarations]),
    evidenceIds: Object.freeze([
      TARGET_FRAGMENT_EVIDENCE,
      SOURCE_DECLARATION_EVIDENCE,
    ]),
    behavior,
  })
}

export const TARGET117_DIRECT_STATIC_OWNER_OVERRIDES = Object.freeze([
  freezeOverride(
    6067,
    'src/utils/context.ts',
    ['getSonnetContextWindowExperiment'],
    'The Target117 context-window experiment declaration owns the authenticated kelp_forest_sonnet lookup; source element-access string syntax and bundled dot-property syntax are proved as one AST operation.',
  ),
  freezeOverride(
    8735,
    'src/tools/AgentTool/forkSubagent.ts',
    ['resolveForkSubagentSource', 'getForkSubagentSource'],
    'The fork gate declaration closure owns the authenticated environment and telemetry constants; this bounded constant-unit override explicitly excludes semantic-evolution unit 8727.',
  ),
  freezeOverride(
    12469,
    'src/components/messages/UserTextMessage.tsx',
    ['UserTextMessage'],
    'The Target117 user-message renderer owns the fork-boilerplate lazy component binding and its authenticated UserForkBoilerplateMessage property.',
  ),
  freezeOverride(
    16363,
    'src/commands/rename/rename.ts',
    ['performRename'],
    'The authenticated rename declaration owns the Target117 CCR runtime branch and updateSessionTitle dynamic binding; the earlier source snapshot is a bounded missing-declaration witness.',
  ),
  freezeOverride(
    20645,
    'src/cli/print.ts',
    ['runHeadless'],
    'The Target117 headless entry declaration owns the authenticated resumed agentDefinition binding and its surrounding restore-and-apply behavior.',
  ),
])
