import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { selectStripAnsi } from '../cases/2.1.90-to-2.1.91/recovered/bun-stripansi-model.mjs'

const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url))
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_90_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_91_BUNDLE

function readSource(relativePath) {
  const source = fs.readFileSync(`${sourceRoot}${relativePath}`, 'utf8')
  const sourceMap = source.indexOf('//# sourceMappingURL=')
  return sourceMap === -1 ? source : source.slice(0, sourceMap)
}

function requiredBundle(filename, label) {
  assert.ok(filename, `${label} environment variable must be set`)
  return fs.readFileSync(filename, 'utf8')
}

function closestTimestampParent(messages, child, seen) {
  const childTimestamp = new Date(child.timestamp).getTime()
  if (Number.isNaN(childTimestamp)) return undefined
  let closest
  let closestDelta = Infinity
  for (const candidate of messages.values()) {
    if (seen.has(candidate.uuid)) continue
    const candidateTimestamp = new Date(candidate.timestamp).getTime()
    if (Number.isNaN(candidateTimestamp)) continue
    const delta = childTimestamp - candidateTimestamp
    if (delta >= 0 && delta <= 5000 && delta < closestDelta) {
      closest = candidate
      closestDelta = delta
    }
  }
  return closest
}

test('adds enabled non-builtin plugin bin directories after the inherited PATH', () => {
  const loader = readSource('utils/plugins/pluginLoader.ts')
  const snapshot = readSource('utils/bash/ShellSnapshot.ts')

  assert.match(loader, /export async function getEnabledPluginBinPaths/)
  assert.match(loader, /\.filter\(plugin => !plugin\.isBuiltin && plugin\.path\)/)
  assert.match(loader, /\.map\(plugin => join\(plugin\.path!, 'bin'\)\)/)
  assert.match(snapshot, /await getEnabledPluginBinPaths\(\)/)
  assert.match(snapshot, /pluginBinPaths\.map\(windowsPathToPosixPath\)/)
  assert.match(
    snapshot,
    /\[pathValue, \.\.\.normalizedPluginBinPaths\][\s\S]*?\.join\(':'\)/,
  )

  assert.match(
    requiredBundle(targetBundlePath, 'CLAUDE_CODE_2_1_91_BUNDLE'),
    /return [^.]+\.filter\(\([^)]*\)=>![^.]+\.isBuiltin&&[^.]+\.path\)\.map\(\([^)]*\)=>[^,]+\.path,"bin"\)\)/,
  )
})

test('falls back to the closest preceding transcript entry within five seconds', () => {
  const messages = new Map([
    [
      'too-old',
      { uuid: 'too-old', timestamp: '2026-04-02T12:00:00.000Z' },
    ],
    [
      'closest',
      { uuid: 'closest', timestamp: '2026-04-02T12:00:08.500Z' },
    ],
    [
      'future',
      { uuid: 'future', timestamp: '2026-04-02T12:00:11.000Z' },
    ],
  ])
  const child = {
    uuid: 'child',
    timestamp: '2026-04-02T12:00:10.000Z',
  }
  assert.equal(
    closestTimestampParent(messages, child, new Set())?.uuid,
    'closest',
  )
  assert.equal(
    closestTimestampParent(messages, child, new Set(['closest'])),
    undefined,
  )

  const source = readSource('utils/sessionStorage.ts')
  assert.match(source, /CHAIN_TIMESTAMP_FALLBACK_WINDOW_MS = 5000/)
  assert.match(source, /findClosestTimestampParent\(messages, currentMsg, seen\)/)
  assert.match(source, /logEvent\('tengu_chain_timestamp_fallback', \{\}\)/)
  assert.match(source, /delta >= 0/)

  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_91_BUNDLE',
  )
  assert.match(target, /tengu_chain_timestamp_fallback/)
  assert.match(target, /w>=0&&w<=yxY&&w<\$/)
  assert.match(target, /yxY=5000/)
})

test('maps Super+Delete to logical line kills and exposes auto permission mode', () => {
  const input = readSource('hooks/useTextInput.ts')
  const permissions = readSource('types/permissions.ts')
  const schemas = readSource('entrypoints/sdk/coreSchemas.ts')

  assert.match(input, /case key\.backspace:\s*if \(key\.super\) return killToLineStart/)
  assert.match(input, /case key\.delete:\s*if \(key\.super\) return killToLineEnd/)
  assert.match(
    permissions,
    /EXTERNAL_PERMISSION_MODES = \[\s*'acceptEdits',\s*'auto',/,
  )
  assert.doesNotMatch(permissions, /feature\('TRANSCRIPT_CLASSIFIER'\)/)
  assert.match(schemas, /'dontAsk',\s*'auto',/)

  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_91_BUNDLE',
  )
  assert.match(
    target,
    /case [^.]+\.backspace:if\([^.]+\.super\)return [^;]+;return [^.]+\.meta\|\|[^.]+\.ctrl/,
  )
  assert.match(
    target,
    /\["acceptEdits","auto","bypassPermissions","default","dontAsk","plan"\]/,
  )
})

test('keeps feedback visible and reports the precise unavailable reason', () => {
  const index = readSource('commands/feedback/index.ts')
  const feedback = readSource('commands/feedback/feedback.tsx')

  assert.match(index, /isEnabled: \(\) => true/)
  assert.match(feedback, /getFeedbackUnavailableReason\(\)/)
  assert.match(feedback, /when using Amazon Bedrock/)
  assert.match(feedback, /when using Vertex AI/)
  assert.match(feedback, /when using Microsoft Foundry/)
  assert.match(feedback, /CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC/)
  assert.match(feedback, /disabled by your organization's policy/)
  assert.match(
    feedback,
    /if \(unavailableReason\) \{\s*onDone\(unavailableReason\);\s*return null;/,
  )

  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_91_BUNDLE',
  )
  assert.match(
    target,
    /isEnabled:\(\)=>!0,load:\(\)=>Promise\.resolve\(\)\.then/,
  )
  assert.match(
    target,
    /\/feedback is not available when using Amazon Bedrock\. Report issues at/,
  )
})

test('protects a Windows rollback copy by matching the active executable size', () => {
  const source = readSource('utils/nativeInstaller/installer.ts')
  assert.match(source, /size: stats\.size/)
  assert.match(
    source,
    /else if \(getPlatform\(\)\.startsWith\('win32'\)\) \{[\s\S]*?stat\(dirs\.executable\)[\s\S]*?version\.size === currentExecutableStats\.size[\s\S]*?protectedVersions\.add\(version\.resolvedPath\)/,
  )

  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_91_BUNDLE',
  )
  assert.match(
    target,
    /mtime:[^.]+\.mtime,size:[^.]+\.size\}\)[\s\S]{0,900}else if\([^)]+\(\)\.startsWith\("win32"\)\)try\{let [^=]+=await [^(]+\([^.]+\.executable\);for\(let [^ ]+ of [^)]+\)if\([^.]+\.size===[^.]+\.size\)[^.]+\.add\([^.]+\.resolvedPath\)/,
  )
})

test('ships the shorter Edit anchor experiment and Bun stripANSI dependency path', () => {
  const prompt = readSource('tools/FileEditTool/prompt.ts')
  assert.match(prompt, /tengu_edit_minimalanchor_jrn/)
  assert.match(prompt, /Keep \\`old_string\\` minimal — usually 1-3 lines/)
  assert.match(prompt, /add the minimum extra context needed for uniqueness/)

  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_90_BUNDLE',
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_91_BUNDLE',
  )
  assert.equal(baseline.includes('Bun.stripANSI'), false)
  assert.equal(target.includes('Bun.stripANSI'), true)
  const fallback = value => value.replace(/\x1b\[[0-9;]*m/g, '')
  const fast = value => `fast:${value}`
  assert.equal(selectStripAnsi(undefined, fallback)('\x1b[31mred\x1b[0m'), 'red')
  assert.equal(selectStripAnsi({ stripANSI: fast }, fallback)('red'), 'fast:red')
  assert.equal(target.includes('tengu_edit_minimalanchor_jrn'), true)
  assert.equal(
    target.includes(
      'Keep `old_string` minimal — usually 1-3 lines, only enough to be unique in the file.',
    ),
    true,
  )
})

test('retains remote plan recovery already present in the recovered base', () => {
  const plans = readSource('utils/plans.ts')
  assert.match(plans, /getEnvironmentKind\(\) === null/)
  assert.match(plans, /findFileSnapshotEntry\(log\.messages, 'plan'\)/)
  assert.match(plans, /recoverPlanFromMessages\(log\)/)
  assert.match(plans, /await writeFile\(planPath, recovered/)
})
