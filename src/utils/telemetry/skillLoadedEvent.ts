import { getSkillToolCommands } from '../../commands.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
  logEvent,
} from '../../services/analytics/index.js'
import { getCharBudget } from '../../tools/SkillTool/prompt.js'

export function buildSkillTelemetryFields(
  source?: string,
  loadedFrom?: string,
  kind?: string,
  createdBy?: string,
): Record<
  string,
  AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
> {
  return {
    ...(source && {
      skill_source:
        source as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    }),
    ...(loadedFrom && {
      skill_loaded_from:
        loadedFrom as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    }),
    ...(kind && {
      skill_kind:
        kind as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    }),
    ...(createdBy && {
      skill_created_by:
        createdBy as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    }),
  }
}

/**
 * Logs a tengu_skill_loaded event for each skill available at session startup.
 * This enables analytics on which skills are available across sessions.
 */
export async function logSkillsLoaded(
  cwd: string,
  contextWindowTokens: number,
): Promise<void> {
  const skills = await getSkillToolCommands(cwd)
  const skillBudget = getCharBudget(contextWindowTokens)

  for (const skill of skills) {
    if (skill.type !== 'prompt') continue

    logEvent('tengu_skill_loaded', {
      // _PROTO_skill_name routes to the privileged skill_name BQ column.
      // Unredacted names don't go in additional_metadata.
      _PROTO_skill_name:
        skill.name as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
      ...buildSkillTelemetryFields(
        skill.source,
        skill.loadedFrom,
        skill.kind,
        skill.createdBy,
      ),
      skill_budget: skillBudget,
      skill_content_chars: skill.contentLength,
    })
  }
}
