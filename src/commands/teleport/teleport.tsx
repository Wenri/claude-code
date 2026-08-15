import React from 'react'
import { TeleportResumeWrapper } from '../../components/TeleportResumeWrapper.js'
import type { LocalJSXCommandCall } from '../../types/command.js'

type TeleportProps = {
  onExit: Parameters<LocalJSXCommandCall>[0]
  context: Parameters<LocalJSXCommandCall>[1]
}

export function Teleport({ onExit, context }: TeleportProps): React.ReactNode {
  return (
    <TeleportResumeWrapper
      onComplete={result => {
        context.applyMessageOp({ type: 'replace-all', messages: result.log })
        onExit('Session resumed successfully', { display: 'system' })
      }}
      onCancel={() => {
        onExit('Teleport cancelled', { display: 'system' })
      }}
      onError={error => {
        onExit(error, { display: 'system' })
      }}
      isEmbedded={true}
      source="localCommand"
    />
  )
}

export const call: LocalJSXCommandCall = async (onExit, context) => {
  return <Teleport onExit={onExit} context={context} />
}
