const CASE_NAME = '2.1.117-to-2.1.118'

export const TARGET118_AUTOFIX_PR_COMMAND_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:15199`,
    targetIndex: 15199,
    paths: Object.freeze(['src/commands/autofix-pr/command.ts']),
    evidenceIds: Object.freeze([
      'target118-autofix-pr-command-target-fragment',
      'target118-autofix-pr-command-source-ast-test',
    ]),
    behavior:
      'The authenticated Target118 command registration declares the autofix-pr local-JSX command, its monitoring description, subscriber and remote-session policy gates, hidden getter, lazy module loader, and user-facing name. The exact historical command.ts object owns the complete declaration; the provisional utils/messages.ts attribution is rejected.',
  }),
])
