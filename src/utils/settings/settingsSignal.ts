import { createSignal } from '../signal.js'
import type { SettingSource } from './constants.js'

export const settingsChanged = createSignal<[source: SettingSource]>()
