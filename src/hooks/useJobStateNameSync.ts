import { watch, type FSWatcher } from 'fs'
import { useEffect } from 'react'
import { getSessionId } from '../bootstrap/state.js'
import { getJobDir, readJobState } from '../daemon/jobs.js'
import { isBgSession, updateSessionName } from '../utils/concurrentSessions.js'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage } from '../utils/errors.js'
import {
  getCurrentSessionAgentName,
  saveAgentName,
  saveCustomTitle,
} from '../utils/sessionStorage.js'

let nameHandler: ((name: string | null) => void) | null = null

export function setJobStateNameHandler(
  handler: ((name: string | null) => void) | null,
): void {
  nameHandler = handler
}

export function notifyJobStateName(name: string | null): void {
  nameHandler?.(name)
}

function persistName(name: string, onName?: (name: string) => void): void {
  if (!name || name === getCurrentSessionAgentName()) return
  const sessionId = getSessionId()
  void saveAgentName(sessionId, name)
  void saveCustomTitle(sessionId, name)
  void updateSessionName(name)
  onName?.(name)
}

export function useJobStateNameSync(onName?: (name: string) => void): void {
  useEffect(() => {
    if (isBgSession()) return
    const sessionId = getSessionId()
    const jobDir = getJobDir(sessionId.slice(0, 8))
    let watcher: FSWatcher | undefined
    const synchronize = async () => {
      const state = await readJobState(jobDir)
      if (!state || state.sessionId !== sessionId || !state.name) return
      persistName(state.name, onName)
    }
    try {
      watcher = watch(jobDir, (_event, filename) => {
        if (filename && filename.toString() !== 'state.json') return
        void synchronize()
      })
      watcher.on('error', error =>
        logForDebugging(
          `[jobStateNameSync] watcher error: ${errorMessage(error)}`,
          { level: 'warn' },
        ),
      )
      watcher.unref()
    } catch (error) {
      logForDebugging(`[jobStateNameSync] watch skipped: ${String(error)}`)
      return
    }
    void synchronize()
    return () => watcher?.close()
  }, [onName])

  useEffect(() => {
    if (isBgSession()) return
    setJobStateNameHandler(name => {
      if (name) persistName(name, onName)
    })
    return () => setJobStateNameHandler(null)
  }, [onName])
}
