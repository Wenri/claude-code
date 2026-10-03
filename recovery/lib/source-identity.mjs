import crypto from 'node:crypto'

// Prefixes are explicit build roots, not a search for the last occurrence of
// src/ or node_modules/. Nested dependency copies must retain distinct paths.
export function canonicalSourcePath(source, prefixes) {
  if (typeof source !== 'string') return null
  const matching = prefixes.filter(prefix => source.startsWith(prefix))
  if (matching.length > 1) throw new Error(`Ambiguous source prefix: ${source}`)
  if (!matching.length) return null
  const relative = source.slice(matching[0].length)
  const parts = relative.split('/')
  if (!/^(src|node_modules|vendor)\//.test(relative) ||
      relative.includes('\\') || parts.some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Unsafe canonical source path: ${source}`)
  }
  return relative
}

export function indexSourceContents(sourceMap, prefixes) {
  if (!Array.isArray(sourceMap.sources) || !Array.isArray(sourceMap.sourcesContent) ||
      sourceMap.sources.length !== sourceMap.sourcesContent.length) {
    throw new Error('Source paths and contents must have equal lengths')
  }
  const result = new Map()
  for (let index = 0; index < sourceMap.sources.length; index += 1) {
    const source = sourceMap.sources[index]
    const canonical = canonicalSourcePath(source, prefixes)
    if (canonical === null) continue
    if (result.has(canonical)) throw new Error(`Canonical source collision: ${canonical}`)
    const content = sourceMap.sourcesContent[index]
    if (typeof content !== 'string') throw new Error(`Missing source contents: ${source}`)
    result.set(canonical, {
      source, index, content,
      sha256: crypto.createHash('sha256').update(content).digest('hex'),
    })
  }
  return result
}

export function identicalSourcePaths(left, right) {
  return new Set([...left].filter(([name, row]) => {
    const other = right.get(name)
    return other && row.sha256 === other.sha256 && row.content === other.content
  }).map(([name]) => name))
}
