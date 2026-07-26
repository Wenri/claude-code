import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { gzipSync } from 'node:zlib'
import { parse } from 'acorn'
import * as eslintScope from 'eslint-scope'

const NORMALIZATION_VERSION = 1
const STRUCTURAL_FINGERPRINT_VERSION = 1
const SKIPPED_AST_FIELDS = new Set([
  'comments',
  'end',
  'loc',
  'parent',
  'range',
  'raw',
  'sourceFile',
  'start',
  'tokens',
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function fileEvidence(filename) {
  const bytes = fs.readFileSync(filename)
  return {
    name: path.basename(filename),
    bytes: bytes.length,
    sha256: sha256(bytes),
  }
}

function valueEvidence(name, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return {
    name,
    bytes: bytes.length,
    sha256: sha256(bytes),
  }
}

function parseModule(source, filename) {
  try {
    return parse(source, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      locations: false,
      ranges: true,
      sourceFile: path.basename(filename),
      sourceType: 'module',
    })
  } catch (error) {
    error.message = `${filename}: ${error.message}`
    throw error
  }
}

function analyzeModule(ast) {
  const manager = eslintScope.analyze(ast, {
    ecmaVersion: 2024,
    fallback: 'iteration',
    ignoreEval: true,
    impliedStrict: true,
    optimistic: true,
    sourceType: 'module',
  })
  const moduleScope = manager.globalScope.childScopes.find(
    scope => scope.type === 'module' && scope.block === ast,
  )
  if (!moduleScope) throw new Error('eslint-scope did not create a module scope')

  const bindingByIdentifier = new WeakMap()
  for (const scope of manager.scopes) {
    for (const variable of scope.variables) {
      for (const identifier of variable.identifiers) {
        bindingByIdentifier.set(identifier, variable)
      }
      for (const reference of variable.references) {
        bindingByIdentifier.set(reference.identifier, variable)
      }
    }
    for (const reference of scope.references) {
      if (reference.resolved) {
        bindingByIdentifier.set(reference.identifier, reference.resolved)
      }
    }
  }

  return { bindingByIdentifier, manager, moduleScope }
}

function isNode(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.type === 'string'
  )
}

function isSemanticIdentifier(parent, key) {
  if (!parent) return false
  if (
    (parent.type === 'MemberExpression' ||
      parent.type === 'OptionalMemberExpression') &&
    key === 'property' &&
    !parent.computed
  ) {
    return true
  }
  if (
    (parent.type === 'Property' ||
      parent.type === 'PropertyDefinition' ||
      parent.type === 'MethodDefinition') &&
    key === 'key' &&
    !parent.computed
  ) {
    return true
  }
  if (
    (parent.type === 'LabeledStatement' && key === 'label') ||
    ((parent.type === 'BreakStatement' ||
      parent.type === 'ContinueStatement') &&
      key === 'label')
  ) {
    return true
  }
  if (parent.type === 'MetaProperty') return true
  if (parent.type === 'ImportSpecifier' && key === 'imported') return true
  if (parent.type === 'ExportSpecifier' && key === 'exported') return true
  return false
}

function primitiveToken(value) {
  if (typeof value === 'bigint') return `bigint:${value.toString()}`
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'number:NaN'
    if (Object.is(value, -0)) return 'number:-0'
    if (value === Number.POSITIVE_INFINITY) return 'number:+Infinity'
    if (value === Number.NEGATIVE_INFINITY) return 'number:-Infinity'
  }
  return `${typeof value}:${JSON.stringify(value)}`
}

function astHash(root, bindingByIdentifier, mode = 'structural') {
  const hash = crypto.createHash('sha256')
  const localBindingIds = new Map()
  let nextBindingId = 0

  function update(text) {
    hash.update(text)
    hash.update('\0')
  }

  function walk(value, parent = null, key = null) {
    if (value === null || typeof value !== 'object') {
      update(primitiveToken(value))
      return
    }
    if (Array.isArray(value)) {
      update('[')
      for (const entry of value) walk(entry, parent, key)
      update(']')
      return
    }
    if (value instanceof RegExp) {
      update(`regexp:${value.source}/${value.flags}`)
      return
    }
    if (value.type === 'Identifier') {
      update('Identifier')
      if (
        mode === 'structural' &&
        !isSemanticIdentifier(parent, key)
      ) {
        const variable = bindingByIdentifier.get(value)
        if (variable) {
          if (!localBindingIds.has(variable)) {
            localBindingIds.set(variable, nextBindingId)
            nextBindingId += 1
          }
          update(`binding:${localBindingIds.get(variable)}`)
        } else {
          update(`unresolved:${value.name}`)
        }
      } else {
        update(`name:${value.name}`)
      }
      return
    }
    if (value.type === 'PrivateIdentifier') {
      update(`PrivateIdentifier:${value.name}`)
      return
    }

    update(`{${value.type ?? 'object'}`)
    const keys = Object.keys(value)
      .filter(field => !SKIPPED_AST_FIELDS.has(field))
      .filter(
        field =>
          !(
            mode === 'structural' &&
            value.type === 'Property' &&
            field === 'shorthand'
          ),
      )
      .sort()
    for (const field of keys) {
      update(`key:${field}`)
      walk(value[field], isNode(value) ? value : parent, field)
    }
    update('}')
  }

  walk(root)
  return hash.digest('hex')
}

function statementFingerprints(ast, analysis) {
  return ast.body.map((statement, index) => ({
    exactAstSha256: astHash(
      statement,
      analysis.bindingByIdentifier,
      'exact',
    ),
    index,
    statement,
    structuralSha256: astHash(
      statement,
      analysis.bindingByIdentifier,
      'structural',
    ),
    type: statement.type,
  }))
}

function uniqueStructuralPairs(baseline, target) {
  const baselineByHash = new Map()
  const targetByHash = new Map()

  function add(index, destination) {
    const current = destination.get(index.structuralSha256) ?? []
    current.push(index)
    destination.set(index.structuralSha256, current)
  }
  for (const statement of baseline) add(statement, baselineByHash)
  for (const statement of target) add(statement, targetByHash)

  const pairs = []
  let duplicateSharedFingerprints = 0
  for (const [fingerprint, baselineStatements] of baselineByHash) {
    const targetStatements = targetByHash.get(fingerprint)
    if (!targetStatements) continue
    if (baselineStatements.length === 1 && targetStatements.length === 1) {
      pairs.push({
        baseline: baselineStatements[0],
        fingerprint,
        target: targetStatements[0],
      })
    } else {
      duplicateSharedFingerprints += 1
    }
  }
  pairs.sort((left, right) => left.baseline.index - right.baseline.index)

  return {
    duplicateSharedFingerprints,
    pairs,
    uniqueBaselineFingerprints: [...baselineByHash.values()].filter(
      entries => entries.length === 1,
    ).length,
    uniqueTargetFingerprints: [...targetByHash.values()].filter(
      entries => entries.length === 1,
    ).length,
  }
}

function comparableKeys(node) {
  return Object.keys(node)
    .filter(field => !SKIPPED_AST_FIELDS.has(field))
    .filter(
      field =>
        !(node.type === 'Property' && field === 'shorthand'),
    )
    .sort()
}

function collectRenameCandidates(pairs, baselineAnalysis, targetAnalysis) {
  const candidates = new Map()

  function note(targetVariable, baselineVariable, pair) {
    if (
      targetVariable.scope !== targetAnalysis.moduleScope ||
      baselineVariable.scope !== baselineAnalysis.moduleScope
    ) {
      return
    }
    let byBaseline = candidates.get(targetVariable)
    if (!byBaseline) {
      byBaseline = new Map()
      candidates.set(targetVariable, byBaseline)
    }
    let evidence = byBaseline.get(baselineVariable)
    if (!evidence) {
      evidence = { occurrences: 0, statementPairs: new Set() }
      byBaseline.set(baselineVariable, evidence)
    }
    evidence.occurrences += 1
    evidence.statementPairs.add(
      `${pair.baseline.index}:${pair.target.index}`,
    )
  }

  function walkPair(left, right, leftParent, rightParent, key, pair) {
    if (left === null || right === null) return
    if (typeof left !== 'object' || typeof right !== 'object') return
    if (Array.isArray(left) || Array.isArray(right)) {
      if (!Array.isArray(left) || !Array.isArray(right)) return
      for (let index = 0; index < left.length; index += 1) {
        walkPair(
          left[index],
          right[index],
          leftParent,
          rightParent,
          key,
          pair,
        )
      }
      return
    }
    if (left.type !== right.type) return
    if (left.type === 'Identifier') {
      if (
        !isSemanticIdentifier(leftParent, key) &&
        !isSemanticIdentifier(rightParent, key)
      ) {
        const baselineVariable =
          baselineAnalysis.bindingByIdentifier.get(left)
        const targetVariable =
          targetAnalysis.bindingByIdentifier.get(right)
        if (baselineVariable && targetVariable) {
          note(targetVariable, baselineVariable, pair)
        }
      }
      return
    }

    const leftKeys = comparableKeys(left)
    const rightKeys = comparableKeys(right)
    if (
      leftKeys.length !== rightKeys.length ||
      leftKeys.some((field, index) => field !== rightKeys[index])
    ) {
      return
    }
    for (const field of leftKeys) {
      walkPair(left[field], right[field], left, right, field, pair)
    }
  }

  for (const pair of pairs) {
    walkPair(
      pair.baseline.statement,
      pair.target.statement,
      null,
      null,
      null,
      pair,
    )
  }
  return candidates
}

function nestedCaptureReason(variable, desiredName, moduleScope) {
  for (const reference of variable.references) {
    let scope = reference.from
    while (scope && scope !== moduleScope) {
      const occupant = scope.set.get(desiredName)
      if (occupant && occupant !== variable) {
        return {
          reason: 'nested-binding-capture',
          scopeType: scope.type,
        }
      }
      scope = scope.upper
    }
  }
  return null
}

function deriveSafeRenames(
  candidates,
  baselineAnalysis,
  targetAnalysis,
) {
  const rejected = []
  const provisional = new Map()
  const reverseCandidates = new Map()

  for (const [targetVariable, byBaseline] of candidates) {
    if (byBaseline.size !== 1) {
      rejected.push({
        candidates: [...byBaseline].map(([variable, evidence]) => ({
          baselineName: variable.name,
          occurrences: evidence.occurrences,
          statementPairs: evidence.statementPairs.size,
        })),
        reason: 'inconsistent-counterparts',
        targetName: targetVariable.name,
      })
      continue
    }
    const [[baselineVariable, evidence]] = byBaseline
    const reverse = reverseCandidates.get(baselineVariable) ?? []
    reverse.push(targetVariable)
    reverseCandidates.set(baselineVariable, reverse)
    provisional.set(targetVariable, {
      baselineVariable,
      evidence,
      targetVariable,
    })
  }

  for (const [baselineVariable, targetVariables] of reverseCandidates) {
    if (targetVariables.length <= 1) continue
    for (const targetVariable of targetVariables) {
      provisional.delete(targetVariable)
      const evidence = candidates.get(targetVariable).get(baselineVariable)
      rejected.push({
        baselineName: baselineVariable.name,
        occurrences: evidence.occurrences,
        reason: 'non-bijective-counterpart',
        statementPairs: evidence.statementPairs.size,
        targetName: targetVariable.name,
      })
    }
  }

  const unresolvedNames = new Set(
    targetAnalysis.manager.globalScope.through.map(
      reference => reference.identifier.name,
    ),
  )
  for (const [targetVariable, item] of [...provisional]) {
    const desiredName = item.baselineVariable.name
    if (targetVariable.defs.some(definition => definition.type === 'ClassName')) {
      // A ClassDeclaration identifier represents both a module binding and a
      // distinct class-local binding. Renaming only the module variable would
      // leave self-references inside the class attached to the old name.
      provisional.delete(targetVariable)
      rejected.push({
        baselineName: desiredName,
        reason: 'class-name-has-dual-binding',
        targetName: targetVariable.name,
      })
      continue
    }
    const capture = nestedCaptureReason(
      targetVariable,
      desiredName,
      targetAnalysis.moduleScope,
    )
    if (capture) {
      provisional.delete(targetVariable)
      rejected.push({
        baselineName: desiredName,
        reason: capture.reason,
        scopeType: capture.scopeType,
        targetName: targetVariable.name,
      })
      continue
    }
    const currentOccupant = targetAnalysis.moduleScope.set.get(desiredName)
    if (!currentOccupant && unresolvedNames.has(desiredName)) {
      provisional.delete(targetVariable)
      rejected.push({
        baselineName: desiredName,
        reason: 'would-capture-unresolved-reference',
        targetName: targetVariable.name,
      })
    }
  }

  // A destination occupied by a target binding is safe only when that binding
  // also has an accepted mapping which moves it elsewhere. Pruning is repeated
  // because rejecting one move can make another destination unsafe.
  let changed = true
  while (changed) {
    changed = false
    for (const [targetVariable, item] of [...provisional]) {
      const desiredName = item.baselineVariable.name
      const occupant = targetAnalysis.moduleScope.set.get(desiredName)
      if (!occupant || occupant === targetVariable) continue
      const occupantMove = provisional.get(occupant)
      if (
        !occupantMove ||
        occupantMove.baselineVariable.name === desiredName
      ) {
        provisional.delete(targetVariable)
        rejected.push({
          baselineName: desiredName,
          occupant: occupant.name,
          reason: 'occupied-destination',
          targetName: targetVariable.name,
        })
        changed = true
      }
    }
  }

  const accepted = [...provisional.values()]
    .filter(item => item.targetVariable.name !== item.baselineVariable.name)
    .sort((left, right) =>
      left.targetVariable.name.localeCompare(right.targetVariable.name),
    )
  const alreadyEqual = [...provisional.values()].filter(
    item => item.targetVariable.name === item.baselineVariable.name,
  ).length

  return {
    accepted,
    alreadyEqual,
    rejected: rejected.sort((left, right) =>
      left.targetName.localeCompare(right.targetName),
    ),
  }
}

function variableIdentifiers(variable) {
  const result = new Set(variable.identifiers)
  for (const reference of variable.references) {
    result.add(reference.identifier)
  }
  return result
}

function createRenameEdits(ast, source, accepted) {
  const renameByIdentifier = new WeakMap()
  for (const item of accepted) {
    for (const identifier of variableIdentifiers(item.targetVariable)) {
      renameByIdentifier.set(identifier, item.baselineVariable.name)
    }
  }

  const edits = new Map()
  const counts = {
    exportSpecifierExpansions: 0,
    identifierReplacements: 0,
    importSpecifierExpansions: 0,
    shorthandExpansions: 0,
  }

  function addEdit(node, replacement, kind) {
    const id = `${node.start}:${node.end}`
    const current = edits.get(id)
    if (current && current.replacement !== replacement) {
      throw new Error(
        `Conflicting replacements for ${id}: ` +
          `${current.replacement} versus ${replacement}`,
      )
    }
    if (current) return
    edits.set(id, {
      end: node.end,
      kind,
      original: source.slice(node.start, node.end),
      replacement,
      start: node.start,
    })
    counts[kind] += 1
  }

  function shorthandProperty(ancestors, node) {
    for (let index = ancestors.length - 1; index >= 0; index -= 1) {
      const ancestor = ancestors[index].node
      if (
        ancestor.type === 'Property' &&
        ancestor.shorthand &&
        ancestor.key?.start === node.start &&
        ancestor.key?.end === node.end
      ) {
        return ancestor
      }
    }
    return null
  }

  function walk(value, parent = null, key = null, ancestors = []) {
    if (value === null || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const entry of value) walk(entry, parent, key, ancestors)
      return
    }

    if (value.type === 'Identifier') {
      const desiredName = renameByIdentifier.get(value)
      if (!desiredName || isSemanticIdentifier(parent, key)) return

      if (
        parent?.type === 'ImportSpecifier' &&
        key === 'local' &&
        parent.imported.start === value.start &&
        parent.imported.end === value.end
      ) {
        addEdit(
          value,
          `${source.slice(parent.imported.start, parent.imported.end)} as ` +
            desiredName,
          'importSpecifierExpansions',
        )
        return
      }
      if (
        parent?.type === 'ExportSpecifier' &&
        key === 'local' &&
        parent.exported.start === value.start &&
        parent.exported.end === value.end
      ) {
        addEdit(
          value,
          `${desiredName} as ` +
            source.slice(parent.exported.start, parent.exported.end),
          'exportSpecifierExpansions',
        )
        return
      }
      const property = shorthandProperty(ancestors, value)
      if (property) {
        addEdit(
          value,
          `${source.slice(property.key.start, property.key.end)}:${desiredName}`,
          'shorthandExpansions',
        )
        return
      }
      addEdit(value, desiredName, 'identifierReplacements')
      return
    }

    const nextAncestors = isNode(value)
      ? [...ancestors, { key, node: value }]
      : ancestors
    for (const field of Object.keys(value)) {
      if (SKIPPED_AST_FIELDS.has(field)) continue
      walk(value[field], isNode(value) ? value : parent, field, nextAncestors)
    }
  }

  walk(ast)
  return {
    counts,
    edits: [...edits.values()].sort((left, right) => left.start - right.start),
  }
}

function applyEdits(source, edits) {
  const parts = []
  let offset = 0
  for (const edit of edits) {
    if (edit.start < offset) {
      throw new Error(`Overlapping rename edit at ${edit.start}`)
    }
    if (source.slice(edit.start, edit.end) !== edit.original) {
      throw new Error(`Rename edit no longer matches at ${edit.start}`)
    }
    parts.push(source.slice(offset, edit.start), edit.replacement)
    offset = edit.end
  }
  parts.push(source.slice(offset))
  return parts.join('')
}

function normalizeGap(gap) {
  const content = gap.trim()
  return content ? `${content}\n` : ''
}

function normalizeTopLevelStatements(source, ast) {
  if (ast.body.length === 0) return source.trimEnd() + '\n'
  const parts = []
  let offset = 0
  for (const statement of ast.body) {
    parts.push(normalizeGap(source.slice(offset, statement.start)))
    parts.push(source.slice(statement.start, statement.end).trim())
    parts.push('\n')
    offset = statement.end
  }
  parts.push(normalizeGap(source.slice(offset)))
  return parts.join('')
}

function statementRows(source, ast, analysis) {
  return ast.body.map(statement => {
    const code = source.slice(statement.start, statement.end)
    return {
      bytes: Buffer.byteLength(code),
      codeSha256: sha256(code),
      exactAstSha256: astHash(
        statement,
        analysis.bindingByIdentifier,
        'exact',
      ),
      structuralSha256: astHash(
        statement,
        analysis.bindingByIdentifier,
        'structural',
      ),
      type: statement.type,
    }
  })
}

function rowsToTsv(rows) {
  return (
    rows
      .map(
        row =>
          [
            row.type,
            row.structuralSha256,
          ].join('\t'),
      )
      .join('\n') + '\n'
  )
}

function runGitDiff(outputPath, baselineName, targetName, unified) {
  const result = spawnSync(
    'git',
    [
      'diff',
      '--no-index',
      '--no-ext-diff',
      '--no-renames',
      `--unified=${unified}`,
      '--src-prefix=a/',
      '--dst-prefix=b/',
      '--',
      baselineName,
      targetName,
    ],
    {
      cwd: outputPath,
      encoding: 'utf8',
      maxBuffer: 512 * 1024 * 1024,
    },
  )
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(result.stderr || 'git diff failed')
  }
  return result.stdout
}

function ensureFreshOutput(outputPath) {
  if (fs.existsSync(outputPath)) {
    const status = fs.lstatSync(outputPath)
    if (!status.isDirectory() || status.isSymbolicLink()) {
      throw new Error(`Output is not a real directory: ${outputPath}`)
    }
    const entries = fs.readdirSync(outputPath)
    if (entries.length > 0) {
      throw new Error(
        `Refusing non-empty output directory ${outputPath}: ${entries[0]}`,
      )
    }
  } else {
    fs.mkdirSync(outputPath, { recursive: true })
  }
}

function verifyExpectedHash(evidence, expected, label) {
  if (expected && evidence.sha256 !== expected) {
    throw new Error(
      `${label} SHA-256 mismatch: expected ${expected}, got ${evidence.sha256}`,
    )
  }
}

/**
 * Generate a binding-aware, deterministic comparison view for two minified
 * ECMAScript module bundles.
 *
 * The target input remains the oracle. target.normalized.js is a comparison
 * representation: accepted Program-scope bindings are alpha-renamed to their
 * structurally matched baseline names, and top-level whitespace is normalized.
 */
export function generateReadableBundleDiff(options) {
  const progress = options.progress ?? (() => {})
  const baselinePath = path.resolve(options.baselinePath)
  const targetPath = path.resolve(options.targetPath)
  const outputPath = path.resolve(options.outputPath)
  ensureFreshOutput(outputPath)

  const baselineEvidence = fileEvidence(baselinePath)
  const targetEvidence = fileEvidence(targetPath)
  verifyExpectedHash(
    baselineEvidence,
    options.expectedBaselineSha256,
    'Baseline',
  )
  verifyExpectedHash(
    targetEvidence,
    options.expectedTargetSha256,
    'Target',
  )

  progress('Parsing and resolving both input bundles')
  const baselineSource = fs.readFileSync(baselinePath, 'utf8')
  const targetSource = fs.readFileSync(targetPath, 'utf8')
  const baselineAst = parseModule(baselineSource, baselinePath)
  const targetAst = parseModule(targetSource, targetPath)
  const baselineAnalysis = analyzeModule(baselineAst)
  const targetAnalysis = analyzeModule(targetAst)
  const baselineFingerprints = statementFingerprints(
    baselineAst,
    baselineAnalysis,
  )
  const targetFingerprints = statementFingerprints(targetAst, targetAnalysis)
  progress('Matching unique alpha-structural top-level statements')
  const matching = uniqueStructuralPairs(
    baselineFingerprints,
    targetFingerprints,
  )
  const candidates = collectRenameCandidates(
    matching.pairs,
    baselineAnalysis,
    targetAnalysis,
  )
  const renames = deriveSafeRenames(
    candidates,
    baselineAnalysis,
    targetAnalysis,
  )
  const renameEdits = createRenameEdits(
    targetAst,
    targetSource,
    renames.accepted,
  )
  const rewrittenTarget = applyEdits(targetSource, renameEdits.edits)
  progress(
    `Reparsing ${renameEdits.edits.length} capture-checked target rewrites`,
  )
  const rewrittenTargetAst = parseModule(
    rewrittenTarget,
    'target.alpha-renamed.js',
  )
  const rewrittenTargetAnalysis = analyzeModule(rewrittenTargetAst)

  const targetSemanticBefore = astHash(
    targetAst,
    targetAnalysis.bindingByIdentifier,
    'structural',
  )
  const targetSemanticAfter = astHash(
    rewrittenTargetAst,
    rewrittenTargetAnalysis.bindingByIdentifier,
    'structural',
  )
  if (targetSemanticBefore !== targetSemanticAfter) {
    const rewrittenFingerprints = statementFingerprints(
      rewrittenTargetAst,
      rewrittenTargetAnalysis,
    )
    const mismatches = []
    const count = Math.max(
      targetFingerprints.length,
      rewrittenFingerprints.length,
    )
    for (let index = 0; index < count; index += 1) {
      if (
        targetFingerprints[index]?.structuralSha256 !==
        rewrittenFingerprints[index]?.structuralSha256
      ) {
        mismatches.push({
          index,
          originalType: targetFingerprints[index]?.type,
          rewrittenType: rewrittenFingerprints[index]?.type,
        })
      }
    }
    throw new Error(
      'Binding-topology hash changed after alpha normalization; ' +
        `${mismatches.length} top-level statements differ ` +
        `(first: ${JSON.stringify(mismatches.slice(0, 12))})`,
    )
  }

  const baselineNormalized = normalizeTopLevelStatements(
    baselineSource,
    baselineAst,
  )
  const targetNormalized = normalizeTopLevelStatements(
    rewrittenTarget,
    rewrittenTargetAst,
  )
  const normalizedTargetAst = parseModule(
    targetNormalized,
    'target.normalized.js',
  )
  const normalizedTargetAnalysis = analyzeModule(normalizedTargetAst)
  const normalizedTargetSemantic = astHash(
    normalizedTargetAst,
    normalizedTargetAnalysis.bindingByIdentifier,
    'structural',
  )
  if (targetSemanticAfter !== normalizedTargetSemantic) {
    throw new Error(
      'Top-level normalization changed the target binding-topology hash',
    )
  }

  const baselineNormalizedAst = parseModule(
    baselineNormalized,
    'baseline.normalized.js',
  )
  const baselineNormalizedAnalysis = analyzeModule(baselineNormalizedAst)
  const baselineRows = statementRows(
    baselineNormalized,
    baselineNormalizedAst,
    baselineNormalizedAnalysis,
  )
  const targetRows = statementRows(
    targetNormalized,
    normalizedTargetAst,
    normalizedTargetAnalysis,
  )
  const baselineTsv = rowsToTsv(baselineRows)
  const targetTsv = rowsToTsv(targetRows)

  fs.writeFileSync(
    path.join(outputPath, 'baseline.normalized.js'),
    baselineNormalized,
  )
  fs.writeFileSync(
    path.join(outputPath, 'target.normalized.js'),
    targetNormalized,
  )
  fs.writeFileSync(
    path.join(outputPath, 'statements.baseline.tsv'),
    baselineTsv,
  )
  fs.writeFileSync(
    path.join(outputPath, 'statements.target.tsv'),
    targetTsv,
  )

  progress('Writing normalized code and exact/structural diff views')
  const normalizedDiff = runGitDiff(
    outputPath,
    'baseline.normalized.js',
    'target.normalized.js',
    2,
  )
  const statementDiff = runGitDiff(
    outputPath,
    'statements.baseline.tsv',
    'statements.target.tsv',
    1,
  )
  const normalizedDiffGzip = gzipSync(normalizedDiff, {
    level: 9,
    mtime: 0,
  })
  fs.writeFileSync(
    path.join(outputPath, 'normalized.diff.gz'),
    normalizedDiffGzip,
  )
  fs.writeFileSync(
    path.join(outputPath, 'statements.diff'),
    statementDiff,
  )

  const renameLines = [
    [
      'target_name',
      'baseline_name',
      'evidence_occurrences',
      'evidence_statement_pairs',
    ].join('\t'),
    ...renames.accepted.map(item =>
      [
        item.targetVariable.name,
        item.baselineVariable.name,
        item.evidence.occurrences,
        item.evidence.statementPairs.size,
      ].join('\t'),
    ),
  ]
  const renameTsv = `${renameLines.join('\n')}\n`
  fs.writeFileSync(path.join(outputPath, 'renames.tsv'), renameTsv)

  const reproducibleIntermediates = {
    'baseline.normalized.js': valueEvidence(
      'baseline.normalized.js',
      baselineNormalized,
    ),
    'target.normalized.js': valueEvidence(
      'target.normalized.js',
      targetNormalized,
    ),
    'normalized.diff': valueEvidence('normalized.diff', normalizedDiff),
    'statements.baseline.tsv': valueEvidence(
      'statements.baseline.tsv',
      baselineTsv,
    ),
    'statements.target.tsv': valueEvidence(
      'statements.target.tsv',
      targetTsv,
    ),
  }

  if (options.retainIntermediates) {
    fs.writeFileSync(
      path.join(outputPath, 'normalized.diff'),
      normalizedDiff,
    )
  } else {
    for (const name of [
      'baseline.normalized.js',
      'target.normalized.js',
      'statements.baseline.tsv',
      'statements.target.tsv',
    ]) {
      fs.rmSync(path.join(outputPath, name))
    }
  }

  const outputFiles = {}
  for (const name of [
    'normalized.diff.gz',
    'statements.diff',
    'renames.tsv',
  ]) {
    outputFiles[name] = fileEvidence(path.join(outputPath, name))
  }
  if (options.retainIntermediates) {
    for (const name of Object.keys(reproducibleIntermediates)) {
      outputFiles[name] = fileEvidence(path.join(outputPath, name))
    }
  }

  const rejectedByReason = Object.fromEntries(
    Object.entries(
      renames.rejected.reduce((counts, rejection) => {
        counts[rejection.reason] = (counts[rejection.reason] ?? 0) + 1
        return counts
      }, {}),
    ).sort(([left], [right]) => left.localeCompare(right)),
  )
  const metadata = {
    schemaVersion: 1,
    normalizationVersion: NORMALIZATION_VERSION,
    structuralFingerprintVersion: STRUCTURAL_FINGERPRINT_VERSION,
    inputs: {
      baseline: baselineEvidence,
      target: targetEvidence,
    },
    parser: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    statements: {
      baseline: baselineAst.body.length,
      target: targetAst.body.length,
    },
    matching: {
      duplicateSharedFingerprints: matching.duplicateSharedFingerprints,
      structurallyUniquePairs: matching.pairs.length,
      uniqueBaselineFingerprints: matching.uniqueBaselineFingerprints,
      uniqueTargetFingerprints: matching.uniqueTargetFingerprints,
    },
    renames: {
      accepted: renames.accepted.length,
      alreadyEqual: renames.alreadyEqual,
      candidateTargetBindings: candidates.size,
      edits: renameEdits.edits.length,
      editKinds: renameEdits.counts,
      rejected: renames.rejected.length,
      rejectedByReason,
    },
    verification: {
      normalizedTargetParses: true,
      targetComparisonInvariantHashBeforeAlphaRename: targetSemanticBefore,
      targetComparisonInvariantHashAfterAlphaRename: targetSemanticAfter,
      targetComparisonInvariantHashAfterStatementNormalization:
        normalizedTargetSemantic,
      comparisonInvariantHashesEqual:
        targetSemanticBefore === targetSemanticAfter &&
        targetSemanticAfter === normalizedTargetSemantic,
      note:
        'The normalized target is a non-executable comparison ' +
        'representation, not the published bytes. The invariant ' +
        'alpha-normalizes resolved bindings while preserving unresolved ' +
        'names, property keys, labels, import names, and export names. It ' +
        'does not prove runtime equivalence where JavaScript exposes binding ' +
        'spelling through eval, Function.name, or source text.',
      statementDescriptorFields: ['type', 'structuralSha256'],
    },
    compression: {
      'normalized.diff.gz': {
        algorithm: 'gzip',
        level: 9,
        mtime: 0,
        uncompressedArtifact: 'normalized.diff',
      },
    },
    outputs: outputFiles,
    reproducibleIntermediates,
  }
  const metadataText = `${JSON.stringify(metadata, null, 2)}\n`
  fs.writeFileSync(path.join(outputPath, 'metadata.json'), metadataText)
  return { ...metadata, rejectedRenames: renames.rejected }
}

export const internalsForTest = {
  analyzeModule,
  applyEdits,
  astHash,
  createRenameEdits,
  deriveSafeRenames,
  normalizeTopLevelStatements,
  parseModule,
  uniqueStructuralPairs,
}
