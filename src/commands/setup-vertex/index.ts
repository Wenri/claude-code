import type { Command } from '../../commands.js'
import { isEnvTruthy } from '../../utils/envUtils.js'

const setupVertex = {
  type: 'local-jsx',
  name: 'setup-vertex',
  description:
    'Reconfigure Google Vertex AI authentication, project, region, or model pins',
  get isHidden() {
    return !isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX)
  },
  load: () => import('./setup-vertex.js'),
} satisfies Command

export default setupVertex
