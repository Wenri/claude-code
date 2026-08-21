const CASE_NAME = '2.1.116-to-2.1.117'
const TARGET_EVIDENCE = 'target117-current-extracted-owner-target-fragment'
const SOURCE_EVIDENCE = 'target117-current-extracted-owner-static-ast'

const OWNER_ROWS = [
  [
    14883,
    'src/tools/BashTool/bashPermissions.ts',
    'WRAPPER_VALUE_FLAGS',
    'The authenticated recovered declaration is the direct owner of the complete wrapper-to-value-flag table; its unit-local string multiplicities cover all eight shifted flag residues.',
  ],
  [
    15220,
    'src/commands/btw/btw.tsx',
    'BtwSideQuestion',
    'The authenticated BtwSideQuestion declaration directly binds the scroll action to its up/down keyboard paths and ScrollBox handle, so the residue is declaration-local rather than a global string coincidence.',
  ],
  [
    16801,
    'src/components/skills/SkillsMenu.tsx',
    'SkillRow',
    'The authenticated SkillRow declaration destructures and renders the skill property in the same row-label, source, lock, and suggestion flow as the compiled target unit.',
  ],
  [
    18925,
    'src/components/permissions/PowerShellPermissionRequest/PowerShellPermissionRequest.tsx',
    'PowerShellPermissionRequest',
    'The authenticated PowerShell permission declaration contains the unit-local separator residue inside its confirmation and debug-control UI, with matching permission telemetry and dispatch semantics.',
  ],
  [
    19754,
    'src/components/FeedbackSurvey/TranscriptSharePrompt.tsx',
    'inputToResponse',
    'The authenticated inputToResponse declaration is the complete y/yes, n/no, and d/dont_ask_again response table represented by the compiled target declaration.',
  ],
]

export const TARGET117_CURRENT_EXTRACTED_OWNER_OVERRIDES = Object.freeze(
  OWNER_ROWS.map(([targetIndex, owner, declaration, behavior]) =>
    Object.freeze({
      key: `${CASE_NAME}:${targetIndex}`,
      targetIndex,
      paths: Object.freeze([owner]),
      declaration,
      evidenceIds: Object.freeze([TARGET_EVIDENCE, SOURCE_EVIDENCE]),
      behavior,
    }),
  ),
)
