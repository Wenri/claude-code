import Powerup from './PowerupApp.js'
import * as React from 'react'
import type { LocalJSXCommandOnDone } from '../../types/command.js'

export const call = async (
  onDone: LocalJSXCommandOnDone,
): Promise<React.ReactNode> => {
  return <Powerup onExit={result => onDone(result, { display: 'system' })} />
}
