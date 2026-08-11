import type { LocalCommandResult } from '../../types/command.js'
import { gracefulShutdown } from '../../utils/gracefulShutdown.js'
import { isBgSession } from '../../utils/concurrentSessions.js'
import { stopBackgroundSession } from './exit.js'

export async function call(): Promise<LocalCommandResult> {
  if (isBgSession()) await stopBackgroundSession('bridge')
  else await gracefulShutdown(0, 'prompt_input_exit')
  return { type: 'skip' }
}
