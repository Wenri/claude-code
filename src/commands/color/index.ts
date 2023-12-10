/**
 * Color command - minimal metadata only.
 * Implementation is lazy-loaded from color.ts to reduce startup time.
 */
import type { Command } from '../../commands.js'
import { AGENT_COLORS } from '../../tools/AgentTool/agentColorManager.js'

export const color = {
  type: 'local-jsx',
  name: 'color',
  requires: { ink: true },
  description: 'Set the prompt bar color for this session',
  immediate: true,
  argumentHint: `<${[...AGENT_COLORS, 'default'].join('|')}>`,
  load: () => import('./color.js'),
} satisfies Command

export const colorNonInteractive = {
  type: 'local',
  name: 'color',
  supportsNonInteractive: true,
  description: 'Set the prompt bar color for this session',
  argumentHint: `<${[...AGENT_COLORS, 'default'].join('|')}>`,
  load: () => import('./color-noninteractive.js'),
} satisfies Command
