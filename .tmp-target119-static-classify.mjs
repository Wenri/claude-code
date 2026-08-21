import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from './recovery/node_modules/acorn/dist/acorn.mjs'

const imported = await import(
  pathToFileURL(
    path.join(
      process.cwd(),
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ).href,
)
const ts = imported.default ?? imported
const sourceRoot = path.join(
  process.cwd(),
  '.recovery-tmp/semantic-trees/2.1.119/src',
)

const report = JSON.parse(
  fs.readFileSync(
    '.recovery-tmp/residue-audits/2.1.118-to-2.1.119.typed-audit.json',
  ),
)
const analysis = JSON.parse(
  fs.readFileSync('recovery/test/recovery-2.1.119-owner-residue-analysis.json'),
)
const daemon = JSON.parse(
  fs.readFileSync(
    'recovery/test/recovery-2.1.119-daemon-cluster-residue-proofs.json',
  ),
)
const safe = JSON.parse(
  fs.readFileSync(
    'recovery/test/recovery-2.1.119-nondaemon-static-owner-proofs.json',
  ),
)
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      'recovery/cases/2.1.118-to-2.1.119/structural/generated-delta.json.gz',
    ),
  ),
)
const bundle = fs.readFileSync(
  '.recovery-tmp/authenticated-artifacts/2.1.119-linux-x64/cli.inner.js',
  'utf8',
)
const regions = new Map(
  structural.regions.map(region => [region.target.index, region]),
)
const excluded = new Set(
  [...daemon.rows, ...safe.rows].map(row => row.targetIndex),
)
const remaining = new Set(
  analysis.analysis.sourceGapReplay.ownerSupplementRequired.targetIndices.filter(
    targetIndex => !excluded.has(targetIndex),
  ),
)

const OWNER_OVERRIDES = new Map([
  [2244, 'utils/sessionStoragePortable.ts'],
  [6644, 'services/analytics/growthbook.ts'],
  [10175, 'entrypoints/sdk/coreSchemas.ts'],
  [12160, 'utils/udsClient.ts'],
  [12161, 'utils/udsClient.ts'],
  [12162, 'utils/udsClient.ts'],
  [12165, 'utils/udsClient.ts'],
  [12489, 'utils/model/check1mAccess.ts'],
  [12727, 'utils/prStatus.ts'],
  [12728, 'utils/prStatus.ts'],
  [12736, 'utils/prStatus.ts'],
  [15464, 'commands/autofix-pr/autofix-pr.tsx'],
  [15473, 'commands/autofix-pr/autofix-pr.tsx'],
  [15690, 'commands/autocompact/autocompact.tsx'],
  [16919, 'services/proTrial.ts'],
  [16925, 'services/proTrial.ts'],
  [17435, 'utils/permissions/permissions.ts'],
  [17438, 'utils/permissions/permissions.ts'],
  [17642, 'components/agents/AgentDetail.tsx'],
  [17980, 'commands/exit/exit.tsx'],
  [17985, 'commands/exit/exit-noninteractive.ts'],
  [18156, 'utils/settings/configSettings.ts'],
  [18157, 'utils/settings/configSettings.ts'],
  [20516, 'remote/SessionsWebSocket.ts'],
  [20776, 'cli/bg.ts'],
  [20874, 'hooks/useAwaySummary.ts'],
  [20880, 'hooks/useJobStateNameSync.ts'],
  [21281, 'components/ProTrialStartScreen.tsx'],
  [21591, 'services/mcp/headlessConnectionManager.ts'],
  [21605, 'migrations/migrateSonnet1mToSonnet45.ts'],
  [21613, 'migrations/resetProToOpusDefault.ts'],
  [21691, 'cli/transports/HybridTransport.ts'],
])

const BUILD_METADATA = new Map([
  [
    'ISSUES_EXPLAINER',
    'report the issue at https://github.com/anthropics/claude-code/issues',
  ],
  ['PACKAGE_URL', '@anthropic-ai/claude-code'],
  ['README_URL', 'https://code.claude.com/docs/en/overview'],
  ['VERSION', '2.1.119'],
  ['FEEDBACK_CHANNEL', 'https://github.com/anthropics/claude-code/issues'],
  ['BUILD_TIME', '2026-04-23T19:08:52Z'],
  ['GIT_SHA', '6f68554839756189e277b8285a18fe47acd9a5a1'],
])

function canonicalFlags(value) {
  return [...value].sort().join('')
}

function identity(kind, value) {
  return JSON.stringify([
    kind,
    kind === 'regexp'
      ? { pattern: value.pattern, flags: canonicalFlags(value.flags) }
      : value,
  ])
}

function parseRegExp(text) {
  if (!text.startsWith('/')) return null
  let escaped = false
  let inClass = false
  for (let index = 1; index < text.length; index += 1) {
    const character = text[index]
    if (escaped) escaped = false
    else if (character === '\\') escaped = true
    else if (character === '[') inClass = true
    else if (character === ']' && inClass) inClass = false
    else if (character === '/' && !inClass) {
      return {
        pattern: text.slice(1, index),
        flags: canonicalFlags(text.slice(index + 1)),
      }
    }
  }
  return null
}

const sourceCache = new Map()
function sourceValues(relative) {
  const cached = sourceCache.get(relative)
  if (cached) return cached
  const filename = path.join(sourceRoot, relative)
  const source = fs.readFileSync(filename, 'utf8')
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const values = new Set()
  const add = (kind, value) => values.add(identity(kind, value))
  function visit(node) {
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) {
      add('string', node.text)
    } else if (ts.isJsxText(node)) {
      const value = node.getText(sourceFile)
      if (value) add('string', value)
    } else if (ts.isNumericLiteral(node)) {
      add('number', String(Number(node.text.replaceAll('_', ''))))
    } else if (ts.isRegularExpressionLiteral(node)) {
      const value = parseRegExp(node.getText(sourceFile))
      if (value) add('regexp', value)
    }
    const named =
      (ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isPropertyDeclaration(node) ||
        ts.isPropertySignature(node) ||
        ts.isMethodSignature(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node) ||
        ts.isBindingElement(node) ||
        ts.isJsxAttribute(node) ||
        ts.isImportSpecifier(node) ||
        ts.isExportSpecifier(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    const property = named
      ? node.name.text
      : ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name)
        ? node.name.text
        : undefined
    if (property !== undefined) add('property', property)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  sourceCache.set(relative, values)
  return values
}

function walk(node, parents, occurrences, cacheBindings) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, parents, occurrences, cacheBindings)
    return
  }
  if (node.type === 'Literal' || node.type === 'TemplateElement') {
    occurrences.push({ node, parents })
  }
  if (
    ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(node.type) &&
    node.computed === false &&
    node.key?.type === 'Identifier'
  ) {
    occurrences.push({ node: node.key, parents: [...parents, node] })
  }
  if (
    node.type === 'MemberExpression' &&
    node.computed === false &&
    node.property?.type === 'Identifier'
  ) {
    occurrences.push({ node: node.property, parents: [...parents, node] })
  }
  if (
    node.type === 'VariableDeclarator' &&
    node.id?.type === 'Identifier' &&
    node.init?.type === 'CallExpression' &&
    node.init.callee?.type === 'MemberExpression' &&
    node.init.callee.computed === false &&
    node.init.callee.property?.name === 'c' &&
    node.init.arguments[0]?.type === 'Literal' &&
    typeof node.init.arguments[0].value === 'number'
  ) {
    cacheBindings.add(node.id.name)
  }
  const next = typeof node.type === 'string' ? [...parents, node] : parents
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
      walk(child, next, occurrences, cacheBindings)
    }
  }
}

function metadataObject(occurrence) {
  const object = [...occurrence.parents]
    .reverse()
    .find(parent => parent.type === 'ObjectExpression')
  if (!object || object.properties.length !== BUILD_METADATA.size) return false
  const actual = new Map()
  for (const property of object.properties) {
    if (
      property.type !== 'Property' ||
      property.computed ||
      property.key.type !== 'Identifier' ||
      property.value.type !== 'Literal' ||
      typeof property.value.value !== 'string'
    ) {
      return false
    }
    actual.set(property.key.name, property.value.value)
  }
  return (
    actual.size === BUILD_METADATA.size &&
    [...BUILD_METADATA].every(([key, value]) => actual.get(key) === value)
  )
}

function isPromiseResolveMember(node) {
  return (
    node?.type === 'MemberExpression' &&
    node.computed === false &&
    node.object?.type === 'Identifier' &&
    node.object.name === 'Promise' &&
    node.property?.type === 'Identifier' &&
    node.property.name === 'resolve'
  )
}

function classifyTarget(residue, occurrence, cacheBindings) {
  const parent = occurrence.parents.at(-1)
  if (metadataObject(occurrence)) return 'build-metadata-object-expansion'
  if (
    residue.literalKind === 'property' &&
    residue.value === 'resolve' &&
    isPromiseResolveMember(parent)
  ) {
    return 'dynamic-import-promise-resolve'
  }
  if (
    residue.literalKind === 'property' &&
    residue.value === 'then' &&
    parent?.type === 'MemberExpression' &&
    parent.object?.type === 'CallExpression' &&
    isPromiseResolveMember(parent.object.callee)
  ) {
    return 'dynamic-import-promise-then'
  }
  if (
    residue.literalKind === 'property' &&
    residue.value === 'createElement' &&
    parent?.type === 'MemberExpression' &&
    occurrence.parents.some(
      ancestor => ancestor.type === 'CallExpression' && ancestor.callee === parent,
    )
  ) {
    return 'jsx-create-element-lowering'
  }
  if (
    residue.literalKind === 'property' &&
    residue.value === 'Fragment' &&
    parent?.type === 'MemberExpression'
  ) {
    return 'jsx-fragment-lowering'
  }
  if (
    residue.literalKind === 'property' &&
    residue.value === 'default' &&
    parent?.type === 'MemberExpression' &&
    occurrence.parents.some(
      ancestor =>
        ancestor.type === 'CallExpression' &&
        (ancestor.callee === parent || ancestor.callee?.object === parent),
    )
  ) {
    return 'default-import-call-lowering'
  }
  if (
    residue.literalKind === 'number' &&
    occurrence.parents.some(
      ancestor =>
        (ancestor.type === 'MemberExpression' &&
          ancestor.computed &&
          ancestor.property === occurrence.node &&
          ancestor.object?.type === 'Identifier' &&
          cacheBindings.has(ancestor.object.name)) ||
        (ancestor.type === 'CallExpression' &&
          ancestor.arguments.includes(occurrence.node) &&
          ancestor.callee?.type === 'MemberExpression' &&
          ancestor.callee.computed === false &&
          ancestor.callee.property?.name === 'c'),
    )
  ) {
    return 'react-compiler-cache-index'
  }
  if (
    residue.literalKind === 'string' &&
    residue.value === 'react.memo_cache_sentinel' &&
    occurrence.parents.some(
      ancestor =>
        ancestor.type === 'CallExpression' &&
        ancestor.callee?.type === 'MemberExpression' &&
        ancestor.callee.object?.name === 'Symbol' &&
        ancestor.callee.property?.name === 'for',
    )
  ) {
    return 'react-compiler-cache-sentinel'
  }
  if (
    residue.literalKind === 'string' &&
    residue.value === 'u' &&
    occurrence.parents.some(
      ancestor =>
        ancestor.type === 'BinaryExpression' &&
        ancestor.operator === '<' &&
        ((ancestor.left?.type === 'UnaryExpression' &&
          ancestor.left.operator === 'typeof') ||
          (ancestor.right?.type === 'UnaryExpression' &&
            ancestor.right.operator === 'typeof')),
    )
  ) {
    return 'minified-typeof-undefined'
  }
  return null
}

const grouped = new Map()
for (const residue of report.sourceRuntimeAddedOwnerResidueRows) {
  const targetIndex = residue.structural.index
  if (!remaining.has(targetIndex)) continue
  const rows = grouped.get(targetIndex) ?? []
  rows.push(residue)
  grouped.set(targetIndex, rows)
}

for (const [targetIndex, residues] of grouped) {
  const region = regions.get(targetIndex)
  const unit = bundle.slice(region.target.start, region.target.end)
  const occurrences = []
  const cacheBindings = new Set()
  walk(
    parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }),
    [],
    occurrences,
    cacheBindings,
  )
  const owners = [
    OWNER_OVERRIDES.get(targetIndex) ??
      [...new Set(residues.flatMap(row => row.ownerPaths))][0],
  ]
  const ownerValues = new Map(owners.map(owner => [owner, sourceValues(owner)]))
  const roles = residues.map(residue => {
    const sourceOwners = owners.filter(owner =>
      ownerValues.get(owner).has(identity(residue.literalKind, residue.value)),
    )
    if (sourceOwners.length > 0) {
      return { role: 'current-owner-file-ast', sourceOwners }
    }
    const occurrence = occurrences.find(
      item =>
        item.node.start + region.target.start === residue.target.start &&
        item.node.end + region.target.start === residue.target.end,
    )
    if (!occurrence) throw new Error(`u${targetIndex}: occurrence absent`)
    return {
      role: classifyTarget(residue, occurrence, cacheBindings) ?? 'unclassified',
      value: residue.value,
      kind: residue.literalKind,
    }
  })
  const counts = Object.fromEntries(
    [...new Set(roles.map(row => row.role))]
      .sort()
      .map(role => [role, roles.filter(row => row.role === role).length]),
  )
  process.stdout.write(
    `${JSON.stringify({
      targetIndex,
      owners,
      residues: roles.length,
      closed: !roles.some(row => row.role === 'unclassified'),
      counts,
      unclassified: roles
        .filter(row => row.role === 'unclassified')
        .map(row => [row.kind, row.value]),
    })}\n`,
  )
}
