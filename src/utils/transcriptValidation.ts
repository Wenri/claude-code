import { open } from 'fs/promises'
import { createInterface } from 'readline'

/** A resumable transcript must contain at least one user or assistant event. */
export async function hasTranscriptMessages(path: string): Promise<boolean> {
  let file
  try {
    file = await open(path, 'r')
  } catch {
    return false
  }
  try {
    const lines = createInterface({ input: file.createReadStream() })
    for await (const line of lines) {
      if (line.includes('"type":"user"') || line.includes('"type":"assistant"')) {
        lines.close()
        return true
      }
    }
    return false
  } catch {
    return false
  } finally {
    await file.close().catch(() => {})
  }
}
