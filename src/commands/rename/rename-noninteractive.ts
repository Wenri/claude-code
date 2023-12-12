import type { LocalCommandCall } from '../../types/command.js'
import { performRename } from './rename.js'

export const call: LocalCommandCall = async (args, context) => {
  const { message } = await performRename(args, context)
  return { type: 'text', value: message }
}
