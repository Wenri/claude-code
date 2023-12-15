export function exactTextInsertion(text, assertion, label) {
  if (
    typeof assertion?.anchor !== 'string' ||
    assertion.anchor.length === 0 ||
    typeof assertion.text !== 'string'
  ) {
    throw new Error(
      `${label} insertion must have a non-empty anchor and string text`,
    )
  }
  const first = text.indexOf(assertion.anchor)
  if (first < 0) {
    throw new Error(`${label} insertion anchor is absent`)
  }
  if (text.indexOf(assertion.anchor, first + assertion.anchor.length) >= 0) {
    throw new Error(`${label} insertion anchor is not unique`)
  }
  const offset = first + assertion.anchor.length
  return text.slice(0, offset) + assertion.text + text.slice(offset)
}
