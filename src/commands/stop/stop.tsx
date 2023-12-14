import type React from 'react'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import { stopBackgroundSession } from '../exit/exit.js'

export async function call(
  onDone: LocalJSXCommandOnDone,
): Promise<React.ReactNode> {
  onDone()
  await stopBackgroundSession('stop_command')
  return null
}
