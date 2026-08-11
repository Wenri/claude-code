import { createElement, useEffect, useState } from 'react'
import { getRuntimeCapabilities } from '../bootstrap/state.js'
import { KeyboardShortcutHint } from '../components/design-system/KeyboardShortcutHint.js'
import { Pane } from '../components/design-system/Pane.js'
import { Box, Text, useInput } from '../ink.js'
import type {
  Command,
  LocalCommandCall,
  LocalJSXCommandOnDone,
} from '../types/command.js'
import { errorMessage } from '../utils/errors.js'

function formattedVersion(): string {
  const version = MACRO.VERSION
  return MACRO.BUILD_TIME
    ? `${version} (built ${MACRO.BUILD_TIME})`
    : version
}

const call: LocalCommandCall = async () => {
  return {
    type: 'text',
    value: formattedVersion(),
  }
}

type RemoteVersionState =
  | { state: 'loading' }
  | { state: 'ok'; version: string; buildTime?: string }
  | { state: 'error'; message: string }

function VersionDialog({
  onDone,
}: {
  onDone: LocalJSXCommandOnDone
}): React.ReactNode {
  const remote = getRuntimeCapabilities().remote
  const isThinClient = remote !== null
  const [remoteVersion, setRemoteVersion] = useState<RemoteVersionState | null>(
    isThinClient ? { state: 'loading' } : null,
  )

  useEffect(() => {
    if (!remote || !isThinClient) return
    let cancelled = false
    void remote
      .sendControlRequest<{ version: string; buildTime?: string }>({
        subtype: 'get_binary_version',
      })
      .then(response => {
        if (!cancelled) {
          setRemoteVersion({
            state: 'ok',
            version: response.version,
            buildTime: response.buildTime,
          })
        }
      })
      .catch(error => {
        if (!cancelled) {
          setRemoteVersion({ state: 'error', message: errorMessage(error) })
        }
      })
    return () => {
      cancelled = true
    }
  }, [remote, isThinClient])

  useInput((input, key) => {
    if (key.escape || key.return || input === ' ') {
      onDone(undefined, { display: 'skip' })
    }
  })

  const children = [
    remoteVersion
      ? createElement(Text, { key: 'thin-label', dimColor: true }, 'Thin client')
      : null,
    createElement(Text, { key: 'local-version' }, MACRO.VERSION),
    MACRO.BUILD_TIME
      ? createElement(
          Text,
          { key: 'local-build', dimColor: true },
          'Built ',
          MACRO.BUILD_TIME,
        )
      : null,
    remoteVersion
      ? createElement(
          Box,
          { key: 'remote', flexDirection: 'column', marginTop: 1 },
          createElement(Text, { dimColor: true }, 'Remote container'),
          remoteVersion.state === 'loading'
            ? createElement(Text, { dimColor: true }, 'Loading…')
            : remoteVersion.state === 'ok'
              ? createElement(
                  Box,
                  { flexDirection: 'column' },
                  createElement(Text, null, remoteVersion.version),
                  remoteVersion.buildTime
                    ? createElement(
                        Text,
                        { dimColor: true },
                        'Built ',
                        remoteVersion.buildTime,
                      )
                    : null,
                )
              : createElement(
                  Text,
                  { dimColor: true },
                  "Couldn't fetch: ",
                  remoteVersion.message,
                ),
        )
      : null,
  ]

  return createElement(
    Pane,
    null,
    createElement(
      Box,
      { flexDirection: 'column', gap: 1 },
      createElement(Text, { bold: true }, 'Claude Code'),
      createElement(Box, { flexDirection: 'column' }, ...children),
      createElement(
        Text,
        { dimColor: true },
        createElement(KeyboardShortcutHint, {
          shortcut: 'Esc',
          action: 'dismiss',
        }),
      ),
    ),
  )
}

async function callJSX(
  onDone: LocalJSXCommandOnDone,
): Promise<React.ReactNode> {
  return createElement(VersionDialog, { onDone })
}

export const versionNonInteractive = {
  type: 'local',
  name: 'version',
  description:
    'Print the version this session is running (not what autoupdate downloaded)',
  isEnabled: () => process.env.USER_TYPE === 'ant',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

const version = {
  type: 'local-jsx',
  name: 'version',
  description:
    'Print the version this session is running (not what autoupdate downloaded)',
  isEnabled: () => process.env.USER_TYPE === 'ant',
  immediate: true,
  requires: { ink: true },
  load: () => Promise.resolve({ call: callJSX }),
} satisfies Command

export default version
