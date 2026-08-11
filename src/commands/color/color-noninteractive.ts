import type { LocalJSXCommandContext } from '../../types/command.js'
import { performSetColor } from './color.js'

export async function call(args: string, context: LocalJSXCommandContext) {
  return { type: 'text' as const, value: await performSetColor(args, context) }
}
