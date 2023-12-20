/**
 * Auto mode subcommand handlers — dump default/merged classifier rules and
 * critique user-written rules. Dynamically imported when `claude auto-mode ...` runs.
 */

import chalk from 'chalk'
import React from 'react'
import { Text, useApp, type Root } from '../../ink.js'
import { cliError } from '../exit.js'
import { errorMessage } from '../../utils/errors.js'
import {
  getMainLoopModel,
  parseUserSpecifiedModel,
} from '../../utils/model/model.js'
import {
  type AutoModeRules,
  AUTO_MODE_DEFAULTS_MARKER,
  buildDefaultExternalSystemPrompt,
  getDefaultExternalAutoModeRules,
  getEffectiveExternalAutoModeRules,
} from '../../utils/permissions/yoloClassifier.js'
import { getAutoModeConfig } from '../../utils/settings/settings.js'
import { sideQuery } from '../../utils/sideQuery.js'
import { jsonStringify } from '../../utils/slowOperations.js'

function RenderOnceAndExit({ children }: { children: React.ReactNode }) {
  const { exit } = useApp()
  React.useLayoutEffect(() => {
    const timer = setTimeout(exit, 0)
    return () => clearTimeout(timer)
  }, [exit])
  return React.createElement(React.Fragment, null, children)
}

async function renderAndExit(root: Root, value: React.ReactNode): Promise<void> {
  root.render(
    React.createElement(
      RenderOnceAndExit,
      null,
      React.createElement(Text, null, value),
    ),
  )
  await root.waitUntilExit()
}

async function writeRules(root: Root, rules: AutoModeRules): Promise<void> {
  await renderAndExit(root, jsonStringify(rules, null, 2))
}

export async function autoModeDefaultsHandler(root: Root): Promise<void> {
  await writeRules(root, getDefaultExternalAutoModeRules())
}

/**
 * Dump the effective auto mode config: user settings where provided, external
 * defaults otherwise. Per-section REPLACE semantics — matches how
 * buildYoloSystemPrompt resolves the external template (a non-empty user
 * section replaces that section's defaults entirely; an empty/absent section
 * falls through to defaults).
 */
export function autoModeConfigHandler(): void {
  writeRules(getEffectiveExternalAutoModeRules())
}

const CRITIQUE_SYSTEM_PROMPT =
  'You are an expert reviewer of auto mode classifier rules for Claude Code.\n' +
  '\n' +
  'Claude Code has an "auto mode" that uses an AI classifier to decide whether ' +
  'tool calls should be auto-approved or require user confirmation. Users can ' +
  'write custom rules in three categories:\n' +
  '\n' +
  '- **allow**: Actions the classifier should auto-approve\n' +
  '- **soft_deny**: Actions the classifier should block (require user confirmation)\n' +
  "- **environment**: Context about the user's setup that helps the classifier make decisions\n" +
  '\n' +
  "Your job is to critique the user's custom rules for clarity, completeness, " +
  'and potential issues. The classifier is an LLM that reads these rules as ' +
  'part of its system prompt.\n' +
  '\n' +
  'For each rule, evaluate:\n' +
  '1. **Clarity**: Is the rule unambiguous? Could the classifier misinterpret it?\n' +
  "2. **Completeness**: Are there gaps or edge cases the rule doesn't cover?\n" +
  '3. **Conflicts**: Do any of the rules conflict with each other?\n' +
  '4. **Actionability**: Is the rule specific enough for the classifier to act on?\n' +
  '\n' +
  'Be concise and constructive. Only comment on rules that could be improved. ' +
  'If all rules look good, say so.'

export async function autoModeCritiqueHandler(
  root: Root,
  options: { model?: string },
): Promise<void> {
  const config = getAutoModeConfig()
  const hasCustomRules = [
    ...(config?.allow ?? []),
    ...(config?.soft_deny ?? []),
    ...(config?.environment ?? []),
  ].some(rule => rule !== AUTO_MODE_DEFAULTS_MARKER)

  if (!hasCustomRules) {
    await renderAndExit(
      root,
      'No custom auto mode rules found.\n\n' +
        'Add rules to your settings file under autoMode.{allow, soft_deny, environment}.\n' +
        'Run `claude auto-mode defaults` to see the default rules for reference.',
    )
    return
  }

  const model = options.model
    ? parseUserSpecifiedModel(options.model)
    : getMainLoopModel()

  const defaults = getDefaultExternalAutoModeRules()
  const classifierPrompt = buildDefaultExternalSystemPrompt()

  const userRulesSummary =
    formatRulesForCritique('allow', config?.allow ?? [], defaults.allow) +
    formatRulesForCritique(
      'soft_deny',
      config?.soft_deny ?? [],
      defaults.soft_deny,
    ) +
    formatRulesForCritique(
      'environment',
      config?.environment ?? [],
      defaults.environment,
    )

  root.render(
    React.createElement(Text, null, 'Analyzing your auto mode rules…', '\n\n'),
  )

  let response
  try {
    response = await sideQuery({
      querySource: 'auto_mode_critique',
      model,
      system: CRITIQUE_SYSTEM_PROMPT,
      skipSystemPromptPrefix: true,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content:
            'Here is the full classifier system prompt that the auto mode classifier receives:\n\n' +
            '<classifier_system_prompt>\n' +
            classifierPrompt +
            '\n</classifier_system_prompt>\n\n' +
            "Here are the user's custom rules (each section header notes whether they replace or extend the defaults):\n\n" +
            userRulesSummary +
            '\nPlease critique these custom rules.',
        },
      ],
    })
  } catch (error) {
    root.unmount()
    return cliError(chalk.red('Failed to analyze rules: ' + errorMessage(error)))
  }

  const textBlock = response.content.find(block => block.type === 'text')
  const output =
    textBlock?.type === 'text'
      ? textBlock.text
      : 'No critique was generated. Please try again.'
  await renderAndExit(root, output)
}

function formatRulesForCritique(
  section: string,
  userRules: string[],
  defaultRules: string[],
): string {
  const customRules = userRules.filter(
    rule => rule !== AUTO_MODE_DEFAULTS_MARKER,
  )
  if (customRules.length === 0) return ''
  const inheritsDefaults = customRules.length !== userRules.length
  const customLines = customRules.map(r => '- ' + r).join('\n')
  const defaultLines = defaultRules.map(r => '- ' + r).join('\n')
  return (
    '## ' +
    section +
    (inheritsDefaults
      ? ' (custom rules added alongside the defaults)\n'
      : ' (custom rules replacing defaults)\n') +
    'Custom:\n' +
    customLines +
    '\n\n' +
    (inheritsDefaults ? 'Defaults also in effect:\n' : 'Defaults being replaced:\n') +
    defaultLines +
    '\n\n'
  )
}
