import * as React from 'react'
import { TeleportResumeWrapper } from '../../components/TeleportResumeWrapper.js'
import { useAppStateStore } from '../../state/AppState.js'
import type {
  LocalJSXCommandCall,
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import type { TeleportRemoteResponse } from '../../utils/conversationRecovery.js'

export const Teleport = ({
  onExit,
  context,
}: {
  onExit: LocalJSXCommandOnDone
  context: LocalJSXCommandContext
}) => {
  const appStateStore = useAppStateStore()
  const [_startedInBridgeSession] = React.useState(() =>
    Boolean(appStateStore.getState().replBridgeSessionId),
  )
  const onComplete = React.useCallback(
    (result: TeleportRemoteResponse) => {
      context.applyMessageOp({
        type: 'replace-all',
        messages: result.log,
      })
      onExit('Session resumed successfully', { display: 'system' })
    },
    [context, onExit],
  )

  const onCancel = React.useCallback(() => {
    onExit('Teleport cancelled', { display: 'system' })
  }, [onExit])

  const onError = React.useCallback(
    (error: string) => {
      onExit(error, { display: 'system' })
    },
    [onExit],
  )

  return (
    <TeleportResumeWrapper
      onComplete={onComplete}
      onCancel={onCancel}
      onError={onError}
      isEmbedded
      source="localCommand"
    />
  )
}

export const call: LocalJSXCommandCall = async (onExit, context) => {
  return <Teleport onExit={onExit} context={context} />
}
