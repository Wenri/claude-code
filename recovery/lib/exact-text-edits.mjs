function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function normalizeEdit(edit, index, label) {
  if (!edit || typeof edit !== 'object' || Array.isArray(edit)) {
    throw new Error(`${label} edit ${index + 1} must be an object`)
  }

  const keys = Object.keys(edit).sort()
  const isReplacement =
    keys.length === 2 &&
    own(edit, 'from') &&
    own(edit, 'to')
  const isInsertion =
    keys.length === 2 &&
    own(edit, 'anchor') &&
    own(edit, 'text')

  if (!isReplacement && !isInsertion) {
    throw new Error(
      `${label} edit ${index + 1} must contain exactly ` +
        '{from, to} or {anchor, text}',
    )
  }

  if (isReplacement) {
    if (
      typeof edit.from !== 'string' ||
      edit.from.length === 0 ||
      typeof edit.to !== 'string'
    ) {
      throw new Error(
        `${label} replacement ${index + 1} must have a non-empty ` +
          'string from and string to',
      )
    }
    if (edit.from === edit.to) {
      throw new Error(`${label} replacement ${index + 1} is a no-op`)
    }
    return {
      kind: 'replacement',
      match: edit.from,
      replacement: edit.to,
    }
  }

  if (
    typeof edit.anchor !== 'string' ||
    edit.anchor.length === 0 ||
    typeof edit.text !== 'string'
  ) {
    throw new Error(
      `${label} insertion ${index + 1} must have a non-empty ` +
        'string anchor and string text',
    )
  }
  if (edit.text.length === 0) {
    throw new Error(`${label} insertion ${index + 1} is a no-op`)
  }
  return {
    kind: 'insertion',
    match: edit.anchor,
    replacement: edit.anchor + edit.text,
  }
}

export function exactOrderedTextEdits(text, edits, label) {
  if (typeof text !== 'string') {
    throw new Error(`${label} baseline must be a string`)
  }
  if (!Array.isArray(edits) || edits.length === 0) {
    throw new Error(`${label} edits must be a non-empty array`)
  }

  const located = edits.map((edit, index) => {
    const normalized = normalizeEdit(edit, index, label)
    const first = text.indexOf(normalized.match)
    if (first < 0) {
      throw new Error(
        `${label} ${normalized.kind} ${index + 1} match is absent`,
      )
    }
    if (text.indexOf(normalized.match, first + 1) >= 0) {
      throw new Error(
        `${label} ${normalized.kind} ${index + 1} match is not unique`,
      )
    }
    return {
      ...normalized,
      index,
      start: first,
      end: first + normalized.match.length,
    }
  })

  let previous = null
  for (const current of located) {
    if (previous && current.start < previous.start) {
      throw new Error(
        `${label} edit ${current.index + 1} is not in baseline order`,
      )
    }
    if (previous && current.start < previous.end) {
      throw new Error(
        `${label} edit ${current.index + 1} overlaps edit ` +
          `${previous.index + 1}`,
      )
    }
    previous = current
  }

  const pieces = []
  let cursor = 0
  for (const edit of located) {
    pieces.push(text.slice(cursor, edit.start), edit.replacement)
    cursor = edit.end
  }
  pieces.push(text.slice(cursor))
  return pieces.join('')
}
