import * as React from 'react'
import type { Tools } from '../Tool.js'
import type { ProgressMessage } from '../types/message.js'
import type { ShellProgress } from '../types/tools.js'
import type { Progress as AgentProgress } from '../tools/AgentTool/AgentTool.js'
import { renderToolUseProgressMessage } from '../tools/AgentTool/UI.js'
import { BashModeProgress } from './BashModeProgress.js'
import { SessionBackgroundHint } from './SessionBackgroundHint.js'

export type ToolProgressOverlayEvent =
  | { kind: 'background_hint'; toolUseId: string }
  | {
      kind: 'bash_mode_progress'
      toolUseId: string
      input: string
      progress: ShellProgress | null
      verbose: boolean
    }
  | {
      kind: 'agent_progress'
      toolUseId: string
      progressMessages: ProgressMessage<AgentProgress>[]
    }
  | { kind: 'it2_setup_prompt'; toolUseId: string }
  | { kind: 'computer_use_approval'; toolUseId: string }
  | { kind: 'clear'; toolUseId: string }

export type VisibleToolProgressOverlayEvent = Exclude<
  ToolProgressOverlayEvent,
  { kind: 'clear' }
>

export function renderToolProgressOverlay(
  event: VisibleToolProgressOverlayEvent,
  context: { tools: Tools; verbose: boolean },
): React.ReactNode {
  switch (event.kind) {
    case 'background_hint':
      return <SessionBackgroundHint />
    case 'bash_mode_progress':
      return (
        <BashModeProgress
          input={event.input}
          progress={event.progress}
          verbose={event.verbose}
        />
      )
    case 'agent_progress':
      return renderToolUseProgressMessage(event.progressMessages, context)
    case 'it2_setup_prompt':
    case 'computer_use_approval':
      return null
    default: {
      const unreachable: never = event
      return unreachable
    }
  }
}
