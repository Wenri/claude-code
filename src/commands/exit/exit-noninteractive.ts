import type { LocalCommandResult } from '../../types/command.js'
import { gracefulShutdown } from '../../utils/gracefulShutdown.js'

export async function call(): Promise<LocalCommandResult> {
  await gracefulShutdown(0, 'prompt_input_exit')
  return { type: 'skip' }
}
