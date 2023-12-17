const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_DEFAULT_BRANCH_EVIDENCE_IDS = Object.freeze([
  'target119-default-branch-authenticated-target-fragment',
  'target119-default-branch-source-transition-test',
  'target119-default-branch-source-ast-test',
])

export const TARGET119_DEFAULT_BRANCH_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:2486`,
    targetIndex: 2486,
    paths: Object.freeze([
      'src/utils/git.ts',
      'src/utils/git/gitFilesystem.ts',
    ]),
    evidenceIds: TARGET119_DEFAULT_BRANCH_EVIDENCE_IDS,
    behavior:
      'The authenticated Target119 default-branch resolver validates origin/HEAD, then probes main and master, and falls back to main; the recovered git.ts entry point delegates to the filesystem-backed computeDefaultBranch implementation, which preserves the same ordered symref/ref-existence semantics without spawning show-ref.',
  }),
])

export const TARGET119_DEFAULT_BRANCH_PROOF_SPEC = Object.freeze({
  targetIndex: 2486,
  ownerPaths: Object.freeze([
    'src/utils/git.ts',
    'src/utils/git/gitFilesystem.ts',
  ]),
  declarations: Object.freeze(['getDefaultBranch', 'computeDefaultBranch']),
  residues: Object.freeze([
    Object.freeze({
      kind: 'regexp',
      value: Object.freeze({ pattern: '^origin\\/', flags: '' }),
      start: 999828,
      end: 999839,
      baselineCount: 0,
      targetOrdinal: 1,
    }),
    Object.freeze({
      kind: 'string',
      value: 'master',
      start: 999879,
      end: 999887,
      baselineCount: 2,
      targetOrdinal: 3,
    }),
    Object.freeze({
      kind: 'string',
      value: 'show-ref',
      start: 999923,
      end: 999933,
      baselineCount: 0,
      targetOrdinal: 1,
    }),
  ]),
})
