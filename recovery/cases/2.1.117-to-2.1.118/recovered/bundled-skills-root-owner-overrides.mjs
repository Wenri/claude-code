const CASE_NAME = '2.1.117-to-2.1.118'
const OWNER_PATH = 'src/utils/permissions/filesystem.ts'

export const TARGET118_BUNDLED_SKILLS_ROOT_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:18171`,
    targetIndex: 18171,
    paths: Object.freeze([OWNER_PATH]),
    declarations: Object.freeze(['getBundledSkillsRoot']),
    evidenceIds: Object.freeze([
      'target118-bundled-skills-root-target-fragment',
      'target118-bundled-skills-root-source-ast-test',
    ]),
    behavior:
      'The authenticated Target118 bundled-skills root initializer is the exact compiled form of src/utils/permissions/filesystem.ts#getBundledSkillsRoot: it creates a 16-byte cryptographic nonce, hex-encodes it, and joins the Claude temp root, bundled-skills segment, build VERSION, and nonce. The randomBytes property is a direct namespace-import compilation of the pinned named source import, not a missing runtime behavior.',
  }),
])
