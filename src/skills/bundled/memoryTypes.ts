import { feature } from 'bun:bundle'
import {
  isLeanMemoryPromptEnabled,
  MEMORY_TYPES_SKILL_NAME,
  TYPES_SECTION_COMBINED,
  TYPES_SECTION_INDIVIDUAL,
} from '../../memdir/memoryTypes.js'
import { isAutoMemoryEnabled } from '../../memdir/paths.js'
import { registerBundledSkill } from '../bundledSkills.js'

/* eslint-disable @typescript-eslint/no-require-imports */
const teamMemPaths = feature('TEAMMEM')
  ? (require('../../memdir/teamMemPaths.js') as typeof import('../../memdir/teamMemPaths.js'))
  : null
/* eslint-enable @typescript-eslint/no-require-imports */

export function registerMemoryTypesSkill(): void {
  registerBundledSkill({
    name: MEMORY_TYPES_SKILL_NAME,
    description:
      'Full reference for the memory type taxonomy — what each type captures, when to save it, how to structure the body, with examples.',
    whenToUse:
      'Use before writing a memory file to choose the right `type:` frontmatter value and body structure.',
    userInvocable: false,
    isEnabled: () => isAutoMemoryEnabled() && isLeanMemoryPromptEnabled(),
    async getPromptForCommand() {
      const section = teamMemPaths?.isTeamMemoryEnabled()
        ? TYPES_SECTION_COMBINED
        : TYPES_SECTION_INDIVIDUAL
      return [{ type: 'text', text: section.join('\n') }]
    },
  })
}
