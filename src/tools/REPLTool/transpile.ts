let replTranspiler: Bun.Transpiler | undefined

const MODULE_LOADING_PATTERN = /\b(import|require)\s*\(/

function getReplTranspiler(): Bun.Transpiler {
  if (replTranspiler) return replTranspiler
  if (typeof Bun === 'undefined') throw Error('unreachable: Bun required')
  replTranspiler = new Bun.Transpiler({ loader: 'js', replMode: true })
  return replTranspiler
}

export function rejectModuleLoading(code: string): void {
  const match = MODULE_LOADING_PATTERN.exec(code)
  if (match) {
    throw Error(
      `Module loading (${match[1]}) is not available in REPL — the vm context is sealed. ` +
        "Use the tool globals instead: await Read({file_path: '...'}), await Glob({pattern: '...'}), the registered shell tool, etc.",
    )
  }
}

export function transpileReplCode(code: string): string {
  const transformed = getReplTranspiler().transformSync(code)
  rejectModuleLoading(transformed)
  return transformed
}

export function unwrapReplResult(value: unknown): unknown {
  if (value !== null && typeof value === 'object' && 'value' in value) {
    return (value as { value: unknown }).value
  }
  return value
}
