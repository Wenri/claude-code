import { watch, type FSWatcher } from 'fs'
import { useEffect, useState } from 'react'
import { getIsRemoteMode, getSessionId } from '../bootstrap/state.js'
import { getJobDir, readJobState } from '../daemon/jobs.js'
import { isBgSession } from '../utils/concurrentSessions.js'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage } from '../utils/errors.js'

export type BgSessionPr = {
  number: number
  url: string
}

export function useBgSessionPr(): BgSessionPr | null {
  const [pr, setPr] = useState<BgSessionPr | null>(null)

  useEffect(() => {
    if (!isBgSession() || getIsRemoteMode()) return
    const jobDir = getJobDir(getSessionId().slice(0, 8))
    let watcher: FSWatcher | undefined
    const synchronize = async () => {
      const child = (await readJobState(jobDir))?.children?.[0]
      const number = child ? Number(child.id) : Number.NaN
      if (!child || !Number.isFinite(number)) return
      setPr(previous =>
        previous?.number === number && previous.url === child.href
          ? previous
          : { number, url: child.href },
      )
    }

    try {
      watcher = watch(jobDir, (_event, filename) => {
        if (filename && filename.toString() !== 'state.json') return
        void synchronize()
      })
      watcher.on('error', error =>
        logForDebugging(
          `[useBgSessionPr] watcher error: ${errorMessage(error)}`,
          { level: 'warn' },
        ),
      )
      watcher.unref()
    } catch (error) {
      logForDebugging(
        `[useBgSessionPr] watch skipped: ${errorMessage(error)}`,
      )
    }

    void synchronize()
    return () => watcher?.close()
  }, [])

  return pr
}
