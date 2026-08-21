const CASE_NAME = '2.1.117-to-2.1.118'
const OWNER_PATH = 'src/commands/fork/fork.ts'

export const TARGET118_FORK_NAME_REGISTRATION_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:17881`,
    targetIndex: 17881,
    paths: Object.freeze([OWNER_PATH]),
    declarations: Object.freeze(['spawnFork']),
    evidenceIds: Object.freeze([
      'target118-fork-name-registration-target-fragments',
      'target118-fork-name-registration-source-ast-test',
      'target118-fork-name-registration-semantic-test',
    ]),
    behavior:
      'The authenticated Target118 fork spawn registers the derived fork name and agent ID through agentLifecycle.registerName, whose matched lifecycle helper performs the same cloned agentNameRegistry update that historical src/commands/fork/fork.ts performs inline. The registerName property is an extracted state-update representation, not a missing remote-setup behavior.',
  }),
])
