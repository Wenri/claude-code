import type { Message } from '../types/message.js'

export type MessageOperation =
  | { type: 'append'; messages: Message[] }
  | { type: 'replace-all'; messages: Message[] }
  | { type: 'remove-by-uuid'; uuid: string }
  | { type: 'update'; updater: (messages: Message[]) => Message[] }

export function applyMessageOperation(
  messages: Message[],
  operation: MessageOperation,
): Message[] {
  switch (operation.type) {
    case 'append':
      return operation.messages.length === 0
        ? messages
        : [...messages, ...operation.messages]
    case 'replace-all':
      return operation.messages
    case 'remove-by-uuid': {
      const index = messages.findIndex(message => message.uuid === operation.uuid)
      if (index === -1) return messages
      const next = messages.slice()
      next.splice(index, 1)
      return next
    }
    case 'update':
      return operation.updater(messages)
  }
}
