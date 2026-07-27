/**
 * Executable recovery model for the 2.1.90 SSE stream buffering change.
 *
 * The production transport decodes bytes before this step. Keeping decoding
 * outside the model makes it possible to test the recovered chunk-boundary
 * behavior without importing the reconstructed application's dependencies.
 */
export function consumeSSEChunks(decodedChunks, parseFrames) {
  let chunks = []
  let previousChunkEndsWithNewline = false
  const frames = []
  const parseInputs = []

  for (const chunk of decodedChunks) {
    if (!chunk) continue

    const hasFrameBoundary =
      (previousChunkEndsWithNewline && chunk[0] === '\n') ||
      chunk.includes('\n\n')
    chunks.push(chunk)

    if (!hasFrameBoundary) {
      previousChunkEndsWithNewline = chunk.endsWith('\n')
      continue
    }

    const input = chunks.join('')
    parseInputs.push(input)
    const parsed = parseFrames(input)
    frames.push(...parsed.frames)
    chunks = parsed.remaining ? [parsed.remaining] : []
    previousChunkEndsWithNewline = parsed.remaining.endsWith('\n')
  }

  return {
    frames,
    parseInputs,
    remainingChunks: chunks,
    previousChunkEndsWithNewline,
  }
}
