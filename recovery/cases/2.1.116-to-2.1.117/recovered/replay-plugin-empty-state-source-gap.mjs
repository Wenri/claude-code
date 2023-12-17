#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_PLUGIN_EMPTY_STATE_CONTEXT_FILES = Object.freeze([
  Object.freeze({
    path: 'src/ink.ts',
    bytes: 3887,
    sha256: 'e2c0463ef56c61433441447197dd90f3dde4b4de7ee645b88cad17eadba9ac4e',
  }),
])

export const TARGET117_PLUGIN_EMPTY_STATE_FILES = Object.freeze([
  Object.freeze({
    path: 'src/commands/plugin/DiscoverPlugins.tsx',
    declaration: 'EmptyStateMessage',
    raw: Object.freeze({
      bytes: 107189,
      sha256: '5bdf2ca8ca3069c79c687a8d846ec6ea008da252b316f86d8cdcad1013adb873',
    }),
    postimage: Object.freeze({
      bytes: 107743,
      sha256: 'fc028bf514957d31de90a1216c09c5d0a8c923900923e88a34ad97415557850e',
    }),
  }),
  Object.freeze({
    path: 'src/utils/plugins/marketplaceHelpers.ts',
    declaration: 'EmptyMarketplaceReason',
    raw: Object.freeze({
      bytes: 18217,
      sha256: '4bf2b69a2e3f0e1ed7a74b84aee4480e0a47b197e473d13d721fc7b63d32f8ae',
    }),
    postimage: Object.freeze({
      bytes: 18253,
      sha256: '36349ee31e742a9e2ac3f9f9ccfd2bf467d4ef1a1c6d00f32a637daa2138db79',
    }),
  }),
  Object.freeze({
    path: 'src/components/design-system/EmptyState.tsx',
    declaration: 'EmptyState',
    raw: null,
    postimage: Object.freeze({
      bytes: 427,
      sha256: '43fc9440c08858dbdd4036bbf09d7fb7a0c7ca11df14446b1a6feded5e49449b',
    }),
  }),
])

const TARGET_UNIT_EVIDENCE =
  'target117-plugin-empty-state-complete-target-unit-proof'
const SHARED_COMPONENT_EVIDENCE =
  'target117-shared-empty-state-target-unit-proof'
const PROJECT_REASON_EVIDENCE =
  'target117-plugin-project-installed-dependency-proof'
const SOURCE_REPLAY_EVIDENCE =
  'target117-plugin-empty-state-source-replay-test'

export const TARGET117_PLUGIN_EMPTY_STATE_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:16097`,
    targetIndex: 16097,
    paths: Object.freeze([
      'src/commands/plugin/DiscoverPlugins.tsx',
      'src/components/design-system/EmptyState.tsx',
      'src/utils/plugins/marketplaceHelpers.ts',
    ]),
    declarations: Object.freeze([
      'EmptyStateMessage',
      'EmptyState',
      'DiscoverPlugins',
      'EmptyMarketplaceReason',
    ]),
    evidenceIds: Object.freeze([
      TARGET_UNIT_EVIDENCE,
      SHARED_COMPONENT_EVIDENCE,
      PROJECT_REASON_EVIDENCE,
      SOURCE_REPLAY_EVIDENCE,
    ]),
    behavior:
      'Target117 renders the no-marketplace default through the shared EmptyState runtime with its exact hint, retains the coupled project-only/global install routing and reason type, and keeps the seven-slot compiled switch cache contiguous; the recovered design-system path is an explicitly bounded module-neighbor inference because the authenticated bundle has no source map.',
  }),
])

export const TARGET117_EMPTY_STATE_SOURCE = [
  "import * as React from 'react'",
  "import { Box, Text } from '../../ink.js'",
  '',
  'type Props = {',
  '  children: React.ReactNode',
  '  hint?: React.ReactNode',
  '}',
  '',
  'export function EmptyState({ children, hint }: Props): React.ReactNode {',
  '  if (!hint) return <Text dimColor={true}>{children}</Text>',
  '',
  '  return (',
  '    <Box flexDirection="column">',
  '      <Text dimColor={true}>{children}</Text>',
  '      <Text dimColor={true}>{hint}</Text>',
  '    </Box>',
  '  )',
  '}',
  '',
].join('\n')

const DISCOVER_TRANSFORMS = Object.freeze([
  Object.freeze({
    label: 'shared EmptyState import',
    before:
      "import { ConfigurableShortcutHint } from '../../components/ConfigurableShortcutHint.js';",
    after: [
      "import { ConfigurableShortcutHint } from '../../components/ConfigurableShortcutHint.js';",
      "import { EmptyState } from '../../components/design-system/EmptyState.js';",
    ].join('\n'),
  }),
  Object.freeze({
    label: 'all-scope installed-state import',
    before:
      "import { isPluginGloballyInstalled } from '../../utils/plugins/installedPluginsManager.js';",
    after:
      "import { isPluginGloballyInstalled, isPluginInstalled } from '../../utils/plugins/installedPluginsManager.js';",
  }),
  Object.freeze({
    label: 'all-scope installed-state classification',
    before: [
      '                // Only block when globally installed (user/managed scope).',
      '                // Project/local-scope installs don\'t block — user may want to',
      '                // promote to user scope so it\'s available everywhere (gh-29997).',
      '                isInstalled: isPluginGloballyInstalled(pluginId)',
    ].join('\n'),
    after: '                isInstalled: isPluginInstalled(pluginId)',
  }),
  Object.freeze({
    label: 'targeted-plugin global-install gate',
    before: '            if (foundPlugin.isInstalled) {',
    after:
      '            if (isPluginGloballyInstalled(foundPlugin.pluginId)) {',
  }),
  Object.freeze({
    label: 'project-only installed reason producer',
    before: [
      '          const reason = await detectEmptyMarketplaceReason({',
      '            configuredMarketplaceCount: configuredCount,',
      '            failedMarketplaceCount: failures.length',
      '          });',
      '          setEmptyReason(reason);',
    ].join('\n'),
    after: [
      '          let reason = await detectEmptyMarketplaceReason({',
      '            configuredMarketplaceCount: configuredCount,',
      '            failedMarketplaceCount: failures.length',
      '          });',
      "          if (reason === 'all-plugins-installed' && allPlugins.length > 0 && allPlugins.every(plugin => plugin.isInstalled && !isPluginGloballyInstalled(plugin.pluginId)) && !allPlugins.some(plugin => isPluginBlockedByPolicy(plugin.pluginId))) {",
      "            reason = 'all-plugins-project-installed';",
      '          }',
      '          setEmptyReason(reason);',
    ].join('\n'),
  }),
  Object.freeze({
    label: 'seven-slot empty-state switch cache',
    before: 'function EmptyStateMessage(t0) {\n  const $ = _c(6);',
    after: 'function EmptyStateMessage(t0) {\n  const $ = _c(7);',
  }),
  Object.freeze({
    label: 'project-only installed empty state',
    before: '    case "no-marketplaces-configured":',
    after: [
      '    case "all-plugins-project-installed":',
      '      {',
      '        let t1;',
      '        if ($[5] === Symbol.for("react.memo_cache_sentinel")) {',
      '          t1 = <><Text dimColor={true}>All available plugins are installed for this project.</Text><Text dimColor={true}>Use the Browse tab to install at user scope.</Text></>;',
      '          $[5] = t1;',
      '        } else {',
      '          t1 = $[5];',
      '        }',
      '        return t1;',
      '      }',
      '    case "no-marketplaces-configured":',
    ].join('\n'),
  }),
  Object.freeze({
    label: 'shared no-marketplace empty state',
    before: [
      '        if ($[5] === Symbol.for("react.memo_cache_sentinel")) {',
      '          t1 = <><Text dimColor={true}>No plugins available.</Text><Text dimColor={true}>Add a marketplace first using the Marketplaces tab.</Text></>;',
      '          $[5] = t1;',
      '        } else {',
      '          t1 = $[5];',
      '        }',
    ].join('\n'),
    after: [
      '        if ($[6] === Symbol.for("react.memo_cache_sentinel")) {',
      '          t1 = <EmptyState hint="Add a marketplace first using the Marketplaces tab.">No plugins available.</EmptyState>;',
      '          $[6] = t1;',
      '        } else {',
      '          t1 = $[6];',
      '        }',
    ].join('\n'),
  }),
])

const MARKETPLACE_REASON_TRANSFORM = Object.freeze({
  label: 'project-only installed reason type',
  before: "  | 'all-plugins-installed'",
  after: [
    "  | 'all-plugins-installed'",
    "  | 'all-plugins-project-installed'",
  ].join('\n'),
})

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function descriptorsEqual(left, right) {
  return left.bytes === right.bytes && left.sha256 === right.sha256
}

function occurrenceCount(source, needle) {
  let count = 0
  let offset = 0
  while ((offset = source.indexOf(needle, offset)) !== -1) {
    count++
    offset += needle.length
  }
  return count
}

function replaceOnce(source, transform) {
  const count = occurrenceCount(source, transform.before)
  if (count !== 1) {
    throw new Error(
      `${transform.label}: expected one replay anchor, got ${count}`,
    )
  }
  return source.replace(transform.before, transform.after)
}

function sourceFilename(sourceRoot, sourcePath) {
  if (!sourcePath.startsWith('src/')) {
    throw new Error(`${sourcePath}: expected a normalized src path`)
  }
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, sourcePath.slice(4))
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${sourcePath}: escapes the supplied source root`)
  }
  return filename
}

function readRealFile(filename, sourcePath) {
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${sourcePath}: expected a real source file`)
  }
  return { bytes: fs.readFileSync(filename), mode: status.mode }
}

function assertContext(sourceRoot) {
  for (const expected of TARGET117_PLUGIN_EMPTY_STATE_CONTEXT_FILES) {
    const filename = sourceFilename(sourceRoot, expected.path)
    if (!fs.existsSync(filename)) {
      throw new Error(`${expected.path}: required Target117 context is absent`)
    }
    const actual = descriptor(readRealFile(filename, expected.path).bytes)
    if (!descriptorsEqual(actual, expected)) {
      throw new Error(
        `${expected.path}: refusing non-Target117 context ${actual.bytes}/${actual.sha256}`,
      )
    }
  }
}

function classifyFile(sourceRoot, expected) {
  const filename = sourceFilename(sourceRoot, expected.path)
  if (!fs.existsSync(filename)) {
    if (expected.raw === null) {
      return { expected, filename, input: null, mode: 0o644, state: 'raw' }
    }
    throw new Error(`${expected.path}: required Target117 raw source is absent`)
  }
  const { bytes, mode } = readRealFile(filename, expected.path)
  const actual = descriptor(bytes)
  if (expected.raw && descriptorsEqual(actual, expected.raw)) {
    return { expected, filename, input: bytes, mode, state: 'raw' }
  }
  if (descriptorsEqual(actual, expected.postimage)) {
    return { expected, filename, input: bytes, mode, state: 'postimage' }
  }
  const rawDescription = expected.raw
    ? `${expected.raw.bytes}/${expected.raw.sha256}`
    : 'absent'
  throw new Error(
    `${expected.path}: expected raw ${rawDescription} or postimage ${expected.postimage.bytes}/${expected.postimage.sha256}, got ${actual.bytes}/${actual.sha256}`,
  )
}

function recoverFile(file) {
  let output
  if (file.expected.path === 'src/commands/plugin/DiscoverPlugins.tsx') {
    output = file.input.toString('utf8')
    for (const transform of DISCOVER_TRANSFORMS) {
      output = replaceOnce(output, transform)
    }
  } else if (
    file.expected.path === 'src/utils/plugins/marketplaceHelpers.ts'
  ) {
    output = replaceOnce(
      file.input.toString('utf8'),
      MARKETPLACE_REASON_TRANSFORM,
    )
  } else if (
    file.expected.path === 'src/components/design-system/EmptyState.tsx'
  ) {
    if (file.input !== null) {
      throw new Error(`${file.expected.path}: expected an absent raw source`)
    }
    output = TARGET117_EMPTY_STATE_SOURCE
  } else {
    throw new Error(`${file.expected.path}: missing replay transform`)
  }
  const bytes = Buffer.from(output)
  const actual = descriptor(bytes)
  if (!descriptorsEqual(actual, file.expected.postimage)) {
    throw new Error(
      `${file.expected.path}: replay drift ${actual.bytes}/${actual.sha256}`,
    )
  }
  return bytes
}

function stageOutputs(outputs) {
  const staged = []
  try {
    for (const { file, output } of outputs) {
      fs.mkdirSync(path.dirname(file.filename), { recursive: true })
      const temporary = `${file.filename}.target117-empty-state-${process.pid}-${crypto.randomBytes(6).toString('hex')}.tmp`
      fs.writeFileSync(temporary, output, { flag: 'wx', mode: file.mode })
      staged.push({ file, temporary })
    }
    for (const { file, temporary } of staged) {
      fs.renameSync(temporary, file.filename)
    }
  } finally {
    for (const { temporary } of staged) {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
    }
  }
}

export function applyTarget117PluginEmptyStateSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  assertContext(sourceRoot)
  const files = TARGET117_PLUGIN_EMPTY_STATE_FILES.map(expected =>
    classifyFile(sourceRoot, expected),
  )
  const states = new Set(files.map(file => file.state))
  if (states.size === 1 && states.has('postimage')) {
    return Object.freeze({
      caseName: CASE_NAME,
      status: 'already-recovered',
      files: TARGET117_PLUGIN_EMPTY_STATE_FILES,
      ownerOverrides: TARGET117_PLUGIN_EMPTY_STATE_OWNER_OVERRIDES.length,
    })
  }
  if (states.size !== 1 || !states.has('raw')) {
    throw new Error(
      `Refusing mixed Target117 plugin EmptyState recovery: ${files.map(file => `${file.expected.path}=${file.state}`).join(', ')}`,
    )
  }

  const outputs = files.map(file => ({ file, output: recoverFile(file) }))
  stageOutputs(outputs)
  for (const expected of TARGET117_PLUGIN_EMPTY_STATE_FILES) {
    if (classifyFile(sourceRoot, expected).state !== 'postimage') {
      throw new Error(`${expected.path}: written replay did not retain postimage`)
    }
  }

  return Object.freeze({
    caseName: CASE_NAME,
    status: 'recovered',
    files: TARGET117_PLUGIN_EMPTY_STATE_FILES,
    ownerOverrides: TARGET117_PLUGIN_EMPTY_STATE_OWNER_OVERRIDES.length,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = applyTarget117PluginEmptyStateSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
