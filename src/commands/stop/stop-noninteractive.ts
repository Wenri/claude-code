import type { LocalCommandResult } from '../../types/command.js'
import { stopBackgroundSession } from '../exit/exit.js'

export async function call(): Promise<LocalCommandResult> {
  await stopBackgroundSession('bridge')
  return { type: 'skip' }
}
