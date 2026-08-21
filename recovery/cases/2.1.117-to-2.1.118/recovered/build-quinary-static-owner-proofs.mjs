import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse } from '../../../node_modules/acorn/dist/acorn.mjs'
import { TARGET118_QUINARY_STATIC_OWNER_OVERRIDES } from './quinary-static-owner-overrides.mjs'

const root = process.cwd()
const sourceRoot =
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
  path.join(root, '.recovery-tmp/semantic-trees/2.1.118/src')
const reportPath =
  process.env.CLAUDE_CODE_SEMANTIC_RESIDUE_REPORT ??
  path.join(
    root,
    '.recovery-tmp/residue-audits/2.1.117-to-2.1.118.typed-audit.json',
  )
const targetBundlePath = path.join(
  root,
  '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
)

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })
const descriptorAt = (value, start, end) => ({
  start,
  end,
  ...descriptor(value.subarray(start, end)),
})

const targetBundle = fs.readFileSync(targetBundlePath)
const targetText = targetBundle.toString()
const targetAst = parse(targetText, {
  ecmaVersion: 'latest',
  sourceType: 'module',
})
const targetFunctions = new Map(
  targetAst.body
    .filter(node => node.type === 'FunctionDeclaration' && node.id)
    .map(node => [node.id.name, node]),
)

const imported = await import(
  pathToFileURL(
    path.join(
      root,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ).href
)
const ts = imported.default ?? imported

const allOwners = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      '.recovery-tmp/generator-inputs/2.1.117-to-2.1.118.all-owners.json',
    ),
  ),
)
const report = JSON.parse(fs.readFileSync(reportPath))
const units = new Map(allOwners.rows.map(row => [row.targetIndex, row]))
const selected = new Set(
  TARGET118_QUINARY_STATIC_OWNER_OVERRIDES.map(row => row.targetIndex),
)
const residuesByUnit = new Map()
for (const residue of report.sourceRuntimeAddedOwnerResidueRows) {
  const targetIndex = residue.structural.index
  if (!selected.has(targetIndex)) continue
  const values = residuesByUnit.get(targetIndex) ?? []
  values.push([
    residue.literalKind,
    residue.value,
    residue.target.start,
    residue.target.end,
    residue.baselineOccurrenceCount,
    residue.targetOccurrenceNumber,
  ])
  residuesByUnit.set(targetIndex, values)
}

const proofSpecs = new Map([
  [
    6166,
    {
      role: 'module-export-registry',
      sourceDeclarations: [
        {
          name: 'shouldUseWIFAuth',
          targetMarkers: [
            'ANTHROPIC_UNIX_SOCKET',
            'CLAUDE_CODE_USE_BEDROCK',
            'CLAUDE_CODE_USE_MANTLE',
          ],
          sourceMarkers: [
            'isWIFActive()',
            'process.env.ANTHROPIC_UNIX_SOCKET',
            'process.env.CLAUDE_CODE_USE_MANTLE',
          ],
        },
        {
          name: 'describeHowToDisableAuthTokenSource',
          targetMarkers: [
            'claude /logout to sign out of claude.ai.',
            'Unset the apiKeyHelper setting.',
            'CCR host',
          ],
          sourceMarkers: [
            'claude /logout to sign out of claude.ai.',
            'Unset the apiKeyHelper setting.',
            'CCR host',
          ],
        },
      ],
    },
  ],
  [
    15119,
    {
      role: 'common-template-prefix-extraction',
      sourceDeclaration: 'getPlanModeV2Instructions',
      targetConsumerReferenceCount: 2,
      sourceTemplatePrefixCount: 2,
      targetMarkers: [
        '## Plan File Info:',
        '## Plan Workflow',
        'customInstructions',
      ],
      sourceMarkers: [
        'if (attachment.customInstructions)',
        'const agentCount = getPlanModeV2AgentCount()',
        'const exploreAgentCount = getPlanModeV2ExploreAgentCount()',
      ],
    },
  ],
  [
    17959,
    {
      role: 'module-export-registry',
      sourceDeclarations: [
        {
          name: 'recordSessionAlias',
          targetMarkers: ['NFC', 'utf8'],
          sourceMarkers: [
            ".normalize('NFC')",
            "readFile(aliasesPath, 'utf8')",
            'fsAppendFile(aliasesPath',
          ],
        },
        {
          name: 'recordForkContextRef',
          targetMarkers: ['fork-context-ref'],
          sourceMarkers: [
            "appendEntry({ type: 'fork-context-ref', ...entry })",
          ],
        },
      ],
    },
  ],
])

function parseTargetUnit(unit) {
  return parse(targetText.slice(unit.start, unit.end), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  })
}

function exportBinding(unitAst, propertyName) {
  const statement = unitAst.body[0]
  const call = statement?.type === 'ExpressionStatement' ? statement.expression : null
  if (call?.type !== 'CallExpression' || call.arguments[1]?.type !== 'ObjectExpression') {
    throw new Error(`Expected module export registry for ${propertyName}`)
  }
  const matches = call.arguments[1].properties.filter(property =>
    property.type === 'Property' &&
    !property.computed &&
    ((property.key.type === 'Identifier' && property.key.name === propertyName) ||
      (property.key.type === 'Literal' && property.key.value === propertyName)),
  )
  if (matches.length !== 1) {
    throw new Error(`Expected one target export ${propertyName}`)
  }
  const value = matches[0].value
  if (
    value.type !== 'ArrowFunctionExpression' ||
    value.params.length !== 0 ||
    value.body.type !== 'Identifier'
  ) {
    throw new Error(`Expected direct binding arrow for ${propertyName}`)
  }
  return value.body.name
}

function countIdentifier(node, name) {
  let count = 0
  function visit(value) {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const child of value) visit(child)
      return
    }
    if (value.type === 'Identifier' && value.name === name) count += 1
    for (const [key, child] of Object.entries(value)) {
      if (!['start', 'end', 'loc', 'range'].includes(key)) visit(child)
    }
  }
  visit(node)
  return count
}

function sourceFileFor(ownerPath) {
  const filename = path.join(sourceRoot, ownerPath.replace(/^src\//, ''))
  const source = fs.readFileSync(filename)
  const sourceFile = ts.createSourceFile(
    filename,
    source.toString(),
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  if (sourceFile.parseDiagnostics.length !== 0) {
    throw new Error(`Target118 source does not parse: ${filename}`)
  }
  return { filename, source, sourceFile }
}

function sourceFunction(tsSource, name) {
  const matches = tsSource.sourceFile.statements.filter(
    statement =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  )
  if (matches.length !== 1) {
    throw new Error(`Expected one source function ${name}`)
  }
  return matches[0]
}

const sourceFiles = new Map()
const expectedResidueCounts = new Map([
  [6166, 2],
  [15119, 1],
  [17959, 2],
])

const rows = TARGET118_QUINARY_STATIC_OWNER_OVERRIDES.map(override => {
  const unit = units.get(override.targetIndex)
  const residues = residuesByUnit.get(override.targetIndex) ?? []
  const spec = proofSpecs.get(override.targetIndex)
  if (
    !unit ||
    residues.length !== expectedResidueCounts.get(override.targetIndex) ||
    !spec
  ) {
    throw new Error(`Target118 quinary fixture misses u${override.targetIndex}`)
  }
  const tsSource = sourceFileFor(override.paths[0])
  sourceFiles.set(override.paths[0], descriptor(tsSource.source))
  const unitAst = parseTargetUnit(unit)
  let sourceProof

  if (spec.role === 'module-export-registry') {
    const declarations = spec.sourceDeclarations.map(declaration => {
      const binding = exportBinding(unitAst, declaration.name)
      const targetDeclaration = targetFunctions.get(binding)
      if (!targetDeclaration) {
        throw new Error(`Target binding ${binding} has no function declaration`)
      }
      const sourceDeclaration = sourceFunction(tsSource, declaration.name)
      const sourceStart = sourceDeclaration.getStart(tsSource.sourceFile)
      const sourceEnd = sourceDeclaration.end
      return {
        ...declaration,
        targetBinding: binding,
        targetDeclaration: descriptorAt(
          targetBundle,
          targetDeclaration.start,
          targetDeclaration.end,
        ),
        sourceDeclaration: descriptorAt(
          tsSource.source,
          sourceStart,
          sourceEnd,
        ),
      }
    })
    sourceProof = { role: spec.role, declarations }
  } else {
    const residueText = residues[0][1]
    const declarators = unitAst.body.flatMap(statement =>
      statement.type === 'VariableDeclaration' ? statement.declarations : [],
    )
    const matches = declarators.filter(
      declaration =>
        declaration.id.type === 'Identifier' &&
        declaration.init?.type === 'Literal' &&
        declaration.init.value === residueText,
    )
    if (matches.length !== 1) {
      throw new Error(`Expected one extracted plan-mode literal in u${unit.targetIndex}`)
    }
    const binding = matches[0].id.name
    const consumers = [...targetFunctions.values()].filter(
      node => countIdentifier(node.body, binding) === spec.targetConsumerReferenceCount,
    )
    if (consumers.length !== 1) {
      throw new Error(`Expected one target consumer of ${binding}`)
    }
    const sourceDeclarationName = spec.sourceDeclaration
    const sourceDeclaration = sourceFunction(tsSource, sourceDeclarationName)
    const sourceStart = sourceDeclaration.getStart(tsSource.sourceFile)
    const sourceEnd = sourceDeclaration.end
    sourceProof = {
      ...spec,
      sourceDeclarationName,
      targetBinding: binding,
      targetConsumerBinding: consumers[0].id.name,
      targetConsumer: descriptorAt(
        targetBundle,
        consumers[0].start,
        consumers[0].end,
      ),
      sourceDeclaration: descriptorAt(
        tsSource.source,
        sourceStart,
        sourceEnd,
      ),
    }
  }

  return {
    targetIndex: override.targetIndex,
    ownerPath: override.paths[0],
    behavior: override.behavior,
    target: {
      start: unit.start,
      end: unit.end,
      bytes: unit.end - unit.start,
      nodeType: unit.nodeType,
      sourceHash: unit.sourceHash,
      structuralClass: unit.structuralClass,
    },
    residues,
    sourceProof,
  }
})

const fixture = {
  schemaVersion: 1,
  case: '2.1.117-to-2.1.118',
  status: 'authenticated-quinary-static-source-owner',
  evidenceIds: [
    'target118-quinary-static-owner-target-fragment',
    'target118-quinary-static-owner-source-ast-test',
  ],
  inputs: {
    targetBundle: descriptor(targetBundle),
    sourceFiles: [...sourceFiles].map(([sourcePath, file]) => ({
      sourcePath,
      ...file,
    })),
  },
  summary: {
    units: rows.length,
    residues: rows.reduce((sum, row) => sum + row.residues.length, 0),
    indicesSha256: sha256(JSON.stringify(rows.map(row => row.targetIndex))),
    residueIdentitiesSha256: sha256(
      JSON.stringify(rows.flatMap(row => row.residues)),
    ),
  },
  rows,
}

const output = path.join(
  root,
  'recovery/test/recovery-2.1.118-quinary-static-owner-proofs.json',
)
fs.writeFileSync(output, `${JSON.stringify(fixture, null, 2)}\n`)
console.log(output, fixture.summary)
