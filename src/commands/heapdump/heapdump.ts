import {
  type MemoryDiagnostics,
  performHeapDump,
} from '../../utils/heapDumpService.js'

export async function call(): Promise<{ type: 'text'; value: string }> {
  const result = await performHeapDump()

  if (!result.success) {
    return {
      type: 'text',
      value: `Failed to create heap dump: ${result.error}`,
    }
  }

  const lines = [
    result.heapPath,
    result.diagPath,
    '',
    formatDiagnostics(result.diagnostics),
  ]
  lines.push(
    '',
    'Open the .heapsnapshot in Chrome DevTools → Memory → Load to inspect retainers.',
  )

  return {
    type: 'text',
    value: lines.join('\n'),
  }
}

function formatDiagnostics(diagnostics: MemoryDiagnostics): string {
  const { memoryUsage, resourceUsage, analysis } = diagnostics
  const otherExternal = memoryUsage.external - memoryUsage.arrayBuffers
  const unaccounted = Math.max(
    0,
    memoryUsage.rss - memoryUsage.heapTotal - memoryUsage.external,
  )
  const classification =
    memoryUsage.heapTotal > memoryUsage.external + unaccounted
      ? '— most memory is JS heap (inspect the .heapsnapshot)'
      : '— most memory is native (NOT in the .heapsnapshot)'
  const leakIndicators = analysis.potentialLeaks.length
    ? analysis.potentialLeaks.map(leak => `  ⚠ ${leak}`).join('\n')
    : '  (no obvious leak indicators)'

  return [
    `RSS ${formatGB(memoryUsage.rss)} (peak ${formatGB(resourceUsage.maxRSS)}) ${classification}`,
    `  JS heap        ${formatGB(memoryUsage.heapTotal).padStart(8)}  in snapshot`,
    `  array buffers  ${formatGB(memoryUsage.arrayBuffers).padStart(8)}  not in snapshot`,
    `  other external ${formatGB(otherExternal).padStart(8)}  not in snapshot`,
    `  unaccounted    ${formatGB(unaccounted).padStart(8)}  not in snapshot (code/JIT/stacks/allocator)`,
    leakIndicators,
  ].join('\n')
}

function formatGB(bytes: number): string {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}
