import { parseFrontmatter } from '../../utils/frontmatterParser.js'
import { registerBundledSkill } from '../bundledSkills.js'
import {
  LEGACY_SKILL_FILES,
  LEGACY_SKILL_MD,
} from './legacyVerifyContent.js'

const { frontmatter, content: LEGACY_SKILL_BODY } =
  parseFrontmatter(LEGACY_SKILL_MD)

const LEGACY_DESCRIPTION =
  typeof frontmatter.description === 'string'
    ? frontmatter.description
    : 'Verify a code change does what it should by running the app.'

export function registerLegacyVerifySkill(): void {
  if (process.env.USER_TYPE !== 'ant') {
    return
  }

  registerBundledSkill({
    name: 'verify',
    description: LEGACY_DESCRIPTION,
    userInvocable: true,
    files: LEGACY_SKILL_FILES,
    async getPromptForCommand(args) {
      const parts: string[] = [LEGACY_SKILL_BODY.trimStart()]
      if (args) {
        parts.push(`## User Request\n\n${args}`)
      }
      return [{ type: 'text', text: parts.join('\n\n') }]
    },
  })
}
