// Legacy /verify payload retained alongside the runtime-verification skill.
// Both identities are present in the bundled CLI and remain distinct inputs.

import cliMd from './verify/examples/cli.md'
import serverMd from './verify/examples/server.md'
import skillMd from './verify/legacy-SKILL.md'

export const LEGACY_SKILL_MD: string = skillMd

export const LEGACY_SKILL_FILES: Record<string, string> = {
  'examples/cli.md': cliMd,
  'examples/server.md': serverMd,
}
