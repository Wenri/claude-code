// Acorn and source-map columns use UTF-16 code units, not bytes or code points.
// Index line starts once instead of retaining a SourceLocation on every node.
export function createUtf16PositionLookup(source) {
  if (typeof source !== 'string') throw new TypeError('Source must be a string')
  const starts = [0]
  for (let offset = 0; offset < source.length; offset++) {
    const code = source.charCodeAt(offset)
    if (code === 13) {
      if (source.charCodeAt(offset + 1) === 10) offset++
      starts.push(offset + 1)
    } else if (code === 10 || code === 0x2028 || code === 0x2029) {
      starts.push(offset + 1)
    }
  }
  return offset => {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > source.length) {
      throw new RangeError('Offset must be an integer UTF-16 position within the source')
    }
    let low = 0, high = starts.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (starts[middle] <= offset) low = middle + 1
      else high = middle
    }
    const lineIndex = low - 1
    // At the LF inside CRLF, Acorn's getLineInfo considers only the preceding
    // CR consumed. AST identifier boundaries cannot fall here, but arbitrary
    // offset queries still preserve Acorn's exact line/column convention.
    if (offset > 0 && source.charCodeAt(offset) === 10 && source.charCodeAt(offset - 1) === 13) {
      return { line: lineIndex + 2, column: 0 }
    }
    return { line: lineIndex + 1, column: offset - starts[lineIndex] }
  }
}
