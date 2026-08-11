let replTranspiler: Bun.Transpiler | undefined

const MODULE_LOADING_KINDS: Record<string, string> = {
  'import-statement': 'import',
  'dynamic-import': 'import',
  'require-call': 'require',
}

function getReplTranspiler(): Bun.Transpiler {
  if (replTranspiler) return replTranspiler
  if (typeof Bun === 'undefined') throw Error('unreachable: Bun required')
  replTranspiler = new Bun.Transpiler({ loader: 'js', replMode: true })
  return replTranspiler
}

export function rejectModuleLoading(
  transpiler: Bun.Transpiler,
  code: string,
): void {
  let imports: ReturnType<Bun.Transpiler['scanImports']>
  try {
    imports = transpiler.scanImports(code.replace(/^#!.*\n?/, ''))
  } catch {
    return
  }
  for (const { kind } of imports) {
    const moduleLoadingKind = MODULE_LOADING_KINDS[kind]
    if (moduleLoadingKind) {
      throw Error(
        `Module loading (${moduleLoadingKind}) is not available in REPL — the vm context is sealed. ` +
          "Use the tool globals instead: await Read({file_path: '...'}), await Glob({pattern: '...'}), the registered shell tool, etc.",
      )
    }
  }
}

export function transpileReplCode(code: string): string {
  const transpiler = getReplTranspiler()
  const transformed = transpiler.transformSync(code)
  rejectModuleLoading(transpiler, code)
  return transformed
}

export function unwrapReplResult(value: unknown): unknown {
  if (value !== null && typeof value === 'object' && 'value' in value) {
    return (value as { value: unknown }).value
  }
  return value
}
