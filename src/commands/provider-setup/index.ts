import type { Command } from '../../commands.js'
import { isEnvTruthy } from '../../utils/envUtils.js'

export const setupBedrock = {
  type: 'local-jsx',
  name: 'setup-bedrock',
  description: 'Reconfigure AWS Bedrock authentication, region, or model pins',
  get isHidden() {
    return !isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK)
  },
  load: () => import('./bedrock.js'),
} satisfies Command

export const setupVertex = {
  type: 'local-jsx',
  name: 'setup-vertex',
  description:
    'Reconfigure Google Vertex AI authentication, project, region, or model pins',
  get isHidden() {
    return !isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX)
  },
  load: () => import('./vertex.js'),
} satisfies Command
