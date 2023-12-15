#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_PLUGIN_PRUNE_COMMAND_EVIDENCE_IDS = Object.freeze([
  'target121-plugin-prune-authenticated-command-fragment',
  'target121-plugin-prune-handler-call-graph',
  'target121-plugin-prune-source-replay',
  'target121-plugin-prune-two-row-partition',
])

export const TARGET121_PLUGIN_PRUNE_COMMAND_OWNER_EVIDENCE = Object.freeze({
  key: `${CASE_NAME}:22106:plugin-prune-command`,
  targetIndex: 22106,
  paths: Object.freeze([
    'src/main.tsx',
    'src/cli/handlers/plugins.ts',
  ]),
  declarations: Object.freeze(['run', 'pluginPruneHandler']),
  residues: Object.freeze([
    Object.freeze({
      literalKind: 'property',
      value: 'pluginPruneHandler',
      start: 13837077,
      end: 13837095,
      targetOccurrenceNumber: 2,
    }),
    Object.freeze({
      literalKind: 'property',
      value: 'createSubcommandRoot',
      start: 13840517,
      end: 13840537,
      targetOccurrenceNumber: 24,
    }),
  ]),
  evidenceIds: TARGET121_PLUGIN_PRUNE_COMMAND_EVIDENCE_IDS,
  behavior:
    'Target121 adds the plugin prune handler and its Commander registration as one root-rendering command graph. The registration imports pluginPruneHandler and createSubcommandRoot together, passes the created Root to the handler, and the handler renders the prune result before waiting and exiting. The new prune registration also inserts the twenty-fourth createSubcommandRoot occurrence, making the later auto-mode occurrence a global-ordinal spill. This bounded two-file replay admits exactly those two u22106 rows and no build metadata or other run residue.',
})

export const TARGET121_PLUGIN_PRUNE_COMMAND_SOURCE_STATES = Object.freeze([
  Object.freeze({
    name: 'raw',
    main: Object.freeze({
      path: 'src/main.tsx',
      input: Object.freeze({
        bytes: 816314,
        sha256:
          'c4e91aae36588101d8280ac6375cdae4f7981361480ad53b93a4dfb19b87ed33',
      }),
      output: Object.freeze({
        bytes: 816431,
        sha256:
          '187faabc7e71e80b8f8868df2375afb1f694695e4e43807296a284107a2dc29a',
      }),
    }),
    handler: Object.freeze({
      path: 'src/cli/handlers/plugins.ts',
      input: Object.freeze({
        bytes: 35334,
        sha256:
          'bec139c4b18f0e606cb44963f347939d454e8cfe79accbed71d49ca5c45f803c',
      }),
      output: Object.freeze({
        bytes: 35562,
        sha256:
          '6cd43506319d48682d2b38aa9d6d3e7335aedfce56aeb88fc0860ec325a102d6',
      }),
    }),
  }),
  Object.freeze({
    name: 'package',
    main: Object.freeze({
      path: 'src/main.tsx',
      input: Object.freeze({
        bytes: 816786,
        sha256:
          'ecc8aa7337fb3f4bebaee045db279d1330367d9e2b9449b2f3cccf31b19a88fc',
      }),
      output: Object.freeze({
        bytes: 816903,
        sha256:
          '75171059e457d263cd9bdbfbaeed0a2c4786f9a1854b1c4fdf799273399b92f3',
      }),
    }),
    handler: Object.freeze({
      path: 'src/cli/handlers/plugins.ts',
      input: Object.freeze({
        bytes: 35334,
        sha256:
          'bec139c4b18f0e606cb44963f347939d454e8cfe79accbed71d49ca5c45f803c',
      }),
      output: Object.freeze({
        bytes: 35562,
        sha256:
          '6cd43506319d48682d2b38aa9d6d3e7335aedfce56aeb88fc0860ec325a102d6',
      }),
    }),
  }),
])

const OLD_MAIN_GRAPH = `    const {
      pluginPruneHandler
    } = await import('./cli/handlers/plugins.js');
    await pluginPruneHandler(options);`

const NEW_MAIN_GRAPH = `    const [{
      pluginPruneHandler
    }, {
      createSubcommandRoot
    }] = await Promise.all([import('./cli/handlers/plugins.js'), import('./cli/handlers/util.js')]);
    await pluginPruneHandler(await createSubcommandRoot(), options);`

const OLD_HANDLER = `export async function pluginPruneHandler(options: {
  scope?: string
  cowork?: boolean
  dryRun?: boolean
  yes?: boolean
}): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  const scope = options.scope || 'user'
  if (options.cowork && scope !== 'user') {
    cliError('--cowork can only be used with user scope')
  }
  if (
    !VALID_INSTALLABLE_SCOPES.includes(
      scope as (typeof VALID_INSTALLABLE_SCOPES)[number],
    )
  ) {
    cliError(
      \`Invalid scope: \${scope}. Must be one of: \${VALID_INSTALLABLE_SCOPES.join(', ')}.\`,
    )
  }
  logEvent('tengu_plugin_prune_command', {
    scope: scope as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    dry_run: options.dryRun ?? false,
  })
  await prunePlugins(scope as 'user' | 'project' | 'local', {
    dryRun: options.dryRun,
    yes: options.yes,
  })
}`

const NEW_HANDLER = `export async function pluginPruneHandler(
  root: Root,
  options: {
    scope?: string
    cowork?: boolean
    dryRun?: boolean
    yes?: boolean
  },
): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  const scope = options.scope || 'user'
  if (options.cowork && scope !== 'user') {
    cliError('--cowork can only be used with user scope')
  }
  if (
    !VALID_INSTALLABLE_SCOPES.includes(
      scope as (typeof VALID_INSTALLABLE_SCOPES)[number],
    )
  ) {
    cliError(
      \`Invalid scope: \${scope}. Must be one of: \${VALID_INSTALLABLE_SCOPES.join(', ')}.\`,
    )
  }
  logEvent('tengu_plugin_prune_command', {
    scope: scope as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    dry_run: options.dryRun ?? false,
  })
  const message = await prunePlugins(scope as 'user' | 'project' | 'local', {
    dryRun: options.dryRun,
    yes: options.yes,
  })
  root.render(
    React.createElement(
      RenderOnceAndExit,
      null,
      React.createElement(Text, null, message),
    ),
  )
  await root.waitUntilExit()
  process.exit(0)
}`

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function matches(actual, expected) {
  return actual.bytes === expected.bytes && actual.sha256 === expected.sha256
}

function replaceExactly(input, before, after, label) {
  const first = input.indexOf(before)
  const second = input.indexOf(before, first + 1)
  if (first < 0 || second >= 0) {
    throw new Error(`${CASE_NAME}: ${label} replay anchor differs`)
  }
  return input.slice(0, first) + after + input.slice(first + before.length)
}

export function buildTarget121PluginPruneMainOutput(mainSource) {
  return replaceExactly(
    mainSource,
    OLD_MAIN_GRAPH,
    NEW_MAIN_GRAPH,
    'plugin prune registration',
  )
}

export function buildTarget121PluginPruneHandlerOutput(handlerSource) {
  return replaceExactly(
    handlerSource,
    OLD_HANDLER,
    NEW_HANDLER,
    'plugin prune handler',
  )
}

export function applyTarget121PluginPruneCommandSourceRecovery({ sourceRoot }) {
  const sourceStates = TARGET121_PLUGIN_PRUNE_COMMAND_SOURCE_STATES
  const mainRelativePath = sourceStates[0].main.path
  const handlerRelativePath = sourceStates[0].handler.path
  const mainFilename = path.join(
    sourceRoot,
    mainRelativePath.replace(/^src\//, ''),
  )
  const handlerFilename = path.join(
    sourceRoot,
    handlerRelativePath.replace(/^src\//, ''),
  )
  const mainRaw = fs.readFileSync(mainFilename)
  const handlerRaw = fs.readFileSync(handlerFilename)
  const actual = {
    main: descriptor(mainRaw),
    handler: descriptor(handlerRaw),
  }
  const recoveredState = sourceStates.find(
    state =>
      matches(actual.main, state.main.output) &&
      matches(actual.handler, state.handler.output),
  )
  if (recoveredState) {
    return { status: 'already-recovered', state: recoveredState.name, files: [] }
  }
  const inputState = sourceStates.find(
    state =>
      matches(actual.main, state.main.input) &&
      matches(actual.handler, state.handler.input),
  )
  if (!inputState) {
    throw new Error(
      `${CASE_NAME}: plugin-prune replay requires one exact atomic raw or packaged source state`,
    )
  }
  const recoveredMain = Buffer.from(
    buildTarget121PluginPruneMainOutput(mainRaw.toString('utf8')),
  )
  const recoveredHandler = Buffer.from(
    buildTarget121PluginPruneHandlerOutput(handlerRaw.toString('utf8')),
  )
  if (
    !matches(descriptor(recoveredMain), inputState.main.output) ||
    !matches(descriptor(recoveredHandler), inputState.handler.output)
  ) {
    throw new Error(`${CASE_NAME}: plugin-prune replay produced unexpected source`)
  }
  fs.writeFileSync(mainFilename, recoveredMain)
  fs.writeFileSync(handlerFilename, recoveredHandler)
  return {
    status: 'recovered',
    state: inputState.name,
    files: [mainRelativePath, handlerRelativePath],
  }
}
