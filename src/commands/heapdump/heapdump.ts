import {
  performHeapDump,
  type MemoryDiagnostics,
} from '../../utils/heapDumpService.js'

export async function call(): Promise<{ type: 'text'; value: string }> {
  const result = await performHeapDump()

  if (!result.success) {
    return {
      type: 'text',
      value: `Failed to create heap dump: ${result.error}`,
    }
  }

  return {
    type: 'text',
    value: [
      result.heapPath,
      result.diagPath,
      '',
      formatMemoryDiagnostics(result.diagnostics),
      '',
      'Open the .heapsnapshot in Chrome DevTools → Memory → Load to inspect retainers.',
    ].join('\n'),
  }
}

function formatMemoryDiagnostics(diagnostics: MemoryDiagnostics): string {
  const { memoryUsage, resourceUsage, analysis } = diagnostics
  const otherExternal = memoryUsage.external - memoryUsage.arrayBuffers
  const unaccounted = Math.max(
    0,
    memoryUsage.rss - memoryUsage.heapTotal - memoryUsage.external,
  )
  const memoryKind =
    memoryUsage.heapTotal > memoryUsage.external + unaccounted
      ? '— most memory is JS heap (inspect the .heapsnapshot)'
      : '— most memory is native (NOT in the .heapsnapshot)'
  const potentialLeaks = analysis.potentialLeaks.length
    ? analysis.potentialLeaks.map(leak => `  ⚠ ${leak}`).join('\n')
    : '  (no obvious leak indicators)'

  return [
    `RSS ${formatGB(memoryUsage.rss)} (peak ${formatGB(resourceUsage.maxRSS)}) ${memoryKind}`,
    `  JS heap        ${formatGB(memoryUsage.heapTotal).padStart(8)}  in snapshot`,
    `  array buffers  ${formatGB(memoryUsage.arrayBuffers).padStart(8)}  not in snapshot`,
    `  other external ${formatGB(otherExternal).padStart(8)}  not in snapshot`,
    `  unaccounted    ${formatGB(unaccounted).padStart(8)}  not in snapshot (code/JIT/stacks/allocator)`,
    potentialLeaks,
  ].join('\n')
}

function formatGB(bytes: number): string {
  return `${(bytes / 1073741824).toFixed(2)} GB`
}
