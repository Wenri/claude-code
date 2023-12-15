import type { AppState } from '../state/AppStateStore.js'

/**
 * Retained browser-view state carried by AppState in the published CLI.
 *
 * The external build does not install a producer for this slice, but it keeps
 * the state and its updater facade as part of the bundled module namespace.
 */
export type WebBrowserState = {
  view: unknown | undefined
  logs: unknown[]
  unreadErrors: number
  unreadWarnings: number
  cleanupRegistered: boolean
}

export type WebBrowserSlice = Pick<
  AppState,
  'webBrowser' | 'bagelActive' | 'bagelUrl' | 'bagelPanelVisible'
>

export type SetWebBrowserSlice = (
  updater: (previous: WebBrowserSlice) => WebBrowserSlice,
) => void

export function getDefaultWebBrowserState(): WebBrowserState {
  return {
    view: undefined,
    logs: [],
    unreadErrors: 0,
    unreadWarnings: 0,
    cleanupRegistered: false,
  }
}

export function makeSetWebBrowserSlice(
  setAppState: (updater: (previous: AppState) => AppState) => void,
): SetWebBrowserSlice {
  return updater =>
    setAppState(previous => {
      const slice: WebBrowserSlice = {
        webBrowser: previous.webBrowser,
        bagelActive: previous.bagelActive,
        bagelUrl: previous.bagelUrl,
        bagelPanelVisible: previous.bagelPanelVisible,
      }
      const next = updater(slice)
      return next === slice ? previous : { ...previous, ...next }
    })
}
