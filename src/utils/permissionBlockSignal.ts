import { createSignal } from './signal.js'

export type PermissionBlockChannel =
  | 'sandbox'
  | 'permission'
  | 'hook-prompt'
  | 'worker-sandbox'
  | 'elicitation'

const channelOrder: PermissionBlockChannel[] = [
  'sandbox',
  'permission',
  'hook-prompt',
  'worker-sandbox',
  'elicitation',
]
const changed = createSignal<[needs: string | null]>()
const values: Record<PermissionBlockChannel, string | null> = {
  sandbox: null,
  permission: null,
  'hook-prompt': null,
  'worker-sandbox': null,
  elicitation: null,
}
let current: string | null = null

function publish(): void {
  let next: string | null = null
  for (const channel of channelOrder) {
    if (values[channel]) {
      next = values[channel]
      break
    }
  }
  if (next === current) return
  current = next
  changed.emit(next)
}

/** Aggregates all interactive permission surfaces into one classifier block. */
export const permissionBlockSignal = {
  subscribe: changed.subscribe,
  emit(
    value: string | null,
    channel: PermissionBlockChannel = 'permission',
  ): void {
    if (values[channel] === value) return
    values[channel] = value
    publish()
  },
}
