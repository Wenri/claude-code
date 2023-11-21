export function selectStripAnsi(bunRuntime, fallback) {
  const bunStripAnsi =
    typeof bunRuntime !== 'undefined' &&
    typeof bunRuntime.stripANSI === 'function'
      ? bunRuntime.stripANSI
      : null
  return bunStripAnsi ?? fallback
}
