import * as React from 'react'
import { getSessionId } from '../../bootstrap/state.js'
import { logEvent } from '../../services/analytics/index.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { getSessionHooks } from '../../utils/hooks/sessionHooks.js'
import type { HookCommand } from '../../utils/settings/types.js'
import { StopHookDialog } from './StopHookDialog.js'

function getPromptStopHooks(
  appState: Parameters<typeof getSessionHooks>[0],
  sessionId: string,
): HookCommand[] {
  const hooks = getSessionHooks(appState, sessionId, 'Stop').get('Stop') ?? []
  const prompts: HookCommand[] = []
  for (const matcher of hooks) {
    if (matcher.matcher !== '') continue
    for (const hook of matcher.hooks) {
      if (hook.type === 'prompt') prompts.push(hook)
    }
  }
  return prompts
}

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  logEvent('tengu_stop_hook_command', {})
  const registry = context.sessionHooksRegistry!
  const sessionId = getSessionId()
  const hooks = getPromptStopHooks(context.getAppState(), sessionId)
  const existingPrompt = hooks[0]?.type === 'prompt' ? hooks[0].prompt : undefined
  const initialPrompt = args.trim() || existingPrompt || ''

  function submit(prompt: string): void {
    if (prompt.length === 0) {
      for (const hook of hooks) registry.remove(sessionId, 'Stop', hook)
      const message = hooks.length > 0 ? 'Stop hook cleared' : 'Cancelled'
      if (hooks.length > 0) logEvent('tengu_stop_hook_removed', {})
      onDone(message, { display: 'system' })
      return
    }
    if (existingPrompt === prompt) {
      onDone('Stop hook unchanged', { display: 'system' })
      return
    }
    for (const hook of hooks) registry.remove(sessionId, 'Stop', hook)
    registry.add(sessionId, 'Stop', '', { type: 'prompt', prompt })
    logEvent('tengu_stop_hook_added', { promptLength: prompt.length })
    onDone(hooks.length === 0 ? 'Stop hook set' : 'Stop hook updated', {
      display: 'system',
    })
  }

  return (
    <StopHookDialog
      initialPrompt={initialPrompt}
      existingHookPresent={existingPrompt !== undefined}
      onSubmit={submit}
      onCancel={() => onDone('Cancelled', { display: 'system' })}
    />
  )
}
