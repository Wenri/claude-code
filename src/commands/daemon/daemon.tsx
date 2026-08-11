import React from 'react'
import {
  DaemonHub,
  loadDaemonHubData,
} from '../../daemon/hub.js'
import { getDefaultDaemonConfigPath } from '../../daemon/service.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'

export async function call(
  onDone: LocalJSXCommandOnDone,
): Promise<React.ReactNode> {
  const configPath = getDefaultDaemonConfigPath()
  const initialData = await loadDaemonHubData(configPath)
  return (
    <DaemonHub
      initialData={initialData}
      configPath={configPath}
      onDone={message =>
        onDone(message, { display: message ? 'system' : 'skip' })
      }
    />
  )
}
