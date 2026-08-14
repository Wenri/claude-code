import * as React from 'react'
import type { ToolProgressEvent, Tools } from '../Tool.js'
import { renderToolUseProgressMessage as renderAgentProgress } from '../tools/AgentTool/UI.js'
import { BackgroundHint } from '../tools/BashTool/UI.js'
import { BashModeProgress } from './BashModeProgress.js'

export function renderToolProgress(
  event: Exclude<ToolProgressEvent, { kind: 'clear' }>,
  options: { tools: Tools; verbose: boolean },
): React.ReactNode {
  switch (event.kind) {
    case 'background_hint':
      return <BackgroundHint />
    case 'bash_mode_progress':
      return (
        <BashModeProgress
          input={event.input}
          progress={event.progress}
          verbose={event.verbose}
        />
      )
    case 'agent_progress':
      return renderAgentProgress(event.progressMessages as never, options)
    case 'it2_setup_prompt':
    case 'computer_use_approval':
      return null
  }
}
