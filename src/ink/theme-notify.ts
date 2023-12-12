type ThemeNotifyListener = () => void

const listeners = new Set<ThemeNotifyListener>()

/** Subscribe to terminal DEC mode 2031 background-theme notifications. */
export function subscribeThemeNotifications(
  listener: ThemeNotifyListener,
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Dispatch a parsed terminal theme notification to active theme watchers. */
export function notifyThemeChanged(): void {
  for (const listener of listeners) listener()
}
